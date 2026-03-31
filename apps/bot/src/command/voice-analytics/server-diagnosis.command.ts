import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent, Param, ParamType } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { ServerDiagnosisResponse } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';

const EMBED_COLOR = 0x5b8def;
const DEFAULT_DAYS = 7;
const WEB_URL = process.env['WEB_URL'] ?? 'https://onyu.app';

class ServerDiagnosisDto {
  @Param({
    name: 'days',
    description: '조회 기간 (일, 기본값: 7)',
    required: false,
    type: ParamType.INTEGER,
    minValue: 1,
    maxValue: 90,
  })
  days?: number;
}

@Command({
  name: 'server-diagnosis',
  nameLocalizations: { ko: '서버진단' },
  description: 'Server voice activity diagnosis',
  descriptionLocalizations: { ko: '서버 음성 활동을 진단합니다' },
})
@Injectable()
export class ServerDiagnosisCommand {
  private readonly logger = new Logger(ServerDiagnosisCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onServerDiagnosis(
    @InteractionEvent() interaction: CommandInteraction,
    @InteractionEvent(SlashCommandPipe) dto: ServerDiagnosisDto,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '서버에서만 사용 가능한 명령어입니다.', ephemeral: true });
      return;
    }

    const days = dto.days ?? DEFAULT_DAYS;
    await interaction.deferReply();

    try {
      const response = await this.apiClient.getServerDiagnosis(interaction.guildId, days);

      if (!response.ok || !response.data) {
        await interaction.editReply({
          content: `최근 ${days}일간 음성 채널 활동 기록이 없습니다.`,
        });
        return;
      }

      const embed = this.buildEmbed(response, days);
      const row = this.buildButtonRow(interaction.guildId);

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      this.logger.error(
        'ServerDiagnosis command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({ content: '서버 진단 중 오류가 발생했습니다.' });
    }
  }

  private buildEmbed(response: ServerDiagnosisResponse, days: number): EmbedBuilder {
    const data = response.data;
    if (!data) {
      return new EmbedBuilder()
        .setTitle('서버 음성 활동 진단')
        .setColor(EMBED_COLOR)
        .setDescription('데이터가 없습니다.');
    }

    const { totalStats, topUsers, aiSummary } = data;
    const sections: string[] = [];

    if (aiSummary) {
      sections.push(`**🤖 AI 요약**\n${aiSummary}`);
    }

    sections.push(
      '**📊 기본 통계**\n' +
        `활성 유저: ${totalStats.totalUsers}명\n` +
        `총 음성 시간: ${this.formatTime(totalStats.totalVoiceTime)}\n` +
        `일평균 활성 유저: ${totalStats.avgDailyActiveUsers}명`,
    );

    if (topUsers.length > 0) {
      const userLines = topUsers
        .map((u) => `${u.rank}. **${u.nickName}** — ${this.formatTime(u.totalSec)}`)
        .join('\n');
      sections.push(`**👥 TOP 3 유저**\n${userLines}`);
    }

    return new EmbedBuilder()
      .setTitle(`🔍 서버 음성 활동 진단 (${days}일)`)
      .setColor(EMBED_COLOR)
      .setDescription(sections.join('\n\n'))
      .setTimestamp();
  }

  private buildButtonRow(guildId: string): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
      .setLabel('대시보드에서 자세히 보기')
      .setStyle(ButtonStyle.Link)
      .setURL(`${WEB_URL}/guilds/${guildId}/voice-analytics`);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
  }
}
