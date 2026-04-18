# 자동방 채널 통계 그룹핑 — 단계 0 + 단계 2 상세 구현 계획

> 상위 계획: [voice-auto-channel-grouping.md](./voice-auto-channel-grouping.md)
> PRD 참조: F-VOICE-032 (Redis 분리 저장), F-VOICE-034 (Flush 로직 확장)
> 최종 업데이트: 2026-03-27

---

## 단계 0: Redis 자동방 메타데이터 분리 저장

### 0-1. VoiceKeys에 키 패턴 추가

**파일**: `apps/api/src/channel/voice/infrastructure/voice-cache.keys.ts`

현재 VoiceKeys 객체에 아래 키를 추가한다.

```typescript
/** 자동방 메타데이터 캐시: voice:channel:auto:{guildId}:{channelId} — TTL 7일 */
autoChannelInfo: (guild: string, channel: string) =>
  `voice:channel:auto:${guild}:${channel}`,
```

**위치**: `userCount` 키 바로 위 또는 `categoryInfo` 키 근처에 배치 (채널 관련 키끼리 그룹핑).

---

### 0-2. VoiceRedisRepository에 set/get 메서드 추가

**파일**: `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts`

#### 0-2-1. 타입 정의

메서드 시그니처에 사용할 인터페이스를 파일 상단 또는 별도 파일에 정의한다. 기존 패턴(VoiceSession이 같은 디렉토리에 별도 파일)을 따라 **같은 파일 내 상단에 인라인 정의**한다.

```typescript
/** 자동방 메타데이터 (voice:channel:auto 키에 저장) */
export interface AutoChannelInfo {
  configId: number;
  configName: string;
  channelType: 'auto_select' | 'auto_instant';
}
```

> 왜 별도 파일이 아닌가: `VoiceSession`은 여러 파일에서 import하지만, `AutoChannelInfo`는 `VoiceRedisRepository`와 `VoiceDailyFlushService`에서만 사용하므로 repository 파일에서 export하면 충분하다.

#### 0-2-2. 메서드 구현

기존 `setCategoryInfo` / `getCategoryInfo` 패턴과 동일하게 구현한다.

```typescript
/** 자동방 메타데이터 캐시 저장 (TTL 7일) */
async setAutoChannelInfo(
  guild: string,
  channelId: string,
  info: AutoChannelInfo,
): Promise<void> {
  const key = VoiceKeys.autoChannelInfo(guild, channelId);
  await this.redis.set(key, info, TTL.NAME_CACHE);
}

/** 자동방 메타데이터 캐시 조회 */
async getAutoChannelInfo(
  guild: string,
  channelId: string,
): Promise<AutoChannelInfo | null> {
  const key = VoiceKeys.autoChannelInfo(guild, channelId);
  return this.redis.get<AutoChannelInfo>(key);
}
```

**TTL 선택 근거**: 기존 `TTL.NAME_CACHE`가 7일(604800초)이다. 자동방 메타데이터도 duration 키 TTL(세션 12시간)보다 충분히 길어야 하므로 같은 7일을 재사용한다. 새 TTL 상수를 추가할 필요 없음.

---

### 0-3. auto-channel.service.ts — 확정방 생성 3곳에서 호출

**파일**: `apps/api/src/channel/auto/application/auto-channel.service.ts`

#### 0-3-1. 의존성 주입 추가

생성자에 `VoiceRedisRepository`를 추가한다.

```typescript
constructor(
  private readonly configRepo: AutoChannelConfigRepository,
  private readonly autoChannelRedis: AutoChannelRedisRepository,
  private readonly discordVoiceGateway: DiscordVoiceGateway,
  private readonly autoChannelDiscordGateway: AutoChannelDiscordGateway,
  private readonly voiceChannelService: VoiceChannelService,
  private readonly voiceRedisRepository: VoiceRedisRepository,  // 추가
) {}
```

import문 추가:
```typescript
import { VoiceRedisRepository } from '../../voice/infrastructure/voice-redis.repository';
```

#### 0-3-2. 헬퍼 메서드 추가

3곳의 확정방 생성에서 공통으로 호출할 private 헬퍼를 추가한다.

```typescript
/**
 * 확정방의 auto-channel 메타데이터를 Voice Redis에 캐싱한다 (F-VOICE-032).
 * flush 시점에 채널이 삭제된 뒤에도 조회할 수 있도록 7일 TTL로 저장.
 */
private async cacheAutoChannelInfo(
  guildId: string,
  channelId: string,
  configId: number,
  configName: string,
  channelType: 'auto_select' | 'auto_instant',
): Promise<void> {
  await this.voiceRedisRepository.setAutoChannelInfo(guildId, channelId, {
    configId,
    configName,
    channelType,
  });
}
```

#### 0-3-3. 호출 지점 1: convertToConfirmed (select 모드, interaction 경로)

**위치**: `convertToConfirmed()` 메서드의 "4. Redis 확정 상태 저장" 직후 (319-325행 이후)

```typescript
// 4. Redis 확정 상태 저장
await this.autoChannelRedis.setConfirmedState(confirmedChannelId, { ... });

// 4-1. Voice Redis에 auto-channel 메타데이터 캐싱 (F-VOICE-032)
await this.cacheAutoChannelInfo(
  guildId,
  confirmedChannelId,
  button.configId,
  button.config.name,
  'auto_select',
);
```

**config.name 접근**: `button`은 `AutoChannelButtonOrm` 타입이고, `button.config`는 `findButtonById()`에서 eager 로드된 `AutoChannelConfigOrm`이다. `config.name` 필드가 이미 사용 가능하다.

> 확인 필요: `convertToConfirmed`의 파라미터인 `button: AutoChannelButtonOrm`에서 `button.config`가 로드되어 있는지 검증. `handleButtonClick()`에서 `findButtonById(buttonId)` 호출 후 `button.config`를 체크하고 있으므로(166행) 로드됨이 보장된다.

#### 0-3-4. 호출 지점 2: convertToConfirmedFromBot (select 모드, Bot API 경로)

**위치**: `convertToConfirmedFromBot()` 메서드의 Redis 확정 상태 저장 직후 (614-620행 이후)

```typescript
await this.autoChannelRedis.setConfirmedState(confirmedChannelId, { ... });

// Voice Redis에 auto-channel 메타데이터 캐싱 (F-VOICE-032)
await this.cacheAutoChannelInfo(
  guildId,
  confirmedChannelId,
  button.configId,
  button.config.name,
  'auto_select',
);
```

**config.name 접근**: `handleButtonClickFromBot()`에서 `findButtonById(dto.buttonId)` 후 `button.config`를 체크하고 있으므로(506행) 로드됨이 보장된다.

#### 0-3-5. 호출 지점 3: handleInstantTriggerJoin (instant 모드)

**위치**: `handleInstantTriggerJoin()` 메서드의 Redis 확정 상태 저장 직후 (705-709행 이후)

```typescript
await this.autoChannelRedis.setConfirmedState(confirmedChannelId, { ... });

// Voice Redis에 auto-channel 메타데이터 캐싱 (F-VOICE-032)
await this.cacheAutoChannelInfo(
  guildId,
  confirmedChannelId,
  config.id,
  config.name,
  'auto_instant',
);
```

**config.name 접근**: `findByTriggerChannel()`로 조회한 `config` 객체에서 직접 접근. `config.name`은 `AutoChannelConfigOrm`의 필수 컬럼이므로 항상 존재한다.

---

### 0-4. AutoChannelModule 의존성 해결

**파일**: `apps/api/src/channel/auto/auto-channel.module.ts`

현재 상태:
- `AutoChannelModule`은 `VoiceChannelModule`을 import하고 있다 (6행)
- `VoiceChannelModule`은 `VoiceRedisRepository`를 exports에 포함하고 있다 (97행)

따라서 **모듈 변경이 필요 없다**. `VoiceRedisRepository`는 이미 `VoiceChannelModule`의 exports를 통해 `AutoChannelModule`에서 사용 가능하다.

`auto-channel.service.ts`의 생성자에 `VoiceRedisRepository`를 추가하면 NestJS DI가 자동으로 해결한다.

---

### 0-5. 엣지 케이스 및 에러 처리

#### cacheAutoChannelInfo 실패 시

`cacheAutoChannelInfo`는 확정방 생성의 핵심 흐름이 아닌 부가 기능이다. 그러나 이 메서드가 실패하면 flush 시 `channelType`이 `permanent`로 기록되는 정도의 영향이므로, **실패 시 로그만 남기고 진행**하는 방식도 고려할 수 있다.

다만, Redis 쓰기 실패는 거의 발생하지 않고, 기존 `setConfirmedState`도 에러 전파하는 패턴이므로 **동일하게 에러를 전파한다** (별도 try-catch 불필요). 호출부의 try-catch에서 통합 처리된다.

#### 이동 실패 시 고아 데이터

`convertToConfirmedFromBot()`에서 유저 이동 실패 시 `deleteConfirmedState`로 정리하는 로직이 있다 (604-606행). auto-channel 메타데이터도 함께 정리해야 하는가?

**결론: 정리하지 않아도 된다.** TTL 7일로 자연 만료되고, flush 시 해당 channelId의 duration이 0이면 flush되지 않으므로 실질적 영향이 없다.

---

## 단계 2: Flush 로직에 auto-channel 메타데이터 주입

> 전제: 단계 0 (Redis 메타데이터) + 단계 1 (DB 마이그레이션) 완료 후 진행

### 2-1. VoiceDailyFlushService.flushDate() 확장

**파일**: `apps/api/src/channel/voice/application/voice-daily-flush-service.ts`

#### 현재 flushDate() 채널별 루프 (38-65행)

```
flushDate()
  → scanKeys(`voice:duration:channel:{guild}:{user}:{date}:*`)
  → for each key:
      → channelId 추출
      → getChannelName(guild, channelId)
      → getCategoryInfo(guild, channelId)
      → accumulateChannelDuration(guild, user, userName, date, channelId, channelName, duration, categoryId, categoryName)
```

#### 변경 후 flushDate() 채널별 루프

```
flushDate()
  → scanKeys(`voice:duration:channel:{guild}:{user}:{date}:*`)
  → for each key:
      → channelId 추출
      → getChannelName(guild, channelId)
      → getCategoryInfo(guild, channelId)
      → getAutoChannelInfo(guild, channelId)          // 추가
      → accumulateChannelDuration(
          guild, user, userName, date, channelId, channelName, duration,
          categoryId, categoryName,
          autoChannelInfo?.channelType ?? 'permanent', // 추가
          autoChannelInfo?.configId ?? null,            // 추가
          autoChannelInfo?.configName ?? null,          // 추가
        )
```

#### 구체적 코드 변경

현재 코드 (44-64행)의 for 루프 내부에서:

```typescript
// 기존
const categoryInfo = await this.voiceRedisRepository.getCategoryInfo(guild, channelId);

await this.voiceDailyRepository.accumulateChannelDuration(
  guild, user, userName, date, channelId, channelName, duration,
  categoryInfo?.categoryId ?? null,
  categoryInfo?.categoryName ?? null,
);
```

변경:

```typescript
const categoryInfo = await this.voiceRedisRepository.getCategoryInfo(guild, channelId);
const autoChannelInfo = await this.voiceRedisRepository.getAutoChannelInfo(guild, channelId);

await this.voiceDailyRepository.accumulateChannelDuration(
  guild, user, userName, date, channelId, channelName, duration,
  categoryInfo?.categoryId ?? null,
  categoryInfo?.categoryName ?? null,
  autoChannelInfo?.channelType ?? 'permanent',
  autoChannelInfo?.configId ?? null,
  autoChannelInfo?.configName ?? null,
);
```

**성능 영향**: 채널별 1회 추가 Redis GET 호출. 기존에 `getChannelName` + `getCategoryInfo`로 2회 호출하던 것이 3회로 증가한다. 대부분의 채널은 상설 채널이므로 null을 빠르게 반환한다. 병목이 될 가능성은 낮다.

> 최적화 옵션 (필요시): `getChannelName`, `getCategoryInfo`, `getAutoChannelInfo`를 하나의 pipeline으로 묶어 1회 왕복으로 처리. 현재 단계에서는 불필요하며, 성능 이슈 발생 시 검토.

---

### 2-2. VoiceDailyRepository.accumulateChannelDuration() 시그니처 확장

**파일**: `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts`

#### 현재 시그니처 (21-31행)

```typescript
async accumulateChannelDuration(
  guildId: string,
  userId: string,
  userName: string,
  date: string,
  channelId: string,
  channelName: string,
  durationSec: number,
  categoryId: string | null,
  categoryName: string | null,
): Promise<void>
```

#### 변경 시그니처

```typescript
async accumulateChannelDuration(
  guildId: string,
  userId: string,
  userName: string,
  date: string,
  channelId: string,
  channelName: string,
  durationSec: number,
  categoryId: string | null,
  categoryName: string | null,
  channelType: string,                  // 추가: 'permanent' | 'auto_select' | 'auto_instant'
  autoChannelConfigId: number | null,   // 추가
  autoChannelConfigName: string | null, // 추가
): Promise<void>
```

**타입 선택 근거**: `channelType`을 union literal이 아닌 `string`으로 선언하는 이유는 DB 컬럼이 varchar(20)이고, repository 레이어는 DB에 가까운 계층이므로 엄격한 타입 체크는 서비스 레이어에서 담당한다. 다만, `'permanent' | 'auto_select' | 'auto_instant'`로 좁히는 것이 더 안전하므로 **union literal 타입을 사용한다**.

최종 결정: 아래 타입 별칭을 사용한다.

```typescript
type ChannelType = 'permanent' | 'auto_select' | 'auto_instant';
```

이 타입은 `voice-daily.orm-entity.ts`에 정의하고 export하여 repository와 service에서 공유한다.

---

### 2-3. UPSERT SQL 변경

**파일**: `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts`

#### 현재 SQL (33-47행)

```sql
INSERT INTO voice_daily AS vd
    ("guildId","userId","userName","date","channelId","channelName",
     "channelDurationSec","categoryId","categoryName","recordedAt")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT ("guildId","userId","date","channelId")
DO UPDATE SET
  "channelDurationSec" = vd."channelDurationSec" + EXCLUDED."channelDurationSec",
  "channelName" = EXCLUDED."channelName",
  "userName"    = EXCLUDED."userName",
  "categoryId"   = COALESCE(EXCLUDED."categoryId", vd."categoryId"),
  "categoryName" = COALESCE(EXCLUDED."categoryName", vd."categoryName"),
  "recordedAt"   = COALESCE(EXCLUDED."recordedAt", vd."recordedAt")
```

#### 변경 SQL

```sql
INSERT INTO voice_daily AS vd
    ("guildId","userId","userName","date","channelId","channelName",
     "channelDurationSec","categoryId","categoryName","recordedAt",
     "channelType","autoChannelConfigId","autoChannelConfigName")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT ("guildId","userId","date","channelId")
DO UPDATE SET
  "channelDurationSec" = vd."channelDurationSec" + EXCLUDED."channelDurationSec",
  "channelName" = EXCLUDED."channelName",
  "userName"    = EXCLUDED."userName",
  "categoryId"   = COALESCE(EXCLUDED."categoryId", vd."categoryId"),
  "categoryName" = COALESCE(EXCLUDED."categoryName", vd."categoryName"),
  "recordedAt"   = COALESCE(EXCLUDED."recordedAt", vd."recordedAt"),
  "channelType"  = CASE
    WHEN vd."channelType" != 'permanent' THEN vd."channelType"
    ELSE EXCLUDED."channelType"
  END,
  "autoChannelConfigId"   = COALESCE(vd."autoChannelConfigId", EXCLUDED."autoChannelConfigId"),
  "autoChannelConfigName" = COALESCE(vd."autoChannelConfigName", EXCLUDED."autoChannelConfigName")
```

#### UPSERT 전략 상세 설명

**channelType — CASE WHEN 패턴**:

| 기존 vd.channelType | EXCLUDED.channelType | 결과 | 이유 |
|---------------------|---------------------|------|------|
| `permanent` | `permanent` | `permanent` | 상설 채널 (정상) |
| `permanent` | `auto_select` | `auto_select` | 첫 flush에서 자동방 정보 반영 |
| `auto_select` | `permanent` | `auto_select` | Redis 만료 후 flush에서 기존 값 보존 |
| `auto_select` | `auto_select` | `auto_select` | 이미 올바른 값 유지 |
| `auto_instant` | `permanent` | `auto_instant` | Redis 만료 후 flush에서 기존 값 보존 |

핵심: 한번 `auto_select`나 `auto_instant`로 설정되면, 이후 flush에서 Redis 메타데이터가 만료되어 `permanent`가 들어와도 기존 값을 유지한다.

**autoChannelConfigId / autoChannelConfigName — COALESCE(vd, EXCLUDED) 패턴**:

```
COALESCE(vd."autoChannelConfigId", EXCLUDED."autoChannelConfigId")
```

- 기존 DB 값(vd)이 null이 아니면 기존 값 유지
- 기존 DB 값이 null이면 새 값(EXCLUDED) 적용
- 새 값도 null이면 null 유지

이 패턴은 `categoryId` / `categoryName`의 `COALESCE(EXCLUDED, vd)` 패턴과 **순서가 반대**이다.

| 패턴 | 사용처 | 이유 |
|------|--------|------|
| `COALESCE(EXCLUDED, vd)` | categoryId/Name | 새 값이 우선. 카테고리 이동 시 최신 카테고리 반영 |
| `COALESCE(vd, EXCLUDED)` | autoChannelConfigId/Name | 기존 값이 우선. 한번 설정되면 변경 불가 (config 변경 없음) |

#### 파라미터 바인딩 변경

```typescript
const params = [
  guildId,              // $1
  userId,               // $2
  userName,             // $3
  date,                 // $4
  channelId,            // $5
  channelName,          // $6
  durationSec,          // $7
  categoryId,           // $8
  categoryName,         // $9
  recordedAt,           // $10
  channelType,          // $11 (추가)
  autoChannelConfigId,  // $12 (추가)
  autoChannelConfigName,// $13 (추가)
];
```

---

### 2-4. 다른 accumulate 메서드에 대한 영향

`voice-daily.repository.ts`에는 `accumulateChannelDuration` 외에도 다음 메서드가 있다:
- `accumulateMicDuration` — GLOBAL 레코드
- `accumulateAloneDuration` — GLOBAL 레코드
- `accumulateStreamingDuration` — GLOBAL 레코드
- `accumulateVideoDuration` — GLOBAL 레코드
- `accumulateDeafDuration` — GLOBAL 레코드

이들은 모두 `channelId = 'GLOBAL'`로 INSERT한다. GLOBAL 레코드에는 auto-channel 정보를 저장하지 않으므로 **변경 불필요**하다. DB 컬럼의 기본값(`channelType = 'permanent'`, `autoChannelConfigId = NULL`, `autoChannelConfigName = NULL`)이 적용된다.

---

## 파일 변경 요약

| # | 파일 | 변경 유형 | 변경 내용 |
|---|------|----------|----------|
| 1 | `voice-cache.keys.ts` | 키 추가 | `autoChannelInfo(guild, channel)` 키 |
| 2 | `voice-redis.repository.ts` | 인터페이스 + 메서드 추가 | `AutoChannelInfo` 타입, `setAutoChannelInfo()`, `getAutoChannelInfo()` |
| 3 | `auto-channel.service.ts` | DI 추가 + 3곳 호출 | `VoiceRedisRepository` 주입, `cacheAutoChannelInfo()` 헬퍼, 확정방 생성 3곳에서 호출 |
| 4 | `voice-daily-flush-service.ts` | 조회 + 전달 | `getAutoChannelInfo()` 조회, `accumulateChannelDuration()` 파라미터 3개 추가 |
| 5 | `voice-daily.repository.ts` | 시그니처 + SQL | 파라미터 3개 추가, UPSERT SQL에 3컬럼 추가 |

**모듈 변경 불필요**: `AutoChannelModule`은 이미 `VoiceChannelModule`을 import하고 있고, `VoiceChannelModule`은 `VoiceRedisRepository`를 export하고 있다.

---

## 구현 순서 (권장)

```
0-1. VoiceKeys에 키 추가
  ↓
0-2. VoiceRedisRepository에 set/get 메서드 추가
  ↓
0-3. AutoChannelService에 DI + 헬퍼 + 3곳 호출 추가
  ↓
(단계 1: DB 마이그레이션 — 별도 문서)
  ↓
2-2. VoiceDailyRepository 시그니처 + SQL 확장
  ↓
2-1. VoiceDailyFlushService에서 조회 + 전달 로직 추가
```

단계 0과 단계 1은 병렬로 진행 가능하지만, 단계 2는 **반드시 둘 다 완료 후** 진행해야 한다 (DB 컬럼이 없으면 SQL 에러, Redis 메타데이터가 없으면 항상 permanent로 기록).

---

## 테스트 시나리오

### 단계 0 검증

1. **select 모드 확정방 생성**: 버튼 클릭 → 확정방 생성 → Redis에 `voice:channel:auto:{guildId}:{channelId}` 키가 `{ configId, configName, channelType: 'auto_select' }` 값으로 존재하는지 확인
2. **instant 모드 확정방 생성**: 트리거 채널 입장 → 즉시 생성 → Redis에 `channelType: 'auto_instant'`로 저장되는지 확인
3. **TTL 확인**: 키의 TTL이 약 7일(604800초)인지 확인
4. **채널 삭제 후 조회**: 확정방 삭제 (모든 유저 퇴장) → `auto_channel:confirmed:{channelId}` 키는 삭제됨 → `voice:channel:auto:{guildId}:{channelId}` 키는 여전히 존재하는지 확인

### 단계 2 검증

1. **자동방 flush**: 자동방에서 음성 활동 후 퇴장 → `voice_daily` 레코드에 `channelType = 'auto_select'` (또는 `'auto_instant'`), `autoChannelConfigId`, `autoChannelConfigName`이 올바르게 기록되는지 확인
2. **상설 채널 flush**: 일반 채널에서 음성 활동 후 퇴장 → `voice_daily` 레코드에 `channelType = 'permanent'`, `autoChannelConfigId = NULL`, `autoChannelConfigName = NULL`인지 확인
3. **Redis 만료 후 재flush**: 자동방에서 활동 → 첫 flush로 DB에 `auto_select` 기록됨 → Redis 키 수동 삭제(만료 시뮬레이션) → 같은 channelId로 재flush → DB의 `channelType`이 `auto_select` 유지되는지 확인 (CASE WHEN 보존)
4. **safeFlushAll**: 스케줄러에 의한 전체 flush에서도 auto-channel 정보가 정상 반영되는지 확인
5. **GLOBAL 레코드 미영향**: flush 후 `channelId = 'GLOBAL'` 레코드의 `channelType`이 `permanent`, `autoChannelConfigId`가 NULL인지 확인
