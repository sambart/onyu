# General 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

일반설정(General) 도메인은 Onyu의 슬래시 커맨드 등록 방식과 웹 대시보드의 일반설정 페이지를 다룬다. 핵심 목표는 두 가지다. 첫째, 백엔드에서 discord-nestjs의 `ExplorerService`가 `@Command` 데코레이터를 자동 탐색하는 방식을 명확히 규정하고, `discord.config.ts`의 수동 `commands` 배열을 제거한다. 둘째, 실제 Discord API에 등록된 슬래시 커맨드 목록을 REST API로 노출하고, 웹 대시보드 일반설정 페이지에서 동적으로 렌더링한다.

이 도메인은 게이트웨이(gateway)와 웹(web) 두 계층에 걸쳐 있다.

## 관련 모듈

- `apps/api/src/config/discord.config.ts` — Discord 클라이언트 및 커맨드 등록 설정
- `apps/api/src/gateway/guild-info.controller.ts` — 길드 정보 REST API (채널/역할/이모지/커맨드 엔드포인트)
- `apps/api/src/gateway/gateway.module.ts` — Gateway 모듈 (GuildInfoController 소속)
- `apps/web/app/settings/guild/[guildId]/page.tsx` — 일반설정 페이지 (슬래시 커맨드 목록 표시)
- `apps/web/app/lib/discord-api.ts` — 웹 클라이언트용 API 헬퍼 함수 모음
- `apps/web/app/api/guilds/[...path]/route.ts` — 백엔드 프록시 라우트 (JWT 토큰 주입)

## 아키텍처

```
[discord.config.ts]   commands 배열 제거
    │
    ▼
[discord-nestjs ExplorerService]   ← DiscoveryService.getProviders()로 @Command 자동 탐색
    │
    └── 각 모듈(MusicModule, GeminiModule, VoiceAnalyticsModule 등)의
        providers에 등록된 커맨드 클래스를 자동 발견하여 Discord에 등록

Web Dashboard (일반설정 페이지)
    │
    ▼
GET /api/guilds/:guildId/commands   (Next.js 프록시 → NestJS)
    │
    ▼
[GuildInfoController.getCommands()]
    │
    └── Discord REST API: GET /applications/{appId}/commands (글로벌 커맨드)
              └── 등록된 슬래시 커맨드 목록 반환
```

---

## 기능 상세

### F-GENERAL-001: 슬래시 커맨드 자동 등록

- **트리거**: NestJS 애플리케이션 부트스트랩 (`onModuleInit`)
- **현재 문제**:
  - `discord.config.ts`에 7개 커맨드를 수동 import하여 `commands` 배열에 등록하고 있으나, discord-nestjs v5.5.1의 `DiscordModuleOption` 인터페이스에 `commands` 속성이 존재하지 않아 해당 배열은 라이브러리에 의해 무시된다.
  - voice 모듈의 슬래시 커맨드 3개(`/create-auto-channel`, `/voice-channel`, `/voice-analytics` 계열)가 누락되어 있다.
- **요구 동작**:
  1. `discord.config.ts`에서 `commands` 배열 전체 및 관련 `import` 구문을 제거한다.
  2. discord-nestjs `ExplorerService`가 `DiscoveryService.getProviders()`를 통해 애플리케이션의 모든 provider를 스캔하고 `@Command` 데코레이터가 붙은 클래스를 자동으로 발견한다.
  3. 새 슬래시 커맨드 추가 시, 해당 모듈의 `providers` 배열에 커맨드 클래스를 등록하는 것만으로 Discord에 자동 등록된다. `discord.config.ts` 수정이 불필요하다.
- **자동 등록 조건**: 각 커맨드 모듈이 `DiscordModule.forFeature()`를 `imports`에 포함하고 있어야 한다.
- **`registerCommandOptions` 유지**: `removeCommandsBefore: true` 옵션은 그대로 유지한다. 재시작 시 기존에 Discord에 등록된 커맨드를 제거하고 재등록한다.
- **현재 등록되어야 할 커맨드 목록**:

  | 커맨드 | 모듈 | 설명 |
  |--------|------|------|
  | `/play` | MusicModule | 음악 재생 (일시 중단) |
  | `/skip` | MusicModule | 현재 곡 건너뛰기 (일시 중단) |
  | `/stop` | MusicModule | 재생 중지 및 채널 퇴장 (일시 중단) |
  | `/pause` | MusicModule | 일시정지 (일시 중단) |
  | `/resume` | MusicModule | 재개 (일시 중단) |
  | `/서버진단` | VoiceAnalyticsModule | 서버 음성 활동 요약 + AI 분석 |
  | `/self-diagnosis` | BotCommandModule | 봇 자가 진단 |
  | `/server-diagnosis` | BotCommandModule | 서버 진단 |
  | `/version` | BotCommandModule | 봇 버전 확인 |
  | `/voice-flush` | BotCommandModule | 음성 세션 수동 flush |
  | `/me` | BotCommandModule | 내 정보 조회 |
  | `/고정메세지등록` | BotCommandModule | 고정메세지 등록 |
  | `/고정메세지삭제` | BotCommandModule | 고정메세지 삭제 |
  | `/고정메세지목록` | BotCommandModule | 고정메세지 목록 조회 |

- **오류 처리**: `failOnLogin: true` 설정에 따라 Discord 연결 실패 시 프로세스 종료.

---

### F-GENERAL-002: 커맨드 목록 API

- **엔드포인트**: `GET /api/guilds/:guildId/commands`
- **인증**: `JwtAuthGuard` 적용 (기존 `GuildInfoController`와 동일)
- **동작**:
  1. `@InjectDiscordClient()` 로 주입된 `Client`에서 `application` 정보 조회
  2. Discord REST API `GET /applications/{applicationId}/commands` 호출 (글로벌 커맨드 조회, 길드 한정 아님)
  3. `application`이 null이면 빈 배열 반환
  4. 등록된 슬래시 커맨드 목록을 배열로 반환
- **응답 형식**:
  ```json
  [
    {
      "id": "1234567890",
      "name": "play",
      "description": "YouTube에서 음악을 재생합니다."
    },
    {
      "id": "1234567891",
      "name": "voice-stats",
      "description": "서버 전체 음성 활동을 AI로 분석합니다."
    }
  ]
  ```
- **응답 필드**:

  | 필드 | 타입 | 설명 |
  |------|------|------|
  | `id` | `string` | Discord Application Command ID |
  | `name` | `string` | 커맨드 이름 (슬래시 제외, 예: `play`) |
  | `description` | `string` | 커맨드 설명 |

- **오류 처리**:
  - `client.application`이 null인 경우: 빈 배열 `[]` 반환
  - Discord API 오류: 빈 배열 `[]` 반환 (catch 블록, 별도 로그 없음)

---

### F-GENERAL-003: 프론트엔드 동적 커맨드 목록

- **경로**: `/settings/guild/[guildId]` (일반설정 페이지)
- **현재 문제**: 7개 커맨드가 컴포넌트 상단에 하드코딩된 `commands` 배열로 존재한다. 실제 Discord에 등록된 커맨드와 불일치할 수 있다.
- **요구 동작**:
  1. 페이지 마운트 시 `GET /api/guilds/{guildId}/commands` 호출
  2. API 응답을 파싱하여 커맨드 목록을 상태로 관리
  3. 로딩 중 스켈레톤 또는 로딩 인디케이터 표시
  4. 각 커맨드 이름(`name` 필드) 기반으로 아이콘 매핑:

     | 커맨드 접두어 | 아이콘 (Lucide) |
     |--------------|----------------|
     | `play`, `stop`, `skip`, `pause`, `resume` | `Music` |
     | `서버진단`, `self-diagnosis`, `server-diagnosis` | `Mic` |
     | `voice-flush` | `RefreshCw` |
     | `고정메세지등록`, `고정메세지삭제`, `고정메세지목록` | `Pin` |
     | 그 외 | `Hash` (기본값) |

  5. 응답의 `name` 필드 앞에 `/`를 붙여 표시 (예: `play` → `/play`)
  6. "등록된 명령어" 카운트 표시를 API 응답 배열의 길이로 동적 갱신

- **API 클라이언트 함수**: `apps/web/app/lib/discord-api.ts`에 `fetchGuildCommands(guildId)` 함수 추가
  ```typescript
  export interface SlashCommand {
    id: string;
    name: string;
    description: string;
  }

  export async function fetchGuildCommands(guildId: string): Promise<SlashCommand[]> {
    // GET /api/guilds/{guildId}/commands
  }
  ```

- **오류 처리**: API 호출 실패 시 빈 목록 표시 및 에러 메시지 렌더링

---

## 데이터 모델

General 도메인은 별도의 PostgreSQL 엔티티를 갖지 않는다. Discord API에서 커맨드 정보를 실시간으로 조회하며 DB에 저장하지 않는다.

---

## 외부 의존성

| 서비스 | 용도 | 엔드포인트 |
|--------|------|-----------|
| Discord REST API | 글로벌 등록된 슬래시 커맨드 목록 조회 | `GET /applications/{appId}/commands` |

Discord REST API 호출은 `discord.js` `Client.application.commands.fetch()` 메서드를 통해 수행한다. 길드 한정 커맨드가 아닌 글로벌 커맨드를 조회하므로 `guildId` 인자를 전달하지 않는다.

---

## Web 도메인 연계

General 도메인의 프론트엔드 기능은 기존 web 도메인의 일반설정 페이지(`F-WEB-GENERAL-001`)를 대체한다.

| 연계 지점 | 방향 | 설명 |
|-----------|------|------|
| 일반설정 페이지 | web → general | `/settings/guild/[guildId]/page.tsx`에서 F-GENERAL-002 API를 호출하여 커맨드 목록 동적 렌더링 |
| Next.js API 프록시 | web → gateway | `apps/web/app/api/guilds/[...path]/route.ts`가 `/api/guilds/:guildId/commands` 요청을 백엔드로 프록시 |
