# 구현 계획 — settings-apply-model: status-prefix 도메인

> 입력: PRD `docs/specs/prd/settings-apply-model.md` · DB `docs/specs/database/_index.md` §settings-apply-model · userflow `docs/specs/userflow/settings-apply-model.md` · **공통 계약 `docs/specs/common-modules.md` Part F/G**
> 대상 도메인: **status-prefix** (길드당 단일 config / 단일 messageId)
> 작업 영역: `apps/api/src/status-prefix/` · web `apps/web/app/settings/guild/[guildId]/status-prefix/` + `apps/web/app/lib/status-prefix-api.ts`
> 봇(`apps/bot/src/event/status-prefix/`): **변경 없음** (사유 §0 참조)

---

## 0. 전제 / 사전 확인 사실 (코드 조사 완료)

| # | 사실 | 출처 |
|---|------|------|
| 0-1 | **Discord 메시지는 API 측에서 전송한다.** status-prefix 의 Discord post/edit 는 `apps/api/src/status-prefix/application/status-prefix-config.service.ts` 의 `buildAndSendMessage()` 가 `StatusPrefixDiscordAdapter` 를 통해 직접 수행한다. PRD/userflow 의 "🔒 봇에 반영 요청" 표현은 개념적이며 **stamp 지점은 API service**. → **봇 코드 변경 없음.** | Part F-0 + 코드 조사 |
| 0-2 | **저장 후 동기화 구조가 이미 존재.** `saveConfig()` 가 `DB upsert(L110) → Redis 캐시(L113) → enabled&&channelId 면 buildAndSendMessage(L118) → updateMessageId(L120) → config.messageId 세팅(L121) → Redis 재저장(L123)` 순서로 동작. 본 작업의 핵심은 **L120~121 직후 stamp 1줄 + 응답 DTO 1필드** 추가. | 코드 조사 |
| 0-3 | **"현재 config 로 재게시" 경로가 이미 존재.** `buildAndSendMessage(config)` 가 messageId 있으면 edit, 없으면 신규 전송(폴백 포함). "다시 반영" 엔드포인트는 이를 재활용 (F-3). | 코드 조사 |
| 0-4 | **인가는 controller 클래스 레벨 `@UseGuards(JwtAuthGuard, GuildMembershipGuard)`** 로 적용됨(`status-prefix.controller.ts` L18). 신규 re-apply 엔드포인트는 동일 컨트롤러에 추가하므로 가드 자동 상속. | 코드 조사 |
| 0-5 | **GET `config` 는 ORM 엔티티를 그대로 반환**(`getConfig` → `StatusPrefixConfigOrm`). 엔티티에 `lastAppliedAt` 컬럼 추가 시 GET 응답에 **자동 포함**. 별도 DTO 매핑 없음. | 코드 조사 |
| 0-6 | **POST `config` 저장 응답은 현재 `{ ok: boolean }`** 만 반환(`saveConfig` controller L44~47). 배지 즉시 갱신을 위해 `lastAppliedAt` 을 응답에 추가해야 함(F-2.1). | 코드 조사 |
| 0-7 | **마이그레이션 + ORM 컬럼 추가 + web 공통 컴포넌트 2개 + i18n 공통 키는 공통 선행작업(Phase 0)** 소관(F-5/F-6/F-7). 본 plan 은 ORM 엔티티에 필드가 추가됨을 전제로 service/DTO/web 만 작업하되, **엔티티 필드 추가는 본 plan 의 파일 변경 목록에도 명시**(아래 §1.1) — Phase 0 owner 가 status_prefix 엔티티를 담당하지 못할 경우 대비. 충돌 방지: 컬럼 정의는 DB 문서 §settings-apply-model 의 패턴(`@Column({ type: 'timestamptz', nullable: true, default: () => 'NULL' })`)을 **그대로** 사용하고 재설계하지 않음. | Part F-5/6/7 + DB 문서 |
| 0-8 | **테스트는 Vitest** 사용(`*.spec.ts` 가 `from 'vitest'`). Jest 아님. typecheck/test 명령은 워크스페이스 필터(`pnpm --filter @onyu/api ...`). | `status-prefix-config.service.spec.ts` |
| 0-9 | **Redis 캐시에도 lastAppliedAt 반영 필요.** `saveConfig` 가 stamp 후 `config.lastAppliedAt` 을 세팅하고 Redis 재저장(L123)하므로, 캐시 미스 없이도 GET 이 최신 stamp 를 반환하도록 보장. | 코드 조사 |

> **scope 가드**: 본 작업은 `libs/bot-api-client` / `libs/shared` 를 **건드리지 않는다**(F-2.2). 봇은 `lastAppliedAt` 을 소비하지 않음. 11페이지 저장 UX 표준화는 비목표(F-5 범위 제한).

---

## 1. API 변경

### 1.1 ORM 엔티티 — `lastAppliedAt` 필드 추가
**파일**: `apps/api/src/status-prefix/infrastructure/status-prefix-config.orm-entity.ts`

- `updatedAt` (`@UpdateDateColumn`, L51~52) **아래**에 추가:
  ```typescript
  @Column({ type: 'timestamptz', nullable: true, default: () => 'NULL' })
  lastAppliedAt: Date | null;
  ```
- **마이그레이션은 공통 선행작업(Part F-7 / DB 문서 `1777600000000-SettingsApplyLastAppliedAtInit`)이 4테이블 단일 마이그레이션으로 담당** — 본 plan 은 마이그레이션 파일을 신설하지 않는다. 엔티티 필드 추가만 수행(컬럼 정의는 DB 문서 §status_prefix_config 와 1:1 일치).
- ⚠️ **owner 조율**: Phase 0 owner 가 4개 ORM 엔티티 컬럼을 일괄 추가한다면 본 항목은 그쪽에 귀속되고 본 plan 은 "필드 존재 전제"로만 동작. dispatch 단계에서 status_prefix 엔티티 컬럼 owner 를 1명으로 확정(중복 편집 금지).

### 1.2 service — Discord 전송 성공 직후 stamp
**파일**: `apps/api/src/status-prefix/application/status-prefix-config.service.ts`
**메서드**: `saveConfig()` (L93~134), `buildAndSendMessage()` 호출 성공 블록 (L116~131)

- **정확한 stamp 위치**: `await this.configRepo.updateMessageId(guildId, messageId);` (현재 L120) **직후**, `config.messageId = messageId;` (L121) 와 함께 `lastAppliedAt` stamp.
  - 추가 코드(L120~123 블록 내):
    ```typescript
    const appliedAt = new Date();
    await this.configRepo.stampLastApplied(guildId, appliedAt); // 신규 repo 메서드 (§1.3)
    config.messageId = messageId;
    config.lastAppliedAt = appliedAt;     // 응답/캐시 동기화
    await this.redisRepo.setConfig(guildId, config); // 기존 L123 — lastAppliedAt 포함된 config 재저장
    ```
  - **stamp 안 하는 경우** (F-1): ① `enabled=false` 또는 `channelId` 없음 → `if (config.enabled && config.channelId)` 블록(L116) 진입 안 함 → stamp 미발생(기존 분기 그대로 활용, 추가 분기 불필요). ② `buildAndSendMessage()` throw → catch(L124)에서 재throw → stamp 도달 전 종료(정상). 
  - **트랜잭션 주의**(F-1): `updateMessageId` 와 `stampLastApplied` 를 2회 UPDATE 로 분리하지 말고 **단일 UPDATE 로 통합 권장**(§1.3 옵션 B). messageId 와 lastAppliedAt 이 어긋나면 안 됨.
- ⚠️ 과잉설계 금지: status-prefix 는 단일 config / 단일 messageId → stamp 단위는 `WHERE guildId = ?` 단순. 채널/패널 단위 분기 불필요.

### 1.3 repository — stamp 메서드
**파일**: `apps/api/src/status-prefix/infrastructure/status-prefix-config.repository.ts`

- **옵션 A (분리)**: 기존 `updateMessageId()` (L111~113) 옆에 신규 추가:
  ```typescript
  async stampLastApplied(guildId: string, at: Date): Promise<void> {
    await this.configRepo.update({ guildId }, { lastAppliedAt: at });
  }
  ```
- **옵션 B (통합, 권장)**: messageId + lastAppliedAt 을 1회 UPDATE 로 묶어 정합성 보장:
  ```typescript
  async updateMessageId(guildId: string, messageId: string, lastAppliedAt: Date): Promise<void> {
    await this.configRepo.update({ guildId }, { messageId, lastAppliedAt });
  }
  ```
  - 옵션 B 채택 시 service L120 호출부를 `updateMessageId(guildId, messageId, appliedAt)` 로 변경. **implementer 가 옵션 B 로 진행 권장**(트랜잭션 정합성 + UPDATE 1회).

### 1.4 GET 설정 응답 — `lastAppliedAt` 포함
**파일**: 변경 없음 (자동) — `status-prefix.controller.ts` `getConfig` 가 ORM 엔티티를 그대로 반환하므로 §1.1 의 엔티티 필드 추가만으로 GET 응답에 `lastAppliedAt` 자동 직렬화(0-5). 
- 단, **Redis 캐시 경로**: 캐시된 config 에도 `lastAppliedAt` 이 포함되도록 §1.2 의 `setConfig` 재저장이 보장(0-9). 기존 캐시(필드 없음)는 TTL 1h 후 자연 만료 또는 다음 저장 시 갱신.

### 1.5 POST 저장 응답 — `lastAppliedAt` 포함
**파일**: `apps/api/src/status-prefix/presentation/status-prefix.controller.ts` `saveConfig` (L39~47)

- 응답을 `{ ok: boolean }` → `{ ok: boolean; lastAppliedAt: string | null }` 로 변경.
  - `saveConfig` service 가 반환하는 `StatusPrefixConfigOrm` 의 `config.lastAppliedAt` 사용:
    ```typescript
    const config = await this.configService.saveConfig(guildId, dto);
    return { ok: true, lastAppliedAt: config.lastAppliedAt?.toISOString() ?? null };
    ```
  - 직렬화 형식: **ISO 8601 문자열 또는 null** (F-2.1).

### 1.6 "다시 반영" 엔드포인트 (F-3)
**파일**: `apps/api/src/status-prefix/presentation/status-prefix.controller.ts` (+ service `status-prefix-config.service.ts`)

- **결정: 신규 `re-apply` 엔드포인트 신설** (status-prefix 는 기존 publish 엔드포인트가 없음 — 저장=즉시반영 모델). path 는 PRD IA / F-3 권고대로 `POST .../status-prefix/re-apply` (길드당 1개이므로 식별자 불필요).
- **controller 추가**:
  ```typescript
  @Post('re-apply')
  @HttpCode(HttpStatus.OK)
  async reApply(@Param('guildId') guildId: string): Promise<{ ok: boolean; lastAppliedAt: string | null }> {
    const config = await this.configService.reApply(guildId);
    return { ok: true, lastAppliedAt: config.lastAppliedAt?.toISOString() ?? null };
  }
  ```
  - 인가: 클래스 레벨 `@UseGuards(JwtAuthGuard, GuildMembershipGuard)` 자동 상속(0-4, F-3).
- **service 신규 `reApply(guildId)`**: 기존 재게시 경로(`buildAndSendMessage`) 재활용 (0-3).
  ```typescript
  async reApply(guildId: string): Promise<StatusPrefixConfigOrm> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config) throw new DomainException('설정이 없습니다.', 'CONFIG_NOT_FOUND'); // 저장 이력 없음
    if (!config.enabled || !config.channelId) {
      throw new DomainException('반영 대상 채널이 없습니다.', 'NOT_APPLICABLE'); // 비활성/채널없음 → 거부
    }
    const messageId = await this.buildAndSendMessage(config); // 채널없음/권한부족 시 throw → 컨트롤러 전파
    const appliedAt = new Date();
    await this.configRepo.updateMessageId(guildId, messageId, appliedAt); // 옵션 B
    config.messageId = messageId;
    config.lastAppliedAt = appliedAt;
    await this.redisRepo.setConfig(guildId, config);
    return config;
  }
  ```
  - 실패 시 stamp 미갱신(F-3, UF-005): `buildAndSendMessage` throw → stamp 라인 도달 안 함. 구체 사유는 `DomainException`/원본 에러가 컨트롤러까지 전파.
  - 멱등성(F-3, PRD §11): 반복 호출 시 항상 최신 config 로 재게시 동일 동작.
- ⚠️ `buildAndSendMessage` 는 현재 `private` — `reApply` 가 같은 클래스 내부 메서드이므로 접근 가능(가시성 변경 불필요).

### 1.7 엔드포인트 표

| method | path | auth | body | response |
|--------|------|------|------|----------|
| GET | `/api/guilds/:guildId/status-prefix/config` | `JwtAuthGuard` + `GuildMembershipGuard` | — | `StatusPrefixConfigOrm \| null` (엔티티 직렬화 — `lastAppliedAt: string \| null` **신규 포함**) |
| POST | `/api/guilds/:guildId/status-prefix/config` | 〃 | `StatusPrefixConfigSaveDto` (변경 없음) | `{ ok: true, lastAppliedAt: string \| null }` (**lastAppliedAt 신규**) |
| POST | `/api/guilds/:guildId/status-prefix/re-apply` | 〃 | — (없음) | `{ ok: true, lastAppliedAt: string \| null }` (**신규 엔드포인트**) — 실패 시 4xx/5xx + 사유 |

---

## 2. Web 변경

> 공통 컴포넌트 `LastAppliedBadge` / `ReApplyButton` 과 i18n `settings.common.apply.*` 키, 상대시각 유틸은 **Phase 0 공통 선행작업**(F-5/F-6). 본 plan 은 **import 만** 하고 생성/수정하지 않는다.

### 2.1 web api-client — 타입 + re-apply 함수
**파일**: `apps/web/app/lib/status-prefix-api.ts`

- `StatusPrefixConfig` 인터페이스에 `lastAppliedAt: string | null` 추가(L21~29). GET 응답 매핑.
- 저장 함수 `saveStatusPrefixConfig` 반환을 `void` → `{ lastAppliedAt: string | null }` 로 변경 (응답에서 추출), 또는 저장 응답 타입 신설:
  ```typescript
  export interface StatusPrefixApplyResult { lastAppliedAt: string | null; }
  export async function saveStatusPrefixConfig(guildId, config): Promise<StatusPrefixApplyResult> {
    return apiClient<StatusPrefixApplyResult>(`/api/guilds/${guildId}/status-prefix/config`, { method: 'POST', body: config });
  }
  ```
- 신규 re-apply 함수:
  ```typescript
  export async function reApplyStatusPrefix(guildId: string): Promise<StatusPrefixApplyResult> {
    return apiClient<StatusPrefixApplyResult>(`/api/guilds/${guildId}/status-prefix/re-apply`, { method: 'POST' });
  }
  ```
- ⚠️ `libs/bot-api-client` / `libs/shared` 미변경(F-2.2) — web 타입에만 1필드 추가.

### 2.2 설정 페이지 — 배지 + 다시 반영 버튼 배치
**파일**: `apps/web/app/settings/guild/[guildId]/status-prefix/page.tsx`

- **배치 위치**(userflow 도메인 요약 / PRD §F-APPLY-002): **페이지 상단 저장 버튼 인근**. 구체적으로 저장 버튼 행(L711~731)에 `LastAppliedBadge` + `ReApplyButton` 추가.
- `import { LastAppliedBadge, ReApplyButton } from '../../../../components/settings/...'` (Phase 0 생성 경로).
- 상태: `config.lastAppliedAt` 을 배지 `at` prop 으로 전달. `variant='applied'`(status-prefix 는 "마지막 반영" 카피).
- **저장 후 배지 갱신**(UF-002): `handleSave` (L179~215) 의 `await saveStatusPrefixConfig(...)` 반환값에서 `lastAppliedAt` 을 받아 `setConfig((prev) => ({ ...prev, lastAppliedAt: result.lastAppliedAt }))` 로 즉시 반영(페이지 재로드 없음).
- **다시 반영 핸들러**: 신규 `handleReApply`:
  ```typescript
  const handleReApply = async () => {
    const result = await reApplyStatusPrefix(selectedGuildId);
    setConfig((prev) => ({ ...prev, lastAppliedAt: result.lastAppliedAt }));
    // 성공/실패 토스트는 settings.common.apply.reApplySuccess/reApplyError (F-6)
  };
  ```
  - `ReApplyButton` 의 `onReApply={handleReApply}` 로 전달. 로딩 스피너/중복클릭 방지는 컴포넌트 내부(F-5).
  - **버튼 disabled 조건**(PRD §F-APPLY-003): 설정이 한 번도 저장된 적 없는 신규 상태(= GET 이 null 반환 → DEFAULT_CONFIG 사용 중)면 disabled. `lastAppliedAt=null`(미반영)이어도 저장된 config 가 있으면 활성. 판별: 별도 `isPersisted` 플래그(GET 응답 존재 여부, L104~108 의 `cfg` truthy 여부)를 상태로 추가.
- ⚠️ enabled=false 인 status-prefix 는 PRD 엣지에 별도 명시 없음 — re-apply 시 service 가 `NOT_APPLICABLE` 거부(§1.6), 웹은 에러 토스트.

### 2.3 도메인 i18n (필요 시)
**파일**: `libs/i18n/locales/{ko,en}/web/settings.json` — `settings.statusPrefix.*` 네임스페이스
- 공통 카피(`마지막 반영`/`다시 반영`/`미반영`/토스트)는 **Phase 0 의 `settings.common.apply.*` 참조만**(F-6) — 본 plan 추가 금지.
- status-prefix 고유 라벨 변경 필요 시에만 `settings.statusPrefix.*` 자기 도메인 블록 최소 수정(현재 추가 키 불필요로 판단 — 공통 키로 충분).

---

## 3. 테스트 대상

> Vitest. `pnpm --filter @onyu/api test` / `pnpm --filter @onyu/web test`. 별도 typecheck: `pnpm --filter @onyu/api typecheck` 등.

### 3.1 API 단위 테스트
**파일**: `apps/api/src/status-prefix/application/status-prefix-config.service.spec.ts` (기존 확장)
- `makeConfig()` 헬퍼에 `lastAppliedAt: null` 필드 추가(타입 정합).
- 신규 케이스:
  - `saveConfig`: Discord 전송 성공 시 `stampLastApplied`/`updateMessageId(…, appliedAt)` 호출 + 반환 config 의 `lastAppliedAt` non-null.
  - `saveConfig`: `enabled=false` → buildAndSendMessage 미호출 → stamp 미발생 → `lastAppliedAt` null 유지.
  - `saveConfig`: `buildAndSendMessage` throw → stamp 미발생 + 에러 전파.
  - `reApply`: config 없음 → `CONFIG_NOT_FOUND` throw.
  - `reApply`: `enabled=false`/`channelId` 없음 → `NOT_APPLICABLE` throw.
  - `reApply`: 정상 → buildAndSendMessage 재활용 + stamp + 반환 `lastAppliedAt` non-null.
  - `reApply`: buildAndSendMessage throw → stamp 미갱신 + 에러 전파.

### 3.2 API repository 통합 테스트
**파일**: `apps/api/src/status-prefix/infrastructure/status-prefix-config.repository.integration-spec.ts` (기존 확장)
- `updateMessageId(guildId, messageId, appliedAt)`(옵션 B) → DB 의 `lastAppliedAt` 갱신 검증.
- `findByGuildId` 반환에 `lastAppliedAt` 포함 검증.

### 3.3 API 컨트롤러/엔드포인트 테스트
**파일**: 기존 e2e/controller 스펙 패턴 확인 후 — POST `config` 응답 `lastAppliedAt` 포함, 신규 POST `re-apply` 의 가드(`JwtAuthGuard+GuildMembershipGuard`) 적용 + 성공/실패 응답.
- (해당 도메인에 controller 전용 spec 부재 시 service 단위 테스트로 커버하고, e2e 는 e2e-checker 조건부 — 인가 경로 변경(신규 엔드포인트)이므로 re-apply 인가 1케이스 권장.)

### 3.4 Web 컴포넌트 테스트
- **공통 컴포넌트 `LastAppliedBadge`/`ReApplyButton` 테스트는 Phase 0 owner 소관**(본 plan 비대상).
- 본 plan 대상: `page.tsx` 통합 — (테스트 인프라 존재 시) 저장 후 배지 `lastAppliedAt` 갱신, re-apply 버튼 disabled 조건(미저장 시 비활성), re-apply 성공 시 배지 갱신. web 테스트 컨벤션은 fe-tester 가 기존 `apps/web` 스펙 패턴 확인 후 결정.

---

## 4. 파일 변경 요약

| 파일 | 변경 | 비고 |
|------|------|------|
| `apps/api/src/status-prefix/infrastructure/status-prefix-config.orm-entity.ts` | `lastAppliedAt: Date \| null` 필드 추가 | 마이그레이션은 공통(Phase 0). owner 조율 §1.1 |
| `apps/api/src/status-prefix/application/status-prefix-config.service.ts` | `saveConfig` stamp 추가(L120~123 부근) + `reApply()` 신규 | 핵심 |
| `apps/api/src/status-prefix/infrastructure/status-prefix-config.repository.ts` | `updateMessageId` 시그니처 확장(옵션 B) 또는 `stampLastApplied` 추가 | 옵션 B 권장 |
| `apps/api/src/status-prefix/presentation/status-prefix.controller.ts` | POST `config` 응답 `lastAppliedAt` 추가 + `POST re-apply` 신규 | — |
| `apps/web/app/lib/status-prefix-api.ts` | `StatusPrefixConfig.lastAppliedAt` + `saveStatusPrefixConfig` 반환 + `reApplyStatusPrefix` 신규 | libs 미변경 |
| `apps/web/app/settings/guild/[guildId]/status-prefix/page.tsx` | 배지+버튼 배치, `handleReApply`, 저장 후 배지 갱신, `isPersisted` 상태 | 공통 컴포넌트 import |
| `apps/api/.../status-prefix-config.service.spec.ts` | 테스트 확장 | §3.1 |
| `apps/api/.../status-prefix-config.repository.integration-spec.ts` | 테스트 확장 | §3.2 |

**변경 없음(중요)**: `apps/bot/src/event/status-prefix/*` (stamp 는 API), `libs/bot-api-client/*`, `libs/shared/*`, `apps/web/app/components/settings/*`(Phase 0), `migrations/*`(Phase 0), `settings.common.apply.*` i18n(Phase 0).

---

## 5. 의존/순서

1. **Phase 0(공통 선행, 본 plan 외부)**: 단일 마이그레이션 + 4 ORM 컬럼(또는 본 plan §1.1 로 status_prefix 엔티티만) + 공통 컴포넌트 2개 + 상대시각 유틸 + `settings.common.apply.*` i18n.
2. **본 plan(Phase 1-A)**: Phase 0 머지 후 분기. API service/controller/repo/DTO → web api-client → web page → 테스트.
3. 다른 3개 도메인(sticky-message/role-panel/auto-channel) plan 과 **공유 파일 충돌 0**(F-7 매트릭스) — 자기 도메인 파일만 수정.

---

## 6. HITL 4분야 — 🔴 미결 없음

| 분야 | 판정 | 근거 |
|------|------|------|
| 법무 | 해당 없음 | 반영 시각은 설정 메타데이터, PII 아님(F-8) |
| 결제 | 해당 없음 | 변경 없음 |
| 권한 | 해당 없음 | 신규 스코프/봇 권한 없음. re-apply 도 기존 `JwtAuthGuard+GuildMembershipGuard` 동일(F-8) |
| DB 파괴적 | 해당 없음 | nullable 컬럼 추가만(Phase 0 마이그레이션). 기존 컬럼 불변(F-8) |

> 구현 단계 확정(게이트 아님): repository 옵션 A vs B → **B 권장**(트랜잭션 정합성). re-apply 신규 엔드포인트 → **신설 확정**(status-prefix 는 기존 publish 없음).

---

## manifest 갱신 필요

- **변경 종류**: (d) 변경 없음.
- status-prefix 도메인은 `feature-manifest.json` 에 이미 등재(`status: implemented`, `code.api`/`code.bot`/`code.web` 경로 실재). 본 작업은 기존 경로 내부 수정 + 기존 도메인 컨트롤러에 엔드포인트 1개 추가 + 기존 엔티티에 컬럼 1개 추가뿐 — **신규 `code.*` 경로 없음, status 변경 없음(이미 implemented), 신규 도메인 없음.**
- 참고: web 공통 컴포넌트 디렉터리 `apps/web/app/components/settings/` 신설은 **공통 선행작업(settings-apply-model 공통 plan)** 소관이며 status-prefix 도메인 manifest 와 무관.
- **manifest 갱신 필요 — 없음.**
