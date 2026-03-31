# Music 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

디스코드 음성 채널에서 음악을 재생하는 기능을 제공한다. Lavalink v4(Java 기반 오디오 노드)와 Kazagumo v3(Shoukaku v4 래퍼) 조합을 사용하며, YouTube · Spotify · SoundCloud URL 및 검색어 입력을 지원한다. Lavalink는 별도 Docker 컨테이너로 실행된다.

## 관련 모듈

- `apps/bot/src/music/application/music.service.ts` — 음악 재생 비즈니스 로직
- `apps/bot/src/music/infrastructure/kazagumo.provider.ts` — Lavalink 노드 연결/라이프사이클 관리
- `apps/bot/src/music/presentation/commands/music-play.command.ts` — 재생 커맨드
- `apps/bot/src/music/presentation/commands/music-skip.command.ts` — 건너뛰기 커맨드
- `apps/bot/src/music/presentation/commands/music-stop.command.ts` — 정지 커맨드
- `apps/bot/src/music/presentation/commands/music-pause.command.ts` — 일시정지 커맨드
- `apps/bot/src/music/presentation/commands/music-resume.command.ts` — 재개 커맨드
- `apps/bot/src/music/presentation/utils/now-playing-embed.builder.ts` — Now Playing Embed 생성 유틸
- `apps/bot/src/music/presentation/dto/play.dto.ts` — 재생 커맨드 입력 DTO
- `apps/bot/src/music/music.constants.ts` — 음악 모듈 상수 (Embed 색상, 진행바 등)
- `apps/bot/src/music/music.module.ts` — 모듈 선언
- `apps/bot/src/music/application/music-channel.service.ts` — 음악 전용 채널 설정 CRUD 및 임베드 생성/갱신 비즈니스 로직
- `apps/bot/src/music/application/chart-crawler.service.ts` — 멜론·빌보드 차트 크롤링 및 Redis 캐싱
- `apps/bot/src/music/infrastructure/music-channel-config.orm-entity.ts` — MusicChannelConfig TypeORM 엔티티
- `apps/bot/src/music/infrastructure/music-channel-config.repository.ts` — MusicChannelConfig 레포지토리
- `apps/bot/src/music/presentation/interactions/music-channel-button.handler.ts` — 음악 전용 채널 버튼 인터랙션 핸들러
- `apps/bot/src/music/presentation/interactions/music-search-modal.handler.ts` — 음악 검색 모달 제출 핸들러
- `apps/bot/src/music/presentation/listeners/music-channel-message.listener.ts` — 음악 전용 채널 텍스트 메시지 수신 리스너
- `apps/bot/src/music/presentation/utils/music-channel-embed.builder.ts` — 음악 전용 채널 임베드(대기/재생 중) 빌더
- `apps/api/src/music/music-channel-config.controller.ts` — 음악 전용 채널 설정 REST API (웹 → API)
- `apps/api/src/music/dto/music-channel-config.dto.ts` — 음악 채널 설정 요청/응답 DTO

## 아키텍처

### 슬래시 커맨드 흐름

```
Discord 슬래시 커맨드 (/play, /skip, /stop, /pause, /resume)
    │
    ▼
[MusicCommand]               ← discord-nestjs SlashCommand 핸들러
    │
    ▼
[MusicService]               ← 비즈니스 로직 (큐 관리, 상태 제어)
    │
    ▼
[Kazagumo]                   ← Shoukaku v4 래퍼 (NestJS 내 Lavalink 클라이언트)
    │
    ▼ (WebSocket)
[Lavalink v4 컨테이너]        ← Java 기반 Lavaplayer 오디오 처리
    │
    ▼
[YouTube / Spotify / SoundCloud]  ← 소스별 플러그인 추출
```

### 음악 전용 채널 임베드 흐름

```
[웹 설정 저장]
    │ REST API (POST/PATCH /api/guilds/:guildId/music-channel-config)
    ▼
[MusicChannelConfigController (API)]
    │
    ▼
[MusicChannelService (Bot)]   ← guildId로 채널 조회 → Discord 채널에 임베드 전송/수정
    │                            MusicChannelConfig DB 저장
    ▼
[Discord 텍스트 채널]         ← 고정 임베드 메시지 + 버튼 행 전송

─── 사용자 인터랙션 ───────────────────────────────────────────────

[사용자: 버튼 클릭]
    │
    ▼
[MusicChannelButtonHandler]
    ├─ search      → Discord Modal 팝업 (검색어 입력)
    │                  └─ [MusicSearchModalHandler] → MusicService.play()
    ├─ pause_resume → MusicService.pause() / resume()
    ├─ skip         → MusicService.skip()
    ├─ stop         → MusicService.stop()
    ├─ queue        → ephemeral 큐 목록 응답
    ├─ melon_chart  → ChartCrawlerService.getMelonChart()
    │                  └─ Redis 캐시 확인(1h TTL) → 크롤링 → MusicService.playBulk()
    └─ billboard_chart → ChartCrawlerService.getBillboardChart()
                         └─ Redis 캐시 확인(1h TTL) → 크롤링 → MusicService.playBulk()

[사용자: 텍스트 메시지 입력 (음악 전용 채널)]
    │
    ▼
[MusicChannelMessageListener]
    ├─ 메시지 자동 삭제
    └─ MusicService.play(검색어)

─── Kazagumo 이벤트 → 임베드 실시간 갱신 ────────────────────────

[playerStart 이벤트]
    └─ MusicChannelService.updateEmbed() → 재생 중 임베드로 수정

[playerEmpty 이벤트]
    └─ MusicChannelService.updateEmbed() → 대기 상태 임베드로 복원

[pause / resume]
    └─ MusicChannelService.updateEmbed() → 상태 텍스트 갱신
```

## 기능 상세

### F-MUSIC-001: 음악 재생 (`/play`)

- **입력**: 검색어, YouTube URL, 플레이리스트 URL, Spotify URL, SoundCloud URL
- **동작**:
  1. 유저가 음성 채널에 접속해 있는지 확인 (미접속 시 에러 응답, ephemeral)
  2. Kazagumo를 통해 Lavalink에 트랙 또는 플레이리스트 검색 요청
  3. 플레이리스트 URL 입력 시 전체 트랙을 큐에 일괄 추가
  4. 봇이 해당 음성 채널에 참여 (이미 참여 중이면 유지)
  5. 큐에 트랙 추가 및 즉시 재생 (또는 큐 대기)
- **출력** (3가지 분기):
  - 플레이리스트: `"N곡이 대기열에 추가되었습니다"` 텍스트 메시지
  - 큐 대기 (이미 재생 중): `"대기열에 추가되었습니다"` + Now Playing Embed (status: queued)
  - 즉시 재생 (첫 재생): Now Playing Embed (status: playing)
- **지원 소스**: YouTube URL · 검색어, 플레이리스트 URL, Spotify URL (Lavalink 플러그인), SoundCloud URL (Lavalink 플러그인)

### F-MUSIC-002: 건너뛰기 (`/skip`)

- **동작**: 현재 재생 중인 트랙을 건너뛰고 큐의 다음 트랙 재생
- **출력** (2가지 분기):
  - 다음 트랙 존재: `"스킵했습니다"` + 다음 트랙 Now Playing Embed (status: playing)
  - 다음 트랙 없음: 재생 정지 + 음성 채널 퇴장 + `"스킵했습니다. 다음 곡이 없어 퇴장합니다"` 텍스트

### F-MUSIC-003: 정지 (`/stop`)

- **동작**: 재생 중지, 큐 초기화, 음성 채널 퇴장
- **출력**: 정지 확인 메시지

### F-MUSIC-004: 일시정지 (`/pause`)

- **동작**: 현재 재생 중인 트랙을 일시정지 (큐 유지)
- **출력**: Now Playing Embed (status: paused) — 트랙이 없으면 텍스트 메시지 대체
- **예외**: 재생 중인 트랙이 없으면 에러 응답 (ephemeral)

### F-MUSIC-005: 재개 (`/resume`)

- **동작**: 일시정지 상태인 트랙을 재개
- **출력**: Now Playing Embed (status: playing) — 트랙이 없으면 텍스트 메시지 대체
- **예외**: 일시정지 상태가 아니면 에러 응답 (ephemeral)

---

## 음악 전용 채널 임베드 시스템

특정 텍스트 채널을 "음악 전용 채널"로 지정하여 고정 임베드 메시지와 버튼 UI를 상시 제공하는 기능이다.

### F-MUSIC-010: 음악 채널 고정 임베드

- **개요**: 웹 설정에서 지정된 텍스트 채널에 봇이 고정 임베드 메시지를 전송하고 관리한다.
- **대기 상태 임베드** (음악 미재생 시):
  - 커스텀 제목, 설명 텍스트 표시 (기본값: "음악 채널" / "버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.")
  - 커스텀 색상, 썸네일 이미지 URL 적용
- **재생 중 임베드** (음악 재생 시):
  - 제목: 현재 트랙 제목 (소스 링크 포함)
  - 아티스트/채널명
  - 썸네일: 트랙 썸네일 (없으면 설정된 커스텀 썸네일)
  - 진행바 + 현재시간/총시간
  - 상태 텍스트 (재생 중 / 일시정지)
  - 곡 변경 또는 상태 변경 시 실시간 갱신 (F-MUSIC-017 참조)
- **버튼 행**: 임베드 아래 최대 3개 ActionRow에 버튼 배치 (F-MUSIC-011~015 참조)
- **설정 저장 시 동작**:
  1. 기존 messageId가 있으면 기존 메시지를 수정, 없으면 신규 전송
  2. 전송된 메시지의 messageId를 DB에 저장
  3. `enabled = false`이면 임베드를 전송하지 않음 (기존 메시지 삭제 없음)

### F-MUSIC-011: 음악 검색 버튼 (모달)

- **버튼 타입**: `search`
- **동작**:
  1. 버튼 클릭 시 Discord Modal 팝업 표시 (텍스트 입력 1개: "검색어")
  2. 모달 제출 시 입력된 검색어로 Kazagumo 트랙 검색
  3. 검색 결과 첫 번째 트랙을 큐에 추가 → 재생
- **예외**: 유저가 음성 채널에 없으면 ephemeral 에러 응답 ("음성 채널에 먼저 입장해 주세요.")

### F-MUSIC-012: 재생 컨트롤 버튼

버튼 3종을 별도 ActionRow에 배치하며, 기존 MusicService의 로직을 재사용한다.

| 버튼 타입 | 기본 라벨 | 동작 |
|-----------|-----------|------|
| `pause_resume` | 일시정지/재개 | 재생 중이면 일시정지, 일시정지 중이면 재개. 현재 재생 트랙 없으면 ephemeral 에러 응답 |
| `skip` | 스킵 | 현재 트랙 건너뛰기. 다음 트랙 없으면 정지 후 채널 퇴장 |
| `stop` | 정지 | 재생 중지, 큐 초기화, 음성 채널 퇴장 |

### F-MUSIC-013: 큐/재생목록 보기 버튼

- **버튼 타입**: `queue`
- **동작**: 버튼 클릭 시 현재 큐 목록을 ephemeral 메시지로 응답
- **표시 내용**:
  - 현재 재생 중인 곡 (제목, 아티스트, 상태)
  - 대기 중인 트랙 목록 (순번 + 제목 + 아티스트)
  - 큐가 비어 있으면 "현재 재생 중인 곡이 없습니다." 표시

### F-MUSIC-014: 멜론 인기차트 버튼

- **버튼 타입**: `melon_chart`
- **동작**:
  1. 버튼 클릭 시 Redis 캐시 확인 (`music:chart:melon`, TTL 1시간)
  2. 캐시 미스 시 멜론 인기차트 TOP 20 크롤링
  3. 크롤링 결과를 Redis에 저장 (TTL 1시간)
  4. 곡명 + 아티스트 조합으로 Kazagumo 검색 → 큐에 일괄 추가 → 재생
  5. 추가된 곡 수를 ephemeral 메시지로 응답 ("멜론 차트 N곡을 대기열에 추가했습니다.")
- **예외**: 유저가 음성 채널에 없으면 ephemeral 에러 응답

### F-MUSIC-015: 빌보드 차트 버튼

- **버튼 타입**: `billboard_chart`
- **동작**:
  1. 버튼 클릭 시 Redis 캐시 확인 (`music:chart:billboard`, TTL 1시간)
  2. 캐시 미스 시 빌보드 HOT 100에서 TOP 20 크롤링
  3. 크롤링 결과를 Redis에 저장 (TTL 1시간)
  4. 곡명 + 아티스트 조합으로 Kazagumo 검색 → 큐에 일괄 추가 → 재생
  5. 추가된 곡 수를 ephemeral 메시지로 응답 ("빌보드 차트 N곡을 대기열에 추가했습니다.")
- **예외**: 유저가 음성 채널에 없으면 ephemeral 에러 응답

### F-MUSIC-016: 텍스트 입력 자동 검색

- **개요**: 음악 전용 채널에서 사용자가 텍스트 메시지를 입력하면 자동으로 검색 및 재생한다.
- **동작**:
  1. `messageCreate` 이벤트에서 채널 ID가 `MusicChannelConfig.channelId`와 일치하는지 확인
  2. 봇 메시지는 무시
  3. 사용자 메시지 내용을 검색어로 Kazagumo 트랙 검색 → 큐에 추가 → 재생
  4. 사용자 원본 메시지 자동 삭제
- **예외**: 유저가 음성 채널에 없으면 ephemeral 안내 메시지 후 사용자 메시지 삭제

### F-MUSIC-017: 임베드 실시간 갱신

Kazagumo 플레이어 이벤트를 수신하여 음악 전용 채널 임베드를 자동 갱신한다.

| 이벤트 | 갱신 내용 |
|--------|-----------|
| `playerStart` (곡 변경/시작) | 재생 중 임베드로 수정 (새 트랙 정보, 진행바, 상태: 재생 중) |
| `playerEmpty` (큐 소진) | 대기 상태 임베드로 복원 (커스텀 제목/설명/색상) |
| `playerPause` (일시정지) | 상태 텍스트 "일시정지"로 갱신 |
| `playerResume` (재개) | 상태 텍스트 "재생 중"으로 갱신 |

- 갱신 대상: `MusicChannelConfig.messageId`가 존재하고 `enabled = true`인 길드만 처리
- 메시지 수정 실패(채널/메시지 삭제 등) 시 `messageId`를 null로 초기화

---

## 데이터 모델 (음악 전용 채널)

### MusicChannelConfig (`music_channel_config`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | |
| guildId | VARCHAR NOT NULL | 길드 ID |
| channelId | VARCHAR NOT NULL | 음악 전용 텍스트 채널 ID |
| messageId | VARCHAR NULL | 고정 임베드 메시지 ID |
| embedTitle | VARCHAR NULL | 커스텀 임베드 제목 |
| embedDescription | TEXT NULL | 커스텀 임베드 설명 |
| embedColor | VARCHAR NULL | 커스텀 임베드 색상 (#HEX) |
| embedThumbnailUrl | VARCHAR NULL | 커스텀 썸네일 이미지 URL |
| buttonConfig | JSONB NOT NULL | 버튼 구성 (표시할 버튼 목록, 순서, 활성화 여부) |
| enabled | BOOLEAN DEFAULT true | 음악 채널 기능 활성화 여부 |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

- 인덱스: `UNIQUE (guildId)` — 길드당 1개 설정

### buttonConfig JSONB 구조

```json
{
  "buttons": [
    { "type": "search",          "label": "음악 검색하기", "emoji": "🔍", "enabled": true, "row": 0 },
    { "type": "pause_resume",    "label": "일시정지/재개", "emoji": "⏯️", "enabled": true, "row": 1 },
    { "type": "skip",            "label": "스킵",          "emoji": "⏭️", "enabled": true, "row": 1 },
    { "type": "stop",            "label": "정지",          "emoji": "⏹️", "enabled": true, "row": 1 },
    { "type": "queue",           "label": "재생목록",      "emoji": "📋", "enabled": true, "row": 2 },
    { "type": "melon_chart",     "label": "멜론차트",      "emoji": "🎵", "enabled": true, "row": 2 },
    { "type": "billboard_chart", "label": "빌보드",        "emoji": "🎶", "enabled": true, "row": 2 }
  ]
}
```

- `row`: 0~4 범위의 ActionRow 번호 (Discord 최대 5행 제한)
- `enabled`: false이면 해당 버튼을 임베드에서 렌더링하지 않음

---

## 웹 설정 (음악 전용 채널)

음악 설정 페이지(`/dashboard/:guildId/music`)에서 제공한다.

### 음악 채널 설정 섹션

| UI 요소 | 설명 |
|---------|------|
| 활성화 토글 | 음악 전용 채널 기능 전체 활성화/비활성화 |
| 채널 선택 드롭다운 | 서버 내 텍스트 채널 목록에서 음악 전용 채널 지정 |
| 임베드 제목 입력 | 대기 상태 임베드 제목 (placeholder: "음악 채널") |
| 임베드 설명 입력 | 대기 상태 임베드 설명 텍스트 (textarea) |
| 색상 컬러피커 | 대기 상태 임베드 색상 선택 |
| 썸네일 URL 입력 | 대기 상태 임베드 썸네일 이미지 URL |

### 버튼 구성 섹션

| UI 요소 | 설명 |
|---------|------|
| 버튼별 활성화 토글 | 각 버튼 타입의 표시 여부 제어 |
| 라벨 텍스트 입력 | 각 버튼의 표시 텍스트 변경 |
| Row 번호 입력 | 버튼이 배치될 ActionRow 번호 (0~4) |
| 기본설정 버튼 | 클릭 시 임베드 커스텀값과 버튼 구성을 기본값으로 일괄 리셋 |

### REST API (웹 ↔ API 서버)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/guilds/:guildId/music-channel-config` | 현재 음악 채널 설정 조회 |
| POST | `/api/guilds/:guildId/music-channel-config` | 음악 채널 설정 신규 생성 및 임베드 전송 |
| PATCH | `/api/guilds/:guildId/music-channel-config` | 음악 채널 설정 수정 및 임베드 갱신 |
| DELETE | `/api/guilds/:guildId/music-channel-config` | 음악 채널 설정 삭제 |

---

## Now Playing Embed 명세

모든 커맨드 응답에 공통으로 포함되는 Embed 형식:

| 필드 | 내용 |
|------|------|
| 제목 | 트랙 제목 (YouTube/소스 링크 포함) |
| 썸네일 | 트랙 썸네일 이미지 (있는 경우) |
| 아티스트 | 채널명 또는 아티스트명 (inline) |
| 상태 | 재생 중 / 일시정지 / 큐 대기 (inline) |
| 진행바 | `` `[▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░]` `` 형식 (20칸 기준) |
| 시간 | `현재시간 / 총시간` (예: `1:23 / 3:45`) |
| 색상 | 재생 중: `#57F287` (녹색), 일시정지/큐 대기: `#FEE75C` (노랑) |

## 인프라

### Lavalink Docker 서비스

- `docker-compose.yml`에 `lavalink` 서비스 추가
- 베이스 이미지: `ghcr.io/lavalink-devs/lavalink:4`
- 설정 파일: `lavalink/application.yml`

### 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `LAVALINK_URL` | Lavalink 서버 WebSocket 주소 | `ws://lavalink:2333` |
| `LAVALINK_PASSWORD` | Lavalink 인증 비밀번호 | `youshallnotpass` |

## 의존성

| 패키지 | 버전 | 역할 |
|--------|------|------|
| `kazagumo` | ^3.4.3 | Shoukaku v4 래퍼 — Lavalink 클라이언트 |
| `shoukaku` | ^4.1.0 | Discord.js ↔ Lavalink WebSocket 연결 |
| `@discordjs/voice` | (Shoukaku 내부 사용) | 음성 채널 연결 |

**제거된 의존성**: `discord-player`, `@discord-player/extractor`, `yt-search`, `ytdl-core`, `ffmpeg-static`
