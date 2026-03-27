# Voice 도메인 PRD

## 개요
디스코드 서버의 음성 채널 활동을 실시간으로 추적하고, 세션 데이터를 Redis에 임시 저장한 뒤 PostgreSQL에 일별 집계로 영구 저장하는 핵심 도메인이다.

## 관련 모듈
- `apps/api/src/channel/voice/` — 음성 채널 핵심 로직
- `apps/api/src/channel/` — 채널 엔티티 및 서비스
- `apps/api/src/member/` — 멤버 엔티티 및 서비스
- `apps/api/src/event/` — 디스코드 이벤트 핸들러
- `apps/api/src/redis/` — Redis 클라이언트

## 아키텍처

```
Discord Voice Event
    │
    ▼
[DiscordVoiceGateway]        ← Discord.js voiceStateUpdate 이벤트 수신
    │
    ▼
[VoiceStateDispatcher]       ← 이벤트 타입 분류 (join/leave/move/mic-toggle)
    │
    ├──► [VoiceJoinHandler]      → Redis 세션 시작 + DB 히스토리 생성
    ├──► [VoiceLeaveHandler]     → Redis 세션 종료 + DB 히스토리 업데이트
    ├──► [VoiceMoveHandler]      → 이전 채널 leave + 새 채널 join 처리
    └──► [MicToggleHandler]      → Redis 마이크 상태 시간 누적
    │
    ▼
[VoiceChannelService]        ← 비즈니스 로직 (세션 관리, 시간 계산)
    │
    ├──► [VoiceRedisRepository]  → Redis 세션/캐시 CRUD
    ├──► [VoiceChannelHistoryService] → PostgreSQL 히스토리 CRUD
    └──► [VoiceDailyFlushService]    → 일별 통계 집계 및 flush
```

## 기능 상세

### F-VOICE-001: 음성 채널 입장 감지
- **트리거**: 유저가 음성 채널에 입장
- **동작**:
  1. Member가 DB에 없으면 생성 (discordMemberId, nickName)
  2. Channel이 DB에 없으면 생성 (discordChannelId, channelName). Channel 생성/갱신 시 F-VOICE-021에 따라 Discord API에서 parentId(카테고리 ID)와 카테고리명을 조회하여 `categoryId`, `categoryName` 저장
  3. VoiceChannelHistory 레코드 생성 (joinAt = now)
  4. Redis에 세션 시작 시간 저장

### F-VOICE-002: 음성 채널 퇴장 감지
- **트리거**: 유저가 음성 채널에서 퇴장
- **동작**:
  1. VoiceChannelHistory 레코드 업데이트 (leftAt = now)
  2. Redis 세션 종료, 체류 시간 계산
  3. VoiceDailyEntity에 시간 누적 (GLOBAL + 개별 채널). 개별 채널 레코드 upsert 시 Channel 엔티티의 `categoryId`, `categoryName`을 함께 저장 (F-VOICE-021)

### F-VOICE-003: 음성 채널 이동 감지
- **트리거**: 유저가 음성 채널 A → B로 이동
- **동작**:
  1. 채널 A에 대해 퇴장 처리 (F-VOICE-002)
  2. 채널 B에 대해 입장 처리 (F-VOICE-001)

### F-VOICE-004: 마이크 상태 토글 감지
- **트리거**: 유저가 마이크를 켜거나 끔
- **동작**:
  1. Redis에 마이크 ON/OFF 시간 누적
  2. VoiceDailyEntity의 micOnSec/micOffSec 갱신

### F-VOICE-005: 일별 통계 집계 (Daily Flush)
- **트리거**: 스케줄 또는 세션 종료 시
- **동작**:
  1. Redis 세션 데이터를 VoiceDailyEntity에 flush
  2. GLOBAL 레코드: 유저의 전체 마이크/혼자시간 집계
  3. 개별 채널 레코드: 유저-채널별 체류 시간 집계
- **복합키**: guildId + userId + date + channelId

### F-VOICE-006: 혼자 있는 시간 추적
- **트리거**: 채널에 유저가 1명만 남았을 때
- **동작**: aloneSec 시간 누적 (GLOBAL 레코드에 기록)

## 데이터 모델

### Member
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| discordMemberId | string, unique | 디스코드 유저 ID |
| nickName | string | 디스코드 닉네임 |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

### Channel
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| discordChannelId | string, unique | 디스코드 채널 ID |
| channelName | string | 채널명 |
| categoryId | string, nullable | 디스코드 카테고리 채널 ID (parentId). 카테고리 없는 채널은 null |
| categoryName | string, nullable | 카테고리명 캐시. 카테고리 없는 채널은 null |
| status | enum (ACTIVE/DELETED) | 채널 상태 |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

### VoiceChannelHistory
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| channel | FK → Channel | 채널 (eager) |
| member | FK → Member | 멤버 (eager) |
| joinAt | timestamp | 입장 시각 |
| leftAt | timestamp, nullable | 퇴장 시각 |
| duration | computed getter | 체류 시간 (초) |

### VoiceDailyEntity (voice_daily)
| 컬럼 | 타입 | 설명 |
|-------|------|------|
| guildId | PK | 서버 ID |
| userId | PK | 유저 ID |
| date | PK | 날짜 (YYYYMMDD) |
| channelId | PK | 채널 ID 또는 'GLOBAL' |
| channelName | string | 채널명 캐시 |
| userName | string | 유저명 캐시 |
| categoryId | string, nullable | 카테고리 채널 ID 캐시 (비정규화). GLOBAL 레코드는 null |
| categoryName | string, nullable | 카테고리명 캐시 (비정규화). GLOBAL 레코드 또는 카테고리 없는 채널은 null |
| channelDurationSec | int | 채널 체류 시간 (초) |
| micOnSec | int | 마이크 ON 시간 (초) |
| micOffSec | int | 마이크 OFF 시간 (초) |
| aloneSec | int | 혼자 있던 시간 (초) |

**비정규화 정책**:
- `categoryId`, `categoryName`은 `channelName`, `userName`과 동일한 패턴으로 비정규화 저장한다.
- GLOBAL 레코드(`channelId = 'GLOBAL'`)에는 카테고리 정보를 저장하지 않는다 (null).
- 기존 데이터의 `categoryId`, `categoryName`은 null로 유지한다. 새로 생성되는 레코드부터만 채운다.

**인덱스**:
- `(guildId, date)` — 날짜별 조회
- `(guildId, channelId, date)` — 채널별 조회
- `(guildId, userId, date)` — 유저별 조회

### F-VOICE-021: 채널 카테고리(parentId) 정보 수집 및 저장

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

- **트리거**: 유저가 음성 채널에 입장 (F-VOICE-001)하여 Channel 엔티티를 생성하거나 갱신할 때
- **동작**:
  1. Discord API(`guild.channels.fetch(channelId)`)로 채널의 `parentId`(카테고리 채널 ID)를 조회
  2. `parentId`가 존재하면 해당 카테고리 채널 정보(`guild.channels.cache.get(parentId)` 또는 추가 fetch)로 카테고리명 조회
  3. Channel 엔티티의 `categoryId`, `categoryName`을 저장 또는 갱신
     - `parentId` 없음: `categoryId = null`, `categoryName = null`
     - `parentId` 있음: `categoryId = parentId`, `categoryName = 카테고리 채널명`
  4. VoiceDailyEntity 개별 채널 레코드 upsert 시 Channel 엔티티에서 읽은 `categoryId`, `categoryName`을 함께 저장
     - GLOBAL 레코드(`channelId = 'GLOBAL'`)는 카테고리 필드를 null로 설정
- **기존 데이터 처리**:
  - 이 기능 적용 이전에 생성된 Channel 레코드와 VoiceDailyEntity 레코드의 `categoryId`, `categoryName`은 null로 유지한다.
  - 채널 재입장 시점에 Channel 엔티티가 갱신되면 이후 생성되는 VoiceDailyEntity 레코드부터 카테고리 정보가 채워진다.
- **제약**:
  - Discord API 호출 실패 시 `categoryId`, `categoryName`을 null로 저장하고 입장 처리는 계속 진행한다 (non-blocking).
  - 카테고리 없는 최상위 채널은 `categoryId = null`, `categoryName = null`이 정상 상태다.

### F-VOICE-023: 봇 재시작 시 음성 세션 복구

- **배경**: 봇이 재시작(배포/크래시)되면 음성 채널에 있던 유저들의 `VoiceChannelHistory.leftAt`이 기록되지 않고 `null`로 남는다. 또한 Discord 재연결 시 이미 음성 채널에 있는 유저들에 대해 `voiceStateUpdate` 이벤트가 발생하지 않아 새 세션이 생성되지 않는다.
- **동작**:

  **1단계 — 정상 종료 시 (`onApplicationShutdown`)**:
  1. 기존 Redis 세션 flush (현행 유지)
  2. `VoiceChannelHistory`에서 `leftAt IS NULL`인 레코드를 일괄 업데이트 (`leftAt = NOW()`)

  **2단계 — 부팅 시 (`onApplicationBootstrap`)**:
  1. `VoiceChannelHistory`에서 `leftAt IS NULL`인 레코드를 일괄 업데이트 (`leftAt = NOW()`) — 크래시 시 1단계가 실행되지 않으므로 여기서 보완
  2. 기존 Redis orphan 세션 flush (현행 유지)

  **3단계 — Discord ready 후 음성 상태 동기화**:
  1. Discord 클라이언트 `ready` 이벤트 수신 후 실행
  2. 모든 길드의 `voiceStates` 캐시를 순회
  3. 음성 채널에 있는 각 유저에 대해 제외 채널 필터링 적용
  4. 제외 대상이 아닌 유저에 대해 `VoiceChannelService.onUserJoined()` 호출 → 새 `VoiceChannelHistory` 레코드 + Redis 세션 생성
  5. 동기화 완료 로그 출력

- **제약**:
  - 크래시 시 `leftAt`은 실제 퇴장 시각이 아닌 봇 재시작 시각으로 기록된다 (정확한 퇴장 시각을 알 수 없으므로 허용)
  - 3단계는 Discord 클라이언트가 `ready` 상태가 된 후에만 실행한다
  - 3단계에서 제외 채널 확인 시 `VoiceExcludedChannelService.isExcludedChannel()`을 사용한다
- **관련 파일**:
  - `apps/api/src/channel/voice/application/voice-recovery.service.ts` — 1~3단계 구현
  - `apps/api/src/channel/voice/application/voice-channel-history.service.ts` — 고아 레코드 일괄 종료 메서드
  - `apps/api/src/channel/voice/application/voice-channel.service.ts` — `onUserJoined()` 재사용

### F-VOICE-024: logLeave 쿼리 안전성 개선

- **배경**: `VoiceChannelHistoryService.logLeave()`의 쿼리에 `leftAt IS NULL` 조건이 없어, 이미 종료된 레코드를 다시 업데이트하거나 고아 레코드가 존재할 때 엉뚱한 레코드가 갱신될 수 있다.
- **동작**: `logLeave()` 쿼리에 `.andWhere('log.leftAt IS NULL')` 조건을 추가하여, 아직 종료되지 않은 레코드만 대상으로 한다.

---

## 음성 채널 추가 데이터 수집 (Voice Extended Data Collection)

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

### 배경 및 목적

현재 `voiceStateUpdate` 이벤트에서 `channelId`, `selfMute`(마이크), `alone`(혼자 여부)만 추적 중이다. 같은 이벤트와 기존 스케줄러 인프라를 활용하여 화면 공유·카메라·스피커 음소거·게임 활동 데이터를 추가 수집함으로써, 음성 활동 독려와 멤버 관리 품질을 높인다.

수집 대상은 두 Phase로 나뉜다:
- **Phase 1**: `voiceStateUpdate` 이벤트에서 인텐트 변경 없이 즉시 수집 가능한 VoiceState 필드 추가
- **Phase 2**: `GuildPresences` 인텐트를 추가하여 음성 참여 중인 유저의 게임 활동 수집

---

### Phase 1 — VoiceState 추가 수집

#### F-VOICE-025: 화면 공유 시간 추적 (streaming)

- **배경**: `VoiceState.streaming`은 `voiceStateUpdate` 이벤트에서 이미 수신 가능한 필드이나 현재 미활용 중이다. 화면 공유 활동량 측정 및 콘텐츠 기여자 식별에 활용한다.
- **트리거**: `voiceStateUpdate` 이벤트에서 `streaming` 상태 변경 감지
- **동작**:
  1. `VoiceStateDispatcher`에서 `streaming` 상태 변경을 감지하여 `StreamingToggleHandler`에 위임
  2. Redis 세션에 스트리밍 ON/OFF 전환 시각을 기록
  3. 상태 전환 시 직전 구간의 누적 시간을 계산하여 Redis에 임시 저장
  4. 퇴장(`F-VOICE-002`) 또는 Daily Flush(`F-VOICE-005`) 시점에 `streamingSec`을 `voice_daily` 테이블에 반영
- **수집 필드**: `VoiceState.streaming` (boolean)
- **저장 컬럼**: `voice_daily.streamingSec` (int, 기본값 0) — 화면 공유 시간(초)
- **기존 패턴 참조**: `MicToggleHandler` / `micOnSec` / `micOffSec` 처리 방식과 동일

#### F-VOICE-026: 카메라 ON/OFF 시간 추적 (selfVideo)

- **배경**: `VoiceState.selfVideo`는 유저가 카메라를 켜고 있는 상태를 나타낸다. 캠 참여율과 적극적 참여도 지표로 활용한다.
- **트리거**: `voiceStateUpdate` 이벤트에서 `selfVideo` 상태 변경 감지
- **동작**:
  1. `VoiceStateDispatcher`에서 `selfVideo` 상태 변경을 감지하여 `VideoToggleHandler`에 위임
  2. Redis 세션에 카메라 ON/OFF 전환 시각을 기록
  3. 상태 전환 시 직전 구간의 누적 시간을 계산하여 Redis에 임시 저장
  4. 퇴장(`F-VOICE-002`) 또는 Daily Flush(`F-VOICE-005`) 시점에 `videoOnSec`을 `voice_daily` 테이블에 반영
- **수집 필드**: `VoiceState.selfVideo` (boolean)
- **저장 컬럼**: `voice_daily.videoOnSec` (int, 기본값 0) — 카메라 ON 시간(초)
- **기존 패턴 참조**: `MicToggleHandler` / `micOnSec` / `micOffSec` 처리 방식과 동일

#### F-VOICE-027: 스피커 음소거 시간 추적 (selfDeaf)

- **배경**: `VoiceState.selfDeaf`는 유저 스스로 스피커를 음소거한 상태다. deaf 상태로 장시간 체류하는 경우를 잠수 탐지 지표로 활용한다.
- **트리거**: `voiceStateUpdate` 이벤트에서 `selfDeaf` 상태 변경 감지
- **동작**:
  1. `VoiceStateDispatcher`에서 `selfDeaf` 상태 변경을 감지하여 `DeafToggleHandler`에 위임
  2. Redis 세션에 deaf ON/OFF 전환 시각을 기록
  3. 상태 전환 시 직전 구간의 누적 시간을 계산하여 Redis에 임시 저장
  4. 퇴장(`F-VOICE-002`) 또는 Daily Flush(`F-VOICE-005`) 시점에 `deafSec`을 `voice_daily` 테이블에 반영
- **수집 필드**: `VoiceState.selfDeaf` (boolean)
- **저장 컬럼**: `voice_daily.deafSec` (int, 기본값 0) — 스피커 음소거 시간(초)
- **기존 패턴 참조**: `MicToggleHandler` / `micOnSec` / `micOffSec` 처리 방식과 동일

#### Phase 1 데이터 모델 변경

**VoiceDailyEntity (voice_daily) — 추가 컬럼**:

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `streamingSec` | int | 0 | 화면 공유 시간(초). GLOBAL 및 개별 채널 레코드 모두에 기록 |
| `videoOnSec` | int | 0 | 카메라 ON 시간(초). GLOBAL 및 개별 채널 레코드 모두에 기록 |
| `deafSec` | int | 0 | 스피커 음소거 시간(초). GLOBAL 및 개별 채널 레코드 모두에 기록 |

**기존 데이터 처리**:
- 이 기능 적용 이전에 생성된 `voice_daily` 레코드의 세 컬럼은 기본값 0으로 유지한다.
- 마이그레이션: `ALTER TABLE voice_daily ADD COLUMN "streamingSec" int NOT NULL DEFAULT 0, ADD COLUMN "videoOnSec" int NOT NULL DEFAULT 0, ADD COLUMN "deafSec" int NOT NULL DEFAULT 0;`

**아키텍처 변경 (Phase 1)**:

```
[VoiceStateDispatcher]
    │
    ├──► [StreamingToggleHandler]  → Redis streaming 상태 시간 누적 (F-VOICE-025)
    ├──► [VideoToggleHandler]      → Redis selfVideo 상태 시간 누적 (F-VOICE-026)
    └──► [DeafToggleHandler]       → Redis selfDeaf 상태 시간 누적 (F-VOICE-027)
```

**인프라 요구사항 (Phase 1)**:
- Discord Developer Portal 변경: 불필요 (기존 인텐트로 수집 가능)
- `discord.config.ts` 변경: 불필요

---

### Phase 2 — 게임 활동 수집

#### F-VOICE-028: 음성 입장 시 게임 상태 수집

- **배경**: 음성 채널에 입장한 시점에 유저가 플레이 중인 게임을 파악하여 게임 세션의 시작을 기록한다. `presenceUpdate` 이벤트를 리스닝하지 않고, 기존 음성 이벤트 시점에 `member.presence`를 읽는 pull 방식을 사용한다.
- **트리거**: `voiceStateUpdate` → JOIN 이벤트 (`F-VOICE-001`)
- **동작**:
  1. `VoiceJoinHandler`에서 `member.presence.activities`를 조회
  2. `ActivityType.Playing` 타입의 활동에서 `gameName`과 `applicationId`를 추출
  3. 게임 활동이 감지되면 Redis에 게임 세션 시작 상태 저장 (`guildId:userId:gameSession`)
     - `gameName`, `applicationId`(nullable), `startedAt`
  4. 게임 활동이 없으면 게임 세션 없음 상태로 유지
- **수집 필드**: `GuildMember.presence.activities` — `ActivityType.Playing` 필터
- **제약**:
  - `GuildPresences` 인텐트가 활성화되어 있어야 `member.presence`가 채워진다
  - 인텐트 없이 접근하면 `member.presence`가 null이므로 null-safe 처리 필수

#### F-VOICE-029: CoPresenceScheduler 틱에서 게임 상태 갱신

- **배경**: 음성 입장 후 게임을 시작하거나 전환하는 경우를 60초 틱 단위로 감지한다.
- **트리거**: `CoPresenceScheduler` 60초 틱 (기존 `F-COPRESENCE-001` 순회 시점)
- **동작**:
  1. 음성 채널 순회 중 각 멤버의 `member.presence.activities` 조회
  2. 현재 Redis에 저장된 게임 세션 상태와 비교:
     - **새 게임 시작**: Redis에 게임 세션 없음 → 현재 게임 감지 → 새 세션 생성
     - **게임 전환**: 현재 게임이 Redis 세션과 다름 → 이전 세션 종료 처리 후 새 세션 시작
     - **게임 종료**: 현재 게임 없음 + Redis에 세션 있음 → 세션 종료 처리
     - **게임 계속**: 현재 게임 = Redis 세션 → 상태 유지 (별도 조작 없음)
  3. 세션 종료 처리 시 `F-VOICE-031` 플로우 수행

#### F-VOICE-030: 음성 퇴장 시 게임 세션 종료

- **트리거**: `voiceStateUpdate` → LEAVE 이벤트 (`F-VOICE-002`)
- **동작**:
  1. `VoiceLeaveHandler`에서 해당 유저의 Redis 게임 세션 조회
  2. 진행 중인 게임 세션이 있으면 세션 종료 처리 (`F-VOICE-031`)
  3. Redis 게임 세션 키 삭제

#### F-VOICE-031: 게임 세션 종료 처리 및 저장

- **트리거**: `F-VOICE-029` 또는 `F-VOICE-030` 에서 세션 종료 감지 시
- **동작**:
  1. Redis에서 게임 세션 정보(`gameName`, `applicationId`, `startedAt`) 조회
  2. 플레이 시간 계산: `durationMin = Math.floor((now - startedAt) / 60000)`
  3. `durationMin >= 1`인 경우에만 DB 저장 (1분 미만 무시)
  4. `voice_game_activity` 테이블에 세션 단위 레코드 INSERT
  5. `voice_game_daily` 테이블에 일별 집계 upsert (`totalMinutes` 누적, `sessionCount` 증가)
  6. Redis 게임 세션 키 삭제

#### Phase 2 데이터 모델

**voice_game_activity (게임 세션 단위 이력)**:

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | int | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | varchar | NOT NULL | 디스코드 서버 ID |
| `userId` | varchar | NOT NULL | 유저 디스코드 ID |
| `channelId` | varchar | NOT NULL | 게임 활동 중이던 음성 채널 ID |
| `gameName` | varchar | NOT NULL | 게임명 (Discord Activity 명칭) |
| `applicationId` | varchar | nullable | Discord Application ID (게임 고유 식별자). 커스텀 상태 등은 null |
| `startedAt` | timestamp | NOT NULL | 게임 세션 시작 시각 |
| `endedAt` | timestamp | NOT NULL | 게임 세션 종료 시각 |
| `durationMin` | int | NOT NULL | 플레이 시간(분) |
| `createdAt` | timestamp | NOT NULL, DEFAULT now() | 레코드 생성일 |

**인덱스**:
- `(guildId, userId, startedAt)` — 유저별 기간 조회
- `(guildId, gameName, startedAt)` — 게임별 기간 조회
- `(guildId, startedAt)` — 서버 전체 기간 조회

**voice_game_daily (게임 일별 집계)**:

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `guildId` | varchar | PK | 디스코드 서버 ID |
| `userId` | varchar | PK | 유저 디스코드 ID |
| `gameName` | varchar | PK | 게임명 |
| `date` | varchar(8) | PK | 날짜 (YYYYMMDD) |
| `totalMinutes` | int | NOT NULL, DEFAULT 0 | 해당 날짜 총 플레이 시간(분) |
| `sessionCount` | int | NOT NULL, DEFAULT 0 | 해당 날짜 세션 수 |

**인덱스**:
- PK: `(guildId, userId, gameName, date)`
- `(guildId, userId, date)` — 유저의 날짜별 게임 활동 조회
- `(guildId, gameName, date)` — 서버 내 게임별 날짜 집계

**Phase 2 Redis 키 구조**:

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `voice:game:session:{guildId}:{userId}` | 24시간 | String (JSON) | 유저별 현재 게임 세션 (`{ gameName, applicationId, startedAt, channelId }`) |

**아키텍처 변경 (Phase 2)**:

```
[VoiceJoinHandler]
    └──► [VoiceGameService.onUserJoined()]   → presence 읽기 → Redis 게임 세션 시작 (F-VOICE-028)

[CoPresenceScheduler] (60초 틱)
    └──► [VoiceGameService.onTick()]         → presence 읽기 → 게임 세션 갱신/종료 (F-VOICE-029)

[VoiceLeaveHandler]
    └──► [VoiceGameService.onUserLeft()]     → Redis 게임 세션 종료 (F-VOICE-030)

[VoiceGameService.endSession()]             → DB 저장 (F-VOICE-031)
    ├──► voice_game_activity INSERT
    └──► voice_game_daily UPSERT
```

**인프라 요구사항 (Phase 2)**:
- Discord Developer Portal: SERVER MEMBERS INTENT는 이미 활성화 필요. 추가로 **PRESENCE INTENT** 토글 ON 필요
- `discord.config.ts`: `GatewayIntentBits.GuildPresences` 인텐트 추가

**제약 및 주의사항**:
- `presenceUpdate` 이벤트를 리스닝하지 않으므로, 음성 채널 체류 중 게임을 시작한 경우 최대 60초(틱 주기)까지 감지 지연이 발생한다.
- `GuildPresences` 인텐트는 대규모 서버(750명 이상)에서 Privileged Intent 심사 대상이다.
- `member.presence`가 null이거나 `activities`가 빈 배열인 경우를 게임 없음으로 처리한다.
- 게임 세션 최소 저장 단위는 1분이다 (1분 미만 세션은 `voice_game_activity` 미기록).

#### Phase 2 데이터 보존 정책

| 테이블 | 보존 기간 | 삭제 방식 |
|--------|-----------|-----------|
| `voice_game_activity` | **90일** | 기존 데이터 보존 스케줄러에 삭제 대상 추가 (매일 04:00 KST) |
| `voice_game_daily` | **영구** | 삭제 안 함 |

## Redis 키 구조
- 세션 키: 유저별 현재 음성 세션 정보 (입장 시간, 채널 ID 등)
- 캐시 키: 유저명/채널명 캐시 (7일 TTL)
- 임시 채널 저장소: 채널 정보 임시 보관
- 자동방 대기방 키: 대기방 채널 ID → guildId/userId 매핑

### F-VOICE-017: 음성 일별 통계 조회 API

- **트리거**: FE 대시보드(`/dashboard/guild/{guildId}/voice`)의 초기 로드 및 기간 변경
- **엔드포인트**: `GET /api/guilds/:guildId/voice/daily`
- **인증**: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
- **쿼리 파라미터**:
  | 파라미터 | 타입 | 필수 | 설명 |
  |----------|------|------|------|
  | `from` | string (YYYYMMDD) | 필수 | 조회 시작 날짜 (예: `20260301`) |
  | `to` | string (YYYYMMDD) | 필수 | 조회 종료 날짜 (예: `20260309`) |
- **동작**:
  1. `guildId` + `date BETWEEN from AND to` 조건으로 `VoiceDailyEntity` 레코드 전체 조회
  2. 결과를 `VoiceDailyRecord[]` 형태로 직렬화하여 반환
- **응답 형식**: `VoiceDailyRecord[]`
  ```json
  [
    {
      "guildId": "123456789012345678",
      "userId": "111111111111111111",
      "userName": "Onyu",
      "date": "20260301",
      "channelId": "222222222222222222",
      "channelName": "일반",
      "categoryId": "333333333333333333",
      "categoryName": "게임",
      "channelDurationSec": 3600,
      "micOnSec": 1800,
      "micOffSec": 1800,
      "aloneSec": 600
    }
  ]
  ```
  - `categoryId`, `categoryName`: 카테고리가 없는 채널이거나 GLOBAL 레코드인 경우 `null`
- **호출 경로**:
  - FE(`apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`) → Next.js API 프록시(`/api/guilds/{guildId}/voice/daily?from=&to=`) → 백엔드(`http://api:3000/api/guilds/{guildId}/voice/daily?from=&to=`)
- **관련 FE 파일**:
  - `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` — 대시보드 페이지
  - `apps/web/app/lib/voice-dashboard-api.ts` — API 클라이언트 함수
  - 차트 컴포넌트 5종 (동일 디렉토리)

### F-VOICE-018: 유저별 음성 일별 통계 조회 API

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

- **트리거**: FE 음성 활동 대시보드 유저 상세 뷰(`/dashboard/guild/{guildId}/voice?userId={userId}`)의 초기 로드 및 기간 변경
- **엔드포인트**: `GET /api/guilds/:guildId/voice/daily`
- **인증**: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
- **쿼리 파라미터**:
  | 파라미터 | 타입 | 필수 | 설명 |
  |----------|------|------|------|
  | `from` | string (YYYYMMDD) | 필수 | 조회 시작 날짜 (예: `20260301`) |
  | `to` | string (YYYYMMDD) | 필수 | 조회 종료 날짜 (예: `20260309`) |
  | `userId` | string | 선택 | 특정 유저 필터. 미제공 시 전체 유저 조회 (기존 F-VOICE-017 동작) |
- **동작**:
  1. `guildId` + `date BETWEEN from AND to` 조건으로 `VoiceDailyEntity` 조회
  2. `userId`가 제공된 경우 `userId` 조건을 추가하여 해당 유저 데이터만 필터링
  3. 결과를 `VoiceDailyRecord[]` 형태로 직렬화하여 반환
- **응답 형식**: `VoiceDailyRecord[]` (F-VOICE-017과 동일 스키마)
  ```json
  [
    {
      "guildId": "123456789012345678",
      "userId": "111111111111111111",
      "userName": "Onyu",
      "date": "20260301",
      "channelId": "GLOBAL",
      "channelName": "GLOBAL",
      "categoryId": null,
      "categoryName": null,
      "channelDurationSec": 7200,
      "micOnSec": 3600,
      "micOffSec": 3600,
      "aloneSec": 1800
    }
  ]
  ```
  - `categoryId`, `categoryName`: GLOBAL 레코드이거나 카테고리가 없는 채널인 경우 `null`
- **호출 경로**:
  - FE(`apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`) → Next.js API 프록시(`/api/guilds/{guildId}/voice/daily?from=&to=&userId=`) → 백엔드(`http://api:3000/api/guilds/{guildId}/voice/daily?from=&to=&userId=`)
- **관련 FE 파일**:
  - `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` — 음성 활동 대시보드 (유저 상세 뷰 포함)
  - `apps/web/app/lib/user-detail-api.ts` — API 클라이언트 함수

### F-VOICE-019: 멤버 검색 API

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

- **트리거**: FE 음성 활동 대시보드의 유저 랭킹 검색창 또는 유저 상세 뷰 검색 드롭다운에서 닉네임/디스코드 ID 입력
- **엔드포인트**: `GET /api/guilds/:guildId/members/search`
- **인증**: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
- **쿼리 파라미터**:
  | 파라미터 | 타입 | 필수 | 설명 |
  |----------|------|------|------|
  | `q` | string | 필수 | 검색 키워드 (닉네임 또는 디스코드 ID). 최소 1자 |
- **동작**:
  1. `voice_daily` 테이블의 `userName` 컬럼에 LIKE 매칭 (`%q%`)으로 검색
  2. `guildId` 조건을 함께 적용하여 해당 서버에 존재하는 유저만 반환
  3. 중복 `userId`를 제거하고 `userName` 오름차순 정렬
  4. 최대 20개 결과 반환
- **응답 형식**: `MemberSearchResult[]`
  ```json
  [
    {
      "userId": "111111111111111111",
      "userName": "Onyu"
    }
  ]
  ```
- **예외**:
  - `q` 파라미터 누락 시 400 응답
- **호출 경로**:
  - FE(`apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`) → Next.js API 프록시(`/api/guilds/{guildId}/members/search?q=`) → 백엔드(`http://api:3000/api/guilds/{guildId}/members/search?q=`)
- **관련 FE 파일**:
  - `apps/web/app/lib/user-detail-api.ts` — API 클라이언트 함수

### F-VOICE-021: 멤버 프로필 조회 API

- **트리거**: FE 음성 활동 대시보드의 유저 상세 뷰 또는 랭킹 테이블에서 유저 프로필(닉네임, 아바타) 표시 시
- **엔드포인트**:
  - 단건: `GET /api/guilds/:guildId/members/:userId/profile`
  - 일괄: `GET /api/guilds/:guildId/members/profiles?ids=id1,id2,...` (최대 50명)
- **인증**: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
- **동작**:
  1. `Member` 테이블에서 `discordMemberId`로 조회
  2. `nickname`(서버 닉네임)과 `avatarUrl`(Discord CDN URL) 반환
  3. `avatarUrl`은 음성 채널 입퇴장 시 `VoiceStateDto.fromVoiceState()`에서 `displayAvatarURL()` 호출로 자동 갱신됨
- **단건 응답 형식**:
  ```json
  {
    "userId": "111111111111111111",
    "userName": "Onyu",
    "avatarUrl": "https://cdn.discordapp.com/avatars/111.../abc.webp?size=128"
  }
  ```
- **일괄 응답 형식**: `Record<userId, { userName, avatarUrl }>`
  ```json
  {
    "111111111111111111": { "userName": "Onyu", "avatarUrl": "https://..." },
    "222222222222222222": { "userName": "User2", "avatarUrl": null }
  }
  ```
- **예외**:
  - 단건: 유저 미존재 시 404 응답
  - 일괄: `ids` 파라미터 누락 시 400 응답
- **관련 FE 파일**:
  - `apps/web/app/lib/user-detail-api.ts` — `fetchMemberProfile`, `fetchMemberProfiles`

### F-VOICE-020: 유저 입퇴장 이력 조회 API

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

- **트리거**: FE 음성 활동 대시보드 유저 상세 뷰의 최근 입퇴장 이력 테이블 초기 로드 및 페이지 변경
- **엔드포인트**: `GET /api/guilds/:guildId/voice/history/:userId`
- **인증**: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
- **경로 파라미터**:
  | 파라미터 | 타입 | 설명 |
  |----------|------|------|
  | `guildId` | string | 디스코드 서버 ID |
  | `userId` | string | 조회 대상 유저의 discordMemberId |
- **쿼리 파라미터**:
  | 파라미터 | 타입 | 필수 | 설명 |
  |----------|------|------|------|
  | `from` | string (YYYYMMDD) | 선택 | 조회 시작 날짜. 미제공 시 제한 없음 |
  | `to` | string (YYYYMMDD) | 선택 | 조회 종료 날짜. 미제공 시 제한 없음 |
  | `page` | number | 선택 | 페이지 번호 (1부터 시작). 기본값: 1 |
  | `limit` | number | 선택 | 페이지당 항목 수. 기본값: 20, 최대: 100 |
- **동작**:
  1. `VoiceChannelHistory` 테이블에서 `member.discordMemberId = userId` AND `channel.guildId = guildId` 조건으로 조회
  2. `from` / `to` 제공 시 `joinAt BETWEEN` 조건 추가
  3. `joinAt` 내림차순 정렬 (최신 이력 우선)
  4. 페이지네이션 적용 후 결과와 전체 건수 반환
- **응답 형식**: `VoiceHistoryPage`
  ```json
  {
    "total": 150,
    "page": 1,
    "limit": 20,
    "items": [
      {
        "id": 1234,
        "channelId": "222222222222222222",
        "channelName": "일반",
        "categoryId": "333333333333333333",
        "categoryName": "게임",
        "joinAt": "2026-03-09T10:00:00.000Z",
        "leftAt": "2026-03-09T11:30:00.000Z",
        "durationSec": 5400
      }
    ]
  }
  ```
  - `leftAt`이 null이면 (아직 퇴장 전) `null`로 반환
  - `durationSec`은 `leftAt`이 null이면 null
  - `categoryId`, `categoryName`: Channel 엔티티의 값을 그대로 반환. 카테고리가 없는 채널이거나 기존 데이터인 경우 `null`
- **호출 경로**:
  - FE(`apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`) → Next.js API 프록시(`/api/guilds/{guildId}/voice/history/{userId}?from=&to=&page=&limit=`) → 백엔드(`http://api:3000/api/guilds/{guildId}/voice/history/{userId}?from=&to=&page=&limit=`)
- **관련 FE 파일**:
  - `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` — 음성 활동 대시보드 (유저 상세 뷰 포함)
  - `apps/web/app/lib/user-detail-api.ts` — API 클라이언트 함수

### F-VOICE-022: `/me` 커맨드 — 개인 음성 프로필 카드

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

- **커맨드명**: `/me`
- **설명**: 내 프로필과 음성 활동을 확인합니다
- **권한**: 모든 멤버 사용 가능 (관리자 제한 없음)
- **응답**: 공개 (모든 멤버에게 표시)
- **파라미터**: 없음 (15일 고정)

- **동작**:
  1. `MeProfileService`(신규)로 해당 유저의 최근 15일 `voice_daily` 레코드만 직접 쿼리 (서버 전체 조회 불필요)
  2. GLOBAL 레코드에서 마이크 통계·혼자 있던 시간 집계
  3. `voice_daily.date`에서 요일을 앱 레벨에서 추출하여 피크 요일 계산
  4. 서버 내 전체 유저 순위를 산출하여 해당 유저의 순위 결정
  5. 결과를 임베드 프로필 카드로 조립하여 공개 응답

- **활동 없을 때**: `"최근 15일간 음성 채널 활동 기록이 없습니다."` 텍스트 공개 응답

- **임베드 프로필 카드 구성**:

  | 항목 | 값 |
  |------|-----|
  | Title | `👤 {닉네임}의 프로필` |
  | Thumbnail | 유저 아바타 URL |
  | Description | `🏆 #{순위} / {전체 유저}명 · 📅 최근 15일` |
  | Color | Green |
  | Footer | 제외 채널이 있을 때: `🔇 제외: 🔊{채널명}, 📁{카테고리명} | onyu` / 없을 때: `onyu` |
  | Timestamp | 현재 시각 |

  **Field 1 — 📊 음성 활동 요약**:
  - 총 음성 시간
  - 활동일 수
  - 일평균 접속 시간

  **Field 2 — 🎤 마이크 통계**:
  - 마이크 ON 시간
  - 마이크 OFF 시간
  - 마이크 사용률 (%)
  - 혼자 있던 시간

  **Field 3 — 📅 최근 15일 활동**:
  - 텍스트 기반 바 차트
  - 형식: `MM/DD █████░░░░ Xh Ym`
  - 활동 없는 날: `—` 표시

  **Field 4 — 🕐 피크 요일**:
  - 가장 활발한 요일 (`voice_daily.date`에서 요일 추출, 앱 레벨 계산)
  - 주 평균 접속 시간

- **Footer 제외 채널 표시 규칙**:
  - 해당 길드에 `voice_excluded_channel` 레코드가 존재할 때만 표시. 없으면 기존 `onyu` Footer 유지
  - `type = CHANNEL`: `🔊{채널명}` 형식으로 표시
  - `type = CATEGORY`: `📁{카테고리명}` 형식으로 표시 (하위 채널 펼치지 않음)
  - 채널명/카테고리명은 `voice_excluded_channel` 테이블의 `discordChannelId`로 Discord API에서 채널명을 resolve하여 표시
  - 총 5개 초과 시: 처음 5개만 표시 후 `... 외 {N}개` 추가 (예: `🔇 제외: 🔊음악방, 🔊AFK, 📁비공개, 🔊테스트1, 🔊테스트2 ... 외 3개 | onyu`)
  - 목적: 사용자가 자신의 음성 시간이 예상보다 적게 나오는 이유를 즉시 파악할 수 있도록 안내

- **데이터 소스**: `voice_daily` 테이블 + `voice_excluded_channel` 테이블 사용
  - `voice_daily`: 인덱스 `(guildId, userId, date)` 활용
  - GLOBAL 레코드 (`channelId = 'GLOBAL'`): `micOnSec`, `micOffSec`, `aloneSec` 읽기
  - 개별 채널 레코드: `channelDurationSec`, `channelName`, `categoryName` 읽기
  - `voice_excluded_channel`: 해당 길드의 제외 채널 목록 조회 (Footer 표시용)

- **대체 관계**:
  - `/voice-time` 커맨드를 대체하며 삭제
  - `/voice-rank` 커맨드를 대체하며 삭제
  - `/my-voice-stats`, `/voice-leaderboard` 커맨드는 변경 없이 유지

- **관련 파일** (구현 예정):
  - `apps/api/src/channel/voice/application/me.command.ts` — 커맨드 핸들러
  - `apps/api/src/channel/voice/application/me-profile.service.ts` — 유저 단일 쿼리 서비스
  - `apps/api/src/channel/voice/application/voice-time.command.ts` — 삭제 대상
  - `apps/api/src/channel/voice/application/voice-rank.command.ts` — 삭제 대상

---

## 음성 시간 제외 채널 (Voice Time Excluded Channels)

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

### 개요

길드별로 음성 시간 추적에서 제외할 채널 또는 카테고리를 설정한다. 제외 채널에 입장·퇴장·이동이 발생해도 VoiceChannelHistory 미생성, VoiceDailyEntity 미누적, Redis 세션 미생성이 보장된다.

### F-VOICE-013: 제외 채널 설정 조회

- **트리거**: 웹 대시보드 설정 페이지 초기 로드
- **엔드포인트**: `GET /api/guilds/{guildId}/voice/excluded-channels`
- **동작**:
  1. `VoiceExcludedChannel` 레코드를 guildId 기준으로 전체 조회
  2. `type` 및 `channelId` 목록 반환
- **응답 형식**:
  ```json
  [
    { "id": 1, "channelId": "111111111111111111", "type": "CHANNEL" },
    { "id": 2, "channelId": "222222222222222222", "type": "CATEGORY" }
  ]
  ```

### F-VOICE-014: 제외 채널 등록

- **트리거**: 웹 대시보드에서 채널/카테고리 선택 후 저장
- **엔드포인트**: `POST /api/guilds/{guildId}/voice/excluded-channels`
- **요청 바디**:
  ```json
  { "channelId": "111111111111111111", "type": "CHANNEL" }
  ```
  - `type`: `CHANNEL` (개별 음성 채널) 또는 `CATEGORY` (카테고리)
- **동작**:
  1. 동일 guildId + channelId 조합이 이미 존재하면 409 응답
  2. `VoiceExcludedChannel` 레코드 생성
  3. `voice:excluded:{guildId}` Redis 캐시 무효화 (삭제)
- **제약**:
  - 카테고리를 등록하면 해당 카테고리 하위의 모든 음성 채널이 제외 대상이 됨 (하위 채널을 개별 등록할 필요 없음)

### F-VOICE-015: 제외 채널 삭제

- **트리거**: 웹 대시보드에서 항목 삭제 버튼 클릭
- **엔드포인트**: `DELETE /api/guilds/{guildId}/voice/excluded-channels/{id}`
- **동작**:
  1. `VoiceExcludedChannel` 레코드 삭제 (id + guildId 일치 검증)
  2. `voice:excluded:{guildId}` Redis 캐시 무효화 (삭제)
- **예외**:
  - 레코드가 존재하지 않으면 404 응답

### F-VOICE-016: 음성 이벤트 처리 시 제외 채널 필터링

- **트리거**: Discord `voiceStateUpdate` 이벤트 수신 (F-VOICE-001, F-VOICE-002, F-VOICE-003 실행 직전)
- **동작**:
  1. `voice:excluded:{guildId}` Redis 캐시 조회
     - 캐시 미스: `VoiceExcludedChannel` 레코드를 DB에서 조회 후 Redis에 저장 (TTL 1시간)
  2. 대상 채널이 제외 채널 목록에 포함되는지 확인:
     - `type = CHANNEL`: channelId 직접 일치 여부 확인
     - `type = CATEGORY`: Discord API로 해당 채널의 parentId(카테고리 ID) 조회 후 일치 여부 확인
  3. 제외 대상이면 해당 이벤트 처리 중단 (VoiceChannelHistory 미생성, VoiceDailyEntity 미누적, Redis 세션 미생성)
  4. 제외 대상이 아니면 기존 플로우(F-VOICE-001 ~ F-VOICE-003) 정상 수행
- **이동(move) 이벤트 처리 세부 규칙**:
  - 이전 채널(A)이 제외 채널이고 새 채널(B)이 일반 채널: B에 대한 입장(F-VOICE-001)만 수행, A 퇴장 처리 생략
  - 이전 채널(A)이 일반 채널이고 새 채널(B)이 제외 채널: A에 대한 퇴장(F-VOICE-002)만 수행, B 입장 처리 생략
  - 이전 채널(A)과 새 채널(B) 모두 제외 채널: 이동 이벤트 전체 무시
- **자동방 트리거 채널과의 관계**:
  - 트리거 채널은 F-VOICE-007에서 이미 세션 추적을 제외하므로 별도 처리 불필요
  - 트리거 채널을 제외 채널로 추가 등록하더라도 동작 상 중복될 뿐 오류 없음

## 데이터 보존 정책

### 자동 삭제 스케줄러
- **실행 시각**: 매일 04:00 (KST)
- **삭제 기준**: `DATA_RETENTION_DAYS` 환경변수 초과 데이터 (기본 90일)
- **삭제 대상**:
  - `VoiceDailyEntity`
  - `VoiceChannelHistory`
  - `VoiceCoPresencePairDaily`
- **환경변수**: `DATA_RETENTION_DAYS` (최소 7, 기본 90)

### 사용자 데이터 삭제 API (F-VOICE-GDPR-001)
- **엔드포인트**: `DELETE /api/users/me/data`
- **인증**: JWT 필수 (본인 데이터만 삭제)
- **삭제 대상**: 요청자의 모든 음성 활동 데이터 (전 길드)
- **응답**:
  ```json
  {
    "deletedCount": {
      "voiceDaily": 1234,
      "voiceHistory": 567,
      "coPresence": 89
    }
  }
  ```

## 음성 시간 제외 채널 데이터 모델

### VoiceExcludedChannel (voice_excluded_channel)

| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| guildId | string | 디스코드 서버 ID |
| channelId | string | 제외할 채널 또는 카테고리 ID |
| type | enum (CHANNEL/CATEGORY) | 제외 단위 (개별 채널 또는 카테고리) |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

**인덱스**:
- `(guildId, channelId)` unique — 서버+채널 단위 중복 방지
- `(guildId)` — 서버별 전체 목록 조회

## 음성 시간 제외 채널 Redis 키 구조

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `voice:excluded:{guildId}` | 1시간 | String (JSON) | 길드별 제외 채널 목록 캐시 (`VoiceExcludedChannel[]` JSON 직렬화) |

- 설정 등록(`POST`) 또는 삭제(`DELETE`) 시 해당 키를 명시적으로 삭제하여 캐시를 무효화한다.
- 캐시 미스 시 DB 조회 후 Redis에 1시간 TTL로 재저장한다.
- 캐시 히트 시 parentId 확인을 위한 Discord API 호출은 여전히 발생할 수 있다 (`type = CATEGORY` 항목이 존재하는 경우).

---

## 자동방 생성 (Auto Channel)

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

### 개요

트리거 채널 입장(대기방 역할)을 통해 음성 채널을 자동 생성하는 기능이다. 생성 방식에 따라 두 가지 모드를 지원한다.

- **선택 생성 모드 (`select`)**: 트리거 채널 입장 → 안내 메시지 버튼 클릭 → 확정방 신규 생성 및 이동하는 2단계 방식. 버튼 및 하위 선택지로 채널 유형을 선택할 수 있다.
- **즉시 생성 모드 (`instant`)**: 트리거 채널 입장 즉시 설정된 템플릿으로 채널을 생성하고 이동하는 1단계 방식. 안내 메시지나 버튼 없이 동작한다.

확정방 생성 시점부터 기존 voice 세션 추적 시스템과 통합된다.

### 전체 흐름

**선택 생성 모드 (`select`)**

```
[웹 설정 저장]
    │  guideChannelId(텍스트 채널)에 Embed + 버튼 안내 메시지 전송/갱신
    ▼
[사용자가 트리거 채널(대기방) 입장]
    │  DB 조회로 트리거 채널 여부 확인 → 세션 추적 제외
    ▼
[안내 메시지에서 버튼 클릭]  ← 트리거 채널 또는 기존 확정방에 있는 사용자
    ├─ 하위 선택지 없음 → 즉시 확정방 신규 생성 → 유저 이동
    └─ 하위 선택지 있음 → Ephemeral 추가 버튼 표시 → 선택 후 확정방 신규 생성 → 유저 이동
    │
    ▼
[확정방 생성 완료 → Redis 확정방 키 저장 → 세션 추적 시작]
    │
    ▼
[모든 사용자 퇴장] → 확정방 즉시 삭제 (Redis 키 정리)
```

**즉시 생성 모드 (`instant`)**

```
[사용자가 트리거 채널 입장]
    │  DB 조회로 트리거 채널 여부 확인 → 세션 추적 제외
    ▼
[instantNameTemplate 기반 채널 즉시 생성 (instantCategoryId 카테고리에)]
    │
    ▼
[유저를 생성된 채널로 즉시 이동]
    │
    ▼
[Redis 확정방 키 저장 → 세션 추적 시작]
    │
    ▼
[모든 사용자 퇴장] → 확정방 즉시 삭제 (Redis 키 정리)
```

### F-VOICE-007: 트리거 채널 입장 감지

- **트리거**: 유저가 트리거 채널로 설정된 음성 채널에 입장
- **전제 조건**: AutoChannelConfig에 해당 채널이 triggerChannelId로 등록되어 있음
- **동작**:
  1. 트리거 채널 여부 확인 (DB 직접 조회 — `AutoChannelConfigRepository.findByTriggerChannel`)
  2. 트리거 채널 자체에 대한 음성 세션 추적은 시작하지 않음
  3. 설정의 `mode`에 따라 분기:
     - `select` (선택 생성): 유저는 트리거 채널(대기방)에 머물며 안내 메시지의 버튼 클릭을 기다림
     - `instant` (즉시 생성): F-VOICE-020 즉시 생성 모드 처리로 위임
- **예외**:
  - 트리거 채널 설정이 존재하지 않으면 일반 입장(F-VOICE-001)으로 처리
- **구현 참고**:
  - 트리거 채널 집합을 별도 Redis 키로 캐싱하지 않으며, 입장 시마다 DB에서 조회한다

### F-VOICE-008: 대기방 상태 관리

- **트리거**: F-VOICE-007 이후 유저가 트리거 채널에 체류 중인 상태
- **동작**:
  1. 트리거 채널 자체가 대기방 역할을 수행 (별도 채널 생성 없음)
  2. 대기방(트리거 채널) 정보는 `RedisTempChannelStore`를 통해 관리
     - `voice:temp:channels:{guildId}` (Set): 서버 내 임시 채널 ID 집합
     - `voice:temp:channel:{channelId}:members` (Set): 채널 내 멤버 ID 집합
  3. 대기방은 세션 추적 대상에서 제외 (VoiceChannelHistory 미생성)
  4. 유저 퇴장 시 멤버 제거, 채널이 비면 임시 채널 등록 해제
- **네이밍 템플릿 변수** (`waitingRoomTemplate`):
  - `{username}`: 유저의 서버 닉네임
  - `waitingRoomTemplate`은 nullable이며, 미설정 시 기본 임시 채널명 사용

### F-VOICE-009: 안내 메시지 & 버튼 전송/갱신

- **트리거**: 웹 대시보드에서 자동방 설정 저장 시
- **동작**:
  1. `guideChannelId`(별도 텍스트 채널)에 기존 안내 메시지가 있으면 수정(edit), 없으면 신규 전송
  2. 메시지 구성:
     - Discord Embed 형식: `embedTitle` (제목, 선택), `guideMessage` (설명 본문), `embedColor` (색상, 선택)
     - Discord Button Component 목록 (라벨 + 이모지)
  3. 안내 메시지 ID(`guideMessageId`)를 AutoChannelConfig에 저장
  4. 수정 실패(메시지 삭제 등) 시 신규 전송으로 폴백
- **버튼 속성**:
  - `label`: 버튼 표시 텍스트
  - `emoji`: 버튼 이모지 (선택)
  - `style`: Primary (파란색) 고정
  - `customId`: `auto_btn:{buttonId}` 형식
- **제약**:
  - Discord 버튼은 메시지당 최대 25개 (ActionRow 5개 × 버튼 5개)

### F-VOICE-010: 하위 선택지 Ephemeral 처리

- **트리거**: 하위 선택지가 설정된 버튼 클릭
- **동작**:
  1. 버튼 클릭한 유저의 현재 음성 채널이 유효한지 확인:
     - 유저의 현재 음성 채널 ID가 `button.config.triggerChannelId`(트리거 채널)이거나
     - 해당 설정(`button.configId`)에 속한 확정방(`auto_channel:confirmed:{channelId}`의 configId 일치)에 있으면 허용
  2. 두 조건 모두 해당하지 않으면 오류 응답 (ephemeral)
  3. 조건 충족 시 Ephemeral 메시지로 하위 선택지 버튼 목록 표시
  4. 하위 버튼 클릭 시 F-VOICE-011 (확정방 전환) 호출
- **하위 선택지 버튼 속성**:
  - `label`: 선택지 표시 텍스트
  - `emoji`: 선택지 이모지 (선택)
  - `channelNameTemplate`: 채널명 템플릿 문자열 (예: `{name} 경쟁`, `{name} 일반`)
    - `{name}` 포함 시: 버튼 단계에서 생성된 기본 채널명으로 치환
    - `{name}` 미포함 시: 기본 채널명 뒤에 공백과 함께 이어붙임
  - `customId`: `auto_sub:{subOptionId}` 형식
- **예시**: "스팀" 버튼 → Ephemeral로 [일반] [경쟁] 버튼 표시 → "경쟁" 선택

### F-VOICE-011: 확정방 전환

- **트리거**: 하위 선택지 없는 버튼 클릭, 또는 하위 선택지 선택 완료
- **전제 조건**: 버튼 클릭한 유저가 트리거 채널(대기방) 또는 해당 설정의 확정방에 입장해 있어야 함
- **동작**:
  1. 유저의 현재 음성 채널 위치 확인:
     - **트리거 채널에 있는 경우**: 일반 확정방 전환 처리 (기존 동작)
     - **해당 설정의 확정방에 있는 경우**: 새 확정방 생성 후 이동 (기존 확정방은 유지 — 빈 방 삭제 규칙 적용)
     - **두 조건 모두 아닌 경우**: 오류 응답 (ephemeral)
  2. 확정방 채널명 결정:
     - 버튼의 `channelNameTemplate` 적용 (없으면 `{username}의 {버튼 라벨}` 기본 형식)
     - `{username}` 변수를 유저 서버 닉네임으로 치환
     - 하위 선택지 있음: `subOption.channelNameTemplate`의 `{name}`을 기본 채널명으로 치환 (`{name}` 없으면 뒤에 이어붙임)
     - 채널명에 `{n}` 포함 시: 1부터 증가시키며 미사용 순번 탐색 (예: `오버워치 #1`, `오버워치 #2`)
     - `{n}` 미포함 + 중복 이름: 뒤에 숫자 순번 부여 (예: `Onyu의 오버워치 2`)
  3. 신규 확정방 채널을 `button.targetCategoryId` 카테고리에 생성
  4. 유저를 새 확정방으로 이동
  5. 새 확정방 메타데이터를 Redis에 저장 (`auto_channel:confirmed:{channelId}`, TTL 12시간)
  6. 새 확정방을 세션 추적 대상으로 등록 (F-VOICE-001과 동일한 세션 시작 처리)
  7. Discord 상호작용에 성공 응답 (defer → editReply)
- **채널 권한**: 생성자에게 특별 권한 부여 없음 (서버 기본 권한 적용)
- **버튼 클릭 주체**: 방 생성자 여부와 무관하게 모든 사용자가 버튼 클릭 가능

### F-VOICE-012: 자동방 채널 삭제

- **트리거**: 음성 채널에서 마지막 유저가 퇴장 (F-VOICE-002 연계)
- **적용 대상**: 대기방 및 확정방 (선택 생성/즉시 생성 모드 모두 동일 적용)
- **동작**:
  1. 퇴장 이후 채널 잔류 인원 확인
  2. 0명이면 해당 채널이 자동방(대기방 또는 확정방)인지 확인 (Redis)
  3. 자동방이면 Discord API로 채널 즉시 삭제
  4. Redis에서 관련 키 정리
  5. 확정방의 경우 세션 종료 처리 후 삭제 (F-VOICE-002)

### F-VOICE-020: 즉시 생성 모드 채널 생성

- **트리거**: F-VOICE-007에서 `mode = 'instant'` 설정의 트리거 채널에 유저 입장
- **전제 조건**: `AutoChannelConfig.mode = 'instant'`, `instantCategoryId` 및 `instantNameTemplate` 설정됨
- **동작**:
  1. `instantNameTemplate` 기반으로 채널명 결정:
     - `{username}` 변수를 유저 서버 닉네임으로 치환
     - 채널명에 `{n}` 포함 시: 1부터 증가시키며 미사용 순번 탐색 (예: `Onyu의 방 #1`, `Onyu의 방 #2`)
     - `{n}` 미포함 + 중복 이름: 뒤에 숫자 순번 부여 (예: `Onyu의 방 2`)
  2. `instantCategoryId` 카테고리에 즉시 음성 채널 생성
  3. 유저를 생성된 채널로 즉시 이동
  4. 확정방 메타데이터를 Redis에 저장 (`auto_channel:confirmed:{channelId}`, TTL 12시간):
     - `{ guildId, userId, configId }` — `buttonId`, `subOptionId`는 없음
  5. 생성된 채널을 세션 추적 대상으로 등록 (F-VOICE-001과 동일한 세션 시작 처리)
- **채널 삭제**: 모든 사용자 퇴장 시 F-VOICE-012와 동일하게 즉시 삭제
- **채널 권한**: 생성자에게 특별 권한 부여 없음 (서버 기본 권한 적용)
- **미사용 설정**: `instant` 모드에서는 안내 채널(`guideChannelId`), 안내 메시지(`guideMessage`), Embed 설정(`embedTitle`, `embedColor`, `guideMessageId`), 버튼 목록(`AutoChannelButton`)이 사용되지 않음

---

## 자동방 데이터 모델

### AutoChannelConfig (auto_channel_config)

| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| guildId | string | 디스코드 서버 ID |
| name | string | 설정 이름 (웹 탭 라벨용, 예: "게임방", "스터디방") |
| triggerChannelId | string | 트리거 음성 채널 ID (대기방 역할) |
| mode | enum(`'select'`, `'instant'`) | 채널 생성 모드. 기본값 `'select'` |
| guideChannelId | string, nullable | 안내 메시지를 전송할 텍스트 채널 ID (`select` 모드 전용) |
| waitingRoomTemplate | string, nullable | 대기방 네이밍 템플릿 (예: `⌛ {username}의 대기방`) |
| guideMessage | text, nullable | 안내 메시지 Embed 설명 본문 (`select` 모드 전용) |
| embedTitle | string, nullable | 안내 메시지 Embed 제목 (`select` 모드 전용) |
| embedColor | string, nullable | 안내 메시지 Embed 색상 (예: `#5865F2`) (`select` 모드 전용) |
| guideMessageId | string, nullable | 전송된 안내 메시지 Discord ID (`select` 모드 전용) |
| instantCategoryId | string, nullable | 즉시 생성 모드에서 채널이 생성될 카테고리 ID (`instant` 모드 전용) |
| instantNameTemplate | string, nullable | 즉시 생성 모드에서 사용할 채널명 템플릿 (예: `{username}의 방`). `{username}` 변수 지원. (`instant` 모드 전용) |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

**인덱스**:
- `(guildId, triggerChannelId)` unique — 서버+트리거 채널 단위 설정

**모드별 사용 컬럼 정리**:
- `select` 모드: `guideChannelId`, `guideMessage`, `embedTitle`, `embedColor`, `guideMessageId` 사용 / `instantCategoryId`, `instantNameTemplate` 미사용
- `instant` 모드: `instantCategoryId`, `instantNameTemplate` 사용 / `guideChannelId`, `guideMessage`, `embedTitle`, `embedColor`, `guideMessageId` 미사용

### AutoChannelButton (auto_channel_button)

| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| configId | FK → AutoChannelConfig | 소속 설정 |
| label | string | 버튼 표시 라벨 |
| emoji | string, nullable | 버튼 이모지 |
| targetCategoryId | string | 확정방을 생성할 카테고리 ID |
| channelNameTemplate | string, nullable | 확정방 채널명 템플릿 (예: `{username}의 오버워치`). 미설정 시 `{username}의 {label}` 기본 형식 사용 |
| sortOrder | int | 버튼 표시 순서 |

### AutoChannelSubOption (auto_channel_sub_option)

| 컬럼 | 타입 | 설명 |
|-------|------|------|
| id | PK, auto | 내부 ID |
| buttonId | FK → AutoChannelButton | 소속 버튼 |
| label | string | 하위 선택지 표시 라벨 |
| emoji | string, nullable | 하위 선택지 이모지 |
| channelNameTemplate | string | 채널명 합성 템플릿. `{name}` 포함 시 버튼 단계 기본 채널명으로 치환, 미포함 시 기본 채널명 뒤에 이어붙임 (예: `{name} 경쟁`, `경쟁`) |
| sortOrder | int | 선택지 표시 순서 |

### AutoChannelState (Redis)

확정방의 런타임 상태를 Redis에 저장한다. 대기방(트리거 채널)의 멤버 상태는 voice 도메인의 `RedisTempChannelStore`가 관리한다.

**확정방 메타데이터**:

| 키 패턴 | 값 | TTL | 설명 |
|---------|-----|-----|------|
| `auto_channel:confirmed:{channelId}` | `{ guildId, userId, configId, buttonId?, subOptionId? }` | 12시간 | 확정방 메타데이터. 선택 생성 모드와 즉시 생성 모드 모두 동일 키 구조 사용. `configId`는 F-VOICE-010/011 버튼 클릭 시 소속 설정 확인에 활용 |

- 즉시 생성 모드(F-VOICE-020)로 생성된 채널도 동일한 `auto_channel:confirmed:{channelId}` 키에 메타데이터를 저장한다.
- 이를 통해 F-VOICE-010/011에서 "해당 설정의 확정방에 있는지" 확인 시 `configId` 필드로 판별할 수 있다.

**대기방(트리거 채널) 관련 키** (RedisTempChannelStore 관리):

| 키 패턴 | 자료구조 | 설명 |
|---------|----------|------|
| `voice:temp:channels:{guildId}` | Set | 서버 내 임시 채널(대기방 포함) ID 집합 |
| `voice:temp:channel:{channelId}:members` | Set | 해당 임시 채널의 멤버 ID 집합 |

**트리거 채널 조회**: Redis 캐싱 없이 `AutoChannelConfigRepository.findByTriggerChannel(guildId, channelId)` DB 조회로 처리

---

## 자동방 채널 통계 그룹핑 (Auto Channel Stats Grouping)

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

### 배경 및 목적

자동방(Auto Channel)으로 생성된 임시 채널들은 각각 고유한 `channelId`를 가진다. 이로 인해 대시보드의 음성 채널 통계가 "게임방-1", "게임방-2", "게임방-3" 등으로 파편화되어, 하나의 설정(config) 단위로 얼마나 많이 활용되었는지 파악하기 어렵다.

이 기능은 두 가지 접근으로 문제를 해결한다:
- **autoChannelConfigId**: 자동방 인스턴스들을 `AutoChannelConfig` 단위로 그룹핑하여 동일 설정에서 생성된 채널들의 통계를 합산
- **channelType**: 상설 채널(`permanent`) / 자동방-선택(`auto_select`) / 자동방-즉시(`auto_instant`) 유형을 구분하여 필터링 지원

### 핵심 타이밍 문제

flush 시점에 `channelId`만으로는 해당 채널이 자동방인지, 어떤 config에 속하는지 알 수 없다. 기존 Redis `auto_channel:confirmed:{channelId}` 상태는 채널 삭제 시 함께 삭제되므로, 날짜 변경 flush나 `safeFlushAll()` 시점에는 confirmed 상태가 소실되어 있을 수 있다.

해결 방안: 자동방 확정 시점에 Voice Redis에도 채널의 auto-channel 정보를 별도 캐싱하고, 해당 키는 채널 삭제와 무관하게 TTL로 자연 만료된다.

### F-VOICE-032: 자동방 메타데이터 Redis 분리 저장

- **트리거**: 자동방 확정 시점 (선택 생성 모드의 `confirmChannel()`, 선택 생성 모드의 `createAndMoveToConfirmedChannel()`, 즉시 생성 모드의 `handleInstantTriggerJoin()`)
- **동작**:
  1. 확정방 생성이 완료되는 세 지점 각각에서 `VoiceRedisRepository.setAutoChannelInfo()` 호출
  2. `voice:channel:auto:{guildId}:{channelId}` 키에 자동방 메타데이터를 7일 TTL로 저장
  3. 저장 값: `{ configId: number, configName: string, channelType: 'auto_select' | 'auto_instant' }`
  4. 채널 삭제 이후에도 TTL이 만료되기 전까지 flush 시점에서 조회 가능
- **새 Redis 키**:

  | 키 패턴 | 값 | TTL | 설명 |
  |---------|-----|-----|------|
  | `voice:channel:auto:{guildId}:{channelId}` | `{ configId, configName, channelType }` | 7일 | 확정방의 auto-channel 메타데이터 캐시 |

- **관련 파일**:
  - `apps/api/src/channel/voice/infrastructure/voice-cache.keys.ts` — `autoChannelInfo(guild, channel)` 키 추가
  - `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts` — `setAutoChannelInfo()` / `getAutoChannelInfo()` 메서드 추가
  - `apps/api/src/channel/auto/application/auto-channel.service.ts` — 확정방 생성 3지점에 `setAutoChannelInfo()` 호출 추가
  - `apps/api/src/channel/auto/auto-channel.module.ts` — `VoiceRedisRepository` provider 공유 설정

### F-VOICE-033: voice_daily 테이블 채널 유형 컬럼 추가

- **배경**: `voice_daily` 레코드에 채널 유형 정보를 영구 저장하여, 이후 통계 조회 시 필터링 및 그룹핑을 지원한다.
- **동작**: 마이그레이션을 통해 다음 컬럼을 `voice_daily` 테이블에 추가한다.
- **VoiceDailyEntity (voice_daily) — 추가 컬럼**:

  | 컬럼 | 타입 | 기본값 | null 허용 | 설명 |
  |------|------|--------|-----------|------|
  | `channelType` | varchar(20) | `'permanent'` | 불가 | 채널 유형. `'permanent'` \| `'auto_select'` \| `'auto_instant'` |
  | `autoChannelConfigId` | int | — | 허용 | `auto_channel_config.id` 논리 참조 (FK 제약 없음 — config 삭제 후에도 통계 유지) |
  | `autoChannelConfigName` | varchar(255) | — | 허용 | config.name 스냅샷 (config 삭제 후에도 표시명 유지) |

- **기존 데이터 처리**:
  - `channelType` 기본값 `'permanent'`으로 기존 레코드와 호환 유지
  - `autoChannelConfigId`, `autoChannelConfigName`은 null로 초기화
- **마이그레이션 SQL**:
  ```sql
  ALTER TABLE voice_daily
    ADD COLUMN "channelType" VARCHAR(20) NOT NULL DEFAULT 'permanent',
    ADD COLUMN "autoChannelConfigId" INTEGER NULL,
    ADD COLUMN "autoChannelConfigName" VARCHAR(255) NULL;
  ```
- **추가 인덱스**:
  ```sql
  -- 자동방 config 단위 그룹핑 조회 최적화
  CREATE INDEX "IDX_voice_daily_auto_config"
    ON voice_daily ("guildId", "autoChannelConfigId", "date")
    WHERE "autoChannelConfigId" IS NOT NULL;

  -- channelType 필터링 최적화
  CREATE INDEX "IDX_voice_daily_channel_type"
    ON voice_daily ("guildId", "channelType", "date");
  ```
- **관련 파일**:
  - `apps/api/src/channel/voice/infrastructure/voice-daily.orm-entity.ts` — 컬럼 3개 추가
  - `apps/api/src/migrations/1776400000000-AddAutoChannelGrouping.ts` — 신규 마이그레이션

### F-VOICE-034: Flush 로직 auto-channel 메타데이터 주입

- **트리거**: `VoiceDailyFlushService.flushDate()` 실행 시 (세션 종료 또는 날짜 변경 flush, `safeFlushAll()`)
- **동작**:
  1. `flushDate()` 내부 채널별 루프에서 `channelId`로 `VoiceRedisRepository.getAutoChannelInfo(guildId, channelId)` 조회
  2. 조회 결과를 `accumulateChannelDuration()` 호출 시 추가 파라미터로 전달
  3. auto-channel 정보가 없으면 `channelType = 'permanent'`, `autoChannelConfigId = null`, `autoChannelConfigName = null` 적용
  4. `accumulateChannelDuration()` UPSERT SQL에서 새 세 컬럼을 포함하여 저장 (`COALESCE`로 기존 값 우선 보존)
- **하위 호환**:
  - F-VOICE-032(Redis 분리 저장) 이전에 생성된 확정방은 메타데이터 조회 결과가 null이므로 기존 동작(`permanent`)을 유지
- **관련 파일**:
  - `apps/api/src/channel/voice/application/voice-daily-flush-service.ts` — `flushDate()` 확장
  - `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts` — `accumulateChannelDuration()` 시그니처 및 UPSERT SQL 확장

### F-VOICE-035: VoiceDailyRecord DTO 및 API 응답 확장

- **배경**: 기존 클라이언트 호환성을 유지하면서, 새 필드를 옵셔널로 추가한다.
- **동작**:
  1. `VoiceDailyRecordDto`에 `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 필드 추가
  2. `VoiceDailyService`의 엔티티 → DTO 매핑에 세 필드 포함
  3. `ChannelStatItem`(libs/shared)에 세 필드 추가
  4. `VoiceAnalyticsService.getChannelStats()`에서 새 필드 매핑 적용
- **VoiceDailyRecordDto 변경 필드**:

  | 필드 | 타입 | 설명 |
  |------|------|------|
  | `channelType` | `'permanent' \| 'auto_select' \| 'auto_instant'` | 채널 유형. 기존 레코드는 `'permanent'` |
  | `autoChannelConfigId` | `number \| null` | auto-channel config 내부 ID |
  | `autoChannelConfigName` | `string \| null` | config 이름 스냅샷 |

- **API 응답 예시** (F-VOICE-017 / F-VOICE-018 응답 스키마 확장):
  ```json
  {
    "guildId": "123456789012345678",
    "userId": "111111111111111111",
    "date": "20260327",
    "channelId": "999999999999999999",
    "channelName": "Onyu의 오버워치 #3",
    "channelType": "auto_select",
    "autoChannelConfigId": 7,
    "autoChannelConfigName": "게임방",
    "channelDurationSec": 5400
  }
  ```
- **하위 호환**: 기존 클라이언트는 새 필드를 무시하면 됨. `channelType` 기본값은 `'permanent'`
- **관련 파일**:
  - `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts`
  - `apps/api/src/channel/voice/application/voice-daily.service.ts`
  - `libs/shared/src/types/diagnosis.ts` — `ChannelStatItem` 확장
  - `apps/api/src/voice-analytics/application/voice-analytics.service.ts`

### F-VOICE-036: VoiceAnalyticsService 자동방 그룹핑 API 지원

- **배경**: 서버사이드 분석 API에서도 자동방 그룹핑을 지원하여, 클라이언트가 서버에 집계를 위임할 수 있도록 한다.
- **엔드포인트 변경**: `GET /api/guilds/:guildId/voice-analytics/channel-stats`
  - 기존 쿼리 파라미터 유지 + `groupAutoChannels` 추가
  - `groupAutoChannels=true`인 경우: `autoChannelConfigId`가 같은 레코드를 합산하고, `channelId`를 `auto:{configId}`, `channelName`을 `configName`으로 치환
- **쿼리 파라미터 추가**:

  | 파라미터 | 타입 | 기본값 | 설명 |
  |----------|------|--------|------|
  | `groupAutoChannels` | boolean | `false` | `true`이면 자동방을 config 단위로 그룹핑하여 집계 |

- **관련 파일**:
  - `apps/api/src/voice-analytics/application/voice-analytics.service.ts` — `getChannelStats()` 그룹핑 로직 추가
  - `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts` — `groupAutoChannels` 파라미터 추가
  - `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts` — `groupAutoChannels` 필드 추가

### F-VOICE-037: 프론트엔드 타입 확장 및 자동방 그룹 집계 함수

- **배경**: 대시보드 클라이언트에서 자동방 통계를 config 단위로 집계하고 필터링한다.
- **동작**:
  1. `VoiceDailyRecord` 타입에 `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 필드 추가
  2. `VoiceAutoChannelGroupStat` 인터페이스 신규 추가 (config 단위 그룹 통계)
  3. `computeAutoChannelGroupStats(records)` 함수 추가: `autoChannelConfigId`가 같은 레코드를 합산하여 config 단위 통계를 반환
  4. `computeChannelStats(records, groupMode)` 함수에 `groupMode` 옵션 추가:
     - `'individual'` (기본): 기존 동작 (하위 호환)
     - `'auto_grouped'`: `autoChannelConfigId`가 같은 레코드를 합산하고, 상설 채널은 그대로 유지
- **VoiceAutoChannelGroupStat 인터페이스**:

  | 필드 | 타입 | 설명 |
  |------|------|------|
  | `autoChannelConfigId` | `number` | config 내부 ID |
  | `autoChannelConfigName` | `string` | config 이름 |
  | `channelType` | `'auto_select' \| 'auto_instant'` | 자동방 유형 |
  | `totalDurationSec` | `number` | 해당 config 소속 채널들의 총 체류 시간(초) |
  | `instanceCount` | `number` | 해당 config로 생성된 고유 채널 수 |

- **관련 파일**:
  - `apps/web/app/lib/voice-dashboard-api.ts` — 타입 확장, `computeAutoChannelGroupStats()` 추가, `computeChannelStats()` 그룹핑 옵션 추가

### F-VOICE-038: 대시보드 UI — 채널 유형 필터 및 자동방 그룹 탭

- **배경**: 파편화된 자동방 채널 통계를 직관적으로 파악할 수 있도록 대시보드 UI를 확장한다.
- **변경 컴포넌트**:

  **ChannelBarChart**:
  - 기존 탭 (채널 | 카테고리) 에 "자동방 그룹" 탭 추가
  - "채널" 탭: 기존 동작 (개별 channelId 기준) 유지
  - "카테고리" 탭: 기존 동작 유지
  - "자동방 그룹" 탭 (신규): `computeAutoChannelGroupStats()`를 사용하여 `autoChannelConfigId` 기준 그룹핑된 막대 차트 표시
  - 채널 유형 필터 드롭다운 추가 (전체 | 상설 채널 | 자동방):
    - "전체": 모든 `channelType` 포함
    - "상설 채널": `channelType === 'permanent'`만 표시
    - "자동방": `channelType !== 'permanent'`만 표시

  **SummaryCards**:
  - `uniqueChannels` 계산 시 자동방을 config 단위로 카운트하는 옵션 적용
  - 변경 전: `new Set(records.map(r => r.channelId)).size`
  - 변경 후: 상설 채널 수 + 자동방 config 수 (중복 제거)

  **UserChannelPieChart**:
  - 자동방 그룹핑 모드 적용 — `computeChannelStats(records, 'auto_grouped')` 사용하여 config 단위로 파이 슬라이스 표시

- **i18n 추가 키**:

  | 키 | 한국어 | 영어 |
  |----|--------|------|
  | `voice.channelChart.tabAutoGroup` | 자동방 그룹 | Auto Group |
  | `voice.channelChart.filterAll` | 전체 | All |
  | `voice.channelChart.filterPermanent` | 상설 채널 | Permanent |
  | `voice.channelChart.filterAuto` | 자동방 | Auto Channel |
  | `voice.channelChart.instanceCount` | 생성된 방 수 | Instances |
  | `voice.summary.autoChannelGroups` | 자동방 설정 | Auto Channel Configs |

- **관련 파일**:
  - `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx`
  - `apps/web/app/dashboard/guild/[guildId]/voice/components/SummaryCards.tsx`
  - `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx`
  - `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` — 필터 상태 관리 및 컴포넌트 전달
  - `libs/i18n/locales/ko/web/dashboard.json`
  - `libs/i18n/locales/en/web/dashboard.json`

### F-VOICE-039: 기존 데이터 소급 태깅 스크립트

- **배경**: 이 기능 적용 이전에 생성된 `voice_daily` 레코드에는 `channelType = 'permanent'`, `autoChannelConfigId = null`이 기본값으로 설정된다. 현재 존재하는 `auto_channel_config`의 카테고리 정보를 기반으로 기존 레코드를 추론하여 소급 태깅한다.
- **방식**: DB 마이그레이션이 아닌 일회성 수동 실행 스크립트로 처리한다. 추론 기반이므로 100% 정확하지 않으며, config가 삭제된 경우 추론 불가하다.
- **추론 로직**:
  - `auto_channel_config`의 버튼 `targetCategoryId`(select 모드) 또는 `instantCategoryId`(instant 모드)와 `voice_daily.categoryId`가 일치하는 레코드를 자동방으로 추정
  - `channelType = 'permanent'`이고 아직 태깅되지 않은 레코드만 대상으로 함
- **주의사항**:
  - 동일 카테고리에 상설 채널도 존재할 경우 오탐이 발생할 수 있음
  - 실행 전 `SELECT COUNT(*)` 으로 영향 범위를 확인한 후 적용할 것
  - 필요 시 채널명 패턴 매칭 등 추가 필터를 적용하여 정확도를 높임
- **관련 파일**: 일회성 SQL 스크립트 (별도 파일로 관리, 마이그레이션에 포함하지 않음)
