# Super-Admin 도메인 통합 유스케이스 인덱스

> super-admin 도메인은 **api + web 2앱 cross-app 통합**이다.
> 플랫폼 어드민이 Discord OAuth2 로그인 후 DB 기반 role/scopes JWT를 발급받아, 봇이 참여한 전체 길드를 열람하고, 개별 길드 대시보드에 read-only로 drill-in하는 전 구간 흐름을 통합 검증 관점에서 명세한다.
>
> 1차 소스: `docs/specs/prd/super-admin.md`, `docs/specs/userflow/super-admin.md`, `docs/plans/auth-admin-db-role-review.md`.

## 통합 시나리오 개요

### UC-01~04: 초기 구현 (환경변수 기반 isSuperAdmin — 구버전)

```
플랫폼 어드민(브라우저)       Web (apps/web)                   API (apps/api)
                         /auth/discord → Discord OAuth2
                         /auth/callback ──────────────────→ auth.service.createToken()
                                                             SUPER_ADMIN_IDS 대조
                                                             isSuperAdmin: true → JWT 발급
                         /admin (AdminLayout) ─────────────→ /auth/me → jwt.strategy.validate()
                                                             isSuperAdmin 확인 → 진입 허용

                         /admin/page.tsx ──────────────────→ GET /api/admin/guilds
                                                             SuperAdminGuard (isSuperAdmin 검증)
                                                             AuditLogInterceptor (감사 로그) 🔒
                                                             getGuilds() → 전체 길드 목록 응답

                         [열람] 클릭
                         /dashboard/guild/[guildId]/* ─────→ GET /api/guilds/:guildId/*
                                                             GuildMembershipGuard:
                                                               isSuperAdmin+GET  → 우회 통과 🔒
                                                               isSuperAdmin+POST → 403 (fail-closed)
                                                             AuditLogInterceptor (감사 로그) 🔒
                                                             기존 컨트롤러 정상 응답
```

### UC-05~08: DB 기반 role/scopes 전환 (현행 설계)

```
플랫폼 어드민(브라우저)       Web (apps/web)                   API (apps/api)              PostgreSQL
                         /auth/discord → Discord OAuth2
                         /auth/callback ──────────────────→ auth.service.createToken()
                                                             AdminUserRepository
                                                             .findByDiscordId()  ──────→ admin_user 조회
                                                             role + scopes 산출
                                                             JWT { role, scopes } 발급
                         /admin (AdminLayout) ─────────────→ /auth/me
                                                             role !== null → 진입 허용
                                                             admin:manage scope → 관리자 메뉴 노출

                         /admin/page.tsx ──────────────────→ GET /api/admin/guilds
                                                             SuperAdminGuard (role null 체크)
                                                             RequireScopeGuard('guild:view')
                                                             AuditLogInterceptor 🔒

                         /admin/admins/page.tsx ───────────→ GET /api/admin/admins
                                                             RequireScopeGuard('admin:manage')
                                                             → super_admin 통과 / bot_operator 403

                         [관리자 추가] ────────────────────→ POST /api/admin/admins
                                                             RequireScopeGuard('admin:manage')
                                                             admin_user INSERT ─────────→ DB 반영
                                                             (대상자 재로그인 후 권한 반영)
```

## 유스케이스 목록

### UC-01~04: 초기 구현 (환경변수 기반 — 구버전 참조용)

| ID | 제목 | 통합 범위 | 비고 |
|----|------|----------|------|
| [UC-01](UC-01-login-isuperadmin-jwt.md) | 슈퍼 관리자 로그인 — isSuperAdmin JWT 발급부터 /admin 진입까지 | api(auth) + web(admin) | 구버전(SUPER_ADMIN_IDS 기반) |
| [UC-02](UC-02-guild-list-api.md) | 전체 길드 목록 조회 — SuperAdminGuard 보호 아래 /api/admin/guilds 응답 | api(admin) + web(/admin) | read-only 목록 |
| [UC-03](UC-03-guild-readonly-drill-in.md) | 타 길드 read-only drill-in — GuildMembershipGuard GET 우회 및 감사 로그 기록 | api(guards) + web(dashboard) | 핵심 cross-app 통합 🔒 PII |
| [UC-04](UC-04-readonly-boundary.md) | read-only 경계 검증 — mutation 시도 시 fail-closed 403 | api(GuildMembershipGuard) | 보안 검증 포인트 |

### UC-05~08: DB 기반 role/scopes 전환 (현행)

| ID | 제목 | 통합 범위 | 비고 |
|----|------|----------|------|
| [UC-05](UC-05-db-role-token-issue.md) | DB 기반 권한 토큰 발급 통합 — Discord OAuth 로그인부터 role/scopes JWT 발급 및 콘솔 메뉴 분기까지 | api(auth+admin_user) + web(admin) | 인증 end-to-end (DB 기반) 🔒 |
| [UC-06](UC-06-admin-add-role-propagation.md) | 관리자 추가 → 권한 반영 통합 — web 콘솔 관리자 추가부터 대상자 재로그인 시 새 role/scopes 반영까지 | api(admin-user) + web(/admin/admins) | 재로그인 후 반영 지연 검증 🔒 |
| [UC-07](UC-07-scope-based-access-control.md) | scope 기반 접근제어 통합 — bot_operator의 admin:manage 엔드포인트 차단 및 super_admin 통과 검증 | api(guards) + web(/admin/admins) | 이중 방어 구조 🔒 |
| [UC-08](UC-08-bootstrap-seed-super-admin.md) | 부트스트랩 통합 — SeedInitialSuperAdmin 마이그레이션으로 최초 super_admin 생성 및 관리자 추가 가능 상태 진입 | api(migrations) + DB + web | 초기 배포 검증 |

## UC-05~08 핵심 통합 포인트 요약

| 통합 포인트 | 관련 UC | 핵심 검증 |
|------------|---------|----------|
| 재로그인 후 반영 (JWT baked-in) | UC-05, UC-06 | 권한 변경 후 기존 JWT로 접근 시 구 권한 유지 → 재로그인 후 신 권한 반영 |
| 자기 비활성화 불가 | UC-06, UC-08 | 자기 자신 DELETE 시도 → 오류 반환 |
| 최소 1명 super_admin 유지 | UC-06, UC-08 | 마지막 super_admin 비활성화 또는 다운그레이드 시도 → 오류 반환 |
| role null = 미등록 / 비활성 | UC-05, UC-08 | 미등록 또는 isActive=false → role: null → /admin 차단 |
| scope 이중 방어 | UC-07 | 웹 레이아웃(UX) + API RequireScopeGuard(권한 결정) 양쪽에서 차단 |

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2026-06-19 | usecase-writer | 초기 작성 (UC-01~04) |
| 1.1 | 2026-06-19 | usecase-writer | UC-05~08 추가 — DB 기반 role/scopes 전환 통합 시나리오 |
