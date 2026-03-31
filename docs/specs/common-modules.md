# 공통 모듈 설계 (gemini + web 도메인)

> 이 문서는 gemini(voice-analytics) + web 도메인 병렬 개발에 앞서, 2개 이상 도메인이 공유하는 로직을 공통 모듈로 추출한 설계이다.
> 단일 도메인에서만 사용되는 로직은 포함하지 않는다.

---

## 1. 공유 타입: `libs/shared/src/types/diagnosis.ts`, `libs/shared/src/types/weekly-report.ts`

**사용 도메인**: gemini(voice-analytics API 백엔드), web(진단 대시보드 + 주간 리포트 설정 페이지)

gemini PRD의 REST API 5종(F-WEB-016)과 주간 리포트 설정 API 2종(F-WEB-017)의 요청/응답 타입은 API 백엔드(컨트롤러 응답 타입)와 Web 프론트엔드(API 클라이언트 반환 타입)가 동일하게 참조한다. `libs/shared`에 공유 타입을 정의하여 양쪽의 타입 불일치를 방지한다.

### 1.1 서버 진단 대시보드 API 응답 타입

```typescript
// libs/shared/src/types/diagnosis.ts

/** GET /api/guilds/{guildId}/voice-analytics/summary?days=N */
export interface DiagnosisSummaryResponse {
  daily: DailyTrendItem[];
}

export interface DailyTrendItem {
  date: string;
  totalSec: number;
  activeUsers: number;
}

/** GET /api/guilds/{guildId}/voice-analytics/health-score?days=N */
export interface HealthScoreResponse {
  score: number;
  prevScore: number;
  delta: number;
  diagnosis: string;
}

/** GET /api/guilds/{guildId}/voice-analytics/leaderboard?days=N&page=P&limit=L */
export interface LeaderboardResponse {
  users: LeaderboardUser[];
  total: number;
}

export interface LeaderboardUser {
  rank: number;
  userId: string;
  nickName: string;
  avatarUrl: string | null;
  totalSec: number;
  micOnSec: number;
  activeDays: number;
}

/** GET /api/guilds/{guildId}/voice-analytics/channel-stats?days=N */
export interface ChannelStatsResponse {
  channels: ChannelStatItem[];
}

export interface ChannelStatItem {
  channelId: string;
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  totalSec: number;
  uniqueUsers: number;
}

/** POST /api/guilds/{guildId}/voice-analytics/ai-insight?days=N */
export interface AiInsightResponse {
  insights: string;
  suggestions: string[];
  generatedAt: string;
}
```

### 1.2 주간 리포트 설정 API 타입

```typescript
// libs/shared/src/types/weekly-report.ts

/** GET/POST /api/guilds/{guildId}/weekly-report/config */
export interface WeeklyReportConfigDto {
  isEnabled: boolean;
  channelId: string | null;
  dayOfWeek: number;
  hour: number;
  timezone: string;
}
```

### 1.3 exports 등록

```typescript
// libs/shared/src/types/index.ts 에 추가
export type {
  DiagnosisSummaryResponse,
  DailyTrendItem,
  HealthScoreResponse,
  LeaderboardResponse,
  LeaderboardUser,
  ChannelStatsResponse,
  ChannelStatItem,
  AiInsightResponse,
} from './diagnosis';

export type { WeeklyReportConfigDto } from './weekly-report';
```

### 참조 위치

| 소비자 | 파일 | 용도 |
|--------|------|------|
| API 백엔드 | `apps/api/src/voice-analytics/presentation/voice-analytics.controller.ts` | REST API 응답 타입으로 사용 |
| API 백엔드 | 주간 리포트 설정 컨트롤러 (신규) | 설정 조회/저장 응답 타입 |
| Web 프론트엔드 | `apps/web/app/lib/diagnosis-api.ts` (신규) | API 클라이언트 반환 타입 |
| Web 프론트엔드 | `apps/web/app/lib/weekly-report-api.ts` (신규) | API 클라이언트 반환 타입 |

---

## 2. 사이드바 메뉴 항목: `DashboardSidebar.tsx`, `SettingsSidebar.tsx`

**사용 도메인**: gemini(서버 진단 대시보드 라우트), web(사이드바 UI 렌더링)

PRD F-WEB-015에 따라 사이드바는 그룹 기반 구조로 구성되며, F-WEB-016/F-WEB-017에 의해 아래 메뉴가 추가된다.

| 사이드바 | 그룹 | 메뉴 항목 | 라우트 |
|----------|------|-----------|--------|
| DashboardSidebar | 분석 | 서버 진단 | `/dashboard/guild/{guildId}/diagnosis` |
| SettingsSidebar | 분석 | 서버 진단 | `/settings/guild/{guildId}/diagnosis` |

**현재 상태**: `DashboardSidebar.tsx`와 `SettingsSidebar.tsx`는 현재 `refactor/sidebar-menu-grouping` 브랜치에서 수정 중(git modified)이며, 그룹 기반 메뉴 재구성이 진행 중이다.

### 충돌 방지 규칙

- `refactor/sidebar-menu-grouping` 브랜치가 develop에 머지된 후에 gemini/web 작업 브랜치를 분기한다.
- **gemini 도메인 개발자는 사이드바 파일을 직접 수정하지 않는다.**
- **web 도메인 개발자가 사이드바에 "서버 진단" 메뉴 항목과 크로스링크(대시보드-설정 연결)를 일괄 반영한다.**

---

## 3. Next.js API 프록시 라우트: `apps/web/app/api/guilds/[...path]/route.ts`

**사용 도메인**: gemini(voice-analytics API 경로 정의), web(프론트엔드에서 백엔드 프록시)

기존 `[...path]/route.ts`는 `/api/guilds/:guildId/*` 요청을 NestJS 백엔드로 프록시하며 JWT 토큰을 자동 주입한다. 와일드카드 패턴으로 모든 guild 하위 경로를 처리하므로 추가 수정이 불필요하다.

신규 voice-analytics API 5종 및 weekly-report 설정 API 2종은 아래 경로로 프록시된다.

| Web 클라이언트 요청 경로 | 프록시 대상 (NestJS) |
|--------------------------|---------------------|
| `/api/guilds/{guildId}/voice-analytics/summary` | `GET /api/guilds/:guildId/voice-analytics/summary` |
| `/api/guilds/{guildId}/voice-analytics/health-score` | `GET /api/guilds/:guildId/voice-analytics/health-score` |
| `/api/guilds/{guildId}/voice-analytics/leaderboard` | `GET /api/guilds/:guildId/voice-analytics/leaderboard` |
| `/api/guilds/{guildId}/voice-analytics/channel-stats` | `GET /api/guilds/:guildId/voice-analytics/channel-stats` |
| `/api/guilds/{guildId}/voice-analytics/ai-insight` | `POST /api/guilds/:guildId/voice-analytics/ai-insight` |
| `/api/guilds/{guildId}/weekly-report/config` | `GET/POST /api/guilds/:guildId/weekly-report/config` |

### 충돌 방지 규칙

- 기존 `[...path]/route.ts`는 와일드카드 매칭이므로 gemini/web 어느 쪽에서도 이 파일을 수정할 필요가 없다.
- 특정 경로에 커스텀 프록시 로직이 필요해지는 경우 web 도메인에서만 수정한다.

---

## 4. VoiceAnalyticsService 데이터 집계 메서드

**사용 도메인**: gemini(F-GEMINI-005 `/서버진단` 커맨드 + F-GEMINI-006 주간 리포트 + REST API 5종), web(F-WEB-016 대시보드에서 REST API 호출)

`VoiceAnalyticsService`(`apps/api/src/voice-analytics/application/voice-analytics.service.ts`)는 기존에 `collectVoiceActivityData()` 메서드로 `VoiceDailyEntity` 데이터를 집계한다. 신규 REST API 5종과 `/서버진단` 커맨드, 주간 리포트 모두 이 서비스의 집계 로직을 기반으로 동작한다.

### 신규 메서드 목록

| 메서드 | 반환 타입 | 호출자 |
|--------|----------|--------|
| `getDailySummary(guildId, days)` | `DailyTrendItem[]` | REST API summary 엔드포인트, `/서버진단` 커맨드, 주간 리포트 |
| `getHealthScore(guildId, days)` | `{ score, prevScore, delta }` | REST API health-score 엔드포인트, `/서버진단` 커맨드 |
| `getLeaderboard(guildId, days, page, limit)` | `{ users: LeaderboardUser[], total }` | REST API leaderboard 엔드포인트, `/서버진단` 커맨드(TOP 3), 주간 리포트(TOP 5) |
| `getChannelStats(guildId, days)` | `ChannelStatItem[]` | REST API channel-stats 엔드포인트, 주간 리포트(TOP 3 채널) |

### 충돌 방지 규칙

- 위 메서드들은 **gemini 도메인 개발자가 `VoiceAnalyticsService`에 추가**한다.
- web 도메인 개발자는 이 서비스를 직접 수정하지 않으며 REST API를 통해서만 데이터를 소비한다.
- 기존 메서드(`collectVoiceActivityData`, `getDateRange` 등)의 시그니처는 변경하지 않는다.

---

## 5. 기존 공유 모듈: 변경 불필요 확인

아래 모듈은 이미 존재하며 gemini/web 양쪽에서 참조하지만 이번 작업에서 변경이 불필요하다. 병렬 개발 시 충돌 위험이 없음을 확인한다.

| 모듈 | 위치 | 역할 | 변경 필요 여부 |
|------|------|------|---------------|
| LLM 추상화 레이어 | `apps/api/src/common/llm/` | `LlmProvider` 인터페이스 + `GeminiLlmProvider` 구현체 | 변경 없음. F-GEMINI-005, F-GEMINI-006 모두 기존 `LlmProvider.generateText()` 사용 |
| Resilience Policy | `apps/api/src/common/resilience/resilience.policy.ts` | Circuit Breaker + Retry + Timeout | 변경 없음. 기존 정책 그대로 사용 |
| 공통 API 클라이언트 | `apps/web/app/lib/api-client.ts` | `apiClient<T>()`, `apiGet<T>()` fetch 래퍼 | 변경 없음. 신규 `diagnosis-api.ts`, `weekly-report-api.ts`에서 import하여 사용 |
| JWT Auth Guard | `apps/api/src/auth/infrastructure/jwt-auth.guard.ts` | REST API 인증 | 변경 없음 |
| Guild Membership Guard | `apps/api/src/common/guards/guild-membership.guard.ts` | Guild 접근 제어 | 변경 없음 |
| VoiceActivityData 타입 | `libs/shared/src/types/index.ts` | 기존 voice-analytics 집계 데이터 타입 | 변경 없음 |
| PaginatedResponse 타입 | `libs/shared/src/types/index.ts` | 페이지네이션 공통 타입 | 변경 없음 |
| WeeklyReportConfigOrmEntity | `apps/api/src/voice-analytics/weekly-report/infrastructure/weekly-report-config.orm-entity.ts` | DB 엔티티 (이미 생성됨) | 변경 없음 |
| DB 마이그레이션 | `apps/api/src/migrations/1776200000000-AddWeeklyReportConfig.ts` | 테이블 생성 (이미 생성됨) | 변경 없음 |

---

## 6. 구현 분담 명세

공통 모듈을 기반으로 한 gemini/web 병렬 개발 분담을 정의한다.

### gemini(voice-analytics) 도메인 담당

| 항목 | 설명 |
|------|------|
| `libs/shared/src/types/diagnosis.ts` | 공유 타입 파일 생성 |
| `libs/shared/src/types/weekly-report.ts` | 공유 타입 파일 생성 |
| `libs/shared/src/types/index.ts` | 신규 타입 re-export 추가 |
| `VoiceAnalyticsService` 신규 메서드 4종 | getDailySummary, getHealthScore, getLeaderboard, getChannelStats |
| `VoiceAnalyticsController` 신규 엔드포인트 5종 | summary, health-score, leaderboard, channel-stats, ai-insight |
| 주간 리포트 설정 컨트롤러 + 서비스 | `GET/POST /api/guilds/:guildId/weekly-report/config` |
| 주간 리포트 스케줄러 + 전송 서비스 | `WeeklyReportScheduler`, `WeeklyReportService` |
| `/서버진단` 슬래시 커맨드 | `server-diagnosis.command.ts` |
| 기존 4개 슬래시 커맨드 삭제 | `/voice-stats`, `/my-voice-stats`, `/community-health`, `/voice-leaderboard` |

### web 도메인 담당

| 항목 | 설명 |
|------|------|
| `apps/web/app/lib/diagnosis-api.ts` | 서버 진단 API 클라이언트 (공유 타입 import) |
| `apps/web/app/lib/weekly-report-api.ts` | 주간 리포트 설정 API 클라이언트 (공유 타입 import) |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/` | 서버 진단 대시보드 페이지 + 컴포넌트 5종 |
| `apps/web/app/settings/guild/[guildId]/diagnosis/` | 주간 리포트 설정 페이지 |
| `DashboardSidebar.tsx` | "분석" 그룹에 "서버 진단" 메뉴 항목 추가 |
| `SettingsSidebar.tsx` | "분석" 그룹에 "서버 진단" 메뉴 항목 추가 |

### 의존 순서

```
1. [gemini] libs/shared 공유 타입 생성 (diagnosis.ts, weekly-report.ts, index.ts re-export)
     |
     v
2. [gemini] VoiceAnalyticsService 신규 메서드 + VoiceAnalyticsController 엔드포인트 5종
   [gemini] 주간 리포트 설정 API + 스케줄러 + 전송 서비스
   [gemini] /서버진단 커맨드 구현 + 기존 커맨드 4종 삭제
     |                  (병렬)
   [web] diagnosis-api.ts, weekly-report-api.ts API 클라이언트 구현
   [web] 서버 진단 대시보드 페이지 + 컴포넌트 5종 구현
   [web] 주간 리포트 설정 페이지 구현
   [web] 사이드바 메뉴 항목 추가
```

단계 1(공유 타입 생성)이 완료되면 gemini와 web은 독립적으로 병렬 진행 가능하다. web은 공유 타입만 import하면 API 백엔드 구현 완료를 기다리지 않고 페이지 개발을 시작할 수 있다.
