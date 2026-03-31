# Public/Private 레포 분리 구현 계획

## Context

Bot/API 분리(Phase 1~3, A-1~A-6)가 완료되었다.
Bot 코드를 포트폴리오/오픈소스 공개용으로 별도 Public 레포에 게시한다.

**기존 계획 참조:** `docs/plans/premium-service-architecture.md` Phase 4

---

## 1. 전략: Private 모노레포 유지 + Public 읽기 전용 미러

### 핵심 원칙

- **Private (`sambart/onyu`)**: 기존 모노레포 그대로 유지. 개발·배포·CI 모두 여기서 수행.
- **Public (`sambart/onyu-bot`)**: Bot 관련 코드만 추출한 **읽기 전용 스냅샷**. 포트폴리오/오픈소스 공개 목적.
- **동기화**: Private 레포의 main push 시 CI가 자동으로 Public 레포에 미러링.

### 기존 양방향 분리 대비 장점

| 항목 | 양방향 분리 | 단방향 미러 (채택) |
|------|------------|------------------|
| 개발 환경 변경 | 2개 레포 별도 clone/실행 | **변경 없음** |
| CI/CD 변경 | 2개 워크플로우 완전 재작성 | **기존 유지 + 미러 워크플로우 1개 추가** |
| Docker 변경 | docker-compose 2개로 분리 | **변경 없음** |
| shared 라이브러리 | 복제 + 수동 동기화 | **자동 (CI가 처리)** |
| 배포 구성 | 서버측 docker-compose 재구성 | **변경 없음** |
| 롤백 복잡도 | 2개 레포 롤백 조율 | **기존과 동일** |

---

## 2. 레포 구성

### 2-1. sambart/onyu (Private, 기존 유지)

```
onyu/                           ← 변경 없음
├── apps/api/
├── apps/bot/
├── apps/web/
├── libs/shared/
├── libs/bot-api-client/
├── libs/i18n/
├── .github/workflows/
│   ├── ci.yml                  ← 기존 유지
│   ├── deploy.yml              ← 기존 유지
│   └── mirror-bot.yml          ← 신규 (Public 미러링)
├── scripts/
│   └── mirror-bot.sh           ← 신규 (미러링 스크립트)
└── ...
```

### 2-2. sambart/onyu-bot (Public, 신규)

```
onyu-bot/                       ← CI가 자동 생성/갱신
├── apps/bot/                   # Discord 봇 소스
├── libs/shared/                # 공유 타입/상수
├── libs/bot-api-client/        # Bot → API HTTP 클라이언트
├── package.json                # Bot 전용 워크스페이스 설정
├── pnpm-workspace.yaml
├── tsconfig.json
├── eslint.config.base.mjs
├── prettier.config.js
├── .env.example                # Bot 전용 환경변수 템플릿
├── lavalink/application.yml
├── docker-compose.yml          # Bot + Lavalink (셀프호스팅용)
├── Dockerfile
├── README.md                   # 프로젝트 소개 + 설치 가이드
└── LICENSE
```

> Public 레포에는 `.github/workflows/` 미포함 — 배포는 Private에서만 수행.

---

## 3. CI 자동 미러링 상세

### 3-1. 동작 흐름

```
Private (onyu) main push
    │
    ▼
mirror-bot.yml 트리거
    │
    ├── 1. checkout (전체 모노레포)
    ├── 2. mirror-bot.sh 실행
    │      ├── Bot 관련 파일만 임시 디렉토리에 복사
    │      ├── 민감 정보 제거/치환
    │      ├── Public 전용 설정 파일 생성
    │      └── .env.example 생성 (더미값)
    ├── 3. Public 레포 clone (onyu-bot)
    ├── 4. 기존 내용 삭제 → 새 내용으로 교체
    ├── 5. 변경 있으면 commit + push
    └── 6. 변경 없으면 skip
```

### 3-2. GitHub Actions 워크플로우

```yaml
# .github/workflows/mirror-bot.yml
name: Mirror Bot to Public

on:
  push:
    branches: [main]
    paths:
      - 'apps/bot/**'
      - 'libs/shared/**'
      - 'libs/bot-api-client/**'
      - 'lavalink/**'
      - 'eslint.config.base.mjs'
      - 'prettier.config.js'
      - 'tsconfig.json'

  # 수동 트리거 (초기 설정, 디버깅용)
  workflow_dispatch:

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout monorepo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Prepare mirror content
        run: bash scripts/mirror-bot.sh

      - name: Push to public repo
        uses: cpina/github-action-push-to-another-repository@v1.7.2
        env:
          SSH_DEPLOY_KEY: ${{ secrets.BOT_MIRROR_DEPLOY_KEY }}
        with:
          source-directory: '.mirror-output'
          destination-github-username: 'sambart'
          destination-repository-name: 'onyu-bot'
          target-branch: 'main'
          commit-message: 'mirror: ${{ github.event.head_commit.message }}'
          user-name: 'github-actions[bot]'
          user-email: 'github-actions[bot]@users.noreply.github.com'
```

### 3-3. 미러링 스크립트

```bash
#!/usr/bin/env bash
# scripts/mirror-bot.sh
# Private 모노레포에서 Bot 관련 파일만 추출하여 Public 미러용 디렉토리를 생성한다.

set -euo pipefail

OUT=".mirror-output"
rm -rf "$OUT"
mkdir -p "$OUT"

# ─── 1. Bot 관련 소스 복사 ───
cp -r apps/bot         "$OUT/apps/bot"
cp -r libs/shared      "$OUT/libs/shared"
cp -r libs/bot-api-client "$OUT/libs/bot-api-client"

# ─── 2. Lavalink 설정 ───
cp -r lavalink "$OUT/lavalink"

# ─── 3. 공유 설정 파일 ───
cp tsconfig.json          "$OUT/"
cp eslint.config.base.mjs "$OUT/"
cp prettier.config.js     "$OUT/"
cp .gitignore             "$OUT/"
[ -f .npmrc ] && cp .npmrc "$OUT/"

# ─── 4. 민감 정보 제거 ───
# .env 파일 제거 (복사 안 함)
find "$OUT" -name '.env' -o -name '.env.*' ! -name '.env.example' | xargs -r rm -f

# 테스트 파일에 하드코딩된 민감 값이 있으면 치환 (현재는 없음)
# sed -i 's/ACTUAL_TOKEN/YOUR_TOKEN_HERE/g' "$OUT/some/file.ts"

# ─── 5. Public 전용 package.json 생성 ───
cat > "$OUT/package.json" << 'PKGJSON'
{
  "name": "onyu-bot",
  "version": "0.0.0",
  "private": true,
  "description": "DHyunBot - Multi-purpose Discord bot with voice tracking, music, and AI analytics",
  "packageManager": "pnpm@10.11.0",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "pnpm -r run build",
    "lint": "pnpm -r run lint",
    "lint:fix": "pnpm -r run lint:fix",
    "test": "pnpm -r run test",
    "bot:dev": "pnpm --filter @onyu/bot start:dev",
    "bot:build": "pnpm --filter @onyu/bot build",
    "bot:start": "pnpm --filter @onyu/bot start:prod"
  },
  "dependencies": {
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1"
  },
  "devDependencies": {
    "eslint": "^9.39.0",
    "prettier": "^3.0.0",
    "typescript": "^5.1.3",
    "typescript-eslint": "^8.50.0"
  }
}
PKGJSON

# ─── 6. Public 전용 pnpm-workspace.yaml ───
cat > "$OUT/pnpm-workspace.yaml" << 'WORKSPACE'
packages:
  - 'apps/bot'
  - 'libs/*'
WORKSPACE

# ─── 7. .env.example 생성 ───
cat > "$OUT/.env.example" << 'ENVEXAMPLE'
# Discord Bot
DISCORD_API_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Bot -> API 통신
API_BASE_URL=http://localhost:3000
BOT_API_KEY=your_bot_api_key_here

# Lavalink (Music)
LAVALINK_URL=lavalink:2333
LAVALINK_PASSWORD=youshallnotpass

# Spotify (optional, for Lavalink LavaSrc plugin)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# General
NODE_ENV=development
ENVEXAMPLE

# ─── 8. docker-compose.yml 생성 (셀프호스팅용) ───
cat > "$OUT/docker-compose.yml" << 'COMPOSE'
services:
  bot:
    build:
      context: .
      dockerfile: Dockerfile
    env_file: .env
    environment:
      - LAVALINK_URL=lavalink:2333
    depends_on:
      - lavalink
    restart: unless-stopped

  lavalink:
    image: ghcr.io/lavalink-devs/lavalink:4
    volumes:
      - ./lavalink/application.yml:/opt/Lavalink/application.yml
    environment:
      - _JAVA_OPTIONS=-Xmx128m
      - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID:-}
      - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET:-}
    restart: unless-stopped
COMPOSE

# ─── 9. Dockerfile 생성 ───
cat > "$OUT/Dockerfile" << 'DOCKERFILE'
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY libs/shared/package.json libs/shared/
COPY libs/bot-api-client/package.json libs/bot-api-client/
COPY apps/bot/package.json apps/bot/

RUN pnpm install --frozen-lockfile || pnpm install

COPY libs/shared/ libs/shared/
RUN pnpm --filter @onyu/shared build

COPY libs/bot-api-client/ libs/bot-api-client/
RUN pnpm --filter @onyu/bot-api-client build

COPY apps/bot/ apps/bot/
RUN pnpm --filter @onyu/bot build

CMD ["pnpm", "--filter", "@onyu/bot", "start:prod"]
DOCKERFILE

# ─── 10. README.md 생성 ───
cat > "$OUT/README.md" << 'README'
# Onyu Bot

디스코드 서버의 음성 채널 활동을 실시간 추적하고, AI 기반 분석 리포트를 제공하며,
음악 재생·신규사용자 관리·비활동 회원 분류 등을 수행하는 다목적 디스코드 봇.

## 기술 스택

- **Runtime**: Node.js 20 + NestJS 10
- **Discord**: discord.js 14 + discord-nestjs 5
- **Music**: Kazagumo v3 + Lavalink v4
- **Language**: TypeScript 5

## 아키텍처

이 레포는 Bot 클라이언트만 포함합니다.
Bot은 별도의 API 서버와 HTTP로 통신하여 비즈니스 로직을 처리합니다.

```
Discord ← Bot (이 레포) → API Server (별도)
```

## 시작하기

### 사전 요구사항

- Node.js >= 18
- pnpm >= 10
- Discord Bot Token
- API Server (별도 운영)
- Lavalink v4 (음악 기능 사용 시)

### 설치

```bash
pnpm install
cp .env.example .env
# .env 파일을 실제 값으로 수정
pnpm bot:dev
```

### Docker

```bash
cp .env.example .env
docker compose up -d
```

## 프로젝트 구조

```
apps/bot/               # Discord 봇 메인
├── command/            # 슬래시 커맨드
├── event/              # Discord 이벤트 핸들러
├── scheduler/          # 배경 작업 (모니터링, CoPresence)
├── music/              # 음악 재생 (Kazagumo + Lavalink)
└── common/             # 공유 유틸

libs/shared/            # 공유 타입/상수
libs/bot-api-client/    # Bot → API HTTP 클라이언트
```

## License

MIT
README

# ─── 11. LICENSE 생성 ───
YEAR=$(date +%Y)
cat > "$OUT/LICENSE" << LICEOF
MIT License

Copyright (c) $YEAR sambart

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
LICEOF

echo "Mirror output prepared at $OUT"
echo "Files: $(find "$OUT" -type f | wc -l)"
```

### 3-4. 인증 설정

**Deploy Key 방식 (권장):**

1. SSH 키 생성:
   ```bash
   ssh-keygen -t ed25519 -C "onyu-bot-mirror" -f bot-mirror-key -N ""
   ```

2. Public key → `sambart/onyu-bot` 레포의 **Deploy keys** (Write access 활성화)

3. Private key → `sambart/onyu` 레포의 **Secrets** (`BOT_MIRROR_DEPLOY_KEY`)

> PAT(Personal Access Token)보다 Deploy Key가 권장됨 — 스코프가 단일 레포로 제한되어 보안적으로 우수.

### 3-5. 트리거 조건

```yaml
paths:
  - 'apps/bot/**'
  - 'libs/shared/**'
  - 'libs/bot-api-client/**'
  - 'lavalink/**'
  - 'eslint.config.base.mjs'
  - 'prettier.config.js'
  - 'tsconfig.json'
```

- Bot과 무관한 변경(apps/api, apps/web)에서는 미러링 미실행
- `workflow_dispatch`로 수동 트리거 가능 (초기 설정, 긴급 동기화)

### 3-6. 커밋 메시지 전파

```yaml
commit-message: 'mirror: ${{ github.event.head_commit.message }}'
```

- Private의 커밋 메시지를 `mirror:` 접두사로 전파
- Public에서 변경 히스토리 추적 가능
- 단, git history는 1:1 대응이 아닌 스냅샷 교체 방식 (squash)

---

## 4. 민감 정보 제거 체크리스트

### 4-1. 자동 제거 (mirror-bot.sh에서 처리)

| 항목 | 처리 |
|------|------|
| `.env`, `.env.prod`, `.env.test` | 복사 안 함 |
| `.env.example` | 더미값으로 새로 생성 |
| `.github/workflows/deploy.yml` | 복사 안 함 (배포 스크립트 비공개) |
| `docker-compose.prod.yml` | 복사 안 함 |
| `scripts/` (배포 스크립트) | 복사 안 함 |

### 4-2. 수동 확인 필요 (현재 미발견)

| 항목 | 현재 상태 |
|------|----------|
| 하드코딩된 Guild/Channel/User ID | 미발견 — 모두 환경변수/DB 기반 |
| 하드코딩된 서버 IP/도메인 | 미발견 — localhost 기본값만 존재 |
| 하드코딩된 API 키/토큰 | 미발견 — 모두 환경변수 사용 |
| `.env.test` (git tracked) | 테스트용 더미값만 포함 (localhost, 공백 비밀번호) — 공개 가능 |

### 4-3. 향후 주의사항

- Bot 코드에 민감 정보를 하드코딩하면 Public에 자동 노출됨
- PR 리뷰 시 Bot 관련 변경에 민감 정보 포함 여부 확인 필요
- mirror-bot.sh에 추가 sed 패턴으로 사후 방어 가능

---

## 5. 구현 순서

### Step 1: Public 레포 생성

1. GitHub에서 `sambart/onyu-bot` Public 레포 생성 (빈 상태, README 없이)
2. 레포 설명: "Multi-purpose Discord bot with voice tracking, music, and AI analytics"
3. Topics: `discord-bot`, `nestjs`, `typescript`, `discord-js`, `lavalink`

### Step 2: Deploy Key 설정

1. SSH 키 쌍 생성
2. Public key → `onyu-bot` Deploy keys (Write access)
3. Private key → `onyu` Secrets (`BOT_MIRROR_DEPLOY_KEY`)

### Step 3: 미러링 스크립트 작성

1. `scripts/mirror-bot.sh` 생성 (3-3절 내용)
2. 로컬에서 실행하여 `.mirror-output/` 내용 검증
   - 민감 정보 없는지 확인
   - `pnpm install && pnpm build` 성공하는지 확인
   - Docker build 성공하는지 확인

### Step 4: CI 워크플로우 추가

1. `.github/workflows/mirror-bot.yml` 생성 (3-2절 내용)
2. develop 브랜치에서 테스트 (workflow_dispatch)
3. main에 merge하여 자동 트리거 확인

### Step 5: Public 레포 검증

1. `onyu-bot` 레포에 코드가 정상 push되었는지 확인
2. GitHub에서 README, 파일 구조 확인
3. clone 후 `pnpm install && pnpm build` 통과 확인

---

## 6. 운영 고려사항

### 6-1. Private 모노레포

- **변경 없음** — 기존 개발·배포·CI 모두 그대로 유지
- mirror-bot.yml 워크플로우 1개만 추가

### 6-2. Public 레포 관리

- **Issues**: 비활성화 또는 템플릿으로 Private 레포로 안내
- **Pull Requests**: 받지 않음 (또는 Private에서 수동 반영)
- **Branch protection**: main 브랜치 force-push 허용 (CI bot이 push)
- **CONTRIBUTING.md**: "이 레포는 읽기 전용 미러입니다" 안내

### 6-3. pnpm-lock.yaml 처리

Public 레포에는 lockfile을 포함하지 않는다 (mirror-bot.sh에서 복사 안 함).
- 이유: Private 모노레포의 lockfile은 api/web 의존성도 포함하므로 그대로 사용 불가
- Public clone 시 `pnpm install`로 fresh lockfile 생성

---

## 예상 소요 시간

| 단계 | 예상 시간 |
|------|-----------|
| Step 1: Public 레포 생성 | 5분 |
| Step 2: Deploy Key 설정 | 10분 |
| Step 3: 미러링 스크립트 작성 + 로컬 검증 | 1~2시간 |
| Step 4: CI 워크플로우 + 테스트 | 30분 |
| Step 5: Public 레포 검증 | 15분 |
| **합계** | **약 2~3시간** |
