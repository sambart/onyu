# Endpoint Spec — role-panel

> 역할 패널(Role Panel) 도메인 — 관리자가 Discord 채널에 Embed + 버튼 패널을 게시하고, 버튼 클릭으로 역할을 부여/회수하는 기능의 BE 엔드포인트 명세.
> 입력: `docs/specs/prd/role-panel.md` + `docs/usecases/role-panel/` (UC-01~05) + `docs/specs/database/_index.md` (role_panel_config, role_panel_button).
> Phase 4 implementer 의 컨트롤러/DTO/Swagger 구현 기준 + Phase 6 tester 입력.
> 마커: 🔒 결정완료 민감영역(권한·정책) / 🟨 가정(구현 시 확정). **🔴 결정대기 없음 — 권한 정책 2026-06-19 사용자 확정.**

---

## 0. 컨벤션 확인 결과 (실제 코드 기준)

기존 코드를 확인하여 아래 컨벤션에 일치시킨다.

| 항목 | 확인 내용 | 출처 |
|---|---|---|
| 웹 컨트롤러 path | `@Controller('api/guilds/:guildId/<domain>')` | `sticky-message.controller.ts`, `status-prefix.controller.ts` |
| 웹 컨트롤러 가드 | `@UseGuards(JwtAuthGuard)` **만 명시**. `GuildMembershipGuard` 는 `app.module.ts` 에 **`APP_GUARD` 전역 등록** → 컨트롤러에 재선언 불필요 | `app.module.ts` L80-81, `guild-membership.guard.ts` |
| 슈퍼관리자 read-only | 전역 `GuildMembershipGuard` 가 처리: `isSuperAdmin===true && method==='GET'` → 멤버십 우회 통과. **non-GET 은 멤버십 체크로 낙하 → 비멤버 403** (fail-closed). 엔드포인트별 추가 코드 불필요 | `guild-membership.guard.ts` L30-39 |
| 봇 컨트롤러 path | `@Controller('bot-api/<domain>')` | `bot-status-prefix.controller.ts`, `bot-sticky-message.controller.ts` |
| 봇 컨트롤러 가드 | `@UseGuards(BotApiAuthGuard)` + `@SkipThrottle()`. `BotApiAuthGuard` 는 `Authorization: Bearer <BOT_API_KEY>` 비교(timing-safe) | `bot-api-auth.guard.ts`, `bot-status-prefix.controller.ts` |
| ID path param | `@Param('id', ParseIntPipe)` (int PK) | `sticky-message.controller.ts` L53 |
| 색상 표현 | DB `embedColor varchar(7)` (`#RRGGBB`). 기존 roles 응답은 `color: number` 사용 — role-panel 은 HEX 문자열 유지(PRD 일치) | `database/_index.md` L2796, `guild-info.controller.ts` L41 |
| 역할 조회 | `DiscordRestService.fetchGuildRoles(guildId)` → `APIRole[]` (`position`/`permissions`/`managed`/`tags` 포함). 기존 `GET /api/guilds/:guildId/roles` 는 managed·@everyone 만 제외(assignability 미표기) | `discord-rest.service.ts` L115, `guild-info.controller.ts` L31-43 |
| 봇 식별 | `DiscordRestService.getBotUserId()` — 봇 최상위 역할 position 산출에 사용 | `discord-rest.service.ts` L91 |

> 🟨 **DDD 레이어 경로**: 본 명세는 `apps/api/src/role-panel/{presentation,application,infrastructure}` 신규 디렉토리를 가정한다(PRD 관련 모듈 표·DB `*.orm-entity.ts` 예정 경로와 일치). 컨트롤러 파일명 가정: `apps/api/src/role-panel/presentation/role-panel.controller.ts` (웹), `apps/api/src/bot-api/role-panel/bot-role-panel.controller.ts` (봇).

---

## 1. 웹 관리자 API (`api/guilds/:guildId/role-panel`)

**공통 가드**: `@UseGuards(JwtAuthGuard)` (컨트롤러 레벨) + 전역 `GuildMembershipGuard`.
**공통 응답 코드**: `401`(미인증, `JwtAuthGuard`) / `403`(비운영 길드 — 일반 비멤버 또는 슈퍼관리자 mutation, `GuildMembershipGuard`).

### 1.1 `GET /api/guilds/:guildId/role-panel` 🔒(권한)

길드의 패널 목록 + 각 패널의 버튼 목록 조회. (F-ROLE-PANEL-001 / UC-01 Phase 1)

| 항목 | 값 |
|---|---|
| Method / Path | `GET /api/guilds/:guildId/role-panel` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). 슈퍼관리자 GET 우회 허용 |
| Path params | `guildId: string` (Discord 길드 ID) |
| Query / Body | 없음 |
| 동작 | Redis `role_panel:config:{guildId}` 캐시 우선 → 미스 시 DB(`role_panel_config` JOIN `role_panel_button` ORDER BY `sortOrder`) 조회 후 캐시 저장(TTL 1h) |
| Response 200 | `RolePanelDto[]` (설정 없으면 `[]`) |
| 주요 에러 | 401 / 403 |
| 비고 | 🟨 캐시 표현형: 버튼 클릭 핸들러(봇)와 동일 캐시 키를 공유하나 직렬화 형태(버튼 포함 전체 패널)는 구현 시 통일 |

### 1.2 `GET /api/guilds/:guildId/role-panel/:panelId` 🔒(권한)

패널 단건 상세 조회 (편집 폼 로드용). (UC-02 Phase 1 단계 2)

| 항목 | 값 |
|---|---|
| Method / Path | `GET /api/guilds/:guildId/role-panel/:panelId` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). 슈퍼관리자 GET 우회 허용 |
| Path params | `guildId: string`, `panelId: number` (`ParseIntPipe`) |
| 동작 | `panelId` 조회 + **`guildId` 소유 검증** (다른 길드 패널 ID 접근 차단) |
| Response 200 | `RolePanelDto` |
| 주요 에러 | 401 / 403 / **404**(panelId 미존재 또는 guildId 불일치) |

### 1.3 `POST /api/guilds/:guildId/role-panel` 🔒(권한)

패널 생성 (저장, `published=false`). 게시는 별도(1.6). (F-ROLE-PANEL-002 / UC-01 Phase 2)

| 항목 | 값 |
|---|---|
| Method / Path | `POST /api/guilds/:guildId/role-panel` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). **비운영 길드 슈퍼관리자 mutation → 403** |
| HttpCode | `201 Created` (생성) — 🟨 기존 sticky/status 는 POST 에 `@HttpCode(200)` 사용. role-panel 은 리소스 생성이므로 201 권장(구현 시 팀 컨벤션 확인) |
| Body | `CreateRolePanelDto` (아래) |
| 권한 검증 위치 | 🔒 **이 엔드포인트가 Discord 역할 위계 + ADMINISTRATOR 검증 수행** (4.1 참조). 위반 시 400/403 |
| 동작 | (1) `fetchGuildRoles` 로 역할 검증 → (2) 트랜잭션으로 `role_panel_config`(published=false) + `role_panel_button` INSERT → (3) Redis 캐시 무효화(`DEL role_panel:config:{guildId}`) |
| Response 201 | `RolePanelDto` (생성된 패널, `id`·`published=false`·`messageId=null`) |
| 주요 에러 | 400(버튼 0개 / 버튼 25개 초과 / 부여불가 역할 매핑 / DTO 검증 실패) · **403**(ADMINISTRATOR 역할 매핑, 비운영 슈퍼관리자) · 401 |

### 1.4 `PUT /api/guilds/:guildId/role-panel/:panelId` 🔒(권한)

패널 수정 (버튼 전체 replace). `published=true` 면 Discord 동기화 트리거. (F-ROLE-PANEL-003 / UC-02)

| 항목 | 값 |
|---|---|
| Method / Path | `PUT /api/guilds/:guildId/role-panel/:panelId` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). **비운영 슈퍼관리자 → 403** |
| Path params | `guildId: string`, `panelId: number` (`ParseIntPipe`) |
| Body | `UpdateRolePanelDto` (= `CreateRolePanelDto` 와 동일 shape) |
| 권한 검증 위치 | 🔒 **이 엔드포인트가 Discord 역할 위계 + ADMINISTRATOR 검증 수행** (4.1). 위반 시 400/403 |
| 동작 | (1) panelId+guildId 소유 검증 → (2) 역할 재검증 → (3) 트랜잭션: `role_panel_config` UPDATE + `role_panel_button` DELETE→INSERT(전체 교체) → (4) Redis 무효화 → (5) `published===true` 면 동기화: **채널 동일** → 봇 `message.edit()` 요청 / **채널 변경** → 기존 채널 메시지 삭제 + 새 채널 신규 전송 → 새 `messageId` 갱신 (UC-02 AF-01) |
| Response 200 | `RolePanelDto` (동기화 후 최신 `messageId` 반영) |
| 주요 에러 | 400(버튼 0/25초과/부여불가 역할/검증) · 403(ADMINISTRATOR/비운영 슈퍼관리자) · 404(panelId) · **503**(published 동기화 시 봇 채널 권한 부족 — UC-02 EX-04) · 401 |
| 비고 | `published=false` 패널 수정 시 Discord 봇 호출 없음(UC-02 AF-02). 기존 메시지 수동 삭제(Unknown Message) 시 봇이 동일 채널 신규 전송 폴백 후 messageId 갱신(UC-02 EX-02, 투명 폴백) |

### 1.5 `DELETE /api/guilds/:guildId/role-panel/:panelId` 🔒(권한)

패널 삭제 + Discord 메시지 삭제. (F-ROLE-PANEL-004 / UC-03)

| 항목 | 값 |
|---|---|
| Method / Path | `DELETE /api/guilds/:guildId/role-panel/:panelId` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). **비운영 슈퍼관리자 → 403** |
| Path params | `guildId: string`, `panelId: number` (`ParseIntPipe`) |
| HttpCode | `200 OK` (기존 sticky `@Delete` 컨벤션 일치) |
| 동작 | (1) panelId+guildId 조회(channelId/messageId/published) → (2) `messageId` 존재 시 Bot-API-Client 로 메시지 삭제 요청(**실패 무시** — 이미 삭제됨 등, UC-03 EX-01) → (3) `role_panel_config` DELETE (`role_panel_button` ON DELETE CASCADE) → (4) Redis 무효화 |
| Response 200 | `{ ok: boolean }` (sticky 컨벤션 일치) |
| 주요 에러 | 403(비운영 슈퍼관리자) · 404(panelId 미존재 — UC-03 EX-03) · 401 |
| 비고 | Discord 메시지 삭제 실패는 로그만 기록하고 DB 삭제 계속 진행(UC-03 S-03). `messageId` 없으면(미게시) 봇 호출 생략(UC-03 AF-01) |

### 1.6 `POST /api/guilds/:guildId/role-panel/:panelId/publish` 🔒(권한)

패널 게시 / 재동기화 트리거. (F-ROLE-PANEL-005 / UC-01 Phase 3)

| 항목 | 값 |
|---|---|
| Method / Path | `POST /api/guilds/:guildId/role-panel/:panelId/publish` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). **비운영 슈퍼관리자 → 403** |
| Path params | `guildId: string`, `panelId: number` (`ParseIntPipe`) |
| Body | 없음 |
| HttpCode | `200 OK` |
| 동작 | (1) panelId+guildId 조회 → (2) **`channelId` 필수 검증**(없으면 400, UC-01 EX-05) → (3) Bot-API-Client 로 봇에 게시 요청(channelId, Embed, 버튼 목록, 기존 messageId) → (4) 봇이 `messageId` 있으면 `edit`, 없으면 신규 전송 → **봇이 messageId 를 응답으로 반환** → (5) `role_panel_config` UPDATE(`messageId`, `published=true`) → (6) Redis 무효화 |
| Response 200 | `RolePanelDto` 또는 `{ ok: true, messageId: string }` (🟨 구현 시 통일 — Web 은 게시 후 갱신된 패널 표시) |
| 주요 에러 | 400(channelId 없음 — EX-05 / 버튼 25개 초과 — EX-04) · 403(비운영 슈퍼관리자) · 404(panelId) · **503**(봇 Send Messages 권한 부족 — EX-06) · 봇 채널 미존재(Unknown Channel — EX-07) → 4xx/5xx 매핑 🟨 · 401 |
| 비고 | 🔒 **messageId 영속 흐름은 API 주도·동기**: API→봇 게시 요청에 대해 봇이 messageId 를 HTTP 응답으로 반환하고 API 가 즉시 DB 저장. **별도 messageId 콜백(봇→API) 엔드포인트는 MVP 에 두지 않는다** (2.2 참조). 게시 실패 시 `published=false` 보존, 재게시 가능(UC-01 §8.3) |

### 1.7 `GET /api/guilds/:guildId/role-panel/assignable-roles` 🔒(권한) 🟨

패널 버튼에 매핑 가능한 역할 목록 + 부여불가/ADMINISTRATOR 비활성 메타. 웹 역할 선택 UI 용. (UC-01 단계 6, PRD 권한정책 1·2)

| 항목 | 값 |
|---|---|
| Method / Path | `GET /api/guilds/:guildId/role-panel/assignable-roles` |
| Auth | `JwtAuthGuard` + `GuildMembershipGuard`(전역). 슈퍼관리자 GET 우회 허용 |
| Path params | `guildId: string` |
| 동작 | `fetchGuildRoles` + `getBotUserId`(봇 최상위 역할 position) → 각 역할에 `assignable` / `disabledReason` 메타 부착 |
| Response 200 | `AssignableRoleDto[]` (아래) |
| 주요 에러 | 401 / 403 |
| 비고 | 🟨 **신규 엔드포인트 권장** — 기존 `GET /api/guilds/:guildId/roles`(`guild-info.controller.ts`)는 managed·@everyone 만 제외하고 assignability 메타가 없다. 웹이 "비활성 + 사유 표기"(PRD 권한정책)를 하려면 메타가 필요하므로 role-panel 전용 엔드포인트로 분리. 대안: 기존 `/roles` 응답에 메타 필드 추가(영향 범위 검토 필요) — 1차는 분리 채택 |

---

## 2. 봇용 API (`bot-api/role-panel`)

**공통 가드**: `@UseGuards(BotApiAuthGuard)` + `@SkipThrottle()`. `Authorization: Bearer <BOT_API_KEY>`.
**공통 에러**: `401`(키 누락/불일치, `BotApiAuthGuard`).

### 2.1 `GET /bot-api/role-panel/config` 🟨

길드 패널 설정(버튼/역할/모드) 조회 — 봇 인터랙션 핸들러의 **캐시 미스 DB 폴백**용 최소 데이터. (UC-04 AF-02 / UC-05 동일)

| 항목 | 값 |
|---|---|
| Method / Path | `GET /bot-api/role-panel/config` |
| Auth | `BotApiAuthGuard` |
| Query | `guildId: string` (필수) — 🟨 `panelId`/`buttonId` 로 범위 축소 가능하나, UC-04 AF-02 는 길드 전체 캐시 빌드(`role_panel:config:{guildId}`)를 전제하므로 **길드 단위 반환** 채택 |
| 동작 | DB `role_panel_config` JOIN `role_panel_button` WHERE `guildId` ORDER BY `sortOrder` → 버튼 클릭 처리에 필요한 최소 필드 반환 |
| Response 200 | `{ ok: boolean, data: BotRolePanelConfigDto[] }` (bot-sticky-message 컨벤션 일치) |
| 주요 에러 | 401 |
| 비고 | 🔒 **존재 근거(조건부)**: UC-04 AF-02 는 "DB 직접 조회 **또는** Bot-API-Client 경유"를 허용한다. 봇이 DB 직접 접근하면 본 엔드포인트는 **불필요**. 봇 프로세스가 DB 미접근 정책이면 본 엔드포인트로 폴백. 🟨 **둘 중 택1은 Phase 3 계획/구현에서 확정** — 본 명세는 Bot-API 경유 안을 기본 후보로 등재 |

### 2.2 게시 결과 messageId 콜백 — **MVP 미채택** 🔒

| 결정 | 내용 |
|---|---|
| 흐름 | 게시는 **API 주도·동기**(1.6). API→봇 게시 요청의 HTTP 응답으로 봇이 messageId 를 반환 → API 가 DB 저장. UC-01 단계 18~20, UC-02 단계 9·AF-01 모두 동일(봇 응답 = messageId) |
| 결론 | **별도 봇→API messageId 콜백 엔드포인트(POST `/bot-api/role-panel/published` 등)는 두지 않는다.** 봇은 API 의 게시 요청에 응답만 하면 됨 |
| 🟨 후속 | 비동기 게시(큐 기반)로 전환 시 콜백 엔드포인트 필요 — MVP 범위 밖. PRD MVP 제외 항목과 정합 |
| 봇 게시 요청 수신측 | 게시/편집/삭제 요청의 **HTTP 서버는 봇(apps/bot)** 이며 API 는 Bot-API-Client(`libs/bot-api-client`)로 호출(클라이언트). 봇측 수신 엔드포인트 명세는 봇 도메인 영역(본 문서 범위 외 — apps/api 엔드포인트만 명세) |

---

## 3. DTO 정의

### `CreateRolePanelDto` / `UpdateRolePanelDto` (요청 — 1.3 / 1.4)

| 필드 | 타입 | 검증 | 비고 |
|---|---|---|---|
| `name` | `string` | `@IsString()` `@IsNotEmpty()` | 패널 내부 식별명 |
| `channelId` | `string \| null` | `@IsOptional()` `@IsString()` | 미선택 저장 허용(UC-01 AF-02). 게시 시 필수(1.6) |
| `embedTitle` | `string \| null` | `@IsOptional()` `@IsString()` | |
| `embedDescription` | `string \| null` | `@IsOptional()` `@IsString()` | `text` |
| `embedColor` | `string \| null` | `@IsOptional()` `@Matches(/^#[0-9A-Fa-f]{6}$/)` | `varchar(7)` `#RRGGBB` |
| `buttons` | `RolePanelButtonInputDto[]` | `@IsArray()` `@ArrayMinSize(1)` `@ArrayMaxSize(25)` `@ValidateNested({each})` | **0개 → 400**(EX-03), **25개 초과 → 400**(EX-04) |

### `RolePanelButtonInputDto` (요청 — buttons[] 요소)

| 필드 | 타입 | 검증 | 비고 |
|---|---|---|---|
| `label` | `string` | `@IsString()` `@IsNotEmpty()` `@MaxLength(80)` | Discord 버튼 라벨 한계 80자 🟨 |
| `emoji` | `string \| null` | `@IsOptional()` `@IsString()` | |
| `roleId` | `string` | `@IsString()` `@IsNotEmpty()` | 🔒 **4.1 검증 대상** |
| `mode` | `'GRANT' \| 'TOGGLE'` | `@IsEnum(RolePanelButtonMode)` | `role_panel_button_mode_enum` |
| `style` | `'PRIMARY' \| 'SECONDARY' \| 'SUCCESS' \| 'DANGER'` | `@IsEnum(RolePanelButtonStyle)` | 기본 `PRIMARY` |
| `sortOrder` | `number` | `@IsInt()` `@Min(0)` | 버튼 표시 순서 |

> 🟨 enum 은 `libs/shared/src/types/role-panel.ts` 공유 상수로 정의 권장(PRD 관련 모듈 표).

### `RolePanelDto` (응답 — 웹)

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `number` | PK |
| `name` | `string` | |
| `channelId` | `string \| null` | |
| `channelName` | `string \| null` | 🟨 채널명 부착 시 `fetchGuildChannels` 매핑(없으면 생략 가능) |
| `messageId` | `string \| null` | 미게시 시 null |
| `embedTitle` / `embedDescription` / `embedColor` | `string \| null` | |
| `published` | `boolean` | |
| `buttons` | `RolePanelButtonDto[]` | `sortOrder` 정렬 |
| `createdAt` / `updatedAt` | `string` | ISO |

### `RolePanelButtonDto` (응답 — 웹)

`id: number` · `label` · `emoji: string\|null` · `roleId: string` · `roleName: string\|null`(🟨 역할명 부착) · `mode` · `style` · `sortOrder: number`

### `AssignableRoleDto` (응답 — 1.7)

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `string` | 역할 ID |
| `name` | `string` | 역할명 |
| `color` | `number` | Discord 정수 색상(기존 `/roles` 일치) |
| `position` | `number` | 위계 |
| `assignable` | `boolean` | false 면 매핑 불가 |
| `disabledReason` | `'HIGHER_THAN_BOT' \| 'MANAGED' \| 'EVERYONE' \| 'ADMINISTRATOR' \| null` | 🔒 비활성 사유(웹 툴팁 표기용). 다중 사유 시 우선순위 🟨 구현 결정 |

### `BotRolePanelConfigDto` (응답 — 2.1, 봇 폴백)

`panelId: number` · `buttons: { buttonId: number, roleId: string, mode: 'GRANT'\|'TOGGLE' }[]` — 버튼 클릭 처리 최소 데이터(label/style/emoji 등 표시 데이터 제외 가능 🟨)

---

## 4. 권한 검증 (🔒 결정완료 — 2026-06-19 사용자 확정)

### 4.1 Discord 역할 매핑 검증 (저장 시점 — 1.3 POST / 1.4 PUT 가 수행)

🔒 패널 **생성(1.3)·수정(1.4)** 시 API 가 `fetchGuildRoles(guildId)` + `getBotUserId()` 로 아래를 **서버측 재검증**한다. 위반 역할이 버튼 목록에 포함되면 차단.

| # | 차단 대상 | 검증 방법 | 응답 코드 | 출처 |
|---|---|---|---|---|
| 1 | 봇 최상위 역할보다 **위계가 높은** 역할 | 봇 멤버의 roles 중 max `position` < 대상 role `position` | **400** | PRD 정책1, UC-01 EX-01 |
| 2 | **managed/integration** 역할 | `role.managed === true` 또는 `role.tags` 보유 | **400** | PRD 정책1 |
| 3 | **`@everyone`** 역할 | `role.id === guildId` (또는 name `@everyone`) | **400** | PRD 정책1 |
| 4 | **ADMINISTRATOR** 권한 보유 역할 | `BigInt(role.permissions) & ADMINISTRATOR(1<<3)` ≠ 0 | **403** | PRD 정책2, UC-01 EX-02 |

> 🔒 **응답 코드 구분**: 부여불가(위계/managed/@everyone)는 **400**(요청 데이터 오류), ADMINISTRATOR 매핑은 **403**(권한 정책 차단) — UC-01 EX-01(400)/EX-02(403) 일치.
> 🔒 웹 UI 는 1.7 `assignable-roles` 메타로 사전 비활성/사유 표기하나, **API 저장 시점 재검증이 fail-closed 최종 방어선**(웹 우회 요청 차단).
> 🟨 다중 위반(예: 위계 높음 + ADMINISTRATOR) 시 우선 응답 코드 — 구현 시 ADMINISTRATOR(403) 우선 권장.

### 4.2 길드 접근 권한 (전역 가드)

🔒 전역 `GuildMembershipGuard`:

| 액터 | Method | 길드 멤버십 | 결과 |
|---|---|---|---|
| 길드 운영진 | any | 멤버 | ✅ 통과 |
| 슈퍼관리자 | GET (1.1/1.2/1.7) | 비멤버 | ✅ 통과(우회) — **read-only** |
| 슈퍼관리자 | non-GET (1.3/1.4/1.5/1.6) | 비멤버 | ⛔ **403** (fail-closed, UC-01 EX-08 / UC-03 F-01) |
| 일반 사용자 | any | 비멤버 | ⛔ 403 |
| 미인증 | any | — | ⛔ 401 (`JwtAuthGuard`) |

---

## 5. 엔드포인트 요약 (구현·테스트 인덱스)

| # | Method | Path | 가드 | 역할검증(4.1) | 주요 비고 |
|---|---|---|---|---|---|
| 1.1 | GET | `/api/guilds/:guildId/role-panel` | Jwt+GuildMembership | — | 목록, 캐시우선 |
| 1.2 | GET | `/api/guilds/:guildId/role-panel/:panelId` | Jwt+GuildMembership | — | 단건, 404 |
| 1.3 | POST | `/api/guilds/:guildId/role-panel` | Jwt+GuildMembership | ✅ | 생성(published=false), 201 |
| 1.4 | PUT | `/api/guilds/:guildId/role-panel/:panelId` | Jwt+GuildMembership | ✅ | 수정+동기화, 503 가능 |
| 1.5 | DELETE | `/api/guilds/:guildId/role-panel/:panelId` | Jwt+GuildMembership | — | 삭제, `{ok}` |
| 1.6 | POST | `/api/guilds/:guildId/role-panel/:panelId/publish` | Jwt+GuildMembership | — | 게시, channelId 필수, 503 가능 |
| 1.7 | GET | `/api/guilds/:guildId/role-panel/assignable-roles` | Jwt+GuildMembership | — | 역할목록+메타 🟨 |
| 2.1 | GET | `/bot-api/role-panel/config` | BotApiAuth | — | 봇 폴백 조회 🟨(조건부) |
| 2.2 | — | (messageId 콜백) | — | — | **MVP 미채택** 🔒 |

**마커 집계**: 🔴(결정대기) **0개**. 🔒(권한·정책 결정완료) — 4장 전체 + 1.x 권한 표기. 🟨(가정/구현 확정) — 1.7 엔드포인트 분리 채택, 2.1 봇 폴백 택1, POST 201 vs 200, publish 응답 shape, 채널명/역할명 부착, DTO 라벨 한계, 다중 위반 우선순위.

---

## 부록 — 참고 자료

| 문서 | 경로 |
|---|---|
| PRD | `docs/specs/prd/role-panel.md` |
| Usecase | `docs/usecases/role-panel/UC-01~05` |
| DB 스키마 | `docs/specs/database/_index.md` (§31 role_panel_config, §32 role_panel_button) |
| 포맷 레퍼런스 | `docs/specs/endpoint-spec/super-admin.md` |
| 컨벤션 레퍼런스(코드) | `sticky-message.controller.ts`, `status-prefix.controller.ts`, `bot-status-prefix.controller.ts`, `bot-api-auth.guard.ts`, `guild-membership.guard.ts`, `guild-info.controller.ts`, `discord-rest.service.ts` |

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 내용 |
|---|---|---|---|
| 1.0 | 2026-06-19 | planner-endpoint-spec | 초기 작성 (웹 7 + 봇 1 + 콜백 미채택 결정) |
