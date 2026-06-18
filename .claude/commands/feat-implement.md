---
description: 기능 수정/추가 자율 파이프라인 (Phase 0~7, 규모 판단 + HITL 게이트)
argument-hint: <기능명/요구사항 요약>
---

# 기능 수정/추가 작업 프롬프트

## 작업 대상

사용자가 요청한 기능/요구사항:

$ARGUMENTS

> 위 입력에서 **기능명**과 **요구사항 요약**을 스스로 추출한다. 모호하면 Phase 0 진입 전 1회 질문한다.

## 실행 모드: 자율 연속 실행

> **이 프롬프트는 참조 문서가 아닌 실행 명령이다.**
> Phase 0 전(워크트리 격리, 시작 시 1회) → Phase 0(도메인 결정) → Phase 0.5(규모 판단) → 규모에 따라 필요한 Phase만 자율 실행한다.

### 자율 실행 규칙
1. **중단 금지**: 에이전트 호출 결과를 받은 즉시 다음 단계를 호출한다. 사용자에게 "결과를 보고하고 대기"하지 않는다.
2. **Phase 자동 전환**: 현재 Phase의 모든 단계가 완료되면, 사용자 확인 없이 다음 Phase로 진행한다.
3. **중간 보고 생략**: Phase 간 전환 시 사용자에게 "다음 단계로 진행할까요?"라고 묻지 않는다. TodoWrite로 진행 상황을 업데이트하는 것으로 충분하다.
4. **멈춰야 하는 경우 (HITL 게이트 — 강제)**:
   - (a) 회귀 규칙에 따른 **3회 연속 실패** 시
   - (b) **Phase 3.5(계획 확인)** 단계에서 사용자 승인 대기 시 (단, 아래 (c) 게이트 발동 시 우선 정지)
   - (c) 산출물에 **법무 / 결제 / 권한 / DB 파괴적 변경** 4 분야 결정이 `🔴` 마커로 포함된 경우
     - DB 파괴적 변경 예시: `DROP TABLE` / `DELETE FROM` / 컬럼 제거 / TypeORM destructive 마이그레이션 (`dropColumn` / `dropTable` / `down()` 강제 적용 등)
     - 권한: 인증/인가 정책 변경, 역할/스코프 신설·확대, 토큰 발급 정책 변경
     - 결제: 과금/환불/구독 상태 전이, 외부 결제 연동 호출
     - 법무: 약관/개인정보/데이터 보관·삭제 정책에 영향을 주는 결정
   - 4 분야 `🔴` 마커 발견 시 메인 세션이 사용자에게 **명시 답변을 받기 전까지 후속 Phase 진행 금지**.
   - (d) **Phase 0 전(워크트리 격리)** 단계에서 브랜치명·경로 확인 시 (파이프라인 시작 시 1회 — `## Phase 0 전(前): 워크트리 격리` 섹션 참조)
5. **진행 추적**: 파이프라인 시작 시 TodoWrite로 전체 Phase를 등록하고, 각 단계 완료마다 상태를 갱신한다.
6. **산출물 마커 grep (각 Phase 끝 — 강제)**: 각 Phase 종료 직후 메인 세션은 해당 Phase 산출물 (`/docs/specs/prd/*.md`, `/docs/specs/userflow/*.md`, `/docs/usecases/**/*.md`, `/docs/specs/endpoint-spec/*.md`, `/docs/specs/edge-cases/*.md`, `/docs/specs/qa-checklist/*.md`, `/docs/specs/database/*.md`, `/docs/plans/**/*.md`) 을 `🔴` 키워드로 grep 한다. 매치 발견 시 4항(c) 게이트 발동 — 후속 Phase 진행 정지 + 사용자 보고 (해당 마커 라인 + 분야 분류 첨부).

   #### 마커 컨벤션 (🔴 게이트 vs 🔒 정보성)
   - **🔴 = 결정 대기 (게이트)**: 법무/결제/권한/DB파괴적 4분야에서 **사용자 답변이 필요한 미결 사항**. grep 매치 시 후속 Phase 정지.
   - **🔒 = 정보성 민감 영역 (비게이트)**: 이미 구현·결정된 PII/권한/결제/DB 영역을 독자에게 알리는 표기. **게이트 대상 아님** — grep 은 🔴 만 본다.
   - 판단: 신규 기능에서 미결 결정이면 🔴, 기존 동작·민감 영역 설명이면 🔒. backfill(기존 구현 문서화)은 원칙적으로 🔒.

### 에이전트 호출 패턴
```
# 잘못된 패턴 (❌): 호출 후 보고하고 멈춤
에이전트 A 호출 → 결과 수신 → "A가 완료되었습니다. 다음으로 진행할까요?" → [사용자 대기]

# 올바른 패턴 (✅): 호출 후 즉시 다음 단계 진행
에이전트 A 호출 → 결과 수신 → TodoWrite 갱신 → 에이전트 B 즉시 호출 → ...
```

### 병렬 실행 최적화
- 독립적인 에이전트(예: plan-writer × N)는 반드시 동시에 호출한다.
- 순차 의존이 있는 에이전트(예: prd-writer → database-architect)는 앞선 결과를 받은 후 호출한다.

## 공통 규칙
- 각 단계는 이전 단계의 산출물을 명시적으로 참조한다.
- 문서 수정 시 기존 포맷과 컨벤션을 유지한다.
- 단계 실패 시 에러를 보고하고 해당 단계를 재시도한다. (최대 3회)
- 테스트 실패 시 구현 Phase로 회귀하여 수정한다.
- 3회 재시도 후에도 실패하면 사용자에게 보고하고 대기한다.

## Phase 0 전(前): 워크트리 격리 (동시 실행 대비 — 시작 시 1회 확인)

> **계획된 사용자 개입 지점이다** (자율 실행 규칙 4항(d)). 파이프라인의 **첫 동작**이며, 도메인 resolve(Phase 0)보다 먼저 수행한다.

여러 컨텍스트에서 feat-implement 를 **동시에 2건 이상** 실행하면 같은 워킹트리를 공유해 브랜치 전환·stash·lint-staged 가 경합한다 (onyu 는 husky 9 + lint-staged 16 사용 — commit-msg 훅 + lint-staged 경합 시 변경 유실·타 커밋 혼입 위험). 이를 원천 차단하기 위해 **각 실행을 전용 git 워크트리 + 전용 브랜치에 격리**한다.

> **격리 단위는 "파이프라인 1건 전체"이지 "에이전트"가 아니다.** 개별 에이전트(implementer / tester / fe-tester 등)에는 `isolation:"worktree"` 옵션을 붙이지 않는다 — feat-implement 의 단계들은 독립 작업이 아니라 한 기능의 연속 단계라, 앞 단계 산출물(implementer)을 뒷 단계(tester / fe-tester)가 **같은 워킹트리에서 읽어야** 하기 때문이다. 에이전트별 임시 워크트리는 이 단계 간 데이터 흐름을 끊는다.

### 동작

1. **상태 확인**: 현재 브랜치(`git rev-parse --abbrev-ref HEAD`)와 변경 상태(`git status --porcelain`)를 읽는다.
   - 이미 **전용 작업 브랜치의 독립 워크트리**에서 실행 중이고 다른 feat-implement 와 폴더를 공유하지 않으면 → 격리 생략, 곧장 Phase 0 진행.
   - **develop/main 또는 다른 실행과 공유되는 워킹트리**면 → 아래 2~4 수행.
2. **제안 생성**: `$ARGUMENTS` 에서 추출한 기능 slug 로 다음을 제안한다.
   - 브랜치: `feature/<slug>` (변경 성격에 따라 `fix/` · `refactor/` · `chore/`) — **develop 에서 분기** (onyu Git 컨벤션: 작업 브랜치는 develop 에서 분기)
   - 워크트리 경로: `../onyu-<slug>` (메인 리포 형제 디렉토리, 예: `E:/Workspace/onyu-<slug>`)
3. **사용자 확인 (강제 — 1회)**: 위 브랜치명·경로를 사용자에게 제시하고 승인을 받는다. 브랜치 네이밍/위치는 취향이 갈리므로 자동 생성하지 않는다.
   - 사용자가 수정(브랜치명·경로 변경)하면 반영한다.
   - 사용자가 "현재 워킹트리에서 그냥 진행"을 택하면 격리 없이 Phase 0 진행한다(동시 실행 경합 위험을 사용자가 수용).
4. **생성 & 진입**: 승인 시
   - `EnterWorktree` 도구(또는 `git worktree add <경로> -b <브랜치> develop`)로 워크트리 생성 후 진입한다.
   - 워크트리는 `node_modules` 가 없으므로 그 안에서 **`pnpm install` 1회** 실행(pnpm 글로벌 스토어 링크 기반이라 대체로 빠름). 이후 모든 Phase 의 빌드/테스트가 이 워크트리에서 동작한다.
   - 같은 브랜치는 두 워크트리에서 동시 체크아웃 불가하므로 브랜치명이 충돌하면 slug 에 접미사를 붙여 재제안한다.
   - **이후 Phase 0~7 전체를 이 워크트리에서 실행**한다.

### 정리 (Phase 7 연계)

- Phase 7 의 커밋/PR 은 이 워크트리에서 수행한다 (한 워크트리 = 한 기능 = 한 PR — "하나의 커밋/PR = 하나의 목적" 정합).
- 워크트리 제거(`git worktree remove`)는 **미커밋 변경 유실 방지를 위해 사용자 확인 후** 수행한다. 자동 제거하지 않는다.

## Phase 0: 도메인 결정 & 코드 표면적 resolve
파이프라인 시작 전, 작업 대상 기능이 속하는 **도메인**을 결정하고 **코드 위치**를 함께 resolve 한다.

### 프로젝트 구조
```
onyu/
├── apps/
│   ├── api/          # NestJS Backend (TypeORM + PostgreSQL + Redis + Discord.js)
│   ├── bot/          # Discord.js 봇
│   └── web/          # Next.js Frontend Dashboard (React 19 + Tailwind CSS)
├── libs/
│   └── shared/       # 공유 타입 및 상수
├── docs/
│   ├── specs/        # 기능 명세 문서 (prd/ , database/ , feature-manifest.json)
│   └── plans/        # 구현 계획 문서
└── prompt/           # AI 워크플로우 프롬프트
```

### Phase 0-A. 도메인 결정 (매니페스트 기반 동적 resolve)

- **도메인 목록은 `/docs/specs/feature-manifest.json` 의 `domains` 키를 진실의 소스로 사용한다.** 매니페스트가 변경되면 새 도메인이 자동으로 사용 가능하므로, **본 문서나 에이전트에 도메인을 하드코딩하지 않는다.**
- 매니페스트에서 작업 대상 도메인을 식별한 뒤, 도메인별 관련 문서 경로(`prd`, `userflow`, `database`)를 resolve 한다.
- resolve된 문서 경로만 각 에이전트 호출 시 prompt에 전달하여 컨텍스트를 최소화한다.

#### 문서 참조 규칙
| 문서 유형 | 전역 (항상 읽음) | 기능별 (manifest resolve) |
|-----------|-----------------|---------------------------|
| PRD | `/docs/specs/prd/_index.md` | `domains.{domain}.prd` |
| Userflow | — | `domains.{domain}.userflow` (있을 때만 — 선택적 산출물) |
| Usecase | — | `domains.{domain}.usecases` (있을 때만 — 선택적 산출물) |
| DB 스키마 | `/docs/specs/database/_index.md` | `domains.{domain}.database` |

> **Userflow / Usecase 는 선택적(조건부) 산출물이다** (Phase 1·2 의 조건부 단계 참조). 모든 도메인에 강제 생성하지 않는다 — user-facing / cross-app 기능에서만 생성·갱신한다. 백그라운드/스케줄러/이벤트 전용 작업은 스킵.

### Phase 0-B. 코드 표면적 resolve (manifest `code` / `status`)

각 도메인 항목의 `code.*` 경로와 `status` 값을 함께 resolve 한다. 이후 모든 에이전트 prompt에 코드 위치를 함께 전달하여, 에이전트가 Glob/Grep으로 코드를 재탐색하지 않도록 한다.

**매니페스트 스키마** (B/C 에이전트와 합의):
```
domains.{도메인}.{ prd, userflow, usecases, database,
                   code.{ api, bot, web, sharedTypes, migrations, tests },
                   status }
```

#### Resolve 절차

1. manifest에서 도메인의 `code` 객체와 `status` 값을 읽는다.
2. `code.*`의 각 경로가 **실재하는지** 검증한다 (디렉토리/파일 존재 확인).
3. 검증 결과에 따라 분기:

| 경우 | 처리 |
|---|---|
| `code` 키가 존재하고 모든 경로 실재 | 정상. `code.*` 경로를 그대로 후속 Phase에 전달 |
| `code` 키가 존재하나 일부 경로 누락 | **warning** 출력 + 누락 경로 제외하고 진행. status는 유지 |
| `code` 키 자체가 없음 | status를 `not-started`로 **자동 다운그레이드** + warning |

4. status별 작업 모드:

| status | 모드 |
|---|---|
| `not-started` | **신규 생성 모드**. plan-writer에 "신규 디렉토리 생성 필요" 플래그 전달 |
| `scaffolded` | **부분 구현 모드**. 기존 자산(예: 마이그레이션)은 유지, 미존재 영역만 신규 생성 |
| `implemented` | **수정 모드**. 모든 변경은 `code.*` 안으로 한정 |

**신규 path 결정 주체** (`status: not-started` / 부분 entry 케이스):
1. **plan-writer 가 1차 제안** — manifest 의 기존 도메인 path 패턴 (예: `apps/api/src/modules/{도메인}/`, `apps/bot/src/{도메인}/`, `apps/web/src/{도메인}/`) 을 기반으로 신규 path 제안
2. **메인 세션이 Phase 3.5 에서 사용자 확인** — plan.md "manifest 갱신 필요" § 의 신규 경로를 사용자에게 확인 (자동 진행 X — 도메인 구조 결정은 후속 사이클에 영향)
3. **사용자 확정 후 implementer 가 그 경로로 코드 생성** — Phase 4 implementer 는 plan-writer 가 명시한 경로만 사용. 임의 변경 금지

#### 에이전트 prompt 주입 룰

각 에이전트 호출 시 다음 블록을 prompt에 자동 삽입한다 (해당하는 키만):

```
[코드 표면적]
- BE (api): {code.api}
- Bot: {code.bot}
- Web: {code.web}
- Shared Types: {code.sharedTypes}
- Migrations: {code.migrations}
- Tests: {code.tests}
- Status: {status}

위 경로 밖으로 코드를 만들거나 수정하지 말 것. 새 위치가 필요하면 보고하고 manifest 갱신을 요청할 것.
```

#### Phase 7과의 연계
- 신규 도메인을 만들었거나 `status`가 변경되었으면, **Phase 7 완료 단계에서 manifest를 갱신**한다.
- 갱신 누락은 다음 사이클의 Phase 0 진입 비용 증가로 직결되므로 Phase 7 체크리스트의 필수 항목이다.

## Phase 0.5: 작업 규모 판단

도메인/코드 표면적 resolve 직후, 요구사항의 규모를 판단하여 **불필요한 Phase를 스킵**한다.

| 규모  | 조건 (하나 이상 해당)                                              | 실행 Phase                                | 스킵 세부 규칙                                                                        |
| ----- | ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| **S** | 버그 수정, 텍스트/스타일 변경, 설정값 수정, 기존 API 파라미터 추가 | 0 → 0.5 → 3.5(요약) → 4 → 5 → 6 → 7        | Phase 1·2 스킵. 기존 plan이 있으면 Phase 3도 스킵. DB 변경 없음 전제                   |
| **M** | 기존 기능 수정/개선, 새 엔드포인트 1~2개, 기존 페이지에 컴포넌트 추가 | 0 → 0.5 → 1(선택) → 2(조건부) → 3 → 3.5 → 4 → 5 → 6 → 7 | Phase 1: PRD/userflow 변경 필요 시만. Phase 2: DB 변경 없으면 critic+migration 스킵    |
| **L** | 신규 기능 추가, DB 스키마 변경, 새 모듈/도메인 생성               | 0 → 0.5 → 1 → 2 → 3 → 3.5 → 4 → 5 → 6 → 7  | 전체 실행                                                                              |

- **판단 불가 시**: M으로 시작하고, Phase 진행 중 DB 변경이나 신규 모듈이 필요하면 L로 격상한다.
- **사용자가 규모를 명시한 경우** 해당 규모를 따른다.
- Phase 3.5(사용자 승인)는 **모든 규모에서 유지**한다 (단, S는 변경 요약만 짧게 제시).
- **userflow(1-b) / usecase(4-u) 는 규모와 무관하게 각자의 조건부 규칙을 우선 적용한다**: 규모가 L이어도 user-facing 표면이 아니면 userflow 스킵, cross-app 통합이 아니면 usecase 스킵. 반대로 M이라도 조건을 충족하면 실행한다.

## 실행 파이프라인

### Phase 1: 문서 작성 (M 선택적 / L 필수)
1. [prd-writer] → 입력: 요구사항 + resolve된 도메인 문서 경로 / 출력: `domains.{domain}.prd` 갱신
1-b. [userflow-writer] → **조건부 실행** (prd-writer 완료 후 순차) / 출력: `domains.{domain}.userflow` 갱신
   - **실행 조건 (하나 이상 해당 시에만)**: 기능이 **user-facing 표면**을 포함 — ① `code.web` 변경(웹 대시보드 페이지/흐름) 또는 ② **인터랙티브 Discord 커맨드/상호작용**(슬래시 커맨드, 버튼, 모달 등 사용자 입력→봇 응답 흐름)
   - **스킵 조건**: 순수 백그라운드/스케줄러/이벤트 리스너 작업(예: 동시접속 집계 스케줄러, 비활동 스윕, 내부 동기화) — 사용자 상호작용 흐름이 없으면 userflow 산출물이 저가치이므로 생성하지 않는다
   - 입력: 갱신된 PRD + resolve된 도메인 문서 경로

### Phase 2: 설계 (M 조건부 / L 필수)
2. [database-architect] → 입력: PRD diff / 출력: `/docs/specs/database/_index.md` (변경 시)
3. [database-critic] → 조건: DB 변경 있을 때만 / 입력: database/_index.md diff / 출력: 리뷰 반영된 database/_index.md
4. **[Migration 계획 작성]** → 조건: database/_index.md 변경 시 또는 신규 Entity 추가 시
    - 본 Phase에서는 **계획만 작성**한다. Entity 파일 편집·`migration:generate`·`migration:run` 실행은 **Phase 4 implementer 가 단독 수행**한다 (TypeORM/docker 실행 명령은 implementer.md "마이그레이션 실행" § 참조 — 본 문서에 docker 명령 하드코딩하지 않음).
    - 출력: `/docs/specs/database/_index.md` 안에 "마이그레이션 변경 계획" § 작성
      - 현재 스키마와 diff, 신규/변경 Entity·컬럼·인덱스·관계
      - 예상 migration 이름 (영문, 타임스탬프-Name 형식)
      - **DB 파괴적 변경(컬럼/테이블 제거, destructive 옵션) 포함 시 해당 항목에 `🔴` 마커를 붙인다** → Phase 2 종료 시 grep 게이트 발동
    - **자동 생성 결과 정리 지침** (implementer에 전달): TypeORM `migration:generate`는 전체 diff를 출력하므로 불필요한 변경(기존 인덱스/FK 재생성 등)이 포함될 수 있다. 해당 기능에 필요한 변경만 남기도록 정리한다. 자동 생성이 실패하거나 과도하게 복잡하면 PRD 데이터 모델 기반으로 `CREATE TABLE`/`CREATE INDEX` SQL을 직접 작성한다.
4-u. [usecase-writer] → **조건부 실행** (database-architect 와 **병렬**) / 출력: `domains.{domain}.usecases` 디렉토리에 `UC-NN-{slug}.md` + `_index.md`
   - **실행 조건 (해당 시에만)**: 변경이 **2개 이상 앱에 걸치는 cross-app 통합 기능** — `code.api` + `code.web` 또는 + `code.bot` 등 다면 연동. 단일 앱(api만 / web만 / bot만)에 한정된 변경은 스킵
   - 목적: API + 페이지 + 외부연동(Discord/Gemini 등)이 맞물리는 통합 시나리오를 명세해 Phase 6 테스트의 통합 검증 기준으로 사용
   - 입력: PRD + userflow(있으면) + DB 스키마 + resolve된 코드 표면적
   - 단일 도메인·단일 앱 작업이면 본 단계 스킵 (usecase 산출물이 plan 과 중복되어 한계효용 낮음)
4-e. **[Skill: `planner-endpoint-spec-draft`]** → **조건부** (전역 템플릿 스킬, 메인 세션이 `Skill()` 호출) / 출력: `docs/specs/endpoint-spec/{domain}.md`
   - **실행 조건**: BE 엔드포인트(api/bot-api controller)가 **신규/변경**될 때만. 엔드포인트 변경 없으면 스킵
   - 입력 매핑: 스킬의 "feature-spec" ↔ onyu 의 PRD + usecase(있으면). method/path/auth/query/body/response 표 + 🔴/🟨/❓ 마커 산출 → 이후 implementer 가 Swagger 정합 검증에 사용

### Phase 3: 계획 (S 조건부 / M·L 필수)
5. [common-task-planner] → 조건: **다중 도메인 변경 시에만** 실행 / 입력: PRD (도메인별) / 출력: 공통 모듈 판단 결과
6. [plan-writer] × N (병렬, 모듈 단위) → 출력: 각 모듈별 구현 계획 (`/docs/plans/*.md`)
    - `status: not-started` / 부분 entry 도메인의 경우 신규 코드 path를 plan.md "manifest 갱신 필요" §에 1차 제안한다.
6-edge. **[Skill: `planner-edge-cases`]** → **조건부** (전역 템플릿 스킬) / 출력: `docs/specs/edge-cases/{domain}.md`
    - **실행 조건**: 비자명 분기·예외가 있는 기능 (입력검증/권한/동시성/외부의존 실패/데이터부재). 단순 CRUD·설정 토글은 스킵
    - 입력: PRD + endpoint-spec(있으면) + usecase(있으면). 예외 케이스 분류 산출 → Phase 6 테스트의 실패/경계 케이스 기준
6-qa. **[Skill: `planner-qa-checklist`]** → **조건부 (L 규모 권장)** (전역 템플릿 스킬) / 출력: `docs/specs/qa-checklist/{domain}.md`
    - **실행 조건**: L 규모(신규 기능/도메인) 또는 QA 검증이 필요한 변경. S/단순 M 은 스킵
    - 입력: 선행 산출물 종합 (PRD / usecase / endpoint-spec / edge-cases). 시나리오별 체크박스 + 우선순위 → Phase 6 tester/fe-tester 입력으로 전달

### Phase 3.5: 계획 확인 (사용자 승인)
> **계획된 사용자 개입 지점이다.** (자율 실행 규칙 4항(b))

- Phase 1~3의 산출물(PRD, DB 스키마, 마이그레이션 계획, 구현 계획)을 요약하여 사용자에게 제시한다.
- 요약 항목:
  - 변경/추가된 PRD 내용
  - DB 스키마 변경 사항 (있는 경우)
  - 마이그레이션 변경 계획 (있는 경우)
  - 모듈별 구현 계획 목록
  - **신규 도메인/코드 path 제안** (`not-started`·부분 entry 케이스 — 사용자 확정 필요)
- **HITL 게이트 연계**: Phase 1~3 산출물에 `🔴` 마커(법무/결제/권한/DB 파괴적 변경)가 있으면, 일반 계획 승인과 **별도로 해당 결정을 명시적으로 짚어** 사용자 답변을 받는다. 마커가 없으면 통상 계획 승인 흐름으로 진행한다.
- 사용자가 **승인**하면 Phase 4로 진행한다.
- 사용자가 **수정 요청**하면 해당 Phase로 돌아가 반영 후 다시 Phase 3.5로 복귀한다.

### Phase 4: 구현 (전 규모)
7. [implementer] × N (병렬, 계획 단위) → 출력: 변경된 코드
   - 마이그레이션이 있으면 implementer가 Entity 작성/수정 + `migration:generate`/`migration:run` 실행까지 단독 수행한다 (실행 명령은 implementer.md 참조).
   - **권한 fallback (필수)**: sub-agent(implementer 등) 디스패치 시 Edit/Write 거부가 발생하면 (Claude Code sub-agent 권한 모델 한계 — implementer.md "실행 환경 주의" § 참조), **즉시 재시도하지 말고 메인 세션이 implementer 역할을 직접 수행**한다. 동일 sub-agent 재호출은 비결정성만 증가시킨다.

### Phase 5: 검증 (전 규모)
8. [quality-enforcer] × N (병렬, 구현 단위) → 입력: 변경된 코드 / 출력: 코드 품질 검수 결과 및 수정

### Phase 6: 테스트 (전 규모)

#### Phase 6 실행 규칙

1. **합류 후 판단 (Barrier)**: tester와 fe-tester를 **병렬로 호출**하되, **둘 다 완료된 후** 결과를 합산하여 판단한다. 한쪽이 먼저 실패했다고 즉시 회귀하지 않는다.
2. **테스트 에이전트는 구현 코드를 수정하지 않는다**: tester와 fe-tester는 테스트 코드 작성과 실행만 담당한다. 구현 버그를 발견하면 **실패 보고서만 출력**하고, 실제 수정은 Phase 4 회귀 시 implementer가 수행한다.
3. **회귀 시 합산 호출**: 하나 이상 실패한 경우 implementer를 **1회만 호출**하되, 양쪽 실패 정보를 모두 전달한다.
4. **회귀 후 전체 재실행**: Phase 4 회귀로 구현이 수정되면, Phase 5(검증) + Phase 6(테스트)를 **전체 재실행**한다 (통과했던 쪽도 포함). 구현 변경이 기존 통과 테스트를 깨뜨릴 수 있기 때문이다.
5. **실패 카운트**: 3회 제한은 **Phase 6 사이클 기준**이다. Phase 6 실행 1회 = 1사이클. 3사이클 실패 시 사용자에게 보고하고 대기한다.

#### Phase 6 판정 흐름

```
[tester] ──┐
           ├── 둘 다 완료 대기 (Barrier)
[fe-tester]┘
           │
           ├── 둘 다 성공 → Phase 7(완료)로 진행
           ├── 하나 이상 실패 → 실패 정보 합산 → Phase 4 회귀 (implementer 1회 호출)
           └── 회귀 후 → Phase 5(검증) + Phase 6(테스트) 전체 재실행
```

#### Phase 6 상세

9. [tester] → BE 테스트 작성 및 실행 (병렬)
   - 입력: 변경된 코드 + PRD + 구현 계획 + (있으면) usecase 문서(`domains.{domain}.usecases`) + (있으면) edge-cases / qa-checklist(`docs/specs/edge-cases|qa-checklist/{domain}.md`) — 통합 시나리오·예외·QA 검증 기준
   - 작업:
     1. 기존 테스트 실행 → 기존 동작 보존 확인
     2. 신규 기능에 대한 테스트 코드 작성 (Unit / Integration)
        - 정상 케이스, 실패 케이스, 경계값, 예외 상황 포함
        - 외부 의존성은 mock 처리
        - 테스트 이름은 요구사항을 그대로 반영
     3. 작성한 테스트 실행
   - 출력: 테스트 코드 + 실행 결과 (실패 시 실패 보고서)
   - 성공 조건: 기존 + 신규 테스트 전체 통과
10. [fe-tester] → FE 테스트 작성 및 실행 (병렬, 조건: `apps/web` 변경 시에만)
    - 입력: 변경된 프론트엔드 코드 + (있으면) userflow 문서(`domains.{domain}.userflow`) + usecase 문서(`domains.{domain}.usecases`) + (있으면) edge-cases / qa-checklist — 유저 시나리오·예외·QA 검증 기준
    - 작업: Testing Trophy 전략 기반 테스트 작성 및 실행
    - 출력: 테스트 코드 + 실행 결과 (실패 시 실패 보고서)

### Phase 7: 완료 (전 규모)
11. 변경 요약 출력
    - 수정된 파일 목록
    - 주요 변경 사항 요약
    - 테스트 커버리지 요약 (추가된 테스트 수, 통과 현황)

12. **manifest 갱신 (필수, Phase 4 implementer 단독 수행)**: 다음 중 하나라도 해당하면 `/docs/specs/feature-manifest.json`을 갱신한다.
    - 신규 도메인이 생성됨 → 도메인 항목 추가 + `code.*`(api/bot/web/migrations/tests) + `status` 설정
    - 기존 도메인의 `status`가 변경됨 (예: `not-started` → `scaffolded` → `implemented`)
    - `code.*` 경로가 새로 생기거나 이동함 (예: BE 모듈 신설, 봇 핸들러/웹 페이지 추가)

    manifest 갱신 누락은 다음 사이클 Phase 0 진입 비용 증가로 직결되므로, **본 단계가 끝나기 전 반드시 갱신 여부를 확인**한다. 갱신 주체는 implementer, **메인 세션은 결과 JSON 유효성 검증만** 수행한다 (직접 Edit X).

---

## 회귀 규칙

### Phase 6 (테스트) 실패 시

```
Phase 6 실패 → 양쪽 결과 합산 → Phase 4 [implementer] 1회 재호출
- 전달 정보:
  - 원래 호출 시 전달했던 plan 문서 경로
  - [tester 실패 시] 실패한 테스트 파일 경로 + 예상/실제 동작 + 수정 대상 소스 경로
  - [fe-tester 실패 시] 실패한 테스트 파일 경로 + 예상/실제 동작 + 수정 대상 소스 경로
- 목표: 양쪽 테스트를 모두 통과하도록 구현 수정
- 수정 후: Phase 5(검증) + Phase 6(테스트) 전체 재실행 (tester + fe-tester 양쪽 모두)
```

### 실패 카운트 규칙

- **Phase 6**: 3회 제한은 Phase 6 사이클(tester + fe-tester 합산) 기준이다. Phase 6 실행 1회 = 1사이클.
  - 예: 1차(tester 실패) → 회귀 → 2차(fe-tester 실패) → 회귀 → 3차(tester 실패) → 사용자 보고

### 실패 보고 템플릿

3회 연속 실패로 사용자에게 보고할 때 아래 정보를 포함한다:

```
- 실패한 Phase: [Phase N]
- 실패한 에이전트: [에이전트명 (복수 가능)]
- 에러 요약: [에러 메시지 또는 실패 테스트 목록]
- 시도한 수정 내용: [1차/2차/3차 시도 요약]
- 추정 원인: [근본 원인 분석]
- 연관 이슈: [BE 수정이 FE를 깨뜨린 경우 등 교차 영향 명시]
```

---

## 파이프라인 시각화

```
[도메인+코드 resolve] → [규모 판단] ──► [문서] ──► [설계] ──► [계획] ──STOP──► [계획 확인] ──► [구현] ──► [검증] ──► [테스트] ──► [완료]
        │                   │            │          │          │              │                │           │           │            │
     Phase 0           Phase 0.5     Phase 1    Phase 2    Phase 3        Phase 3.5        Phase 4     Phase 5     Phase 6      Phase 7
  manifest에서          S/M/L 판단    prd-writer db-architect common-task   사용자 승인 +     implementer quality-    tester ─┐    변경 요약
  도메인+문서+code      → Phase 스킵             db-critic?   planner?      🔴 마커 결정 짚기  × N (병렬)  enforcer    fe-tester┘   + manifest
  +status resolve                                migration계획 plan-writer×N (요약→승인/수정)  +권한fallback × N (병렬)  Barrier      갱신
                                                                                                                       │
                                                                                                             실패 시 Phase 4 회귀
                                                                                                             (implementer 1회)
                                                                                                             → Phase 5+6 전체 재실행

  ※ AUTO = 사용자 확인 없이 자동 전환 (Phase 간 기본)
  ※ 워크트리 격리(Phase 0 전): 동시 2건+ 실행 경합 차단 — 시작 시 develop 에서 전용 워크트리+브랜치 생성(1회 확인) → Phase 0~7 전체를 그 안에서 실행. 개별 에이전트엔 미적용(단계 간 산출물 공유 필요)
  ※ STOP = 사용자 승인 후 진행 (Phase 3.5)
  ※ HITL 게이트: 각 Phase 끝 산출물 🔴 grep → 법무/결제/권한/DB파괴적 마커 발견 시 후속 Phase 정지 + 사용자 보고
  ※ 규모: S = Phase 1·2 스킵 / M = Phase 1 선택·Phase 2 조건부 / L = 전체 실행 (Phase 0.5 표 참조)
  ※ 권한 fallback: implementer 등 sub-agent Edit/Write 거부 시 메인 세션이 직접 수행
  ※ userflow(Phase 1, 1-b): user-facing 표면(웹 페이지/인터랙티브 봇 커맨드)일 때만 조건부 실행 — 백그라운드/스케줄러 스킵
  ※ usecase(Phase 2, 4-u): 2개 이상 앱(api/bot/web) 걸치는 cross-app 통합일 때만 조건부 실행 (db-architect와 병렬) — 단일 앱 작업 스킵
  ※ 전역 템플릿 스킬(조건부, 메인 세션이 Skill() 호출): endpoint-spec-draft(Phase 2, 4-e — BE 엔드포인트 변경 시) / edge-cases(Phase 3, 6-edge — 비자명 분기) / qa-checklist(Phase 3, 6-qa — L 규모) → 산출물은 docs/specs/{endpoint-spec,edge-cases,qa-checklist}/, Phase 6 테스트 입력
  ※ 실패 시: 각 단계 최대 3회 재시도, 초과 시 사용자 보고
  ※ 테스트(Phase 6): tester + fe-tester 병렬 → Barrier → 합산 판정 → 실패 시 Phase 4 회귀 → Phase 5+6 전체 재실행 (최대 3사이클)
```
