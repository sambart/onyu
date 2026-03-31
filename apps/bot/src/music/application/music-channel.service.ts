import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { ActionRowBuilder, ButtonBuilder, EmbedBuilder, TextChannel } from 'discord.js';
import { Client } from 'discord.js';
import type { KazagumoTrack } from 'kazagumo';

import {
  buildIdleMusicChannelEmbed,
  buildMusicChannelButtons,
  buildPlayingMusicChannelEmbed,
} from '../presentation/utils/music-channel-embed.builder';

interface UpdateEmbedParams {
  guildId: string;
  channelId: string;
  messageId: string;
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}

/**
 * 음악 전용 채널 임베드 갱신 서비스.
 * Kazagumo 이벤트 및 버튼 인터랙션에서 호출된다.
 * 설정 조회는 BotApiClientService를 통해 API 서버에서 가져온다.
 */
@Injectable()
export class MusicChannelService {
  private readonly logger = new Logger(MusicChannelService.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly botApiClient: BotApiClientService,
  ) {}

  /**
   * 재생 중 임베드로 갱신한다 (playerStart 이벤트에서 호출).
   */
  async updatePlayingEmbed(guildId: string, track: KazagumoTrack): Promise<void> {
    const config = await this.botApiClient.getMusicChannelConfig(guildId);
    if (!config?.enabled || !config.messageId) return;

    const embed = buildPlayingMusicChannelEmbed({
      track,
      isPaused: false,
      fallbackThumbnailUrl: config.embedThumbnailUrl,
    });
    const components = buildMusicChannelButtons(config);

    await this.updateEmbed({
      guildId,
      channelId: config.channelId,
      messageId: config.messageId,
      embed,
      components,
    });
  }

  /**
   * 대기 상태 임베드로 복원한다 (playerEmpty 이벤트에서 호출).
   */
  async restoreIdleEmbed(guildId: string): Promise<void> {
    const config = await this.botApiClient.getMusicChannelConfig(guildId);
    if (!config?.enabled || !config.messageId) return;

    const embed = buildIdleMusicChannelEmbed(config);
    const components = buildMusicChannelButtons(config);

    await this.updateEmbed({
      guildId,
      channelId: config.channelId,
      messageId: config.messageId,
      embed,
      components,
    });
  }

  /**
   * 일시정지/재개 시 임베드 상태를 갱신한다.
   * MusicChannelService는 MusicService를 의존하지 않으므로 트랙을 직접 전달받는다.
   */
  async updatePauseState(guildId: string, isPaused: boolean, track: KazagumoTrack): Promise<void> {
    const config = await this.botApiClient.getMusicChannelConfig(guildId);
    if (!config?.enabled || !config.messageId) return;

    const embed = buildPlayingMusicChannelEmbed({
      track,
      isPaused,
      fallbackThumbnailUrl: config.embedThumbnailUrl,
    });
    const components = buildMusicChannelButtons(config);

    await this.updateEmbed({
      guildId,
      channelId: config.channelId,
      messageId: config.messageId,
      embed,
      components,
    });
  }

  /**
   * 임베드를 갱신한다. 실패 시 messageId를 null로 초기화한다.
   */
  private async updateEmbed({
    guildId,
    channelId,
    messageId,
    embed,
    components,
  }: UpdateEmbedParams): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) return;

      const message = await (channel as TextChannel).messages.fetch(messageId);
      await message.edit({ embeds: [embed], components });
    } catch (err) {
      // 메시지/채널 삭제된 경우 messageId를 null로 초기화
      this.logger.warn(
        `[MUSIC_CHANNEL] Failed to update embed: guild=${guildId}`,
        err instanceof Error ? err.stack : err,
      );
      await this.botApiClient.updateMusicChannelMessageId(guildId, null).catch((e: unknown) => {
        this.logger.warn(`[MUSIC_CHANNEL] Failed to clear messageId: guild=${guildId}`, e);
      });
    }
  }
}
