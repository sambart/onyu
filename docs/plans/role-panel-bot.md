# 구현 계획 — role-panel (봇 / apps/bot)

> 도메인: **role-panel** (신규) · 대상 앱: **apps/bot** 단독
> 입력: PRD `docs/specs/prd/role-panel.md` · usecase `UC-04`(GRANT) / `UC-05`(TOGGLE) · endpoint-spec `docs/specs/endpoint-spec/role-panel.md` §2.1
> 경로 한정: `apps/bot/src/event/role-panel/` + 모듈 등록(`bot-event.module.ts`) + SDK 사용(`@onyu/bot-api-client`)
> 마커: 🔴 결정대기 / 🟨 가정(구현 시 확정) / 🔒 정책 결정완료(상위 문서)

본 계획은 **봇 표면만** 다룬다. 웹(apps/web)·API(apps/api) 표면은 별도 plan(`role-panel-api.md` / `role-panel-web.md`)에서 다루며, 아래 **통합 계약**은 세 plan 이 모두 일치해야 한다.

---

## 0. 사전 조사 결과 (실제 코드 기준 — a/b 결정 근거)

| # | 조사 항목 | 결과 | 근거 파일 |
|---|---|---|---|
| 1 | **봇의 Redis 접근 여부** | ❌ **봇은 Redis 미주입**. `apps/bot/src` 전체에 `ioredis`/`InjectRedis`/`RedisService` 주입 0건. 매칭된 2건은 모두 "Redis 는 API 가 처리한다"는 **주석**(`bot-sticky-message.handler.ts` L8, `common/application/locale-resolver.service.ts` L8) | `apps/bot/src/**` grep |
| 2 | **봇의 로컬 역할 부여 선례** | ✅ 봇이 자체 discord.js client 로 `member.roles.add(roleId)` 를 이미 수행 중(뉴비 역할 부여) | `apps/bot/src/event/newbie/bot-newbie-member-add.handler.ts` L127 |
| 3 | **API 의 역할 부여/회수 REST 능력** | ✅ `DiscordRestService.addMemberRole` / `removeMemberRole` 존재(`Routes.guildMemberRole` PUT/DELETE) | `apps/api/src/discord-rest/discord-rest.service.ts` L347·L351 |
| 4 | **봇→API 역할 위임 SDK** | △ `BotApiClientService.addRole`/`removeRole`(→ `/bot-api/guilds/:g/members/:m/roles/{add,remove}`) 가 **SDK 에는 정의돼 있으나 API 미구현·호출처 0건**(dead code). 위임 채택 시 API 측 엔드포인트 신규 구현 필요 | `libs/bot-api-client/src/bot-api-client.service.ts` L222-232 / API grep 0건 |
| 5 | **봇 인터랙션 핸들러 i18n 사용 여부** | ❌ 기존 인터랙션 핸들러(status-prefix/auto-channel/newbie)는 `@onyu/i18n` 미사용. **한국어 문자열을 핸들러 내부 상수로 하드코딩** | `apps/bot/src/event/**/*-interaction.handler.ts` grep |
| 6 | **봇 패턴(@On/InjectDiscordClient/deferReply)** | ✅ `auto-channel` 핸들러가 `@On('interactionCreate')` + `@InjectDiscordClient` + `deferReply({ ephemeral })` + try/catch → editReply/followUp 패턴 보유. 본 도메인 표준 레퍼런스 | `bot-auto-channel-interaction.handler.ts` |

---

## 1. 🟢 미해결 조율 1건 — 결정: **(a) 봇 로컬 수행** (api·bot plan 동일 선택)

> 질문: 버튼 클릭 시 역할 부여/회수 실행을 **(a) 봇 로컬(discord.js `member.roles.add/remove`)** vs **(b) bot-api 위임(API 가 `DiscordRestService` 로 수행)** 중 무엇으로?

### 결정: **(a) 봇 로컬 수행**

**근거**
1. **usecase 정합** — UC-04/UC-05 시퀀스 다이어그램이 모두 `Bot → Discord REST API: GuildMember.roles.add/remove` 로 **봇이 직접 수행**하도록 명시. (b)는 usecase 흐름과 불일치.
2. **선례 존재** — 봇이 이미 `member.roles.add`(뉴비)를 로컬 수행(조사 #2). 신규 패턴 도입 비용 0.
3. **3초 ack 비용 최소** — (b)는 봇→API HTTP 홉이 1회 추가되어 Discord 3초 제한에 불리. (a)는 Gateway 캐시(`member.roles.cache`)로 보유 여부를 즉시 판정.
4. **(b)는 API 미구현 엔드포인트 신규 작성 필요**(조사 #4) — 봇 plan 범위를 넘는 추가 작업.

### 단, TOGGLE 동시성 락(UC-05) 처리 — **결정 (a-2): 봇 인메모리 락 채택, Redis 락 미사용**

> 문제: UC-05 는 `role_panel:lock:{guildId}:{userId}:{buttonId}` **Redis 분산 락(TTL 3s)** 을 요구하나, **봇은 Redis 미주입**(조사 #1). (a)를 택하면 봇은 Redis 분산 락을 쓸 수 없다.

검토한 3개 안과 결정:

| 안 | 내용 | 채택 |
|---|---|---|
| **a-2 (채택)** | 봇 프로세스 **인메모리 락**(`Map<lockKey, true>` 또는 `Set`, finally 해제 + setTimeout 3s 안전망). 봇은 단일 프로세스(샤딩 없음 가정 🟨)이므로 동일 사용자·동일 버튼 연속 클릭 레이스를 충분히 방지 | ✅ |
| a-3 | 락만 API 에 위임(봇→API 락 획득/해제 HTTP), 역할 수행은 봇 로컬 | ❌ HTTP 2홉(락 획득+해제) 추가 → 3초 ack 위협, 복잡도↑ |
| a-4 | 락 자체를 생략하고 멱등 처리로만 방어 | ❌ TOGGLE 은 멱등이 아님(보유↔미보유 토글) → 연속 클릭 시 상태 반전 레이스 잔존 |

**a-2 채택 단서**:
- 🟨 **봇 단일 프로세스 가정** 검증 필요 — 봇이 discord.js 샤딩/다중 인스턴스로 운영되면 인메모리 락이 무효. Phase 0/3.5 에서 운영 토폴로지 확인. 다중 인스턴스면 a-3(API 위임 락)로 폴백.
- UC-05 의 "Redis 분산 락"은 **단일 프로세스 한정 인메모리 락으로 대체**한다는 점을 봇 plan 에 명시하고 usecase 와의 차이를 implementer 가 인지하도록 한다. (락 키 형식 `{guildId}:{userId}:{buttonId}`, TTL 3s 안전망은 동일하게 유지.)

> **api plan 합의 사항**: API 는 역할 부여/회수를 수행하지 **않는다**(봇 로컬). API 는 (1) §2.1 봇용 config 조회 엔드포인트만 제공. **봇→API 역할 위임 엔드포인트(`roles/add`)는 본 도메인에서 구현하지 않음**(SDK dead code 그대로 둠). → api plan 의 "역할 실행 위임" 항목과 **(a) 동일 선택** 명시 필수.

---

## 2. 통합 계약 (api/bot/web plan 공통 — 봇은 import/consume 만)

| 계약 | 정의 주체 | 봇의 사용 |
|---|---|---|
| `mode` 상수(`GRANT`/`TOGGLE`), `style` 상수 | **api plan** → `libs/shared/src/types/role-panel.ts` | 봇은 **import 만** (직접 정의 금지) |
| customId 형식 `role_panel:{panelId}:{buttonId}` | PRD §customId 규칙 | 봇이 prefix 필터 + 파싱 |
| 봇용 config 조회 `GET /bot-api/role-panel/config?guildId=` → `{ ok, data: BotRolePanelConfigDto[] }` | **api plan**(endpoint-spec §2.1) | 봇은 `@onyu/bot-api-client` 신규 메서드로 호출 |
| `BotRolePanelConfigDto` (`panelId`, `buttons:{buttonId,roleId,mode}[]`) | **api plan** → `libs/bot-api-client/src/types.ts` | 봇이 응답 타입으로 소비 |

> 🟨 **config 조회 캐시 위치**: endpoint-spec §2.1 비고대로 봇은 Redis 미접근이므로 **봇이 Redis `role_panel:config:{guildId}` 를 직접 읽지 못한다**. 따라서 봇의 config 조회는 **항상 `/bot-api/role-panel/config` 경유**(API 가 Redis 캐시 우선 → 미스 시 DB). UC-04 AF-02 의 "Redis 캐시 우선"은 **API 측에서 충족**하고, 봇은 그 결과를 받는다. 봇 로컬에 짧은 인메모리 마이크로 캐시(🟨 선택, TTL 수 초) 추가 여부는 구현 시 결정(3초 ack 여유 충분하면 생략).

---

## 3. 파일별 작업 (경로: `apps/bot/src/event/role-panel/`)

### 3.1 `bot-role-panel-interaction.handler.ts` (신규) — Entrypoint(Bot)

`auto-channel` 핸들러 패턴 준용.

- `@Injectable()` + `@On('interactionCreate')` 핸들러.
- 의존성: `BotApiClientService`(config 조회), `@InjectDiscordClient() Client`(member/roles 접근), `RolePanelInteractionService`(아래 3.2 비즈니스 로직 분리).
- 흐름:
  1. `interaction.isButton()` 아니면 `return`.
  2. `customId.startsWith('role_panel:')` 아니면 `return` (다른 도메인 핸들러와 공존 — 기존 패턴대로 무관 인터랙션 무시).
  3. `interaction.guildId` 없으면 `return` (DM 컨텍스트 차단 — UC-04 EX-06 / UC-05 EX-07). 🟨 무시 vs ephemeral 안내 — 기존 핸들러는 **무시**(return). 동일 채택.
  4. `await interaction.deferReply({ ephemeral: true })` — 3초 ack 확보(UC-04 EX-05 / UC-05 EX-06). 이후 응답은 `editReply`.
  5. customId 파싱(3.3 파서) → 실패 시 `editReply('잘못된 요청입니다.')` (EX-01).
  6. service 위임 → 결과 메시지 `editReply`.
  7. try/catch: 예외 시 `editReply`/`followUp` 폴백(기존 패턴), 로그 `[ROLE_PANEL]` prefix.
- **deferReply 위치 주의**: deferReply 후에는 reply 불가 → 모든 분기를 editReply 로 통일.

### 3.2 `bot-role-panel-interaction.service.ts` (신규) — Business(봇 로컬 로직)

핸들러에서 Discord 응답을 분리해 **순수 처리 로직**을 담는다(테스트 용이성). 입력: `{ guildId, member, panelId, buttonId }`, 출력: `{ status, message }` (응답 문구는 핸들러가 editReply).

- **config 조회**: `apiClient.getRolePanelConfig(guildId)` → `BotRolePanelConfigDto[]` 에서 `panelId`+`buttonId` 매칭하여 `{ roleId, mode }` 도출.
  - 미존재 → `status='NOT_FOUND'` (EX-02: "역할 버튼 설정을 찾을 수 없습니다.").
- **GRANT 모드** (UC-04):
  - `member.roles.cache.has(roleId)` true → API 호출 없이 `status='ALREADY_HAS'` ("이미 해당 역할을 보유하고 있습니다.") — 멱등(AF-01).
  - false → `member.roles.add(roleId)` → `status='GRANTED'` ("역할이 부여되었습니다.").
- **TOGGLE 모드** (UC-05):
  - **인메모리 락 획득**(3.4) — 키 `{guildId}:{userId}:{buttonId}`. 실패 → `status='LOCKED'` ("처리 중입니다. 잠시 후 다시 시도해 주세요." EX-01/F-01).
  - try: `has(roleId)` true → `roles.remove` → `'REMOVED'` ("역할이 제거되었습니다.") / false → `roles.add` → `'GRANTED'`.
  - finally: 락 해제.
- **예외 매핑**(discord.js REST 에러 → status):
  - `Missing Permissions`(50013) / 위계 위반 → `'NO_PERMISSION'` ("역할을 부여할 권한이 없습니다. 서버 관리자에게 문의하세요." EX-03/EX-04).
  - `Unknown Role`(10011) → `'UNKNOWN_ROLE'` ("해당 역할을 찾을 수 없습니다." EX-04/EX-05).
  - 그 외 → 재던짐(핸들러 catch → 일반 오류 응답).
  - 🟨 Discord API 에러 코드 상수 추출(`DiscordAPIError.code`)로 분기 — 정확한 코드 매핑은 구현 시 확정.

### 3.3 `role-panel-custom-id.ts` (신규) — customId 파서 유틸

- `parseRolePanelCustomId(customId: string): { panelId: number; buttonId: number } | null`.
- 형식: `role_panel:{panelId}:{buttonId}` — `split(':')` 길이 3, `Number.isInteger` + `>=0` 검증, NaN/음수/형식불일치 → `null`.
- 🟨 prefix 상수 `ROLE_PANEL_CUSTOM_ID_PREFIX = 'role_panel:'` 를 본 유틸에 정의(핸들러와 공유). **customId 생성**(패널 게시 시 버튼 customId 부여)은 게시 주체(api 또는 봇 게시 핸들러)의 책임 — 본 plan 범위 밖(게시는 endpoint-spec §1.6, MVP 봇 게시 수신측은 별도). 🟨 게시 핸들러가 봇에 있다면 동일 유틸의 `buildRolePanelCustomId(panelId, buttonId)` 도 본 파일에 추가(상위 plan 과 조율).

### 3.4 `role-panel-toggle-lock.ts` (신규) — 인메모리 락 유틸

- `Set<string>` 기반 단순 락. `acquire(key): boolean`(SET-NX 시맨틱) / `release(key)`.
- TTL 안전망: acquire 시 `setTimeout(() => release(key), 3000)` 등록(봇 비정상 흐름 데드락 방지 — UC-05 락 해제 보장 전략과 동일 의도). 정상 경로는 finally 즉시 해제.
- 🟨 다중 인스턴스(샤딩) 운영 시 무효 → 1번 §a-2 단서대로 토폴로지 확인. 단일 프로세스 전제 주석 명시.

### 3.5 `bot-event.module.ts` (수정) — 모듈 등록

- import 추가: `BotRolePanelInteractionHandler`, `RolePanelInteractionService`(있다면).
- `providers` 배열에 두 provider 추가. (이미 `DiscordModule.forFeature()` import 됨 — `@InjectDiscordClient` 사용 가능. `BotApiClientService` 는 상위 `BotApiClientModule` 전역 제공 여부 🟨 확인 — 기존 핸들러들이 주입받으므로 동일하게 가능.)

### 3.6 `@onyu/bot-api-client` config 조회 메서드 — **api plan 소유, 봇 plan 은 사용 전제**

> ⚠️ **다른 도메인(libs/bot-api-client) 영향** — `getRolePanelConfig` 메서드 + `BotRolePanelConfigDto` 타입 추가는 **api plan 이 정의**(통합 계약 §2). 봇 plan 은 `apiClient.getRolePanelConfig(guildId)` 호출만 가정. 만약 api plan 이 이를 누락하면 봇 구현 차단 → Phase 간 의존성으로 명시.

- 예상 시그니처(api plan 확정): `getRolePanelConfig(guildId: string): Promise<BotRolePanelConfigDto[]>` → `GET /bot-api/role-panel/config?guildId=` 의 `{ ok, data }` 중 `data` 반환(기존 `get<T>` 패턴).

### 3.7 i18n / 메시지 문자열 — **하드코딩 채택**(기존 봇 인터랙션 패턴 일치)

- 조사 #5: 봇 인터랙션 핸들러는 `@onyu/i18n` 미사용 → role-panel 도 **한국어 문자열을 핸들러/서비스 상수로 하드코딩**(기존 컨벤션 일관성).
- 🟨 **libs/i18n bot 로케일(ko/en) 신규 작성은 본 MVP 범위에서 제외** — brief 의 "i18n 메시지 키" 요구와 코드 현실(봇 미사용) 충돌. **결정: 기존 패턴(하드코딩) 우선**, 향후 봇 전역 i18n 도입 시 일괄 이관. (만약 봇 i18n 도입을 본 도메인에서 선행하려면 → 🔴 사용자 확인 필요. 1차 권고는 하드코딩.)
- 메시지 상수(핸들러/서비스에 `ROLE_PANEL_MSG` 객체로 모음):
  - `GRANTED` "역할이 부여되었습니다." / `REMOVED` "역할이 제거되었습니다." / `ALREADY_HAS` "이미 해당 역할을 보유하고 있습니다." / `NOT_FOUND` "역할 버튼 설정을 찾을 수 없습니다." / `NO_PERMISSION` "역할을 부여할 권한이 없습니다. 서버 관리자에게 문의하세요." / `UNKNOWN_ROLE` "해당 역할을 찾을 수 없습니다." / `LOCKED` "처리 중입니다. 잠시 후 다시 시도해 주세요." / `INVALID` "잘못된 요청입니다." / `GENERIC_ERROR` "오류가 발생했습니다. 잠시 후 다시 시도하세요."

---

## 4. 단위 테스트 포인트 (`apps/bot` Jest 컨벤션 · `*.spec.ts` co-located)

| 대상 | 테스트 | 케이스 |
|---|---|---|
| `parseRolePanelCustomId` | customId 파싱 | 정상 `role_panel:3:12`→`{3,12}` / prefix 불일치→null / 토큰 수 부족·초과→null / NaN·음수→null (UC-04 EX-01, S-01) |
| service GRANT | 멱등 분기 | 미보유→`roles.add` 호출+`GRANTED` (S-01) / 이미 보유→**add 미호출**+`ALREADY_HAS` (S-02, 멱등 핵심) |
| service TOGGLE | 토글 분기 | 미보유→`add`+`GRANTED` (S-01) / 보유→`remove`+`REMOVED` (S-02) |
| service TOGGLE 락 | 동시성 | 락 점유 중 재호출→`add/remove` 미호출+`LOCKED` (UC-05 F-01) / finally 락 해제 후 재시도 성공 (S-03) / 예외 발생 시에도 락 해제(try-finally) |
| service 예외 매핑 | REST 에러→메시지 | `Missing Permissions`→`NO_PERMISSION` (F-02) / `Unknown Role`→`UNKNOWN_ROLE` (F-03) / config 미존재→`NOT_FOUND` (F-01) |
| handler | 가드/응답 | non-button→무시 / 비 role_panel customId→무시 / `guildId` 없음(DM)→무시(EX-06) / deferReply 후 editReply 경로 / catch→followUp 폴백 |
| 락 유틸 | acquire/release | acquire 첫 성공·재acquire 실패 / release 후 재acquire 성공 / setTimeout 안전망 해제(타이머 mock) |

> mock 전략: `BotApiClientService`(config) / `GuildMember`(`roles.cache.has`, `roles.add`, `roles.remove`) / `ButtonInteraction`(`deferReply`/`editReply`/`followUp`) 를 jest mock — 기존 `newbie-role.service.spec.ts` 패턴 참조(`member.roles.add` mock 검증).

---

## 5. 작업 순서 / 의존성

1. (api plan 선행) `libs/shared` mode/style 상수 + `libs/bot-api-client` `getRolePanelConfig`/`BotRolePanelConfigDto` + `/bot-api/role-panel/config` 엔드포인트. → **봇 plan 은 이 산출물에 의존**(§2, §3.6).
2. `role-panel-custom-id.ts` 파서 + `role-panel-toggle-lock.ts` 락 유틸(독립).
3. `bot-role-panel-interaction.service.ts` 비즈니스 로직.
4. `bot-role-panel-interaction.handler.ts` 핸들러.
5. `bot-event.module.ts` provider 등록.
6. 단위 테스트(§4).
7. `pnpm --filter @onyu/bot lint && pnpm --filter @onyu/bot test`(🟨 패키지명 확인) 통과.

---

## 6. 미해결 / 확인 필요 (🔴 / 🟨)

| 마커 | 항목 | 처리 |
|---|---|---|
| 🟨 | **봇 운영 토폴로지(단일 프로세스 vs 샤딩)** | a-2 인메모리 락의 유효성 전제. 다중 인스턴스면 a-3(API 위임 락)로 폴백. Phase 0/3.5 확인 |
| 🟨 | **봇 i18n vs 하드코딩** | 기존 패턴(하드코딩) 채택 권고. 봇 전역 i18n 선행 도입 원하면 🔴 사용자 확인 |
| 🟨 | 봇 로컬 마이크로 캐시 추가 여부 | 3초 ack 여유 충분 시 생략(API config 조회만) |
| 🟨 | `@onyu/bot-api-client` 메서드 시그니처 | api plan 확정값 따름 |
| 🟨 | 게시 핸들러(customId **생성**) 위치 | 게시는 본 봇 plan 범위 밖 — 상위 plan 과 조율. buildCustomId 필요 시 §3.3 유틸 확장 |
| ✅(해소) | 역할 실행 위임 a/b | **(a) 봇 로컬** 확정 (§1) — api plan 동일 선택 |

> **🔴 결정대기: 0건** (조사로 a/b 해소). 단, 위 🟨 2건(토폴로지·i18n)은 Phase 0/3.5 게이트에서 사용자/운영 정보로 확정 권장.

---

## § manifest 갱신 필요 (Phase 7 implementer 용)

**변경 종류**: (a) status 변경 + (b) `code.*` 경로 신설 — 단, role-panel 도메인 자체는 이미 매니페스트에 존재하므로 **(c) 신규 도메인 추가 아님**. (봇 plan 한정 변경만 기술 — api/web plan 이 동일 도메인의 다른 키를 갱신.)

### (b) `code.*` 경로 신설 — role-panel 도메인

| 도메인 키 | 신설 키 | 절대 경로(신규) |
|---|---|---|
| `domains.role-panel` | `code.bot` | `apps/bot/src/event/role-panel/` (신규 디렉토리: `bot-role-panel-interaction.handler.ts`, `bot-role-panel-interaction.service.ts`, `role-panel-custom-id.ts`, `role-panel-toggle-lock.ts`) |
| `domains.role-panel` | `code.tests` | 봇 단위 테스트: `apps/bot/src/event/role-panel/*.spec.ts` (co-located, 기존 봇 컨벤션) — 🟨 api/web tests 와 키 통합 시 조율 |

> ⚠️ `libs/bot-api-client`(SDK `getRolePanelConfig`)·`libs/shared`(mode/style 상수) 추가는 **api plan 소유** → role-panel 매니페스트의 `code.sharedTypes` / SDK 경로는 **api plan 의 manifest 갱신 §** 에 기재(봇 plan 은 사용만). 봇 plan 에서 중복 기재하지 않음.

### (a) status 변경

| 도메인 키 | 변경 전 → 변경 후 | 조건 |
|---|---|---|
| `domains.role-panel.status` | `not-started` → `scaffolded`(또는 api/web 포함 전체 완료 시 `implemented`) | 🟨 **세 plan(api/bot/web) 통합 완료 시점에 일괄 판정** — 봇 표면 단독 완료로는 `scaffolded` 권고. 최종 status 는 통합 implementer 가 결정(봇만으로 `implemented` 표기 금지) |

> 봇 plan 단독 갱신 대상: `domains.role-panel.code.bot` 신설 + (가능 시) `code.tests` 봇 항목 추가. status 최종값은 api/web 합류 후 확정.
