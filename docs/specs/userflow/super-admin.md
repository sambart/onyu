# Super Admin 유저플로우

> 플랫폼 어드민(onyu 팀 / 개발자 본인)이 `/admin` 콘솔로 진입하여 봇 참여 전체 길드를 read-only로 열람하고, 관리자를 추가·관리하는 흐름. `apps/web/app/admin/`(레이아웃·페이지), `apps/api/src/super-admin/`(전용 엔드포인트·가드), `apps/api/src/common/guards/guild-membership.guard.ts`(GET 우회)가 연동된다.
> 🔒 마커: role/scopes 권한 판별, 타 길드 데이터 열람(PII), 감사 로그 기록 줄.

---

## UF-SUPER-ADMIN-001: 콘솔 진입 — 관리자

### 입력
- 로그인된 사용자가 브라우저에서 `/admin` 경로에 접근 (직접 URL 입력 또는 헤더/사이드바 진입점 클릭)

### 처리
1. (공통 전제: 세션 쿠키 존재 여부 확인 — 없거나 만료 시 로그인 유도)
2. `apps/web/app/admin/layout.tsx` (AdminLayout)가 `/auth/me`를 통해 현재 사용자의 JWT 페이로드(`role`, `scopes`)를 확인
3. 🔒 `role`이 `null`이면 레이아웃이 즉시 차단 (권한 — 사전 승인)
4. 🔒 `role`이 `super_admin` 또는 `bot_operator`이면 레이아웃 통과, 어드민 전용 UI 렌더 (권한 — 사전 승인)
5. 전체 길드 현황 화면(`/admin` 페이지)을 렌더 — 길드 목록 로드 요청(`GET /api/admin/guilds`)을 병행 발송
6. 🔒 API의 `SuperAdminGuard`가 JWT 페이로드 `role` null 여부를 재검증 — null이면 즉시 403 (권한)
7. `RequireScopeGuard('guild:view')`가 `scopes[]`에 `guild:view` 포함 여부를 확인 — 미포함 시 403

### 출력
- 진입 성공: 전체 길드 현황 화면 렌더 (길드 목록 테이블 + 플랫폼 헬스 패널)
- 🔒 진입 성공 시 `AuditLogInterceptor`가 `/api/admin/guilds` 요청을 감사 로그에 자동 기록 (adminDiscordUserId, 경로, 타임스탬프) (PII — 사전 승인)
- `admin:manage` scope 보유(`super_admin`)인 경우: 사이드 네비게이션에 관리자 관리 메뉴 노출
- `admin:manage` scope 미보유(`bot_operator`)인 경우: 관리자 관리 메뉴 미노출 또는 비활성

### 엣지케이스
- 세션 쿠키 없음 또는 만료 → 로그인 화면으로 리다이렉트 (auth 도메인 UF-AUTH-001 재진입)
- 유효 세션이나 `role === null` (일반 사용자/길드 운영자) → `AdminLayout`이 즉시 차단 — 403 또는 `/` 리다이렉트 (UF-SUPER-ADMIN-004 참조)
- `GET /api/admin/guilds` 도중 guard 검증 실패(서명 위변조·토큰 재발급 직후 불일치) → 403, 페이지 로드 오류 상태 렌더
- `isActive=false` 처리된 관리자가 기존 JWT로 접근 시 — JWT가 발급된 시점 기준이므로 토큰 만료 전까지 접근 유지됨. 재로그인 시 `role: null`, `scopes: []`로 재발급되어 차단
- 🟨 헤더/사이드바 진입점 노출 여부: 일반 사용자에게 `/admin` 링크를 숨길지 여부는 UX 구현 단계에서 결정 — 링크 노출 여부와 무관하게 레이아웃 가드가 권한을 강제함

---

## UF-SUPER-ADMIN-002: 전체 길드 현황 조회 및 검색

### 입력
- 관리자가 `/admin` 화면에서 길드 목록 테이블을 확인
- (선택) 길드명 또는 길드 ID를 검색 입력란에 입력

### 처리
1. (UF-SUPER-ADMIN-001 진입 성공 이후 지점)
2. 화면 진입 시 `GET /api/admin/guilds` 응답(전체 길드 목록 + total)을 수신하여 테이블 렌더
3. 검색어 입력 시 프론트엔드에서 수신된 길드 목록을 클라이언트 사이드 필터링 (길드명·길드 ID 부분 일치)
4. 화면 하단 또는 별도 패널에서 플랫폼 헬스 상태 표시
   - `GET /health` 결과: API·Bot·DB·Redis 각 컴포넌트 상태 (정상/비정상)
   - 🟨 Grafana/Prometheus 링크 표시 여부 및 형태는 UX 구현 단계에서 결정
5. 각 행의 [열람] 링크가 해당 길드의 drill-in 경로를 포인팅

### 출력
- 전체 길드 목록 테이블 (길드명, 길드 ID, 멤버 수, 봇 참여일, [열람] 링크)
- 검색어 입력 시 조건에 맞는 항목만 필터링하여 표시
- 플랫폼 헬스 패널: 각 컴포넌트 상태 표시

### 엣지케이스
- `GET /api/admin/guilds` 응답 지연 또는 오류 → 로딩 상태 표시 후 오류 안내, 재시도 가능
- 봇이 참여 중인 길드가 없음(total=0) → 빈 목록 상태 표시
- 검색어가 어느 길드와도 일치하지 않음 → 결과 없음 상태 표시 (전체 데이터는 이미 수신된 상태)
- 🟨 길드 목록 데이터 출처(Discord REST vs. DB distinct)에 따라 봇이 이미 퇴장한 길드가 목록에 잔류할 수 있음 — 출처 확정은 DB 설계(Phase 2)에 위임
- `GET /health` 응답 지연 또는 오류 → 헬스 패널 오류 상태 표시 (길드 목록 표시와 독립)
- `memberCount`가 null인 항목(데이터 미수집) → 해당 컬럼에 미확인 상태 표시

---

## UF-SUPER-ADMIN-003: 특정 길드 read-only drill-in

### 입력
- 관리자가 길드 목록 테이블의 [열람] 링크를 클릭

### 처리
1. (UF-SUPER-ADMIN-002 화면에서 [열람] 클릭)
2. 웹이 `/admin/guilds/[guildId]` 경유 또는 직접 `/dashboard/guild/[guildId]/overview`로 이동
3. 기존 길드 대시보드 레이아웃이 로드됨 — 길드 멤버십 대신 관리자 세션으로 진입
4. 대시보드 각 페이지가 해당 길드의 GET 엔드포인트(`GET /api/guilds/:guildId/*`)를 호출
5. 🔒 API의 `GuildMembershipGuard`가 `role !== null` + `method === GET` 조합을 감지하여 멤버십 체크를 우회 (권한 — 사전 승인)
6. 🔒 `AuditLogInterceptor`가 각 `/api/guilds/:guildId/*` GET 요청마다 감사 로그를 자동 기록 (adminDiscordUserId, guildId, 경로, 타임스탬프) (PII — 사전 승인)
7. 대시보드 컴포넌트들이 응답 데이터로 렌더됨 (음성 통계·비활동 회원·신입 현황 등 도메인별 열람 가능)

### 출력
- 해당 길드의 기존 대시보드 화면을 read-only 모드로 렌더
- 🟨 read-only 모드 배너 또는 시각 구분 표시 여부는 UX 구현 단계에서 결정
- 모든 열람 행위가 감사 로그에 자동 누적

### 엣지케이스
- 대시보드 진입 중 세션 만료 → 401 응답 → 로그인 재유도 (UF-AUTH-001)
- 해당 길드 ID가 실제로 봇이 참여하지 않은 길드 (직접 URL 입력 등) → GET 엔드포인트 응답에서 데이터 없음 또는 404 → 해당 페이지 오류 상태 렌더
- 🔒 관리자가 설정 변경을 시도하는 경우 — mutation 흐름은 UF-SUPER-ADMIN-003-A 참조 (권한)
- AI 인사이트 생성(`POST /api/guilds/:guildId/voice-analytics/ai-insight`) 또는 비활동 분류(`POST /api/guilds/:guildId/inactive-members/classify`) 버튼 클릭 → `GuildMembershipGuard`가 `role + non-GET` 조합으로 403 반환 — LLM 비용·재계산 부작용 방지 의도된 동작
- 감사 로그 기록 실패 시 요청 차단 여부는 DB 설계(Phase 2)에서 결정
- 길드 대시보드 중 특정 페이지(`/voice`, `/newbie` 등)를 직접 URL로 접근 시에도 동일한 GuildMembershipGuard GET 우회 적용

---

## UF-SUPER-ADMIN-003-A: read-only 강제 — mutation 시도 차단

> UF-SUPER-ADMIN-003의 하위 흐름. 관리자가 기존 대시보드 또는 설정 페이지에서 편집/저장 동작을 시도하는 경우.

### 입력
- 관리자가 기존 대시보드 또는 `/settings/guild/[guildId]/*` 설정 페이지에서 저장·적용·재계산 등의 mutation 동작을 시도

### 처리
1. 웹 클라이언트가 해당 설정 변경 API를 non-GET 메서드(POST·PATCH·PUT·DELETE)로 호출
2. 🔒 API의 `GuildMembershipGuard`가 `role !== null` + `method !== GET` 조합을 감지하여 즉시 403 반환 (권한 — fail-closed, 사전 승인)
3. 웹이 403 응답을 수신

### 출력
- 변경 시도 실패: API가 403을 반환하고 저장이 이루어지지 않음
- 🟨 웹 클라이언트의 403 오류 처리 방식(토스트 안내, 편집 UI 비활성, 별도 안내 등)은 UX 구현 단계에서 결정

### 엣지케이스
- 웹 UI에서 저장 버튼이 표시되는 경우(read-only 전용 UI 미분기 시) → API 호출 후 403으로 실패 — 사용자 혼란 방지를 위해 UX 단계에서 read-only 배너 또는 버튼 비활성 처리 검토 필요 (🟨)
- 설정 페이지 직접 URL 접근(`/settings/guild/[guildId]/*`) — 페이지 렌더 자체는 가능하나(GET), 저장 시도 시 위 흐름과 동일하게 403
- 특정 mutation이 프론트엔드에서 GET 파라미터 방식으로 구현된 경우(드문 케이스) → `GuildMembershipGuard`는 HTTP 메서드 기준으로만 판별하므로 해당 GET은 우회됨 — 설계상 의도된 동작

---

## UF-SUPER-ADMIN-004: 권한 없는 사용자의 /admin 접근 거부

### 입력
- 일반 사용자(길드 운영자 포함, `role === null`)가 `/admin` 경로에 접근

### 처리
1. 세션 쿠키 유무 확인 — 없으면 로그인 유도
2. 세션이 유효하더라도 JWT 페이로드의 `role === null` (또는 `admin_user` 미등록 사용자)
3. `apps/web/app/admin/layout.tsx` (AdminLayout)가 `role` null을 감지하여 즉시 차단
4. 🟨 차단 시 응답(403 페이지 표시 또는 `/` 리다이렉트)은 UX 구현 단계에서 결정
5. 사용자가 `/api/admin/*` 엔드포인트를 직접 호출하는 경우 `SuperAdminGuard`가 JWT 기반으로 재검증하여 403 반환

### 출력
- 웹: 403 응답 또는 기본 경로 리다이렉트
- API 직접 호출: 403 JSON 응답

### 엣지케이스
- 비로그인 상태에서 `/admin` 직접 접근 → 로그인 화면으로 리다이렉트 (auth 공통 흐름)
- 로그인 후 `isActive=false` 처리된 관리자가 기존 JWT로 접근 → JWT 만료 전까지 `role`이 남아 있으므로 어드민 접근이 일시 유지됨. JWT TTL(1~2h) 경과 후 재로그인 시 `role: null`로 재발급되어 차단
- 웹 클라이언트 `role` 플래그 조작 시도 → API 가드가 JWT 서명 기준으로 재검증하므로 차단됨 (클라이언트 `role`/`scopes`는 UI 분기 전용)
- `bot_operator` 역할 보유자가 `/admin/admins`에 직접 접근 → `admin:manage` scope 없음 → UF-SUPER-ADMIN-008 참조

---

## UF-SUPER-ADMIN-005: 관리자 관리 콘솔 진입 (super_admin 전용)

### 입력
- `super_admin` 역할 보유자가 `/admin/admins` 경로에 접근 (네비게이션 메뉴 클릭 또는 직접 URL 입력)

### 처리
1. (UF-SUPER-ADMIN-001 진입 성공 이후 지점)
2. `apps/web/app/admin/admins/page.tsx`가 렌더 시 JWT 페이로드 `scopes[]`에 `admin:manage` 포함 여부를 확인
3. 🔒 `admin:manage` scope 미보유 시 즉시 차단 — 403 또는 `/admin` 리다이렉트 (권한 — 사전 승인)
4. 🔒 `admin:manage` scope 보유 확인 시 `GET /api/admin/admins` 호출 (권한 — 사전 승인)
5. API의 `RequireScopeGuard('admin:manage')`가 서버사이드에서 scope 재검증 — 미포함 시 403
6. 관리자 목록 응답 수신 후 테이블 렌더

### 출력
- 관리자 목록 테이블 렌더 (discordUserId, role 배지, grantedBy, isActive 상태, 등록일)
- [관리자 추가] 버튼, 각 행에 [역할 변경] 및 [비활성화] 액션 표시

### 엣지케이스
- `bot_operator`가 `/admin/admins` 직접 URL로 접근 → 웹 레이아웃 또는 페이지 컴포넌트가 `admin:manage` scope 없음을 감지하여 차단. API 직접 호출 시에도 `RequireScopeGuard`가 403 반환
- `GET /api/admin/admins` 응답 지연 또는 오류 → 로딩 상태 후 오류 안내, 재시도 가능
- 등록된 관리자가 자기 자신 1명뿐인 경우 → 목록에 본인 1행만 표시. [비활성화] 액션은 비활성(자기 자신 비활성화 불가 — UF-SUPER-ADMIN-009 참조)

---

## UF-SUPER-ADMIN-006: 관리자 추가

### 입력
- `super_admin`이 `/admin/admins`에서 [관리자 추가] 버튼을 클릭
- 모달 내 Discord user ID 입력 + 역할(super_admin / bot_operator) 선택 후 [확인] 제출

### 처리
1. [관리자 추가] 버튼 클릭 → Discord ID 입력 필드 + 역할 선택 UI 노출 (모달 또는 폼)
2. 입력값 클라이언트 사이드 검증 (Discord ID 빈값 여부)
3. [확인] 제출 시 `POST /api/admin/admins` 호출 (`{ discordUserId, role }`)
4. 🔒 API `RequireScopeGuard('admin:manage')`가 서버사이드 재검증 (권한 — 사전 승인)
5. `AdminUserService`가 `discordUserId` UNIQUE 제약 위반 여부 확인 — 이미 존재하는 경우 중복 오류 반환
6. `isActive=false`인 기존 레코드가 있는 경우 재활성화 처리 여부는 서버 비즈니스 로직에 따름 (PRD 미명시 — 서버가 오류 반환 또는 재활성화)
7. 검증 통과 시 `admin_user` 테이블에 INSERT (isActive=true, grantedBy=요청자 discordUserId)
8. 성공 응답 수신 → 관리자 목록 갱신 (재조회 또는 낙관적 업데이트)

### 출력
- 추가 성공: 목록에 신규 관리자 행 반영
- 권한 변경이 대상자에게 즉시 반영되지 않음 — 대상자가 다음 로그인(또는 현재 토큰 만료) 시 새 role/scopes가 적용됨. 화면에 재로그인 필요 안내 표시

### 엣지케이스
- Discord ID 입력 없이 제출 → 클라이언트 사이드 유효성 오류 (API 호출 전 차단)
- 이미 `isActive=true`인 관리자 Discord ID를 중복 추가 시도 → API가 중복 오류 반환 → 화면에 안내
- 존재하지 않는 Discord user ID 입력 (오타 등) → API가 `admin_user` 테이블에 그대로 INSERT (Discord 계정 존재 여부 별도 검증 없음 — 대상자가 로그인 시 자동 인식). 추후 잘못된 ID임을 발견하면 [비활성화]로 처리
- `POST /api/admin/admins` 요청 중 네트워크 오류 → 오류 안내, 재시도 가능
- 모달 도중 세션 만료 → 제출 시 401 응답 → 로그인 재유도

---

## UF-SUPER-ADMIN-007: 관리자 역할 변경

### 입력
- `super_admin`이 `/admin/admins` 목록에서 특정 관리자의 역할 변경 UI를 조작 (인라인 드롭다운 또는 모달에서 역할 선택 후 [저장])

### 처리
1. 역할 변경 UI 조작 → `PATCH /api/admin/admins/:discordUserId` 호출 (`{ role: 'super_admin' | 'bot_operator' }`)
2. 🔒 API `RequireScopeGuard('admin:manage')` 재검증 (권한 — 사전 승인)
3. 자기 자신의 역할 변경 시도 확인 — 자기 자신 대상 role 다운그레이드도 허용 여부는 서버 로직 기준 (최소 1명 super_admin 유지 제약과 연계)
4. 변경 후 `super_admin`이 0명이 되는지 확인 — 0명이 되면 오류 반환 (최소 1명 유지)
5. 검증 통과 시 `admin_user` 테이블 role 컬럼 UPDATE

### 출력
- 변경 성공: 목록 내 해당 관리자의 역할 배지 갱신
- 역할 변경이 대상자에게 즉시 반영되지 않음 — 대상자가 다음 로그인(또는 현재 토큰 만료) 시 새 role/scopes 적용. 화면에 재로그인 필요 안내 표시

### 엣지케이스
- 현재 `super_admin`이 1명뿐인 상태에서 해당 인원을 `bot_operator`로 다운그레이드 시도 → API가 최소 1명 super_admin 유지 제약 오류 반환 → 화면에 안내
- 동일 역할로의 변경 시도(현재 super_admin → super_admin) → API가 no-op으로 처리하거나 성공 응답. 목록 UI 변화 없음
- `PATCH` 요청 중 네트워크 오류 → 오류 안내, 재시도 가능. 낙관적 업데이트를 사용한 경우 롤백 처리
- 대상 discordUserId가 존재하지 않는 경우(URL 직접 조작 등) → API 404 반환
- 역할 변경 후 대상자가 현재 활성 세션을 유지 중인 경우 — 토큰 TTL(1~2h) 이내에는 기존 role/scopes로 접근 가능. 이는 설계상 허용된 지연이며, 긴급 차단이 필요하면 `isActive=false` 처리(UF-SUPER-ADMIN-009) 후 TTL 대기

---

## UF-SUPER-ADMIN-008: bot_operator의 /admin/admins 접근 거부

### 입력
- `bot_operator` 역할 보유자가 `/admin/admins` 경로에 접근 (직접 URL 입력 또는 비정상 네비게이션)

### 처리
1. (UF-SUPER-ADMIN-001 진입 성공 후 — AdminLayout은 통과)
2. `/admin/admins` 페이지 컴포넌트 또는 레이아웃이 JWT `scopes[]`에 `admin:manage` 부재를 감지
3. 웹 레이아웃 레벨에서 접근 차단 — 403 페이지 표시 또는 `/admin` 리다이렉트
4. 사이드 네비게이션에 관리자 관리 메뉴 미노출 (UF-SUPER-ADMIN-001 참조) — 정상 네비게이션으로는 진입 불가
5. 직접 API 호출 시(`GET|POST /api/admin/admins`) `RequireScopeGuard('admin:manage')`가 서버사이드에서 403 반환

### 출력
- 웹: 403 페이지 표시 또는 `/admin` 리다이렉트
- API 직접 호출: 403 JSON 응답

### 엣지케이스
- `bot_operator`가 관리자 추가/변경 API를 직접 curl 등으로 호출 → `RequireScopeGuard`가 서버사이드에서 차단 (클라이언트 우회 불가)
- AdminLayout 통과 직후 `/admin/admins` 접근 — AdminLayout은 `role` null만 검사하므로 `bot_operator`는 AdminLayout을 통과함. `/admin/admins` 레이아웃 또는 페이지가 `admin:manage` scope를 추가로 검사하여 차단

---

## UF-SUPER-ADMIN-009: 관리자 비활성화

### 입력
- `super_admin`이 `/admin/admins` 목록에서 특정 관리자의 [비활성화] 버튼을 클릭
- 확인 다이얼로그에서 [확인] 선택

### 처리
1. [비활성화] 버튼 클릭 → 확인 다이얼로그 노출
2. [확인] 선택 시 `DELETE /api/admin/admins/:discordUserId` 호출
3. 🔒 API `RequireScopeGuard('admin:manage')` 재검증 (권한 — 사전 승인)
4. 자기 자신 비활성화 시도 확인 — 본인 discordUserId 대상이면 즉시 오류 반환
5. 대상 비활성화 후 `super_admin`이 0명이 되는지 확인 — 0명이 되면 오류 반환 (최소 1명 super_admin 유지). 단 `bot_operator` 비활성화는 제약 없음
6. 검증 통과 시 `admin_user` 테이블 `isActive=false` UPDATE (물리 삭제 아님)
7. 성공 응답 수신 → 목록에서 해당 행 상태 갱신 (isActive=false 표시 또는 목록에서 제거)

### 출력
- 비활성화 성공: 목록 내 해당 관리자 행의 상태가 비활성으로 갱신
- 권한 제거가 대상자에게 즉시 반영되지 않음 — 대상자의 현재 JWT가 유효한 동안(TTL 1~2h 이내) 기존 role/scopes로 접근 가능. 화면에 "대상자 재로그인(또는 토큰 만료) 후 권한 제거됩니다" 안내 표시

### 엣지케이스
- 자기 자신을 비활성화 시도 → API가 즉시 오류 반환 → 화면에 안내. 자기 자신이 유일한 super_admin인 경우도 동일하게 차단
- 현재 `super_admin`이 1명뿐인 상태에서 해당 인원 비활성화 시도 → 최소 1명 super_admin 유지 제약 오류 반환 → 화면에 안내
- 이미 `isActive=false`인 관리자의 [비활성화] 재시도 → API no-op 또는 성공 처리. 상태 변화 없음
- [비활성화] 확인 다이얼로그 중 세션 만료 → 제출 시 401 → 로그인 재유도
- `DELETE` 요청 중 네트워크 오류 → 오류 안내, 재시도 가능
- 비활성화된 관리자의 현재 활성 세션: 토큰 TTL 이내 접근 가능 — 긴급 차단이 필요한 경우 별도 토큰 블랙리스트(Redis) 도입 필요 (현 설계 범위 밖)
