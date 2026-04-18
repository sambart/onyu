# Voice Extended Bot/API 분리 아키텍처 연동 계획

## 개요

Phase 1(streaming/video/deaf)과 Phase 2(게임 활동) 인프라는 API에 이미 구현되어 있으나, Bot/API 분리 아키텍처 이후 실제 동작을 위한 **연동 경로**가 빠져 있다.

- Bot이 Discord Gateway를 수신하고 API에 HTTP로 전달하는 구조
- API에는 Discord Gateway 연결이 없으므로 `GuildMember`, `VoiceState` 등 discord.js 객체 접근 불가
- `VoiceGameService`가 `GuildMember` 타입을 직접 요구하여 API에서 사용 불가

이 계획은 두 가지 문제를 해결한다:

- **문제 A**: 음성 입퇴장 시 Phase 1 상태(streaming/video/deaf) + 게임 세션 전달
- **문제 B**: CoPresence tick에서 게임 상태 갱신

---

## 현재 데이터 흐름 요약

```
[Discord Gateway]
    |
[Bot: BotVoiceStateDispatcher]    ──HTTP POST──>   [API: BotVoiceController]
    VoiceStateUpdateDto                                  |
                                                   EventEmitter('bot-api.voice.state-update')
                                                         |
                                                   [API: BotVoiceEventListener]
                                                         |
                                                   VoiceChannelService / VoiceSessionService

[Bot: BotCoPresenceScheduler]     ──HTTP POST──>   [API: BotCoPresenceController]
    CoPresenceSnapshot[]                                 |
    (guildId, channelId, userIds[])               CoPresenceService.reconcile()
```

---

## Step 1: VoiceStateUpdateDto 확장 (Phase 1 + Phase 2 필드 추가)

### 수정 대상: `libs/bot-api-client/src/types.ts`

**변경 내용**:
- `eventType`에 `'streaming_toggle' | 'video_toggle' | 'deaf_toggle'` 3개 추가
- Phase 1 필드 3개 추가: `streaming`, `selfVideo`, `selfDeaf`
- Phase 2 필드 2개 추가 (optional): `gameName`, `gameApplicationId`

```typescript
export interface VoiceStateUpdateDto {
  guildId: string;
  userId: string;
  channelId: string | null;
  oldChannelId: string | null;
  eventType:
    | 'join'
    | 'leave'
    | 'move'
    | 'mic_toggle'
    | 'streaming_toggle'    // Phase 1 추가
    | 'video_toggle'        // Phase 1 추가
    | 'deaf_toggle';        // Phase 1 추가

  // 기존 필드 (생략 없이 유지)
  userName: string;
  channelName: string | null;
  oldChannelName: string | null;
  parentCategoryId: string | null;
  categoryName: string | null;
  oldParentCategoryId: string | null;
  oldCategoryName: string | null;
  micOn: boolean;
  avatarUrl: string | null;
  channelMemberCount: number;
  oldChannelMemberCount: number;
  channelMemberIds: string[];
  oldChannelMemberIds: string[];

  // Phase 1 추가
  streaming: boolean;
  selfVideo: boolean;
  selfDeaf: boolean;

  // Phase 2 추가 (optional -- 게임 중이 아닐 수 있음)
  gameName?: string | null;
  gameApplicationId?: string | null;
}
```

**하위 호환**: 기존 `eventType` 4개는 그대로 유지. Phase 1/2 필드가 없는 요청도 API에서 안전하게 처리 (boolean은 `?? false`, optional은 null 처리).

---

## Step 2: Bot 디스패처 확장

### 수정 대상: `apps/bot/src/event/voice/bot-voice-state.dispatcher.ts`

**변경 내용**:

1. `eventType` 분류에 streaming/video/deaf 토글 감지 추가
2. 모든 이벤트에 Phase 1 필드(streaming, selfVideo, selfDeaf) 포함
3. join 이벤트에 게임 활동 정보 포함

```typescript
@On('voiceStateUpdate')
async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  try {
    const guildId = newState.guild.id;
    const userId = newState.member?.id ?? newState.id;
    const channelId = newState.channelId;
    const oldChannelId = oldState.channelId;

    let eventType: VoiceStateUpdateDto['eventType'];
    if (!oldChannelId && channelId) {
      eventType = 'join';
    } else if (oldChannelId && !channelId) {
      eventType = 'leave';
    } else if (oldChannelId && channelId && oldChannelId !== channelId) {
      eventType = 'move';
    } else if (oldState.selfMute !== newState.selfMute) {
      eventType = 'mic_toggle';
    } else if ((oldState.streaming ?? false) !== (newState.streaming ?? false)) {
      eventType = 'streaming_toggle';     // Phase 1 추가
    } else if (oldState.selfVideo !== newState.selfVideo) {
      eventType = 'video_toggle';          // Phase 1 추가
    } else if (oldState.selfDeaf !== newState.selfDeaf) {
      eventType = 'deaf_toggle';           // Phase 1 추가
    } else {
      return;
    }

    // 게임 활동 추출 (join/move 시)
    const gameActivity = this.extractPlayingActivity(newState.member);

    // 현재 채널 멤버 정보 (봇 제외)
    const channelHumanMembers = newState.channel
      ? [...newState.channel.members.values()].filter((m) => !m.user.bot)
      : [];
    const oldChannelHumanMembers = oldState.channel
      ? [...oldState.channel.members.values()].filter((m) => !m.user.bot)
      : [];

    await this.apiClient.sendVoiceStateUpdate({
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
      avatarUrl: newState.member?.displayAvatarURL({ size: 128 }) ?? null,

      channelMemberCount: channelHumanMembers.length,
      oldChannelMemberCount: oldChannelHumanMembers.length,
      channelMemberIds: channelHumanMembers.map((m) => m.id),
      oldChannelMemberIds: oldChannelHumanMembers.map((m) => m.id),

      // Phase 1 필드
      streaming: newState.streaming ?? false,
      selfVideo: newState.selfVideo,
      selfDeaf: newState.selfDeaf,

      // Phase 2 필드 (join/move 시에만 의미 있지만, 항상 포함)
      gameName: gameActivity?.gameName ?? null,
      gameApplicationId: gameActivity?.applicationId ?? null,
    });
  } catch (err) {
    this.logger.error(
      `[BOT] voiceStateUpdate forwarding failed: guild=${newState.guild.id}`,
      err instanceof Error ? err.stack : err,
    );
  }
}

/** member.presence.activities에서 ActivityType.Playing 추출 */
private extractPlayingActivity(
  member: GuildMember | null,
): { gameName: string; applicationId: string | null } | null {
  if (!member) return null;
  const activities = member.presence?.activities;
  if (!activities) return null;

  const playing = activities.find((a) => a.type === ActivityType.Playing);
  if (!playing) return null;

  return {
    gameName: playing.name,
    applicationId: playing.applicationId ?? null,
  };
}
```

**import 추가**: `ActivityType`을 `discord.js`에서 import.

**주의**: streaming 감지 순서가 중요하다. `selfMute` 변경은 `mic_toggle`보다 앞에 있으므로, streaming/video/deaf 토글은 mic_toggle 이후에 배치하여 우선순위 충돌을 방지한다. 동시에 여러 필드가 변경되는 경우(예: 음성 채널 이동 시 streaming이 해제됨), join/leave/move가 먼저 매칭되므로 문제없다.

---

## Step 3: API 리스너 확장 (Phase 1 토글 + 게임 세션 처리)

### 수정 대상: `apps/api/src/bot-api/voice/bot-voice-event.listener.ts`

**변경 내용**:

1. `VoiceGameService` DI 추가
2. `VoiceStateUpdateEventDto` 인터페이스에 Phase 1/2 필드 추가
3. `handle()` switch에 `streaming_toggle`, `video_toggle`, `deaf_toggle` 케이스 추가
4. `handleJoin()`에서 `VoiceGameService.onUserJoined()` 호출 추가
5. `handleLeave()`에서 `VoiceGameService.onUserLeft()` 호출 추가
6. `buildStateDto()`에서 Phase 1 필드 매핑

#### 3-1. VoiceStateUpdateEventDto 확장

```typescript
interface VoiceStateUpdateEventDto {
  // ... 기존 필드 모두 유지 ...
  eventType:
    | 'join'
    | 'leave'
    | 'move'
    | 'mic_toggle'
    | 'streaming_toggle'
    | 'video_toggle'
    | 'deaf_toggle';

  // Phase 1 추가
  streaming?: boolean;
  selfVideo?: boolean;
  selfDeaf?: boolean;

  // Phase 2 추가
  gameName?: string | null;
  gameApplicationId?: string | null;
}
```

Phase 1/2 필드는 optional로 선언하여 하위 호환을 유지한다. 기존 Bot 버전에서 보내지 않는 경우 `?? false` / `?? null`로 처리.

#### 3-2. handle() switch 확장

```typescript
case 'streaming_toggle':
  await this.handleStreamingToggle(dto);
  break;
case 'video_toggle':
  await this.handleVideoToggle(dto);
  break;
case 'deaf_toggle':
  await this.handleDeafToggle(dto);
  break;
```

#### 3-3. 신규 핸들러 메서드 (Phase 1)

```typescript
private async handleStreamingToggle(dto: VoiceStateUpdateEventDto): Promise<void> {
  if (!dto.channelId) return;

  const isExcluded = await this.excludedChannelService.isExcludedChannel(
    dto.guildId,
    dto.channelId,
    dto.parentCategoryId,
  );
  if (isExcluded) return;

  const state = this.buildStateDto(dto, false);
  await this.voiceChannelService.onUserStreamingToggle(state);
}

// handleVideoToggle, handleDeafToggle도 동일 패턴
// voiceChannelService.onUserVideoToggle(state), onUserDeafToggle(state) 호출
```

#### 3-4. handleJoin() 게임 세션 추가

```typescript
private async handleJoin(dto: VoiceStateUpdateEventDto): Promise<void> {
  // ... 기존 로직 유지 (excludedChannel 체크, buildStateDto, onUserJoined, emitAloneChanged) ...

  // Phase 2: 게임 세션 시작 (fire-and-forget)
  if (dto.gameName) {
    this.voiceGameService
      .onUserJoined(dto.guildId, dto.userId, dto.channelId!, {
        gameName: dto.gameName,
        applicationId: dto.gameApplicationId ?? null,
      })
      .catch((err) =>
        this.logger.error('[VOICE GAME] onUserJoined failed', getErrorStack(err)),
      );
  }
}
```

#### 3-5. handleLeave() 게임 세션 종료 추가

```typescript
private async handleLeave(dto: VoiceStateUpdateEventDto): Promise<void> {
  // ... 기존 로직 유지 ...

  // Phase 2: 게임 세션 종료 (fire-and-forget)
  this.voiceGameService
    .onUserLeft(dto.guildId, dto.userId)
    .catch((err) =>
      this.logger.error('[VOICE GAME] onUserLeft failed', getErrorStack(err)),
    );
}
```

#### 3-6. handleMove() 게임 세션 처리

move 이벤트에서는 게임 세션의 `channelId`만 갱신하면 된다. 게임 자체가 변경되는 것은 아니므로 별도 처리가 필요 없다. 게임 세션의 channelId 갱신은 CoPresence tick에서 `reconcileForChannel`이 담당한다.

#### 3-7. buildStateDto() Phase 1 필드 매핑

```typescript
private buildStateDto(dto: VoiceStateUpdateEventDto, useOld: boolean): VoiceStateDto {
  return new VoiceStateDto(
    dto.guildId,
    dto.userId,
    useOld ? dto.oldChannelId! : dto.channelId!,
    dto.userName,
    useOld ? (dto.oldChannelName ?? '') : (dto.channelName ?? ''),
    useOld ? dto.oldParentCategoryId : dto.parentCategoryId,
    useOld ? dto.oldCategoryName : dto.categoryName,
    dto.micOn,
    (useOld ? dto.oldChannelMemberCount : dto.channelMemberCount) === 1,
    useOld ? dto.oldChannelMemberCount : dto.channelMemberCount,
    dto.avatarUrl,
    dto.streaming ?? false,       // Phase 1
    dto.selfVideo ?? false,       // Phase 1
    dto.selfDeaf ?? false,        // Phase 1
  );
}
```

현재 `buildStateDto()`는 11개 인자만 전달하고 있다. `VoiceStateDto` 생성자는 이미 14개 인자(streaming, videoOn, selfDeaf 포함)를 요구하므로, 누락된 3개 인자를 추가하면 된다.

---

## Step 4: VoiceGameService 시그니처 변경 (GuildMember 의존 제거)

### 수정 대상: `apps/api/src/channel/voice/application/voice-game.service.ts`

**핵심 변경**: `GuildMember` 타입 의존을 제거하고, 직렬화 가능한 인자로 대체.

#### 4-1. onUserJoined() 시그니처 변경

**변경 전**:
```typescript
async onUserJoined(
  guildId: string, userId: string, channelId: string, member: GuildMember,
): Promise<void>
```

**변경 후**:
```typescript
async onUserJoined(
  guildId: string,
  userId: string,
  channelId: string,
  activity: { gameName: string; applicationId: string | null },
): Promise<void>
```

`extractPlayingActivity` 호출을 제거하고, 이미 추출된 게임 활동 데이터를 직접 받는다. 게임 활동 추출은 Bot 디스패처(Step 2)에서 수행한다.

```typescript
async onUserJoined(
  guildId: string,
  userId: string,
  channelId: string,
  activity: { gameName: string; applicationId: string | null },
): Promise<void> {
  try {
    const session: VoiceGameSession = {
      gameName: activity.gameName,
      applicationId: activity.applicationId,
      startedAt: Date.now(),
      channelId,
    };
    await this.redisRepo.setGameSession(guildId, userId, session);
  } catch (error) {
    this.logger.error(
      `[VOICE GAME] onUserJoined guild=${guildId} user=${userId}`,
      getErrorStack(error),
    );
  }
}
```

#### 4-2. reconcileForChannel() 시그니처 변경

**변경 전**:
```typescript
async reconcileForChannel(
  guildId: string, channelId: string, members: GuildMember[],
): Promise<void>
```

**변경 후**:
```typescript
/** CoPresence tick에서 호출. 멤버별 게임 상태를 DTO로 전달받아 세션을 갱신한다. */
async reconcileForChannel(
  guildId: string,
  channelId: string,
  memberActivities: MemberGameActivity[],
): Promise<void>
```

`MemberGameActivity` 인터페이스 정의 (같은 파일 하단 또는 별도 타입 파일):

```typescript
export interface MemberGameActivity {
  userId: string;
  gameName: string | null;
  applicationId: string | null;
}
```

#### 4-3. reconcileMember() private 메서드 변경

**변경 전**: `GuildMember`에서 `extractPlayingActivity`로 게임 정보 추출

**변경 후**: `MemberGameActivity`에서 직접 게임 정보 참조

```typescript
private async reconcileMember(
  guildId: string,
  channelId: string,
  memberActivity: MemberGameActivity,
): Promise<void> {
  const currentActivity = memberActivity.gameName
    ? { gameName: memberActivity.gameName, applicationId: memberActivity.applicationId }
    : null;
  const currentSession = await this.redisRepo.getGameSession(guildId, memberActivity.userId);

  // ... 나머지 로직은 동일 (hasCurrentGame, hasActiveSession 판정 등) ...
  // member.id 대신 memberActivity.userId 사용
}
```

#### 4-4. extractPlayingActivity() 삭제

이 private 메서드는 `GuildMember`에 의존하므로 삭제한다. 게임 활동 추출 책임은 Bot 쪽으로 이동.

#### 4-5. import 정리

`discord.js`의 `ActivityType`, `GuildMember` import를 제거한다.

---

## Step 5: CoPresenceSnapshot DTO 확장 (게임 정보 포함)

### 수정 대상: `libs/bot-api-client/src/types.ts`

**변경 내용**:

```typescript
export interface CoPresenceSnapshot {
  guildId: string;
  channelId: string;
  userIds: string[];
  /** Phase 2: 멤버별 게임 활동 정보 (optional, 하위 호환) */
  memberActivities?: CoPresenceMemberActivity[];
}

export interface CoPresenceMemberActivity {
  userId: string;
  gameName: string | null;
  applicationId: string | null;
}
```

**하위 호환**: `memberActivities`를 optional로 선언하여 기존 Bot이 보내지 않아도 API에서 안전하게 무시.

---

## Step 6: Bot CoPresence 스케줄러 확장 (게임 정보 수집)

### 수정 대상: `apps/bot/src/scheduler/bot-co-presence.scheduler.ts`

**변경 내용**: `collectSnapshots()`에서 멤버별 게임 활동 정보를 함께 수집.

```typescript
private collectSnapshots(): CoPresenceSnapshot[] {
  const snapshots: CoPresenceSnapshot[] = [];

  for (const guild of this.client.guilds.cache.values()) {
    const voiceChannels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildVoice,
    );

    for (const channel of voiceChannels.values()) {
      if (channel.type !== ChannelType.GuildVoice) continue;

      const nonBotMembers = channel.members.filter((m) => !m.user.bot);
      if (nonBotMembers.size === 0) continue;

      // Phase 2: 멤버별 게임 활동 수집
      const memberActivities: CoPresenceMemberActivity[] = nonBotMembers.map((m) => {
        const playing = m.presence?.activities?.find(
          (a) => a.type === ActivityType.Playing,
        );
        return {
          userId: m.id,
          gameName: playing?.name ?? null,
          applicationId: playing?.applicationId ?? null,
        };
      });

      snapshots.push({
        guildId: guild.id,
        channelId: channel.id,
        userIds: nonBotMembers.map((m) => m.id),
        memberActivities,
      });
    }
  }

  return snapshots;
}
```

**import 추가**: `ActivityType`을 `discord.js`에서, `CoPresenceMemberActivity`를 `@onyu/bot-api-client`에서 import.

---

## Step 7: API CoPresence 컨트롤러 확장 (게임 reconcile 호출)

### 수정 대상: `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts`

**변경 내용**:

1. `VoiceGameService` DI 추가
2. `receiveSnapshots()`에서 filtered 스냅샷의 `memberActivities`를 `VoiceGameService.reconcileForChannel()`에 전달

```typescript
constructor(
  private readonly coPresenceService: CoPresenceService,
  private readonly excludedChannelService: VoiceExcludedChannelService,
  private readonly eventEmitter: EventEmitter2,
  private readonly voiceGameService: VoiceGameService,    // Phase 2 추가
) {}

@Post('snapshots')
@HttpCode(HttpStatus.OK)
async receiveSnapshots(
  @Body() body: { snapshots: CoPresenceTickSnapshot[] },
): Promise<{ ok: boolean }> {
  const filtered: CoPresenceTickSnapshot[] = [];
  for (const snapshot of body.snapshots) {
    const isExcluded = await this.excludedChannelService.isExcludedChannel(
      snapshot.guildId,
      snapshot.channelId,
      null,
    );
    if (!isExcluded) {
      filtered.push(snapshot);
    }
  }

  const processedGuildIds = [...new Set(body.snapshots.map((s) => s.guildId))];

  // Phase 2: 게임 세션 갱신 (제외 채널 필터링 후)
  for (const snapshot of filtered) {
    if (snapshot.memberActivities && snapshot.memberActivities.length > 0) {
      await this.voiceGameService.reconcileForChannel(
        snapshot.guildId,
        snapshot.channelId,
        snapshot.memberActivities,
      );
    }
  }

  await this.coPresenceService.reconcile(filtered, processedGuildIds);

  if (filtered.length > 0) {
    const tickEvent: CoPresenceTickEvent = { snapshots: filtered };
    this.eventEmitter.emit(CO_PRESENCE_TICK, tickEvent);
  }

  this.logger.debug(
    `[BOT-API] co-presence snapshots: total=${body.snapshots.length} filtered=${filtered.length} guilds=${processedGuildIds.length}`,
  );

  return { ok: true };
}
```

**주의**: `CoPresenceTickSnapshot` 타입에 `memberActivities` 필드가 없으므로 타입 확장 필요.

### 수정 대상: `apps/api/src/channel/voice/co-presence/co-presence.events.ts`

```typescript
export interface CoPresenceTickSnapshot {
  guildId: string;
  channelId: string;
  userIds: string[];
  /** Phase 2: 멤버별 게임 활동 (optional) */
  memberActivities?: Array<{
    userId: string;
    gameName: string | null;
    applicationId: string | null;
  }>;
}
```

---

## Step 8: BotApiModule 수정 (DI 연결)

### 수정 대상: `apps/api/src/bot-api/bot-api.module.ts`

**현재 상태**: `BotVoiceEventListener`가 providers에 등록되어 있고, `VoiceChannelModule`을 import.

**변경 내용**: 없음. `VoiceGameService`는 이미 `VoiceChannelModule`에서 export되고 있으므로(`exports: [VoiceGameService]`), `BotApiModule`이 `VoiceChannelModule`을 import하는 것만으로 `BotVoiceEventListener`와 `BotCoPresenceController`에서 DI 주입 가능.

---

## Step 9: VoiceStateDto.fromVoiceState() 정리

### 수정 대상: `apps/api/src/channel/voice/infrastructure/voice-state.dto.ts`

**현재 상태**: `fromVoiceState()` 정적 메서드가 discord.js `VoiceState`를 직접 참조. Bot/API 분리 후 이 메서드는 API에서 사용되지 않음 (Bot에서 DTO로 보내고, API 리스너에서 `new VoiceStateDto(...)` 직접 호출).

**변경 내용**: `fromVoiceState()` 메서드를 제거하거나 `@deprecated` 표시. discord.js import도 제거 가능.

이 변경은 기능적 영향이 없는 정리 작업이므로 구현 우선순위는 낮다. 단, `VoiceRecoveryService`에서 아직 사용 중이라면 유지해야 한다.

**확인 필요**: `VoiceRecoveryService`가 `fromVoiceState()`를 사용하는지 확인 후 판단.

---

## 변경 파일 요약

| # | 파일 | 위치 | 변경 내용 |
|---|------|------|-----------|
| 1 | `libs/bot-api-client/src/types.ts` | shared | `VoiceStateUpdateDto` Phase 1/2 필드 추가, `CoPresenceSnapshot`에 `memberActivities` 추가 |
| 2 | `apps/bot/src/event/voice/bot-voice-state.dispatcher.ts` | Bot | streaming/video/deaf 토글 감지, Phase 1/2 필드 전송, `extractPlayingActivity` 추가 |
| 3 | `apps/bot/src/scheduler/bot-co-presence.scheduler.ts` | Bot | `collectSnapshots()`에 멤버별 게임 활동 수집 |
| 4 | `apps/api/src/bot-api/voice/bot-voice-event.listener.ts` | API | Phase 1 토글 핸들러 3개, 게임 세션 시작/종료, `buildStateDto` Phase 1 인자 추가 |
| 5 | `apps/api/src/channel/voice/application/voice-game.service.ts` | API | `GuildMember` -> DTO 시그니처 변경, `extractPlayingActivity` 삭제 |
| 6 | `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` | API | `VoiceGameService` DI 추가, `reconcileForChannel` 호출 |
| 7 | `apps/api/src/channel/voice/co-presence/co-presence.events.ts` | API | `CoPresenceTickSnapshot`에 `memberActivities` 추가 |

---

## 구현 순서 (의존성 기반)

```
1. [shared] DTO 확장 (Step 1 + Step 5)
   - VoiceStateUpdateDto에 Phase 1/2 필드 추가
   - CoPresenceSnapshot에 memberActivities 추가
   - CoPresenceTickSnapshot에 memberActivities 추가

2. [API] VoiceGameService 시그니처 변경 (Step 4)
   - GuildMember 의존 제거
   - MemberGameActivity 인터페이스 도입
   - extractPlayingActivity 삭제

3. [API] BotVoiceEventListener 확장 (Step 3)
   - Phase 1 토글 핸들러 추가
   - 게임 세션 시작/종료 호출 추가
   - buildStateDto Phase 1 인자 추가

4. [API] BotCoPresenceController 확장 (Step 7)
   - VoiceGameService DI 주입
   - reconcileForChannel 호출 추가

5. [Bot] BotVoiceStateDispatcher 확장 (Step 2)
   - Phase 1 토글 감지
   - Phase 1/2 필드 전송
   - extractPlayingActivity 메서드 추가

6. [Bot] BotCoPresenceScheduler 확장 (Step 6)
   - 멤버별 게임 활동 수집
```

---

## 기존 동작 영향 분석

### 하위 호환 보장 항목

1. **기존 eventType 4개 (join/leave/move/mic_toggle)**: 변경 없음. Bot에서 추가 필드를 보내지만, API 리스너는 기존 케이스에서 추가 필드를 무시해도 정상 동작.

2. **Phase 1 필드 미전송 시**: `buildStateDto`에서 `dto.streaming ?? false` 등으로 기본값 처리. `VoiceStateDto` 생성자에 false가 전달되어 기존과 동일하게 동작.

3. **Phase 2 필드 미전송 시**: `dto.gameName`이 undefined/null이면 게임 세션 시작 로직을 건너뛴다.

4. **CoPresence memberActivities 미전송 시**: optional 필드이므로 `reconcileForChannel` 호출을 건너뛴다.

5. **VoiceGameService 테스트**: 기존 테스트 파일(`voice-game.service.spec.ts`)에서 `GuildMember` mock을 사용하는 부분을 DTO 방식으로 변경 필요.

### 위험 요소

- **Bot/API 배포 순서**: API를 먼저 배포하면 기존 Bot에서 보내는 요청에 Phase 1/2 필드가 없지만, optional 처리로 안전. Bot을 먼저 배포하면 API에서 새 eventType(`streaming_toggle` 등)을 인식하지 못하지만, switch default가 없으므로 무시됨. **권장 배포 순서: API -> Bot**.

---

## 테스트 체크리스트

- [ ] Bot 디스패처에서 streaming 토글 시 `streaming_toggle` 이벤트가 전송되는지 확인
- [ ] Bot 디스패처에서 video 토글 시 `video_toggle` 이벤트가 전송되는지 확인
- [ ] Bot 디스패처에서 deaf 토글 시 `deaf_toggle` 이벤트가 전송되는지 확인
- [ ] API 리스너에서 `streaming_toggle` 수신 시 `VoiceChannelService.onUserStreamingToggle()` 호출 확인
- [ ] API 리스너에서 join 시 게임 활동이 있으면 `VoiceGameService.onUserJoined()` 호출 확인
- [ ] API 리스너에서 leave 시 `VoiceGameService.onUserLeft()` 호출 확인
- [ ] CoPresence tick에서 `memberActivities`가 전달되면 `reconcileForChannel()` 호출 확인
- [ ] `VoiceGameService`에서 `GuildMember` import가 완전히 제거되었는지 확인
- [ ] 기존 join/leave/move/mic_toggle 동작이 변경 없이 유지되는지 확인
- [ ] Phase 1/2 필드 없이 요청해도 에러 없이 처리되는지 확인 (하위 호환)
