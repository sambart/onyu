# Monitoring 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

봇 및 인프라 상태를 Prometheus + Grafana 기반으로 모니터링하는 도메인이다. API 서버와 Bot 서버 각각에서 `prom-client`로 메트릭을 노출하고, Prometheus가 주기적으로 스크레이프하여 Grafana 대시보드와 Alertmanager를 통해 시각화 및 알림을 제공한다.

로그 중앙화를 위해 Loki + Promtail을 도입한다. Bot 서버는 `nestjs-pino`로 JSON 구조화 로그를 출력하며, Promtail이 Docker 컨테이너 로그를 수집하여 Loki에 전달한다. Grafana에서 메트릭과 로그를 함께 조회하고 로그 기반 알림 규칙을 추가로 운영한다.

기존 `bot_metric` 테이블 기반의 시계열 저장 방식은 본 전환과 함께 **제거**된다. 관련 API 엔드포인트, 스케줄러, 웹 대시보드 페이지도 함께 제거된다 (상세 내역은 [Deprecated](#deprecated-제거-예정) 섹션 참조).

## 관련 모듈

### API 서버 (`apps/api`)

- `apps/api/src/monitoring/monitoring.module.ts` — 모니터링 모듈
- `apps/api/src/monitoring/metrics.controller.ts` — `GET /metrics` 엔드포인트
- `apps/api/src/monitoring/prometheus.service.ts` — `prom-client` 레지스트리 및 커스텀 메트릭 정의
- `apps/api/src/monitoring/http-metrics.interceptor.ts` — HTTP 요청 지연·카운트 자동 계측 인터셉터
- `apps/api/src/health/health.controller.ts` — Health Check 엔드포인트 (기존 유지)

### Bot 서버 (`apps/bot`)

- `apps/bot/src/monitoring/bot-metrics.module.ts` — 봇 메트릭 모듈
- `apps/bot/src/monitoring/bot-metrics.controller.ts` — `GET /metrics` 엔드포인트
- `apps/bot/src/monitoring/bot-prometheus.service.ts` — 커스텀 봇 메트릭 정의 및 갱신 스케줄러
- `apps/bot/src/main.ts` — `app.useLogger(app.get(PinoLogger))` 적용 (F-MONITORING-021)
- `apps/bot/src/app.module.ts` — `LoggerModule.forRootAsync()` 등록 (F-MONITORING-021)

### 인프라 (`infra/`)

- `infra/prometheus/prometheus.yml` — Prometheus 스크레이프 설정
- `infra/prometheus/alert.rules.yml` — Alertmanager 알림 규칙
- `infra/grafana/provisioning/datasources/prometheus.yaml` — Grafana Prometheus datasource 프로비저닝
- `infra/grafana/provisioning/datasources/loki.yaml` — Grafana Loki datasource 프로비저닝 (F-MONITORING-022)
- `infra/grafana/provisioning/dashboards/` — Grafana 대시보드 JSON 자동 등록 디렉터리
- `infra/loki/loki-config.yaml` — Loki 서버 설정 (스토리지, 보존 정책, 스키마) (F-MONITORING-020)
- `infra/promtail/promtail-config.yaml` — Promtail 수집 설정 (Docker 소켓, 라벨링, 파이프라인) (F-MONITORING-020)
- `docker-compose.yml` — Prometheus, Grafana, Exporter, Loki, Promtail 서비스 추가

---

## 아키텍처

```
[API 서버 :3000]                  [Bot 서버 :3001]
  GET /metrics                      GET /metrics
  (prom-client)                     (prom-client)
  JSON 로그 (pino)                  JSON 로그 (nestjs-pino)
       │                                 │
       │ scrape (15s)    ┌───────────────┘
       └──────────┬──────┘
                  │
           [Prometheus :9090]
                  │
       ┌──────────┴──────────────────────┐
       │                                 │
       ▼                                 ▼
[Grafana :3002]               [Alertmanager :9093]
대시보드 시각화                Discord Webhook 알림
       │
프로비저닝 (자동 등록)
- datasource: Prometheus
- datasource: Loki
- 봇 상태 대시보드 (메트릭 + 로그 패널)
- 인프라 대시보드 (메트릭 + 로그 패널)

[Node Exporter :9100]  ──scrape──►  Prometheus
[postgres-exporter :9187]  ────────►  Prometheus
[redis-exporter :9121]  ───────────►  Prometheus

[Docker 컨테이너 로그]
  API / Bot / Web / Lavalink 컨테이너
       │ (Docker 소켓)
       ▼
  [Promtail]
       │ push
       ▼
  [Loki :3100]
       │ query (LogQL)
       ▼
  [Grafana :3002] ─── 로그 패널, 로그 기반 알림
```

---

## 기능 상세

### F-MONITORING-010: Prometheus 메트릭 엔드포인트

#### 10-1. API 서버 (`GET /metrics`)

- **엔드포인트**: `GET /metrics` (API 서버, 포트 3000)
- **인증**: 불필요 (내부 네트워크 전용, Prometheus scrape 용도)
- **Content-Type**: `text/plain; version=0.0.4; charset=utf-8`
- **기본 메트릭**: `prom-client`의 `collectDefaultMetrics()` — Node.js 런타임 메트릭 전체 포함
  - `process_heap_bytes`, `process_cpu_seconds_total`
  - `nodejs_gc_duration_seconds`, `nodejs_event_loop_lag_seconds`
  - `nodejs_active_handles_total`, `nodejs_active_requests_total`
- **커스텀 메트릭**:

  | 메트릭 이름 | 타입 | 레이블 | 설명 |
  |-------------|------|--------|------|
  | `http_request_duration_seconds` | Histogram | `method`, `path`, `status` | HTTP 요청 처리 지연 (초) |
  | `http_requests_total` | Counter | `method`, `path`, `status` | HTTP 요청 누적 횟수 |

- **HTTP 메트릭 수집 방식**: `HttpMetricsInterceptor` — `APP_INTERCEPTOR`로 전역 등록하여 모든 요청에 자동 계측 적용
  - `path`는 라우트 패턴으로 기록 (예: `/api/guilds/:guildId/voice/stats`). 실제 값(`guildId` 등)은 치환하지 않아 카디널리티 폭발 방지
  - `status`는 HTTP 상태 코드 문자열 (예: `"200"`, `"404"`)
  - Histogram 버킷: `[0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`

#### 10-2. Bot 서버 (`GET /metrics`)

- **엔드포인트**: `GET /metrics` (Bot 서버, 포트 3001)
- **인증**: 불필요 (내부 네트워크 전용)
- **기본 메트릭**: `prom-client`의 `collectDefaultMetrics()`
- **커스텀 메트릭**:

  | 메트릭 이름 | 타입 | 레이블 | 설명 |
  |-------------|------|--------|------|
  | `discord_gateway_ping_ms` | Gauge | — | Discord WebSocket 핑 (ms), `client.ws.ping` |
  | `discord_guild_count` | Gauge | — | 봇이 참여한 서버 수, `client.guilds.cache.size` |
  | `discord_voice_users_total` | Gauge | `guildId` | 해당 서버의 음성 채널 접속자 수 (봇 제외) |
  | `bot_uptime_seconds` | Gauge | — | 봇 업타임 (초), `client.uptime / 1000` |

- **갱신 주기**: `@Cron('*/15 * * * * *')` (15초 간격) — `BotPrometheusService`가 Discord Client에서 값을 읽어 각 Gauge를 갱신
- **오류 처리**: Discord Client 미연결 시 `discord_gateway_ping_ms`, `discord_guild_count`, `bot_uptime_seconds`는 `0` 설정. `discord_voice_users_total`은 갱신 생략 (이전 값 유지)

---

### F-MONITORING-011: Prometheus + Grafana 인프라 (Docker Compose)

#### 서비스 구성

| 서비스 | 이미지 | 포트 | 역할 |
|--------|--------|------|------|
| `prometheus` | `prom/prometheus:latest` | 9090 | 메트릭 수집·저장 |
| `grafana` | `grafana/grafana:latest` | 3002 | 시각화 대시보드 |
| `alertmanager` | `prom/alertmanager:latest` | 9093 | 알림 라우팅 (Discord webhook) |
| `node-exporter` | `prom/node-exporter:latest` | 9100 | 호스트 시스템 메트릭 |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | 9187 | PostgreSQL 메트릭 |
| `redis-exporter` | `oliver006/redis_exporter` | 9121 | Redis 메트릭 |
| `loki` | `grafana/loki:latest` | 3100 (내부) | 로그 저장·쿼리 엔진 |
| `promtail` | `grafana/promtail:latest` | — | Docker 컨테이너 로그 수집 → Loki 전송 |

#### Prometheus 스크레이프 설정 (`prometheus.yml`)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - alert.rules.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'onyu-api'
    static_configs:
      - targets: ['api:3000']

  - job_name: 'onyu-bot'
    static_configs:
      - targets: ['bot:3001']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

#### 알림 규칙 (`alert.rules.yml`)

| 규칙 이름 | 조건 | 지속 시간 | 심각도 | 설명 |
|-----------|------|-----------|--------|------|
| `BotDown` | `up{job="onyu-bot"} == 0` | 2분 | critical | 봇 서버 다운 |
| `ApiDown` | `up{job="onyu-api"} == 0` | 2분 | critical | API 서버 다운 |
| `HighMemoryUsage` | `process_resident_memory_bytes / 1024 / 1024 > 512` | 5분 | warning | 메모리 사용량 512MB 초과 |
| `HighGatewayPing` | `discord_gateway_ping_ms > 500` | 3분 | warning | Discord 핑 500ms 초과 |
| `HighErrorRate` | `rate(http_requests_total{status=~"5.."}[5m]) > 0.1` | 5분 | warning | 5xx 에러율 10% 초과 |

#### Alertmanager Discord Webhook 연동

- Alertmanager의 `receiver`를 Discord Webhook URL로 설정
- `critical` 알림은 즉시 발송, `warning` 알림은 그룹화하여 5분 배치 발송
- 환경변수 `DISCORD_ALERT_WEBHOOK_URL`으로 주입

#### Grafana 프로비저닝

- datasource 자동 등록: `infra/grafana/provisioning/datasources/prometheus.yaml`
  - `name: Prometheus`, `type: prometheus`, `url: http://prometheus:9090`
- datasource 자동 등록: `infra/grafana/provisioning/datasources/loki.yaml` (F-MONITORING-022)
  - `name: Loki`, `type: loki`, `url: http://loki:3100`
- 대시보드 자동 등록: `infra/grafana/provisioning/dashboards/` 디렉터리 내 JSON 파일을 시작 시 자동 로드 (상세 내역은 F-MONITORING-012, F-MONITORING-022 참조)
- Grafana admin 계정: 환경변수 `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`로 주입

---

### F-MONITORING-012: Grafana 대시보드 프로비저닝

#### 대시보드 1: 봇 상태 대시보드 (`onyu-bot-status.json`)

| 패널 | 메트릭 | 시각화 타입 | 설명 |
|------|--------|-------------|------|
| 봇 업타임 | `bot_uptime_seconds` | Stat | 현재 업타임 (사람이 읽을 수 있는 형식) |
| Discord 핑 추이 | `discord_gateway_ping_ms` | Time Series | 핑 시계열 차트, 500ms 임계 기준선 |
| 메모리 사용량 추이 | `process_heap_bytes{type="used"}`, `process_heap_bytes{type="total"}` | Time Series | 힙 메모리 추이 (MB) |
| 음성 접속자 수 | `discord_voice_users_total` | Time Series | guildId 레이블별 음성 접속자 추이 |
| 참여 서버 수 | `discord_guild_count` | Stat | 현재 참여 서버 수 |
| 봇 가용성 | `avg_over_time(up{job="onyu-bot"}[1h]) * 100` | Gauge | 최근 1시간 봇 가용률 (%) |

#### 대시보드 2: 인프라 대시보드 (`onyu-infra.json`)

| 패널 | 메트릭 소스 | 시각화 타입 | 설명 |
|------|------------|-------------|------|
| 호스트 CPU 사용률 | node-exporter | Time Series | 1분 rate 기반 CPU 사용률 (%) |
| 호스트 메모리 사용률 | node-exporter | Time Series | 메모리 사용률 (%) 및 사용/전체 (GB) |
| 호스트 디스크 I/O | node-exporter | Time Series | 읽기/쓰기 처리량 (bytes/s) |
| PostgreSQL 커넥션 수 | postgres-exporter | Stat + Time Series | 현재 활성 커넥션 수 및 추이 |
| PostgreSQL 쿼리 처리량 | postgres-exporter | Time Series | 초당 쿼리 수 (rate) |
| Redis 메모리 사용량 | redis-exporter | Time Series | Redis 메모리 사용량 (MB) |
| Redis 캐시 히트율 | redis-exporter | Gauge | `keyspace_hits / (keyspace_hits + keyspace_misses)` (%) |
| HTTP 요청 처리율 | API `http_requests_total` | Time Series | 초당 요청 수 (method/path/status 레이블) |
| HTTP 95th 응답시간 | API `http_request_duration_seconds` | Time Series | p95 응답 지연 (초) |

#### 대시보드 변수 (Template Variables)

- `$interval`: 시간 집계 간격 선택 (`1m`, `5m`, `15m`, `1h`)

---

### F-MONITORING-020: Loki + Promtail 로그 수집 인프라

#### Promtail 구성

- Docker 소켓(`/var/run/docker.sock`) 마운트 방식으로 컨테이너 로그 자동 수집
- 수집 대상: `api`, `bot`, `web`, `lavalink` 컨테이너 (`prometheus`, `grafana`, `alertmanager`, `node-exporter`, `postgres-exporter`, `redis-exporter`, `loki`, `promtail` 제외)
- 라벨링:

  | 라벨 | 소스 | 예시 값 |
  |------|------|---------|
  | `job` | 고정값 | `"docker"` |
  | `container_name` | Docker 컨테이너 이름 | `"onyu-api"`, `"onyu-bot"` |
  | `compose_service` | Docker Compose 서비스 이름 | `"api"`, `"bot"`, `"web"` |

- 파이프라인 스테이지: 멀티라인 처리(스택 트레이스 병합), JSON 파싱, 타임스탬프 추출

#### Loki 구성

- Promtail에서 push API로 수신한 로그를 저장·인덱싱
- 라벨만 인덱싱하는 경량 방식 (로그 본문은 인덱싱 제외)
- 보존 기간: 30일 (Prometheus와 동일)
- 포트: 3100 (내부 Docker 네트워크 전용, 외부 미노출)
- 설정 파일: `infra/loki/loki-config.yaml`

  ```yaml
  auth_enabled: false

  server:
    http_listen_port: 3100

  ingester:
    lifecycler:
      ring:
        kvstore:
          store: inmemory
        replication_factor: 1

  schema_config:
    configs:
      - from: 2024-01-01
        store: boltdb-shipper
        object_store: filesystem
        schema: v11
        index:
          prefix: index_
          period: 24h

  storage_config:
    boltdb_shipper:
      active_index_directory: /loki/index
      cache_location: /loki/index_cache
    filesystem:
      directory: /loki/chunks

  limits_config:
    retention_period: 720h   # 30일
  ```

- Promtail 설정 파일: `infra/promtail/promtail-config.yaml`

  ```yaml
  server:
    http_listen_port: 9080

  clients:
    - url: http://loki:3100/loki/api/v1/push

  scrape_configs:
    - job_name: docker
      docker_sd_configs:
        - host: unix:///var/run/docker.sock
          refresh_interval: 5s
          filters:
            - name: label
              values: ["com.docker.compose.project"]
      relabel_configs:
        - source_labels: [__meta_docker_container_name]
          target_label: container_name
        - source_labels: [__meta_docker_compose_service]
          target_label: compose_service
        - target_label: job
          replacement: docker
      pipeline_stages:
        - json:
            expressions:
              level: level
              msg: msg
        - labels:
            level:
  ```

---

### F-MONITORING-021: Bot 서버 구조화 로깅 (nestjs-pino)

현재 Bot 서버는 NestJS 기본 Logger(텍스트 출력)를 사용하여 Loki에서 JSON 파싱이 불가능하다. API 서버와 동일하게 `nestjs-pino`로 전환한다.

#### 추가 패키지

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `nestjs-pino` | latest | NestJS Logger를 Pino로 위임 |
| `pino-http` | latest | HTTP 요청 자동 로깅 |
| `pino-pretty` | latest | 개발 환경 컬러 텍스트 출력 |

#### 적용 방식

- `apps/bot/src/main.ts`

  ```ts
  import { Logger } from 'nestjs-pino';
  // ...
  app.useLogger(app.get(Logger));
  ```

- `apps/bot/src/app.module.ts`

  ```ts
  LoggerModule.forRootAsync({
    useFactory: (configService: ConfigService) => ({
      pinoHttp: {
        level: configService.get('NODE_ENV') === 'production' ? 'info' : 'debug',
        transport:
          configService.get('NODE_ENV') !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),
    inject: [ConfigService],
  })
  ```

#### 기존 코드 영향 범위

- `new Logger(ClassName.name)` 패턴은 **변경 불필요** — NestJS 내장 Logger 인터페이스가 Pino로 위임됨
- Bot 전체 로그가 JSON 포맷으로 stdout 출력되어 Promtail이 자동 수집

---

### F-MONITORING-022: Grafana Loki datasource 및 로그 대시보드

#### Loki datasource 프로비저닝

파일: `infra/grafana/provisioning/datasources/loki.yaml`

```yaml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    editable: false
```

#### 봇 상태 대시보드 추가 패널 (`onyu-bot-status.json`)

| 추가 패널 | LogQL | 시각화 타입 | 설명 |
|-----------|-------|-------------|------|
| Error Logs | `{compose_service=~"api\|bot"} \|= "ERROR"` | Logs | API/Bot 에러 로그 실시간 스트림 |

#### 인프라 대시보드 추가 패널 (`onyu-infra.json`)

| 추가 패널 | LogQL | 시각화 타입 | 설명 |
|-----------|-------|-------------|------|
| Slow Requests | `{compose_service="api"} \| json \| response_time > 1000` | Logs | 응답 시간 1초 초과 요청 로그 |
| 5xx Errors | `{compose_service="api"} \| json \| status >= 500` | Logs | 서버 에러 로그 |

---

### F-MONITORING-023: 로그 기반 알림 규칙 (Loki Ruler / Grafana Alerting)

Grafana Alerting을 통해 LogQL 조건 기반 알림을 추가한다. Prometheus 메트릭 기반 알림(`alert.rules.yml`)과 병행 운영한다.

| 규칙 이름 | LogQL 조건 | 평가 주기 | 지속 시간 | 심각도 | 채널 |
|-----------|-----------|-----------|-----------|--------|------|
| `HighErrorLogRate` | `sum(rate({compose_service=~"api\|bot"} \|= "ERROR" [5m])) > 0.1` | 1분 | 5분 | warning | Discord Webhook |
| `DiscordRateLimited` | `{compose_service="bot"} \|= "rate limit"` 1건 이상 발생 | 1분 | 1분 | warning | Discord Webhook |

- 알림 발송 채널은 기존 Alertmanager Discord Webhook (`DISCORD_ALERT_WEBHOOK_URL`)과 동일 채널 사용
- `HighErrorLogRate`: API 또는 Bot에서 분당 평균 0.1건 초과 에러 로그 발생 시 경고
- `DiscordRateLimited`: Bot이 Discord API Rate Limit에 걸린 로그가 감지되는 즉시 경고

---

## 데이터 모델

### 신규 테이블

없음. Prometheus가 시계열 데이터를 자체 스토리지(`/prometheus-data` 볼륨)에 저장한다. 애플리케이션 DB에는 모니터링 전용 테이블이 존재하지 않는다.

### 제거된 테이블

- `bot_metric` — Deprecated 처리. 마이그레이션 시 드롭 예정 (상세 내역은 [Deprecated](#deprecated-제거-예정) 섹션 참조)

---

## Redis 키 구조

모니터링 도메인에서 사용하는 Redis 키는 없다. 기존 `monitoring:status` 키는 제거된다 (상세 내역은 [Deprecated](#deprecated-제거-예정) 섹션 참조).

---

## 외부 의존성

| 서비스 | 용도 |
|--------|------|
| Discord.js Client | `ws.ping`, `guilds.cache.size`, `uptime`, `voiceStates.cache` 조회 (Bot 서버 내 직접 접근) |
| Prometheus | 메트릭 스크레이프 및 시계열 저장 (`prom/prometheus:latest`) |
| Grafana | 대시보드 시각화 및 프로비저닝 (`grafana/grafana:latest`) |
| Alertmanager | 알림 라우팅 및 Discord Webhook 발송 (`prom/alertmanager:latest`) |
| Node Exporter | 호스트 시스템(CPU/메모리/디스크) 메트릭 수집 (`prom/node-exporter:latest`) |
| postgres-exporter | PostgreSQL 커넥션·쿼리 메트릭 수집 (`prometheuscommunity/postgres-exporter`) |
| redis-exporter | Redis 메모리·히트율 메트릭 수집 (`oliver006/redis_exporter`) |
| Loki | 컨테이너 로그 저장·인덱싱·쿼리 엔진 (`grafana/loki:latest`) |
| Promtail | Docker 소켓 기반 컨테이너 로그 수집 및 Loki 전송 (`grafana/promtail:latest`) |

---

## Health Check 엔드포인트

기존 Health Check는 변경 없이 유지된다.

- **`GET /health`**: 전체 readiness 확인 (PostgreSQL + Redis + Discord Gateway)
- **`GET /health/liveness`**: 프로세스 alive 확인
- **인증**: 불필요 (공개 엔드포인트)
- **Rate Limiting**: 제외
- **구현**: `@nestjs/terminus` 기반

---

## Web 도메인 연계

| 연계 지점 | 변경 사항 |
|-----------|-----------|
| 모니터링 대시보드 페이지 (`/dashboard/guild/{guildId}/monitoring`) | **제거 예정** — `F-WEB-MONITORING-001` Deprecated 처리. 해당 페이지 및 사이드바 항목 삭제 |
| Next.js API 프록시 (`/api/guilds/:guildId/bot/*`) | **제거 예정** — `GET /api/guilds/:guildId/bot/status`, `GET /api/guilds/:guildId/bot/metrics` 프록시 라우트 삭제 |
| Grafana 대시보드 | 웹 대시보드 대체. 내부 인프라 접근 (포트 3002)으로 별도 운영 |

---

## Deprecated (제거 예정)

아래 기능들은 Prometheus + Grafana 전환으로 인해 제거 예정이다. 코드 및 마이그레이션 작업은 별도 티켓으로 진행한다.

| 항목 | 설명 |
|------|------|
| **F-MONITORING-001** | 실시간 봇 상태 조회 API (`GET /api/guilds/:guildId/bot/status`) |
| **F-MONITORING-002** | 메트릭 수집 스케줄러 (`@Cron('*/1 * * * *')`, `BotMetric` INSERT) |
| **F-MONITORING-003** | 시계열 메트릭 조회 API (`GET /api/guilds/:guildId/bot/metrics`) |
| **F-MONITORING-004** | 메트릭 보존 정책 (30일 삭제 크론, `@Cron('0 3 * * *')`) |
| **F-WEB-MONITORING-001** | 모니터링 대시보드 페이지 (`/dashboard/guild/{guildId}/monitoring`) — recharts 차트 4종 (UptimeChart, PingChart, MemoryChart, VoiceUserChart), StatusCards |
| **데이터 모델** | `BotMetric` 엔티티 및 `bot_metric` 테이블 — 드롭 예정 |
| **Redis 키** | `monitoring:status` (TTL 10초), `monitoring:bot-status` — 제거 |
| **Bot 메트릭 전송** | `BotMonitoringScheduler`, `pushBotMetrics()`, `pushBotStatus()` — 제거 |
| **API 클라이언트** | `apps/web/app/lib/monitoring-api.ts` (`fetchBotStatus`, `fetchBotMetrics`) — 제거 |
| **DashboardSidebar** | "봇 모니터링" 사이드바 항목 (시스템 그룹) — 제거 |
