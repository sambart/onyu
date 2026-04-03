import { InjectDiscordClient, Once } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type VoiceSyncUser } from '@onyu/bot-api-client';
import { ActivityType, ChannelType, Client } from 'discord.js';

import { waitForApi } from '../../common/util/wait-for-api';

/**
 * Discord clientReady 이벤트 수신 후 모든 길드의 음성 채널 사용자를 수집하여 API로 전송한다.
 * F-VOICE-023 3단계: 봇 재시작 시 기존 음성 채널 사용자 세션 복구.
 */
@Injectable()
export class BotVoiceSyncHandler {
  private readonly logger = new Logger(BotVoiceSyncHandler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  @Once('clientReady')
  async handleReady(): Promise<void> {
    this.logger.log('[VOICE-SYNC] Discord ready — waiting for API...');

    const isApiReady = await waitForApi(this.apiClient);
    if (!isApiReady) {
      this.logger.error('[VOICE-SYNC] API 연결 실패 — voice sync 중단');
      return;
    }

    this.logger.log('[VOICE-SYNC] API connected — syncing existing voice channel users...');

    let totalSynced = 0;

    for (const guild of this.client.guilds.cache.values()) {
      const users: VoiceSyncUser[] = [];

      const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice);

      for (const channel of voiceChannels.values()) {
        if (channel.type !== ChannelType.GuildVoice) continue;

        const nonBotMembers = channel.members.filter((m) => !m.user.bot);

        for (const member of nonBotMembers.values()) {
          const voiceState = member.voice;
          const playing = member.presence?.activities?.find((a) => a.type === ActivityType.Playing);

          users.push({
            userId: member.id,
            channelId: channel.id,
            channelName: channel.name,
            parentCategoryId: channel.parentId ?? null,
            categoryName: channel.parent?.name ?? null,
            userName: member.displayName,
            avatarUrl: member.displayAvatarURL({ size: 128 }),
            micOn: !(voiceState.selfMute ?? false),
            streaming: voiceState.streaming ?? false,
            selfVideo: voiceState.selfVideo,
            selfDeaf: voiceState.selfDeaf,
            gameName: playing?.name ?? null,
            gameApplicationId: playing?.applicationId ?? null,
          });
        }
      }

      if (users.length === 0) continue;

      try {
        await this.apiClient.pushVoiceSync({ guildId: guild.id, users });
        totalSynced += users.length;
        this.logger.log(`[VOICE-SYNC] guild=${guild.id} synced ${users.length} user(s)`);
      } catch (err) {
        this.logger.error(
          `[VOICE-SYNC] guild=${guild.id} sync failed`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    this.logger.log(`[VOICE-SYNC] Complete — ${totalSynced} user(s) synced across all guilds`);
  }
}
