# CLAUDE.md

## Project Overview

Onyu — 디스코드 서버의 음성 채널 활동을 실시간 추적하고, Gemini AI 기반 분석 리포트를 제공하며, 음악 재생·신규사용자 관리·비활동 회원 분류 등을 수행하는 다목적 디스코드 봇.

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
apps/api/     → NestJS 백엔드 API (포트 3000)
apps/web/     → Next.js 웹 대시보드 (포트 4000)
libs/shared/  → 공유 타입 및 상수
```

### 주요 도메인

voice(음성 추적) · gemini(AI 분석) · music(음악 재생) · auth(OAuth2 인증) · web(대시보드) · newbie(신규사용자) · status-prefix(게임방 접두사) · sticky-message(고정메세지) · monitoring(봇 모니터링) · inactive-member(비활동 회원) · voice-co-presence(동시접속 추적) · auto-channel(자동방 생성)

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
- 워크스페이스 필터: `pnpm --filter <패키지명> <명령>` (예: `pnpm --filter @nexus/api test`)
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
