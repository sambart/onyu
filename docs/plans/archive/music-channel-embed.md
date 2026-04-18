# 음악 전용 채널 임베드 시스템 구현 계획

> 최종 업데이트: 2026-03-21

## 개요

특정 텍스트 채널을 "음악 전용 채널"로 지정하여 고정 임베드 메시지와 버튼 UI를 상시 제공하는 기능이다. 웹 대시보드에서 설정을 관리하고, 봇이 임베드를 전송/갱신하며, 사용자는 버튼 클릭 또는 텍스트 입력으로 음악을 제어한다.

**PRD 참조**: `/docs/specs/prd/music.md` — F-MUSIC-010 ~ F-MUSIC-017

## 선행 완료 항목

- [x] `MusicChannelConfigOrm` 엔티티 (`apps/api/src/music/infrastructure/music-channel-config.orm-entity.ts`)
- [x] 마이그레이션 (`apps/api/src/migrations/1776100000000-AddMusicChannelConfig.ts`)
- [x] 기존 MusicService, KazagumoProvider, Now Playing Embed Builder (봇 앱)

## 변경 범위 요약

| 구분 | 앱 | 신규/수정 | 파일 수 |
|------|----|-----------|---------|
| REST API (웹 → API) | api | 신규 5, 수정 1 | 6 |
| Bot API 연동 (API → Bot) | bot-api-client + api | 수정 2 | 2 |
| MusicChannelService | bot | 신규 1, 수정 1 | 2 |
| ChartCrawlerService | bot | 신규 1 | 1 |
| Button/Modal 핸들러 | bot | 신규 2 | 2 |
| Message 리스너 | bot | 신규 1 | 1 |
| Kazagumo 이벤트 연동 | bot | 수정 1 | 1 |
| Embed 빌더 | bot | 신규 1 | 1 |
| 상수/모듈 등록 | bot + api | 수정 2 | 2 |
| **합계** | | | **18** |

---

## Phase 1: API 서버 — REST API + 모듈 구성

### 1-1. Repository 생성

**파일**: `apps/api/src/music/infrastructure/music-channel-config.repository.ts` (신규)

**패턴 참조**: `apps/api/src/sticky-message/infrastructure/sticky-message-config.repository.ts`

```typescript
@Injectable()
export class MusicChannelConfigRepository {
  constructor(
    @InjectRepository(MusicChannelConfigOrm)
    private readonly repo: Repository<MusicChannelConfigOrm>,
  ) {}

  // guildId로 단건 조회 (UNIQUE 제약)
  async findByGuildId(guildId: string): Promise<MusicChannelConfigOrm | null>;

  // 설정 저장 (guildId 기준 upsert — 길드당 1개)
  // dto 필드: channelId, embedTitle, embedDescription, embedColor, embedThumbnailUrl, buttonConfig, enabled
  // messageId는 건드리지 않음 (updateMessageId()로만 변경)
  async save(guildId: string, dto: MusicChannelConfigSaveDto): Promise<MusicChannelConfigOrm>;

  // messageId 갱신 (임베드 전송/수정 후 호출)
  async updateMessageId(id: number, messageId: string | null): Promise<void>;

  // 설정 삭제
  async delete(guildId: string): Promise<void>;

  // channelId로 설정 조회 (메시지 리스너에서 채널 확인용, bot-api 엔드포인트)
  async findByChannelId(channelId: string): Promise<MusicChannelConfigOrm | null>;
}
```

### 1-2. DTO 생성

**파일**: `apps/api/src/music/dto/music-channel-config.dto.ts` (신규)

```typescript
// === 요청 DTO ===
export class MusicChannelConfigSaveDto {
  @IsString() @IsNotEmpty()
  channelId: string;

  @IsOptional() @IsString()
  embedTitle?: string | null;

  @IsOptional() @IsString()
  embedDescription?: string | null;

  @IsOptional() @IsString()
  embedColor?: string | null;       // #HEX 형식

  @IsOptional() @IsString()
  embedThumbnailUrl?: string | null; // URL

  @ValidateNested()
  @Type(() => MusicButtonConfigDto)
  buttonConfig: MusicButtonConfigJsonDto;

  @IsBoolean()
  enabled: boolean;
}

export class MusicButtonConfigJsonDto {
  @ValidateNested({ each: true })
  @Type(() => MusicButtonItemDto)
  buttons: MusicButtonItemDto[];
}

export class MusicButtonItemDto {
  @IsString() type: string;        // search | pause_resume | skip | stop | queue | melon_chart | billboard_chart
  @IsString() label: string;
  @IsString() emoji: string;
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(0) @Max(4) row: number;
}

// === 응답 DTO ===
// ORM 엔티티를 그대로 반환 (sticky-message 패턴 동일)
```

### 1-3. Discord Adapter 생성

**파일**: `apps/api/src/music/infrastructure/music-channel-discord.adapter.ts` (신규)

**패턴 참조**: `apps/api/src/sticky-message/infrastructure/sticky-message-discord.adapter.ts`

```typescript
@Injectable()
export class MusicChannelDiscordAdapter {
  constructor(private readonly discordRest: DiscordRestService) {}

  // 채널에 임베드 + 버튼 ActionRow가 포함된 메시지 전송, 메시지 ID 반환
  async sendMessage(channelId: string, payload: RESTPostAPIChannelMessageJSONBody): Promise<string>;

  // 기존 메시지 수정 (임베드 + 버튼 갱신)
  async editMessage(channelId: string, messageId: string, payload: RESTPatchAPIChannelMessageJSONBody): Promise<void>;

  // 메시지 삭제 (실패 시 warn 로그 후 무시)
  async deleteMessage(channelId: string, messageId: string): Promise<void>;
}
```

**핵심 포인트**: sticky-message와 달리 메시지 본문에 `components` (ActionRow + Button)를 포함해야 한다. `DiscordRestService.sendMessage()`는 `RESTPostAPIChannelMessageJSONBody`를 받으므로 components 필드를 포함할 수 있다.

### 1-4. Service 생성

**파일**: `apps/api/src/music/application/music-channel-config.service.ts` (신규)

**패턴 참조**: `apps/api/src/sticky-message/application/sticky-message-config.service.ts`

```typescript
@Injectable()
export class MusicChannelConfigService {
  constructor(
    private readonly configRepo: MusicChannelConfigRepository,
    private readonly discordAdapter: MusicChannelDiscordAdapter,
  ) {}

  // GET — 길드 설정 조회
  async getConfig(guildId: string): Promise<MusicChannelConfigOrm | null>;

  // POST — 신규 생성 + 임베드 전송
  // 1. DB save
  // 2. enabled=true이면 대기 상태 임베드 + 버튼 빌드 → Discord 채널에 전송
  // 3. 전송된 messageId를 DB에 저장
  async createConfig(guildId: string, dto: MusicChannelConfigSaveDto): Promise<MusicChannelConfigOrm>;

  // PATCH — 수정 + 임베드 갱신
  // 1. DB update
  // 2. enabled=true이고 messageId 존재 → 기존 메시지 수정 (edit)
  //    enabled=true이고 messageId 없음 → 신규 전송 후 messageId 저장
  //    enabled=false → 임베드 갱신 안 함
  async updateConfig(guildId: string, dto: Partial<MusicChannelConfigSaveDto>): Promise<MusicChannelConfigOrm>;

  // DELETE — 설정 삭제 (기존 메시지는 삭제하지 않음, PRD 명세)
  async deleteConfig(guildId: string): Promise<void>;

  // 내부: 대기 상태 임베드 + 버튼 ActionRow를 Discord API payload로 빌드
  private buildIdleEmbedPayload(config: MusicChannelConfigOrm): RESTPostAPIChannelMessageJSONBody;
}
```

**임베드 빌드 로직 (buildIdleEmbedPayload)**:
- `EmbedBuilder`로 대기 상태 임베드 생성 (embedTitle, embedDescription, embedColor, embedThumbnailUrl 적용)
- `buttonConfig.buttons`에서 `enabled=true`인 버튼만 필터 → row별 그룹핑 → `ActionRowBuilder<ButtonBuilder>` 생성
- 각 버튼의 customId 형식: `music_channel:{type}` (예: `music_channel:search`, `music_channel:pause_resume`)
- 최종 payload: `{ embeds: [embed.toJSON()], components: rows.map(r => r.toJSON()) }`

### 1-5. Controller 생성

**파일**: `apps/api/src/music/presentation/music-channel-config.controller.ts` (신규)

**패턴 참조**: `apps/api/src/sticky-message/presentation/sticky-message.controller.ts`

```typescript
@Controller('api/guilds/:guildId/music-channel-config')
@UseGuards(JwtAuthGuard)
export class MusicChannelConfigController {
  constructor(private readonly configService: MusicChannelConfigService) {}

  @Get()
  async getConfig(@Param('guildId') guildId: string): Promise<MusicChannelConfigOrm | null>;

  @Post()
  @HttpCode(HttpStatus.OK)
  async createConfig(
    @Param('guildId') guildId: string,
    @Body() dto: MusicChannelConfigSaveDto,
  ): Promise<MusicChannelConfigOrm>;

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateConfig(
    @Param('guildId') guildId: string,
    @Body() dto: Partial<MusicChannelConfigSaveDto>,
  ): Promise<MusicChannelConfigOrm>;

  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteConfig(@Param('guildId') guildId: string): Promise<{ ok: boolean }>;
}
```

### 1-6. Module 생성 + AppModule 등록

**파일**: `apps/api/src/music/music.module.ts` (신규)

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([MusicChannelConfigOrm]),
    AuthModule,
  ],
  controllers: [MusicChannelConfigController],
  providers: [
    MusicChannelDiscordAdapter,
    MusicChannelConfigRepository,
    MusicChannelConfigService,
  ],
  exports: [MusicChannelConfigService, MusicChannelConfigRepository],
})
export class MusicModule {}
```

**파일**: `apps/api/src/app.module.ts` (수정)

```diff
+ import { MusicModule } from './music/music.module';

  imports: [
    ...
+   MusicModule,
    ...
  ],
```

---

## Phase 2: Bot API 연동 (Bot → API 조회)

봇이 음악 채널 설정을 조회할 수 있도록 bot-api 엔드포인트를 추가한다.

### 2-1. Bot API Controller 추가

**파일**: `apps/api/src/bot-api/music/bot-music.controller.ts` (신규)

```typescript
@Controller('bot-api/music')
@UseGuards(BotApiAuthGuard)
export class BotMusicController {
  constructor(private readonly configRepo: MusicChannelConfigRepository) {}

  // Bot이 guildId로 음악 채널 설정을 조회
  @Get('channel-config')
  async getChannelConfig(@Query('guildId') guildId: string): Promise<BotApiResponse<MusicChannelConfigOrm>>;

  // Bot이 channelId로 음악 채널 설정을 조회 (메시지 리스너용)
  @Get('channel-config/by-channel')
  async getByChannelId(@Query('channelId') channelId: string): Promise<BotApiResponse<MusicChannelConfigOrm>>;

  // Bot이 messageId를 갱신 (임베드 전송 후)
  @Post('channel-config/update-message-id')
  async updateMessageId(@Body() dto: { guildId: string; messageId: string | null }): Promise<BotApiResponse>;
}
```

**파일**: `apps/api/src/bot-api/bot-api.module.ts` (수정) — `BotMusicController` 등록

### 2-2. BotApiClientService 메서드 추가

**파일**: `libs/bot-api-client/src/bot-api-client.service.ts` (수정)

```typescript
// ── Music ──

async getMusicChannelConfig(guildId: string): Promise<MusicChannelConfigResponse | null>;
async getMusicChannelConfigByChannel(channelId: string): Promise<MusicChannelConfigResponse | null>;
async updateMusicChannelMessageId(guildId: string, messageId: string | null): Promise<void>;
```

**파일**: `libs/bot-api-client/src/types.ts` (수정)

```typescript
// ── Music Channel ──

export interface MusicChannelConfigResponse {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttonConfig: { buttons: MusicButtonConfigItem[] };
  enabled: boolean;
}

export interface MusicButtonConfigItem {
  type: string;
  label: string;
  emoji: string;
  enabled: boolean;
  row: number;
}
```

---

## Phase 3: Bot — MusicChannelService

### 3-1. MusicChannelService 생성

**파일**: `apps/bot/src/music/application/music-channel.service.ts` (신규)

```typescript
@Injectable()
export class MusicChannelService {
  private readonly logger = new Logger(MusicChannelService.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly botApiClient: BotApiClientService,
  ) {}

  /**
   * 임베드를 갱신한다 (Kazagumo 이벤트에서 호출).
   * guildId로 설정 조회 → messageId 존재 + enabled → Discord 메시지 수정
   */
  async updateEmbed(guildId: string, embed: EmbedBuilder, components: ActionRowBuilder<ButtonBuilder>[]): Promise<void> {
    const config = await this.botApiClient.getMusicChannelConfig(guildId);
    if (!config || !config.enabled || !config.messageId) return;

    try {
      const channel = await this.client.channels.fetch(config.channelId);
      if (!channel?.isTextBased()) return;

      const message = await (channel as TextChannel).messages.fetch(config.messageId);
      await message.edit({
        embeds: [embed],
        components,
      });
    } catch (err) {
      // 메시지/채널 삭제된 경우 messageId를 null로 초기화
      this.logger.warn(`Failed to update music embed: guild=${guildId}`, err);
      await this.botApiClient.updateMusicChannelMessageId(guildId, null);
    }
  }

  /**
   * 대기 상태 임베드로 복원한다 (playerEmpty 이벤트에서 호출).
   */
  async restoreIdleEmbed(guildId: string): Promise<void>;

  /**
   * 재생 중 임베드로 갱신한다 (playerStart 이벤트에서 호출).
   */
  async updatePlayingEmbed(guildId: string, track: KazagumoTrack, player: KazagumoPlayer): Promise<void>;

  /**
   * 일시정지/재개 시 상태 텍스트만 갱신한다.
   */
  async updatePauseState(guildId: string, isPaused: boolean): Promise<void>;
}
```

**핵심 포인트**:
- 봇 앱은 Gateway 연결이 있으므로 `client.channels.fetch()` + `message.edit()` 사용
- API 앱의 DiscordRestService가 아닌 봇 자체의 discord.js Client를 사용
- 설정 조회는 `BotApiClientService`를 통해 API 서버에서 가져옴

---

## Phase 4: Bot — 임베드 빌더

### 4-1. Music Channel Embed Builder 생성

**파일**: `apps/bot/src/music/presentation/utils/music-channel-embed.builder.ts` (신규)

**패턴 참조**: `apps/bot/src/music/presentation/utils/now-playing-embed.builder.ts`

```typescript
// ── 대기 상태 임베드 ──
export function buildIdleMusicChannelEmbed(config: MusicChannelConfigResponse): EmbedBuilder {
  // embedTitle (기본값: "음악 채널")
  // embedDescription (기본값: "버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.")
  // embedColor (기본값: #5865F2, Discord 블루)
  // embedThumbnailUrl (있으면 적용)
}

// ── 재생 중 임베드 ──
export function buildPlayingMusicChannelEmbed(options: {
  track: KazagumoTrack;
  player: KazagumoPlayer;
  isPaused: boolean;
  fallbackThumbnailUrl?: string | null;
}): EmbedBuilder {
  // 제목: 트랙 제목 (소스 링크)
  // 아티스트/채널명
  // 썸네일: track.thumbnail ?? fallbackThumbnailUrl
  // 진행바 + 시간 (기존 now-playing-embed.builder.ts의 formatProgressBar/formatTime 재사용)
  // 상태 텍스트: "재생 중" / "일시정지"
  // 색상: 재생 중 #57F287 / 일시정지 #FEE75C
}

// ── 버튼 행 빌더 ──
export function buildMusicChannelButtons(config: MusicChannelConfigResponse): ActionRowBuilder<ButtonBuilder>[] {
  // config.buttonConfig.buttons에서 enabled=true인 것만 필터
  // row별 그룹핑 (0~4)
  // 각 버튼: customId = `music_channel:{type}`, label, emoji, style = Secondary
  // Discord 제한: ActionRow당 최대 5개 버튼, 최대 5개 ActionRow
}
```

**공유 유틸 추출**: `formatProgressBar()`, `formatTime()`을 기존 `now-playing-embed.builder.ts`에서 export하거나, 별도 유틸 파일로 분리하여 양쪽에서 재사용한다.

---

## Phase 5: Bot — ChartCrawlerService

### 5-1. ChartCrawlerService 생성

**파일**: `apps/bot/src/music/application/chart-crawler.service.ts` (신규)

```typescript
@Injectable()
export class ChartCrawlerService {
  private readonly logger = new Logger(ChartCrawlerService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * 멜론 인기차트 TOP 20 조회.
   * Redis 캐시 키: `music:chart:melon`, TTL 1시간.
   */
  async getMelonChart(): Promise<ChartEntry[]> {
    const cached = await this.redis.get('music:chart:melon');
    if (cached) return JSON.parse(cached);

    const entries = await this.crawlMelon();
    await this.redis.setex('music:chart:melon', 3600, JSON.stringify(entries));
    return entries;
  }

  /**
   * 빌보드 HOT 100 TOP 20 조회.
   * Redis 캐시 키: `music:chart:billboard`, TTL 1시간.
   */
  async getBillboardChart(): Promise<ChartEntry[]> {
    const cached = await this.redis.get('music:chart:billboard');
    if (cached) return JSON.parse(cached);

    const entries = await this.crawlBillboard();
    await this.redis.setex('music:chart:billboard', 3600, JSON.stringify(entries));
    return entries;
  }

  // 멜론 크롤링 (cheerio 사용, HTML 파싱)
  private async crawlMelon(): Promise<ChartEntry[]>;

  // 빌보드 크롤링 (cheerio 사용, HTML 파싱)
  private async crawlBillboard(): Promise<ChartEntry[]>;
}

interface ChartEntry {
  rank: number;
  title: string;
  artist: string;
}
```

**의존성 추가**: `cheerio` 패키지 (HTML 파싱용)
- `pnpm --filter @nexus/bot add cheerio`

**Redis 접근**: 봇 앱에서 Redis 클라이언트를 주입받는 기존 패턴 확인 필요. 없으면 `@nestjs/cache-manager` 또는 직접 `ioredis` 인스턴스를 모듈에서 제공해야 함.

---

## Phase 6: Bot — Button/Modal 인터랙션 핸들러

### 6-1. Button Handler 생성

**파일**: `apps/bot/src/music/presentation/interactions/music-channel-button.handler.ts` (신규)

**패턴 참조**: `apps/bot/src/event/auto-channel/bot-auto-channel-interaction.handler.ts`

```typescript
@Injectable()
export class MusicChannelButtonHandler {
  constructor(
    private readonly musicService: MusicService,
    private readonly chartCrawler: ChartCrawlerService,
    private readonly musicChannelService: MusicChannelService,
  ) {}

  // discord-nestjs의 @On('interactionCreate') 또는 @UseInterceptors 패턴으로 등록
  // customId가 'music_channel:' 접두사인 버튼만 처리

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const type = interaction.customId.replace('music_channel:', '');

    switch (type) {
      case 'search':
        return this.handleSearch(interaction);
      case 'pause_resume':
        return this.handlePauseResume(interaction);
      case 'skip':
        return this.handleSkip(interaction);
      case 'stop':
        return this.handleStop(interaction);
      case 'queue':
        return this.handleQueue(interaction);
      case 'melon_chart':
        return this.handleMelonChart(interaction);
      case 'billboard_chart':
        return this.handleBillboardChart(interaction);
    }
  }

  // search → Modal 팝업 표시
  private async handleSearch(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('music_channel:search_modal')
      .setTitle('음악 검색')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('query')
            .setLabel('검색어')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
  }

  // pause_resume → 토글
  private async handlePauseResume(interaction: ButtonInteraction): Promise<void> {
    // 음성 채널 접속 확인
    // player.paused ? resume : pause
    // 임베드 갱신은 Kazagumo 이벤트에서 처리
  }

  // skip, stop → 기존 MusicService 메서드 호출
  // queue → ephemeral 큐 목록
  // melon_chart, billboard_chart → ChartCrawlerService 조회 → MusicService.play() 일괄 호출
}
```

**음성 채널 접속 확인 공통 로직**:
- `interaction.member`에서 `voice.channelId` 확인
- 미접속 시 `interaction.reply({ content: '음성 채널에 먼저 입장해 주세요.', ephemeral: true })`

**차트 재생 (melon_chart / billboard_chart)**:
- `await interaction.deferReply({ ephemeral: true })` (크롤링 + 검색에 시간 소요)
- `chartCrawler.getMelonChart()` 또는 `getBillboardChart()` 호출
- 각 ChartEntry에 대해 `musicService.play()` 호출 (순차 또는 playBulk 메서드 신규 추가)
- `interaction.editReply({ content: '멜론 차트 N곡을 대기열에 추가했습니다.' })`

### 6-2. Modal Handler 생성

**파일**: `apps/bot/src/music/presentation/interactions/music-search-modal.handler.ts` (신규)

```typescript
@Injectable()
export class MusicSearchModalHandler {
  constructor(private readonly musicService: MusicService) {}

  // customId = 'music_channel:search_modal' 처리
  async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const query = interaction.fields.getTextInputValue('query');

    // 음성 채널 접속 확인
    const voiceChannelId = (interaction.member as GuildMember).voice.channelId;
    if (!voiceChannelId) {
      await interaction.reply({ content: '음성 채널에 먼저 입장해 주세요.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await this.musicService.play({
      query,
      guildId: interaction.guildId!,
      textChannelId: interaction.channelId,
      voiceChannelId,
      requesterId: interaction.user.id,
    });

    await interaction.editReply({
      content: `"${result.firstTrack.title}"을(를) 대기열에 추가했습니다.`,
    });
  }
}
```

---

## Phase 7: Bot — Message 리스너

### 7-1. MusicChannelMessageListener 생성

**파일**: `apps/bot/src/music/presentation/listeners/music-channel-message.listener.ts` (신규)

**패턴 참조**: `apps/bot/src/event/sticky-message/bot-sticky-message.handler.ts`

```typescript
@Injectable()
export class MusicChannelMessageListener {
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly musicService: MusicService,
    private readonly botApiClient: BotApiClientService,
  ) {}

  @On('messageCreate')
  async handleMessage(message: Message): Promise<void> {
    // 봇 메시지 무시
    if (message.author.bot) return;

    // 채널 ID로 음악 채널 설정 조회 (bot-api 호출)
    const config = await this.botApiClient.getMusicChannelConfigByChannel(message.channelId);
    if (!config || !config.enabled) return;

    // 음성 채널 접속 확인
    const member = message.member;
    if (!member?.voice.channelId) {
      const reply = await message.reply({ content: '음성 채널에 먼저 입장해 주세요.' });
      // 안내 메시지 5초 후 삭제
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      await message.delete().catch(() => {});
      return;
    }

    // 검색어로 재생
    try {
      await this.musicService.play({
        query: message.content,
        guildId: message.guildId!,
        textChannelId: message.channelId,
        voiceChannelId: member.voice.channelId,
        requesterId: message.author.id,
      });
    } catch {
      // 검색 실패 시 무시 (또는 ephemeral 안내)
    }

    // 원본 메시지 삭제
    await message.delete().catch(() => {});
  }
}
```

**성능 고려**: 모든 `messageCreate`에서 bot-api 호출이 발생하면 부담이 크다. 최적화 방안:
- 봇 기동 시 또는 설정 변경 시 음악 채널 ID 목록을 인메모리 Set으로 캐싱
- `messageCreate`에서 `channelIdSet.has(message.channelId)` 선 확인 후 bot-api 호출
- 설정 변경 시 캐시 무효화 이벤트 전달 (EventEmitter 또는 Redis Pub/Sub)

---

## Phase 8: Bot — Kazagumo 이벤트 연동

### 8-1. KazagumoProvider 수정

**파일**: `apps/bot/src/music/infrastructure/kazagumo.provider.ts` (수정)

```diff
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly configService: ConfigService,
+   private readonly musicChannelService: MusicChannelService,
  ) {}

  private registerEvents(): void {
    // ... 기존 shoukaku 이벤트 유지 ...

    this.kazagumo.on('playerStart', (player: KazagumoPlayer, track: KazagumoTrack) => {
      this.logger.log(`Now playing: ${track.title} [guild=${player.guildId}]`);
+     this.musicChannelService.updatePlayingEmbed(player.guildId, track, player).catch((err) => {
+       this.logger.warn(`Music channel embed update failed: ${err.message}`);
+     });
    });

    this.kazagumo.on('playerEmpty', (player: KazagumoPlayer) => {
      this.logger.debug(`Queue ended [guild=${player.guildId}]`);
+     this.musicChannelService.restoreIdleEmbed(player.guildId).catch((err) => {
+       this.logger.warn(`Music channel idle embed restore failed: ${err.message}`);
+     });
    });

+   // Kazagumo v3에서 pause/resume 이벤트가 별도로 없으면,
+   // MusicService.pause()/resume() 호출 시 직접 musicChannelService.updatePauseState() 호출
  }
```

**순환 의존성 주의**: `KazagumoProvider → MusicChannelService → BotApiClientService`는 순환 없음. 다만 `MusicService → KazagumoProvider`이고 `KazagumoProvider → MusicChannelService`이므로, `MusicChannelService`가 `MusicService`를 의존하지 않도록 주의해야 한다.

**Kazagumo v3 pause/resume 이벤트 확인**: Kazagumo v3가 `playerPause`/`playerResume` 이벤트를 지원하지 않는 경우, `MusicService.pause()`/`resume()` 메서드 내부에서 직접 `MusicChannelService.updatePauseState()`를 호출하도록 수정해야 한다.

---

## Phase 9: Bot — Module 등록

### 9-1. MusicModule 수정

**파일**: `apps/bot/src/music/music.module.ts` (수정)

```diff
+ import { TypeOrmModule } from '@nestjs/typeorm';
+ import { MusicChannelService } from './application/music-channel.service';
+ import { ChartCrawlerService } from './application/chart-crawler.service';
+ import { MusicChannelButtonHandler } from './presentation/interactions/music-channel-button.handler';
+ import { MusicSearchModalHandler } from './presentation/interactions/music-search-modal.handler';
+ import { MusicChannelMessageListener } from './presentation/listeners/music-channel-message.listener';

  @Module({
    imports: [DiscordModule.forFeature(), ConfigModule],
    providers: [
      BotI18nService,
      LocaleResolverService,
      KazagumoProvider,
      MusicService,
+     MusicChannelService,
+     ChartCrawlerService,
      MusicPlayCommand,
      MusicSkipCommand,
      MusicStopCommand,
      MusicPauseCommand,
      MusicResumeCommand,
+     MusicChannelButtonHandler,
+     MusicSearchModalHandler,
+     MusicChannelMessageListener,
    ],
  })
  export class MusicModule {}
```

---

## Phase 10: MusicService 확장 — playBulk 메서드

### 10-1. MusicService에 playBulk 메서드 추가

**파일**: `apps/bot/src/music/application/music.service.ts` (수정)

차트 버튼에서 여러 곡을 일괄 추가할 때 사용한다.

```typescript
/**
 * 여러 검색어를 순차 검색하여 큐에 일괄 추가한다.
 * @returns 성공적으로 추가된 트랙 수
 */
async playBulk(params: {
  queries: string[];
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  requesterId: string;
}): Promise<number> {
  let addedCount = 0;

  for (const query of params.queries) {
    try {
      await this.play({
        query,
        guildId: params.guildId,
        textChannelId: params.textChannelId,
        voiceChannelId: params.voiceChannelId,
        requesterId: params.requesterId,
      });
      addedCount++;
    } catch {
      // 개별 트랙 검색 실패 시 건너뛰기
    }
  }

  return addedCount;
}
```

---

## 구현 순서 (의존성 기반)

| 단계 | 내용 | 의존성 |
|------|------|--------|
| **Phase 1** | API: Repository → DTO → Adapter → Service → Controller → Module | Entity (완료) |
| **Phase 2** | Bot API 엔드포인트 + BotApiClientService 메서드 | Phase 1 |
| **Phase 4** | Bot: Embed Builder | 독립 (Phase 3와 병렬 가능) |
| **Phase 5** | Bot: ChartCrawlerService | 독립 (Phase 3와 병렬 가능) |
| **Phase 3** | Bot: MusicChannelService | Phase 2, Phase 4 |
| **Phase 10** | Bot: MusicService.playBulk() | 독립 |
| **Phase 6** | Bot: Button/Modal Handler | Phase 3, Phase 5, Phase 10 |
| **Phase 7** | Bot: Message Listener | Phase 2 |
| **Phase 8** | Bot: Kazagumo 이벤트 연동 | Phase 3 |
| **Phase 9** | Bot: Module 등록 | Phase 3~8 전체 |

## 기존 코드와의 충돌 분석

| 파일 | 충돌 여부 | 상세 |
|------|-----------|------|
| `apps/api/src/app.module.ts` | 낮음 | MusicModule import 추가만 필요 |
| `apps/api/src/bot-api/bot-api.module.ts` | 낮음 | BotMusicController import 추가 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | 낮음 | Music 섹션 메서드 추가 (기존 코드 수정 없음) |
| `libs/bot-api-client/src/types.ts` | 낮음 | Music 타입 추가 (기존 코드 수정 없음) |
| `apps/bot/src/music/infrastructure/kazagumo.provider.ts` | 중간 | constructor에 MusicChannelService 주입 추가, 이벤트 핸들러에 로직 추가 |
| `apps/bot/src/music/application/music.service.ts` | 낮음 | playBulk 메서드 추가 (기존 메서드 변경 없음) |
| `apps/bot/src/music/music.module.ts` | 낮음 | 신규 provider 등록 추가 |
| `apps/bot/src/music/presentation/utils/now-playing-embed.builder.ts` | 낮음 | formatProgressBar, formatTime export 추가 (내부 로직 변경 없음) |

## 추가 패키지 의존성

| 패키지 | 앱 | 용도 |
|--------|-----|------|
| `cheerio` | bot | 멜론/빌보드 HTML 파싱 |

## 열린 질문

1. **Kazagumo v3 pause/resume 이벤트**: Kazagumo v3가 playerPause/playerResume 이벤트를 네이티브로 지원하는지 확인 필요. 미지원 시 MusicService에서 직접 호출하는 방식으로 대체.
2. **봇 앱 Redis 접근**: 봇 앱에서 Redis 클라이언트를 주입받는 기존 패턴이 있는지 확인 필요. ChartCrawlerService에서 캐싱에 사용.
3. **메시지 리스너 성능**: 모든 messageCreate에서 bot-api 조회 대신 인메모리 캐싱을 사용할지, 아니면 bot-api 호출 빈도가 허용 범위인지 판단 필요.
