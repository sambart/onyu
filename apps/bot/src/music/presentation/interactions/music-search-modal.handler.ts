import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { GuildMember, Interaction } from 'discord.js';

import { MusicService } from '../../application/music.service';

const MUSIC_CHANNEL_MODAL_ID = 'music_channel:search_modal';

/**
 * 음악 채널 검색 모달 제출 핸들러.
 * customId = 'music_channel:search_modal' 처리.
 */
@Injectable()
export class MusicSearchModalHandler {
  private readonly logger = new Logger(MusicSearchModalHandler.name);

  constructor(private readonly musicService: MusicService) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== MUSIC_CHANNEL_MODAL_ID) return;
    if (!interaction.guildId) return;

    try {
      const query = interaction.fields.getTextInputValue('query');

      const member = interaction.member;
      if (!(member instanceof GuildMember)) {
        await interaction.reply({
          content: '길드 멤버 정보를 가져올 수 없습니다.',
          ephemeral: true,
        });
        return;
      }

      const voiceChannelId = member.voice.channelId;
      if (!voiceChannelId) {
        await interaction.reply({ content: '음성 채널에 먼저 입장해 주세요.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const result = await this.musicService.play({
        query,
        guildId: interaction.guildId,
        textChannelId: interaction.channelId,
        voiceChannelId,
        requesterId: interaction.user.id,
      });

      await interaction.editReply({
        content: `"${result.firstTrack.title}"을(를) 대기열에 추가했습니다.`,
      });
    } catch (err) {
      this.logger.error('[MUSIC_SEARCH_MODAL] Failed', err instanceof Error ? err.stack : err);
      try {
        const content = '음악 검색에 실패했습니다. 다시 시도해 주세요.';
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content });
        } else {
          await interaction.reply({ content, ephemeral: true });
        }
      } catch {
        // 응답 실패 무시
      }
    }
  }
}
