# Role Panel — 웹 대시보드 구현 계획 (apps/web)

> 도메인: **role-panel** (신규) · 앱: **apps/web** (Next.js 16 App Router)
> 입력: `docs/specs/prd/role-panel.md` · `docs/specs/userflow/role-panel.md` (UF-001~005) · `docs/specs/endpoint-spec/role-panel.md` (웹 API 1.1~1.7)
> UI 골격 레퍼런스: `apps/web/app/settings/guild/[guildId]/auto-channel/` ("버튼 빌더" 화면 — 복제·각색 대상)
> 작성일: 2026-06-19
>
> **마커**: 🔒 결정완료 민감영역(권한·정책 — 2026-06-19 사용자 확정) / 🟨 가정(구현 시 확정) / 🔴 결정대기.
> **🔴 결정대기: 없음** (권한 정책·통합 계약 모두 확정).

---

## 0. 범위 / 비범위

### 범위 (이 계획)
- `apps/web/app/settings/guild/[guildId]/role-panel/` 신규 디렉토리 — 패널 설정 페이지(`page.tsx`) + 컴포넌트 + 테스트.
- API 호출 클라이언트 `apps/web/app/lib/role-panel-api.ts` 신규.
- 설정 사이드바(`SettingsSidebar.tsx`) memberManagement 그룹에 메뉴 항목 1개 추가 — **예외적 편집 대상**.
- i18n 로케일(`libs/i18n/locales/{ko,en}/web/`) `common.json` `settings.rolePanel` + `settings.json` `rolePanel.*` 키 추가 — **예외적 편집 대상**.
- feature-manifest.json `role-panel` 도메인 신규 등재 — **§"manifest 갱신 필요" 참조** (Phase 7).

### 비범위 (다른 계획 / 다른 도메인 영향)
- `apps/api/src/role-panel/` BE 엔드포인트 구현 → **별도 계획 `role-panel-api.md`** (endpoint-spec 1.1~1.7 + assignable-roles). 본 웹 계획은 이 API를 **소비만** 한다.
- `apps/bot/src/event/role-panel/` 봇 인터랙션 핸들러 → **별도 계획 `role-panel-bot.md`**.
- `libs/shared/src/types/role-panel.ts` 공유 enum/타입 → BE 계획에서 정의(웹은 로컬 `types.ts`에 동일 리터럴 유니온 사용; 공유 타입 확정 후 import 전환은 후속). 🟨
- EXCLUSIVE(택1) 모드, 드래그 순서 변경 라이브러리 도입은 MVP 비범위 (순서는 위/아래 화살표로 처리).

> **다른 도메인 영향 플래그**: 본 웹 페이지는 API 엔드포인트 1.1~1.7이 존재해야 동작한다. 웹 구현은 API mock 기반으로 선행 가능하나, E2E 통합은 `role-panel-api.md` 완료에 의존.

---

## 1. 통합 계약 (api/bot/web 일치 — 확정)

| 항목 | 값 |
|---|---|
| 웹 경로 | `apps/web/app/settings/guild/[guildId]/role-panel/` (page.tsx + components/ + __tests__/) |
| 라우트 가드 | `settings/guild/[guildId]/layout.tsx` **상속** — 운영진/슈퍼관리자 게이트 + 비운영 길드 read-only. 신규 가드 작성 불필요 |
| 사이드바 항목 | memberManagement 그룹에 1개 추가. href `/settings/guild/${selectedGuildId}/role-panel`, label `t('settings.rolePanel')`, 아이콘 `Ticket` (lucide) 🟨 |
| i18n | `common.json`에 `settings.rolePanel`(사이드바 라벨), `settings.json`에 `rolePanel.*`(페이지 내부 라벨) |
| 호출 엔드포인트 | 1.1 목록 GET / 1.2 단건 GET / 1.3 생성 POST / 1.4 수정 PUT / 1.5 삭제 DELETE / 1.6 게시 POST publish / 1.7 assignable-roles GET |
| 역할 선택 UI | 1.7 `assignable-roles` 메타로 `assignable=false` 역할 **비활성 + 사유 표기**. 저장 시 API 400/403을 폼 에러로 표시 (fail-closed 2중 방어) |
| customId | 웹은 customId 미생성 (봇 책임). 웹은 panelId/buttonId만 다룸 |

---

## 2. 화면 구성 (PRD F-WEB-ROLE-PANEL-001 + UF-001~005)

auto-channel "select 모드" 화면의 **패널 빌더 골격을 거의 그대로 복제**한다. 단, role-panel은 단일 흐름이므로 ModeSelector(instant/select 토글)는 제거하고, STEP 구성을 role-panel 의미로 각색한다.

```
역할 패널 설정 페이지 (/settings/guild/[guildId]/role-panel)
├── 헤더: 제목 + "역할 새로고침" 버튼 (auto-channel refreshChannels 패턴 → 채널+역할 새로고침)
├── 패널 탭 바  (auto-channel 탭 바 그대로 — 다중 패널, [새 패널 +], 탭별 삭제 X)
│
└── 활성 패널 편집 영역
    ├── STEP 1 — 기본정보  (StepSection step=1, hasConnector)
    │     ├── 패널 이름 (내부 식별용 text input)
    │     └── 대상 채널 선택 (textChannels 드롭다운; 미선택 저장 허용, 게시 시 필수)
    │
    ├── STEP 2 — 메시지(Embed) 설정  (StepSection step=2, hasConnector)
    │     ├── Embed 제목 (text)
    │     ├── Embed 설명 (textarea, 멀티라인, GuildEmojiPicker 삽입)
    │     ├── Embed 색상 (color picker + HEX input, #RRGGBB)
    │     └── PreviewPanel (Embed + 버튼 실시간 미리보기)
    │
    ├── STEP 3 — 버튼 목록  (StepSection step=3)
    │     ├── 버튼 개수 표시 + 25/행당5 가드 안내
    │     └── ButtonCardGrid (버튼 카드 + [버튼 추가])
    │           └── 카드: 이모지 + 라벨 + 매핑 역할명 + 모드 뱃지(GRANT/TOGGLE) + 스타일 색 + 위/아래 순서 화살표
    │
    ├── 저장/게시 액션 바
    │     ├── 저장 버튼 (DB 저장만, published 미변경)  → POST(신규)/PUT(수정)
    │     └── 게시 버튼 (저장 후 Discord 전송/동기화) → POST .../publish
    │     └── 성공/에러 메시지 영역 (saveError / publishError / 403·400 표시)
    │
    └── ButtonEditModal (버튼 추가/편집 모달)
          ├── 라벨 (text, MaxLength 80) *
          ├── 이모지 (text + GuildEmojiPicker)
          ├── RolePicker (신규 — assignable-roles 기반, 비활성+사유)  *
          ├── ModeSelector (GRANT / TOGGLE 2택) *
          └── StyleSelector (PRIMARY/SECONDARY/SUCCESS/DANGER)
```

> **빈 상태**: 패널 0개면 빈 탭 1개(`EMPTY_PANEL`)로 시작 (auto-channel `EMPTY_CONFIG` 패턴).
> **selectedGuildId 없음 / 로딩**: auto-channel과 동일 placeholder/Loader2 처리.
> **비운영 길드 슈퍼관리자(read-only)**: UF-001 — `/auth/me`의 `isSuperAdmin && !isMember` 판단은 layout이 이미 수행하나, 페이지는 mutation 응답 403을 폼 에러로 표시(읽기 안내 배너는 🟨 선택 — layout이 페이지 진입은 허용하므로 페이지 레벨 read-only 배너 추가 권장).

---

## 3. 컴포넌트 분해 (auto-channel 매핑)

| 신규 파일 | 레퍼런스(복제 원본) | 역할 / 각색 포인트 |
|---|---|---|
| `page.tsx` | `auto-channel/page.tsx` | 탭 상태/저장 로직 골격 복제. ModeSelector(instant/select) 제거. 저장=POST/PUT 분기, 게시=publish 추가. `fetchGuildChannels` + `fetchAssignableRoles` 동시 로드 |
| `types.ts` | `auto-channel/types.ts` | `PanelForm`/`ButtonForm`/`TabState`/`EMPTY_PANEL`/`EMPTY_BUTTON` + 상수(`MAX_BUTTONS=25`, `MAX_BUTTONS_PER_ROW=5`, `MAX_LABEL_LEN=80`) |
| `components/ButtonCardGrid.tsx` | `auto-channel/.../ButtonCardGrid.tsx` | 버튼 목록 그리드. 카드 내용 각색: 카테고리명 → **역할명 + 모드 뱃지 + 스타일 색 점**. 위/아래 순서 화살표 추가 🟨. 25개 도달 시 [추가] 숨김 |
| `components/ButtonEditModal.tsx` | `auto-channel/.../ButtonEditModal.tsx` | 버튼 편집 모달. subOptions 영역 제거. 추가: RolePicker / ModeSelector / StyleSelector. 라벨 MaxLength 80 |
| `components/ModeSelector.tsx` | `auto-channel/.../ModeSelector.tsx` | **GRANT / TOGGLE** 2택 카드(아이콘+설명). auto-channel ModeSelector 구조 그대로, 값만 교체 |
| `components/StyleSelector.tsx` | (신규, ModeSelector 변형) | PRIMARY(파랑)/SECONDARY(회색)/SUCCESS(초록)/DANGER(빨강) 4택. 각 스타일 색상 칩 표시 |
| `components/RolePicker.tsx` | **신규** | assignable-roles 기반 역할 선택. `assignable=false` 역할은 `<option disabled>` + 사유 라벨. 🔒 핵심 컴포넌트(§5) |
| `components/PreviewPanel.tsx` | `auto-channel/.../PreviewPanel.tsx` (select 모드 분기) | Embed + 버튼 미리보기. instant 분기 제거. 버튼 스타일 색을 Discord 스타일 색으로 렌더(PRIMARY/SECONDARY/SUCCESS/DANGER) |
| `components/StepSection.tsx` | `auto-channel/.../StepSection.tsx` | **그대로 복제**(범용 step 래퍼) — 변경 없음 |

> **공통 컴포넌트 재사용**: `GuildEmojiPicker`(`apps/web/app/components/`)는 그대로 import. `StepSection`은 도메인 무관하므로 복제(또는 공통화는 후속 리팩터 — 본 계획은 복제 채택, auto-channel 패턴 일치 우선).

---

## 4. 상태관리 / 데이터 패칭 (기존 settings 컨벤션)

기존 settings 페이지는 **로컬 컴포넌트 상태 + 직접 fetch**를 쓴다 (전역 store 없음 — Workspace Map State 미확정). role-panel도 동일하게 간다.

### 4.1 패칭 패턴
- **목록 로드**: auto-channel처럼 `useEffect`에서 `selectedGuildId` 변화 시 `Promise.all([fetchPanels, fetchGuildChannels, fetchAssignableRoles, fetchGuildEmojis])` 동시 로드.
- **읽기 전용 조회**는 `apiGet`(실패 시 fallback `[]`) 사용 — UI 깨짐 방지(`lib/api-client.ts` 컨벤션).
- **mutation**(저장/게시/삭제)은 `apiClient`(실패 시 `ApiError` throw) 사용 → `try/catch`로 폼 에러 표시. auto-channel은 raw `fetch`를 쓰지만, **role-panel은 `lib/role-panel-api.ts` + `apiClient` 래퍼 채택**(sticky-message-api.ts 패턴 — 에러 메시지/status 일관 처리, 403/400 분기 용이).

### 4.2 신규 `apps/web/app/lib/role-panel-api.ts`
sticky-message-api.ts 패턴. 타입 + 함수:
```
타입: RolePanelConfig, RolePanelButton, AssignableRole(=AssignableRoleDto), RolePanelSaveDto
함수:
  fetchRolePanels(guildId)                  → apiGet GET 1.1
  fetchAssignableRoles(guildId, refresh?)   → apiGet GET 1.7
  createRolePanel(guildId, dto)             → apiClient POST 1.3
  updateRolePanel(guildId, panelId, dto)    → apiClient PUT 1.4
  deleteRolePanel(guildId, panelId)         → apiClient DELETE 1.5
  publishRolePanel(guildId, panelId)        → apiClient POST 1.6 publish
```
> 응답 `AssignableRoleDto`: `{ id, name, color, position, assignable, disabledReason }` (endpoint-spec §3 그대로). 🔒 `disabledReason ∈ 'HIGHER_THAN_BOT'|'MANAGED'|'EVERYONE'|'ADMINISTRATOR'|null`.

### 4.3 탭/패널 상태 (auto-channel 그대로)
- `tabs: PanelForm[]`, `activeTabIndex`, `tabStates: Map<number, TabState>`(탭별 isSaving/saveSuccess/saveError/publishError).
- `updateCurrentTab(partial)`, `getTabState/setTabState` 헬퍼 복제.
- 신규 패널 저장 성공 시 응답 `id`를 탭에 주입(auto-channel `data.configId` → role-panel `data.id`).
- **published 패널 수정 후 재동기화**(UF-004): PUT 응답에 `published===true`면 메시지 자동 edit는 **API가 수행**(endpoint-spec 1.4 동작) — 웹은 PUT 한 번으로 충분, 별도 publish 재호출 불필요. UI는 PUT 응답의 최신 `messageId`/`published`로 탭 갱신.

---

## 5. 🔒 RolePicker — 역할 선택 비활성 로직 (확정 정책 §권한)

PRD 권한정책 1·2 + endpoint-spec §4.1 + 통합 계약 반영. **2중 방어선**: UI 비활성(UX) + API 재검증(fail-closed 최종 방어).

### 5.1 데이터 소스
- `GET /api/guilds/:guildId/role-panel/assignable-roles` (1.7) → `AssignableRoleDto[]`.
- `assignable=false`인 역할 = 매핑 불가. `disabledReason`으로 사유 분기.

### 5.2 렌더링 규칙
| disabledReason | 의미 | UI |
|---|---|---|
| `HIGHER_THAN_BOT` | 봇 최상위 역할보다 위계 높음 | 비활성 + "봇 역할보다 높아 부여 불가" 사유 |
| `MANAGED` | 봇/연동 managed 역할 | 비활성 + "연동 역할은 매핑 불가" 사유 |
| `EVERYONE` | @everyone | 비활성 + "@everyone은 매핑 불가" 사유 (또는 목록에서 제외 🟨) |
| `ADMINISTRATOR` | 관리자 권한 보유 역할 | 🔒 비활성 + "관리자 권한 역할은 매핑할 수 없습니다" 사유 |
| `null` (assignable) | 매핑 가능 | 정상 선택 가능 |

- `<select>` 채택 시: `<option disabled>역할명 (사유)</option>`. 단 `<option>`은 툴팁 표기가 제한적이므로, **버튼형 역할 목록 + 비활성 행에 사유 텍스트 표시**를 권장 🟨 (RolePicker 자체 구현). MVP 1차는 disabled `<option>` + 별도 사유 안내 줄로 충분.
- 이미 매핑된 역할이 이후 부여불가로 바뀐 경우(역할 위계 변경 등): 현재 선택값이 `assignable=false`면 **경고 표시 + 저장 시 API가 차단**.

### 5.3 저장 시 API 에러 → 폼 에러 매핑 (fail-closed)
UI 비활성을 우회한 요청(또는 stale 데이터)은 API가 차단한다. 응답을 폼 에러로 표시:
| 응답 | 사유 | 웹 처리 |
|---|---|---|
| 400 | 부여불가 역할(위계/managed/@everyone) 매핑, 버튼 0/25초과, DTO 검증 | `ApiError.message`를 saveError로 표시 |
| 403 | 🔒 ADMINISTRATOR 역할 매핑 / 비운영 슈퍼관리자 mutation | 차단 사유 표시 + read-only 안내 |
| 503 | (게시) 봇 채널 권한 부족 | publishError 토스트 — "봇이 채널 전송 권한 없음" |

---

## 6. Discord 버튼 제약 — UI 가드

| 제약 | 출처 | UI 가드 |
|---|---|---|
| 메시지당 최대 25버튼 | PRD F-005, endpoint-spec DTO `@ArrayMaxSize(25)` | `MAX_BUTTONS=25`. 25개 도달 시 ButtonCardGrid [버튼 추가] 숨김 + 안내. 저장 전 클라이언트 차단(API도 400) |
| 행당 최대 5버튼 (ActionRow 5×5) | PRD F-005 | `MAX_BUTTONS_PER_ROW=5`. **순수 표시 제약** — 미리보기에서 5개씩 줄바꿈 렌더. 저장 데이터에는 영향 없음(봇이 ActionRow 분할). 25개 이내면 자동으로 5행×5 안에 들어감 🟨 |
| 버튼 0개 저장 금지 | PRD F-002, DTO `@ArrayMinSize(1)` | 저장 전 클라이언트 차단(`buttons.length===0` → saveError). API도 400 |
| 라벨 80자 | endpoint-spec DTO `@MaxLength(80)` 🟨 | RolePicker 모달 라벨 input `maxLength={80}` |
| 게시 시 채널 필수 | endpoint-spec 1.6 | 게시 버튼 클릭 시 `channelId` 없으면 차단 + 안내(저장은 채널 없이 허용) |

---

## 7. 저장/게시 흐름 상세 (UF-002/003/004/005)

| 액션 | 트리거 | 호출 | 성공 처리 | 실패 처리 |
|---|---|---|---|---|
| 저장(신규) | 저장 버튼, `tab.id===undefined` | `createRolePanel` (POST 1.3) | 응답 `id`를 탭 주입, saveSuccess 3초 | saveError 표시(400/403) |
| 저장(수정) | 저장 버튼, `tab.id!==undefined` | `updateRolePanel` (PUT 1.4) | 탭 갱신(messageId/published), saveSuccess | saveError(400/403/404/503) |
| 게시 | 게시 버튼 | (미저장이면 선저장 후) `publishRolePanel` (POST 1.6) | published=true·messageId 반영, "게시되었습니다" 토스트 | publishError(400 채널없음/403/404/503 권한) |
| 삭제 | 탭 X 버튼 | `window.confirm` → `deleteRolePanel` (DELETE 1.5) | 탭 제거(auto-channel handleDeleteTab 패턴) | alert 에러 |

> **게시 전 저장 강제(UF-003 단계2)**: 게시 버튼은 "변경사항 미저장 시 먼저 저장" 흐름. 1차는 **저장→게시 순차 실행**(게시 클릭 시 dirty면 자동 저장 후 publish) 또는 **저장 후에만 게시 활성화** 🟨 — 후자(저장 후 게시 버튼 활성)가 단순. 구현 시 채택 권장.
> **클라이언트 검증 순서**(저장 전): 패널 이름 필수 → 버튼 0개 차단 → 버튼별 라벨/역할 필수 → 25개 초과 차단. auto-channel `validateSelectMode` 패턴 복제.

---

## 8. i18n 키 (libs/i18n/locales/{ko,en}/web/) — 예외적 편집 대상

### 8.1 `common.json` (사이드바 — `useTranslations('common')`)
- `settings.rolePanel` — 사이드바 라벨. ko "역할 패널" / en "Role Panel".

### 8.2 `settings.json` (페이지 내부 — `useTranslations('settings')`)
신규 `rolePanel` 네임스페이스. 기존 `common.*`(save/preview/embedColor/roleSelect/noRoles 등)는 재사용.
- `rolePanel.title`, `rolePanel.stepBasic`, `rolePanel.panelName`, `rolePanel.panelNamePlaceholder`
- `rolePanel.targetChannel`, `rolePanel.targetChannelDesc`
- `rolePanel.stepEmbed`, `rolePanel.embedTitleOptional`, `rolePanel.embedDescOptional`
- `rolePanel.stepButtons`, `rolePanel.buttonCount`(count), `rolePanel.addButtonCard`, `rolePanel.noButtons`
- `rolePanel.buttonLabel`, `rolePanel.buttonEmoji`, `rolePanel.mappedRole`, `rolePanel.mode`, `rolePanel.modeGrant`, `rolePanel.modeGrantDesc`, `rolePanel.modeToggle`, `rolePanel.modeToggleDesc`
- `rolePanel.style`, `rolePanel.stylePrimary/Secondary/Success/Danger`
- `rolePanel.publish`, `rolePanel.publishing`, `rolePanel.publishSuccess`, `rolePanel.publishError`
- 검증: `rolePanel.validationName`, `rolePanel.validationChannelRequiredToPublish`, `rolePanel.validationButtonRequired`, `rolePanel.validationButtonLabel`(index), `rolePanel.validationButtonRole`(index), `rolePanel.validationMaxButtons`(max)
- 🔒 RolePicker 사유: `rolePanel.roleDisabledHigherThanBot`, `roleDisabledManaged`, `roleDisabledEveryone`, `roleDisabledAdministrator`
- read-only: `rolePanel.readOnlyNotice`

> **ko/en 동시 추가 필수** (두 파일 키 동기화). 값 누락 시 next-intl 폴백 깨짐.

---

## 9. 테스트 포인트 (Testing Trophy — Vitest + Testing Library)

`__tests__/` 경로: `apps/web/app/settings/guild/[guildId]/role-panel/__tests__/`.
컨벤션(auto-channel 테스트 일치): `next-intl` mock(키 그대로 반환), `SettingsContext` mock, `lib/discord-api`/`lib/role-panel-api` mock, `global.fetch` mock.

| 파일 | 대상 | 핵심 케이스 |
|---|---|---|
| `RolePicker.test.tsx` | 🔒 비활성 로직(최우선) | (1) `assignable=true` 역할 선택 가능 (2) `disabledReason` 각 값별 비활성 + 사유 텍스트 렌더 (3) ADMINISTRATOR 역할 disabled (4) 현재 선택값이 부여불가로 바뀌면 경고 |
| `ModeSelector.test.tsx` | GRANT/TOGGLE 선택 | 선택 시 onChange 호출, 활성 스타일 토글 |
| `StyleSelector.test.tsx` | 스타일 4택 | 각 스타일 선택 + 색칩 렌더 |
| `ButtonCardGrid.test.tsx` | 버튼 목록/가드 | (1) 카드 역할명·모드 뱃지 렌더 (2) 25개 도달 시 [추가] 숨김 (3) 순서 화살표 onMove |
| `ButtonEditModal.test.tsx` | 버튼 편집 | isOpen 토글, 라벨/역할/모드/스타일 입력 → onSave draft, 라벨 maxLength |
| `PreviewPanel.test.tsx` | 미리보기 | Embed 제목/설명/색 + 버튼 스타일 색 렌더 |
| `RolePanelPage.test.tsx` | 페이지 흐름 | (1) 빈 상태 → 빈 탭1 (2) 저장(POST) 성공 → id 주입·saveSuccess (3) 게시(publish) 성공 토스트 (4) 🔒 **403 처리** — mutation 403 시 saveError 표시·read-only (5) 400(버튼0/25초과) 차단 (6) 게시 시 채널 미선택 차단 |

> **403 처리 검증(통합 계약)**: `global.fetch`가 403 응답하도록 mock → 폼 에러 노출 + 저장 미반영 확인.

---

## 10. 구현 순서 (Phase 4 implementer 가이드)

1. `types.ts` — PanelForm/ButtonForm/상수 정의.
2. `lib/role-panel-api.ts` — 타입 + 6개 함수(apiClient/apiGet).
3. 하위 컴포넌트: `StepSection`(복제) → `ModeSelector` → `StyleSelector` → `RolePicker` → `PreviewPanel` → `ButtonCardGrid` → `ButtonEditModal`.
4. `page.tsx` — auto-channel page 골격 복제 후 각색(ModeSelector instant/select 제거, publish 추가).
5. `SettingsSidebar.tsx` — memberManagement 그룹에 항목 1개 추가(`Ticket` 아이콘 import).
6. i18n `common.json` + `settings.json` (ko/en) 키 추가.
7. `__tests__/` 7개 작성.
8. 검증: `pnpm --filter @onyu/web lint` + `pnpm --filter @onyu/web test` (Vitest).

> **충돌 검토**: 신규 디렉토리(role-panel/)는 기존 코드와 충돌 없음. `SettingsSidebar.tsx`는 배열에 객체 1개 push — 기존 항목 무영향. i18n은 신규 키 추가만(기존 키 무수정). **충돌 위험 없음.**

---

## 11. 가정 / 미정 (🟨)

- 사이드바 아이콘: `Ticket`(lucide) 1차 채택. 대안 `ToggleLeft`/`Hand`.
- 공유 enum(`RolePanelButtonMode/Style`)은 BE 계획에서 `libs/shared`에 정의 예정 → 웹은 1차 로컬 리터럴 유니온, 확정 후 import 전환.
- 게시 응답 shape(`RolePanelDto` vs `{ok,messageId}`)는 endpoint-spec 1.6에서 🟨 — 웹은 두 형태 모두 안전 파싱(messageId/published 추출).
- 순서 변경은 위/아래 화살표(드래그 라이브러리 미도입).
- read-only 배너는 페이지 레벨 선택 추가(layout이 진입 허용하므로 권장).
- 행당 5버튼은 미리보기 표시 제약만(저장 데이터 무영향).

---

## manifest 갱신 필요 (Phase 7)

**변경 종류**: (c) 신규 도메인 추가 + (b) `code.web` 경로 신설 — 본 계획 범위(웹)에 한함.

> ⚠️ role-panel은 api/bot/web 3앱 도메인이다. 본 계획은 **web만** 다루므로, 매니페스트의 `code.api`/`code.bot`/`code.migrations`/`code.tests` 값은 각 BE/봇 계획(`role-panel-api.md`/`role-panel-bot.md`)이 확정한다. implementer는 **본 계획 완료 시 `code.web`만 확정 등재**하고 나머지 키는 해당 계획 완료 후 채운다.

### (c) 신규 도메인 추가 — `domains.role-panel`
```jsonc
"role-panel": {
  "description": "역할 패널 — Discord 채널에 Embed+버튼 패널 게시, 버튼 클릭으로 역할 부여(GRANT)/토글(TOGGLE)",
  "prd": "/docs/specs/prd/role-panel.md",
  "userflow": "/docs/specs/userflow/role-panel.md",
  "usecases": "/docs/usecases/role-panel/",
  "database": "/docs/specs/database/_index.md",   // role_panel_config, role_panel_button
  "code": {
    "api": "apps/api/src/role-panel/",             // ← role-panel-api.md 확정 (본 계획 범위 외)
    "bot": "apps/bot/src/event/role-panel/",       // ← role-panel-bot.md 확정 (본 계획 범위 외)
    "web": "apps/web/app/settings/guild/[guildId]/role-panel/",  // ← 본 계획이 확정
    "migrations": [ /* role-panel-api.md 확정 */ ],
    "tests": [
      "apps/web/app/settings/guild/[guildId]/role-panel/__tests__/**/*.test.tsx"
      /* + api/bot 테스트는 각 계획 확정 */
    ]
  },
  "status": "not-started"   // 웹만 구현 완료 시에도 api/bot 미완이면 not-started 유지 / 부분구현 시 scaffolded
}
```

### (b) `code.web` 경로 신설 (본 계획이 책임지는 확정 항목)
- 도메인 키: `role-panel`
- 신설 키: `code.web` = `apps/web/app/settings/guild/[guildId]/role-panel/`
- 신설 키: `code.tests`(web 분) = `apps/web/app/settings/guild/[guildId]/role-panel/__tests__/**/*.test.tsx`

### 예외적 편집 파일 (manifest 외 — 기록용)
- `apps/web/app/components/SettingsSidebar.tsx` (memberManagement 항목 1개 추가) — 기존 `web` 도메인 소유 파일, 코드 경로 변동 없음.
- `libs/i18n/locales/{ko,en}/web/common.json`, `settings.json` — `web`/`i18n` 영역, 키 추가만.
- `apps/web/app/lib/role-panel-api.ts` — 신규 파일이나 `code.web` glob(디렉토리) 밖. 🟨 매니페스트 `code.web`를 디렉토리 단일값으로 둘지, `lib/role-panel-api.ts`를 별도 등재할지 implementer 판단(sticky-message도 lib 파일을 매니페스트에 별도 등재하지 않음 → **별도 등재 불필요** 권장).
