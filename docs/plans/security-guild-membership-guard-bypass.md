# 보안 P0 — GuildMembershipGuard 멤버십 검증 우회 (fail-open)

> 발견: 2026-06-20, `test/inactive-member-tests` 작업 중 super-admin e2e 재활성화로 표면화.
> 상태: **수정됨 (2026-06-20) — 방식 A(route-level 가드) 적용**. `fix/guild-membership-guard-bypass` PR 에서 해소.
> 분류: 🔴 권한(authorization) — HITL 4분야.
>
> **수정 요약**: `GuildMembershipGuard` 글로벌(`APP_GUARD`) 등록 제거 + `:guildId` 보호 컨트롤러 17개의 `@UseGuards` 에 `JwtAuthGuard` **뒤**로 배치(순서 보장). 가드 본문은 무수정(JwtStrategy 가 `guilds ?? []` 보장 → 순서만 고치면 비멤버 `[].some()`=false 로 정상 403). admin-guild(cross-guild 설계)·metrics(:guildId 없음)는 제외. super-admin/inactive-member/role-panel e2e 로 검증(멤버 JWT fixture 정합 + cross-guild 403).

## 증상

`GuildMembershipGuard` 의 길드 멤버십 검증이 **운영에서 항상 우회**된다. 인증된 사용자라면 자신이 멤버가 아닌 임의 길드의 데이터에도 접근/변경 가능(비멤버 403 이어야 할 경로가 200).

재현 테스트 — `apps/api/test/super-admin.e2e-spec.ts` 의 cross-guild 시나리오(admin-db-role 전환 후 role/scopes 기반):
- `[P0] super_admin/bot_operator(비멤버 길드) + non-GET(POST) → 403 (fail-closed)` — 기대 403, 실제 200
- `[P0] role=null 일반 사용자(비멤버 길드) + GET → 403 (기존 동작 불변)` — 기대 403, 실제 200

> 위 테스트는 가드 버그로 현재 실패한다. 보안 PR 에서 가드를 수정하면 통과해야 한다.

## 근본 원인

NestJS 가드 실행 순서는 **글로벌(APP_GUARD) → 컨트롤러 → route**.

- `apps/api/src/app.module.ts:82-83` — `HttpThrottlerGuard`, `GuildMembershipGuard` 가 **글로벌(APP_GUARD)** 로 등록.
- `JwtAuthGuard` 는 글로벌이 아니라 컨트롤러 **route-level** `@UseGuards(JwtAuthGuard)` 로만 적용.
- `apps/api/src/main.ts` 에 글로벌 인증 미들웨어 없음(helmet 만) → `req.user` 는 route-level `JwtAuthGuard`(passport `JwtStrategy.validate`)에서만 채워진다.

따라서 글로벌 `GuildMembershipGuard` 가 실행되는 시점엔 `JwtAuthGuard` 가 아직 안 돌아 `req.user` 가 `undefined`:

```ts
// apps/api/src/common/guards/guild-membership.guard.ts:28
if (!user?.guilds) return true;   // ← 항상 여기서 통과 (fail-open)
```

주석("JWT 인증되지 않은 요청은 통과")은 *route 가드가 먼저 돈다*는 잘못된 가정에 기반한다. 실제론 글로벌이 먼저라 **모든 요청에서 멤버십 검증이 무력화**된다. 이후 route `JwtAuthGuard` 가 토큰을 검증해 `req.user` 를 채우지만, 멤버십 가드는 이미 통과한 뒤다.

## 영향

- **비멤버 데이터 접근**: 유효 JWT 만 있으면 멤버가 아닌 길드의 보호 엔드포인트(`/api/guilds/:guildId/*`)에 접근/변경 가능.
- **관리자 non-GET 차단 무력화**: `role != null` read-only(GET) 우회 의도였으나(admin-db-role 전환 후) non-GET 도 통과.
- 정상 사용자는 보통 자기 길드만 접근하므로 **운영에서 눈에 안 띄던 잠복 결함**.

## 수정 방안 (택1 — 보안 PR 에서 결정, 권한 변경이므로 HITL)

- **(A) GuildMembershipGuard 를 글로벌 → route 레벨로**: 보호 컨트롤러에 `@UseGuards(JwtAuthGuard, GuildMembershipGuard)` 명시(순서 보장). 명시적·안전하나 모든 보호 컨트롤러 수정.
- **(B) JwtAuthGuard 를 글로벌(APP_GUARD)로 승격** + 공개 경로(auth/health)에 `@Public()` 데코레이터 + GuildMembershipGuard 보다 먼저 등록. blast radius 큼(전 경로 인증 기본화).
- **(C) GuildMembershipGuard 내부에서 JWT 선검증**: 가드가 자체적으로 토큰을 파싱/검증해 `req.user` 확보 후 멤버십 판정. 단일 파일 변경이나 인증 로직 중복.
- 어느 방안이든 **fail-open(`!user?.guilds → return true`)을 fail-closed 로 재검토** 필요.

## 회귀 방지

- 보안 PR 에서 위 2개 `it.skip` 을 **un-skip** 하여 403 을 강제.
- (권장) `super-admin.e2e` 외에 inactive-member/voice 등 보호 컨트롤러에도 "비멤버 → 403" e2e 1건씩 추가.

## 참조

- 가드: `apps/api/src/common/guards/guild-membership.guard.ts`
- 등록: `apps/api/src/app.module.ts:82-83`
- 인증: `apps/api/src/auth/infrastructure/jwt-auth.guard.ts`, `jwt.strategy.ts`
