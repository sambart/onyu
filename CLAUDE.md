# CLAUDE.md

## Project Overview

Onyu — 디스코드 서버의 음성 채널 활동을 실시간 추적하고, Gemini AI 기반 분석 리포트를 제공하며, 신규사용자 관리·비활동 회원 분류 등을 수행하는 다목적 디스코드 봇.

### 기술 스택

| 계층 | 기술 |
|------|------|
| Backend | NestJS 10 + TypeORM 0.3 + PostgreSQL 15 + Redis 7 |
| Frontend | Next.js 16 + React 19 + Tailwind CSS 3 |
| Discord | Discord.js 14 + discord-nestjs 5 |
| AI | Google Gemini (@google/generative-ai) |
| 인프라 | Docker Compose, pnpm workspaces 모노레포 |

### 모노레포 구조

```
apps/api/             → NestJS 백엔드 API (포트 3000)
apps/bot/             → Discord.js 봇 (NestJS + discord-nestjs)
apps/web/             → Next.js 웹 대시보드 (포트 4000)
libs/shared/          → 공유 타입 및 상수 (@onyu/shared)
libs/i18n/            → 다국어 로케일 (@onyu/i18n, ko/en × bot/web)
libs/bot-api-client/  → 봇→API HTTP 클라이언트 SDK (@onyu/bot-api-client, 수기 작성)
```

> 루트 패키지: `onyu-monorepo`. 워크스페이스: `apps/*`, `libs/*`.

### 주요 도메인

voice(음성 추적) · gemini(AI 분석) · auth(OAuth2 인증) · web(대시보드) · newbie(신규사용자) · status-prefix(게임방 접두사) · sticky-message(고정메세지) · monitoring(봇 모니터링) · inactive-member(비활동 회원) · voice-co-presence(동시접속 추적) · auto-channel(자동방 생성)

## Workspace Map

전역 템플릿(`~/.claude`) agent 가 작업 시작 시 읽는 **역할 어휘 ↔ 코드 path** 매핑. 어휘는 템플릿 `CLAUDE.md §10` 기준. 매핑 없는 역할은 해당 agent 비활성.

> 아키텍처: `apps/api` 는 도메인별 DDD-스타일 레이어 (`presentation` / `application` / `infrastructure` (+ 일부 `domain`)).

| 역할 (템플릿 §10) | 코드 path | 비고 |
|---|---|---|
| **Entrypoint** | `apps/api/src/**/presentation/*.controller.ts`, `apps/api/src/bot-api/**/*.controller.ts`, `apps/api/src/gateway/*.controller.ts` | API 진입점 (HTTP/RPC) |
| **Entrypoint (Bot)** | `apps/bot/src/command/**`, `apps/bot/src/event/**` | Discord 슬래시 커맨드 / 이벤트 핸들러 |
| **Business** | `apps/api/src/**/application/*.service.ts` | 도메인 로직 |
| **Persistence** | `apps/api/src/**/infrastructure/*.repository.ts` | TypeORM repository |
| **Schema** | `apps/api/src/**/infrastructure/*.orm-entity.ts`, `apps/api/src/migrations/*.ts` | TypeORM 엔티티 + 마이그레이션 (DB 파괴적 변경 = HITL) |
| **Presentation** | `apps/web/app/**`, `apps/web/components/**` | Next.js App Router 페이지 / 컴포넌트 |
| **Route** | `apps/web/app/` (디렉토리 라우팅), `apps/web/middleware.ts` | App Router + 미들웨어 |
| **State** | 🟨 미확정 — 별도 store 디렉토리 미발견 (컴포넌트/lib 레벨로 추정, 작업 시 재확인) | TanStack Query / 컴포넌트 상태 여부 미확인 |
| **Design Token** | `apps/web/tailwind.config.ts`, `apps/web/app/globals.css` | Tailwind |
| **Shared** | `libs/shared/src/{types,constants,helpers}` | 공유 타입/상수 |
| **API Contract** | `libs/bot-api-client/**` | 봇→API SDK (수기 작성 — auto-generated 아님) |
| **i18n** | `libs/i18n/locales/{ko,en}/{bot,web}` | 다국어 로케일 |
| **Mobile (Presentation/State/Route)** | ❌ 없음 | `mobile-developer` 비활성 |

## Doc Map

산출물 종류 ↔ docs path 매핑. 실재 경로만 등재.

| 산출물 종류 | docs path | 비고 |
|---|---|---|
| **PRD** | `docs/specs/prd/` (도메인별 `.md` + `_index.md`) | 활발히 사용 중 (14개 도메인 — `feature-manifest.json` 기준) |
| **DB 설계** | `docs/specs/database/_index.md` | 단일 파일 |
| **공통 모듈 스펙** | `docs/specs/*.md` (common-modules 등) | 병렬 개발 충돌 방지 |
| **길드 IA** | `docs/specs/discord-guild-ia.md` | 단일 파일 — Onyu 전용 디스코드 길드 채널/역할/권한 청사진 |
| **구현 계획** | `docs/plans/`, 페이지 단위 `docs/plans/pages/`, 완료분 `docs/plans/archive/` | 활발히 사용 중 |
| **Userflow** | `docs/specs/userflow/{domain}.md` + `_index.md` | **조건부 산출물** — user-facing 표면(웹/인터랙티브 봇 커맨드)일 때만 생성. 첫 생성 시 디렉토리 신설 |
| **Usecase** | `docs/usecases/{domain}/UC-NN-{slug}.md` + `_index.md` | **조건부 산출물** — cross-app(2+ 앱) 통합 기능일 때만 생성. 첫 생성 시 디렉토리 신설 |
| **Endpoint Spec** | `docs/specs/endpoint-spec/{domain}.md` | **조건부 (전역 스킬 `planner-endpoint-spec-draft`)** — BE 엔드포인트 신규/변경 시. API method/path/auth/body/response 표. 첫 생성 시 신설 |
| **Edge Cases** | `docs/specs/edge-cases/{domain}.md` | **조건부 (전역 스킬 `planner-edge-cases`)** — 비자명 분기/예외가 있을 때. 입력검증/권한/동시성/외부실패/데이터부재 분류. 첫 생성 시 신설 |
| **QA Checklist** | `docs/specs/qa-checklist/{domain}.md` | **조건부 (전역 스킬 `planner-qa-checklist`)** — L 규모. 선행 산출물 종합 → tester/fe-tester 입력. 첫 생성 시 신설 |
| **가이드** | `docs/guides/` (architecture / code-style / git-workflow) | read-only 참조 |
| **릴리즈** | `docs/releases/` | — |
| **아카이브** | `docs/archive/` (prd-changelog / userflow-changelog 등) | 변경 이력 보관 |

> **userflow / usecase 는 선택적(조건부) 산출물**이다 — 모든 도메인에 강제하지 않고 user-facing / cross-app 기능에서만 생성한다 (feat-implement.md Phase 1 `1-b` / Phase 2 `4-u` 조건 참조). 디렉토리는 첫 생성 시 신설.
> **Endpoint Spec / Edge Cases / QA Checklist 는 전역 템플릿 스킬**(`~/.claude/skills/planner/*`)로 생성한다 — 메인 세션이 `Skill(skill="planner-endpoint-spec-draft" | "planner-edge-cases" | "planner-qa-checklist", ...)` 로 호출. 스킬은 본 Doc Map 의 해당 위치에 작성한다. feat-implement.md 의 조건부 단계 참조. 입력 매핑: 템플릿 스킬의 "feature-spec" ↔ onyu 의 PRD + usecase.
> **미생성 경로**: `docs/external` (외부 연동 가이드 — 해당 산출물 작성 시 신설).

## Workspace / Doc Map (도메인 매니페스트)

위 `## Workspace Map`(역할↔glob) / `## Doc Map`(산출물↔경로) 표는 **그대로 유지**(역할 어휘 ↔ path glob 으로 유용). 그에 더해, 본 프로젝트는 [`docs/specs/feature-manifest.json`](docs/specs/feature-manifest.json) 으로 **도메인별 실제 코드/문서 path** 를 관리한다. 전역 템플릿(`~/.claude/`)의 agent 는 작업 시작 시 본 매니페스트를 우선 참조하여 작업 도메인의 코드 위치를 resolve 한다.

> onyu 는 `apps/api`(NestJS) · `apps/bot`(Discord.js) · `apps/web`(Next.js) 3앱 구조다. 따라서 매니페스트 `code` 키는 `api` / `bot` / `web` / `sharedTypes` / `migrations` / `tests` 를 사용한다.

### ⭐ agent 우선순위 — onyu 자체 agent + feat-implement 우선

전역 템플릿(`~/.claude/`)이 활성화돼 있어도, **본 프로젝트의 작업은 onyu 자체 agent(`.claude/agents/*`) + `/feat-implement` 슬래시 커맨드(`.claude/commands/feat-implement.md`) 자율 파이프라인을 우선 사용한다.** 전역 템플릿의 generic agent(`planner` / `developer` / `backend-developer` / `frontend-developer` 등)는 onyu 작업에 직접 디스패치하지 않는다 — onyu 파이프라인이 PRD→userflow/usecase→DB설계→계획→구현→품질→테스트 + HITL 게이트 + 매니페스트 갱신까지 더 풍부하게 커버하기 때문.

- **기능 추가/수정**: `/feat-implement` 슬래시 커맨드(`.claude/commands/feat-implement.md`) 자율 파이프라인 (Phase 0~7) — onyu 자체 agent 오케스트레이션
- **전역 템플릿의 기여**: 워크플로우 메타 룰(병렬화 / HITL 4분야 / 트랙 사고)과 §10 역할 어휘(코드 path resolve 용어) — onyu 가 이를 따르되, 실제 일은 onyu agent 가 수행
- **ad-hoc 단순 작업**(파이프라인 밖, 예: 한 파일 typo): 메인 세션 직접 처리 또는 onyu agent 단독 호출

#### 템플릿 역할 어휘 ↔ onyu 자체 agent 매핑

| 전역 템플릿 역할 (`~/.claude` §10 / agent) | onyu 자체 agent |
|---|---|
| planner | `prd-writer` + `userflow-writer` + `usecase-writer` |
| developer (supervisor / 분배) | `/feat-implement` 슬래시 커맨드 오케스트레이션 + `common-task-planner` |
| backend-developer (BE — api/bot) | `implementer` (api/bot) + `tester` |
| frontend-developer (Web) | `implementer` (web) + `fe-tester` |
| (템플릿에 없는 onyu 고유) 품질/검증/리팩터 | `quality-enforcer` · `implement-checker` · `refactorer` |
| (템플릿에 없는 onyu 고유) DB 설계 | `database-architect` + `database-critic` |
| (템플릿에 없는 onyu 고유) 외부 연동 조사 | `integrate-researcher` + `integrate-critic` |
| mobile-developer / designer / prd-wireframe-generator | **비활성** (모바일·Figma 없음) |

### 역할 어휘 ↔ 매니페스트 키 매핑

| 본 templates 역할 어휘 (`~/.claude/CLAUDE.md` §10) | feature-manifest 키 |
|---|---|
| Entrypoint / Business / Persistence (BE — API) | `domains.{도메인}.code.api` |
| Entrypoint (Bot — 슬래시 커맨드 / 이벤트 핸들러 / 스케줄러) | `domains.{도메인}.code.bot` |
| Schema (TypeORM 엔티티 + 마이그레이션) | `domains.{도메인}.code.migrations` |
| Presentation / State / Route (Web — Next.js App Router) | `domains.{도메인}.code.web` |
| Shared (공유 타입/상수) | `domains.{도메인}.code.sharedTypes` |
| 테스트 | `domains.{도메인}.code.tests` |
| PRD | `domains.{도메인}.prd` |
| Userflow (조건부) | `domains.{도메인}.userflow` |
| Usecase (조건부) | `domains.{도메인}.usecases` |
| Database 설계 | `domains.{도메인}.database` |

> **Userflow / Usecase 는 조건부 산출물**이다 — 매니페스트에 경로 키는 전 도메인에 등재돼 있으나, 실제 생성은 user-facing(userflow) / cross-app(usecase) 기능에서만 한다 (feat-implement.md Phase 1·2 조건부 단계).
> **Plan** 산출물은 매니페스트에 도메인별 키로 등재돼 있지 않다 — 위 `## Doc Map`(구현 계획 → `docs/plans/`)을 따른다.

### 활성 agent 판별

도메인별 `code.*` 필드 존재 여부로 작업 영역 활성/비활성을 판별한다 (실제 수행 agent 는 위 매핑의 **onyu 자체 agent**):

- `code.api` 또는 `code.bot` 존재 → 백엔드 작업 활성 → `implementer`(api/bot) + `tester` (API 모듈 / 봇 커맨드·이벤트·스케줄러)
- `code.web` 존재 → 웹 작업 활성 → `implementer`(web) + `fe-tester` (Next.js App Router)
- `code.api` / `code.bot` / `code.web` 모두 없음 → 신규 작업 시 path 결정 필요 → `plan-writer` 가 1차 제안 (PRD / `description` 기반, Phase 3.5 사용자 확정)
- 모바일 작업 영역 없음 → 모바일 관련 agent 비활성 (모바일 앱 없음)

### Status 마커 처리

- `implemented` → 코드 수정 작업 가능 (현재 전 도메인 implemented)
- `scaffolded` → 부분 구현. 작업 시 매니페스트 `code` 필드로 실재 영역 확인 + 누락 영역 신규 작성
- `not-started` → 신규 도메인. dispatch-plan 단계에서 path 결정 (PRD 기반)

> **path 실재 강제**: `code.*` 의 코드 경로는 실재해야 한다. 일부 경로가 없으면 Phase 0 가 status 를 `not-started` 로 다운그레이드하고 warning 출력. 문서 경로(`userflow` 등 미생성분)는 예정 경로 OK — 실재 강제는 `code` 경로에만 적용.

## Code Style Guide

코드 스타일 가이드 전문: `docs/guides/code-style-guide.md`

### ESLint로 자동 강제되는 규칙

아래 규칙들은 `.eslintrc.js`에서 자동 검증됩니다. 별도 신경 쓸 필요 없음:

- PascalCase (타입/인터페이스/enum/class), `type import` 분리
- `any` 사용 금지 (error) — `unknown` + 타입 가드로 대체
- optional chaining (`?.`), nullish coalescing (`??`)
- floating promise 금지, `return await` 강제
- `no-console` (warn/error만), 미사용 import/변수 삭제
- 함수 50줄 초과 (warn), 파라미터 3개 초과 (warn), 중첩 3단계 초과 (warn)
- `no-else-return`, `no-magic-numbers` (warn), `no-throw-literal`
- React 컴포넌트 function 선언식 강제 (admin/user)

### 코드 리뷰 시 수동 확인 필요 (ESLint 자동화 불가)

- **Boolean 변수명**: `is` / `has` / `can` / `should` 접두사 필수 (`isLoading`, `hasError`)
- **함수명**: 동사로 시작 (`fetchUser`, `formatDate`)
- **이벤트 핸들러명**: `handle` + 대상 + 이벤트 (`handleLoginClick`, `handleFormSubmit`)
- **`as` 단언**: 사용 시 반드시 이유를 주석으로 명시
- **catch 블록**: `error instanceof Error` 확인 후 사용
- **주석**: why만 작성 — what을 반복하는 주석 금지
- **공용 함수/훅/유틸**: JSDoc 작성
- **TODO/FIXME**: `// TODO(이름 YYYY-MM-DD): 내용 — #이슈` 포맷 준수

## Package Manager

- **pnpm** 사용 (npm workspaces에서 전환됨)
- 워크스페이스 필터: `pnpm --filter <패키지명> <명령>` (예: `pnpm --filter @onyu/api test`)
- 전체 워크스페이스 실행: `pnpm -r <명령>` (예: `pnpm -r lint`)
- 의존성 설치: `pnpm install` (npm install 사용 금지)
- 워크스페이스 의존성 참조: `workspace:*` 프로토콜 사용

## Git Workflow

Git 워크플로우 전문: `docs/guides/git-workflow-guide`

### 브랜치 규칙

- 작업 브랜치는 항상 `develop`에서 분기
- 네이밍: `feature/`, `fix/`, `refactor/`, `chore/` + kebab-case 소문자
- 이슈 번호 포함 권장: `feature/123-user-login`
- `main` 직접 push 금지 — PR 필수

### 커밋 메시지

Conventional Commit + **한국어** 작성:

```
feat: 사용자 로그인 API 추가
fix: 유저 서비스 null 포인터 오류 수정
refactor: 인증 로직 단순화
test: 인증 서비스 단위 테스트 추가
chore: eslint 설정 업데이트
docs: API 문서 수정
```

- 하나의 커밋 = 하나의 목적
- 동사로 시작 (추가, 수정, 삭제, 개선...)
- 의미 없는 메시지 금지 (`수정`, `업데이트`, `asdf`)

### PR 규칙

- PR 제목: 커밋 타입과 동일한 형식 (`feat: 로그인 API 추가`)
- Merge 방식: **Merge Commit** (Squash/Rebase 아님)
- 500 lines 이하 권장
- CI 실패 상태 merge 금지
