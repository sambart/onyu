# 관리자 권한 DB 관리 전환 검토 보고서

> 작성일: 2026-06-19 · 도메인: auth · 상태: **검토(미구현)** · 결정 일부 확정(§2)
> 목적: 환경변수 기반 슈퍼관리자 판별을 **DB 기반 다중 역할/권한 모델**로 전환. 향후 봇 운영자 콘솔(SaaS 운영 기능) 확장을 수용하는 권한 체계 설계.

---

## 1. 현황 (As-Is)

### 1.1 슈퍼관리자 콘솔

- **경로**: 웹 `/admin` ([apps/web/app/admin/layout.tsx](../../apps/web/app/admin/layout.tsx), [page.tsx](../../apps/web/app/admin/page.tsx))
- **기능**: 봇 참여 전체 길드 현황 + 플랫폼 헬스 대시보드, 개별 길드 read-only 열람
- **read-only 강제**: 슈퍼관리자는 GET만 통과, non-GET은 403 ([guild-membership.guard.ts:30-33](../../apps/api/src/common/guards/guild-membership.guard.ts#L30-L33))

### 1.2 권한 판별 흐름 (환경변수 → JWT baked-in)

```
.env  SUPER_ADMIN_IDS=123...,987...        (Discord user ID 쉼표 구분)
  │  OAuth 콜백
  ▼
AuthService.createToken()                  apps/api/src/auth/application/auth.service.ts:65-66
  parseSuperAdminIds() → isSuperAdmin = superAdminIds.has(discordId)
  │  JWT payload 에 isSuperAdmin 박아서 발급
  ▼
JwtStrategy.validate() → req.user.isSuperAdmin          jwt.strategy.ts:16-31
  ▼
SuperAdminGuard / GuildMembershipGuard 가 req.user.isSuperAdmin 검증
```

### 1.3 DB 현황

- User 엔티티 **없음** — 사용자 정보는 JWT가 보관소.
- `GuildMember` / `UserSetting` 엔티티에 role/permission 필드 **없음**.
- **`audit_log` 테이블은 이미 존재** ([audit-log.orm-entity.ts](../../apps/api/src/super-admin/infrastructure/audit-log.orm-entity.ts)) — 권한 테이블 추가 시 인프라(엔티티/마이그레이션/repository) 패턴 그대로 재사용 가능.

---

## 2. 확정 결정 (사용자 승인)

| # | 항목 | 결정 |
|---|---|---|
| 1 | **반영 방식** | **(A) JWT 유지 + DB as source.** `createToken()`에서 env 대신 DB 조회. 권한 변경은 **재로그인/토큰만료 후 반영**. guard/매요청 DB 조회 없음. |
| 2 | **부트스트랩** | **seed 마이그레이션으로 최초 슈퍼관리자 1명 삽입.** `SUPER_ADMIN_IDS` env fallback 제거. |
| 3 | **역할 구분** | **super_admin** = cross-guild(전체 길드) 조회 + 봇 운영자 콘솔 전체 + 관리자 관리. **bot_operator(봇 운영자)** = 운영 콘솔 기능 이용(아래 §4 기능), 단 `admin:manage` 제외. |
| 4 | **seed 대상** | 최초 슈퍼관리자 Discord ID = `383635512252039168`. |
| 5 | **scopes 포함** | JWT payload에 `role` + `scopes` **처음부터 포함** (세분화 모델로 시작). |

> **(A) 보안 보완**: 권한 즉시 회수가 안 되므로 JWT TTL을 짧게(예: 1~2h) 유지 권장. 긴급 회수가 필요하면 추후 토큰 블랙리스트(Redis) 별도 검토.

---

## 3. 향후 봇 운영자 콘솔 기능 (권한 설계의 근거)

`/admin` 콘솔은 단순 read-only 길드 열람을 넘어 **SaaS 운영자 콘솔**로 확장 예정. 아래 기능들이 봇 운영자 권한을 요구한다. **이 기능들 자체는 본 권한 전환 작업의 범위 밖(별도 도메인/후속 작업)** 이며, 본 문서는 이를 수용하는 권한 체계만 설계한다.

| # | 기능 | 설명 | 권한 scope (제안) |
|---|---|---|---|
| 2 | 길드 관리 | 봇 참여 길드 목록, 강제 퇴장, 이용 정지 | `guild:manage` |
| 3 | 구독/결제 상태 관리 | 길드별 플랜 조회, 결제 이력, 수동 플랜 변경 | `billing:manage` |
| 4 | 구독 이탈(Churn) 추적 | 이탈 시점/사유/이탈률 추이 | `churn:view` |
| 5 | 사용량 미터링 | 길드별 API 호출/AI 분석/저장량 | `usage:view` |
| 6 | 길드 온보딩 퍼널 | 초대→설정완료→활성 전환율 | `onboarding:view` |
| 7 | 알림/공지 시스템 | 점검 공지, 플랜 변경/결제 실패 알림 | `notification:manage` |
| 8 | Feature Flag | 플랜별 기능 접근 제어 (Free/Pro/Enterprise) | `feature-flag:manage` |
| — | 전체 길드 조회 (현 `/admin`) | cross-guild read-only drill-in | `guild:view` |
| — | 관리자 관리 | 관리자 추가/제거/역할 변경 | `admin:manage` |

> 위 기능 다수(결제/플랜/미터링/feature flag)는 **신규 데이터 모델**(plan, subscription, usage 테이블 등)을 동반한다 — 본 권한 전환과 분리된 후속 도메인 작업.

---

## 4. To-Be 권한 모델 (role + permission scope)

7개 운영 기능이 서로 다른 영역이므로 **flat boolean(`isSuperAdmin`) 으로는 표현 불가**. **역할(role) + 권한 scope** 2층 모델 권장.

### 4.1 데이터 모델

```
admin_user
  id            uuid PK
  discordUserId varchar  UNIQUE          -- Discord user ID
  role          varchar  -- 'super_admin' | 'bot_operator'
  permissions   text[]   nullable        -- role 기본 scope 오버라이드(미사용 시 role 기본값)
  grantedBy     varchar  nullable        -- 부여자 Discord user ID (감사)
  isActive      boolean  default true
  createdAt     timestamptz
  updatedAt     timestamptz
```

- `audit_log`와 동일 인프라 패턴(엔티티 + 마이그레이션 + repository) 사용.
- `permissions` 컬럼은 **초기엔 미사용** — role 기본 scope 묶음으로 충분. 추후 "이 운영자는 결제만" 같은 세분화가 필요해질 때만 활용 (YAGNI 안전장치).

### 4.2 role → scope 기본 매핑

| role | 포함 scope |
|---|---|
| `super_admin` | **전체** (`admin:manage` 포함 — 관리자 추가/제거/역할변경 가능) |
| `bot_operator` | `guild:view`, `guild:manage`, `billing:manage`, `churn:view`, `usage:view`, `onboarding:view`, `notification:manage`, `feature-flag:manage` — **단 `admin:manage` 제외** |

> 즉 봇 운영자도 cross-guild 조회 및 운영 기능은 가능하되, **다른 관리자를 관리하는 권한만 슈퍼관리자 전용**. (운영 기능 대부분이 cross-guild 데이터를 전제하므로 `guild:view`는 두 역할 공통.)

### 4.3 JWT payload 변화 (방식 A)

```
// 현재
{ sub, username, avatar, guilds, isSuperAdmin: boolean }

// 전환 후
{ sub, username, avatar, guilds, role: 'super_admin'|'bot_operator'|null, scopes: string[] }
```

- `isSuperAdmin` 은 `role === 'super_admin'` 로 대체. 하위호환이 필요하면 한시적으로 둘 다 발급 후 제거.
- `scopes` 를 payload에 포함 → guard/decorator가 `@RequireScope('billing:manage')` 형태로 검사 (매 요청 DB 조회 불필요 = 방식 A 부합).

### 4.4 부트스트랩 seed

```
migration: SeedInitialSuperAdmin
  INSERT INTO admin_user (discordUserId, role, grantedBy)
  VALUES ('<운영자 Discord ID>', 'super_admin', 'seed')
```

> seed 대상 Discord ID는 **마이그레이션 실행 전 확정 필요** (현 `SUPER_ADMIN_IDS` 값 재활용 가능). 환경별로 다르면 env 1개(`BOOTSTRAP_SUPER_ADMIN_ID`)를 마이그레이션이 1회 읽는 방식도 가능.

---

## 5. 전환 영향 범위

### 5.1 본 작업 범위 (권한 전환)

| 파일 | 변경 |
|---|---|
| `apps/api/src/migrations/` | ① `admin_user` 테이블 생성 ② `SeedInitialSuperAdmin` seed |
| `apps/api/src/super-admin/infrastructure/` | 신규 `admin-user.orm-entity.ts` + repository (audit_log 패턴 복제) |
| [auth.service.ts:34-42, 65-73](../../apps/api/src/auth/application/auth.service.ts#L34-L73) | `parseSuperAdminIds()` 제거 → DB 조회. `role`/`scopes` 산출하여 payload 구성 |
| [jwt.strategy.ts](../../apps/api/src/auth/infrastructure/jwt.strategy.ts) | payload에 `role`/`scopes` 반영 |
| [super-admin.guard.ts](../../apps/api/src/super-admin/guards/super-admin.guard.ts) | `role === 'super_admin'` 검사로 변경 (DB 조회 X) + scope decorator/guard 신설 |
| 관리자 관리 API/콘솔 UI | **신규** — 관리자 목록/추가/제거/역할변경 (`admin:manage` 보호) |
| `.env.example` | `SUPER_ADMIN_IDS` 제거 (또는 `BOOTSTRAP_SUPER_ADMIN_ID` 로 축소) |
| [auth/me/route.ts](../../apps/web/app/auth/me/route.ts) | `isSuperAdmin` → `role`/`scopes` 노출 (UI 분기용) |
| [guild-membership.guard.ts](../../apps/api/src/common/guards/guild-membership.guard.ts) | `isSuperAdmin` → `role`/`scopes` 기준으로 cross-guild GET 우회 조건 갱신 |

### 5.2 범위 밖 (후속 도메인)

§3의 기능 2~8 자체 구현(길드관리/결제/처닝/미터링/온보딩/공지/feature flag) + 동반 데이터 모델 — **본 권한 전환 완료 후 별도 작업**. 본 작업은 scope만 정의해 자리를 만들어 둔다.

---

## 6. 결론 및 다음 단계

**결론**: 전환 타당. `audit_log`로 DB 인프라가 검증돼 있어 `admin_user` 추가 비용이 낮고, 향후 7개 운영 기능을 수용하려면 flat `isSuperAdmin`이 아닌 **role + scope** 모델이 필수다. 확정된 결정(§2)으로 설계가 고정됐다.

**다음 단계 진입 전 잔여 확인**:
1. **role/scope 명세 동의** (§4.2) — `bot_operator`에서 `admin:manage` 만 제외하는 경계가 맞는지
2. **seed 대상 Discord ID** (§4.4) — 마이그레이션에 넣을 최초 슈퍼관리자 ID
3. **`scopes` JWT 포함 vs role만 포함** (§4.3) — 세분화를 처음부터 넣을지, role만으로 시작할지

> 위 3개 확정 시 `/feat-implement` 파이프라인(PRD→DB설계→계획→구현)으로 진행. 본 문서는 검토까지만.
