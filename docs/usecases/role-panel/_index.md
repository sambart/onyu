# Role Panel 도메인 유스케이스 인덱스

## 도메인 개요

role-panel 도메인은 관리자가 웹 대시보드에서 역할 패널(Embed+버튼)을 생성·수정·삭제하고 Discord 채널에 게시하면, 서버 사용자가 버튼을 클릭해 역할을 부여받거나 토글하는 기능을 제공한다.

통합 앱 구성은 api(NestJS — 패널 CRUD, 게시 오케스트레이션) + web(Next.js — 관리자 설정 UI) + bot(Discord.js — interactionCreate 처리, Discord 메시지 전송) 3앱 cross-app 통합이다.

**핵심 DB 테이블**: `role_panel_config`, `role_panel_button`

**Redis 키**:
- `role_panel:config:{guildId}` — 설정 캐시, TTL 1h
- `role_panel:lock:{guildId}:{userId}:{buttonId}` — 동시성 락, TTL 3s

## 통합 시나리오 개요

```
[관리자 - 웹 브라우저]
        |
        | HTTP (JwtAuthGuard + GuildMembershipGuard)
        v
[apps/web - Next.js 설정 UI]
        |
        | REST API 호출
        v
[apps/api - NestJS]
    |           |
    |  DB       | Bot-API-Client
    v           v
[PostgreSQL]  [apps/bot - Discord.js]
              |           |
              | Redis     | Discord REST API
              v           v
           [Redis]    [Discord 채널]
                          ^
                          | 버튼 클릭 (interactionCreate)
                      [Discord 사용자]
```

- **관리자 플로우**: 웹 대시보드 → API → DB 저장 + 봇 경유 Discord 채널 메시지 게시/편집/삭제
- **사용자 플로우**: Discord 버튼 클릭 → 봇 interactionCreate 처리 → Redis 캐시 조회 → Discord REST API 역할 부여/회수 → Ephemeral 응답

## 유스케이스 목록

| UC ID | 제목 | 통합 범위 | 비고 |
|-------|------|-----------|------|
| [UC-01](./UC-01-panel-create-publish.md) | 패널 생성 및 Discord 게시 | web + api + bot | UF-ROLE-PANEL-001~003 |
| [UC-02](./UC-02-panel-edit-resync.md) | 패널 수정 및 Discord 메시지 재동기화 | web + api + bot | UF-ROLE-PANEL-004, 채널 변경 시 메시지 재전송 |
| [UC-03](./UC-03-panel-delete.md) | 패널 삭제 | web + api + bot(선택적) | UF-ROLE-PANEL-005, Discord 메시지 동시 삭제 |
| [UC-04](./UC-04-grant-button-interaction.md) | GRANT 모드 버튼 클릭 — 역할 부여 | bot + Redis + Discord REST | UF-ROLE-PANEL-006/008, 멱등 처리, 인증 게이트 포함 |
| [UC-05](./UC-05-toggle-button-interaction.md) | TOGGLE 모드 버튼 클릭 — 역할 토글 | bot + Redis + Discord REST | UF-ROLE-PANEL-007, Redis 분산 락 동시성 처리 |

## 공통 제약 및 정책

### 인증 / 권한

- 🔒 웹→API 모든 엔드포인트: JwtAuthGuard + GuildMembershipGuard 적용.
- 🔒 봇→API 호출: Bot-API-Client 봇 전용 인증 사용.
- 🔒 비운영 길드 슈퍼관리자: 조회(read) 가능, 뮤테이션(생성/수정/삭제) 차단 (API 403).

### 역할 제약

- 🔒 역할 위계 검증: 봇보다 위계가 높은 역할, @everyone, managed/integration 역할, ADMINISTRATOR 권한 보유 역할은 버튼 매핑 불가. API 서버 측 재검증 필수(클라이언트 우회 방어).

### 버튼 수 제한

Discord ActionRow 5×5 한계: 패널당 버튼 최대 25개. 초과 시 API 400.

### Discord 응답 시간 제한

Discord 인터랙션 응답: 3초 이내. 처리 지연 시 deferReply + followUp 패턴 적용.

### Redis 캐싱 정책

- `role_panel:config:{guildId}`: 패널+버튼 설정 캐시, TTL 1h. 생성/수정/삭제 시 무효화.
- `role_panel:lock:{guildId}:{userId}:{buttonId}`: TOGGLE 동시성 분산 락, TTL 3s.

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2026-06-19 | usecase-writer | 초기 작성 |

---
