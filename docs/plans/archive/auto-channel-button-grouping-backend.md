# 자동방 그룹핑 단위 변경 (Config -> Button) -- 백엔드 구현 계획

> 최종 업데이트: 2026-04-04
> PRD 참조: F-VOICE-032 ~ F-VOICE-038

## 개요

기존 자동방 통계 그룹핑은 `autoChannelConfigId` 단위로만 합산한다. 같은 Config 안에 여러 Button이 있을 때 (예: "일반방", "랭크방") 이를 구분할 수 없는 문제가 있다.

이 계획은 **buttonId/buttonLabel** 필드를 데이터 파이프라인 전체에 추가하고, 그룹핑 로직을 **buttonId 우선 / configId 폴백**(즉시 모드)으로 변경한다.

### 변경 범위 요약

| 레이어 | 변경 요약 |
|--------|----------|
| Redis 메타데이터 | `AutoChannelInfo`에 `buttonId`, `buttonLabel` 추가 |
| Auto-channel 서비스 | 캐싱 호출 3곳에 button 정보 전달 |
| voice_daily Entity | `autoChannelButtonId`, `autoChannelButtonLabel` 컬럼 (이미 완료) |
| voice_daily Repository | UPSERT SQL에 2개 컬럼 추가 |
| Flush 서비스 | Redis -> DB 전달 시 button 정보 주입 |
| DTO/서비스 매핑 | `VoiceDailyRecordDto` + `VoiceDailyService` 확장 |
| VoiceAnalyticsService | 그룹핑 키를 `buttonId` 우선으로 변경 |
| 공유 타입 | `ChannelStatItem`에 button 필드 추가 |

---

## 구현 순서

의존 관계에 따라 아래 순서로 구현한다:

```
Step 1: AutoChannelInfo 인터페이스 확장 (Redis)
  |
Step 2: auto-channel.service.ts 캐싱 호출 수정 (3곳)
  |
Step 3: voice-daily.repository.ts UPSERT SQL 확장
  |
Step 4: voice-daily-flush-service.ts button 정보 주입
  |
Step 5: VoiceDailyRecordDto + VoiceDailyService 매핑 확장
  |
Step 6: ChannelStatItem 공유 타입 확장
  |
Step 7: VoiceAnalyticsService 그룹핑 로직 변경
```

---

## Step 1: AutoChannelInfo 인터페이스 확장

**파일**: `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts`
**변경 위치**: L8-12 (`AutoChannelInfo` 인터페이스)

### 현재 코드

```typescript
export interface AutoChannelInfo {
  configId: number;
  configName: string;
  channelType: 'auto_select' | 'auto_instant';
}
```

### 변경 후

```typescript
export interface AutoChannelInfo {
  configId: number;
  configName: string;
  channelType: 'auto_select' | 'auto_instant';
  buttonId: number | null;
  buttonLabel: string | null;
}
```

### 주의사항

- `setAutoChannelInfo()` / `getAutoChannelInfo()` 메서드는 제네릭 `AutoChannelInfo` 타입을 사용하므로 시그니처 변경 불필요
- 기존에 Redis에 저장된 `AutoChannelInfo`에는 `buttonId`, `buttonLabel` 키가 없으므로, 조회 시 `undefined`로 반환됨. Flush 서비스에서 `?? null` 폴백 처리 필요 (Step 4에서 처리)

---

## Step 2: auto-channel.service.ts 캐싱 호출 수정

**파일**: `apps/api/src/channel/auto/application/auto-channel.service.ts`

### 2-1. `cacheAutoChannelInfo()` private 메서드 시그니처 확장

**변경 위치**: L768-786

현재:
```typescript
private async cacheAutoChannelInfo({
  guildId,
  channelId,
  configId,
  configName,
  channelType,
}: {
  guildId: string;
  channelId: string;
  configId: number;
  configName: string;
  channelType: 'auto_select' | 'auto_instant';
}): Promise<void> {
  await this.voiceRedisRepository.setAutoChannelInfo(guildId, channelId, {
    configId,
    configName,
    channelType,
  });
}
```

변경 후:
```typescript
private async cacheAutoChannelInfo({
  guildId,
  channelId,
  configId,
  configName,
  channelType,
  buttonId,
  buttonLabel,
}: {
  guildId: string;
  channelId: string;
  configId: number;
  configName: string;
  channelType: 'auto_select' | 'auto_instant';
  buttonId: number | null;
  buttonLabel: string | null;
}): Promise<void> {
  await this.voiceRedisRepository.setAutoChannelInfo(guildId, channelId, {
    configId,
    configName,
    channelType,
    buttonId,
    buttonLabel,
  });
}
```

### 2-2. 호출 지점 1 -- `confirmChannel()` (select 모드)

**변경 위치**: L330-336

```typescript
await this.cacheAutoChannelInfo({
  guildId,
  channelId: confirmedChannelId,
  configId: button.configId,
  configName: button.config.name,
  channelType: 'auto_select',
  buttonId: button.id,        // 추가
  buttonLabel: button.label,   // 추가
});
```

### 2-3. 호출 지점 2 -- `createAndMoveToConfirmedChannel()` (select 모드, bot 경유)

**변경 위치**: L634-640

```typescript
await this.cacheAutoChannelInfo({
  guildId,
  channelId: confirmedChannelId,
  configId: button.configId,
  configName: button.config.name,
  channelType: 'auto_select',
  buttonId: button.id,        // 추가
  buttonLabel: button.label,   // 추가
});
```

### 2-4. 호출 지점 3 -- `handleInstantTriggerJoin()` (instant 모드)

**변경 위치**: L732-738

```typescript
await this.cacheAutoChannelInfo({
  guildId,
  channelId: confirmedChannelId,
  configId: config.id,
  configName: config.name,
  channelType: 'auto_instant',
  buttonId: null,              // 추가 (즉시 모드는 버튼 없음)
  buttonLabel: null,           // 추가
});
```

### 주의사항

- `button.label`은 `AutoChannelButtonOrm.label` (string, non-nullable) 이므로 null 체크 불필요
- `button.id`는 `AutoChannelButtonOrm.id` (number, PK) 이므로 항상 존재

---

## Step 3: voice-daily.repository.ts UPSERT SQL 확장

**파일**: `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts`
**변경 위치**: L7-22 (인터페이스), L38-91 (UPSERT 메서드)

### 3-1. AccumulateChannelDurationParams 인터페이스 확장

L20-21 뒤에 추가:
```typescript
autoChannelButtonId?: number | null;
autoChannelButtonLabel?: string | null;
```

### 3-2. accumulateChannelDuration() 메서드 변경

파라미터 destructuring (L39-52)에 추가:
```typescript
const {
  // ... 기존 필드
  autoChannelButtonId = null,
  autoChannelButtonLabel = null,
} = params;
```

INSERT SQL (L56-59) 변경 -- 컬럼 목록에 2개 추가:
```sql
INSERT INTO voice_daily AS vd
    ("guildId","userId","userName","date","channelId","channelName","channelDurationSec","categoryId","categoryName","recordedAt",
     "channelType","autoChannelConfigId","autoChannelConfigName","autoChannelButtonId","autoChannelButtonLabel")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
```

ON CONFLICT DO UPDATE SET (L73-74 뒤에 추가):
```sql
"autoChannelButtonId"    = COALESCE(vd."autoChannelButtonId",    EXCLUDED."autoChannelButtonId"),
"autoChannelButtonLabel" = COALESCE(vd."autoChannelButtonLabel", EXCLUDED."autoChannelButtonLabel")
```

파라미터 배열 (L76-91) 변경 -- 2개 추가:
```typescript
[
  guildId, userId, userName, date, channelId, channelName,
  durationSec, categoryId, categoryName, recordedAt,
  channelType, autoChannelConfigId, autoChannelConfigName,
  autoChannelButtonId, autoChannelButtonLabel,   // $14, $15
]
```

### 주의사항

- `COALESCE(vd."autoChannelButtonId", EXCLUDED."autoChannelButtonId")` 패턴으로 기존 값 우선 보존 (configId/configName과 동일한 전략)
- 파라미터 인덱스가 `$13`에서 `$15`까지 늘어남

---

## Step 4: voice-daily-flush-service.ts button 정보 주입

**파일**: `apps/api/src/channel/voice/application/voice-daily-flush-service.ts`
**변경 위치**: L54-67 (`accumulateChannelDuration` 호출 부분)

### 변경 내용

기존 호출에 `autoChannelButtonId`, `autoChannelButtonLabel` 2개 필드 추가:

```typescript
await this.voiceDailyRepository.accumulateChannelDuration({
  guildId: guild,
  userId: user,
  userName,
  date,
  channelId,
  channelName,
  durationSec: duration,
  categoryId: categoryInfo?.categoryId ?? null,
  categoryName: categoryInfo?.categoryName ?? null,
  channelType: autoChannelInfo?.channelType ?? 'permanent',
  autoChannelConfigId: autoChannelInfo?.configId ?? null,
  autoChannelConfigName: autoChannelInfo?.configName ?? null,
  autoChannelButtonId: autoChannelInfo?.buttonId ?? null,      // 추가
  autoChannelButtonLabel: autoChannelInfo?.buttonLabel ?? null, // 추가
});
```

### 주의사항

- 기존 Redis에 저장된 `AutoChannelInfo`에 `buttonId`/`buttonLabel`이 없으면 `undefined`로 반환되므로, `?? null` 폴백이 필수
- Step 1에서 Redis 롤링 업데이트 동안 기존 캐시와 신규 캐시가 혼재할 수 있지만, `?? null` 폴백으로 안전하게 처리됨

---

## Step 5: VoiceDailyRecordDto + VoiceDailyService 매핑 확장

### 5-1. VoiceDailyRecordDto

**파일**: `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts`
**변경 위치**: L16-17 (마지막 필드 뒤)

추가:
```typescript
autoChannelButtonId: number | null;
autoChannelButtonLabel: string | null;
```

### 5-2. VoiceDailyService 매핑

**파일**: `apps/api/src/channel/voice/application/voice-daily.service.ts`
**변경 위치**: L38-39 (매핑 객체의 마지막 필드 뒤)

추가:
```typescript
autoChannelButtonId: e.autoChannelButtonId ?? null,
autoChannelButtonLabel: e.autoChannelButtonLabel ?? null,
```

---

## Step 6: ChannelStatItem 공유 타입 확장

**파일**: `libs/shared/src/types/diagnosis.ts`
**변경 위치**: L37-47 (`ChannelStatItem` 인터페이스)

### 변경 후

```typescript
export interface ChannelStatItem {
  channelId: string;
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  totalSec: number;
  uniqueUsers: number;
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
  autoChannelButtonId: number | null;      // 추가
  autoChannelButtonLabel: string | null;   // 추가
}
```

### 주의사항

- 이 타입은 `@onyu/shared` 패키지에 있으므로, 프론트엔드에서도 참조됨
- 프론트엔드 빌드 시 자동으로 새 필드가 반영됨

---

## Step 7: VoiceAnalyticsService 그룹핑 로직 변경

**파일**: `apps/api/src/voice-analytics/application/voice-analytics.service.ts`

### 7-1. ChannelStatAggregate 인터페이스 확장

**변경 위치**: L29-39

추가 필드:
```typescript
autoChannelButtonId: number | null;
autoChannelButtonLabel: string | null;
```

### 7-2. getChannelStats() 채널 집계 루프 확장

**변경 위치**: L478-496

기존 `chMap` 초기화 및 업데이트 코드에 button 필드 추가:

초기화 시:
```typescript
const existing = chMap.get(r.channelId) ?? {
  // ... 기존 필드
  autoChannelButtonId: r.autoChannelButtonId ?? null,
  autoChannelButtonLabel: r.autoChannelButtonLabel ?? null,
};
```

업데이트 시 (L494-495 뒤):
```typescript
if (r.autoChannelButtonId) existing.autoChannelButtonId = r.autoChannelButtonId;
if (r.autoChannelButtonLabel) existing.autoChannelButtonLabel = r.autoChannelButtonLabel;
```

### 7-3. 그룹핑 결과 매핑에 button 필드 추가

**변경 위치**: L527-538 (`groupByAutoChannelConfig` 메서드의 return 문)

```typescript
return Array.from(resultMap.entries())
  .map(([channelId, ch]) => ({
    channelId,
    channelName: ch.channelName,
    categoryId: ch.categoryId,
    categoryName: ch.categoryName,
    channelType: ch.channelType,
    autoChannelConfigId: ch.autoChannelConfigId,
    autoChannelConfigName: ch.autoChannelConfigName,
    autoChannelButtonId: ch.autoChannelButtonId,        // 추가
    autoChannelButtonLabel: ch.autoChannelButtonLabel,   // 추가
    totalSec: ch.totalSec,
    uniqueUsers: ch.uniqueUsers.size,
  }))
  .sort((a, b) => b.totalSec - a.totalSec);
```

### 7-4. buildGroupedResultMap() 그룹핑 키 변경 (핵심 변경)

**변경 위치**: L542-578

**현재 로직**: `autoChannelConfigId`가 있으면 `auto:{configId}`로 그룹핑
**변경 로직**: `autoChannelButtonId`가 있으면 `auto:button:{buttonId}`로, 없으면(즉시 모드) `auto:config:{configId}`로 폴백

```typescript
private buildGroupedResultMap(
  chMap: Map<string, ChannelStatAggregate>,
): Map<string, ChannelStatAggregate> {
  const resultMap = new Map<string, ChannelStatAggregate>();

  for (const [channelId, ch] of chMap) {
    if (ch.autoChannelConfigId == null) {
      // 상설 채널: 그대로 유지
      resultMap.set(channelId, { ...ch });
      continue;
    }

    // 자동방: buttonId 우선, configId 폴백 (즉시 모드)
    const groupKey = ch.autoChannelButtonId != null
      ? `auto:button:${ch.autoChannelButtonId}`
      : `auto:config:${ch.autoChannelConfigId}`;

    const existing = resultMap.get(groupKey);

    if (existing) {
      existing.totalSec += ch.totalSec;
      for (const userId of ch.uniqueUsers) {
        existing.uniqueUsers.add(userId);
      }
    } else {
      // 표시명: buttonLabel 우선, configName 폴백, channelName 최종 폴백
      const displayName = ch.autoChannelButtonLabel
        ?? ch.autoChannelConfigName
        ?? ch.channelName;

      resultMap.set(groupKey, {
        channelName: displayName,
        categoryId: ch.categoryId,
        categoryName: ch.categoryName,
        channelType: ch.channelType,
        autoChannelConfigId: ch.autoChannelConfigId,
        autoChannelConfigName: ch.autoChannelConfigName,
        autoChannelButtonId: ch.autoChannelButtonId,
        autoChannelButtonLabel: ch.autoChannelButtonLabel,
        totalSec: ch.totalSec,
        uniqueUsers: new Set(ch.uniqueUsers),
      });
    }
  }

  return resultMap;
}
```

### 7-5. 비그룹핑 결과 매핑에도 button 필드 추가

**변경 위치**: L503-515 (`getChannelStats()`의 비그룹핑 return 문)

```typescript
return Array.from(chMap.entries())
  .map(([channelId, ch]) => ({
    channelId,
    channelName: ch.channelName,
    categoryId: ch.categoryId,
    categoryName: ch.categoryName,
    totalSec: ch.totalSec,
    uniqueUsers: ch.uniqueUsers.size,
    channelType: ch.channelType,
    autoChannelConfigId: ch.autoChannelConfigId,
    autoChannelConfigName: ch.autoChannelConfigName,
    autoChannelButtonId: ch.autoChannelButtonId,        // 추가
    autoChannelButtonLabel: ch.autoChannelButtonLabel,   // 추가
  }))
  .sort((a, b) => b.totalSec - a.totalSec);
```

### 7-6. aggregateChannelStats() (collectVoiceActivityData 내부)에도 동일 적용

**변경 위치**: L230-275

`ChannelAggregate` 인터페이스 (L16-27)에 필드 추가:
```typescript
autoChannelButtonId: number | null;
autoChannelButtonLabel: string | null;
```

`aggregateChannelStats()` 내부 channelMap 초기화 (L235-247)에 추가:
```typescript
autoChannelButtonId: record.autoChannelButtonId ?? null,
autoChannelButtonLabel: record.autoChannelButtonLabel ?? null,
```

업데이트 로직 (L258-259 뒤):
```typescript
if (record.autoChannelButtonId) channel.autoChannelButtonId = record.autoChannelButtonId;
if (record.autoChannelButtonLabel) channel.autoChannelButtonLabel = record.autoChannelButtonLabel;
```

---

## DB 마이그레이션

**voice_daily ORM Entity**는 이미 `autoChannelButtonId`, `autoChannelButtonLabel` 컬럼이 추가 완료되어 있다.

마이그레이션 SQL (기존 마이그레이션에 추가 또는 신규 마이그레이션 생성):

```sql
ALTER TABLE voice_daily
  ADD COLUMN IF NOT EXISTS "autoChannelButtonId" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "autoChannelButtonLabel" VARCHAR(255) NULL;

-- 버튼 단위 그룹핑 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS "IDX_voice_daily_auto_button"
  ON voice_daily ("guildId", "autoChannelButtonId", "date")
  WHERE "autoChannelButtonId" IS NOT NULL;
```

---

## 전체 파일 변경 요약

| # | 파일 | Step | 변경 내용 |
|---|------|------|----------|
| 1 | `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts` | 1 | `AutoChannelInfo` 인터페이스에 `buttonId`, `buttonLabel` 추가 |
| 2 | `apps/api/src/channel/auto/application/auto-channel.service.ts` | 2 | `cacheAutoChannelInfo()` 시그니처 확장 + 호출 3곳에 button 정보 전달 |
| 3 | `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts` | 3 | `AccumulateChannelDurationParams` 확장 + UPSERT SQL 2개 컬럼 추가 |
| 4 | `apps/api/src/channel/voice/application/voice-daily-flush-service.ts` | 4 | `accumulateChannelDuration()` 호출에 `buttonId`, `buttonLabel` 전달 |
| 5 | `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts` | 5 | DTO에 2개 필드 추가 |
| 6 | `apps/api/src/channel/voice/application/voice-daily.service.ts` | 5 | Entity -> DTO 매핑에 2개 필드 추가 |
| 7 | `libs/shared/src/types/diagnosis.ts` | 6 | `ChannelStatItem`에 2개 필드 추가 |
| 8 | `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | 7 | `ChannelStatAggregate`/`ChannelAggregate` 확장 + 그룹핑 키를 buttonId 우선으로 변경 |

## 하위 호환성

- **Redis**: 기존 캐시에 `buttonId`/`buttonLabel`이 없으면 `undefined`로 반환. Flush 서비스에서 `?? null`로 안전 처리
- **DB**: 새 컬럼은 nullable이므로 기존 레코드는 null 유지. `COALESCE`로 기존 값 우선 보존
- **API**: 새 필드는 nullable이므로 기존 클라이언트가 무시 가능
- **그룹핑**: `buttonId`가 null인 레코드(즉시 모드 및 레거시)는 `configId` 폴백으로 기존 동작 유지
