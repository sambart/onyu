import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type RESTPostAPIChannelMessageJSONBody,
} from 'discord.js';

import { getErrorStack } from '../../common/util/error.util';
import type { MusicChannelConfigSaveDto } from '../dto/music-channel-config.dto';
import type {
  MusicButtonConfig,
  MusicChannelConfigOrm,
} from '../infrastructure/music-channel-config.orm-entity';
import { MusicChannelConfigRepository } from '../infrastructure/music-channel-config.repository';
import { MusicChannelDiscordAdapter } from '../infrastructure/music-channel-discord.adapter';

/** 음악 채널 임베드 기본값 */
const MUSIC_CHANNEL_DEFAULT_TITLE = '음악 채널';
const MUSIC_CHANNEL_DEFAULT_DESCRIPTION = '버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.';
const MUSIC_CHANNEL_DEFAULT_COLOR = '#5865F2';
const MUSIC_CHANNEL_BUTTON_CUSTOM_ID_PREFIX = 'music_channel:';
const DISCORD_MAX_BUTTONS_PER_ROW = 5;

const DEFAULT_BUTTON_CONFIG: MusicButtonConfig[] = [
  { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
  { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
  { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
  { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
  { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
  { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
  { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
];

@Injectable()
export class MusicChannelConfigService {
  private readonly logger = new Logger(MusicChannelConfigService.name);

  constructor(
    private readonly configRepo: MusicChannelConfigRepository,
    private readonly discordAdapter: MusicChannelDiscordAdapter,
  ) {}

  /** GET — 길드 설정 조회. */
  async getConfig(guildId: string): Promise<MusicChannelConfigOrm | null> {
    return this.configRepo.findByGuildId(guildId);
  }

  /**
   * PUT — upsert (신규 생성 또는 수정) + 임베드 갱신.
   * 처리 순서:
   *   1. DB save (upsert)
   *   2. enabled=true이고 messageId 존재 → 기존 메시지 수정 (edit)
   *      enabled=true이고 messageId 없음 → 신규 전송 후 messageId 저장
   *      enabled=false → 임베드 갱신 안 함
   */
  async upsertConfig(
    guildId: string,
    dto: MusicChannelConfigSaveDto,
  ): Promise<MusicChannelConfigOrm> {
    const config = await this.configRepo.save(guildId, dto);

    if (config.enabled && config.channelId) {
      const payload = this.buildIdleEmbedPayload(config);

      try {
        if (config.messageId) {
          await this.discordAdapter.editMessage(config.channelId, config.messageId, payload);
        } else {
          const messageId = await this.discordAdapter.sendMessage(config.channelId, payload);
          await this.configRepo.updateMessageId(config.id, messageId);
          config.messageId = messageId;
        }
      } catch (err) {
        this.logger.error(
          `[MUSIC_CHANNEL] Failed to upsert embed: guild=${guildId} channel=${config.channelId}`,
          getErrorStack(err),
        );
        throw err;
      }
    }

    return config;
  }

  /**
   * POST /reset — 임베드·버튼을 기본값으로 초기화 (채널 지정은 유지).
   * 설정이 없으면 기본값으로 새로 생성한다.
   */
  async resetConfig(guildId: string): Promise<MusicChannelConfigOrm> {
    const existing = await this.configRepo.findByGuildId(guildId);

    const resetDto: MusicChannelConfigSaveDto = {
      channelId: existing?.channelId ?? '',
      embedTitle: null,
      embedDescription: null,
      embedColor: null,
      embedThumbnailUrl: null,
      buttonConfig: { buttons: DEFAULT_BUTTON_CONFIG },
      enabled: existing?.enabled ?? true,
    };

    return this.upsertConfig(guildId, resetDto);
  }

  /** DELETE — 설정 삭제 (기존 메시지는 삭제하지 않음, PRD 명세). */
  async deleteConfig(guildId: string): Promise<void> {
    await this.configRepo.delete(guildId);
  }

  /**
   * 대기 상태 임베드 + 버튼 ActionRow를 Discord API payload로 빌드한다.
   */
  private buildIdleEmbedPayload(config: MusicChannelConfigOrm): RESTPostAPIChannelMessageJSONBody {
    const embed = new EmbedBuilder()
      .setTitle(config.embedTitle ?? MUSIC_CHANNEL_DEFAULT_TITLE)
      .setDescription(config.embedDescription ?? MUSIC_CHANNEL_DEFAULT_DESCRIPTION)
      // discord.js setColor는 `#${string}` 리터럴 타입을 요구하나,
      // DB 값은 string이므로 형식 보장을 위해 단언 사용 (저장 시 # 접두사 강제)
      .setColor((config.embedColor ?? MUSIC_CHANNEL_DEFAULT_COLOR) as `#${string}`);

    if (config.embedThumbnailUrl) {
      embed.setThumbnail(config.embedThumbnailUrl);
    }

    const components = this.buildButtonRows(config.buttonConfig.buttons);

    return {
      embeds: [embed.toJSON()],
      components: components.map((row) => row.toJSON()),
    };
  }

  /**
   * buttonConfig에서 enabled=true인 버튼만 필터 → row별 그룹핑 → ActionRowBuilder 배열 반환.
   */
  private buildButtonRows(buttons: MusicButtonConfig[]): ActionRowBuilder<ButtonBuilder>[] {
    const enabledButtons = buttons.filter((b) => b.enabled);

    // row 번호별로 그룹핑
    const rowMap = new Map<number, MusicButtonConfig[]>();
    for (const btn of enabledButtons) {
      const existing = rowMap.get(btn.row) ?? [];
      existing.push(btn);
      rowMap.set(btn.row, existing);
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const sortedRowNums = [...rowMap.keys()].sort((a, b) => a - b);

    for (const rowNum of sortedRowNums) {
      const rowButtons = (rowMap.get(rowNum) ?? []).slice(0, DISCORD_MAX_BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowButtons.map((btn) => {
          const builder = new ButtonBuilder()
            .setCustomId(`${MUSIC_CHANNEL_BUTTON_CUSTOM_ID_PREFIX}${btn.type}`)
            .setLabel(btn.label)
            .setStyle(ButtonStyle.Secondary);

          if (btn.emoji?.trim()) {
            try {
              builder.setEmoji(btn.emoji.trim());
            } catch {
              // 유효하지 않은 이모지 무시
            }
          }

          return builder;
        }),
      );
      rows.push(row);
    }

    return rows;
  }
}
