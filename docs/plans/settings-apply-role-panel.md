# 구현 계획 — role-panel 저장/게시 통합 (settings-apply-model)

> 대상 도메인: **role-panel** (settings-apply-model 4개 도메인 중 가장 복잡 — 저장→게시 collapse)
> 입력: PRD `docs/specs/prd/settings-apply-model.md` (§4-3, F-APPLY-004, §7-5) · userflow `docs/specs/userflow/settings-apply-model.md` (UF-006/007/011) · DB `docs/specs/database/_index.md` §role_panel_config — lastAppliedAt · 공통계약 `docs/specs/common-modules.md` Part F (F-0~F-8)
> 작업 워크트리: `e:\Workspace\onyu-settings-apply-unify` (브랜치 `feature/settings-apply-unify`)
> 규모: **L** (API service 통합 + 신규 stamp + 응답 DTO + web 2버튼→1버튼+배지+다시반영 + 다수 기존 테스트 갱신)

---

## 0. 핵심 변경 요약 (3줄)

1. **collapse**: role-panel 의 "저장(persist, published=false)" 과 "게시(publish)" 2단계를 **"저장 = persist + 즉시 게시"** 1단계로 통합. `createConfig`/`updateConfig` 가 channelId 존재 시 항상 Discord 게시/갱신을 수행한다.
2. **stamp**: Discord post/edit 성공 직후(=`updateMessageId` 지점) `role_panel_config.lastAppliedAt = now()` 기록. 응답 DTO 에 `lastAppliedAt` 추가. `published` 컬럼은 유지(파괴적 변경 금지)하되 `lastAppliedAt IS NOT NULL` 일 때 true 로 관리.
3. **재게시**: 기존 `POST .../{panelId}/publish` 엔드포인트를 **"다시 반영"(re-apply) 용도로 유지**(별도 신설 안 함). web 은 "게시" 버튼 제거 → "저장" 1버튼 + `LastAppliedBadge` + `ReApplyButton`(공통, Phase 0 선행 생성분 import).

> **현 코드와의 결정적 차이**: 현재 `createConfig` 는 게시하지 않고 `published=false` 로만 생성하며, `updateConfig` 는 `existing.published === true` 일 때만 resync 한다. collapse 후에는 **저장 시 항상 게시 시도**(channelId 있을 때)로 바뀐다. 이것이 본 작업의 가장 큰 동작 변경이며, 다수 기존 테스트(아래 §6)가 이 가정 위에서 깨진다.

---

## 1. Phase 0 선행 의존 (본 plan 범위 밖 — 다른 owner)

본 plan 은 아래 Phase 0 산출물이 **이미 머지된 develop/feature 브랜치**를 전제로 한다 (common-modules Part F-7). role-panel plan 은 이 파일들을 **생성하지 않고 import/전제만** 한다.

| Phase 0 항목 | 파일 | role-panel plan 의 사용 |
|---|---|---|
| DB 마이그레이션 (4테이블 단일) | `apps/api/src/migrations/1777600000000-SettingsApplyLastAppliedAtInit.ts` | `role_panel_config.lastAppliedAt` 컬럼이 이미 추가됐다는 전제. **본 plan 은 마이그레이션을 만들지 않음.** |
| ORM 엔티티 컬럼 추가 | (Phase 0 owner 가 4개 엔티티에 컬럼 추가) | **단, role-panel 엔티티 컬럼은 본 plan 에서 추가**(아래 §2-A 주의 참조) |
| 웹 공통 컴포넌트 2개 | `apps/web/app/components/settings/LastAppliedBadge.tsx`, `ReApplyButton.tsx` + 상대시각 유틸 | page.tsx 에서 **import 만**. |
| i18n 공통 키 | `libs/i18n/locales/{ko,en}/web/settings.json` 의 `settings.common.apply.*` | 배지/버튼/토스트 카피를 참조만. |

> ⚠️ **ORM 엔티티 컬럼 추가 owner 명확화 필요 (dispatch 단계 결정)**: common-modules F-7 은 "Phase 0 단일 마이그레이션 owner 가 4개 엔티티 컬럼을 추가"하는 안과 "각 도메인 plan 이 자기 엔티티 컬럼만 추가"하는 안을 모두 언급한다. 본 plan 은 **role-panel 엔티티(`role-panel-config.orm-entity.ts`)의 `lastAppliedAt` 필드 추가를 본 plan 작업 항목에 포함**(§2-A)한다. 만약 Phase 0 owner 가 이미 추가했다면 해당 항목은 skip. (마이그레이션 SQL 자체는 Phase 0 단일 파일이므로 본 plan 은 절대 마이그레이션을 생성하지 않는다.)

---

## 2. API 변경 (`apps/api/src/role-panel/`)

### 2-A. ORM 엔티티 — `infrastructure/role-panel-config.orm-entity.ts`

`updatedAt` 컬럼 아래에 추가 (DB 문서 §role_panel_config 와 일치):

```typescript
@Column({ type: 'timestamptz', nullable: true })
lastAppliedAt: Date | null;
```

- nullable, 기본 NULL(미반영). DB 설계 문서 그대로 — **재설계 금지**.
- ⚠️ Phase 0 owner 가 이미 추가했다면 이 항목 skip (충돌 회피).

### 2-B. Repository — `infrastructure/role-panel-config.repository.ts`

`updateMessageId(panelId, messageId, isPublished)` 가 messageId·published 만 갱신한다. **collapse 핵심: messageId 저장과 lastAppliedAt stamp 를 동일 지점에서 처리** (Part F-1 "messageId 저장과 lastAppliedAt stamp 는 동일 트랜잭션 또는 직후 연속").

권장: `updateMessageId` 시그니처를 확장하여 stamp 까지 한 번에 처리.

```typescript
// 변경 전
async updateMessageId(panelId: number, messageId: string, isPublished: boolean): Promise<void> {
  await this.configRepo.update({ id: panelId }, { messageId, published: isPublished });
}

// 변경 후 — Discord 게시 성공 직후 호출. lastAppliedAt 을 같은 UPDATE 에서 stamp.
async updateMessageId(panelId: number, messageId: string, isPublished: boolean): Promise<void> {
  await this.configRepo.update(
    { id: panelId },
    { messageId, published: isPublished, lastAppliedAt: new Date() },
  );
}
```

- 이유: `updateMessageId` 는 **Discord 전송 성공 직후에만** 호출되는 단일 지점(`publish()`, `resyncOnUpdate()` 양쪽)이다 → stamp 의 정확한 트리거(Part F-1 "messageId 갱신 지점")와 정확히 일치. 추가 메서드/추가 UPDATE 없이 1줄로 stamp 가 보장됨.
- `published=true` 와 `lastAppliedAt=now()` 가 항상 함께 set 되므로 "`lastAppliedAt IS NOT NULL` ⇒ `published=true`" 불변식(PRD §4-3)이 자동 충족.
- ⚠️ `updateMessageId` 가 호출되지 않는 경로(Discord 실패, channelId NULL 차단)에서는 stamp 안 됨 → Part F-1 "stamp 안 함" 규약과 일치(자동 보장).

### 2-C. Publish Service — `application/role-panel-publish.service.ts`

**변경 거의 없음**(stamp 가 repository 의 `updateMessageId` 로 흡수됐으므로). 확인 사항만:

- `publish()` 의 `await this.configRepo.updateMessageId(panelId, newMessageId, true)` → 자동으로 stamp 됨. 변경 불필요.
- `resyncOnUpdate()` 의 `await this.configRepo.updateMessageId(panelId, newMessageId, true)` → 자동 stamp. 변경 불필요.
- `publish()` 가 마지막에 `findByIdAndGuild` 로 재조회하여 반환 → 재조회 결과에 `lastAppliedAt` 포함됨(엔티티에 컬럼 추가했으므로 자동). 변경 불필요.

> 결론: publish.service.ts 는 **소스 변경 0 또는 최소**. stamp 를 repository 1줄로 흡수한 설계 덕분.

### 2-D. Config Service — `application/role-panel-config.service.ts` (collapse 핵심)

#### 2-D-1. `createConfig` — 저장 시 즉시 게시 통합

현재: `createWithButtons`(published=false) → Redis 무효화 → 게시 안 함.
변경: 생성 후 **channelId 가 있으면 즉시 publish 시도** (UF-006).

```typescript
async createConfig(guildId: string, dto: CreateRolePanelDto): Promise<RolePanelDto> {
  await this.validateRoles(guildId, dto.buttons.map((b) => b.roleId));

  const config = await this.configRepo.createWithButtons(guildId, dto);
  await this.redisRepo.deleteConfig(guildId);

  // collapse: 채널이 선택돼 있으면 저장 즉시 게시 (UF-006).
  // channelId 가 없으면 게시 불가 → 게시 생략(미반영 상태로 저장만).
  if (config.channelId) {
    const published = await this.publishService.publish(guildId, config.id);
    return this.toDto(published);
  }
  return this.toDto(config);
}
```

- **채널 미선택 처리 결정 (PRD §7-5 / UF-006 엣지)**: PRD §7-5 는 "채널이 선택되지 않은 경우 저장 시 유효성 검증 오류를 반환"하라고 명시한다. 그러나 web 클라이언트 검증(`validatePanel`)은 현재 채널 필수를 강제하지 않고(이름/버튼만 검증), 채널 필수는 **게시 시점**(`validationChannelRequiredToPublish`)에만 적용됐다.
  - **본 plan 채택안**: 서버에서 채널 미선택 시 **저장은 허용하되 게시는 생략**(미반영=NULL 유지). 이유: (a) 기존 createConfig 가 channelId nullable 을 허용, (b) "저장만 하고 나중에 채널 선택" UX 를 막지 않음, (c) collapse 의도는 "채널 있으면 저장=게시"이지 "채널 없으면 저장 자체 차단"이 아님(배지가 "미반영" 표기로 이를 드러냄).
  - 🟡 **PRD §7-5 와의 차이 주의**: PRD 는 "채널 미선택 시 유효성 오류"를 권한다. 본 plan 은 "저장 허용 + 게시 생략 + 미반영 배지"로 완화 해석. **dispatch/리뷰 시 확정 필요**(아래 §8 미확정 항목). 만약 PRD 엄격 적용이면 web `validatePanel` 에 채널 필수 추가 + 서버 400 으로 변경.

#### 2-D-2. `updateConfig` — 항상 재동기화

현재: `existing.published === true` 일 때만 `resyncOnUpdate`.
변경: collapse 후 "저장=게시"이므로 **channelId 가 있으면 published 여부와 무관하게 항상 게시/갱신**.

```typescript
async updateConfig(guildId, panelId, dto): Promise<RolePanelDto> {
  const existing = await this.configRepo.findByIdAndGuild(panelId, guildId);
  if (!existing) throw new NotFoundException(...);

  await this.validateRoles(guildId, dto.buttons.map((b) => b.roleId));

  const oldChannelId = existing.channelId;
  const oldMessageId = existing.messageId;

  await this.configRepo.updateWithButtons(panelId, dto);
  await this.redisRepo.deleteConfig(guildId);

  // collapse: 채널이 있으면 published 여부와 무관하게 항상 Discord 동기화 (UF-007).
  // dto 의 channelId 가 갱신된 뒤이므로, 갱신 후 config 의 channelId 로 판단.
  const afterUpdate = await this.configRepo.findByIdAndGuild(panelId, guildId);
  if (afterUpdate?.channelId) {
    try {
      await this.publishService.resyncOnUpdate({ guildId, panelId, oldChannelId, oldMessageId });
    } catch (err) {
      this.logger.error(`[ROLE_PANEL] resyncOnUpdate failed: guild=${guildId} panel=${panelId}`, ...);
      throw err;
    }
  }

  const updated = await this.configRepo.findByIdAndGuild(panelId, guildId);
  if (!updated) throw new NotFoundException(...);
  return this.toDto(updated);
}
```

- ⚠️ **resyncOnUpdate 동작 확인**: `resyncOnUpdate` 는 `config.channelId` 가 없으면 early return 한다(기존 코드 line 119). 또한 채널 변경(`isChannelChanged`)·신규 messageId 분기를 이미 처리한다. collapse 에서 신규(미게시) 패널 수정도 channelId 만 있으면 신규 전송됨(messageId NULL → `sendToDiscord`). 즉 **resyncOnUpdate 가 신규 전송 폴백을 이미 커버**하므로 update 경로는 publish() 대신 resyncOnUpdate() 유지로 충분.
- 조회 2회(`afterUpdate` + 최종 `updated`)가 중복으로 보일 수 있으나, `updateWithButtons` 가 갱신된 config 를 반환하므로 그 반환값으로 channelId 판단하여 1회 절감 가능. 구현자가 `updateWithButtons` 반환값 활용 여부 결정(미세 최적화, 동작 동일).

#### 2-D-3. `publishConfig` — "다시 반영"(re-apply) 용도로 유지

- 변경 없음. 기존 `publishConfig` → `publishService.publish()` → 응답에 `lastAppliedAt` 포함(엔티티 컬럼 + toDto 필드 추가로 자동).
- 이 메서드가 곧 UF-011 "다시 반영" 의 백엔드. 엔드포인트(`POST .../{panelId}/publish`)는 그대로 두고 web 이 "다시 반영" 버튼에서 호출.

#### 2-D-4. `toDto` — 응답에 lastAppliedAt 추가

```typescript
private toDto(config: RolePanelConfigOrm): RolePanelDto {
  return {
    ...,
    published: config.published,
    lastAppliedAt: config.lastAppliedAt,   // ← 추가
    buttons: [...],
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}
```

### 2-E. Response DTO — `presentation/role-panel-response.dto.ts`

`RolePanelDto` 에 필드 추가 (Part F-2.1 — `published` 인접 위치):

```typescript
export class RolePanelDto {
  ...
  published: boolean;
  lastAppliedAt: Date | null;   // ← 추가 (ISO 직렬화 → string | null)
  buttons: RolePanelButtonDto[];
  ...
}
```

- ⚠️ `BotRolePanelConfigDto`(봇 폴백용)에는 **추가하지 않음**(Part F-2.2 — 봇은 lastAppliedAt 미소비). 봇 SDK·`libs/bot-api-client`·`libs/shared` 미변경.

### 2-F. Controller — `presentation/role-panel.controller.ts`

- **엔드포인트 before/after**:

| 엔드포인트 | before | after |
|---|---|---|
| `POST /api/guilds/:guildId/role-panel` (생성) | persist only (published=false) | persist **+ 즉시 게시**(channelId 있으면) + stamp |
| `PUT /api/guilds/:guildId/role-panel/:panelId` (수정) | persist + published=true 일 때만 resync | persist **+ 항상 재동기화**(channelId 있으면) + stamp |
| `POST /api/guilds/:guildId/role-panel/:panelId/publish` | 게시(별도 액션) | **"다시 반영"(re-apply) 용도로 유지** — deprecated 안 함 |
| `DELETE .../:panelId` | 삭제 | 변경 없음 |
| `GET .../`, `GET .../:panelId` | 목록/단건 | 변경 없음 (응답에 lastAppliedAt 자동 포함) |

- **컨트롤러 코드 변경 없음** (collapse 는 service 내부에서 처리, 시그니처 동일). 인가 가드(`@UseGuards(JwtAuthGuard, GuildMembershipGuard)`) **유지** — 변경 없음(Part F-0/F-3/F-8).
- 🟡 선택: `publish` 핸들러/JSDoc 의 "게시" 표현을 "다시 반영"으로 주석만 갱신 가능(동작 불변, 선택사항).

#### published 컬럼 처리 방침 (PRD §4-3 / DB §role_panel_config / F-4)

| 항목 | 방침 |
|---|---|
| 컬럼 제거 | **금지**(destructive). 유지. |
| 의미 정리 | collapse 후 "저장=항상 게시"이므로 채널 있는 패널은 저장 직후 published=true 가 된다. 채널 미선택 저장(본 plan 완화안) 시에만 published=false 잔존. |
| 불변식 | `lastAppliedAt IS NOT NULL` ⇔ `published=true` (둘이 `updateMessageId` 에서 항상 함께 set → 자동 보장). |
| deprecated 시점 | **이번 1차에서 deprecate 하지 않음**. 하위호환·기존 redis 캐시·봇 폴백 DTO 영향 최소화 위해 유지. 향후 PR 에서 `lastAppliedAt IS NOT NULL` 로 완전 대체 검토. |
| 봇 영향 | 봇 인터랙션은 published 를 읽지 않음(아래 §3) → published 의미 변경이 봇에 영향 없음. |

---

## 3. Bot 변경 (`apps/bot/src/event/role-panel/`) — 영향 없음

- 봇의 role-panel 코드는 **버튼 인터랙션 핸들러**(`bot-role-panel-interaction.handler.ts` / `.service.ts`)로, 사용자가 패널 버튼 클릭 시 역할 부여/회수만 수행한다.
- 봇은 메시지 게시를 하지 않는다(게시는 API `RolePanelDiscordAdapter` 가 수행 — Part F-0). 봇은 캐시 미스 시 `GET /bot-api/role-panel/config` 로 버튼→역할 매핑만 조회(`BotRolePanelConfigDto`).
- `lastAppliedAt`/`published` 어느 것도 봇이 소비하지 않음 → **봇 코드 변경 0**. `libs/bot-api-client` 미변경(Part F-2.2).

---

## 4. Web 변경 (`apps/web/app/settings/guild/[guildId]/role-panel/`)

### 4-A. api-client — `apps/web/app/lib/role-panel-api.ts`

- `RolePanelConfig` 인터페이스에 `lastAppliedAt: string | null` 추가(Part F-2.2 — web 타입 1필드 추가, shared 미사용).
- `publishRolePanel()` 함수 **유지**(이름은 그대로 두거나 `reApplyRolePanel` 별칭 추가 가능 — 동작/엔드포인트 동일 `POST .../{panelId}/publish`). 본 plan 권장: **함수 유지 + JSDoc 을 "다시 반영"으로 갱신**(테스트 영향 최소).

### 4-B. page.tsx — 2버튼 → 1버튼 + 배지 + 다시반영

| 변경 | 상세 |
|---|---|
| import | `LastAppliedBadge`, `ReApplyButton` (Phase 0 공통 컴포넌트) 추가. `publishRolePanel` 은 "다시 반영" 호출용으로 유지. |
| `PanelForm` 타입(`types.ts`) | `lastAppliedAt: string \| null` 필드 추가. 로드 시 `cfg.lastAppliedAt` 매핑. |
| `TabState`(`types.ts`) | `isPublishing`/`publishSuccess`/`publishError` → **"다시 반영" 상태로 재해석**(이름 유지 가능) 또는 `isReApplying`/`reApplyError` 로 개명. 권장: 기존 필드 유지하되 의미 = re-apply (변경면 최소화). |
| **"게시" 버튼 제거** | 액션 바의 두 번째 버튼(`rolePanel.publish`) 삭제. |
| **"저장" 버튼 단일화** | 저장 버튼만 남김. 저장 = persist+게시(서버에서 통합) 이므로 web 은 `handleSave` 만 호출. |
| `handlePublish` 제거/전환 | 기존 `handlePublish`(저장 후 publish 2단계)를 삭제. 대신 **`handleReApply`** 신설 — `ReApplyButton` 의 `onReApply` 로 연결, 내부에서 `publishRolePanel(guildId, panelId)` 호출(설정 변경 없이 현재 저장본 재게시, UF-011). |
| `handleSave` 갱신 | 저장 성공 응답의 `saved.lastAppliedAt` 을 탭 상태에 반영(배지 즉시 갱신, Part F-2.1). 기존 `published`/`messageId` 매핑 옆에 `lastAppliedAt` 추가. |
| `LastAppliedBadge` 배치 | 패널 편집 영역 **상단**(UF-001 step7 / PRD §4-3) — 탭 전환 시 해당 패널 `lastAppliedAt` 으로 갱신. `variant='applied'`. |
| `ReApplyButton` 배치 | 액션 바(저장 버튼 인근). `disabled` = 패널이 아직 저장된 적 없을 때(`currentTab.id === undefined`) — UF-004/011 "저장된 적 없으면 비활성". `lastAppliedAt=null` 이어도 id 있으면 활성(저장본 있으면 재게시 가능). |
| 토스트 정리 | `saveSuccess`(저장 성공) 유지. `publishSuccess`/`publishError` → re-apply 성공/실패 토스트로 전환(`settings.common.apply.reApplySuccess`/`reApplyError` 공통 키 사용). 기존 `rolePanel.publishSuccess`/`publishError` 도메인 키는 미사용 → §5 i18n 정리. |

> 신규 패널 최초 저장(UF-006): channelId 선택 + 저장 1클릭 → 서버가 persist+신규전송+stamp → 응답 `lastAppliedAt` 으로 배지 "방금 전" 갱신. web 은 별도 publish 호출 불필요.

### 4-C. types.ts — `apps/web/app/settings/guild/[guildId]/role-panel/types.ts`

- `PanelForm` 에 `lastAppliedAt: string | null` 추가. `EMPTY_PANEL` 에 `lastAppliedAt: null` 추가.
- `TabState` 의 publish 관련 필드 처리(위 4-B — 유지/개명 택1, dispatch 시 확정).

---

## 5. i18n 변경 (`libs/i18n/locales/{ko,en}/web/settings.json`)

> 공통 키 `settings.common.apply.*` 는 **Phase 0 선행 추가분**을 참조만 한다(생성 금지, Part F-6).

도메인 네임스페이스(`settings.rolePanel.*`)에서 본 plan 이 수정:

| 키 | 처리 |
|---|---|
| `rolePanel.publish` / `publishing` / `publishSuccess` / `publishError` | "게시" 버튼 제거로 **미사용화**. 삭제하지 말고(타 참조 없음 확인 후) 남기거나, 깔끔히 제거. 권장: 미사용 키 제거(ko/en 동시). 단, 기존 테스트가 이 키 텍스트를 assert 하면(§6) 테스트 갱신과 동기화. |
| `rolePanel.validationChannelRequiredToPublish` | 본 plan 완화안(채널 미선택 저장 허용)이면 미사용 → 제거 가능. PRD 엄격안 채택 시 `validationChannelRequired`(저장 차단)로 의미 전환. dispatch 확정 사항(§8). |
| 신규 도메인 키 | 필요 시 `rolePanel.lastApplied*` 등은 두지 않고 **공통 키 사용**(F-6 원칙). 도메인 고유 카피 없음. |

- ko/en **동시 수정** 강제(Part F-6). 자기 도메인 키 블록만 최소 수정(JSON merge 충돌 회피, F-7).

---

## 6. 깨질 기존 테스트 목록 + 갱신 방침

collapse(저장=항상 게시) + stamp + 2버튼→1버튼 으로 다음 테스트가 깨진다. **"갱신 필요 테스트"** 로 분류.

### 6-A. API 단위 테스트

| 파일 | 깨지는 케이스 | 갱신 방침 |
|---|---|---|
| `apps/api/src/role-panel/application/role-panel-config.service.spec.ts` | `createConfig` 가 `createWithButtons` 만 호출하고 `published=false` 기대(line 238/241) | channelId 있는 dto 면 `publishService.publish` 호출 + published=true 기대로 변경. channelId 없는 dto 면 게시 생략 케이스 추가. |
| 〃 | `updateConfig published=false 면 resyncOnUpdate 호출 안 함`(line 296~306) | **반전** — channelId 있으면 published 무관 resync 호출됨으로 변경. |
| 〃 | `updateConfig published=true 면 resyncOnUpdate 호출`(line 310~) | 유지(여전히 호출). 단 판단 기준이 published→channelId 로 바뀜에 맞춰 setup 조정. |
| 〃 | `publishConfig 위임`(line 404~) | 유지(re-apply 경로). 응답에 lastAppliedAt 포함 검증 추가 권장. |
| `apps/api/src/role-panel/application/role-panel-publish.service.spec.ts` | `updateMessageId` 호출 검증(인자 수 변화 없음) — stamp 는 repo 내부라 publish.service 레벨 영향 적음 | 대체로 유지. `updateMessageId` mock 호출 인자 동일하면 무수정. |
| `apps/api/src/role-panel/application/role-panel-bot.service.spec.ts` | published/lastAppliedAt 무관(봇 폴백 DTO) | 영향 없음(확인만). |

> repository 단위 테스트는 별도 spec 미발견. `updateMessageId` 가 lastAppliedAt 도 set 하므로, repo 직접 테스트가 생기면 stamp 검증 추가.

### 6-B. API e2e — `apps/api/test/role-panel.e2e-spec.ts`

| 깨지는 케이스 | 갱신 방침 |
|---|---|
| `POST /role-panel — 생성 시 published=false`(line 457, 474, 494) | collapse: channelId 포함 생성 시 **published=true + messageId + lastAppliedAt 기록 + Discord sendMessage 호출**로 기대 변경. channelId 없는 생성은 published=false 유지 케이스로 분리. |
| `PUT /role-panel/:panelId — 수정 시 DB 반영`(line 547) | channelId 있으면 Discord edit/send + lastAppliedAt 갱신 기대 추가. |
| `POST .../publish — 게시 시 200 + sendMessage + published=true`(line 590~621) | **유지**(re-apply 경로) + 응답에 lastAppliedAt 포함 검증 추가. |
| `POST .../publish — channelId 없으면 400`(line 624) | 유지(re-apply 도 channelId 필수). |
| `DELETE published 패널 삭제 시 deleteMessage`(line 671~) | 게시 setup 이 `publish` 대신 채널 포함 create 로도 가능 — setup 단순화 가능(선택). 동작 검증은 유지. |
| 인증 401 테스트(line 419~441) | 변경 없음(가드 동일). |
| `PUT 역할 재검증 400`(line 804~) | 유지. |

> 주석 헤더(line 5 "POST 생성 → ... → POST publish → DELETE")의 생애주기 설명도 collapse 반영해 갱신.

### 6-C. Web 단위 테스트

| 파일 | 깨지는 케이스 | 갱신 방침 |
|---|---|---|
| `apps/web/app/settings/guild/[guildId]/role-panel/__tests__/RolePanelPage.test.tsx` | `게시 — 채널 미선택 차단`(line 160~), `게시 성공`(line 211~), `rolePanel.publish`/`publishSuccess` 텍스트 assert(line 165/244/248) | "게시" 버튼 제거에 맞춰 **삭제 또는 재작성**. 저장 1버튼 + 배지 + 다시반영 시나리오로 대체. `mockPublishRolePanel` 은 "다시 반영" 버튼 클릭 케이스로 전환. |
| `apps/web/app/settings/guild/[guildId]/role-panel/__tests__/RolePanelPage.supplement.test.tsx` | publish 관련 31건 매치 | 위와 동일 — 다시반영/배지/저장통합으로 재작성. |
| `apps/web/app/lib/__tests__/role-panel-api.test.ts` | `publishRolePanel` describe(line 222~) — 엔드포인트 `/publish` 호출 검증 | **유지**(엔드포인트 불변). 응답 `lastAppliedAt` 필드 포함 케이스 추가. `RolePanelConfig` 타입에 lastAppliedAt 추가 반영. |
| `ButtonCardGrid.*`, `ButtonEditModal`, `ModeSelector`, `PreviewPanel.*`, `RolePicker`, `StyleSelector` 테스트 | publish 무관(버튼/프리뷰 UI) | 영향 없음(확인만). |

### 6-D. 신규 테스트 (추가 권장)

| 대상 | 신규 테스트 |
|---|---|
| API service | `createConfig`: channelId 있음 → publish 호출 + published=true; channelId 없음 → publish 생략. `updateConfig`: channelId 있으면 published 무관 resync. |
| API repository | `updateMessageId` 가 `lastAppliedAt` 을 set 하는지(stamp 검증). |
| API e2e | 저장 1콜 → DB `lastAppliedAt NOT NULL` + Discord sendMessage 호출(AC-01/AC-02). re-apply(`/publish`) → lastAppliedAt 갱신(AC-05). Discord 실패 시 lastAppliedAt 미갱신(AC-06). |
| Web page | 저장 성공 시 배지 "마지막 반영" 렌더(공통 컴포넌트 mock). 다시반영 버튼: id 없으면 disabled, 있으면 클릭 → `publishRolePanel` 호출 + 배지 갱신. 게시 버튼 부재 확인. |
| Web api-client | `RolePanelConfig.lastAppliedAt` 직렬화 round-trip. |

> 공통 컴포넌트(`LastAppliedBadge`/`ReApplyButton`) 자체 단위 테스트는 **Phase 0 owner** 소관(본 plan 범위 밖).

---

## 7. 작업 순서 (role-panel 도메인 내부)

1. **(전제)** Phase 0 머지 확인: 마이그레이션 + 공통 컴포넌트 2개 + i18n 공통 키.
2. API: 엔티티 컬럼(§2-A, 미추가 시) → repository `updateMessageId` stamp(§2-B) → service `createConfig`/`updateConfig` collapse(§2-D) → DTO `lastAppliedAt`(§2-E) + `toDto`.
3. API 테스트 갱신/추가(§6-A, §6-B, §6-D).
4. Web: api-client 타입(§4-A) → types.ts(§4-C) → page.tsx 2버튼→1버튼+배지+다시반영(§4-B).
5. i18n 도메인 키 정리(§5).
6. Web 테스트 갱신/추가(§6-C, §6-D).
7. 검증: `pnpm --filter @onyu/api test` · `pnpm --filter @onyu/api test:e2e`(있으면) · `pnpm --filter @onyu/web test` · `pnpm -r typecheck`(별도) · `pnpm -r lint`.

> onyu 함정 체크: 마이그레이션은 `apps/api/src/migrations/`(Phase 0 단일, 본 plan 미생성). typecheck 별도 실행. 봇 Discord.js — 본 plan 봇 무변경. 인가 `JwtAuthGuard + GuildMembershipGuard` 유지(@Roles/SuperAdminGuard 아님). 봇→API 수기계약(`libs/bot-api-client`) 미변경.

---

## 8. 미확정 / 결정 필요 항목 (🔴 HITL 아님 — 구현 결정 사항)

> Part F-8 / PRD §사용자확인: 본 작업은 **법무/결제/권한/DB파괴적 4분야 모두 해당 없음 → 🔴 미결 HITL 결정 없음**. 인가는 기존 가드 유지(권한 변경 아님). 아래는 구현 단계에서 plan/리뷰가 확정할 사항.

| # | 결정 사항 | 옵션 | 본 plan 권장 |
|---|---|---|---|
| D-1 | 채널 미선택 저장 처리 (PRD §7-5 vs 완화) | (a) PRD 엄격: 채널 없으면 저장 400 차단 / (b) 완화: 저장 허용+게시 생략+"미반영" 배지 | **(b) 완화** — UX 유연. 단 PRD §7-5 문구와 차이 있어 리뷰 확정 필요. |
| D-2 | `publishRolePanel` 함수/엔드포인트 명 | (a) `/publish` 유지 + JSDoc만 갱신 / (b) `/re-apply` 신설 + publish deprecate | **(a) 유지** — 테스트·봇·계약 영향 최소(F-3/F-4 권고). |
| D-3 | `TabState` publish 필드 처리 | (a) 이름 유지(의미=re-apply) / (b) `isReApplying` 등 개명 | (b) 개명이 가독성 좋으나 (a) 가 변경면 최소. dispatch 시 택1. |
| D-4 | 미사용 i18n 키(`rolePanel.publish*`) | 삭제 / 잔존 | 삭제(ko/en 동시) — 테스트 갱신과 동기화. |

---

## manifest 갱신 필요

- **변경 종류**: (a) status 변경만 — **해당 없음**(role-panel 이미 `implemented`로 가정) / (b) `code.*` 경로 신설 — **해당 없음**(모든 변경이 기존 `code.api`/`code.web` 경로 내부) / (c) 신규 도메인 추가 — **해당 없음** / (d) **변경 없음** ✅

- **manifest 갱신 필요 — 없음.**
  - 근거: 본 plan 의 모든 코드 변경은 settings-apply-model 영향 도메인(role-panel)의 **기존** 경로 내부에서 이뤄진다 — `apps/api/src/role-panel/**`, `apps/api/src/bot-api/role-panel/`(미변경), `apps/bot/src/event/role-panel/`(미변경), `apps/web/app/settings/guild/[guildId]/role-panel/**`, `apps/web/app/lib/role-panel-api.ts`, `apps/api/src/migrations/`(Phase 0 단일). 신규 디렉토리·신규 `code.*` 키·신규 도메인 없음.
  - 신규 파일이 생기는 곳은 `apps/web/app/components/settings/`(공통 컴포넌트)이나, 이는 **Phase 0 선행 작업 owner** 소관이며 settings-apply-model 의 web 공통 자원 — 도메인별 manifest `code.web` 갱신 대상 아님(필요 시 Phase 0 owner plan 에서 처리).

### 다른 도메인 영향

- **없음.** role-panel collapse 는 role-panel 도메인 단독. 공유 파일(`libs/bot-api-client`, `libs/shared`, 사이드바)을 건드리지 않음(Part F-2.2 / G). Phase 0 공유 자원(마이그레이션/공통 컴포넌트/i18n 공통 키)은 **선행 단독 작업**으로 분리되어 본 plan 은 import/전제만 한다.
