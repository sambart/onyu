# Bot/API 분리 누락 기능 수정 계획

> **상태: ✅ 완료 (2026-03-20)**

## 개요

Phase 3에서 API의 `DiscordEventsModule`(13개 핸들러)을 삭제하고 Bot으로 대체했으나, 감사 결과 **다수의 기능이 누락**되었다. 이 계획은 누락된 기능을 복구하여 기존과 동일한 동작을 보장한다.

### 완료 요약

모든 수정 항목(A~D)이 구현 완료됨. 수정 B/C는 계획서의 "API에 핸들러 복원" 전략 대신, Bot/API 분리 원칙에 맞는 **Bot=Discord 응답, API=비즈니스 로직** 패턴으로 구현됨.

| 수정 | 항목 | 구현 방식 |
|------|------|----------|
| A | Voice 이벤트 처리 완전 복구 | 계획대로 — BotVoiceEventListener + 확장 DTO |
| B | AutoChannel 인터랙션 복구 | 변경 — Bot 인터랙션 핸들러 + API HTTP 엔드포인트 |
| C | StatusPrefix 인터랙션 복구 | 변경 — Bot 인터랙션 핸들러 + API HTTP 엔드포인트 |
| D | Newbie 환영인사/역할 부여 복구 | 계획대로 — Bot에서 직접 Discord API 호출 + API config 엔드포인트 |

---

## 1. 전제 조건

### 현재 상태

| 항목 | 위치 | 상태 |
|------|------|------|
| Bot voice dispatcher | `apps/bot/src/event/voice/bot-voice-state.dispatcher.ts` | 단순 이벤트 분류만 수행 (제외 채널 미필터링) |
| API voice 컨트롤러 | `apps/api/src/bot-api/voice/bot-voice.controller.ts` | `eventEmitter.emitAsync('bot-api.voice.*')` 발행하지만 수신자 없음 |
| Bot newbie handler | `apps/bot/src/event/newbie/bot-newbie-member-add.handler.ts` | `createMissionFromBot()`만 호출 (환영인사/역할 누락) |
| Bot newbie interaction | `apps/bot/src/event/newbie/bot-newbie-interaction.handler.ts` | 정상 동작 |
| Bot sticky-message | `apps/bot/src/event/sticky-message/bot-sticky-message.handler.ts` | 정상 동작 |
| Bot channel-state | `apps/bot/src/event/channel/bot-channel-state.handler.ts` | 정상 동작 (로깅만) |
| Auto-channel interaction | 삭제됨 | Bot에 대체 핸들러 없음 |
| Auto-channel channel-empty | 삭제됨 | Bot에 대체 핸들러 없음 |
| StatusPrefix interaction | 모듈 등록 해제됨 | Bot에 대체 핸들러 없음 |

### 삭제된 핸들러 vs Bot 대체 상태

| # | 삭제된 핸들러 | Bot 대체 | API 수신자 | 결과 |
|---|-------------|---------|-----------|------|
| 1 | VoiceStateDispatcher | BotVoiceStateDispatcher | BotVoiceController → `emitAsync` | **수신자 없음 → 서비스 미호출** |
| 2 | VoiceJoinHandler | — | — | **`voiceChannelService.onUserJoined()` 미호출** |
| 3 | VoiceLeaveHandler | — | — | **`voiceChannelService.onUserLeave()` + `restoreOnLeave()` 미호출** |
| 4 | VoiceMoveHandler | — | — | **`voiceChannelService.onUserMove()` 미호출** |
| 5 | MicToggleHandler | — | — | **`voiceChannelService.onUserMicToggle()` 미호출** |
| 6 | VoiceAloneHandler | — | — | **`sessionService.updateAloneForChannel()` 미호출** |
| 7 | NewbieMemberAddHandler | BotNewbieMemberAddHandler | BotNewbieController | **환영인사/역할 누락** |
| 8 | NewbieInteractionHandler | BotNewbieInteractionHandler | BotNewbieController | 정상 |
| 9 | StickyMessageHandler | BotStickyMessageHandler | BotStickyMessageController | 정상 |
| 10 | ChannelStateHandler | BotChannelStateHandler | — | 정상 (로깅만) |
| 11 | AutoChannelInteractionHandler | **없음** | — | **자동방 버튼 미작동** |
| 12 | AutoChannelChannelEmptyHandler | **없음** | — | **빈 자동방 삭제 미작동** |
| 13 | StatusPrefixInteractionHandler | **없음** | — | **상태 접두사 버튼 미작동** |

---

## 2. 수정 항목 및 생성/수정 파일 목록

### 수정 A: Voice 이벤트 처리 완전 복구 (CRITICAL)

**문제:** Bot이 voice 이벤트를 API로 전달하지만, API에서 이를 받아 기존 서비스를 호출하는 리스너가 없음. 또한 제외 채널 필터링, ALONE_CHANGED, CHANNEL_EMPTY 이벤트가 누락됨.

**전략:** 기존 VoiceStateDispatcher의 복잡한 로직(제외 채널 4가지 분기, alone 감지, auto-channel empty)은 **API 측 리스너에서 재현**한다. Bot은 원시 VoiceState 데이터를 풍부하게(DTO 확장) 전달하고, API가 판단한다.

#### 신규 생성

```
libs/bot-api-client/src/types.ts                                     — VoiceStateUpdateDto 필드 확장
apps/api/src/bot-api/voice/bot-voice-event.listener.ts               — @OnEvent 수신 → 서비스 호출
```

#### 기존 수정

```
apps/bot/src/event/voice/bot-voice-state.dispatcher.ts               — 확장 DTO 전달 (channelName, alone 등)
apps/api/src/bot-api/voice/bot-voice.controller.ts                   — 확장 DTO 수신, 이벤트명 세분화
apps/api/src/bot-api/bot-api.module.ts                               — 리스너 등록, 모듈 import 추가
```

#### 구현 상세

**2-A-1. VoiceStateUpdateDto 확장** (`libs/bot-api-client/src/types.ts`)

기존 VoiceStateDto의 모든 필드를 포함하도록 확장:

```typescript
export interface VoiceStateUpdateDto {
  guildId: string;
  userId: string;
  channelId: string | null;
  oldChannelId: string | null;
  eventType: 'join' | 'leave' | 'move' | 'mic_toggle';

  // 확장 필드 (기존 VoiceStateDto 대응)
  userName: string;
  channelName: string | null;
  oldChannelName: string | null;
  parentCategoryId: string | null;
  categoryName: string | null;
  oldParentCategoryId: string | null;
  oldCategoryName: string | null;
  micOn: boolean;
  channelMemberCount: number;
  oldChannelMemberCount: number;
  avatarUrl: string | null;
}
```

**2-A-2. Bot voice dispatcher 보강** (`apps/bot/src/event/voice/bot-voice-state.dispatcher.ts`)

Bot에서 Discord VoiceState 객체로부터 모든 필드를 추출하여 DTO에 포함:

```typescript
const dto: VoiceStateUpdateDto = {
  guildId,
  userId,
  channelId,
  oldChannelId,
  eventType,
  userName: newState.member?.displayName ?? '',
  channelName: newState.channel?.name ?? null,
  oldChannelName: oldState.channel?.name ?? null,
  parentCategoryId: newState.channel?.parentId ?? null,
  categoryName: newState.channel?.parent?.name ?? null,
  oldParentCategoryId: oldState.channel?.parentId ?? null,
  oldCategoryName: oldState.channel?.parent?.name ?? null,
  micOn: !(newState.selfMute ?? false),
  channelMemberCount: newState.channel?.members.filter(m => !m.user.bot).size ?? 0,
  oldChannelMemberCount: oldState.channel?.members.filter(m => !m.user.bot).size ?? 0,
  avatarUrl: newState.member?.displayAvatarURL({ size: 128 }) ?? null,
};
```

**2-A-3. API voice 이벤트 리스너** (`apps/api/src/bot-api/voice/bot-voice-event.listener.ts`)

기존 VoiceStateDispatcher + VoiceJoin/Leave/Move/MicToggle/AloneHandler의 로직을 통합:

```typescript
@Injectable()
export class BotVoiceEventListener {
  constructor(
    private readonly voiceChannelService: VoiceChannelService,
    private readonly voiceSessionService: VoiceSessionService,
    private readonly excludedChannelService: VoiceExcludedChannelService,
    private readonly statusPrefixResetService: StatusPrefixResetService,
    private readonly autoChannelService: AutoChannelService,
  ) {}

  @OnEvent('bot-api.voice.state-update')
  async handle(dto: VoiceStateUpdateDto): Promise<void> {
    // 1. 제외 채널 필터링 (기존 dispatcher의 4가지 move 분기)
    // 2. VoiceStateDto 구성 (기존 VoiceStateDto.fromVoiceState 대체)
    // 3. 이벤트 타입별 서비스 호출
    //    - join → voiceChannelService.onUserJoined(state)
    //    - leave → voiceChannelService.onUserLeave(state) + statusPrefixResetService.restoreOnLeave()
    //    - move → voiceChannelService.onUserMove(oldState, newState)
    //    - mic_toggle → voiceChannelService.onUserMicToggle(state)
    // 4. ALONE_CHANGED 처리 (channelMemberCount 기반)
    //    - memberCount ≤ 2 → sessionService.updateAloneForChannel()
    // 5. CHANNEL_EMPTY 처리 (leave/move 시 oldChannelMemberCount === 0)
    //    - autoChannelService.handleChannelEmpty() fire-and-forget
  }
}
```

**제외 채널 필터링 로직 상세** (기존 dispatcher에서 이식):

```
move 이벤트:
  oldExcluded = excludedChannelService.isExcludedChannel(guildId, oldChannelId, oldParentCategoryId)
  newExcluded = excludedChannelService.isExcludedChannel(guildId, channelId, parentCategoryId)

  !oldExcluded && !newExcluded → MOVE 처리
  oldExcluded && !newExcluded  → JOIN 처리 (excluded → normal)
  !oldExcluded && newExcluded  → LEAVE 처리 (normal → excluded)
  oldExcluded && newExcluded   → 무시

join 이벤트:
  excluded = isExcludedChannel(guildId, channelId, parentCategoryId)
  excluded → 무시

leave 이벤트:
  excluded = isExcludedChannel(guildId, oldChannelId, oldParentCategoryId)
  excluded → 무시

mic_toggle 이벤트:
  excluded = isExcludedChannel(guildId, channelId, parentCategoryId)
  excluded → 무시
```

**VoiceStateDto 구성** (기존 `VoiceStateDto.fromVoiceState` 대체):

```typescript
private buildVoiceStateDto(dto: VoiceStateUpdateDto, useOld = false): VoiceStateDto {
  return new VoiceStateDto(
    dto.guildId,
    dto.userId,
    useOld ? dto.oldChannelId! : dto.channelId!,
    dto.userName,
    useOld ? dto.oldChannelName! : dto.channelName!,
    useOld ? dto.oldParentCategoryId : dto.parentCategoryId,
    useOld ? dto.oldCategoryName : dto.categoryName,
    dto.micOn,
    (useOld ? dto.oldChannelMemberCount : dto.channelMemberCount) === 1,
    useOld ? dto.oldChannelMemberCount : dto.channelMemberCount,
    dto.avatarUrl,
  );
}
```

**ALONE_CHANGED 처리:**

```typescript
private handleAloneChanged(
  guildId: string,
  channelId: string | null,
  memberCount: number,
): void {
  if (!channelId || memberCount > 2) return;
  // memberCount 기반으로 alone 상태 판단
  // 정확한 memberIds는 Bot에서 전달해야 함 → DTO에 추가 필요
}
```

> **주의:** 기존 `VoiceAloneHandler`는 `memberIds: string[]`과 `isAlone: boolean`을 사용한다. `sessionService.updateAloneForChannel(guildId, memberIds, isAlone)` 시그니처에 맞추려면 Bot에서 채널 멤버 ID 목록도 전달해야 한다.

**추가 DTO 필드:**

```typescript
// VoiceStateUpdateDto에 추가
channelMemberIds: string[];       // 현재 채널의 봇 제외 멤버 ID 목록
oldChannelMemberIds: string[];    // 이전 채널의 봇 제외 멤버 ID 목록
```

**BotVoiceController 수정:**

기존 이벤트명 세분화(`bot-api.voice.join` 등)를 제거하고 단일 이벤트명 `bot-api.voice.state-update`로 통합:

```typescript
@Post('state-update')
async handleVoiceStateUpdate(@Body() dto: VoiceStateUpdateDto): Promise<{ ok: boolean }> {
  await this.eventEmitter.emitAsync('bot-api.voice.state-update', dto);
  return { ok: true };
}
```

#### 의존성

```
BotVoiceEventListener
├── VoiceChannelService          (VoiceChannelModule export)
├── VoiceSessionService          (VoiceChannelModule export)
├── VoiceExcludedChannelService  (VoiceChannelModule export)
├── StatusPrefixResetService     (StatusPrefixModule export)
└── AutoChannelService           (AutoChannelModule export)
```

`BotApiModule`에 `VoiceChannelModule`, `StatusPrefixModule`, `AutoChannelModule` import 필요.

---

### 수정 B: Auto-channel 인터랙션 핸들러 복구 (CRITICAL)

**문제:** `auto_btn:`, `auto_sub:` 접두사 버튼 인터랙션을 처리하는 핸들러가 Bot에 없음.

**전략:** `autoChannelService.handleButtonClick(interaction)`, `handleSubOptionClick(interaction)`은 `ButtonInteraction` 객체를 직접 사용하여 Discord 음성 채널을 생성하고 응답한다. 이 로직은 **Discord API 호출이 핵심**이므로 Bot에서 직접 처리할 수 없고, API가 Discord Client를 통해 처리해야 한다. API에 `DiscordModule.forRootAsync()`가 아직 유지되고 있으므로, **API의 `AutoChannelModule`에 인터랙션 핸들러를 다시 등록**한다.

#### 기존 수정

```
apps/api/src/channel/auto/auto-channel.module.ts — AutoChannelInteractionHandler, AutoChannelChannelEmptyHandler 재등록
```

#### 구현 상세

`AutoChannelModule.providers`에 핸들러 재등록:

```typescript
// auto-channel.module.ts providers에 복구
AutoChannelChannelEmptyHandler,
AutoChannelInteractionHandler,
```

> 이 핸들러들은 `apps/api/src/event/auto-channel/` 디렉토리에서 삭제되었으므로, 기존 코드를 git에서 복원하거나 `AutoChannelModule` 내부로 이동한다.

**복원 대상 파일:**

```
apps/api/src/event/auto-channel/auto-channel-events.ts                — 이벤트 상수/클래스
apps/api/src/event/auto-channel/auto-channel-channel-empty.handler.ts — CHANNEL_EMPTY 핸들러
apps/api/src/event/auto-channel/auto-channel-interaction.handler.ts   — 버튼 인터랙션 핸들러
```

---

### 수정 C: StatusPrefix 인터랙션 핸들러 복구 (HIGH)

**문제:** `status_prefix:`, `status_reset:` 접두사 버튼 인터랙션 핸들러가 모듈에서 등록 해제됨.

**전략:** 수정 B와 동일 — API에 `DiscordModule`이 아직 유지되므로, `StatusPrefixModule`에 핸들러를 다시 등록한다.

#### 기존 수정

```
apps/api/src/status-prefix/status-prefix.module.ts — StatusPrefixInteractionHandler 재등록
```

#### 구현 상세

`StatusPrefixModule.providers`에 핸들러 재등록:

```typescript
StatusPrefixInteractionHandler,
```

> 이 파일은 삭제되지 않고 `apps/api/src/status-prefix/interaction/status-prefix-interaction.handler.ts`에 존재한다. 모듈 등록만 복구하면 된다.

---

### 수정 D: Newbie member-add 환영인사/역할 부여 복구 (HIGH)

**문제:** `createMissionFromBot()`만 호출되어 환영인사와 역할 부여가 누락됨.

**전략:** `welcomeService.sendWelcomeMessage(member, config)`와 `roleService.assignRole(member, config)`는 `GuildMember` 객체가 필요하다. Bot에서 GuildMember를 HTTP로 직렬화할 수 없으므로, **Bot에서 직접 Discord API를 호출**하여 환영인사와 역할 부여를 수행한다.

#### 신규 생성

```
apps/api/src/bot-api/newbie/dto/newbie-config-response.dto.ts — 설정 응답 DTO
```

#### 기존 수정

```
apps/bot/src/event/newbie/bot-newbie-member-add.handler.ts  — 환영인사/역할 부여 로직 추가
apps/api/src/bot-api/newbie/bot-newbie.controller.ts        — GET /bot-api/newbie/config 엔드포인트 추가
libs/bot-api-client/src/bot-api-client.service.ts           — getNewbieConfig() 메서드 추가
libs/bot-api-client/src/types.ts                            — NewbieConfigDto 추가
```

#### 구현 상세

**Bot member-add handler 보강:**

```typescript
@On('guildMemberAdd')
async handleGuildMemberAdd(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;

  // 1. API에서 설정 조회
  const config = await this.apiClient.getNewbieConfig(guildId);
  if (!config) return;

  // 2. 환영인사 (Bot에서 직접 Discord 메시지 전송)
  if (config.welcomeEnabled && config.welcomeChannelId) {
    // 환영 메시지 템플릿 치환 + 채널에 전송
  }

  // 3. 미션 생성 (API 호출)
  if (config.missionEnabled) {
    await this.apiClient.sendMemberJoin({ guildId, memberId: member.id, displayName: member.displayName });
  }

  // 4. 역할 부여 (Bot에서 직접 Discord API 호출)
  if (config.roleEnabled && config.newbieRoleId) {
    await member.roles.add(config.newbieRoleId);
    // API에 역할 부여 사실 통보 (NewbiePeriod 레코드 생성)
    await this.apiClient.notifyRoleAssigned({ guildId, memberId: member.id });
  }
}
```

---

## 3. 의존성 그래프

```
Discord voiceStateUpdate
    │
    ▼
[Bot] BotVoiceStateDispatcher
    │  확장 DTO (channelName, alone, memberIds 등)
    ▼
[API] POST /bot-api/voice/state-update
    │
    ▼
[API] BotVoiceController → eventEmitter.emitAsync('bot-api.voice.state-update', dto)
    │
    ▼
[API] BotVoiceEventListener (@OnEvent)
    ├── 제외 채널 필터링 (VoiceExcludedChannelService)
    ├── VoiceStateDto 구성
    ├── join  → VoiceChannelService.onUserJoined(state)
    ├── leave → VoiceChannelService.onUserLeave(state)
    │          + StatusPrefixResetService.restoreOnLeave() [fire-and-forget]
    ├── move  → VoiceChannelService.onUserMove(oldState, newState)
    ├── mic_toggle → VoiceChannelService.onUserMicToggle(state)
    ├── ALONE  → VoiceSessionService.updateAloneForChannel(guildId, memberIds, isAlone)
    └── EMPTY  → AutoChannelService.handleChannelEmpty(guildId, channelId) [fire-and-forget]


Discord interactionCreate (auto_btn:, auto_sub:)
    │
    ▼
[API] AutoChannelInteractionHandler (@On)  ← 복원됨
    ├── autoChannelService.handleButtonClick(interaction)
    └── autoChannelService.handleSubOptionClick(interaction)


Discord interactionCreate (status_prefix:, status_reset:)
    │
    ▼
[API] StatusPrefixInteractionHandler (@On)  ← 재등록됨
    ├── applyService.apply(interaction)
    └── resetService.reset(interaction)


Discord guildMemberAdd
    │
    ▼
[Bot] BotNewbieMemberAddHandler
    ├── API GET /bot-api/newbie/config → 설정 조회
    ├── [Bot 직접] 환영 메시지 전송
    ├── API POST /bot-api/newbie/member-join → 미션 생성
    └── [Bot 직접] member.roles.add() → 역할 부여
```

---

## 4. 기존 코드와의 충돌 검토

| 항목 | 충돌 위험 | 판단 |
|------|-----------|------|
| `bot-api.voice.state-update` 이벤트명 변경 | 없음 | 기존 `bot-api.voice.join` 등은 수신자가 없었으므로 단일 이벤트명으로 통합해도 문제 없음 |
| AutoChannel 핸들러 복원 | 없음 | git에서 삭제된 파일을 복원하므로 기존 코드와 동일 |
| StatusPrefix 핸들러 재등록 | 없음 | 파일은 존재하며 모듈 등록만 복구 |
| Bot voice dispatcher DTO 확장 | 없음 | 기존 필드는 유지하고 추가 필드만 더함 |
| `BotApiModule` import 추가 | 없음 | VoiceChannelModule, StatusPrefixModule, AutoChannelModule 추가 (순환 의존 없음) |
| VoiceStateDto 직접 생성 | 주의 | `VoiceStateDto.fromVoiceState()`는 Discord VoiceState 객체 필요. API에서는 DTO로부터 직접 `new VoiceStateDto(...)` 생성 |
| ALONE memberIds 전달 | 주의 | Bot에서 채널 멤버 ID 목록을 수집하여 DTO에 포함해야 함 |

---

## 5. 구현 순서

```
Step 1: VoiceStateUpdateDto 확장 (libs/bot-api-client/src/types.ts)
    └── channelName, memberIds, alone 관련 필드 추가

Step 2: Bot voice dispatcher 보강 (apps/bot)
    └── 확장 필드 수집

Step 3: API voice 이벤트 리스너 생성 (apps/api/src/bot-api/voice/bot-voice-event.listener.ts)
    └── 제외 채널 필터링 + 서비스 호출 + alone + channel-empty

Step 4: API voice 컨트롤러 수정 (단일 이벤트명으로 통합)

Step 5: BotApiModule import 보강

Step 6: Auto-channel 핸들러 복원 (git restore + 모듈 재등록)

Step 7: StatusPrefix 핸들러 재등록

Step 8: Bot newbie handler 보강 (환영인사/역할 부여)
    └── API newbie config 엔드포인트 추가

Step 9: 컴파일 및 검증
```

Step 1~5는 Voice 복구 (순차 의존).
Step 6, 7은 독립 (병렬 가능).
Step 8은 독립.
Step 9는 전체 완료 후.

---

## 6. 검증 체크리스트

### Voice (수정 A)
- [ ] 음성 JOIN → `voiceChannelService.onUserJoined()` 호출됨
- [ ] 음성 LEAVE → `voiceChannelService.onUserLeave()` 호출됨
- [ ] 음성 MOVE → `voiceChannelService.onUserMove()` 호출됨
- [ ] MIC_TOGGLE → `voiceChannelService.onUserMicToggle()` 호출됨
- [ ] 제외 채널 진입 시 이벤트 무시됨
- [ ] 제외 → 일반 채널 이동 시 JOIN만 처리됨
- [ ] 일반 → 제외 채널 이동 시 LEAVE만 처리됨
- [ ] 채널에 1명 남으면 `updateAloneForChannel(memberIds, true)` 호출됨
- [ ] 채널에 2명 이상이면 `updateAloneForChannel(memberIds, false)` 호출됨
- [ ] voice-leave 시 `statusPrefixResetService.restoreOnLeave()` 호출됨
- [ ] 빈 채널 감지 시 `autoChannelService.handleChannelEmpty()` 호출됨

### Auto-channel (수정 B)
- [ ] `auto_btn:` 버튼 클릭 → `handleButtonClick()` 호출됨
- [ ] `auto_sub:` 버튼 클릭 → `handleSubOptionClick()` 호출됨
- [ ] 빈 대기방 자동 삭제됨
- [ ] 빈 확정방 자동 삭제됨

### StatusPrefix (수정 C)
- [ ] `status_prefix:` 버튼 → 닉네임 접두사 적용됨
- [ ] `status_reset:` 버튼 → 닉네임 복원됨

### Newbie (수정 D)
- [ ] 신입 멤버 가입 시 환영 메시지 발송됨
- [ ] 신입 멤버에게 역할 부여됨
- [ ] 미션 레코드 생성됨
