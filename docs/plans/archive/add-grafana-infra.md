# Prometheus + Grafana + Exporter 인프라 구현 계획

> 최종 업데이트: 2026-03-26

## 개요

Prometheus + Grafana + Alertmanager + Exporter 스택을 Docker Compose로 구성하여 봇/API/인프라 모니터링 환경을 구축한다. PRD의 F-MONITORING-011, F-MONITORING-012 스펙을 기반으로 한다.

## 변경 범위 요약

| 구분 | 내용 |
|------|------|
| 신규 파일 (7개) | `infra/prometheus/prometheus.yml`, `infra/prometheus/alert.rules.yml`, `infra/alertmanager/alertmanager.yml`, `infra/grafana/provisioning/datasources/prometheus.yaml`, `infra/grafana/provisioning/dashboards/dashboard.yaml`, `infra/grafana/provisioning/dashboards/onyu-bot-status.json`, `infra/grafana/provisioning/dashboards/onyu-infra.json` |
| 수정 파일 (4개) | `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`, `.env.prod.example` |
| Docker 서비스 추가 (6개) | prometheus, grafana, alertmanager, node-exporter, postgres-exporter, redis-exporter |

## 전제 조건

- API 서버(`apps/api`)와 Bot 서버(`apps/bot`)에 `GET /metrics` 엔드포인트가 구현되어 있어야 한다 (F-MONITORING-010 범위, 본 계획과는 별도).
- 본 계획은 순수 인프라(Docker Compose + 설정 파일) 구성만 다룬다.

---

## Phase 1: 디렉토리 구조 생성

```
infra/
  prometheus/
    prometheus.yml
    alert.rules.yml
  alertmanager/
    alertmanager.yml
  grafana/
    provisioning/
      datasources/
        prometheus.yaml
      dashboards/
        dashboard.yaml
        onyu-bot-status.json
        onyu-infra.json
```

---

## Phase 2: Prometheus 설정

### 2-1. 스크레이프 설정

**파일**: `infra/prometheus/prometheus.yml` (신규)

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

**설명**:
- `scrape_interval: 15s`: 모든 타겟을 15초 간격으로 스크레이프
- `evaluation_interval: 15s`: 알림 규칙 평가 주기
- 5개 scrape target: API(3000), Bot(3001), Node Exporter(9100), PostgreSQL Exporter(9187), Redis Exporter(9121)
- 모든 서비스명은 Docker Compose 내부 DNS 이름 사용

### 2-2. 알림 규칙

**파일**: `infra/prometheus/alert.rules.yml` (신규)

```yaml
groups:
  - name: onyu-alerts
    rules:
      - alert: BotDown
        expr: up{job="onyu-bot"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "봇 서버 다운"
          description: "onyu-bot 서버가 2분 이상 응답하지 않습니다."

      - alert: ApiDown
        expr: up{job="onyu-api"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API 서버 다운"
          description: "onyu-api 서버가 2분 이상 응답하지 않습니다."

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 > 512
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "메모리 사용량 512MB 초과"
          description: "{{ $labels.job }}의 메모리 사용량이 {{ $value | printf \"%.0f\" }}MB로 5분 이상 512MB를 초과합니다."

      - alert: HighGatewayPing
        expr: discord_gateway_ping_ms > 500
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "Discord 핑 500ms 초과"
          description: "Discord Gateway 핑이 {{ $value | printf \"%.0f\" }}ms로 3분 이상 500ms를 초과합니다."

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "5xx 에러율 높음"
          description: "{{ $labels.job }}의 5xx 에러율이 5분 이상 초당 0.1건을 초과합니다."
```

**알림 규칙 요약**:

| 규칙 | 조건 | 지속 시간 | 심각도 |
|------|------|-----------|--------|
| BotDown | `up{job="onyu-bot"} == 0` | 2분 | critical |
| ApiDown | `up{job="onyu-api"} == 0` | 2분 | critical |
| HighMemoryUsage | RSS > 512MB | 5분 | warning |
| HighGatewayPing | 핑 > 500ms | 3분 | warning |
| HighErrorRate | 5xx rate > 0.1/s | 5분 | warning |

---

## Phase 3: Alertmanager 설정

**파일**: `infra/alertmanager/alertmanager.yml` (신규)

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'discord-webhook'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'discord-webhook'
      group_wait: 0s
      group_interval: 1m
      repeat_interval: 1h
    - match:
        severity: warning
      receiver: 'discord-webhook'
      group_wait: 5m
      group_interval: 5m
      repeat_interval: 4h

receivers:
  - name: 'discord-webhook'
    webhook_configs:
      - url: '${DISCORD_ALERT_WEBHOOK_URL}'
        send_resolved: true
```

**설명**:
- critical 알림: `group_wait: 0s`로 즉시 발송, 1시간 반복 간격
- warning 알림: `group_wait: 5m`으로 5분 그룹화 후 발송, 4시간 반복 간격
- `send_resolved: true`: 알림 해소 시에도 알림 발송
- `DISCORD_ALERT_WEBHOOK_URL` 환경변수로 Discord Webhook URL 주입

> **참고**: Alertmanager는 네이티브 환경변수 치환을 지원하지 않는다. `${DISCORD_ALERT_WEBHOOK_URL}`을 런타임에 치환하려면 두 가지 방안 중 하나를 선택해야 한다:
> 1. **envsubst 방식**: Docker Compose `entrypoint`에서 `envsubst`로 설정 파일을 템플릿 렌더링 후 기동 (본 계획에서 채택)
> 2. **직접 기입**: `.env.prod`에서 URL을 설정 파일에 직접 하드코딩

본 계획에서는 `docker-compose.yml`의 alertmanager 서비스에 entrypoint 오버라이드를 적용하여 envsubst 처리한다 (Phase 5 참조).

---

## Phase 4: Grafana 프로비저닝

### 4-1. Datasource 자동 등록

**파일**: `infra/grafana/provisioning/datasources/prometheus.yaml` (신규)

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### 4-2. 대시보드 프로비저닝 설정

**파일**: `infra/grafana/provisioning/dashboards/dashboard.yaml` (신규)

```yaml
apiVersion: 1

providers:
  - name: 'onyu-dashboards'
    orgId: 1
    folder: 'Onyu'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: false
```

### 4-3. 봇 상태 대시보드

**파일**: `infra/grafana/provisioning/dashboards/onyu-bot-status.json` (신규)

대시보드 JSON의 핵심 구조:

```json
{
  "dashboard": {
    "title": "Onyu Bot Status",
    "uid": "onyu-bot-status",
    "tags": ["onyu", "bot"],
    "timezone": "Asia/Seoul",
    "templating": {
      "list": [
        {
          "name": "interval",
          "type": "interval",
          "query": "1m,5m,15m,1h",
          "current": { "text": "5m", "value": "5m" }
        }
      ]
    },
    "panels": [
      {
        "title": "봇 업타임",
        "type": "stat",
        "targets": [{ "expr": "bot_uptime_seconds" }],
        "fieldConfig": {
          "defaults": { "unit": "dtdurations" }
        },
        "gridPos": { "h": 4, "w": 8, "x": 0, "y": 0 }
      },
      {
        "title": "참여 서버 수",
        "type": "stat",
        "targets": [{ "expr": "discord_guild_count" }],
        "gridPos": { "h": 4, "w": 8, "x": 8, "y": 0 }
      },
      {
        "title": "봇 가용성 (1h)",
        "type": "gauge",
        "targets": [{ "expr": "avg_over_time(up{job=\"onyu-bot\"}[1h]) * 100" }],
        "fieldConfig": {
          "defaults": { "unit": "percent", "min": 0, "max": 100,
            "thresholds": {
              "steps": [
                { "color": "red", "value": 0 },
                { "color": "yellow", "value": 90 },
                { "color": "green", "value": 99 }
              ]
            }
          }
        },
        "gridPos": { "h": 4, "w": 8, "x": 16, "y": 0 }
      },
      {
        "title": "Discord 핑 추이",
        "type": "timeseries",
        "targets": [{ "expr": "discord_gateway_ping_ms", "legendFormat": "ping" }],
        "fieldConfig": {
          "defaults": { "unit": "ms",
            "custom": { "thresholdsStyle": { "mode": "line" } },
            "thresholds": {
              "steps": [
                { "color": "green", "value": 0 },
                { "color": "red", "value": 500 }
              ]
            }
          }
        },
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 }
      },
      {
        "title": "메모리 사용량 추이",
        "type": "timeseries",
        "targets": [
          { "expr": "process_heap_bytes{type=\"used\"} / 1024 / 1024", "legendFormat": "Heap Used (MB)" },
          { "expr": "process_heap_bytes{type=\"total\"} / 1024 / 1024", "legendFormat": "Heap Total (MB)" }
        ],
        "fieldConfig": {
          "defaults": { "unit": "decmbytes" }
        },
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 }
      },
      {
        "title": "음성 접속자 수",
        "type": "timeseries",
        "targets": [{ "expr": "discord_voice_users_total", "legendFormat": "{{ guildId }}" }],
        "gridPos": { "h": 8, "w": 24, "x": 0, "y": 12 }
      }
    ]
  }
}
```

**패널 6개**:

| 패널 | 타입 | 메트릭 | 위치 |
|------|------|--------|------|
| 봇 업타임 | Stat | `bot_uptime_seconds` | 상단 좌측 |
| 참여 서버 수 | Stat | `discord_guild_count` | 상단 중앙 |
| 봇 가용성 (1h) | Gauge | `avg_over_time(up{job="onyu-bot"}[1h]) * 100` | 상단 우측 |
| Discord 핑 추이 | Time Series | `discord_gateway_ping_ms` (500ms 임계선) | 중단 좌측 |
| 메모리 사용량 추이 | Time Series | `process_heap_bytes` (used/total) | 중단 우측 |
| 음성 접속자 수 | Time Series | `discord_voice_users_total` (guildId별) | 하단 전체 |

### 4-4. 인프라 대시보드

**파일**: `infra/grafana/provisioning/dashboards/onyu-infra.json` (신규)

대시보드 JSON의 핵심 구조:

```json
{
  "dashboard": {
    "title": "Onyu Infrastructure",
    "uid": "onyu-infra",
    "tags": ["onyu", "infra"],
    "timezone": "Asia/Seoul",
    "templating": {
      "list": [
        {
          "name": "interval",
          "type": "interval",
          "query": "1m,5m,15m,1h",
          "current": { "text": "5m", "value": "5m" }
        }
      ]
    },
    "panels": [
      {
        "title": "호스트 CPU 사용률",
        "type": "timeseries",
        "targets": [{
          "expr": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[$interval])) * 100)",
          "legendFormat": "CPU Usage %"
        }],
        "fieldConfig": { "defaults": { "unit": "percent", "max": 100 } },
        "gridPos": { "h": 8, "w": 8, "x": 0, "y": 0 }
      },
      {
        "title": "호스트 메모리 사용률",
        "type": "timeseries",
        "targets": [{
          "expr": "(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100",
          "legendFormat": "Memory Usage %"
        }],
        "fieldConfig": { "defaults": { "unit": "percent", "max": 100 } },
        "gridPos": { "h": 8, "w": 8, "x": 8, "y": 0 }
      },
      {
        "title": "호스트 디스크 I/O",
        "type": "timeseries",
        "targets": [
          { "expr": "rate(node_disk_read_bytes_total[$interval])", "legendFormat": "Read" },
          { "expr": "rate(node_disk_written_bytes_total[$interval])", "legendFormat": "Write" }
        ],
        "fieldConfig": { "defaults": { "unit": "Bps" } },
        "gridPos": { "h": 8, "w": 8, "x": 16, "y": 0 }
      },
      {
        "title": "PostgreSQL 커넥션 수",
        "type": "timeseries",
        "targets": [{
          "expr": "pg_stat_activity_count",
          "legendFormat": "{{ state }}"
        }],
        "gridPos": { "h": 8, "w": 8, "x": 0, "y": 8 }
      },
      {
        "title": "PostgreSQL 쿼리 처리량",
        "type": "timeseries",
        "targets": [
          { "expr": "rate(pg_stat_database_tup_fetched{datname=\"onyu\"}[$interval])", "legendFormat": "Fetched/s" },
          { "expr": "rate(pg_stat_database_tup_inserted{datname=\"onyu\"}[$interval])", "legendFormat": "Inserted/s" },
          { "expr": "rate(pg_stat_database_tup_updated{datname=\"onyu\"}[$interval])", "legendFormat": "Updated/s" },
          { "expr": "rate(pg_stat_database_tup_deleted{datname=\"onyu\"}[$interval])", "legendFormat": "Deleted/s" }
        ],
        "fieldConfig": { "defaults": { "unit": "ops" } },
        "gridPos": { "h": 8, "w": 8, "x": 8, "y": 8 }
      },
      {
        "title": "Redis 메모리 사용량",
        "type": "timeseries",
        "targets": [{
          "expr": "redis_memory_used_bytes / 1024 / 1024",
          "legendFormat": "Used (MB)"
        }],
        "fieldConfig": { "defaults": { "unit": "decmbytes" } },
        "gridPos": { "h": 8, "w": 8, "x": 16, "y": 8 }
      },
      {
        "title": "Redis 캐시 히트율",
        "type": "gauge",
        "targets": [{
          "expr": "redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) * 100",
          "legendFormat": "Hit Rate %"
        }],
        "fieldConfig": {
          "defaults": { "unit": "percent", "min": 0, "max": 100,
            "thresholds": {
              "steps": [
                { "color": "red", "value": 0 },
                { "color": "yellow", "value": 80 },
                { "color": "green", "value": 95 }
              ]
            }
          }
        },
        "gridPos": { "h": 8, "w": 8, "x": 0, "y": 16 }
      },
      {
        "title": "HTTP 요청 처리율",
        "type": "timeseries",
        "targets": [{
          "expr": "sum(rate(http_requests_total[$interval])) by (status)",
          "legendFormat": "{{ status }}"
        }],
        "fieldConfig": { "defaults": { "unit": "reqps" } },
        "gridPos": { "h": 8, "w": 8, "x": 8, "y": 16 }
      },
      {
        "title": "HTTP p95 응답시간",
        "type": "timeseries",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[$interval])) by (le))",
          "legendFormat": "p95"
        }],
        "fieldConfig": { "defaults": { "unit": "s" } },
        "gridPos": { "h": 8, "w": 8, "x": 16, "y": 16 }
      }
    ]
  }
}
```

**패널 9개**:

| 패널 | 타입 | 메트릭 소스 | 위치 |
|------|------|------------|------|
| 호스트 CPU 사용률 | Time Series | node-exporter | 1행 좌측 |
| 호스트 메모리 사용률 | Time Series | node-exporter | 1행 중앙 |
| 호스트 디스크 I/O | Time Series | node-exporter | 1행 우측 |
| PG 커넥션 수 | Time Series | postgres-exporter | 2행 좌측 |
| PG 쿼리 처리량 | Time Series | postgres-exporter | 2행 중앙 |
| Redis 메모리 사용량 | Time Series | redis-exporter | 2행 우측 |
| Redis 캐시 히트율 | Gauge | redis-exporter | 3행 좌측 |
| HTTP 요청 처리율 | Time Series | API http_requests_total | 3행 중앙 |
| HTTP p95 응답시간 | Time Series | API http_request_duration_seconds | 3행 우측 |

---

## Phase 5: Docker Compose 수정

### 5-1. docker-compose.yml (개발 환경)

기존 `volumes:` 섹션 위에 6개 서비스를 추가하고, volumes에 `prometheus_data`, `grafana_data`를 추가한다.

**추가할 서비스 블록**:

```yaml
  # ─── Monitoring Stack ─────────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./infra/prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    depends_on:
      - api
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${GF_SECURITY_ADMIN_USER:-admin}
      - GF_SECURITY_ADMIN_PASSWORD=${GF_SECURITY_ADMIN_PASSWORD:-admin}
      - GF_SERVER_ROOT_URL=http://localhost:3002
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    ports:
      - "9093:9093"
    environment:
      - DISCORD_ALERT_WEBHOOK_URL=${DISCORD_ALERT_WEBHOOK_URL:-http://localhost/placeholder}
    volumes:
      - ./infra/alertmanager:/etc/alertmanager-tmpl
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        cat /etc/alertmanager-tmpl/alertmanager.yml | sed "s|\$${DISCORD_ALERT_WEBHOOK_URL}|$$DISCORD_ALERT_WEBHOOK_URL|g" > /tmp/alertmanager.yml && \
        /bin/alertmanager --config.file=/tmp/alertmanager.yml --storage.path=/alertmanager
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter
    container_name: postgres-exporter
    ports:
      - "9187:9187"
    environment:
      DATA_SOURCE_NAME: "postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}?sslmode=disable"
    depends_on:
      - db
    restart: unless-stopped

  redis-exporter:
    image: oliver006/redis_exporter
    container_name: redis-exporter
    ports:
      - "9121:9121"
    environment:
      REDIS_ADDR: "redis://redis:6379"
    depends_on:
      - redis
    restart: unless-stopped
```

**volumes 섹션에 추가**:

```yaml
  prometheus_data:
  grafana_data:
```

### 5-2. docker-compose.prod.yml (프로덕션 환경)

프로덕션에서는 포트 외부 노출을 제한하고, 보안 설정을 강화한다.

**추가할 서비스 블록**:

```yaml
  # ─── Monitoring Stack ─────────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus-prod
    # ports: 외부 노출하지 않음 — Grafana에서 내부 접근
    volumes:
      - ./infra/prometheus:/etc/prometheus
      - prometheus_data_prod:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    depends_on:
      api:
        condition: service_started
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana-prod
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=${GF_SECURITY_ADMIN_USER}
      - GF_SECURITY_ADMIN_PASSWORD=${GF_SECURITY_ADMIN_PASSWORD}
      - GF_SERVER_ROOT_URL=http://${SERVER_HOST}:3002
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning
      - grafana_data_prod:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_started
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager-prod
    # ports: 외부 노출하지 않음
    environment:
      - DISCORD_ALERT_WEBHOOK_URL=${DISCORD_ALERT_WEBHOOK_URL}
    volumes:
      - ./infra/alertmanager:/etc/alertmanager-tmpl
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        cat /etc/alertmanager-tmpl/alertmanager.yml | sed "s|\$${DISCORD_ALERT_WEBHOOK_URL}|$$DISCORD_ALERT_WEBHOOK_URL|g" > /tmp/alertmanager.yml && \
        /bin/alertmanager --config.file=/tmp/alertmanager.yml --storage.path=/alertmanager
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter-prod
    # ports: 외부 노출하지 않음
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter
    container_name: postgres-exporter-prod
    # ports: 외부 노출하지 않음
    environment:
      DATA_SOURCE_NAME: "postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}?sslmode=disable"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  redis-exporter:
    image: oliver006/redis_exporter
    container_name: redis-exporter-prod
    # ports: 외부 노출하지 않음
    environment:
      REDIS_ADDR: "redis://redis:6379"
      REDIS_PASSWORD: "${REDIS_PASSWORD}"
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
```

**volumes 섹션에 추가**:

```yaml
  prometheus_data_prod:
    external: true
    name: nestjs-onyu_prometheus_data_prod
  grafana_data_prod:
    external: true
    name: nestjs-onyu_grafana_data_prod
```

**개발 vs 프로덕션 차이점**:

| 항목 | 개발 (docker-compose.yml) | 프로덕션 (docker-compose.prod.yml) |
|------|--------------------------|----------------------------------|
| Prometheus 포트 | `9090:9090` 외부 노출 | 포트 노출 없음 (내부만) |
| Grafana 포트 | `3002:3000` 외부 노출 | `3002:3000` 외부 노출 |
| Alertmanager 포트 | `9093:9093` 외부 노출 | 포트 노출 없음 |
| Exporter 포트 | 모두 외부 노출 | 모두 포트 노출 없음 |
| Grafana 비밀번호 | 기본값 `admin` | 환경변수 필수 (기본값 없음) |
| Redis Exporter | 비밀번호 없음 | `REDIS_PASSWORD` 환경변수 사용 |
| 볼륨 | 자동 생성 | `external: true` (수동 생성 필수) |
| depends_on | 단순 참조 | `condition: service_healthy` |

---

## Phase 6: 환경변수 추가

### 6-1. `.env.example` 에 추가할 항목

```env
# ─── Monitoring ──────────────────────────────────────────
# Grafana admin 계정
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin

# Alertmanager Discord Webhook URL
DISCORD_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

### 6-2. `.env.prod.example` 에 추가할 항목

```env
# ─── Monitoring ──────────────────────────────────────────
# Grafana admin 계정 (프로덕션에서는 반드시 변경)
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=CHANGE_ME_STRONG_GRAFANA_PASSWORD

# Alertmanager Discord Webhook URL
DISCORD_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

---

## 작업 체크리스트

### Phase 1: 디렉토리 구조 생성
- [ ] `infra/prometheus/` 디렉토리 생성
- [ ] `infra/alertmanager/` 디렉토리 생성
- [ ] `infra/grafana/provisioning/datasources/` 디렉토리 생성
- [ ] `infra/grafana/provisioning/dashboards/` 디렉토리 생성

### Phase 2: Prometheus 설정
- [ ] `infra/prometheus/prometheus.yml` 작성
- [ ] `infra/prometheus/alert.rules.yml` 작성

### Phase 3: Alertmanager 설정
- [ ] `infra/alertmanager/alertmanager.yml` 작성

### Phase 4: Grafana 프로비저닝
- [ ] `infra/grafana/provisioning/datasources/prometheus.yaml` 작성
- [ ] `infra/grafana/provisioning/dashboards/dashboard.yaml` 작성
- [ ] `infra/grafana/provisioning/dashboards/onyu-bot-status.json` 작성 (전체 JSON)
- [ ] `infra/grafana/provisioning/dashboards/onyu-infra.json` 작성 (전체 JSON)

### Phase 5: Docker Compose 수정
- [ ] `docker-compose.yml`에 6개 서비스 추가 + volumes 추가
- [ ] `docker-compose.prod.yml`에 6개 서비스 추가 + volumes 추가

### Phase 6: 환경변수 추가
- [ ] `.env.example`에 모니터링 관련 변수 추가
- [ ] `.env.prod.example`에 모니터링 관련 변수 추가

### 프로덕션 배포 전 사전 작업
- [ ] Docker 볼륨 수동 생성: `docker volume create nestjs-onyu_prometheus_data_prod`
- [ ] Docker 볼륨 수동 생성: `docker volume create nestjs-onyu_grafana_data_prod`
- [ ] Discord Webhook URL 생성 후 `.env.prod`에 설정
- [ ] Grafana admin 비밀번호 `.env.prod`에 설정

---

## 포트 매핑 요약

| 서비스 | 내부 포트 | 외부 포트 (개발) | 외부 포트 (프로덕션) |
|--------|-----------|-----------------|---------------------|
| API | 3000 | 3000 | 3000 |
| Bot | 3001 | - | - |
| Grafana | 3000 | 3002 | 3002 |
| Prometheus | 9090 | 9090 | - |
| Alertmanager | 9093 | 9093 | - |
| Node Exporter | 9100 | 9100 | - |
| PostgreSQL Exporter | 9187 | 9187 | - |
| Redis Exporter | 9121 | 9121 | - |

---

## 네트워크 토폴로지

모든 서비스는 Docker Compose의 기본 브릿지 네트워크(`default`)를 공유한다. 별도의 커스텀 네트워크는 생성하지 않는다. 기존 서비스(api, bot, db, redis)와 모니터링 서비스 간 통신은 Docker 내부 DNS를 통해 서비스명으로 접근한다.

```
[브라우저] --:3002--> [grafana] --내부--> [prometheus] --내부--> [api:3000]
                                                             [bot:3001]
                                                             [node-exporter:9100]
                                                             [postgres-exporter:9187]
                                                             [redis-exporter:9121]
                                    [prometheus] --내부--> [alertmanager] --> Discord Webhook
                      [postgres-exporter] --내부--> [db:5432]
                      [redis-exporter] --내부--> [redis:6379]
```
