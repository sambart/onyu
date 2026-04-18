# Music 도메인: Lavalink v4 + Kazagumo v3 전환 구현 계획

> 최종 업데이트: 2026-03-20

## 개요

discord-player 기반 음악 재생을 **Lavalink v4 (Docker) + Kazagumo v3 (Shoukaku v4 래퍼)** 조합으로 전환한다. 기존 3개 커맨드(play, skip, stop)를 Kazagumo API로 재작성하고, 신규 커맨드 2개(pause, resume)를 추가하며, 모든 응답에 Now Playing Embed를 포함한다.

## 변경 범위 요약

| 구분 | 내용 |
|------|------|
| 인프라 | `lavalink/application.yml` 신규, `docker-compose.yml` 서비스 추가, `.env.example` 변수 추가 |
| 패키지 | discord-player / @discord-player/extractor / yt-search 제거, kazagumo / shoukaku 추가 |
| 신규 파일 (3개) | `KazagumoProvider`, `NowPlayingEmbedBuilder`, `music.constants.ts` |
| 수정 파일 (5개) | `MusicService`, `MusicPlayCommand`, `MusicSkipCommand`, `MusicStopCommand`, `MusicModule` |
| 신규 커맨드 (2개) | `MusicPauseCommand`, `MusicResumeCommand` |
| i18n | ko/en `music.json` 키 추가 (pause, resume, nowPlaying, playlist, noTrack, notPaused 등) |

---

## Phase 1: 인프라 준비

### 1-1. Lavalink 설정 파일 생성

**파일**: `lavalink/application.yml` (신규)

```yaml
server:
  port: 2333
  address: 0.0.0.0

lavalink:
  server:
    password: "youshallnotpass"
    sources:
      youtube: true
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: false
    plugins:
      - dependency: "dev.lavalink.youtube:youtube-plugin:1.11.4"
        snapshot: false
      - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.3.0"
        snapshot: false

  plugins:
    lavasrc:
      providers:
        - "ytsearch:\"%ISRC%\""
        - "ytsearch:%QUERY%"
      sources:
        spotify: true
        applemusic: false
        deezer: false
        yandexmusic: false
      spotify:
        clientId: "${SPOTIFY_CLIENT_ID}"
        clientSecret: "${SPOTIFY_CLIENT_SECRET}"
        countryCode: "KR"

logging:
  level:
    root: INFO
    lavalink: INFO
```

> Spotify 지원을 위해 LavaSrc 플러그인을 포함한다. Spotify 미사용 시 해당 블록을 제거해도 무방하다.

### 1-2. Docker Compose 서비스 추가

**파일**: `docker-compose.yml` — `bot` 서비스 아래에 `lavalink` 서비스 추가

```yaml
  lavalink:
    container_name: lavalink
    image: ghcr.io/lavalink-devs/lavalink:4
    ports:
      - "2333:2333"
    volumes:
      - ./lavalink/application.yml:/opt/Lavalink/application.yml
    environment:
      - _JAVA_OPTIONS=-Xmx128m
      - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID:-}
      - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET:-}
    restart: unless-stopped
```

`bot` 서비스의 `depends_on`에 `lavalink` 추가:

```yaml
  bot:
    depends_on:
      - api
      - lavalink
```

### 1-3. 환경변수 추가

**파일**: `.env.example` — 하단에 추가

```env
# Lavalink
LAVALINK_URL=lavalink:2333
LAVALINK_PASSWORD=youshallnotpass

# Spotify (optional, for Lavalink LavaSrc plugin)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

> `LAVALINK_URL`은 `host:port` 형식이며, Kazagumo 노드 설정 시 사용한다. 프로토콜(ws://)은 코드에서 붙인다.

---

## Phase 2: 패키지 변경

**파일**: `apps/bot/package.json`

### 제거

```
discord-player
@discord-player/extractor
yt-search
```

### 추가

```
kazagumo: ^3.4.3
shoukaku: ^4.1.0
```

### 실행

```bash
cd apps/bot
pnpm remove discord-player @discord-player/extractor yt-search
pnpm add kazagumo@^3.4.3 shoukaku@^4.1.0
```

---

## Phase 3: 상수 파일 생성

**파일**: `apps/bot/src/music/music.constants.ts` (신규)

```typescript
/** Kazagumo NestJS 의존성 주입 토큰 */
export const KAZAGUMO_TOKEN = 'KAZAGUMO_INSTANCE';

/** Now Playing Embed 진행바 설정 */
export const PROGRESS_BAR_LENGTH = 20;
export const PROGRESS_BAR_FILLED = '=';
export const PROGRESS_BAR_EMPTY = ' ';
export const PROGRESS_BAR_HEAD = '>';

/** 기본 볼륨 (0~100) */
export const DEFAULT_VOLUME = 40;

/** 빈 큐 시 채널 퇴장 대기 시간 (ms) */
export const LEAVE_ON_EMPTY_COOLDOWN_MS = 300_000;
```

---

## Phase 4: KazagumoProvider 작성

**파일**: `apps/bot/src/music/infrastructure/kazagumo.provider.ts` (신규)

### 역할

- NestJS 커스텀 프로바이더로 `Kazagumo` 인스턴스를 생성하여 DI 컨테이너에 등록
- Lavalink 노드 연결 및 이벤트 리스너(ready, error, playerStart, playerEmpty) 등록
- `OnApplicationShutdown`을 통한 정리

### 구현 지침

```typescript
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'discord.js';
import { Kazagumo, Connectors, KazagumoPlayer, KazagumoTrack } from 'kazagumo';

@Injectable()
export class KazagumoProvider implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KazagumoProvider.name);
  private kazagumo: Kazagumo;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const lavalinkUrl = this.configService.getOrThrow<string>('LAVALINK_URL');
    const lavalinkPassword = this.configService.getOrThrow<string>('LAVALINK_PASSWORD');

    this.kazagumo = new Kazagumo(
      {
        defaultSearchEngine: 'youtube',
        plugins: [],
        send: (guildId, payload) => {
          const guild = this.client.guilds.cache.get(guildId);
          if (guild) guild.shard.send(payload);
        },
      },
      new Connectors.DiscordJS(this.client),
      [
        {
          name: 'Lavalink',
          url: lavalinkUrl,
          auth: lavalinkPassword,
          secure: false,
        },
      ],
    );

    this.registerEvents();
  }

  getInstance(): Kazagumo {
    return this.kazagumo;
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.kazagumo) return;
    // 모든 플레이어 정리
    for (const [guildId] of this.kazagumo.players) {
      this.kazagumo.destroyPlayer(guildId);
    }
    this.logger.log('All Kazagumo players destroyed');
  }

  private registerEvents(): void {
    this.kazagumo.shoukaku.on('ready', (name) => {
      this.logger.log(`Lavalink node "${name}" connected`);
    });

    this.kazagumo.shoukaku.on('error', (name, error) => {
      this.logger.error(`Lavalink node "${name}" error: ${error.message}`);
    });

    this.kazagumo.shoukaku.on('close', (name, code, reason) => {
      this.logger.warn(`Lavalink node "${name}" closed: ${code} ${reason}`);
    });

    this.kazagumo.on('playerStart', (player: KazagumoPlayer, track: KazagumoTrack) => {
      this.logger.log(`Now playing: ${track.title} [guild=${player.guildId}]`);
    });

    this.kazagumo.on('playerEmpty', (player: KazagumoPlayer) => {
      this.logger.debug(`Queue ended [guild=${player.guildId}]`);
    });
  }
}
```

### 커스텀 프로바이더 팩토리 (대안)

Module에서 `useFactory`를 사용하는 대신, 위처럼 `@Injectable()` 클래스로 만들어 `getInstance()` 메서드를 통해 Kazagumo 인스턴스에 접근하는 패턴을 사용한다. 이유: `OnModuleInit`과 `OnApplicationShutdown` 라이프사이클을 직접 활용 가능.

---

## Phase 5: NowPlayingEmbedBuilder 유틸 작성

**파일**: `apps/bot/src/music/presentation/utils/now-playing-embed.builder.ts` (신규)

### 역할

- `KazagumoTrack` + `KazagumoPlayer` 정보를 받아 Discord `EmbedBuilder`를 생성
- 트랙 제목(링크), 아티스트, 진행바, 시간, 상태를 포함

### 구현 지침

```typescript
import { EmbedBuilder } from 'discord.js';
import type { KazagumoPlayer, KazagumoTrack } from 'kazagumo';

import {
  PROGRESS_BAR_LENGTH,
  PROGRESS_BAR_FILLED,
  PROGRESS_BAR_EMPTY,
  PROGRESS_BAR_HEAD,
} from '../../music.constants';

interface NowPlayingEmbedOptions {
  track: KazagumoTrack;
  player: KazagumoPlayer;
  status: 'playing' | 'paused' | 'queued';
}

/**
 * Now Playing Embed를 생성한다.
 * PRD 명세: 제목(링크), 아티스트, 진행바(20칸), 현재시간/총시간, 상태
 */
export function buildNowPlayingEmbed(options: NowPlayingEmbedOptions): EmbedBuilder {
  const { track, player, status } = options;
  const positionMs = player.position;
  const durationMs = track.length;

  const progressBar = formatProgressBar(positionMs, durationMs);
  const timeString = `${formatTime(positionMs)} / ${formatTime(durationMs)}`;

  const statusLabel = {
    playing: '재생 중',
    paused: '일시정지',
    queued: '큐 대기',
  }[status];

  return new EmbedBuilder()
    .setColor(status === 'playing' ? 0x00_ae_86 : 0xff_a5_00)
    .setTitle(track.title)
    .setURL(track.uri ?? null)
    .addFields(
      { name: '아티스트', value: track.author ?? 'Unknown', inline: true },
      { name: '상태', value: statusLabel, inline: true },
      { name: '진행', value: `\`[${progressBar}]\`\n${timeString}` },
    );
}

/** ms를 M:SS 또는 H:MM:SS 형식으로 변환 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** 진행바 문자열 생성 (20칸 기준) */
function formatProgressBar(positionMs: number, durationMs: number): string {
  if (durationMs <= 0) return PROGRESS_BAR_EMPTY.repeat(PROGRESS_BAR_LENGTH);

  const ratio = Math.min(positionMs / durationMs, 1);
  const filledCount = Math.floor(ratio * PROGRESS_BAR_LENGTH);
  const emptyCount = PROGRESS_BAR_LENGTH - filledCount - 1;

  return (
    PROGRESS_BAR_FILLED.repeat(filledCount) +
    PROGRESS_BAR_HEAD +
    PROGRESS_BAR_EMPTY.repeat(Math.max(emptyCount, 0))
  );
}
```

---

## Phase 6: MusicService 재작성

**파일**: `apps/bot/src/music/application/music.service.ts` (기존 전체 교체)

### 변경 요점

- `Player` (discord-player) 제거 → `KazagumoProvider`에서 `Kazagumo` 인스턴스 주입
- `init()` 메서드 제거 (초기화는 KazagumoProvider가 담당)
- `OnApplicationShutdown` 제거 (정리도 KazagumoProvider가 담당)
- 반환 타입을 구조화하여 커맨드 레이어에서 Embed 생성에 필요한 데이터를 전달

### 구현 지침

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type { KazagumoPlayer, KazagumoSearchResult } from 'kazagumo';

import { KazagumoProvider } from '../infrastructure/kazagumo.provider';
import { DEFAULT_VOLUME } from '../music.constants';

interface PlayResult {
  player: KazagumoPlayer;
  isPlaylist: boolean;
  trackCount: number;
  /** 첫 번째 트랙 (Embed 표시용) */
  firstTrackTitle: string;
}

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(private readonly kazagumoProvider: KazagumoProvider) {}

  /**
   * 트랙 검색 후 큐에 추가하고 재생을 시작한다.
   * 플레이리스트 URL이면 전체 트랙을 일괄 추가한다.
   */
  async play(params: {
    query: string;
    guildId: string;
    textChannelId: string;
    voiceChannelId: string;
    requesterId: string;
  }): Promise<PlayResult> {
    const kazagumo = this.kazagumoProvider.getInstance();

    const result: KazagumoSearchResult = await kazagumo.search(params.query, {
      requester: params.requesterId,
    });

    if (!result.tracks.length) {
      throw new Error('Track not found');
    }

    // 기존 플레이어가 있으면 재사용, 없으면 생성
    let player = kazagumo.players.get(params.guildId);
    if (!player) {
      player = await kazagumo.createPlayer({
        guildId: params.guildId,
        textId: params.textChannelId,
        voiceId: params.voiceChannelId,
        volume: DEFAULT_VOLUME,
      });
    }

    const isPlaylist = result.type === 'PLAYLIST';

    if (isPlaylist) {
      // 플레이리스트: 전체 트랙 일괄 추가
      for (const track of result.tracks) {
        player.queue.add(track);
      }
    } else {
      player.queue.add(result.tracks[0]);
    }

    // 재생 중이 아니면 시작
    if (!player.playing && !player.paused) {
      await player.play();
    }

    return {
      player,
      isPlaylist,
      trackCount: isPlaylist ? result.tracks.length : 1,
      firstTrackTitle: result.tracks[0].title,
    };
  }

  /** 현재 트랙을 건너뛰고 다음 트랙을 재생한다. */
  skip(guildId: string): KazagumoPlayer {
    const player = this.getPlayerOrThrow(guildId);
    player.skip();
    return player;
  }

  /** 재생을 중지하고 큐를 초기화하며 채널에서 퇴장한다. */
  stop(guildId: string): void {
    const kazagumo = this.kazagumoProvider.getInstance();
    const player = this.getPlayerOrThrow(guildId);
    player.queue.clear();
    kazagumo.destroyPlayer(guildId);
  }

  /** 현재 트랙을 일시정지한다. */
  pause(guildId: string): KazagumoPlayer {
    const player = this.getPlayerOrThrow(guildId);
    if (player.paused) {
      throw new Error('Already paused');
    }
    player.pause(true);
    return player;
  }

  /** 일시정지된 트랙을 재개한다. */
  resume(guildId: string): KazagumoPlayer {
    const player = this.getPlayerOrThrow(guildId);
    if (!player.paused) {
      throw new Error('Not paused');
    }
    player.pause(false);
    return player;
  }

  /** 길드의 플레이어를 조회하고 없으면 예외를 던진다. */
  private getPlayerOrThrow(guildId: string): KazagumoPlayer {
    const kazagumo = this.kazagumoProvider.getInstance();
    const player = kazagumo.players.get(guildId);
    if (!player?.queue.current) {
      throw new Error('No active player');
    }
    return player;
  }
}
```

### 주요 설계 결정

- **interaction 객체를 서비스에 전달하지 않는다**: 기존 코드는 `ChatInputCommandInteraction`을 서비스까지 끌고 왔으나, 레이어 분리 원칙에 따라 서비스는 순수 비즈니스 파라미터만 받고, interaction 응답은 커맨드 레이어에서 처리한다.
- **PlayResult 인터페이스**: play 결과를 구조화하여 커맨드에서 적절한 Embed를 생성할 수 있게 한다.

---

## Phase 7: 기존 커맨드 수정

### 7-1. MusicPlayCommand 수정

**파일**: `apps/bot/src/music/presentation/commands/music-play.command.ts`

변경 사항:
- `musicService.playMusic(dto.url, interaction)` → `musicService.play({ query, guildId, ... })`
- 결과에 따라 `buildNowPlayingEmbed()` 또는 플레이리스트 안내 Embed로 응답
- `interaction.deferReply()` 추가 (Lavalink 검색은 시간 소요 가능)

```typescript
@Handler()
async onPlay(
  @InteractionEvent(SlashCommandPipe) dto: PlayDto,
  @EventParams() args: ClientEvents['interactionCreate'],
): Promise<void> {
  const [interaction] = args;
  if (!interaction.isChatInputCommand()) return;

  const locale = await this.localeResolver.resolve(/*...*/);
  const member = interaction.member as GuildMember;

  if (!member.voice.channel) {
    await interaction.reply(this.i18n.t(locale, 'music.joinVoiceChannel'));
    return;
  }

  await interaction.deferReply();

  try {
    const result = await this.musicService.play({
      query: dto.url,
      guildId: interaction.guildId,
      textChannelId: interaction.channelId,
      voiceChannelId: member.voice.channelId,
      requesterId: interaction.user.id,
    });

    if (result.isPlaylist) {
      // 플레이리스트 응답: 트랙 수 + 첫 트랙 Now Playing
      const embed = buildNowPlayingEmbed({
        track: result.player.queue.current,
        player: result.player,
        status: 'playing',
      });
      await interaction.followUp({
        content: this.i18n.t(locale, 'music.playlistAdded', { count: String(result.trackCount) }),
        embeds: [embed],
      });
    } else {
      const embed = buildNowPlayingEmbed({
        track: result.player.queue.current,
        player: result.player,
        status: 'playing',
      });
      await interaction.followUp({ embeds: [embed] });
    }
  } catch (error) {
    this.logger.error('Error playing music:', error);
    await interaction.followUp(this.i18n.t(locale, 'music.playError'));
  }
}
```

### 7-2. MusicSkipCommand 수정

**파일**: `apps/bot/src/music/presentation/commands/music-skip.command.ts`

변경 사항:
- `musicService.skip(interaction)` → `musicService.skip(guildId)`
- 다음 트랙이 있으면 Now Playing Embed 응답

```typescript
@Handler()
async onSkip(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
  const [interaction] = args;
  if (!interaction.isChatInputCommand()) return;

  const locale = await this.localeResolver.resolve(/*...*/);
  await interaction.deferReply();

  try {
    const player = this.musicService.skip(interaction.guildId);
    const nextTrack = player.queue.current;

    if (nextTrack) {
      const embed = buildNowPlayingEmbed({ track: nextTrack, player, status: 'playing' });
      await interaction.followUp({
        content: this.i18n.t(locale, 'music.skipped'),
        embeds: [embed],
      });
    } else {
      await interaction.followUp(this.i18n.t(locale, 'music.skippedNoNext'));
    }
  } catch (error) {
    this.logger.error('Error skip music:', error);
    await interaction.followUp(this.i18n.t(locale, 'music.skipError'));
  }
}
```

### 7-3. MusicStopCommand 수정

**파일**: `apps/bot/src/music/presentation/commands/music-stop.command.ts`

변경 사항:
- `musicService.stop(interaction)` → `musicService.stop(guildId)`
- 응답에서 하드코딩 문자열 제거, i18n 키 사용

```typescript
@Handler()
async onStop(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
  const [interaction] = args;
  if (!interaction.isChatInputCommand()) return;

  const locale = await this.localeResolver.resolve(/*...*/);
  await interaction.deferReply();

  try {
    this.musicService.stop(interaction.guildId);
    await interaction.followUp(this.i18n.t(locale, 'music.stopped'));
  } catch (error) {
    this.logger.error('Error stop music:', error);
    await interaction.followUp(this.i18n.t(locale, 'music.stopError'));
  }
}
```

---

## Phase 8: 신규 커맨드 추가

### 8-1. MusicPauseCommand

**파일**: `apps/bot/src/music/presentation/commands/music-pause.command.ts` (신규)

```typescript
@Injectable()
@Command({
  name: 'pause',
  description: 'Pause the current song',
  nameLocalizations: { ko: '일시정지' },
  descriptionLocalizations: { ko: '현재 재생 중인 음악을 일시정지합니다.' },
})
export class MusicPauseCommand {
  private readonly logger = new Logger(MusicPauseCommand.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onPause(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      const player = this.musicService.pause(interaction.guildId);
      const track = player.queue.current;
      const embed = buildNowPlayingEmbed({ track, player, status: 'paused' });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error pause music:', error);
      await interaction.reply(this.i18n.t(locale, 'music.pauseError'));
    }
  }
}
```

### 8-2. MusicResumeCommand

**파일**: `apps/bot/src/music/presentation/commands/music-resume.command.ts` (신규)

```typescript
@Injectable()
@Command({
  name: 'resume',
  description: 'Resume the paused song',
  nameLocalizations: { ko: '재개' },
  descriptionLocalizations: { ko: '일시정지된 음악을 다시 재생합니다.' },
})
export class MusicResumeCommand {
  private readonly logger = new Logger(MusicResumeCommand.name);

  constructor(
    private readonly musicService: MusicService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onResume(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      const player = this.musicService.resume(interaction.guildId);
      const track = player.queue.current;
      const embed = buildNowPlayingEmbed({ track, player, status: 'playing' });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error resume music:', error);
      await interaction.reply(this.i18n.t(locale, 'music.resumeError'));
    }
  }
}
```

---

## Phase 9: MusicModule 수정

**파일**: `apps/bot/src/music/music.module.ts`

변경 사항:
- `ConfigModule` import 추가 (KazagumoProvider가 환경변수 접근 필요)
- `KazagumoProvider` 프로바이더 추가
- `MusicPauseCommand`, `MusicResumeCommand` 프로바이더 추가

```typescript
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { MusicService } from './application/music.service';
import { KazagumoProvider } from './infrastructure/kazagumo.provider';
import { MusicPauseCommand } from './presentation/commands/music-pause.command';
import { MusicPlayCommand } from './presentation/commands/music-play.command';
import { MusicResumeCommand } from './presentation/commands/music-resume.command';
import { MusicSkipCommand } from './presentation/commands/music-skip.command';
import { MusicStopCommand } from './presentation/commands/music-stop.command';

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule],
  providers: [
    BotI18nService,
    LocaleResolverService,
    KazagumoProvider,
    MusicService,
    MusicPlayCommand,
    MusicSkipCommand,
    MusicStopCommand,
    MusicPauseCommand,
    MusicResumeCommand,
  ],
})
export class MusicModule {}
```

---

## Phase 10: i18n 키 추가

### 한국어

**파일**: `libs/i18n/locales/ko/bot/music.json`

```json
{
  "joinVoiceChannel": "재생하려면 음성 채널에 참가해야 합니다.",
  "playError": "음악을 재생하는 동안 오류가 발생했습니다.",
  "playlistAdded": "플레이리스트에서 {{count}}곡이 큐에 추가되었습니다.",
  "skipped": "현재 곡을 건너뛰었습니다.",
  "skippedNoNext": "현재 곡을 건너뛰었습니다. 큐에 다음 곡이 없습니다.",
  "skipError": "음악을 건너뛰는 동안 오류가 발생했습니다.",
  "stopped": "재생을 중지하고 채널에서 퇴장했습니다.",
  "stopError": "음악을 중지하는 동안 오류가 발생했습니다.",
  "paused": "일시정지되었습니다.",
  "pauseError": "재생 중인 트랙이 없거나 이미 일시정지 상태입니다.",
  "resumed": "재생을 재개했습니다.",
  "resumeError": "일시정지 상태가 아니거나 재생 중인 트랙이 없습니다.",
  "noActivePlayer": "현재 재생 중인 트랙이 없습니다."
}
```

### 영어

**파일**: `libs/i18n/locales/en/bot/music.json`

```json
{
  "joinVoiceChannel": "You must join a voice channel to play music.",
  "playError": "An error occurred while playing music.",
  "playlistAdded": "Added {{count}} tracks from playlist to the queue.",
  "skipped": "Skipped the current track.",
  "skippedNoNext": "Skipped the current track. No more tracks in queue.",
  "skipError": "An error occurred while skipping the music.",
  "stopped": "Stopped playback and left the channel.",
  "stopError": "An error occurred while stopping the music.",
  "paused": "Playback paused.",
  "pauseError": "No track is playing or already paused.",
  "resumed": "Playback resumed.",
  "resumeError": "Not paused or no track is playing.",
  "noActivePlayer": "No track is currently playing."
}
```

---

## 최종 파일 트리

```
apps/bot/src/music/
├── music.module.ts                          — 수정 (ConfigModule, KazagumoProvider, 2개 커맨드 추가)
├── music.constants.ts                       — 신규 (상수)
├── application/
│   └── music.service.ts                     — 전체 재작성 (Kazagumo 기반)
├── infrastructure/
│   └── kazagumo.provider.ts                 — 신규 (Kazagumo 인스턴스 + Lavalink 연결)
└── presentation/
    ├── commands/
    │   ├── music-play.command.ts             — 수정 (deferReply, Embed 응답)
    │   ├── music-skip.command.ts             — 수정 (Embed 응답)
    │   ├── music-stop.command.ts             — 수정 (i18n 키 사용)
    │   ├── music-pause.command.ts            — 신규
    │   └── music-resume.command.ts           — 신규
    ├── dto/
    │   └── play.dto.ts                       — 변경 없음
    └── utils/
        └── now-playing-embed.builder.ts      — 신규 (EmbedBuilder 유틸)

lavalink/
└── application.yml                          — 신규 (Lavalink 서버 설정)
```

---

## 구현 순서 체크리스트

| 순서 | Phase | 작업 | 파일 수 |
|------|-------|------|---------|
| 1 | Phase 1 | 인프라 (lavalink/application.yml, docker-compose.yml, .env.example) | 3 |
| 2 | Phase 2 | 패키지 변경 (pnpm remove/add) | 1 |
| 3 | Phase 3 | 상수 파일 생성 | 1 |
| 4 | Phase 4 | KazagumoProvider 작성 | 1 |
| 5 | Phase 5 | NowPlayingEmbedBuilder 유틸 작성 | 1 |
| 6 | Phase 6 | MusicService 재작성 | 1 |
| 7 | Phase 7 | 기존 커맨드 3개 수정 | 3 |
| 8 | Phase 8 | 신규 커맨드 2개 추가 | 2 |
| 9 | Phase 9 | MusicModule 수정 | 1 |
| 10 | Phase 10 | i18n 키 추가 | 2 |
| **합계** | | | **16** |

---

## 충돌 분석

- **기존 코드 완전 교체**: `music.service.ts`는 discord-player API를 전면 사용하므로 부분 수정이 불가능하다. 전체 재작성이 필요.
- **커맨드 레이어**: 구조(데코레이터, DI, i18n)는 유지하되, 서비스 호출 시그니처와 응답 로직만 변경한다.
- **다른 도메인 영향 없음**: 음악 모듈은 독립적이며 다른 도메인과 의존성이 없다.
- **Docker 네트워크**: `lavalink` 서비스는 기본 Docker Compose 네트워크에 포함되므로, bot 컨테이너에서 `lavalink:2333`으로 접근 가능하다.
