# Super-Admin 도메인 통합 유스케이스 인덱스

> super-admin 도메인은 **api + web 2앱 cross-app 통합**이다.
> 플랫폼 어드민이 Discord OAuth2 로그인 후 `isSuperAdmin` JWT를 발급받아, 봇이 참여한 전체 길드를 열람하고, 개별 길드 대시보드에 read-only로 drill-in하는 전 구간 흐름을 통합 검증 관점에서 명세한다.
>
> 1차 소스: `docs/specs/prd/super-admin.md`, `docs/specs/userflow/super-admin.md`.

## 통합 시나리오 개요

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

## 유스케이스 목록

| ID | 제목 | 통합 범위 | 비고 |
|----|------|----------|------|
| [UC-01](UC-01-login-isuperadmin-jwt.md) | 슈퍼 관리자 로그인 — isSuperAdmin JWT 발급부터 /admin 진입까지 | api(auth) + web(admin) | 인증 end-to-end |
| [UC-02](UC-02-guild-list-api.md) | 전체 길드 목록 조회 — SuperAdminGuard 보호 아래 /api/admin/guilds 응답 | api(admin) + web(/admin) | read-only 목록 |
| [UC-03](UC-03-guild-readonly-drill-in.md) | 타 길드 read-only drill-in — GuildMembershipGuard GET 우회 및 감사 로그 기록 | api(guards) + web(dashboard) | 핵심 cross-app 통합 🔒 PII |
| [UC-04](UC-04-readonly-boundary.md) | read-only 경계 검증 — mutation 시도 시 fail-closed 403 | api(GuildMembershipGuard) | 보안 검증 포인트 |

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2026-06-19 | usecase-writer | 초기 작성 (UC-01~04) |
