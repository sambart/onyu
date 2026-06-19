# Endpoint Spec — super-admin

> 슈퍼 관리자(플랫폼 어드민) read-only 콘솔 Phase 1 의 BE 엔드포인트 명세.
> 입력: `docs/specs/prd/super-admin.md` + `docs/usecases/super-admin/`.
> 마커: 🔒 결정완료 민감영역 / 🟨 미정. (🔴 결정대기 없음 — 권한·개인정보 사전 승인됨)

## 1. 신규 엔드포인트

### `GET /api/admin/guilds` 🔒(권한)

봇이 참여 중인 전체 길드 목록 조회. 플랫폼 어드민 전용.

| 항목 | 값 |
|---|---|
| Method / Path | `GET /api/admin/guilds` |
| Auth | `JwtAuthGuard` + **`SuperAdminGuard`** (신규). `isSuperAdmin !== true` → 403 |
| Guard 우회 | `GuildMembershipGuard` 대상 아님 (`:guildId` path 파라미터 없음 → 자동 통과) |
| Query | `search?` (선택, 길드명 부분일치 — 서버/클라 중 어디서 필터링할지 🟨. 1차 구현은 전체 반환 후 클라 필터 허용) |
| Request body | 없음 |
| Response 200 | `AdminGuildDto[]` |
| Response 403 | 비-슈퍼관리자 (`SuperAdminGuard`) |
| Response 401 | 미인증 (`JwtAuthGuard`) |
| 감사 로그 | `AuditLogInterceptor` 가 `guildId=null` 로 기록 (열람 행위) |

#### `AdminGuildDto`

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `string` | 길드(서버) ID |
| `name` | `string` | 길드명 |
| `icon` | `string \| null` | 아이콘 해시/URL |
| `memberCount` | `number` | 멤버 수 (🟨 출처: `guild_member` count vs Discord REST) |
| `joinedAt` | `string \| null` | 봇 참여일 (🟨 데이터 소스 확정 시 채움. 없으면 null 허용) |

> 🟨 **길드 목록 데이터 출처 미정**: ① `guild_member` 테이블의 distinct `guildId` 집계(설치 비용 0, 멤버 0 길드 누락 위험) vs ② Discord REST(봇 client.guilds, 실시간·정확하나 봇 프로세스 의존). Phase 3 계획에서 확정. 1차 구현은 DB distinct 집계를 기본 후보로 한다.

## 2. 기존 엔드포인트 — 동작 변경 (신규 아님)

### `GET /api/guilds/:guildId/*` (기존 41개 GET) 🔒(권한)

- 변경점: `GuildMembershipGuard` 가 `isSuperAdmin === true && method === 'GET'` 이면 길드 멤버십 체크를 우회(통과).
- 비-GET(POST/PUT/PATCH/DELETE)은 슈퍼 관리자라도 **기존대로 403** (read-only fail-closed). 조회성 POST(`ai-insight` 생성, `inactive-members/classify`)도 차단 — 의도된 동작.
- 일반 사용자 동작은 불변 (기존 `guilds[]` 멤버십 체크 유지).
- 감사 로그: 슈퍼 관리자 우회 통과 시 `AuditLogInterceptor` 가 `guildId` 와 함께 기록.

## 3. 가드 분기 매트릭스 (구현·테스트 기준)

| 액터 | Method | guildId 멤버십 | 결과 |
|---|---|---|---|
| 슈퍼 관리자 | GET | 비멤버 | ✅ 통과 (우회) + 감사 로그 |
| 슈퍼 관리자 | non-GET | 비멤버 | ⛔ 403 (fail-closed) |
| 슈퍼 관리자 | GET | 멤버 | ✅ 통과 (기존 경로) |
| 일반 사용자 | GET | 멤버 | ✅ 통과 (기존) |
| 일반 사용자 | any | 비멤버 | ⛔ 403 (기존) |
| 비-슈퍼관리자 | any | — (`/api/admin/*`) | ⛔ 403 (`SuperAdminGuard`) |

## 4. 비고

- `SuperAdminGuard` 는 `JwtStrategy.validate` 가 전달하는 `req.user.isSuperAdmin` 만 검사 (env 재조회 불필요 — JWT 발급 시점에 확정).
- `AuditLogInterceptor` 는 cross-cutting (엔드포인트별 명세 아님) — 슈퍼 관리자 요청에 한해 기록. 적용 범위(`/api/admin/*` + 슈퍼 관리자의 `/api/guilds/*` GET) 는 Phase 3 계획에서 확정.
