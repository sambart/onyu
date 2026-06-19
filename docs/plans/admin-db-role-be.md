# 관리자 권한 DB 관리 전환 — 백엔드(api) 구현 계획

> 작성일: 2026-06-19 · 도메인: super-admin + auth · 대상 앱: `apps/api` · 상태: implemented(수정 모드)
> 근거 문서: `docs/plans/auth-admin-db-role-review.md`(확정 설계) · `docs/specs/prd/super-admin.md`(F-SUPER-ADMIN-001/002/003/003-B/007/008) · `docs/specs/prd/auth.md`(F-AUTH-001/002) · `docs/specs/database/_index.md`(AdminUser §2862-3039)
> 권한: **사전 승인 완료** (super-admin.md §541 💬). 본 계획에 🔴 없음.

---

## 0. 목표 요약

환경변수(`SUPER_ADMIN_IDS`) 기반 `isSuperAdmin: boolean` 판별을 **`admin_user` 테이블 기반 `role` + `scopes[]` 모델**로 전환한다 (방식 A — JWT baked-in, 매 요청 DB 조회 없음).

- 데이터 계층: `admin_user` 엔티티 + repository + 마이그레이션 2개(테이블/인덱스 + seed)
- 권한 모델: `role` → `scopes[]` 매핑 상수 + `@RequireScope()` 데코레이터 + `RequireScopeGuard`
- auth 연동: `createToken()`이 DB 조회 → JWT `role`/`scopes` 발급. guard 4종 갱신. env 제거
- 관리자 관리 API: `GET/POST/PATCH/DELETE /api/admin/admins` (`admin:manage` scope 보호)

---

## 1. 코드 표면적 (작업 범위)

| 영역 | 경로 | status |
|------|------|--------|
| api(super-admin) | `apps/api/src/super-admin/` | implemented(수정) |
| api(auth) | `apps/api/src/auth/` | implemented(수정) |
| api(common guards) | `apps/api/src/common/guards/` | implemented(수정) |
| api(config) | `apps/api/src/config/env.validation.ts` | implemented(수정) |
| migrations | `apps/api/src/migrations/` | 신규 2개 |
| sharedTypes | `libs/shared/src/types/` | 신규 1개(`admin.ts`) |
| env | `.env.example` | 수정 |

> 신규 디렉토리 없음 — 전부 기존 `super-admin` / `auth` / `common` / `migrations` / `shared` 하위. 신규 **파일**만 추가.
> **web(`apps/web`)·테스트 작성은 본 계획 범위 밖** — 별도 계획(web) / tester·fe-tester가 담당. 단 §10 엣지케이스 목록은 tester 입력용으로 포함.

---

## 2. 권한 모델 결정 (scope 상수 위치)

### 2.1 role 타입 — `libs/shared`

`role`(`'super_admin' | 'bot_operator' | null`) 유니온 타입은 web `JwtPayload`(`apps/web/app/auth/me/route.ts`)에서도 참조되므로 **`libs/shared/src/types/admin.ts`** 에 신설하여 api·web 공유한다.

```ts
// libs/shared/src/types/admin.ts (신규)
export type AdminRole = 'super_admin' | 'bot_operator';
export type AdminScope =
  | 'guild:view' | 'admin:manage' | 'guild:manage' | 'billing:manage'
  | 'churn:view' | 'usage:view' | 'onboarding:view'
  | 'notification:manage' | 'feature-flag:manage';
```

> `libs/shared/src/types/index.ts` 에 `export * from './admin';` 추가.

### 2.2 role → scope 매핑 상수 — `super-admin` 내부

role→scope **매핑 로직**은 권한 산출(서버사이드 결정)에 속하므로 **`apps/api/src/super-admin/`** 내부에 둔다. web은 산출된 `scopes[]` 배열만 JWT로 받으므로 매핑 테이블 자체를 공유할 필요 없음(YAGNI). 기존 컨벤션상 super-admin 모듈에 도메인 상수 파일이 없으므로 신규 파일로 추가한다.

```ts
// apps/api/src/super-admin/role-scope.constants.ts (신규)
import type { AdminRole, AdminScope } from '@onyu/shared';

const ALL_OPERATIONAL: AdminScope[] = [
  'guild:view', 'guild:manage', 'billing:manage', 'churn:view',
  'usage:view', 'onboarding:view', 'notification:manage', 'feature-flag:manage',
];

export const ROLE_SCOPES: Record<AdminRole, AdminScope[]> = {
  super_admin: [...ALL_OPERATIONAL, 'admin:manage'],
  bot_operator: [...ALL_OPERATIONAL], // admin:manage 제외
};

/** permissions 컬럼: NULL → role 기본, [] → scope 전체 차단, [...] → override */
export function resolveScopes(role: AdminRole, permissions: string[] | null): AdminScope[] {
  if (permissions === null) return ROLE_SCOPES[role];
  return permissions as AdminScope[]; // 빈 배열이면 그대로 빈 배열(전체 차단)
}
```

> DB 문서 §2873/§2910 결정 반영: `permissions === null` ↔ `[]` 를 **반드시 구분**. `null`은 role 기본 scope, `[]`는 scope 전부 차단.

### 2.3 `@RequireScope()` 데코레이터 + `RequireScopeGuard` 위치 — `super-admin/guards`

`SuperAdminGuard`가 이미 `super-admin/guards/`에 있고, scope 검사는 super-admin 도메인 개념이므로 **`apps/api/src/super-admin/guards/`** 에 둔다 (`guild-membership.guard.ts`는 cross-cutting이라 `common/guards`에 있는 것과 구분).

```ts
// super-admin/guards/require-scope.decorator.ts (신규)
export const REQUIRE_SCOPE_KEY = 'requireScope';
export const RequireScope = (...scopes: AdminScope[]) => SetMetadata(REQUIRE_SCOPE_KEY, scopes);

// super-admin/guards/require-scope.guard.ts (신규)
// Reflector로 메타데이터의 required scopes 읽고, req.user.scopes[]에 전부 포함되는지 검사. 미포함 시 403.
```

---

## 3. 파일별 작업 단위 + 의존 순서

### Phase A — sharedTypes (의존 없음, 최우선)

| # | 파일 | 신규/수정 | 작업 |
|---|------|----------|------|
| A-1 | `libs/shared/src/types/admin.ts` | 신규 | `AdminRole` / `AdminScope` 타입 정의 |
| A-2 | `libs/shared/src/types/index.ts` | 수정 | `export * from './admin';` 추가 |

**검증**: `pnpm --filter @onyu/shared build`(또는 tsc) 통과. `import { AdminRole } from '@onyu/shared'` 해석.

### Phase B — 데이터 계층 (A 의존)

| # | 파일 | 신규/수정 | 작업 |
|---|------|----------|------|
| B-1 | `apps/api/src/super-admin/infrastructure/admin-user.orm-entity.ts` | 신규 | DB 문서 §2976-3002 데코레이터 지침 **그대로** 복제(아래 §4) |
| B-2 | `apps/api/src/super-admin/infrastructure/admin-user.repository.ts` | 신규 | `audit-log.repository.ts` 패턴 복제. 메서드: `findByDiscordId` / `findAll(activeOnly?)` / `insert` / `updateRole` / `setActive` / `countActiveSuperAdmins` |
| B-3 | `apps/api/src/super-admin/super-admin.module.ts` | 수정 | `TypeOrmModule.forFeature` 배열에 `AdminUserOrmEntity` 추가. `AdminUserRepository` providers 등록 |
| B-4 | `apps/api/src/migrations/1777500000000-AdminUserTableInit.ts` | 신규 | 테이블 + UNIQUE 인덱스 + COMMENT (migration:generate 후 타임스탬프 보정) |
| B-5 | `apps/api/src/migrations/1777500000001-AdminUserSeedSuperAdmin.ts` | 신규 | seed INSERT (수동 작성, **ON CONFLICT DO NOTHING**) |

> **순서 강제 (DB 문서 §3033-3039)**: B-1·B-3 작성 → `migration:generate --name AdminUserTableInit` → 생성 파일 타임스탬프를 `1777400000000`으로 수정(B-4) → B-5 수동 작성 → `migration:run`.

**검증**: `migration:run` 2개 순차 적용 성공. seed row 1건 존재. `migration:run` 재실행 시 seed가 ON CONFLICT로 SKIP(멱등).

### Phase C — 권한 모델 (A 의존, B와 병행 가능)

| # | 파일 | 신규/수정 | 작업 |
|---|------|----------|------|
| C-1 | `apps/api/src/super-admin/role-scope.constants.ts` | 신규 | `ROLE_SCOPES` 매핑 + `resolveScopes(role, permissions)` (§2.2) |
| C-2 | `apps/api/src/super-admin/guards/require-scope.decorator.ts` | 신규 | `@RequireScope(...scopes)` + `REQUIRE_SCOPE_KEY` |
| C-3 | `apps/api/src/super-admin/guards/require-scope.guard.ts` | 신규 | Reflector로 required scope 읽고 `req.user.scopes[]` 검사. 미포함 403 (F-SUPER-ADMIN-003-B) |
| C-4 | `apps/api/src/super-admin/super-admin.module.ts` | 수정 | `RequireScopeGuard` providers 등록 |

**검증**: 빌드 통과. guard가 Reflector 주입 정상.

### Phase D — auth 연동 (A·B·C 의존)

| # | 파일 | 신규/수정 | 작업 |
|---|------|----------|------|
| D-1 | `apps/api/src/auth/auth.module.ts` | 수정 | `AdminUserRepository` 사용 위해 의존 정리(§7). `SuperAdminModule`↔`AuthModule` 순환 회피 위해 **AdminUser 인프라를 auth가 직접 import하지 않고**, repository를 공유 가능하게 배치 — 아래 §7 결정 |
| D-2 | `apps/api/src/auth/application/auth.service.ts` | 수정 | `parseSuperAdminIds()` **제거**. `createToken()`에서 `AdminUserRepository.findByDiscordId()` 조회 → 4케이스 분기(§6) → payload에 `role`/`scopes` 포함. `isSuperAdmin` 제거 |
| D-3 | `apps/api/src/auth/infrastructure/jwt.strategy.ts` | 수정 | `validate` payload 타입 `isSuperAdmin?` → `role`/`scopes`. `req.user`에 `role`/`scopes` 반영 |
| D-4 | `apps/api/src/super-admin/guards/super-admin.guard.ts` | 수정 | `isSuperAdmin === true` → `role !== null && role !== undefined` 검사 (F-SUPER-ADMIN-003: role 존재 여부) |
| D-5 | `apps/api/src/common/guards/guild-membership.guard.ts` | 수정 | `user.isSuperAdmin === true && GET` → `user.role != null && GET` 우회 (F-SUPER-ADMIN-002) |
| D-6 | `apps/api/src/super-admin/audit/audit-log.interceptor.ts` | 수정 | `user.isSuperAdmin !== true` → `user.role == null` 일 때 skip (role 보유자만 감사 대상) |
| D-7 | `apps/api/src/config/env.validation.ts` | 수정 | `SUPER_ADMIN_IDS` Joi 스키마 **제거** |
| D-8 | `.env.example` | 수정 | `SUPER_ADMIN_IDS` 라인(L31-33) **제거** |

**검증**: `pnpm --filter @onyu/api build` 통과. `isSuperAdmin` 잔존 참조 0건(spec 제외 — spec은 tester 갱신). lint 통과(미사용 import 제거).

### Phase E — 관리자 관리 API (A·B·C·D 의존)

| # | 파일 | 신규/수정 | 작업 |
|---|------|----------|------|
| E-1 | `apps/api/src/super-admin/dto/admin-user.dto.ts` | 신규 | 요청/응답 DTO + class-validator (§5) |
| E-2 | `apps/api/src/super-admin/application/admin-user.service.ts` | 신규 | 비즈니스 로직 + 앱레벨 제약(자기 비활성화 불가 / 최소 1명 super_admin) (§8) |
| E-3 | `apps/api/src/super-admin/presentation/admin-user.controller.ts` | 신규 | `GET/POST/PATCH/DELETE /api/admin/admins` (§9 계약표) |
| E-4 | `apps/api/src/super-admin/super-admin.module.ts` | 수정 | `AdminUserController` controllers 등록, `AdminUserService` providers 등록 |

**검증**: 빌드 통과. 4개 엔드포인트 라우팅 등록. `admin:manage` guard 적용.

---

## 4. AdminUser 엔티티 (B-1 상세)

DB 문서 §2976-3002 지침을 그대로 따른다. `audit-log.orm-entity.ts` import 패턴(typeorm)에 `UpdateDateColumn` 추가:

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'admin_user', schema: 'public' })
@Index('UQ_admin_user_discord', ['discordUserId'], { unique: true })
export class AdminUserOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) discordUserId: string;
  @Column({ type: 'varchar' }) role: string;          // 'super_admin' | 'bot_operator'
  @Column({ type: 'text', array: true, nullable: true }) permissions: string[] | null;
  @Column({ type: 'varchar', nullable: true }) grantedBy: string | null;
  @Column({ type: 'boolean', default: true }) isActive: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
```

> 마이그레이션은 **implementer가 entity 작성 후 `migration:generate`로 생성**하고 `migration:run`으로 적용(B-4/B-5). seed(B-5)는 generate 불가 → 수동 작성.

### seed 마이그레이션 (B-5) up/down

- **up()**: `INSERT INTO "admin_user" ("discordUserId","role","grantedBy","isActive") VALUES ('383635512252039168','super_admin','seed',true) ON CONFLICT ("discordUserId") DO NOTHING;`
- **down()**: `DELETE FROM "admin_user" WHERE "discordUserId"='383635512252039168' AND "grantedBy"='seed';`

---

## 5. DTO (E-1)

```ts
// CreateAdminDto (POST body)
discordUserId: string  // @IsString @IsNotEmpty (Discord snowflake — @Matches(/^\d{17,20}$/) 권장)
role: AdminRole        // @IsIn(['super_admin','bot_operator'])

// UpdateAdminRoleDto (PATCH body)
role: AdminRole        // @IsIn(['super_admin','bot_operator'])

// AdminUserResponseDto (응답 — permissions/id 비노출)
discordUserId: string; role: string; grantedBy: string | null; isActive: boolean; createdAt: string; // ISO8601
```

> 검증 유효값은 §2.1 `AdminRole` 유니온과 동기화. enum/CHECK는 DB가 아닌 DTO에서 강제(DB 문서 §2890).

---

## 6. createToken role/scopes 산출 4케이스 (D-2)

| 케이스 | DB 조회 결과 | payload.role | payload.scopes |
|--------|-------------|--------------|----------------|
| 미등록 | `findByDiscordId` → null | `null` | `[]` |
| 비활성 | 레코드 존재, `isActive=false` | `null` | `[]` |
| super_admin | 레코드 존재, active, role=super_admin | `'super_admin'` | `resolveScopes('super_admin', permissions)` |
| bot_operator | 레코드 존재, active, role=bot_operator | `'bot_operator'` | `resolveScopes('bot_operator', permissions)` |

payload 최종형(auth.md §34-42 / review §110):
```ts
{ sub, username, avatar, guilds, role: AdminRole|null, scopes: string[] }
```

---

## 7. 모듈 의존성 결정 (D-1 — 순환 참조 회피)

**문제**: `auth.service.ts`가 `AdminUserRepository`(현재 super-admin 모듈 소속)를 필요로 하는데, `SuperAdminModule`이 이미 `AuthModule`을 import 중(`super-admin.module.ts:19`) → `AuthModule`이 `SuperAdminModule`을 역import하면 **순환 참조**.

**결정 (권장안)**: `AdminUserOrmEntity` + `AdminUserRepository`를 **`auth.module.ts`에서도 `TypeOrmModule.forFeature([AdminUserOrmEntity])`로 등록**하고 `AdminUserRepository`를 auth providers에 추가한다. (이미 `GuildMemberOrmEntity`를 auth·super-admin 양쪽에서 재등록하는 선례가 있음 — `auth.module.ts:27`, `super-admin.module.ts:18`.) repository는 stateless이므로 두 모듈에서 각각 인스턴스를 가져도 안전.

- `auth.module.ts`: `forFeature`에 `AdminUserOrmEntity` 추가, providers에 `AdminUserRepository` 추가
- `super-admin.module.ts`: 관리자 관리 API용으로 `AdminUserRepository`를 자체 등록 (E-2 service가 주입)
- **AuthModule → SuperAdminModule import 금지** (순환 회피). 공유 단위는 엔티티/repository 클래스(파일 import)뿐, 모듈 의존 아님.

> 대안(비채택): 별도 `AdminUserModule` 신설 후 양쪽에서 import — 신규 디렉토리/모듈 추가 비용 대비 이득 적음. 선례(GuildMember 재등록)와 일관성을 위해 재등록 방식 채택. implementer는 빌드 시 순환 경고 없으면 본 방식 유지.

---

## 8. 관리자 관리 서비스 앱레벨 제약 (E-2)

DB 문서 §2894-2895 결정 반영 (DB 트리거 아닌 서비스 레이어):

| 제약 | 검사 | 위반 시 |
|------|------|---------|
| 자기 자신 비활성화 불가 | DELETE 시 `req.user.discordId === :discordUserId` | `ForbiddenException` (또는 `BadRequestException`) — "자기 자신은 비활성화할 수 없습니다" |
| 최소 1명 super_admin 유지 (비활성화) | DELETE 대상이 super_admin이면 `countActiveSuperAdmins() > 1` 확인 | 위반 시 `BadRequestException` — "최소 1명의 슈퍼관리자가 필요합니다" |
| 최소 1명 super_admin 유지 (다운그레이드) | PATCH로 super_admin→bot_operator 시 동일 카운트 검사 | 동일 예외 |
| 중복 추가 방지 | POST 시 `findByDiscordId` 존재(active 무관) 확인 | `ConflictException` (또는 활성화 처리 — 정책 미정 시 Conflict 권장) |
| 존재하지 않는 대상 | PATCH/DELETE 시 레코드 없음 | `NotFoundException` |

> `req.user.discordId`는 jwt.strategy.ts validate가 세팅(`discordId`). controller에서 `@Req()`/커스텀 데코레이터로 추출.
> POST 중복 시 "비활성 레코드를 재활성화"할지 "Conflict 반환"할지는 정책 사안 — 본 계획은 **Conflict 반환** 기본. 재활성화 UX가 필요하면 PATCH+setActive로 분리(엣지케이스 §10에 표기).

---

## 9. 엔드포인트 계약표 (endpoint-spec 대체)

전부 `@Controller('api/admin')` 하위, 클래스 레벨 `@UseGuards(JwtAuthGuard, SuperAdminGuard, RequireScopeGuard)` + 메서드/클래스 `@RequireScope('admin:manage')`.

| Method | Path | Guards | Scope | Body | Response (2xx) | 에러 |
|--------|------|--------|-------|------|----------------|------|
| GET | `/api/admin/admins` | Jwt+SuperAdmin+RequireScope | `admin:manage` | — (query: `?activeOnly=true` optional) | `{ admins: AdminUserResponseDto[] }` 200 | 401/403 |
| POST | `/api/admin/admins` | 〃 | `admin:manage` | `{ discordUserId, role }` | `AdminUserResponseDto` 201 | 400(검증)/409(중복)/403 |
| PATCH | `/api/admin/admins/:discordUserId` | 〃 | `admin:manage` | `{ role }` | `AdminUserResponseDto` 200 | 400(최소1명)/404/403 |
| DELETE | `/api/admin/admins/:discordUserId` | 〃 | `admin:manage` | — | 200 `{ success: true }` 또는 204 | 400(자기/최소1명)/404/403 |

> DELETE는 물리 삭제 아님 — `isActive=false` 처리 (F-SUPER-ADMIN-008).
> `SuperAdminGuard`(role 존재) + `RequireScopeGuard('admin:manage')` 이중 적용: super_admin만 `admin:manage` scope 보유하므로 bot_operator는 403. SuperAdminGuard만으로는 부족(bot_operator도 role 존재) → RequireScope가 실질 게이트.
> 기존 `AdminGuildController`(`GET /api/admin/guilds`)는 본 계획에서 **F-SUPER-ADMIN-004 scope 보강 권장**: `@RequireScope('guild:view')` 추가 (현재 SuperAdminGuard만). 별도 작업 항목 E-5(선택)로 분리 — 미적용 시 super_admin/bot_operator 공통 통과로 기능상 무해하나 PRD §282 명세 정합 위해 권장.

---

## 10. 엣지케이스 목록 (edge-cases 대체 · tester 입력)

### 입력 검증
- POST `discordUserId` 빈 문자열/비숫자/null → 400 (class-validator)
- POST/PATCH `role`이 `super_admin`/`bot_operator` 외 값 → 400 (`@IsIn`)
- PATCH/DELETE path param `:discordUserId` 미존재 → 404

### 권한 경계 (role 산출)
- **role=null(미등록)**: `/api/admin/*` 전부 403 (SuperAdminGuard). `/api/guilds/:id/*` GET은 guilds[] 멤버십만 통과
- **role=null(isActive=false)**: 미등록과 동일 — JWT에 role:null, scopes:[] (createToken 케이스 2)
- **role=bot_operator**: `/api/admin/admins/*` 403 (admin:manage 미보유). `/api/admin/guilds` 통과(guild:view 보유). cross-guild GET 우회 통과(role!=null)
- **role=super_admin**: 전체 scope 통과
- non-GET cross-guild 요청: role 보유자도 403 (guild-membership.guard read-only fail-closed)
- 조회성 POST 2개(ai-insight / classify)는 별도 컨트롤러 가드 — 본 변경 범위 밖(PRD §251), guild-membership.guard 우회 대상 아님 확인

### 동시성 / 최소 1명 / 자기 비활성화
- 마지막 super_admin이 자기 자신을 DELETE → `countActiveSuperAdmins`=1 && self → 400 (자기 비활성화 + 최소1명 둘 다 위반)
- super_admin 2명 중 1명이 다른 super_admin DELETE → 카운트 2>1 통과
- 마지막 super_admin PATCH super_admin→bot_operator → 400 (최소1명)
- **동시성 레이스**: 두 super_admin이 거의 동시에 서로를 DELETE → 둘 다 카운트 검사 시점엔 2명 → 둘 다 통과 → 0명 가능. 트랜잭션/`SELECT FOR UPDATE` 또는 단일 트랜잭션 내 count+update 권장. 본 계획은 **service 메서드 내 트랜잭션(QueryRunner 또는 `repository.manager.transaction`)으로 count→update 원자화**를 implementer에 지시(엣지 회피). tester는 동시 요청 테스트로 검증
- 중복 POST(이미 active 레코드 존재) → 409
- 중복 POST(비활성 레코드 존재) → 409 (재활성화는 PATCH 책임 — §8 정책)

### 재로그인 반영 지연 (방식 A 본질)
- PATCH/DELETE로 권한 변경해도 **이미 발급된 JWT는 만료(1~2h)/재로그인까지 구권한 유지** — 의도된 동작(auth.md §51, PRD §229). tester는 "변경 후 기존 토큰은 여전히 통과, 재로그인 시 반영"을 명세로 검증
- `isActive=false` 처리해도 즉시 회수 아님 — TTL 대기. 즉시 회수는 범위 밖(Redis 블랙리스트 후속)

### 마이그레이션
- `migration:run` 2회 실행(멱등) → seed ON CONFLICT DO NOTHING으로 중복 INSERT 없음
- down() 롤백 → seed row만 삭제(grantedBy='seed' 조건), 수동 추가 관리자 보존

---

## 11. 검증 명령 (각 Phase 후)

```bash
pnpm --filter @onyu/shared build          # Phase A
pnpm --filter @onyu/api migration:run     # Phase B
pnpm --filter @onyu/api build             # Phase C/D/E
pnpm -r lint                              # 전체
```

> 테스트(`*.spec.ts` 갱신·작성)는 tester/구현 후속 — 본 계획은 BE 구현 범위. 단 기존 spec(`auth.service.spec.ts`, `super-admin.guard.spec.ts`, `guild-membership.guard.spec.ts`, `audit-log.interceptor.spec.ts`, e2e)이 `isSuperAdmin`/`SUPER_ADMIN_IDS`에 의존하므로 **구현 시 컴파일 깨짐 발생** → implementer가 최소한 컴파일 통과하도록 spec 동반 수정 필요(또는 tester에 위임). §12 다른 도메인 영향 참조.

---

## 12. 다른 도메인 영향 (별도 항목 플래그)

- **[web 영향]** `apps/web/app/auth/me/route.ts` `JwtPayload` 타입(`isSuperAdmin` → `role`/`scopes`), `/admin` layout role 게이트, `/admin/admins` UI, admin-api 클라이언트 — **별도 web 계획에서 처리**. 본 BE 계획은 web 코드 미수정.
- **[테스트 영향]** `isSuperAdmin`/`SUPER_ADMIN_IDS` 의존 spec 5종 + e2e 갱신 필요 — tester/fe-tester 담당. implementer는 BE 빌드 통과를 위한 최소 컴파일 수정만(권장: 깨진 spec은 tester에 인계, BE는 src만 완결).
- **[bot 영향]** 없음 — `apps/bot`은 JWT payload 미참조.

---

## 13. manifest 갱신 필요

변경 종류: **(a) status 변경만** + **(d) 일부 변경 없음** 해당. (b)(c) 비해당.

- **(a) status 변경**: 해당 없음 — `super-admin`·`auth` 모두 기존 `implemented` 유지(코드 수정 모드). status 변경 불필요.
- **(b) code.* 경로 신설**: 해당 없음 — 신규 파일은 전부 기존 등록 경로(`apps/api/src/super-admin/**`, `apps/api/src/auth/**`, `apps/api/src/migrations/**`, `libs/shared/**`) 하위. manifest `code.*` 키 신설 불필요.
- **(c) 신규 도메인 추가**: 해당 없음.
- **(d) 변경 없음**: `super-admin` / `auth` 도메인의 manifest 엔트리는 그대로 유지.

**manifest 갱신 필요 — 없음** (기존 `implemented` 도메인 수정, 등록 경로 내 파일 추가뿐).

> 참고: PRD 관련 모듈 목록에 신규 파일들이 이미 명시돼 있으므로(super-admin.md §28-41), 매니페스트 `code.api` glob이 `apps/api/src/super-admin/**` 형태면 추가 갱신 불필요. glob이 파일 단위 열거 형태라면 신규 파일 5종(admin-user.orm-entity / admin-user.repository / role-scope.constants / require-scope.decorator / require-scope.guard / admin-user.dto / admin-user.service / admin-user.controller) 추가 — implementer가 Phase 7에서 manifest 실제 형식 확인 후 판단.
