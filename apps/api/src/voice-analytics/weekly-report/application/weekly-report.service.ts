import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type RESTPostAPIChannelMessageJSONBody,
} from 'discord.js';

import { getErrorStack } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { VoiceAiAnalysisService } from '../../application/voice-ai-analysis.service';
import { VoiceAnalyticsService } from '../../application/voice-analytics.service';
import type { WeeklyReportConfigOrmEntity } from '../infrastructure/weekly-report-config.orm-entity';

const REPORT_EMBED_COLOR = 0x5b8def;
const LEADERBOARD_PAGE = 1;
const LEADERBOARD_LIMIT = 5;
const TOP_CHANNELS_LIMIT = 3;
const REPORT_PERIOD_DAYS = 7;

interface ReportData {
  currentStats: { totalUsers: number; totalVoiceTime: number; avgDailyActiveUsers: number };
  prevStats: { totalUsers: number; totalVoiceTime: number; avgDailyActiveUsers: number };
  topUsers: Array<{
    rank: number;
    nickName: string;
    totalSec: number;
    micOnSec: number;
    activeDays: number;
  }>;
  topChannels: Array<{ channelName: string; totalSec: number; uniqueUsers: number }>;
  aiAnalysis: string | null;
}

@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    private readonly analyticsService: VoiceAnalyticsService,
    private readonly aiAnalysisService: VoiceAiAnalysisService,
    private readonly discordRestService: DiscordRestService,
  ) {}

  async generateAndSendReport(config: WeeklyReportConfigOrmEntity): Promise<void> {
    if (!config.channelId) {
      this.logger.warn(`[WEEKLY] guild=${config.guildId} channelId is not configured, skipping`);
      return;
    }

    this.logger.log(`[WEEKLY] Generating report for guild=${config.guildId}`);

    try {
      const reportData = await this.collectReportData(config.guildId);
      const payload = this.buildPayload(config.guildId, reportData);

      await this.discordRestService.sendMessage(config.channelId, payload);
      this.logger.log(`[WEEKLY] Report sent for guild=${config.guildId}`);
    } catch (err) {
      this.logger.error(
        `[WEEKLY] Failed to generate/send report for guild=${config.guildId}`,
        getErrorStack(err),
      );
      throw err;
    }
  }

  private async collectReportData(guildId: string): Promise<ReportData> {
    const currentRange = VoiceAnalyticsService.getDateRange(REPORT_PERIOD_DAYS);
    const prevRange = VoiceAnalyticsService.getPrevDateRange(REPORT_PERIOD_DAYS);

    const [currentData, prevData, leaderboard, channelStats] = await Promise.all([
      this.analyticsService.collectVoiceActivityData(guildId, currentRange.start, currentRange.end),
      this.analyticsService.collectVoiceActivityData(guildId, prevRange.start, prevRange.end),
      this.analyticsService.getLeaderboard(guildId, {
        days: REPORT_PERIOD_DAYS,
        page: LEADERBOARD_PAGE,
        limit: LEADERBOARD_LIMIT,
      }),
      this.analyticsService.getChannelStats(guildId, REPORT_PERIOD_DAYS),
    ]);

    let aiAnalysis: string | null = null;
    try {
      aiAnalysis = await this.aiAnalysisService.generateWeeklyReport(
        currentData,
        prevData,
        currentData.channelStats,
      );
    } catch (err) {
      this.logger.warn(`[WEEKLY] AI analysis failed for guild=${guildId}`, getErrorStack(err));
    }

    return {
      currentStats: currentData.totalStats,
      prevStats: prevData.totalStats,
      topUsers: leaderboard.users,
      topChannels: channelStats.slice(0, TOP_CHANNELS_LIMIT),
      aiAnalysis,
    };
  }

  // eslint-disable-next-line max-lines-per-function
  private buildPayload(guildId: string, reportData: ReportData): RESTPostAPIChannelMessageJSONBody {
    const { currentStats, prevStats, topUsers, topChannels, aiAnalysis } = reportData;
    const formatTime = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    };

    const formatDiff = (current: number, prev: number): string => {
      const diff = current - prev;
      if (diff > 0) return `+${diff.toFixed(1)}`;
      if (diff < 0) return `${diff.toFixed(1)}`;
      return '±0';
    };

    const sections: string[] = [];

    // 이번 주 vs 지난 주 비교
    sections.push(
      '**📊 이번 주 vs 지난 주**\n' +
        `활성 유저: ${currentStats.totalUsers}명 (${formatDiff(currentStats.totalUsers, prevStats.totalUsers)})\n` +
        `총 음성 시간: ${formatTime(currentStats.totalVoiceTime)}\n` +
        `일평균 활성: ${currentStats.avgDailyActiveUsers}명 (${formatDiff(currentStats.avgDailyActiveUsers, prevStats.avgDailyActiveUsers)})`,
    );

    // TOP 5 유저
    if (topUsers.length > 0) {
      const userLines = topUsers
        .map(
          (u) =>
            `${u.rank}. **${u.nickName}** — ${formatTime(u.totalSec)} (${u.activeDays}일 활동)`,
        )
        .join('\n');
      sections.push(`**👥 TOP 5 유저**\n${userLines}`);
    }

    // TOP 3 채널
    if (topChannels.length > 0) {
      const channelLines = topChannels
        .map((c) => `- **${c.channelName}** — ${formatTime(c.totalSec)} (${c.uniqueUsers}명)`)
        .join('\n');
      sections.push(`**📺 TOP 3 채널**\n${channelLines}`);
    }

    // AI 종합 분석
    if (aiAnalysis) {
      sections.push(`**🤖 AI 종합 분석**\n${aiAnalysis}`);
    }

    const button = new ButtonBuilder()
      .setLabel('대시보드에서 자세히 보기')
      .setStyle(ButtonStyle.Link)
      .setURL(`${process.env['WEB_URL'] ?? 'https://onyu.app'}/guilds/${guildId}/voice-analytics`);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    return {
      embeds: [
        {
          title: '📋 주간 음성 활동 리포트',
          description: sections.join('\n\n'),
          color: REPORT_EMBED_COLOR,
          timestamp: new Date().toISOString(),
        },
      ],
      // discord.js ActionRowBuilder JSON 변환
      components: [row.toJSON()],
    };
  }
}
