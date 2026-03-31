import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { AttachmentBuilder, CommandInteraction, GuildMember } from 'discord.js';

@Command({
  name: 'me',
  nameLocalizations: { ko: '미' },
  description: '내 프로필과 음성 활동을 확인합니다',
})
@Injectable()
export class MeCommand {
  private readonly logger = new Logger(MeCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onMe(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '서버에서만 사용 가능한 명령어입니다.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    try {
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const result = await this.apiClient.getMeProfile(
        interaction.guildId,
        interaction.user.id,
        displayName,
        avatarUrl,
      );

      if (!result.data) {
        await interaction.editReply({
          content: `최근 ${result.days}일간 음성 채널 활동 기록이 없습니다.`,
        });
        return;
      }

      const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'profile.png' });

      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      this.logger.error('Me command error:', error);
      await interaction.editReply({ content: '프로필 조회 중 오류가 발생했습니다.' });
    }
  }
}
