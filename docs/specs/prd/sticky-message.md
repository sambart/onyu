# Sticky Message 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

등록된 텍스트 채널에 새 메시지가 올라올 때마다 봇이 기존 고정메세지를 삭제하고 다시 전송하여 항상 채널 최하단에 위치시키는 기능이다. 연속 메시지 발생 시 불필요한 재전송을 방지하기 위해 디바운스(3초)를 적용한다. 관리자는 웹 대시보드에서 채널별로 고정메세지를 등록·관리하며, 슬래시 커맨드로도 목록 확인 및 삭제가 가능하다. 기능은 길드(서버)별로 독립 설정되며, 채널당 여러 개의 고정메세지를 등록할 수 있다.

## 관련 모듈

- `apps/api/src/sticky-message/` — 고정메세지 핵심 로직
- `apps/api/src/sticky-message/config/` — 설정 관리 서비스 및 DB 저장소
- `apps/api/src/sticky-message/gateway/` — Discord Gateway 이벤트 핸들러 (`messageCreate`)
- `apps/api/src/sticky-message/command/` — 슬래시 커맨드 핸들러 (등록/목록/삭제)
- `apps/api/src/sticky-message/infrastructure/` — Redis 저장소
- `apps/web/app/settings/guild/[guildId]/sticky-message/page.tsx` — 고정메세지 설정 페이지

## 아키텍처

```
[Web Dashboard] — 설정 저장
    │
    ▼
POST /api/guilds/{guildId}/sticky-message
    │
    ▼
[StickyMessageConfigService]
    │
    ├──► DB: StickyMessageConfig upsert
    ├──► sticky_message:config:{guildId} → Redis set (TTL 1h)
    └──► Discord API: 대상 채널에 Embed 메시지 즉시 전송 (F-STICKY-002)

Discord messageCreate Event
    │
    ▼
[StickyMessageGateway]           ← messageCreate 이벤트 수신
    │
    ├── 봇 자신의 고정메세지 재전송 → 무시 (무한루프 방지)
    │
    └── 일반 메시지 + 봇 메시지 (슬래시 커맨드 결과 등)
            │
            ▼
        sticky_message:config:{guildId} → Redis get (캐시 조회, 미스 시 DB)
            │
            ├── 해당 채널에 고정메세지 없음 → 처리 중단
            │
            └── 해당 채널에 고정메세지 있음 (1개 이상)
                    │
                    ▼
                sticky_message:debounce:{channelId} → Redis set (3초 디바운스)
                    │
                    ▼ (3초 후)
                [StickyMessageRefreshService]
                    ├──► Discord API: 기존 고정메세지(messageId) 삭제
                    ├──► Discord API: Embed 메시지 신규 전송
                    └──► DB: StickyMessageConfig.messageId 업데이트

Discord Slash Command (관리자 전용)
    │
    ├── /고정메세지등록 → Ephemeral 웹 안내 응답 (F-STICKY-003)
    ├── /고정메세지목록 → Ephemeral Embed 목록 응답 (F-STICKY-004)
    └── /고정메세지삭제 → 채널 선택 → 삭제 처리 (F-STICKY-005)

Web Dashboard API
    │
    ├──► GET  /api/guilds/{guildId}/sticky-message         → 설정 목록 조회
    ├──► POST /api/guilds/{guildId}/sticky-message         → 설정 저장(신규/수정)
    └──► DELETE /api/guilds/{guildId}/sticky-message/{id}  → 설정 삭제
```

---

## 기능 상세

### F-STICKY-001: 설정 목록 조회

- **트리거**: 웹 대시보드 또는 슬래시 커맨드에서 고정메세지 설정 조회
- **엔드포인트**: `GET /api/guilds/{guildId}/sticky-message`
- **인증**: `JwtAuthGuard` 적용
- **동작**:
  1. `guildId`로 `StickyMessageConfig` 목록 조회 (sortOrder 오름차순)
  2. 설정이 없으면 빈 배열 반환
- **응답 형식**:
  ```json
  [
    {
      "id": 1,
      "channelId": "1234567890",
      "channelName": "공지채널",
      "embedTitle": "공지 안내",
      "embedDescription": "이 채널은 공지 전용입니다.",
      "embedColor": "#5865F2",
      "messageId": "9876543210",
      "enabled": true,
      "sortOrder": 0
    }
  ]
  ```

---

### F-STICKY-002: 고정메세지 등록/수정 (웹)

- **트리거**: 웹 대시보드에서 설정 저장
- **엔드포인트**: `POST /api/guilds/{guildId}/sticky-message`
- **인증**: `JwtAuthGuard` 적용
- **동작**:
  1. `StickyMessageConfig`를 DB에 upsert (`id` 기준 — 신규 또는 수정)
  2. `sticky_message:config:{guildId}` Redis 캐시를 갱신 (TTL 1시간)
  3. `enabled = true`이면:
     - 기존 `messageId`가 있으면 Discord API로 해당 메시지 삭제 시도
     - 대상 채널에 Embed 메시지를 신규 전송
     - `StickyMessageConfig.messageId`를 새 Discord 메시지 ID로 업데이트
  4. 저장 성공 응답 반환
- **요청 형식**:
  ```json
  {
    "id": null,
    "channelId": "1234567890",
    "embedTitle": "공지 안내",
    "embedDescription": "이 채널은 공지 전용입니다.",
    "embedColor": "#5865F2",
    "enabled": true,
    "sortOrder": 0
  }
  ```
- **오류 처리**:
  - `channelId` 미존재 또는 봇 메시지 전송 권한 부족 시 로그 기록 후 API 오류 반환
  - `enabled = false`이면 Discord 메시지 전송/삭제 생략

---

### F-STICKY-003: 고정메세지 삭제 (웹)

- **트리거**: 웹 대시보드에서 삭제 버튼 클릭
- **엔드포인트**: `DELETE /api/guilds/{guildId}/sticky-message/{id}`
- **인증**: `JwtAuthGuard` 적용
- **동작**:
  1. `StickyMessageConfig.messageId`가 있으면 Discord API로 해당 채널에서 메시지 삭제
  2. `StickyMessageConfig` DB 레코드 삭제
  3. `sticky_message:config:{guildId}` Redis 캐시 무효화
- **오류 처리**: Discord 메시지 삭제 실패(이미 삭제된 경우 등) 시 로그 기록 후 DB 삭제는 계속 진행

---

### F-STICKY-004: messageCreate 감지 및 디바운스 재전송

- **트리거**: 고정메세지가 등록된 채널에 새 메시지 수신 (`messageCreate` 이벤트)
- **전제 조건**: `StickyMessageConfig`에 해당 채널이 등록되어 있고 `enabled = true`
- **동작**:
  1. 봇 자신의 고정메세지 재전송이면 처리 중단 (무한루프 방지). `StickyMessageRefreshService`가 전송한 메시지 ID를 추적하여 판별한다. 봇의 다른 메시지(슬래시 커맨드 결과 등)는 정상적으로 갱신 트리거한다.
  2. `sticky_message:config:{guildId}` Redis 캐시 조회 (미스 시 DB 조회 후 캐시 저장)
  3. 해당 `channelId`에 등록된 고정메세지 설정이 없으면 처리 중단
  4. 고정메세지 설정이 있으면:
     - `sticky_message:debounce:{channelId}` Redis 키 존재 확인
     - `sticky_message:debounce:{channelId}` Redis 키를 설정 (TTL 3초, 중복 방지)
     - 기존 타이머가 있으면 취소하고 새로운 `setTimeout`(1.5초) 설정 — 연속 메시지 시 마지막 메시지 기준으로 재전송
  5. 타이머 만료(1.5초) 후 `StickyMessageRefreshService` 실행:
     - 채널에 등록된 고정메세지 설정 목록을 sortOrder 순서로 조회
     - 각 설정에 대해:
       a. 기존 `messageId`가 있으면 Discord API로 메시지 삭제 (실패 시 계속)
       b. Embed 메시지 신규 전송
       c. DB에 새 `messageId` 업데이트
- **디바운스 구현 방식**: `setTimeout`(1.5초) 기반. 새 메시지마다 기존 타이머를 리셋한다. `sticky_message:debounce:{channelId}` Redis 키(TTL 3초)는 중복 방지 보조 역할을 한다.
- **동시 실행 방지**: 채널별 인메모리 잠금(`Map<channelId, timestamp>`)으로 동시 refresh를 방지한다. 잠금 타임아웃은 10초이며, 타임아웃 초과 시 stale 잠금으로 간주하여 강제 해제한다.
- **오류 처리**: Discord API 오류(권한 부족, 채널 없음 등) 발생 시 로그 기록 후 조용히 실패. 권한 에러(403) 발생 시 별도 로그로 구분한다.
- **Bot→API 전달 재시도**: Bot의 `messageCreate` 이벤트 전달이 실패하면 1초 후 1회 재시도한다.

---

### F-STICKY-005: 슬래시 커맨드 — /고정메세지등록

- **트리거**: 관리자가 `/고정메세지등록` 커맨드 실행
- **권한**: 서버 관리자 권한 필요 (`MANAGE_GUILD` 또는 `ADMINISTRATOR`)
- **동작**:
  1. Ephemeral 메시지로 웹 설정 페이지 안내 표시
  2. 응답 예시: `고정메세지는 웹 대시보드에서 설정할 수 있습니다. [서버 설정 페이지]({웹 주소}/settings/guild/{guildId}/sticky-message)`
- **파라미터**: 없음
- **오류 처리**: 관리자 권한 없는 사용자 사용 시 Ephemeral 오류 응답

---

### F-STICKY-006: 슬래시 커맨드 — /고정메세지목록

- **트리거**: 관리자가 `/고정메세지목록` 커맨드 실행
- **권한**: 서버 관리자 권한 필요
- **동작**:
  1. `guildId`로 `StickyMessageConfig` 목록 조회 (sortOrder 오름차순)
  2. Ephemeral Embed 메시지로 목록 표시
  3. 등록된 고정메세지가 없으면 "등록된 고정메세지가 없습니다." Ephemeral 응답
- **Embed 구성**:
  - 제목: `고정메세지 목록`
  - 본문: 각 설정을 인라인 필드로 표시
    - 필드 이름: `#{순번} #{채널명}` (예: `#1 공지채널`)
    - 필드 값: Embed 제목 (없으면 "제목 없음"), 활성화 여부
  - 푸터: `총 {N}개`
- **파라미터**: 없음

---

### F-STICKY-007: 슬래시 커맨드 — /고정메세지삭제

- **트리거**: 관리자가 `/고정메세지삭제` 커맨드 실행
- **권한**: 서버 관리자 권한 필요
- **파라미터**:
  - `채널` (Channel, 필수): 고정메세지를 삭제할 텍스트 채널 선택
- **동작**:
  1. 선택된 채널의 `StickyMessageConfig` 목록 조회
  2. 해당 채널에 등록된 고정메세지가 없으면 "해당 채널에 등록된 고정메세지가 없습니다." Ephemeral 응답
  3. 등록된 고정메세지가 있으면:
     - 각 설정에 대해 Discord API로 고정메세지 삭제 시도 (실패 시 계속)
     - DB에서 해당 채널의 `StickyMessageConfig` 레코드 전체 삭제
     - `sticky_message:config:{guildId}` Redis 캐시 무효화
  4. Ephemeral 성공 응답 (`{채널명} 채널의 고정메세지 {N}개가 삭제되었습니다.`)
- **오류 처리**: 권한 부족, Discord API 오류 시 Ephemeral 오류 응답

---

## 데이터 모델

### StickyMessageConfig (`sticky_message_config`)

길드별 채널 고정메세지 설정을 저장한다. 채널당 여러 개의 고정메세지를 등록할 수 있다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `channelId` | `varchar` | NOT NULL | 고정메세지를 표시할 텍스트 채널 ID |
| `embedTitle` | `varchar` | NULLABLE | Embed 제목 |
| `embedDescription` | `text` | NULLABLE | Embed 설명 (멀티라인) |
| `embedColor` | `varchar` | NULLABLE | Embed 색상 (HEX, 예: `#5865F2`) |
| `messageId` | `varchar` | NULLABLE | 현재 전송된 Discord 고정메세지 ID |
| `enabled` | `boolean` | NOT NULL, DEFAULT `true` | 기능 활성화 여부 |
| `sortOrder` | `int` | NOT NULL, DEFAULT `0` | 채널 내 메시지 전송 순서 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_sticky_message_guild` | `(guildId)` | 길드별 전체 설정 조회 |
| `IDX_sticky_message_guild_channel` | `(guildId, channelId)` | 채널별 설정 조회 (messageCreate 감지 시 조회) |
| `IDX_sticky_message_channel_sort` | `(channelId, sortOrder)` | 채널 내 순서 조회 |

---

## Redis 키 구조

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `sticky_message:config:{guildId}` | 1시간 | String (JSON) | 길드별 StickyMessageConfig 전체 목록 캐시 (channelId별 그룹 포함) |
| `sticky_message:debounce:{channelId}` | 3초 | String | 채널별 디바운스 중복 방지. `setTimeout`(1.5초) 보조 역할 |

**TTL 정책**:

| 대상 | TTL | 사유 |
|------|-----|------|
| 설정 캐시 | 1시간 (3,600초) | 설정 변경 빈도 낮음. 저장/삭제 시 명시적 갱신 또는 무효화 |
| 디바운스 타이머 | 3초 (Redis) + 1.5초 (setTimeout) | Redis TTL 3초는 중복 방지, setTimeout 1.5초는 실제 대기 시간 |

**설정 캐시 구조**: `guildId` 단위로 전체 `StickyMessageConfig` 배열을 JSON 직렬화하여 저장한다. `messageCreate` 핸들러에서 `channelId`로 필터링하여 사용한다.

---

## 슬래시 커맨드 목록

| 커맨드 | 파라미터 | 권한 | 응답 방식 | 설명 |
|--------|----------|------|-----------|------|
| `/고정메세지등록` | 없음 | MANAGE_GUILD | Ephemeral | 웹 설정 페이지 안내 |
| `/고정메세지목록` | 없음 | MANAGE_GUILD | Ephemeral Embed | 현재 서버 고정메세지 목록 |
| `/고정메세지삭제` | `채널` (Channel, 필수) | MANAGE_GUILD | Ephemeral | 선택 채널의 고정메세지 전체 삭제 |

---

## 외부 의존성

| 서비스 | 용도 |
|--------|------|
| Discord Gateway | `messageCreate` 이벤트 수신 |
| Discord REST API | 메시지 삭제 (`DELETE /channels/{channelId}/messages/{messageId}`), 메시지 전송 (`POST /channels/{channelId}/messages`) |
| PostgreSQL | StickyMessageConfig 영구 저장 |
| Redis | 설정 캐시 (TTL 1h), 디바운스 타이머 (TTL 3s) |

---

## Web 도메인 연계

| 연계 지점 | 방향 | 설명 |
|-----------|------|------|
| 고정메세지 설정 페이지 | web → sticky-message | `/settings/guild/{guildId}/sticky-message`에서 F-STICKY-001~003 API 호출 (다중 탭 UI — 자동방 설정과 동일 패턴) |
| 설정 저장 시 즉시 전송 | sticky-message → Discord | 웹에서 저장 시 F-STICKY-002 실행하여 Discord 채널에 즉시 Embed 전송 |
| 설정 삭제 시 Discord 삭제 | sticky-message → Discord | 웹에서 삭제 시 F-STICKY-003 실행하여 Discord 채널에서 고정메세지 제거 |
