import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { SelfDiagnosisResultData } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

const EMBED_COLOR = 0x5b8def;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

@Command({
  name: 'self-diagnosis',
  nameLocalizations: { ko: '자가진단' },
  description: 'Diagnose your own voice activity',
  descriptionLocalizations: { ko: '내 음성 활동을 진단합니다' },
})
@Injectable()
export class SelfDiagnosisCommand {
  private readonly logger = new Logger(SelfDiagnosisCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onSelfDiagnosis(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '서버에서만 사용 가능한 명령어입니다.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await this.apiClient.runSelfDiagnosis(
        interaction.guildId,
        interaction.user.id,
      );

      if (!response.data) {
        if (response.reason === 'not_enabled') {
          await interaction.editReply({
            content: '이 서버에서는 자가진단 기능이 활성화되지 않았습니다.',
          });
          return;
        }
        if (response.reason === 'cooldown') {
          const timeText = this.formatRemainingTime(response.remainingSeconds ?? 0);
          await interaction.editReply({
            content: `쿨다운 중입니다. ${timeText} 후에 다시 시도해주세요.`,
          });
          return;
        }
        if (response.reason === 'quota_exhausted') {
          const quotaEmbed = new EmbedBuilder()
            .setTitle('AI 할당량 초과')
            .setColor(0xffa500)
            .setDescription('AI 분석 할당량이 소진되었습니다. 잠시 후 다시 시도해주세요.');
          await interaction.editReply({ embeds: [quotaEmbed] });
          return;
        }
        await interaction.editReply({ content: '자가진단을 수행할 수 없습니다.' });
        return;
      }

      const { result, analysisDays, isCooldownEnabled, cooldownHours } = response.data;

      if (result.totalMinutes === 0) {
        await interaction.editReply({
          content: `최근 ${analysisDays}일간 음성 채널 활동 기록이 없습니다.`,
        });
        return;
      }

      // LLM 요약을 먼저 시도하고, 실패 시 전체 섹션 fallback
      try {
        const llmResponse = await this.apiClient.getSelfDiagnosisLlmSummary(
          interaction.guildId,
          interaction.user.id,
        );
        if (llmResponse.data?.llmSummary) {
          result.llmSummary = llmResponse.data.llmSummary;
        }
      } catch (llmError) {
        this.logger.warn('LLM summary fetch failed, using data embed', llmError);
      }

      const embed = this.buildEmbed(result, analysisDays, isCooldownEnabled, cooldownHours);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Self-diagnosis command error:', error);
      await interaction.editReply({ content: '자가진단 중 오류가 발생했습니다.' });
    }
  }

  private buildEmbed(
    result: SelfDiagnosisResultData,
    analysisDays: number,
    isCooldownEnabled: boolean,
    cooldownHours: number,
  ): EmbedBuilder {
    const embed = new EmbedBuilder().setTitle('\u{1FA7A} 음성 활동 자가진단').setColor(EMBED_COLOR);

    const sections: string[] = [];

    if (result.llmSummary) {
      sections.push(`**\u{1F916} AI 요약**\n${result.llmSummary}`);
      sections.push(this.buildBadgeSection(result));
    } else {
      sections.push(this.buildActivitySection(result));
      sections.push(this.buildRelationshipSection(result));
      sections.push(this.buildMocoSection(result));
      sections.push(this.buildPatternSection(result));
      sections.push(this.buildBadgeSection(result));
    }

    embed.setDescription(sections.join('\n\n'));

    const nextAvailable = isCooldownEnabled
      ? this.formatNextAvailableTime(cooldownHours)
      : '제한 없음';
    embed.setFooter({
      text: `분석 기간: ${analysisDays}일 | 다음 진단: ${nextAvailable}`,
    });

    return embed;
  }

  private buildActivitySection(result: SelfDiagnosisResultData): string {
    const activityVerdict = result.verdicts.find((v) => v.category === '활동량');
    const daysVerdict = result.verdicts.find((v) => v.category === '활동일수');

    const lines = [
      '**\u{1F4CA} 활동량**',
      `총 음성 시간: ${this.formatMinutes(result.totalMinutes)} | 활동일: ${result.activeDays}/${result.totalDays}일 (${this.formatPercent(result.activeDaysRatio)})`,
      `일평균: ${this.formatMinutes(result.avgDailyMinutes)} | 순위: ${result.activityRank}/${result.activityTotalUsers}명 (상위 ${result.activityTopPercent.toFixed(1)}%)`,
    ];

    if (activityVerdict) {
      lines.push(
        `${this.verdictEmoji(activityVerdict.isPassed)} 활동량: ${activityVerdict.actual} (기준: ${activityVerdict.criterion})`,
      );
    }
    if (daysVerdict) {
      lines.push(
        `${this.verdictEmoji(daysVerdict.isPassed)} 활동일수: ${daysVerdict.actual} (기준: ${daysVerdict.criterion})`,
      );
    }

    return lines.join('\n');
  }

  private buildRelationshipSection(result: SelfDiagnosisResultData): string {
    const hhiVerdict = result.verdicts.find((v) => v.category === '관계 다양성');
    const peerVerdict = result.verdicts.find((v) => v.category === '함께한 멤버');

    const diversityScore = Math.round((1 - result.hhiScore) * 100);
    const lines = [
      '**\u{1F91D} 관계 다양성**',
      `함께한 멤버: ${result.peerCount}명 | 다양성 점수: ${diversityScore}점`,
    ];

    if (result.topPeers.length > 0) {
      const peerList = result.topPeers
        .map(
          (p) => `${p.userName} (${this.formatMinutes(p.minutes)}, ${this.formatPercent(p.ratio)})`,
        )
        .join(', ');
      lines.push(`자주 함께한 멤버: ${peerList}`);
    }

    if (hhiVerdict) {
      lines.push(
        `${this.verdictEmoji(hhiVerdict.isPassed)} 관계 다양성: ${hhiVerdict.actual} (기준: ${hhiVerdict.criterion})`,
      );
    }
    if (peerVerdict) {
      lines.push(
        `${this.verdictEmoji(peerVerdict.isPassed)} 함께한 멤버: ${peerVerdict.actual} (기준: ${peerVerdict.criterion})`,
      );
    }

    return lines.join('\n');
  }

  private buildMocoSection(result: SelfDiagnosisResultData): string {
    if (result.mocoTotalUsers === 0) {
      return '**\u{1F331} 모코코 기여**\n서버에 모코코 데이터가 없습니다.';
    }

    if (!result.hasMocoActivity) {
      return [
        '**\u{1F331} 모코코 기여**',
        '아직 모코코 활동이 없습니다.',
        '\u{1F4A1} 신규 멤버와 함께 음성 채널에 참여해보세요!',
        `모코코 참여자: ${result.mocoTotalUsers}명`,
      ].join('\n');
    }

    return [
      '**\u{1F331} 모코코 기여**',
      `점수: ${result.mocoScore}점 | 순위: ${result.mocoRank}/${result.mocoTotalUsers}명 (상위 ${result.mocoTopPercent.toFixed(1)}%)`,
      `도움 준 신규 멤버: ${result.mocoHelpedNewbies}명`,
    ].join('\n');
  }

  private buildPatternSection(result: SelfDiagnosisResultData): string {
    return [
      '**\u{1F50D} 참여 패턴**',
      `마이크 사용률: ${this.formatPercent(result.micUsageRate)} | 혼자 비율: ${this.formatPercent(result.aloneRatio)}`,
    ].join('\n');
  }

  private buildBadgeSection(result: SelfDiagnosisResultData): string {
    const earned = result.badgeGuides.filter((b) => b.isEarned);
    const unearned = result.badgeGuides.filter((b) => !b.isEarned);

    const lines: string[] = [];

    if (earned.length > 0) {
      const badgeText = earned.map((b) => `${b.icon} ${b.name}`).join('  ');
      lines.push(`**\u{1F3C5} 획득한 뱃지**\n${badgeText}`);
    } else {
      lines.push('**\u{1F3C5} 획득한 뱃지**\n아직 획득한 뱃지가 없습니다.');
    }

    if (unearned.length > 0) {
      const guideLines = unearned.map(
        (b) => `${b.icon} ${b.name} \u2014 ${b.criterion} (${b.current})`,
      );
      lines.push(`**\u{1F4D6} 뱃지 가이드**\n${guideLines.join('\n')}`);
    }

    return lines.join('\n\n');
  }

  private formatMinutes(minutes: number): string {
    const totalMin = Math.floor(minutes);
    const hours = Math.floor(totalMin / MINUTES_PER_HOUR);
    const mins = totalMin % MINUTES_PER_HOUR;

    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  private formatPercent(ratio: number): string {
    return `${(ratio * 100).toFixed(1)}%`;
  }

  private formatNextAvailableTime(cooldownHours: number): string {
    if (cooldownHours < HOURS_PER_DAY) {
      return `${cooldownHours}h`;
    }
    const days = Math.floor(cooldownHours / HOURS_PER_DAY);
    const hours = cooldownHours % HOURS_PER_DAY;
    if (days > 0 && hours > 0) {
      return `${days}d ${hours}h`;
    }
    if (days > 0) {
      return `${days}d`;
    }
    return `${hours}h`;
  }

  private formatRemainingTime(seconds: number): string {
    const totalMin = Math.ceil(seconds / SECONDS_PER_MINUTE);
    const hours = Math.floor(totalMin / MINUTES_PER_HOUR);
    const mins = totalMin % MINUTES_PER_HOUR;

    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  private verdictEmoji(isPassed: boolean): string {
    return isPassed ? '\u2705' : '\u26A0\uFE0F';
  }
}
