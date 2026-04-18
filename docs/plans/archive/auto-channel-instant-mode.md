# 자동방 즉시 생성 모드(Instant Mode) Backend 구현 계획

> 최종 업데이트: 2026-03-20

## 개요

자동방(Auto Channel)에 `instant` 모드를 추가한다. 기존 `select` 모드는 트리거 채널 입장 후 안내 메시지 버튼 클릭으로 확정방을 생성하는 2단계 방식이었다. `instant` 모드는 트리거 채널 입장 즉시 채널을 생성하고 유저를 이동시키는 1단계 방식이다.

### 이미 완료된 사항

- DB: `auto_channel_config`에 `mode`, `instantCategoryId`, `instantNameTemplate` 컬럼 추가 및 마이그레이션 완료
- ORM: `AutoChannelConfigOrm`에 새 컬럼 반영됨
- Redis: `AutoChannelConfirmedState`에 `configId` 필드 추가, `buttonId` optional 변경됨

### PRD 참조

- F-VOICE-007: 트리거 채널 입장 시 모드 분기
- F-VOICE-020: 즉시 생성 모드 채널 생성

---

## 데이터 흐름

```
[Discord Gateway: voiceStateUpdate (join)]
    |
[Bot: BotVoiceStateDispatcher]  ──HTTP POST──>  [API: BotVoiceController]
    VoiceStateUpdateDto                               |
                                                EventEmitter('bot-api.voice.state-update')
                                                      |
                                                [API: BotVoiceEventListener.handleJoin()]
                                                      |
                                          ┌─── triggerChannel 조회 ───┐
                                          │                           │
                                     (not trigger)              (trigger found)
                                          │                           │
                                    기존 세션 추적             mode 분기
                                                          ┌──────┴───────┐
                                                       select          instant
                                                          │               │
                                                     세션 추적 skip    handleInstantTriggerJoin()
                                                     (기존 동작)           │
                                                                    1. 채널명 결정
                                                                    2. 채널 생성
                                                                    3. 유저 이동
                                                                    4. Redis 저장
                                                                    (세션 추적은 move 이벤트로 자연 처리)
```

> 세션 추적 시점 주의: instant 모드에서 유저를 새 채널로 이동시키면 Discord가 `move` 이벤트를 발생시킨다. 이 move 이벤트가 다시 `BotVoiceEventListener.handleMove()`를 거쳐 새 채널에 대한 세션 추적이 자연스럽게 시작된다. 따라서 `handleInstantTriggerJoin()` 내에서 직접 세션 추적을 시작할 필요가 없다.

---

## Step 1: BotVoiceEventListener에서 트리거 채널 분기 추가

### 수정 대상

`apps/api/src/bot-api/voice/bot-voice-event.listener.ts`

### 변경 내용

`handleJoin()` 메서드에서 excluded 채널 체크 이후, config 조회를 추가하여 트리거 채널 여부를 확인하고 모드에 따라 분기한다.

**현재 흐름**:
```
handleJoin → isExcluded 체크 → (통과) → 세션 추적 시작
```

**변경 후 흐름**:
```
handleJoin → isExcluded 체크 → (통과) → triggerChannel 조회
  → (trigger O, mode=select)  → return (세션 추적 skip, 기존 동작)
  → (trigger O, mode=instant) → autoChannelService.handleInstantTriggerJoin() → return
  → (trigger X)               → 기존 세션 추적 시작
```

**구체적 수정 사항**:

1. `handleJoin()` 메서드 내, excluded 체크 통과 후 `configRepo.findByTriggerChannel()` 호출 추가
2. config가 존재하면 `mode`에 따라 분기:
   - `select`: 기존처럼 세션 추적 없이 return (유저가 대기방에 머물며 버튼 클릭을 기다림)
   - `instant`: `autoChannelService.handleInstantTriggerJoin()` 호출 후 return
3. config가 없으면 기존 세션 추적 로직 진행

**의존성 추가**:
- 생성자에 `AutoChannelConfigRepository` 주입 추가

```typescript
// handleJoin() 내 추가할 분기 (pseudocode)
const config = await this.configRepo.findByTriggerChannel(dto.guildId, dto.channelId);
if (config) {
  if (config.mode === 'instant') {
    await this.autoChannelService.handleInstantTriggerJoin(
      dto.guildId,
      dto.userId,
      dto.channelId,
      dto.userName,
      dto.avatarUrl,
    );
  }
  // select 모드 또는 instant 모드 처리 완료 → 세션 추적 skip
  return;
}
```

---

## Step 2: AutoChannelService에 즉시 생성 메서드 추가

### 수정 대상

`apps/api/src/channel/auto/application/auto-channel.service.ts`

### 추가 메서드: `handleInstantTriggerJoin()`

```typescript
/**
 * F-VOICE-020: 즉시 생성 모드 - 트리거 채널 입장 시 채널 즉시 생성 및 이동.
 *
 * 세션 추적은 유저 이동 후 발생하는 move 이벤트에서 자연 처리된다.
 */
async handleInstantTriggerJoin(
  guildId: string,
  userId: string,
  triggerChannelId: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<void>
```

**동작 순서**:

1. DB에서 config 조회 (`configRepo.findByTriggerChannel(guildId, triggerChannelId)`)
   - 이미 Step 1에서 조회한 config를 파라미터로 전달하는 것도 고려했으나, 메서드 시그니처를 단순하게 유지하기 위해 service 내에서 재조회한다. DB 조회 비용이 낮고, 호출 빈도도 높지 않다.
2. `instantNameTemplate` 기반 채널명 결정:
   - `{username}` → `displayName`으로 치환
   - 기존 `resolveChannelName()` 재사용 (중복 해소 + `{n}` 순번 처리)
3. `instantCategoryId` 카테고리에 음성 채널 생성 (`discordVoiceGateway.createVoiceChannel()`)
4. 유저를 생성된 채널로 이동 (`discordVoiceGateway.moveUserToChannel()`)
5. Redis 확정방 상태 저장:
   ```typescript
   await this.autoChannelRedis.setConfirmedState(confirmedChannelId, {
     guildId,
     userId,
     configId: config.id,
     // buttonId, subOptionId 없음 (instant 모드)
   });
   ```
6. 세션 추적은 별도 처리 불필요 (유저 이동 시 Discord가 move 이벤트를 발생시키고, 해당 이벤트에서 자연 처리됨)

**예외 처리**:
- config가 null인 경우: 로그 warn 후 return (트리거 채널 설정이 삭제된 경우)
- `instantCategoryId`가 null인 경우: 로그 warn 후 return (설정 불완전)
- `instantNameTemplate`이 null인 경우: `{username}의 방` 기본값 사용
- 채널 생성/이동 실패: 에러 로깅 (fire-and-forget이므로 상위 호출자에서 catch됨)

**채널명 빌드 헬퍼**:

기존 `buildChannelName()`은 `AutoChannelButtonOrm`에 의존하므로, instant 모드 전용 간단한 헬퍼를 추가한다:

```typescript
/**
 * Instant 모드 채널명 템플릿 적용.
 * {username}을 유저 닉네임으로 치환한다.
 */
private buildInstantChannelName(displayName: string, template: string): string {
  return template.replace(/{username}/g, displayName);
}
```

---

## Step 3: BotVoiceEventListener.handleMove()에서 instant 트리거 채널 분기 추가

### 수정 대상

`apps/api/src/bot-api/voice/bot-voice-event.listener.ts`

### 변경 내용

`handleMove()` 메서드에서 **새 채널이 트리거 채널인 경우**를 처리해야 한다. 유저가 다른 채널에서 트리거 채널로 이동하는 경우에도 instant 모드가 동작해야 하기 때문이다.

**현재 흐름**:
```
handleMove → excluded 체크 → move/join/leave 처리 → auto-channel empty 체크
```

**변경 후 흐름**:
```
handleMove → excluded 체크 → triggerChannel 조회 (새 채널 대상)
  → (trigger O, instant) → 이전 채널 leave 처리 + handleInstantTriggerJoin() + auto-channel empty 체크
  → (trigger O, select)  → 이전 채널 leave 처리 + return (기존 동작과 동일)
  → (trigger X)           → 기존 move 처리 + auto-channel empty 체크
```

**주의**: 새 채널이 instant 트리거인 경우, 이전 채널에 대한 leave 처리(세션 종료, status prefix 복원)는 기존 로직을 그대로 수행해야 한다. 이후 instant 생성을 트리거하면, Discord가 다시 move 이벤트를 발생시켜 최종 채널 세션 추적이 자연 시작된다.

---

## Step 4: DTO 변경 (AutoChannelSaveDto)

### 수정 대상

`apps/api/src/channel/auto/dto/auto-channel-save.dto.ts`

### 변경 내용

`AutoChannelSaveDto`에 instant 모드 관련 필드를 추가한다.

```typescript
// AutoChannelSaveDto에 추가
@IsOptional()
@IsString()
mode?: 'select' | 'instant';  // 기본값 'select' (DB default)

@IsOptional()
@IsString()
instantCategoryId?: string;

@IsOptional()
@IsString()
instantNameTemplate?: string;
```

**조건부 검증 참고**:
- `mode = 'instant'`일 때 `instantCategoryId`는 필수이나, class-validator의 조건부 검증은 복잡도를 높인다.
- 대안: Repository upsert 시점에서 검증하거나, 커스텀 validator를 사용한다.
- 권장: `@ValidateIf((o) => o.mode === 'instant')` 데코레이터로 조건부 필수 처리.

```typescript
@ValidateIf((o: AutoChannelSaveDto) => o.mode === 'instant')
@IsNotEmpty({ message: 'instant 모드에서는 instantCategoryId가 필수입니다.' })
@IsString()
instantCategoryId?: string;
```

또한 `mode = 'instant'`일 때 `buttons` 배열은 비어있어도 되므로, `buttons` 검증에 별도 조건은 필요 없다 (빈 배열은 이미 유효).

**select 모드 조건부 필수 필드**:
- `guideChannelId`: select 모드에서만 필수
- `guideMessage`: select 모드에서만 필수
- 이 두 필드에도 `@ValidateIf((o) => o.mode !== 'instant')` 적용 필요 (기존 `@IsNotEmpty`와 조합)

---

## Step 5: AutoChannelConfigRepository 수정

### 수정 대상

`apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.ts`

### 변경 내용

#### 5-1. `upsert()` 메서드 수정

instant 모드 필드(`mode`, `instantCategoryId`, `instantNameTemplate`)를 저장한다.

**기존 설정 업데이트 시 추가**:
```typescript
config.mode = dto.mode ?? 'select';
config.instantCategoryId = dto.instantCategoryId ?? null;
config.instantNameTemplate = dto.instantNameTemplate ?? null;
```

**신규 생성 시 추가**:
```typescript
mode: dto.mode ?? 'select',
instantCategoryId: dto.instantCategoryId ?? null,
instantNameTemplate: dto.instantNameTemplate ?? null,
```

**instant 모드일 때 버튼 저장 분기**:
- `instant` 모드: 버튼 INSERT 단계를 skip (PRD 명세상 instant 모드에서는 버튼 미사용)
- `select` 모드: 기존 로직 유지

```typescript
// 4. 버튼 + 하위 선택지 INSERT (select 모드만)
if (config.mode === 'select') {
  for (const btnDto of dto.buttons) {
    // ... 기존 버튼 INSERT 로직
  }
}
```

#### 5-2. `findByTriggerChannel()` 변경 없음

현재 구현이 이미 config 전체를 반환하므로 `mode` 필드도 자연스럽게 포함된다. relations에 buttons/subOptions도 포함되어 있지만, instant 모드 조회 시에는 사용하지 않으므로 성능 문제는 없다 (buttons가 비어있기 때문).

---

## Step 6: Bot → API 즉시 생성 엔드포인트 (선택적)

### 판단

현재 설계에서 instant 모드의 채널 생성은 **음성 입장 이벤트(`voiceStateUpdate`)에 의해 트리거**된다. Bot은 이미 `voiceStateUpdate` 이벤트를 API로 전달하고 있으므로, API의 `BotVoiceEventListener`에서 트리거 채널 감지 + instant 처리가 모두 가능하다.

따라서 **별도의 Bot API 엔드포인트(`POST /bot-api/auto-channel/instant`)는 불필요**하다.

Bot 측 코드 변경 없이, 기존 `voiceStateUpdate` 전달 경로만으로 instant 모드가 동작한다.

---

## Step 7: 안내 메시지 전송 분기

### 수정 대상

`apps/api/src/channel/auto/application/auto-channel.service.ts`

### 변경 내용

`sendOrUpdateGuideMessage()` 메서드에서 instant 모드 config는 안내 메시지가 불필요하므로, 메서드 초반에 mode 체크를 추가한다.

```typescript
async sendOrUpdateGuideMessage(configId: number): Promise<void> {
  const config = await this.configRepo.findById(configId);
  if (!config) { ... }

  // instant 모드는 안내 메시지 불필요
  if (config.mode === 'instant') {
    this.logger.log(`Skipping guide message for instant mode: configId=${configId}`);
    return;
  }

  // 기존 select 모드 로직 ...
}
```

---

## 구현 순서 및 체크리스트

| # | 파일 | 변경 요약 | 의존성 |
|---|------|----------|--------|
| 1 | `auto-channel-save.dto.ts` | `mode`, `instantCategoryId`, `instantNameTemplate` 필드 추가 + 조건부 검증 | 없음 |
| 2 | `auto-channel-config.repository.ts` | `upsert()`에 instant 모드 필드 저장, 버튼 skip 분기 | Step 1 |
| 3 | `auto-channel.service.ts` | `handleInstantTriggerJoin()` 추가, `buildInstantChannelName()` 추가, `sendOrUpdateGuideMessage()` instant skip | 없음 |
| 4 | `bot-voice-event.listener.ts` | `handleJoin()`/`handleMove()`에 트리거 채널 분기 + instant 처리 호출 | Step 3 |

---

## 변경하지 않는 파일

| 파일 | 이유 |
|------|------|
| `bot-auto-channel.controller.ts` | instant 모드는 voice 이벤트 경로로 처리되므로 별도 엔드포인트 불필요 |
| `auto-channel-redis.repository.ts` | `setConfirmedState`의 시그니처는 이미 `configId` 포함, `buttonId`/`subOptionId` optional — 변경 불필요 |
| `auto-channel-state.ts` | 이미 `configId` 필드 추가 완료 |
| `auto-channel-config.orm-entity.ts` | 이미 `mode`, `instantCategoryId`, `instantNameTemplate` 컬럼 반영 완료 |
| `auto-channel-discord.gateway.ts` | 기존 `fetchVoiceChannelNamesByCategory()` 재사용 |
| `discord-voice.gateway.ts` | 기존 `createVoiceChannel()`, `moveUserToChannel()` 재사용 |
| `bot-api-client` (types.ts, service.ts) | voice 이벤트 경로로 처리되므로 새 타입/메서드 불필요 |
| Bot 측 코드 전체 | Bot 변경 없이 기존 voiceStateUpdate 전달 경로로 동작 |

---

## 엣지 케이스 및 주의사항

1. **instant 채널 생성 후 move 이벤트 루프 방지**: instant로 생성된 채널 자체는 트리거 채널이 아니므로, 이동 후 발생하는 move 이벤트에서 다시 instant가 트리거되지 않는다.

2. **동시 입장 경합**: 여러 유저가 동시에 트리거 채널에 입장하면, 각각 독립적으로 채널이 생성된다. `resolveChannelName()`이 카테고리 내 채널명 목록을 실시간 조회하므로 중복 이름은 순번으로 해소된다. 극도로 동시적인 경우 Discord API 레벨에서 같은 이름의 채널이 2개 생길 수 있으나, Discord는 동명 채널을 허용하므로 문제 없다.

3. **트리거 채널에서 나가지 않고 계속 머무는 경우**: instant 모드에서는 채널 생성 + 유저 이동이 자동으로 수행되므로, 유저가 트리거 채널에 머무르는 상황은 유저 이동 실패(Discord API 오류)일 때만 발생한다. 이 경우 에러 로깅으로 대응한다.

4. **select에서 instant로 모드 변경 시**: 기존 안내 메시지와 버튼은 DB에 남아있으나 사용되지 않는다. 안내 메시지를 자동 삭제하는 것은 이 단계에서는 scope out한다.

5. **채널 삭제**: instant 모드로 생성된 확정방도 기존 F-VOICE-012와 동일하게 처리된다 (모든 유저 퇴장 시 `handleChannelEmpty()` → Redis 키 삭제 + Discord 채널 삭제).
