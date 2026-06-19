# 구현 계획 — Super Admin 콘솔 Phase 1 (web / 프론트엔드)

> 대상 앱: `apps/web` (Next.js 16 App Router)
> 범위: 슈퍼 관리자 read-only 콘솔의 **웹 프론트엔드만**. API/봇은 별도 계획(`docs/plans/super-admin-api.md` 예정).
> 입력 문서: PRD `docs/specs/prd/super-admin.md` · Userflow `docs/specs/userflow/super-admin.md` (UF-001~004) · Endpoint Spec `docs/specs/endpoint-spec/super-admin.md` · Usecase `docs/usecases/super-admin/`
> 마커: 🟨 미정(UX/구현 단계 확정) · 💬 정보성(사전 승인됨). **🔴 없음** (권한·개인정보 사전 승인 완료 — PRD §💬).

---

## 0. 요약

- `/admin` 라우트 트리(레이아웃 + 페이지)를 신설하여 `isSuperAdmin` 전용 콘솔을 제공한다.
- 데이터는 `GET /api/admin/guilds`(전체 길드 목록) + `GET /api/health`(플랫폼 헬스)로 채운다.
- drill-in 은 기존 `/dashboard/guild/[guildId]/overview` 로 라우팅(재사용)하며 read-only 는 백엔드 403 에 의존한다.
- `auth/me/route.ts` 의 `JwtPayload` 에 `isSuperAdmin` 을 추가하고 `/auth/me` 응답에 노출한다.
- **권장 가드 위치: 레이아웃 가드(`/admin/layout.tsx`)** 를 1차로 채택(미들웨어는 보조). 사유는 §6.

---

## 1. 현행 코드베이스 분석 (확인 완료)

| 항목 | 사실 | 영향 |
|---|---|---|
| **인증 조회** | `GET /auth/me`(`apps/web/app/auth/me/route.ts`)가 `token` 쿠키 JWT 를 디코드해 `{ user: { discordId, username, avatar, guilds } }` 반환. `isSuperAdmin` 미포함 | `JwtPayload` + 응답 user 에 `isSuperAdmin` 추가 필요 |
| **미들웨어** | `apps/web/middleware.ts` 존재. locale 설정 + 로그인 가드(토큰 없으면 `/auth/discord` 리다이렉트). `/admin` 은 PUBLIC_PATHS 가 아니므로 **이미 비로그인 차단됨**. 단 super-admin 여부는 검사 안 함 | 미들웨어는 "로그인 여부"만 책임. super-admin 판별은 레이아웃에서 (§6) |
| **API 프록시** | `/api/guilds/[...path]` 프록시만 존재(`app/api/guilds/[...path]/route.ts`). `/api/health` 프록시는 **이미 존재**(`app/api/health/route.ts` → 백엔드 `/health`). `/api/admin/*` 프록시는 **없음** | ⚠️ `/api/admin/guilds` 프록시 라우트 **신규 필요** (§3.A) — 없으면 호출 404 |
| **API 클라이언트** | `app/lib/api-client.ts` 의 `apiClient<T>`(실패 시 `ApiError` throw) / `apiGet<T>`(실패 시 fallback). 각 도메인은 `*-api.ts` 로 타입+fetch 래핑 | `admin-api.ts` 신규(동일 패턴) |
| **길드 목록 UI** | `select-guild/page.tsx` — `fetch('/auth/me')` → 길드 카드 그리드. 아이콘 URL `https://cdn.discordapp.com/icons/{id}/{icon}.png` | 카드/아이콘 패턴 재사용(단 admin 은 테이블 권장) |
| **레이아웃 가드** | `dashboard/guild/[guildId]/layout.tsx` — `fetch('/auth/me')` → `isLoggedIn`/`guilds` 체크 → 미멤버면 `router.replace`. 로딩/네트워크오류/미로그인 상태 분기 보유 | AdminLayout 이 동일 패턴으로 `isSuperAdmin` 검사 |
| **페이지 패턴** | `dashboard/.../overview/page.tsx` — `"use client"` + `useEffect` 패칭 + `isLoading`/`error`/`data` 3-상태 + `useTranslations` | admin 페이지 동일 구조 |
| **헬스 응답 형태** | 백엔드 `/health`(`@nestjs/terminus`) → `{ status: "ok"|"error", info, error, details }`, 각 키 `database`/`redis`/`discord` 의 `{ status: "up"|"down" }` | 헬스 패널 파싱 기준 |
| **테스트** | **Vitest** + `@testing-library/react` + `userEvent`. `next-intl`/`next/navigation` 은 `vi.mock` stub. `*-api.ts` 는 `vi.mock`. 위치 `__tests__/`(컴포넌트 옆) | Jest 아님 — Vitest 컨벤션 준수 |
| **i18n** | `libs/i18n/locales/{ko,en}/web/*.json` 네임스페이스(`common`/`auth`/`dashboard`/`settings`/`landing`). `useTranslations('ns')` | `admin.json` 네임스페이스 신규(ko/en) |

---

## 2. 라우트 / 컴포넌트 트리 (신규)

```
apps/web/app/admin/
├── layout.tsx                      [신규] AdminLayout — isSuperAdmin 가드 (UF-001/004)
├── page.tsx                        [신규] 전체 길드 현황 화면 (UF-002, 기능 F-005)
├── components/
│   ├── GuildTable.tsx              [신규] 길드 목록 테이블 (이름/ID/멤버수/참여일/[열람])
│   ├── GuildSearchBar.tsx          [신규] 클라이언트 검색 입력 (길드명·ID 부분일치)
│   └── PlatformHealthPanel.tsx     [신규] /api/health 결과 패널 (API·Bot·DB·Redis)
└── guilds/
    └── [guildId]/
        └── page.tsx                [신규] drill-in 진입점 → /dashboard/guild/[guildId]/overview 로 redirect (UF-003)

apps/web/app/lib/
└── admin-api.ts                    [신규] AdminGuild 타입 + fetchAdminGuilds() + PlatformHealth 타입 + fetchPlatformHealth()

apps/web/app/api/admin/
└── [...path]/route.ts              [신규] /api/admin/* → 백엔드 프록시 (Authorization 첨부) ⚠️ 필수 의존 (§3.A)
```

**기존 수정 파일**
```
apps/web/app/auth/me/route.ts       [수정] JwtPayload + 응답 user 에 isSuperAdmin 추가 (§3.B)
apps/web/app/components/Header.tsx   [수정·🟨] 슈퍼관리자 진입점 노출 (조건부 — §5, 1차 보류 가능)
libs/i18n/locales/ko/web/admin.json  [신규] 한국어 문구
libs/i18n/locales/en/web/admin.json  [신규] 영어 문구
```

> `apps/web/middleware.ts` 는 **수정 불필요**(권장안 §6 — 레이아웃 가드 채택 시). 미들웨어 가드안 채택 시에만 수정.

---

## 3. 파일별 작업 상세

### 3.A `apps/web/app/api/admin/[...path]/route.ts` (신규 — ⚠️ 필수 선행)

- **사유**: 웹 클라이언트의 `fetch('/api/admin/guilds')` 는 Next.js 라우트로 들어온다. 현재 `/api/admin/*` 를 백엔드로 전달하는 프록시가 없어 그대로 두면 404 가 난다. 기존 `app/api/guilds/[...path]/route.ts` 와 동일 패턴으로 신설.
- **작업**:
  - `cookies()` 에서 `token` 추출 → `Authorization: Bearer {token}` 헤더 첨부.
  - `apiPath = /api/admin/{path.join('/')}` 로 `API_BASE`(`process.env.API_INTERNAL_URL ?? 'http://api:3000'`) 에 프록시.
  - `X-Real-IP` / `X-Forwarded-For` 포워딩(기존 `buildForwardHeaders` 동일 로직).
  - `GET` 만 export 해도 충분(Phase 1 어드민 엔드포인트는 GET 전용). 확장 여지를 위해 기존 프록시처럼 전체 메서드 export 도 허용하되, read-only 원칙상 GET 만으로 시작 권장.
  - `dynamic = 'force-dynamic'`, `cache: 'no-store'`.
- ⚠️ **표면적 주의**: 이 파일은 `apps/web/app/admin/` 밖(`apps/web/app/api/admin/`)이지만 **web 앱 내부**이며 길드 프록시와 동일 계층이다. 본 계획의 핵심 의존이므로 명시한다(다른 도메인 침범 아님 — 같은 web 앱).

### 3.B `apps/web/app/auth/me/route.ts` (수정)

- `interface JwtPayload` 에 `isSuperAdmin?: boolean` 추가(백엔드 JWT 가 발급 시 포함; 구버전 토큰 호환 위해 optional).
- 응답 `user` 객체에 `isSuperAdmin: payload.isSuperAdmin ?? false` 추가.
- 기존 `exp` 만료 검사·401 흐름 불변.
- **연계**: `Header.tsx` 의 `User` 인터페이스(현재 `apps/web/app/components/Header.tsx` 에 정의)에 `isSuperAdmin?: boolean` 추가 → AdminLayout 이 동일 타입 재사용. (`User` 타입은 여러 곳에서 import 되므로 optional 로 비파괴 추가.)

### 3.C `apps/web/app/lib/admin-api.ts` (신규)

- 타입 (Endpoint Spec `AdminGuildDto` 기준):
  ```
  AdminGuild { id: string; name: string; icon: string | null; memberCount: number | null; joinedAt: string | null }
  AdminGuildsResponse { guilds: AdminGuild[]; total: number }   // PRD 응답 스키마 기준
  ```
  > 🟨 Endpoint Spec 은 `AdminGuildDto[]`, PRD 는 `{ guilds, total }`. **응답 봉투 형태(배열 vs `{guilds,total}`)는 api 계획과 정합 필요** — api 계획 확정값을 따르되, 본 web 계획은 `{ guilds, total }`(PRD)을 기준으로 작성하고 구현 시 실제 응답에 맞춘다.
- `fetchAdminGuilds()` → `apiClient<AdminGuildsResponse>('/api/admin/guilds')`.
- 헬스 타입 + `fetchPlatformHealth()` → `apiGet<PlatformHealth>('/api/health', fallback)`. Terminus 응답(`{ status, info, error, details }`)을 파싱하여 `{ database, redis, discord }` 컴포넌트별 up/down 으로 정규화하는 헬퍼 포함.
- 아이콘 URL 헬퍼: `select-guild/page.tsx` 와 동일 규칙(`cdn.discordapp.com/icons/{id}/{icon}.png?size=128`).

### 3.D `apps/web/app/admin/layout.tsx` (신규 — AdminLayout, 가드)

- `"use client"`. `dashboard/guild/[guildId]/layout.tsx` 패턴 차용.
- `fetch('/auth/me')` → `data.user.isSuperAdmin` 확인.
- 상태 분기:
  - 로딩 → 스켈레톤/스피너(기존 패턴).
  - 네트워크 오류 → 재시도 UI(기존 `networkError` 패턴 재사용).
  - 미로그인(`!data?.user`) → `/auth/discord?returnTo=/admin` 유도(미들웨어가 1차로 막지만 클라 폴백).
  - `isSuperAdmin !== true` → **🟨 차단 처리(리다이렉트 vs 403 화면)**. 1차 권장: `router.replace('/')` 리다이렉트(노출 최소화) + 짧은 "권한 없음" 안내. (UF-004 §처리4 — UX 단계 확정 항목.)
  - 통과 → 콘솔 셸(헤더 영역 "슈퍼 관리자 콘솔" 타이틀) + `children`.
- **보안 주석**: 클라 `isSuperAdmin` 은 UI 분기 전용. 실제 권한은 API 가드(SuperAdminGuard)가 강제 — PRD 비기능 보안 요구사항 명시.

### 3.E `apps/web/app/admin/page.tsx` (신규 — 전체 길드 현황, UF-002 / F-005)

- `"use client"` + `useEffect` 3-상태 패칭(기존 overview 패턴).
- 진입 시 **병렬** 호출: `fetchAdminGuilds()` + `fetchPlatformHealth()` (헬스 실패는 목록과 독립 — `apiGet` fallback 으로 패널만 오류 표시).
- 검색어 state(`searchTerm`) → 수신 목록 클라이언트 필터(`GuildSearchBar` → 부모 state). 길드명·ID 부분일치.
- 렌더: `<GuildSearchBar>` + `<GuildTable>`(필터 결과) + `<PlatformHealthPanel>`.
- 빈/결과없음 상태: `total === 0`(봇 참여 길드 없음) vs 필터 결과 0(검색 불일치) 구분 안내(UF-002 엣지케이스).

### 3.F `apps/web/app/admin/components/GuildTable.tsx` (신규)

- function 선언식 컴포넌트. props: `guilds: AdminGuild[]`.
- 컬럼: 아이콘+길드명 / 길드 ID / 멤버 수(`memberCount` null → "미확인"/`—`) / 봇 참여일(`joinedAt` null → `—`, 있으면 로케일 포맷) / [열람] 링크.
- [열람] → `next/link` `href={'/dashboard/guild/' + guild.id + '/overview'}` (UF-003: 기존 대시보드 재사용). `/admin/guilds/[guildId]` 경유 대신 직접 링크가 단순(엔드포인트 spec/PRD 모두 overview 직행 허용). drill-in 경유 라우트는 3.H 로 별도 제공(직접 URL 진입 호환).
- 반응형: 좁은 화면은 카드형 폴백 고려(🟨 — 1차는 가로 스크롤 테이블 허용).

### 3.G `apps/web/app/admin/components/GuildSearchBar.tsx` (신규)

- 제어 입력. props: `value`, `onChange`(`handleSearchChange`). 디바운스 불필요(클라 필터, 데이터 메모리 상주).
- 이벤트 핸들러 `handleSearchChange` 네이밍 준수.

### 3.H `apps/web/app/admin/components/PlatformHealthPanel.tsx` (신규)

- props: `health: PlatformHealth | null`, 로딩/오류 상태.
- API·Bot(=discord)·DB(=database)·Redis 컴포넌트별 상태 배지(up=초록 / down=빨강 / unknown=회색).
- 🟨 **`/metrics` 표시 방식**: Prometheus 텍스트라 인라인 표시 부적합. 1차 = Grafana/메트릭 외부 링크 버튼 수준(노출 여부·URL 은 환경값 미정 → 보류 가능). 본 Phase 는 `/health` 만 필수, `/metrics` 는 링크/생략.

### 3.I `apps/web/app/admin/guilds/[guildId]/page.tsx` (신규 — drill-in 진입점, UF-003)

- 역할: PRD IA 의 `/admin/guilds/[guildId]` → `/dashboard/guild/[guildId]/overview` 리다이렉트 진입점. 직접 URL 진입·향후 deep-link 호환.
- 구현: 클라 컴포넌트 `useEffect` → `router.replace('/dashboard/guild/' + guildId + '/overview')`, 또는 서버 컴포넌트 `redirect()`. **권장: 서버 컴포넌트 + `redirect()`**(즉시·깜빡임 없음). `params` 는 Next 16 에서 `Promise` 이므로 `await params`.
- 표면적 주의: 이 페이지는 단순 리다이렉트만 — read-only 화면은 기존 대시보드가 담당(신규 mutation/화면 없음).

### 3.J i18n (신규 `admin.json` × ko/en)

- 키 예시: `console.title`, `guilds.searchPlaceholder`, `guilds.colName/colId/colMembers/colJoinedAt/colAction`, `guilds.view`, `guilds.empty`, `guilds.noResults`, `guilds.memberCountUnknown`, `health.title/api/bot/db/redis/up/down/unknown`, `accessDenied`.
- `next-intl` 네임스페이스 등록 위치(i18n provider 설정)가 명시 네임스페이스 목록을 갖는다면 `admin` 추가 필요 — 구현 시 `apps/web` 의 i18n 설정(`request.ts`/`getMessages` 등) 확인.

### 3.K Header 진입점 (🟨 조건부 — §5)

- `Header.tsx` `User` 에 `isSuperAdmin` 추가 후, `user?.isSuperAdmin` 일 때만 `/admin` 네비 링크(데스크탑 + 모바일 메뉴) 노출.
- 1차 보류 가능(UF-001 엣지: 링크 노출과 무관하게 레이아웃 가드가 권한 강제). 노출 결정은 UX 단계.

---

## 4. Userflow 매핑

| Userflow | 처리 위치(web) | 비고 |
|---|---|---|
| **UF-SUPER-ADMIN-001** 콘솔 진입(슈퍼관리자) | `admin/layout.tsx`(가드 통과) + `admin/page.tsx`(목록·헬스 병렬 로드) | 세션없음 → 미들웨어/레이아웃이 로그인 유도 |
| **UF-SUPER-ADMIN-002** 전체 길드 조회·검색 | `admin/page.tsx` + `GuildTable` + `GuildSearchBar` + `PlatformHealthPanel` | 클라 필터, 헬스 독립 오류, 빈/결과없음 분기 |
| **UF-SUPER-ADMIN-003** 특정 길드 drill-in | `GuildTable` [열람] → `/dashboard/guild/[guildId]/overview` (직접 링크) + `admin/guilds/[guildId]/page.tsx`(경유 리다이렉트) | 기존 대시보드 재사용. GET 우회·감사로그는 api 책임 |
| **UF-SUPER-ADMIN-003-A** mutation 차단 | (web 신규 화면 없음) 기존 대시보드/설정에서 mutation 시 API 403 | 🟨 403 UX(토스트/배너/버튼 비활성)는 본 Phase 범위 밖·1차 백엔드 403 의존 |
| **UF-SUPER-ADMIN-004** 권한없는 접근 거부 | `admin/layout.tsx` 가드(`isSuperAdmin !== true` → 리다이렉트/차단) | API `SuperAdminGuard` 가 직접 호출도 403 |

---

## 5. 🟨 미정 항목(UX/구현 단계 확정 — 본 계획의 1차 기본값 제시)

| # | 항목 | 1차 기본값(권장) | 확정 시점 |
|---|---|---|---|
| 🟨-1 | 비-슈퍼관리자 차단 방식 | `router.replace('/')` 리다이렉트 + 짧은 안내 | 구현/UX |
| 🟨-2 | 헤더/네비 `/admin` 진입점 노출 | `isSuperAdmin` 일 때만 노출(미노출도 가드로 안전) | UX |
| 🟨-3 | read-only 배너(drill-in 대시보드) | 본 Phase 미구현(백엔드 403 의존) | 후속 |
| 🟨-4 | mutation 403 UX | 본 Phase 미구현 | 후속 |
| 🟨-5 | `/metrics` 표시 | 외부 링크 또는 생략(`/health` 만 필수) | UX |
| 🟨-6 | 응답 봉투(`AdminGuildDto[]` vs `{guilds,total}`) | `{guilds,total}`(PRD) 기준, api 확정값에 정합 | api 계획 |
| 🟨-7 | 길드 목록 데이터 출처(DB distinct vs Discord REST) | web 무관(필드만 소비). null 안전 렌더 | api/DB 계획 |

---

## 6. 가드 적용 위치 — 권장안: **레이아웃 가드(`/admin/layout.tsx`)**

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **레이아웃 가드** (`admin/layout.tsx`, 클라) | 기존 `dashboard/.../layout.tsx` 검증 패턴과 동일(일관성). `/auth/me` 의 `isSuperAdmin` 직접 사용. 로딩/오류/미권한 UI 분기 자유 | 클라 렌더 시점에 잠깐 렌더 후 차단 가능(스켈레톤으로 가림) | ✅ **1차 채택** |
| 미들웨어 가드 (`middleware.ts` 수정) | 서버 엣지에서 선차단(네트워크 노출 최소) | 미들웨어는 JWT 서명 검증 없이 payload 디코드만 가능(현행 패턴). super-admin 판별 로직 추가 시 보안 책임이 클라/엣지로 분산. 미들웨어는 현재 "로그인 여부"만 담당 | 보조(선택) |

**권장 결론**: 레이아웃 가드를 1차 채택. 미들웨어는 **현행 그대로**(로그인 여부만) 두어 `/admin` 비로그인 접근을 막는 역할만 유지. 최종 권한 결정은 항상 API 가드(`SuperAdminGuard` / `GuildMembershipGuard`)가 fail-closed 로 강제하므로, web 가드는 UX 라우팅 차원이다(PRD 비기능 보안 요구사항과 일치).

> 미들웨어 가드를 추가로 원하면: `middleware.ts` 에서 `/admin` prefix 일 때 token payload 의 `isSuperAdmin` 디코드 → false 면 `/` 리다이렉트. 단 서명 미검증이므로 "보조 차단"으로만 취급하고 레이아웃/ API 가드를 신뢰.

---

## 7. 테스트 관점 (Vitest + @testing-library/react)

> 위치: 각 파일 옆 `__tests__/`. `next-intl`·`next/navigation` 은 `vi.mock` stub, `admin-api`/`global fetch` 모킹.

| 대상 | 테스트 | 매핑 |
|---|---|---|
| `admin/layout.tsx` | `isSuperAdmin:true` → children 렌더 / `false` → 리다이렉트(replace 호출) / 미로그인 → 로그인 유도 / 로딩·네트워크오류 분기 | UF-001/004 |
| `admin/page.tsx` | 목록 렌더 / 검색 필터(이름·ID 부분일치) / `total=0` 빈 상태 / 검색 결과없음 / 헬스 오류 독립 표시 | UF-002 |
| `GuildTable.tsx` | 컬럼 렌더 / `memberCount=null` "미확인" / `joinedAt=null` `—` / [열람] href 정확 | UF-002/003 |
| `PlatformHealthPanel.tsx` | up/down/unknown 배지 / Terminus 응답 파싱 / null(오류) 폴백 | UF-002 |
| `admin/guilds/[guildId]/page.tsx` | redirect 타깃 정확(`/dashboard/guild/{id}/overview`) | UF-003 |
| `admin-api.ts` | `fetchAdminGuilds` URL·반환형 / `fetchPlatformHealth` fallback / Terminus 정규화 헬퍼 | — |
| `auth/me/route.ts` | `isSuperAdmin` payload → 응답 user 노출 / 미포함 토큰 → `false` | F-001 |
| `api/admin/[...path]/route.ts` | Authorization 헤더 첨부 / 경로 조합 / 백엔드 상태/바디 패스스루 / 연결 실패 502 | §3.A |

---

## 8. 작업 순서(의존)

1. **3.A 프록시** (`api/admin/[...path]/route.ts`) — 선행(없으면 목록 호출 불가)
2. **3.B auth/me** + Header `User` 타입 — `isSuperAdmin` 전파
3. **3.C admin-api.ts** — 데이터 계층
4. **3.D layout** → **3.E page** → **3.F/3.G/3.H 컴포넌트** → **3.I drill-in**
5. **3.J i18n** (병행 가능)
6. **3.K Header 진입점**(🟨 조건부) — 마지막/선택
7. 테스트(§7) — 각 파일과 함께
8. 검증: `pnpm --filter @onyu/web lint` + `pnpm --filter @onyu/web test`(Vitest) + 타입체크

---

## 9. 표면적·범위 준수 확인

- 모든 신규/수정 파일은 `apps/web/` 내부. `apps/api`·`apps/bot` 미수정.
- ⚠️ 단, `apps/web/app/api/admin/[...path]/route.ts`(프록시)는 작업 지시의 `apps/web/app/admin/` "밖"이지만 **web 앱 내부 필수 의존**이다(기존 `app/api/guilds` 프록시와 동일 계층). 미작성 시 기능 불성립 — 본 계획의 명시 항목으로 포함.
- mutation UI 신설 없음. 범위제외(기능2·3~6·7) 화면 없음. read-only 원칙 준수.
- 코드 스타일: function 선언식 컴포넌트 / `handle*` 이벤트 핸들러 / `is*` boolean / `useTranslations` i18n / Tailwind 기존 클래스 컨벤션 준수.

### 다른 도메인 영향 플래그

- **api 도메인(별도 계획)**: `GET /api/admin/guilds` + `SuperAdminGuard` + `GuildMembershipGuard` GET 우회 + `AuditLogInterceptor` 는 api 계획 책임. 본 web 계획은 그 응답을 **소비만** 한다. 응답 봉투 형태(🟨-6)는 api 계획과 정합 필요.
- web 작업이 api/bot 코드를 수정하지는 않는다.

---

## manifest 갱신 필요

**변경 종류**: (a) status 변경 가능 · (b) `code.*` 경로 신설 가능 — 아래 분류.

- 본 web 계획은 `super-admin` 도메인의 **web 표면**만 다룬다. 도메인 자체는 PRD/userflow/usecase/endpoint-spec 이 이미 존재.
- **(b) `code.web` 경로 신설/갱신** — `super-admin` 도메인:
  - `domains.super-admin.code.web`: `apps/web/app/admin` (신규 라우트 트리)
  - (정확도 위해 추가 경로도 함께 등재 권장)
    - `apps/web/app/lib/admin-api.ts`
    - `apps/web/app/api/admin/[...path]/route.ts` (프록시)
  - `domains.super-admin.code.tests`: `apps/web/app/admin/__tests__` 등 위 §7 테스트 경로
- **(a) status 변경** — `super-admin` 도메인이 매니페스트에 `not-started`/`scaffolded` 로 등재돼 있다면:
  - web 구현 완료 후에도 **api/bot 미완**이면 `scaffolded` 유지(전 영역 완성 아님).
  - 전체(api+web) 완료 시 `implemented` 로 승급은 api 계획 완료 후 판단.
- **(c) 신규 도메인 추가**: 해당 없음(`super-admin` 기존 등재 가정. 미등재 시 implementer 가 아래 정보로 추가)
  - `description`: 플랫폼 운영자 read-only 슈퍼 관리자 콘솔
  - `prd`: `/docs/specs/prd/super-admin.md`
  - `userflow`: `/docs/specs/userflow/super-admin.md`
  - `database`: `/docs/specs/database/_index.md#audit_log`
  - `code.web`: `apps/web/app/admin`
  - `status`: `not-started` → 본 작업 후 `scaffolded`

> implementer Phase 0 에서 `feature-manifest.json` 의 `super-admin` 항목 실재 여부를 확인하고, 위 (a)/(b) 를 적용한다. api 계획과 status 승급 타이밍을 합의할 것.
