# QA Checklist — super-admin (Phase 1, read-only 콘솔)

> 입력 종합: PRD `super-admin.md` + usecase UC-01~04 + endpoint-spec(가드 매트릭스) + 두 plan(be/web).
> Phase 6 tester(BE) / fe-tester(web) / Phase 6.5 e2e-checker 입력. 우선순위 P0(필수) > P1 > P2.

## A. 슈퍼 관리자 식별 (BE — auth)

- [ ] **P0** `SUPER_ADMIN_IDS` 에 포함된 Discord ID 로 로그인 → JWT payload 에 `isSuperAdmin: true`
- [ ] **P0** allowlist 에 없는 ID 로 로그인 → `isSuperAdmin: false`(또는 미포함) — 기존 사용자 동작 불변
- [ ] **P1** `SUPER_ADMIN_IDS` 미설정/빈 문자열 → 슈퍼 관리자 0명, 누구도 `isSuperAdmin:true` 아님 (안전 기본값)
- [ ] **P1** allowlist 값에 공백/빈 항목(`"a, ,b,"`) → trim·빈값 제거 후 정상 파싱
- [ ] **P1** `isSuperAdmin` 없는 기존(레거시) JWT → `jwt.strategy` 가 `false` 로 처리 (하위호환, 우회 없음)

## B. GuildMembershipGuard 우회 — 가드 분기 매트릭스 (BE) ★핵심

- [ ] **P0** 슈퍼 관리자 + GET + 비멤버 길드 → **통과**(우회)
- [ ] **P0** 슈퍼 관리자 + POST/PUT/PATCH/DELETE + 비멤버 길드 → **403** (read-only fail-closed)
- [ ] **P0** 슈퍼 관리자 + 조회성 POST(`/voice-analytics/ai-insight`, `/inactive-members/classify`) + 비멤버 → **403** (의도된 차단)
- [ ] **P0** 일반 사용자 + GET + 멤버 길드 → 통과 (기존 동작 불변)
- [ ] **P0** 일반 사용자 + any + 비멤버 길드 → 403 (기존 동작 불변)
- [ ] **P1** 슈퍼 관리자 + GET + 멤버 길드(본인이 운영자) → 통과 (기존 경로, 중복 우회 무해)

## C. /api/admin/guilds + SuperAdminGuard (BE)

- [ ] **P0** 슈퍼 관리자 → `GET /api/admin/guilds` 200 + `AdminGuildDto[]`(또는 합의된 봉투)
- [ ] **P0** 비-슈퍼관리자 → `GET /api/admin/guilds` **403** (SuperAdminGuard)
- [ ] **P0** 미인증 → 401 (JwtAuthGuard)
- [ ] **P1** 길드 목록 출처(guild_member distinct) 정확성 — 봇 참여 길드가 모두 나오는지, 중복 없는지
- [ ] **P2** 길드명/아이콘 보강 실패 시 fallback(name=guildId, icon=null) 동작, 목록 자체는 200

## D. 감사 로그 (BE — AuditLogInterceptor)

- [ ] **P0** 슈퍼 관리자의 길드 GET 우회 요청 → audit_log 1행(adminDiscordUserId/guildId/method/path/createdAt)
- [ ] **P0** `GET /api/admin/guilds` 열람 → audit_log 기록 (guildId = null)
- [ ] **P1** 일반 사용자(비-슈퍼관리자)의 정상 요청 → audit_log 기록 안 함 (슈퍼 관리자 행위만 기록)
- [ ] **P1** audit 기록 실패(DB 오류) → 본 요청은 **정상 응답**(비차단), 실패는 로깅
- [ ] **P2** 인덱스(admin/guild/createdAt) 존재 — 마이그레이션 적용 확인

## E. /admin 콘솔 (web)

- [ ] **P0** `isSuperAdmin` 사용자 → `/admin` 진입, 전체 길드 목록 렌더
- [ ] **P0** 비-슈퍼관리자 → `/admin` 접근 시 거부(리다이렉트/홈) — 레이아웃 가드
- [ ] **P0** 미로그인 → `/admin` 접근 시 로그인 흐름
- [ ] **P1** 길드 목록 검색(클라 필터) — 이름 부분일치
- [ ] **P1** [열람] 클릭 → `/dashboard/guild/[guildId]/overview` 이동, 비운영 길드도 표시(GET 우회)
- [ ] **P1** 플랫폼 헬스 패널 — `/api/health` 응답(database/redis/discord) 표시
- [ ] **P2** drill-in 후 설정 페이지 mutation 시도 → 403, 사용자에게 안내 메시지

## F. 통합/E2E (Phase 6.5 — auth 우선 트리거)

- [ ] **P0** UC-01: OAuth2 콜백 → isSuperAdmin JWT → /admin 진입 전 구간
- [ ] **P0** UC-03: [열람] → GuildMembershipGuard GET 우회 → 응답 + audit_log 기록 (cross-app)
- [ ] **P0** UC-04: 슈퍼 관리자 mutation 403 경계
- [ ] **P1** 권한 회수: allowlist 에서 제거 후에도 기존 JWT 만료 전까지 우회 유효(JWT 특성) — 문서화된 동작 확인

> 🟨 미정(테스트 시 현 구현 기준): 길드 목록 응답 봉투 형태, joinedAt 채움 여부, read-only 배너 UX, 헤더 진입점 노출.
