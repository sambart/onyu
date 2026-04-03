# Newbie 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

디스코드 서버에 신규 가입한 멤버를 종합적으로 관리하는 도메인이다. 환영인사 자동 전송, 음성 채널 플레이타임 기반 미션 추적, 기존 멤버의 신규사용자 동반 플레이 시간 기록(모코코 사냥), 신입기간 역할 자동 관리의 네 가지 하위 기능으로 구성된다. 모든 기능은 길드(서버)별로 독립 설정된다.

## 관련 모듈

- `apps/api/src/newbie/` — 신규사용자 관리 핵심 로직
- `apps/api/src/newbie/welcome/` — 환영인사 이벤트 핸들러 및 서비스
- `apps/api/src/newbie/mission/` — 미션 생성/추적 서비스 및 스케줄러
- `apps/api/src/newbie/moco/` — 모코코 사냥 집계 서비스
- `apps/api/src/newbie/role/` — 신입기간 역할 자동관리 서비스
- `apps/api/src/newbie/infrastructure/` — Redis 저장소, DB 저장소
- `apps/api/src/channel/voice/` — voice 도메인 연계 (VoiceDailyEntity 활용)

## 아키텍처

```
Discord guildMemberAdd Event
    │
    ▼
[NewbieGateway]              ← Discord.js guildMemberAdd 이벤트 수신
    │
    ├──► [WelcomeService]        → 환영 메시지 Embed 생성 및 채널 전송 (F-NEWBIE-001)
    ├──► [MissionService]        → 신규 멤버 미션 레코드 생성 (F-NEWBIE-002)
    └──► [NewbieRoleService]     → 신입기간 역할 자동 부여 (F-NEWBIE-004)

Discord voiceStateUpdate Event (voice 도메인 연계)
    │
    ▼
[MocoService]                ← 같은 채널 동시 접속 감지 (F-NEWBIE-003)
    │
    └──► [MocoRedisRepository]  → 기존 멤버별 모코코 사냥 시간 누적

Scheduler (cron)
    │
    ├──► [MissionScheduler]     → 미션 만료 확인 및 상태 갱신 (F-NEWBIE-002)
    └──► [NewbieRoleScheduler]  → 신입기간 만료 확인 및 역할 제거 (F-NEWBIE-004)

Web Dashboard API
    │
    ├──► GET  /api/guilds/{guildId}/newbie/config              → 설정 조회
    ├──► POST /api/guilds/{guildId}/newbie/config              → 설정 저장
    ├──► GET  /api/guilds/{guildId}/newbie/missions             → 미션 통합 조회 (F-NEWBIE-005, status·page·pageSize 파라미터)
    ├──► POST /api/guilds/{guildId}/newbie/missions/complete    → 미션 수동 성공 처리 (F-NEWBIE-005)
    ├──► POST /api/guilds/{guildId}/newbie/missions/fail        → 미션 수동 실패 처리 (F-NEWBIE-005)
    ├──► POST /api/guilds/{guildId}/newbie/missions/hide        → 미션 Embed 숨김 처리 (F-NEWBIE-005)
    ├──► POST /api/guilds/{guildId}/newbie/missions/unhide      → 미션 Embed 숨김 해제 (F-NEWBIE-005)
    ├──► GET  /api/guilds/{guildId}/newbie/moco                 → 모코코 사냥 순위 조회
    └──► ...templates, moco-template
```

---

## 기능 상세

### F-NEWBIE-001: 환영인사 설정

- **트리거**: 디스코드 서버에 새 멤버가 참여 (`guildMemberAdd` 이벤트)
- **전제 조건**: `NewbieConfig.welcomeEnabled = true`, 환영 채널이 설정되어 있음
- **동작**:
  1. `NewbieConfig`에서 해당 guildId의 설정 조회 (Redis 캐시 우선, 미스 시 DB)
  2. 설정이 없거나 `welcomeEnabled = false`이면 처리 중단
  3. 템플릿 변수 치환:
     - `{username}` → 신규 멤버의 서버 닉네임 (없으면 전역 닉네임)
     - `{memberCount}` → 현재 서버 멤버 수
     - `{serverName}` → 서버명
  4. Discord Embed 구성 (제목, 설명, 색상, 썸네일 이미지 URL)
  5. 설정된 환영 채널에 Embed 메시지 전송
- **템플릿 변수**:

  | 변수 | 치환값 |
  |------|--------|
  | `{username}` | 신규 멤버 닉네임 |
  | `{memberCount}` | 서버 전체 멤버 수 |
  | `{serverName}` | 서버명 |

- **오류 처리**: 채널을 찾을 수 없거나 봇 권한 부족 시 로그 기록 후 조용히 실패

---

### F-NEWBIE-002: 미션 생성 및 추적

- **트리거**: 신규사용자가 서버에 가입 (`guildMemberAdd` 이벤트), 미션 기능 활성화 시 자동 시작
- **전제 조건**: `NewbieConfig.missionEnabled = true`
- **동작 (미션 생성)**:
  1. `NewbieMission` 레코드 생성 (guildId, memberId, 시작일, 마감일, 목표 플레이타임)
  2. 마감일 = 시작일 + `missionDurationDays`
- **동작 (플레이타임 측정)**:
  1. voice 도메인의 `VoiceDailyEntity`에서 해당 멤버의 기간 내 `channelDurationSec` 합산
  2. 조회 범위: `startDate` ~ `endDate`, `channelId != 'GLOBAL'`인 레코드
  3. "플레이횟수" = 해당 기간 내 `VoiceChannelHistory` 세션 수 (아래 카운팅 옵션 적용 후 집계)
- **플레이횟수 카운팅 옵션**:
  - **최소 참여시간 기준** (`playCountMinDurationMin`): 세션의 총 참여시간이 N분 이상인 세션만 유효한 1회로 인정. NULL이면 비활성화 (모든 세션 인정).
    - 예: 30분 설정 시, 15분 참여 세션은 무시되고 45분 참여 세션만 1회로 카운트
  - **시간 간격 기준** (`playCountIntervalMin`): 이전 유효 세션 시작 후 N분 이내에 다시 시작된 세션은 동일한 1회로 병합. NULL이면 비활성화 (모든 세션 독립 카운트).
    - 예: 30분 설정 시, 10:00 입장(1회) → 10:20 재입장(병합, 1회 유지) → 11:30 입장(2회)
  - **두 옵션은 동시 적용 가능** (AND 조건): 두 조건을 모두 통과한 세션만 1회로 카운트
  - **기본값**: 둘 다 30 (분), 최솟값 1 (0 허용 안 함)
- **달성 판정 로직**:
  - `missionTargetPlayCount`가 NULL인 경우: `playtimeSec >= targetPlaytimeSec` (플레이타임만으로 판정, 기존 동작)
  - `missionTargetPlayCount`에 값이 있는 경우: `playtimeSec >= targetPlaytimeSec AND playCount >= targetPlayCount` (플레이타임과 플레이횟수 모두 달성해야 완료)
- **미션 상태**:

  | 상태 | 코드 | 조건 |
  |------|------|------|
  | 진행중 | `IN_PROGRESS` | 현재일 <= 마감일, 목표 미달성 |
  | 완료 | `COMPLETED` | 목표 달성 (마감일 이전 포함). 달성 기준은 달성 판정 로직 참조 |
  | 실패 | `FAILED` | 현재일 > 마감일, 목표 미달성 |
  | 퇴장 | `LEFT` | 멤버가 서버를 떠남 (자동 감지) |

- **멤버 닉네임 저장**: 미션 생성 시 `member.displayName`을 `memberName` 컬럼에 저장한다. 성공/실패 처리 시에도 최신 닉네임으로 갱신한다. `enrichMissions()` 실행 시 Discord에서 조회한 최신 서버 닉네임을 DB `memberName`에 저장하여 탈퇴 후에도 마지막 서버 닉네임이 보존된다. 이력 조회 시에는 DB에 저장된 `memberName`을 그대로 사용하며 Discord API를 호출하지 않는다. `memberName`이 null인 경우에만 Discord에서 조회하되, 서버를 떠난 멤버(탈퇴)이면 fallback 이름을 DB에 저장하지 않는다.
- **Embed 표시 범위**: 모든 상태(IN_PROGRESS, COMPLETED, FAILED, LEFT)의 미션을 Embed에 표시한다. `hiddenFromEmbed = true`인 미션은 Embed에서 제외된다. 관리자가 웹 대시보드에서 토글 버튼으로 특정 미션의 Embed 표시/숨김을 전환할 수 있다 (F-NEWBIE-005).
- **봇·탈퇴 멤버 자동 처리**: 미션 Embed 갱신 시 각 활성 미션의 멤버를 Discord 캐시로 조회하여, 봇 멤버의 미션 레코드는 삭제하고, 서버를 떠난 멤버는 `LEFT` 상태로 변경 및 Embed에서 숨김 처리한다.
- **스케줄러**: 매일 자정 `MissionScheduler` 실행
  1. `IN_PROGRESS` 상태 미션 중 마감일이 지난 항목 조회
  2. 목표 달성 여부 재확인 후 `COMPLETED` 또는 `FAILED`로 상태 갱신
- **알림 메시지 (채널 Embed)**:
  - 설정된 알림 채널에 미션 현황 Embed 표시
  - 갱신 버튼(Discord Button) 클릭 시 최신 데이터로 Embed 수정
  - Embed 표시 형식은 `NewbieMissionTemplate` 테이블의 템플릿 필드로 결정된다 (아래 템플릿 시스템 참조)
- **Embed 템플릿 시스템** (F-NEWBIE-002-TMPL):
  - 제목, 헤더, 항목 포맷, 푸터, 상태 이모지/텍스트를 길드별로 커스터마이징 가능
  - 템플릿은 `NewbieMissionTemplate` 테이블에 저장되며 길드당 1행 보장
  - 템플릿이 존재하지 않으면 기본값(Default Template)을 사용
  - **제목 템플릿** (`titleTemplate`):
    - 사용 가능 변수: `{totalCount}`
    - 기본값: `🧑‍🌾 신입 미션 체크`
  - **헤더 템플릿** (`headerTemplate`): description 최상단 요약 줄
    - 사용 가능 변수: `{totalCount}`, `{inProgressCount}`, `{completedCount}`, `{failedCount}`
    - 기본값: `🧑‍🌾 뉴비 멤버 (총 인원: {totalCount}명)`
  - **항목 템플릿** (`itemTemplate`): 멤버별 미션 현황 한 줄 포맷 (반복 렌더링)
    - 사용 가능 변수:

      | 변수 | 설명 |
      |------|------|
      | `{username}` | 서버 닉네임 (없으면 전역 닉네임) |
      | `{mention}` | Discord 멘션 (`<@memberId>`) |
      | `{startDate}` | 미션 시작일 (`YYYY-MM-DD`) |
      | `{endDate}` | 미션 마감일 (`YYYY-MM-DD`) |
      | `{statusEmoji}` | 상태 이모지 (상태 매핑에서 결정) |
      | `{statusText}` | 상태 텍스트 (상태 매핑에서 결정) |
      | `{playtimeHour}` | 누적 플레이타임 시간 (정수) |
      | `{playtimeMin}` | 누적 플레이타임 분 (정수) |
      | `{playtimeSec}` | 누적 플레이타임 초 (정수) |
      | `{playtime}` | 누적 플레이타임 포맷 (`H시간 M분 S초`) |
      | `{playCount}` | 플레이횟수 (정수) |
      | `{targetPlaytime}` | 목표 플레이타임 (`H시간` 또는 `H시간 M분` 형태) |
      | `{targetPlayCount}` | 목표 플레이횟수 (정수). `missionTargetPlayCount`가 NULL이면 빈 문자열 |
      | `{daysLeft}` | 마감일까지 남은 일수 (정수, 마감 당일 = 0) |

    - 기본값:
      ```
      {mention} 🌱
      {startDate} ~ {endDate}
      {statusEmoji} {statusText} | 플레이타임: {playtime} | 플레이횟수: {playCount}회
      ```
    - `{targetPlayCount}` 변수는 `missionTargetPlayCount`가 NULL인 길드에서 템플릿에 포함되어 있으면 빈 문자열로 치환된다.
  - **푸터 템플릿** (`footerTemplate`): Embed footer
    - 사용 가능 변수: `{updatedAt}`
    - 기본값: `마지막 갱신: {updatedAt}`
  - **상태 이모지/텍스트 매핑** (`statusMapping`): JSON 컬럼 1개에 저장
    - 구조: `{"IN_PROGRESS": {"emoji": "🟡", "text": "진행중"}, "COMPLETED": {"emoji": "✅", "text": "완료"}, "FAILED": {"emoji": "❌", "text": "실패"}, "LEFT": {"emoji": "🚪", "text": "퇴장"}}`
    - 사용자가 이모지와 텍스트를 각각 변경 가능
  - **날짜 포맷**: 고정 (`YYYY-MM-DD`)
  - **유효성 검사**: 존재하지 않는 변수 사용 시 저장 차단 (프론트엔드 + 백엔드)
- **길드별 독립 설정**

---

### F-NEWBIE-003: 같이 플레이한 사용자 기록 (모코코 사냥)

- **개념**: "모코코" = 신규사용자(서버 가입 후 설정된 일수 이내인 멤버). 기존 멤버가 신규사용자와 같은 음성 채널에 동시 접속한 시간·횟수를 "모코코 사냥"으로 기록하고, **점수 기반**으로 순위를 산출한다.
- **전제 조건**: `NewbieConfig.mocoEnabled = true`
- **모코코 기준 일수** (`mocoNewbieDays`): Discord 서버 가입일(`member.joinedAt`) 기준으로, 가입 후 이 일수 이내인 멤버를 모코코(신입)로 판정한다. 기본값 30일, 최솟값 1일, 최댓값 365일.
- **모코코도 사냥꾼 허용 옵션** (`mocoAllowNewbieHunter`):
  - `false` (기본): 모코코(신규사용자)는 사냥꾼이 될 수 없음. 기존 멤버만 사냥꾼으로 집계
  - `true`: 모코코도 다른 모코코의 사냥꾼이 될 수 있음 (단, 자기 자신에 대한 사냥 시간은 누적하지 않음)

#### 시간 집계 방식 (채널 기반)

모코코가 몇 명이든 **채널에 모코코가 1명 이상 존재하면 사냥꾼에게 1분만 누적**한다 (모코코 수에 비례하지 않음). 모코코별 상세 동시접속 시간은 참고용으로 별도 기록하되, 순위 산출에는 채널 기반 시간만 사용한다.

```
예시: 사냥꾼A + 모코코1,2,3,4,5 → 1분 경과
  순위용 시간: 사냥꾼A에게 1분 누적 (모코코 수 무관)
  참고용 상세: 모코코1~5 각각에 대해 1분 기록 (순위 미반영)
```

#### 사냥 세션 추적

사냥꾼이 모코코와 같은 채널에 동시 접속한 연속 구간을 하나의 "사냥 세션"으로 정의한다.

- **세션 시작**: 사냥꾼이 있는 채널에 모코코가 1명 이상 존재하게 된 시점
- **세션 종료**: 사냥꾼이 퇴장하거나 채널 내 모코코가 0명이 된 시점
- **최소 동시접속 시간** (`mocoMinCoPresenceMin`): 세션의 총 시간이 이 값 미만이면 무효 처리 (시간·횟수 모두 롤백). 기본값 10분, 최솟값 1분. 이를 통해 우연한 짧은 접속이나 AFK를 필터링한다.
- **세션 이력**: 유효 세션은 `MocoHuntingSession` 테이블에 영구 저장한다.
- **플레이횟수 카운팅 옵션**: 미션 설정(F-NEWBIE-002)과 동일한 방식으로, 모코코 사냥 세션의 플레이횟수를 카운팅할 때 추가 필터를 적용한다.
  - **최소 참여시간 기준** (`mocoPlayCountMinDurationMin`): 세션의 총 참여시간이 N분 이상인 세션만 유효한 1회로 인정. NULL이면 비활성화 (모든 세션 인정).
  - **시간 간격 기준** (`mocoPlayCountIntervalMin`): 이전 유효 세션 시작 후 N분 이내에 다시 시작된 세션은 동일한 1회로 병합. NULL이면 비활성화 (모든 세션 독립 카운트).
  - **두 옵션은 동시 적용 가능** (AND 조건): 두 조건을 모두 통과한 세션만 1회로 카운트
  - **기본값**: 둘 다 30 (분), 최솟값 1 (0 허용 안 함)

#### 음성 제외 채널 연동

`VoiceExcludedChannel`(F-VOICE-016)로 설정된 제외 채널/카테고리에서의 동시 접속은 모코코 사냥에서도 제외한다. `MocoScheduler`가 채널 순회 시 `VoiceExcludedChannelService.isExcludedChannel()`로 필터링한다.

#### 점수 기반 순위 시스템

사냥꾼의 순위는 **총 점수** 내림차순으로 결정한다. 점수는 세 가지 요소의 가중합으로 산출된다.

**점수 공식**:
```
총점 = (유효 세션 수 × mocoScorePerSession)
     + (채널 기반 실제 시간(분) × mocoScorePerMinute)
     + (도움준 고유 모코코 수 × mocoScorePerUnique)
```

**점수 설정** (NewbieConfig):

| 설정 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `mocoScorePerSession` | int | 10 | 유효 세션 1회당 점수. 0이면 세션 점수 비활성화 |
| `mocoScorePerMinute` | int | 1 | 채널 기반 실제 동시접속 1분당 점수. 0이면 시간 점수 비활성화 |
| `mocoScorePerUnique` | int | 5 | 도움준 고유 모코코 1명당 보너스 점수. 0이면 다양성 점수 비활성화 |

**점수 계산 예시** (기본 설정):
```
사냥꾼A: 모코코3명과 3회 게임, 채널 기반 총 90분
  → 세션: 3 × 10 = 30점
  → 시간: 90 × 1 = 90점
  → 다양성: 3 × 5 = 15점
  → 총점: 135점

사냥꾼B: 모코코1명과 1회 게임, 채널 기반 총 120분
  → 세션: 1 × 10 = 10점
  → 시간: 120 × 1 = 120점
  → 다양성: 1 × 5 = 5점
  → 총점: 135점
```

#### 기간별 집계 및 리셋

- **리셋 주기** (`mocoResetPeriod`): `NONE`(누적, 기본값) / `MONTHLY` / `CUSTOM`
- `MONTHLY`: 매월 1일 00:00에 Redis 순위 초기화
- `CUSTOM`: `mocoResetIntervalDays`일마다 초기화
- 리셋 시 Redis Sorted Set만 초기화하며, DB(`MocoHuntingSession`, `MocoHuntingDaily`)의 이력은 영구 보존
- 순위 Embed에 현재 집계 기간을 표시 (`{periodStart}`, `{periodEnd}` 변수)

#### 측정 방식

1. `MocoScheduler`가 매 1분마다 봇이 참여 중인 모든 길드의 음성 채널을 순회
2. `VoiceExcludedChannelService.isExcludedChannel()`로 제외 채널 필터링
3. 채널 내 모코코(서버 가입 후 `mocoNewbieDays`일 이내인 멤버) 존재 여부 확인
4. 모코코가 1명 이상인 채널의 사냥꾼 각각에 대해:
   a. **채널 기반 시간**: 모코코 수와 무관하게 1분 누적 (순위용)
   b. **모코코별 상세 시간**: 각 모코코에 대해 1분 개별 누적 (참고용, 순위 미반영)
   c. **진행중 세션 갱신**: 세션 시작 시각, 동시 접속 중인 모코코 목록 추적
5. 세션 종료 시:
   a. `durationMin >= mocoMinCoPresenceMin` → 유효 세션: DB 저장, 횟수 +1
   b. 미달 → 무효: 해당 세션의 시간·횟수 롤백
6. 점수 재계산 후 Redis Sorted Set 갱신
7. 사냥꾼 기준: `mocoAllowNewbieHunter` 설정에 따라 기존 멤버만 또는 전체 채널 멤버

#### 표시 방식 선택 (`mocoDisplayMode`)

모코코 사냥 순위 표시 방식을 길드별로 선택할 수 있다. `NewbieConfig.mocoDisplayMode` 설정으로 제어하며 기본값은 `EMBED`이다.

| 모드 | 값 | 설명 |
|------|----|------|
| Embed 모드 | `EMBED` | 기존 Discord Embed 방식 (1명/페이지, 템플릿 시스템 활용) |
| Canvas 모드 | `CANVAS` | Canvas 이미지 기반 랭킹 테이블 방식 (10명/페이지) |

두 모드는 **완전히 독립**으로 동작한다. Canvas 모드로 전환해도 Embed 관련 템플릿(`NewbieMocoTemplate`) 및 Embed 설정 데이터는 보존된다.

---

#### 알림 메시지 — Embed 모드

- **전제 조건**: `mocoDisplayMode = EMBED`
- **동작**:
  - 설정된 채널에 TOP N 순위 Embed 표시 (1명/페이지)
  - 페이지네이션: Discord Button으로 이전/다음 페이지 이동
  - 자동 갱신: 설정된 간격(분)마다 Embed 수정, 또는 갱신 버튼 클릭 시 즉시 갱신
  - 표시 형식은 `NewbieMocoTemplate` 테이블의 템플릿 필드로 결정된다 (아래 Embed 템플릿 시스템 참조)
  - "내 순위" 버튼 없음

---

#### 알림 메시지 — Canvas 모드 (F-NEWBIE-003-CANVAS)

- **전제 조건**: `mocoDisplayMode = CANVAS`
- **동작**:
  - 설정된 채널에 Canvas로 렌더링된 PNG 이미지를 Discord 첨부파일로 전송한다
  - 페이지네이션: Discord Button(이전/다음/갱신/내 순위)으로 제어하며 기존 버튼 구성 유지
  - 자동 갱신: 설정된 간격(분)마다 이미지 재렌더링 후 메시지 수정
- **랭킹 보드 Canvas** (기본 표시):
  - 한 페이지에 사냥꾼 **10명**의 순위를 테이블 형태로 표시 (기본값, 설정 가능)
  - 이미지 크기: **너비 800px**, 높이는 사냥꾼 수에 따라 가변 (최소 400px, 최대 1200px)
  - 테이블 컬럼: 순위, 사냥꾼(닉네임), 점수, 시간(분), 세션(횟수), 모코코(고유 수)
  - 이미지 상단: 집계 기간 표시 (`periodStart` ~ `periodEnd`, `NONE`이면 생략)
  - 이미지 하단: 점수 산정 규칙 표시 (세션당/분당/고유모코코당 점수, 최소 동시접속 시간)
  - 출력 포맷: **PNG**
- **개인 상세 Canvas** ("내 순위" 버튼 클릭 시):
  - Ephemeral 메시지로 Canvas PNG 이미지 반환 (해당 사용자에게만 표시)
  - 이미지 크기: **너비 600px**, 높이는 도움준 모코코 수에 따라 가변
  - 표시 내용: 사냥꾼 닉네임, 순위, 총 점수, 사냥 시간, 세션 횟수, 고유 모코코 수, 도움준 모코코 목록(이름/시간/횟수), 점수 산정 규칙
  - 대기 중인 사냥꾼이 없으면 "현재 순위 데이터 없음" 메시지 표시

##### Canvas 렌더링 상세

| 항목 | 사양 |
|------|------|
| 렌더링 라이브러리 | `@napi-rs/canvas` |
| 폰트 | NotoSansCJK (한글/CJK 텍스트), NotoColorEmoji (이모지) |
| 렌더링 패턴 | `profile-card-renderer.ts` 아키텍처 재활용 |
| 출력 포맷 | PNG |
| 랭킹 보드 크기 | 800px × 가변 (최소 400px, 최대 1200px) |
| 개인 상세 크기 | 600px × 가변 |
| 페이지당 사냥꾼 수 | 10명 (기본값) |

##### Canvas 렌더링 캐싱

| 항목 | 사양 |
|------|------|
| 캐시 저장소 | Redis |
| 캐시 키 | `newbie:moco:canvas:{guildId}:rank:{page}` (랭킹 보드), `newbie:moco:canvas:{guildId}:detail:{hunterId}` (개인 상세) |
| TTL | **30초** |
| 캐시 무효화 조건 | `MocoScheduler` 틱 완료 후 해당 guildId의 canvas 캐시 전체 삭제 (`DEL newbie:moco:canvas:{guildId}:*`) |
| 캐시 히트 시 | Redis에서 PNG 바이트 배열 직접 반환 (재렌더링 생략) |
| 캐시 미스 시 | Canvas 렌더링 수행 후 Redis 저장 및 반환 |

---

- **Embed 템플릿 시스템** (F-NEWBIE-003-TMPL):
  > Embed 모드(`mocoDisplayMode = EMBED`)에서만 사용된다. Canvas 모드에서는 무시된다.
  - 제목, 본문 구조, 항목 포맷, 푸터, 점수 산정 안내를 길드별로 커스터마이징 가능
  - 템플릿은 `NewbieMocoTemplate` 테이블에 저장되며 길드당 1행 보장
  - 템플릿이 존재하지 않으면 기본값(Default Template)을 사용
  - **제목 템플릿** (`titleTemplate`):
    - 사용 가능 변수: `{rank}`, `{hunterName}`
    - 기본값: `모코코 사냥 TOP {rank} — {hunterName} 🌱`
  - **본문 템플릿** (`bodyTemplate`): 사냥꾼 1명의 페이지 전체 구조. `{mocoList}` 블록 변수 위치에 항목 템플릿이 반복 삽입됨
    - 사용 가능 변수:

      | 변수 | 설명 |
      |------|------|
      | `{score}` | 사냥꾼의 총 점수 |
      | `{totalMinutes}` | 채널 기반 실제 동시접속 시간(분) |
      | `{sessionCount}` | 유효 사냥 세션 횟수 |
      | `{uniqueNewbieCount}` | 도움준 고유 모코코 수 |
      | `{mocoList}` | 모코코별 상세 항목 반복 삽입 위치 (블록 변수) |

    - 기본값:
      ```
      🏆 총 점수: {score}점
      ⏱️ 사냥 시간: {totalMinutes}분 | 🎮 게임 횟수: {sessionCount}회 | 🌱 모코코: {uniqueNewbieCount}명

      도움을 받은 모코코들:
      {mocoList}
      ```
  - **항목 템플릿** (`itemTemplate`): 도움받은 모코코 한 줄 포맷 (반복 렌더링)
    - 사용 가능 변수:

      | 변수 | 설명 |
      |------|------|
      | `{newbieName}` | 모코코 서버 닉네임 |
      | `{minutes}` | 해당 모코코와의 동시접속 시간(분, 참고용) |
      | `{sessions}` | 해당 모코코와의 유효 세션 횟수 |

    - 기본값: `– {newbieName} 🌱: {minutes}분 ({sessions}회)`
  - **푸터 템플릿** (`footerTemplate`): Embed footer
    - 사용 가능 변수:

      | 변수 | 설명 |
      |------|------|
      | `{currentPage}` | 현재 페이지 번호 |
      | `{totalPages}` | 전체 페이지 수 |
      | `{interval}` | 자동 갱신 간격(분) |
      | `{periodStart}` | 현재 집계 기간 시작일 (YYYY-MM-DD). `NONE`이면 빈 문자열 |
      | `{periodEnd}` | 현재 집계 기간 종료일 (YYYY-MM-DD). `NONE`이면 빈 문자열 |

    - 기본값: `페이지 {currentPage}/{totalPages} | 자동 갱신 {interval}분`
  - **점수 산정 안내 템플릿** (`scoringTemplate`): Embed 본문 하단에 점수 산정 방식을 안내하는 텍스트. 사용자에게 점수가 어떻게 계산되는지 투명하게 공개한다.
    - 사용 가능 변수:

      | 변수 | 설명 |
      |------|------|
      | `{scorePerSession}` | 세션당 점수 설정값 |
      | `{scorePerMinute}` | 분당 점수 설정값 |
      | `{scorePerUnique}` | 고유 모코코당 점수 설정값 |
      | `{minCoPresence}` | 최소 동시접속 시간(분) 설정값 |

    - 기본값:
      ```
      ── 점수 산정 ──
      🎮 게임 1회: {scorePerSession}점 | ⏱️ 1분당: {scorePerMinute}점 | 🌱 신입 1명당: {scorePerUnique}점
      ⏳ 최소 {minCoPresence}분 이상 함께해야 1회로 인정
      ```
    - `scoringTemplate`이 빈 문자열(`""`)이면 점수 산정 안내를 표시하지 않음
  - **유효성 검사**: 존재하지 않는 변수 사용 시 저장 차단 (프론트엔드 + 백엔드)
- **MVP 제외 항목**: [막판], [관전] 등 태그 구분 기능
- **길드별 독립 설정**

---

### F-NEWBIE-004: 신입기간 역할 자동관리

- **트리거 (부여)**: 신규사용자가 서버에 가입 (`guildMemberAdd` 이벤트)
- **트리거 (제거)**: 신입기간 만료 (스케줄러 실행)
- **전제 조건**: `NewbieConfig.roleEnabled = true`, 역할 ID 설정되어 있음
- **동작 (역할 부여)**:
  1. `guildMemberAdd` 이벤트 발생 시 `NewbieConfig` 조회
  2. `roleEnabled = true`이고 `newbieRoleId`가 설정된 경우 Discord API로 역할 부여
  3. `NewbiePeriod` 레코드 생성 (guildId, memberId, 시작일, 만료일)
- **동작 (역할 제거)**:
  1. 매일 자정 `NewbieRoleScheduler` 실행
  2. `NewbiePeriod` 중 만료일이 지난 활성 레코드 조회
  3. Discord API로 해당 멤버의 신입 역할 제거
  4. `NewbiePeriod.isExpired = true` 로 갱신
- **미션 완료 여부와 무관**: 역할 관리는 신입기간(일수)만 기준으로 함
- **기간 만료 후 역할 교체 없음**: 역할 제거만 수행하며 다른 역할로 교체하지 않음
- **길드별 독립 설정**

---

### F-NEWBIE-005: 미션 수동 관리

관리자가 웹 대시보드에서 미션을 수동으로 성공/실패 처리하고, Embed에서 특정 미션을 숨길 수 있는 기능이다. F-NEWBIE-004(신입기간 역할 자동관리)와 독립적으로 동작한다.

- **웹 UI 위치**: 대시보드(`/dashboard/guild/{guildId}/newbie`). 설정 페이지(`/settings/guild/{guildId}/newbie`)에는 포함하지 않는다.

#### 웹 UI — 단일 테이블 + 상태 필터

기존 "진행 중" / "전체 이력" 두 개의 서브탭 구조를 폐지하고, 하나의 테이블에 모든 상태의 미션을 표시한다.

- **상태 필터**: 테이블 상단에 단일 선택 필터를 제공한다.
  - 필터 옵션: `전체` | `진행중` | `완료` | `실패` | `퇴장`
  - **기본 선택: `진행중`** (기존 UX와 동일한 진입 경험 유지)
  - 필터 변경 시 페이지를 1로 초기화하고 API를 재조회한다.
- **페이지네이션**: 모든 필터 상태에 공통으로 적용된다.
- **액션 열**:
  - `IN_PROGRESS` 상태 미션에서만 성공/실패 드롭다운을 표시한다.
  - 모든 상태의 미션에서 Embed 숨김/표시 토글 버튼을 표시한다.

#### 동작 상세

- **전제 조건**: Discord OAuth 로그인 + 해당 서버 관리 권한
- **동작 (성공 처리)**:
  1. 관리자가 `IN_PROGRESS` 상태 미션을 선택하여 "성공 처리" 실행
  2. 미션 상태를 `COMPLETED`로 갱신
  3. (옵션) 역할 부여: 관리자가 서버 역할 목록에서 드롭다운으로 역할을 선택한 경우, Discord API로 해당 멤버에게 역할 부여 (`member.roles.add(roleId)`)
  4. 미션 목록 Redis 캐시 무효화 및 Embed 갱신
- **동작 (실패 처리)**:
  1. 관리자가 `IN_PROGRESS` 상태 미션을 선택하여 "실패 처리" 실행
  2. 미션 상태를 `FAILED`로 갱신
  3. (옵션) 강퇴: 관리자가 강퇴 옵션을 선택한 경우:
     a. (옵션) DM 사유: 강퇴 전 멤버에게 DM으로 사유 메시지 전송 (DM 차단 시 조용히 실패)
     b. Discord API로 멤버 강퇴 (`guild.members.kick(memberId)`)
  4. 미션 목록 Redis 캐시 무효화 및 Embed 갱신
- **동작 (Embed 숨김/표시 토글)**:
  1. 관리자가 웹 대시보드에서 미션의 Embed 토글 버튼을 클릭
  2. `NewbieMission.hiddenFromEmbed`를 `true`(숨김) 또는 `false`(표시)로 전환
  3. 미션 목록 Redis 캐시 무효화 및 Embed 갱신
  4. 숨김 처리된 미션은 Embed에 표시되지 않으나, 웹 대시보드에서는 확인 가능
- **유효성 검사**:
  - 성공/실패 처리는 `IN_PROGRESS` 상태 미션에만 허용
  - 미션이 해당 guildId에 속하는지 검증
  - 존재하지 않는 미션 ID → 404 응답
- **오류 처리**:
  - 역할 부여 실패 (권한 부족, 역할 미존재): 미션 상태는 이미 갱신됨, 에러 메시지를 응답에 포함하여 반환
  - 강퇴 실패 (권한 부족, 멤버 미존재): 미션 상태는 이미 갱신됨, 에러 메시지를 응답에 포함하여 반환
  - DM 전송 실패: 조용히 무시하고 강퇴 진행

#### API 엔드포인트

  | Method | Path | 설명 |
  |--------|------|------|
  | `GET` | `/api/guilds/{guildId}/newbie/missions?status=&page=&pageSize=` | 미션 통합 조회 (status 없으면 전체, 페이지네이션 공통 적용) |
  | `POST` | `/api/guilds/{guildId}/newbie/missions/complete` | 미션 수동 성공 처리 |
  | `POST` | `/api/guilds/{guildId}/newbie/missions/fail` | 미션 수동 실패 처리 |
  | `POST` | `/api/guilds/{guildId}/newbie/missions/hide` | 미션 Embed 숨김 처리 |
  | `POST` | `/api/guilds/{guildId}/newbie/missions/unhide` | 미션 Embed 숨김 해제 |

**쿼리 파라미터 (`GET /missions`)**:

  | 파라미터 | 타입 | 필수 | 설명 |
  |----------|------|------|------|
  | `status` | `string` | 선택 | `IN_PROGRESS` \| `COMPLETED` \| `FAILED` \| `LEFT`. 생략 시 전체 상태 조회 |
  | `page` | `number` | 선택 | 페이지 번호. 기본값 `1` |
  | `pageSize` | `number` | 선택 | 페이지당 항목 수. 기본값 `10` |

#### 요청 본문

  **POST /missions/complete**:
  ```json
  {
    "missionId": 123,
    "roleId": "1234567890"  // 옵션, null이면 역할 부여 안함
  }
  ```

  **POST /missions/fail**:
  ```json
  {
    "missionId": 123,
    "kick": true,            // 옵션, 기본값 false
    "dmReason": "미션 미달성" // 옵션, kick=true일 때만 유효
  }
  ```

  **POST /missions/hide**:
  ```json
  {
    "missionId": 123
  }
  ```

  **POST /missions/unhide**:
  ```json
  {
    "missionId": 123
  }
  ```

#### 응답 형식

  **GET /missions**:
  ```json
  {
    "items": [{ "id", "guildId", "memberId", "memberName", "startDate", "endDate", "targetPlaytimeSec", "targetPlayCount", "status", "hiddenFromEmbed", "createdAt", "updatedAt" }],
    "total": 25,
    "page": 1,
    "pageSize": 10
  }
  ```

  **POST /missions/complete, /missions/fail**:
  ```json
  {
    "ok": true,
    "warning": "역할 부여에 실패했습니다: Missing Permissions"  // 옵션, Discord 작업 실패 시
  }
  ```

  **POST /missions/hide, /missions/unhide**:
  ```json
  { "ok": true }
  ```

- **길드별 독립 동작**

---

### F-WEB-NEWBIE-001: 신입 관리 설정 페이지

- **경로**: `/settings/guild/{guildId}/newbie`
- **위치**: 대시보드 > 서버 설정 > 신입 관리
- **접근 조건**: Discord OAuth 로그인 + 해당 서버 관리 권한

#### 탭 구성

| 탭 번호 | 탭 이름 | 대응 기능 |
|---------|---------|-----------|
| 1 | 환영인사 설정 | F-NEWBIE-001 |
| 2 | 미션 설정 | F-NEWBIE-002 |
| 3 | 모코코 사냥 설정 | F-NEWBIE-003 |
| 4 | 신입기간 설정 | F-NEWBIE-004 |

> 미션 수동 관리(F-NEWBIE-005)는 대시보드(`/dashboard/guild/{guildId}/newbie`)에서 제공한다. 설정 페이지에는 포함하지 않는다.

#### 탭 1: 환영인사 설정

| UI 요소 | 설명 |
|---------|------|
| 기능 활성화 토글 | 환영 메시지 전송 기능 ON/OFF |
| 채널 선택 드롭다운 | 환영 메시지를 보낼 텍스트 채널 선택 (서버 채널 목록) |
| Embed 제목 입력 | 환영 Embed 제목 (템플릿 변수 사용 가능) |
| Embed 설명 입력 (멀티라인) | 환영 Embed 본문 (템플릿 변수 사용 가능) |
| Embed 색상 선택 | HEX 색상 코드 입력 또는 컬러 피커 |
| 썸네일 이미지 URL 입력 | Embed 썸네일 이미지 URL |
| 템플릿 변수 안내 | `{username}`, `{memberCount}`, `{serverName}` 설명 인라인 표시 |
| 미리보기 패널 | 현재 설정 기준 Embed 모습 실시간 미리보기 |
| 저장 버튼 | 설정 내용을 API로 전송 |

#### 탭 2: 미션 설정

| UI 요소 | 설명 |
|---------|------|
| 기능 활성화 토글 | 미션 기능 ON/OFF |
| 미션 기간 입력 (숫자) | 신규 멤버 가입 후 미션 기간 (일수, 예: 7) |
| 목표 플레이타임 입력 (숫자) | 미션 완료 기준 최소 플레이타임 (시간 단위) |
| 목표 플레이횟수 입력 (숫자 + 활성화 체크박스) | 미션 달성 기준 목표 플레이횟수 (정수). 체크박스 OFF 시 NULL 저장 (비활성화, 플레이타임만으로 판정). 체크박스 ON 시 플레이타임 AND 플레이횟수 모두 달성해야 완료 |
| 플레이횟수 최소 참여시간 입력 (숫자 + 활성화 체크박스) | 플레이횟수 카운팅 시 유효 세션으로 인정하는 최소 참여시간 (분 단위). 체크박스 OFF 시 NULL 저장 (비활성화). 기본값 30 |
| 플레이횟수 시간 간격 입력 (숫자 + 활성화 체크박스) | 플레이횟수 카운팅 시 동일 1회로 병합하는 세션 간격 기준 (분 단위). 체크박스 OFF 시 NULL 저장 (비활성화). 기본값 30 |
| 알림 채널 선택 드롭다운 | 미션 현황 Embed를 표시할 채널 선택 |
| Embed 제목 입력 | 미션 현황 Embed 제목 |
| Embed 설명 입력 (멀티라인) | 미션 현황 Embed 설명 본문 |
| Embed 색상 선택 | 미션 현황 Embed 색상 (HEX 코드 입력 또는 컬러 피커) |
| 썸네일 이미지 URL 입력 | 미션 현황 Embed 썸네일 이미지 URL |
| 저장 버튼 | 설정 내용을 API로 전송 |

##### 템플릿 설정 섹션 (탭 2)

| UI 요소 | 설명 |
|---------|------|
| 제목 템플릿 입력 | Embed 제목 (`{totalCount}` 사용 가능) |
| 헤더 템플릿 입력 | description 최상단 요약 줄 (`{totalCount}`, `{inProgressCount}`, `{completedCount}`, `{failedCount}` 사용 가능) |
| 항목 템플릿 입력 (멀티라인) | 멤버별 미션 현황 한 줄 포맷. 사용 가능 변수 목록 인라인 표시 |
| 푸터 템플릿 입력 | Embed footer (`{updatedAt}` 사용 가능) |
| 상태 매핑 테이블 | 상태(진행중/완료/실패) × 이모지/텍스트 3행 입력 테이블 |
| 기본값 복원 버튼 | 각 필드를 기본값으로 일괄 복원 |
| 실시간 미리보기 패널 | 입력 시 debounce(300ms) 적용하여 실시간 Embed 미리보기 반영. 더미 데이터는 프론트에서 고정값 보유 |
| 사용 가능 변수 안내 | 각 템플릿 필드 하단에 해당 필드의 허용 변수 목록 표시 |

#### 탭 3: 모코코 사냥 설정

| UI 요소 | 설명 |
|---------|------|
| 기능 활성화 토글 | 모코코 사냥 기능 ON/OFF |
| **표시 방식 선택 드롭다운** | `Embed` / `Canvas` 선택. 기본값 `Embed`. 선택에 따라 탭 3 하단의 "Embed 설정" 또는 "Canvas 안내" 섹션을 조건부 렌더링한다 |
| 모코코 기준 일수 입력 (숫자) | 서버 가입 후 이 일수 이내인 멤버를 모코코로 판정. 1~365, 기본값 30 |
| 모코코도 사냥꾼 허용 토글 | `true`이면 신입(모코코)도 다른 신입의 사냥꾼이 될 수 있음. 기본값 `false` |
| 플레이횟수 최소 참여시간 입력 (숫자 + 활성화 체크박스) | 플레이횟수 카운팅 시 유효 세션으로 인정하는 최소 참여시간 (분 단위). 체크박스 OFF 시 NULL 저장 (비활성화). 기본값 30 |
| 플레이횟수 시간 간격 입력 (숫자 + 활성화 체크박스) | 플레이횟수 카운팅 시 동일 1회로 병합하는 세션 간격 기준 (분 단위). 체크박스 OFF 시 NULL 저장 (비활성화). 기본값 30 |
| 최소 동시접속 시간 입력 (숫자) | 유효 세션 인정 최소 동시접속 시간 (분). 기본값 10, 최솟값 1 |
| 세션당 점수 입력 (숫자) | 유효 세션 1회당 점수. 기본값 10. 0이면 비활성화 |
| 분당 점수 입력 (숫자) | 채널 기반 실제 동시접속 1분당 점수. 기본값 1. 0이면 비활성화 |
| 고유 모코코당 점수 입력 (숫자) | 도움준 고유 모코코 1명당 보너스 점수. 기본값 5. 0이면 비활성화 |
| 리셋 주기 선택 드롭다운 | `없음(누적)` / `매월` / `사용자 지정(N일)`. 기본값 없음 |
| 리셋 간격 입력 (숫자) | 리셋 주기가 사용자 지정일 때 N일마다 초기화. 리셋 주기가 다른 값이면 비활성화 |
| 순위 표시 채널 선택 드롭다운 | 모코코 사냥 TOP N Embed를 표시할 채널 선택 |
| 자동 갱신 간격 입력 (숫자) | Embed 자동 갱신 주기 (분 단위) |
| Embed 제목 입력 | 모코코 순위 Embed 제목 |
| Embed 설명 입력 (멀티라인) | 모코코 순위 Embed 설명 본문 |
| Embed 색상 선택 | 모코코 순위 Embed 색상 (HEX 코드 입력 또는 컬러 피커) |
| 썸네일 이미지 URL 입력 | 모코코 순위 Embed 썸네일 이미지 URL |
| 저장 버튼 | 설정 내용을 API로 전송 |

##### 템플릿 설정 섹션 (탭 3) — Embed 모드 전용

표시 방식이 `Embed`일 때만 렌더링된다.

| UI 요소 | 설명 |
|---------|------|
| 제목 템플릿 입력 | Embed 제목 (`{rank}`, `{hunterName}` 사용 가능) |
| 본문 템플릿 입력 (멀티라인) | 사냥꾼 1명의 페이지 전체 구조. `{score}`, `{totalMinutes}`, `{sessionCount}`, `{uniqueNewbieCount}`, `{mocoList}` 사용 가능. `{mocoList}` 위치에 항목 템플릿이 반복 삽입됨 |
| 항목 템플릿 입력 | 도움받은 모코코 한 줄 포맷 (`{newbieName}`, `{minutes}`, `{sessions}` 사용 가능) |
| 푸터 템플릿 입력 | Embed footer (`{currentPage}`, `{totalPages}`, `{interval}`, `{periodStart}`, `{periodEnd}` 사용 가능) |
| 점수 산정 안내 템플릿 입력 (멀티라인) | Embed 본문 하단 점수 산정 방식 안내. `{scorePerSession}`, `{scorePerMinute}`, `{scorePerUnique}`, `{minCoPresence}` 사용 가능. 빈 문자열이면 안내 미표시 |
| 기본값 복원 버튼 | 각 필드를 기본값으로 일괄 복원 |
| 실시간 미리보기 패널 | 입력 시 debounce(300ms) 적용하여 실시간 Embed 미리보기 반영. 더미 데이터는 프론트에서 고정값 보유 |
| 사용 가능 변수 안내 | 각 템플릿 필드 하단에 해당 필드의 허용 변수 목록 표시 |

##### Canvas 안내 섹션 (탭 3) — Canvas 모드 전용

표시 방식이 `Canvas`일 때만 렌더링된다.

| UI 요소 | 설명 |
|---------|------|
| Canvas 모드 안내 텍스트 | "Canvas 모드에서는 순위를 이미지 테이블로 표시합니다. 한 페이지에 10명이 표시되며, 사용자는 '내 순위' 버튼으로 개인 상세를 확인할 수 있습니다." |
| Canvas 미리보기 이미지 | (선택) 샘플 렌더링 이미지 정적 표시 (더미 데이터 기반, 실시간 렌더링 아님) |

#### 탭 4: 신입기간 설정

| UI 요소 | 설명 |
|---------|------|
| 기능 활성화 토글 | 신입기간 역할 자동관리 ON/OFF |
| 신입기간 입력 (숫자) | 역할 부여 기간 (일수) |
| 역할 선택 드롭다운 | 자동 부여할 Discord 역할 선택 (서버 역할 목록) |
| 저장 버튼 | 설정 내용을 API로 전송 |

#### 저장 동작 (공통)

1. 각 탭의 기본 설정을 `POST /api/guilds/{guildId}/newbie/config`로 전송
2. 백엔드에서 `NewbieConfig` DB 저장 및 Redis 캐시 갱신
3. 저장 성공 시 토스트 알림 표시

#### 저장 동작 (템플릿)

1. 탭 2(미션 설정) 템플릿 설정을 `POST /api/guilds/{guildId}/newbie/mission-template`로 전송
2. 탭 3(모코코 사냥 설정) 템플릿 설정을 `POST /api/guilds/{guildId}/newbie/moco-template`로 전송
3. 백엔드에서 허용되지 않는 변수 포함 여부 유효성 검사 후 `NewbieMissionTemplate` / `NewbieMocoTemplate` DB upsert
4. 유효성 검사 실패 시 400 응답, 오류 필드 및 허용 변수 목록 반환
5. 저장 성공 시 토스트 알림 표시

---

## 데이터 모델

### NewbieConfig (`newbie_config`)

길드별 신규사용자 관리 설정을 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `welcomeEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 환영인사 기능 활성화 여부 |
| `welcomeChannelId` | `varchar` | NULLABLE | 환영 메시지 전송 채널 ID |
| `welcomeEmbedTitle` | `varchar` | NULLABLE | Embed 제목 (템플릿 변수 포함 가능) |
| `welcomeEmbedDescription` | `text` | NULLABLE | Embed 설명 (템플릿 변수 포함 가능) |
| `welcomeEmbedColor` | `varchar` | NULLABLE | Embed 색상 (HEX, 예: `#5865F2`) |
| `welcomeEmbedThumbnailUrl` | `varchar` | NULLABLE | Embed 썸네일 이미지 URL |
| `missionEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 미션 기능 활성화 여부 |
| `missionDurationDays` | `int` | NULLABLE | 미션 기간 (일수) |
| `missionTargetPlaytimeHours` | `int` | NULLABLE | 미션 목표 플레이타임 (시간) |
| `missionTargetPlayCount` | `int` | NULLABLE | 미션 달성 기준 목표 플레이횟수. NULL이면 플레이횟수 기준 비활성화 (플레이타임만으로 판정). 값이 있으면 플레이타임과 플레이횟수 모두 달성해야 `COMPLETED` |
| `playCountMinDurationMin` | `int` | NULLABLE | 플레이횟수 카운팅 최소 참여시간 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1 |
| `playCountIntervalMin` | `int` | NULLABLE | 플레이횟수 카운팅 시간 간격 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1 |
| `missionNotifyChannelId` | `varchar` | NULLABLE | 미션 현황 알림 채널 ID |
| `missionNotifyMessageId` | `varchar` | NULLABLE | 미션 현황 Embed 메시지 ID (Discord message ID) |
| `missionEmbedTitle` | `varchar` | NULLABLE | 미션 현황 Embed 제목 |
| `missionEmbedDescription` | `text` | NULLABLE | 미션 현황 Embed 설명 |
| `missionEmbedColor` | `varchar` | NULLABLE | 미션 현황 Embed 색상 (HEX, 예: `#5865F2`) |
| `missionEmbedThumbnailUrl` | `varchar` | NULLABLE | 미션 현황 Embed 썸네일 이미지 URL |
| `mocoEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 모코코 사냥 기능 활성화 여부 |
| `mocoNewbieDays` | `int` | NOT NULL, DEFAULT `30` | 모코코 기준 일수. 서버 가입 후 이 일수 이내인 멤버를 모코코로 판정. 1~365 |
| `mocoAllowNewbieHunter` | `boolean` | NOT NULL, DEFAULT `false` | 모코코도 사냥꾼 허용 여부. `true`이면 신입도 다른 신입의 사냥꾼이 될 수 있음 |
| `mocoPlayCountMinDurationMin` | `int` | NULLABLE | 모코코 사냥 플레이횟수 카운팅 최소 참여시간 기준 (분). NULL이면 비활성화 (모든 세션 인정). 기본값 30, 최솟값 1 |
| `mocoPlayCountIntervalMin` | `int` | NULLABLE | 모코코 사냥 플레이횟수 카운팅 시간 간격 기준 (분). NULL이면 비활성화 (모든 세션 독립 카운트). 기본값 30, 최솟값 1 |
| `mocoMinCoPresenceMin` | `int` | NOT NULL, DEFAULT `10` | 유효 세션 인정 최소 동시접속 시간(분). 이 시간 미만 세션은 무효 처리. 최솟값 1 |
| `mocoScorePerSession` | `int` | NOT NULL, DEFAULT `10` | 유효 세션 1회당 점수. 0이면 세션 점수 비활성화 |
| `mocoScorePerMinute` | `int` | NOT NULL, DEFAULT `1` | 채널 기반 실제 동시접속 1분당 점수. 0이면 시간 점수 비활성화 |
| `mocoScorePerUnique` | `int` | NOT NULL, DEFAULT `5` | 도움준 고유 모코코 1명당 보너스 점수. 0이면 다양성 점수 비활성화 |
| `mocoResetPeriod` | `enum('NONE','MONTHLY','CUSTOM')` | NOT NULL, DEFAULT `'NONE'` | 순위 리셋 주기. `NONE`: 누적, `MONTHLY`: 매월 1일, `CUSTOM`: N일마다 |
| `mocoResetIntervalDays` | `int` | NULLABLE | `CUSTOM` 리셋 시 초기화 간격(일수). `mocoResetPeriod = CUSTOM`일 때만 사용 |
| `mocoCurrentPeriodStart` | `varchar` | NULLABLE | 현재 집계 기간 시작일 (`YYYYMMDD`). 리셋 시 갱신 |
| `mocoRankChannelId` | `varchar` | NULLABLE | 모코코 사냥 순위 표시 채널 ID |
| `mocoRankMessageId` | `varchar` | NULLABLE | 모코코 사냥 순위 Embed 메시지 ID |
| `mocoAutoRefreshMinutes` | `int` | NULLABLE | 모코코 사냥 순위 자동 갱신 간격 (분) |
| `mocoEmbedTitle` | `varchar` | NULLABLE | 모코코 순위 Embed 제목 |
| `mocoEmbedDescription` | `text` | NULLABLE | 모코코 순위 Embed 설명 |
| `mocoEmbedColor` | `varchar` | NULLABLE | 모코코 순위 Embed 색상 (HEX, 예: `#5865F2`) |
| `mocoEmbedThumbnailUrl` | `varchar` | NULLABLE | 모코코 순위 Embed 썸네일 이미지 URL |
| `mocoDisplayMode` | `enum('EMBED','CANVAS')` | NOT NULL, DEFAULT `'EMBED'` | 모코코 순위 표시 방식. `EMBED`: 기존 Discord Embed(1명/페이지), `CANVAS`: Canvas 이미지 기반 랭킹 테이블(10명/페이지) |
| `roleEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 신입기간 역할 자동관리 활성화 여부 |
| `roleDurationDays` | `int` | NULLABLE | 신입기간 (일수) |
| `newbieRoleId` | `varchar` | NULLABLE | 자동 부여할 Discord 역할 ID |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- `UNIQUE(guildId)` — 길드당 하나의 설정

---

### NewbieMissionTemplate (`newbie_mission_template`)

미션 Embed 표시 형식을 길드별로 커스터마이징하는 템플릿을 저장한다. `NewbieConfig`와 별도 테이블로 분리되어 있으며, 레코드가 없으면 F-NEWBIE-002에 정의된 기본값을 사용한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `titleTemplate` | `varchar` | NULLABLE | Embed 제목 템플릿. 허용 변수: `{totalCount}` |
| `headerTemplate` | `text` | NULLABLE | description 최상단 헤더 템플릿. 허용 변수: `{totalCount}`, `{inProgressCount}`, `{completedCount}`, `{failedCount}` |
| `itemTemplate` | `text` | NULLABLE | 멤버별 미션 현황 항목 템플릿 (반복 렌더링). 허용 변수: `{username}`, `{mention}`, `{startDate}`, `{endDate}`, `{statusEmoji}`, `{statusText}`, `{playtimeHour}`, `{playtimeMin}`, `{playtimeSec}`, `{playtime}`, `{playCount}`, `{targetPlaytime}`, `{targetPlayCount}`, `{daysLeft}` |
| `footerTemplate` | `varchar` | NULLABLE | Embed footer 템플릿. 허용 변수: `{updatedAt}` |
| `statusMapping` | `json` | NULLABLE | 상태별 이모지·텍스트 매핑. 형식: `{"IN_PROGRESS":{"emoji":"🟡","text":"진행중"},"COMPLETED":{"emoji":"✅","text":"완료"},"FAILED":{"emoji":"❌","text":"실패"}}` |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- `UNIQUE(guildId)` — 길드당 하나의 템플릿

---

### NewbieMocoTemplate (`newbie_moco_template`)

모코코 사냥 Embed 표시 형식을 길드별로 커스터마이징하는 템플릿을 저장한다. `NewbieConfig`와 별도 테이블로 분리되어 있으며, 레코드가 없으면 F-NEWBIE-003에 정의된 기본값을 사용한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `titleTemplate` | `varchar` | NULLABLE | Embed 제목 템플릿. 허용 변수: `{rank}`, `{hunterName}` |
| `bodyTemplate` | `text` | NULLABLE | 사냥꾼 1명 페이지 전체 본문 템플릿. `{mocoList}` 위치에 항목 템플릿 반복 삽입. 허용 변수: `{score}`, `{totalMinutes}`, `{sessionCount}`, `{uniqueNewbieCount}`, `{mocoList}` |
| `itemTemplate` | `varchar` | NULLABLE | 도움받은 모코코 한 줄 항목 템플릿. 허용 변수: `{newbieName}`, `{minutes}`, `{sessions}` |
| `footerTemplate` | `varchar` | NULLABLE | Embed footer 템플릿. 허용 변수: `{currentPage}`, `{totalPages}`, `{interval}`, `{periodStart}`, `{periodEnd}` |
| `scoringTemplate` | `text` | NULLABLE | 점수 산정 안내 템플릿. Embed 본문 하단에 표시. 빈 문자열이면 미표시. 허용 변수: `{scorePerSession}`, `{scorePerMinute}`, `{scorePerUnique}`, `{minCoPresence}` |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- `UNIQUE(guildId)` — 길드당 하나의 템플릿

---

### NewbieMission (`newbie_mission`)

신규사용자별 미션 진행 상태를 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `memberId` | `varchar` | NOT NULL | 디스코드 유저 ID |
| `memberName` | `varchar` | NULLABLE | 디스코드 서버 닉네임. 미션 생성/상태변경 시 저장·갱신. 웹 대시보드 이력에서 Discord API 없이 표시 |
| `startDate` | `varchar` | NOT NULL | 미션 시작일 (`YYYYMMDD`) |
| `endDate` | `varchar` | NOT NULL | 미션 마감일 (`YYYYMMDD`) |
| `targetPlaytimeSec` | `int` | NOT NULL | 목표 플레이타임 (초 단위로 저장) |
| `targetPlayCount` | `int` | NULLABLE | 목표 플레이횟수. 미션 생성 시 `NewbieConfig.missionTargetPlayCount` 값을 복사하여 저장. NULL이면 플레이횟수 기준 비활성화 |
| `status` | `enum('IN_PROGRESS','COMPLETED','FAILED','LEFT')` | NOT NULL, DEFAULT `'IN_PROGRESS'` | 미션 상태 |
| `hiddenFromEmbed` | `boolean` | NOT NULL, DEFAULT `false` | Embed 표시 제외 여부. `true`이면 Discord Embed에서 숨김 처리됨 (F-NEWBIE-005) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- `IDX_newbie_mission_guild_member` — `(guildId, memberId)` — 멤버별 미션 조회
- `IDX_newbie_mission_guild_status` — `(guildId, status)` — 길드별 진행중 미션 조회
- `IDX_newbie_mission_guild_visible` — `(guildId, hiddenFromEmbed)` — Embed 표시 대상 미션 조회 (F-NEWBIE-005)
- `IDX_newbie_mission_end_date` — `(endDate, status)` — 만료 예정 미션 스케줄러 조회

---

### NewbiePeriod (`newbie_period`)

신입기간 역할 관리 이력을 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `memberId` | `varchar` | NOT NULL | 디스코드 유저 ID |
| `startDate` | `varchar` | NOT NULL | 신입기간 시작일 (`YYYYMMDD`) |
| `expiresDate` | `varchar` | NOT NULL | 신입기간 만료일 (`YYYYMMDD`) |
| `isExpired` | `boolean` | NOT NULL, DEFAULT `false` | 만료 처리 완료 여부 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- `IDX_newbie_period_guild_member` — `(guildId, memberId)` — 멤버별 이력 조회
- `IDX_newbie_period_expires` — `(expiresDate, isExpired)` — 만료 스케줄러 조회

---

### MocoHuntingSession (`moco_hunting_session`)

사냥꾼과 모코코의 동시접속 세션 이력을 영구 저장한다. 세션 종료 시 유효성 판정 후 기록된다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `hunterId` | `varchar` | NOT NULL | 사냥꾼 디스코드 유저 ID |
| `channelId` | `varchar` | NOT NULL | 동시접속이 발생한 음성 채널 ID |
| `startedAt` | `timestamp` | NOT NULL | 동시접속 시작 시각 |
| `endedAt` | `timestamp` | NULLABLE | 동시접속 종료 시각. 진행중이면 NULL |
| `durationMin` | `int` | NULLABLE | 동시접속 시간(분). 종료 시 계산 |
| `newbieMemberIds` | `json` | NOT NULL | 세션 중 동시접속한 모코코 memberId 배열 (예: `["id1","id2"]`) |
| `isValid` | `boolean` | NOT NULL, DEFAULT `false` | 유효 세션 여부. `durationMin >= mocoMinCoPresenceMin`일 때 `true` |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |

**인덱스**:
- `IDX_moco_session_guild_hunter` — `(guildId, hunterId)` — 사냥꾼별 세션 조회
- `IDX_moco_session_guild_started` — `(guildId, startedAt)` — 기간별 세션 조회
- `IDX_moco_session_guild_valid` — `(guildId, isValid)` — 유효 세션 필터링

---

### MocoHuntingDaily (`moco_hunting_daily`)

사냥꾼의 일별 집계 데이터를 저장한다. 점수 재계산 및 기간별 순위 산출에 사용된다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `hunterId` | `varchar` | PK | 사냥꾼 디스코드 유저 ID |
| `date` | `varchar(8)` | PK | 날짜 (`YYYYMMDD`) |
| `channelMinutes` | `int` | NOT NULL, DEFAULT `0` | 당일 채널 기반 실제 사냥 시간(분). 모코코 수 무관 |
| `sessionCount` | `int` | NOT NULL, DEFAULT `0` | 당일 유효 세션 횟수 |
| `uniqueNewbieCount` | `int` | NOT NULL, DEFAULT `0` | 당일 도움준 고유 모코코 수 |
| `score` | `int` | NOT NULL, DEFAULT `0` | 당일 점수 (점수 공식 적용 결과) |

**인덱스**:
- PK: `(guildId, hunterId, date)` — 사냥꾼별 일별 집계
- `IDX_moco_daily_guild_date` — `(guildId, date)` — 기간별 순위 조회

---

### MocoHunting (Redis — 실시간 캐시)

Redis는 실시간 순위 조회와 진행중 세션 추적에 사용된다. 영구 데이터는 PostgreSQL에 저장한다.

| 키 패턴 | 타입 | 설명 |
|---------|------|------|
| `newbie:moco:rank:{guildId}` | `Sorted Set` | 사냥꾼 총 점수 순위 캐시 (score = 총점) |
| `newbie:moco:detail:{guildId}:{hunterId}` | `Hash` | 사냥꾼별 모코코 개별 동시접속 시간(분). 참고용, 순위 미반영 |
| `newbie:moco:session:{guildId}:{hunterId}` | `Hash` | 진행중인 사냥 세션 추적 (startedAt, channelId, newbieIds, accMinutes) |
| `newbie:moco:stats:{guildId}:{hunterId}` | `Hash` | 사냥꾼 집계 캐시 (totalMinutes, sessionCount, uniqueNewbieCount, score) |

**Sorted Set 구조** (`newbie:moco:rank:{guildId}`):
```
ZADD newbie:moco:rank:{guildId} {score} {hunterId}
```
- score: 점수 공식으로 산출된 총점 (기간 리셋 시 초기화)

**진행중 세션 Hash** (`newbie:moco:session:{guildId}:{hunterId}`):
```
HSET newbie:moco:session:{guildId}:{hunterId}
  startedAt {ISO timestamp}
  channelId {channelId}
  newbieIds {JSON array}
  accMinutes {누적분}
```
- 세션 종료 시 유효성 판정 후 DB 저장 및 키 삭제

---

## Redis 키 구조

| 키 패턴 | TTL | 설명 |
|---------|-----|------|
| `newbie:config:{guildId}` | 1시간 | NewbieConfig 설정 캐시 |
| `newbie:mission:active:{guildId}` | 30분 | 진행중 미션 목록 캐시 |
| `newbie:period:active:{guildId}` | 1시간 | 신입기간 활성 멤버 집합 캐시 (`Set<memberId>`) |
| `newbie:moco:rank:{guildId}` | 없음 | 사냥꾼 총 점수 순위 Sorted Set (리셋 시 초기화) |
| `newbie:moco:detail:{guildId}:{hunterId}` | 없음 | 사냥꾼별 모코코 개별 동시접속 시간 Hash (참고용) |
| `newbie:moco:session:{guildId}:{hunterId}` | 12시간 | 진행중 사냥 세션 추적 Hash |
| `newbie:moco:stats:{guildId}:{hunterId}` | 없음 | 사냥꾼 집계 캐시 Hash (리셋 시 초기화) |
| `newbie:moco:canvas:{guildId}:rank:{page}` | 30초 | Canvas 모드 랭킹 보드 렌더링 캐시 (PNG 바이트) |
| `newbie:moco:canvas:{guildId}:detail:{hunterId}` | 30초 | Canvas 모드 개인 상세 렌더링 캐시 (PNG 바이트) |

**TTL 정책**:

| 대상 | TTL | 사유 |
|------|-----|------|
| 설정 캐시 | 1시간 | 설정 변경 빈도 낮음, 저장 시 명시적 갱신 |
| 미션 목록 캐시 | 30분 | 갱신 버튼 클릭 시 명시적 갱신 |
| 신입기간 활성 멤버 | 1시간 | 스케줄러 실행 시 갱신 |
| 모코코 순위/집계 캐시 | 없음 | 영구 누적. 기간 리셋 시 `rank`, `stats`, `detail` 키 일괄 삭제 |
| 진행중 세션 | 12시간 | 비정상 종료 대비 자동 만료. 정상 시 세션 종료 시점에 삭제 |
| Canvas 렌더링 캐시 | 30초 | 렌더링 비용 절감. `MocoScheduler` 틱 완료 시 해당 guildId 전체 삭제 |

---

## Voice 도메인 연계

Newbie 도메인은 voice 도메인과 다음 지점에서 연계된다.

| 연계 지점 | 방향 | 설명 |
|-----------|------|------|
| `VoiceDailyEntity` 조회 | newbie → voice | 미션 플레이타임 측정 시 `channelDurationSec` 합산 |
| `VoiceChannelHistory` 조회 | newbie → voice | 미션 플레이횟수 측정 시 세션 수 집계 |
| `voiceStateUpdate` 이벤트 | voice → newbie | 모코코 사냥 세션 추적을 위한 동시 접속 감지 |
| `VoiceExcludedChannelService` 조회 | newbie → voice | 모코코 사냥 시 제외 채널 필터링 (F-VOICE-016 연계) |

**플레이타임 조회 쿼리 조건**:
```
SELECT SUM(channelDurationSec)
FROM voice_daily
WHERE guildId = :guildId
  AND userId = :memberId
  AND date BETWEEN :startDate AND :endDate
  AND channelId != 'GLOBAL'
```

**플레이횟수 조회 쿼리 조건**:

기본 후보 세션 조회:
```
SELECT vch.joinAt, vch.leavedAt,
       TIMESTAMPDIFF(MINUTE, vch.joinAt, vch.leavedAt) AS durationMin
FROM voice_channel_history vch
JOIN member m ON m.id = vch.memberId
WHERE m.discordMemberId = :memberId
  AND vch.joinAt BETWEEN :startDatetime AND :endDatetime
ORDER BY vch.joinAt ASC
```

조회 후 애플리케이션 레이어에서 두 옵션을 순차 적용하여 유효 횟수를 산출한다:

1. **최소 참여시간 필터** (`playCountMinDurationMin` NOT NULL): `durationMin < playCountMinDurationMin`인 세션 제거
2. **시간 간격 병합** (`playCountIntervalMin` NOT NULL): 앞 세션의 `joinAt`으로부터 `playCountIntervalMin`분 이내에 시작된 후속 세션을 동일 1회로 병합. 병합 기준 시각은 앞 세션의 `joinAt` 기준.

두 옵션이 모두 NULL이면 후보 세션 전체 수(`COUNT(*)`)를 그대로 사용한다.
