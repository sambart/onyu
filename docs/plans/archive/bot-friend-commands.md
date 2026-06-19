# Bot 슬래시 커맨드 3종 (`/best-friend`, `/affinity`, `/privacy`) 구현 계획

> 작성일: 2026-05-04
> 상위 PRD: [voice-co-presence.md](../specs/prd/voice-co-presence.md) F-COPRESENCE-014/015/017
> 검토안: [best-friend-discord-feature.md](./best-friend-discord-feature.md) §2A, §5
> 공통 모듈: [common-modules.md](../specs/common-modules.md) Part D

---

## 1. 작업 목적

Phase 5(친밀도/베스트 프렌드) 기능의 **Bot 측 슬래시 커맨드 진입점 3종**을 신규 작성한다.

| 커맨드 | 한글 별칭 | 기능 ID | 출력 |
|--------|-----------|---------|------|
| `/best-friend` | `친한친구` | F-COPRESENCE-014 | Canvas PNG (베스트 프렌드 TOP 카드) |
| `/affinity` | `친밀도` | F-COPRESENCE-015 | Canvas PNG (두 사람 친밀도 카드) |
| `/privacy` | `사생활` | F-COPRESENCE-017 | ephemeral 텍스트 (opt-out 토글) |

본 계획은 **Bot 프로세스 측만** 다룬다. API 측 카드 렌더러·컨트롤러·Service 신설은 다른 plan 문서가 담당하며, 여기서는 Bot이 의존하는 인터페이스(`BotApiClientService` 메서드 시그니처) 정의만 포함한다.

### 선행 조건 (다른 plan과의 의존)

| 의존 항목 | 담당 plan | 본 plan 시작 조건 |
|-----------|-----------|-------------------|
| `BotApiClientService.getMyBestFriends()` 시그니처 확정 | 본 plan §6 (libs 단독 PR) | 단독 PR 선행 머지 |
| `POST /bot-api/co-presence/best-friends` 엔드포인트 | voice-co-presence Phase 5-1 | 슬래시 커맨드 동작 검증 시점에 필요 |
| `POST /bot-api/co-presence/affinity` 엔드포인트 | voice-co-presence Phase 5-2 | `/affinity` 검증 시점에 필요 |
| `PUT /bot-api/users/me/privacy` 또는 동등 endpoint | user-privacy 도메인 | `/privacy` 검증 시점에 필요 |

선행 작업이 머지되기 전에도 본 plan의 Bot 커맨드 코드는 작성·머지 가능하다 (API 미존재 시 런타임 500 응답 → 사용자 친화 에러 메시지로 fallback).

---

## 2. 변경 대상 파일 목록

### 2-A. 신규 파일 (Bot 도메인)

| 경로 | 역할 |
|------|------|
| `apps/bot/src/command/friend/best-friend.command.ts` | `/best-friend` 슬래시 커맨드 핸들러 |
| `apps/bot/src/command/friend/best-friend.dto.ts` | `period`, `limit`, `private` 옵션 DTO |
| `apps/bot/src/command/friend/affinity.command.ts` | `/affinity` 슬래시 커맨드 핸들러 |
| `apps/bot/src/command/friend/affinity.dto.ts` | `user`, `user2`, `period` 옵션 DTO |
| `apps/bot/src/command/privacy/privacy.command.ts` | `/privacy` 슬래시 커맨드 핸들러 |
| `apps/bot/src/command/privacy/privacy.dto.ts` | `relationship-share` boolean 옵션 DTO |

### 2-B. 신규 파일 (libs 공유)

> Part D-4 충돌 방지 규칙: 단독 PR로 선행 머지

| 경로 | 변경 |
|------|------|
| `libs/bot-api-client/src/types.ts` | `CanvasCardResponse`, `BestFriendCardResponse`, `AffinityCardResponse`, `UpsertUserPrivacyDto`, `UserPrivacyResponse` 타입 추가 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `getMyBestFriends()`, `getAffinity()`, `upsertUserPrivacy()` 메서드 추가 |

### 2-C. 수정 파일 (Bot 모듈 등록)

| 경로 | 변경 |
|------|------|
| `apps/bot/src/command/bot-command.module.ts` | 신규 커맨드 3종 provider 등록 |

기존 `BotCommandModule`이 이미 `MeCommand`/`StickyMessage*`/`*Diagnosis` 등을 등록 중이며, Bot 측 커맨드 모듈 분리 패턴이 정립되어 있지 않으므로 **하나의 `BotCommandModule`에 그대로 추가**한다 (별도 `FriendCommandModule`/`PrivacyCommandModule` 분리는 오버엔지니어링). 향후 Bot 커맨드가 폭증하면 그때 도메인별 분리 검토.

### 2-D. 변경 없음 (참고만)

- `apps/bot/src/command/me.command.ts` — 컨벤션 답습 대상, 수정하지 않음
- `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` — voice-co-presence 도메인 plan에서 작성

---

## 3. 슬래시 커맨드 옵션 명세

### 3-1. `/best-friend` (`친한친구`)

| 옵션 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `period` | INTEGER (choices) | 선택 | `30` | `7`, `30`, `90` 중 하나 — 집계 기간(일) |
| `limit` | INTEGER | 선택 | `5` | 3~5 (minValue=3, maxValue=5) — TOP N 개수 |
| `private` | BOOLEAN | 선택 | `false` | `true`이면 ephemeral 응답 (본인만 확인) |

`@Command` 메타:
```typescript
@Command({
  name: 'best-friend',
  nameLocalizations: { ko: '친한친구' },
  description: 'Show my best friend TOP card',
  descriptionLocalizations: { ko: '내 베스트 프렌드 TOP을 카드로 보여줍니다' },
})
```

### 3-2. `/affinity` (`친밀도`)

| 옵션 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `user` | USER | **필수** | — | 비교 대상 1 |
| `user2` | USER | 선택 | 명령 실행자 본인 | 비교 대상 2 (생략 시 self) |
| `period` | INTEGER (choices) | 선택 | `30` | `7`, `30`, `90` 중 하나 |

`@Command` 메타:
```typescript
@Command({
  name: 'affinity',
  nameLocalizations: { ko: '친밀도' },
  description: 'Show two-user affinity card',
  descriptionLocalizations: { ko: '두 사람의 친밀도를 카드로 보여줍니다' },
})
```

### 3-3. `/privacy` (`사생활`)

| 옵션 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `relationship-share` | BOOLEAN | **필수** | `true` = 공개(opt-out 해제), `false` = 비공개(opt-out 활성). 라벨: "친밀도 공개 여부" |

`@Command` 메타:
```typescript
@Command({
  name: 'privacy',
  nameLocalizations: { ko: '사생활' },
  description: 'Toggle relationship visibility',
  descriptionLocalizations: { ko: '친밀도 노출 공개/비공개 설정' },
})
```

---

## 4. 응답 흐름도

### 4-1. `/best-friend` 처리 흐름

```
[사용자] /best-friend period:30 limit:5 private:false
    │
    ▼
[Bot] BestFriendCommand.onBestFriend()
    ├─ guildId 존재 검증
    ├─ interaction.deferReply({ ephemeral: private })
    │
    ├─ displayName = (member as GuildMember).displayName ?? user.displayName
    ├─ avatarUrl   = user.displayAvatarURL({ extension: 'png', size: 128 })
    │
    ├─ apiClient.getMyBestFriends(guildId, userId, displayName, avatarUrl, period, limit)
    │       ↓ POST /bot-api/co-presence/best-friends?...
    │
    ├─ result.data 분기:
    │   ├─ null  → editReply({ content: `최근 ${result.days}일간 함께한 친구 기록이 없어요. 음성방에 들어가 친구를 만들어보세요!` })
    │   │           + 대시보드 Link 버튼 (CTA)
    │   └─ data  → Buffer.from(data.imageBase64, 'base64')
    │              new AttachmentBuilder(buf, { name: 'best-friends.png' })
    │              editReply({ files: [attachment], components: [linkButtonRow] })
    │
    └─ catch (error)
        ├─ logger.error(...)
        └─ editReply({ content: '베스트 프렌드 조회 중 오류가 발생했습니다.' })
```

`linkButtonRow` 구성:
```typescript
new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
    .setLabel('대시보드에서 그래프 보기')
    .setStyle(ButtonStyle.Link)
    .setURL(`${WEB_URL}/dashboard/guild/${guildId}/co-presence`),
);
```

### 4-2. `/affinity` 처리 흐름

```
[사용자] /affinity user:@민수 user2:@영희 period:30
    │
    ▼
[Bot] AffinityCommand.onAffinity()
    ├─ guildId 존재 검증
    ├─ interaction.deferReply()
    │
    ├─ userA = options.getUser('user', true)
    ├─ userB = options.getUser('user2') ?? interaction.user      ← 생략 시 self
    │
    ├─ 동일 유저 차단: userA.id === userB.id → ephemeral 텍스트 "같은 사용자 두 명을 비교할 수 없습니다."
    │
    ├─ apiClient.getAffinity(guildId, userA.id, userB.id, period, requestUserId: interaction.user.id)
    │       ↓ POST /bot-api/co-presence/affinity?...
    │       (서버 측에서 권한·opt-out 검증 수행)
    │
    ├─ response.errorCode 분기 (helper 메서드):
    │   ├─ 'PRIVATE'        → editReply({ content: '비공개 설정된 사용자가 포함되어 있습니다.' })
    │   ├─ 'NOT_PERMITTED'  → editReply({ content: '관리자만 조회 가능합니다.' })
    │   ├─ 'NO_DATA' (data null) → editReply({ content: `최근 ${days}일간 두 분의 함께한 음성 기록이 없어요.` })
    │   └─ 정상            → AttachmentBuilder + components(Link 버튼) → editReply
    │
    └─ catch (error)
        ├─ logger.error(...)
        └─ editReply({ content: '친밀도 조회 중 오류가 발생했습니다.' })
```

권한 사전 검증(클라이언트 측 best-effort) — **본인 미포함 페어**일 경우만:
```typescript
const isSelfIncluded =
  userA.id === interaction.user.id || userB.id === interaction.user.id;

if (!isSelfIncluded) {
  // ManageGuild 보유 시 즉시 통과, 미보유 시 서버 토글로 결정 (서버에 위임)
  // → Bot에서 분기하지 않고 그대로 API 호출, 서버에서 NOT_PERMITTED 응답 시 텍스트 분기
}
```

> **결정**: Bot 측은 권한 검증 로직을 두지 않는다. 길드 토글(`GuildCoPresenceConfig.allowPublicAffinityQuery`) 조회는 API에 위임. Bot은 `requestUserId` + `requestUserPermissions`(필요 시)을 함께 전달하고, API가 `NOT_PERMITTED` 응답 시 ephemeral 분기.

### 4-3. `/privacy` 처리 흐름

```
[사용자] /privacy relationship-share:false
    │
    ▼
[Bot] PrivacyCommand.onPrivacy()
    ├─ guildId 존재 검증
    ├─ interaction.deferReply({ ephemeral: true })
    │
    ├─ apiClient.upsertUserPrivacy(guildId, userId, { disableRelationshipShare: !relationshipShare })
    │       ↓ PUT /bot-api/users/me/privacy 또는 PUT /bot-api/co-presence/privacy
    │
    ├─ result.ok 분기:
    │   ├─ true  → editReply({ content: '✅ 친밀도 공개 설정이 적용되었습니다. (현재: 공개/비공개)' })
    │   └─ false → editReply({ content: '⚠️ 설정 저장에 실패했습니다.' })
    │
    └─ catch (error)
        ├─ logger.error(...)
        └─ editReply({ content: '사생활 설정 변경 중 오류가 발생했습니다.' })
```

---

## 5. 에러/엣지 케이스 처리 매트릭스

| 케이스 | `/best-friend` | `/affinity` | `/privacy` |
|--------|----------------|-------------|------------|
| guildId 없음 (DM) | reply ephemeral 텍스트 | 동일 | 동일 |
| API 호출 실패 | logger.error + editReply 친화 메시지 | 동일 | 동일 |
| 데이터 0건 | "최근 N일간 함께한 친구 기록이 없어요" + Link 버튼 | "두 분은 아직 함께한 음성 기록이 없어요" | N/A |
| API `errorCode='PRIVATE'` | (해당 없음 — 서버에서 익명화 처리) | ephemeral 텍스트 분기 | N/A |
| API `errorCode='NOT_PERMITTED'` | N/A | ephemeral 텍스트 분기 | N/A |
| 같은 유저 두 번 지정 | N/A | ephemeral 사전 차단 | N/A |
| 캔버스 base64 디코딩 실패 | catch → 친화 메시지 | 동일 | N/A |

---

## 6. BotApiClient 메서드 시그니처

### 6-1. types.ts 추가

```typescript
// libs/bot-api-client/src/types.ts

/**
 * Bot ↔ API 캔버스 PNG 응답 공통 형식.
 * /me, /best-friend, /affinity 모두 동일한 응답 셰이프를 사용한다.
 */
export interface CanvasCardResponse {
  ok: boolean;
  data: { imageBase64: string } | null;
  days: number;
  /** 비정상 응답 사유. 'PRIVATE' | 'NOT_PERMITTED' | 'NO_DATA' 등. */
  errorCode?: 'PRIVATE' | 'NOT_PERMITTED' | 'NO_DATA';
}

export type BestFriendCardResponse = CanvasCardResponse;
export type AffinityCardResponse = CanvasCardResponse;

// 기존 MeProfileResponse는 별칭으로 유지 (호환성)
// 수정 위치: 기존 export interface MeProfileResponse {...} 를
// export type MeProfileResponse = CanvasCardResponse 로 치환
// 단 errorCode는 /me에서 사용하지 않으므로 CanvasCardResponse 정의가 호환 가능

// ── User Privacy ──

export interface UpsertUserPrivacyDto {
  /** true: 친밀도/베프 노출 비공개 (opt-out 활성). false: 공개. */
  disableRelationshipShare: boolean;
}

export interface UserPrivacyResponse {
  ok: boolean;
  data: {
    guildId: string;
    userId: string;
    disableRelationshipShare: boolean;
  } | null;
}
```

> `MeProfileResponse`를 `CanvasCardResponse` 별칭으로 치환할 때 기존 `me.command.ts`의 `result.data.imageBase64` 접근이 깨지지 않는지 컴파일 검증한다 (Part D-4 충돌 방지 규칙).

### 6-2. bot-api-client.service.ts 추가

```typescript
// ── Co-Presence (Phase 5) ──

async getMyBestFriends(
  guildId: string,
  userId: string,
  displayName: string,
  avatarUrl: string,
  period: 7 | 30 | 90,
  limit: number,
): Promise<BestFriendCardResponse> {
  const params = new URLSearchParams({
    guildId,
    userId,
    displayName,
    avatarUrl,
    period: String(period),
    limit: String(limit),
  });
  return this.post(`/bot-api/co-presence/best-friends?${params.toString()}`, {});
}

async getAffinity(
  guildId: string,
  userAId: string,
  userBId: string,
  period: 7 | 30 | 90,
  requestUserId: string,
): Promise<AffinityCardResponse> {
  const params = new URLSearchParams({
    guildId,
    userAId,
    userBId,
    period: String(period),
    requestUserId,
  });
  return this.post(`/bot-api/co-presence/affinity?${params.toString()}`, {});
}

// ── User Privacy ──

async upsertUserPrivacy(
  guildId: string,
  userId: string,
  dto: UpsertUserPrivacyDto,
): Promise<UserPrivacyResponse> {
  const params = new URLSearchParams({ guildId, userId });
  return this.post(`/bot-api/users/me/privacy?${params.toString()}`, dto);
}
```

> 엔드포인트 경로(`/bot-api/users/me/privacy`)는 user-privacy 도메인 plan과 합의 필요. 본 plan에서는 잠정 경로로 명세하고, 미스매치 발견 시 단일 줄 변경으로 정정 가능하도록 격리.

---

## 7. 모듈 등록 위치

### 7-1. `BotCommandModule` 수정안

```typescript
// apps/bot/src/command/bot-command.module.ts
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { AffinityCommand } from './friend/affinity.command';
import { BestFriendCommand } from './friend/best-friend.command';
import { MeCommand } from './me.command';
import { PrivacyCommand } from './privacy/privacy.command';
import { StickyMessageDeleteCommand } from './sticky-message/sticky-message-delete.command';
import { StickyMessageListCommand } from './sticky-message/sticky-message-list.command';
import { StickyMessageRegisterCommand } from './sticky-message/sticky-message-register.command';
import { VersionCommand } from './version.command';
import { SelfDiagnosisCommand } from './voice-analytics/self-diagnosis.command';
import { ServerDiagnosisCommand } from './voice-analytics/server-diagnosis.command';
import { VoiceFlushCommand } from './voice-flush.command';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [
    VersionCommand,
    VoiceFlushCommand,
    StickyMessageRegisterCommand,
    StickyMessageDeleteCommand,
    StickyMessageListCommand,
    SelfDiagnosisCommand,
    ServerDiagnosisCommand,
    MeCommand,
    // Phase 5: 친밀도/베프
    BestFriendCommand,
    AffinityCommand,
    // Phase 5: 사생활
    PrivacyCommand,
  ],
})
export class BotCommandModule {}
```

`BotCommandModule`은 이미 `apps/bot/src/bot.module.ts` 또는 `app.module.ts`에 import되어 있으므로 추가 작업 없음 (verify 필요).

### 7-2. `BotApiClientModule` import 확인

`BotApiClientService`는 `BotCommandModule` 내부의 모든 커맨드가 주입받는다. 기존 `MeCommand`/`StickyMessageDeleteCommand`/`*DiagnosisCommand`가 정상 동작 중이므로 추가 import 불필요.

---

## 8. 코드 컨벤션 준수 체크리스트

| 항목 | 준수 방법 |
|------|----------|
| ESLint `any` 금지 | 모든 응답 타입을 `BestFriendCardResponse`/`AffinityCardResponse`/`UserPrivacyResponse`로 명시. `interaction.options.getXxx()` 결과는 discord.js 제공 타입 그대로 사용 |
| `type import` 분리 | `import type { ... } from '@onyu/bot-api-client'` — 응답 타입만 type import. 서비스 클래스는 일반 import |
| `me.command.ts` 컨벤션 답습 | `private readonly logger = new Logger(...)`, `await interaction.deferReply()` 최우선, `try/catch` + `editReply` 친화 메시지 |
| 함수 50줄 제한 | `affinity.command.ts`는 분기가 많으므로 헬퍼 메서드 분리:<br>- `private buildLinkButtonRow(guildId): ActionRowBuilder<ButtonBuilder>`<br>- `private async handleErrorCode(interaction, errorCode, days): Promise<void>`<br>- `private async renderCard(interaction, response, guildId): Promise<void>` |
| Boolean 변수명 | `isSelfIncluded`, `hasManageGuild` 등 `is`/`has` 접두사 사용 |
| 함수명 동사 시작 | `onBestFriend`, `onAffinity`, `onPrivacy`, `buildLinkButtonRow`, `handleErrorCode` |
| catch 블록 | `error instanceof Error` 분기 후 메시지 추출 |
| `as` 단언 | `interaction.member as GuildMember` (me.command.ts 패턴 답습 — 주석으로 사유 명시) |
| 한국어 주석/메시지 | description 한글 별칭, 사용자 응답 메시지 한국어 |
| 매직 넘버 | 상수 추출: `const DEFAULT_PERIOD = 30`, `const DEFAULT_LIMIT = 5`, `const MIN_LIMIT = 3`, `const MAX_LIMIT = 5`, `const WEB_URL = process.env['WEB_URL'] ?? 'https://onyu.app'` |

---

## 9. 테스트 계획

### 9-1. 단위 테스트 (선택, 우선순위 낮음)

Bot 슬래시 커맨드는 discord.js `Interaction` 모킹 비용이 높고, 기존 `MeCommand` 등에도 단위 테스트가 작성되어 있지 않다. 본 plan에서도 단위 테스트는 **작성하지 않는다**.

대신 다음 단위만 별도 테스트 가능 (선택):
- `BotApiClientService.getMyBestFriends()` — `HttpService.post` 모킹하여 URLSearchParams 인코딩 검증
- `BotApiClientService.getAffinity()` — 동일
- `BotApiClientService.upsertUserPrivacy()` — body 직렬화 검증

### 9-2. 수동 검증 (필수)

#### `/best-friend`
- [ ] DM에서 호출 시 "서버에서만 사용 가능" ephemeral
- [ ] 길드에서 옵션 없이 호출 시 30일·5명 카드 정상 출력
- [ ] `period:7 limit:3` 옵션 반영 확인
- [ ] `private:true` 시 ephemeral, `false` 시 공개 메시지
- [ ] 신규 유저(데이터 0건)에서 텍스트 메시지 + Link 버튼 출력
- [ ] API 미가동 시 "베스트 프렌드 조회 중 오류가 발생했습니다." 응답
- [ ] Link 버튼 클릭 시 `${WEB_URL}/dashboard/guild/{guildId}/co-presence` 이동

#### `/affinity`
- [ ] `user:@타인` 단일 지정 시 (실행자 vs 타인) 카드 정상
- [ ] `user:@타인A user2:@타인B` 지정 시 — 일반 유저: `NOT_PERMITTED` 응답 → ephemeral 텍스트
- [ ] `user:@타인A user2:@타인B` + 길드 토글 ON: 카드 정상
- [ ] `user:@타인A user2:@타인B` + ManageGuild 권한자: 토글과 무관하게 카드 정상
- [ ] 비공개 사용자 포함: ephemeral "비공개 설정된 사용자가 포함되어 있습니다."
- [ ] 같은 유저 중복 지정: ephemeral 사전 차단
- [ ] `user:@자기자신` 시 user2 미지정: 자기 자신 비교 차단 메시지
- [ ] 데이터 0건: "두 분은 아직 함께한 음성 기록이 없어요." 출력

#### `/privacy`
- [ ] `relationship-share:false` 호출 → "비공개로 설정되었습니다" ephemeral
- [ ] `relationship-share:true` 호출 → "공개로 설정되었습니다" ephemeral
- [ ] 직후 다른 유저가 `/best-friend` 실행 시 비공개 본인 익명화 확인 (cross-feature)
- [ ] API 실패 시 "사생활 설정 변경 중 오류가 발생했습니다." 응답

#### 공통
- [ ] 슬래시 커맨드 등록 확인 — Discord Developer Portal에 `best-friend`, `affinity`, `privacy` 3종 신규 노출
- [ ] 한국어 자동완성 확인 — Discord 클라이언트 한국어 설정 시 `친한친구`/`친밀도`/`사생활` 별칭 동작
- [ ] 응답 시간 < 3초 — 모든 커맨드는 `deferReply()` 최우선 호출, 3초 timeout 회피

---

## 10. 구현 순서 (PR 단위)

### PR 1: libs 단독 — 타입/메서드 추가 (Part D-4 선행)

- `libs/bot-api-client/src/types.ts` — `CanvasCardResponse`, `BestFriendCardResponse`, `AffinityCardResponse`, `UpsertUserPrivacyDto`, `UserPrivacyResponse` 추가
- `libs/bot-api-client/src/bot-api-client.service.ts` — 메서드 3종 추가
- `MeProfileResponse`를 `CanvasCardResponse` 별칭으로 치환, `me.command.ts` 컴파일 검증

**검증**: `pnpm --filter @onyu/bot-api-client build` 통과, `pnpm --filter @onyu/bot lint` 통과

### PR 2: Bot 슬래시 커맨드 3종 추가

- DTO 6개 + Command 3개 신규 작성
- `bot-command.module.ts`에 provider 3종 추가
- 단위 테스트 미작성 (CLAUDE.md 가이드: 오버엔지니어링 회피)

**검증**: 로컬 봇 기동 후 §9-2 수동 체크리스트 수행. API 미존재 시점에서는 catch 분기 동작 확인까지만.

### PR 3: 통합 검증 (voice-co-presence Phase 5-1 머지 후)

- API 측 엔드포인트가 머지된 후 정상 응답 흐름·0건 흐름·`PRIVATE`/`NOT_PERMITTED` 흐름 전수 점검
- 코드 변경 없음

---

## 11. 트레이드오프 및 결정 기록

| 항목 | 결정 | 근거 |
|------|------|------|
| Bot 측 권한 검증(ManageGuild) | **하지 않음, 서버에 위임** | 길드 토글(`GuildCoPresenceConfig.allowPublicAffinityQuery`) 조회를 Bot에서 캐싱·동기화하는 비용이 높고, 보안 결정은 서버가 단일 진실 소스 |
| 친구 모듈 분리 (`FriendCommandModule`) | **분리 안 함, `BotCommandModule`에 통합** | Bot 커맨드가 아직 도메인별 모듈로 분리된 적이 없음. 향후 폭증 시 일괄 분리 |
| `/privacy`를 `/best-friend` 서브커맨드로 통합 | **하지 않음, 단독 커맨드 유지** | 사생활 설정은 친밀도와 무관한 잠재 확장 가능성(예: 음성 통계 비공개)이 있어 독립 커맨드가 명확 |
| Canvas 응답 LRU 캐시 (Bot 측) | **두지 않음** | 캐시는 API 측 인메모리 LRU에서 처리(Part D 명시). Bot은 stateless |
| 단위 테스트 작성 | **하지 않음** | 기존 Bot 커맨드 단위 테스트 부재. discord.js Interaction 모킹 비용 대비 가치 낮음 |
| `MeProfileResponse` 호환성 | **`type` alias로 치환** | 기존 `me.command.ts`의 `result.data.imageBase64` 접근이 그대로 유지됨 — 컴파일 검증으로 확인 |

---

## 12. 출력물 요약

- 신규 Bot 파일: 6개 (커맨드 3 + DTO 3)
- 신규 libs 타입: 5개 (`CanvasCardResponse`, `BestFriendCardResponse`, `AffinityCardResponse`, `UpsertUserPrivacyDto`, `UserPrivacyResponse`)
- 신규 libs 메서드: 3개 (`getMyBestFriends`, `getAffinity`, `upsertUserPrivacy`)
- 수정 파일: 2개 (`bot-api-client.service.ts`, `types.ts`, `bot-command.module.ts` — 실질 수정 3개이지만 libs 파일은 단독 PR로 분리)

PR 분할: **3개** (libs → Bot 커맨드 → 통합 검증).

---

## 13. 참고 자산

| 자산 | 경로 | 용도 |
|------|------|------|
| 캔버스 첨부 패턴 | `apps/bot/src/command/me.command.ts` | 답습 대상 (deferReply → API 호출 → AttachmentBuilder → editReply) |
| DTO 분리 패턴 | `apps/bot/src/command/sticky-message/sticky-message-delete.dto.ts` | `@Param`, `@Channel` 데코레이터 사용 예 |
| Embed + Link 버튼 패턴 | `apps/bot/src/command/voice-analytics/server-diagnosis.command.ts` | `ActionRowBuilder<ButtonBuilder>` Link 버튼 헬퍼 |
| BotApiClient 패턴 | `libs/bot-api-client/src/bot-api-client.service.ts` | URLSearchParams + post/get/delete |
| 응답 셰이프 | `MeProfileResponse` (`libs/bot-api-client/src/types.ts:255`) | `CanvasCardResponse`로 통일할 베이스 |
| BotCommandModule | `apps/bot/src/command/bot-command.module.ts` | provider 등록 위치 |
