# 구현 계획 — role-panel (API + 공유타입 + 마이그레이션)

> 대상 도메인: **role-panel** (신규, status `not-started`)
> 범위: `apps/api` (DDD presentation/application/infrastructure + dto) · `apps/api/src/bot-api/role-panel` · `libs/shared` · 마이그레이션 1종 · `libs/bot-api-client` SDK 메서드 추가
> 입력: PRD(`docs/specs/prd/role-panel.md`) · usecase(`docs/usecases/role-panel/UC-01~05`) · endpoint-spec(`docs/specs/endpoint-spec/role-panel.md`) · DB 설계(`docs/specs/database/_index.md` §31·§32·`AddRolePanel1777400000000`)
> 레퍼런스(실제 코드): `apps/api/src/sticky-message/**`, `apps/api/src/status-prefix/**`, `apps/api/src/bot-api/status-prefix/**`, `apps/api/src/discord-rest/discord-rest.service.ts`
> 본 계획은 **API 측 구현만** 다룬다. 봇 인터랙션 핸들러(`apps/bot/src/event/role-panel/`)와 웹(`apps/web/...`)은 별도 plan.

---

## 0. 핵심 설계 결정 (선행 확정)

### 0.1 미해결 조율 1건 — 버튼 클릭 실행 위치 → **(a) 봇 로컬(discord.js) 채택** ✅

| 항목 | 결정 | 근거 |
|---|---|---|
| 버튼 클릭 grant/toggle 실행 | **봇 로컬** (`apps/bot` interactionCreate 핸들러가 discord.js로 직접 수행) | UC-04 §1.2 "apps/api는 이 플로우에 직접 참여하지 않음", UC-05 §1.2 동일 명시. UC-04/05 시퀀스 다이어그램 전 구간이 Bot↔Redis↔Discord REST 로 구성되고 API 가 등장하지 않음 |
| 토글 동시성 분산 락 위치 | **봇 로컬 Redis** (`role_panel:lock:{guildId}:{userId}:{buttonId}`, SET NX, TTL 3s) | UC-05 §3·§4.1 6단계가 봇이 직접 Redis SET NX 수행. 봇은 이미 Redis 접근 가능(봇 내 Redis 인프라는 봇 plan 책임 — 본 API plan 범위 외). 락을 봇 로컬에 두면 인터랙션 3초 제한 내 round-trip 최소화 |
| 설정 캐시 조회 | 봇이 `role_panel:config:{guildId}` 우선 조회. 미스 시 폴백 | UC-04 AF-02 / UC-05 AF-02 |
| 캐시 미스 폴백 경로 | **`GET /bot-api/role-panel/config` (본 API plan 의 2.1) 경유** 채택 | UC-04 AF-02 는 "DB 직접 조회 **또는** Bot-API-Client 경유"를 허용. onyu 봇은 DB 직접 접근을 두지 않는 컨벤션(예: `getStickyMessageConfigs`, `getNewbieConfig` 모두 bot-api 경유). 따라서 본 API plan 은 봇 폴백용 `GET /bot-api/role-panel/config` 를 **포함**한다 |

**결론**: `POST /bot-api/role-panel/interaction` 류 **위임 엔드포인트는 만들지 않는다**. API 가 인터랙션 시 `addMemberRole/removeMemberRole` 를 수행하지 않는다. API 측 봇용 엔드포인트는 **읽기 폴백 `GET /bot-api/role-panel/config` 1개만**. (분산 락도 API 에 없음 — 봇 로컬.)

> 🟨 endpoint-spec 2.1 의 "조건부(택1)" 표기는 위 결정으로 **확정**: bot-api 폴백 채택. 봇 plan 은 이 엔드포인트를 `BotApiClientService.getRolePanelConfig(guildId)` 로 호출.

### 0.2 게시/동기화/삭제 Discord 작업 위치 — **API 직접 수행** (DiscordRestService)

| 항목 | 결정 | 근거 |
|---|---|---|
| 패널 게시/동기화/삭제 시 Discord 메시지 전송·수정·삭제 | **API 가 `DiscordRestService` 로 직접 수행** | 작업 통합 계약 명시. 실제 코드(`status-prefix-config.service.ts buildAndSendMessage`, `sticky-message-discord.adapter.ts`)가 API 에서 `DiscordRestService.sendMessage/editMessage/deleteMessage` 를 직접 호출하는 동일 패턴. API 앱은 자체 REST 클라이언트(`DiscordRestService`) 보유 |
| messageId 영속 | API 가 전송 응답의 `message.id` 를 즉시 `role_panel_config.messageId` 에 UPDATE | sticky/status 패턴 동일 (`updateMessageId`) |
| 역할 검증용 Discord 조회 | API 가 `fetchGuildRoles` + `fetchGuild`(봇 최상위 역할 position) 직접 수행 | endpoint-spec §0, 통합 계약 명시 |

> 🟨 **endpoint-spec 2.2 와의 불일치(중요)**: endpoint-spec 2.2 / §0 비고는 "게시/편집/삭제 HTTP 서버는 봇(apps/bot)이며 API 는 Bot-API-Client 로 호출"이라고 서술한다. 그러나 **작업 통합 계약과 실제 onyu 코드 패턴(sticky/status가 API에서 DiscordRestService 직접 호출)** 은 API 직접 수행이다. 본 plan 은 **통합 계약 + 실제 코드 패턴(API 직접 수행)** 을 채택한다. → endpoint-spec 2.2 의 "봇이 게시 HTTP 서버" 서술은 본 plan 에서 **미채택**(implementer 는 봇 게시 위임 엔드포인트를 만들지 않는다). 봇 plan 작성자와 합의 필요한 항목으로 §9 에 명시.

### 0.3 봇 최상위 역할 position 산출 — `fetchGuild` 미사용, `fetchGuildMember(guildId, botUserId)` + `fetchGuildRoles` 조합

DiscordRestService 에 `fetchGuild` 는 있으나 봇의 역할 목록은 길드 객체에 없다. 봇 최상위 position 산출은:
1. `getBotUserId()` 로 봇 userId 획득
2. `fetchGuildMember(guildId, botUserId)` → 봇 멤버의 `roles: string[]`(역할 ID 목록) 획득
3. `fetchGuildRoles(guildId)` → 각 역할 position 맵
4. 봇 멤버 roles 의 max position = 봇 최상위 position

> 🟨 통합 계약은 "`fetchGuild`(봇 최상위 역할 position)"라 표기했으나, 실제 `APIGuild` 에는 봇 멤버 역할 정보가 없다. 위 `fetchGuildMember` 조합이 정확. implementer 는 이 방식으로 구현. (`fetchGuild` 는 `@everyone` = `role.id === guildId` 판별에는 guildId 만 있으면 되므로 별도 호출 불필요.)

---

## 1. 신규 파일 트리 (생성 대상)

```
apps/api/src/role-panel/
├── domain/
│   └── role-panel.types.ts                      # (선택) enum re-export·내부 타입. 공유 enum 은 libs/shared 우선
├── infrastructure/
│   ├── role-panel-config.orm-entity.ts          # RolePanelConfigOrm (테이블 role_panel_config)
│   ├── role-panel-button.orm-entity.ts          # RolePanelButtonOrm (테이블 role_panel_button)
│   ├── role-panel-config.repository.ts          # CRUD + 버튼 replace 트랜잭션
│   ├── role-panel-cache.keys.ts                 # RolePanelKeys.config(guildId)
│   ├── role-panel-redis.repository.ts           # config 캐시 get/set/del (락은 봇 로컬 — 여기 없음)
│   └── role-panel-discord.adapter.ts            # DiscordRestService 래퍼 (메시지 전송/수정/삭제 + 역할조회)
├── application/
│   ├── role-panel-config.service.ts             # CRUD + 역할검증 + 캐시 무효화
│   ├── role-panel-publish.service.ts            # 게시/동기화 (Discord 메시지 빌드·전송·messageId 저장)
│   ├── role-panel-role-validator.ts             # 역할 위계/managed/@everyone/ADMINISTRATOR 검증 (단위테스트 핵심)
│   └── role-panel-bot.service.ts                # 봇 폴백 config 조회 (bot-api 용 read-only)
├── presentation/
│   ├── role-panel.controller.ts                 # 웹 API (1.1~1.7)
│   ├── create-role-panel.dto.ts                 # CreateRolePanelDto + RolePanelButtonInputDto
│   ├── update-role-panel.dto.ts                 # UpdateRolePanelDto (= Create shape; 단일 파일 재사용 가능)
│   └── role-panel-response.dto.ts               # RolePanelDto / RolePanelButtonDto / AssignableRoleDto (Swagger 응답 타입)
└── role-panel.module.ts                         # 모듈 등록

apps/api/src/bot-api/role-panel/
└── bot-role-panel.controller.ts                 # GET /bot-api/role-panel/config (BotApiAuthGuard + SkipThrottle)

apps/api/src/migrations/
└── 1777400000000-AddRolePanel.ts                # implementer 가 generate 후 검증

libs/shared/src/types/
└── role-panel.ts                                # 공유 enum·상수·customId 헬퍼 (api/bot/web 공통)

libs/bot-api-client/src/
├── types.ts                                     # (수정) BotRolePanelConfigDto 등 추가
└── bot-api-client.service.ts                    # (수정) getRolePanelConfig 메서드 추가
```

> 모든 경로는 통합 계약의 한정 범위 내. 슬래시 커맨드 생성 경로 없음. EXCLUSIVE 모드 코드 없음(스키마 예약 주석은 DB 설계에 이미 존재 — 코드 미반영).

---

## 2. 공유 타입/상수 — `libs/shared/src/types/role-panel.ts` (먼저 작성)

api/bot/web 가 공통 사용. **단일 진실의 소스**.

```ts
// enum (DB enum 과 값 일치 — 대문자)
export enum RolePanelButtonMode { GRANT = 'GRANT', TOGGLE = 'TOGGLE' }
export enum RolePanelButtonStyle { PRIMARY='PRIMARY', SECONDARY='SECONDARY', SUCCESS='SUCCESS', DANGER='DANGER' }

// customId 형식: role_panel:{panelId}:{buttonId}
export const ROLE_PANEL_CUSTOM_ID_PREFIX = 'role_panel';
export function buildRolePanelCustomId(panelId: number, buttonId: number): string
export function parseRolePanelCustomId(customId: string): { panelId: number; buttonId: number } | null

// Discord 제약 상수
export const ROLE_PANEL_MAX_BUTTONS = 25;       // ActionRow 5 × 버튼 5
export const ROLE_PANEL_BUTTONS_PER_ROW = 5;
export const ROLE_PANEL_LABEL_MAX_LENGTH = 80;

// assignable-roles 비활성 사유
export type RolePanelDisabledReason = 'HIGHER_THAN_BOT' | 'MANAGED' | 'EVERYONE' | 'ADMINISTRATOR';

// Discord 권한 비트
export const DISCORD_ADMINISTRATOR_BIT = 1n << 3n;
```

작업:
- `libs/shared/src/types/index.ts` 에 `export * from './role-panel';` (또는 명시 re-export) 추가.
- enum 값은 DB enum(`role_panel_button_mode_enum`, `role_panel_button_style_enum`) 과 **문자열 일치**.
- `buildRolePanelButtonStyleToDiscord` 같은 discord.js `ButtonStyle` 매핑은 **봇/디스코드 의존**이므로 shared 에 두지 않음 — API publish 서비스 내부에 매핑(아래 4.2).

> 🟨 ButtonStyle 매핑(PRIMARY→`ButtonStyle.Primary` 등)은 discord.js enum 의존이라 API publish 서비스 내부 헬퍼로 둔다(shared 는 순수 문자열 enum 만).

---

## 3. 스키마 — 엔티티 2종 + 마이그레이션

### 3.1 `role-panel-config.orm-entity.ts` — `RolePanelConfigOrm`

DB 설계 §31 매핑. 레퍼런스: `sticky-message-config.orm-entity.ts`.

| 컬럼 | 데코레이터 |
|---|---|
| `id` | `@PrimaryGeneratedColumn()` |
| `guildId` | `@Column()` |
| `name` | `@Column()` |
| `channelId` | `@Column({ type:'varchar', nullable:true })` → `string\|null` |
| `messageId` | `@Column({ type:'varchar', nullable:true })` → `string\|null` |
| `embedTitle` | `@Column({ type:'varchar', nullable:true })` |
| `embedDescription` | `@Column({ type:'text', nullable:true })` |
| `embedColor` | `@Column({ type:'varchar', length:7, nullable:true })` |
| `published` | `@Column({ default:false })` |
| `createdAt`/`updatedAt` | `@CreateDateColumn()`/`@UpdateDateColumn()` |
| 관계 | `@OneToMany(() => RolePanelButtonOrm, b => b.panel)` `buttons: RolePanelButtonOrm[]` |

- `@Entity({ name:'role_panel_config', schema:'public' })`
- `@Index('IDX_role_panel_config_guild', ['guildId'])`

### 3.2 `role-panel-button.orm-entity.ts` — `RolePanelButtonOrm`

DB 설계 §32 매핑. 레퍼런스: `status-prefix-button.orm-entity.ts`.

| 컬럼 | 데코레이터 |
|---|---|
| `id` | `@PrimaryGeneratedColumn()` |
| `panelId` | `@Column()` |
| `panel` | `@ManyToOne(() => RolePanelConfigOrm, c => c.buttons, { onDelete:'CASCADE' })` |
| `label` | `@Column({ length:80 })` |
| `emoji` | `@Column({ type:'varchar', nullable:true })` |
| `roleId` | `@Column()` |
| `mode` | `@Column({ type:'enum', enum: RolePanelButtonMode })` (shared enum 사용) |
| `style` | `@Column({ type:'enum', enum: RolePanelButtonStyle, default: RolePanelButtonStyle.PRIMARY })` |
| `sortOrder` | `@Column({ default:0 })` |
| `createdAt`/`updatedAt` | `@CreateDateColumn()`/`@UpdateDateColumn()` |

- `@Entity({ name:'role_panel_button', schema:'public' })`
- `@Index('IDX_role_panel_button_panel_sort', ['panelId','sortOrder'])`

> ⚠️ TypeORM enum 컬럼이 shared enum 을 참조할 때 generate 되는 enum 타입명이 `role_panel_button_mode_enum` 과 일치하는지 확인. 불일치 시 `enumName: 'role_panel_button_mode_enum'` 옵션 명시.

### 3.3 마이그레이션 — `1777400000000-AddRolePanel.ts`

DB 설계 `AddRolePanel1777400000000` 의 up/down DDL 을 **그대로** 따른다. implementer 절차:

1. 엔티티 2종 작성 + `role-panel.module.ts` 의 `TypeOrmModule.forFeature([RolePanelConfigOrm, RolePanelButtonOrm])` 등록 완료.
2. `pnpm --filter @onyu/api migration:generate` (또는 프로젝트 generate 스크립트) 로 초안 생성.
3. 생성된 DDL 을 DB 설계 §`AddRolePanel` up/down 과 **diff 검증** — enum 타입명·인덱스명·FK명·`varchar(7)`·`varchar(80)`·`ON DELETE CASCADE` 일치 확인. 불일치 시 DB 설계 DDL 기준으로 수정.
4. 클래스명 `AddRolePanel1777400000000`, 타임스탬프 `1777400000000` (기존 최신 `1777300000000` 보다 큼) 확인.
5. `migration:run` 으로 적용 + `migration:revert` 1회로 down 검증 후 재적용.

> 🔒 신규 테이블 CREATE 전용 — 파괴적 변경 없음. HITL 대상 아님(DROP/DELETE 없음). 단 마이그레이션 실행은 implementer Phase 4 수행.

---

## 4. 비즈니스 로직 (application)

### 4.1 `role-panel-role-validator.ts` — 역할 검증 (단위테스트 1순위) 🔒

저장(POST 1.3 / PUT 1.4) 시 호출. fail-closed 최종 방어선.

입력: `roleIds: string[]`, `roles: APIRole[]`(fetchGuildRoles), `botTopPosition: number`, `guildId: string`.
출력: 위반 시 throw — 위반 종류별 응답 코드 구분.

| # | 차단 대상 | 검증 | 응답 |
|---|---|---|---|
| 1 | 위계 높음 | 대상 `role.position` ≥ `botTopPosition` | **400** (BadRequest) |
| 2 | managed/integration | `role.managed === true` 또는 `role.tags` 존재 | **400** |
| 3 | @everyone | `role.id === guildId` | **400** |
| 4 | ADMINISTRATOR | `BigInt(role.permissions) & DISCORD_ADMINISTRATOR_BIT !== 0n` | **403** (Forbidden) |
| 5 | 역할 미존재 | roleId 가 `roles` 에 없음 | **400** (부여 불가 역할) |

- 응답 코드: 1·2·3·5 → `BadRequestException`, 4 → `ForbiddenException`.
- 🟨 **다중 위반 우선순위**: ADMINISTRATOR(403) 우선 (endpoint-spec §4.1 권장). validator 는 각 roleId 평가 후 ADMINISTRATOR 위반이 하나라도 있으면 403 먼저.
- `botTopPosition` 산출은 §0.3 방식(fetchGuildMember + fetchGuildRoles).

**단위테스트 포인트** (`role-panel-role-validator.spec.ts`):
- 정상 역할 → 통과
- 봇보다 높은 역할 → 400
- managed(`managed:true`)·tags 보유 → 400
- `role.id === guildId`(@everyone) → 400
- ADMINISTRATOR 비트 보유 → 403
- 미존재 roleId → 400
- 위계높음 + ADMINISTRATOR 동시 → 403 우선
- 봇 멤버 roles 비어있음(position 0 fallback) 경계값

### 4.2 `role-panel-publish.service.ts` — 게시/동기화

- `buildPayload(config, buttons)`: EmbedBuilder(title/description/color) + ActionRow(버튼). `customId = buildRolePanelCustomId(panelId, button.id)`. style 매핑(PRIMARY→`ButtonStyle.Primary` 등). 25개 초과 시 `BadRequestException`. (레퍼런스: `status-prefix-config.service.ts buildActionRows`.)
- `publish(guildId, panelId)`: config+buttons 조회 → `channelId` 필수 검증(없으면 400) → 기존 `messageId` 있으면 `editMessage` 시도, 실패(Unknown Message)면 신규 `sendMessage` 폴백 → 신규 `messageId`·`published=true` UPDATE → Redis 무효화. (UC-01 Phase 3 / UC-02 AF-01.)
- `resyncOnUpdate(...)`: PUT 후 `published===true` 시 동기화. **채널 변경 감지** 시 기존 채널 메시지 `deleteMessage` → 새 채널 `sendMessage` → messageId 갱신.
- Discord 권한 부족(Send Messages 없음) → 봇 미참여가 아닌 API 직접 호출이므로 `DiscordAPIError` 캐치하여 **503**(`ServiceUnavailableException`) 매핑. Unknown Channel → 적절한 4xx/5xx (🟨 구현 시 매핑 — endpoint-spec 1.6).

### 4.3 `role-panel-config.service.ts` — CRUD

- `getConfigs(guildId)`: Redis `role_panel:config:{guildId}` 우선 → 미스 시 repository(JOIN buttons, sortOrder ASC) → 캐시 set(TTL 1h) → `RolePanelDto[]` 매핑.
- `getConfig(guildId, panelId)`: repository 단건 + **guildId 소유 검증**(불일치 → 404).
- `createConfig(guildId, dto)`: roleValidator 호출 → 트랜잭션 INSERT(config published=false + buttons) → Redis del → `RolePanelDto`.
- `updateConfig(guildId, panelId, dto)`: 소유 검증 → roleValidator → 트랜잭션(config UPDATE + buttons DELETE→INSERT 전체교체) → Redis del → `published===true` 면 publishService.resyncOnUpdate → 최신 dto.
- `deleteConfig(guildId, panelId)`: 소유 조회 → `messageId` 있으면 discordAdapter.deleteMessage(**실패 무시**) → config DELETE(buttons CASCADE) → Redis del → `{ ok:true }`.
- 버튼 0개/25개 초과는 DTO 검증(`@ArrayMinSize(1)`/`@ArrayMaxSize(25)`)에서 1차 차단, 서비스는 신뢰.
- `channelName`/`roleName` 부착: 🟨 1차는 생략 가능(null). 부착 시 `fetchGuildChannels`/`fetchGuildRoles` 매핑 — 비용 고려해 GET 목록(1.1)에서만 선택 적용.

### 4.4 `role-panel-bot.service.ts` — 봇 폴백 (read-only)

- `getConfigForBot(guildId)`: repository JOIN 조회 → `BotRolePanelConfigDto[]` 매핑(버튼 클릭 처리 최소 필드: `panelId`, `buttons[{buttonId, roleId, mode}]`). 캐시는 봇이 관리하므로 여기선 DB 직접 조회만.

### 4.5 `role-panel-config.repository.ts` — 영속

레퍼런스: `sticky-message-config.repository.ts`. 단, 버튼 replace 가 있으므로 **트랜잭션 필요** → `DataSource`/`QueryRunner` 또는 `repository.manager.transaction` 사용(레퍼런스: status-prefix upsert 가 버튼 전체 삭제 후 재삽입하는 패턴 확인하여 모방).

- `findByGuildId(guildId)`: config + buttons(relations) ORDER BY sortOrder.
- `findByIdAndGuild(panelId, guildId)`: 단건 + buttons. (소유 검증용)
- `createWithButtons(guildId, dto)` / `replaceButtons(panelId, dto)`: 트랜잭션.
- `updateMessageId(panelId, messageId, published)`.
- `deleteById(panelId)`.

### 4.6 `role-panel-redis.repository.ts` / `role-panel-cache.keys.ts`

레퍼런스: `sticky-message-redis.repository.ts` + `sticky-message-cache.keys.ts`.
- `RolePanelKeys.config(guildId) => role_panel:config:${guildId}`.
- `getConfig`/`setConfig`(TTL 3600)/`deleteConfig`.
- **락 키는 두지 않음** (봇 로컬). `lock(...)` 키 헬퍼 미작성.

---

## 5. Entrypoint (presentation) — 웹 API `role-panel.controller.ts`

`@Controller('api/guilds/:guildId/role-panel')` + `@UseGuards(JwtAuthGuard)`. `GuildMembershipGuard` 는 `app.module.ts` L81 전역 `APP_GUARD` → **재선언 불필요**. 레퍼런스: `sticky-message.controller.ts`.

| # | 핸들러 | 메서드/경로 | HttpCode | 비고 |
|---|---|---|---|---|
| 1.1 | `getPanels` | `GET /` | 200 | 캐시우선 목록 |
| 1.7 | `getAssignableRoles` | `GET /assignable-roles` | 200 | **라우트 순서: `:panelId` 보다 위에 선언**(고정 경로 우선) |
| 1.2 | `getPanel` | `GET /:panelId` (ParseIntPipe) | 200 | 404 소유검증 |
| 1.3 | `createPanel` | `POST /` | **201** | 🟨 sticky/status 는 POST 200 사용 — role-panel 은 리소스 생성이라 201 권장. implementer 가 팀 컨벤션 확인(§9) |
| 1.4 | `updatePanel` | `PUT /:panelId` | 200 | 동기화·503 가능 |
| 1.5 | `deletePanel` | `DELETE /:panelId` | 200 | `{ ok:true }` |
| 1.6 | `publishPanel` | `POST /:panelId/publish` | 200 | channelId 필수, 503 가능 |

- **라우트 순서 주의**: `GET /assignable-roles` 를 `GET /:panelId` 앞에 선언하지 않으면 `assignable-roles` 가 `:panelId`(ParseIntPipe)로 잡혀 400. NestJS 는 선언 순서로 매칭하므로 컨트롤러 메서드 순서를 1.1 → 1.7 → 1.2 → ... 로 배치.
- Swagger: `@ApiTags('role-panel')` + 각 핸들러 `@ApiOperation`/`@ApiResponse`(타입은 `role-panel-response.dto.ts`). 레퍼런스 도메인의 Swagger 데코 사용 여부 확인 후 일치(기존 controller 가 Swagger 데코를 안 쓰면 동일하게 최소화 — §9).
- Throttle: 웹 컨트롤러는 전역 `HttpThrottlerGuard`(app.module L80) 적용 — 별도 데코 불필요.

---

## 6. Entrypoint (bot-api) — `bot-role-panel.controller.ts`

`@SkipThrottle()` + `@Controller('bot-api/role-panel')` + `@UseGuards(BotApiAuthGuard)`. 레퍼런스: `bot-status-prefix.controller.ts`.

| # | 핸들러 | 메서드/경로 | 응답 |
|---|---|---|---|
| 2.1 | `getConfig` | `GET /config?guildId=` | `{ ok: true, data: BotRolePanelConfigDto[] }` (bot-sticky-message 컨벤션) |

- `@Query('guildId') guildId: string` (필수). 누락 시 빈 결과 또는 400(구현 시 결정 — 기존 bot 컨트롤러 패턴 확인).
- 2.2 messageId 콜백 엔드포인트 **미생성** (게시는 API 동기 주도 — §0.2).

---

## 7. DTO

### 7.1 `create-role-panel.dto.ts` — `CreateRolePanelDto` + `RolePanelButtonInputDto`

endpoint-spec §3 매핑. `class-validator` 사용. enum 은 shared `RolePanelButtonMode`/`RolePanelButtonStyle` import.

`CreateRolePanelDto`:
- `name` `@IsString() @IsNotEmpty()`
- `channelId` `@IsOptional() @IsString()` → `string|null`
- `embedTitle`/`embedDescription` `@IsOptional() @IsString()`
- `embedColor` `@IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/)`
- `buttons` `@IsArray() @ArrayMinSize(1) @ArrayMaxSize(25) @ValidateNested({ each:true }) @Type(() => RolePanelButtonInputDto)`

`RolePanelButtonInputDto`:
- `label` `@IsString() @IsNotEmpty() @MaxLength(80)`
- `emoji` `@IsOptional() @IsString()`
- `roleId` `@IsString() @IsNotEmpty()`
- `mode` `@IsEnum(RolePanelButtonMode)`
- `style` `@IsEnum(RolePanelButtonStyle)`
- `sortOrder` `@IsInt() @Min(0)`

### 7.2 `update-role-panel.dto.ts` — `UpdateRolePanelDto`

= `CreateRolePanelDto` shape. `class UpdateRolePanelDto extends CreateRolePanelDto {}` 또는 동일 재사용.

### 7.3 `role-panel-response.dto.ts` — 응답 타입 (Swagger 표현)

- `RolePanelDto`: `id, name, channelId, channelName?, messageId, embedTitle, embedDescription, embedColor, published, buttons: RolePanelButtonDto[], createdAt, updatedAt`
- `RolePanelButtonDto`: `id, label, emoji, roleId, roleName?, mode, style, sortOrder`
- `AssignableRoleDto`: `id, name, color(number), position, assignable(boolean), disabledReason: RolePanelDisabledReason|null`
- `BotRolePanelConfigDto`(2.1 응답): `panelId, buttons:{buttonId, roleId, mode}[]` — bot-api-client `types.ts` 와 **동일 shape 유지**.

---

## 8. 모듈 등록 + bot-api-client SDK + app.module

### 8.1 `role-panel.module.ts`

레퍼런스: `sticky-message.module.ts`.
```
imports: [ TypeOrmModule.forFeature([RolePanelConfigOrm, RolePanelButtonOrm]), AuthModule ]
controllers: [ RolePanelController, BotRolePanelController ]
providers: [ RolePanelConfigRepository, RolePanelRedisRepository, RolePanelDiscordAdapter,
             RolePanelRoleValidator, RolePanelConfigService, RolePanelPublishService, RolePanelBotService ]
exports: [ RolePanelConfigService, RolePanelBotService ]
```
- `DiscordRestService`/`RedisService` 가 글로벌 모듈인지 확인. 글로벌이 아니면 `imports` 에 해당 모듈 추가(레퍼런스 sticky/status 가 어떻게 주입받는지 확인 — `RedisService`·`DiscordRestService` 제공 모듈 import 패턴 따름).
- `BotRolePanelController` 를 별도 bot-api 모듈에 등록하는지 vs role-panel.module 에 등록하는지 확인: 기존 `BotStatusPrefixController` 가 어느 모듈 controllers 에 등록됐는지 확인하여 동일 위치에 등록(보통 도메인 모듈 또는 BotApiModule). **implementer 확인 항목**.

### 8.2 `app.module.ts` — `RolePanelModule` 등록

`imports` 배열에 `RolePanelModule` 추가(L64~65 부근 StatusPrefixModule/StickyMessageModule 옆). 가드/throttle 전역 등록은 기존 그대로 — 추가 작업 없음.

### 8.3 `libs/bot-api-client` — SDK 메서드 추가

- `types.ts`: `BotRolePanelConfigDto` 인터페이스 추가(`panelId:number; buttons:{ buttonId:number; roleId:string; mode:'GRANT'|'TOGGLE' }[]`).
- `bot-api-client.service.ts`: `// ── Role Panel ──` 섹션 추가 +
  ```ts
  async getRolePanelConfig(guildId: string): Promise<BotApiResponse<BotRolePanelConfigDto[]>> {
    return this.get(`/bot-api/role-panel/config?guildId=${guildId}`);
  }
  ```
- (역할 부여/회수 `addRole`/`removeRole` 는 **이미 존재** — 봇 plan 이 봇 로컬 discord.js 로 처리하므로 API SDK 변경 불필요.)

---

## 9. 미해결/합의 필요 + 가정 마커

| # | 항목 | 상태 | 처리 |
|---|---|---|---|
| 1 | 버튼 클릭 실행 위치 | ✅ **결정**: 봇 로컬(§0.1) | 봇 plan 과 일치 필수. API 는 위임 엔드포인트 미생성 |
| 2 | 봇 폴백 config 조회 경로 | ✅ **결정**: `GET /bot-api/role-panel/config` 채택(§0.1) | 봇 plan 이 `getRolePanelConfig` 호출 |
| 3 | 게시 Discord 작업 위치 | 🟨 **합의 필요**: 본 plan = API 직접(DiscordRestService). endpoint-spec 2.2 = 봇 게시 서버 | **봇 plan 작성자와 합의.** onyu 실제 코드 패턴(sticky/status API 직접)·통합 계약 근거로 API 직접 채택. 봇 plan 이 게시 HTTP 서버를 만들면 충돌 — 봇은 게시 미관여로 정렬 권장 |
| 4 | POST 1.3 HttpCode 201 vs 200 | 🟨 가정 | implementer 가 팀 컨벤션 확인(기존 도메인은 POST 200). 1차 201 권장 |
| 5 | Swagger 데코 사용 범위 | 🟨 가정 | 레퍼런스 컨트롤러가 Swagger 데코를 쓰는지 확인 후 일치 |
| 6 | channelName/roleName 부착 | 🟨 가정 | 1차 null 허용. 부착 시 fetch 매핑 |
| 7 | 다중 역할 위반 우선순위 | 🟨 가정 | ADMINISTRATOR(403) 우선 |
| 8 | BotRolePanelController 등록 모듈 | 🟨 확인 | 기존 BotStatusPrefixController 등록 위치 모방 |
| 9 | 봇 최상위 position 산출 | ✅ 정정(§0.3) | `fetchGuild` 아닌 `fetchGuildMember`+`fetchGuildRoles` |

🔴 **결정대기(블로킹)**: 항목 3(게시 위치)만 봇 plan 과 cross-app 합의 필요 — 그러나 API plan 자체는 통합 계약 기준으로 확정 가능하므로 **🔴 없음**(본 API plan 단독 진행 가능, 봇 plan 정렬은 §3 권고로 해소).

---

## 10. 구현 순서 (implementer 권장)

1. `libs/shared/src/types/role-panel.ts` + index re-export (다른 모든 코드의 의존성).
2. 엔티티 2종 + `role-panel.module.ts` forFeature.
3. 마이그레이션 generate→diff검증→run (§3.3).
4. repository + redis repo + cache keys + discord adapter.
5. role-validator (+ 단위테스트) → publish service → config service → bot service.
6. DTO 3종.
7. controller(웹) + bot-role-panel controller.
8. `app.module.ts` 모듈 등록.
9. bot-api-client SDK 메서드 + types.
10. `pnpm -r lint` + `pnpm --filter @onyu/api test` + 빌드 통과 확인.

---

## 11. 테스트 포인트 요약

| 레벨 | 대상 | 핵심 |
|---|---|---|
| 단위 | `role-panel-role-validator.spec.ts` | §4.1 8케이스 (1순위) |
| 단위 | `role-panel-publish.service.spec.ts` | 25개초과 400, edit→send 폴백, 채널변경 삭제후전송, 503 매핑 |
| 단위 | `role-panel-config.service.spec.ts` | 소유검증 404, 캐시 무효화 호출, published 시 동기화 트리거 |
| 단위 | shared `parseRolePanelCustomId`/`buildRolePanelCustomId` | 라운드트립 + 형식 불일치 null |
| 통합(선택) | repository 트랜잭션 버튼 replace | 레퍼런스 `*.repository.integration-spec.ts` 패턴 |

---

## manifest 갱신 필요

**변경 종류**: (c) 신규 도메인 추가 — `role-panel` 가 `feature-manifest.json` 에 미등재일 경우. 이미 등재돼 있고 status 만 `not-started`면 (a)+(b).

> implementer Phase 0 에서 `docs/specs/feature-manifest.json` 의 `domains.role-panel` 존재 여부를 먼저 확인할 것. 아래는 **본 API plan 범위(api/sharedTypes/migrations/tests)** 만 기재 — bot/web 경로는 각 plan 이 보완.

### (c) 신규 도메인 추가 시 — `domains.role-panel`
- `description`: 관리자가 Discord 채널에 Embed+버튼 패널을 게시하고 버튼 클릭으로 역할을 부여/회수하는 범용 역할 패널 도메인
- `prd`: `docs/specs/prd/role-panel.md`
- `userflow`: `docs/specs/userflow/role-panel.md`
- `usecases`: `docs/usecases/role-panel/` (UC-01~05)
- `database`: `docs/specs/database/_index.md#31-rolepanelconfig-role_panel_config` (§31·§32 + `AddRolePanel1777400000000`)
- `endpointSpec`: `docs/specs/endpoint-spec/role-panel.md`
- `status`: `not-started` → (구현 완료 후) `implemented`

### (b) `code.*` 경로 신설 — 본 API plan 산출 경로
- `code.api`: `apps/api/src/role-panel` **+** `apps/api/src/bot-api/role-panel`
  > 🟨 매니페스트 `code.api` 가 단일 문자열이면 `apps/api/src/role-panel` 를 대표 경로로, bot-api 경로는 비고. 배열 허용이면 두 경로 모두 등재.
- `code.sharedTypes`: `libs/shared/src/types/role-panel.ts`
- `code.migrations`: `apps/api/src/migrations/1777400000000-AddRolePanel.ts`
- `code.tests`: `apps/api/src/role-panel/**/*.spec.ts` (validator/publish/config service + shared customId)
- (참고) `libs/bot-api-client/src/bot-api-client.service.ts`·`types.ts` 는 기존 SDK 수정 — 신규 경로 아님(API Contract 영역).

### (a) status 변경
- 본 API plan + bot plan + web plan 전부 구현 완료 시: `domains.role-panel.status` `not-started` → `implemented`. (API 단독 완료로는 `scaffolded` 유지 권장 — bot/web 미완 시.)

> **다른 도메인 영향**: 없음. `app.module.ts`(role-panel 모듈 등록), `libs/shared` index re-export, `libs/bot-api-client`(SDK 메서드 1개 추가)는 본 도메인 도입에 필수인 횡단 변경으로 role-panel 범위 내. 기존 도메인 코드 수정 없음.
