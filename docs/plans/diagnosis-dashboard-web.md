# 서버 진단 대시보드 + 주간 리포트 설정 (F-WEB-016, F-WEB-017) 구현 계획

> PRD: [web.md](../specs/prd/web.md) F-WEB-016, F-WEB-017
> 공통 모듈 설계: [common-modules.md](../specs/common-modules.md)
> 날짜: 2026-03-21

## 목표

서버 진단 대시보드(건강도 스코어, 활동 트렌드, 유저 리더보드, 채널 분석, AI 인사이트)와 주간 리포트 설정 페이지를 웹 프론트엔드에 구현한다.

## 선행 조건

- **공유 타입 완료**: `libs/shared/src/types/diagnosis.ts`, `libs/shared/src/types/weekly-report.ts`가 gemini 도메인에서 생성되어 있어야 한다. 공유 타입 미완성 시 API 클라이언트 파일 내에 로컬 타입을 임시 정의하고, 공유 타입 완성 후 import로 교체한다.
- **API 프록시 변경 불필요**: 기존 `apps/web/app/api/guilds/[...path]/route.ts`가 와일드카드 매칭으로 모든 guild 하위 경로를 프록시하므로 추가 수정 없음.
- **사이드바 그룹 구조 완료**: 현재 `refactor/sidebar-menu-grouping` 브랜치에서 그룹 기반 메뉴 재구성이 완료된 상태. 이 브랜치가 develop에 머지된 후 작업 브랜치를 분기한다.

## 호출 API 정리

| 메서드 | 경로 | 설명 | 응답 타입 |
|--------|------|------|-----------|
| `GET` | `/api/guilds/{guildId}/voice-analytics/summary?days=N` | 일별 트렌드 | `DiagnosisSummaryResponse` |
| `GET` | `/api/guilds/{guildId}/voice-analytics/health-score?days=N` | 건강도 + AI 진단 | `HealthScoreResponse` |
| `GET` | `/api/guilds/{guildId}/voice-analytics/leaderboard?days=N&page=P&limit=L` | 유저 리더보드 | `LeaderboardResponse` |
| `GET` | `/api/guilds/{guildId}/voice-analytics/channel-stats?days=N` | 채널별 통계 | `ChannelStatsResponse` |
| `POST` | `/api/guilds/{guildId}/voice-analytics/ai-insight?days=N` | AI 인사이트 재생성 | `AiInsightResponse` |
| `GET` | `/api/guilds/{guildId}/weekly-report/config` | 주간 리포트 설정 조회 | `WeeklyReportConfigDto` |
| `POST` | `/api/guilds/{guildId}/weekly-report/config` | 주간 리포트 설정 저장 | `WeeklyReportConfigDto` |

---

## 변경 파일 목록

### Step 1: 공유 타입 (gemini 도메인 담당 -- 선행 완료 확인만)

| 파일 | 변경 | 비고 |
|------|------|------|
| `libs/shared/src/types/diagnosis.ts` | 확인 | gemini 도메인에서 생성 |
| `libs/shared/src/types/weekly-report.ts` | 확인 | gemini 도메인에서 생성 |
| `libs/shared/src/types/index.ts` | 확인 | re-export 추가 |

### Step 2: API 클라이언트

| 파일 | 변경 |
|------|------|
| `apps/web/app/lib/diagnosis-api.ts` | **신규**. 진단 대시보드 API 5종 클라이언트 |
| `apps/web/app/lib/weekly-report-api.ts` | **신규**. 주간 리포트 설정 API 2종 클라이언트 |

### Step 3: 서버 진단 대시보드 페이지 + 컴포넌트

| 파일 | 변경 |
|------|------|
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/page.tsx` | **신규**. 서버 진단 메인 페이지 |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/components/HealthScoreGauge.tsx` | **신규**. 건강도 원형 게이지 |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/components/ActivityTrendChart.tsx` | **신규**. 활동 트렌드 차트 |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/components/LeaderboardTable.tsx` | **신규**. 유저 리더보드 테이블 |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/components/ChannelAnalysisChart.tsx` | **신규**. 채널 분석 차트 |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/components/AiInsightPanel.tsx` | **신규**. AI 인사이트 패널 |

### Step 4: 주간 리포트 설정 페이지

| 파일 | 변경 |
|------|------|
| `apps/web/app/settings/guild/[guildId]/diagnosis/page.tsx` | **신규**. 주간 리포트 설정 페이지 |

### Step 5: 사이드바 메뉴 추가

| 파일 | 변경 |
|------|------|
| `apps/web/app/components/DashboardSidebar.tsx` | **수정**. "분석" 그룹 추가 + "서버 진단" 항목 |
| `apps/web/app/components/SettingsSidebar.tsx` | **수정**. "분석" 그룹 추가 + "서버 진단" 항목 |

### Step 6: i18n 키 추가

| 파일 | 변경 |
|------|------|
| `libs/i18n/locales/ko/web/common.json` | **수정**. 사이드바 그룹/메뉴 라벨 추가 |
| `libs/i18n/locales/en/web/common.json` | **수정**. 사이드바 그룹/메뉴 라벨 영문 추가 |
| `libs/i18n/locales/ko/web/dashboard.json` | **수정**. 진단 대시보드 텍스트 키 추가 |
| `libs/i18n/locales/en/web/dashboard.json` | **수정**. 진단 대시보드 텍스트 영문 키 추가 |
| `libs/i18n/locales/ko/web/settings.json` | **수정**. 주간 리포트 설정 텍스트 키 추가 |
| `libs/i18n/locales/en/web/settings.json` | **수정**. 주간 리포트 설정 텍스트 영문 키 추가 |

---

## 구현 단계

### Step 2: API 클라이언트

#### 2-1. `diagnosis-api.ts`

기존 `voice-dashboard-api.ts`, `newbie-dashboard-api.ts` 패턴을 따른다. 타입은 `@nexus/shared`에서 import하고, API 호출은 `apiClient`/`apiGet`을 사용한다.

```typescript
// apps/web/app/lib/diagnosis-api.ts

import type {
  AiInsightResponse,
  ChannelStatsResponse,
  DiagnosisSummaryResponse,
  HealthScoreResponse,
  LeaderboardResponse,
} from '@nexus/shared';

import { apiClient, apiGet } from './api-client';

/** 일별 활동 트렌드 요약 조회 */
export async function fetchDiagnosisSummary(
  guildId: string,
  days: number,
): Promise<DiagnosisSummaryResponse> {
  return apiGet<DiagnosisSummaryResponse>(
    `/api/guilds/${guildId}/voice-analytics/summary?days=${days}`,
    { daily: [] },
  );
}

/** 서버 건강도 스코어 + AI 진단 조회 */
export async function fetchHealthScore(
  guildId: string,
  days: number,
): Promise<HealthScoreResponse> {
  return apiGet<HealthScoreResponse>(
    `/api/guilds/${guildId}/voice-analytics/health-score?days=${days}`,
    { score: 0, prevScore: 0, delta: 0, diagnosis: '' },
  );
}

/** 유저 리더보드 조회 */
export async function fetchLeaderboard(
  guildId: string,
  days: number,
  page: number,
  limit: number,
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({
    days: String(days),
    page: String(page),
    limit: String(limit),
  });
  return apiGet<LeaderboardResponse>(
    `/api/guilds/${guildId}/voice-analytics/leaderboard?${params}`,
    { users: [], total: 0 },
  );
}

/** 채널별 통계 조회 */
export async function fetchChannelStats(
  guildId: string,
  days: number,
): Promise<ChannelStatsResponse> {
  return apiGet<ChannelStatsResponse>(
    `/api/guilds/${guildId}/voice-analytics/channel-stats?days=${days}`,
    { channels: [] },
  );
}

/** AI 인사이트 수동 재생성 (POST) */
export async function generateAiInsight(
  guildId: string,
  days: number,
): Promise<AiInsightResponse> {
  return apiClient<AiInsightResponse>(
    `/api/guilds/${guildId}/voice-analytics/ai-insight?days=${days}`,
    { method: 'POST' },
  );
}
```

#### 2-2. `weekly-report-api.ts`

```typescript
// apps/web/app/lib/weekly-report-api.ts

import type { WeeklyReportConfigDto } from '@nexus/shared';

import { apiClient, apiGet } from './api-client';

/** 주간 리포트 설정 조회 */
export async function fetchWeeklyReportConfig(
  guildId: string,
): Promise<WeeklyReportConfigDto> {
  return apiGet<WeeklyReportConfigDto>(
    `/api/guilds/${guildId}/weekly-report/config`,
    {
      isEnabled: false,
      channelId: null,
      dayOfWeek: 1,
      hour: 9,
      timezone: 'Asia/Seoul',
    },
  );
}

/** 주간 리포트 설정 저장 (upsert) */
export async function saveWeeklyReportConfig(
  guildId: string,
  config: WeeklyReportConfigDto,
): Promise<WeeklyReportConfigDto> {
  return apiClient<WeeklyReportConfigDto>(
    `/api/guilds/${guildId}/weekly-report/config`,
    { method: 'POST', body: config },
  );
}
```

---

### Step 3: 서버 진단 대시보드 페이지

#### 3-0. 페이지 구조 (`page.tsx`)

기존 `voice/page.tsx` 패턴을 따른다.

- `'use client'` 클라이언트 컴포넌트
- `useParams`로 `guildId` 추출
- `useState`로 기간(`days`), 로딩, 에러, 각 섹션 데이터 관리
- `useEffect`로 기간 변경 시 섹션 1~4 데이터 병렬 조회 (`Promise.all`)
- 기간 선택 UI: `Select` 컴포넌트 (7일 / 14일 / 30일(기본) / 90일)
- 레이아웃: 상단 헤더+기간선택 -> 건강도 카드 -> 트렌드 차트 -> 리더보드+채널분석 그리드 -> AI 인사이트

```
type DayPreset = 7 | 14 | 30 | 90;
```

데이터 로드 흐름:
1. 마운트 시 기본 30일로 `fetchDiagnosisSummary`, `fetchHealthScore`, `fetchLeaderboard(page=1, limit=10)`, `fetchChannelStats` 병렬 호출
2. AI 인사이트는 별도로 `generateAiInsight` 호출 (캐시 있으면 즉시, 없으면 LLM 호출)
3. 기간 변경 시 모든 데이터 재조회 (AI 인사이트 포함)

#### 3-1. `HealthScoreGauge.tsx` -- 건강도 원형 게이지

Props:
```typescript
interface HealthScoreGaugeProps {
  score: number;        // 0~100
  prevScore: number;    // 이전 기간 점수
  delta: number;        // 변화량
  diagnosis: string;    // AI 진단 텍스트
  isLoading: boolean;
}
```

구현 방식:
- SVG 원형(도넛) 게이지: `stroke-dasharray` + `stroke-dashoffset`으로 비율 표현
- 점수 구간별 색상: 0~39 빨강(`#EF4444`), 40~69 노랑(`#EAB308`), 70~100 초록(`#22C55E`)
- 중앙에 숫자 점수 표시
- 하단에 delta 표시: 양수면 초록 위 화살표, 음수면 빨강 아래 화살표
- AI 진단 텍스트는 게이지 옆 또는 하단에 배치
- `isLoading` 시 스켈레톤 표시
- 외부 차트 라이브러리 불필요 (순수 SVG)

#### 3-2. `ActivityTrendChart.tsx` -- 활동 트렌드 차트

Props:
```typescript
interface ActivityTrendChartProps {
  data: DailyTrendItem[];  // { date, totalSec, activeUsers }[]
}
```

구현 방식:
- Recharts `ComposedChart` 사용 (라인 + 바 오버레이)
- 좌측 Y축: 총 음성시간 (시간 단위, `totalSec / 3600`)
- 우측 Y축: 활성유저 수 (`activeUsers`)
- X축: 날짜 (`date` -> MM/DD 형식)
- 라인: 음성시간, 바: 활성유저 수
- 툴팁: 날짜, 음성시간(시:분), 활성유저 수
- `Card` + `CardHeader` + `CardContent` 래퍼 (기존 `DailyTrendChart.tsx` 패턴)
- `ChartContainer`, `ChartTooltip`, `ChartLegend` 등 shadcn/ui 차트 유틸 사용

#### 3-3. `LeaderboardTable.tsx` -- 유저 리더보드

Props:
```typescript
interface LeaderboardTableProps {
  users: LeaderboardUser[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onUserClick: (userId: string) => void;
  isLoading: boolean;
}
```

구현 방식:
- `Card` 래퍼 안에 HTML `<table>` 또는 div 기반 테이블
- 컬럼: 순위(rank), 아바타(avatarUrl), 닉네임(nickName), 총 음성시간(totalSec -> 시:분), 마이크ON(micOnSec -> 시:분), 활동일수(activeDays)
- 행 클릭 시 `onUserClick(userId)` -> `router.push(/dashboard/guild/{guildId}/voice?userId={userId})`
- 10명 단위 페이지네이션: 이전/다음 버튼, "페이지 N / M" 표시
- `isLoading` 시 테이블 내 스켈레톤 또는 스피너

#### 3-4. `ChannelAnalysisChart.tsx` -- 채널 분석

Props:
```typescript
interface ChannelAnalysisChartProps {
  channels: ChannelStatItem[];
}
```

구현 방식:
- 탭 전환: [채널별 | 카테고리별] (`useState`로 탭 상태 관리)
- 채널별 탭: `ChannelStatItem[]` 그대로 가로 바 차트 (Recharts `BarChart` layout="vertical")
- 카테고리별 탭: `ChannelStatItem[]`을 `categoryName`(null -> "미분류") 기준으로 클라이언트 집계 후 바 차트
- 각 바 끝에 고유 사용자 수(`uniqueUsers`) 라벨 표시
- 시간 내림차순 정렬 (API에서 정렬되어 올 수 있으나, 프론트에서도 보장)
- `Card` + `CardHeader`(탭 버튼 포함) + `CardContent` 래퍼

#### 3-5. `AiInsightPanel.tsx` -- AI 인사이트

Props:
```typescript
interface AiInsightPanelProps {
  insights: string | null;
  suggestions: string[];
  generatedAt: string | null;
  isLoading: boolean;
  isCooldown: boolean;
  cooldownRemainSec: number;
  onRefresh: () => void;
}
```

구현 방식:
- `Card` 래퍼
- 주간 특이사항 분석 텍스트 (`insights`) 마크다운 또는 plain text 렌더링
- 개선 제안 목록 (`suggestions`) 불릿 리스트
- "분석 새로고침" 버튼: 클릭 시 `onRefresh` 호출
  - 쿨다운 10분: 버튼 비활성화 + 남은 시간 표시 (프론트에서 `generatedAt` 기반 계산)
  - 쿨다운 계산: `generatedAt`와 현재 시각 차이가 10분 미만이면 쿨다운 상태
- 마지막 분석 시각: `generatedAt`를 "N분 전" 형태로 표시
- `isLoading` 시 스피너/스켈레톤
- 쿨다운 타이머: `useEffect` + `setInterval`로 남은 초 갱신

---

### Step 4: 주간 리포트 설정 페이지

기존 `newbie/page.tsx` 설정 페이지 패턴을 따른다.

- `useSettings()`로 `selectedGuildId` 추출
- 페이지 마운트 시 `fetchWeeklyReportConfig` + `fetchGuildTextChannels` 병렬 호출
- 폼 상태: `WeeklyReportConfigDto` 기반 (`useState`)
- 기본값: `{ isEnabled: false, channelId: null, dayOfWeek: 1, hour: 9, timezone: 'Asia/Seoul' }`

UI 구성:
1. **활성화 토글**: `isEnabled` ON/OFF. OFF 시 나머지 폼 dimmed 처리 (`opacity-50 pointer-events-none`)
2. **텍스트 채널 드롭다운**: `fetchGuildTextChannels`로 채널 목록 조회, `Select` 컴포넌트
3. **채널 새로고침 버튼**: `RefreshCw` 아이콘, `fetchGuildTextChannels(guildId, true)` 호출
4. **발송 요일 선택**: 월~일(0~6) 버튼 그룹, 단일 선택, 활성 버튼 하이라이트
5. **발송 시각 선택**: 0~23시 `Select` 드롭다운 (KST 기준)
6. **안내 문구**: 설명 텍스트
7. **저장 버튼**: `saveWeeklyReportConfig` 호출

저장 동작:
- 클라이언트 유효성 검사: `isEnabled === true && channelId === null` 시 에러 표시
- 성공 시 "저장되었습니다." 인라인 메시지 (3초 후 소멸)
- 실패 시 에러 메시지 표시

크로스링크:
- 페이지 상단에 "대시보드에서 보기" 링크 (`BarChart3` 아이콘 + `/dashboard/guild/{guildId}/diagnosis`)

---

### Step 5: 사이드바 메뉴 추가

#### 5-1. `DashboardSidebar.tsx`

`menuGroups` 배열에 "분석" 그룹을 추가한다. 기존 "회원 활동"과 "시스템" 그룹 사이에 배치한다.

```typescript
// "회원 활동" 그룹 뒤, "시스템" 그룹 앞에 추가
{
  label: t('sidebar.dashboardGroup.analytics'),
  items: [
    {
      href: `/dashboard/guild/${selectedGuildId}/diagnosis`,
      label: t('sidebar.diagnosis'),
      icon: BrainCircuit, // lucide-react에서 import
      settingsHref: `/settings/guild/${selectedGuildId}/diagnosis`,
    },
  ],
},
```

import 추가: `BrainCircuit` (lucide-react AI 관련 아이콘)

#### 5-2. `SettingsSidebar.tsx`

`menuGroups` 배열에 "분석" 그룹을 추가한다. 기존 "회원 관리" 그룹 뒤에 배치한다.

```typescript
// "회원 관리" 그룹 뒤에 추가
{
  label: t('sidebar.settingsGroup.analytics'),
  items: [
    {
      href: `/settings/guild/${selectedGuildId}/diagnosis`,
      label: t('settings.diagnosis'),
      icon: BrainCircuit,
    },
  ],
},
```

import 추가: `BrainCircuit`

---

### Step 6: i18n 키 추가

#### 6-1. `common.json` (ko/en)

```json
// ko
{
  "sidebar": {
    "diagnosis": "서버 진단",
    "dashboardGroup": {
      "analytics": "분석"
    },
    "settingsGroup": {
      "analytics": "분석"
    }
  },
  "settings": {
    "diagnosis": "서버 진단"
  }
}

// en
{
  "sidebar": {
    "diagnosis": "Server Diagnosis",
    "dashboardGroup": {
      "analytics": "Analytics"
    },
    "settingsGroup": {
      "analytics": "Analytics"
    }
  },
  "settings": {
    "diagnosis": "Server Diagnosis"
  }
}
```

#### 6-2. `dashboard.json` (ko/en)

진단 대시보드 전용 텍스트 키를 `diagnosis` 네임스페이스 아래 추가한다.

```json
// ko (추가할 키)
{
  "diagnosis": {
    "title": "서버 진단",
    "periodLabel": "기간",
    "period": {
      "7d": "7일",
      "14d": "14일",
      "30d": "30일",
      "90d": "90일"
    },
    "healthScore": {
      "title": "서버 건강도",
      "increase": "+{delta}",
      "decrease": "{delta}",
      "vsPrev": "이전 기간 대비"
    },
    "trend": {
      "title": "활동 트렌드",
      "voiceHours": "음성시간 (시간)",
      "activeUsers": "활성유저 수"
    },
    "leaderboard": {
      "title": "유저 리더보드",
      "rank": "순위",
      "nickname": "닉네임",
      "totalTime": "총 음성시간",
      "micOnTime": "마이크 ON",
      "activeDays": "활동일수",
      "page": "페이지 {current} / {total}",
      "prev": "이전",
      "next": "다음"
    },
    "channel": {
      "title": "채널 분석",
      "tabByChannel": "채널별",
      "tabByCategory": "카테고리별",
      "users": "{count}명",
      "uncategorized": "미분류"
    },
    "aiInsight": {
      "title": "AI 인사이트",
      "refresh": "분석 새로고침",
      "cooldown": "{minutes}분 {seconds}초 후 가능",
      "lastAnalyzed": "{minutes}분 전 분석",
      "suggestions": "개선 제안",
      "loading": "AI 분석 중..."
    }
  }
}
```

#### 6-3. `settings.json` (ko/en)

```json
// ko (추가할 키)
{
  "weeklyReport": {
    "title": "주간 리포트 설정",
    "enableToggle": "주간 자동 리포트",
    "enableDescription": "매주 지정 요일/시각에 선택한 채널로 서버 음성 활동 리포트가 자동 전송됩니다.",
    "channel": "전송 채널",
    "channelPlaceholder": "텍스트 채널을 선택하세요",
    "refreshChannels": "채널 새로고침",
    "dayOfWeek": "발송 요일",
    "days": {
      "0": "일",
      "1": "월",
      "2": "화",
      "3": "수",
      "4": "목",
      "5": "금",
      "6": "토"
    },
    "hour": "발송 시각",
    "hourFormat": "{hour}시 (KST)",
    "validationChannelRequired": "리포트를 활성화하려면 채널을 선택해야 합니다.",
    "saveSuccess": "저장되었습니다."
  }
}
```

---

## 컴포넌트 분리 기준

| 컴포넌트 | 분리 이유 |
|----------|-----------|
| `HealthScoreGauge` | SVG 게이지 렌더링 로직 독립, 점수 구간별 색상 계산 포함 |
| `ActivityTrendChart` | Recharts ComposedChart(라인+바) 설정이 복잡, 독립 책임 |
| `LeaderboardTable` | 페이지네이션 상태 + 행 클릭 이벤트 + 테이블 렌더링 |
| `ChannelAnalysisChart` | 탭 전환(채널/카테고리) + 클라이언트 집계 로직 + 바 차트 |
| `AiInsightPanel` | 쿨다운 타이머 로직 + LLM 텍스트 렌더링 + 새로고침 버튼 |

페이지 컴포넌트(`page.tsx`)는 데이터 fetch 오케스트레이션과 기간 선택 상태만 관리하고, 각 섹션의 렌더링은 하위 컴포넌트에 위임한다.

---

## 구현 순서 (의존 관계)

```
Step 1: 공유 타입 확인 (선행 -- gemini 도메인)
  |
  v
Step 2: API 클라이언트 2개 파일 생성
  |  (diagnosis-api.ts, weekly-report-api.ts)
  |
  v
Step 6: i18n 키 추가 (병렬 가능)
  |         |
  v         v
Step 3: 대시보드 페이지 + 컴포넌트 5종    Step 4: 주간 리포트 설정 페이지
  |                                          |
  v                                          v
Step 5: 사이드바 메뉴 추가 (양쪽 페이지 완성 후)
```

Step 3과 Step 4는 서로 독립적이므로 병렬 진행 가능하다. Step 5(사이드바)는 라우트가 존재해야 링크가 유효하므로 마지막에 반영한다. Step 6(i18n)은 Step 2와 동시에 진행할 수 있으나, 키 이름이 컴포넌트 구현 중 변경될 수 있으므로 Step 3/4와 함께 점진적으로 추가하는 것을 권장한다.

---

## 기존 코드와의 충돌 분석

| 파일 | 충돌 위험 | 대응 |
|------|-----------|------|
| `DashboardSidebar.tsx` | **낮음**. 현재 `refactor/sidebar-menu-grouping` 브랜치에서 수정 중이나, 그룹 배열에 항목 추가만 하면 됨. 머지 후 작업 |
| `SettingsSidebar.tsx` | **낮음**. 위와 동일 |
| `libs/shared/src/types/index.ts` | **낮음**. gemini 도메인에서 re-export 추가. web에서는 수정하지 않음 |
| `common.json` (i18n) | **낮음**. 기존 키와 네임스페이스 충돌 없음. `sidebar.diagnosis`, `dashboardGroup.analytics`, `settingsGroup.analytics` 모두 신규 키 |
| API 프록시 라우트 | **없음**. 와일드카드 매칭이므로 수정 불필요 |
| 기존 voice 대시보드 | **없음**. 완전히 다른 라우트와 컴포넌트 |
