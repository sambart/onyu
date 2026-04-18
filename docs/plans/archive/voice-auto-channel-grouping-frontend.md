# 자동방 채널 통계 그룹핑 - 프론트엔드 상세 구현 계획

> 상위 계획: [voice-auto-channel-grouping.md](./voice-auto-channel-grouping.md) (단계 4, 5)
> PRD 참조: F-VOICE-037, F-VOICE-038

---

## 단계 4: 프론트엔드 타입 및 집계 함수 확장

### 수정 파일

`apps/web/app/lib/voice-dashboard-api.ts`

### 4-1. VoiceDailyRecord 타입 확장

기존 인터페이스에 3개 필드를 추가한다. 백엔드 단계 3에서 API 응답에 이미 포함되므로 타입만 맞추면 된다.

```typescript
export interface VoiceDailyRecord {
  // ... 기존 12개 필드 유지
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}
```

**하위 호환**: 백엔드가 아직 배포되지 않은 경우 기존 API 응답에는 새 필드가 없으므로, 집계 함수 내부에서 `r.channelType ?? 'permanent'`, `r.autoChannelConfigId ?? null` 식으로 안전하게 접근한다.

### 4-2. VoiceAutoChannelGroupStat 인터페이스 추가

```typescript
/** 자동방 config 단위 그룹 통계 */
export interface VoiceAutoChannelGroupStat {
  autoChannelConfigId: number;
  autoChannelConfigName: string;
  channelType: 'auto_select' | 'auto_instant';
  totalDurationSec: number;
  instanceCount: number; // 해당 config로 생성된 고유 channelId 수
}
```

위치: `VoiceCategoryStat` 인터페이스 뒤에 배치한다 (타입 정의 섹션 내).

### 4-3. ChannelStatsGroupMode 타입 추가

```typescript
export type ChannelStatsGroupMode = 'individual' | 'auto_grouped';
```

### 4-4. computeAutoChannelGroupStats() 함수 추가

위치: `computeCategoryStats()` 함수 뒤에 배치한다.

**로직**:
1. `channelId !== 'GLOBAL'` 이고 `autoChannelConfigId != null`인 레코드만 필터링
2. `autoChannelConfigId`를 키로 `Map<number, { ...stat, channelIds: Set<string> }>` 집계
3. 각 config에 대해 `channelDurationSec`을 합산하고 고유 `channelId`를 Set에 수집
4. `channelIds.size`를 `instanceCount`에 할당
5. `totalDurationSec` 내림차순 정렬하여 반환

**참고**: 전체 계획 문서(단계 4)의 코드 스니펫을 그대로 사용한다. 다만 `channelType` 안전 접근을 위해 `(r.channelType ?? 'permanent')` 가드를 추가한다. `channelType === 'permanent'`인 레코드는 필터에서 이미 제외되지만(`autoChannelConfigId != null` 조건), 방어적으로 처리한다.

### 4-5. computeChannelStats() 시그니처 확장

기존 함수의 시그니처를 변경한다. 기본값 `'individual'`로 하위 호환을 유지한다.

```typescript
export function computeChannelStats(
  records: VoiceDailyRecord[],
  groupMode: ChannelStatsGroupMode = 'individual',
): VoiceChannelStat[] {
```

**`individual` 모드** (기존 로직):
- 현재 구현과 동일. 변경 없음.

**`auto_grouped` 모드** (신규 분기):
1. `channelId !== 'GLOBAL'`인 레코드를 순회
2. `autoChannelConfigId != null`인 레코드 -> 키를 `auto:{configId}`로, 이름을 `autoChannelConfigName`으로 사용
3. `autoChannelConfigId == null`인 레코드 -> 기존처럼 `channelId`를 키로 사용
4. 각 키에 대해 `channelDurationSec`, `micOnSec`, `micOffSec`, `aloneSec`을 합산
5. `totalDurationSec` 내림차순 정렬하여 반환

**구현 상세**:

```typescript
if (groupMode === 'individual') {
  // 기존 로직 그대로
  // ...
}

// auto_grouped 모드
const channelRecords = records.filter((r) => r.channelId !== 'GLOBAL');
const byKey = new Map<string, VoiceChannelStat>();

for (const r of channelRecords) {
  const configId = r.autoChannelConfigId;
  const key = configId != null ? `auto:${configId}` : r.channelId;
  const name = configId != null
    ? (r.autoChannelConfigName ?? `Config-${configId}`)
    : r.channelName;

  const existing = byKey.get(key);
  if (existing) {
    existing.totalDurationSec += r.channelDurationSec;
    existing.micOnSec += r.micOnSec;
    existing.micOffSec += r.micOffSec;
    existing.aloneSec += r.aloneSec;
  } else {
    byKey.set(key, {
      channelId: key,
      channelName: name,
      totalDurationSec: r.channelDurationSec,
      micOnSec: r.micOnSec,
      micOffSec: r.micOffSec,
      aloneSec: r.aloneSec,
    });
  }
}

return Array.from(byKey.values()).sort(
  (a, b) => b.totalDurationSec - a.totalDurationSec,
);
```

### 4-6. computeSummary()의 uniqueChannels 계산 변경

기존 `computeSummary()`에서 `uniqueChannels`를 계산하는 로직을 변경한다.

**변경 전**:
```typescript
const channelIds = new Set(channelRecords.map((r) => r.channelId));
// uniqueChannels: channelIds.size
```

**변경 후**:
```typescript
// 상설 채널: channelId 단위 카운트
const permanentChannelIds = new Set(
  channelRecords
    .filter((r) => (r.autoChannelConfigId ?? null) == null)
    .map((r) => r.channelId),
);
// 자동방: configId 단위 카운트
const autoConfigIds = new Set(
  channelRecords
    .filter((r) => r.autoChannelConfigId != null)
    .map((r) => r.autoChannelConfigId),
);
// uniqueChannels: permanentChannelIds.size + autoConfigIds.size
```

**주의**: `autoChannelConfigId`가 아직 API에서 내려오지 않는 경우(백엔드 미배포)에도 기존 동작과 동일하게 동작해야 한다. `autoChannelConfigId`가 모두 `undefined`이면 `filter`에서 모두 permanent로 분류되므로 기존 `channelIds.size`와 같은 결과가 나온다.

### 4-7. 채널 유형 필터 유틸 함수 추가 (선택적)

`page.tsx`에서 필터 상태에 따라 레코드를 필터링하는 헬퍼를 `voice-dashboard-api.ts`에 추가한다.

```typescript
export type ChannelTypeFilter = 'all' | 'permanent' | 'auto';

/** 채널 유형 필터에 따라 레코드를 필터링한다 */
export function filterRecordsByChannelType(
  records: VoiceDailyRecord[],
  filter: ChannelTypeFilter,
): VoiceDailyRecord[] {
  if (filter === 'all') return records;
  if (filter === 'permanent') {
    return records.filter(
      (r) => r.channelId === 'GLOBAL' || (r.channelType ?? 'permanent') === 'permanent',
    );
  }
  // filter === 'auto'
  return records.filter(
    (r) => r.channelId === 'GLOBAL' || (r.channelType ?? 'permanent') !== 'permanent',
  );
}
```

**GLOBAL 레코드 유지 이유**: GLOBAL 레코드는 마이크/혼자시간 등 유저 전체 집계에 사용되므로 필터와 무관하게 유지해야 한다. 채널별 집계 함수들은 내부에서 `channelId !== 'GLOBAL'` 필터를 이미 적용하므로 문제없다.

---

## 단계 5: 프론트엔드 UI 변경

### 5-1. page.tsx - 필터 상태 관리

**수정 파일**: `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`

#### import 추가

```typescript
import {
  // 기존 import 유지
  computeAutoChannelGroupStats,
  filterRecordsByChannelType,
  type ChannelTypeFilter,
  type VoiceAutoChannelGroupStat,
} from "@/app/lib/voice-dashboard-api";
```

#### 상태 추가

```typescript
const [channelTypeFilter, setChannelTypeFilter] = useState<ChannelTypeFilter>("all");
```

#### 데이터 로드 후 집계에 필터 적용

현재 `loadData()` 내부에서 `computeChannelStats(data)`를 호출하는 부분을 변경한다.

**변경 전**:
```typescript
setChannelStats(computeChannelStats(data));
```

**변경 후**: `channelTypeFilter` 상태는 `loadData` 밖에서 관리되며, `channelStats`는 `useMemo` 또는 렌더링 시점에 계산하는 방식으로 변경한다.

구체적 접근:
1. `rawRecords` 상태는 유지 (필터 변경 시 API 재호출 불필요)
2. `channelStats` 상태를 제거하고 렌더링 시점에 계산

```typescript
// 상태에서 제거
// const [channelStats, setChannelStats] = useState<VoiceChannelStat[]>([]);

// 렌더링 시점 계산 (rawRecords + channelTypeFilter 의존)
const filteredRecords = filterRecordsByChannelType(rawRecords, channelTypeFilter);
const channelStats = computeChannelStats(filteredRecords);
const autoGroupStats = computeAutoChannelGroupStats(filteredRecords);
```

**주의**: `summary`도 `filteredRecords` 기반으로 재계산해야 하는지 검토 필요 -> **아니오**. `summary`는 전체 데이터 기반 (필터 없음). 채널 유형 필터는 ChannelBarChart에만 적용된다. SummaryCards는 항상 전체 데이터를 표시하되 `uniqueChannels`만 config 단위로 카운트하면 된다.

**최종 설계**:
- `summary`: `computeSummary(data)` - 전체 데이터 기반 (단계 4-6에서 uniqueChannels 계산이 이미 변경됨)
- `channelStats`: 제거하고 렌더링 시점에 `computeChannelStats(filteredRecords)` 계산
- `autoGroupStats`: 렌더링 시점에 `computeAutoChannelGroupStats(rawRecords)` 계산

```typescript
// 렌더링 시점 계산
const filteredRecords = filterRecordsByChannelType(rawRecords, channelTypeFilter);
const channelStats = computeChannelStats(filteredRecords);
const autoGroupStats = computeAutoChannelGroupStats(rawRecords);
```

#### useEffect 의존성 배열

`channelTypeFilter`는 `useEffect` 의존성에 추가하지 **않는다**. API 재호출이 불필요하고, `rawRecords`로부터 클라이언트에서 재계산하면 된다.

#### ChannelBarChart에 전달할 props 변경

```tsx
<ChannelBarChart
  data={channelStats}
  records={filteredRecords}
  autoGroupStats={autoGroupStats}
  channelTypeFilter={channelTypeFilter}
  onChannelTypeFilterChange={setChannelTypeFilter}
/>
```

#### UserChannelPieChart (UserDetailView 내부)에 대한 고려

`UserChannelPieChart`는 `UserDetailView` 내부에서 사용되며, 유저 상세 뷰에서 호출된다. 이 컴포넌트에서 자동방 그룹핑을 적용하려면 `UserDetailView`가 `computeChannelStats(records, 'auto_grouped')`를 호출하는 방식으로 처리한다. `UserDetailView`의 수정은 별도 확인이 필요하다.

---

### 5-2. ChannelBarChart - 탭 3개 + 필터

**수정 파일**: `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx`

#### Props 인터페이스 변경

```typescript
interface Props {
  data: VoiceChannelStat[];
  records: VoiceDailyRecord[];
  autoGroupStats: VoiceAutoChannelGroupStat[];
  channelTypeFilter: ChannelTypeFilter;
  onChannelTypeFilterChange: (filter: ChannelTypeFilter) => void;
}
```

#### 탭 타입 확장

```typescript
type TabValue = "channel" | "category" | "autoGroup";
```

#### 차트 데이터 계산 추가

기존 `channelChartData`, `categoryChartData` 외에 `autoGroupChartData`를 추가한다.

```typescript
const autoGroupChartData = autoGroupStats.slice(0, 10).map((d) => ({
  name: d.autoChannelConfigName,
  durationMin: Math.round(d.totalDurationSec / 60),
  micOnMin: 0,  // 자동방 그룹 통계에는 mic 정보 없음
  micOffMin: 0,
}));
```

**참고**: `VoiceAutoChannelGroupStat`에는 `micOnSec`/`micOffSec`가 없다. 자동방 그룹 탭에서는 `durationMin`만 표시하거나, 필요하면 `computeChannelStats(records, 'auto_grouped')` 결과를 사용하여 mic 정보도 포함할 수 있다.

-> **결정**: `computeChannelStats(filteredRecords, 'auto_grouped')` 결과를 사용하면 mic 정보도 포함 가능. 그러나 이 경우 `autoGroupStats` prop 대신 `records`에서 직접 계산하는 방식이 더 깔끔하다.

**최종 설계 변경**:
- `autoGroupStats` prop 제거
- "자동방 그룹" 탭 선택 시 내부에서 `computeChannelStats(records, 'auto_grouped')` 호출하여 자동방 config 단위 합산 + mic 정보 포함

```typescript
const autoGroupedChartData = computeChannelStats(records, 'auto_grouped')
  .filter((d) => d.channelId.startsWith('auto:'))
  .slice(0, 10)
  .map((d) => ({
    name: d.channelName,
    durationMin: Math.round(d.totalDurationSec / 60),
    micOnMin: Math.round(d.micOnSec / 60),
    micOffMin: Math.round(d.micOffSec / 60),
  }));
```

-> 그런데 이렇게 하면 "자동방 그룹" 탭에서 상설 채널이 제외되고 자동방 그룹만 보여야 하므로 `filter`로 `auto:` 접두사 필터링이 필요하다.

**또 다른 옵션**: "자동방 그룹" 탭에서는 `computeAutoChannelGroupStats()` 결과를 사용하되, `instanceCount`를 추가 정보로 툴팁에 표시한다.

**최종 결정**: `computeAutoChannelGroupStats()`를 사용하여 `instanceCount` 정보를 활용한다. mic 정보는 해당 탭에서 표시하지 않는다. 자동방 그룹 탭의 목적은 config 단위 총 사용량 파악이므로 duration 중심으로 충분하다.

#### 필터 UI

CardAction 영역에 필터 드롭다운과 탭 버튼을 함께 배치한다.

```
[채널별 | 카테고리별 | 자동방 그룹]   [전체 ▼]
```

필터 드롭다운은 `<Select>` 컴포넌트(`@/components/ui/select`)를 사용한다.

**주의**: "자동방 그룹" 탭 선택 시 필터는 비활성화한다 (자동방만 표시하는 것이 명확하므로). 필터는 "채널별" 탭에서만 의미가 있다.

```typescript
// 필터 표시 조건
const isFilterVisible = tab === "channel";
```

#### 렌더링 구조

```tsx
<CardHeader>
  <CardTitle>{t("voice.channelChart.title")}</CardTitle>
  <CardAction>
    <div className="flex items-center gap-2">
      {/* 필터 드롭다운 - 채널 탭에서만 표시 */}
      {isFilterVisible && (
        <Select value={channelTypeFilter} onValueChange={onChannelTypeFilterChange}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("voice.channelChart.filterAll")}</SelectItem>
            <SelectItem value="permanent">{t("voice.channelChart.filterPermanent")}</SelectItem>
            <SelectItem value="auto">{t("voice.channelChart.filterAuto")}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {/* 탭 버튼 */}
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-[3px]">
        <button ...>{t("voice.channelChart.tabChannel")}</button>
        <button ...>{t("voice.channelChart.tabCategory")}</button>
        <button ...>{t("voice.channelChart.tabAutoGroup")}</button>
      </div>
    </div>
  </CardAction>
</CardHeader>
```

#### chartData 분기

```typescript
const chartData =
  tab === "channel" ? channelChartData :
  tab === "category" ? categoryChartData :
  autoGroupChartData;
```

#### import 추가

```typescript
import {
  computeAutoChannelGroupStats,
  computeCategoryStats,
  type ChannelTypeFilter,
  type VoiceChannelStat,
  type VoiceDailyRecord,
} from "@/app/lib/voice-dashboard-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

---

### 5-3. SummaryCards - uniqueChannels 반영

**수정 파일**: `apps/web/app/dashboard/guild/[guildId]/voice/components/SummaryCards.tsx`

변경 불필요. `computeSummary()` 내부 로직이 단계 4-6에서 이미 변경되므로, `SummaryCards`는 전달받는 `summary.uniqueChannels` 값을 그대로 표시한다.

---

### 5-4. UserChannelPieChart - 자동방 그룹핑 적용

**수정 파일**: `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx`

이 컴포넌트는 `UserDetailView`에서 사용된다. 유저 상세 뷰에서 해당 유저의 채널별/카테고리별 파이 차트를 표시한다.

#### 변경 사항

**탭 확장**: 기존 "채널별 | 카테고리별" 에 "자동방 그룹" 탭을 추가한다.

```typescript
type TabValue = "channel" | "category" | "autoGroup";
```

#### Props 변경

`channelStats`에 그룹핑된 데이터를 추가로 받거나, 내부에서 계산한다.

**방법 1**: Props에 `autoGroupedChannelStats` 추가
**방법 2**: Props에 `records: VoiceDailyRecord[]` 추가하여 내부에서 `computeChannelStats(records, 'auto_grouped')` 계산

-> ChannelBarChart 패턴과 동일하게 **방법 2** 채택. 그러나 현재 `UserChannelPieChart`는 이미 집계된 `channelStats`와 `categoryStats`를 받고 있다. 일관성을 위해 `autoGroupedChannelStats`를 추가 prop으로 전달한다.

```typescript
interface Props {
  channelStats: VoiceChannelStat[];
  categoryStats: VoiceCategoryStat[];
  autoGroupedChannelStats: VoiceChannelStat[]; // 신규: auto_grouped 모드 결과
}
```

#### autoGroup 탭 차트 데이터

```typescript
const autoGroupChartData = toChartData(
  autoGroupedChannelStats
    .filter((ch) => ch.channelId.startsWith('auto:'))
    .map((ch) => ({
      id: ch.channelId,
      label: ch.channelName,
      totalDurationSec: ch.totalDurationSec,
    })),
  etcLabel,
);
```

#### UserDetailView에서 prop 전달

`UserDetailView` 내부에서 유저별 레코드를 집계할 때 `computeChannelStats(userRecords, 'auto_grouped')`를 호출하여 `autoGroupedChannelStats` prop으로 전달한다.

---

### 5-5. page.tsx 최종 변경 요약

1. `channelTypeFilter` 상태 추가
2. `channelStats` 상태를 제거하고 렌더링 시점 계산으로 변경
3. `ChannelBarChart`에 필터 관련 props 전달
4. import 정리

#### 기존 useEffect 내부 변경

```typescript
// 제거
// setChannelStats(computeChannelStats(data));

// 유지
setRawRecords(data);
setSummary(computeSummary(data));
setTrends(computeDailyTrends(data));
const stats = computeUserStats(data);
setUserStats(stats);
```

#### 렌더링 영역

```tsx
// 렌더링 시점 계산
const filteredRecords = filterRecordsByChannelType(rawRecords, channelTypeFilter);
const channelStats = computeChannelStats(filteredRecords);

// ...

<ChannelBarChart
  data={channelStats}
  records={filteredRecords}
  channelTypeFilter={channelTypeFilter}
  onChannelTypeFilterChange={setChannelTypeFilter}
/>
```

---

### 5-6. i18n 키 추가

**수정 파일**: `libs/i18n/locales/ko/web/dashboard.json`

`voice.channelChart` 섹션에 추가:

```json
{
  "voice": {
    "channelChart": {
      "title": "음성 활동 (Top 10)",
      "tabChannel": "채널별",
      "tabCategory": "카테고리별",
      "tabAutoGroup": "자동방 그룹",
      "filterAll": "전체",
      "filterPermanent": "상설 채널",
      "filterAuto": "자동방",
      "instanceCount": "생성된 방 수",
      "durationMin": "체류(분)",
      "micOnMin": "마이크 ON(분)",
      "micOffMin": "마이크 OFF(분)"
    },
    "summary": {
      "usedChannels": "사용 채널",
      "autoChannelGroups": "자동방 설정"
    }
  }
}
```

**수정 파일**: `libs/i18n/locales/en/web/dashboard.json`

```json
{
  "voice": {
    "channelChart": {
      "title": "Voice Activity (Top 10)",
      "tabChannel": "By Channel",
      "tabCategory": "By Category",
      "tabAutoGroup": "Auto Group",
      "filterAll": "All",
      "filterPermanent": "Permanent",
      "filterAuto": "Auto Channel",
      "instanceCount": "Instances",
      "durationMin": "Duration (min)",
      "micOnMin": "Mic ON (min)",
      "micOffMin": "Mic OFF (min)"
    },
    "summary": {
      "usedChannels": "Channels Used",
      "autoChannelGroups": "Auto Channel Configs"
    }
  }
}
```

**주의**: `voice.userDetail.channelPieChart` 섹션에도 "자동방 그룹" 탭 키를 추가해야 한다.

```json
// ko
"channelPieChart": {
  "tabAutoGroup": "자동방 그룹"
}

// en
"channelPieChart": {
  "tabAutoGroup": "Auto Group"
}
```

---

## 변경 파일 총 정리

| 파일 | 단계 | 변경 요약 |
|------|------|----------|
| `apps/web/app/lib/voice-dashboard-api.ts` | 4 | VoiceDailyRecord 확장, VoiceAutoChannelGroupStat 추가, ChannelStatsGroupMode 추가, computeAutoChannelGroupStats() 추가, computeChannelStats() groupMode 파라미터 추가, computeSummary() uniqueChannels 계산 변경, ChannelTypeFilter 타입 + filterRecordsByChannelType() 추가 |
| `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` | 5 | channelTypeFilter 상태 추가, channelStats 상태 제거 (렌더링 시점 계산), ChannelBarChart props 변경 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx` | 5 | TabValue에 "autoGroup" 추가, Props에 channelTypeFilter/onChannelTypeFilterChange 추가, 필터 드롭다운 UI 추가, 자동방 그룹 차트 데이터 계산 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/SummaryCards.tsx` | 5 | 변경 없음 (computeSummary 내부 변경으로 자동 반영) |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx` | 5 | TabValue에 "autoGroup" 추가, Props에 autoGroupedChannelStats 추가, 자동방 그룹 파이 차트 데이터 |
| `libs/i18n/locales/ko/web/dashboard.json` | 5 | voice.channelChart에 4개 키, voice.summary에 1개 키, voice.userDetail.channelPieChart에 1개 키 추가 |
| `libs/i18n/locales/en/web/dashboard.json` | 5 | 동일 구조로 영문 키 추가 |

---

## 구현 순서 (단계 내)

```
4-1. VoiceDailyRecord 타입 확장
4-2. VoiceAutoChannelGroupStat 인터페이스 추가
4-3. ChannelStatsGroupMode 타입 추가
4-4. computeAutoChannelGroupStats() 함수 추가
4-5. computeChannelStats() groupMode 파라미터 추가
4-6. computeSummary() uniqueChannels 변경
4-7. ChannelTypeFilter + filterRecordsByChannelType() 추가
  ↓
5-6. i18n 키 추가 (ko, en)
  ↓
5-1. page.tsx 상태/집계 변경
5-2. ChannelBarChart UI 변경
  ↓ (병렬 가능)
5-3. SummaryCards (변경 없음 확인)
5-4. UserChannelPieChart 탭 추가
```

---

## 주의사항 및 엣지 케이스

1. **백엔드 미배포 상태에서의 하위 호환**: API가 새 필드를 아직 반환하지 않는 경우, `channelType`이 `undefined`가 될 수 있다. 모든 집계 함수에서 `r.channelType ?? 'permanent'`로 안전 접근해야 한다.

2. **자동방 데이터가 없는 서버**: 자동방 config를 사용하지 않는 서버에서는 "자동방 그룹" 탭에 데이터가 비어 있다. 빈 상태 UI(empty state)를 표시해야 한다. 기존 `channelChart` 컴포넌트에 빈 상태 처리가 없으므로, "자동방 그룹" 탭에서만 "자동방 데이터가 없습니다" 메시지를 표시한다.

3. **필터 상태 초기화**: 기간(period) 변경 시 `channelTypeFilter`를 초기화할 필요는 없다. 필터는 클라이언트 측 레코드 필터링이므로 기간 변경과 독립적이다.

4. **성능**: `rawRecords`가 큰 경우(90일 x 다수 유저 x 다수 채널) 렌더링마다 `computeChannelStats()` 재계산이 발생한다. 필요시 `useMemo()`로 최적화한다.
   ```typescript
   const channelStats = useMemo(
     () => computeChannelStats(filteredRecords),
     [filteredRecords],
   );
   ```
