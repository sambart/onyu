import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  Colors,
  CommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

@Command({
  name: '고정메세지목록',
  description: '이 서버의 고정메세지 목록을 확인합니다',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageListCommand {
  private readonly logger = new Logger(StickyMessageListCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onList(
    @InteractionEvent() interaction: CommandInteraction,
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

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.apiClient.getStickyMessageConfigs(guildId);
      const configs = result.data ?? [];

      if (configs.length === 0) {
        await interaction.editReply('등록된 고정메세지가 없습니다.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('고정메세지 목록')
        .setColor(Colors.Blue)
        .setFooter({ text: `총 ${configs.length}개` })
        .setTimestamp();

      configs.slice(0, 25).forEach((config, index) => {
        embed.addFields({
          name: `#${index + 1} <#${config.channelId}>`,
          value: [
            `제목: ${config.embedTitle ?? '(제목 없음)'}`,
            `활성화: ${config.enabled ? '켜짐' : '꺼짐'}`,
          ].join('\n'),
          inline: false,
        });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      this.logger.error('고정메세지 목록 조회 중 오류:', error);
      await interaction.editReply(
        `목록 조회 중 오류가 발생했습니다: ${message}`,
      );
    }
  }
}
