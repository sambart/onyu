---
description: 기능 수정/추가 자율 파이프라인 — 메인 세션 적극 개입 변형 (계획·구현 리뷰 게이트 + 회귀 진단 + S 직접 구현)
argument-hint: <기능명/요구사항 요약>
---

# 기능 수정/추가 작업 프롬프트 (메인 세션 적극 개입 변형)

> **본 커맨드는 `/feat-implement` 의 실험 변형이다.** 메인 세션(최신 모델)의 판단력을 검증·진단에 적극 투입하는 대신 토큰 소모가 증가한다. 토큰 소모 대비 효과 평가가 끝나기 전까지 원본 `/feat-implement` 는 수정하지 않는다.
>
> 원본(`feat-implement.md`) 대비 추가된 **메인 세션 적극 개입 4종**:
>
> 1. **Phase 3.4 — 계획 리뷰 게이트**: 메인이 plan.md 를 직접 Read 하여 PRD/usecase 정합 검증 후, 정제된 요약으로 Phase 3.5 진입
> 2. **Phase 4.5 — 구현 리뷰 게이트**: 메인이 `git diff` 를 직접 리뷰하여 plan 대비 일탈 + onyu 아키텍처 룰 위반 검증
> 3. **S 규모 메인 직접 구현**: 소규모 변경은 implementer 디스패치 없이 메인이 직접 Edit
> 4. **회귀 근본원인 진단**: Phase 6/6.5 실패 시 메인이 직접 분석하여 진단서를 작성한 뒤 implementer 에 전달 (테스트 결함이면 테스트 에이전트 재호출 분기)
>
> **원본에서 그대로 계승(보존)하는 onyu 고유 자산** — 본 변형은 이를 깨지 않는다:
>
> - **워크트리 격리(Phase 0 전)**: husky 9 + lint-staged 16 경합 차단. 동시 2건+ 실행 격리. (원본 동일 — 본 문서 해당 섹션 참조)
> - **조건부 Phase 3.5**: `🔴` 마커 또는 신규 도메인/path 미확정이 **없으면 정지하지 않고 자동 통과**. 본 변형의 Phase 3.4 는 3.5 **앞**에 삽입하되, 3.5 의 조건부 정지 성격을 유지한다 (모든 규모 강제 정지로 회귀시키지 않는다).
> - **전역 템플릿 조건부 스킬**(endpoint-spec-draft / edge-cases / qa-checklist), userflow/usecase 조건부 산출물, vitest+testcontainers 기반 E2E(Phase 6.5) — 모두 원본 그대로.
>
> Phase 번호는 원본과 동일하게 유지한다 (3.5 = 사용자 승인, 5 = quality-enforcer 검증, 6 = 테스트, 6.5 = E2E). 추가 게이트는 3.4 / 4.5 로 삽입.

## 작업 대상

사용자가 요청한 기능/요구사항:

$ARGUMENTS

> 위 입력에서 **기능명**과 **요구사항 요약**을 스스로 추출한다. 모호하면 Phase 0 진입 전 1회 질문한다.

## 실행 모드: 자율 연속 실행

> **이 프롬프트는 참조 문서가 아닌 실행 명령이다.**
> Phase 0 전(워크트리 격리, 시작 시 1회) → Phase 0(도메인+코드 표면적 resolve) → Phase 0.5(규모 판단) → 규모에 따라 필요한 Phase만 자율 실행한다.

### 자율 실행 규칙

1. **중단 금지**: 에이전트 호출 결과를 받은 즉시 다음 단계를 호출한다. 사용자에게 "결과를 보고하고 대기"하지 않는다.
2. **Phase 자동 전환**: 현재 Phase의 모든 단계가 완료되면, 사용자 확인 없이 다음 Phase로 진행한다. **메인 리뷰 게이트(Phase 3.4 / 4.5)도 자동 전환의 일부다** — 게이트 통과/재호출 여부는 메인이 스스로 판단하며 사용자에게 묻지 않는다 (Phase 3.5 조건부 사용자 승인은 별도 STOP).
3. **중간 보고 생략**: Phase 간 전환 시 사용자에게 "다음 단계로 진행할까요?"라고 묻지 않는다. TodoWrite로 진행 상황을 업데이트하는 것으로 충분하다.
4. **멈춰야 하는 경우 (HITL 게이트 — 강제)**:
   - (a) 회귀 규칙에 따른 **3회 연속 실패** 시
   - (b) **Phase 3.5(계획 확인)** 단계에서 **결정 대기 사안이 있을 때만** 사용자 승인 대기 — 아래 둘 중 하나라도 해당 시 정지 (원본 조건부 정지 계승):
     - 아래 (c) 의 `🔴` 마커(법무/결제/권한/DB 파괴적)가 산출물에 존재 (또는 Phase 3.4 메인 판독으로 마커 없이 발견한 동급 결정)
     - **신규 도메인/코드 path 결정**이 미확정(`status: not-started`·부분 entry — Phase 0-B 의 신규 path 확정 절차)
     - **둘 다 없으면 Phase 3.5 에서 정지하지 않는다** — 변경 요약(Phase 3.4 리뷰 결과 포함)만 비차단(non-blocking) 출력하고 곧장 Phase 4 로 자동 진행한다.
   - (c) 산출물에 **법무 / 결제 / 권한 / DB 파괴적 변경** 4 분야 결정이 `🔴` 마커로 포함된 경우
     - DB 파괴적 변경 예시: `DROP TABLE` / `DELETE FROM` / 컬럼 제거 / TypeORM destructive 마이그레이션 (`dropColumn` / `dropTable` / `down()` 강제 적용 등)
     - 권한: 인증/인가 정책 변경, 역할/스코프 신설·확대(예: super_admin / bot_operator role·scopes 모델 변경), JWT 발급 정책 변경 (`AuthService.createToken()` 의 권한 baked-in 로직 변경 포함)
     - 결제: 과금/환불/구독 상태 전이, 외부 결제 연동 호출 (봇 운영자 콘솔 `billing:manage` 등 향후 도메인)
     - 법무: 약관/개인정보/데이터 보관·삭제 정책에 영향을 주는 결정
   - 4 분야 `🔴` 마커 발견 시 메인 세션이 사용자에게 **명시 답변을 받기 전까지 후속 Phase 진행 금지**.
   - (d) **Phase 0 전(워크트리 격리)** 단계에서 브랜치명·경로 확인 시 (파이프라인 시작 시 1회 — `## Phase 0 전(前): 워크트리 격리` 섹션 참조)
5. **진행 추적**: 파이프라인 시작 시 TodoWrite로 전체 Phase를 등록하고(리뷰 게이트 3.4/4.5 포함), 각 단계 완료마다 상태를 갱신한다.
6. **산출물 마커 grep (각 Phase 끝 — 강제)**: 각 Phase 종료 직후 메인 세션은 해당 Phase 산출물 (`docs/specs/prd/*.md`, `docs/specs/userflow/*.md`, `docs/usecases/**/*.md`, `docs/specs/endpoint-spec/*.md`, `docs/specs/edge-cases/*.md`, `docs/specs/qa-checklist/*.md`, `docs/specs/database/*.md`, `docs/plans/**/*.md`) 을 `🔴` 키워드로 grep 한다. 매치 발견 시 4항(c) 게이트 발동 — 후속 Phase 진행 정지 + 사용자 보고 (해당 마커 라인 + 분야 분류 첨부). 또한 **메인 리뷰 게이트(Phase 3.4)에서 마커 없이 서술된 4 분야 결정을 발견한 경우에도 동일하게 게이트를 발동**한다 (grep 은 보조 신호, 메인 판독이 최종).

   #### 마커 컨벤션 (🔴 게이트 vs 🔒 정보성)
   - **🔴 = 결정 대기 (게이트)**: 법무/결제/권한/DB파괴적 4분야에서 **사용자 답변이 필요한 미결 사항**. grep 매치 시 후속 Phase 정지.
   - **🔒 = 정보성 민감 영역 (비게이트)**: 이미 구현·결정된 PII/권한/결제/DB 영역을 독자에게 알리는 표기. **게이트 대상 아님** — grep 은 🔴 만 본다.
   - 판단: 신규 기능에서 미결 결정이면 🔴, 기존 동작·민감 영역 설명이면 🔒. backfill(기존 구현 문서화)은 원칙적으로 🔒.

### 메인 세션 역할 (이 변형의 핵심)

| 역할                  | 원본 /feat-implement       | 본 변형                                    |
| --------------------- | -------------------------- | ------------------------------------------ |
| 디스패치 + Phase 전환 | ✅                         | ✅ (동일)                                  |
| 🔴 마커 grep          | ✅                         | ✅ + Phase 3.4 메인 판독 보강              |
| 워크트리 격리(Phase 0 전) | ✅                     | ✅ (동일 — 계승)                          |
| 계획 품질 검증        | ❌ (조건부 사용자 승인만)  | ✅ Phase 3.4 (plan ↔ PRD/usecase 정합)     |
| 구현 품질 검증        | ❌ (quality-enforcer 위임) | ✅ Phase 4.5 (diff ↔ plan + 아키텍처 룰)   |
| S 규모 구현           | implementer 디스패치       | ✅ 메인 직접 Edit                          |
| 회귀 시 실패 분석     | 실패 정보 합산 전달만      | ✅ 메인이 근본원인 진단서 작성 + 결함 분기 |

**분업 원칙은 유지한다**: 메인은 **판단**(분석 / 리뷰 / 진단), 에이전트는 **생산**(문서 / 코드 / 테스트 대량 작성). 메인이 리뷰 게이트에서 이슈를 발견해도 직접 광범위 수정하지 않고 담당 에이전트를 재호출한다 (S 규모 직접 구현은 작업량이 작아 허용되는 예외).

> 전역 템플릿(`~/.claude/CLAUDE.md`)의 "메인 세션 직접 코드 Edit 금지" 룰에 대해, **본 커맨드의 S 규모 직접 구현은 명시적 예외**다 (프로젝트 룰이 전역 룰에 우선 — onyu `CLAUDE.md` 의 agent 우선순위 §).

### 병렬 실행 최적화

- 독립적인 에이전트(예: tester + fe-tester, plan-writer × N)는 반드시 동시에 호출한다.
- 순차 의존이 있는 에이전트(예: prd-writer → userflow-writer, prd-writer → database-architect)는 앞선 결과를 받은 후 호출한다.

## 공통 규칙

- 각 단계는 이전 단계의 산출물을 명시적으로 참조한다.
- 문서 수정 시 기존 포맷과 컨벤션을 유지한다.
- 단계 실패 시 에러를 보고하고 해당 단계를 재시도한다. (최대 3회)
- 테스트 실패 시 구현 Phase로 회귀하여 수정한다.
- 3회 재시도 후에도 실패하면 사용자에게 보고하고 대기한다.

## Phase 0 전(前): 워크트리 격리 (동시 실행 대비 — 시작 시 1회 확인)

> **원본 `/feat-implement` 의 `## Phase 0 전(前): 워크트리 격리` 섹션을 그대로 따른다.** 본 변형은 이 단계를 변경하지 않는다 (계획된 사용자 개입 지점 — 자율 실행 규칙 4항(d)). 요약:
>
> - 파이프라인의 **첫 동작**. develop/main 또는 공유 워킹트리에서 실행 시 → `feature/<slug>` 브랜치 + `../onyu-<slug>` 워크트리를 **develop 에서 분기**하여 제안 → **사용자 확인(1회)** → `EnterWorktree`(또는 `git worktree add … -b … develop`) 진입 → 그 안에서 `pnpm install` 1회 → 이후 Phase 0~7 전체를 이 워크트리에서 실행.
> - husky 9 + lint-staged 16 경합으로 인한 변경 유실·타 커밋 혼입 위험을 원천 차단하기 위함이다.
> - 격리 단위는 "파이프라인 1건 전체"이지 "에이전트"가 아니다. 개별 에이전트에 `isolation:"worktree"` 를 붙이지 않는다 (단계 간 산출물 공유 필요).
> - Phase 7 커밋/PR 은 이 워크트리에서 수행. 워크트리 제거는 미커밋 변경 유실 방지를 위해 사용자 확인 후.

## Phase 0: 도메인 결정 & 코드 표면적 resolve

> 원본 `/feat-implement` 의 Phase 0 (0-A 도메인 결정 / 0-B 코드 표면적 resolve / 문서 참조 규칙 / status별 작업 모드 / 신규 path 결정 주체 / 에이전트 prompt 주입 룰)을 **그대로 따른다**. 도메인 목록은 `docs/specs/feature-manifest.json` 의 `domains` 키를 진실의 소스로 사용하고, `code.{ api, bot, web, sharedTypes, migrations, tests }` + `status` 를 resolve 한다. 아래는 본 변형의 추가 사항만 기술한다.

**브리핑 보강 (★ 본 변형 추가)**: 메인 세션은 `[코드 표면적]` 경로 블록에 더해, 작업과 관련된 **알려진 onyu 함정**(auto memory + 아래 목록의 해당 사항)을 해당 에이전트 prompt 에 1~3줄로 요약 주입한다. 에이전트가 같은 함정을 재탐색하는 비용을 줄이기 위함이다. **nexus 등 타 프로젝트의 함정을 복사 주입하지 않는다** — 아래는 onyu 실측 기준이다:

- **마이그레이션 경로는 `apps/api/src/migrations/` 다** (`apps/api/src/database/migrations/` 아님 — onyu 에는 그 경로가 없다). TypeORM datasource 가 스캔하는 인소스 경로를 벗어나면 prod 미실행. 신규 마이그레이션은 반드시 이 디렉토리에.
- **테스트 green 이어도 typecheck 는 별도다** — onyu 에 `typecheck` npm 스크립트가 없으므로, 변경 후 `npx tsc --noEmit -p apps/<app>/tsconfig.json`(api/bot/web 각각) 을 수동 실행해야 타입 회귀를 잡는다. (web 은 `pnpm --filter @onyu/web build` 로도 대체 가능)
- **봇→API 계약은 수기 SDK** (`libs/bot-api-client/`, auto-generated 아님) — API DTO/응답을 바꾸면 `libs/bot-api-client` 와 `libs/shared`(`@onyu/shared`) 공유 타입을 **수기로 동기화**해야 한다. 한쪽만 바꾸면 런타임 불일치.
- **관리자/cross-guild 인가는 `@Roles`/RolesGuard 가 아니다** — onyu 는 `SuperAdminGuard` / `GuildMembershipGuard` 가 JWT `req.user.isSuperAdmin` 을 검증한다. 슈퍼관리자는 GET 만 통과(non-GET 403, `guild-membership.guard.ts`). 권한 판별은 `AuthService.createToken()` 에서 JWT 에 baked-in. (role+scopes DB 전환은 `docs/plans/auth-admin-db-role-review.md` 로 진행 중 — 관련 작업 시 이 문서 우선 참조.)
- **봇 앱은 Discord.js** (`apps/bot/`) — 슬래시 커맨드/이벤트 핸들러/스케줄러 구조. 진입점이 HTTP 가 아니라 Discord 인터랙션·이벤트임을 전제로 브리핑.
- **i18n 키 동기화** — 사용자 노출 문자열 변경 시 `libs/i18n/locales/{ko,en}/{bot,web}` 양 로케일 동시 갱신 (ko 만 바꾸면 en 누락).

## Phase 0.5: 작업 규모 판단

도메인/코드 표면적 resolve 직후, 요구사항의 규모를 판단하여 **불필요한 Phase를 스킵**한다.

| 규모  | 조건 (하나 이상 해당)                                                 | 실행 Phase                                                                                  | 스킵 세부 규칙                                                                           |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **S** | 버그 수정, 텍스트/스타일 변경, 설정값 수정, 기존 API 파라미터 추가    | 0전 → 0 → 0.5 → 3.5(요약) → **4(메인 직접★)** → **4.5(셀프★)** → 5 → 6 → [6.5] → 7          | Phase 1·2·3.4 스킵. 기존 plan이 있으면 Phase 3도 스킵. DB 변경 없음 전제. Phase 6.5: 보통 스킵하되 auth 등 트리거 시 실행 |
| **M** | 기존 기능 수정/개선, 새 엔드포인트 1~2개, 기존 페이지에 컴포넌트 추가 | 0전 → 0 → 0.5 → 1(선택) → 2(조건부) → 3 → **3.4★** → 3.5 → 4 → **4.5★** → 5 → 6 → 6.5(조건부) → 7 | Phase 1: PRD/userflow 변경 필요 시만. Phase 2: DB 변경 없으면 critic+migration 스킵. Phase 6.5: 인증·인가/cross-app 트리거 시만(기본 스킵) |
| **L** | 신규 기능 추가, DB 스키마 변경, 새 모듈/도메인 생성                   | 0전 → 0 → 0.5 → 1 → 2 → 3 → **3.4★** → 3.5 → 4 → **4.5★** → 5 → 6 → 6.5(조건부) → 7         | 전체 실행. Phase 6.5: 트리거 조건 충족 시만                                              |

- **판단 불가 시**: M으로 시작하고, Phase 진행 중 DB 변경이나 신규 모듈이 필요하면 L로 격상한다.
- **사용자가 규모를 명시한 경우** 해당 규모를 따른다.
- Phase 3.5 의 **변경 요약 출력**은 모든 규모에서 유지한다 (단, S는 짧게 제시). 다만 **사용자 승인 대기(정지)는 결정 대기 사안이 있을 때만** 발동한다 — `🔴` 마커 또는 신규 도메인/path 미확정이 없으면 요약만 출력하고 자동으로 Phase 4 로 진행한다(자율 실행 규칙 4항(b) — 원본 조건부 정지 계승).
- **userflow(1-b) / usecase(4-u) 는 규모와 무관하게 각자의 조건부 규칙을 우선 적용한다** (원본 동일).
- **Phase 6.5(E2E 검증)도 규모와 무관하게 조건부다** — 인증·인가 플로우 변경 / cross-app usecase 생성 / web 핵심 라우팅·사용자 흐름 변경 트리거 중 하나라도 해당 시 실행 (원본 동일).

## 실행 파이프라인

### Phase 1: 문서 작성 (M 선택적 / L 필수)

> 원본 `/feat-implement` Phase 1 과 동일 — [prd-writer] → 1-b [userflow-writer] (조건부: user-facing 표면 — `code.web` 변경 또는 인터랙티브 Discord 커맨드/상호작용일 때만. 순수 백그라운드/스케줄러/이벤트는 스킵).

### Phase 2: 설계 (M 조건부 / L 필수)

> 원본 `/feat-implement` Phase 2 와 동일 — [database-architect] → [database-critic](DB 변경 시) → [Migration 계획 작성](조건부) ∥ 4-u [usecase-writer](조건부: 2+ 앱 cross-app 통합) / 4-e [Skill: `planner-endpoint-spec-draft`](조건부: BE 엔드포인트 신규/변경).
> 마이그레이션 계획에 DB 파괴적 변경 포함 시 `🔴` 마커 — Phase 2 종료 grep 게이트 발동 (원본 동일).
> 마이그레이션 계획 작성 시 **경로는 `apps/api/src/migrations/<timestamp>-<Name>.ts`** 로 명시한다 (Phase 0 함정 참조 — implementer 가 그 경로로 생성).

### Phase 3: 계획 (S 조건부 / M·L 필수)

> 원본 `/feat-implement` Phase 3 과 동일 — [common-task-planner](다중 도메인 시) / [plan-writer] × N (병렬) / 6-edge [Skill: `planner-edge-cases`](조건부) / 6-qa [Skill: `planner-qa-checklist`](L 권장).
> `status: not-started`/부분 entry 도메인은 plan.md "manifest 갱신 필요" §에 신규 코드 path(`apps/api/src/{도메인}/`, `apps/bot/src/{도메인}/`, `apps/web/app/{도메인}/` 패턴) 1차 제안.

### Phase 3.4: 계획 리뷰 게이트 (메인 세션 직접 수행, M·L) ★ 본 변형 추가

메인 세션이 plan-writer 산출물을 **직접 Read** 하여 검증한다. 계획 단계의 오류는 하류(구현·테스트)로 증폭되므로, 여기서 잡는 것이 가장 저렴하다. **Phase 3.5(조건부 사용자 승인) 직전에 수행** — 사용자에게는 메인 검증을 통과한 정제된 계획만 제시한다.

**입력**: plan.md × N + PRD + usecase 문서 (+ 있으면 edge-cases / endpoint-spec / database 설계)

**점검 항목**:

1. **요구사항 커버리지**: PRD/usecase 의 요구사항 중 어떤 plan 에도 매핑되지 않은 항목이 있는가
2. **정합성**: plan 간 충돌 (같은 파일을 다른 방식으로 수정 / API 계약 불일치 — DTO ↔ `@onyu/shared` ↔ `libs/bot-api-client` 수기 계약 3자 정합 포함), plan ↔ DB 설계 불일치
3. **과잉 설계**: 요구사항에 없는 기능·추상화가 plan 에 포함됐는가 (3회 반복 전 DRY 지양 원칙)
4. **경로 검증**: plan 의 모든 신규/수정 경로가 Phase 0-B 코드 표면적 안에 있는가 + 마이그레이션 경로가 `apps/api/src/migrations/` 인가
5. **HITL 재판독**: 🔴 마커 없이 서술된 법무/결제/권한/DB 파괴적 변경 결정이 있는가 (발견 시 즉시 HITL 게이트 발동 — 자율 실행 규칙 6항)

**판정**:

- 이슈 없음 → Phase 3.5 진행
- 이슈 있음 → **plan-writer 1회 재호출** (지적사항을 항목별로 명시). 재호출 후에도 남는 **경미한** 이슈는 Phase 4 implementer prompt 에 "주의사항" 으로 주입하고 진행 (게이트에서 무한 반복 금지 — 재호출 한도 1회)
- 메인이 plan 문서를 직접 수정하지 않는다 (판단/생산 분업 원칙)

### Phase 3.5: 계획 확인 (조건부 사용자 승인)

> **조건부 사용자 개입 지점이다.** (자율 실행 규칙 4항(b)) — 원본 `/feat-implement` Phase 3.5 의 **조건부 정지**를 계승한다. 모든 규모 강제 정지가 아니다.

- Phase 1~3 산출물(PRD, DB 스키마, 마이그레이션 계획, 구현 계획)을 요약한다. **Phase 3.4 리뷰 결과(발견 이슈 + 보정 내역)를 요약에 포함**한다.
- 요약 항목: 변경/추가된 PRD 내용 · DB 스키마 변경 · 마이그레이션 계획 · 모듈별 구현 계획 목록 · 신규 도메인/코드 path 제안(`not-started`·부분 entry 케이스)
- **정지 여부 판정 (HITL 게이트 연계)**: 다음 두 조건 중 하나라도 해당하면 **정지하고 사용자 답변을 받는다**.
  1. Phase 1~3 산출물에 `🔴` 마커(또는 Phase 3.4 메인 판독으로 발견한 동급 결정)가 존재 — 일반 계획 승인과 **별도로 해당 결정을 명시적으로 짚어** 답변을 받는다.
  2. **신규 도메인/코드 path 미확정**(`not-started`·부분 entry) — 도메인 구조 결정은 후속 사이클에 영향을 주므로 사용자 확정이 필요하다.
- **두 조건이 모두 없으면 정지하지 않는다 (자동 통과)**: 변경 요약(Phase 3.4 결과 포함)을 비차단으로 출력만 하고, 곧장 Phase 4로 진행한다.
- 정지한 경우: 승인 → Phase 4 / 수정 요청 → 해당 Phase 복귀 후 Phase 3.4 → 3.5 재진입.

### Phase 4: 구현 (전 규모)

- **M·L 규모**: [implementer] × N (병렬, 계획 단위) → 출력: 변경된 코드
  - 마이그레이션이 있으면 implementer가 Entity 작성/수정(`apps/api/src/**/infrastructure/*.orm-entity.ts`) + `migration:generate`/`migration:run` 실행까지 단독 수행한다. **신규 마이그레이션 파일은 `apps/api/src/migrations/`** 에 생성 (실행 명령은 implementer.md 참조).
  - **권한 fallback (필수)**: sub-agent 디스패치 시 Edit/Write 거부 발생 시 (Claude Code sub-agent 권한 모델 한계 — implementer.md "실행 환경 주의" § 참조), 즉시 재시도 없이 메인 세션이 implementer 역할을 직접 수행한다. 동일 sub-agent 재호출은 비결정성 증가만 초래.
- **S 규모: 메인 세션 직접 구현** ★ 본 변형 추가
  - implementer 디스패치 없이 메인이 직접 Edit/Write 한다. 에이전트 브리핑 작성 비용이 작업 자체보다 큰 규모이기 때문.
  - **조건**: 예상 변경 파일 ≤ 3개 + 모든 변경이 코드 표면적 내 + DB 변경 없음. 작업 중 이 조건을 벗어나면 (파일 4개 이상 / 신규 모듈 필요 / DB 변경 발생) **즉시 중단하고 M 으로 격상** → plan-writer → 3.4 → 3.5 → implementer 디스패치 경로로 전환
  - implementer.md 의 구현 원칙(코드 컨벤션 / 마이그레이션 룰 / manifest 갱신 책임)을 메인이 동일하게 따른다
  - **마무리 검증**: 직접 구현 후 `tsc --noEmit`(해당 앱) + 관련 lint 를 메인이 수동 실행 (typecheck 함정 — Phase 0 참조)

### Phase 4.5: 구현 리뷰 게이트 (메인 세션 직접 수행, 전 규모) ★ 본 변형 추가

Phase 5 진입 전, 메인 세션이 변경분을 **직접 리뷰**한다. 테스트가 잡지 못하는 종류의 결함(아키텍처 룰 위반 / plan 일탈)을 잡는 단계다.

> **Phase 5(quality-enforcer)와의 분업**: Phase 4.5 는 메인의 **판단** 게이트 — plan 일탈 / 아키텍처 룰 / 코드 표면적 이탈 등 **구조적 결함**을 본다. Phase 5 quality-enforcer 는 스타일·컨벤션(ESLint 외 수동 확인 항목) 검수·수정의 **생산** 단계다. Phase 4.5 에서 발견한 경미한 컨벤션 이슈는 재호출 없이 Phase 5 brief 에 넘긴다.

**절차**: `git diff` (+ `git status` 로 신규 파일 확인) 를 직접 Read. diff 가 큰 경우 파일 목록을 먼저 보고 위험 파일(엔티티/마이그레이션 / 인증·인가 가드 / 공유 패키지(`libs/shared`·`libs/bot-api-client`) / 공용 컴포넌트 / i18n) 위주로 선별 리뷰.

**점검 항목 (onyu 기준)**:

1. **plan 대비 누락/일탈**: plan 에 명시된 변경이 모두 구현됐는가, plan 에 없는 변경이 섞였는가
2. **아키텍처 룰** (onyu — `CLAUDE.md` + `docs/guides/architecture-*` + Workspace Map):
   - **DDD-스타일 레이어 준수** — controller(`presentation`)에 비즈니스 로직이 없는가, 의존 방향(`presentation → application → infrastructure`)이 깨지지 않았는가, repository 접근이 `infrastructure` 에 격리됐는가
   - **관리자/cross-guild 엔드포인트에 `SuperAdminGuard` / `GuildMembershipGuard` 가 적용됐는가** (onyu 는 `@Roles`/RolesGuard 미사용 — JWT `isSuperAdmin` 검증. 슈퍼관리자 non-GET 403 강제 유지 여부 확인). 권한/JWT 발급 로직 변경 시 `docs/plans/auth-admin-db-role-review.md` 결정과 정합한가
   - **봇→API 계약 정합** — API DTO/응답 변경이 `libs/bot-api-client` + `@onyu/shared` 에 수기 동기화됐는가 (한쪽만 바뀌면 런타임 불일치)
   - DTO 에 class-validator 데코레이터가 있는가
   - 마이그레이션이 `apps/api/src/migrations/<ts>-<Name>.ts` 인소스 경로인가 (`database/migrations` 는 onyu 에 없는 경로), destructive 변경에 🔴 마커 없이 포함되지 않았는가
   - i18n 사용자 노출 문자열이 ko/en 양쪽에 추가됐는가
3. **코드 표면적 이탈**: Phase 0-B 경로 밖 변경이 없는가
4. **코드 컨벤션 명백 위반**: floating promise / 빈 catch / `console.log`(no-console) / `any` 남용 / 이유 주석 없는 `as` 단언 등 (`CLAUDE.md` Code Style 의 수동 확인 항목)

**판정**:

- 이슈 없음 → Phase 5 진행
- 이슈 있음 → **implementer 1회 재호출** (수정 지시서: 파일·위치·위반 룰·수정 방향 명시). **이 재호출은 Phase 6 실패 카운트에 포함하지 않는다** (테스트 실패가 아니므로). 한도 1회 — 재호출 후 잔여 경미 이슈는 Phase 5 quality-enforcer brief 에 넘기고 진행하되 Phase 7 보고에 기록
- **S 규모(메인 직접 구현)의 경우**: 별도 재호출 없이 메인이 위 점검 항목을 셀프 체크리스트로 검토 후 직접 수정

### Phase 5: 검증 (전 규모)

> 원본 `/feat-implement` Phase 5 와 동일 — [quality-enforcer] × N (병렬, 구현 단위): 코드 스타일/컨벤션(ESLint 자동 강제 외 수동 확인 항목 — `docs/guides/code-style-guide.md`) 검수 및 명백 결함 수정. Phase 4.5 에서 넘긴 경미 컨벤션 이슈를 brief 에 포함한다.

### Phase 6: 테스트 (전 규모)

> 원본 `/feat-implement` Phase 6 의 실행 규칙(Barrier / 테스트 에이전트는 구현 코드 미수정 / 회귀 시 합산 호출 / 회귀 후 전체 재실행 / 3사이클 실패 카운트)을 따른다. 본 변형의 추가/변경점은 **회귀 전 메인 진단**이다.

테스트 작성 및 실행 (병렬):

```
├── [tester] → BE 단위/통합 테스트 (Vitest, `apps/api/**/*.spec.ts`, `apps/bot/**/*.spec.ts`)
│   - 입력: 구현된 코드 + PRD + plan + (있으면) usecase / edge-cases / qa-checklist
│
└── [fe-tester] → FE 테스트 (조건: `apps/web` 변경 시에만, Testing Trophy)
    - 입력: 구현된 코드 + (있으면) userflow / usecase / edge-cases / qa-checklist
```

#### Phase 6 실행 규칙 (원본 + 본 변형 ★)

1. **합류 후 판단 (Barrier)**: tester와 fe-tester를 **병렬 호출**하되, **둘 다 완료 후** 결과를 합산하여 판단한다.
2. **회귀 전 메인 진단 (★ 본 변형 추가)**: 실패 시 implementer 를 곧바로 재호출하지 않고, 먼저 메인 세션이 **근본원인 진단**을 수행한다 (아래 "회귀 규칙" § 참조).
3. **테스트 에이전트는 구현 코드를 수정하지 않는다**: 구현 버그 발견 시 실패 보고서만 출력. 실제 수정은 Phase 4 회귀 시 implementer.
4. **회귀 시 합산 호출**: 하나 이상 실패 시 implementer 를 **1회만 호출**하되, 양쪽 실패 정보 + 메인 진단서를 모두 전달한다.
5. **회귀 후 전체 재실행**: Phase 4 회귀로 구현이 수정되면 Phase 5 + Phase 6 를 **전체 재실행**한다 (통과했던 쪽 포함). **Phase 4.5 게이트는 회귀 시 재실행하지 않는다 — 진단서가 그 역할을 대체.**
6. **실패 카운트**: 3회 제한은 **Phase 6 사이클 기준**. 3사이클 실패 시 사용자 보고.

#### Phase 6 판정 흐름

```
[tester] ──┐
           ├── 둘 다 완료 대기 (Barrier)
[fe-tester]┘
           │
           ├── 둘 다 성공 → Phase 6.5(E2E, 조건부) 또는 Phase 7로 진행
           ├── 하나 이상 실패 → 메인 근본원인 진단★ → 진단 결과에 따라:
           │     ├── 구현 결함 → Phase 4 회귀 (implementer 1회 호출 + 진단서)
           │     └── 테스트 결함 → 해당 테스트 에이전트 재호출 (테스트 수정 지시, 구현 회귀 아님)
           └── 회귀 후 → Phase 5(검증) + Phase 6(테스트) 전체 재실행
```

### Phase 6.5: E2E 검증 (조건부)

> 원본 `/feat-implement` Phase 6.5 와 동일 — [e2e-checker], **조건부**(인증·인가 플로우 변경 / cross-app usecase / web 핵심 라우팅 흐름 변경 시만, 규모 무관, auth 변경 우선 트리거). 인프라: **vitest + testcontainers** (`apps/api/vitest.config.e2e.ts`, `pnpm --filter @onyu/api test:e2e`, Docker 필요). web 은 Playwright 미도입 — `code.web` 트리거인데 Playwright 없으면 임의 도입 말고 API 레벨까지 검증 + "Playwright 도입 필요" 미해결 보고.
> **본 변형의 변경점**: 실패 시 곧바로 회귀하지 않고 **메인 근본원인 진단★** 수행 후 Phase 4 회귀(진단서 전달) → 회귀 후 Phase 5+6 전체 재실행.

### Phase 7: 완료 (전 규모)

11. 변경 요약 출력
    - 수정된 파일 목록
    - 추가된 테스트 수 (Unit / Integration / E2E, 통과 현황)
    - 주요 변경 사항 요약
    - **메인 개입 리포트 (★ 본 변형 추가 — 토큰 대비 효과 평가용)**:
      - Phase 3.4 발견 이슈 수 + 내용 요약 (plan-writer 재호출 여부)
      - Phase 4.5 발견 이슈 수 + 내용 요약 (implementer 재호출 여부)
      - 회귀 진단 횟수 + 진단이 구현/테스트 결함 중 무엇으로 판정됐는지
      - S 규모 직접 구현 여부
      - 게이트에서 아무것도 발견하지 못한 경우 그 사실도 기록 (효과 없음 데이터도 평가에 필요)

12. **manifest 갱신 (필수)**: 신규 도메인 생성 / `status` 변경 / `code.*` 경로 신설·이동 시 `docs/specs/feature-manifest.json` 갱신 (code 키: api/bot/web/sharedTypes/migrations/tests). 갱신 주체는 implementer(Phase 4), **메인 세션은 결과 JSON 유효성 검증만** 수행한다 (직접 Edit X). **단, S 규모 메인 직접 구현 시에는 메인이 갱신 주체**다.

---

## 회귀 규칙

### 메인 근본원인 진단 (★ 본 변형 추가 — Phase 6/6.5 실패 시 공통 선행 단계)

implementer 재호출 **전에** 메인 세션이 직접 수행한다:

1. **직접 Read**: 실패한 테스트의 출력(에러 메시지/assertion diff) + 해당 테스트 코드 + 관련 구현 코드
2. **진단서 작성** (implementer 재호출 prompt 에 포함):

```
[근본원인 진단서]
- 근본원인: [증상이 아닌 원인 — 파일:라인 수준]
- 수정 대상: [파일 경로 + 위치 + 수정 방향]
- 건드리지 말 것: [현재 통과 중인 테스트가 의존하는 코드/동작 — 회귀 루프 방지]
- 알려진 함정: [해당 시 — tester green 이어도 tsc --noEmit 별도 실행 필요,
  마이그레이션은 apps/api/src/migrations/ 만 실행됨, 봇→API 계약은 bot-api-client+@onyu/shared 수기 동기화,
  i18n ko/en 양쪽 갱신, 인가는 SuperAdminGuard/GuildMembershipGuard(@Roles 아님) 등]
```

3. **테스트 결함 판정**: 진단 결과 구현이 아니라 **테스트 자체가 잘못된 경우** (PRD/usecase 와 다른 기대값 / 잘못된 mock / 환경 의존 / 기존 실패 테스트를 신규 회귀로 오인), implementer 회귀 대신 해당 테스트 에이전트(tester/fe-tester)를 재호출하여 테스트를 수정한다. 이 경우도 실패 카운트에는 포함한다.
4. 진단이 불확실하면 가설 1~2개를 진단서에 명시하고 implementer 회귀로 진행한다 (진단에서 무한 시간 소모 금지).

### Phase 6 (테스트) 실패 시

```
Phase 6 실패 → 메인 근본원인 진단 → 양쪽 결과 합산 → Phase 4 [implementer] 1회 재호출
- 전달 정보: 원래 plan 문서 경로 + [메인 진단서] + tester/fe-tester 실패 상세(파일·예상/실제·수정 대상 소스)
- 목표: 양쪽 테스트를 모두 통과하도록 구현 수정
- 수정 후: Phase 5 + Phase 6 전체 재실행 (tester + fe-tester 양쪽)
```

### Phase 6.5 (E2E) 실패 시

```
Phase 6.5 실패 → 메인 근본원인 진단 → Phase 4 [implementer] 재호출
- 전달 정보: 원래 plan 문서 경로 + [메인 진단서] + 실패 시나리오/로그 + 수정 대상 소스(e2e-checker 식별)
- 목표: E2E 시나리오 통과하도록 구현 수정
- 수정 후: Phase 5(검증) + Phase 6(테스트) 전체 재실행부터 다시 시작
```

### 실패 카운트 규칙

- **Phase 6**: 3회 제한은 Phase 6 사이클(tester + fe-tester 합산) 기준. 테스트 결함 판정으로 테스트 에이전트를 재호출한 경우도 포함.
- **Phase 6.5**: 3회 제한은 Phase 6.5 단독 기준이며 Phase 6 카운트와 별도. Phase 6.5 회귀로 Phase 5+6 재실행 시 Phase 6 카운트는 리셋하지 않고 누적.
- **리뷰 게이트(3.4 / 4.5)의 재호출은 실패 카운트에 포함하지 않는다** (각 게이트 자체 한도 1회로 별도 제한).

### 실패 보고 템플릿

```
- 실패한 Phase: [Phase N]
- 실패한 에이전트: [에이전트명 (복수 가능)]
- 에러 요약: [에러 메시지 또는 실패 테스트 목록]
- 시도한 수정 내용: [1차/2차/3차 시도 요약]
- 메인 진단 이력: [각 회차 진단서 요약 — 진단이 빗나간 경우 그 사실 명시]
- 추정 원인: [근본 원인 분석]
- 연관 이슈: [BE 수정이 FE/봇을 깨뜨린 경우 등 교차 영향 명시]
```

---

## 파이프라인 시각화

```
[워크트리격리] → [도메인+코드 resolve] → [규모 판단] ──► [문서] ──► [설계] ──► [계획] ──► [계획리뷰★] ──STOP?──► [계획 확인] ──► [구현] ──► [구현리뷰★] ──► [검증] ──► [테스트] ──► [E2E] ──► [완료]
   Phase 0전          Phase 0            Phase 0.5     Phase 1   Phase 2   Phase 3   Phase 3.4         Phase 3.5      Phase 4    Phase 4.5     Phase 5    Phase 6   Phase 6.5  Phase 7
  develop 분기       manifest에서       S/M/L 판단    prd-writer db-arch  common-   메인 직접 Read   조건부 정지     M·L: impl  메인 git diff  quality-   tester ─┐ e2e-checker 변경 요약
  전용 워크트리      도메인+문서+code   → Phase 스킵   userflow?  db-critic? task-pl? (정합/누락/HITL) 🔴/신규path시만  ×N(병렬)   리뷰(plan일탈  enforcer   fe-tester┘(조건부)  + 메인 개입
  +브랜치(1회확인)   +status resolve   + 함정 브리핑★            migration plan-    이슈→plan-writer (요약→조건부정지) S: 메인직접★ /아키룰/표면적) ×N(병렬)  Barrier            리포트★
                                                     usecase?   계획      writer×N 재호출(한도1회)                  +권한fallback 이슈→impl                 │              + manifest
                                                     (병렬)                                                                     재호출(한도1회) 실패→메인진단★          갱신
                                                                                                                                              →구현/테스트 결함분기

  ※ AUTO = 사용자 확인 없이 자동 전환 (Phase 간 기본) / STOP = 조건부 사용자 승인(Phase 3.5 — 🔴 또는 신규path 시만) / ★ = 본 변형 추가 메인 개입 지점
  ※ 워크트리 격리(Phase 0전): 동시 2건+ 경합 차단 — develop 에서 전용 워크트리+브랜치(1회 확인) → Phase 0~7 전체를 그 안에서 실행 (원본 계승)
  ※ HITL 게이트: 각 Phase 끝 산출물 🔴 grep + Phase 3.4 메인 판독 → 법무/결제/권한/DB파괴적 발견 시 후속 Phase 정지 + 사용자 보고
  ※ 규모: S = Phase 1·2·3.4 스킵 + Phase 4 메인 직접 구현 + Phase 4.5 셀프 체크 / M = Phase 1 선택·Phase 2 조건부 / L = 전체 (Phase 0.5 표 참조)
  ※ 권한 fallback: implementer 등 sub-agent Edit/Write 거부 시 메인 세션이 직접 수행
  ※ onyu 함정(브리핑★): 마이그레이션 apps/api/src/migrations/ · typecheck 별도(tsc --noEmit) · 봇→API 계약 수기동기화(bot-api-client+@onyu/shared) · 인가 SuperAdminGuard(@Roles 아님) · i18n ko/en 양쪽
  ※ 테스트(Phase 6): Barrier → 합산 판정 → 실패 시 메인 진단★ → 구현 결함이면 Phase 4 회귀(진단서), 테스트 결함이면 테스트 에이전트 재호출 → Phase 5+6 전체 재실행 (최대 3사이클)
  ※ E2E(Phase 6.5): 조건부(인증·인가/cross-app/web 라우팅, vitest+testcontainers) → 실패 시 메인 진단★ → Phase 4 회귀 → Phase 5+6 재실행. web 은 Playwright 미도입(향후)
  ※ 3회 초과 실패 시 사용자 보고 (리뷰 게이트 재호출은 카운트 제외, 게이트 자체 한도 1회)
```
