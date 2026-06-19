# Super Admin 유저플로우

> 플랫폼 어드민(onyu 팀 / 개발자 본인)이 `/admin` 콘솔로 진입하여 봇 참여 전체 길드를 read-only로 열람하는 흐름. `apps/web/app/admin/`(레이아웃·페이지), `apps/api/src/admin/`(전용 엔드포인트·가드), `apps/api/src/common/guards/guild-membership.guard.ts`(GET 우회)가 연동된다.
> 🔒 마커: isSuperAdmin 권한 판별, 타 길드 데이터 열람(PII), 감사 로그 기록 줄.

---

## UF-SUPER-ADMIN-001: 콘솔 진입 — 슈퍼 관리자

### 입력
- 로그인된 사용자가 브라우저에서 `/admin` 경로에 접근 (직접 URL 입력 또는 헤더/사이드바 진입점 클릭)

### 처리
1. (공통 전제: 세션 쿠키 존재 여부 확인 — 없거나 만료 시 로그인 유도)
2. `apps/web/app/admin/layout.tsx` (AdminLayout)가 현재 사용자 정보를 조회하여 `isSuperAdmin` 플래그를 확인
3. 🔒 `isSuperAdmin === true` 이면 레이아웃 통과, 어드민 전용 UI 렌더 (권한 — 사전 승인)
4. 전체 길드 현황 화면(`/admin` 페이지)을 렌더 — 길드 목록 로드 요청(`GET /api/admin/guilds`)을 병행 발송
5. 🔒 API의 `SuperAdminGuard`가 JWT 페이로드 `isSuperAdmin` 재검증 — false이면 즉시 403 (권한)

### 출력
- 진입 성공: 전체 길드 현황 화면 렌더 (길드 목록 테이블 + 플랫폼 헬스 패널)
- 🔒 진입 성공 시 `AuditLogInterceptor`가 `/api/admin/guilds` 요청을 감사 로그에 자동 기록 (adminDiscordUserId, 경로, 타임스탬프) (PII — 사전 승인)

### 엣지케이스
- 세션 쿠키 없음 또는 만료 → 로그인 화면으로 리다이렉트 (auth 도메인 UF-AUTH-001 재진입)
- 유효 세션이나 `isSuperAdmin === false` (일반 사용자/길드 운영자) → `AdminLayout`이 즉시 차단 — 403 또는 `/` 리다이렉트 (UF-SUPER-ADMIN-004 참조)
- `GET /api/admin/guilds` 도중 `isSuperAdmin` 검증 실패(서명 위변조·토큰 재발급 직후 불일치) → 403, 페이지 로드 오류 상태 렌더
- 🟨 헤더/사이드바 진입점 노출 여부: 일반 사용자에게 `/admin` 링크를 숨길지 여부는 UX 구현 단계에서 결정 — 링크 노출 여부와 무관하게 레이아웃 가드가 권한을 강제함

---

## UF-SUPER-ADMIN-002: 전체 길드 현황 조회 및 검색

### 입력
- 슈퍼 관리자가 `/admin` 화면에서 길드 목록 테이블을 확인
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
- 슈퍼 관리자가 길드 목록 테이블의 [열람] 링크를 클릭

### 처리
1. (UF-SUPER-ADMIN-002 화면에서 [열람] 클릭)
2. 웹이 `/admin/guilds/[guildId]` 경유 또는 직접 `/dashboard/guild/[guildId]/overview`로 이동
3. 기존 길드 대시보드 레이아웃이 로드됨 — 길드 멤버십 대신 슈퍼 관리자 세션으로 진입
4. 대시보드 각 페이지가 해당 길드의 GET 엔드포인트(`GET /api/guilds/:guildId/*`)를 호출
5. 🔒 API의 `GuildMembershipGuard`가 `isSuperAdmin === true` + `method === GET` 조합을 감지하여 멤버십 체크를 우회 (권한 — 사전 승인)
6. 🔒 `AuditLogInterceptor`가 각 `/api/guilds/:guildId/*` GET 요청마다 감사 로그를 자동 기록 (adminDiscordUserId, guildId, 경로, 타임스탬프) (PII — 사전 승인)
7. 대시보드 컴포넌트들이 응답 데이터로 렌더됨 (음성 통계·비활동 회원·신입 현황 등 도메인별 열람 가능)

### 출력
- 해당 길드의 기존 대시보드 화면을 read-only 모드로 렌더
- 🟨 read-only 모드 배너 또는 시각 구분 표시 여부는 UX 구현 단계에서 결정
- 모든 열람 행위가 감사 로그에 자동 누적

### 엣지케이스
- 대시보드 진입 중 세션 만료 → 401 응답 → 로그인 재유도 (UF-AUTH-001)
- 해당 길드 ID가 실제로 봇이 참여하지 않은 길드 (직접 URL 입력 등) → GET 엔드포인트 응답에서 데이터 없음 또는 404 → 해당 페이지 오류 상태 렌더
- 🔒 슈퍼 관리자가 설정 변경을 시도하는 경우 — mutation 흐름은 UF-SUPER-ADMIN-003-A 참조 (권한)
- AI 인사이트 생성(`POST /api/guilds/:guildId/voice-analytics/ai-insight`) 또는 비활동 분류(`POST /api/guilds/:guildId/inactive-members/classify`) 버튼 클릭 → `GuildMembershipGuard`가 `isSuperAdmin + non-GET` 조합으로 403 반환 — LLM 비용·재계산 부작용 방지 의도된 동작
- 감사 로그 기록 실패 시 요청 차단 여부는 DB 설계(Phase 2)에서 결정
- 길드 대시보드 중 특정 페이지(`/voice`, `/newbie` 등)를 직접 URL로 접근 시에도 동일한 GuildMembershipGuard GET 우회 적용

---

## UF-SUPER-ADMIN-003-A: read-only 강제 — mutation 시도 차단

> UF-SUPER-ADMIN-003의 하위 흐름. 슈퍼 관리자가 기존 대시보드 또는 설정 페이지에서 편집/저장 동작을 시도하는 경우.

### 입력
- 슈퍼 관리자가 기존 대시보드 또는 `/settings/guild/[guildId]/*` 설정 페이지에서 저장·적용·재계산 등의 mutation 동작을 시도

### 처리
1. 웹 클라이언트가 해당 설정 변경 API를 non-GET 메서드(POST·PATCH·PUT·DELETE)로 호출
2. 🔒 API의 `GuildMembershipGuard`가 `isSuperAdmin === true` + `method !== GET` 조합을 감지하여 즉시 403 반환 (권한 — fail-closed, 사전 승인)
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
- 일반 사용자(길드 운영자 포함, `isSuperAdmin` 없음 또는 false)가 `/admin` 경로에 접근

### 처리
1. 세션 쿠키 유무 확인 — 없으면 로그인 유도
2. 세션이 유효하더라도 `isSuperAdmin` 플래그가 false(또는 필드 없음)
3. `apps/web/app/admin/layout.tsx` (AdminLayout)가 `isSuperAdmin` 미충족을 감지하여 즉시 차단
4. 🟨 차단 시 응답(403 페이지 표시 또는 `/` 리다이렉트)은 UX 구현 단계에서 결정
5. 사용자가 `/api/admin/*` 엔드포인트를 직접 호출하는 경우 `SuperAdminGuard`가 JWT 기반으로 재검증하여 403 반환

### 출력
- 웹: 403 응답 또는 기본 경로 리다이렉트
- API 직접 호출: 403 JSON 응답

### 엣지케이스
- 비로그인 상태에서 `/admin` 직접 접근 → 로그인 화면으로 리다이렉트 (auth 공통 흐름)
- 로그인 후 `SUPER_ADMIN_IDS` 목록에서 제거된 사용자가 기존 JWT로 접근 → 기존 JWT의 `isSuperAdmin: true`가 그대로 남아 있을 수 있음 — JWT 만료(1시간) 이전까지 어드민 접근이 유지됨. 재로그인 시 최신 allowlist 기준으로 `isSuperAdmin: false` 재발급
- `SUPER_ADMIN_IDS` 환경변수 미설정 상태 → allowlist 빈 상태로 동작하여 슈퍼 관리자 없음 처리. 모든 사용자가 `/admin` 접근 차단
- 웹 클라이언트 `isSuperAdmin` 플래그 조작 시도 → API 가드가 JWT 서명 기준으로 재검증하므로 차단됨 (클라이언트 플래그는 UI 분기 전용)
