# 자동방 채널 통계 그룹핑 구현 계획

> 최종 업데이트: 2026-03-27

## 개요

자동방(Auto Channel)으로 생성된 임시 채널들이 각각 별개의 channelId를 가지므로, 대시보드의 음성 채널 통계가 파편화되는 문제를 해결한다. 두 가지 방안을 조합하여 구현한다:

- **autoChannelConfigId**: 자동방 인스턴스들을 config 단위로 그룹핑하여 "게임방-1", "게임방-2" 등을 하나의 "게임방" 통계로 합산
- **channelType**: 상설(permanent) / 자동방-선택(auto_select) / 자동방-즉시(auto_instant) 유형을 구분하여 필터링 지원

### 핵심 문제

flush 시점에 channelId만으로는 해당 채널이 자동방인지, 어떤 config에 속하는지 알 수 없다. Redis `auto_channel:confirmed:{channelId}` 상태는 채널 삭제 시 함께 삭제되므로, 이미 삭제된 자동방의 flush 시점에 정보가 소실된다.

---

## 단계 0: Redis 자동방 메타데이터 분리 저장 (타이밍 문제 해결)

### 문제 분석

현재 데이터 흐름에서 타이밍 이슈가 발생하는 경로:

```
1. 자동방 확정 → Redis confirmed state 저장 (configId, buttonId 포함)
2. 사용자 음성 세션 추적 (channelId 기반, auto-channel 정보 없음)
3. 모든 사용자 퇴장 → handleChannelEmpty() 호출
   3a. deleteConfirmedState(channelId)  ← Redis에서 삭제
   3b. deleteChannel(channelId)         ← Discord 채널 삭제
4. closeSession() → flushDate() 호출   ← 이 시점에 confirmed state 이미 없음!
```

closeSession()의 호출 순서를 보면:
- `BotVoiceEventListener.handleLeave()` → `voiceChannelService.onUserLeave()` → `voiceSessionService.closeSession()` → `flushDate()`
- 그 후 fire-and-forget으로 `autoChannelService.handleChannelEmpty()` → `deleteConfirmedState()`

따라서 **마지막 사용자의 leave 이벤트**에서는 `closeSession()`이 `handleChannelEmpty()`보다 먼저 실행되므로, confirmed state가 아직 존재한다. 그러나 `closeSession()` 내부에서 `flushDate()`가 Redis duration 키의 channelId를 기반으로 동작하므로, **flush 시점에 confirmed state를 조회할 수 있다**.

다만 다음 엣지 케이스가 존재한다:
- **날짜 변경 flush**: `startOrUpdateSession()`에서 날짜가 바뀌면 이전 날짜를 flush하는데, 이때 채널이 이미 삭제되어 confirmed state가 없을 수 있음
- **safeFlushAll()**: 스케줄러에 의한 전체 flush 시, 채널이 이미 삭제된 후일 수 있음
- **경합 조건**: fire-and-forget인 `handleChannelEmpty()`가 비동기로 빠르게 실행될 경우

### 해결 방안: Voice Redis에 auto-channel 메타데이터 별도 저장

auto-channel 확정 시점에 Voice Redis에도 채널의 auto-channel 정보를 캐싱한다. 이 키는 채널 삭제와 무관하게 TTL로 자연 만료된다.

**새 Redis 키**: `voice:channel:auto:{guildId}:{channelId}`
**값**: `{ configId: number, configName: string, channelType: 'auto_select' | 'auto_instant' }`
**TTL**: 7일 (duration 키 TTL보다 충분히 길게)

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/api/src/channel/voice/infrastructure/voice-cache.keys.ts` | `autoChannelInfo(guild, channel)` 키 추가 |
| `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts` | `setAutoChannelInfo()` / `getAutoChannelInfo()` 메서드 추가 |
| `apps/api/src/channel/auto/application/auto-channel.service.ts` | 확정방 생성 시점에 `VoiceRedisRepository.setAutoChannelInfo()` 호출 추가 (3곳: `confirmChannel()`, `createAndMoveToConfirmedChannel()`, `handleInstantTriggerJoin()`) |

### 의존관계

- `auto-channel.service.ts`에 `VoiceRedisRepository` 의존성 주입 필요
- `auto-channel.module.ts`에서 `VoiceModule` import 또는 `VoiceRedisRepository` provider 공유 필요

---

## 단계 1: DB 스키마 변경 (voice_daily 테이블)

### 새 컬럼

```sql
ALTER TABLE voice_daily
  ADD COLUMN "channelType" VARCHAR(20) NOT NULL DEFAULT 'permanent',
  ADD COLUMN "autoChannelConfigId" INTEGER NULL,
  ADD COLUMN "autoChannelConfigName" VARCHAR(255) NULL;
```

- `channelType`: `'permanent'` | `'auto_select'` | `'auto_instant'` -- 기본값 `'permanent'`로 기존 데이터 호환
- `autoChannelConfigId`: `auto_channel_config.id`에 대한 논리적 참조 (FK 제약 없음 -- config 삭제 시에도 통계 유지)
- `autoChannelConfigName`: config.name의 스냅샷 (config 삭제 후에도 표시명 유지)

### 인덱스

```sql
-- 자동방 config 단위 그룹핑 조회 최적화
CREATE INDEX "IDX_voice_daily_auto_config"
  ON voice_daily ("guildId", "autoChannelConfigId", "date")
  WHERE "autoChannelConfigId" IS NOT NULL;

-- channelType 필터링 최적화 (partial index — permanent 제외)
CREATE INDEX "IDX_voice_daily_channel_type"
  ON voice_daily ("guildId", "date")
  WHERE "channelType" != 'permanent';
```

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/api/src/channel/voice/infrastructure/voice-daily.orm-entity.ts` | `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 컬럼 추가 |
| `apps/api/src/migrations/1776400000000-AddAutoChannelGrouping.ts` | 신규 마이그레이션 파일 생성 |

### ORM Entity 변경

```typescript
// voice-daily.orm-entity.ts에 추가
@Column({ type: 'varchar', length: 20, default: 'permanent' })
channelType: 'permanent' | 'auto_select' | 'auto_instant';

@Column({ type: 'int', nullable: true })
autoChannelConfigId: number | null;

@Column({ type: 'varchar', length: 255, nullable: true })
autoChannelConfigName: string | null;
```

### 마이그레이션 코드

```typescript
export class AddAutoChannelGrouping1776400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE voice_daily
        ADD COLUMN "channelType" VARCHAR(20) NOT NULL DEFAULT 'permanent',
        ADD COLUMN "autoChannelConfigId" INTEGER,
        ADD COLUMN "autoChannelConfigName" VARCHAR(255);
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_voice_daily_auto_config"
        ON voice_daily ("guildId", "autoChannelConfigId", "date")
        WHERE "autoChannelConfigId" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_voice_daily_channel_type"
        ON voice_daily ("guildId", "date")
        WHERE "channelType" != 'permanent';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_voice_daily_channel_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_voice_daily_auto_config"`);
    await queryRunner.query(`
      ALTER TABLE voice_daily
        DROP COLUMN "autoChannelConfigName",
        DROP COLUMN "autoChannelConfigId",
        DROP COLUMN "channelType";
    `);
  }
}
```

---

## 단계 2: Flush 로직에 auto-channel 메타데이터 주입

### 데이터 흐름 변경

```
[기존]
flushDate() → channelId 추출 → channelName/categoryInfo 조회 → accumulateChannelDuration()

[변경]
flushDate() → channelId 추출 → channelName/categoryInfo 조회
  → autoChannelInfo 조회 (voice:channel:auto:{guildId}:{channelId})
  → accumulateChannelDuration() (autoChannelInfo 파라미터 추가)
```

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/api/src/channel/voice/application/voice-daily-flush-service.ts` | `flushDate()`에서 `voiceRedisRepository.getAutoChannelInfo()` 조회 후 `accumulateChannelDuration()`에 전달 |
| `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts` | `accumulateChannelDuration()` 시그니처 확장 -- `autoChannelInfo` 옵셔널 파라미터 추가, UPSERT SQL 수정 |

### Repository UPSERT 변경

```sql
INSERT INTO voice_daily AS vd
    ("guildId","userId","userName","date","channelId","channelName",
     "channelDurationSec","categoryId","categoryName","recordedAt",
     "channelType","autoChannelConfigId","autoChannelConfigName")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT ("guildId","userId","date","channelId")
DO UPDATE SET
  "channelDurationSec" = vd."channelDurationSec" + EXCLUDED."channelDurationSec",
  "channelName"        = EXCLUDED."channelName",
  "userName"           = EXCLUDED."userName",
  "categoryId"         = COALESCE(EXCLUDED."categoryId", vd."categoryId"),
  "categoryName"       = COALESCE(EXCLUDED."categoryName", vd."categoryName"),
  "recordedAt"         = COALESCE(EXCLUDED."recordedAt", vd."recordedAt"),
  "channelType"        = CASE
    WHEN vd."channelType" != 'permanent' THEN vd."channelType"
    ELSE EXCLUDED."channelType"
  END,
  "autoChannelConfigId"   = COALESCE(vd."autoChannelConfigId",   EXCLUDED."autoChannelConfigId"),
  "autoChannelConfigName" = COALESCE(vd."autoChannelConfigName", EXCLUDED."autoChannelConfigName")
```

### FlushService 변경 상세

```typescript
// voice-daily-flush-service.ts flushDate() 내부, 채널별 loop에서:

const autoChannelInfo = await this.voiceRedisRepository.getAutoChannelInfo(guild, channelId);

await this.voiceDailyRepository.accumulateChannelDuration(
  guild, user, userName, date, channelId, channelName, duration,
  categoryInfo?.categoryId ?? null,
  categoryInfo?.categoryName ?? null,
  // 새 파라미터
  autoChannelInfo?.channelType ?? 'permanent',
  autoChannelInfo?.configId ?? null,
  autoChannelInfo?.configName ?? null,
);
```

### 의존관계

- 단계 0 완료 필수 (Redis에 auto-channel 정보가 있어야 함)
- 단계 1 완료 필수 (DB 컬럼이 존재해야 함)

---

## 단계 3: API 응답 확장 (하위 호환)

### DTO 변경

기존 필드를 유지하면서 새 필드를 옵셔널로 추가한다.

| 파일 | 변경 내용 |
|------|----------|
| `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts` | `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 필드 추가 |
| `apps/api/src/channel/voice/application/voice-daily.service.ts` | 엔티티 → DTO 매핑에 새 필드 포함 |
| `libs/shared/src/types/diagnosis.ts` | `ChannelStatItem`에 `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 추가 |
| `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | `getChannelStats()`에서 새 필드 매핑 |

### VoiceDailyRecordDto 변경

```typescript
export class VoiceDailyRecordDto {
  // ... 기존 필드 유지
  channelType: 'permanent' | 'auto_select' | 'auto_instant';  // 기본값 'permanent'
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}
```

### ChannelStatItem 변경 (libs/shared)

```typescript
export interface ChannelStatItem {
  // ... 기존 필드 유지
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}
```

### VoiceAnalyticsService.getChannelStats() 변경

```typescript
// 기존 chMap에 channelType, autoChannelConfigId, autoChannelConfigName 추가
const existing = chMap.get(r.channelId) ?? {
  channelName: r.channelName ?? `Channel-${r.channelId.slice(0, 6)}`,
  categoryId: r.categoryId ?? null,
  categoryName: r.categoryName ?? null,
  channelType: r.channelType ?? 'permanent',
  autoChannelConfigId: r.autoChannelConfigId ?? null,
  autoChannelConfigName: r.autoChannelConfigName ?? null,
  totalSec: 0,
  uniqueUsers: new Set<string>(),
};
```

### 하위 호환성

- 기존 클라이언트는 새 필드를 무시하면 됨
- `channelType` 기본값 `'permanent'`로 기존 레코드와 호환
- `autoChannelConfigId`, `autoChannelConfigName`은 nullable

---

## 단계 4: 프론트엔드 타입 및 집계 함수 확장

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/web/app/lib/voice-dashboard-api.ts` | 타입 확장 + `computeAutoChannelGroupStats()` 함수 추가 + `computeChannelStats()` 그룹핑 옵션 추가 |

### 타입 확장

```typescript
export interface VoiceDailyRecord {
  // ... 기존 필드 유지
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}

/** 자동방 config 단위 그룹 통계 */
export interface VoiceAutoChannelGroupStat {
  autoChannelConfigId: number;
  autoChannelConfigName: string;
  channelType: 'auto_select' | 'auto_instant';
  totalDurationSec: number;
  instanceCount: number;  // 해당 config로 생성된 고유 channelId 수
}
```

### 새 집계 함수

```typescript
/** 자동방 레코드를 config 단위로 그룹핑하여 통계를 계산한다 */
export function computeAutoChannelGroupStats(
  records: VoiceDailyRecord[],
): VoiceAutoChannelGroupStat[] {
  const autoRecords = records.filter(
    (r) => r.channelId !== 'GLOBAL' && r.autoChannelConfigId != null,
  );
  const byConfig = new Map<number, VoiceAutoChannelGroupStat & { channelIds: Set<string> }>();

  for (const r of autoRecords) {
    const configId = r.autoChannelConfigId!;
    const existing = byConfig.get(configId);
    if (existing) {
      existing.totalDurationSec += r.channelDurationSec;
      existing.channelIds.add(r.channelId);
    } else {
      byConfig.set(configId, {
        autoChannelConfigId: configId,
        autoChannelConfigName: r.autoChannelConfigName ?? `Config-${configId}`,
        channelType: r.channelType as 'auto_select' | 'auto_instant',
        totalDurationSec: r.channelDurationSec,
        instanceCount: 0,
        channelIds: new Set([r.channelId]),
      });
    }
  }

  return Array.from(byConfig.values())
    .map(({ channelIds, ...stat }) => ({
      ...stat,
      instanceCount: channelIds.size,
    }))
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}
```

### computeChannelStats 확장 (그룹핑 모드)

```typescript
export type ChannelStatsGroupMode = 'individual' | 'auto_grouped';

/** 채널 통계 집계. auto_grouped 모드에서는 자동방을 config 단위로 합산한다 */
export function computeChannelStats(
  records: VoiceDailyRecord[],
  groupMode: ChannelStatsGroupMode = 'individual',
): VoiceChannelStat[] {
  // groupMode === 'individual': 기존 로직 (하위 호환)
  // groupMode === 'auto_grouped': autoChannelConfigId가 같은 레코드를 합산,
  //   channelId는 `auto:{configId}`, channelName은 configName 사용
}
```

---

## 단계 5: 프론트엔드 UI 변경

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx` | channelType 필터 탭 + 그룹핑 토글 추가 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/SummaryCards.tsx` | uniqueChannels 계산 시 그룹핑 적용 옵션 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx` | 자동방 그룹핑 적용 |
| `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` | 필터 상태 관리, 컴포넌트에 전달 |
| `libs/i18n/locales/ko/web/dashboard.json` | 새 UI 텍스트 추가 |
| `libs/i18n/locales/en/web/dashboard.json` | 새 UI 텍스트 추가 |

### ChannelBarChart 변경 상세

기존 탭 구조 (channel | category)에 2가지를 추가한다:

1. **채널 유형 필터**: 전체 / 상설만 / 자동방만 -- ChannelBarChart 상단에 필터 드롭다운 또는 토글 버튼
2. **자동방 그룹핑 토글**: 자동방 포함 시 개별 표시 vs config 단위 그룹핑

```
[채널 | 카테고리 | 자동방 그룹]   [필터: 전체 ▼]
```

- "채널" 탭: 기존 동작 (개별 channelId 기준)
- "카테고리" 탭: 기존 동작
- "자동방 그룹" 탭 (신규): autoChannelConfigId 기준 그룹핑된 막대 차트

필터 드롭다운:
- "전체": 모든 channelType 포함
- "상설 채널만": channelType === 'permanent'
- "자동방만": channelType !== 'permanent'

### SummaryCards 변경

`uniqueChannels` 계산 시 자동방을 config 단위로 카운트하는 옵션 추가:
- 기존: `new Set(channelRecords.map(r => r.channelId)).size`
- 변경: 상설 채널 수 + 자동방 config 수 (중복 제거)

### i18n 추가 키

```json
{
  "voice.channelChart.tabAutoGroup": "자동방 그룹",
  "voice.channelChart.filterAll": "전체",
  "voice.channelChart.filterPermanent": "상설 채널",
  "voice.channelChart.filterAuto": "자동방",
  "voice.channelChart.instanceCount": "생성된 방 수",
  "voice.summary.autoChannelGroups": "자동방 설정"
}
```

---

## 단계 6: 기존 데이터 소급 태깅

기존 voice_daily 레코드 중 자동방에서 발생한 데이터를 소급으로 태깅한다. 완벽한 소급은 불가능하지만, 현재 존재하는 auto_channel_config의 categoryId를 기반으로 추론할 수 있다.

### 마이그레이션 전략

소급 태깅은 별도 마이그레이션이 아닌, **일회성 스크립트**로 실행한다. 이유:
- 추론 기반이므로 100% 정확하지 않음
- config가 삭제된 경우 추론 불가
- 롤백이 어려움

### 추론 로직

```sql
-- 방법: auto_channel_config의 button.targetCategoryId 또는 instantCategoryId에
-- voice_daily.categoryId가 포함되어 있고, 해당 channelId가 현재 존재하지 않는 경우
-- (삭제된 임시 채널) 자동방으로 추정

UPDATE voice_daily vd
SET
  "channelType" = CASE
    WHEN acc.mode = 'select' THEN 'auto_select'
    WHEN acc.mode = 'instant' THEN 'auto_instant'
  END,
  "autoChannelConfigId" = acc.id,
  "autoChannelConfigName" = acc.name
FROM auto_channel_config acc
LEFT JOIN auto_channel_button acb ON acb."configId" = acc.id
WHERE
  vd."channelType" = 'permanent'  -- 아직 태깅 안 된 것만
  AND vd."channelId" != 'GLOBAL'
  AND vd."guildId" = acc."guildId"
  AND (
    -- select 모드: button의 targetCategoryId와 매칭
    (acc.mode = 'select' AND vd."categoryId" = acb."targetCategoryId")
    OR
    -- instant 모드: config의 instantCategoryId와 매칭
    (acc.mode = 'instant' AND vd."categoryId" = acc."instantCategoryId")
  );
```

> 주의: 이 추론은 해당 카테고리에 상설 채널도 있을 수 있으므로 오탐이 발생할 수 있다. 실행 전 `SELECT COUNT(*)` 으로 영향 범위를 확인하고, 필요시 추가 필터(channelName 패턴 매칭 등)를 적용한다.

---

## 단계 7: VoiceAnalyticsService 그룹핑 지원

서버사이드 분석 API에서도 자동방 그룹핑을 지원한다.

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | `aggregateChannelStats()`에서 auto-channel 그룹핑 로직 추가, `getChannelStats()` 쿼리 파라미터 확장 |
| `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts` | `channel-stats` 엔드포인트에 `groupAutoChannels` 쿼리 파라미터 추가 |
| `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts` | `groupAutoChannels` 필드 추가 |

### getChannelStats 변경

```typescript
async getChannelStats(
  guildId: string,
  days: number,
  options?: { groupAutoChannels?: boolean },
): Promise<ChannelStatItem[]> {
  // ... 기존 로직
  // options.groupAutoChannels === true인 경우:
  //   autoChannelConfigId가 같은 레코드를 합산
  //   channelId를 `auto:{configId}`로, channelName을 configName으로 치환
}
```

---

## 전체 파일 변경 요약

### 신규 파일

| 파일 | 설명 |
|------|------|
| `apps/api/src/migrations/1776400000000-AddAutoChannelGrouping.ts` | DB 마이그레이션 |

### 수정 파일 (Backend)

| 파일 | 단계 |
|------|------|
| `apps/api/src/channel/voice/infrastructure/voice-cache.keys.ts` | 0 |
| `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts` | 0 |
| `apps/api/src/channel/auto/application/auto-channel.service.ts` | 0 |
| `apps/api/src/channel/auto/auto-channel.module.ts` | 0 |
| `apps/api/src/channel/voice/infrastructure/voice-daily.orm-entity.ts` | 1 |
| `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts` | 2 |
| `apps/api/src/channel/voice/application/voice-daily-flush-service.ts` | 2 |
| `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts` | 3 |
| `apps/api/src/channel/voice/application/voice-daily.service.ts` | 3 |
| `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | 3, 7 |
| `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts` | 7 |
| `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts` | 7 |

### 수정 파일 (Shared)

| 파일 | 단계 |
|------|------|
| `libs/shared/src/types/diagnosis.ts` | 3 |

### 수정 파일 (Frontend)

| 파일 | 단계 |
|------|------|
| `apps/web/app/lib/voice-dashboard-api.ts` | 4 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx` | 5 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/SummaryCards.tsx` | 5 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx` | 5 |
| `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` | 5 |
| `libs/i18n/locales/ko/web/dashboard.json` | 5 |
| `libs/i18n/locales/en/web/dashboard.json` | 5 |

---

## 구현 순서 및 의존관계

```
단계 0 (Redis 메타데이터)
    ↓
단계 1 (DB 마이그레이션) ← 단계 0과 병렬 가능
    ↓
단계 2 (Flush 로직) ← 단계 0 + 1 필수
    ↓
단계 3 (API 응답) ← 단계 2 필수
    ↓
단계 4 (FE 타입/집계) ← 단계 3 필수
    ↓
단계 5 (FE UI) ← 단계 4 필수
    ↓
단계 6 (소급 태깅) ← 단계 1 이후 언제든 가능 (독립적)
    ↓
단계 7 (Analytics 그룹핑) ← 단계 3 이후 가능, 단계 5와 병렬
```

### 권장 PR 분할

1. **PR 1**: 단계 0 + 1 + 2 -- Redis 메타데이터 + DB 마이그레이션 + Flush 로직 (핵심 데이터 파이프라인)
2. **PR 2**: 단계 3 + 4 -- API 응답 확장 + FE 타입/집계 함수
3. **PR 3**: 단계 5 -- FE UI 변경
4. **PR 4**: 단계 6 -- 소급 태깅 스크립트 (독립 실행)
5. **PR 5**: 단계 7 -- VoiceAnalyticsService 그룹핑
