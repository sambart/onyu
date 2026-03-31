# 공통 모듈 설계

> 이 문서는 다중 도메인 병렬 개발에 앞서, 2개 이상 도메인이 공유하는 로직을 공통 모듈로 추출한 설계이다.
> 단일 도메인에서만 사용되는 로직은 포함하지 않는다.

---

## Part A. gemini + web 도메인 (기존)

### A-1. 공유 타입: `libs/shared/src/types/diagnosis.ts`, `libs/shared/src/types/weekly-report.ts`

**사용 도메인**: gemini(voice-analytics API 백엔드), web(진단 대시보드 + 주간 리포트 설정 페이지)

gemini PRD의 REST API 5종(F-WEB-016)과 주간 리포트 설정 API 2종(F-WEB-017)의 요청/응답 타입은 API 백엔드(컨트롤러 응답 타입)와 Web 프론트엔드(API 클라이언트 반환 타입)가 동일하게 참조한다. `libs/shared`에 공유 타입을 정의하여 양쪽의 타입 불일치를 방지한다.

#### A-1.1 서버 진단 대시보드 API 응답 타입

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

#### A-1.2 주간 리포트 설정 API 타입

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

#### A-1.3 exports 등록

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

#### 참조 위치

| 소비자 | 파일 | 용도 |
|--------|------|------|
| API 백엔드 | `apps/api/src/voice-analytics/presentation/voice-analytics.controller.ts` | REST API 응답 타입으로 사용 |
| API 백엔드 | 주간 리포트 설정 컨트롤러 (신규) | 설정 조회/저장 응답 타입 |
| Web 프론트엔드 | `apps/web/app/lib/diagnosis-api.ts` (신규) | API 클라이언트 반환 타입 |
| Web 프론트엔드 | `apps/web/app/lib/weekly-report-api.ts` (신규) | API 클라이언트 반환 타입 |

---

### A-2. 사이드바 메뉴 항목: `DashboardSidebar.tsx`, `SettingsSidebar.tsx`

**사용 도메인**: gemini(서버 진단 대시보드 라우트), web(사이드바 UI 렌더링)

PRD F-WEB-015에 따라 사이드바는 그룹 기반 구조로 구성되며, F-WEB-016/F-WEB-017에 의해 아래 메뉴가 추가된다.

| 사이드바 | 그룹 | 메뉴 항목 | 라우트 |
|----------|------|-----------|--------|
| DashboardSidebar | 분석 | 서버 진단 | `/dashboard/guild/{guildId}/diagnosis` |
| SettingsSidebar | 분석 | 서버 진단 | `/settings/guild/{guildId}/diagnosis` |

#### 충돌 방지 규칙

- `refactor/sidebar-menu-grouping` 브랜치가 develop에 머지된 후에 gemini/web 작업 브랜치를 분기한다.
- **gemini 도메인 개발자는 사이드바 파일을 직접 수정하지 않는다.**
- **web 도메인 개발자가 사이드바에 "서버 진단" 메뉴 항목과 크로스링크(대시보드-설정 연결)를 일괄 반영한다.**

---

### A-3. Next.js API 프록시 라우트: `apps/web/app/api/guilds/[...path]/route.ts`

**사용 도메인**: gemini(voice-analytics API 경로 정의), web(프론트엔드에서 백엔드 프록시)

기존 `[...path]/route.ts`는 `/api/guilds/:guildId/*` 요청을 NestJS 백엔드로 프록시하며 JWT 토큰을 자동 주입한다. 와일드카드 패턴으로 모든 guild 하위 경로를 처리하므로 추가 수정이 불필요하다.

#### 충돌 방지 규칙

- 기존 `[...path]/route.ts`는 와일드카드 매칭이므로 gemini/web 어느 쪽에서도 이 파일을 수정할 필요가 없다.
- 특정 경로에 커스텀 프록시 로직이 필요해지는 경우 web 도메인에서만 수정한다.

---

### A-4. VoiceAnalyticsService 데이터 집계 메서드

**사용 도메인**: gemini(F-GEMINI-005 `/서버진단` 커맨드 + F-GEMINI-006 주간 리포트 + REST API 5종), web(F-WEB-016 대시보드에서 REST API 호출)

`VoiceAnalyticsService`는 기존에 `collectVoiceActivityData()` 메서드로 `VoiceDailyEntity` 데이터를 집계한다. 신규 REST API 5종과 `/서버진단` 커맨드, 주간 리포트 모두 이 서비스의 집계 로직을 기반으로 동작한다.

#### 신규 메서드 목록

| 메서드 | 반환 타입 | 호출자 |
|--------|----------|--------|
| `getDailySummary(guildId, days)` | `DailyTrendItem[]` | REST API summary 엔드포인트, `/서버진단` 커맨드, 주간 리포트 |
| `getHealthScore(guildId, days)` | `{ score, prevScore, delta }` | REST API health-score 엔드포인트, `/서버진단` 커맨드 |
| `getLeaderboard(guildId, days, page, limit)` | `{ users: LeaderboardUser[], total }` | REST API leaderboard 엔드포인트, `/서버진단` 커맨드(TOP 3), 주간 리포트(TOP 5) |
| `getChannelStats(guildId, days)` | `ChannelStatItem[]` | REST API channel-stats 엔드포인트, 주간 리포트(TOP 3 채널) |

#### 충돌 방지 규칙

- 위 메서드들은 **gemini 도메인 개발자가 `VoiceAnalyticsService`에 추가**한다.
- web 도메인 개발자는 이 서비스를 직접 수정하지 않으며 REST API를 통해서만 데이터를 소비한다.
- 기존 메서드(`collectVoiceActivityData`, `getDateRange` 등)의 시그니처는 변경하지 않는다.

---

### A-5. 기존 공유 모듈: 변경 불필요 확인

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

### A-6. gemini + web 구현 분담 명세

#### gemini(voice-analytics) 도메인 담당

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

#### web 도메인 담당

| 항목 | 설명 |
|------|------|
| `apps/web/app/lib/diagnosis-api.ts` | 서버 진단 API 클라이언트 (공유 타입 import) |
| `apps/web/app/lib/weekly-report-api.ts` | 주간 리포트 설정 API 클라이언트 (공유 타입 import) |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/` | 서버 진단 대시보드 페이지 + 컴포넌트 5종 |
| `apps/web/app/settings/guild/[guildId]/diagnosis/` | 주간 리포트 설정 페이지 |
| `DashboardSidebar.tsx` | "분석" 그룹에 "서버 진단" 메뉴 항목 추가 |
| `SettingsSidebar.tsx` | "분석" 그룹에 "서버 진단" 메뉴 항목 추가 |

#### 의존 순서

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

단계 1(공유 타입 생성)이 완료되면 gemini와 web은 독립적으로 병렬 진행 가능하다.

---

## Part B. monitoring 전환 (신규)

> 5개 변경 영역: monitoring 도메인(API), bot 프로세스, web 프론트엔드, 인프라, 공유 라이브러리(libs/)

### B-1. 공유 라이브러리 정리: `libs/bot-api-client`

**관련 영역**: monitoring 도메인(API) + bot 프로세스

`libs/bot-api-client`는 Bot -> API 통신 모듈로, monitoring 관련 코드가 API측과 Bot측 양쪽에서 참조된다. 기존 모니터링 Push 방식 제거 시 양측이 동시에 의존하는 코드를 먼저 정리해야 한다.

#### 제거 대상

| 파일 | 제거 항목 | 참조하는 영역 |
|------|-----------|--------------|
| `libs/bot-api-client/src/types.ts` | `BotGuildMetric` 인터페이스 | bot(`BotMonitoringScheduler`), api(`BotMonitoringController`) |
| `libs/bot-api-client/src/types.ts` | `BotStatusPayload` 인터페이스 | bot(`BotMonitoringScheduler`), api(`BotMonitoringController`) |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `pushBotMetrics()` 메서드 | bot(`BotMonitoringScheduler`) |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `pushBotStatus()` 메서드 | bot(`BotMonitoringScheduler`) |

#### 충돌 방지 규칙

- 이 파일들은 bot 영역과 api 영역 양쪽에서 import하므로, **가장 먼저 제거**해야 한다.
- 제거 후 bot과 api의 컴파일이 깨지므로, 각 영역에서 해당 import를 함께 정리해야 한다.

---

### B-2. `DashboardSidebar.tsx`: "봇 모니터링" 메뉴 항목 제거

**관련 영역**: monitoring 도메인(API) + web 프론트엔드

`apps/web/app/components/DashboardSidebar.tsx`는 Part A의 gemini+web 작업에서 "서버 진단" 메뉴를 추가하는 파일과 동일하다. monitoring 전환에서는 "봇 모니터링" 메뉴 항목을 제거한다.

#### 변경 내용

| 사이드바 | 변경 | 설명 |
|----------|------|------|
| DashboardSidebar | "봇 모니터링" 항목 제거 | 시스템 그룹에서 `/dashboard/guild/{guildId}/monitoring` 라우트 삭제 |

#### 충돌 방지 규칙

- Part A의 web 도메인 작업과 동일 파일을 수정한다. **사이드바 변경은 한 영역(web)에서만 수행**한다.
- monitoring 전환 작업이 사이드바를 직접 수정하지 않고, web 도메인 개발자가 일괄 반영한다.

---

### B-3. `docker-compose.yml`: 인프라 서비스 추가

**관련 영역**: 인프라 + monitoring 도메인(API) + bot 프로세스

`docker-compose.yml`은 현재 api, bot, web, lavalink, db, redis 서비스를 정의한다. monitoring 전환에서 Prometheus, Grafana, Alertmanager, Node Exporter, postgres-exporter, redis-exporter 6개 서비스를 추가한다. 동시에 api와 bot 서비스의 포트 노출 설정이 Prometheus scrape과 관련된다.

#### 추가 서비스

| 서비스 | 이미지 | 포트 | 역할 |
|--------|--------|------|------|
| `prometheus` | `prom/prometheus:latest` | 9090 | 메트릭 수집/저장 |
| `grafana` | `grafana/grafana:latest` | 3002 | 시각화 대시보드 |
| `alertmanager` | `prom/alertmanager:latest` | 9093 | 알림 라우팅 (Discord webhook) |
| `node-exporter` | `prom/node-exporter:latest` | 9100 | 호스트 시스템 메트릭 |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | 9187 | PostgreSQL 메트릭 |
| `redis-exporter` | `oliver006/redis_exporter` | 9121 | Redis 메트릭 |

#### 추가 볼륨

| 볼륨 | 용도 |
|------|------|
| `prometheus_data` | Prometheus 시계열 데이터 영구 저장 |
| `grafana_data` | Grafana 설정/대시보드 영구 저장 |

#### 충돌 방지 규칙

- `docker-compose.yml`은 인프라 영역에서만 수정한다. api/bot 코드 변경과는 별개 파일이므로 충돌 위험이 낮다.
- 다만 다른 도메인 작업에서 `docker-compose.yml`에 서비스를 추가하는 경우 충돌할 수 있으므로, **인프라 변경은 단독 커밋**으로 진행한다.

---

### B-4. `prom-client` 의존성: api + bot 동시 설치

**관련 영역**: monitoring 도메인(API) + bot 프로세스

PRD F-MONITORING-010에 따라 API 서버와 Bot 서버 모두 `prom-client` 패키지를 사용하여 `GET /metrics` 엔드포인트를 노출한다. 현재 두 패키지 모두 `prom-client`를 의존성에 포함하지 않는다.

#### 설치 대상

| 패키지 | 설치 명령 |
|--------|-----------|
| `@onyu/api` | `pnpm --filter @onyu/api add prom-client` |
| `@onyu/bot` | `pnpm --filter @onyu/bot add prom-client` |

#### 충돌 방지 규칙

- `pnpm-lock.yaml`은 루트에서 관리되므로 두 패키지의 의존성 추가가 동시에 일어나면 lock 파일 충돌이 발생한다.
- **의존성 설치는 하나의 커밋에서 두 패키지 동시에 수행**한다.

---

### B-5. 기존 공유 모듈: 변경 불필요 확인

아래 모듈/파일은 monitoring 전환 영역 간 공유되지만, 이번 작업에서 수정이 불필요하거나 단일 영역에서만 수정하므로 공통 모듈에 해당하지 않는다.

| 항목 | 위치 | 이유 |
|------|------|------|
| `BotApiAuthGuard` | `apps/api/src/bot-api/bot-api-auth.guard.ts` | bot-api 모니터링 컨트롤러 제거 시 참조만 줄어들 뿐 guard 자체는 변경 없음 |
| `RedisService` | `apps/api/src/redis/redis.service.ts` | monitoring 키 제거는 코드 삭제에 해당하며 RedisService 자체 변경 없음 |
| `BotApiModule` | `apps/api/src/bot-api/bot-api.module.ts` | `BotMonitoringController` import 제거는 api 단일 영역 작업 |
| `AppModule (api)` | `apps/api/src/app.module.ts` | `MonitoringModule` import 변경은 api 단일 영역 작업 |
| `AppModule (bot)` | `apps/bot/src/app.module.ts` | 스케줄러 모듈 변경은 bot 단일 영역 작업 |
| `BotSchedulerModule` | `apps/bot/src/scheduler/bot-scheduler.module.ts` | `BotMonitoringScheduler` 제거는 bot 단일 영역 작업 |

---

### B-6. monitoring 전환 구현 분담 명세

5개 변경 영역을 역할별로 분류한다.

#### 영역 1: 공유 라이브러리 정리 (선행 작업)

| 항목 | 설명 |
|------|------|
| `libs/bot-api-client/src/types.ts` | `BotGuildMetric`, `BotStatusPayload` 인터페이스 제거 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `pushBotMetrics()`, `pushBotStatus()` 메서드 제거 |

#### 영역 2: monitoring 도메인 - API (기존 제거 + 신규 추가)

| 항목 | 설명 |
|------|------|
| `apps/api/src/monitoring/` | 기존 디렉터리 전체 제거 (module, controller, service, scheduler, repository, orm-entity, types) |
| `apps/api/src/bot-api/monitoring/` | `BotMonitoringController` 제거 |
| `apps/api/src/bot-api/bot-api.module.ts` | `MonitoringModule` import 및 `BotMonitoringController` 등록 제거 |
| `apps/api/src/app.module.ts` | `MonitoringModule` import 제거 |
| `apps/api/src/monitoring/monitoring.module.ts` (신규) | prom-client 기반 모듈 신규 생성 |
| `apps/api/src/monitoring/prometheus.service.ts` (신규) | `prom-client` 레지스트리 + 커스텀 메트릭 정의 |
| `apps/api/src/monitoring/metrics.controller.ts` (신규) | `GET /metrics` 엔드포인트 |
| `apps/api/src/monitoring/http-metrics.interceptor.ts` (신규) | HTTP 요청 지연/카운트 자동 계측 인터셉터 |
| DB 마이그레이션 | `bot_metric` 테이블 드롭 마이그레이션 |

#### 영역 3: bot 프로세스 (기존 제거 + 신규 추가)

| 항목 | 설명 |
|------|------|
| `apps/bot/src/scheduler/bot-monitoring.scheduler.ts` | `BotMonitoringScheduler` 제거 |
| `apps/bot/src/scheduler/bot-scheduler.module.ts` | `BotMonitoringScheduler` 등록 제거 |
| `apps/bot/src/monitoring/bot-metrics.module.ts` (신규) | 봇 메트릭 모듈 |
| `apps/bot/src/monitoring/bot-metrics.controller.ts` (신규) | `GET /metrics` 엔드포인트 |
| `apps/bot/src/monitoring/bot-prometheus.service.ts` (신규) | 커스텀 봇 메트릭 정의 + 15초 갱신 스케줄러 |
| `apps/bot/src/app.module.ts` | `BotMetricsModule` import 추가 |

#### 영역 4: web 프론트엔드 (제거)

| 항목 | 설명 |
|------|------|
| `apps/web/app/lib/monitoring-api.ts` | 파일 전체 삭제 |
| `apps/web/app/dashboard/guild/[guildId]/monitoring/` | 디렉터리 전체 삭제 (page.tsx + 컴포넌트 5종) |
| `apps/web/app/components/DashboardSidebar.tsx` | "봇 모니터링" 메뉴 항목 제거 |

#### 영역 5: 인프라 (신규)

| 항목 | 설명 |
|------|------|
| `docker-compose.yml` | 6개 인프라 서비스 + 2개 볼륨 추가 |
| `infra/prometheus/prometheus.yml` | Prometheus 스크레이프 설정 |
| `infra/prometheus/alert.rules.yml` | Alertmanager 알림 규칙 5종 |
| `infra/grafana/provisioning/datasources/prometheus.yaml` | Grafana datasource 프로비저닝 |
| `infra/grafana/provisioning/dashboards/onyu-bot-status.json` | 봇 상태 대시보드 |
| `infra/grafana/provisioning/dashboards/onyu-infra.json` | 인프라 대시보드 |

---

### B-7. monitoring 전환 의존 순서 및 병렬화

```
Phase 0 (선행, 단독):
  [공유] libs/bot-api-client 모니터링 코드 제거 (types + service)
  [공유] prom-client 의존성 설치 (api + bot 동시)
     |
     v
Phase 1 (병렬 가능):
  [api]   기존 monitoring 디렉터리 전체 제거 + bot-api 모니터링 컨트롤러 제거
  [bot]   BotMonitoringScheduler 제거
  [web]   monitoring 페이지/API 클라이언트/사이드바 항목 제거
  [infra] infra/ 디렉터리 생성 + prometheus/grafana 설정 파일 작성
     |
     v
Phase 2 (병렬 가능, Phase 1 완료 후):
  [api]   prom-client 기반 신규 monitoring 모듈 구현
          (prometheus.service, metrics.controller, http-metrics.interceptor)
  [bot]   prom-client 기반 봇 메트릭 모듈 구현
          (bot-prometheus.service, bot-metrics.controller)
  [infra] docker-compose.yml 인프라 서비스 추가
     |
     v
Phase 3 (통합):
  [api]   bot_metric 테이블 드롭 마이그레이션 생성/실행
  [all]   통합 테스트 (Prometheus scrape 확인, Grafana 대시보드 로드 확인)
```

#### 병렬 실행 그룹 요약

| 그룹 | 영역 | 선행 조건 |
|------|------|-----------|
| Phase 0 | 공유 라이브러리(libs/) | 없음 |
| Phase 1-A | api 기존 코드 제거 | Phase 0 |
| Phase 1-B | bot 기존 코드 제거 | Phase 0 |
| Phase 1-C | web 코드 제거 | 없음 (libs/ 미참조) |
| Phase 1-D | infra 설정 파일 작성 | 없음 (독립) |
| Phase 2-A | api 신규 모듈 구현 | Phase 1-A |
| Phase 2-B | bot 신규 모듈 구현 | Phase 1-B |
| Phase 2-C | docker-compose.yml 서비스 추가 | Phase 1-D |
| Phase 3 | DB 마이그레이션 + 통합 테스트 | Phase 2 전체 |

#### 파일 충돌 위험 매트릭스

아래는 2개 이상 영역이 동일 파일을 수정하는 경우를 정리한 것이다. 이 파일들이 병렬 작업 시 git conflict가 발생할 수 있는 지점이다.

| 파일 | 수정하는 영역 | 충돌 방지 방법 |
|------|--------------|---------------|
| `libs/bot-api-client/src/types.ts` | Phase 0에서 단독 수정 | Phase 0 완료 후 Phase 1 시작 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | Phase 0에서 단독 수정 | Phase 0 완료 후 Phase 1 시작 |
| `pnpm-lock.yaml` | api 의존성 + bot 의존성 | 하나의 커밋에서 동시 설치 |
| `docker-compose.yml` | 인프라 영역 단독 | 단독 커밋으로 진행 |
| `DashboardSidebar.tsx` | web(monitoring 메뉴 제거) + web(gemini 메뉴 추가) | web 도메인 개발자가 일괄 처리 |

---

## Part C. Part A + Part B 교차 의존성

Part A(gemini+web)와 Part B(monitoring 전환) 간 공유 파일이 있는지 확인한다.

| 공유 파일 | Part A | Part B | 충돌 방지 |
|-----------|--------|--------|-----------|
| `DashboardSidebar.tsx` | "서버 진단" 메뉴 추가 | "봇 모니터링" 메뉴 제거 | web 도메인 개발자가 양쪽 변경을 하나의 커밋으로 일괄 반영 |
| `libs/shared/src/types/index.ts` | 신규 타입 re-export 추가 | 변경 없음 | 충돌 없음 |
| `apps/api/src/app.module.ts` | 변경 없음 | `MonitoringModule` import 변경 | 충돌 없음 |

유일한 교차 충돌 지점은 `DashboardSidebar.tsx`이며, 이는 web 도메인 개발자가 통합하여 처리한다.
