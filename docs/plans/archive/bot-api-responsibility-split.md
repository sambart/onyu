# Bot / API 책임 분리 명세

> 최종 업데이트: 2026-03-17

## 핵심 원칙

| 프로세스 | 책임 | Discord 연결 |
|---------|------|-------------|
| **Bot** | Discord 이벤트 수신, Discord API 응답(메시지/Embed/역할/채널), 슬래시 커맨드 등록·응답, 음악 재생 | Gateway 연결 O |
| **API** | 비즈니스 로직, DB/Redis CRUD, 데이터 분석, 스케줄러(Cron), 웹 대시보드 REST API | Gateway 연결 X |

**판단 기준:** Discord.js 네이티브 객체(`ButtonInteraction`, `GuildMember`, `VoiceState`, `CommandInteraction`)가 필요한 코드는 **Bot**, DB/Redis 조회·저장이 핵심인 코드는 **API**.

---

## 현재 구조 (달성 완료)

```
┌─────────────────────────────────────────────────────────┐
│ Bot Process (apps/bot)                                   │
│                                                          │
│ Discord Gateway 연결 (유일한 연결점)                       │
│ ├── @On 이벤트 핸들러                                     │
│ │   ├── voiceStateUpdate   → API POST /bot-api/voice     │
│ │   ├── guildMemberAdd     → API + Bot 직접 처리          │
│ │   ├── messageCreate      → API POST /bot-api/sticky    │
│ │   ├── channelCreate/Delete/Update → 로깅만              │
│ │   └── interactionCreate  → newbie/status-prefix 버튼   │
│ ├── @Command 슬래시 커맨드 (14개)                         │
│ │   ├── /version, /voice-flush                           │
│ │   ├── /play, /skip, /stop (discord-player)             │
│ │   ├── /고정메세지등록, /고정메세지삭제, /고정메세지목록     │
│ │   ├── /voice-stats, /my-voice-stats, /voice-leaderboard│
│ │   ├── /community-health, /자가진단                      │
│ │   └── /me                                              │
│ ├── 음악 모듈 (discord-player)                            │
│ └── BotApiClient (API HTTP 호출)                          │
└─────────────────────────────────────────────────────────┘
          │ HTTP only
          ▼
┌─────────────────────────────────────────────────────────┐
│ API Process (apps/api)                                   │
│                                                          │
│ Discord Gateway 연결 X                                    │
│ ├── DiscordRestService (Bot Token으로 REST API만 호출)    │
│ ├── bot-api/ 엔드포인트 (Bot → API 통신)                  │
│ │   ├── voice/    — 음성 이벤트 수신 → 서비스 호출         │
│ │   ├── newbie/   — 미션/설정/역할 API                    │
│ │   ├── sticky-message/ — 디바운스 + 갱신                 │
│ │   ├── voice-analytics/ — 통계/분석/진단                 │
│ │   └── me/       — 프로필 카드                           │
│ ├── 웹 대시보드 REST API                                  │
│ ├── 비즈니스 로직 (서비스 계층)                             │
│ ├── DB/Redis CRUD                                        │
│ ├── AI 분석 (Gemini)                                      │
│ └── 스케줄러 (DB/Redis 기반)                               │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Discord 이벤트 — Bot 담당 (완료)

| Discord 이벤트 | Bot 핸들러 | API 호출 | 상태 |
|---------------|-----------|---------|------|
| `voiceStateUpdate` | `BotVoiceStateDispatcher` | `POST /bot-api/voice/state-update` | 완료 |
| `guildMemberAdd` | `BotNewbieMemberAddHandler` | `GET /bot-api/newbie/config` + `POST /bot-api/newbie/member-join` | 완료 |
| `messageCreate` | `BotStickyMessageHandler` | `POST /bot-api/sticky-message/message-created` | 완료 |
| `channelCreate/Delete/Update` | `BotChannelStateHandler` | 없음 (로깅만) | 완료 |
| `interactionCreate` (newbie) | `BotNewbieInteractionHandler` | `POST /bot-api/newbie/mission-refresh` 등 | 완료 |
| `interactionCreate` (status-prefix) | `BotStatusPrefixInteractionHandler` | `POST /bot-api/status-prefix/apply\|reset` | 완료 |

---

## 2. 슬래시 커맨드 — Bot 담당 (완료)

| 명령어 | Bot 위치 | API 호출 | 상태 |
|--------|---------|---------|------|
| `/version` | `command/version.command.ts` | 없음 (직접 응답) | 완료 |
| `/voice-flush` | `command/voice-flush.command.ts` | `POST /bot-api/voice/flush` | 완료 |
| `/play`, `/skip`, `/stop` | `music/` | 없음 (discord-player 직접) | 완료 |
| `/고정메세지등록/삭제/목록` | `command/sticky-message/` | `GET/DELETE /bot-api/sticky-message/*` | 완료 |
| `/voice-stats` | `command/voice-analytics/` | `POST /bot-api/voice-analytics/analyze` | 완료 |
| `/my-voice-stats` | `command/voice-analytics/` | `GET /bot-api/voice-analytics/my-stats` | 완료 |
| `/voice-leaderboard` | `command/voice-analytics/` | `GET /bot-api/voice-analytics/leaderboard` | 완료 |
| `/community-health` | `command/voice-analytics/` | `POST /bot-api/voice-analytics/community-health` | 완료 |
| `/자가진단` | `command/voice-analytics/` | `POST /bot-api/voice-analytics/self-diagnosis` | 완료 |
| `/me` | `command/me.command.ts` | `POST /bot-api/me/profile` | 완료 |

---

## 3. 비즈니스 로직 — API 담당

### 3-1. Bot에서 HTTP로 호출되는 로직 (완료)

| API 엔드포인트 | 서비스 | 상태 |
|--------------|--------|------|
| `POST /bot-api/voice/state-update` | `BotVoiceEventListener` → `VoiceChannelService` | 완료 |
| `POST /bot-api/newbie/member-join` | `MissionService.createMissionFromBot()` | 완료 |
| `GET /bot-api/newbie/config` | `NewbieConfigRepository` | 완료 |
| `POST /bot-api/newbie/mission-refresh` | `MissionService.invalidateAndRefresh()` | 완료 |
| `GET /bot-api/newbie/moco-rank` | `MocoService.buildRankPayload()` | 완료 |
| `POST /bot-api/sticky-message/message-created` | `StickyMessageRefreshService` | 완료 |
| `GET /bot-api/sticky-message/configs` | `StickyMessageConfigRepository` | 완료 |
| `DELETE /bot-api/sticky-message/by-channel` | `StickyMessageConfigService` | 완료 |
| `GET /bot-api/voice-analytics/my-stats` | `VoiceAnalyticsService` | 완료 |
| `GET /bot-api/voice-analytics/leaderboard` | `VoiceAnalyticsService` | 완료 |
| `POST /bot-api/voice-analytics/analyze` | `VoiceAiAnalysisService` | 완료 |
| `POST /bot-api/voice-analytics/community-health` | `VoiceAiAnalysisService` | 완료 |
| `POST /bot-api/voice-analytics/self-diagnosis` | `SelfDiagnosisService` | 완료 |
| `POST /bot-api/me/profile` | `MeProfileService` | 완료 |
| `POST /bot-api/status-prefix/apply` | `StatusPrefixApplyService` | 완료 |
| `POST /bot-api/status-prefix/reset` | `StatusPrefixResetService` | 완료 |

### 3-2. API의 Discord API 호출 방식 (전환 완료)

기존 `@InjectDiscordClient()` + Discord Gateway 방식에서 `DiscordRestService` + REST API 방식으로 전환 완료.

| Adapter | 전환 상태 |
|---------|----------|
| `MissionDiscordPresenter` | DiscordRestService 사용 |
| `MissionDiscordActionService` | DiscordRestService 사용 |
| `MocoDiscordPresenter` | DiscordRestService 사용 |
| `StickyMessageDiscordAdapter` | DiscordRestService 사용 |
| `StatusPrefixDiscordAdapter` | DiscordRestService 사용 |
| `InactiveMemberDiscordAdapter` | DiscordRestService 사용 |
| `NewbieRoleDiscordAdapter` | DiscordRestService 사용 |
| `MocoMemberDiscordAdapter` | DiscordRestService 사용 |
| `AutoChannelDiscordGateway` | DiscordRestService 사용 |
| `DiscordVoiceGateway` | DiscordRestService 사용 |
| `GuildInfoController` | DiscordRestService 사용 |
| `DiscordGateway` | DiscordRestService 사용 |
| `WelcomeService` | DiscordRestService 사용 |

### 3-3. 스케줄러 — API 담당

| 스케줄러 | Discord 사용 | 상태 |
|---------|-------------|------|
| `MissionScheduler` | 없음 (DB만) | 완료 — API 유지 |
| `MocoResetScheduler` | 없음 (Redis만) | 완료 — API 유지 |
| `NewbieRoleScheduler` | DiscordRestService 통해 역할 제거 | 완료 — API 유지 |
| `InactiveMemberScheduler` | DiscordRestService 통해 처리 | 완료 — API 유지 |
| `CoPresenceScheduler` | 빈 스냅샷 반환 | **미완료** — Bot API 엔드포인트 필요 |
| `MonitoringScheduler` | 프로세스 메트릭만 | **미완료** — Bot API 엔드포인트 필요 |

---

## 4. API에서 제거 완료된 Discord 의존성

| 항목 | 개수 | 상태 |
|------|------|------|
| `DiscordModule.forRootAsync()` | 1 → 0 | 삭제 완료 |
| `DiscordModule.forFeature()` | 12 → 0 | 삭제 완료 |
| `@InjectDiscordClient()` | 18 → 0 | 전환 완료 |
| `@On()` 이벤트 핸들러 | 2 → 0 | 삭제 완료 |
| `@Command()` 슬래시 커맨드 | 14 → 0 | 삭제 완료 |
| `@discord-nestjs/core` import | 다수 → 0 | 제거 완료 |
| `discord.config.ts` | 1 → 0 | 삭제 완료 |
| `event/` 디렉토리 | 존재 → 삭제 | 완전 삭제 |
| `music/` 모듈 | 존재 → 삭제 | Bot 전용 |
| `version/` 모듈 | 존재 → 삭제 | Bot 전용 |

---

## 5. 미완료 항목 (2개)

### 5-1. CoPresenceScheduler Bot 엔드포인트

**문제:** 60초 주기로 모든 길드의 음성 채널 멤버를 스캔하여 동시접속 쌍을 기록하는데, Discord Gateway 캐시(`guilds.cache`, `channels.cache`, `channel.members`)가 필요.

**해결 방안:**
1. Bot에 `GET /bot-api/discord/voice-snapshots` 엔드포인트 추가 — Bot이 Gateway 캐시에서 음성 채널 멤버 목록 수집
2. API의 CoPresenceScheduler가 Bot에 HTTP 요청하여 스냅샷 수신 후 DB 저장
3. 또는: Bot에서 스케줄러 자체를 실행하고 결과를 API로 push

### 5-2. MonitoringScheduler Bot 메트릭

**문제:** `ws.status`, `ws.ping`, `uptime`, `guilds.cache.size` 등 Gateway 상태 메트릭이 필요.

**해결 방안:**
1. Bot에 `GET /bot-api/discord/status` 엔드포인트 추가 — ws 상태, ping, uptime, 길드 수 반환
2. API의 MonitoringScheduler가 Bot에 HTTP 요청하여 메트릭 수신
3. HealthIndicator도 동일 엔드포인트 활용
