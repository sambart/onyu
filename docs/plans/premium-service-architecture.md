# Onyu 프리미엄 서비스 전환 계획

## Context

현재 Onyu은 단일 NestJS 프로세스에서 Discord 봇과 REST API를 함께 실행하며, 비즈니스 로직과 Discord 로직이 혼재되어 있다. 프리미엄 서비스 도입을 위해:
1. Bot(Public) / API+Web(Private) 레포 분리로 핵심 비즈니스 로직 보호
2. Bot → API HTTP 호출 구조로 전환하여 독립 배포/스케일링 가능하게
3. Newbie 모듈의 구조적 문제(Gateway 위치 불일치, 비대한 서비스)를 선행 정리

---

## Phase 1: Newbie 모듈 리팩토링 (현재 모노레포 내)

### 1-1. NewbieGateway → event/ 디렉토리 이동

| 작업 | 상세 |
|------|------|
| 이동 | `newbie/presentation/newbie.gateway.ts` → `event/newbie/newbie-member-add.handler.ts` |
| 이름 변경 | `NewbieGateway` → `NewbieMemberAddHandler` |
| 수정 | `event/discord-events.module.ts` — providers에 `NewbieMemberAddHandler` 추가 |
| 수정 | `newbie/newbie.module.ts` — providers에서 `NewbieGateway` 제거 |
| 삭제 | `event/newbie/newbie-voice-state-changed.handler.ts` (deprecated) |

> NewbieGateway는 exports에 포함되지 않으므로 외부 의존 없이 안전하게 이동 가능. DiscordEventsModule이 이미 NewbieModule을 import하므로 서비스 주입 유지됨.

### 1-2. MissionService Discord 로직 분리 (873줄 → 3개 파일)

**새 파일:**
- `newbie/application/mission/mission-discord.presenter.ts` — Embed/Button UI 렌더링
- `newbie/application/mission/mission-discord-action.service.ts` — Discord API 액션 (역할/강퇴/DM)

**분리 기준:**

```
MissionService (순수 비즈니스 로직)
├── createMission()        → DB 생성 후 presenter.refreshEmbed() 호출
├── enrichMissions()       → 플레이타임/플레이횟수 데이터 보강
├── getPlaytimeSec()       → VoiceDailyOrm 집계 쿼리
├── getPlayCount()         → VoiceChannelHistoryOrm 필터 쿼리
├── completeMission()      → 상태 변경 후 discordAction.grantRole()
├── failMission()          → 상태 변경 후 discordAction.sendDmAndKick()
├── invalidateAndRefresh() → 캐시 무효화 + 달성 판정
├── registerMissingMembers() → discordAction.fetchGuildMembers()로 멤버 목록 확보
└── removeInvalidMissions()  → discordAction.checkMemberExists()로 유효성 확인

MissionDiscordPresenter (Discord UI)
├── refreshMissionEmbed()      → 채널 fetch + Embed 전송/수정
├── deleteEmbed()              → 메시지 삭제
├── buildMissionEmbed()        → EmbedBuilder 구성
├── buildRefreshButton()       → ButtonBuilder 구성
├── fetchMemberDisplayName()   → Discord API 멤버명 조회
└── resolveEmbedColor()        → 색상 파싱

MissionDiscordActionService (Discord API 액션)
├── grantRole()              → guild.members.fetch + roles.add
├── sendDmAndKick()          → member.send + member.kick
├── fetchGuildMembers()      → guild.members.fetch (전체 멤버 목록)
├── checkMemberExists()      → 개별 멤버 유효성
└── updateMemberDisplayName() → displayName 조회
```

**수정 대상:** `newbie.module.ts`, `newbie.controller.ts`, `mission.scheduler.ts`, `newbie-interaction.handler.ts`

### 1-3. MocoService Discord 로직 분리

**새 파일:**
- `newbie/application/moco/moco-discord.presenter.ts`

**이동 대상:** `buildRankPayload()` 내 EmbedBuilder/ButtonBuilder, `sendOrUpdateRankEmbed()`, displayName 조회 로직

### 1-4. MocoEventHandler Discord 의존 추상화

**새 파일:**
- `newbie/application/moco/moco-member-resolver.port.ts` — 인터페이스
- `newbie/infrastructure/moco-member-discord.adapter.ts` — Discord 구현체

```typescript
interface MocoMemberResolver {
  getNewbieIds(guildId: string, channelId: string, userIds: string[], cutoffMs: number): Promise<string[]>;
  isValidHunter(guildId: string, hunterId: string, cutoffMs: number, allowNewbie: boolean): Promise<boolean>;
}
```

### 1-5. NewbieRoleService/Scheduler Discord 분리

**새 파일:**
- `newbie/application/role/newbie-role-discord.adapter.ts`

**이동 대상:** `member.roles.add()`, `guild.members.fetch + member.roles.remove()`

### 주의사항
- MocoResetScheduler가 `forwardRef(() => MocoService)` 사용 중 — presenter 분리 시 순환 참조 해결 필요
- MissionService 호출자가 다수이므로 import 경로 변경 범위 확인 필요

---

## Phase 2: 전체 모듈 Discord/비즈니스 분리 + Bot용 API 설계

### 2-1. 동일 패턴 적용 대상

| 모듈 | 대상 파일 | Discord 사용 | 우선순위 |
|------|----------|-------------|---------|
| inactive-member | controller, action.service, scheduler | guild.members.fetch, kick, mute | 1 |
| sticky-message | refresh.service | 메시지 fetch/delete/send | 2 |
| status-prefix | apply/reset/config.service | 닉네임 변경, 메시지 전송 | 3 |
| monitoring | monitoring.service | 봇 메트릭 수집 | 4 |
| co-presence | scheduler | 음성 채널 멤버 조회 | 5 |

> **music 모듈은 제외** — discord-player는 음성 연결 필수이므로 Bot에 유지

### 2-2. Bot 전용 API 엔드포인트

**새 디렉토리:** `apps/api/src/bot-api/`

```
bot-api/
├── bot-api.module.ts
├── bot-api-auth.guard.ts              (API Key 인증)
├── voice/
│   └── bot-voice.controller.ts
│       POST /bot-api/voice/join
│       POST /bot-api/voice/leave
│       POST /bot-api/voice/move
├── newbie/
│   └── bot-newbie.controller.ts
│       POST /bot-api/newbie/member-join
│       POST /bot-api/newbie/mission-refresh
│       GET  /bot-api/newbie/moco-rank
├── guild/
│   └── bot-guild.controller.ts
│       GET  /bot-api/guilds/:id/channels
│       GET  /bot-api/guilds/:id/roles
│       POST /bot-api/guilds/:id/members/:memberId/roles/add
│       POST /bot-api/guilds/:id/members/:memberId/kick
├── sticky-message/
├── status-prefix/
└── inactive-member/
```

**인증:** 환경 변수 `BOT_API_KEY` 기반 Bearer 토큰 (서비스 간 신뢰 관계)

---

## Phase 3: Bot 클라이언트 분리

### 3-1. 모노레포 구조 변경

```
apps/
├── api/               → 비즈니스 로직 + DB + AI (Discord 의존 제거)
├── bot/               → 경량 봇 (Discord 이벤트 + API 호출 + 응답 렌더링)
├── web/               → Next.js 대시보드
libs/
├── shared/            → 공유 타입/상수
├── bot-api-client/    → Bot → API HTTP 클라이언트 SDK (신규)
├── i18n/
```

### 3-2. apps/bot 구조

```
apps/bot/src/
├── main.ts
├── app.module.ts
├── api-client/                     (API 호출 래퍼)
│   ├── api-client.module.ts
│   └── api-client.service.ts
├── event/                          (Discord 이벤트 감지 → API 호출)
│   ├── voice-state.dispatcher.ts
│   ├── member-add.handler.ts
│   ├── interaction.dispatcher.ts
│   ├── message.handler.ts
│   └── channel-state.handler.ts
├── command/                        (슬래시 명령어 → API 호출 → Embed 렌더링)
│   ├── voice-analytics/
│   └── version/
├── music/                          (discord-player — Bot에 유지)
├── presenter/                      (Embed/Button 렌더링)
└── gateway/                        (Discord 캐시)
```

### 3-3. 마이그레이션 순서
1. `libs/bot-api-client` SDK 생성
2. `apps/bot` scaffold
3. API에 `bot-api/` 엔드포인트 배포
4. 이벤트 핸들러 순차 이동: voice → newbie → sticky-message → status-prefix → inactive-member
5. 각 이동 후 검증
6. API에서 `DiscordModule.forRoot()` 제거

### 주의사항
- 음성 이벤트는 fire-and-forget HTTP POST (429 시 로그만 남기고 drop)
- co-presence.scheduler는 Bot에서 실행, 결과를 API로 전송
- Guild 정보 조회: Bot이 API 요청 payload에 필요 정보(유저명, 채널명) 포함

---

## Phase 4: Public/Private 레포 분리

### 4-1. 레포 구성

| 레포 | 공개 | 포함 |
|------|------|------|
| `onyu` (Public) | O | apps/bot, libs/shared, libs/bot-api-client, libs/i18n |
| `onyu-api` (Private) | X | apps/api, apps/web, libs/shared |

### 4-2. libs/shared 공유
- **npm private 패키지 권장** (`@onyu/shared` → GitHub Packages)
- Bot과 API 모두 패키지 의존성으로 사용
- 버전 관리 명확

### 4-3. Docker Compose

```yaml
services:
  api:
    image: onyu-api
    depends_on: [db, redis]
  bot:
    image: onyu-bot
    environment:
      - API_BASE_URL=http://api:3000
      - BOT_API_KEY=${BOT_API_KEY}
    depends_on: [api]
  web:
    image: onyu-web
    depends_on: [api]
  db: ...
  redis: ...
```

### 4-4. 의존성 분리
- Bot 전용: `discord.js`, `discord-nestjs`, `discord-player`
- API 전용: `typeorm`, `@nestjs/typeorm`, `pg`, `@google/generative-ai`
- 공유: `class-validator`, `class-transformer`

### 주의사항
- git history 보존: `git filter-repo` 사용
- 기존 이슈/PR 링크 정리 선행

---

## Phase 5: 프리미엄 기능 인프라

### 5-1. Subscription 모듈

**새 모듈:** `apps/api/src/subscription/`

```
subscription/
├── domain/
│   ├── plan.types.ts           (FREE, PRO, ENTERPRISE)
│   └── feature-gate.types.ts
├── application/
│   ├── subscription.service.ts
│   ├── feature-gate.service.ts
│   └── usage-tracker.service.ts
├── infrastructure/
│   ├── subscription.orm-entity.ts
│   └── guild-usage.orm-entity.ts
└── presentation/
    ├── subscription.controller.ts
    └── subscription.guard.ts
```

### 5-2. Feature Gate

```typescript
@UseGuards(FeatureGateGuard)
@RequireFeature('voice-analytics')
@Get('voice-stats')
async getVoiceStats() { ... }
```

| 기능 | FREE | PRO |
|------|------|-----|
| 음성 추적 | 1 길드 | 무제한 |
| AI 분석 리포트 | 월 3회 | 무제한 |
| 비활동 회원 자동 분류 | X | O |
| 커스텀 템플릿 | X | O |
| API Rate Limit | 60/min | 300/min |

### 5-3. Rate Limit 차등
- `PlanAwareThrottlerGuard`: 길드 플랜에 따라 throttler 선택
- Bot → API: 별도 tier (1000 req/min), 음성 이벤트 burst 예외

---

## 핵심 수정 파일 목록

### Phase 1
- `apps/api/src/newbie/presentation/newbie.gateway.ts` → 이동/삭제
- `apps/api/src/newbie/application/mission/mission.service.ts` → 분리
- `apps/api/src/newbie/application/moco/moco.service.ts` → 분리
- `apps/api/src/newbie/application/moco/moco-event.handler.ts` → 추상화
- `apps/api/src/newbie/application/role/newbie-role.service.ts` → 분리
- `apps/api/src/newbie/application/role/newbie-role.scheduler.ts` → 분리
- `apps/api/src/newbie/newbie.module.ts` → 새 provider 등록
- `apps/api/src/event/discord-events.module.ts` → handler 추가
- `apps/api/src/event/newbie/newbie-voice-state-changed.handler.ts` → 삭제

### Phase 2
- 각 도메인 모듈에 `*-discord.adapter.ts` 추가
- `apps/api/src/bot-api/` 디렉토리 전체 신규 생성
- `apps/api/src/app.module.ts` → BotApiModule 추가

### Phase 3
- `apps/bot/` 디렉토리 전체 신규 생성
- `libs/bot-api-client/` 신규 생성
- `apps/api/src/event/` → Bot으로 이동 후 API에서 삭제
- `apps/api/src/app.module.ts` → DiscordModule.forRoot() 제거

---

## 검증 방법

### Phase 1
- `pnpm --filter @onyu/api build` 성공 확인
- `pnpm --filter @onyu/api lint` 통과
- 기존 단위 테스트 통과
- 봇을 실행하여 guildMemberAdd, 미션 갱신, 모코코 순위가 정상 동작하는지 수동 테스트

### Phase 2-3
- Bot과 API를 별도 프로세스로 실행하여 통신 확인
- 음성 JOIN/LEAVE 이벤트 → API 기록 → 대시보드 조회 E2E 테스트
- music 모듈 독립 동작 확인

### Phase 4-5
- CI/CD 파이프라인 성공
- Docker Compose로 전체 스택 기동 테스트
- 프리미엄 Feature Gate 동작 확인
