# Super Admin 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

플랫폼 운영자(onyu 팀 / 개발자 본인)가 **디스코드 서버 운영자 권한 없이도** 봇이 참여 중인 임의의 길드 대시보드를 **read-only 로 열람**할 수 있게 하는 슈퍼 관리자 콘솔이다.

**해결 문제**

1. 버그 신고 접수 시 운영자가 해당 길드의 관리자 권한을 갖지 않아 상태 확인 불가
2. 음성 추적 봇 개발·테스트 시 활동이 활발한 서버의 길드 운영자 권한 필요

**핵심 원칙**

- 완전 read-only: 슈퍼 관리자는 어떤 길드 설정도 편집 불가 (mutation 없음)
- 접근 감사: 모든 길드 데이터 열람 이력을 기록 (누가/언제/어느 길드/경로)
- DB 기반 역할(role): `admin_user` 테이블의 `role` 컬럼(`super_admin` | `bot_operator`) 기준 관리자 판별
- 역할 2-tier: `super_admin`(전체 scope + 관리자 관리) / `bot_operator`(운영 scope, `admin:manage` 제외)
- Scope 기반 접근제어: 각 엔드포인트/UI는 `@RequireScope(...)` 데코레이터로 필요 scope 를 선언. JWT scopes[] 배열 검사.

---

## 관련 모듈

### API 서버 (`apps/api`)

- `apps/api/src/auth/application/auth.service.ts` — `createToken()` 내 `AdminUserRepository` 조회 및 JWT payload `role` + `scopes` 포함
- `apps/api/src/auth/infrastructure/jwt.strategy.ts` — validate 시 `role` / `scopes` 전달
- `apps/api/src/common/guards/guild-membership.guard.ts` — 슈퍼 관리자 GET 요청 우회 로직 (`role` 존재 기반)
- `apps/api/src/super-admin/super-admin.module.ts` — 슈퍼 관리자 전용 모듈
- `apps/api/src/super-admin/presentation/admin.controller.ts` — `GET /api/admin/guilds` 엔드포인트
- `apps/api/src/super-admin/presentation/admin-user.controller.ts` — 관리자 CRUD 엔드포인트 (신규)
- `apps/api/src/super-admin/application/admin-user.service.ts` — 관리자 관리 비즈니스 로직 (신규)
- `apps/api/src/super-admin/infrastructure/admin-user.orm-entity.ts` — `AdminUser` TypeORM 엔티티 (신규)
- `apps/api/src/super-admin/infrastructure/admin-user.repository.ts` — AdminUser 레포지토리 (신규)
- `apps/api/src/super-admin/guards/super-admin.guard.ts` — `role` 존재 여부 검증 가드
- `apps/api/src/super-admin/guards/require-scope.guard.ts` — scope 검증 가드 (신규)
- `apps/api/src/super-admin/infrastructure/audit-log.orm-entity.ts` — 감사 로그 엔티티
- `apps/api/src/super-admin/application/audit-log.service.ts` — 감사 로그 기록 서비스
- `apps/api/src/super-admin/infrastructure/audit-log.interceptor.ts` — 슈퍼 관리자 요청 자동 기록 인터셉터

### Web 서버 (`apps/web`)

- `apps/web/app/auth/me/route.ts` — `JwtPayload` 타입에 `role` / `scopes` 반영
- `apps/web/app/admin/layout.tsx` — `/admin` 라우트 레이아웃 (role 존재 여부 체크)
- `apps/web/app/admin/page.tsx` — 전체 길드 현황 화면 (기능 1)
- `apps/web/app/admin/guilds/[guildId]/page.tsx` — 특정 길드 read-only drill-in 진입점 (기존 대시보드 재사용)
- `apps/web/app/admin/admins/page.tsx` — 관리자 관리 콘솔 (신규, `admin:manage` scope 전용)
- `apps/web/app/lib/admin-api.ts` — 관리자 API 클라이언트 함수 (갱신: 관리자 CRUD 함수 추가)
- `apps/web/app/api/admin/[...path]/route.ts` — 어드민 API 프록시

---

## 아키텍처

```
[플랫폼 어드민 브라우저]
        │
        │  Discord OAuth2 (기존 흐름)
        ▼
[apps/web /auth/discord → /auth/callback]
        │
        │  createToken() → admin_user DB 조회
        │  JWT payload: { ..., role: 'super_admin'|'bot_operator'|null, scopes: string[] }
        ▼
[apps/web /admin/*]  ←── AdminLayout: role 체크 (non-admin → 403)
        │
        │  GET /api/admin/guilds         (RequireScopeGuard: 'guild:view')
        │  GET /api/guilds/:guildId/*    (GuildMembershipGuard 우회 — role 존재 + GET)
        │  GET/POST /api/admin/admins    (RequireScopeGuard: 'admin:manage')
        ▼
[apps/api]
        │
        ├── SuperAdminGuard → role 존재 여부 검사 (DB 조회 없음, JWT 기반)
        ├── RequireScopeGuard → JWT scopes[] 배열 검사 (@RequireScope 데코레이터 기반)
        ├── GuildMembershipGuard → role 존재 + GET → 우회
        │                        → role 존재 + non-GET → 403 (read-only fail-closed)
        │
        └── AuditLogInterceptor → audit_log 테이블 기록
                                  (adminDiscordUserId, guildId, path, method, timestamp)
```

---

## 역할 및 Permission Scope

### 역할 정의

| role | 설명 |
|------|------|
| `super_admin` | 전체 scope 보유. 관리자 추가/제거/역할변경(`admin:manage`) 가능 |
| `bot_operator` | 운영 scope 보유. `admin:manage` 제외 |

### Permission Scope 정의표

| scope | 설명 | super_admin | bot_operator |
|-------|------|:-----------:|:------------:|
| `guild:view` | cross-guild read-only 조회 (현 /admin 기능) | O | O |
| `admin:manage` | 관리자 추가/제거/역할변경 | O | X |
| `guild:manage` | 길드 강제 퇴장·이용정지 (향후 구현) | O | O |
| `billing:manage` | 구독/결제 상태 관리 (향후 구현) | O | O |
| `churn:view` | 구독 이탈 추적 (향후 구현) | O | O |
| `usage:view` | 사용량 미터링 (향후 구현) | O | O |
| `onboarding:view` | 길드 온보딩 퍼널 (향후 구현) | O | O |
| `notification:manage` | 알림/공지 관리 (향후 구현) | O | O |
| `feature-flag:manage` | Feature Flag 관리 (향후 구현) | O | O |

> `향후 구현` scope는 자리를 예약해 두되, 해당 기능의 실제 구현은 별도 후속 도메인 작업에서 진행한다. 본 PRD는 권한 체계 전환과 관리자 관리 기능만 범위로 한다.

---

## 사용자 세그먼트 및 여정

### 타겟 사용자

| 세그먼트 | 설명 |
|----------|------|
| **슈퍼 관리자 (super_admin)** | onyu 팀. `admin_user` 테이블 `role='super_admin'`. 전체 길드 read-only 열람 + 관리자 관리 가능 |
| **봇 운영자 (bot_operator)** | 위임된 운영자. `role='bot_operator'`. 운영 콘솔 기능 이용 가능, 단 관리자 관리(`admin:manage`) 제외 |

> 기존 **길드 운영자(operator)** 는 이 도메인의 타겟이 아님. `/admin` 라우트는 `role` 미보유 시 403.

### 사용자 여정 1: 버그 신고 대응

| 단계 | 페이지 | 행동 |
|------|--------|------|
| 1 | `/` (랜딩) | 플랫폼 어드민이 Discord OAuth 로그인 |
| 2 | `/select-guild` | (기존 흐름) — 길드 선택 화면을 거칠 수도 있으나 `/admin` 직접 진입 가능 |
| 3 | `/admin` | 전체 길드 현황 화면에서 신고된 길드 검색/식별 |
| 4 | `/admin` → `/dashboard/guild/[guildId]/overview` | 해당 길드 개요 read-only 열람 |
| 5 | `/dashboard/guild/[guildId]/*` (기존 대시보드) | 음성 통계·비활동 회원·신입 현황 등 도메인별 열람 |
| 6 | 열람 완료 | 감사 로그 자동 기록 (AuditLogInterceptor) |

### 사용자 여정 2: 개발·테스트 모니터링

| 단계 | 페이지 | 행동 |
|------|--------|------|
| 1 | `/admin` | 전체 길드 목록에서 활동이 활발한 서버 식별 |
| 2 | `/admin` 내 헬스/모니터링 패널 | `GET /health`, `GET /metrics` 참조 (기존 엔드포인트 재사용) |
| 3 | `/dashboard/guild/[guildId]/voice` | 음성 세션 실시간 현황 read-only 열람 |

### 사용자 여정 3: 관리자 추가/역할 변경 (super_admin 전용)

| 단계 | 페이지 | 행동 |
|------|--------|------|
| 1 | `/admin/admins` | 현재 관리자 목록 확인 |
| 2 | `/admin/admins` 내 [관리자 추가] | 추가할 Discord 사용자 ID 입력 + 역할 선택 |
| 3 | 저장 | `POST /api/admin/admins` 호출 → `admin_user` 테이블 INSERT |

---

## IA (Information Architecture)

```
/ (랜딩)
└── /admin                                    [관리자 전용 — role 존재 게이트]
    ├── (전체 길드 현황 — guild:view scope)
    │   ├── 길드 목록 테이블 (봇 참여 전체)
    │   │   ├── 길드명 / 길드 ID / 멤버 수 / 봇 참여일
    │   │   └── [열람] → /dashboard/guild/[guildId]/overview
    │   └── 플랫폼 헬스 패널
    │       ├── GET /health (API + Bot + DB + Redis)
    │       └── GET /metrics 요약 (Prometheus — 링크)
    │
    ├── /admin/admins                         [super_admin 전용 — admin:manage scope 게이트]
    │   ├── 관리자 목록 테이블 (discordUserId, role, grantedBy, isActive, createdAt)
    │   ├── [관리자 추가] — Discord ID + 역할 입력 폼
    │   ├── [역할 변경] — role 드롭다운 수정
    │   └── [비활성화] — isActive false 처리
    │
    └── /admin/guilds/[guildId]               [drill-in 진입점]
        └── → redirect → /dashboard/guild/[guildId]/overview
                          (기존 대시보드 재사용 — read-only 모드)

/dashboard/guild/[guildId]/*                  [기존 길드 운영자 대시보드 — read-only 재사용]
├── /overview
├── /voice
├── /newbie
├── /inactive-member
├── /co-presence
├── /diagnosis
└── /getting-started

/settings/guild/[guildId]/*                   [기존 설정 페이지 — 슈퍼 관리자는 열람 전용]
│                                              (non-GET API 호출 시 자동 403)
├── /auto-channel
├── /newbie
├── /status-prefix
├── /sticky-message
├── /voice
└── /diagnosis
```

> `/admin` 은 기존 `/dashboard/guild/...` 및 `/settings/guild/...` 와 **완전히 분리된 진입점**이다.
> 슈퍼 관리자는 `/admin` 으로 진입 후 기존 대시보드 URL 로 drill-in 한다.
> 기존 길드 운영자는 `/admin` 접근 불가 (403).

---

## 기능 상세

### F-SUPER-ADMIN-001: JWT payload role + scopes 전환

**목적**: Discord OAuth 로그인 완료 시 `admin_user` DB 조회 → JWT에 `role` + `scopes` 포함

**변경 위치**

- `apps/api/src/auth/application/auth.service.ts` — `createToken()` 수정: `parseSuperAdminIds()` 제거 → `AdminUserRepository.findByDiscordId()` 조회. 조회 결과 없으면 `role: null`, `scopes: []`. 있으면 `role` + role별 기본 scopes 산출
- `apps/api/src/auth/infrastructure/jwt.strategy.ts` — payload에 `role` / `scopes` 반영
- `apps/web/app/auth/me/route.ts` — `JwtPayload` 타입 변경 (`isSuperAdmin` → `role` + `scopes`)

**동작**

1. OAuth 콜백에서 `createToken()` 호출 시 `AdminUserRepository.findByDiscordId(discordUserId)` 조회
2. 레코드 없음 → `role: null`, `scopes: []`
3. 레코드 있고 `isActive=true` → `role` + role별 기본 scopes 산출 (`permissions` 컬럼 있으면 override)
4. 레코드 있고 `isActive=false` → `role: null`, `scopes: []`
5. JWT payload에 `role`, `scopes` 포함하여 발급

**환경변수 변경**

| 변수 | 처리 |
|------|------|
| `SUPER_ADMIN_IDS` | 제거 |

> 초기 슈퍼관리자는 `SeedInitialSuperAdmin` 마이그레이션으로 `admin_user` 테이블에 직접 삽입 (discordUserId=`383635512252039168`, role=`super_admin`, grantedBy=`seed`)

🔒 **보안 노트**: 권한 변경은 재로그인/토큰 만료 후 반영됨. 긴급 권한 회수 필요 시 `isActive=false` 처리 후 토큰 TTL 대기. JWT TTL 1~2h 권장.

---

### F-SUPER-ADMIN-002: GuildMembershipGuard GET 우회

**목적**: 슈퍼 관리자가 임의 길드의 GET 엔드포인트에 접근 가능하도록 전역 가드 수정

**변경 위치**: `apps/api/src/common/guards/guild-membership.guard.ts`

**동작**

```
요청 수신
  ├── role 존재(not null) AND method === GET  → 멤버십 체크 우회 (통과)
  ├── role 존재(not null) AND method !== GET  → 403 반환 (read-only fail-closed)
  ├── role 없음(null) AND guildId ∈ JWT guilds[] → 통과
  └── role 없음(null) AND guildId ∉ JWT guilds[] → 403 반환
```

**제약**

- 조회성 POST 2개(`POST /api/guilds/:guildId/voice-analytics/ai-insight`, `POST /api/guilds/:guildId/inactive-members/classify`)는 슈퍼 관리자도 **차단** (LLM 비용·재계산 부작용 — 의도된 동작)
- 변경은 이 가드 1파일에 국한. 다른 가드(BotApiAuthGuard, SuperAdminGuard 등) 영향 없음

---

### F-SUPER-ADMIN-003: SuperAdminGuard 갱신

**목적**: `/api/admin/*` 엔드포인트를 관리자 전용으로 보호

**위치**: `apps/api/src/super-admin/guards/super-admin.guard.ts`

**동작**: JWT payload `role` 이 `null` 이면 즉시 403. role 존재만 확인 (DB 조회 없음). 길드 멤버십과 무관하게 동작.

---

### F-SUPER-ADMIN-003-B: RequireScopeGuard 신규

**목적**: `@RequireScope('guild:view')` 같은 데코레이터로 특정 scope 보호

**위치**: `apps/api/src/super-admin/guards/require-scope.guard.ts`

**동작**: JWT `scopes[]`에 required scope 포함 여부 검사. 미포함 시 403.

---

### F-SUPER-ADMIN-004: 전체 길드 목록 API

**목적**: 봇이 참여 중인 전체 길드 목록 반환

**엔드포인트**: `GET /api/admin/guilds`

**보호**: `SuperAdminGuard` + `RequireScopeGuard('guild:view')`

**응답 스키마**

```json
{
  "guilds": [
    {
      "guildId": "string",
      "name": "string",
      "iconUrl": "string | null",
      "memberCount": "number | null",
      "botJoinedAt": "string (ISO 8601) | null"
    }
  ],
  "total": "number"
}
```

🟨 **길드 목록 데이터 출처 미정**: Discord REST API(`/users/@me/guilds`) 직접 호출 또는 DB `guild_member.guildId` distinct 조회 중 어느 방식이 적합한지 DB 설계(Phase 2) 단계에서 확정한다. 두 방식의 트레이드오프:
- Discord REST: 봇이 실제 참여 중인 최신 목록, 단 API 호출 비용
- DB distinct: 추가 Discord API 호출 불필요, 단 봇이 퇴장한 길드가 잔류할 수 있음

---

### F-SUPER-ADMIN-005: 전체 길드 현황 화면 (기능 1)

**목적**: 플랫폼 어드민이 봇이 참여 중인 전체 길드를 한눈에 파악하고 drill-in

**경로**: `/admin`

**레이아웃**: `apps/web/app/admin/layout.tsx` — `role` 체크 후 null 시 403/redirect

**구성**

| 섹션 | 내용 |
|------|------|
| 길드 목록 테이블 | 길드명, 길드 ID, 멤버 수, 봇 참여일, [열람] 링크 |
| 검색/필터 | 길드명 또는 길드 ID 텍스트 검색 (프론트엔드 필터) |
| 플랫폼 헬스 패널 | `GET /health` 결과 표시 (API·Bot·DB·Redis 상태) + Grafana 링크 |

**[열람] 링크 동작**

- 클릭 시 `/dashboard/guild/[guildId]/overview` 로 이동 (기존 대시보드 재사용)
- 기존 대시보드는 read-only 모드로 동작 (non-GET API mutation 시 자동 403)
- 💬 기존 대시보드 UI 에 "read-only 모드 배너" 표시 여부는 UX 구현 단계에서 결정

---

### F-SUPER-ADMIN-006: 감사 로그

**목적**: 슈퍼 관리자의 길드 데이터 열람 이력 기록 (누가/언제/어느 길드/경로)

**요구사항**

- 기록 항목: `adminDiscordUserId`, `guildId` (없으면 null), `httpMethod`, `requestPath`, `timestamp`
- 기록 범위: 슈퍼 관리자가 발생시킨 모든 `/api/guilds/:guildId/*` 및 `/api/admin/*` 요청
- 자동 기록: `AuditLogInterceptor` (NestJS Interceptor) 로 코드 산포 없이 일괄 처리

**저장 방식**: 신규 `audit_log` 테이블(TypeORM 엔티티 + 마이그레이션) 또는 구조화 로깅(Loki) — 구체적 저장 방식은 DB 설계(Phase 2)에 위임

💬 감사 로그 조회 UI(어드민 화면 내 로그 열람)는 Phase 1 범위 외. 후속 Phase 후보로만 기록.

---

### F-SUPER-ADMIN-007: admin_user 테이블 신규

**목적**: 관리자 정보를 DB에 영속화 (역할, 부여자, 활성 여부)

**신규 엔티티**: `AdminUser` (`admin_user` 테이블)

**컬럼**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid PK | — |
| `discordUserId` | varchar UNIQUE | Discord user ID |
| `role` | varchar | `'super_admin'` \| `'bot_operator'` |
| `permissions` | text[] nullable | role 기본 scope 오버라이드. 초기 미사용. |
| `grantedBy` | varchar nullable | 부여자 Discord user ID (감사 목적) |
| `isActive` | boolean default true | false 시 로그인 시 role null 처리 |
| `createdAt` | timestamptz | — |
| `updatedAt` | timestamptz | — |

**부트스트랩**: `SeedInitialSuperAdmin` 마이그레이션으로 최초 슈퍼관리자 1명 삽입 (`discordUserId='383635512252039168'`, `role='super_admin'`, `grantedBy='seed'`)

**인프라 패턴**: `audit-log.orm-entity.ts` 패턴 복제

---

### F-SUPER-ADMIN-008: 관리자 관리 API 신규

**목적**: 슈퍼 관리자가 다른 관리자를 추가/조회/역할변경/비활성화

**보호**: `RequireScopeGuard('admin:manage')` — `super_admin`만 접근 가능

**엔드포인트 목록**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/admins` | 관리자 목록 조회 (`isActive` 기준 필터 가능) |
| POST | `/api/admin/admins` | 관리자 추가 (`discordUserId`, `role` 필수) |
| PATCH | `/api/admin/admins/:discordUserId` | 역할 변경 (`role`) |
| DELETE | `/api/admin/admins/:discordUserId` | 관리자 비활성화 (`isActive=false`, 물리 삭제 아님) |

**요청/응답 스키마**

```json
// POST /api/admin/admins
{ "discordUserId": "string", "role": "super_admin|bot_operator" }

// PATCH /api/admin/admins/:discordUserId
{ "role": "super_admin|bot_operator" }

// GET /api/admin/admins 응답
{
  "admins": [
    {
      "discordUserId": "string",
      "role": "string",
      "grantedBy": "string|null",
      "isActive": true,
      "createdAt": "ISO8601"
    }
  ]
}
```

**제약**

- 자기 자신 비활성화 불가 (마지막 `super_admin` 보호)
- `super_admin`이 1명뿐인 상태에서 해당 `super_admin`을 `bot_operator`로 다운그레이드 불가 (최소 1명 `super_admin` 유지)

---

### F-SUPER-ADMIN-009: 관리자 관리 콘솔 UI 신규

**목적**: 슈퍼 관리자가 웹 콘솔에서 다른 관리자를 추가/관리

**경로**: `/admin/admins`

**레이아웃**: `AdminLayout` 하위. `admin:manage` scope 미보유 시 접근 불가 (403/redirect)

**구성**

| 섹션 | 내용 |
|------|------|
| 관리자 목록 테이블 | `discordUserId`, `role` 배지, 부여자, 활성 상태, 등록일 |
| [관리자 추가] 버튼 | Discord ID 입력 + 역할 선택 모달 |
| [역할 변경] | 인라인 드롭다운 또는 모달 |
| [비활성화] | 확인 다이얼로그 후 DELETE 요청 |

---

## 데이터 모델

### 신규 엔티티 (예정)

| 엔티티 | 테이블 | 역할 |
|--------|--------|------|
| `AdminUser` | `admin_user` | 관리자 역할·권한 영속화 |
| `AuditLog` | `audit_log` | 슈퍼 관리자 열람 감사 이력 |

**`AdminUser` 컬럼**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid (PK) | — |
| `discordUserId` | varchar UNIQUE | Discord user ID |
| `role` | varchar | `'super_admin'` \| `'bot_operator'` |
| `permissions` | text[] nullable | role 기본 scope 오버라이드. 초기 미사용. |
| `grantedBy` | varchar nullable | 부여자 Discord user ID (감사 목적) |
| `isActive` | boolean default true | false 시 로그인 시 role null 처리 |
| `createdAt` | timestamptz | — |
| `updatedAt` | timestamptz | — |

**`AuditLog` 컬럼 (예정)**

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid (PK) | — |
| `adminDiscordUserId` | varchar | 슈퍼 관리자 Discord user ID |
| `guildId` | varchar (nullable) | 열람 대상 길드 ID (어드민 전용 엔드포인트는 null 가능) |
| `httpMethod` | varchar | `GET`, `POST` 등 |
| `requestPath` | varchar | 요청 경로 (예: `/api/guilds/123/voice/stats`) |
| `timestamp` | timestamptz | 요청 시각 |

> 구체적 컬럼 타입·인덱스·저장 방식은 DB 설계(Phase 2)에 위임. 위 목록은 요구사항 기반 초안.

### JWT Payload 변경

기존 `JwtPayload`:

```ts
interface JwtPayload {
  discordUserId: string;
  guilds: string[];
  isSuperAdmin: boolean;
  // ...기존 필드
}
```

전환 후:

```ts
interface JwtPayload {
  discordUserId: string;
  guilds: string[];
  role: 'super_admin' | 'bot_operator' | null;  // 전환 (isSuperAdmin 제거)
  scopes: string[];                               // 신규
  // ...기존 필드
}
```

---

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| ~~`SUPER_ADMIN_IDS`~~ | — | **제거됨**. 초기 슈퍼관리자는 `SeedInitialSuperAdmin` 마이그레이션으로 `admin_user` 테이블에 직접 삽입 |

---

## 외부 의존성

| 서비스 | 용도 |
|--------|------|
| Discord API | OAuth2 인증 (기존 흐름 재사용). 🟨 길드 목록 조회 방식 확정 시 추가 호출 가능 |
| PostgreSQL | `admin_user` 테이블 + `audit_log` 테이블 저장 |

---

## 범위 제외 (후속 Phase 후보)

아래 기능은 Phase 1 범위 외. 향후 기획 시 별도 티켓으로 추가.

| 기능 | 설명 |
|------|------|
| 기능 2: 길드 강제 퇴장 / 이용 정지 | `guild:manage` scope 예약됨. 실제 구현은 후속 도메인 작업 |
| 기능 3~6: 구독/결제 상태 관리, churn 추적, 사용량 미터링, 온보딩 퍼널 | `billing:manage`, `churn:view`, `usage:view`, `onboarding:view` scope 예약됨. 결제·계측 데이터 모델 미정 |
| 기능 7: 알림/공지 시스템 | `notification:manage` scope 예약됨 |
| 기능 8: Feature Flag 관리 | `feature-flag:manage` scope 예약됨 |
| 감사 로그 조회 UI | 어드민 화면 내 열람 이력 조회 페이지 |

---

## 비기능 요구사항

| 항목 | 요구사항 |
|------|----------|
| 보안 | 관리자 식별은 서버사이드 JWT 검증만 신뢰. 웹 클라이언트 `role` / `scopes` 는 UI 분기 전용 (권한 결정은 API 가드가 담당) |
| Read-only 강제 | fail-closed: 슈퍼 관리자라도 non-GET 요청 시 즉시 403. 예외 없음 |
| 감사 | 슈퍼 관리자의 모든 길드 데이터 접근은 자동 기록. 기록 실패 시 요청 차단 여부는 DB 설계에서 결정 |
| 성능 | 길드 목록 API 응답 1초 이내 (봇 참여 길드 수 1,000 미만 기준) |
| JWT TTL | JWT TTL 1~2h 권장 (권한 변경 즉시 반영 불가 트레이드오프 최소화) |

---

## 💬 정보성 마커 (법무·권한 사전 검토 완료)

💬 **권한 (사전 승인)**: DB 기반 role/scope 전환 설계 (`admin_user` 테이블 + `RequireScopeGuard` + JWT payload role/scopes) 는 사용자가 검토·승인 완료. 미결 사항 없음.

💬 **개인정보 / 타 길드 데이터 열람 (사전 승인)**: 슈퍼 관리자의 타 길드 데이터 열람은 read-only + DB 기반 role + 감사 로그 3중 제어로 결정됨. 사용자가 검토·승인 완료. 미결 사항 없음.

💬 **개인정보처리방침 고지**: 플랫폼 운영자의 내부 관리 목적 열람에 대한 고지 문구 추가는 코드 외 정책 사항. 법무·정책 검토 시 `/privacy` 페이지 갱신 필요.

---

## 🟨 가정/미정 마커

🟨 **길드 목록 데이터 출처**: Discord REST API 직접 호출 vs. DB `guild_member.guildId` distinct 조회 — DB 설계(Phase 2)에서 확정.

🟨 **감사 로그 저장 방식**: `audit_log` PostgreSQL 테이블 vs. 구조화 로깅(Loki) — DB 설계(Phase 2)에서 확정.

🟨 **read-only 모드 배너**: 슈퍼 관리자가 기존 대시보드 열람 시 "read-only 모드" UI 배너 표시 여부 — UX 구현 단계에서 결정.

---

## 사용자 확인 필요 항목

이 PRD 에는 🔴(결정 대기) 마커가 없다. 상기 권한·개인정보 사안은 모두 사전 승인 완료(💬 정보성 마커). 미정 사항은 🟨 로 표기하며 DB 설계·UX 단계에서 확정한다.

---
