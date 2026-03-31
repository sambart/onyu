# Loki + Promtail 로그 수집 인프라 구현 계획

> 최종 업데이트: 2026-03-27

## 개요

Loki + Promtail 로그 수집 인프라를 Docker Compose에 추가하고, Grafana에 Loki datasource를 등록하여 메트릭과 로그를 통합 조회할 수 있는 환경을 구축한다. PRD의 F-MONITORING-020, F-MONITORING-022, F-MONITORING-023 스펙을 기반으로 한다.

## 변경 범위 요약

| 구분 | 내용 |
|------|------|
| 신규 파일 (4개) | `infra/loki/loki-config.yaml`, `infra/promtail/promtail-config.yaml`, `infra/grafana/provisioning/datasources/loki.yaml`, `infra/grafana/provisioning/alerting/loki-alert-rules.yaml` |
| 수정 파일 (4개) | `docker-compose.yml`, `docker-compose.prod.yml`, `infra/grafana/provisioning/dashboards/onyu-bot-status.json`, `infra/grafana/provisioning/dashboards/onyu-infra.json` |
| Docker 서비스 추가 (2개) | loki, promtail |
| Docker 볼륨 추가 (1개) | loki_data (dev) / loki_data_prod (prod) |

## 전제 조건

- Prometheus + Grafana 인프라가 이미 docker-compose.yml에 구성되어 있어야 한다 (add-grafana-infra.md 완료 상태).
- Bot 서버의 nestjs-pino 구조화 로깅 전환(F-MONITORING-021)은 본 계획과 독립적으로 진행 가능하지만, JSON 파싱 파이프라인이 정상 동작하려면 Bot 서버가 JSON 로그를 출력해야 한다.

## 기존 코드 충돌 여부

- `docker-compose.yml` / `docker-compose.prod.yml`: 서비스 및 볼륨 추가만 수행하므로 기존 서비스와 충돌 없음.
- `onyu-bot-status.json` / `onyu-infra.json`: 기존 패널 ID 최대값(각각 6, 9) 이후로 새 패널 ID를 부여하여 충돌 없음.
- `infra/grafana/provisioning/datasources/`: 기존 `prometheus.yaml`과 별도 파일(`loki.yaml`)로 추가하므로 충돌 없음.

---

## Phase 1: Loki 설정 파일

### 1-1. 디렉토리 생성

```
infra/
  loki/
    loki-config.yaml     (신규)
  promtail/
    promtail-config.yaml  (신규)
```

### 1-2. Loki 서버 설정

**파일**: `infra/loki/loki-config.yaml` (신규)

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
  retention_period: 720h  # 30일

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
```

**설계 의도**:

- `auth_enabled: false` -- 내부 Docker 네트워크 전용이므로 인증 불필요
- `store: inmemory` -- 단일 인스턴스 구성이므로 분산 KV 스토어 불필요
- `replication_factor: 1` -- 단일 인스턴스 운영
- `boltdb-shipper` + `filesystem` -- 로컬 파일시스템 스토리지 (Docker 볼륨으로 영속화)
- `retention_period: 720h` -- Prometheus와 동일한 30일 보존 정책
- `compactor.retention_enabled: true` -- 보존 기간 초과 로그를 실제로 삭제하려면 compactor에서 retention을 활성화해야 함

---

## Phase 2: Promtail 설정 파일

**파일**: `infra/promtail/promtail-config.yaml` (신규)

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

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
      # 컨테이너 이름 라벨
      - source_labels: [__meta_docker_container_name]
        regex: /(.*)
        target_label: container_name
      # Compose 서비스 이름 라벨
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        target_label: compose_service
      # job 라벨 고정
      - target_label: job
        replacement: docker
      # 모니터링 스택 제외: prometheus, grafana, alertmanager, node-exporter, postgres-exporter, redis-exporter, loki, promtail
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        regex: (prometheus|grafana|alertmanager|node-exporter|postgres-exporter|redis-exporter|loki|promtail)
        action: drop
    pipeline_stages:
      # Docker JSON 로그 드라이버 파싱
      - docker: {}
      # nestjs-pino JSON 로그 파싱 (Bot/API 서버)
      - json:
          expressions:
            level: level
            msg: msg
            time: time
      # level 라벨 추가
      - labels:
          level:
      # 타임스탬프 추출 (pino 형식: epoch milliseconds)
      - timestamp:
          source: time
          format: UnixMs
          fallback_formats:
            - RFC3339
            - RFC3339Nano
```

**설계 의도**:

- `docker_sd_configs` -- Docker 소켓을 통해 실행 중인 컨테이너를 자동 발견
- `filters` -- `com.docker.compose.project` 라벨이 있는 컨테이너만 대상 (Docker Compose로 관리되는 컨테이너)
- `relabel_configs`의 `drop` 액션 -- 모니터링 스택 자체의 로그는 수집하지 않음 (수집 대상: api, bot, web, lavalink, db, redis)
- `__meta_docker_container_name`의 regex `/(.*)` -- Docker 컨테이너 이름에 붙는 선행 슬래시 제거
- `pipeline_stages` 순서:
  1. `docker` -- Docker JSON 로그 형식 파싱 (stdout/stderr 분리)
  2. `json` -- nestjs-pino가 출력하는 JSON 구조에서 level, msg, time 추출
  3. `labels` -- level을 인덱싱 가능한 라벨로 승격
  4. `timestamp` -- 로그 본문의 타임스탬프를 Loki 타임스탬프로 사용 (UnixMs 우선, RFC3339 폴백)
- `positions` -- Promtail 재시작 시 마지막 읽은 위치를 기억하여 중복 수집 방지

---

## Phase 3: Grafana Loki datasource

**파일**: `infra/grafana/provisioning/datasources/loki.yaml` (신규)

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

**설계 의도**:

- 기존 `prometheus.yaml`과 동일한 프로비저닝 방식
- `isDefault: false` -- Prometheus가 기본 datasource로 유지됨
- `access: proxy` -- Grafana 서버가 Loki에 프록시 요청 (브라우저 직접 접근 차단)

---

## Phase 4: 기존 Grafana 대시보드 수정

### 4-1. onyu-bot-status.json -- Error Logs 패널 추가

**파일**: `infra/grafana/provisioning/dashboards/onyu-bot-status.json` (수정)

기존 패널 ID 최대값: 6. 새 패널 ID는 7부터 시작.

**추가할 패널**:

```json
{
  "id": 7,
  "title": "Error Logs (API/Bot)",
  "type": "logs",
  "datasource": {
    "type": "loki",
    "uid": "${DS_LOKI}"
  },
  "targets": [
    {
      "expr": "{compose_service=~\"api|bot\"} |= \"ERROR\"",
      "refId": "A"
    }
  ],
  "options": {
    "showTime": true,
    "showLabels": true,
    "showCommonLabels": false,
    "wrapLogMessage": true,
    "prettifyLogMessage": false,
    "enableLogDetails": true,
    "sortOrder": "Descending",
    "dedupStrategy": "none"
  },
  "gridPos": { "h": 10, "w": 24, "x": 0, "y": 20 }
}
```

**`__inputs` 및 `__requires` 배열에 Loki datasource 추가**:

```json
// __inputs 배열에 추가
{
  "name": "DS_LOKI",
  "label": "Loki",
  "description": "",
  "type": "datasource",
  "pluginId": "loki",
  "pluginName": "Loki"
}

// __requires 배열에 추가
{
  "type": "datasource",
  "id": "loki",
  "name": "Loki",
  "version": "1.0.0"
}
```

**배치 위치**: 기존 마지막 패널(id: 6, "음성 접속자 수")의 y=12, h=8 이후인 y=20에 배치.

### 4-2. onyu-infra.json -- Slow Requests + 5xx Errors 패널 추가

**파일**: `infra/grafana/provisioning/dashboards/onyu-infra.json` (수정)

기존 패널 ID 최대값: 9. 새 패널 ID는 10부터 시작.

**추가할 패널 2개**:

```json
{
  "id": 10,
  "title": "Slow Requests (>1s)",
  "type": "logs",
  "datasource": {
    "type": "loki",
    "uid": "${DS_LOKI}"
  },
  "targets": [
    {
      "expr": "{compose_service=\"api\"} | json | response_time > 1000",
      "refId": "A"
    }
  ],
  "options": {
    "showTime": true,
    "showLabels": true,
    "showCommonLabels": false,
    "wrapLogMessage": true,
    "prettifyLogMessage": false,
    "enableLogDetails": true,
    "sortOrder": "Descending",
    "dedupStrategy": "none"
  },
  "gridPos": { "h": 10, "w": 12, "x": 0, "y": 24 }
}
```

```json
{
  "id": 11,
  "title": "5xx Errors",
  "type": "logs",
  "datasource": {
    "type": "loki",
    "uid": "${DS_LOKI}"
  },
  "targets": [
    {
      "expr": "{compose_service=\"api\"} | json | status >= 500",
      "refId": "A"
    }
  ],
  "options": {
    "showTime": true,
    "showLabels": true,
    "showCommonLabels": false,
    "wrapLogMessage": true,
    "prettifyLogMessage": false,
    "enableLogDetails": true,
    "sortOrder": "Descending",
    "dedupStrategy": "none"
  },
  "gridPos": { "h": 10, "w": 12, "x": 12, "y": 24 }
}
```

**`__inputs` 및 `__requires`에도 Loki datasource 추가** (bot-status.json과 동일).

**배치 위치**: 기존 마지막 패널(id: 9, "HTTP p95 응답시간")의 y=16, h=8 이후인 y=24에 배치. Slow Requests와 5xx Errors를 12칸씩 나란히 배치.

---

## Phase 5: 로그 기반 알림 규칙 (Grafana Unified Alerting)

### 5-1. 알림 규칙 프로비저닝

**파일**: `infra/grafana/provisioning/alerting/loki-alert-rules.yaml` (신규)

Grafana Unified Alerting의 file-based provisioning을 사용한다. 기존 Prometheus 기반 알림(`alert.rules.yml` -> Alertmanager)과 병행 운영하되, 로그 기반 알림은 Grafana에서 관리한다.

```yaml
apiVersion: 1

groups:
  - orgId: 1
    name: loki-log-alerts
    folder: Onyu
    interval: 1m
    rules:
      - uid: high-error-log-rate
        title: HighErrorLogRate
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300  # 5분
              to: 0
            datasourceUid: loki
            model:
              expr: 'sum(rate({compose_service=~"api|bot"} |= "ERROR" [5m]))'
              refId: A
          - refId: C
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - evaluator:
                    type: gt
                    params: [0.1]
                  operator:
                    type: and
                  reducer:
                    type: last
              refId: C
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API/Bot 에러 로그 발생률이 분당 0.1건을 초과하고 있습니다."

      - uid: discord-rate-limited
        title: DiscordRateLimited
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 60  # 1분
              to: 0
            datasourceUid: loki
            model:
              expr: 'count_over_time({compose_service="bot"} |= "rate limit" [1m])'
              refId: A
          - refId: C
            relativeTimeRange:
              from: 60
              to: 0
            datasourceUid: __expr__
            model:
              type: threshold
              expression: A
              conditions:
                - evaluator:
                    type: gt
                    params: [0]
                  operator:
                    type: and
                  reducer:
                    type: last
              refId: C
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Bot이 Discord API Rate Limit에 걸렸습니다."
```

### 5-2. Grafana 알림 -> Alertmanager 연동

Grafana Unified Alerting은 자체 Contact Point를 통해 알림을 발송할 수 있지만, 기존 Alertmanager와 통합하기 위해 Grafana의 Alertmanager contact point를 사용한다.

**Grafana 환경변수 추가** (docker-compose.yml의 grafana 서비스):

```yaml
environment:
  # 기존 환경변수 유지
  - GF_UNIFIED_ALERTING_ENABLED=true
  - GF_ALERTING_ENABLED=false  # legacy alerting 비활성화
```

**알림 프로비저닝 디렉토리 마운트**: 기존 `./infra/grafana/provisioning:/etc/grafana/provisioning` 볼륨 마운트로 자동 적용됨. Grafana는 시작 시 `provisioning/alerting/` 디렉토리의 YAML 파일을 읽어 알림 규칙을 등록한다.

**Contact Point 프로비저닝**: Grafana의 기본 contact point를 Discord Webhook으로 설정하기 위해 별도 파일을 추가할 수 있으나, 기존 Alertmanager의 Discord Webhook과 중복 설정이 되므로 다음 두 가지 방식 중 택 1:

- **방식 A (권장)**: Grafana의 contact point에서 직접 `DISCORD_ALERT_WEBHOOK_URL`로 발송. Alertmanager를 거치지 않아 단순함.
- **방식 B**: Grafana가 Alertmanager를 external AM으로 연동. 알림 라우팅 규칙을 Alertmanager에서 통합 관리.

본 계획에서는 **방식 A**를 채택하여 단순하게 구성한다. Contact point 프로비저닝은 Phase 5-3에서 다룬다.

### 5-3. Contact Point 프로비저닝

**파일**: `infra/grafana/provisioning/alerting/contact-points.yaml` (신규)

```yaml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: discord-webhook
    receivers:
      - uid: discord-webhook-receiver
        type: discord
        settings:
          url: ${DISCORD_ALERT_WEBHOOK_URL}
        disableResolveMessage: false
```

**파일**: `infra/grafana/provisioning/alerting/notification-policies.yaml` (신규)

```yaml
apiVersion: 1

policies:
  - orgId: 1
    receiver: discord-webhook
    group_by: ['grafana_folder', 'alertname']
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

> 참고: `${DISCORD_ALERT_WEBHOOK_URL}`은 Grafana 컨테이너의 환경변수로 주입된다. Grafana provisioning YAML에서 `${ENV_VAR}` 형태로 환경변수 참조가 가능하다.

---

## Phase 6: docker-compose.yml 수정 (개발 환경)

**파일**: `docker-compose.yml` (수정)

### 6-1. loki 서비스 추가

Monitoring Stack 섹션(`# --- Monitoring Stack ---` 이후)에 추가:

```yaml
  loki:
    image: grafana/loki:latest
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - ./infra/loki/loki-config.yaml:/etc/loki/local-config.yaml
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
```

### 6-2. promtail 서비스 추가

```yaml
  promtail:
    image: grafana/promtail:latest
    container_name: promtail
    volumes:
      - ./infra/promtail/promtail-config.yaml:/etc/promtail/config.yaml
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yaml
    depends_on:
      - loki
    restart: unless-stopped
```

### 6-3. grafana 서비스 수정

기존 grafana 서비스의 `depends_on`에 loki 추가, 환경변수 추가:

```yaml
  grafana:
    # ... 기존 설정 유지
    environment:
      # ... 기존 환경변수 유지
      - GF_UNIFIED_ALERTING_ENABLED=true
      - GF_ALERTING_ENABLED=false
      - DISCORD_ALERT_WEBHOOK_URL=${DISCORD_ALERT_WEBHOOK_URL:-http://localhost/placeholder}
    depends_on:
      - prometheus
      - loki
```

### 6-4. volumes 섹션 추가

```yaml
volumes:
  # ... 기존 볼륨 유지
  loki_data:
```

---

## Phase 7: docker-compose.prod.yml 수정 (프로덕션 환경)

**파일**: `docker-compose.prod.yml` (수정)

### 7-1. loki 서비스 추가 (포트 외부 비노출)

```yaml
  loki:
    image: grafana/loki:latest
    container_name: loki-prod
    # ports: 외부 노출하지 않음 -- 내부 네트워크에서만 접근
    volumes:
      - ./infra/loki/loki-config.yaml:/etc/loki/local-config.yaml
      - loki_data_prod:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
```

### 7-2. promtail 서비스 추가

```yaml
  promtail:
    image: grafana/promtail:latest
    container_name: promtail-prod
    volumes:
      - ./infra/promtail/promtail-config.yaml:/etc/promtail/config.yaml
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yaml
    depends_on:
      loki:
        condition: service_started
    restart: unless-stopped
```

### 7-3. grafana 서비스 수정

```yaml
  grafana:
    # ... 기존 설정 유지
    environment:
      # ... 기존 환경변수 유지
      - GF_UNIFIED_ALERTING_ENABLED=true
      - GF_ALERTING_ENABLED=false
      - DISCORD_ALERT_WEBHOOK_URL=${DISCORD_ALERT_WEBHOOK_URL}
    depends_on:
      prometheus:
        condition: service_started
      loki:
        condition: service_started
```

### 7-4. volumes 섹션 추가

```yaml
volumes:
  # ... 기존 볼륨 유지
  loki_data_prod:
    external: true
    name: nestjs-dhyunbot_loki_data_prod
```

---

## 구현 순서 (체크리스트)

### Step 1: 설정 파일 생성

- [ ] `infra/loki/` 디렉토리 생성
- [ ] `infra/loki/loki-config.yaml` 작성 (Phase 1-2)
- [ ] `infra/promtail/` 디렉토리 생성
- [ ] `infra/promtail/promtail-config.yaml` 작성 (Phase 2)

### Step 2: Grafana 프로비저닝 파일 생성

- [ ] `infra/grafana/provisioning/datasources/loki.yaml` 작성 (Phase 3)
- [ ] `infra/grafana/provisioning/alerting/` 디렉토리 생성
- [ ] `infra/grafana/provisioning/alerting/loki-alert-rules.yaml` 작성 (Phase 5-1)
- [ ] `infra/grafana/provisioning/alerting/contact-points.yaml` 작성 (Phase 5-3)
- [ ] `infra/grafana/provisioning/alerting/notification-policies.yaml` 작성 (Phase 5-3)

### Step 3: 대시보드 수정

- [ ] `onyu-bot-status.json`에 Error Logs 패널 추가 (Phase 4-1)
- [ ] `onyu-bot-status.json`의 `__inputs`, `__requires`에 Loki datasource 추가
- [ ] `onyu-infra.json`에 Slow Requests + 5xx Errors 패널 추가 (Phase 4-2)
- [ ] `onyu-infra.json`의 `__inputs`, `__requires`에 Loki datasource 추가

### Step 4: Docker Compose 수정

- [ ] `docker-compose.yml`에 loki, promtail 서비스 추가 (Phase 6)
- [ ] `docker-compose.yml`의 grafana 서비스에 depends_on, 환경변수 추가
- [ ] `docker-compose.yml`의 volumes에 `loki_data` 추가
- [ ] `docker-compose.prod.yml`에 loki, promtail 서비스 추가 (Phase 7)
- [ ] `docker-compose.prod.yml`의 grafana 서비스에 depends_on, 환경변수 추가
- [ ] `docker-compose.prod.yml`의 volumes에 `loki_data_prod` 추가

### Step 5: 검증

- [ ] `docker compose up loki promtail` 실행하여 서비스 정상 기동 확인
- [ ] Loki API 확인: `curl http://localhost:3100/ready`
- [ ] Grafana 접속 후 Explore에서 Loki datasource로 `{job="docker"}` 쿼리 실행
- [ ] `{compose_service="api"}` 라벨 필터링 동작 확인
- [ ] `{compose_service=~"api|bot"} |= "ERROR"` LogQL 쿼리 확인
- [ ] 대시보드에서 Error Logs, Slow Requests, 5xx Errors 패널 렌더링 확인
- [ ] Grafana Alerting 탭에서 HighErrorLogRate, DiscordRateLimited 규칙 등록 확인

---

## 최종 파일 변경 목록

```
infra/
  loki/
    loki-config.yaml                                 (신규)
  promtail/
    promtail-config.yaml                             (신규)
  grafana/
    provisioning/
      datasources/
        prometheus.yaml                              (기존 유지)
        loki.yaml                                    (신규)
      dashboards/
        dashboard.yaml                               (기존 유지)
        onyu-bot-status.json                         (수정 -- Error Logs 패널 추가)
        onyu-infra.json                              (수정 -- Slow Requests, 5xx Errors 패널 추가)
      alerting/
        loki-alert-rules.yaml                        (신규)
        contact-points.yaml                          (신규)
        notification-policies.yaml                   (신규)

docker-compose.yml                                   (수정 -- loki, promtail 서비스 추가)
docker-compose.prod.yml                              (수정 -- loki, promtail 서비스 추가)
```
