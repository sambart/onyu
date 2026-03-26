# Monitoring 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

봇 및 인프라 상태를 Prometheus + Grafana 기반으로 모니터링하는 도메인이다. API 서버와 Bot 서버 각각에서 `prom-client`로 메트릭을 노출하고, Prometheus가 주기적으로 스크레이프하여 Grafana 대시보드와 Alertmanager를 통해 시각화 및 알림을 제공한다.

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

### 인프라 (`infra/`)

- `infra/prometheus/prometheus.yml` — Prometheus 스크레이프 설정
- `infra/prometheus/alert.rules.yml` — Alertmanager 알림 규칙
- `infra/grafana/provisioning/datasources/prometheus.yaml` — Grafana datasource 프로비저닝
- `infra/grafana/provisioning/dashboards/` — Grafana 대시보드 JSON 자동 등록 디렉터리
- `docker-compose.yml` — Prometheus, Grafana, Exporter 서비스 추가

---

## 아키텍처

```
[API 서버 :3000]                  [Bot 서버 :3001]
  GET /metrics                      GET /metrics
  (prom-client)                     (prom-client)
       │                                 │
       └─────────────┬───────────────────┘
                     │ scrape (15s 간격)
                     ▼
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
  - 봇 상태 대시보드
  - 인프라 대시보드

[Node Exporter :9100]  ──scrape──►  Prometheus
[postgres-exporter :9187]  ────────►  Prometheus
[redis-exporter :9121]  ───────────►  Prometheus
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
- 대시보드 자동 등록: `infra/grafana/provisioning/dashboards/` 디렉터리 내 JSON 파일을 시작 시 자동 로드 (상세 내역은 F-MONITORING-012 참조)
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
