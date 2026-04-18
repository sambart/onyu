# 확정방 내 버튼 선택으로 새 채널 생성 -- Backend 구현 계획

## 개요

현재 자동방 안내 임베드 버튼은 트리거 채널(대기방)에 있는 사용자만 클릭 가능하다.
이 작업은 이미 확정방에 있는 사용자도 안내 임베드 버튼을 클릭하여 **새 확정방을 생성하고 이동**할 수 있도록 검증 조건을 완화한다.

## 사전 조건 (이미 완료)

- `AutoChannelConfirmedState` 인터페이스에 `configId: number` 필드 추가됨 (`auto-channel-state.ts`)
- 공통 모듈 설계 문서에서 검증 조건 완화 방향 확정됨 (`docs/specs/auto-channel-v2-common-modules.md` 2-3절)

## 변경 대상 파일

| 파일 | 변경 유형 |
|------|-----------|
| `apps/api/src/channel/auto/application/auto-channel.service.ts` | 4개 메서드 검증 로직 수정 + `setConfirmedState` 호출에 `configId` 추가 |
| `apps/api/src/bot-api/auto-channel/bot-auto-channel.controller.ts` | 변경 없음 (기존 DTO에 `voiceChannelId` 이미 포함) |
| `apps/api/src/channel/auto/infrastructure/auto-channel-redis.repository.ts` | 변경 없음 (기존 메서드로 충분) |
| `libs/bot-api-client/src/types.ts` | 변경 없음 |

---

## 단계별 구현

### 1단계: `setConfirmedState` 호출에 `configId` 포함

현재 `convertToConfirmed`(line 276)과 `convertToConfirmedFromBot`(line 511)에서 `setConfirmedState`를 호출할 때 `configId`를 전달하지 않는다. `AutoChannelConfirmedState` 인터페이스는 이미 `configId: number`를 필수로 요구하므로 TypeScript 컴파일 오류가 발생하거나, 런타임에 `configId`가 누락된 상태로 저장된다.

**수정 내용**:

`convertToConfirmed` 메서드 (line 276-280):
```typescript
// 변경 전
await this.autoChannelRedis.setConfirmedState(confirmedChannelId, {
  guildId,
  userId,
  buttonId: button.id,
  subOptionId: subOption?.id,
});

// 변경 후
await this.autoChannelRedis.setConfirmedState(confirmedChannelId, {
  guildId,
  userId,
  configId: button.configId,
  buttonId: button.id,
  subOptionId: subOption?.id,
});
```

`convertToConfirmedFromBot` 메서드 (line 511-515): 동일하게 `configId: button.configId` 추가.

### 2단계: 검증 헬퍼 메서드 추가

4개 메서드에서 동일한 검증 로직이 반복되므로, private 헬퍼 메서드를 추가한다.

```typescript
/**
 * 유저의 현재 음성 채널이 버튼 클릭을 허용하는 채널인지 검증한다.
 *
 * 허용 조건 (OR):
 *   1. 트리거 채널에 있음 (voiceChannelId === config.triggerChannelId)
 *   2. 해당 설정(configId)에 속한 확정방에 있음
 *      (Redis auto_channel:confirmed:{voiceChannelId}의 configId === 버튼의 configId)
 */
private async isAllowedChannel(
  voiceChannelId: string,
  configId: number,
  triggerChannelId: string,
): Promise<boolean> {
  // 조건 1: 트리거 채널
  if (voiceChannelId === triggerChannelId) {
    return true;
  }

  // 조건 2: 해당 설정의 확정방
  const confirmedState = await this.autoChannelRedis.getConfirmedState(voiceChannelId);
  return confirmedState !== null && confirmedState.configId === configId;
}
```

### 3단계: `handleButtonClick` 검증 수정 (Discord interaction 직접 처리)

**파일**: `auto-channel.service.ts`, `handleButtonClick` 메서드 (line 167-173)

```typescript
// 변경 전
if (voiceChannelId !== button.config.triggerChannelId) {
  await interaction.editReply({
    content: '대기 채널에서만 선택할 수 있습니다.',
  });
  return;
}

// 변경 후
const isAllowed = await this.isAllowedChannel(
  voiceChannelId,
  button.config.id,
  button.config.triggerChannelId,
);
if (!isAllowed) {
  await interaction.editReply({
    content: '대기 채널 또는 자동방에서만 선택할 수 있습니다.',
  });
  return;
}
```

### 4단계: `handleSubOptionClick` 검증 수정 (Discord interaction 직접 처리)

**파일**: `auto-channel.service.ts`, `handleSubOptionClick` 메서드 (line 229-235)

```typescript
// 변경 전
if (voiceChannelId !== subOption.button.config.triggerChannelId) {
  await interaction.editReply({
    content: '대기 채널에서만 선택할 수 있습니다.',
  });
  return;
}

// 변경 후
const isAllowed = await this.isAllowedChannel(
  voiceChannelId,
  subOption.button.config.id,
  subOption.button.config.triggerChannelId,
);
if (!isAllowed) {
  await interaction.editReply({
    content: '대기 채널 또는 자동방에서만 선택할 수 있습니다.',
  });
  return;
}
```

### 5단계: `handleButtonClickFromBot` 검증 수정 (Bot API 경유)

**파일**: `auto-channel.service.ts`, `handleButtonClickFromBot` 메서드 (line 439-441)

```typescript
// 변경 전
if (dto.voiceChannelId !== button.config.triggerChannelId) {
  return { action: 'error', message: '대기 채널에서만 선택할 수 있습니다.' };
}

// 변경 후
const isAllowed = await this.isAllowedChannel(
  dto.voiceChannelId,
  button.config.id,
  button.config.triggerChannelId,
);
if (!isAllowed) {
  return { action: 'error', message: '대기 채널 또는 자동방에서만 선택할 수 있습니다.' };
}
```

### 6단계: `handleSubOptionClickFromBot` 검증 수정 (Bot API 경유)

**파일**: `auto-channel.service.ts`, `handleSubOptionClickFromBot` 메서드 (line 475-477)

```typescript
// 변경 전
if (dto.voiceChannelId !== subOption.button.config.triggerChannelId) {
  return { action: 'error', message: '대기 채널에서만 선택할 수 있습니다.' };
}

// 변경 후
const isAllowed = await this.isAllowedChannel(
  dto.voiceChannelId,
  subOption.button.config.id,
  subOption.button.config.triggerChannelId,
);
if (!isAllowed) {
  return { action: 'error', message: '대기 채널 또는 자동방에서만 선택할 수 있습니다.' };
}
```

---

## 변경하지 않는 것

- **BotAutoChannelController**: 기존 DTO(`ButtonClickDto`, `SubOptionDto`)에 `voiceChannelId`가 이미 포함되어 있으므로 변경 불필요. 트리거/확정방 판별은 Service 레이어에서 Redis 조회로 처리한다.
- **AutoChannelRedisRepository**: `getConfirmedState(channelId)`로 충분. configId 기반 별도 조회 메서드 불필요.
- **bot-api-client 타입**: 기존 `AutoChannelButtonClickDto`, `AutoChannelSubOptionDto`에 추가 필드 불필요.
- **기존 확정방 처리**: 사용자가 확정방에서 새 확정방으로 이동하면, 이전 확정방은 빈 방 삭제 규칙(F-VOICE-012)에 의해 자동 삭제된다. 별도 처리 불필요.

## 동작 시나리오

### 시나리오 A: 트리거 채널에서 버튼 클릭 (기존 동작 유지)

1. 유저가 트리거 채널(대기방)에 있음
2. 안내 임베드 버튼 클릭
3. `isAllowedChannel` -> `voiceChannelId === triggerChannelId` -> `true`
4. 새 확정방 생성 + 유저 이동 (기존과 동일)

### 시나리오 B: 확정방에서 버튼 클릭 (새 동작)

1. 유저가 이미 확정방에 있음 (예: "Onyu의 오버워치" 방)
2. 안내 임베드 버튼 클릭 (예: "발로란트" 버튼)
3. `isAllowedChannel`:
   - `voiceChannelId !== triggerChannelId` -> 조건 1 실패
   - Redis 조회: `auto_channel:confirmed:{현재채널ID}`의 `configId`와 버튼의 `configId` 비교 -> 일치하면 `true`
4. 새 확정방 생성 ("Onyu의 발로란트") + 유저 이동
5. 이전 확정방("Onyu의 오버워치")에 다른 유저가 없으면 F-VOICE-012에 의해 자동 삭제

### 시나리오 C: 다른 설정의 확정방에서 클릭 (차단)

1. 유저가 설정 A의 확정방에 있음
2. 설정 B의 안내 임베드 버튼 클릭
3. `isAllowedChannel`:
   - `voiceChannelId !== triggerChannelId` -> 조건 1 실패
   - Redis 조회: `configId` 불일치 -> `false`
4. 오류 메시지 반환: "대기 채널 또는 자동방에서만 선택할 수 있습니다."

### 시나리오 D: 음성 채널 미접속 상태에서 클릭 (기존 차단 유지)

1. 유저가 음성 채널에 접속하지 않은 상태
2. 안내 임베드 버튼 클릭
3. `voiceChannelId`가 null -> "음성 채널에 입장한 후 클릭하세요." (기존 로직, `isAllowedChannel` 호출 전 차단)

---

## 테스트 계획

### 단위 테스트

1. **`isAllowedChannel` 헬퍼**:
   - 트리거 채널 ID 일치 -> `true` (Redis 조회 안 함)
   - 확정방 + configId 일치 -> `true`
   - 확정방 + configId 불일치 -> `false`
   - 확정방이 아닌 일반 채널 -> `false` (Redis 조회 결과 null)

2. **`handleButtonClickFromBot`**:
   - 트리거 채널에서 호출 -> 기존과 동일하게 `created` 반환
   - 같은 configId 확정방에서 호출 -> `created` 반환 (새 채널 생성)
   - 다른 configId 확정방에서 호출 -> `error` 반환
   - voiceChannelId null -> `error` 반환

3. **`handleSubOptionClickFromBot`**: 위와 동일한 케이스

4. **`setConfirmedState` 호출 시 `configId` 포함 여부 확인**

### 통합 테스트

- Bot을 통해 확정방에서 버튼 클릭 -> 새 확정방 생성 -> 이전 확정방이 비면 자동 삭제 확인

---

## 구현 순서

```
1단계: setConfirmedState 호출에 configId 추가  (선행 -- 모든 후속 테스트의 전제)
2단계: isAllowedChannel 헬퍼 메서드 추가
3단계~6단계: 4개 메서드 검증 로직 수정 (병렬 가능, 동일 파일이므로 순차 권장)
7단계: 단위 테스트 작성
```

예상 변경 규모: ~50줄 추가/수정 (테스트 제외)
