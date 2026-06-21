# 구현 계획 — settings-apply-model: sticky-message 도메인

> 대상 도메인: **sticky-message** (Part F 4개 도메인 중 1-B)
> 입력: PRD `docs/specs/prd/settings-apply-model.md` · userflow `docs/specs/userflow/settings-apply-model.md` · 공통계약 `docs/specs/common-modules.md` Part F/G · DB설계 `docs/specs/database/_index.md` §settings-apply-model
> 작업 영역: `apps/api/src/sticky-message/` · `apps/web/app/settings/guild/[guildId]/sticky-message/` · `apps/web/app/lib/sticky-message-api.ts` · `libs/i18n/locales/{ko,en}/web/settings.json`(도메인 키만)
> 선행(Phase 0, 본 plan 범위 밖 — 다른 owner): 마이그레이션 1개 + 공통 컴포넌트 2개 + 상대시각 유틸 + `settings.common.apply.*` i18n 공통키

---

## 0. 핵심 전제 (코드 조사 확정)

| 사실 | 근거 |
|------|------|
| **Discord 전송은 API 측** | `StickyMessageConfigService.saveConfig()`(api) 가 `sendEmbed()` → `configRepo.updateMessageId(config.id, newMessageId)` 수행. 봇(`apps/bot/src/command/sticky-message/`)은 슬래시 커맨드(등록/삭제/목록)만 담당하며 웹 저장 흐름의 Discord 전송에 관여하지 않음. → **stamp 지점은 API service**. PRD/userflow 의 "🔒 봇에 반영 요청" 은 개념적 표현. |
| **stamp 단위 = 레코드(채널 탭) id** | sticky_message_config 는 채널당 N행. 웹은 탭=레코드 1:1. 저장/다시반영 모두 단일 `id` 대상. `WHERE id=?` 로 행별 독립 stamp (F-1 ⚠️). |
| **봇 SDK 미변경** | `lastAppliedAt` 은 웹↔API 응답에만 사용. `libs/bot-api-client`·`libs/shared` 건드리지 않음 (F-2.2). |
| **인가** | controller 전체 `@UseGuards(JwtAuthGuard, GuildMembershipGuard)`. re-apply 도 동일 (F-0/F-3). |
| **웹 "카드" = 탭** | `page.tsx` 는 채널별 탭 UI (각 탭 = 1 레코드). PRD/userflow 의 "채널별 카드" 가 곧 탭. 배지/다시반영은 **탭(레코드) 단위**. |

> 🔴 4분야(법무/결제/권한/DB파괴적) 미결 HITL: **없음** (Part F-8 승계 — nullable 컬럼 추가, 기존 가드 동일, PII 아님).

---

## 1. API 변경

### 1-1. ORM 엔티티 — `lastAppliedAt` 필드 추가
**파일**: `apps/api/src/sticky-message/infrastructure/sticky-message-config.orm-entity.ts`

`updatedAt` 아래에 nullable 컬럼 추가 (DB설계 §3360 확정 — 재설계 금지):

```typescript
@Column({ type: 'timestamptz', nullable: true })
lastAppliedAt: Date | null;
```

> 컬럼의 실제 DB 추가(ALTER TABLE)는 **Phase 0 단일 마이그레이션 `1777600000000-SettingsApplyLastAppliedAtInit`** 가 담당(본 plan 범위 밖). 본 plan 은 엔티티 필드 추가만 하며, "마이그레이션은 선행 owner 가 이미 적용했다"는 전제로 작업. (F-7 ⚠️ — 마이그레이션은 1 owner 귀속)

### 1-2. Repository — stamp 메서드 추가
**파일**: `apps/api/src/sticky-message/infrastructure/sticky-message-config.repository.ts`

`updateMessageId()` 와 동일 패턴으로 레코드 단위 stamp 메서드 추가. **messageId 갱신과 lastAppliedAt stamp 를 1쿼리로 묶는 것을 권장**(트랜잭션 어긋남 방지, F-1):

```typescript
/** Discord 메시지 ID + 반영 시각 동시 갱신. 전송 성공 직후 호출. */
async updateMessageIdAndStamp(id: number, messageId: string, appliedAt: Date): Promise<void> {
  await this.configRepo.update({ id }, { messageId, lastAppliedAt: appliedAt });
}
```

> 기존 `updateMessageId(id, messageId)` 는 refresh service(디바운스 재전송) 가 사용 중. 거기서도 stamp 할지는 1-5 참조. 신규 메서드를 추가하고 기존은 유지(시그니처 변경 시 refresh service 영향 — 최소 변경 원칙).

### 1-3. Service `saveConfig()` — stamp 위치 (정확한 라인)
**파일**: `apps/api/src/sticky-message/application/sticky-message-config.service.ts`

현재 코드 (라인 53~72):
```typescript
if (config.enabled) {
  if (config.messageId) { await this.tryDeleteMessage(...); }
  try {
    const newMessageId = await this.sendEmbed(config.channelId, config);   // ← Discord 전송 성공
    await this.configRepo.updateMessageId(config.id, newMessageId);        // ← (라인 60) 기존 messageId 저장
    config.messageId = newMessageId;
  } catch (err) { ... throw err; }
}
return config;
```

**변경**: 라인 60 의 `updateMessageId` 호출을 `updateMessageIdAndStamp` 로 교체하고 stamp 값을 `config` 객체에도 반영(응답 DTO 포함용):

```typescript
const newMessageId = await this.sendEmbed(config.channelId, config);   // ← 전송 성공 직후 (= stamp 트리거, F-1)
const appliedAt = new Date();
await this.configRepo.updateMessageIdAndStamp(config.id, newMessageId, appliedAt);
config.messageId = newMessageId;
config.lastAppliedAt = appliedAt;   // 응답 DTO 즉시 반영
```

**stamp 안 함 케이스** (F-1 준수, 이미 코드 구조가 보장):
- `config.enabled === false` → `if (config.enabled)` 블록 미진입 → stamp 없음 (UF-008). `lastAppliedAt` 이전 값 유지.
- `sendEmbed()` throw → `appliedAt` 라인 도달 전 → stamp 없음 (UF-002 실패).

### 1-4. ⚠️ Redis 캐시 순서 문제 (반드시 처리)
현재 `saveConfig()` 흐름: **(라인 49~50) Redis 캐시 갱신 → (라인 53~) Discord 전송 + stamp**. 즉 캐시는 stamp **이전** 상태(`lastAppliedAt` 미반영)로 저장된다. GET 이 캐시 히트 시 stale 한 `lastAppliedAt` 을 반환할 수 있다.

**대응안 (택1, 구현자 확정)**:
- (A) **권장** — Discord 전송 + stamp 완료 후, 함수 말미에서 캐시를 1회 더 갱신(`findByGuildId` 재조회 → `setConfig`). 저장 빈도 낮으므로 비용 무시 가능.
- (B) stamp 후 메모리상 `allConfigs` 배열의 해당 id 항목 `lastAppliedAt` 패치 후 setConfig.

→ 본 plan 은 (A) 채택: 라인 60 stamp 후 `await this.redisRepo.setConfig(guildId, await this.configRepo.findByGuildId(guildId))` 추가. (기존 라인 49~50 캐시 갱신은 enabled=false 경로의 즉시 캐시 일관성 위해 유지.)

### 1-5. GET 응답에 lastAppliedAt 노출 (레코드별)
**파일**: `apps/api/src/sticky-message/presentation/sticky-message.controller.ts`

현재 GET/POST 응답은 `StickyMessageConfigOrm` 엔티티를 그대로 반환(직렬화). 엔티티에 `lastAppliedAt` 필드를 추가(1-1)하면 **JSON 직렬화 시 자동 포함**되므로 controller 변경 불필요. 단:
- TypeORM `timestamptz` → `Date` → JSON `string`(ISO8601) 직렬화는 NestJS 기본 동작으로 충족(F-2.1 형식 `string | null`).
- 응답 타입 명시성을 위해 controller 반환 타입은 기존 `StickyMessageConfigOrm` 유지. (별도 응답 DTO 미도입 — 현재 도메인이 엔티티 직접 반환 패턴. 신규 DTO 도입은 범위 초과.)

> refresh service(디바운스 재전송, `sticky-message-refresh.service.ts`)의 stamp 처리: **본 1차 범위에 포함하지 않음**. 디바운스 재전송은 사용자가 채널에 메시지를 보낼 때 자동 트리거되는 정상 동작이나, PRD 의 "반영 시각" 정의는 "웹 저장/다시반영 액션 시각" 중심이다. refresh 시에도 stamp 하면 배지가 사용자 무관하게 갱신되어 혼동될 수 있다. → **refresh service 는 미변경**(기존 `updateMessageId` 유지). 구현자 재량으로 stamp 추가 가능하나 기본은 미포함. (가정 마커)

### 1-6. "다시 반영" 엔드포인트 (F-3, 레코드 id 단위)
**신규 엔드포인트** (PRD IA §337 + F-3 명시):

```
POST /api/guilds/:guildId/sticky-message/:id/re-apply
```

**Controller** (`sticky-message.controller.ts`) — 신규 핸들러:
```typescript
@Post(':id/re-apply')
@HttpCode(HttpStatus.OK)
async reApply(
  @Param('guildId') guildId: string,
  @Param('id', ParseIntPipe) id: number,
): Promise<StickyMessageConfigOrm> {
  return this.configService.reApply(guildId, id);
}
```
> 기존 controller 와 동일 `@UseGuards(JwtAuthGuard, GuildMembershipGuard)`(클래스 레벨) 자동 상속.

**Service** (`sticky-message-config.service.ts`) — 신규 `reApply(guildId, id)`:
1. `configRepo.findById(id)` 단건 조회. 없으면 `NotFoundException`.
2. **`enabled === false` → 거부** (UF-010 엣지: `BadRequestException` 또는 명시적 거부). stamp/전송 없음.
3. 조회한 config 로 재게시 — 기존 `saveConfig` 의 enabled 블록 로직 재사용:
   - `messageId` 있으면 기존 메시지 삭제 시도(`tryDeleteMessage`) → `sendEmbed()` 신규 전송 (현재 saveConfig 패턴과 동일하게 delete-then-send. messageId 없으면 바로 send → 신규 전송 폴백, UF-010 엣지).
   - 전송 성공 → `updateMessageIdAndStamp(id, newMessageId, new Date())` → `config.messageId`/`config.lastAppliedAt` 패치.
   - Redis 캐시 갱신(1-4 (A) 동일).
4. 전송 실패 시 throw (stamp 미갱신, UF-005 — 채널 삭제/권한부족 사유 그대로 전파).
5. 갱신된 config 반환(응답에 `lastAppliedAt` 포함).

> **재게시 로직 중복 방지**: `saveConfig` 의 enabled 블록과 `reApply` 의 전송 로직이 유사 → private 헬퍼 `sendAndStamp(config): Promise<Date>` 로 추출 권장(messageId 삭제+전송+stamp+캐시). saveConfig 와 reApply 양쪽에서 호출. (F-3 "기존 재게시 메서드 재활용".)

---

## 2. Web 변경

### 2-1. api-client 타입 + 함수
**파일**: `apps/web/app/lib/sticky-message-api.ts`

- `StickyMessageConfig` 인터페이스에 필드 추가:
  ```typescript
  lastAppliedAt: string | null;
  ```
- 신규 함수:
  ```typescript
  /** 설정 변경 없이 현재 저장된 설정을 디스코드에 다시 반영한다. */
  export async function reApplyStickyMessage(
    guildId: string,
    id: number,
  ): Promise<StickyMessageConfig> {
    return apiClient<StickyMessageConfig>(
      `/api/guilds/${guildId}/sticky-message/${id}/re-apply`,
      { method: 'POST' },
    );
  }
  ```

### 2-2. 페이지 — 탭(카드)별 배지 + 다시반영 버튼
**파일**: `apps/web/app/settings/guild/[guildId]/sticky-message/page.tsx`

`TabForm` 에 `lastAppliedAt: string | null` 추가. 초기 로드 매핑(라인 108~117)에 `lastAppliedAt: c.lastAppliedAt` 추가. `createEmptyTab` 은 `lastAppliedAt: null`.

**배치 위치**: 탭 푸터(라인 576~598, 저장 버튼 영역). 저장 버튼 좌측에 배지 + 다시반영 버튼 배치:
- `LastAppliedBadge` (Phase 0 공통 컴포넌트) — props `{ at: activeTab.lastAppliedAt, variant: 'applied', disabled: !activeTab.enabled }`.
  - **enabled=false 처리** (PRD §7-3 / UF-008): `disabled` prop 으로 배지를 "비활성" 표기 또는 흐리게. 공통 컴포넌트 props 계약(F-5) 활용 — 본 plan 은 `disabled={!activeTab.enabled}` 전달, 표기 방식은 공통 컴포넌트가 결정.
- `ReApplyButton` (Phase 0 공통 컴포넌트) — props `{ onReApply, disabled: activeTab.id === null || !activeTab.enabled }`.
  - 미저장 탭(`id === null`) → 비활성 (UF-004 엣지).
  - enabled=false → 비활성 (UF-010 — API 가 거부하므로 사전 차단).

**다시반영 핸들러** (신규 `handleReApply(clientKey)`):
```typescript
const handleReApply = async (clientKey: number) => {
  const tab = tabs.find((t) => t.clientKey === clientKey);
  if (!tab || tab.id === null || !selectedGuildId) return;
  setTabState(clientKey, { isSaving: true, saveError: null });  // 로딩(중복 클릭 방지)
  try {
    const updated = await reApplyStickyMessage(selectedGuildId, tab.id);
    setTabs((prev) => prev.map((t) =>
      t.clientKey === clientKey ? { ...t, lastAppliedAt: updated.lastAppliedAt } : t));  // 해당 카드 배지만 갱신
    setTabState(clientKey, { isSaving: false, saveSuccess: true });
    setTimeout(() => setTabState(clientKey, { saveSuccess: false }), 3000);
  } catch (err) {
    setTabState(clientKey, { isSaving: false,
      saveError: err instanceof Error ? err.message : t('common.apply.reApplyError') });
  }
};
```
> `isSaving` 상태를 재사용하거나 별도 `isReApplying` 추가 — 구현자 재량. 별도 플래그가 저장 버튼과 다시반영 버튼을 독립 제어하므로 권장(가정 마커).

**저장 후 배지 갱신** (UF-002): `handleSave` 의 성공 처리(라인 226~231)에서 응답 `saved.lastAppliedAt` 을 탭에 반영:
```typescript
prev.map((t) => (t.clientKey === clientKey
  ? { ...t, id: saved.id, lastAppliedAt: saved.lastAppliedAt } : t))
```
> **enabled=false 저장 시 배지 미갱신** (UF-008): API 가 stamp 하지 않으므로 응답 `lastAppliedAt` 은 이전 값 → 자동으로 미갱신. 클라이언트 추가 처리 불필요.

### 2-3. i18n (도메인 키만)
- **공통키 `settings.common.apply.*`** (배지/버튼 라벨/토스트) 는 **Phase 0 선행** — 본 plan 은 참조만(F-6).
- 본 plan 이 추가할 **sticky-message 고유 키**: 현재 없음. (다시반영 성공/실패 토스트는 `settings.common.apply.reApplySuccess`/`reApplyError` 공통키 사용.)
- ko/en 동시 갱신 대상은 공통키뿐이므로 본 plan 의 `settings.json` 수정은 **없음**(공통키는 Phase 0 owner). → **충돌 0**.

> 만약 sticky-message 고유 문구(예: enabled=false 다시반영 비활성 툴팁)가 필요하면 `settings.stickyMessage.*` 네임스페이스에만 ko/en 동시 추가(F-7 — 자기 도메인 블록만).

---

## 3. 봇 변경 — 없음

`apps/bot/src/command/sticky-message/` (register/delete/list 커맨드) 는 웹 저장 흐름·stamp 와 무관. **본 plan 범위에서 봇 미변경**. (F-0 — Discord 전송은 API 측.)

---

## 4. 파일별 변경 요약

| 파일 | 변경 | 비고 |
|------|------|------|
| `apps/api/src/sticky-message/infrastructure/sticky-message-config.orm-entity.ts` | `lastAppliedAt: Date \| null` 컬럼 추가 | DB설계 확정값 |
| `apps/api/src/sticky-message/infrastructure/sticky-message-config.repository.ts` | `updateMessageIdAndStamp(id, msgId, appliedAt)` 추가 | 기존 `updateMessageId` 유지 |
| `apps/api/src/sticky-message/application/sticky-message-config.service.ts` | `saveConfig` stamp(라인 60 교체) + 캐시 재갱신 + `reApply()` 신규 + `sendAndStamp` 헬퍼 | **stamp = sendEmbed 성공 직후, id 단위** |
| `apps/api/src/sticky-message/presentation/sticky-message.controller.ts` | `POST :id/re-apply` 핸들러 추가 | 가드 클래스 상속 |
| `apps/web/app/lib/sticky-message-api.ts` | `lastAppliedAt` 필드 + `reApplyStickyMessage()` | — |
| `apps/web/app/settings/guild/[guildId]/sticky-message/page.tsx` | `TabForm.lastAppliedAt` + 배지/버튼 배치 + `handleReApply` + 저장후 배지갱신 | 탭=카드 단위 |
| `libs/i18n/.../settings.json` | **변경 없음**(공통키는 Phase 0) | 도메인 고유 키 발생 시만 |

### stamp 위치 정밀 (레코드별)

| 시나리오 | stamp 지점 | 단위 |
|----------|-----------|------|
| 저장(enabled=true) | `saveConfig()` — `sendEmbed()` 성공 직후 `updateMessageIdAndStamp(config.id, ...)` | `WHERE id = config.id` |
| 저장(enabled=false) | **stamp 없음** | — (이전 값 유지) |
| 다시반영(enabled=true) | `reApply()` — 재전송 성공 직후 `updateMessageIdAndStamp(id, ...)` | `WHERE id = ?` |
| 다시반영(enabled=false) | **거부**(BadRequest), stamp 없음 | — |
| 디바운스 재전송 | **stamp 없음**(refresh service 미변경, §1-5 가정) | — |

---

## 5. 엔드포인트 표

| Method | Path | 인가 | Body | Response | 비고 |
|--------|------|------|------|----------|------|
| GET | `/api/guilds/:guildId/sticky-message` | Jwt+GuildMembership | — | `StickyMessageConfig[]` (각 항목 `lastAppliedAt` 포함) | 기존 — 엔티티 직렬화로 필드 자동 추가 |
| POST | `/api/guilds/:guildId/sticky-message` | Jwt+GuildMembership | `StickyMessageSaveDto` | `StickyMessageConfig` (`lastAppliedAt` 포함) | 기존 — stamp 로직 추가 |
| DELETE | `/api/guilds/:guildId/sticky-message/:id` | Jwt+GuildMembership | — | `{ ok: true }` | 기존 — 변경 없음 |
| **POST** | **`/api/guilds/:guildId/sticky-message/:id/re-apply`** | Jwt+GuildMembership | — | `StickyMessageConfig` (`lastAppliedAt` 포함) | **신규**(F-3). enabled=false → 거부 |

---

## 6. 테스트 대상

### 신규/수정 단위 테스트 (`apps/api/src/sticky-message/application/sticky-message-config.service.spec.ts` — 기존 파일 확장)
- `saveConfig` enabled=true: `sendEmbed` 성공 시 `updateMessageIdAndStamp` 호출 + 반환 config 에 `lastAppliedAt` 존재.
- `saveConfig` enabled=false: Discord 전송/ stamp 미호출, `lastAppliedAt` 미갱신.
- `saveConfig` `sendEmbed` throw: stamp 미호출, 에러 전파.
- `saveConfig` 캐시 재갱신: stamp 후 `setConfig` 가 갱신된 `lastAppliedAt` 포함하여 호출(§1-4).
- `reApply` enabled=true messageId 있음: delete→send→stamp, 갱신 config 반환.
- `reApply` enabled=true messageId 없음: 신규 전송 폴백 + stamp.
- `reApply` enabled=false: 거부(BadRequest), 전송/stamp 미호출.
- `reApply` 존재하지 않는 id: NotFound.
- `reApply` 전송 실패: stamp 미갱신, 에러 전파.

### Repository 통합 테스트 (`sticky-message-config.repository.integration-spec.ts` — 기존 확장)
- `updateMessageIdAndStamp`: 해당 id 행만 messageId+lastAppliedAt 갱신, 타 행 영향 없음(레코드 단위 검증, F-1).

### Web (fe-tester 대상 — `page.tsx`)
- 탭별 배지 렌더: `lastAppliedAt` 있음/null/enabled=false 변형.
- 다시반영 버튼: id=null/enabled=false 시 비활성.
- 다시반영 성공: 해당 탭 배지만 갱신, 타 탭 영향 없음(UF-010).
- 저장 성공: 응답 `lastAppliedAt` 으로 배지 갱신. enabled=false 저장 시 배지 미갱신(UF-008).

> 공통 컴포넌트(`LastAppliedBadge`/`ReApplyButton`) 자체 테스트는 Phase 0 owner 담당 — 본 plan 범위 밖.

---

## 7. 의존 / 순서

1. **Phase 0 선행 필수**(다른 owner): ① 마이그레이션 `1777600000000-SettingsApplyLastAppliedAtInit` (4테이블 일괄) ② `LastAppliedBadge`/`ReApplyButton` + 상대시각 유틸 ③ `settings.common.apply.*` i18n 공통키.
2. 본 plan 작업은 Phase 0 머지 후 시작. 다른 3개 도메인(status-prefix/role-panel/auto-channel) plan 과 **공유 파일 충돌 0**(자기 도메인 파일만 수정).
3. onyu 함정 확인: 마이그레이션은 `apps/api/src/migrations/`(Phase 0), typecheck 별도(`pnpm --filter @onyu/api typecheck` / web 별도), 인가 `GuildMembershipGuard`(클래스 상속), 봇 Discord.js 미변경.

---

## manifest 갱신 필요

**변경 종류**: (d) 변경 없음

- sticky-message 도메인은 이미 `feature-manifest.json` 에 등재(`status: implemented`), `code.api`/`code.bot`/`code.web`/`code.tests` 경로 모두 실재.
- 본 plan 은 기존 `code.api`(`apps/api/src/sticky-message/`) 내부 파일 수정 + 기존 `code.web`(`apps/web/app/settings/guild/[guildId]/sticky-message/`) 수정만 수행 → 신규 `code.*` 경로 신설 없음.
- status 변경 없음(이미 `implemented`).
- 신규 도메인 추가 없음.

**manifest 갱신 필요 — 없음.**
