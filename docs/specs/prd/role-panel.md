# Role Panel 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

---

## 개요

관리자가 임의의 디스코드 텍스트 채널에 **패널**(안내 메시지 + 버튼 묶음)을 게시하고, 각 버튼에 디스코드 역할을 매핑하면 사용자가 버튼을 눌러 역할을 부여/회수하는 기능이다.

이 기능이 도입된 직접적 동기는 `docs/specs/discord-guild-ia.md` §4에서 정의한 **인증 게이트** 요구사항이다. `규칙-rules` 채널에 "동의" 버튼을 하나 게시하고 클릭 시 `정회원` 역할을 부여하는 것이 가장 단순한 사용 예다. 이 패턴은 role-panel의 **grant 모드** 설정으로 그대로 구현된다.

동시에 알림 구독, 게임 역할 옵트인, 이벤트 참가 등 **일반적인 버튼형 역할 부여·회수** 수요를 단일 범용 도메인으로 흡수한다. Carl-bot 같은 외부 유틸리티 봇 의존을 없애는 것이 목표다.

**MVP 범위** — 버튼 동작 모드 2종(grant, toggle), 웹 대시보드에서 단일 작성 경로, 봇 게시 및 버튼 클릭 처리.

---

## 관련 모듈

| 앱 | 경로 | 역할 |
|----|------|------|
| `apps/api` | `apps/api/src/role-panel/` | 패널·버튼 설정 영속, 웹 편집 엔드포인트, 봇 조회 엔드포인트 |
| `apps/api` | `apps/api/src/migrations/` | role_panel_config, role_panel_button 테이블 신규 마이그레이션 |
| `apps/bot` | `apps/bot/src/event/role-panel/` | interactionCreate 핸들러 (버튼 클릭 처리) |
| `apps/web` | `apps/web/app/settings/guild/[guildId]/role-panel/` | 패널 설정 페이지 |
| `libs/shared` | `libs/shared/src/types/role-panel.ts` | 공유 타입·상수 |

---

## 아키텍처

```
[Web Dashboard] — 패널 생성/수정
    │
    ▼
POST /api/guilds/{guildId}/role-panel
PUT  /api/guilds/{guildId}/role-panel/{panelId}
    │
    ▼
[RolePanelConfigService]
    │
    ├──► DB: RolePanelConfig, RolePanelButton upsert
    └──► (publish 액션 시) Bot-API-Client → Bot
                │
                ▼
        [RolePanelBotService]
            ├──► Discord API: 대상 채널에 Embed + 버튼 메시지 전송/수정
            └──► DB: RolePanelConfig.messageId 저장

Discord interactionCreate Event (버튼 클릭)
    │
    ▼
[RolePanelInteractionHandler]   ← customId prefix 분기 (role_panel:{panelId}:{buttonId})
    │
    ├── mode = GRANT
    │       └──► 역할 미보유 시 부여, 이미 보유 시 무시 (멱등)
    │
    └── mode = TOGGLE
            ├── 역할 미보유 시 부여
            └── 역할 보유 시 회수

Web Dashboard API
    │
    ├──► GET    /api/guilds/{guildId}/role-panel              → 패널 목록 조회
    ├──► POST   /api/guilds/{guildId}/role-panel              → 패널 생성
    ├──► GET    /api/guilds/{guildId}/role-panel/{panelId}    → 패널 상세 조회
    ├──► PUT    /api/guilds/{guildId}/role-panel/{panelId}    → 패널 수정
    ├──► DELETE /api/guilds/{guildId}/role-panel/{panelId}    → 패널 삭제
    └──► POST   /api/guilds/{guildId}/role-panel/{panelId}/publish → 게시/동기화
```

---

## 기능 상세

### F-ROLE-PANEL-001: 패널 목록 조회

- **트리거**: 웹 대시보드에서 역할 패널 설정 페이지 접근
- **엔드포인트**: `GET /api/guilds/{guildId}/role-panel`
- **인증**: `JwtAuthGuard` + `GuildMembershipGuard` 적용
- **동작**:
  1. `guildId`로 `RolePanelConfig` 목록과 연관 `RolePanelButton` 목록 조회
  2. 설정이 없으면 빈 배열 반환
- **응답 형식**:
  ```json
  [
    {
      "id": 1,
      "name": "정회원 인증",
      "channelId": "1234567890",
      "channelName": "규칙-rules",
      "messageId": "9876543210",
      "embedTitle": "서버 규칙에 동의하시나요?",
      "embedDescription": "아래 버튼을 눌러 정회원 역할을 받으세요.",
      "embedColor": "#5865F2",
      "published": true,
      "buttons": [
        {
          "id": 1,
          "label": "동의합니다",
          "emoji": "✅",
          "roleId": "1111111111",
          "roleName": "정회원",
          "mode": "GRANT",
          "style": "PRIMARY",
          "sortOrder": 0
        }
      ]
    }
  ]
  ```

---

### F-ROLE-PANEL-002: 패널 생성

- **트리거**: 웹 대시보드에서 "새 패널" 버튼 클릭 후 저장
- **엔드포인트**: `POST /api/guilds/{guildId}/role-panel`
- **인증**: `JwtAuthGuard` + `GuildMembershipGuard` 적용
- **동작**:
  1. `RolePanelConfig` 생성 (패널 메타정보)
  2. `RolePanelButton` 목록 생성 (역할 매핑 포함)
  3. `published = false` 상태로 저장 (게시는 별도 액션 F-ROLE-PANEL-005)
- **요청 형식**:
  ```json
  {
    "name": "정회원 인증",
    "channelId": "1234567890",
    "embedTitle": "서버 규칙에 동의하시나요?",
    "embedDescription": "아래 버튼을 눌러 정회원 역할을 받으세요.",
    "embedColor": "#5865F2",
    "buttons": [
      {
        "label": "동의합니다",
        "emoji": "✅",
        "roleId": "1111111111",
        "mode": "GRANT",
        "style": "PRIMARY",
        "sortOrder": 0
      }
    ]
  }
  ```
- **오류 처리**: 버튼이 0개면 400 Bad Request

---

### F-ROLE-PANEL-003: 패널 수정

- **트리거**: 웹 대시보드에서 패널 편집 후 "저장" 버튼 클릭
- **엔드포인트**: `PUT /api/guilds/{guildId}/role-panel/{panelId}`
- **인증**: `JwtAuthGuard` + `GuildMembershipGuard` 적용
- **동작**:
  1. `RolePanelConfig` 업데이트
  2. `RolePanelButton` 목록 replace (기존 버튼 전체 삭제 후 재삽입)
  3. 저장 후 `published = true` 상태라면 봇에게 메시지 동기화 요청 (F-ROLE-PANEL-005와 동일 흐름)

---

### F-ROLE-PANEL-004: 패널 삭제

- **트리거**: 웹 대시보드에서 패널 삭제 버튼 클릭
- **엔드포인트**: `DELETE /api/guilds/{guildId}/role-panel/{panelId}`
- **인증**: `JwtAuthGuard` + `GuildMembershipGuard` 적용
- **동작**:
  1. `messageId`가 있으면 Discord API로 해당 채널에서 메시지 삭제 시도 (실패 시 계속)
  2. `RolePanelButton` 연관 레코드 삭제
  3. `RolePanelConfig` 레코드 삭제
- **오류 처리**: Discord 메시지 삭제 실패(이미 삭제됨 등) 시 로그 기록 후 DB 삭제는 계속 진행

---

### F-ROLE-PANEL-005: 패널 게시 / 동기화 (Publish)

- **트리거**: 웹 대시보드에서 "게시" 버튼 클릭 (신규 게시) 또는 수정 저장 후 자동 동기화
- **엔드포인트**: `POST /api/guilds/{guildId}/role-panel/{panelId}/publish`
- **인증**: `JwtAuthGuard` + `GuildMembershipGuard` 적용
- **동작**:
  1. `RolePanelConfig` 및 `RolePanelButton` 목록 조회
  2. Bot-API-Client를 통해 봇에게 게시 요청 전달
  3. 봇이 Discord 채널 작업 수행:
     - `messageId`가 있으면 기존 메시지 edit, 없으면 신규 전송
     - Embed 구성: 제목(`embedTitle`), 설명(`embedDescription`), 색상(`embedColor`)
     - ActionRow 구성: 버튼 목록 (`customId = role_panel:{panelId}:{buttonId}`)
  4. 전송된 `messageId`를 `RolePanelConfig.messageId`에 저장
  5. `RolePanelConfig.published = true` 업데이트
- **제약**:
  - Discord 버튼은 메시지당 최대 25개 (ActionRow 5개 × 버튼 5개). 초과 시 400 반환
  - 봇이 대상 채널에 **Send Messages** 권한이 없으면 봇이 에러 응답 → API가 503 반환
- **오류 처리**: 채널 미존재, 봇 권한 부족 시 로그 기록 후 HTTP 오류 반환. 웹에서 에러 토스트 표시

---

### F-ROLE-PANEL-006: 버튼 클릭 — GRANT 모드 역할 부여

- **트리거**: 사용자가 mode = GRANT 버튼 클릭 (`customId: role_panel:{panelId}:{buttonId}`)
- **동작**:
  1. `panelId`, `buttonId`로 `RolePanelButton` 조회 (mode, roleId 확인)
  2. 사용자가 해당 역할을 이미 보유 중이면: Ephemeral 응답 ("이미 역할을 보유하고 있습니다.") 후 종료 (멱등)
  3. 미보유 시 Discord API `GuildMember.roles.add(roleId)`로 역할 부여
  4. Ephemeral 성공 응답 ("역할이 부여되었습니다.")
  5. (선택) 역할 부여 로그를 `모니터링-logs` / `감사-로그` 채널에 기록 (IA §4 요구사항, 설정으로 제어)
- **오류 처리**:
  - 봇 권한 부족 (Manage Roles 미보유, 봇 역할이 대상 역할보다 낮음) 시 Ephemeral 오류 응답
  - 역할 미존재(삭제된 역할) 시 Ephemeral 오류 응답 + 내부 로그

**인증 게이트 연결**: `규칙-rules` 채널에 GRANT 모드 패널을 설정하고 `정회원` 역할을 매핑하면 IA §4의 인증 게이트 요구사항이 충족된다 (클릭 → 정회원 부여, 이미 정회원이면 무시).

---

### F-ROLE-PANEL-007: 버튼 클릭 — TOGGLE 모드 역할 부여/회수

- **트리거**: 사용자가 mode = TOGGLE 버튼 클릭 (`customId: role_panel:{panelId}:{buttonId}`)
- **동작**:
  1. `panelId`, `buttonId`로 `RolePanelButton` 조회
  2. 사용자가 역할 보유 중이면: `GuildMember.roles.remove(roleId)` → Ephemeral ("역할이 제거되었습니다.")
  3. 미보유 시: `GuildMember.roles.add(roleId)` → Ephemeral ("역할이 부여되었습니다.")
- **동시성 처리**: 같은 버튼 빠르게 두 번 클릭 시 최초 응답 후 Discord가 두 번째 인터랙션을 이미 처리된 것으로 반환하거나, 봇이 짧은 시간 내 동일 인터랙션 ID를 감지하여 중복 처리를 방지한다. API 레벨에서 인터랙션 ID로 멱등성 보장 필요 여부는 구현 시 결정한다.
- **오류 처리**: GRANT 모드와 동일

---

### F-WEB-ROLE-PANEL-001: 역할 패널 설정 페이지

- **경로**: `/settings/guild/{guildId}/role-panel`
- **위치**: 설정 사이드바 > 회원 관리 그룹 > 역할 패널
- 🔒 **접근 조건**: 기존 `settings/guild/[guildId]/layout.tsx` 가드 상속 — 길드 운영진(관리자) 및 슈퍼관리자만 접근 가능. 비운영 길드 열람 시 슈퍼관리자 read-only (mutation 요청은 API 403)

#### 페이지 구성

| UI 영역 | 설명 |
|---------|------|
| 패널 목록 탭 바 | 등록된 패널 탭 목록 + "새 패널" 버튼. sticky-message/auto-channel 다중 탭 패턴 동일 |
| 패널 기본정보 | 패널 이름(내부 식별용), 대상 채널 선택 드롭다운 |
| Embed 설정 | 제목, 설명(멀티라인), 색상(HEX 입력 + 컬러 피커) |
| 버튼 목록 관리 | 버튼 카드 목록 (드래그 순서 변경), 버튼 추가/삭제 |
| 미리보기 패널 | Embed + 버튼을 Discord 스타일로 실시간 렌더링 |
| 저장 버튼 | 설정 DB 저장 (Discord 채널 미변경) |
| 게시 버튼 | 저장 + Discord 채널에 Embed+버튼 메시지 전송/수정 |

#### 버튼 카드 편집 요소

| UI 요소 | 설명 |
|---------|------|
| 버튼 라벨 | Discord 버튼에 표시될 텍스트 |
| 이모지 | 버튼 왼쪽 이모지 (선택) |
| 매핑 역할 | 드롭다운으로 길드 역할 선택 |
| 동작 모드 | `GRANT` (부여 전용) / `TOGGLE` (토글) |
| 버튼 스타일 | `PRIMARY`(파랑) / `SECONDARY`(회색) / `SUCCESS`(초록) / `DANGER`(빨강) |
| 순서 변경 | 드래그 또는 위/아래 화살표 |

#### 게시 동작 흐름

1. "게시" 버튼 클릭 → `POST /api/guilds/{guildId}/role-panel/{panelId}/publish`
2. 성공 시 토스트 ("패널이 게시되었습니다.")
3. 실패 시 에러 토스트 (채널 없음, 권한 부족 등 메시지 포함)

---

## 데이터 모델 개요

상세 DB 설계는 후속 `database-architect` 단계에서 확정한다. 여기서는 "무엇을 저장해야 하는가" 수준을 기술한다.

### RolePanelConfig (`role_panel_config`)

길드별 역할 패널 설정을 저장한다. 길드당 패널을 여러 개 등록할 수 있다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL, INDEX | 디스코드 서버 ID |
| `name` | `varchar` | NOT NULL | 패널 내부 식별명 (웹 UI 표시용) |
| `channelId` | `varchar` | NULLABLE | 패널 메시지를 게시할 텍스트 채널 ID |
| `messageId` | `varchar` | NULLABLE | 게시된 Discord 메시지 ID (NULL이면 미게시) |
| `embedTitle` | `varchar` | NULLABLE | Embed 제목 |
| `embedDescription` | `text` | NULLABLE | Embed 본문 |
| `embedColor` | `varchar` | NULLABLE | Embed HEX 색상 |
| `published` | `boolean` | NOT NULL, DEFAULT false | 현재 Discord 채널에 게시된 상태 여부 |
| `createdAt` | `timestamp` | NOT NULL | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL | 수정일 |

**인덱스**: `IDX_role_panel_config_guild` — `(guildId)` — 길드별 패널 목록 조회

---

### RolePanelButton (`role_panel_button`)

패널에 속한 버튼 목록과 역할 매핑을 저장한다.

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `panelId` | `int` | FK → RolePanelConfig, NOT NULL | 소속 패널 |
| `label` | `varchar` | NOT NULL | 버튼 표시 텍스트 |
| `emoji` | `varchar` | NULLABLE | 버튼 이모지 |
| `roleId` | `varchar` | NOT NULL | 부여/회수할 Discord 역할 ID |
| `mode` | `enum('GRANT','TOGGLE')` | NOT NULL | 버튼 동작 모드 |
| `style` | `enum('PRIMARY','SECONDARY','SUCCESS','DANGER')` | NOT NULL, DEFAULT 'PRIMARY' | Discord 버튼 스타일 |
| `sortOrder` | `int` | NOT NULL, DEFAULT 0 | 버튼 표시 순서 |
| `createdAt` | `timestamp` | NOT NULL | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL | 수정일 |

**인덱스**: `IDX_role_panel_button_panel_sort` — `(panelId, sortOrder)` — 패널별 버튼 순서 조회

---

## customId 규칙

| 형식 | 예시 |
|------|------|
| `role_panel:{panelId}:{buttonId}` | `role_panel:3:12` |

봇의 `interactionCreate` 핸들러에서 `customId` 접두사 `role_panel:` 으로 분기하여 `RolePanelInteractionHandler`에 위임한다.

---

## Redis 키 구조

패널 설정은 버튼 클릭 시 빠르게 조회가 필요하다. 버튼 클릭 빈도가 높을 수 있으므로 캐시를 권장한다.

| 키 패턴 | TTL | 설명 |
|---------|-----|------|
| `role_panel:config:{guildId}` | 1시간 | 길드 전체 패널+버튼 목록 캐시 |

- 설정 저장/삭제/게시 시 캐시 즉시 무효화
- 버튼 클릭 핸들러는 캐시 우선 조회, 미스 시 DB 조회 후 캐시 저장

---

## 권한 정책

🔒 **웹 접근 가드 (결정 완료)**: 기존 `settings/guild/[guildId]/layout.tsx` 가드를 상속. 길드 운영진(관리자) + 슈퍼관리자만 설정 페이지 접근 가능. 비운영 길드는 슈퍼관리자 read-only.

🔒 **Discord 역할 부여/회수 권한 정책 (결정 완료 — 2026-06-19 사용자 확정)**:
봇이 역할을 부여/회수하려면 봇 역할이 Discord 위계상 대상 역할보다 **위**에 있어야 한다. 아래 두 정책이 확정되었다.

1. **부여 불가 역할 매핑 시도 → 저장 시점 차단 (확정)**: 봇이 부여할 수 없는 역할(봇 역할보다 높은 역할, `@everyone`, managed/integration 역할)은 **웹 저장 시점에 API가 차단**한다.
   - API 는 패널/버튼 저장 시 Discord 역할 목록 + 위계 + 봇 최상위 역할 position 을 조회하여 부여 불가 역할 매핑을 거부(검증 에러 응답).
   - 웹 역할 선택 UI 는 부여 불가 역할을 선택 목록에서 제외하거나 비활성 표기한다.
   - 게시 이후 사용자에게 클릭 에러가 노출되는 것을 방지하기 위함.

2. **관리자 권한 보유 역할 매핑 가드 → 차단 + UI 표기 (확정)**: `ADMINISTRATOR` 권한 비트를 가진 역할은 패널 버튼에 **매핑 불가**.
   - API: 저장 시 역할 permissions 비트마스크에서 `ADMINISTRATOR` 확인 → 매핑 시도 시 403 차단.
   - 웹 UI: 역할 선택기에서 ADMINISTRATOR 보유 역할을 **비활성 처리하고 차단 사유를 표기**(예: "관리자 권한 역할은 매핑할 수 없습니다").
   - 버튼 클릭으로 관리자 권한이 새는 경로를 원천 봉쇄.

---

## 비기능 요구사항

### 멱등성

- GRANT 모드: 역할 이미 보유 시 Discord API 호출 없이 Ephemeral 응답만 반환. `GuildMember.roles.cache.has(roleId)` 확인 후 API 호출 여부 결정.
- 패널 게시 동기화: `messageId` 존재 여부로 신규 전송 vs. edit 분기. Discord `message.edit()`는 멱등하게 동작.

### 동시성

- 버튼 빠른 연속 클릭: Discord는 인터랙션당 고유 ID를 발급하므로 동일 인터랙션 재처리는 Discord 측에서 방지. 단, 서로 다른 인터랙션이 수 ms 간격으로 도착하는 경우(TOGGLE 모드) 레이스 컨디션 가능성 존재. 구현 시 Redis 락(키: `role_panel:lock:{guildId}:{userId}:{buttonId}`, TTL 3초) 적용 검토.

### 패널 메시지 동기화

- 버튼 구성 변경 시 기존 messageId 메시지를 Discord edit로 갱신(삭제 후 재전송 아님). 메시지 ID가 유지되어야 사용자가 봐온 메시지가 변하지 않는다.
- 채널 변경 시: 기존 채널의 메시지 삭제 → 새 채널에 신규 전송 → messageId 갱신.

### 역할 부여 로그 (선택)

IA §4는 "부여 로그를 `모니터링-logs` 또는 `감사-로그`에 기록하는 것을 선택 사항"으로 명시한다. MVP에서는 구현 복잡도를 고려하여 내부 시스템 로그(NestJS Logger)만 기록하고, 디스코드 채널 로깅은 설정 옵션으로 후속 확장에서 제공한다.

### 성능

- 버튼 클릭 핸들러는 Discord의 3초 응답 제한 내 처리해야 한다. DB 조회는 Redis 캐시 히트로 최소화하고, 역할 부여/회수 Discord API 호출이 병목이면 deferReply + followUp 패턴 적용 검토.

---

## 사용자 여정

### 타겟 유저 세그먼트 1 — 길드 관리자 (설정 주체)

**목표**: 인증 게이트(규칙 동의) 또는 역할 옵트인 패널을 Discord 채널에 게시한다.

| 단계 | 페이지/화면 | 행동 |
|------|------------|------|
| 1 | `웹 랜딩 / 로그인` | Discord OAuth 로그인 |
| 2 | `서버 선택 (/select-guild)` | 관리할 서버 선택 |
| 3 | `설정 사이드바 > 회원 관리 > 역할 패널` | `/settings/guild/{guildId}/role-panel` 접근 |
| 4 | `역할 패널 설정 페이지` | "새 패널" 버튼 클릭 → 패널 이름, 대상 채널 선택 |
| 5 | `역할 패널 설정 페이지` | Embed 제목/설명/색상 작성, 미리보기 확인 |
| 6 | `역할 패널 설정 페이지` | 버튼 추가 → 라벨/이모지/역할/모드(GRANT or TOGGLE) 설정 |
| 7 | `역할 패널 설정 페이지` | "게시" 버튼 클릭 → 토스트 확인 |
| 8 | `Discord 채널 (규칙-rules 등)` | 게시된 패널 메시지와 버튼 확인 |

---

### 타겟 유저 세그먼트 2 — 일반 사용자 (역할 수령 주체)

**목표**: Discord 채널의 버튼을 눌러 원하는 역할을 받거나 회수한다.

| 단계 | 페이지/화면 | 행동 |
|------|------------|------|
| 1 | `Discord 채널 (규칙-rules 등)` | 패널 메시지 확인 |
| 2 | `Discord 채널` | 버튼 클릭 (예: "동의합니다") |
| 3 | `Discord (Ephemeral 응답)` | "역할이 부여되었습니다." 확인 |
| 4 | `Discord 커뮤니티 채널` | 정회원 역할로 채널 접근 가능 |

*TOGGLE 모드 예: 알림 구독 버튼을 다시 누르면 "역할이 제거되었습니다." 확인 후 구독 해제.*

---

## IA (정보구조)

```
역할 패널 도메인
├── 웹 설정 표면 (apps/web)
│   └── /settings/guild/[guildId]/role-panel/              ← 역할 패널 설정 페이지
│       ├── 패널 탭 바 (다중 패널 — sticky-message 패턴)
│       │   ├── [패널 1 탭]
│       │   ├── [패널 2 탭]
│       │   └── [새 패널 +]
│       └── 패널 편집 영역
│           ├── 기본정보 (이름, 채널)
│           ├── Embed 설정 (제목, 설명, 색상)
│           ├── 버튼 목록 (라벨/이모지/역할/모드/스타일/순서)
│           ├── 실시간 미리보기
│           ├── [저장] 버튼
│           └── [게시] 버튼
│
├── API 표면 (apps/api)
│   └── /api/guilds/{guildId}/role-panel/
│       ├── GET     /                              패널 목록
│       ├── POST    /                              패널 생성
│       ├── GET     /{panelId}                     패널 상세
│       ├── PUT     /{panelId}                     패널 수정
│       ├── DELETE  /{panelId}                     패널 삭제
│       └── POST    /{panelId}/publish             게시/동기화
│
└── 봇 표면 (apps/bot)
    └── interactionCreate 핸들러
        └── customId prefix: role_panel:{panelId}:{buttonId}
            ├── mode = GRANT → 역할 부여 (멱등)
            └── mode = TOGGLE → 역할 토글 (부여/회수)
```

---

## MVP 스코프 — 포함 / 제외

### MVP 포함

| 항목 | 비고 |
|------|------|
| 버튼 동작 모드: GRANT, TOGGLE | 2종 |
| 웹 대시보드 패널 CRUD | 단일 작성 경로 |
| 봇 패널 게시(신규 전송) 및 동기화(edit) | messageId 영속 |
| 봇 버튼 인터랙션 처리 | GRANT/TOGGLE 분기 |
| 인증 게이트 지원 (IA §4) | GRANT 모드 + 정회원 역할 매핑 |
| Redis 캐시 | 버튼 클릭 성능 |
| 실시간 미리보기 | 웹 |

### MVP 제외 (후속 확장)

| 항목 | 비고 |
|------|------|
| **EXCLUSIVE(택1) 모드** | 한 그룹 내 버튼 중 하나만 보유. 역할 간 상호 배타 처리 복잡도로 다음 Phase |
| 슬래시 커맨드로 패널 생성 | 웹이 단일 작성 경로. 커맨드는 웹 안내 응답만 |
| 리액션(이모지) 기반 역할 부여 | 버튼 컴포넌트 방식만 지원 |
| 채널별 전송 역할 로그 (Discord 채널) | MVP는 시스템 로그만. 채널 로깅은 설정 옵션으로 후속 |
| 버튼 클릭 횟수 통계 | 분석 기능 후속 |
| 역할 조건부 제한 (특정 역할 보유 시만 클릭 가능) | 후속 |

---

## 외부 의존성

| 서비스 | 용도 |
|--------|------|
| Discord REST API | 메시지 전송/수정/삭제, 역할 목록 조회, GuildMember 역할 부여/회수 |
| Discord Gateway | interactionCreate 이벤트 수신 |
| PostgreSQL | RolePanelConfig, RolePanelButton 영구 저장 |
| Redis | 패널 설정 캐시 (TTL 1h), 동시성 락 (TTL 3s, 선택) |

---

## 확정된 권한 결정 (2026-06-19)

아래 항목은 사용자 확정이 완료된 결정 사항이다 (🔒 정보성). 후속 Phase 는 이 결정을 전제로 진행한다.

| # | 분야 | 내용 | 확정 |
|---|------|------|------|
| 1 | **권한** | 봇이 부여 불가한 역할(봇 역할보다 높은 역할, @everyone, managed 역할) 매핑 시 처리 정책 | **A: 웹 저장 시점 API 차단** — 역할 선택 UI 에서도 제외/비활성 |
| 2 | **권한** | `ADMINISTRATOR` 권한 보유 역할의 패널 매핑 허용 여부 | **A: 차단 (API 403) + 웹 UI 비활성·사유 표기** |
