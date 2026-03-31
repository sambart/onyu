# bot_metric 기반 모니터링 코드 제거 구현 계획

> PRD: [monitoring.md](../specs/prd/monitoring.md) -- Deprecated 섹션
> 공통 모듈: [common-modules.md](../specs/common-modules.md) -- Part B

## 목표

Prometheus + Grafana 전환에 따라, 기존 `bot_metric` 테이블 기반 시계열 모니터링 코드를 전량 제거한다. 대상은 API 서버, Bot 프로세스, 공유 라이브러리, Web 프론트엔드 4개 영역이다.

## 제거 범위 요약

| 영역 | 삭제 대상 | 수정 대상 |
|------|-----------|-----------|
| API 서버 | `apps/api/src/monitoring/` 디렉터리 전체 (10개 파일), `apps/api/src/bot-api/monitoring/bot-monitoring.controller.ts` | `app.module.ts`, `bot-api.module.ts`, `overview.module.ts`, `overview.service.ts`, `overview.service.spec.ts` |
| Bot 프로세스 | `apps/bot/src/scheduler/bot-monitoring.scheduler.ts` | `bot-scheduler.module.ts` |
| 공유 라이브러리 | -- | `libs/bot-api-client/src/types.ts`, `libs/bot-api-client/src/bot-api-client.service.ts` |
| Web 프론트엔드 | `apps/web/app/lib/monitoring-api.ts`, `apps/web/app/dashboard/guild/[guildId]/monitoring/` 디렉터리 전체 (6개 파일) | `DashboardSidebar.tsx`, `DashboardSidebar.test.tsx`, `getting-started/page.tsx` |

---

## 의존 관계 분석

코드 분석을 통해 파악한 주요 의존 관계는 다음과 같다.

```
BotMonitoringScheduler (bot)
  └─ import { BotGuildMetric, BotStatusPayload } from '@onyu/bot-api-client'
  └─ BotApiClientService.pushBotMetrics()
  └─ BotApiClientService.pushBotStatus()

BotMonitoringController (api/bot-api)
  └─ import { BotStatus } from monitoring/domain/bot-metric.types
  └─ BotMetricRepository.saveBatch()
  └─ RedisService (monitoring:bot-status 키)

MonitoringService (api)
  └─ RedisService (monitoring:status, monitoring:bot-status 키)
  └─ BotMetricRepository

MonitoringController (api/presentation)
  └─ MonitoringService

MonitoringScheduler (api)
  └─ BotMetricRepository

OverviewService (api) -- 수정 필요!
  └─ BotMetricOrm (getCurrentVoiceUserCount 메서드에서 최신 bot_metric 조회)

OverviewModule (api) -- 수정 필요!
  └─ TypeOrmModule.forFeature([BotMetricOrm])

getting-started/page.tsx (web)
  └─ import { fetchBotStatus } from monitoring-api

DashboardSidebar.tsx (web)
  └─ /dashboard/guild/{guildId}/monitoring 라우트 항목
```

### 핵심 발견: OverviewService가 BotMetricOrm에 의존

`OverviewService.getCurrentVoiceUserCount()`가 `bot_metric` 테이블에서 최신 레코드의 `voiceUserCount`를 조회한다. 이 메서드는 `bot_metric` 테이블 제거 후 대안이 필요하다.

**대안**: Discord Gateway에서 실시간으로 음성 사용자 수를 조회한다. `DiscordGateway`는 이미 `OverviewService`에 주입되어 있으므로, `guild.voiceStates.cache`를 활용하면 된다. 이 방식이 `bot_metric` 테이블 조회보다 오히려 정확하다 (최대 60초 지연 없이 실시간).

---

## 단계별 구현 계획

### Phase 1: 공유 라이브러리 정리 (선행)

모든 영역에서 참조하는 공유 코드를 먼저 정리한다.

#### 1-1. `libs/bot-api-client/src/types.ts` 수정

**변경**: `BotGuildMetric`, `BotStatusPayload` 인터페이스 제거 (277~300번 줄)

```diff
- // ── Monitoring ──
-
- export interface BotGuildMetric {
-   guildId: string;
-   status: 'ONLINE' | 'OFFLINE';
-   pingMs: number;
-   heapUsedMb: number;
-   heapTotalMb: number;
-   voiceUserCount: number;
-   guildCount: number;
- }
-
- export interface BotStatusPayload {
-   online: boolean;
-   uptimeMs: number;
-   startedAt: string | null;
-   pingMs: number;
-   guildCount: number;
-   memoryUsage: {
-     heapUsedMb: number;
-     heapTotalMb: number;
-   };
-   voiceUserCount: number;
- }
```

#### 1-2. `libs/bot-api-client/src/bot-api-client.service.ts` 수정

**변경**: `pushBotMetrics()`, `pushBotStatus()` 메서드 제거 (163~171번 줄), import에서 `BotGuildMetric`, `BotStatusPayload` 제거

```diff
  import type {
    ...
-   BotGuildMetric,
-   BotStatusPayload,
    ...
  } from './types';

- // ── Monitoring ──
-
- async pushBotMetrics(metrics: BotGuildMetric[]): Promise<void> {
-   await this.post('/bot-api/monitoring/metrics', { metrics });
- }
-
- async pushBotStatus(status: BotStatusPayload): Promise<void> {
-   await this.post('/bot-api/monitoring/status', status);
- }
```

---

### Phase 2: Bot 프로세스 정리

Phase 1에서 공유 타입/메서드를 제거했으므로 Bot 측 소비자를 정리한다.

#### 2-1. `apps/bot/src/scheduler/bot-monitoring.scheduler.ts` 삭제

파일 전체 삭제. `BotGuildMetric`, `BotStatusPayload` import와 `BotApiClientService.pushBotMetrics()`, `pushBotStatus()` 호출이 모두 이 파일에 존재한다.

#### 2-2. `apps/bot/src/scheduler/bot-scheduler.module.ts` 수정

**변경**: `BotMonitoringScheduler` import 및 providers 등록 제거

```diff
- import { BotMonitoringScheduler } from './bot-monitoring.scheduler';

  @Module({
    imports: [DiscordModule.forFeature()],
-   providers: [BotCoPresenceScheduler, BotMonitoringScheduler],
+   providers: [BotCoPresenceScheduler],
  })
```

---

### Phase 3: API 서버 정리

#### 3-1. OverviewService/OverviewModule 수정 (BotMetricOrm 의존 제거)

이 단계를 monitoring 디렉터리 삭제보다 **먼저** 수행해야 한다. `BotMetricOrm`을 import하는 코드가 `overview` 모듈에 존재하기 때문이다.

**`apps/api/src/overview/overview.module.ts` 수정**:

```diff
- import { BotMetricOrm } from '../monitoring/infrastructure/bot-metric.orm-entity';

  @Module({
    imports: [
-     TypeOrmModule.forFeature([VoiceDailyOrm, BotMetricOrm, InactiveMemberRecordOrm]),
+     TypeOrmModule.forFeature([VoiceDailyOrm, InactiveMemberRecordOrm]),
      ...
    ],
  })
```

**`apps/api/src/overview/application/overview.service.ts` 수정**:

- `BotMetricOrm` import 제거
- `botMetricRepo` 필드 제거
- `getCurrentVoiceUserCount()` 메서드를 Discord Gateway 기반으로 변경

```diff
- import { BotMetricOrm } from '../../monitoring/infrastructure/bot-metric.orm-entity';

  constructor(
    private readonly discordGateway: DiscordGateway,
    private readonly discordRest: DiscordRestService,
    ...
-   @InjectRepository(BotMetricOrm)
-   private readonly botMetricRepo: Repository<BotMetricOrm>,
    ...
  ) {}

  private async getCurrentVoiceUserCount(guildId: string): Promise<number> {
-   const latest = await this.botMetricRepo
-     .createQueryBuilder('m')
-     .where('m.guildId = :guildId', { guildId })
-     .orderBy('m.recordedAt', 'DESC')
-     .limit(1)
-     .getOne();
-   return latest?.voiceUserCount ?? 0;
+   // Discord Gateway에서 실시간 음성 사용자 수를 조회한다
+   const guild = this.discordGateway.getGuild(guildId);
+   if (!guild) return 0;
+   return guild.voiceStates.cache.filter(
+     (vs) => vs.channelId !== null && !vs.member?.user.bot,
+   ).size;
  }
```

> 주의: `DiscordGateway.getGuild()` 메서드의 존재 여부를 확인해야 한다. 없을 경우 `DiscordRestService`를 통한 대안을 사용하거나, 0을 반환하는 방식으로 처리한다.

**`apps/api/src/overview/application/overview.service.spec.ts` 수정**:

- `BotMetricOrm` 관련 mock 제거
- `getCurrentVoiceUserCount` 테스트를 Gateway 기반으로 변경

#### 3-2. `apps/api/src/bot-api/monitoring/bot-monitoring.controller.ts` 삭제

파일 전체 삭제.

#### 3-3. `apps/api/src/bot-api/bot-api.module.ts` 수정

```diff
- import { MonitoringModule } from '../monitoring/monitoring.module';
- import { BotMonitoringController } from './monitoring/bot-monitoring.controller';

  @Module({
    imports: [
      ...
-     MonitoringModule,
      ...
    ],
    controllers: [
      ...
-     BotMonitoringController,
      ...
    ],
  })
```

#### 3-4. `apps/api/src/monitoring/` 디렉터리 전체 삭제

Phase 3-1, 3-3에서 외부 참조를 모두 제거한 후, 디렉터리 전체를 삭제한다.

삭제 대상 (10개 파일):

- `domain/bot-metric.types.ts`
- `infrastructure/bot-metric.orm-entity.ts`
- `infrastructure/bot-metric.repository.ts`
- `infrastructure/bot-metric.repository.integration-spec.ts`
- `application/monitoring.service.ts`
- `application/monitoring.service.spec.ts`
- `application/monitoring.service.integration-spec.ts`
- `application/monitoring.scheduler.ts`
- `presentation/monitoring.controller.ts`
- `monitoring.module.ts`

#### 3-5. `apps/api/src/app.module.ts` 수정

```diff
- import { MonitoringModule } from './monitoring/monitoring.module';

  @Module({
    imports: [
      ...
-     MonitoringModule,
      ...
    ],
  })
```

#### 3-6. `apps/api/src/bot-api/monitoring/` 디렉터리 삭제

3-2에서 파일을 삭제했으므로 빈 디렉터리가 남으면 함께 삭제한다.

---

### Phase 4: Web 프론트엔드 정리

#### 4-1. `apps/web/app/lib/monitoring-api.ts` 삭제

파일 전체 삭제. `BotStatus`, `MetricPoint`, `MetricsResponse` 타입과 `fetchBotStatus`, `fetchBotMetrics`, `formatUptime`, `computeHourlyAverage` 함수가 포함되어 있다.

#### 4-2. `apps/web/app/dashboard/guild/[guildId]/monitoring/` 디렉터리 전체 삭제

삭제 대상 (6개 파일):

- `page.tsx`
- `components/StatusCards.tsx`
- `components/PingChart.tsx`
- `components/UptimeChart.tsx`
- `components/MemoryChart.tsx`
- `components/VoiceUserChart.tsx`

#### 4-3. `apps/web/app/dashboard/guild/[guildId]/getting-started/page.tsx` 수정

`fetchBotStatus` import 및 봇 온라인 상태 확인 로직을 제거하거나 대체한다.

```diff
- import { fetchBotStatus } from "@/app/lib/monitoring-api";

  // loadStatus 함수 내부:
- const status = await fetchBotStatus(guildId);
- if (!cancelled) setIsOnline(status.online);
```

**대안**: Health Check 엔드포인트(`GET /health`)를 호출하여 봇 온라인 여부를 판단하거나, 해당 UI 요소를 단순화한다. 구체적인 대안은 구현 시 결정한다.

#### 4-4. `apps/web/app/components/DashboardSidebar.tsx` 수정

시스템 그룹에서 "모니터링" 메뉴 항목 제거:

```diff
  {
    label: t('sidebar.dashboardGroup.system'),
    items: [
-     {
-       href: `/dashboard/guild/${selectedGuildId}/monitoring`,
-       label: t('sidebar.monitoring'),
-       icon: Activity,
-     },
    ],
  },
```

> 시스템 그룹의 items가 빈 배열이 되면, 그룹 자체도 제거하거나 빈 그룹 비표시 로직이 이미 있는지 확인한다.

#### 4-5. `apps/web/app/components/__tests__/DashboardSidebar.test.tsx` 수정

모니터링 관련 테스트 케이스 수정:

- "시스템 그룹에 모니터링 항목이 포함된다" 테스트 제거 또는 수정
- "monitoring 경로의 설정 링크가 없어야 한다" assertion 제거

---

### Phase 5: DB 마이그레이션

#### 5-1. 마이그레이션 파일 확인

`apps/api/src/migrations/1776300000000-DropBotMetric.ts`가 이미 존재한다. 이 마이그레이션이 `bot_metric` 테이블, 인덱스, enum 타입을 드롭한다.

**확인 사항**: 이 마이그레이션이 아직 실행되지 않았다면 배포 시 실행한다. 이미 실행된 경우 추가 작업 불필요.

#### 5-2. 마이그레이션 엔티티 등록 확인

`TypeORMConfig`의 entities 배열에서 `BotMetricOrm`이 자동 스캔 방식(glob 패턴)으로 등록되어 있다면, 디렉터리 삭제 시 자동으로 제거된다. 수동 등록 방식이라면 명시적으로 제거한다.

---

## 실행 순서와 컴파일 안전성

각 Phase 완료 시점에서 컴파일이 깨지지 않도록 아래 순서를 엄격히 준수한다.

```
Phase 1: libs/ 공유 코드 정리 (타입 + 메서드 제거)
    ↓
Phase 2: Bot 프로세스 정리 (스케줄러 삭제 + 모듈 수정)
    ↓  -- 여기까지 컴파일 정상: Bot 측 소비자가 모두 제거됨
    ↓
Phase 3-1: OverviewService/OverviewModule에서 BotMetricOrm 의존 제거
Phase 3-2: BotMonitoringController 삭제
Phase 3-3: bot-api.module.ts에서 MonitoringModule import 제거
    ↓  -- 여기까지 컴파일 정상: monitoring 모듈 외부 참조 0건
    ↓
Phase 3-4: monitoring/ 디렉터리 전체 삭제
Phase 3-5: app.module.ts에서 MonitoringModule import 제거
Phase 3-6: bot-api/monitoring/ 빈 디렉터리 삭제
    ↓  -- API 서버 컴파일 정상
    ↓
Phase 4: Web 프론트엔드 정리 (독립적, Phase 3과 병렬 가능)
    ↓
Phase 5: DB 마이그레이션 실행 확인
```

## 커밋 전략

| 커밋 | 범위 | 설명 |
|------|------|------|
| 1 | Phase 1 + 2 | `refactor: bot_metric 모니터링 공유 코드 및 Bot 스케줄러 제거` |
| 2 | Phase 3 | `refactor: API 서버에서 bot_metric 모니터링 모듈 전체 제거` |
| 3 | Phase 4 | `refactor: Web 프론트엔드에서 모니터링 페이지 및 관련 코드 제거` |

> 3개 커밋 모두 단독으로 컴파일이 통과해야 한다.

## 확인이 필요한 사항

1. **OverviewService의 `getCurrentVoiceUserCount` 대안**: `DiscordGateway.getGuild(guildId)` 메서드가 존재하는지, 반환 타입에 `voiceStates.cache`가 포함되는지 확인 필요. Bot 프로세스가 아닌 API 서버에서 Discord Gateway에 접근 가능한지 확인 필요.
2. **getting-started 페이지의 봇 온라인 상태 확인 대안**: `fetchBotStatus` 제거 후 어떤 방식으로 봇 온라인 여부를 판단할지 결정 필요 (Health Check API, 또는 해당 UI 요소 제거).
3. **i18n 키 정리**: `sidebar.monitoring` 번역 키가 더 이상 사용되지 않으므로 번역 파일에서도 제거 필요.
4. **DashboardSidebar의 시스템 그룹**: 모니터링 항목 제거 후 시스템 그룹이 비게 되면, 그룹 자체를 제거할지 또는 다른 항목을 유지할지 결정 필요.
