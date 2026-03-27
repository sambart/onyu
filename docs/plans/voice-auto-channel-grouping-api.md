# 자동방 채널 통계 그룹핑 — 단계 3 + 단계 7 상세 구현 계획

> 최종 업데이트: 2026-03-27
> 상위 계획: `docs/plans/voice-auto-channel-grouping.md`
> 관련 PRD: F-VOICE-035 (DTO/API 확장), F-VOICE-036 (VoiceAnalyticsService 그룹핑)

---

## 전제 조건

- 단계 1(DB 마이그레이션) 완료: `voice_daily` 테이블에 `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 컬럼이 존재
- 단계 2(Flush 로직) 완료: flush 시점에 auto-channel 메타데이터가 `voice_daily` 레코드에 기록됨
- ORM 엔티티(`voice-daily.orm-entity.ts`)에 세 컬럼이 이미 추가되어 있음 (현재 코드 확인 완료)

---

## 단계 3: DTO/API 응답 확장 (F-VOICE-035)

### 3-1. VoiceDailyRecordDto 필드 추가

**파일**: `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts`

현재 DTO에는 `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 필드가 없다. 세 필드를 추가한다.

**추가할 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `channelType` | `'permanent' \| 'auto_select' \| 'auto_instant'` | 채널 유형. 기존 레코드는 `'permanent'` |
| `autoChannelConfigId` | `number \| null` | 자동방 config ID. 상설 채널은 `null` |
| `autoChannelConfigName` | `string \| null` | 자동방 config 이름 스냅샷. 상설 채널은 `null` |

**변경 내용**:
- 기존 14개 필드 하단에 3개 필드를 추가
- 클래스 프로퍼티만 선언 (class-validator 데코레이터 불필요 -- 응답 DTO이므로)

**하위 호환성**:
- 새 필드는 항상 존재하지만, 기존 데이터는 `channelType: 'permanent'`, 나머지 `null`로 채워짐
- 기존 프론트엔드 클라이언트는 알지 못하는 필드를 무시하므로 영향 없음

### 3-2. VoiceDailyService 엔티티-DTO 매핑 확장

**파일**: `apps/api/src/channel/voice/application/voice-daily.service.ts`

현재 `getDailyRecords()` 내 `entities.map()` 콜백에서 엔티티를 DTO로 수동 매핑하고 있다. 새 세 필드를 매핑에 추가한다.

**변경 위치**: `voice-daily.service.ts` 24~37번 라인의 `map()` 콜백 내부

**추가할 매핑**:
```
channelType: e.channelType ?? 'permanent',
autoChannelConfigId: e.autoChannelConfigId ?? null,
autoChannelConfigName: e.autoChannelConfigName ?? null,
```

**방어적 처리**: `??` 연산자로 null/undefined 대비. ORM 엔티티의 컬럼 기본값이 있으므로 실제로는 항상 값이 존재하지만, 안전하게 fallback을 제공한다.

### 3-3. ChannelStatItem 타입 확장 (libs/shared)

**파일**: `libs/shared/src/types/diagnosis.ts`

현재 `ChannelStatItem` 인터페이스:
```typescript
export interface ChannelStatItem {
  channelId: string;
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  totalSec: number;
  uniqueUsers: number;
}
```

**추가할 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `channelType` | `'permanent' \| 'auto_select' \| 'auto_instant'` | 채널 유형 |
| `autoChannelConfigId` | `number \| null` | 자동방 config ID |
| `autoChannelConfigName` | `string \| null` | 자동방 config 이름 |

**영향 범위**: `ChannelStatItem`은 `ChannelStatsResponse.channels`의 요소 타입으로 사용된다. 필드 추가만이므로 기존 사용처에서 타입 에러가 발생하지 않는다. 단, `ChannelStatItem`을 반환하는 모든 곳에서 새 필드를 채워줘야 한다 (3-4에서 처리).

### 3-4. VoiceAnalyticsService.getChannelStats() 새 필드 매핑

**파일**: `apps/api/src/voice-analytics/application/voice-analytics.service.ts`

현재 `getChannelStats()` (434~477번 라인)에서 `chMap`의 값 타입과 최종 반환 객체에 `channelType`, `autoChannelConfigId`, `autoChannelConfigName`이 빠져 있다.

**변경 1 — chMap 값 타입 확장** (438~447번 라인):

기존 `chMap` 제네릭 타입에 세 필드 추가:
```
channelType: 'permanent' | 'auto_select' | 'auto_instant';
autoChannelConfigId: number | null;
autoChannelConfigName: string | null;
```

**변경 2 — chMap 초기값에 필드 추가** (452~458번 라인):

`chMap.get(r.channelId) ?? { ... }` 블록 내부에 추가:
```
channelType: r.channelType ?? 'permanent',
autoChannelConfigId: r.autoChannelConfigId ?? null,
autoChannelConfigName: r.autoChannelConfigName ?? null,
```

**변경 3 — 기존 값 갱신 로직** (459~464번 라인 직후):

`channelName`, `categoryId`, `categoryName`을 갱신하는 패턴과 동일하게:
```
if (r.channelType && r.channelType !== 'permanent') existing.channelType = r.channelType;
if (r.autoChannelConfigId) existing.autoChannelConfigId = r.autoChannelConfigId;
if (r.autoChannelConfigName) existing.autoChannelConfigName = r.autoChannelConfigName;
```

한 channelId에 대해 여러 날의 레코드가 있을 수 있으므로, auto-channel 정보가 있는 레코드가 하나라도 있으면 해당 값을 우선 적용한다.

**변경 4 — 반환 객체에 필드 추가** (467~476번 라인):

`.map()` 콜백의 반환 객체에 추가:
```
channelType: ch.channelType,
autoChannelConfigId: ch.autoChannelConfigId,
autoChannelConfigName: ch.autoChannelConfigName,
```

**변경 5 — aggregateChannelStats()도 동일하게 확장** (211~243번 라인):

`collectVoiceActivityData()`가 호출하는 `aggregateChannelStats()` private 메서드도 동일한 패턴으로 확장해야 한다. 이 메서드는 `VoiceActivityData.channelStats`를 생성하며, Gemini AI 분석에 전달된다.

`ChannelAggregate` 인터페이스 (14~20번 라인)에 세 필드 추가:
```
channelType: 'permanent' | 'auto_select' | 'auto_instant';
autoChannelConfigId: number | null;
autoChannelConfigName: string | null;
```

`aggregateChannelStats()` 내부의 channelMap 초기화, 갱신, 반환 객체에 동일한 패턴 적용.

### 3-5. VoiceDailyController — 변경 없음

`voice-daily.controller.ts`는 `VoiceDailyService.getDailyRecords()`의 반환 타입인 `VoiceDailyRecordDto[]`를 그대로 반환하므로, 컨트롤러 코드 변경은 불필요하다.

### 단계 3 변경 파일 요약

| 파일 | 변경 유형 | 변경량 |
|------|----------|--------|
| `apps/api/src/channel/voice/dto/voice-daily-record.dto.ts` | 필드 3개 추가 | ~3줄 |
| `apps/api/src/channel/voice/application/voice-daily.service.ts` | 매핑 3줄 추가 | ~3줄 |
| `libs/shared/src/types/diagnosis.ts` | `ChannelStatItem` 필드 3개 추가 | ~3줄 |
| `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | `ChannelAggregate` 확장 + `getChannelStats()` 확장 + `aggregateChannelStats()` 확장 | ~25줄 |

---

## 단계 7: VoiceAnalyticsService 자동방 그룹핑 API (F-VOICE-036)

### 7-1. DiagnosisQueryDto에 groupAutoChannels 필드 추가

**파일**: `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts`

현재 `DiagnosisQueryDto`는 `days` 필드만 보유한다. `channel-stats` 엔드포인트 전용으로 `groupAutoChannels` 쿼리 파라미터를 지원하기 위해 **별도 DTO를 생성**하거나 **기존 DTO를 확장**해야 한다.

**방안 선택: 별도 DTO 생성 (ChannelStatsQueryDto)**

이유:
- `groupAutoChannels`는 `channel-stats` 엔드포인트에만 의미가 있다
- `DiagnosisQueryDto`에 추가하면 `summary`, `health-score`, `ai-insight` 등 다른 엔드포인트에서도 불필요한 파라미터가 노출된다
- 향후 채널 통계 전용 필터(channelType 필터 등)를 추가할 확장 포인트가 된다

**새 DTO 정의 (같은 파일 내)**:

```typescript
export class ChannelStatsQueryDto extends DiagnosisQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  groupAutoChannels?: boolean = false;
}
```

**class-transformer 주의사항**:
- 쿼리 파라미터는 문자열로 들어오므로 `@Type(() => Boolean)`만으로는 `'true'` 문자열을 boolean으로 변환하지 못한다
- `@Transform(({ value }) => value === 'true' || value === '1')` 를 사용하거나, `enableImplicitConversion: true` 설정이 있는지 확인 필요
- 기존 코드베이스에서 boolean 쿼리 파라미터를 처리하는 패턴이 있는지 확인 후 동일 패턴 적용

**추가 import**: `IsBoolean`, `Transform` (class-validator, class-transformer)

### 7-2. DiagnosisController.getChannelStats() 파라미터 확장

**파일**: `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts`

현재 `getChannelStats()` (101~118번 라인):
- `@Query() query: DiagnosisQueryDto` 를 `@Query() query: ChannelStatsQueryDto` 로 변경
- `groupAutoChannels` 값을 서비스에 전달

**변경 내용**:

1. import에 `ChannelStatsQueryDto` 추가
2. `getChannelStats()` 시그니처 변경:
   ```
   @Query() query: ChannelStatsQueryDto
   ```
3. 서비스 호출 시 `groupAutoChannels` 옵션 전달:
   ```
   const groupAutoChannels = query.groupAutoChannels ?? false;
   ```
4. 서비스 호출 변경:
   ```
   const channels = await this.analyticsService.getChannelStats(guildId, days, { groupAutoChannels });
   ```
5. **캐시 키에 `groupAutoChannels` 포함** (중요):
   ```
   const cacheKey = `voice:diag:channel-stats:${guildId}:${days}:${groupAutoChannels}`;
   ```
   기존 캐시 키 `voice:diag:channel-stats:${guildId}:${days}`에 boolean 값을 추가하여, 그룹핑 모드에 따라 다른 캐시 엔트리를 사용한다.

### 7-3. VoiceAnalyticsService.getChannelStats() 시그니처 확장

**파일**: `apps/api/src/voice-analytics/application/voice-analytics.service.ts`

현재 시그니처 (434번 라인):
```typescript
async getChannelStats(guildId: string, days: number): Promise<ChannelStatItem[]>
```

변경 후:
```typescript
async getChannelStats(
  guildId: string,
  days: number,
  options?: { groupAutoChannels?: boolean },
): Promise<ChannelStatItem[]>
```

**하위 호환**: `options` 파라미터가 옵셔널이므로 기존 호출부(`collectVoiceActivityData` 등에서 직접 호출하지 않으므로)에 영향 없음. `getChannelStats()`는 현재 `diagnosis.controller.ts`에서만 호출된다.

### 7-4. getChannelStats() 그룹핑 로직 구현

**파일**: `apps/api/src/voice-analytics/application/voice-analytics.service.ts`

`getChannelStats()` 메서드 내부에 그룹핑 후처리 로직을 추가한다.

**구현 전략**: 기존 channelId 기반 집계 로직을 유지하고, 마지막에 `groupAutoChannels === true`일 때 후처리로 합산한다. 이유:
- 기존 로직을 최소한으로 수정
- 그룹핑 없는 경우 성능 영향 없음
- 단일 책임: 집계와 그룹핑을 분리

**후처리 로직 흐름**:

```
1. 기존 로직으로 channelId별 ChannelStatItem[] 생성 (현재 코드)
2. groupAutoChannels !== true이면 그대로 반환 (기존 동작)
3. groupAutoChannels === true이면:
   a. 결과를 두 그룹으로 분리:
      - permanent 채널: autoChannelConfigId === null
      - auto 채널: autoChannelConfigId !== null
   b. auto 채널을 autoChannelConfigId 기준으로 합산:
      - channelId: `auto:{configId}` (가상 ID)
      - channelName: autoChannelConfigName (첫 번째 레코드에서 가져옴)
      - categoryId/categoryName: 그룹 내 첫 번째 레코드의 값 사용
      - channelType: 그룹 내 값 (동일할 것이므로 첫 번째 값 사용)
      - totalSec: 그룹 내 모든 레코드의 totalSec 합산
      - uniqueUsers: 그룹 내 모든 레코드의 uniqueUsers 합산 (합집합이 아닌 sum -- 서버사이드에서는 이미 최종 집계된 값)
   c. permanent + 합산된 auto 채널을 합쳐서 totalSec 내림차순 정렬 후 반환
```

**uniqueUsers 합산 주의사항**:
- 현재 `getChannelStats()`에서 `uniqueUsers`는 `Set<string>.size`로 계산된다 (channelId별 고유 유저 수)
- 그룹핑 시 서로 다른 channelId의 uniqueUsers Set을 합집합으로 계산해야 정확하다
- 그러나 현재 최종 반환 시점에서는 이미 Set이 size로 변환되어 있어 합집합 계산이 불가능하다
- **해결 방안**: 그룹핑 로직에서는 chMap을 직접 참조하여 Set 합집합을 계산한 뒤 size를 반환한다. 이를 위해 그룹핑 로직을 `.map()` 변환 이전에 수행해야 한다.

**수정된 구현 전략** (chMap 단계에서 그룹핑):

```
1. 기존 로직으로 chMap (channelId → aggregate) 구축
2. groupAutoChannels === true이면:
   a. chMap을 순회하며 autoChannelConfigId 기준으로 재집계
   b. configId별로 새 Map(configGroupMap) 구축:
      - key: `auto:{configId}` 또는 원래 channelId (permanent인 경우)
      - value: channelName, totalSec, uniqueUsers(Set 합집합) 등
   c. configGroupMap을 기반으로 최종 배열 생성
3. groupAutoChannels !== true이면:
   a. 기존 로직대로 chMap에서 배열 생성
```

**private 헬퍼 메서드 추출**:

코드 가독성과 함수 길이 제한(50줄 warn)을 위해, 그룹핑 로직을 별도 private 메서드로 추출한다.

```typescript
/**
 * 자동방 채널을 autoChannelConfigId 기준으로 합산한다.
 * 상설 채널은 그대로 유지하고, 같은 configId를 가진 자동방들을 하나의 항목으로 합친다.
 */
private groupByAutoChannelConfig(
  chMap: Map<string, ChannelAggregate & AutoChannelFields>,
): ChannelStatItem[]
```

여기서 `AutoChannelFields`는:
```typescript
interface AutoChannelFields {
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}
```

기존 `ChannelAggregate` 인터페이스(14~20번 라인)를 단계 3에서 이미 확장하므로, 별도 인터페이스 없이 확장된 `ChannelAggregate`를 직접 사용할 수 있다.

### 7-5. 그룹핑 로직 상세 의사 코드

```typescript
private groupByAutoChannelConfig(
  chMap: Map<string, ChannelAggregateWithAutoFields>,
): ChannelStatItem[] {
  // permanent 채널과 auto 채널 분리
  const resultMap = new Map<string, {
    channelName: string;
    categoryId: string | null;
    categoryName: string | null;
    channelType: 'permanent' | 'auto_select' | 'auto_instant';
    autoChannelConfigId: number | null;
    autoChannelConfigName: string | null;
    totalSec: number;
    uniqueUsers: Set<string>;
    sessionCount: number;
  }>();

  for (const [channelId, ch] of chMap) {
    if (ch.autoChannelConfigId == null) {
      // 상설 채널: 그대로 유지
      resultMap.set(channelId, { ...ch });
      continue;
    }

    // 자동방: configId 기준 그룹핑
    const groupKey = `auto:${ch.autoChannelConfigId}`;
    const existing = resultMap.get(groupKey);

    if (existing) {
      existing.totalSec += ch.totalVoiceTime;
      for (const userId of ch.uniqueUsers) {
        existing.uniqueUsers.add(userId);
      }
      existing.sessionCount += ch.sessionCount;
    } else {
      resultMap.set(groupKey, {
        channelName: ch.autoChannelConfigName ?? ch.channelName,
        categoryId: ch.categoryId,
        categoryName: ch.categoryName,
        channelType: ch.channelType,
        autoChannelConfigId: ch.autoChannelConfigId,
        autoChannelConfigName: ch.autoChannelConfigName,
        totalSec: ch.totalVoiceTime,
        uniqueUsers: new Set(ch.uniqueUsers),
        sessionCount: ch.sessionCount,
      });
    }
  }

  // ChannelStatItem 배열로 변환, totalSec 내림차순 정렬
  return Array.from(resultMap.entries())
    .map(([channelId, ch]) => ({
      channelId,
      channelName: ch.channelName,
      categoryId: ch.categoryId,
      categoryName: ch.categoryName,
      channelType: ch.channelType,
      autoChannelConfigId: ch.autoChannelConfigId,
      autoChannelConfigName: ch.autoChannelConfigName,
      totalSec: ch.totalSec,
      uniqueUsers: ch.uniqueUsers.size,
    }))
    .sort((a, b) => b.totalSec - a.totalSec);
}
```

### 7-6. getChannelStats() 최종 변경 구조

```typescript
async getChannelStats(
  guildId: string,
  days: number,
  options?: { groupAutoChannels?: boolean },
): Promise<ChannelStatItem[]> {
  const { start, end } = VoiceAnalyticsService.getDateRange(days);
  const records = await this.fetchRawRecords(guildId, start, end);

  // --- 기존 chMap 구축 로직 (단계 3에서 확장된 버전) ---
  const chMap = new Map<string, ChannelAggregateWithAutoFields>();
  for (const r of records) {
    if (r.channelId === 'GLOBAL') continue;
    // ... 기존 + 새 필드 집계
  }

  // --- 그룹핑 분기 ---
  if (options?.groupAutoChannels) {
    return this.groupByAutoChannelConfig(chMap);
  }

  // --- 기존 반환 로직 (새 필드 포함) ---
  return Array.from(chMap.entries())
    .map(([channelId, ch]) => ({
      channelId,
      channelName: ch.channelName,
      categoryId: ch.categoryId,
      categoryName: ch.categoryName,
      channelType: ch.channelType,
      autoChannelConfigId: ch.autoChannelConfigId,
      autoChannelConfigName: ch.autoChannelConfigName,
      totalSec: ch.totalSec,
      uniqueUsers: ch.uniqueUsers.size,
    }))
    .sort((a, b) => b.totalSec - a.totalSec);
}
```

### 단계 7 변경 파일 요약

| 파일 | 변경 유형 | 변경량 |
|------|----------|--------|
| `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts` | `ChannelStatsQueryDto` 클래스 신규 추가 | ~10줄 |
| `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts` | `getChannelStats()` Query DTO 변경 + 캐시 키 변경 + 서비스 호출 변경 | ~5줄 수정 |
| `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | `getChannelStats()` 시그니처 확장 + `groupByAutoChannelConfig()` private 메서드 추가 | ~50줄 추가 |

---

## 두 단계 간 의존 관계

```
단계 3 (DTO/API 확장)
  ├── 3-1. VoiceDailyRecordDto 필드 추가
  ├── 3-2. VoiceDailyService 매핑 확장
  ├── 3-3. ChannelStatItem 타입 확장 (libs/shared)
  └── 3-4. VoiceAnalyticsService 필드 매핑 확장
        ↓
단계 7 (VoiceAnalyticsService 그룹핑)
  ├── 7-1. ChannelStatsQueryDto 생성 ← 독립 (단계 3과 무관)
  ├── 7-2. DiagnosisController 파라미터 변경 ← 7-1 필수
  ├── 7-3. getChannelStats() 시그니처 확장 ← 3-4 필수
  ├── 7-4~7-5. 그룹핑 로직 구현 ← 3-4 필수 (chMap에 auto-channel 필드 필요)
  └── 7-6. 최종 메서드 구조 ← 7-3~7-5 통합
```

핵심: 단계 7의 그룹핑 로직은 단계 3에서 `chMap`에 `autoChannelConfigId` 등이 추가되어야 작동한다. 따라서 **단계 3을 먼저 완료한 후 단계 7을 진행**한다.

---

## 테스트 체크리스트

### 단계 3 검증

- [ ] `GET /api/guilds/:guildId/voice/daily` 응답에 `channelType`, `autoChannelConfigId`, `autoChannelConfigName` 필드가 포함되는지 확인
- [ ] 기존 데이터(permanent)에 대해 `channelType: 'permanent'`, `autoChannelConfigId: null` 반환 확인
- [ ] 자동방 데이터에 대해 올바른 `channelType`과 `autoChannelConfigId` 반환 확인
- [ ] `GET /api/guilds/:guildId/voice-analytics/channel-stats` 응답에 새 필드가 포함되는지 확인
- [ ] TypeScript 컴파일 에러 없음 확인 (`pnpm -r build`)

### 단계 7 검증

- [ ] `GET /api/guilds/:guildId/voice-analytics/channel-stats?groupAutoChannels=true` 요청 시 자동방이 configId 기준으로 합산되는지 확인
- [ ] `groupAutoChannels=false` 또는 미지정 시 기존 동작(개별 channelId) 유지 확인
- [ ] 그룹핑된 항목의 `channelId`가 `auto:{configId}` 형식인지 확인
- [ ] 그룹핑된 항목의 `channelName`이 `autoChannelConfigName`인지 확인
- [ ] 그룹핑된 항목의 `uniqueUsers`가 합집합(중복 제거) 기준인지 확인
- [ ] 상설 채널과 그룹핑된 자동방이 함께 `totalSec` 내림차순으로 정렬되는지 확인
- [ ] 캐시 키가 `groupAutoChannels` 값에 따라 분리되는지 확인
- [ ] `groupAutoChannels=true`와 `false`에 대해 서로 다른 캐시가 저장/반환되는지 확인

---

## 주의 사항

1. **ChannelAggregate 인터페이스 범위**: `voice-analytics.service.ts` 상단의 `ChannelAggregate`는 `aggregateChannelStats()`와 `getChannelStats()` 모두에서 사용되지 않는다. `getChannelStats()`는 인라인 타입을 사용한다. 단계 3에서 두 곳 모두 확장해야 한다.
2. **collectVoiceActivityData의 channelStats**: `aggregateChannelStats()`도 `ChannelStatItem`과 유사한 구조를 반환하지만, 반환 타입이 `@onyu/shared`의 `VoiceActivityData.channelStats`이다. 해당 타입도 새 필드를 포함하도록 확인 필요.
3. **boolean 쿼리 파라미터 변환**: NestJS에서 `?groupAutoChannels=true` 는 문자열 `'true'`로 들어온다. `@Transform` 데코레이터로 명시적 변환 처리 필수.
