# Co-Presence 관계 분석 대시보드 프론트엔드 구현 계획

> PRD: [voice-co-presence.md](../specs/prd/voice-co-presence.md) F-COPRESENCE-007 ~ F-COPRESENCE-013
> 참조 패턴: `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`, `apps/web/app/lib/voice-dashboard-api.ts`

## 목표

Co-Presence 도메인의 쌍 단위 일별 집계 데이터를 시각화하는 관계 분석 전용 대시보드 페이지를 구현한다. 기존 voice/monitoring 대시보드와 동일한 레이아웃 패턴(shadcn Card, Recharts, Tailwind)을 따르되, 네트워크 그래프만 sigma.js 기반 별도 라이브러리를 사용한다.

## 선행 조건

- **백엔드 API 완료**: `CoPresenceAnalyticsController`의 7개 엔드포인트가 구현되어 있어야 한다.
- **백엔드 리팩토링 완료**: Phase 1~3 (voice-co-presence-refactoring.md) 배포 완료 후 데이터가 쌓이고 있어야 한다.

## 의존성 추가

`apps/web/package.json`에 아래 패키지를 추가한다:

| 패키지 | 용도 |
|--------|------|
| `@react-sigma/core` | sigma.js React 래퍼 — 네트워크 그래프 렌더링 |
| `graphology` | 그래프 자료구조 (sigma.js 필수 의존) |
| `graphology-communities-louvain` | Louvain 커뮤니티 탐지 알고리즘 (클러스터 색상 분류) |

```bash
pnpm --filter @onyu/web add @react-sigma/core graphology graphology-communities-louvain
pnpm --filter @onyu/web add -D @types/graphology-communities-louvain
```

> `@react-sigma/core`와 `graphology`는 SSR에서 동작하지 않으므로, `CoPresenceGraph` 컴포넌트를 `next/dynamic`으로 SSR 비활성화하여 import해야 한다.

## 변경 파일 목록

### 신규 생성

| 파일 | 역할 | PRD 기능 |
|------|------|----------|
| `apps/web/app/lib/co-presence-api.ts` | API 클라이언트 + 타입 정의 | 전체 |
| `apps/web/app/dashboard/guild/[guildId]/co-presence/page.tsx` | 메인 페이지 | F-007 |
| `.../co-presence/components/CoPresenceSummaryCards.tsx` | 요약 카드 4종 | F-007 |
| `.../co-presence/components/CoPresenceGraph.tsx` | 네트워크 그래프 | F-008 |
| `.../co-presence/components/TopPairsPanel.tsx` | 친밀도 TOP N 패널 | F-009 |
| `.../co-presence/components/IsolatedMemberList.tsx` | 고립 멤버 목록 | F-010 |
| `.../co-presence/components/PairsTable.tsx` | 관계 상세 테이블 | F-011 |
| `.../co-presence/components/DailyTrendChart.tsx` | 일별 추이 AreaChart | F-012 |
| `.../co-presence/components/PairDetailModal.tsx` | 특정 쌍 상세 모달 | F-013 |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/web/app/components/DashboardSidebar.tsx` | `menuItems` 배열에 "관계 분석" 항목 추가 |
| `apps/web/package.json` | sigma/graphology 의존성 추가 |

## 구현 단계

### Step 1: API 클라이언트 (`co-presence-api.ts`)

기존 `inactive-member-api.ts`, `voice-dashboard-api.ts` 패턴을 따른다. 타입 정의 + fetch 함수 + 유틸리티 함수를 한 파일에 배치.

#### 타입 정의

```typescript
// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** F-007: 요약 카드 응답 */
export interface CoPresenceSummary {
  activeMemberCount: number;
  totalPairCount: number;
  totalCoPresenceMinutes: number;
  avgPairsPerMember: number;
}

/** F-008: 그래프 노드 */
export interface GraphNode {
  userId: string;
  userName: string;
  totalMinutes: number;
}

/** F-008: 그래프 엣지 */
export interface GraphEdge {
  userA: string;
  userB: string;
  totalMinutes: number;
  sessionCount: number;
}

/** F-008: 그래프 응답 */
export interface CoPresenceGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** F-009: 친밀도 TOP N 쌍의 유저 정보 */
export interface PairUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

/** F-009: 친밀도 TOP N 항목 */
export interface TopPair {
  userA: PairUser;
  userB: PairUser;
  totalMinutes: number;
  sessionCount: number;
}

/** F-010: 고립 멤버 */
export interface IsolatedMember {
  userId: string;
  userName: string;
  totalVoiceMinutes: number;
  lastVoiceDate: string;
}

/** F-011: 관계 테이블 쌍 항목 */
export interface PairItem {
  userA: { userId: string; userName: string };
  userB: { userId: string; userName: string };
  totalMinutes: number;
  sessionCount: number;
  lastDate: string;
}

/** F-011: 관계 테이블 페이지네이션 응답 */
export interface PairsResponse {
  total: number;
  page: number;
  limit: number;
  items: PairItem[];
}

/** F-012: 일별 추이 데이터 */
export interface DailyTrendPoint {
  date: string;
  totalMinutes: number;
}

/** F-013: 쌍 상세 모달 응답 */
export interface PairDetail {
  userA: { userId: string; userName: string };
  userB: { userId: string; userName: string };
  totalMinutes: number;
  dailyData: { date: string; minutes: number }[];
}
```

#### API 함수 (7종)

| 함수명 | 엔드포인트 | 파라미터 |
|--------|-----------|----------|
| `fetchCoPresenceSummary` | `GET /api/guilds/:guildId/co-presence/summary` | `guildId`, `days` |
| `fetchCoPresenceGraph` | `GET /api/guilds/:guildId/co-presence/graph` | `guildId`, `days`, `minMinutes` |
| `fetchTopPairs` | `GET /api/guilds/:guildId/co-presence/top-pairs` | `guildId`, `days`, `limit` |
| `fetchIsolatedMembers` | `GET /api/guilds/:guildId/co-presence/isolated` | `guildId`, `days` |
| `fetchPairs` | `GET /api/guilds/:guildId/co-presence/pairs` | `guildId`, `days`, `search`, `page`, `limit` |
| `fetchDailyTrend` | `GET /api/guilds/:guildId/co-presence/daily-trend` | `guildId`, `days` |
| `fetchPairDetail` | `GET /api/guilds/:guildId/co-presence/pair-detail` | `guildId`, `userA`, `userB`, `days` |

에러 처리 패턴: `inactive-member-api.ts`와 동일하게 `res.ok` 체크 후 `throw new Error()`를 사용한다. `voice-dashboard-api.ts`의 빈 배열 반환 패턴은 사용하지 않는다 (에러를 명시적으로 전파).

#### 유틸리티 함수

```typescript
/** 분 → "X시간 Y분" 또는 "Y분" 포맷 */
export function formatMinutes(totalMinutes: number): string { ... }

/** 'YYYY-MM-DD' → 'MM/DD' 형식 */
export function formatShortDate(isoDate: string): string { ... }
```

> `formatMinutes`는 `inactive-member-api.ts`에도 동일 함수가 존재한다. 현재 공통 유틸 추출 없이 각 API 파일에 로컬 정의하는 패턴을 따른다. 향후 공통화 검토 가능.

### Step 2: DashboardSidebar 메뉴 추가

`apps/web/app/components/DashboardSidebar.tsx`의 `menuItems` 배열에 "관계 분석" 항목을 추가한다.

```typescript
import { Activity, ArrowLeftRight, GitFork, Mic, Search, Settings, UserX } from "lucide-react";

// menuItems 배열에 추가 (모니터링 앞에 배치)
{
  href: `/dashboard/guild/${selectedGuildId}/co-presence`,
  label: "관계 분석",
  icon: GitFork,
},
```

> 아이콘 선택: `GitFork` (lucide-react) — 관계/네트워크를 시각적으로 표현. 기존 메뉴와 중복 없음.

**메뉴 순서**: 음성 활동 → 유저 검색 → 비활동 회원 → **관계 분석** → 모니터링

### Step 3: 메인 페이지 (`page.tsx`)

기존 `voice/page.tsx` 패턴을 따른다.

#### 기간 선택

```typescript
type Days = 7 | 30 | 90;
```

PRD 사양: 7일 / 30일 / 90일 프리셋 버튼 (기본값 30). `voice/page.tsx`의 `Select` 드롭다운 대신 **프리셋 버튼 그룹**을 사용한다 (PRD에 "프리셋 버튼"으로 명시).

#### 데이터 로딩 전략

voice 대시보드는 단일 API 호출 후 클라이언트에서 집계하지만, co-presence 대시보드는 7개 독립 API를 호출한다. 따라서:

1. **페이지 마운트 시**: `summary`, `graph`, `topPairs`, `isolated`, `dailyTrend` 5개를 `Promise.all`로 병렬 호출
2. **`pairs` 테이블**: 별도 state로 관리 (페이지네이션/검색 시 개별 재호출)
3. **`pairDetail` 모달**: 행 클릭 시 on-demand 호출

```typescript
// 페이지 레벨 state
const [days, setDays] = useState<Days>(30);
const [loading, setLoading] = useState(true);
const [summary, setSummary] = useState<CoPresenceSummary | null>(null);
const [graphData, setGraphData] = useState<CoPresenceGraphData | null>(null);
const [topPairs, setTopPairs] = useState<TopPair[]>([]);
const [isolated, setIsolated] = useState<IsolatedMember[]>([]);
const [dailyTrend, setDailyTrend] = useState<DailyTrendPoint[]>([]);
const [minMinutes, setMinMinutes] = useState(10); // 그래프 최소 임계값
```

#### 레이아웃 구성

```
┌─────────────────────────────────────────────────────┐
│  헤더: "관계 분석" + 기간 선택 버튼 (7d / 30d / 90d) │
├─────────────────────────────────────────────────────┤
│  CoPresenceSummaryCards (4개 카드, 가로 배치)          │
├─────────────────────────────────────┬───────────────┤
│  CoPresenceGraph (2/3)              │ TopPairsPanel  │
│  + 최소 임계값 슬라이더              │ (1/3)         │
├─────────────────────────────────────┴───────────────┤
│  DailyTrendChart (전체 폭)                           │
├─────────────────────────────────────────────────────┤
│  PairsTable (전체 폭, 페이지네이션 + 검색)            │
├─────────────────────────────────────────────────────┤
│  IsolatedMemberList (전체 폭)                        │
└─────────────────────────────────────────────────────┘
```

#### useEffect 데이터 로딩

```typescript
useEffect(() => {
  let cancelled = false;

  async function loadData() {
    setLoading(true);
    const [s, g, tp, iso, trend] = await Promise.all([
      fetchCoPresenceSummary(guildId, days),
      fetchCoPresenceGraph(guildId, days, minMinutes),
      fetchTopPairs(guildId, days, 10),
      fetchIsolatedMembers(guildId, days),
      fetchDailyTrend(guildId, days),
    ]);
    if (cancelled) return;
    setSummary(s);
    setGraphData(g);
    setTopPairs(tp);
    setIsolated(iso);
    setDailyTrend(trend);
    setLoading(false);
  }

  loadData();
  return () => { cancelled = true; };
}, [guildId, days]);
```

> `minMinutes` 변경 시에는 그래프만 재호출 (별도 useEffect).

### Step 4: CoPresenceSummaryCards (F-007)

기존 `voice/components/SummaryCards.tsx` 패턴과 동일하게 shadcn `Card` 4개를 가로 배치.

| 카드 | 값 | 아이콘 |
|------|-----|--------|
| 활성 멤버 | `activeMemberCount`명 | `Users` |
| 총 관계 수 | `totalPairCount`쌍 | `Link2` |
| 총 동시접속 시간 | `formatMinutes(totalCoPresenceMinutes)` | `Clock` |
| 평균 관계 수/인 | `avgPairsPerMember.toFixed(1)`개 | `BarChart3` |

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {cards.map(card => (
    <Card key={card.label}>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-lg bg-indigo-50 p-3">
          <card.icon className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className="text-2xl font-bold">{card.value}</p>
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

### Step 5: CoPresenceGraph (F-008)

네트워크 그래프는 sigma.js + graphology를 사용한다. SSR 호환 불가이므로 `next/dynamic`으로 import한다.

#### SSR 비활성화

```typescript
// page.tsx에서
import dynamic from "next/dynamic";

const CoPresenceGraph = dynamic(
  () => import("./components/CoPresenceGraph"),
  { ssr: false, loading: () => <GraphSkeleton /> },
);
```

#### 컴포넌트 구현 요점

**Props**:
```typescript
interface CoPresenceGraphProps {
  data: CoPresenceGraphData;
  minMinutes: number;
  onMinMinutesChange: (value: number) => void;
}
```

**그래프 초기화 로직**:
1. `graphology`의 `UndirectedGraph` 인스턴스 생성
2. API 응답의 `nodes`를 그래프에 추가 (size: totalMinutes 비례, 최소 8px ~ 최대 40px)
3. API 응답의 `edges`를 그래프에 추가 (size: totalMinutes 비례, 최소 1px ~ 최대 8px)
4. `graphology-communities-louvain`으로 클러스터 자동 분류
5. 클러스터별 고정 팔레트 색상 할당

**클러스터 팔레트** (최대 10색):
```typescript
const CLUSTER_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#06B6D4',
];
```

**노드 크기 계산**:
```typescript
function computeNodeSize(minutes: number, maxMinutes: number): number {
  const MIN_SIZE = 8;
  const MAX_SIZE = 40;
  if (maxMinutes === 0) return MIN_SIZE;
  return MIN_SIZE + (minutes / maxMinutes) * (MAX_SIZE - MIN_SIZE);
}
```

**인터랙션**:
- 줌/패닝: sigma.js 기본 제공
- 노드 호버: 레이블 표시 (기본 숨김)
- 노드 클릭: 연결된 엣지/노드만 하이라이트, 나머지 투명도 0.15로 낮춤

**최소 임계값 슬라이더**:
- `<input type="range">` 또는 shadcn Slider
- 값 변경 시 debounce(300ms) 적용 후 `onMinMinutesChange` 호출 → 부모에서 `fetchCoPresenceGraph` 재호출

**빈 데이터 처리**: 노드 0개인 경우 "기간 내 동시접속 데이터가 없습니다" 메시지 표시.

### Step 6: TopPairsPanel (F-009)

**Props**: `topPairs: TopPair[]`

디스코드 아바타 + 닉네임 쌍을 세로 리스트로 표시.

```
┌──────────────────────────────────┐
│  친밀도 TOP 10                    │
│──────────────────────────────────│
│  [avatar] UserA ↔ [avatar] UserB │
│  12시간 30분 · 45세션             │
│──────────────────────────────────│
│  [avatar] UserC ↔ [avatar] UserD │
│  8시간 15분 · 32세션              │
│  ...                             │
└──────────────────────────────────┘
```

- 아바타: Discord CDN URL 사용. null인 경우 닉네임 첫 글자로 대체 (기존 사이드바 패턴과 동일)
- ↔ 구분: `ArrowLeftRight` 아이콘 (lucide-react, 이미 import됨)
- 시간 포맷: `formatMinutes()` 함수 사용

### Step 7: IsolatedMemberList (F-010)

**Props**: `members: IsolatedMember[]`

shadcn Card 안에 테이블 형식으로 표시.

| 컬럼 | 값 |
|------|-----|
| 사용자명 | `userName` |
| 총 음성 시간 | `formatMinutes(totalVoiceMinutes)` |
| 마지막 접속일 | `lastVoiceDate` (YYYY-MM-DD) |

빈 데이터: "고립 멤버가 없습니다" 메시지.

### Step 8: PairsTable (F-011)

**가장 복잡한 컴포넌트**. 자체 state로 검색/정렬/페이지네이션을 관리한다.

#### 컴포넌트 State

```typescript
const [search, setSearch] = useState('');
const [page, setPage] = useState(1);
const [sortBy, setSortBy] = useState<'totalMinutes' | 'sessionCount' | 'lastDate'>('totalMinutes');
const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');
const [data, setData] = useState<PairsResponse | null>(null);
const [tableLoading, setTableLoading] = useState(false);
const [selectedPair, setSelectedPair] = useState<{ userA: string; userB: string } | null>(null);
```

#### Props

```typescript
interface PairsTableProps {
  guildId: string;
  days: Days;
}
```

#### 데이터 로딩

`days`, `search`, `page`, `sortBy`, `sortOrder` 변경 시 `fetchPairs` 호출. `search` 입력에는 debounce(300ms) 적용.

#### 테이블 컬럼

| 컬럼 헤더 | 정렬 가능 | 값 |
|-----------|----------|-----|
| 유저A | X | `userA.userName` |
| 유저B | X | `userB.userName` |
| 총 동시접속 시간 | O (기본 내림차순) | `formatMinutes(totalMinutes)` |
| 세션 수 | O | `sessionCount` |
| 마지막 함께한 날짜 | O | `lastDate` |

#### 행 클릭 → PairDetailModal

행 클릭 시 `setSelectedPair({ userA: item.userA.userId, userB: item.userB.userId })` → 모달 열림.

#### 페이지네이션

기존 `inactive-member` 패턴과 동일한 오프셋 기반 페이지네이션. "이전 / 페이지 번호 / 다음" 버튼.

### Step 9: DailyTrendChart (F-012)

기존 `voice/components/DailyTrendChart.tsx`와 거의 동일한 구조. Recharts `AreaChart` 사용.

**Props**: `data: DailyTrendPoint[]`

```tsx
<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" tickFormatter={formatShortDate} />
    <YAxis tickFormatter={(v) => `${v}분`} />
    <Tooltip formatter={(v) => formatMinutes(v as number)} />
    <Area
      type="monotone"
      dataKey="totalMinutes"
      stroke="#6366F1"
      fill="#6366F1"
      fillOpacity={0.1}
    />
  </AreaChart>
</ResponsiveContainer>
```

### Step 10: PairDetailModal (F-013)

**트리거**: `PairsTable`에서 행 클릭 시 열림.

#### Props

```typescript
interface PairDetailModalProps {
  guildId: string;
  days: Days;
  userA: string;
  userB: string;
  isOpen: boolean;
  onClose: () => void;
}
```

#### 데이터 로딩

`isOpen`이 `true`로 전환될 때 `fetchPairDetail(guildId, userA, userB, days)` 호출.

#### 모달 구현

HTML `<dialog>` 또는 수동 오버레이로 구현. 기존 코드베이스에 모달 컴포넌트가 없으므로, shadcn Dialog를 설치하거나 간단한 오버레이를 직접 구현한다.

> **결정 필요**: shadcn Dialog를 새로 추가할지, 수동 오버레이로 구현할지는 구현 시점에 판단한다. 기존 코드베이스에 Dialog 컴포넌트가 없으므로, 처음이라면 shadcn Dialog 설치를 권장한다.

#### 차트: Recharts `BarChart`

```tsx
<ResponsiveContainer width="100%" height={250}>
  <BarChart data={detail.dailyData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" tickFormatter={formatShortDate} />
    <YAxis tickFormatter={(v) => `${v}분`} />
    <Tooltip formatter={(v) => formatMinutes(v as number)} />
    <Bar dataKey="minutes" fill="#6366F1" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

#### 모달 헤더

```
UserA 닉네임 ↔ UserB 닉네임
총 X시간 Y분 (기간 내)
```

## 기존 코드와의 충돌 분석

| 항목 | 충돌 여부 | 설명 |
|------|----------|------|
| DashboardSidebar 메뉴 | **없음** | `menuItems` 배열에 추가만 하면 됨 |
| 라우트 `/co-presence` | **없음** | 신규 디렉터리, 기존 라우트와 겹치지 않음 |
| Recharts 사용 | **없음** | 기존 `recharts@3.8.0` 의존성 그대로 사용 |
| sigma.js 추가 | **확인 필요** | React 19 호환성. `@react-sigma/core` 최신 버전이 React 19를 지원하는지 설치 시 확인 필요. peer dependency 경고 발생 시 `--legacy-peer-deps` 또는 pnpm override 설정 검토 |
| `formatMinutes` 중복 | **없음** | `inactive-member-api.ts`와 동일한 함수가 `co-presence-api.ts`에도 존재하게 됨. 현재 패턴상 의도적 로컬 정의 |
| shadcn Card/Select 등 UI | **없음** | 기존 컴포넌트 재사용 |

## 테스트 체크리스트

- [ ] DashboardSidebar에 "관계 분석" 메뉴가 표시되고 클릭 시 `/co-presence` 라우트로 이동하는지
- [ ] 기간 선택 버튼(7/30/90일) 클릭 시 모든 데이터가 재로딩되는지
- [ ] 요약 카드 4종이 올바른 값으로 표시되는지
- [ ] 네트워크 그래프가 SSR 없이 클라이언트에서 정상 렌더링되는지
- [ ] 그래프 노드 호버 시 레이블(닉네임)이 표시되는지
- [ ] 그래프 노드 클릭 시 연결 노드/엣지만 하이라이트되는지
- [ ] 최소 임계값 슬라이더 변경 시 그래프가 재로딩되는지
- [ ] 친밀도 TOP N 패널에 아바타 + 닉네임 + 시간이 표시되는지
- [ ] 고립 멤버 목록이 정상 표시되는지 (데이터 없을 때 빈 상태 메시지)
- [ ] 관계 테이블 검색 시 debounce 후 필터링이 동작하는지
- [ ] 관계 테이블 컬럼 헤더 클릭 시 정렬이 토글되는지
- [ ] 관계 테이블 페이지네이션이 정상 동작하는지
- [ ] 관계 테이블 행 클릭 시 PairDetailModal이 열리는지
- [ ] PairDetailModal에 BarChart와 헤더 정보가 올바르게 표시되는지
- [ ] API 에러 발생 시 에러 상태가 사용자에게 표시되는지
- [ ] 데이터 로딩 중 로딩 상태가 표시되는지

## 구현 순서 (권장)

1. **Step 1**: `co-presence-api.ts` — 타입 + API 함수 (다른 모든 컴포넌트의 의존성)
2. **Step 2**: DashboardSidebar 메뉴 추가 — 1줄 변경, 즉시 확인 가능
3. **Step 3**: `page.tsx` — 빈 레이아웃 + 기간 선택 + 데이터 로딩 훅
4. **Step 4**: `CoPresenceSummaryCards` — 가장 단순, 패턴 확인용
5. **Step 9**: `DailyTrendChart` — 기존 Recharts 패턴 복제
6. **Step 6**: `TopPairsPanel` — 단순 리스트
7. **Step 7**: `IsolatedMemberList` — 단순 테이블
8. **Step 8**: `PairsTable` — 복잡도 높음 (검색/정렬/페이지네이션)
9. **Step 10**: `PairDetailModal` — PairsTable 완성 후 연동
10. **Step 5**: `CoPresenceGraph` — 가장 복잡, 별도 라이브러리 의존

> Step 5(CoPresenceGraph)를 마지막에 배치하는 이유: sigma.js 의존성 설치 + SSR 비활성화 + 클러스터링 알고리즘 등 기술적 불확실성이 가장 높다. 나머지 컴포넌트를 먼저 완성하여 페이지 전체 구조를 확정한 뒤 그래프를 추가하는 것이 리스크를 줄인다.
