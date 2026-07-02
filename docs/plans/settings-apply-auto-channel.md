# 구현 계획 — settings-apply-model: auto-channel 도메인 (1차)

> 도메인: **auto-channel** (자동방 생성)
> 상위 PRD: `docs/specs/prd/settings-apply-model.md` §4-4
> Userflow: `docs/specs/userflow/settings-apply-model.md` UF-SETTINGS-APPLY-001 / 003
> DB 설계(진실 소스): `docs/specs/database/_index.md` §"엔티티 / 마이그레이션 변경 계획 — settings-apply-model" → `auto_channel_config.lastSavedAt`
> 공통 계약: `docs/specs/common-modules.md` Part F (F-1 stamp / F-2 응답 DTO / F-5 웹 컴포넌트 / F-6 i18n / F-7 충돌매트릭스)
> 작업 워크트리: `e:\Workspace\onyu-settings-apply-unify`

---

## 0. 범위 요약 (auto-channel 1차)

auto-channel 은 4개 도메인 중 **유일하게 디스코드 안내 메시지를 "다시 반영" 대상으로 삼지 않는** 도메인이다 (PRD §4-4).

| 항목 | auto-channel 처리 |
|------|------------------|
| stamp 컬럼 | `lastSavedAt` (다른 3개 도메인의 `lastAppliedAt` 과 **컬럼명 다름**) |
| stamp 시점 | **DB persist 성공 직후** (저장 시각 = 반영 시각). Discord 게시 성공 여부와 무관. |
| 배지 문구 | "마지막 저장: {시각}" (`LastAppliedBadge variant='saved'`) |
| 다시 반영 버튼 | **1차 제외** (PRD §4-4 / common-modules F-3) — `ReApplyButton` 미사용, re-apply 엔드포인트 미신설 |
| select / instant 모드 | select 모드만 안내 메시지 게시. instant 모드는 채널 생성만(메시지 게시 X). **두 모드 모두 lastSavedAt 은 동일하게 DB persist 직후 stamp.** |
| web API 호출 방식 | 기존 **raw `fetch`** 유지 (표준화 금지 — 후속 PR) |
| shared-lib / 봇 SDK | **미변경** (F-2.2 — 봇은 lastSavedAt 소비 안 함) |

---

## 1. 사전 확정 코드베이스 사실 (조사 완료)

| # | 사실 | 위치 |
|---|------|------|
| 1 | auto-channel 저장 흐름은 **service 가 아니라 controller `save()` 메서드**에 전부 있다. `auto-channel.service.ts` 의 `sendOrUpdateGuideMessage()` 는 부트스트랩 등 다른 경로에서 사용 (웹 저장 흐름 아님). | `apps/api/src/channel/auto/auto-channel.controller.ts:43-104` |
| 2 | DB upsert 지점 | `auto-channel.controller.ts:48` `const config = await this.configRepo.upsert(guildId, dto);` |
| 3 | instant 모드 분기: 기존 guideMessage 삭제만, 신규 게시 없음 | `auto-channel.controller.ts:57-73` |
| 4 | select 모드 분기: `sendOrEditGuideMessage()` → 성공 시 `updateGuideMessageId()` | `auto-channel.controller.ts:74-101` |
| 5 | `updateGuideMessageId(configId, messageId)` repository 메서드 | `auto-channel-config.repository.ts:162-164` |
| 6 | `upsert()` 가 `AutoChannelConfigOrm` (relations 포함) 반환 | `auto-channel-config.repository.ts:74-147` |
| 7 | ORM 엔티티 끝(`updatedAt` 아래)에 lastSavedAt 추가 위치 | `auto-channel-config.orm-entity.ts:65-66` |
| 8 | domain entity 별도 매핑 없음 — ORM 엔티티 직접 사용 | (domain entity 파일 미사용) |
| 9 | controller guard: `@UseGuards(JwtAuthGuard, GuildMembershipGuard)` (F-0/F-3 규약 부합) | `auto-channel.controller.ts:23-24` |
| 10 | GET 응답 = `findAllByGuildId()` 의 `AutoChannelConfigOrm[]` **직렬화** (별도 응답 DTO 클래스 없음) → 엔티티에 필드 추가 시 자동 직렬화됨 | `auto-channel.controller.ts:149-152` |
| 11 | POST 저장 응답 = `{ ok, configId, guideMessageId }` 인라인 타입 | `auto-channel.controller.ts:46,103` |
| 12 | 웹 저장 호출 raw fetch | `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx:369` |
| 13 | 웹 초기 GET 로드 raw fetch | `page.tsx:85-87` |
| 14 | 웹 저장 성공 핸들러 | `page.tsx:384-392` |
| 15 | 공통 컴포넌트 `LastAppliedBadge` / `ReApplyButton` 미존재 → Phase 0 선행 (다른 owner) | `apps/web/app/components/settings/` (디렉토리 미존재) |
| 16 | i18n 사용: `useTranslations("settings")` | `page.tsx:30` |

---

## 2. ⚠️ stamp 시점 — 명세 해석 결정 (구현자 주의)

본 plan 입력 prompt 는 "select 모드 안내메시지 게시 성공 직후 stamp" 를 요청했으나, **진실 소스 2건이 다른 규약을 명시**한다:

- DB 설계 `_index.md:3291`: "웹 저장 API 호출이 **DB persist 에 성공한 직후**. Discord 메시지 전송이 없으므로 저장 성공 시각을 그대로 기록."
- common-modules `F-1`: "auto-channel 예외 — Discord 메시지 게시가 없으므로 `lastSavedAt` 은 **DB persist 성공 직후** stamp(저장 시각 = 반영 시각)."

**채택안: DB persist 성공 직후 stamp (진실 소스 2건 우선).** 근거:
1. DB 설계 + common-modules 가 plan-writer 의 명시적 진실 소스로 지정됨 (Part F 헤더).
2. PRD §4-4 / DB §3292: auto-channel 은 "마지막 **저장**" 의미이며 게시 성공과 분리. instant 모드는 게시 자체가 없는데 게시-직후 stamp 면 instant 모드에서 영원히 NULL 이 되어 배지가 동작하지 않음 → 명백히 의도와 불일치.
3. prompt 의 "select 모드 안내메시지 게시 직후" 표현은 다른 3개 도메인(`lastAppliedAt`)의 stamp 규약을 auto-channel 에 잘못 투영한 것으로 판단. auto-channel 의 컬럼명이 `lastSavedAt` 으로 구분된 이유 자체가 이 차이를 반영.

→ **구현: `upsert()` 성공 직후 1줄 stamp. select / instant 모드 무관 동일.** (게시 성공 여부로 분기하지 않음.)

> 🟡 가정 마커(4분야 아님): 위 해석이 의도와 다르면 구현 전 1줄 확인 요망. 단 HITL 게이트 아님(법무/결제/권한/DB파괴 무관).

---

## 3. 파일별 변경 계획

### 3-A. ORM 엔티티 — lastSavedAt 컬럼 추가

> ⚠️ **Phase 0 의존**: 컬럼 추가 + 단일 마이그레이션은 common-modules F-7 에 따라 **Phase 0 단일 owner** 가 4개 도메인 엔티티 컬럼 + 마이그레이션 1개(`1777600000000-SettingsApplyLastAppliedAtInit`)를 일괄 처리한다. auto-channel plan 단독으로 마이그레이션을 새로 만들지 않는다.
> 본 plan 은 "auto-channel 엔티티에 아래 필드가 추가된다는 전제"로 service/DTO/web 작업을 기술한다. 만약 dispatch 시 본 도메인이 Phase 0 owner 로 지정되면 아래 + DB 설계 §"예상 마이그레이션" 의 4테이블 DDL 을 그대로 사용.

**파일**: `apps/api/src/channel/auto/infrastructure/auto-channel-config.orm-entity.ts`
- `updatedAt` (line 65-66) 아래에 추가:

```typescript
@Column({ type: 'timestamptz', nullable: true, default: () => 'NULL' })
lastSavedAt: Date | null;
```

(DB 설계 §3380 동일. 컬럼명 `lastSavedAt` — 절대 `lastAppliedAt` 아님.)

### 3-B. Repository — lastSavedAt stamp 메서드

**파일**: `apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.ts`

`updateGuideMessageId()` (line 162-164) 인근에 신규 stamp 메서드 1개 추가:

```typescript
/** 저장 성공 시각 기록 (settings-apply-model). Discord 게시와 무관하게 DB persist 직후 호출. */
async stampLastSavedAt(configId: number, at: Date): Promise<void> {
  await this.configRepo.update(configId, { lastSavedAt: at });
}
```

> 대안: `upsert()` 내부에서 save 시 `config.lastSavedAt = new Date()` 를 직접 세팅하는 방법도 가능하나, (1) upsert 는 buttons/subOptions cascade 트랜잭션이 복잡하고 (2) controller 흐름에서 stamp 의도를 명시적으로 드러내는 편이 가독성 우위 → **별도 메서드 + controller 호출** 권장. (단일 트랜잭션 요구는 F-1 의 "동일 트랜잭션 또는 직후 연속" 중 "직후 연속" 으로 충족.)

### 3-C. Controller — stamp 호출 + 응답 DTO 필드

**파일**: `apps/api/src/channel/auto/auto-channel.controller.ts`

**(1) `save()` stamp 추가** — `upsert()` 직후(line 48), 모드 분기(line 54) **전**에 stamp:

```typescript
// 1. DB upsert
const config = await this.configRepo.upsert(guildId, dto);

// 1-b. 저장 성공 직후 stamp (select/instant 무관 — auto-channel 은 저장 시각 = 반영 시각)
const savedAt = new Date();
await this.configRepo.stampLastSavedAt(config.id, savedAt);
```

**(2) POST 응답 타입에 `lastSavedAt` 추가** (line 46, 103):

```typescript
): Promise<{ ok: boolean; configId: number; guideMessageId: string | null; lastSavedAt: string }> {
  ...
  return { ok: true, configId: config.id, guideMessageId, lastSavedAt: savedAt.toISOString() };
}
```

**(3) GET 응답** (line 149-152): 별도 응답 DTO 클래스가 없고 `AutoChannelConfigOrm[]` 직렬화이므로 **3-A 의 엔티티 필드 추가만으로 자동 포함**된다. 직렬화 형식은 TypeORM `timestamptz` → JSON Date string (ISO 8601). 추가 코드 불필요.

> F-2.1 규약: GET / 저장 응답 모두 stamp 필드 포함. auto-channel 은 다시 반영 엔드포인트가 없으므로 그 응답은 해당 없음.

### 3-D. 봇 / 공유 라이브러리 — 변경 없음

- `apps/bot/src/event/auto-channel/*` : 봇은 `lastSavedAt` 소비 안 함 → **수정 없음** (F-2.2).
- `libs/bot-api-client/*`, `libs/shared/*` : **수정 없음** (F-2.2 — 도메인 간 공유 파일 충돌 0 목표).

### 3-E. Web — 배지 통합 (raw fetch 유지)

> ⚠️ **Phase 0 의존**: `LastAppliedBadge` 컴포넌트 + 상대시각 유틸 + i18n `settings.common.apply.*` 키는 common-modules F-5/F-6 에 따라 **Phase 0 단독 owner 가 선행 생성**. auto-channel plan 은 이를 **import 만** 한다 (수정 금지).

**파일**: `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx`

**(1) 타입 확장** — `page.tsx` 또는 `types.ts` 의 GET 응답/ConfigForm 타입에 `lastSavedAt: string | null` 추가. (현재 web 은 각자 타입 정의 — F-2.2 규약대로 web 타입에 1필드만 추가. shared 타입 신설 금지.)

**(2) 초기 GET 로드** (line 85-87): 응답에서 `lastSavedAt` 를 탭/폼 상태로 흡수. (raw fetch 흐름 그대로, 파싱만 확장.)

**(3) 배지 렌더** — 페이지 상단(저장 버튼 인근)에 `LastAppliedBadge` 배치 (UF-001 §"auto-channel: 페이지 상단 저장 버튼 인근"):

```tsx
<LastAppliedBadge at={currentTab.lastSavedAt} variant="saved" />
```

- `variant="saved"` → "마지막 저장: {시각}" / null → "저장 안 됨" (F-6 `lastSaved` / `notSaved` 키).
- 배지 위치는 탭(config) 단위 — auto-channel 은 길드당 여러 config(탭) 가능하므로 **활성 탭의 lastSavedAt** 표시.

**(4) 저장 성공 핸들러** (line 384-392): POST 응답의 `lastSavedAt` 로 활성 탭 상태 즉시 갱신 → 배지 재로드 없이 갱신 (UF-003 §7):

```typescript
const data = (await res.json()) as { configId: number; lastSavedAt: string };
setTabs((prev) => prev.map((tab, i) =>
  i === activeTabIndex ? { ...tab, id: data.configId, lastSavedAt: data.lastSavedAt } : tab,
));
```

**(5) `ReApplyButton` — 사용 안 함** (PRD §4-4 / F-3: auto-channel 다시 반영 1차 제외).

**(6) i18n** — auto-channel 도메인 고유 카피 변경 없음. 공통 `settings.common.apply.lastSaved` / `notSaved` 키는 Phase 0 에서 추가 → **참조만**. auto-channel 네임스페이스(`settings.autoChannel.*`)는 본 작업에서 신규 키 추가 불필요.

---

## 4. 엔드포인트 표

| Method | Path | 변경 | Guard | 응답 stamp 필드 |
|--------|------|------|-------|----------------|
| `POST` | `/api/guilds/:guildId/auto-channel` | stamp 호출 추가 + 응답에 `lastSavedAt` 추가 | `JwtAuthGuard, GuildMembershipGuard` (기존) | `lastSavedAt: string` (ISO 8601) |
| `GET` | `/api/guilds/:guildId/auto-channel` | 응답 엔티티에 `lastSavedAt` 자동 포함 (코드 변경 없음, 엔티티 필드만) | 동일 | 각 config 항목에 `lastSavedAt: string \| null` |
| `DELETE` | `/api/guilds/:guildId/auto-channel/:configId` | **변경 없음** | 동일 | — |
| ~~`POST .../re-apply`~~ | — | **신설 안 함** (1차 제외) | — | — |

---

## 5. select / instant 모드 처리 명시

| 모드 | 안내 메시지(Discord) | guideMessageId | lastSavedAt stamp |
|------|---------------------|----------------|-------------------|
| `select` | 게시/갱신 (`sendOrEditGuideMessage`) — 기존 동작 유지 | 게시 성공 시 저장 | **DB persist 직후 stamp** (게시 성공 여부 무관) |
| `instant` | 게시 없음 (기존 guideMessage 있으면 삭제만) — 기존 동작 유지 | null 처리 | **DB persist 직후 stamp** (동일) |

핵심: **stamp 는 모드 분기 이전(upsert 직후)에 1회** 수행하므로 select/instant 양쪽 모두 동일하게 동작. 게시 실패해도 `lastSavedAt` 은 갱신됨(저장 자체는 성공했으므로 — auto-channel 의 "저장 = 반영" 의미와 일치, F-1 auto-channel 예외).

> 비교: 다른 3개 도메인(`lastAppliedAt`)은 "Discord 게시 성공 직후" stamp 라 게시 실패 시 미갱신. auto-channel 만 다름 — 구현/리뷰 시 혼동 주의.

---

## 6. 테스트 대상

### 6-A. 신규/수정 spec (api)

| 파일 | 추가/수정 | 검증 항목 |
|------|----------|----------|
| `apps/api/src/channel/auto/auto-channel.controller.spec.ts` (존재 여부 확인 후, 없으면 신규) | 신규/수정 | POST `save()` 가 upsert 직후 `stampLastSavedAt` 호출 / 응답에 `lastSavedAt` ISO 문자열 포함 / select·instant 모드 **양쪽** stamp 호출 검증 |
| `apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.spec.ts` (있으면) | 추가 | `stampLastSavedAt(configId, at)` 가 해당 row 의 `lastSavedAt` 갱신 |

### 6-B. 기존 spec 영향 (회귀 확인)

| 기존 파일 | 영향 | 조치 |
|-----------|------|------|
| `apps/api/src/channel/auto/application/auto-channel.service.spec.ts` | service 의 `sendOrUpdateGuideMessage` 는 웹 저장 흐름 아님 → **직접 영향 없음**. 단 mock 의 repository 객체에 `stampLastSavedAt` 메서드가 없어 타입 에러 가능 | repository mock 에 `stampLastSavedAt: jest.fn()` 추가 필요 시 반영 |
| `apps/api/src/channel/auto/application/auto-channel-bootstrap.service.spec.ts` | 부트스트랩 경로 — stamp 무관 | 변경 없음 (mock 타입만 확인) |
| `apps/api/src/channel/auto/application/auto-channel-sweep.scheduler.spec.ts` | 스케줄러 — config 조회/삭제만, stamp 무관 | 변경 없음 |

### 6-C. Web 테스트

| 파일 | 영향 |
|------|------|
| `apps/web/app/settings/guild/[guildId]/auto-channel/__tests__/*` (7개) | 저장 핸들러/GET 파싱에 `lastSavedAt` 필드 추가됨 → fetch mock 응답에 `lastSavedAt` 포함하도록 업데이트. 배지 렌더 스냅샷/존재 검증 1건 추가(fe-tester). `ReApplyButton` 미사용 확인. |

### 6-D. 봇 테스트

봇 변경 없음 → 봇 spec 영향 없음.

---

## 7. 작업 순서 (Phase 의존)

```
Phase 0 (선행 단독 owner — common-modules F-7):
  - 4개 ORM 엔티티 lastSavedAt/lastAppliedAt 컬럼 추가 + 마이그레이션 1개
    (1777600000000-SettingsApplyLastAppliedAtInit)
  - web 공통 컴포넌트 LastAppliedBadge.tsx (+ ReApplyButton.tsx, 본 도메인 미사용)
  - 상대시각 유틸
  - i18n settings.common.apply.* (ko/en)
     |
     v
Phase 1-D (auto-channel 단독 — 본 plan):
  [api] repository.stampLastSavedAt + controller save() stamp + POST 응답 lastSavedAt
  [api] (엔티티 필드는 Phase 0 에서 추가됨 — GET 자동 직렬화)
  [web] page.tsx: 타입 +lastSavedAt, GET 파싱, 배지 렌더(import), 저장핸들러 갱신
  [test] controller.spec / repository.spec / web __tests__ 업데이트
```

> auto-channel plan 은 자기 도메인 API service/controller/DTO + web page + 자기 테스트만 수정 → 다른 3개 도메인과 **공유 파일 충돌 0** (F-7 매트릭스).

---

## 8. 검증 명령어 (구현 후)

```
pnpm --filter @onyu/api typecheck      # 별도 typecheck (onyu 함정 — 빌드와 분리)
pnpm --filter @onyu/api test -- auto-channel
pnpm --filter @onyu/web typecheck
pnpm --filter @onyu/web test -- auto-channel
pnpm -r lint
# 마이그레이션은 Phase 0 owner 가 실행 (migration:run)
```

---

## 9. HITL 4분야 판정

| 분야 | 판정 | 근거 |
|------|------|------|
| 법무 | 해당 없음 | `lastSavedAt` 은 설정 저장 시각 메타데이터, PII 아님 (common-modules F-8 / PRD §사용자확인). |
| 결제 | 해당 없음 | 결제 변경 없음. |
| 권한 | 해당 없음 | 신규 OAuth 스코프/봇 권한 없음. 기존 `JwtAuthGuard + GuildMembershipGuard` 동일. re-apply 엔드포인트 미신설. |
| DB 파괴적 | 해당 없음 | nullable `timestamptz` 컬럼 1개 추가만. 기존 컬럼 삭제·타입 변경 없음. |

→ **🔴 미결 HITL 결정 없음.**

(구현 단계 비-게이트 결정 1건: §2 의 stamp 시점 해석 — DB persist 직후 채택. 의도 상이 시 1줄 확인.)

---

## manifest 갱신 필요

`docs/specs/feature-manifest.json` — auto-channel 도메인 관련.

**변경 종류**: (a) status 변경 가능 + (b) `code.web` 경로 신설 확인 필요. (c)/(d) 해당 없음.

- **(b) `code.web` 경로 신설/확인**: 본 prompt 에 "auto-channel web 경로는 매니페스트 미등록(channel 하위)" 명시됨. 실제 코드 경로는 **존재**한다:
  - `code.web`: `apps/web/app/settings/guild/[guildId]/auto-channel/`
  - → auto-channel 도메인 매니페스트의 `code.web` 키가 없으면 **위 경로로 신설** 필요.
  - (참고: `code.api` = `apps/api/src/channel/auto/` + `apps/api/src/bot-api/auto-channel/`, `code.bot` = `apps/bot/src/event/auto-channel/` — 기존 등재 여부 implementer Phase 7 확인.)

- **(a) status**: auto-channel 이 현재 `implemented` 이면 유지(코드 수정 작업). `scaffolded` 였다면 본 작업 완료 후 `implemented` 로 승격 검토. (Phase 0 에서 추가되는 마이그레이션 `1777600000000-SettingsApplyLastAppliedAtInit` 는 4개 도메인 공통 — auto-channel 단독 `code.migrations` 귀속 아님.)

- **신규 파일 (manifest 표기 대상)**:
  - `apps/api/src/channel/auto/auto-channel.controller.spec.ts` (테스트 — 신규 시) → auto-channel `code.tests`
  - `apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.spec.ts` (없으면 신규) → `code.tests`

> 실제 매니페스트의 auto-channel `code.*` 현재 등재 상태는 implementer 가 Phase 0/7 에서 `feature-manifest.json` 을 직접 열어 확인 후 갱신. 본 plan 은 코드 경로가 실재함을 확인했다(§1 조사).
