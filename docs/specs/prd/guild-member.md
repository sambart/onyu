# Guild Member 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

디스코드 길드(서버) 단위의 멤버 정보를 PostgreSQL에 중앙 저장하고, Discord Gateway 이벤트 기반으로 실시간 동기화하는 도메인이다.

현재 닉네임 조회를 위해 `fetchGuildMember()` Discord REST API를 호출하는 빈도가 높아 API Rate Limit 부하가 발생한다. `guild_member` 테이블을 신설하여 닉네임·봇 여부·가입일·활성 여부를 DB에서 직접 조회하도록 전환하고, 기존 `member` 테이블(guild-scope 없는 단순 userId-nickname 매핑)을 완전히 대체한다.

기존 `member` 테이블과의 차이점: `member`는 `discordMemberId` 기준 전역 레코드인 반면, `guild_member`는 `(guildId, userId)` 복합 유니크 키로 **길드 범위**를 갖는다. 이를 통해 서버마다 다른 서버 닉네임(nick), 가입일, 활동 상태를 독립적으로 관리할 수 있다.

## 관련 모듈

- `apps/api/src/guild-member/` — 신규 도메인 핵심 로직
  - `guild-member.module.ts`
  - `guild-member.service.ts` — upsert, deactivate, find 비즈니스 로직
  - `infrastructure/guild-member.orm-entity.ts` — TypeORM 엔티티
  - `infrastructure/guild-member.repository.ts` — DB 저장소
- `apps/bot/src/event/` — Discord Gateway 이벤트 핸들러 (clientReady, guildCreate, guildMemberAdd/Update/Remove, userUpdate)
- `apps/api/src/member/` — 기존 member 도메인 (마이그레이션 완료 후 폐기)

## 아키텍처

```
Discord Gateway Events
    │
    ├── clientReady        ──► [GuildMemberSyncService]  → 전체 길드 bulk upsert (초기 동기화)
    ├── guildCreate        ──► [GuildMemberSyncService]  → 해당 길드 bulk upsert
    ├── guildMemberAdd     ──► [GuildMemberService]      → upsert (isActive=true)
    ├── guildMemberUpdate  ──► [GuildMemberService]      → displayName 조건부 UPDATE
    ├── userUpdate         ──► [GuildMemberService]      → nick=null인 행 displayName 갱신
    └── guildMemberRemove  ──► [GuildMemberService]      → isActive = false

[GuildMemberService]
    │
    └──► [GuildMemberRepository]  → PostgreSQL guild_member 테이블 CRUD

소비자 도메인 (DB SELECT 전환)
    ├── inactive-member  → displayName, isActive, joinedAt, isBot DB 조회
    ├── newbie           → displayName, isActive, isBot, joinedAt DB 조회
    ├── status-prefix    → displayName DB 조회
    └── voice            → MemberService 대신 GuildMemberService 사용
```

---

## 기능 상세

### F-GUILD-MEMBER-001: 초기 동기화 (clientReady)

- **트리거**: 봇이 Discord Gateway에 연결 완료 (`clientReady` 이벤트)
- **동작**:
  1. 봇이 참여한 모든 길드 목록을 순회
  2. 각 길드에 대해 Discord Gateway `guild.members.fetch({ withPresences: false })`로 전체 멤버 조회
  3. 각 멤버를 `guild_member` 테이블에 bulk upsert (ON CONFLICT (guildId, userId) DO UPDATE)
  4. upsert 시 갱신 컬럼: `displayName`, `username`, `avatarUrl`, `isBot`, `joinedAt`, `isActive=true`, `updatedAt`
- **전제 조건**: `GUILD_MEMBERS` Privileged Gateway Intent 활성화 (이미 활성화됨)
- **제약**:
  - 멤버 수가 많은 길드(1000명+)는 페이지네이션 fetch 사용
  - 봇 유저도 `isBot=true`로 함께 저장 (소비자 도메인에서 필터링 용도)
- **오류 처리**: 개별 길드 fetch 실패 시 로그 기록 후 다음 길드 처리 계속 진행

### F-GUILD-MEMBER-002: 신규 길드 동기화 (guildCreate)

- **트리거**: 봇이 새 길드에 추가됨 (`guildCreate` 이벤트)
- **동작**:
  1. 이벤트에서 받은 `Guild` 객체로 전체 멤버 fetch
  2. 해당 길드의 모든 멤버를 bulk upsert (F-GUILD-MEMBER-001과 동일 로직)
- **오류 처리**: fetch 실패 시 경고 로그, 이후 `guildMemberAdd` 이벤트로 점진적 누적

### F-GUILD-MEMBER-003: 멤버 입장 (guildMemberAdd)

- **트리거**: 신규 멤버가 길드에 참여 (`guildMemberAdd` 이벤트)
- **동작**:
  1. `displayName` 결정: `member.nick ?? member.user.globalName ?? member.user.username`
  2. `guild_member` 테이블에 upsert
     - 신규: INSERT (isActive=true, joinedAt=이벤트 joinedAt)
     - 기존(재입장): UPDATE (isActive=true, displayName 갱신, joinedAt 갱신)
- **제약**: `member.user`가 null인 경우 처리 중단 및 경고 로그

### F-GUILD-MEMBER-004: 닉네임 변경 (guildMemberUpdate)

- **트리거**: 길드 멤버 정보 갱신 (`guildMemberUpdate` 이벤트)
- **동작**:
  1. 이전(`oldMember`)과 현재(`newMember`)의 displayName을 비교
  2. displayName이 변경된 경우에만 `UPDATE guild_member SET displayName=?, updatedAt=now() WHERE guildId=? AND userId=?`
  3. 변경이 없으면 DB 접근 생략 (불필요한 UPDATE 방지)
- **displayName 결정 로직**: `member.nick ?? member.user.globalName ?? member.user.username`
- **제약**: `avatarUrl` 변경은 이 이벤트에서 함께 갱신 (avatarUrl이 다를 경우)

### F-GUILD-MEMBER-005: 전역 프로필 변경 (userUpdate)

- **트리거**: 유저가 Discord 전역 프로필 변경 (`userUpdate` 이벤트)
- **동작**:
  1. `nick`(서버 닉네임)이 null인 행만 영향을 받음 — 서버 닉네임이 설정된 경우 전역 username/globalName 변경은 displayName에 반영되지 않음
  2. `SELECT * FROM guild_member WHERE userId=? AND nick IS NULL` 패턴으로 대상 행 조회
  3. 대상 행에 대해 `displayName = newUser.globalName ?? newUser.username`으로 UPDATE
- **제약**: `userUpdate` 이벤트는 봇이 참여한 길드의 멤버만 수신됨. nick 저장 여부는 `guildMemberUpdate` 이벤트의 `nick` 컬럼에서 관리

### F-GUILD-MEMBER-006: 멤버 퇴장 (guildMemberRemove)

- **트리거**: 멤버가 길드에서 퇴장/강퇴 (`guildMemberRemove` 이벤트)
- **동작**:
  1. `UPDATE guild_member SET isActive=false, updatedAt=now() WHERE guildId=? AND userId=?`
  2. 레코드를 삭제하지 않고 `isActive=false`로 마킹하여 이력 보존
- **소비자 동작**: `isActive=false` 멤버는 비활동 분류 대상에서 제외, 신규사용자 미션 탈퇴 감지에 활용

### F-GUILD-MEMBER-007: 멤버 정보 조회 (소비자 API)

- **트리거**: 다른 도메인에서 멤버 displayName, isBot, joinedAt, isActive 조회 필요 시
- **동작**: `GuildMemberService`의 단일/다수 조회 메서드를 통해 DB SELECT 수행
- **제공 메서드**:

  | 메서드 | 설명 |
  |--------|------|
  | `findByUserId(guildId, userId)` | 단일 멤버 조회 |
  | `findByUserIds(guildId, userIds)` | 복수 멤버 조회 (Map<userId, GuildMember> 반환) |
  | `findActiveMembers(guildId)` | isActive=true 전체 멤버 조회 |
  | `findActiveMembersExcludingBots(guildId)` | isBot=false && isActive=true 조회 |
  | `findByJoinedAfter(guildId, date)` | joinedAt 이후 가입한 멤버 조회 |

### F-GUILD-MEMBER-008: 기존 member 테이블 폐기 및 마이그레이션

- **목적**: `guild_member`가 `member`의 완전 상위호환이므로 `member` 테이블 제거
- **마이그레이션 절차**:
  1. `guild_member` 테이블 생성 및 초기 동기화 완료 확인
  2. `voice_channel_history` 테이블의 FK `memberId` → `guild_member.id`로 재지정
     - 기존 `member.discordMemberId` 기준으로 `guild_member` PK 매핑
     - `voice_channel_history`에 `guildId` 컬럼 추가 (FK 재지정을 위해 필요)
  3. `MemberService` → `GuildMemberService` 교체 (voice 도메인 입장 처리)
  4. 데이터 정합성 검증 후 `member` 테이블 DROP
- **제약**: 마이그레이션 스크립트는 TypeORM Migration 파일로 작성, `synchronize: false` 유지

### F-GUILD-MEMBER-009: Discord API 호출 DB 조회 전환

기존에 Discord REST API를 호출하던 닉네임·봇 여부·가입일 조회를 `guild_member` DB 조회로 대체한다.

- **전환 대상**:

  | 도메인 | 기존 방식 | 전환 후 |
  |--------|-----------|---------|
  | inactive-member | `fetchMemberDisplayNames()` — Discord REST 개별 호출 | `GuildMemberService.findByUserIds()` DB SELECT |
  | newbie (mission) | `MissionDiscordPresenter.fetchMemberDisplayName()` | `GuildMemberService.findByUserId()` DB SELECT |
  | newbie (mission) | `MissionService.enrichMissions()` 닉네임 조회 | `GuildMemberService.findByUserIds()` DB SELECT |
  | newbie (mission) | `fetchMemberNickname()` 탈퇴 감지 | `guild_member.isActive` 확인 |
  | newbie (mission) | `checkMemberExists()` 재입장 여부 | `guild_member.isActive` 확인 |
  | newbie (mission) | `fetchGuildMembers()` 봇 감지 | `guild_member.isBot` 확인 |
  | newbie (moco) | `MocoMemberDiscordAdapter.getNewbieIds()` | `GuildMemberService.findByJoinedAfter()` + isBot 필터 |
  | newbie (moco) | `MocoMemberDiscordAdapter.isValidHunter()` | `guild_member.joinedAt + isBot` 확인 |
  | newbie (moco) | `MocoDiscordPresenter.fetchDisplayNames()` | `GuildMemberService.findByUserIds()` (Redis 캐시 불필요) |
  | status-prefix | `StatusPrefixDiscordAdapter.fetchMember()` 닉네임 조회 | `GuildMemberService.findByUserId()` DB SELECT |

- **Discord API 호출 유지 대상**:

  | 대상 | 유지 사유 |
  |------|-----------|
  | `InactiveMemberService.classifyGuild()` | `excludedRoleIds` 필터링에 멤버 roles 정보 필요. 매일 자정 1회 `fetchAllGuildMembers` 호출 유지. 이 시점에 displayName도 DB 갱신 |
  | `StatusPrefixDiscordAdapter.setNickname()` | 닉네임 변경 액션은 Discord API 필수 |
  | DM 발송 | Discord DM API 필수 |
  | 역할 부여/제거 | Discord Role API 필수 |

---

## 데이터 모델

### GuildMember (guild_member)

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | BIGSERIAL | PK | 내부 PK |
| guildId | varchar | NOT NULL | 디스코드 길드(서버) ID |
| userId | varchar | NOT NULL | 디스코드 유저 ID |
| displayName | varchar | NOT NULL | 표시 닉네임 (nick > globalName > username) |
| username | varchar | NOT NULL | Discord 계정명 (고유 식별자) |
| nick | varchar | nullable | 서버 닉네임 (null이면 전역 이름 사용) |
| avatarUrl | varchar | nullable | 아바타 URL (서버 아바타 우선, 없으면 전역 아바타) |
| isBot | boolean | NOT NULL, DEFAULT false | 봇 계정 여부 |
| joinedAt | timestamp | nullable | 길드 가입 시각 (UTC) |
| isActive | boolean | NOT NULL, DEFAULT true | 현재 서버 재적 여부 (퇴장 시 false) |
| createdAt | timestamp | NOT NULL, DEFAULT now() | 레코드 생성 시각 |
| updatedAt | timestamp | NOT NULL, DEFAULT now() | 레코드 최종 갱신 시각 |

**인덱스**:
- `UQ_guild_member_guild_user`: UNIQUE(guildId, userId) — 복합 유니크 키
- `IDX_guild_member_guild_active`: IDX(guildId, isActive) — 활성 멤버 조회용
- `IDX_guild_member_guild_joined`: IDX(guildId, joinedAt) — 가입일 기준 조회용 (모코코, 신규사용자)

### voice_channel_history 변경사항

| 변경 | 내용 |
|------|------|
| FK member → guild_member | `memberId` FK를 `guild_member.id`로 재지정 |
| 컬럼 추가 | `guildId varchar NOT NULL` — FK 재지정에 필요한 길드 컨텍스트 |

---

## Redis 키 구조

guild-member 도메인은 별도 Redis 캐싱을 사용하지 않는다. 조회 성능은 `IDX_guild_member_guild_active` 인덱스와 DB 커넥션 풀로 충분하다.

기존 `inactive-member` 도메인에서 사용하던 Redis 이름 캐시(`member:name:{guildId}:{userId}`, TTL 7일)는 `guild_member` DB 조회로 대체되어 **제거**한다.

---

## 오류 처리

| 상황 | 처리 방식 |
|------|-----------|
| Discord Gateway 이벤트 `member.user` null | 경고 로그, 해당 이벤트 처리 중단 |
| bulk upsert 중 개별 레코드 실패 | 배치 전체 롤백 후 경고 로그 (트랜잭션 단위: 길드) |
| `findByUserId` 미조회 (DB에 없음) | null 반환, 소비자가 fallback 처리 (Discord REST 호출 또는 'Unknown' 표시) |
| `guildMemberRemove` 이벤트 수신 시 레코드 미존재 | `isActive=false` UPDATE 스킵, debug 로그 |

---

## 비기능 요구사항

- **초기 동기화 성능**: `clientReady` 시 대규모 길드(1000명+) bulk upsert는 500건 단위 배치 INSERT 사용
- **이벤트 처리 지연**: 각 Gateway 이벤트 처리는 50ms 이내 완료 (단순 upsert)
- **데이터 정합성**: UNIQUE(guildId, userId) 제약으로 중복 레코드 방지, ON CONFLICT DO UPDATE로 멱등성 보장
- **마이그레이션 무중단**: `member` 테이블과 `guild_member` 테이블을 병행 운영 후 검증 완료 시 `member` DROP
