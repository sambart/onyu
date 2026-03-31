import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

import { StickyMessageDeleteDto } from './sticky-message-delete.dto';

@Command({
  name: '고정메세지삭제',
  description: '선택한 채널의 고정메세지를 모두 삭제합니다',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageDeleteCommand {
  private readonly logger = new Logger(StickyMessageDeleteCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onDelete(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe) _dto: StickyMessageDeleteDto,
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: '이 명령어는 서버 관리자만 사용할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '서버에서만 사용 가능한 명령어입니다.',
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel('채널', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.apiClient.deleteStickyMessageByChannel(guildId, channel.id);

      if (result.deletedCount === 0) {
        await interaction.editReply(
          `<#${channel.id}> 채널에 등록된 고정메세지가 없습니다.`,
        );
        return;
      }

      await interaction.editReply(
        `<#${channel.id}> 채널의 고정메세지 ${result.deletedCount}개가 삭제되었습니다.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      this.logger.error('고정메세지 삭제 중 오류:', error);
      await interaction.editReply(
        `삭제 중 오류가 발생했습니다: ${message}`,
      );
    }
  }
}
