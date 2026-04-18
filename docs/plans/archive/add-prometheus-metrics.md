# Prometheus 메트릭 엔드포인트 구현 계획

> PRD 참조: `docs/specs/prd/monitoring.md` - F-MONITORING-010
> 공통 모듈 참조: `docs/specs/common-modules.md` - Part B

---

## 1. 개요

API 서버(`:3000`)와 Bot 서버(`:3001`)에 `prom-client` 기반 `GET /metrics` 엔드포인트를 추가한다.
기존 `bot_metric` 테이블 기반 Push 방식 모니터링을 Prometheus Pull 방식으로 전환하는 첫 단계이다.

### 범위

- `prom-client` 패키지 설치 (api + bot)
- API 서버: `PrometheusService`, `HttpMetricsInterceptor`, `MetricsController`
- Bot 서버: `BotPrometheusService`, `BotMetricsController`
- 기존 모니터링 코드 제거 (monitoring 모듈, bot-api 모니터링 컨트롤러, 스케줄러 등)

### 범위 밖

- 인프라(Docker Compose, Prometheus/Grafana 설정) -- 별도 계획
- Web 프론트엔드 모니터링 페이지 제거 -- 별도 계획
- `bot_metric` 테이블 드롭 마이그레이션 -- 별도 계획
- `libs/bot-api-client` 모니터링 코드 제거 -- 별도 계획 (Phase 0 선행 작업)

---

## 2. 현재 상태 분석

### 2-1. API 서버 기존 모니터링 구조

```
apps/api/src/monitoring/
  monitoring.module.ts          -- TypeORM(BotMetricOrm), RedisModule, AuthModule import
  application/
    monitoring.service.ts       -- Redis에서 봇 상태 조회, DB에서 시계열 메트릭 조회
    monitoring.scheduler.ts     -- 30일 초과 메트릭 삭제 크론
  domain/
    bot-metric.types.ts         -- BotStatus enum 등
  infrastructure/
    bot-metric.orm-entity.ts    -- bot_metric 테이블 ORM 엔티티
    bot-metric.repository.ts    -- saveBatch, findByGuild 등
  presentation/
    monitoring.controller.ts    -- GET /api/guilds/:guildId/bot/status, /bot/metrics

apps/api/src/bot-api/monitoring/
  bot-monitoring.controller.ts  -- POST bot-api/monitoring/metrics, /status (Bot Push 수신)
```

- `MonitoringModule`은 `app.module.ts`와 `bot-api.module.ts` 양쪽에서 import됨
- `BotApiModule`에서 `BotMonitoringController`를 등록

### 2-2. Bot 서버 기존 모니터링 구조

```
apps/bot/src/scheduler/
  bot-monitoring.scheduler.ts   -- 60초 간격으로 Discord 메트릭 수집 -> API Push
  bot-scheduler.module.ts       -- BotMonitoringScheduler + BotCoPresenceScheduler 등록
```

- Bot은 이미 HTTP 포트 3001을 노출 중 (`main.ts`에서 `app.listen(3001)`)
- `ScheduleModule`은 Bot에 등록되어 있지 않음 -- `@Cron` 사용 시 추가 필요

### 2-3. 패키지 이름

- API: `@onyu/api`
- Bot: `@onyu/bot`

---

## 3. 단계별 구현 계획

### Phase 1: 패키지 설치

```bash
pnpm --filter @onyu/api add prom-client
pnpm --filter @onyu/bot add prom-client
```

하나의 커밋에서 두 패키지 동시 설치 (`pnpm-lock.yaml` 충돌 방지).

---

### Phase 2: API 서버 -- 기존 모니터링 코드 제거

#### 2-1. `apps/api/src/monitoring/` 디렉터리 전체 제거

제거 대상 파일:

| 파일 | 내용 |
|------|------|
| `monitoring.module.ts` | 기존 모듈 (TypeORM, Redis 의존) |
| `application/monitoring.service.ts` | 봇 상태/메트릭 조회 서비스 |
| `application/monitoring.service.spec.ts` | 단위 테스트 |
| `application/monitoring.service.integration-spec.ts` | 통합 테스트 |
| `application/monitoring.scheduler.ts` | 30일 초과 메트릭 삭제 크론 |
| `domain/bot-metric.types.ts` | BotStatus enum 등 |
| `infrastructure/bot-metric.orm-entity.ts` | bot_metric ORM 엔티티 |
| `infrastructure/bot-metric.repository.ts` | bot_metric 리포지토리 |
| `infrastructure/bot-metric.repository.integration-spec.ts` | 통합 테스트 |
| `presentation/monitoring.controller.ts` | 기존 REST 컨트롤러 |

#### 2-2. `apps/api/src/bot-api/monitoring/` 디렉터리 제거

- `bot-monitoring.controller.ts` 삭제

#### 2-3. `apps/api/src/bot-api/bot-api.module.ts` 수정

- `MonitoringModule` import 제거
- `BotMonitoringController` controllers 배열에서 제거

#### 2-4. `apps/api/src/app.module.ts` 수정

- 기존 `MonitoringModule` import를 유지하되, Phase 3에서 신규 모듈로 교체

---

### Phase 3: API 서버 -- prom-client 기반 신규 모듈 구현

#### 3-1. `apps/api/src/monitoring/prometheus.service.ts` (신규)

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

@Injectable()
export class PrometheusService implements OnModuleInit {
  private readonly registry = new Registry();

  /** HTTP 요청 처리 지연 (초) */
  readonly httpRequestDuration: Histogram;

  /** HTTP 요청 누적 횟수 */
  readonly httpRequestsTotal: Counter;

  constructor() {
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'] as const,
      buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'] as const,
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
```

핵심 설계:
- `Registry`를 인스턴스 변수로 보유하여 글로벌 레지스트리 오염 방지
- `collectDefaultMetrics()`는 `onModuleInit`에서 1회 호출
- `httpRequestDuration` 버킷은 PRD 명세 준수: `[0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`

#### 3-2. `apps/api/src/monitoring/http-metrics.interceptor.ts` (신규)

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

import { PrometheusService } from './prometheus.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly prometheus: PrometheusService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();
    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.recordMetrics(req, res, startTime),
        error: () => this.recordMetrics(req, res, startTime),
      }),
    );
  }

  private recordMetrics(
    req: Request,
    res: Response,
    startTime: bigint,
  ): void {
    const durationSec =
      Number(process.hrtime.bigint() - startTime) / 1_000_000_000;
    // 라우트 패턴 사용 (카디널리티 폭발 방지)
    const path = (req.route?.path as string) ?? req.path;
    const method = req.method;
    const status = String(res.statusCode);

    this.prometheus.httpRequestDuration
      .labels(method, path, status)
      .observe(durationSec);

    this.prometheus.httpRequestsTotal
      .labels(method, path, status)
      .inc();
  }
}
```

핵심 설계:
- `APP_INTERCEPTOR`로 전역 등록하여 모든 요청에 자동 적용
- `req.route?.path`로 라우트 패턴을 가져옴 (예: `/api/guilds/:guildId/voice/stats`)
  - 실제 파라미터 값이 아닌 패턴을 사용하여 카디널리티 폭발 방지
  - `req.route`가 없는 경우 (404 등) `req.path`를 fallback으로 사용
- `process.hrtime.bigint()`로 나노초 단위 정밀 측정

#### 3-3. `apps/api/src/monitoring/metrics.controller.ts` (신규)

```typescript
import { Controller, Get, Header } from '@nestjs/common';

import { PrometheusService } from './prometheus.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prometheus: PrometheusService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.prometheus.getMetrics();
  }
}
```

핵심 설계:
- 인증 불필요 (내부 네트워크 전용, Prometheus scrape 용도)
- `JwtAuthGuard`는 `APP_GUARD`로 등록되어 있지 않으므로 별도 제외 처리 불필요
- `GuildMembershipGuard`가 `APP_GUARD`로 등록되어 있으므로 `/metrics` 경로를 예외 처리해야 함 (아래 참조)
- `HttpThrottlerGuard`도 `APP_GUARD`이므로 Rate Limiting 제외 필요

#### 3-4. `apps/api/src/monitoring/monitoring.module.ts` (신규, 기존 파일 교체)

```typescript
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsController } from './metrics.controller';
import { PrometheusService } from './prometheus.service';

@Module({
  controllers: [MetricsController],
  providers: [
    PrometheusService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [PrometheusService],
})
export class MonitoringModule {}
```

핵심 설계:
- TypeORM, Redis, Auth 의존성 모두 제거 (기존 모듈 대비 경량화)
- `HttpMetricsInterceptor`를 `APP_INTERCEPTOR`로 전역 등록
- `app.module.ts`의 `MonitoringModule` import는 변경 없이 유지 (같은 모듈명으로 교체)

#### 3-5. Guard 예외 처리

`GET /metrics` 엔드포인트는 인증 없이 접근 가능해야 한다. 현재 `APP_GUARD`로 등록된 Guard 확인:

1. **`HttpThrottlerGuard`**: Rate Limiting 적용 -- `/metrics`를 제외하거나, `@SkipThrottle()` 데코레이터 사용
2. **`GuildMembershipGuard`**: Guild 접근 제어 -- `/metrics` 경로에는 `:guildId` 파라미터가 없으므로 Guard 내부 로직에서 자동 스킵될 가능성이 높음. 기존 Guard 코드를 확인하여 `/metrics`가 문제없이 통과하는지 검증 필요

**조치 사항**:
- `MetricsController`에 `@SkipThrottle()` 데코레이터 추가 (throttle 제외)
- `GuildMembershipGuard`의 기존 로직 확인 -- guildId 파라미터 없는 경로를 자동 스킵하는지 확인 후, 필요 시 `/metrics` 경로 예외 추가

---

### Phase 4: Bot 서버 -- 기존 모니터링 코드 제거

#### 4-1. `apps/bot/src/scheduler/bot-monitoring.scheduler.ts` 삭제

- `BotMonitoringScheduler` 클래스 전체 삭제

#### 4-2. `apps/bot/src/scheduler/bot-scheduler.module.ts` 수정

- `BotMonitoringScheduler` import 및 providers 배열에서 제거
- `BotCoPresenceScheduler`만 남김

---

### Phase 5: Bot 서버 -- prom-client 기반 신규 모듈 구현

#### 5-1. `apps/bot/src/monitoring/bot-prometheus.service.ts` (신규)

```typescript
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
} from 'prom-client';
import { Client } from 'discord.js';

@Injectable()
export class BotPrometheusService implements OnModuleInit {
  private readonly logger = new Logger(BotPrometheusService.name);
  private readonly registry = new Registry();

  readonly gatewayPing: Gauge;
  readonly guildCount: Gauge;
  readonly voiceUsersTotal: Gauge;
  readonly uptimeSeconds: Gauge;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
  ) {
    this.gatewayPing = new Gauge({
      name: 'discord_gateway_ping_ms',
      help: 'Discord WebSocket ping in milliseconds',
      registers: [this.registry],
    });

    this.guildCount = new Gauge({
      name: 'discord_guild_count',
      help: 'Number of guilds the bot is in',
      registers: [this.registry],
    });

    this.voiceUsersTotal = new Gauge({
      name: 'discord_voice_users_total',
      help: 'Number of voice channel users per guild (excluding bots)',
      labelNames: ['guildId'] as const,
      registers: [this.registry],
    });

    this.uptimeSeconds = new Gauge({
      name: 'bot_uptime_seconds',
      help: 'Bot uptime in seconds',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  /**
   * 15초 간격으로 Discord Client에서 메트릭 값을 읽어 Gauge를 갱신한다.
   * Discord Client 미연결 시 ping/guildCount/uptime은 0으로 설정하고,
   * voiceUsersTotal은 갱신 생략 (이전 값 유지).
   */
  @Cron('*/15 * * * * *')
  refreshMetrics(): void {
    try {
      const isReady = this.client.isReady();

      if (!isReady) {
        this.gatewayPing.set(0);
        this.guildCount.set(0);
        this.uptimeSeconds.set(0);
        // voiceUsersTotal: 갱신 생략 (이전 값 유지)
        return;
      }

      this.gatewayPing.set(this.client.ws.ping);
      this.guildCount.set(this.client.guilds.cache.size);
      this.uptimeSeconds.set((this.client.uptime ?? 0) / 1000);

      for (const guild of this.client.guilds.cache.values()) {
        const voiceUserCount = guild.voiceStates.cache.filter(
          (vs) => vs.channelId !== null && !vs.member?.user.bot,
        ).size;

        this.voiceUsersTotal
          .labels(guild.id)
          .set(voiceUserCount);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to refresh metrics: ${message}`);
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
```

핵심 설계:
- `@Cron('*/15 * * * * *')` -- 15초 간격 갱신 (PRD 명세 준수)
- `@Cron` 사용을 위해 Bot 서버에 `ScheduleModule` 등록 필요 (아래 확인)
- Discord Client 미연결 시 오류 처리: ping/guildCount/uptime은 0 설정, voiceUsersTotal은 이전 값 유지

**`ScheduleModule` 등록 확인**: Bot의 `app.module.ts`에는 `ScheduleModule`이 등록되어 있지 않다. `@Cron` 데코레이터를 사용하려면 `ScheduleModule.forRoot()`를 `app.module.ts`에 추가해야 한다.

#### 5-2. `apps/bot/src/monitoring/bot-metrics.controller.ts` (신규)

```typescript
import { Controller, Get, Header } from '@nestjs/common';

import { BotPrometheusService } from './bot-prometheus.service';

@Controller('metrics')
export class BotMetricsController {
  constructor(private readonly prometheus: BotPrometheusService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.prometheus.getMetrics();
  }
}
```

#### 5-3. `apps/bot/src/monitoring/bot-metrics.module.ts` (신규)

```typescript
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotMetricsController } from './bot-metrics.controller';
import { BotPrometheusService } from './bot-prometheus.service';

@Module({
  imports: [DiscordModule.forFeature()],
  controllers: [BotMetricsController],
  providers: [BotPrometheusService],
})
export class BotMetricsModule {}
```

#### 5-4. `apps/bot/src/app.module.ts` 수정

- `ScheduleModule.forRoot()` import 추가 (`@Cron` 데코레이터 지원)
- `BotMetricsModule` import 추가

```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { BotMetricsModule } from './monitoring/bot-metrics.module';

@Module({
  imports: [
    // ... 기존 imports
    ScheduleModule.forRoot(),
    BotMetricsModule,
  ],
})
export class AppModule {}
```

**주의**: `@nestjs/schedule` 패키지가 Bot의 `package.json`에 있는지 확인 필요. 없으면 `pnpm --filter @onyu/bot add @nestjs/schedule` 설치.

#### 5-5. Bot HTTP 포트 노출

Bot 서버는 이미 `main.ts`에서 포트 3001로 HTTP 서버를 노출하고 있다:
```typescript
const port = process.env.BOT_PORT ?? 3001;
await app.listen(port);
```
따라서 추가 설정 없이 `GET http://localhost:3001/metrics`로 접근 가능하다.

---

## 4. 파일 변경 요약

### 신규 파일

| 파일 경로 | 설명 |
|-----------|------|
| `apps/api/src/monitoring/prometheus.service.ts` | prom-client Registry + 커스텀 메트릭 정의 |
| `apps/api/src/monitoring/http-metrics.interceptor.ts` | HTTP 요청 자동 계측 인터셉터 |
| `apps/api/src/monitoring/metrics.controller.ts` | `GET /metrics` 엔드포인트 |
| `apps/bot/src/monitoring/bot-prometheus.service.ts` | 봇 커스텀 메트릭 + 15초 갱신 스케줄러 |
| `apps/bot/src/monitoring/bot-metrics.controller.ts` | `GET /metrics` 엔드포인트 |
| `apps/bot/src/monitoring/bot-metrics.module.ts` | 봇 메트릭 NestJS 모듈 |

### 수정 파일

| 파일 경로 | 변경 내용 |
|-----------|-----------|
| `apps/api/src/monitoring/monitoring.module.ts` | 전체 교체: TypeORM/Redis 의존 제거, prom-client 기반으로 교체 |
| `apps/api/src/bot-api/bot-api.module.ts` | `MonitoringModule` import 제거, `BotMonitoringController` 제거 |
| `apps/bot/src/scheduler/bot-scheduler.module.ts` | `BotMonitoringScheduler` 제거 |
| `apps/bot/src/app.module.ts` | `ScheduleModule.forRoot()` 추가, `BotMetricsModule` 추가 |

### 삭제 파일

| 파일 경로 | 이유 |
|-----------|------|
| `apps/api/src/monitoring/application/monitoring.service.ts` | Prometheus 전환으로 불필요 |
| `apps/api/src/monitoring/application/monitoring.service.spec.ts` | 서비스 삭제에 따라 제거 |
| `apps/api/src/monitoring/application/monitoring.service.integration-spec.ts` | 서비스 삭제에 따라 제거 |
| `apps/api/src/monitoring/application/monitoring.scheduler.ts` | 메트릭 보존 크론 불필요 (Prometheus 자체 관리) |
| `apps/api/src/monitoring/domain/bot-metric.types.ts` | BotMetric 도메인 타입 불필요 |
| `apps/api/src/monitoring/infrastructure/bot-metric.orm-entity.ts` | bot_metric 테이블 ORM 엔티티 불필요 |
| `apps/api/src/monitoring/infrastructure/bot-metric.repository.ts` | bot_metric 리포지토리 불필요 |
| `apps/api/src/monitoring/infrastructure/bot-metric.repository.integration-spec.ts` | 리포지토리 삭제에 따라 제거 |
| `apps/api/src/monitoring/presentation/monitoring.controller.ts` | 기존 REST 컨트롤러 불필요 |
| `apps/api/src/bot-api/monitoring/bot-monitoring.controller.ts` | Bot Push 수신 엔드포인트 불필요 |
| `apps/bot/src/scheduler/bot-monitoring.scheduler.ts` | API Push 스케줄러 불필요 |

---

## 5. 메트릭 요약

### API 서버 커스텀 메트릭

| 이름 | 타입 | 레이블 | 설명 |
|------|------|--------|------|
| `http_request_duration_seconds` | Histogram | `method`, `path`, `status` | HTTP 요청 처리 지연 (초) |
| `http_requests_total` | Counter | `method`, `path`, `status` | HTTP 요청 누적 횟수 |

+ `collectDefaultMetrics()` 기본 메트릭 (process_heap_bytes, nodejs_gc_duration_seconds 등)

### Bot 서버 커스텀 메트릭

| 이름 | 타입 | 레이블 | 설명 |
|------|------|--------|------|
| `discord_gateway_ping_ms` | Gauge | -- | Discord WebSocket 핑 (ms) |
| `discord_guild_count` | Gauge | -- | 봇 참여 서버 수 |
| `discord_voice_users_total` | Gauge | `guildId` | 서버별 음성 접속자 수 (봇 제외) |
| `bot_uptime_seconds` | Gauge | -- | 봇 업타임 (초) |

+ `collectDefaultMetrics()` 기본 메트릭

---

## 6. 구현 순서 (커밋 단위)

```
Commit 1: chore: prom-client 패키지 설치 (api + bot)
  - pnpm --filter @onyu/api add prom-client
  - pnpm --filter @onyu/bot add prom-client
  - (필요 시) pnpm --filter @onyu/bot add @nestjs/schedule

Commit 2: refactor: 기존 모니터링 코드 제거
  - apps/api/src/monitoring/ 기존 파일 전체 삭제
  - apps/api/src/bot-api/monitoring/ 삭제
  - apps/api/src/bot-api/bot-api.module.ts 수정
  - apps/bot/src/scheduler/bot-monitoring.scheduler.ts 삭제
  - apps/bot/src/scheduler/bot-scheduler.module.ts 수정

Commit 3: feat: API 서버 Prometheus 메트릭 엔드포인트 추가
  - apps/api/src/monitoring/prometheus.service.ts (신규)
  - apps/api/src/monitoring/http-metrics.interceptor.ts (신규)
  - apps/api/src/monitoring/metrics.controller.ts (신규)
  - apps/api/src/monitoring/monitoring.module.ts (신규, 교체)

Commit 4: feat: Bot 서버 Prometheus 메트릭 엔드포인트 추가
  - apps/bot/src/monitoring/bot-prometheus.service.ts (신규)
  - apps/bot/src/monitoring/bot-metrics.controller.ts (신규)
  - apps/bot/src/monitoring/bot-metrics.module.ts (신규)
  - apps/bot/src/app.module.ts 수정 (ScheduleModule + BotMetricsModule)
```

---

## 7. 사전 확인 사항

| 항목 | 확인 내용 | 상태 |
|------|-----------|------|
| Bot HTTP 포트 | `main.ts`에서 3001 포트 listen 확인 | 확인 완료 |
| `@nestjs/schedule` | Bot `package.json`에 존재하는지 확인 | 확인 필요 |
| `GuildMembershipGuard` | guildId 없는 경로 자동 스킵 여부 | 확인 필요 |
| `HttpThrottlerGuard` | `/metrics` 경로 Rate Limit 제외 방법 | `@SkipThrottle()` 사용 |
| `libs/bot-api-client` | 모니터링 코드 제거 (Phase 0 선행 작업) | 별도 진행 |

---

## 8. 기존 코드 충돌 분석

| 충돌 지점 | 설명 | 해결 방법 |
|-----------|------|-----------|
| `app.module.ts` (API) | `MonitoringModule` import 유지 | 같은 이름으로 교체하므로 import 경로 변경 불필요 |
| `bot-api.module.ts` | `MonitoringModule` import 제거 필요 | Commit 2에서 처리 |
| `bot-scheduler.module.ts` | `BotMonitoringScheduler` 제거 | Commit 2에서 처리 |
| `libs/bot-api-client` | `pushBotMetrics`, `pushBotStatus` 참조 | Phase 0 선행 작업에서 제거 (이 계획의 범위 밖) |

**주의**: `libs/bot-api-client`의 모니터링 코드 제거는 이 계획의 **선행 조건**이다. `common-modules.md` Part B-1에 따라 Phase 0에서 먼저 처리한 후 이 계획을 실행해야 한다. 또는 Commit 2에서 Bot 스케줄러 삭제 시 해당 import가 함께 사라지므로, `libs/bot-api-client` 코드를 동일 커밋에서 같이 정리할 수 있다.
