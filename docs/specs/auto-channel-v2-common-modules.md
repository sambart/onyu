# 자동방 즉시 생성 모드 + 웹 UI 개선 -- 공통 모듈 설계

## 목적

즉시 생성 모드 추가(A), 확정방 내 버튼 선택 허용(B), DTO/검증 변경(C), API 컨트롤러 변경(D), 웹 설정 UI 개선(E)을 병렬로 개발하기 전에 공통 모듈을 식별하고 선행 작업 범위를 확정한다.
이 문서에 정의된 선행 작업은 모든 구현 단위(A~E)보다 먼저 완성되어야 하며, 이후 단위 작업들이 conflict 없이 병렬 진행될 수 있도록 인터페이스와 수정 범위를 명시한다.

**기반 문서**: `docs/specs/auto-channel-common-modules.md` (초기 자동방 구현 시 작성된 공통 모듈 판단 문서)

---

## 구현 단위 요약

| 단위 | 기능 | 주요 파일 |
|------|------|-----------|
| A | 즉시 생성 모드 (Backend) | `auto-channel.service.ts`, `bot-voice-event.listener.ts` |
| B | 확정방 내 버튼 선택 (Backend) | `auto-channel.service.ts`, `bot-auto-channel.controller.ts` |
| C | DTO/검증 변경 (Backend) | `auto-channel-save.dto.ts` |
| D | API 컨트롤러 변경 (Backend) | `auto-channel.controller.ts`, `auto-channel-config.repository.ts` |
| E | 웹 설정 UI 개선 (Frontend) | `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx` |

---

## 1. 이미 완료된 공통 사전 작업

다음 항목은 이미 코드베이스에 반영되어 있으며 추가 수정이 불필요하다.

| 항목 | 파일 | 상태 |
|------|------|------|
| DB 마이그레이션 (`mode`, `instantCategoryId`, `instantNameTemplate` 컬럼, `guideMessage` nullable) | `apps/api/src/migrations/` | 완료 |
| ORM 엔티티 (`mode`, `instantCategoryId`, `instantNameTemplate` 컬럼) | `auto-channel-config.orm-entity.ts` | 완료 |
| Redis 상태 인터페이스 (`configId` 필드, `buttonId` optional) | `auto-channel-state.ts` | 완료 |

---

## 2. 공통 모듈 식별 (2개 이상 단위가 공유하는 것만)

### 2-1. AutoChannelSaveDto -- mode/instant 필드 추가

**파일**: `apps/api/src/channel/auto/dto/auto-channel-save.dto.ts`
**사용 단위**: C(정의), D(수신), E(전송) -- 3개 단위

현재 DTO에 `mode`, `instantCategoryId`, `instantNameTemplate` 필드가 없다. 웹(E)에서 mode 포함 요청을 전송하고, 컨트롤러(D)에서 수신하여 저장하며, C 단위 자체가 이 DTO 수정 작업이다.

**선행 수정 -- 최종 DTO 구조**:

```typescript
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// AutoChannelSubOptionDto, AutoChannelButtonDto 변경 없음 (기존 유지)

export class AutoChannelSaveDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  triggerChannelId: string;

  @IsIn(['select', 'instant'])
  mode: 'select' | 'instant';

  // --- select 모드 전용 (instant 모드에서는 생략 가능) ---

  @IsOptional()
  @IsString()
  guideChannelId?: string;

  @IsOptional()
  @IsString()
  waitingRoomTemplate?: string;

  @IsOptional()
  @IsString()
  guideMessage?: string;

  @IsOptional()
  @IsString()
  embedTitle?: string;

  @IsOptional()
  @IsString()
  embedColor?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => AutoChannelButtonDto)
  buttons?: AutoChannelButtonDto[];

  // --- instant 모드 전용 (select 모드에서는 생략 가능) ---

  @IsOptional()
  @IsString()
  instantCategoryId?: string;

  @IsOptional()
  @IsString()
  instantNameTemplate?: string;
}
```

**현재 대비 변경 사항**:
- `mode` 필드 추가 (필수, `@IsIn(['select', 'instant'])`)
- `guideChannelId`: `@IsNotEmpty()` 제거, `@IsOptional()` 추가, 타입 `string` -> `string | undefined`
- `guideMessage`: `@IsNotEmpty()` 제거, `@IsOptional()` 추가, 타입 `string` -> `string | undefined`
- `buttons`: `@IsOptional()` 추가, 타입 `AutoChannelButtonDto[]` -> `AutoChannelButtonDto[] | undefined`
- `instantCategoryId?: string` 추가
- `instantNameTemplate?: string` 추가
- `AutoChannelSubOptionDto`, `AutoChannelButtonDto`는 변경 없음

### 2-2. AutoChannelConfigRepository.upsert -- mode 분기 저장 로직

**파일**: `apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.ts`
**사용 단위**: A(즉시 생성 설정 조회에 의존), D(저장 로직 호출) -- 2개 단위

현재 `upsert` 메서드에서 `mode`, `instantCategoryId`, `instantNameTemplate`을 저장하지 않는다. A 단위에서는 `findByTriggerChannel`로 조회할 때 `mode` 값이 정확해야 하고, D 단위에서는 웹 API upsert 호출 시 모드별 필드가 올바르게 저장되어야 한다.

**선행 수정 -- upsert 메서드 변경 사항**:

기존 설정 UPDATE 블록에 추가:
```typescript
config.mode = dto.mode;
config.instantCategoryId = dto.instantCategoryId ?? null;
config.instantNameTemplate = dto.instantNameTemplate ?? null;

// select 모드 전용 필드 (기존 로직 유지, 조건부 적용)
if (dto.mode === 'select') {
  config.guideChannelId = dto.guideChannelId ?? null;
  config.waitingRoomTemplate = dto.waitingRoomTemplate ?? null;
  config.guideMessage = dto.guideMessage ?? null;
  config.embedTitle = dto.embedTitle ?? null;
  config.embedColor = dto.embedColor ?? null;
} else {
  // instant 모드에서는 select 전용 필드 초기화
  config.guideChannelId = null;
  config.waitingRoomTemplate = dto.waitingRoomTemplate ?? null;
  config.guideMessage = null;
  config.embedTitle = null;
  config.embedColor = null;
}
```

신규 생성 블록에 추가:
```typescript
config = manager.create(AutoChannelConfigOrm, {
  guildId,
  name: dto.name,
  triggerChannelId: dto.triggerChannelId,
  mode: dto.mode,
  // select 모드 전용
  guideChannelId: dto.mode === 'select' ? (dto.guideChannelId ?? null) : null,
  waitingRoomTemplate: dto.waitingRoomTemplate ?? null,
  guideMessage: dto.mode === 'select' ? (dto.guideMessage ?? null) : null,
  embedTitle: dto.mode === 'select' ? (dto.embedTitle ?? null) : null,
  embedColor: dto.mode === 'select' ? (dto.embedColor ?? null) : null,
  guideMessageId: null,
  // instant 모드 전용
  instantCategoryId: dto.instantCategoryId ?? null,
  instantNameTemplate: dto.instantNameTemplate ?? null,
});
```

버튼 INSERT 블록에 조건 추가:
```typescript
// mode가 instant이면 버튼 저장을 건너뜀
if (dto.mode === 'select' && dto.buttons) {
  for (const btnDto of dto.buttons) {
    // ... 기존 버튼/하위선택지 INSERT 로직
  }
}
```

### 2-3. 검증 조건 완화 방향 확정 (A + B 공유 계약)

**관련 파일**: `apps/api/src/channel/auto/application/auto-channel.service.ts`
**사용 단위**: A(configId 저장 보장), B(검증 로직 변경) -- 2개 단위

코드 수정 자체는 각 단위에서 수행하지만, A가 `setConfirmedState`에서 `configId`를 저장하는 방식이 B의 검증 조건에 영향을 주므로 인터페이스 계약을 사전 확정한다.

**확정 사항**:

(1) 버튼 클릭 시 허용 조건 (현재: 트리거 채널만 허용 -> 변경 후):
```
허용 조건 (OR):
  1. voiceChannelId === button.config.triggerChannelId
     (트리거 채널에 있음)
  2. Redis auto_channel:confirmed:{voiceChannelId}의 configId === button.configId
     (해당 설정의 확정방에 있음)
```

(2) 즉시 생성 모드(A)로 만든 확정방도 동일한 `auto_channel:confirmed:{channelId}` 키에 `configId`를 포함하여 저장한다. 이를 통해 즉시 생성으로 만든 확정방에 있는 사용자가 select 모드의 버튼을 클릭하는 경우에도 configId 불일치로 올바르게 차단된다.

(3) 새 확정방 생성 시 기존 확정방은 유지된다. 빈 방 삭제 규칙(F-VOICE-012)이 적용되어 사용자가 이동한 후 이전 확정방이 비면 자동 삭제된다.

(4) 이 검증 변경은 다음 4개 메서드 모두에 동일하게 적용:
- `handleButtonClick` (Discord interaction 직접 처리)
- `handleSubOptionClick` (Discord interaction 직접 처리)
- `handleButtonClickFromBot` (Bot API 경유)
- `handleSubOptionClickFromBot` (Bot API 경유)

---

## 3. 단일 단위에서만 사용하여 공통 모듈에 포함하지 않는 것

| 항목 | 사용 단위 | 사유 |
|------|-----------|------|
| `handleInstantTriggerJoin` 새 메서드 | A만 | `auto-channel.service.ts`에 새 메서드 추가. B와 수정 영역 분리됨 |
| `bot-voice-event.listener.ts` 트리거 감지 분기 | A만 | `handleJoin`에서 DB 조회 후 mode 분기 |
| `auto-channel.controller.ts` 모드 분기 저장/응답 | D만 | `save` 메서드에서 mode에 따른 안내 메시지 처리 분기 |
| `auto-channel/page.tsx` 전면 개편 | E만 | 모드 선택 UI, 스텝 기반, 카드 그리드+모달, 미리보기 |
| `bot-auto-channel.controller.ts` 검증 완화 | B만 | 기존 DTO에 추가 필드 불필요 (API 서비스에서 Redis 조회로 처리) |

---

## 4. 선행 작업 실행 순서

```
1. AutoChannelSaveDto 수정 (2-1)
   파일: apps/api/src/channel/auto/dto/auto-channel-save.dto.ts

2. AutoChannelConfigRepository.upsert 수정 (2-2)
   파일: apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.ts
   의존: 2-1 (DTO 타입을 import)

─── 선행 작업 완료 ───

3. A, B, D, E 병렬 진행
   (C 단위는 2-1에 흡수됨)
```

---

## 5. 파일별 수정 단위 배정표 (충돌 방지)

| 파일 | 선행 | A | B | D | E |
|------|------|---|---|---|---|
| `dto/auto-channel-save.dto.ts` | 수정 | - | - | - | - |
| `infrastructure/auto-channel-config.repository.ts` | 수정 | - | - | - | - |
| `application/auto-channel.service.ts` | - | 추가 (새 메서드) | 수정 (검증 완화) | - | - |
| `bot-api/voice/bot-voice-event.listener.ts` | - | 수정 (트리거 감지) | - | - | - |
| `bot-api/auto-channel/bot-auto-channel.controller.ts` | - | - | 수정 | - | - |
| `auto-channel.controller.ts` | - | - | - | 수정 (모드 분기) | - |
| `apps/web/.../auto-channel/page.tsx` | - | - | - | - | 전면 개편 |
| `infrastructure/auto-channel-state.ts` | - | - | - | - | - |
| `infrastructure/auto-channel-config.orm-entity.ts` | - | - | - | - | - |
| `libs/bot-api-client/src/types.ts` | - | - | - | - | - |

**A와 B의 `auto-channel.service.ts` 수정 범위 분리**:
- A: 파일 하단에 `handleInstantTriggerJoin` 새 섹션 추가. `resolveChannelName` private 메서드를 내부 호출 (시그니처 변경 없음)
- B: 기존 `handleButtonClick`, `handleSubOptionClick`, `handleButtonClickFromBot`, `handleSubOptionClickFromBot` 내부의 `voiceChannelId !== triggerChannelId` 조건문 수정

---

## 6. A 단위 구현 가이드 -- bot-voice-event.listener 트리거 감지

A 단위에서 `bot-voice-event.listener.ts`의 `handleJoin`에 트리거 채널 감지 분기를 추가해야 한다. PRD F-VOICE-007에 따라 Redis 캐싱 없이 DB 직접 조회한다.

**구현 방향**:

```
handleJoin(dto):
  1. configRepo.findByTriggerChannel(guildId, channelId) 조회
  2. config 없음: 기존 일반 join 처리 (현재 로직 그대로)
  3. config 있음, mode === 'select':
     - 트리거 채널이므로 세션 추적 건너뜀 (voiceChannelService.onUserJoined 호출 안 함)
     - 유저가 안내 메시지 버튼 클릭을 기다리는 상태
  4. config 있음, mode === 'instant':
     - autoChannelService.handleInstantTriggerJoin(dto, config) 호출
     - 세션 추적 건너뜀 (확정방 생성 시 내부에서 추적 시작)
```

`AutoChannelConfigRepository`를 `BotVoiceEventListener` 생성자에 주입해야 하며, 이를 위해 `BotApiModule`에서 `AutoChannelModule`을 import하고 있는지 확인 필요 (현재 `AutoChannelService`를 이미 주입하고 있으므로 `AutoChannelModule`은 이미 import됨. `AutoChannelConfigRepository`는 `AutoChannelModule`에서 export하고 있으므로 추가 주입 가능).

---

## 7. D 단위 구현 가이드 -- auto-channel.controller.ts 모드 분기

D 단위에서 `auto-channel.controller.ts`의 `save` 메서드에 모드 분기를 추가한다.

**구현 방향**:

```
save(guildId, dto):
  1. configRepo.upsert(guildId, dto)  -- 선행 작업 2-2에서 mode 분기 저장 완료
  2. dto.mode === 'select' && config.guideChannelId인 경우에만:
     - 안내 메시지 전송/갱신 (기존 로직 그대로)
  3. dto.mode === 'instant'인 경우:
     - 안내 메시지 처리 건너뜀
     - 기존 guideMessageId가 있으면 안내 메시지 삭제 시도
  4. 응답: { ok: true, configId, guideMessageId } (instant 모드에서는 guideMessageId: null)
```

---

## 검증 체크리스트

### 1차 확인: 모든 공유 접점이 포함되었는가

- [x] DTO 구조 (`AutoChannelSaveDto`): 2-1에서 선행 확정. C(정의), D(수신), E(전송) 3개 단위 공유
- [x] Repository 저장 로직 (`upsert`): 2-2에서 선행 확정. A(설정 조회 의존), D(저장 호출) 2개 단위 공유
- [x] Redis 상태 인터페이스 (`configId`): 1절에서 확인. 이미 완료되어 A, B 모두 사용 가능
- [x] 검증 조건 완화 방향: 2-3에서 사전 확정. A의 configId 저장과 B의 검증 로직이 호환
- [x] ORM 엔티티 (`mode`/`instant` 컬럼): 1절에서 확인. 이미 완료

### 2차 확인: 단위 간 동일 파일 수정 충돌 위험

- [x] `auto-channel-save.dto.ts`: 선행 작업에서만 수정. 이후 단위에서 추가 수정 없음
- [x] `auto-channel-config.repository.ts`: 선행 작업에서만 수정. 이후 단위에서 추가 수정 없음
- [x] `auto-channel.service.ts`: A(새 메서드 추가)와 B(기존 메서드 검증 수정)가 수정하되 영역 분리
- [x] 나머지 파일: 각 단위가 독점적으로 수정하여 충돌 없음

### 3차 확인: 선행 작업 누락 시 영향

- [x] DTO(2-1) 미완료: D에서 mode 분기 불가, E에서 mode 필드 전송 불가 -> 3개 단위 블로킹
- [x] Repository(2-2) 미완료: D에서 instant 저장 불가, A에서 mode 조회 불일치 -> 2개 단위 블로킹
- [x] 검증 방향(2-3) 미확정: A와 B 간 configId 저장/조회 불일치 가능 -> 2개 단위 블로킹
