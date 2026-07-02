# 구현 계획 — 웹 설정 저장/반영 UX 2차 (save-consistency)

> 작성일: 2026-07-02
> 상위 커밋: `dc4c924` "feat: 설정 저장/반영 모델 통일 (1차: 아티팩트 도메인 + 마지막 반영 배지 + 다시 반영)"
> 1차 계획: `docs/plans/settings-apply-auto-channel.md`, `settings-apply-status-prefix.md`, `settings-apply-sticky-message.md`, `settings-apply-role-panel.md`
> 관련 PRD: `docs/specs/prd/settings-apply-model.md` (있는 경우), 도메인별 PRD
> 병렬 계획(별도 owner): `docs/plans/web-ux-shared-infra.md` — **공용 토스트/기간선택/스켈레톤/포맷** 담당. 본 계획은 토스트를 설계하지 않고 "공용 토스트 사용" 으로만 표기한다.
> 작업 대상: `apps/web` 중심. API 변경은 요구 1(auto-channel 다시 반영)에 필요한 **최소 범위**만.

---

## 1. 배경 / 목표

1차 커밋(`dc4c924`)에서 "저장/반영 모델"을 도입했다. 공용 컴포넌트 `LastAppliedBadge`(마지막 반영/저장 배지) + `ReApplyButton`(다시 반영)이 만들어졌고, **디스코드에 편집 가능한 아티팩트 메시지를 게시하는 4개 도메인**(status-prefix / sticky-message / role-panel / auto-channel)에 배지가 적용됐다. 단, auto-channel 은 1차에서 `variant="saved"` 배지만 붙고 **다시 반영 버튼은 제외**됐다.

2차의 목표는 다음 3가지 UX 결함을 해소하는 것이다.

1. **반영 모델 마무리** — auto-channel 에 "다시 반영"을 완성하고, 나머지 설정 도메인이 "다시 반영/배지" 확산 대상인지 아닌지를 **아티팩트 존재 기준으로 확정**(과잉 설계 방지).
2. **미저장 이탈 경고** — 현재 설정 페이지 전반에 dirty 추적/이탈 경고가 **0건**. 편집 후 저장하지 않고 탭 전환·사이드바 이동·새로고침 시 변경분이 조용히 유실된다. 공용 훅 + 네비게이션 개입으로 방어한다.
3. **newbie 저장 통합** — newbie 페이지에 저장 버튼이 **3개**(하단 config 저장 / 미션 템플릿 저장 / 모코 템플릿 저장) 공존하여, 사용자가 하단 "저장"으로 전부 저장됐다고 오인한다. 책임을 명확히 하고 미저장 표시를 붙인다.

### 비목표(설계 원칙)

- **DB 스키마 변경 금지.** 새 컬럼이 필요해 보이는 항목은 "대상 제외 + 사유"로 처리한다(🔴 마커 사용 안 함).
- **신규 외부 의존성 금지.**
- 신규 노출 문자열은 `libs/i18n/locales/{ko,en}/web/settings.json`의 `common.apply` / 신설 `common.unsaved` 네임스페이스에 양쪽 추가.

---

## 2. 요구 1 — 적용 대상 판단표 (아티팩트 존재 기준)

"다시 반영 / 마지막 반영 배지"는 **디스코드에 게시된, 설정으로 편집 가능한 지속 아티팩트(stored messageId 로 in-place 편집되는 메시지)** 가 있을 때만 의미가 있다. 판별 기준 = **ORM 엔티티에 `messageId` 계열 컬럼이 존재하고, 그 메시지가 설정 저장으로 갱신되는가.**

조사 결과(`*.orm-entity.ts`의 `messageId` / `lastAppliedAt` 컬럼 스캔):

| 도메인 | 디스코드 아티팩트 | 근거(엔티티/컬럼) | 1차 상태 | 2차 처리 | 사유 |
|--------|------------------|-------------------|----------|----------|------|
| **status-prefix** | ✅ 접두사 패널 메시지 | `status-prefix-config.orm-entity.ts` `messageId` + `lastAppliedAt` | 배지+다시반영 완료 | **변경 없음** | 1차 완료 |
| **sticky-message** | ✅ 고정 메시지 | `sticky-message-config.orm-entity.ts` `messageId` + `lastAppliedAt` | 배지+다시반영 완료 | **변경 없음** | 1차 완료 |
| **role-panel** | ✅ 역할 패널 메시지 | `role-panel-config.orm-entity.ts` `messageId` + `lastAppliedAt` | 배지+다시반영 완료 | **변경 없음** | 1차 완료 |
| **auto-channel** | ✅ 안내(guide) 메시지 | `auto-channel-config.orm-entity.ts` `guideMessageId` + `lastSavedAt` | 배지만(`variant="saved"`), 다시반영 없음 | **🎯 다시 반영 추가 (요구 1 핵심)** | 아티팩트 있음. 1차에서 다시반영만 미완 |
| **newbie** | 🟡 미션 임베드 + 모코 순위 임베드 | `newbie-config.orm-entity.ts` `missionNotifyMessageId` + `mocoRankMessageId` (단 `lastAppliedAt` 컬럼 **없음**) | 배지 없음 | **대상 제외** (배지/다시반영) | 아티팩트는 있으나 (1) **스케줄러/auto-refresh 가 이미 주기 갱신** → 저장분이 다음 주기에 자동 반영, (2) 배지용 `lastAppliedAt` 컬럼이 없어 도입 시 **DB 스키마 변경 필요**(금지). → 요구 3(저장 통합)만 다룸 |
| **voice**(음성 추적) | ❌ 없음 | 추적 임계치 config 뿐 (메시지 컬럼 없음) | — | **대상 제외** | 순수 config 도메인. 게시 아티팩트 없음 |
| **diagnosis(주간리포트)** | ❌ 편집형 아티팩트 아님 | `weekly-report` config = 요일/시각/채널. 리포트는 **스케줄마다 신규 메시지**(stored messageId 로 in-place 편집 아님) | — | **대상 제외** | 리포트는 "이벤트성 산출물". "다시 반영"이 아니라 "지금 리포트 생성" 이라는 별개 액션 → 본 계획 범위 밖 |
| **voice-health(자가진단)** | ❌ 없음 | `voice-health-config.orm-entity.ts` = 임계치/뱃지 파라미터 config, messageId 없음 | — | **대상 제외** | 순수 config 도메인 |
| **inactive-member** | ❌ 편집형 아티팩트 아님 | config + action-log + record (messageId 컬럼 없음) → 알림/DM = 이벤트성 | — | **대상 제외** | 지속 편집 메시지 없음 |
| **me/privacy** | ❌ 없음 | 개인 프라이버시 config | — | **대상 제외** | 순수 개인 config |

### 결론

- **요구 1의 실제 코드 작업 대상 = `auto-channel` 단 1개** (다시 반영 완성).
- newbie 는 아티팩트가 있으나 배지 도입에 DB 컬럼이 필요하고 auto-refresh 로 이미 반영되므로 **배지/다시반영은 제외**하고 요구 3(저장 통합)만 처리.
- 그 외 5개(voice / diagnosis / voice-health / inactive-member / me-privacy)는 **순수 config 또는 이벤트성 아티팩트 → 확산 대상 아님**(과잉 설계 방지).
- 단, **요구 2(미저장 이탈 경고)는 아티팩트 유무와 무관하게 편집 가능한 모든 설정 페이지에 적용**한다(아래 §3-B 대상표).

---

## 3. 변경 파일 목록

### 3-A. 신규 파일

| # | 경로 | 종류 | 목적 |
|---|------|------|------|
| N1 | `apps/web/app/components/settings/UnsavedChangesContext.tsx` | 신규 (context+provider) | 설정 레이아웃 레벨에서 dirty 상태 공유 + 네비게이션 확인 게이트 제공 |
| N2 | `apps/web/app/components/settings/useUnsavedChangesGuard.ts` | 신규 (hook) | 페이지가 `isDirty` 를 context 에 등록 + `beforeunload` 리스너 부착 + `confirmDiscardIfDirty()` 헬퍼 반환 |
| N3 | `apps/web/app/components/settings/__tests__/useUnsavedChangesGuard.test.tsx` | 신규 (test, vitest) | 훅 동작 검증 |
| N4 | `apps/web/app/components/settings/__tests__/UnsavedChangesContext.test.tsx` | 신규 (test, vitest) | 네비게이션 게이트 검증 |
| N5 | `apps/api/src/channel/auto/auto-channel.controller.spec.ts` | 신규/보강 (test) | re-apply 엔드포인트 검증(기존 없으면 신규) |

> 공용 컴포넌트 디렉토리는 기존 `apps/web/app/components/settings/`(1차 `LastAppliedBadge`/`ReApplyButton` 위치)를 그대로 사용.

### 3-B. 수정 파일

| # | 경로 | 요구 | 변경 요약 |
|---|------|------|----------|
| M1 | `apps/api/src/channel/auto/auto-channel.controller.ts` | 1 | `POST /:configId/re-apply` 엔드포인트 추가(guide 메시지 재게시). `sendOrEditGuideMessage()` 재사용 |
| M2 | `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx` | 1, 2, 2.5 | `ReApplyButton` 배치 + `handleReApply`(raw fetch) + dirty 추적/탭전환 가드 + **저장·재게시 성공/실패 토스트 wiring**(인라인 성공 제거) |
| M3 | `apps/web/app/components/SettingsSidebar.tsx` | 2 | 사이드바 `Link` 클릭을 UnsavedChangesContext 로 인터셉트(App Router 라우트 이벤트 부재 대응) |
| M4 | `apps/web/app/settings/guild/[guildId]/layout.tsx` | 2 | `UnsavedChangesProvider` 로 사이드바+main 래핑 |
| M5 | `apps/web/app/settings/guild/[guildId]/voice/page.tsx` | 2, 2.5 | `useUnsavedChangesGuard` 적용 + **저장 성공/실패 토스트 wiring**(인라인 성공 제거) |
| M6 | `apps/web/app/settings/guild/[guildId]/voice-health/page.tsx` | 2, 2.5 | 동일 |
| M7 | `apps/web/app/settings/guild/[guildId]/diagnosis/page.tsx` | 2, 2.5 | 동일 + 검증 오류(`validationError`)는 인라인 유지 |
| M8 | `apps/web/app/settings/guild/[guildId]/inactive-member/page.tsx` | 2, 2.5 | 동일 |
| M9 | `apps/web/app/settings/guild/[guildId]/status-prefix/page.tsx` | 2, 2.5 | dirty 추적 + 내부 탭/버튼 전환 가드(배지는 1차 유지) + **저장 토스트 wiring** |
| M10 | `apps/web/app/settings/guild/[guildId]/sticky-message/page.tsx` | 2, 2.5 | 동일(내부 탭 있음) |
| M11 | `apps/web/app/settings/guild/[guildId]/role-panel/page.tsx` | 2, 2.5 | 동일(내부 탭 있음) |
| M12 | `apps/web/app/settings/me/privacy/page.tsx` | 2, 2.5 | dirty 추적(사이드바 가드는 me 레이아웃 provider 필요 시 §8 확인) + **저장 토스트 wiring**(인라인 `privacy.savedToast` 제거) |
| M13 | `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` | 2, 2.5, 3 | 3개 dirty 스코프 추적 + 하단 버튼 라벨 명확화 + 이탈 가드 + **config 저장 토스트 wiring**(채널 검증 에러 인라인 유지) |
| M14 | `apps/web/app/settings/guild/[guildId]/newbie/components/MissionTemplateSection.tsx` | 2.5, 3 | 미저장 표시 배지(dirty 시) + **템플릿 저장 토스트 wiring**(변수 검증 에러 인라인 유지) |
| M15 | `apps/web/app/settings/guild/[guildId]/newbie/components/MocoTemplateSection.tsx` | 2.5, 3 | 동일 |
| M16 | `libs/i18n/locales/ko/web/settings.json` | 1,2,3 | 신규 키(§6) |
| M17 | `libs/i18n/locales/en/web/settings.json` | 1,2,3 | 신규 키(§6, 대칭) |

> M2(auto-channel)도 Phase 2.5 대상(저장 성공/실패 + re-apply 토스트). §3-B 상단 M2 행 참조.
> **Phase 2.5 토스트 wiring 은 shared-infra(`apps/web/components/ui/toast.tsx`) 구현 완료 후 착수**(§4 Phase 2.5 의존성). 성공/실패 문구는 기존 `common.saveSuccess`/`common.saveError` 재사용 → i18n 신규 키 불요.
> **me/privacy 사이드바**: `settings/me` 는 별도 레이아웃(`settings/me/layout.tsx`)을 쓴다. me 레이아웃에도 사이드바가 있으면 M4 와 동일한 provider 래핑이 필요(§8 확인 항목). 가드 우선순위는 guild 설정 페이지 → me 순.

---

## 4. 구현 단계

### Phase 1 — 요구 1: auto-channel 다시 반영 (API + Web)

1. **[API] M1** `auto-channel.controller.ts` 에 재게시 엔드포인트 추가:
   - `POST /api/guilds/:guildId/auto-channel/:configId/re-apply` (`@HttpCode(200)`, 클래스 레벨 `JwtAuthGuard + GuildMembershipGuard` 상속).
   - 처리: `configRepo.findById(configId)` → `guildId` 일치 검증(불일치 시 `NotFoundException`, remove() 패턴 재사용). `config.mode === 'instant'` 이면 게시할 메시지 없음 → `{ ok: false, reason: 'instant' }` 또는 400(웹에서 버튼 disabled 로 이미 차단하므로 방어적 처리). `select` 모드면 `buttonPayloads` 구성 후 `sendOrEditGuideMessage(...)` 재사용 → 성공 시 `updateGuideMessageId()`.
   - 응답: `{ ok: true, guideMessageId: string | null }`. **`lastSavedAt` 는 갱신하지 않는다**(재게시는 "저장"이 아님 — §4-A 결정 참조).
   - `sendOrEditGuideMessage()` 가 `dto` 대신 저장된 config 값을 받도록 오버로드/보조 함수 필요: guideChannelId/guideMessage/embedTitle/embedColor 를 config 에서 읽는 경로 추가(현재는 `dto` 기반). → 저장된 config → payload 로 매핑하는 private 헬퍼 1개 신설 권장.
2. **[Web] M2** auto-channel `page.tsx`:
   - import `ReApplyButton`.
   - `handleReApply`: `fetch(POST /api/guilds/${guildId}/auto-channel/${currentTab.id}/re-apply)` (raw fetch — 기존 저장 흐름과 동일 스타일 유지). 성공/실패 피드백은 **공용 토스트 사용**(shared-infra 계획 참조).
   - 배치: 저장 버튼 인근(현 `page.tsx:696` 저장 영역)에 `LastAppliedBadge`(기존) 옆으로 `<ReApplyButton onReApply={handleReApply} disabled={...} />`.
   - `disabled` 조건: `currentTab.id == null`(미저장) `||` `currentTab.mode === 'instant'`(안내 메시지 없음). instant 모드에서는 버튼 자체를 숨기거나 disabled + 설명 텍스트.

#### 4-A. auto-channel 다시 반영 시맨틱 결정 (구현자 주의)

- auto-channel 배지는 `variant="saved"`("마지막 저장")로, **저장 시각 = 반영 시각** 규약이다(1차, `lastSavedAt`).
- 다른 3개 도메인은 `lastAppliedAt` 이라 다시 반영 시 timestamp 를 갱신하지만, auto-channel 은 "저장" 의미이므로 **재게시(다시 반영)로 `lastSavedAt` 을 갱신하지 않는다**. 재게시는 "이미 저장된 config 를 디스코드에 다시 뿌리는" 복구성 동작이다.
- auto-channel 을 `lastAppliedAt` 모델로 승격(재게시 시각 별도 추적)하려면 **DB 컬럼 추가가 필요 → 금지**. 따라서 배지는 `variant="saved"` 유지, 다시 반영은 timestamp 무갱신.
- 🟡 가정 마커(HITL 4분야 아님): 위 시맨틱이 기획 의도와 다르면 구현 전 1줄 확인. 단 게이트 아님.

### Phase 2 — 요구 2: 미저장 이탈 경고 (공용 인프라 → 페이지 확산)

App Router 조사 결과: **`next/navigation`은 라우트 변경 이벤트(pre-navigation hook)를 노출하지 않는다.** 따라서 실현 가능한 방식은 (a) `beforeunload`(브라우저 레벨: 새로고침/탭닫기/URL 직접이동 방어) + (b) **네비게이션 `Link` 클릭 인터셉트**(앱 내 이동 방어) 조합이다. `router.push` 몽키패칭·history API 후킹은 취약하므로 채택하지 않는다.

3. **[N1] UnsavedChangesContext** 생성:
   - 상태: `isDirty: boolean`, `setDirty(dirty: boolean)`.
   - 헬퍼: `confirmLeave(): boolean` — dirty 면 `window.confirm(t('common.unsaved.confirmLeave'))` 반환, 아니면 `true`.
   - Provider 는 mount 시 dirty 값에 따라 `beforeunload` 리스너를 등록/해제.
4. **[N2] useUnsavedChangesGuard(isDirty)** 훅:
   - `useEffect` 로 context 의 `setDirty(isDirty)` 동기화(언마운트 시 `setDirty(false)`).
   - `confirmDiscardIfDirty(): boolean` 반환 — 페이지 내부 탭 전환/서버 전환 직전 호출용(동일 confirm 메시지 재사용).
   - dirty 시 `beforeunload` 부착은 context 가 담당하므로 훅은 등록만.
5. **[M4] layout.tsx**: `GuildSettingsLayout` 의 `return`을 `<UnsavedChangesProvider>` 로 감싸 **사이드바+main 을 동일 provider 안에** 둔다(현재 사이드바가 provider 밖이라 인터셉트 불가 → 이 재배치가 핵심).
6. **[M3] SettingsSidebar.tsx**: 각 메뉴 `Link`(및 서버 전환/대시보드 링크)의 `onClick` 을 `(e) => { if (!confirmLeave()) { e.preventDefault(); return; } close(); }` 로 감싼다. `confirmLeave` 는 context 에서 취득.
7. **[M5~M13] 각 페이지 dirty 판정 부착** (아래 §4-B 페이지별 판정표):
   - 각 페이지: 로드 완료/저장 성공 직후의 상태를 **저장 스냅샷**(`savedSnapshotRef`)으로 보관 → 현재 편집 상태와 **deep-equal** 비교로 `isDirty` 산출 → `useUnsavedChangesGuard(isDirty)`.
   - deep-equal 은 신규 의존성 금지이므로 **`JSON.stringify` 정규화 비교**(설정 객체는 순수 직렬화 가능 — 함수/순환 없음) 또는 소형 사내 `isEqual` 유틸. 키 순서 안정화를 위해 동일 객체 shape 기반이므로 stringify 비교로 충분.
8. **[M2/M9/M10/M11/M13] 내부 탭 전환 가드**: 탭 있는 페이지(auto-channel/status-prefix/sticky-message/role-panel/newbie)는 `setActiveTab(next)` 앞에 `if (!confirmDiscardIfDirty()) return;`. 단 **탭 전환이 편집분을 폐기하는 구조인지** 확인 필요 — 대부분 단일 config 를 여러 탭이 공유(탭 = 뷰)하므로 폐기 없이 전환되면 가드 불요. **폐기가 발생하는 탭에만** 가드 적용(§4-B 표에 명시).

#### 4-B. 페이지별 dirty 판정 방법

| 페이지 | 편집 상태 소스 | 저장 스냅샷 기준 | dirty 판정 | 내부 탭 전환 가드 |
|--------|---------------|-----------------|-----------|------------------|
| voice (M5) | `config` state | 로드/저장 후 `config` | `stringify(config) !== snapshot` | 탭 없음 |
| voice-health (M6) | `config` state | 동일 | 동일 | 탭 없음 |
| diagnosis(주간리포트) (M7) | `config` state | 동일 | 동일 | 탭 없음 |
| inactive-member (M8) | `config` state | 동일 | 동일 | 탭 확인 필요 |
| status-prefix (M9) | `config`(buttons 포함) | 로드/저장 후 | `stringify(config)` 비교 | 내부 탭이 동일 config 뷰면 불요 |
| sticky-message (M10) | `config` state | 동일 | 동일 | 탭 구조 확인 후 결정 |
| role-panel (M11) | `config`/패널 배열 | 동일 | 동일 | 패널 탭 = 별개 엔티티면 탭별 dirty |
| auto-channel (M2) | `tabs[]`(탭별 config) | 로드/저장 후 탭별 스냅샷 | **활성 탭** stringify 비교 (탭별) | 탭 = 별개 config → 전환 시 미저장 탭 경고 |
| me/privacy (M12) | `config` state | 동일 | 동일 | 탭 없음 |
| newbie (M13) | `config` + `missionTemplate` + `mocoTemplate` (3 스코프) | 각각 로드/저장 후 스냅샷 | **3개 중 하나라도** dirty → 페이지 dirty | 탭 = 동일 config 뷰(폐기 없음) → 탭 가드 불요, 미저장 배지로 대체 |

> auto-channel 은 탭마다 독립 config 이므로 `tabs[]` 각 항목의 스냅샷 map 을 유지하고, **모든 탭 중 하나라도 dirty** 면 페이지 dirty(사이드바 이탈 가드용). 탭 전환 시엔 떠나는 탭이 dirty 여도 상태는 메모리에 보존되므로(폐기 아님) 탭 전환 자체는 가드 불요 — 단 저장 안 하고 페이지를 뜨면 사이드바/beforeunload 가드가 발동.

### Phase 2.5 — 설정 저장 성공/실패 토스트 통일 (공용 토스트 wiring)

> **범위 근거**: 사용자 승인 요구사항 원문 "공용 토스트 도입: 설정 저장, 관리자 뮤테이션, inactive-member 조치 등에 통일 적용" 중 **"설정 저장" wiring 은 본 계획 소유**다(병렬 `web-ux-shared-infra.md` §2.5 T-5 가 "설정 저장 성공/실패 토스트 wiring 은 save-consistency 계획 소유"로 명시하고 인프라만 제공). 아래는 본 계획이 이미 수정 대상으로 잡은 설정 페이지(M2, M5~M15)의 저장 핸들러를 공용 토스트로 통일하는 작업이다.

> **⚠️ 의존성(순차 착수)**: 공용 토스트 인프라(`apps/web/components/ui/toast.tsx` 의 `useToast` / `ToastProvider` — **shared-infra 계획 산출물, 현재 미존재**)가 **먼저 구현·머지된 후** Phase 2.5 착수. shared-infra 미완이면 본 Phase 는 블록되며, 그 사이 Phase 1·2·3 의 토스트 외 작업(re-apply 엔드포인트, dirty 가드, newbie 책임 명확화)은 선행 가능. import 경로/API 시그니처(`toast.success(msg)` / `toast.error(msg)`)는 shared-infra 최종본을 따른다.

12. **저장 핸들러 토스트 연결**: 이미 수정 대상인 각 설정 페이지의 저장 성공 시 `toast.success(...)`, 실패(제너릭 저장/네트워크 오류) 시 `toast.error(...)` 호출. **기존 인라인 성공 텍스트(초록 문구)는 토스트로 대체(제거)** — 중복 표시 금지. 실패 인라인 배너는 **성격에 따라 페이지별 판단**: 필드/검증 맥락이 필요한 오류(채널 미선택, 요일/시각 검증, 템플릿 변수 위반 등)는 **인라인 유지**(토스트는 제너릭 저장 실패만), 그 외 단순 저장 실패는 토스트로 대체.

#### 2.5-A. 페이지별 저장 피드백 처리표

| 페이지 | 현재 성공 피드백 | 현재 실패 피드백 | 성공 → | 실패 → |
|--------|-----------------|-----------------|--------|--------|
| auto-channel (M2) | `currentTabState.saveSuccess` 인라인(초록) | `saveError` 인라인(빨강) | **toast.success** (인라인 성공 제거) | toast.error (탭별 상태라 인라인 잔존 시 혼란 → 토스트로 이관) |
| voice (M5) | `t('common.saveSuccess')` 인라인 | `saveError` 인라인 | **toast.success** (인라인 제거) | toast.error |
| voice-health (M6) | 인라인 성공 | 인라인 실패 | **toast.success** | toast.error |
| diagnosis(주간리포트) (M7) | `saveSuccess` 인라인 | `saveError` + **`validationError`**(요일/시각) 인라인 | **toast.success** | 저장 실패=toast.error / **`validationError` 인라인 유지**(필드 맥락) |
| inactive-member (M8) | 인라인 성공 | 인라인 실패 | **toast.success** | toast.error (검증성 오류 있으면 인라인 유지) |
| status-prefix (M9) | `saveSuccess` 인라인 | `saveError` 인라인 | **toast.success** | toast.error |
| sticky-message (M10) | 인라인 성공 | 인라인 실패 | **toast.success** | toast.error |
| role-panel (M11) | 인라인 성공 | 인라인 실패 | **toast.success** | toast.error |
| me/privacy (M12) | `t('privacy.savedToast')` 인라인(3초, `SAVE_SUCCESS_TOAST_MS`) | `saveError` 인라인 | **toast.success** (인라인 `savedToast` 문구 제거) | toast.error |
| newbie config (M13) | `newbie.saveSuccess` 인라인 | `saveError` + **채널 검증 에러** 인라인 | **toast.success** | 저장 실패=toast.error / **채널 검증 에러 인라인 유지** |
| newbie 미션/모코 템플릿 (M14/M15) | 섹션 인라인 성공 | 섹션 인라인 + **템플릿 변수 검증 에러** | **toast.success**(섹션별) | 저장 실패=toast.error / **변수 검증 에러 인라인 유지** |

> 원칙: **성공 = 항상 토스트(인라인 성공 텍스트 제거)**, **실패 = 제너릭 저장/네트워크 오류만 토스트, 필드·검증 맥락 오류는 인라인 유지**(사용자가 어느 필드인지 알아야 하므로). `setSaveSuccess`/`setTimeout` 기반 인라인 성공 상태는 제거하되, **dirty-clear·저장 스냅샷 갱신 로직(§4-B)은 그대로 유지**(토스트와 무관). 저장 성공 메시지 문구는 기존 `common.saveSuccess` 재사용, 실패는 `common.saveError` 재사용(§6).

> **re-apply(Phase 1) 토스트**: auto-channel `handleReApply` 성공/실패도 동일 인프라로 `toast.success`/`toast.error`(기존 `common.apply.reApplySuccess`/`reApplyError` 키 재사용). §4 Phase 1 의 "공용 토스트 사용" 표기와 동일.

### Phase 3 — 요구 3: newbie 저장 통합

#### 3-A. 선택안 결정 — **(b) 버튼별 책임 명확화 + 미저장 표시**

**조사한 API 계약**(`apps/web/app/lib/newbie-api.ts`):
- `POST /api/guilds/:guildId/newbie/config` — 기본 config (환영/미션/모코/역할 파라미터)
- `POST /api/guilds/:guildId/newbie/mission-template` — 미션 임베드 템플릿(별도 테이블 `NewbieMissionTemplate`)
- `POST /api/guilds/:guildId/newbie/moco-template` — 모코 순위 임베드 템플릿(별도 테이블 `NewbieMocoTemplate`)

→ **3개는 서로 다른 DB 리소스 + 독립 유효성 검사(변수 화이트리스트)** 를 가진다. 템플릿은 각 기능(mission/moco) 활성화 시에만 유효.

**(a) 단일 저장 통합을 채택하지 않는 이유:**
1. 3개 리소스를 한 버튼으로 저장하려면 클라이언트에서 3개 POST 를 순차 호출 → **부분 실패 UX**(config 는 저장됐는데 템플릿만 실패)를 새로 설계해야 함(복잡도↑).
2. 템플릿은 조건부(기능 disabled 면 저장 불필요)라 항상 3개를 묶는 건 낭비.
3. 백엔드 리소스 수가 줄지 않음(단일 엔드포인트로 합치려면 API 변경 = 최소 범위 제약 위반).
4. 요구 2에서 dirty 추적을 어차피 도입 → **미저장 스코프 표시로 혼란의 근본 원인(어느 버튼이 무엇을 저장하는지 불명확)을 직접 해소** 가능(저비용).

**(b) 채택 내용:**
9. **[M13] 하단 저장 버튼 라벨 명확화**: `common.save`("저장") → `newbie.saveConfigOnly`("기본 설정 저장") 로 교체하여 "이 버튼은 config 만 저장"임을 명시. 하단 저장 성공/실패는 config 스코프 한정.
10. **[M14/M15] 템플릿 섹션에 미저장 배지**: `MissionTemplateSection` / `MocoTemplateSection` 에 dirty(섹션 편집됨 && 미저장) 시 "저장 안 된 변경 있음" 배지 표시(신규 키 `common.unsaved.badge`). 각 섹션은 이미 자체 저장 버튼(`onSave`)이 있으므로 버튼 옆에 배지만 추가.
11. **[M13] 페이지 dirty = config dirty || missionTemplate dirty || mocoTemplate dirty** 로 이탈 가드(§4-B). 하단 저장은 config 만 dirty-clear, 템플릿 저장은 각 템플릿만 dirty-clear.

> newbie 배지/다시반영(요구 1)은 **대상 제외**(§2 사유: DB 컬럼 필요 + auto-refresh). 미션/모코 임베드는 스케줄러가 주기 갱신하므로 "지금 반영" 이 필요하면 후속 과제로 분리.

---

## 5. API 변경 (endpoint 표)

| Method | Path | 변경 | Guard | 요청 | 응답 | DTO/SDK 동기화 |
|--------|------|------|-------|------|------|----------------|
| `POST` | `/api/guilds/:guildId/auto-channel/:configId/re-apply` | **신규** | `JwtAuthGuard, GuildMembershipGuard`(기존 클래스 상속) | 바디 없음 (configId 는 path) | `{ ok: boolean; guideMessageId: string \| null }` | **불요** — 웹이 raw fetch 로 직접 호출(auto-channel 은 SDK 미사용). `libs/bot-api-client` 는 봇→API 용이라 무관. `libs/shared` 타입 추가 불필요(웹 로컬 타입) |

- 그 외 API 변경 없음. newbie 는 기존 3개 엔드포인트 그대로 사용(요구 3은 web-only).
- **DB 스키마 변경 없음**(auto-channel `lastSavedAt` 은 1차에서 이미 존재, re-apply 는 timestamp 무갱신).
- ⚠️ onyu 함정: API 변경 시 typecheck 는 `pnpm --filter @onyu/api typecheck` 별도 실행. re-apply 는 DTO 신설 없음(path param only)이나, 응답 타입은 controller 인라인 타입으로 충분.

---

## 6. i18n 키 목록 (ko/en 대칭 추가 — `web/settings.json`)

기존 `common.apply.*`(reApply/reApplying/reApplySuccess/reApplyError/lastSaved/notSaved)는 **재사용**. 신규는 `common.unsaved` 네임스페이스 + newbie 도메인 키.

| 키 | ko | en | 용도 |
|----|----|----|------|
| `common.unsaved.confirmLeave` | "저장하지 않은 변경사항이 있습니다. 이 페이지를 떠나시겠어요?" | "You have unsaved changes. Leave this page?" | 사이드바 이동/탭 전환 confirm |
| `common.unsaved.badge` | "저장 안 된 변경 있음" | "Unsaved changes" | 미저장 표시 배지(newbie 템플릿 섹션 등) |
| `common.unsaved.beforeUnload` | (동일 문구; 대부분 브라우저는 커스텀 문구 무시 — non-empty 반환용) | (동일) | `beforeunload` returnValue |
| `newbie.saveConfigOnly` | "기본 설정 저장" | "Save base settings" | newbie 하단 버튼 라벨(기존 `common.save` 대체) |

> 문구 최종본은 기획/카피 확인 대상이나 4분야 게이트 아님. 키 네임스페이스는 1차 `common.apply` 패턴을 따라 `common.unsaved` 로 신설.

**저장 토스트(Phase 2.5)는 신규 i18n 키 불요** — 성공은 기존 `common.saveSuccess`, 실패는 기존 `common.saveError` 재사용. re-apply 토스트는 기존 `common.apply.reApplySuccess`/`reApplyError` 재사용. me/privacy 의 인라인 전용 `privacy.savedToast` 키는 토스트 이관 후 참조처가 사라지면 정리 대상(문구가 `common.saveSuccess` 와 중복 → 제거 권장, 단 다른 참조 없는지 확인 후).

---

## 7. 테스트 계획

프레임워크: **web = vitest**(`@testing-library/react` + `userEvent`), **api = jest**. (CLAUDE.md 의 "Jest" 표기와 달리 web `__tests__` 는 vitest 사용 — 기존 `AutoChannelPage.test.tsx` 확인.)

### 7-A. Web (vitest)

| 파일 | 종류 | 검증 |
|------|------|------|
| `components/settings/__tests__/useUnsavedChangesGuard.test.tsx` (N3) | 신규 | isDirty=true 시 beforeunload 등록/해제, confirmDiscardIfDirty 반환값 |
| `components/settings/__tests__/UnsavedChangesContext.test.tsx` (N4) | 신규 | confirmLeave 가 dirty 시 window.confirm 호출·결과 반영 |
| `.../auto-channel/__tests__/AutoChannelPage.test.tsx` | 보강 | ReApplyButton 렌더/disabled(instant·미저장), re-apply POST 호출, dirty 상태에서 탭/이탈 confirm. 기존 fetch mock 에 `POST .../re-apply` 분기 추가 |
| `.../newbie/__tests__/*` (MissionTab/MocoTab 기존) | 보강 | 하단 버튼 라벨 변경, 템플릿 미저장 배지 노출/해제, **템플릿 저장 성공 시 toast.success 호출**(기존이 섹션 인라인 성공 텍스트를 assert 하면 → 토스트 mock assert 로 **갱신**) |
| **저장 토스트 회귀(각 수정 페이지)** | 보강 | 저장 성공 시 `toast.success` 호출·**인라인 성공 텍스트 미표시** 검증. **기존 테스트가 인라인 성공 텍스트(`common.saveSuccess`/`privacy.savedToast` 등)를 assert 하는 경우 토스트 mock assert 로 갱신** — 대상: `AutoChannelPage`, `StatusPrefixPage`, `StickyMessagePage`, `RolePanelPage`, 및 voice/voice-health/diagnosis/inactive-member/privacy 페이지 테스트(존재 시) |
| 대표 config 페이지 1~2개(voice 등) | 신규(선택) | 편집 후 사이드바 confirm 발동(스냅샷 dirty 판정) |

- window.confirm / addEventListener('beforeunload') 는 `vi.spyOn` 으로 모킹.
- **`useToast`(shared-infra) 모킹**: `toast.success`/`toast.error` 를 `vi.fn()` 으로 모킹하고 저장 후 호출 여부 assert. shared-infra 의 토스트 mock 헬퍼가 있으면 재사용.
- 검증 에러 인라인 유지 페이지(diagnosis/newbie 채널·변수 검증)는 **인라인 에러가 여전히 렌더**되는지 별도 assert.

### 7-B. API (jest)

| 파일 | 종류 | 검증 |
|------|------|------|
| `apps/api/src/channel/auto/auto-channel.controller.spec.ts` (N5) | 신규/보강 | re-apply: configId↔guildId 불일치 시 404, select 모드 재게시 호출·guideMessageId 저장, instant 모드 no-op/거부, **lastSavedAt 무갱신** |

### 7-C. 검증 명령어

```
pnpm --filter @onyu/web typecheck        # 또는 npx tsc --noEmit -p apps/web/tsconfig.json (onyu 함정)
pnpm --filter @onyu/web test -- auto-channel
pnpm --filter @onyu/web test -- newbie
pnpm --filter @onyu/api typecheck
pnpm --filter @onyu/api test -- auto-channel
pnpm -r lint
```

---

## 8. 명시적 비대상 (out-of-scope)

| 항목 | 사유 |
|------|------|
| newbie 배지/다시반영 | 아티팩트 있으나 `lastAppliedAt` **DB 컬럼 필요**(금지) + 스케줄러 auto-refresh 가 이미 반영. 요구 3(저장 통합)만 수행 |
| voice / voice-health / inactive-member / diagnosis / me-privacy 의 배지·다시반영 | 순수 config 또는 이벤트성 아티팩트 → 확산 대상 아님(§2). **단 미저장 가드는 적용** |
| diagnosis "지금 리포트 생성" 액션 | 다시 반영과 다른 신규 액션 — 별도 과제 |
| newbie 단일 저장 통합(안 a) | §3-A 근거로 미채택 |
| 공용 토스트 시스템 | `web-ux-shared-infra.md`(별도 owner) 소유. 본 계획은 "공용 토스트 사용"만 표기 |
| App Router `router.push` 몽키패칭 방식 | 취약 → 채택 안 함. Link 클릭 인터셉트 + beforeunload 로 대체 |
| 모든 in-page 크로스링크(대시보드 등) 완전 인터셉트 | 1차 범위는 사이드바 nav + beforeunload + 내부 탭. 잔여 링크는 후속(확인 항목 §6-4) |
| DB 스키마 변경 전반 | 계획 제약(금지) |

### 확인 필요 항목 (구현 전)

1. **sticky-message / role-panel / inactive-member 의 내부 탭 구조** — 탭 전환이 편집분을 폐기하는지(가드 필요) vs 동일 상태 뷰인지. 실제 페이지 열어 확인 후 §4-B 확정.
2. **me/privacy 레이아웃**(`settings/me/layout.tsx`)에 사이드바가 있는지 → provider 래핑 필요 범위.
3. auto-channel `sendOrEditGuideMessage()` 를 저장 config 기반으로 재사용하기 위한 보조 헬퍼 시그니처(현재 `dto` 결합).
4. newbie 하단 버튼 라벨 교체 시 기존 테스트/스냅샷 영향 범위.

---

## manifest 갱신 필요

`docs/specs/feature-manifest.json` 갱신 판단(implementer Phase 7 용):

**변경 종류**: (a) status 변경 — 해당 없음(전 도메인 이미 `implemented`) / (b) `code.*` 경로 신설 — **가능성 있음** / (c) 신규 도메인 — 없음 / (d) 변경 없음 — 대체로 해당.

- **(b) `code.*` 경로 신설/확인 대상**:
  - auto-channel `code.tests`: `apps/api/src/channel/auto/auto-channel.controller.spec.ts`(신규 시) — 매니페스트에 미등재면 추가.
  - **공용 컴포넌트 신규 파일**(`UnsavedChangesContext.tsx` / `useUnsavedChangesGuard.ts` + 테스트)은 특정 도메인에 귀속되지 않는 **web 공용 인프라**다. 1차 `LastAppliedBadge`/`ReApplyButton`(`apps/web/app/components/settings/`)이 어느 도메인 `code.web` 에 등재됐는지(또는 미등재인지)를 implementer 가 확인하여, 동일 취급으로 등재하거나 미등재 유지. onyu 매니페스트는 페이지 단위 `code.web` 이므로 공용 컴포넌트는 별도 키가 없을 수 있음 — 그 경우 **등재 불요**.
- **(d) 변경 없음**: 요구 2·3의 페이지 수정(M5~M15)은 기존 `code.web` 경로 내부 수정이라 매니페스트 갱신 불요. API M1 도 기존 auto-channel `code.api` 내부 수정.

**요약**: 신규 코드 파일은 (1) auto-channel 테스트 spec, (2) web 공용 훅/컨텍스트 2종 + 테스트 2종뿐이며, 대부분 기존 경로 내부 수정이다. status 변경 없음. implementer 는 auto-channel `code.tests` 등재 여부와 공용 컴포넌트 등재 관례만 확인하면 된다.
