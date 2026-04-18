# 서버 개요 페이지 (Frontend) 구현 계획

> PRD: [web.md](../specs/prd/web.md) F-WEB-008
> 참조 패턴: `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx`, `apps/web/app/lib/voice-dashboard-api.ts`

## 목표

대시보드 진입 시 첫 화면으로, 서버 전체 상태를 한눈에 파악할 수 있는 개요 대시보드 페이지를 구현한다. 기존 voice/inactive-member 대시보드와 동일한 레이아웃 패턴(shadcn Card, Recharts BarChart, Tailwind)을 따른다.

## 선행 조건

- **백엔드 API 구현 필요**: `GET /api/guilds/{guildId}/overview` 엔드포인트가 아직 존재하지 않는다. 백엔드 모듈(`apps/api/src/overview/`)을 먼저 구현하거나 프론트엔드와 병렬로 진행해야 한다.

## 의존성 추가

없음. 기존 `recharts@3.8.0`, `lucide-react`, shadcn UI 컴포넌트를 그대로 사용한다.

## 변경 파일 목록

### 신규 생성

| 파일 | 역할 | PRD 기능 |
|------|------|----------|
| `apps/web/app/lib/overview-api.ts` | API 클라이언트 + 타입 정의 | F-WEB-008 전체 |
| `apps/web/app/dashboard/guild/[guildId]/overview/page.tsx` | 메인 페이지 | F-WEB-008 |
| `.../overview/components/OverviewSummaryCards.tsx` | 요약 카드 4종 | 요약 카드 섹션 |
| `.../overview/components/MissionSummaryCard.tsx` | 신입 미션 현황 카드 | 신입 미션 현황 섹션 |
| `.../overview/components/WeeklyVoiceChart.tsx` | 최근 7일 음성 활동 바 차트 | 미니 차트 섹션 |
| `.../overview/components/InactiveSummaryCard.tsx` | 비활동 회원 등급별 요약 | 비활동 요약 섹션 |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/web/app/components/DashboardSidebar.tsx` | `menuItems` 배열 맨 앞에 "서버 개요" 항목 추가 |

## 구현 단계

### Step 1: API 클라이언트 (`overview-api.ts`)

기존 `inactive-member-api.ts`, `voice-dashboard-api.ts` 패턴을 따른다. 타입 정의 + fetch 함수 + 유틸리티 함수를 한 파일에 배치한다.

#### 타입 정의

```typescript
// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** 요약 카드 4종 데이터 */
export interface OverviewSummary {
  totalMembers: number;
  todayVoiceDurationSec: number;
  currentVoiceUsers: number;
  activeRate: number;       // 0~100 (%)
  inactiveRate: number;     // 0~100 (%)
}

/** 신입 미션 현황 */
export interface MissionSummary {
  inProgressCount: number;
  completedCount: number;
  failedCount: number;
}

/** 최근 7일 음성 활동 일별 데이터 */
export interface WeeklyVoicePoint {
  date: string;             // YYYY-MM-DD
  totalDurationSec: number;
}

/** 비활동 회원 등급별 인원 수 */
export interface InactiveGradeSummary {
  fullyInactiveCount: number;
  lowActiveCount: number;
  decliningCount: number;
}

/** 서버 개요 통합 응답 */
export interface OverviewData {
  summary: OverviewSummary;
  mission: MissionSummary | null;        // missionEnabled=false이면 null
  weeklyVoice: WeeklyVoicePoint[];
  inactiveGrades: InactiveGradeSummary;
}
```

#### API 함수

```typescript
/** 서버 개요 데이터 조회 */
export async function fetchOverview(guildId: string): Promise<OverviewData> {
  const res = await fetch(`/api/guilds/${guildId}/overview`);
  if (!res.ok) {
    throw new Error('서버 개요 데이터를 불러오는데 실패했습니다.');
  }
  return res.json() as Promise<OverviewData>;
}
```

에러 처리 패턴: `inactive-member-api.ts`와 동일하게 `res.ok` 체크 후 `throw new Error()`를 사용한다.

#### 유틸리티 함수

```typescript
/** 초 → "H시간 M분" 형식 */
export function formatDurationSec(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

/** 'YYYY-MM-DD' → 'MM/DD' 형식 (차트 X축용) */
export function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  return `${parts[1]}/${parts[2]}`;
}
```

> `formatDurationSec`는 `voice-dashboard-api.ts`의 `formatDuration`과 동일한 로직이다. 현재 코드베이스 패턴상 각 API 파일에 로컬 정의한다.

### Step 2: DashboardSidebar 메뉴 추가

`apps/web/app/components/DashboardSidebar.tsx`의 `menuItems` 배열 맨 앞에 "서버 개요" 항목을 추가한다.

```typescript
import { Activity, ArrowLeftRight, GitFork, LayoutDashboard, Mic, Search, Settings, UserX } from "lucide-react";

const menuItems = [
  {
    href: `/dashboard/guild/${selectedGuildId}/overview`,
    label: "서버 개요",
    icon: LayoutDashboard,
  },
  // ... 기존 항목 유지
];
```

아이콘: `LayoutDashboard` (lucide-react) -- 대시보드 개요의 의미를 직관적으로 표현. 기존 메뉴와 중복 없음.

**메뉴 순서** (PRD 사이드바 구성 준수):
서버 개요 -> 음성 활동 -> 유저 검색 -> 비활동 회원 -> 관계 분석 -> 모니터링

> 현재 사이드바에 PRD 명세의 "신입 관리" 메뉴가 아직 없다. F-WEB-009 구현 시 추가 예정이므로, 이번 작업에서는 "서버 개요"만 추가한다.

### Step 3: 메인 페이지 (`page.tsx`)

기존 `voice/page.tsx` 패턴을 따른다. 기간 선택 없이 고정 데이터(오늘 + 최근 7일)를 표시한다.

#### 데이터 로딩 전략

단일 API(`GET /api/guilds/{guildId}/overview`)를 호출하여 모든 섹션 데이터를 한 번에 받는다. voice 대시보드처럼 클라이언트 집계가 필요 없다.

```typescript
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchOverview, type OverviewData } from "@/app/lib/overview-api";

import InactiveSummaryCard from "./components/InactiveSummaryCard";
import MissionSummaryCard from "./components/MissionSummaryCard";
import OverviewSummaryCards from "./components/OverviewSummaryCards";
import WeeklyVoiceChart from "./components/WeeklyVoiceChart";

export default function OverviewPage() {
  const params = useParams();
  const guildId = params.guildId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchOverview(guildId);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '데이터를 불러오는데 실패했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [guildId]);

  // 로딩/에러/데이터 렌더링
}
```

#### 레이아웃 구성

```
+-----------------------------------------------------+
|  헤더: "서버 개요"                                     |
+-----------------------------------------------------+
|  OverviewSummaryCards (4개 카드, 가로 배치)              |
+-----------------------------------------------------+
|  MissionSummaryCard (missionEnabled=true일 때만)       |
+-------------------------------+---------------------+
|  WeeklyVoiceChart (2/3)       | InactiveSummaryCard  |
|                               | (1/3)               |
+-------------------------------+---------------------+
```

### Step 4: OverviewSummaryCards

기존 `voice/components/SummaryCards.tsx` 및 `inactive-member/components/StatsCards.tsx` 패턴과 동일하게 shadcn `Card` 4개를 가로 배치한다.

#### Props

```typescript
interface Props {
  summary: OverviewSummary;
}
```

#### 카드 정의

| 카드 | 값 | 아이콘 (lucide) | 색상 |
|------|-----|-----------------|------|
| 총 멤버 수 | `${totalMembers}명` | `Users` | 기본 |
| 오늘 음성 활동 | `formatDurationSec(todayVoiceDurationSec)` | `Clock` | 기본 |
| 현재 음성 접속자 | `${currentVoiceUsers}명` | `Headphones` | 기본 |
| 활성/비활성 비율 | `${activeRate}% / ${inactiveRate}%` | `PieChart` | 활성=green, 비활성=red |

```tsx
<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
  {cards.map((card) => (
    <Card key={card.title}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {card.title}
        </CardTitle>
        <card.icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{card.value}</div>
      </CardContent>
    </Card>
  ))}
</div>
```

### Step 5: MissionSummaryCard

신입 미션 현황을 표시하는 단일 카드. `mission` 데이터가 `null`이면(missionEnabled=false) 렌더링하지 않는다.

#### Props

```typescript
interface Props {
  mission: MissionSummary;
}
```

#### 구현

```tsx
export default function MissionSummaryCard({ mission }: Props) {
  const items = [
    { label: "진행 중", count: mission.inProgressCount, color: "text-blue-600", bg: "bg-blue-100" },
    { label: "완료", count: mission.completedCount, color: "text-green-600", bg: "bg-green-100" },
    { label: "실패", count: mission.failedCount, color: "text-red-600", bg: "bg-red-100" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          신입 미션 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${item.bg} ${item.color}`}>
                {item.label}
              </span>
              <span className="text-lg font-bold">{item.count}명</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

부모(`page.tsx`)에서의 조건부 렌더링:

```tsx
{data.mission && <MissionSummaryCard mission={data.mission} />}
```

### Step 6: WeeklyVoiceChart

최근 7일 음성 활동 바 차트. 기존 `voice/components/DailyTrendChart.tsx` 패턴을 따르되, 간략한 바 차트로 구현한다.

#### Props

```typescript
interface Props {
  data: WeeklyVoicePoint[];
}
```

#### 차트 구현

Recharts `BarChart` + shadcn `ChartContainer` 패턴을 사용한다.

```tsx
const chartConfig = {
  durationMin: {
    label: "음성 시간(분)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export default function WeeklyVoiceChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: formatShortDate(d.date),
    durationMin: Math.round(d.totalDurationSec / 60),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>최근 7일 음성 활동</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="durationMin"
              fill="var(--color-durationMin)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

### Step 7: InactiveSummaryCard

비활동 회원 등급별 인원 수를 간략 바 형태로 표시한다. `inactive-member/components/StatsCards.tsx`의 색상 체계를 재사용한다.

#### Props

```typescript
interface Props {
  grades: InactiveGradeSummary;
}
```

#### 구현

3개 등급을 가로 Progress Bar 형태로 표시한다.

```tsx
export default function InactiveSummaryCard({ grades }: Props) {
  const total = grades.fullyInactiveCount + grades.lowActiveCount + grades.decliningCount;

  const items = [
    { label: "완전 비활동", count: grades.fullyInactiveCount, color: "bg-red-500" },
    { label: "저활동", count: grades.lowActiveCount, color: "bg-orange-500" },
    { label: "활동 감소", count: grades.decliningCount, color: "bg-yellow-500" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="h-5 w-5" />
          비활동 회원 요약
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">{item.count}명</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className={`h-2 rounded-full ${item.color}`}
                style={{ width: total > 0 ? `${(item.count / total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
        <div className="pt-2 border-t text-sm text-muted-foreground">
          총 {total}명
        </div>
      </CardContent>
    </Card>
  );
}
```

## 백엔드 API 설계 가이드 (참고용)

프론트엔드가 기대하는 `GET /api/guilds/{guildId}/overview` 응답 형태:

```json
{
  "summary": {
    "totalMembers": 150,
    "todayVoiceDurationSec": 36000,
    "currentVoiceUsers": 5,
    "activeRate": 72.5,
    "inactiveRate": 27.5
  },
  "mission": {
    "inProgressCount": 3,
    "completedCount": 12,
    "failedCount": 2
  },
  "weeklyVoice": [
    { "date": "2026-03-09", "totalDurationSec": 28800 },
    { "date": "2026-03-10", "totalDurationSec": 32400 },
    ...
  ],
  "inactiveGrades": {
    "fullyInactiveCount": 15,
    "lowActiveCount": 10,
    "decliningCount": 8
  }
}
```

`mission` 필드는 `NewbieConfig.missionEnabled = false`이면 `null`을 반환한다.

### 데이터 소스 매핑

| 응답 필드 | 데이터 소스 |
|-----------|------------|
| `totalMembers` | Discord API (`guild.memberCount`) 또는 Member 테이블 카운트 |
| `todayVoiceDurationSec` | `VoiceDailyEntity` WHERE `date = TODAY` AND `channelId != 'GLOBAL'`, SUM(`channelDurationSec`) |
| `currentVoiceUsers` | `BotMetric` 최신 레코드의 `voiceUserCount` 또는 Discord API 실시간 조회 |
| `activeRate` / `inactiveRate` | `InactiveMemberRecord` 기반 계산: active = totalMembers - 비활동 합계 |
| `mission.*` | `NewbieMission` 테이블 GROUP BY status COUNT |
| `weeklyVoice` | `VoiceDailyEntity` WHERE `date >= 7일 전` AND `channelId != 'GLOBAL'`, GROUP BY date SUM |
| `inactiveGrades.*` | `InactiveMemberRecord` GROUP BY grade COUNT |

## 기존 코드와의 충돌 분석

| 항목 | 충돌 여부 | 설명 |
|------|----------|------|
| DashboardSidebar 메뉴 | **없음** | `menuItems` 배열 맨 앞에 추가. 기존 항목 순서 변경 없음 |
| 라우트 `/overview` | **없음** | 신규 디렉토리, 기존 라우트와 겹치지 않음 |
| Recharts 사용 | **없음** | 기존 `recharts@3.8.0` 의존성 그대로 사용 |
| shadcn Card/ChartContainer 등 UI | **없음** | 기존 컴포넌트 재사용 |
| `formatDurationSec` 중복 | **없음** | `voice-dashboard-api.ts`의 `formatDuration`과 동일한 로직. 현재 패턴상 의도적 로컬 정의 |
| 레이아웃 (`layout.tsx`) | **없음** | 기존 `dashboard/guild/[guildId]/layout.tsx`가 인증 가드 + DashboardSidebar를 제공. overview 페이지는 이 레이아웃 하위에 자동 배치됨 |

## 테스트 체크리스트

- [ ] DashboardSidebar에 "서버 개요" 메뉴가 첫 번째 항목으로 표시되는지
- [ ] 메뉴 클릭 시 `/dashboard/guild/{guildId}/overview` 라우트로 이동하는지
- [ ] 활성 메뉴 하이라이트(`isActive`)가 정상 동작하는지
- [ ] 페이지 로딩 중 로딩 상태 UI가 표시되는지
- [ ] API 에러 발생 시 에러 메시지가 사용자에게 표시되는지
- [ ] 요약 카드 4종이 올바른 값과 포맷으로 표시되는지
- [ ] 오늘 음성 활동 시간이 "H시간 M분" 형식으로 표시되는지
- [ ] `missionEnabled=true`일 때 신입 미션 현황 카드가 표시되는지
- [ ] `missionEnabled=false`일 때(mission=null) 신입 미션 현황 카드가 렌더링되지 않는지
- [ ] 최근 7일 바 차트가 정상 렌더링되고 X축에 MM/DD 형식 날짜가 표시되는지
- [ ] 비활동 회원 등급별 인원 수와 Progress Bar 비율이 올바른지
- [ ] 비활동 합계가 0일 때 Progress Bar가 에러 없이 렌더링되는지

## 구현 순서 (권장)

1. **Step 1**: `overview-api.ts` -- 타입 + API 함수 (모든 컴포넌트의 의존성)
2. **Step 2**: DashboardSidebar 메뉴 추가 -- 1줄 변경, 즉시 확인 가능
3. **Step 3**: `page.tsx` -- 레이아웃 + 데이터 로딩 훅 + 로딩/에러 상태
4. **Step 4**: `OverviewSummaryCards` -- 가장 단순, 기존 패턴 복제
5. **Step 5**: `MissionSummaryCard` -- 조건부 렌더링 포함
6. **Step 6**: `WeeklyVoiceChart` -- Recharts BarChart, 기존 패턴 활용
7. **Step 7**: `InactiveSummaryCard` -- Progress Bar 커스텀 UI

> 백엔드 API가 아직 없으므로, Step 1~3에서 mock 데이터로 UI를 먼저 개발하고 백엔드 완성 후 연동하는 전략도 가능하다.
