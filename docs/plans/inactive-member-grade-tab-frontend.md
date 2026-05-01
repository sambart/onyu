# Inactive Member 등급 탭 — Frontend 구현 계획

> 티켓: INACTIVE-GRADE-TAB-FE ([수정 49])
> 도메인: `inactive-member`
> 참조 PRD: `/docs/specs/prd/inactive-member.md` (F-INACTIVE-002)
> 참조 변경이력: `/docs/archive/prd-changelog.md` ([수정 49])
> 짝 계획(Backend): `/docs/plans/inactive-member-grade-tab-backend.md`

---

## 1. 작업 배경

PRD F-INACTIVE-002 [수정 49] 갱신에 따라 비활동 회원 대시보드의 UI를 다음과 같이 개편한다.

- 등급 필터를 **select 드롭다운에서 탭 UI로 교체**하고, 각 탭 라벨에 등급별 인원수를 표시한다.
- 4개 탭(전체 / 완전 비활동 / 저활동 / 활동 감소)별로 의미 있는 컬럼만 노출하는 **차별화된 테이블**을 제공한다.
- 활동 감소 탭에 한해 새 정렬 키 `decreaseRate`를 노출하고, 탭 전환 시 **기본 정렬을 자동 적용**한다.
- 저활동 탭의 임계값 표시·진척도 바를 위해 `fetchInactiveMemberConfig`를 추가 호출한다.
- 백엔드(짝 계획)에서 `items[].prevTotalMinutes`를 응답으로 노출하므로, 프런트 타입에 필드를 반영하고 감소율·감소량을 클라이언트에서 계산한다.

본 계획의 범위는 **목록 페이지 + 테이블 컴포넌트 + API 클라이언트 타입 + i18n 키**다. 설정 페이지(`/settings/...`), 차트(`ActivityPieChart`, `InactiveTrendChart`), `StatsCards`, `ActionBar`, 분류 실행 버튼은 변경하지 않는다.

---

## 2. 변경 영향 파일 (절대 경로)

### 2.1 직접 수정 대상

| # | 파일 경로 | 변경 요약 |
|---|----------|----------|
| 1 | `e:\Workspace\discord\nest-dhyunbot\apps\web\app\lib\inactive-member-api.ts` | `InactiveMemberItem`에 `prevTotalMinutes: number` 추가, `InactiveMemberListQuery.sortBy` 유니온에 `'decreaseRate'` 추가 |
| 2 | `e:\Workspace\discord\nest-dhyunbot\apps\web\app\dashboard\guild\[guildId]\inactive-member\page.tsx` | grade select 제거 → 탭 UI로 교체, 탭별 기본 정렬 자동 적용, `config` state 추가 (저활동 임계값), 탭 정보를 테이블 컴포넌트에 prop으로 전달, `sortBy` 옵션 탭별 분기 |
| 3 | `e:\Workspace\discord\nest-dhyunbot\apps\web\app\dashboard\guild\[guildId]\inactive-member\components\InactiveMemberTable.tsx` | `tab` prop으로 분기하여 컬럼 세트를 4종(`all` / `FULLY_INACTIVE` / `LOW_ACTIVE` / `DECLINING`) 렌더. `lowActiveThresholdMin`을 prop으로 받음 |

### 2.2 신규 추가 대상

| # | 파일 경로 | 변경 요약 |
|---|----------|----------|
| 4 | `e:\Workspace\discord\nest-dhyunbot\apps\web\app\dashboard\guild\[guildId]\inactive-member\components\GradeTabs.tsx` | 4개 탭 버튼 + 카운트 배지 렌더링 컴포넌트 |

### 2.3 i18n 변경 대상

| # | 파일 경로 | 변경 요약 |
|---|----------|----------|
| 5 | `e:\Workspace\discord\nest-dhyunbot\libs\i18n\locales\ko\web\dashboard.json` | `inactive.tabs.*`, `inactive.table.daysAbsent`, `inactive.table.thresholdProgress`, `inactive.table.prevTotalMinutes`, `inactive.table.decreaseRate`, `inactive.table.decreaseAmount`, `inactive.filter.sortBy.decreaseRate` 추가 |
| 6 | `e:\Workspace\discord\nest-dhyunbot\libs\i18n\locales\en\web\dashboard.json` | 동일 키 영문 추가 |

### 2.4 검토만 (변경 없음)

| 파일 | 사유 |
|------|------|
| `apps/web/app/dashboard/guild/[guildId]/inactive-member/components/StatsCards.tsx` | 기존 카운트 표시 그대로 유지. 탭과 중복되지만 카드 UI는 시각적 요약 역할로 별개 |
| `apps/web/app/dashboard/guild/[guildId]/inactive-member/components/ActivityPieChart.tsx` | 변경 없음 |
| `apps/web/app/dashboard/guild/[guildId]/inactive-member/components/InactiveTrendChart.tsx` | 변경 없음 |
| `apps/web/app/dashboard/guild/[guildId]/inactive-member/components/ActionBar.tsx` | 선택 액션 로직 그대로 |
| `apps/web/app/lib/format-utils.ts` | `formatMinutesI18n`, `gradeLabelI18n` 그대로 재사용 |

---

## 3. 컴포넌트 분리 전략

**권장안: 단일 `InactiveMemberTable`에서 `tab` prop으로 분기.** 별도 `FullyInactiveTable` / `LowActiveTable` / `DecliningTable` / `AllInactiveTable`로 쪼개지 않는다.

### 사유

1. **공통 부분이 70% 이상**: 체크박스 셀, 닉네임 셀, `gradeChangedAt`/`lastVoiceDate` 셀, 테이블 컨테이너(`Card` + `overflow-x-auto`), 빈 상태(`noData`), `selectedIds` 처리, `onToggleAll`/`onToggleSelect` 콜백이 4개 탭 모두 동일하다. 4파일로 쪼개면 각각에 동일한 셸 코드를 복제해야 한다.
2. **탭 전환 시 props가 거의 동일**: 부모(`page.tsx`)는 탭이 바뀌더라도 `items`, `selectedIds`, `onToggleAll`, `onToggleSelect`를 동일하게 넘긴다. 컴포넌트를 분리하면 부모에서 4분기 JSX(`{tab === 'all' && <AllTable.../>} {tab === 'FULLY_INACTIVE' && <FullyTable.../>}` …)가 필요하여 가독성이 떨어진다.
3. **컬럼 정의 자체가 짧다**: 탭별로 다른 컬럼은 2~3개에 불과하므로, 단일 컴포넌트 내부에서 헤더 셀과 바디 셀을 `tab` 분기로 처리하는 비용이 매우 낮다.
4. **테스트 부담 감소**: 4개 컴포넌트를 만들 경우 각각에 대해 빈 상태 / 선택 처리 / 헤더 렌더 테스트를 중복으로 작성해야 한다. 단일 컴포넌트면 `tab` prop을 바꿔가며 셋업 한 번으로 검증할 수 있다.

### 분리 방식 (단일 컴포넌트 내 분기)

```ts
// InactiveMemberTable.tsx 시그니처
type TabKey = 'all' | 'FULLY_INACTIVE' | 'LOW_ACTIVE' | 'DECLINING';

interface Props {
  tab: TabKey;
  items: InactiveMemberItem[];
  selectedIds: Set<string>;
  lowActiveThresholdMin?: number; // tab === 'LOW_ACTIVE'에서만 의미
  onToggleSelect: (userId: string) => void;
  onToggleAll: (checked: boolean) => void;
}
```

내부 구조:

- `renderHeaderRow(tab)` 헬퍼: 탭별로 `<th>` 배열 반환
- `renderBodyRow(tab, item)` 헬퍼: 탭별로 `<td>` 배열 반환
- 진척도 바, 미접속 일수 계산, 감소율 계산은 작은 helper 함수로 분리하여 같은 파일 하단에 배치
  - `daysSince(iso: string | null): number | null`
  - `decreaseRate(prev: number, current: number): number | null`
  - `decreaseAmount(prev: number, current: number): number`
  - `progressPercent(value: number, threshold: number): number` (0~100 clamp)

> 만약 향후 탭별 컬럼이 8개 이상으로 늘어나거나 탭별 인터랙션(예: 행 클릭 시 다른 모달)이 분기되면, 그때 컴포넌트 분리를 재고한다. 현 PRD 명세 범위에서는 분리 비용이 이익을 초과한다.

---

## 4. 파일별 구체적 변경 내용

### 4.1 `apps/web/app/lib/inactive-member-api.ts`

#### 4.1.1 `InactiveMemberItem` 타입 확장

**변경 전 (line 6~14)**:
```ts
export interface InactiveMemberItem {
  userId: string;
  nickName: string;
  grade: InactiveMemberGrade;
  totalMinutes: number;
  lastVoiceDate: string | null;
  gradeChangedAt: string | null;
  classifiedAt: string;
}
```

**변경 후**:
```ts
export interface InactiveMemberItem {
  userId: string;
  nickName: string;
  grade: InactiveMemberGrade;
  totalMinutes: number;
  prevTotalMinutes: number;
  lastVoiceDate: string | null;
  gradeChangedAt: string | null;
  classifiedAt: string;
}
```

#### 4.1.2 `InactiveMemberListQuery.sortBy` 유니온 확장

**변경 전 (line 27)**:
```ts
sortBy?: 'lastVoiceDate' | 'totalMinutes';
```

**변경 후**:
```ts
sortBy?: 'lastVoiceDate' | 'totalMinutes' | 'decreaseRate';
```

> `fetchInactiveMembers`의 query 직렬화 로직은 string 그대로 전달하므로 별도 변경 불필요.
>
> `fetchInactiveMemberConfig` 함수는 이미 존재(line 172~174)하며 경로는 `/api/guilds/${guildId}/inactive-members/config`. PRD 표기 `/api/guilds/{guildId}/inactive-member-config`와 다르나 백엔드 컨트롤러 라우팅은 현재 코드 기준이므로 본 계획에서는 **현행 함수 그대로 사용**한다. (PRD 경로 표기와의 정합은 별도 이슈로 다룸)

---

### 4.2 `apps/web/app/dashboard/guild/[guildId]/inactive-member/page.tsx`

#### 4.2.1 import 추가

```ts
import {
  classifyInactiveMembers,
  executeInactiveMemberAction,
  fetchInactiveMemberConfig,
  fetchInactiveMembers,
  fetchInactiveMemberStats,
} from "@/app/lib/inactive-member-api";
import type { InactiveMemberConfig } from "@/app/lib/inactive-member-api";

import GradeTabs from "./components/GradeTabs";
```

#### 4.2.2 새 state 추가

```ts
const [config, setConfig] = useState<InactiveMemberConfig | null>(null);
```

탭 키 타입을 별도 alias로 선언:

```ts
type TabKey = InactiveMemberGrade | 'all';
```

`gradeFilter` 변수명·타입은 그대로 두되, 의미상 이제 "선택된 탭"이다.

#### 4.2.3 `sortBy` 타입 확장

```ts
const [sortBy, setSortBy] = useState<'lastVoiceDate' | 'totalMinutes' | 'decreaseRate'>('totalMinutes');
```

초기값은 기존 `totalMinutes` 유지 (탭 전환 시 자동으로 덮어씀).

#### 4.2.4 config 로드 콜백 추가

```ts
const loadConfig = useCallback(async () => {
  try {
    const data = await fetchInactiveMemberConfig(guildId);
    if (mountedRef.current) setConfig(data);
  } catch {
    // 설정 로드 실패는 무시 — 임계값 표시만 fallback
  }
}, [guildId]);

useEffect(() => {
  void loadConfig();
}, [loadConfig]);
```

`stats`/`config` 둘 중 하나라도 실패해도 목록은 동작해야 하므로 `Promise.all`이 아닌 개별 `useEffect`로 fire-and-forget. 기존 `loadStats` 패턴과 통일.

#### 4.2.5 탭 변경 핸들러 — 기본 정렬 자동 적용

기존 `handleGradeFilterChange`를 다음 시그니처로 교체:

```ts
const TAB_DEFAULT_SORT: Record<TabKey, { sortBy: typeof sortBy; sortOrder: 'ASC' | 'DESC' }> = {
  all: { sortBy: 'lastVoiceDate', sortOrder: 'ASC' },
  FULLY_INACTIVE: { sortBy: 'lastVoiceDate', sortOrder: 'ASC' },
  LOW_ACTIVE: { sortBy: 'totalMinutes', sortOrder: 'ASC' },
  DECLINING: { sortBy: 'decreaseRate', sortOrder: 'DESC' },
};

const handleTabChange = useCallback((tab: TabKey) => {
  setGradeFilter(tab);
  const def = TAB_DEFAULT_SORT[tab];
  setSortBy(def.sortBy);
  setSortOrder(def.sortOrder);
  setPage(1);
  setSelectedIds(new Set()); // 탭 전환 시 선택 초기화
}, []);
```

> PRD 표(2.4)는 전체 탭 기본 정렬을 `lastVoiceDate ASC`로 명시. 기존 컴포넌트의 초기값(`totalMinutes ASC`)과 다르므로 PRD를 따른다. 단, 페이지 첫 마운트 시점에 한해 `useState` 초기값을 그대로 두면 `loadItems`가 `totalMinutes ASC`로 한 번 호출되므로, 마운트 시 `handleTabChange('all')`을 한번 실행하거나 `useState` 초기값 자체를 `lastVoiceDate ASC`로 변경한다 → 후자(초기값 변경)가 코드가 단순하므로 권장.

```ts
const [sortBy, setSortBy] = useState<'lastVoiceDate' | 'totalMinutes' | 'decreaseRate'>('lastVoiceDate');
const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
```

#### 4.2.6 grade select 제거 → `<GradeTabs />` 배치

기존 line 264~301의 필터바 섹션을 다음 구조로 교체.

```tsx
{/* 등급 탭 */}
<GradeTabs
  activeTab={gradeFilter}
  stats={stats}
  onChange={handleTabChange}
/>

{/* 검색 + 정렬 */}
<div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
  <input
    type="text"
    value={searchInput}
    onChange={(e) => setSearchInput(e.target.value)}
    placeholder={t("inactive.filter.search")}
    className="w-full sm:w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  />

  <select
    value={sortBy}
    onChange={(e) => handleSortByChange(e.target.value)}
    className="w-full sm:w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  >
    <option value="lastVoiceDate">{t("inactive.filter.sortBy.lastVoiceDate")}</option>
    <option value="totalMinutes">{t("inactive.filter.sortBy.totalMinutes")}</option>
    {gradeFilter === 'DECLINING' && (
      <option value="decreaseRate">{t("inactive.filter.sortBy.decreaseRate")}</option>
    )}
  </select>

  <select
    value={sortOrder}
    onChange={(e) => handleSortOrderChange(e.target.value)}
    className="w-full sm:w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  >
    <option value="ASC">{t("inactive.filter.sortOrder.ASC")}</option>
    <option value="DESC">{t("inactive.filter.sortOrder.DESC")}</option>
  </select>
</div>
```

`handleSortByChange` 내부 캐스팅도 새 유니온으로 갱신:

```ts
const handleSortByChange = (value: string) => {
  setSortBy(value as 'lastVoiceDate' | 'totalMinutes' | 'decreaseRate');
  setPage(1);
};
```

> 활동 감소 탭이 아닌 상태에서 사용자가 어찌어찌 `decreaseRate`로 진입한 경우 → 백엔드는 `lastVoiceDate ASC`로 fallback (백엔드 plan 3.3 참고). 프런트 select에는 옵션 자체를 노출하지 않으므로 정상 흐름에서는 발생 불가.

#### 4.2.7 `<InactiveMemberTable />` 호출에 `tab`, `lowActiveThresholdMin` prop 전달

```tsx
<InactiveMemberTable
  tab={gradeFilter}
  items={items}
  selectedIds={selectedIds}
  lowActiveThresholdMin={config?.lowActiveThresholdMin}
  onToggleSelect={handleToggleSelect}
  onToggleAll={handleToggleAll}
/>
```

#### 4.2.8 기존 `handleGradeFilterChange` 함수 제거

탭 컴포넌트가 대체하므로 더 이상 필요 없음. 죽은 코드로 남겨두지 않는다.

---

### 4.3 신규 컴포넌트 — `GradeTabs.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";

import type { InactiveMemberGrade, InactiveMemberStats } from "@/app/lib/inactive-member-api";

type TabKey = InactiveMemberGrade | 'all';

interface Props {
  activeTab: TabKey;
  stats: InactiveMemberStats | null;
  onChange: (tab: TabKey) => void;
}

interface TabDef {
  key: TabKey;
  labelKey: string;
  count: number | null;
}

export default function GradeTabs({ activeTab, stats, onChange }: Props) {
  const t = useTranslations("dashboard");

  const tabs: TabDef[] = [
    { key: 'all', labelKey: 'inactive.tabs.all', count: null },
    { key: 'FULLY_INACTIVE', labelKey: 'inactive.tabs.fullyInactive', count: stats?.fullyInactiveCount ?? null },
    { key: 'LOW_ACTIVE', labelKey: 'inactive.tabs.lowActive', count: stats?.lowActiveCount ?? null },
    { key: 'DECLINING', labelKey: 'inactive.tabs.declining', count: stats?.decliningCount ?? null },
  ];

  return (
    <div role="tablist" className="flex flex-wrap gap-2 border-b border-border">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              isActive
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(' ')}
          >
            {t(tab.labelKey)}
            {tab.count !== null && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

> `stats`가 null인 첫 로드 단계에서는 카운트 배지를 렌더하지 않는다. 통계가 들어오면 자연스럽게 카운트가 나타난다.

---

### 4.4 `components/InactiveMemberTable.tsx` — 탭별 컬럼 분기

#### 4.4.1 시그니처 변경

```ts
type TabKey = InactiveMemberGrade | 'all';

interface Props {
  tab: TabKey;
  items: InactiveMemberItem[];
  selectedIds: Set<string>;
  lowActiveThresholdMin?: number;
  onToggleSelect: (userId: string) => void;
  onToggleAll: (checked: boolean) => void;
}
```

#### 4.4.2 헤더 분기

`tab`에 따라 `<th>` 컬럼 세트를 다르게 렌더한다. 의사코드:

```tsx
{tab === 'all' && (
  <>
    <th>nickname</th>
    <th>grade</th>
    <th>lastVoiceDate</th>
    <th>totalMinutes</th>
    <th>gradeChangedAt</th>
  </>
)}
{tab === 'FULLY_INACTIVE' && (
  <>
    <th>nickname</th>
    <th>lastVoiceDate</th>
    <th>daysAbsent</th>
    <th>gradeChangedAt</th>
  </>
)}
{tab === 'LOW_ACTIVE' && (
  <>
    <th>nickname</th>
    <th>thresholdProgress</th>
    <th>lastVoiceDate</th>
    <th>gradeChangedAt</th>
  </>
)}
{tab === 'DECLINING' && (
  <>
    <th>nickname</th>
    <th>prevTotalMinutes</th>
    <th>decreaseRate</th>
    <th>decreaseAmount</th>
    <th>lastVoiceDate</th>
    <th>gradeChangedAt</th>
  </>
)}
```

`<colSpan>`(`noData` 빈 행)은 탭별 컬럼 수 + 1(체크박스)에 맞춰 동적으로 산출:

```ts
const COLSPAN_BY_TAB: Record<TabKey, number> = {
  all: 6,
  FULLY_INACTIVE: 5,
  LOW_ACTIVE: 5,
  DECLINING: 7,
};
```

#### 4.4.3 바디 분기 — 헬퍼 함수

같은 파일 하단에 정의:

```ts
function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = now.getTime() - date.getTime();
  const MS_PER_DAY = 86_400_000;
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

function decreaseRate(prev: number, current: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((prev - current) / prev) * 100);
}

function decreaseAmount(prev: number, current: number): number {
  return Math.max(0, prev - current);
}

function progressPercent(value: number, threshold: number): number {
  if (threshold <= 0) return 0;
  const ratio = (value / threshold) * 100;
  if (ratio < 0) return 0;
  if (ratio > 100) return 100;
  return Math.round(ratio);
}
```

상수 매직 넘버는 `.eslintrc.js`의 `no-magic-numbers`(warn) 회피를 위해 `MS_PER_DAY`처럼 명명. `100`도 필요 시 상수화.

#### 4.4.4 셀 렌더링 — 탭별

**전체 탭**: 기존 그대로 (line 95~111 유지)

**완전 비활동 탭** (FULLY_INACTIVE):
```tsx
<td className="px-4 py-3 font-medium">{item.nickName}</td>
<td className="px-4 py-3 text-muted-foreground">
  {item.lastVoiceDate ?? t("inactive.table.noVoiceDate")}
</td>
<td className="px-4 py-3 text-muted-foreground">
  {(() => {
    const days = daysSince(item.lastVoiceDate);
    return days === null
      ? t("inactive.table.noVoiceDate")
      : t("inactive.table.daysAbsent", { days });
  })()}
</td>
<td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
```

**저활동 탭** (LOW_ACTIVE):
```tsx
<td className="px-4 py-3 font-medium">{item.nickName}</td>
<td className="px-4 py-3">
  <div className="flex flex-col gap-1">
    <span className="text-muted-foreground">
      {t("inactive.table.thresholdProgress", {
        current: item.totalMinutes,
        threshold: lowActiveThresholdMin ?? '?',
      })}
    </span>
    {lowActiveThresholdMin !== undefined && (
      <div
        className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={progressPercent(item.totalMinutes, lowActiveThresholdMin)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-yellow-500"
          style={{ width: `${progressPercent(item.totalMinutes, lowActiveThresholdMin)}%` }}
        />
      </div>
    )}
  </div>
</td>
<td className="px-4 py-3 text-muted-foreground">
  {item.lastVoiceDate ?? t("inactive.table.noVoiceDate")}
</td>
<td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
```

> i18n key `inactive.table.thresholdProgress` 메시지 형식: `{current} / {threshold}분`. ko/en 각각 정의.

**활동 감소 탭** (DECLINING):
```tsx
<td className="px-4 py-3 font-medium">{item.nickName}</td>
<td className="px-4 py-3 text-muted-foreground">
  {t("inactive.table.prevTotalMinutes", {
    prev: item.prevTotalMinutes,
    current: item.totalMinutes,
  })}
</td>
<td className="px-4 py-3 text-muted-foreground">
  {(() => {
    const rate = decreaseRate(item.prevTotalMinutes, item.totalMinutes);
    return rate === null ? '-' : `${rate}%`;
  })()}
</td>
<td className="px-4 py-3 text-muted-foreground">
  {t("inactive.table.decreaseAmount", {
    minutes: decreaseAmount(item.prevTotalMinutes, item.totalMinutes),
  })}
</td>
<td className="px-4 py-3 text-muted-foreground">
  {item.lastVoiceDate ?? t("inactive.table.noVoiceDate")}
</td>
<td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
```

#### 4.4.5 함수 50줄 제한 (ESLint warn) 대응

`InactiveMemberTable` 컴포넌트가 분기 추가로 인해 길어지므로 다음과 같이 분리:

- `renderHeaderCells(tab, t)` 함수 → 탭별 `<>...</>` fragment 반환
- `renderBodyCells(tab, item, lowActiveThresholdMin, t, tc)` 함수 → 탭별 `<>...</>` fragment 반환

각 함수는 30~40줄 이내로 유지. JSX-only 함수이므로 일반 함수 컴포넌트로 만들지 않고 inline helper로 충분.

---

### 4.5 i18n 추가 키

#### 4.5.1 `libs/i18n/locales/ko/web/dashboard.json`

`"inactive"` 객체 내부에 다음 키를 추가/병합:

```json
{
  "inactive": {
    "tabs": {
      "all": "전체",
      "fullyInactive": "완전 비활동",
      "lowActive": "저활동",
      "declining": "활동 감소"
    },
    "filter": {
      "sortBy": {
        "lastVoiceDate": "마지막 접속일",
        "totalMinutes": "접속 시간",
        "decreaseRate": "감소율"
      }
    },
    "table": {
      "daysAbsent": "{days}일",
      "thresholdProgress": "{current} / {threshold}분",
      "prevTotalMinutes": "{prev}분 → {current}분",
      "decreaseRate": "감소율",
      "decreaseAmount": "{minutes}분 감소"
    }
  }
}
```

> 기존 `inactive.filter.sortBy` 객체에 `decreaseRate` 키만 추가 병합. `inactive.tabs` 객체는 신규.

#### 4.5.2 `libs/i18n/locales/en/web/dashboard.json`

```json
{
  "inactive": {
    "tabs": {
      "all": "All",
      "fullyInactive": "Fully Inactive",
      "lowActive": "Low Active",
      "declining": "Declining"
    },
    "filter": {
      "sortBy": {
        "lastVoiceDate": "Last Voice Date",
        "totalMinutes": "Voice Duration",
        "decreaseRate": "Decrease Rate"
      }
    },
    "table": {
      "daysAbsent": "{days}d",
      "thresholdProgress": "{current} / {threshold} min",
      "prevTotalMinutes": "{prev}m → {current}m",
      "decreaseRate": "Decrease Rate",
      "decreaseAmount": "-{minutes}m"
    }
  }
}
```

> 헤더용 컬럼 라벨 `inactive.table.decreaseRate`는 `Decrease Rate` 단순 문자열. 셀 값은 컴포넌트에서 `${rate}%`로 직접 조합한다 (i18n 메시지에 % 기호를 박지 않음 → 기호는 로케일 중립).

---

## 5. 데이터 fetch 전략

페이지 최초 마운트 시 다음 3개 API를 **병렬·독립적**으로 호출한다.

| API | 호출 시점 | 실패 시 동작 |
|-----|---------|------------|
| `fetchInactiveMemberStats(guildId)` | 마운트 / 분류 실행 후 | 통계 카드·탭 카운트 미표시. 목록은 정상 표시 |
| `fetchInactiveMemberConfig(guildId)` | 마운트 (1회) | 저활동 탭의 `thresholdProgress` 셀이 `?`로 fallback, 진척도 바 미렌더 |
| `fetchInactiveMembers(guildId, query)` | 마운트 / 필터·정렬·페이지·검색 변경 시 | 에러 배너 표시 + 빈 목록 |

### 의존성·동기화 규칙

- **config 재로드 트리거 없음**: 설정 변경은 별도 `/settings` 페이지에서 이루어지며, 본 페이지는 마운트 시 한 번만 로드한다. 탭 전환 / 페이지 이동에 재로드 안 함.
- **stats 재로드 트리거**: 분류 실행 직후(`handleClassify` 성공 후 기존 코드)와 마운트 시. 액션 실행(`handleAction`) 후에는 재로드하지 않는다 (액션은 등급 카운트를 바꾸지 않음 — DM/역할 부여만).
- **목록 재로드 트리거**: `gradeFilter`, `searchQuery`, `sortBy`, `sortOrder`, `page` 변경 / 분류 실행 / 액션 실행 후 (기존 동작 유지).
- **탭 변경 시 selectedIds 초기화**: 탭이 바뀌면 행 집합이 달라지므로 선택 상태를 비운다 (4.2.5에 명시).

### 첫 페인트 UX

- `loading && !stats` 분기는 그대로 유지 (기존 line 242~246).
- `config` 로딩 실패는 silent — 저활동 탭 진입 시점에 임계값이 비어있을 수 있다 (`?` 표시 + 진척도 바 미렌더).

---

## 6. 테스트 가이드

### 6.1 단위 테스트 (Jest + RTL)

테스트 파일은 다음 위치에 신규 추가한다:

- `e:\Workspace\discord\nest-dhyunbot\apps\web\app\dashboard\guild\[guildId]\inactive-member\components\__tests__\InactiveMemberTable.test.tsx`
- `e:\Workspace\discord\nest-dhyunbot\apps\web\app\dashboard\guild\[guildId]\inactive-member\components\__tests__\GradeTabs.test.tsx`

> 현재 `apps/web/app/lib/__tests__/`에는 API 테스트만 존재하고 컴포넌트 테스트 디렉토리는 없다. RTL 도입 여부를 본 작업 시작 전 확인 필요. 만약 RTL이 미도입이라면 — 단위 테스트는 헬퍼 함수(`daysSince`, `decreaseRate`, `decreaseAmount`, `progressPercent`)에 한정하여 다음 위치에 작성한다:
> - `apps/web/app/dashboard/guild/[guildId]/inactive-member/components/__tests__/inactive-member-table-helpers.test.ts`
> 이 경우 헬퍼들을 같은 디렉토리의 `inactive-member-table-helpers.ts` 모듈로 분리해서 export한다.

#### `InactiveMemberTable` 케이스

| 케이스 | 검증 |
|--------|------|
| `tab='all'` | 헤더 셀 6개(체크박스 + 5컬럼). 등급 배지 셀 존재 |
| `tab='FULLY_INACTIVE'` | 헤더 셀 5개. `daysAbsent` 컬럼 노출. `lastVoiceDate=null` 행은 `noVoiceDate` 표시 |
| `tab='LOW_ACTIVE'` + `lowActiveThresholdMin=30` | `thresholdProgress` 셀에 `12 / 30분` 표시. 진척도 바 `aria-valuenow=40` |
| `tab='LOW_ACTIVE'` + `lowActiveThresholdMin=undefined` | 셀에 `?` fallback. 진척도 바 미렌더 |
| `tab='DECLINING'` + `prevTotalMinutes=100, totalMinutes=20` | 감소율 셀 `80%`. 감소량 셀 `80분 감소` |
| `tab='DECLINING'` + `prevTotalMinutes=0` | 감소율 셀 `-` |
| 빈 목록 | `noData` 행이 탭별 colspan에 맞춰 렌더 |
| 체크박스 토글 | `onToggleSelect` 호출. `onToggleAll(true)` 호출 시 모든 userId 전달 |

#### `GradeTabs` 케이스

| 케이스 | 검증 |
|--------|------|
| `stats=null` | 4개 탭 렌더. 카운트 배지 미표시 |
| `stats` 제공됨 | 각 탭에 카운트 배지 (`fullyInactiveCount`, `lowActiveCount`, `decliningCount`) |
| `activeTab='LOW_ACTIVE'` | 해당 탭에 `aria-selected=true`, 다른 탭은 false |
| 탭 클릭 | `onChange`에 해당 키 전달 |

#### 헬퍼 함수 케이스

| 함수 | 케이스 |
|------|------|
| `daysSince` | 오늘=2026-05-01, iso=2026-04-25 → 6. iso=null → null. 미래 날짜 → 0 (clamp) |
| `decreaseRate` | (100, 20) → 80. (100, 50) → 50. (0, 0) → null. (50, 60) → -20 (음수 허용 — UI에서 % 표시) |
| `decreaseAmount` | (100, 30) → 70. (10, 50) → 0 (clamp) |
| `progressPercent` | (12, 30) → 40. (50, 30) → 100 (clamp). (0, 30) → 0. (10, 0) → 0 |

### 6.2 페이지(Integration) 케이스 — 선택

`page.tsx`까지 RTL로 검증할 수 있다면:

- 마운트 시 stats / config / list 3개 fetch 호출
- 탭 클릭 시 `sortBy`/`sortOrder`가 `TAB_DEFAULT_SORT` 매핑값으로 설정되어 list가 새 query로 재호출됨
- 탭이 `DECLINING`일 때만 sortBy select에 `decreaseRate` option이 노출됨
- 탭 변경 시 `selectedIds`가 비워짐
- config 로드 실패 시에도 페이지가 정상 렌더 (silent fallback)

### 6.3 수동 QA 체크리스트

- [ ] 4개 탭이 모두 렌더되고 각 라벨에 카운트 배지가 표시된다
- [ ] 활동 감소 탭에서만 sortBy select에 `감소율` 옵션이 보인다
- [ ] 완전 비활동 탭에서 미접속 일수가 정확히 표시된다 (오늘 - lastVoiceDate)
- [ ] 저활동 탭에서 `12 / 30분` 형식과 진척도 바가 색깔(노랑)로 보인다
- [ ] 활동 감소 탭에서 `100분 → 20분`, `80%`, `80분 감소` 형식이 보인다
- [ ] 탭을 바꾸면 정렬이 자동으로 탭별 기본값으로 변경된다
- [ ] 탭을 바꾸면 체크박스 선택이 초기화된다
- [ ] config 로드 실패 (예: 네트워크 차단) 시에도 페이지가 깨지지 않는다
- [ ] 영문 로케일 전환 시 모든 신규 i18n 키가 영문으로 표시된다

---

## 7. 작업 순서

1. (의존) Backend 짝 계획 머지 또는 응답에 `prevTotalMinutes` 포함 확인 — 없을 경우 프런트 단독 머지하면 모든 행이 `0분`으로 표시됨
2. `inactive-member-api.ts` 타입 보강 (`prevTotalMinutes`, `sortBy`)
3. i18n 키 추가 (ko/en)
4. `GradeTabs.tsx` 신규 작성
5. `InactiveMemberTable.tsx` 시그니처 변경 + 탭별 분기
6. `page.tsx` 통합 — select 제거, 탭 통합, config 로드, 탭 변경 핸들러
7. (선택) 헬퍼 분리 + 단위 테스트 작성
8. `pnpm --filter @nexus/web lint` / `pnpm --filter @nexus/web typecheck` 통과
9. 로컬 dev 서버 띄워 수동 QA 체크리스트 수행
10. PR 생성 (제목: `feat: 비활동 회원 등급별 탭 UI 및 컬럼 차별화`)

---

## 8. 호환성·위험

| 항목 | 영향 | 대응 |
|------|------|------|
| `prevTotalMinutes` 응답 필드 누락 | 활동 감소 탭의 감소율·감소량이 0/`-`로 표시 | 백엔드 PR 선행 머지로 회피 |
| 기존 i18n 키 충돌 | 없음 (신규 키만 추가) | 기존 `inactive.grade.*` 키는 유지 — 등급 배지에서 여전히 사용 |
| 탭 전환 시 selectedIds 초기화로 인한 사용자 혼선 | 낮음 | PRD 표 외 결정사항이지만, 탭별 컬럼 의미가 다르므로 선택을 유지하면 오히려 혼란. 필요 시 ux 회의에서 재논의 |
| `sortBy=decreaseRate` + 탭 외 진입 | 백엔드 fallback 처리 (`lastVoiceDate ASC`) | 프런트는 select에 옵션 미노출. 사용자가 URL 직접 진입 시에만 발생. 본 작업 범위 외 |
| `config` 로드 실패 → 저활동 탭에 임계값 `?` | 사소 | silent fallback. 토스트 알림 불필요 |
| ESLint `function 50줄 초과` warn | 가능성 있음 | 4.4.5의 헬퍼 분리로 회피 |

---

## 9. 미해결 질문

- **`stats.activeCount` 표시 위치**: PRD 탭은 4개(전체/완전비활동/저활동/활동감소)로 `active`(활동 회원)는 별도 탭 없음. 카운트 표시는 기존 `StatsCards`로 충분 — 탭과 중복 정보지만 시각적 요약 카드 역할이라 유지. → 본 계획은 이대로 진행. (이의 있으면 PRD 작성자 확인 필요)
- **`fetchInactiveMemberConfig` 경로 정합**: 코드 = `/api/guilds/{id}/inactive-members/config`, PRD 표기 = `/api/guilds/{id}/inactive-member-config`. 본 계획은 코드 현행을 신뢰. PRD 오기인지 백엔드 라우팅 통일 필요인지는 별도 이슈.
