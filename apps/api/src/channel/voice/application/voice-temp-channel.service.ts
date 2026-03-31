import { Inject, Injectable, Logger } from '@nestjs/common';

import { DiscordVoiceGateway } from '../infrastructure/discord-voice.gateway';
import { TempChannelStore } from '../infrastructure/temp-channel-store';
import { VoiceStateDto } from '../infrastructure/voice-state.dto';
import { VoiceChannelPolicy } from './voice-channel.policy';

@Injectable()
export class VoiceTempChannelService {
  private readonly logger = new Logger(VoiceTempChannelService.name);

  constructor(
    @Inject('TempChannelStore') private readonly tempChannelStore: TempChannelStore,
    private readonly policy: VoiceChannelPolicy,
    private readonly discord: DiscordVoiceGateway,
  ) {}

  async handleJoin(cmd: VoiceStateDto): Promise<void> {
    if (this.policy.shouldCreateTempChannel(cmd.channelId)) {
      let tempChannelId: string | undefined;

      try {
        tempChannelId = await this.discord.createVoiceChannel({
          guildId: cmd.guildId,
          name: '임시',
          parentCategoryId: cmd.parentCategoryId ?? undefined,
        });

        await this.tempChannelStore.registerTempChannel(cmd.guildId, tempChannelId);
        await this.tempChannelStore.addMember(tempChannelId, cmd.userId);
        await this.discord.moveUserToChannel(cmd.guildId, cmd.userId, tempChannelId);

        this.logger.log(`[TEMP CHANNEL] Created ${tempChannelId} for ${cmd.userId}`);
      } catch (error) {
        this.logger.error(
          `[TEMP CHANNEL] Failed to create/move: guild=${cmd.guildId} user=${cmd.userId}`,
          error instanceof Error ? error.stack : error,
        );
        // 채널은 생성됐지만 이동 실패 시 고아 채널 정리
        if (tempChannelId) {
          await this.tempChannelStore
            .unregisterTempChannel(cmd.guildId, tempChannelId)
            .catch(() => {});
          await this.discord.deleteChannel(tempChannelId).catch(() => {});
        }
      }
    }
  }

  async handleLeave(cmd: VoiceStateDto): Promise<void> {
    if (cmd.channelId && (await this.policy.shouldDeleteChannel(cmd.guildId, cmd.channelId))) {
      try {
        await this.tempChannelStore.removeMember(cmd.channelId, cmd.userId);
        await this.tempChannelStore.unregisterTempChannel(cmd.guildId, cmd.channelId);
        await this.discord.deleteChannel(cmd.channelId);

        this.logger.log(`[TEMP CHANNEL] Deleted ${cmd.channelId}`);
      } catch (error) {
        this.logger.error(
          `[TEMP CHANNEL] Failed to clean up: guild=${cmd.guildId} channel=${cmd.channelId}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }
}
