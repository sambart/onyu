# Discord API 호출 DB 조회 전환 — 소비자 도메인 구현 계획

> PRD: [guild-member.md](../specs/prd/guild-member.md) F-GUILD-MEMBER-009
> 날짜: 2026-04-04

## 목표

기존에 Discord REST API(`fetchGuildMember`, `fetchAllGuildMembers`)를 호출하여 닉네임, 봇 여부, 가입일을 조회하던 코드를 `GuildMemberService`의 DB SELECT로 전환한다.
이를 통해 API Rate Limit 부하를 제거하고 응답 지연을 줄인다.

## 선행 조건

- `guild_member` 테이블 생성 및 초기 동기화 완료 (F-GUILD-MEMBER-001)
- `GuildMemberService`의 조회 메서드 구현 완료 (F-GUILD-MEMBER-007):
  - `findByUserId(guildId, userId)` -> `GuildMemberOrmEntity | null`
  - `findByUserIds(guildId, userIds)` -> `Map<string, GuildMemberOrmEntity>`
  - `findActiveMembers(guildId)` -> `GuildMemberOrmEntity[]`
  - `findActiveMembersExcludingBots(guildId)` -> `GuildMemberOrmEntity[]`
  - `findByJoinedAfter(guildId, date)` -> `GuildMemberOrmEntity[]`
- `GuildMemberModule`이 `exports: [GuildMemberService]`로 외부 도메인에서 import 가능

## 전환 대상 총괄

| # | 도메인 | 기존 메서드 | 전환 대상 GuildMemberService 메서드 |
|---|--------|------------|-------------------------------------|
| 1 | inactive-member | `InactiveMemberDiscordAdapter.fetchMemberDisplayNames()` | `findByUserIds()` |
| 2 | inactive-member | `InactiveMemberDiscordAdapter.fetchMemberDisplayName()` | `findByUserId()` |
| 3 | newbie (mission) | `MissionDiscordPresenter.fetchMemberDisplayName()` | `findByUserId()` |
| 4 | newbie (mission) | `MissionDiscordPresenter.fetchMemberNickname()` | `findByUserId()` + `isActive` 확인 |
| 5 | newbie (mission) | `MissionDiscordActionService.checkMemberExists()` | `findByUserId()` + `isActive` 확인 |
| 6 | newbie (mission) | `MissionDiscordActionService.fetchGuildMembers()` | `findActiveMembersExcludingBots()` |
| 7 | newbie (mission) | `MissionDiscordActionService.fetchMemberDisplayName()` | `findByUserId()` |
| 8 | newbie (moco) | `MocoMemberDiscordAdapter` (전체) | `findByUserIds()` / `findByUserId()` / `findByJoinedAfter()` |
| 9 | newbie (moco) | `MocoDiscordPresenter.fetchDisplayNames()` | `findByUserIds()` |
| 10 | status-prefix | `StatusPrefixDiscordAdapter.fetchMember()` (닉네임 조회 용도) | `findByUserId()` |
| 11 | voice | `MemberService.findOrCreateMember()` | `GuildMemberService.findByUserId()` |
| 12 | voice | `MemberSearchService.getProfile()` / `getProfiles()` | `findByUserId()` / `findByUserIds()` |
| 13 | newbie (mission scheduler) | `MissionDiscordActionService.fetchGuildMembers()` (스케줄러 경유) | `findActiveMembersExcludingBots()` |
| 14 | newbie (mission scheduler) | `MissionDiscordPresenter.fetchMemberDisplayName()` (스케줄러 경유) | `findByUserId()` |

## Discord API 호출 유지 대상 (이 계획에서 제외)

| 대상 | 유지 사유 |
|------|-----------|
| `InactiveMemberService.classifyGuild()` 내 `fetchGuildMembers()` | `excludedRoleIds` 필터링에 멤버 roles 정보 필요. 매일 자정 1회 유지 |
| `StatusPrefixDiscordAdapter.setNickname()` | 닉네임 변경 액션은 Discord API 필수 |
| `StatusPrefixDiscordAdapter.fetchMember()` (restoreOnLeave) | 멤버 존재 확인 후 닉네임 복원 액션이 뒤따르므로 Discord API 유지 |
| DM 발송 (`sendDm`, `sendDmAndKick`) | Discord DM API 필수 |
| 역할 부여/제거 (`modifyRole`, `grantRole`) | Discord Role API 필수 |
| 강퇴 (`kickMember`) | Discord API 필수 |

---

## 단계별 구현

### 1단계: GuildMemberModule 의존성 추가

각 소비자 모듈의 `imports`에 `GuildMemberModule`을 추가한다.

**변경 파일**:

| 파일 | 변경 |
|------|------|
| `apps/api/src/inactive-member/inactive-member.module.ts` | `imports`에 `GuildMemberModule` 추가 |
| `apps/api/src/newbie/newbie.module.ts` | `imports`에 `GuildMemberModule` 추가 |
| `apps/api/src/status-prefix/status-prefix.module.ts` | `imports`에 `GuildMemberModule` 추가 (닉네임 조회 용도가 있는 경우) |
| `apps/api/src/channel/voice/voice-channel.module.ts` | `imports`에 `GuildMemberModule` 추가, `MemberModule` import 유지 (마이그레이션 완료 전까지) |

---

### 2단계: inactive-member 도메인 전환

#### 2-1. `InactiveMemberDiscordAdapter.fetchMemberDisplayNames()` 제거

**파일**: `apps/api/src/inactive-member/infrastructure/inactive-member-discord.adapter.ts`

- **현재**: `fetchMemberDisplayNames(guildId, userIds)` -- 개별 `fetchGuildMember()` REST 호출로 닉네임 수집
- **분석**: 이 메서드는 현재 어디에서도 호출되지 않는다. 컨트롤러는 `record.nickName`(DB)을 사용하고, 액션 서비스는 `repo.findNickNameMap()`을 사용한다
- **변경**: 메서드 삭제
- **에러 처리**: 해당 없음 (사용처 없음)

#### 2-2. `InactiveMemberDiscordAdapter.fetchMemberDisplayName()` 제거

**파일**: `apps/api/src/inactive-member/infrastructure/inactive-member-discord.adapter.ts`

- **현재**: `fetchMemberDisplayName(guildId, userId)` -- 개별 `fetchGuildMember()` REST 호출
- **분석**: DM 발송 시 닉네임 조회 용도이나, 현재 `executeDmAction`에서는 `repo.findNickNameMap()`으로 대체 완료된 상태
- **변경**: 메서드 삭제
- **에러 처리**: 해당 없음 (사용처 없음)

> 참고: `InactiveMemberDiscordAdapter`에서 `fetchGuild`, `fetchGuildMembers`, `kickMember`, `sendDm`, `modifyRole`은 유지한다.

---

### 3단계: newbie (mission) 도메인 전환

#### 3-1. `MissionDiscordPresenter` 닉네임 조회 전환

**파일**: `apps/api/src/newbie/application/mission/mission-discord.presenter.ts`

- **현재**:
  - `fetchMemberDisplayName(guildId, memberId)`: `discordRest.fetchGuildMember()` -> `getMemberDisplayName()`
  - `fetchMemberNickname(guildId, memberId)`: `discordRest.fetchGuildMember()` -> `getMemberDisplayName()`, 서버 미존재 시 null
- **변경**:
  - 생성자에 `GuildMemberService` 주입
  - `fetchMemberDisplayName()` -> `GuildMemberService.findByUserId(guildId, memberId)` 호출, `member?.displayName ?? 'User-{memberId 앞 6자리}'`
  - `fetchMemberNickname()` -> `GuildMemberService.findByUserId(guildId, memberId)` 호출, `member?.isActive === false`이면 null 반환 (탈퇴 감지), 존재하면 `member.displayName`
- **에러 처리**: DB 조회 실패 시 기존과 동일하게 fallback 값 반환
- **제거 대상**: `DiscordRestService` 의존성이 Embed 전송(`sendMessage`, `editMessage`)에 여전히 사용되므로 유지

#### 3-2. `MissionDiscordActionService` 멤버 조회 전환

**파일**: `apps/api/src/newbie/application/mission/mission-discord-action.service.ts`

- **현재**:
  - `checkMemberExists(guildId, memberId)`: `discordRest.fetchGuildMember()` -> `{ member, isConfirmedAbsent }`
  - `fetchGuildMembers(guildId)`: `discordRest.fetchAllGuildMembers()` -> 봇 감지, 가입일 기반 필터
  - `fetchMemberDisplayName(guildId, memberId)`: `discordRest.fetchGuildMember()` -> displayName
- **변경**:
  - 생성자에 `GuildMemberService` 주입
  - `checkMemberExists()` -> `GuildMemberService.findByUserId(guildId, memberId)`:
    - `member`가 null이면 `{ member: null, isConfirmedAbsent: false }` (DB에 없는 경우는 판단 불가로 처리)
    - `member.isActive === false`이면 `{ member: null, isConfirmedAbsent: true }` (탈퇴 확정)
    - `member.isActive === true`이면 `{ member, isConfirmedAbsent: false }` (반환 타입을 `GuildMemberOrmEntity`로 변경)
  - `fetchGuildMembers()` -> `GuildMemberService.findActiveMembersExcludingBots(guildId)`:
    - 반환 타입이 `APIGuildMember[]`에서 `GuildMemberOrmEntity[]`로 변경
    - 호출처 `MissionService.registerMissingMembers()`의 멤버 접근 패턴을 조정:
      - `member.user.bot` -> 불필요 (이미 봇 제외 조회)
      - `member.user.id` -> `member.userId`
      - `member.joined_at` -> `member.joinedAt`
      - `member.displayName` -> `member.displayName`
  - `fetchMemberDisplayName()` -> `GuildMemberService.findByUserId(guildId, memberId)` -> `member?.displayName ?? null`
- **에러 처리**: DB 조회 실패는 예외 전파 (기존 Discord API 호출도 예외 발생 가능했음)
- **반환 타입 변경**: `checkMemberExists`의 `member` 필드 타입이 `APIGuildMember`에서 `GuildMemberOrmEntity`로 변경됨. 호출처 `MissionService.removeInvalidMissions()`에서 `member?.user.bot` -> `member?.isBot`으로 수정 필요

#### 3-3. `MissionService` 호출처 수정

**파일**: `apps/api/src/newbie/application/mission/mission.service.ts`

- `removeInvalidMissions()`:
  - `member?.user.bot` -> `member?.isBot`
- `registerMissingMembers()`:
  - `members` 타입이 `APIGuildMember[]`에서 `GuildMemberOrmEntity[]`로 변경
  - `member.user.bot` -> 제거 (이미 봇 제외)
  - `member.user.id` -> `member.userId`
  - `new Date(member.joined_at)` -> `member.joinedAt` (Date 타입)

---

### 4단계: newbie (moco) 도메인 전환

#### 4-1. `MocoMemberDiscordAdapter` -> `MocoMemberGuildAdapter` 교체

**파일**: `apps/api/src/newbie/infrastructure/moco-member-discord.adapter.ts`

- **현재**: `MocoMemberResolver` 포트의 Discord REST 구현체. 3개 메서드 모두 `discordRest.fetchGuildMember()`를 개별 호출
- **변경**: 파일 전체를 `GuildMemberService` 기반으로 재구현 (또는 신규 파일 `moco-member-guild.adapter.ts` 생성 후 기존 삭제)
  - `getNewbieIds(guildId, channelId, userIds, cutoffMs)`:
    - `GuildMemberService.findByUserIds(guildId, userIds)` -> Map에서 각 멤버의 `isBot`, `joinedAt` 확인
    - `!isBot && joinedAt >= cutoffMs`인 userId 수집
  - `isValidHunter(guildId, hunterId, cutoffMs, allowNewbie)`:
    - `GuildMemberService.findByUserId(guildId, hunterId)` -> `isBot` 확인, `joinedAt` 기반 신입 판정
  - `getNewbiePeerIds(guildId, peerIds, cutoffMs)`:
    - `GuildMemberService.findByUserIds(guildId, peerIds)` -> `!isBot && joinedAt >= cutoffMs` 필터
- **에러 처리**: DB 조회 결과 없으면 빈 배열/false 반환 (기존과 동일한 방어 로직)
- **제거 대상**: `DiscordRestService` 의존성 완전 제거

**모듈 변경**: `newbie.module.ts`에서 `MocoMemberDiscordAdapter` -> `MocoMemberGuildAdapter` 교체 (MOCO_MEMBER_RESOLVER 토큰 바인딩)

#### 4-2. `MocoDiscordPresenter.fetchDisplayNames()` 전환

**파일**: `apps/api/src/newbie/application/moco/moco-discord.presenter.ts`

- **현재**: Redis 캐시(`newbie:display-names:{guildId}`) -> 캐시 미스 시 `discordRest.fetchGuildMember()` 개별 호출
- **변경**:
  - 생성자에 `GuildMemberService` 주입
  - Redis 캐시 로직 제거, `GuildMemberService.findByUserIds(guildId, userIds)` 호출
  - `Map<string, GuildMemberOrmEntity>`에서 `displayName` 추출, 미조회 시 userId를 그대로 사용
- **에러 처리**: DB 미조회 시 userId fallback (기존과 동일)
- **제거 대상**:
  - `RedisService` 의존성 제거 (이 클래스에서 더 이상 사용하지 않는 경우)
  - `NewbieKeys.displayNames` 캐시 키 -- 사용처가 `MocoDiscordPresenter`뿐이므로 키 정의 제거
  - `DiscordRestService` 의존성은 메시지 전송(`sendMessage`, `editMessage`, `deleteMessage`, `sendMessageWithFiles`, `editMessageWithFiles`)에 여전히 사용하므로 유지

---

### 5단계: voice 도메인 전환 (member 테이블 폐기 준비)

#### 5-1. `VoiceChannelService` -- `MemberService` -> `GuildMemberService` 교체

**파일**: `apps/api/src/channel/voice/application/voice-channel.service.ts`

- **현재**: `MemberService.findOrCreateMember(userId, userName, avatarUrl)` -> `Member` 엔티티 반환. `VoiceChannelHistoryService.logJoin/logLeave`에 전달
- **변경**:
  - `MemberService` 의존성을 `GuildMemberService`로 교체
  - `findOrCreateMember()` 호출을 `GuildMemberService.findByUserId(guildId, userId)` 로 교체
  - `guildId`를 `VoiceStateDto`에서 가져옴 (이미 `cmd.guildId`로 존재)
  - `VoiceChannelHistoryService.logJoin/logLeave`의 `member` 파라미터 타입을 `GuildMemberOrmEntity`로 변경

#### 5-1a. `voice_channel_history` FK 재지정 마이그레이션

`voice_channel_history` FK가 현재 `member.id`를 참조하므로, 같은 Phase 내에서 FK 재지정 마이그레이션을 실행한다.

**마이그레이션 순서**:
  1. `voice_channel_history`에 `guildMemberId bigint NULL` 컬럼 추가
  2. 데이터 마이그레이션: `member.discordMemberId` + `channel.guildId` 기준으로 `guild_member.id` 매핑
     ```sql
     UPDATE voice_channel_history vch
     SET "guildMemberId" = gm.id
     FROM member m
     JOIN channel c ON c.id = vch."channelId"
     JOIN guild_member gm ON gm."userId" = m."discordMemberId" AND gm."guildId" = c."guildId"
     WHERE vch."memberId" = m.id
     ```
  3. `guildMemberId` NOT NULL 전환
  4. FK 설정: `guildMemberId` → `guild_member.id`
  5. 기존 `memberId` FK 제거, `memberId` 컬럼 DROP
  6. 서비스 레이어 변경 적용 (5-1)

#### 5-2. `MemberSearchService` 전환

**파일**: `apps/api/src/channel/voice/application/member-search.service.ts`

- **현재**:
  - `getProfile(userId)`: `memberRepo.findOne({ discordMemberId: userId })` -> `{ userId, userName, avatarUrl }`
  - `getProfiles(userIds)`: `memberRepo` 쿼리 -> `Record<string, { userName, avatarUrl }>`
- **변경**:
  - `Member` 엔티티 대신 `GuildMemberOrmEntity` 사용
  - `getProfile(guildId, userId)`: `GuildMemberService.findByUserId(guildId, userId)` -> `{ userId, userName: member.displayName, avatarUrl: member.avatarUrl }`
  - `getProfiles(guildId, userIds)`: `GuildMemberService.findByUserIds(guildId, userIds)` -> Map 순회하여 동일 형태 반환
  - **시그니처 변경**: `guildId` 파라미터 추가 필요. 호출처에서도 `guildId`를 전달하도록 수정
- **제거 대상**: `@InjectRepository(Member)` 의존성 제거

---

### 6단계: member 모듈 폐기

> 5단계의 DB 마이그레이션 완료 후 진행

**제거 대상 파일**:

| 파일 | 설명 |
|------|------|
| `apps/api/src/member/member.module.ts` | 모듈 정의 |
| `apps/api/src/member/member.service.ts` | findOne, findOrCreateMember |
| `apps/api/src/member/member.entity.ts` | re-export |
| `apps/api/src/member/infrastructure/member.orm-entity.ts` | TypeORM 엔티티 |
| `apps/api/src/member/member.service.spec.ts` | 단위 테스트 |

**모듈 참조 제거**:

| 파일 | 변경 |
|------|------|
| `apps/api/src/app.module.ts` 또는 voice 모듈 | `MemberModule` import 제거 |
| `apps/api/src/channel/voice/voice-channel.module.ts` | `MemberModule` import 제거 |

---

## 제거 대상 요약

### Discord REST 호출 제거

| 파일 | 제거할 메서드 |
|------|-------------|
| `inactive-member-discord.adapter.ts` | `fetchMemberDisplayNames()`, `fetchMemberDisplayName()` |
| `mission-discord.presenter.ts` | `fetchMemberDisplayName()`, `fetchMemberNickname()` 내부의 `discordRest.fetchGuildMember()` 호출 |
| `mission-discord-action.service.ts` | `checkMemberExists()`, `fetchGuildMembers()`, `fetchMemberDisplayName()` 내부의 `discordRest.fetchGuildMember()` / `fetchAllGuildMembers()` 호출 |
| `moco-member-discord.adapter.ts` | 파일 전체 (GuildMemberService 기반 구현체로 교체) |
| `moco-discord.presenter.ts` | `fetchDisplayNames()` 내부의 `discordRest.fetchGuildMember()` 호출 |
| `member-search.service.ts` | `Member` 엔티티 의존성 |

### Redis 캐시 제거

| 키 패턴 | 위치 | 사유 |
|---------|------|------|
| `newbie:display-names:{guildId}` | `MocoDiscordPresenter.fetchDisplayNames()` | DB 조회로 대체, 캐시 불필요 |

### 파일 삭제

| 파일 | 사유 |
|------|------|
| `apps/api/src/newbie/infrastructure/moco-member-discord.adapter.ts` | `MocoMemberGuildAdapter`로 교체 |
| `apps/api/src/member/` (디렉터리 전체) | `guild_member`로 완전 대체 (6단계) |

---

## 테스트 변경

| 테스트 파일 | 변경 내용 |
|------------|----------|
| `mission.service.spec.ts` | `checkMemberExists` 목 반환값 타입 변경 (`APIGuildMember` -> `GuildMemberOrmEntity`), `fetchGuildMembers` 목 반환값 변경 |
| `moco-discord.presenter.spec.ts` | `discordRest.fetchGuildMember` 목 -> `GuildMemberService.findByUserIds` 목으로 교체 |
| `inactive-member.service.spec.ts` | `fetchMemberDisplayNames` 관련 목 제거 (사용처 없음) |
| `inactive-member-action.service.spec.ts` | 변경 없음 (이미 `repo.findNickNameMap` 사용) |
| `status-prefix-reset.service.spec.ts` | 변경 없음 (fetchMember는 유지 대상) |
| `member-search.service.spec.ts` | `Member` 리포지토리 목 -> `GuildMemberService` 목으로 교체, `guildId` 파라미터 추가 |

---

## 구현 순서 및 병렬화

```
Phase 0 (선행):
  GuildMemberService 조회 메서드 구현 + GuildMemberModule exports 확인
     |
     v
Phase 1 (병렬 가능):
  [inactive-member] 2단계 — 미사용 Discord 메서드 삭제 (단순 삭제)
  [newbie/mission]  3단계 — Presenter + ActionService + Service 전환 (스케줄러 경유 포함)
  [newbie/moco]     4단계 — MocoMemberAdapter 교체 + Presenter 전환
  [voice]           5단계 — FK 마이그레이션 + VoiceChannelService + MemberSearchService 전환
     |
     v
Phase 2 (Phase 1 완료 후):
  6단계 — member 모듈 폐기
```

Phase 1의 네 작업은 서로 다른 도메인 파일을 수정하므로 병렬 진행 가능하다.
voice FK 마이그레이션도 같은 Phase 내에서 처리한다.
