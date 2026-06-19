# 관리자 권한 DB 관리 전환 — 프론트엔드(web) 구현 계획

> 도메인: super-admin (web) · 상태: **implemented (수정 모드)** · 작성일: 2026-06-19
> 작업 트리: `E:\Workspace\onyu-admin-db-role`
> 1차 기준: PRD `docs/specs/prd/super-admin.md` (F-SUPER-ADMIN-001/002/008/009) · 확정 설계 `docs/plans/auth-admin-db-role-review.md` §2/§4 · Userflow UF-SUPER-ADMIN-001/004~009 · Usecase UC-05/06/07
> 권한: 💬 사전 승인 완료 (DB 기반 role/scope 전환). 본 계획에 🔴 없음.

---

## 0. 범위 및 전제

### 0.1 본 계획의 범위 (web only)

- `isSuperAdmin: boolean` → `role` + `scopes[]` 기반 인증 컨텍스트 전환 (web 클라이언트 측)
- `/admin` 콘솔 접근 게이트 변경 (isSuperAdmin → role 존재)
- 관리자 관리 콘솔 신규 페이지 `/admin/admins` (목록/추가/역할변경/비활성화)
- `admin-api.ts`에 관리자 CRUD 클라이언트 함수 추가
- i18n 로케일(ko/en) `admin` 네임스페이스에 관리자 관리 문구 추가

### 0.2 BE API 계약 (병렬 작성 중 — PRD 1차 기준)

web은 아래 BE 계약을 **소비만** 한다. 계약 변경 시 `admin-db-role-be.md`와 동기화한다.

| 메서드 | 경로 (web 프록시 경유) | 요청 body | 응답 | 보호 scope |
|--------|------------------------|-----------|------|-----------|
| GET | `/api/admin/admins` | — | `{ admins: AdminUser[] }` | `admin:manage` |
| POST | `/api/admin/admins` | `{ discordUserId, role }` | `201` (생성된 레코드 또는 빈 body) | `admin:manage` |
| PATCH | `/api/admin/admins/:discordUserId` | `{ role }` | `200` | `admin:manage` |
| DELETE | `/api/admin/admins/:discordUserId` | — | `200`/`204` | `admin:manage` |

`AdminUser` (응답 항목):
```ts
interface AdminUser {
  discordUserId: string;
  role: 'super_admin' | 'bot_operator';
  grantedBy: string | null;
  isActive: boolean;
  createdAt: string; // ISO 8601
}
```

> 🟨 응답 envelope 가정: GET은 `{ admins: [...] }`로 래핑(PRD F-SUPER-ADMIN-008 스키마 기준). POST/PATCH/DELETE 응답 body 형태는 BE 확정에 맞춰 `admin-api.ts`에서 흡수(현재 `apiClient`가 빈 body/204를 `undefined`로 처리하므로 무해). BE 계약 확정 시 타입만 조정.

### 0.3 JWT payload 전환 (BE가 발급, web이 소비)

```
// 전환 전
{ sub, username, avatar, guilds, isSuperAdmin: boolean }
// 전환 후
{ sub, username, avatar, guilds, role: 'super_admin'|'bot_operator'|null, scopes: string[] }
```

`isSuperAdmin === true` ↔ `role === 'super_admin'`. web은 `isSuperAdmin`을 **완전 제거**하고 `role`/`scopes`로 대체한다 (PRD §데이터모델 — isSuperAdmin 제거 확정).

### 0.4 상태관리 컨벤션 (코드 확인 결과)

- **TanStack Query 미사용**. 기존 admin 페이지는 `useState` + `useEffect` + `Promise.allSettled` 직접 호출 패턴(`apps/web/app/admin/page.tsx`).
- API 호출은 `app/lib/*-api.ts`의 함수 → `app/lib/api-client.ts`의 `apiClient`/`apiGet` 래퍼 경유.
- i18n: `next-intl` `useTranslations('admin')`. 로케일은 `libs/i18n/locales/{ko,en}/web/admin.json` + `apps/web/i18n/request.ts`에 정적 import 등록(이미 admin 등록됨 — 추가 import 불필요).
- 테스트: **Vitest** + `@testing-library/react` (`apps/web/app/admin/__tests__/*.test.tsx`).
- 인증 컨텍스트는 전역 store 없음 — 각 컴포넌트(`AdminLayout`, `Header`)가 개별적으로 `fetch('/auth/me')` 호출. 본 계획도 이 패턴을 따른다.

> 신규 디렉토리/파일은 없음(모두 기존 `code.web` glob 하위). `/admin/admins` 페이지는 `apps/web/app/admin/` 하위 신규 파일이며 manifest `code.web`의 `apps/web/app/admin` glob에 포함된다.

---

## 1. 인증 컨텍스트 변경 (isSuperAdmin → role/scopes)

### 1.1 [수정] `apps/web/app/auth/me/route.ts`

JWT payload 디코드 및 `/auth/me` 응답을 `role`/`scopes` 노출로 변경.

**변경 내용**
- `JwtPayload` 인터페이스: `isSuperAdmin?: boolean` 제거 → `role?: 'super_admin' | 'bot_operator' | null` + `scopes?: string[]` 추가.
- 응답 `user` 객체: `isSuperAdmin: payload.isSuperAdmin ?? false` 제거 → `role: payload.role ?? null` + `scopes: payload.scopes ?? []` 추가.
- exp/토큰 디코드 로직은 그대로 유지.

**제약**
- web은 JWT를 **검증 없이 디코드만** 한다(기존 동작 유지) — UI 분기 전용. 실제 권한은 API 가드가 강제(PRD 비기능 보안).

### 1.2 [수정] `apps/web/app/admin/layout.tsx` (AdminLayout 게이트)

`isSuperAdmin` 단일 boolean → `role` 존재 여부 게이트로 전환.

**변경 내용**
- 상태: `const [isSuperAdmin, setIsSuperAdmin] = useState(false)` → `const [role, setRole] = useState<string | null>(null)`.
- `/auth/me` 응답 처리: `data.user.role`을 읽어 `setRole`. `role == null`이면 `router.replace('/')` (기존 isSuperAdmin !== true 분기 대체).
- 게이트 조건: `if (!isSuperAdmin)` → `if (role == null)` 로 변경. role이 `super_admin` 또는 `bot_operator`이면 통과 (UF-001 4단계).
- accessDenied UI는 그대로 재사용.

**제약**
- AdminLayout은 `role` 존재만 검사한다(super_admin/bot_operator 공통 통과). **`admin:manage` scope 분기는 AdminLayout에서 하지 않는다** — 관리자 관리 메뉴/페이지 레벨에서 처리(1.4, §2). bot_operator도 `/admin` 진입은 허용(UF-008 2단계: AdminLayout 통과).

### 1.3 [수정] `apps/web/app/components/Header.tsx` (콘솔 진입 링크) — **본 계획 범위(동일 도메인 cross-cutting)**

Header가 `user.isSuperAdmin`으로 `/admin` 콘솔 링크를 2곳(데스크탑 L170, 모바일 L278) 노출. payload 전환으로 깨지므로 동반 수정 필요.

**변경 내용**
- `interface User`: `isSuperAdmin?: boolean` 제거 → `role?: 'super_admin' | 'bot_operator' | null` + `scopes?: string[]` 추가.
- 콘솔 링크 노출 조건: `user?.isSuperAdmin` → `user?.role != null` (super_admin/bot_operator 둘 다 콘솔 진입 가능 — UF-001).
- 데스크탑/모바일 두 블록 동일 적용.

**비고**
- `/auth/me`(1.1)가 `role`/`scopes`를 반환하므로 Header는 별도 추가 fetch 없이 기존 `fetch('/auth/me')` 응답을 그대로 사용.
- 🟨 관리자 관리 메뉴를 Header에 직접 노출할지(scopes.includes('admin:manage'))는 §2.5에서 결정 — 본 계획은 관리자 관리 진입을 `/admin/admins` 페이지 내 진입점 + (선택) AdminLayout 내 서브내비로 둔다. Header에는 콘솔 진입(`/admin`)만 유지.

### 1.4 인증 컨텍스트 변경 검증 포인트

- `/auth/me` 응답에 `role`/`scopes` 포함, `isSuperAdmin` 미포함.
- AdminLayout: role=`super_admin` → 통과 / role=`bot_operator` → 통과 / role=`null` → `/` replace + accessDenied.
- Header: role 존재 시 콘솔 링크 노출, role=null 시 미노출.
- 기존 `apps/web/app/admin/__tests__/AdminLayout.test.tsx`는 `isSuperAdmin`을 mock — **테스트 갱신 필요**(role 기반으로). Header.test.tsx도 동일.

---

## 2. 관리자 관리 콘솔 (F-SUPER-ADMIN-009 / UF-005~009 / UC-06,07)

### 2.1 [수정] `apps/web/app/lib/admin-api.ts` — 관리자 CRUD 클라이언트 함수 추가

기존 파일에 타입 + 함수 추가(기존 길드/헬스 함수는 그대로 유지).

**추가 타입**
```ts
export type AdminRole = 'super_admin' | 'bot_operator';

export interface AdminUser {
  discordUserId: string;
  role: AdminRole;
  grantedBy: string | null;
  isActive: boolean;
  createdAt: string;
}
```

**추가 함수** (모두 `apiClient` 경유 — 실패 시 `ApiError` throw, 호출부에서 catch)
```ts
fetchAdmins(): Promise<AdminUser[]>                              // GET /api/admin/admins → res.admins
createAdmin(input: { discordUserId: string; role: AdminRole }): Promise<void>  // POST
updateAdminRole(discordUserId: string, role: AdminRole): Promise<void>         // PATCH /:id
deactivateAdmin(discordUserId: string): Promise<void>                          // DELETE /:id
```

**제약**
- GET 응답 envelope `{ admins: [...] }`를 함수 내부에서 언래핑하여 `AdminUser[]` 반환(컴포넌트 단순화). 🟨 BE가 배열 직반환이면 envelope 처리 분기.
- 길드 조회(`apiGet` fallback)와 달리 관리자 CRUD는 **실패를 UI에 노출해야 하므로 `apiClient`(throw) 사용**. `ApiError.status`(403/404/409)와 `code`로 화면 분기.

### 2.2 [신규] `apps/web/app/admin/admins/page.tsx` — 관리자 관리 콘솔 페이지

`'use client'` 페이지. AdminLayout 하위(role 게이트는 통과 전제), 페이지 레벨에서 `admin:manage` scope 추가 검사.

**컴포넌트 구조**
```
admins/page.tsx (AdminsPage)
├── scope 게이트: /auth/me의 scopes.includes('admin:manage') 확인
│   └── 미보유(bot_operator) → 403 안내 또는 router.replace('/admin') (UF-008)
├── 재로그인 반영 지연 안내 배너 (상단 고정 — UC-06 §4.2 7단계)
├── [관리자 추가] 버튼 → AddAdminModal 토글
├── AdminTable (목록)
│   └── AdminRow × N
│       ├── discordUserId / role 배지 / grantedBy / isActive 상태 / createdAt
│       ├── [역할 변경] → 인라인 드롭다운 또는 RoleChangeModal
│       └── [비활성화] → DeactivateConfirmDialog
├── AddAdminModal (Discord ID 입력 + 역할 선택)
├── 로딩 / 빈 목록 / 오류 상태
```

**상태관리** (기존 `page.tsx` 패턴 복제 — useState/useEffect)
- `admins: AdminUser[]`, `isLoading`, `error: string | null`
- `hasAdminManageScope: boolean | null` (null=확인중) — `/auth/me`에서 scopes 읽음
- 모달 open 상태, 제출 중(`isSubmitting`) 플래그
- mutation 성공 시 `fetchAdmins()` 재조회(낙관적 업데이트 미사용 — 단순/정확 우선, UC-06 §4.1 7단계 "재조회 또는 낙관적 업데이트" 중 재조회 선택).

**scope 게이트 구현** (UF-008 / UC-07 §4.1 2단계)
- 페이지 마운트 시 `fetch('/auth/me')` → `scopes.includes('admin:manage')` 확인.
- 미보유 → `router.replace('/admin')` + (전이 전) 403 안내. (AdminLayout은 이미 통과한 상태이므로 페이지가 추가 방어.)
- 🔒 클라이언트 게이트는 UX 전용 — API `RequireScopeGuard`가 최종 권한 결정(UC-07 §8.1, 이중 방어).

### 2.3 [신규] 컴포넌트 — `apps/web/app/admin/admins/components/`

기존 `apps/web/app/admin/components/` Tailwind 컨벤션(테이블/배지/모달) 복제.

| 파일 | 역할 |
|------|------|
| `AdminTable.tsx` | 관리자 목록 테이블(GuildTable.tsx 패턴 복제 — thead/tbody, hover, 배지) |
| `AddAdminModal.tsx` | Discord ID 입력 + 역할 select + [확인]/[취소]. 클라이언트 검증(빈값) |
| `RoleChangeControl.tsx` | 행 단위 역할 변경(인라인 select 또는 작은 모달) |
| `DeactivateConfirmDialog.tsx` | 비활성화 확인 다이얼로그 |
| `RoleBadge.tsx` | role 배지(super_admin/bot_operator 색상 구분 — PlatformHealthPanel STATUS_CLASS 패턴) |
| `RelogNoticeBanner.tsx` | "대상자 재로그인 후 권한 적용/제거" 안내 배너 |

> 모달 컴포넌트가 admin 도메인에 기존재하지 않으면 단순 `fixed inset-0` 오버레이 + 카드로 신규 작성(외부 모달 라이브러리 도입 금지 — 컨벤션 변경 회피).

### 2.4 액션별 동작 및 제약 UX

| 액션 | 호출 | 제약 UX |
|------|------|---------|
| **추가** (UF-006) | `createAdmin({discordUserId, role})` | 빈 Discord ID → 클라이언트 검증 차단(API 호출 전). 성공 → 재조회 + "재로그인 후 적용" 안내. 409(중복) → "이미 등록된 관리자입니다". |
| **역할 변경** (UF-007) | `updateAdminRole(id, role)` | 동일 역할 선택 시 no-op 허용. 성공 → 배지 갱신 + 재로그인 안내. 400/409(최소 1명 super_admin) → 제약 안내. |
| **비활성화** (UF-009) | `deactivateAdmin(id)` | **자기 자신** → 버튼 disabled + 경고 tooltip(API 호출 전 차단). **유일 super_admin** → BE 400/409 시 안내. 확인 다이얼로그 필수. |

**자기 자신 식별**: `/auth/me`의 `discordId`(payload.sub)와 행의 `discordUserId` 비교 → 자기 행 [비활성화] 버튼 disabled + 경고(UF-009 엣지). 자기 자신 역할 변경은 서버 제약(최소 1명)에 위임하되, UI에서도 자기 super_admin → bot_operator 다운그레이드 시 경고 표시.

**최소 1명 super_admin 경고**: 목록에서 활성 super_admin 수를 계산 → 1명일 때 해당 super_admin 행의 [비활성화]/[역할 변경(다운그레이드)]에 경고 표시(클라이언트 사전 경고). 최종 차단은 BE.

### 2.5 [수정] AdminLayout 서브내비 — 관리자 관리 메뉴 분기 노출

`apps/web/app/admin/layout.tsx`에 콘솔 서브내비(또는 상단 탭) 추가하여 `/admin`(길드 현황)과 `/admin/admins`(관리자 관리) 전환.

**변경 내용**
- AdminLayout에서 `/auth/me`의 `scopes`도 함께 저장(`const [scopes, setScopes] = useState<string[]>([])`).
- 콘솔 헤더(L98-100 영역)에 내비 링크 추가:
  - `/admin` (전체 길드) — role 보유 전원
  - `/admin/admins` (관리자 관리) — `scopes.includes('admin:manage')`일 때만 렌더(UF-001 출력: bot_operator 미노출).
- 🟨 서브내비 형태(탭 vs 사이드)는 UX 구현 단계 결정 — 기존 콘솔이 단순 헤더라 상단 탭 권장.

**제약**: 메뉴 미노출 = UX 편의. 직접 URL 진입(`/admin/admins`)은 §2.2 페이지 scope 게이트가 차단(UF-008 5단계 + UC-07 §4.1).

### 2.6 [수정] i18n 로케일 — `admin` 네임스페이스 확장

`libs/i18n/locales/ko/web/admin.json` + `libs/i18n/locales/en/web/admin.json`에 `admins.*` 키 추가(`request.ts`는 admin 이미 등록 — 수정 불필요).

**추가 키(예시 구조)**
```
admins.title / admins.nav (서브내비 라벨)
admins.colDiscordId / colRole / colGrantedBy / colStatus / colCreatedAt / colAction
admins.role.superAdmin / role.botOperator
admins.status.active / status.inactive
admins.add.button / add.title / add.discordIdLabel / add.roleLabel / add.submit / add.cancel
admins.add.discordIdRequired (클라이언트 검증)
admins.changeRole.action / deactivate.action / deactivate.confirmTitle / deactivate.confirm / deactivate.cancel
admins.relogNotice (재로그인 반영 지연 안내)
admins.constraint.selfDeactivate / constraint.lastSuperAdmin (제약 경고)
admins.error.duplicate / error.lastSuperAdmin / error.notFound / error.forbidden / error.generic
admins.empty / admins.loadFailed
admins.accessDeniedScope (admin:manage 미보유)
```
ko/en 양쪽 동일 키 채움.

### 2.7 [수정] `apps/web/app/api/admin/[...path]/route.ts` (프록시)

**변경 불필요(확인용 항목)** — 프록시는 GET/POST/PUT/PATCH/DELETE 전 메서드를 이미 지원(L74-78)하고 `[...path]`로 `/api/admin/admins`, `/api/admin/admins/:id`를 모두 커버. 204/304 null-body도 처리됨(L57-59). **수정 없음.**

---

## 3. 화면별 엣지/예외 UX 목록 (fe-tester 입력용)

### 3.1 인증 컨텍스트 / 게이트 (AdminLayout, Header)

| # | 상황 | 기대 UX |
|---|------|---------|
| E-1 | role=`null` (일반/길드 운영자)가 `/admin` 진입 | accessDenied UI + `/` replace (UF-004) |
| E-2 | role=`bot_operator`가 `/admin` 진입 | 통과(길드 현황 렌더). 관리자 관리 서브내비 미노출 (UF-001/008) |
| E-3 | role=`super_admin`가 `/admin` 진입 | 통과 + 관리자 관리 서브내비 노출 |
| E-4 | 비로그인(`/auth/me` 401) | 로그인 유도 UI(기존 동작 유지) |
| E-5 | `/auth/me` 네트워크 오류 | 재시도 UI(기존 동작 유지) |
| E-6 | 클라이언트가 role/scopes 조작 | UI만 영향, API 가드가 차단(403/401) — web은 신뢰 안 함 |
| E-7 | isActive=false 처리됐으나 기존 JWT 유효 | TTL 내 접근 유지(설계상 의도). 재로그인 시 role=null 차단 (UF-004 엣지) |
| E-8 | Header: role=null | 콘솔 링크 미노출 / role 존재 시 노출 |

### 3.2 관리자 관리 콘솔 (`/admin/admins`)

| # | 상황 | 기대 UX |
|---|------|---------|
| A-1 | bot_operator가 `/admin/admins` 직접 URL 진입 | scope 게이트 차단 → 403 안내 또는 `/admin` replace (UF-008) |
| A-2 | super_admin 진입 | 목록 렌더 + 추가/변경/비활성화 액션 + 재로그인 안내 배너 |
| A-3 | GET /admins 응답 지연 | 로딩 상태 표시 |
| A-4 | GET /admins 오류 | 오류 안내 + 재시도 (UF-005 엣지) |
| A-5 | 관리자 0명/본인 1명 | 본인 1행, [비활성화] disabled(자기 자신) (UF-005 엣지) |
| A-6 | 추가: 빈 Discord ID 제출 | 클라이언트 검증 오류, API 호출 안 함 (UC-06 6.2) |
| A-7 | 추가: 중복(409) | "이미 등록된 관리자입니다" 안내, 목록 변화 없음 (UC-06 6.1) |
| A-8 | 추가: 성공 | 목록 재조회 반영 + "재로그인 후 권한 적용" 안내 (UC-06 §4.1) |
| A-9 | 추가: 존재하지 않는 Discord ID | 그대로 INSERT(BE 검증 없음). 성공 처리 — 이후 [비활성화]로 정정 (UF-006 엣지) |
| A-10 | 추가/변경/삭제: 네트워크 오류 | 오류 안내 + 재시도. 낙관적 업데이트 미사용이므로 롤백 불필요 |
| A-11 | 추가/변경/삭제: 세션 만료(401) | 로그인 재유도 (UF-006/009 엣지) |
| A-12 | 역할 변경: 유일 super_admin 다운그레이드 시도 | 클라 사전 경고 + BE 400/409 시 제약 안내 (UF-007 엣지) |
| A-13 | 역할 변경: 동일 역할 | no-op/성공 처리, UI 변화 없음 (UF-007 엣지) |
| A-14 | 역할 변경: 대상 미존재(404) | "대상을 찾을 수 없습니다" 안내 (UF-007 엣지) |
| A-15 | 비활성화: 자기 자신 시도 | 버튼 disabled + 경고(클라 차단). API 우회 시 BE 차단 (UF-009) |
| A-16 | 비활성화: 유일 super_admin | 사전 경고 + BE 400/409 시 안내 (UF-009 엣지) |
| A-17 | 비활성화: 확인 다이얼로그 취소 | 아무 동작 없음 |
| A-18 | 모든 mutation 공통 | "재로그인/토큰 만료 후 권한 반영" 지연 안내 표시 (UC-06/07 — JWT baked-in) |

### 3.3 read-only drill-in (참고 — 기존 동작, 본 계획 비변경)

- super_admin/bot_operator의 `/dashboard/guild/[guildId]/*` GET 우회는 BE `GuildMembershipGuard` 담당. web 변경 없음.
- 🟨 read-only 배너 표시는 UX 후속 결정(PRD 🟨) — 본 계획 범위 외.

---

## 4. 파일별 작업 단위 요약

### 4.1 수정 파일

| 파일 | 작업 |
|------|------|
| `apps/web/app/auth/me/route.ts` | JwtPayload + 응답을 role/scopes로 전환 (isSuperAdmin 제거) |
| `apps/web/app/admin/layout.tsx` | role 게이트 전환 + scopes 저장 + 관리자 관리 서브내비(scope 분기) |
| `apps/web/app/components/Header.tsx` | User 인터페이스 role/scopes, 콘솔 링크 조건 `role != null` (데스크탑+모바일) |
| `apps/web/app/lib/admin-api.ts` | AdminUser 타입 + CRUD 함수 4종 추가 |
| `libs/i18n/locales/ko/web/admin.json` | `admins.*` 키 추가 |
| `libs/i18n/locales/en/web/admin.json` | `admins.*` 키 추가 |
| `apps/web/app/admin/__tests__/AdminLayout.test.tsx` | isSuperAdmin mock → role mock 갱신 |
| `apps/web/app/components/__tests__/Header.test.tsx` | isSuperAdmin → role 갱신 |

### 4.2 신규 파일

| 파일 | 작업 |
|------|------|
| `apps/web/app/admin/admins/page.tsx` | 관리자 관리 콘솔 페이지 (scope 게이트 + 목록 + 액션) |
| `apps/web/app/admin/admins/components/AdminTable.tsx` | 목록 테이블 |
| `apps/web/app/admin/admins/components/AddAdminModal.tsx` | 추가 모달 |
| `apps/web/app/admin/admins/components/RoleChangeControl.tsx` | 역할 변경 컨트롤 |
| `apps/web/app/admin/admins/components/DeactivateConfirmDialog.tsx` | 비활성화 확인 |
| `apps/web/app/admin/admins/components/RoleBadge.tsx` | role 배지 |
| `apps/web/app/admin/admins/components/RelogNoticeBanner.tsx` | 재로그인 안내 배너 |
| `apps/web/app/admin/admins/__tests__/*.test.tsx` | 페이지/컴포넌트 Vitest 테스트(fe-tester 작성) |

> 모든 신규 파일은 manifest `code.web`의 `apps/web/app/admin` glob 하위(이미 등재 범위). 신규 디렉토리 `apps/web/app/admin/admins/`는 glob에 포함되므로 manifest 경로 신설 불필요.

### 4.3 변경 불필요(확인 완료)

- `apps/web/app/api/admin/[...path]/route.ts` — 전 메서드 + `[...path]` + null-body 이미 지원.
- `apps/web/i18n/request.ts` — admin 네임스페이스 이미 등록.
- `apps/web/app/admin/page.tsx` / `GuildTable` / `GuildSearchBar` / `PlatformHealthPanel` — 길드 현황 화면, 본 전환과 무관(role 전환은 layout/auth/me에 국한).

---

## 5. 검증 포인트 (구현 후 확인)

- `pnpm --filter @onyu/web lint` 통과 (no-explicit-any, boolean 접두사 `has*`/`is*`, 함수 50줄, handle* 이벤트명).
- `pnpm --filter @onyu/web test` (Vitest) — AdminLayout/Header role 전환 테스트 + admins 페이지 테스트 그린.
- `/auth/me` 응답 스냅샷에 `role`/`scopes` 존재, `isSuperAdmin` 부재.
- `isSuperAdmin` 잔존 참조 0건: `grep -r isSuperAdmin apps/web` 결과 없음(전량 치환 확인).
- ko/en admin.json 키 1:1 대응(누락 키 없음).
- 타입: `AdminUser`/`AdminRole`가 BE DTO와 정합(병렬 BE 계획 확정 시 재확인).

---

## 6. 다른 도메인 영향 (플래그)

- **auth 도메인 영향 없음(코드)**: `/auth/me`는 super-admin 도메인 web 표면(manifest super-admin `code.web` 미포함이나 auth 흐름 소비). 단 JWT payload 형태는 **BE(api auth.service)가 발급** — `admin-db-role-be.md`가 담당. web은 소비측 정합만 책임. → **BE 계획과 payload 키(`role`/`scopes`) 정합 필수**.
- **Header.tsx는 super-admin 전용 파일 아님**(전역 헤더). 하지만 `isSuperAdmin` 참조가 깨지므로 본 전환과 **원자적으로 동반 수정**해야 함(별도 도메인 작업 아님 — 동일 payload 전환의 직접 영향). 플래그: Header는 모든 페이지 공통 컴포넌트이므로 회귀 테스트(Header.test.tsx) 필수.

---

## 7. manifest 갱신 필요

**변경 종류**: (d) 변경 없음

- super-admin 도메인은 이미 `status: implemented`이며 `code.web`이 `apps/web/app/admin`(glob), `apps/web/app/lib/admin-api.ts`, `apps/web/app/api/admin/[...path]/route.ts`를 포함한다.
- 신규 파일(`apps/web/app/admin/admins/**`)은 기존 `apps/web/app/admin` glob 하위이므로 `code.web` 경로 신설 불필요.
- 수정 파일(`auth/me/route.ts`, `Header.tsx`, i18n)은 super-admin `code.web`에 직접 등재돼 있지 않으나, 이는 도메인 전용 표면이 아닌 cross-cutting 소비측(전역 헤더/auth 라우트/공유 i18n)이다. manifest는 도메인 전용 코드 표면을 추적하므로 등재 변경 불필요.
- status 변경 없음(이미 implemented), 신규 도메인 없음.

> **manifest 갱신 필요 — 없음.**
