import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ChannelStatItem, DailyTrendItem, LeaderboardUser } from '@onyu/shared';
import type { VoiceActivityData } from '@onyu/shared';
import { Between, Not, Repository } from 'typeorm';

import { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { getErrorStack } from '../../common/util/error.util';
import { DiscordGateway } from '../../gateway/discord.gateway';
import { UserAggregateData, VoiceNameEnricherService } from './voice-name-enricher.service';

export type { VoiceActivityData } from '@onyu/shared';

interface ChannelAggregate {
  channelId: string;
  channelName: string | null;
  totalVoiceTime: number;
  uniqueUsers: Set<string>;
  sessionCount: number;
}

interface DailyAggregate {
  date: string;
  totalVoiceTime: number;
  activeUsers: Set<string>;
  totalMicOnTime: number;
}

@Injectable()
export class VoiceAnalyticsService {
  private readonly logger = new Logger(VoiceAnalyticsService.name);

  constructor(
    @InjectRepository(VoiceDailyOrm)
    private voiceDailyRepo: Repository<VoiceDailyOrm>,
    private discordGateway: DiscordGateway,
    private nameEnricher: VoiceNameEnricherService,
  ) {}

  async collectVoiceActivityData(
    guildId: string,
    startDate: string,
    endDate: string,
  ): Promise<VoiceActivityData> {
    try {
      this.logger.log(`Collecting voice data for guild ${guildId} from ${startDate} to ${endDate}`);

      const globalData = await this.voiceDailyRepo.find({
        where: { guildId, channelId: 'GLOBAL', date: Between(startDate, endDate) },
        order: { date: 'ASC' },
      });

      const channelData = await this.voiceDailyRepo.find({
        where: { guildId, channelId: Not('GLOBAL'), date: Between(startDate, endDate) },
        order: { date: 'ASC' },
      });

      if (globalData.length === 0 && channelData.length === 0) {
        this.logger.warn(`No voice data found for guild ${guildId}`);
        return await this.createEmptyResponse(guildId, startDate, endDate);
      }

      const totalStats = this.calculateTotalStatsFromGlobal(globalData);
      const userActivities = await this.aggregateUserActivities(guildId, globalData, channelData);
      const channelStats = await this.aggregateChannelStats(guildId, channelData);
      const dailyTrends = this.aggregateDailyTrends(globalData, channelData);
      const guildName = await this.discordGateway.getGuildName(guildId);

      return {
        guildId,
        guildName,
        timeRange: { start: startDate, end: endDate },
        totalStats,
        userActivities,
        channelStats,
        dailyTrends,
      };
    } catch (error) {
      this.logger.error('Failed to collect voice activity data', getErrorStack(error));
      throw error;
    }
  }

  private calculateTotalStatsFromGlobal(globalData: VoiceDailyOrm[]) {
    const uniqueUsers = new Set<string>();
    let totalVoiceTime = 0;
    let totalMicOnTime = 0;
    const dailyActiveUsers = new Map<string, Set<string>>();

    globalData.forEach((record) => {
      uniqueUsers.add(record.userId);
      totalVoiceTime += record.channelDurationSec;
      totalMicOnTime += record.micOnSec;

      if (!dailyActiveUsers.has(record.date)) {
        dailyActiveUsers.set(record.date, new Set());
      }
      dailyActiveUsers.get(record.date)?.add(record.userId);
    });

    const avgDailyActiveUsers =
      dailyActiveUsers.size > 0
        ? Array.from(dailyActiveUsers.values()).reduce((sum, users) => sum + users.size, 0) /
          dailyActiveUsers.size
        : 0;

    return {
      totalUsers: uniqueUsers.size,
      totalVoiceTime: Math.round(totalVoiceTime),
      totalMicOnTime: Math.round(totalMicOnTime),
      avgDailyActiveUsers: Math.round(avgDailyActiveUsers * 10) / 10,
    };
  }

  // eslint-disable-next-line max-lines-per-function
  private async aggregateUserActivities(
    guildId: string,
    globalData: VoiceDailyOrm[],
    channelData: VoiceDailyOrm[],
  ) {
    const userMap = new Map<string, UserAggregateData>();

    globalData.forEach((record) => {
      if (!userMap.has(record.userId)) {
        userMap.set(record.userId, {
          userId: record.userId,
          username: record.userName || null,
          totalVoiceTime: 0,
          totalMicOnTime: 0,
          totalMicOffTime: 0,
          aloneTime: 0,
          channelMap: new Map<string, { name: string; duration: number }>(),
          activeDaysSet: new Set<string>(),
        });
      }

      const user = userMap.get(record.userId);
      if (user) {
        user.totalMicOnTime += record.micOnSec || 0;
        user.totalMicOffTime += record.micOffSec || 0;
        user.aloneTime += record.aloneSec || 0;
        user.activeDaysSet.add(record.date);
      }
    });

    channelData.forEach((record) => {
      if (!userMap.has(record.userId)) {
        userMap.set(record.userId, {
          userId: record.userId,
          username: record.userName || null,
          totalVoiceTime: 0,
          totalMicOnTime: 0,
          totalMicOffTime: 0,
          aloneTime: 0,
          channelMap: new Map<string, { name: string; duration: number }>(),
          activeDaysSet: new Set<string>(),
        });
      }

      const user = userMap.get(record.userId);
      if (user) {
        user.totalVoiceTime += record.channelDurationSec || 0;
        user.activeDaysSet.add(record.date);

        const current = user.channelMap.get(record.channelId) ?? {
          name: record.channelName || '',
          duration: 0,
        };
        current.duration += record.channelDurationSec || 0;
        if (record.channelName) {
          current.name = record.channelName;
        }
        user.channelMap.set(record.channelId, current);
      }
    });

    await this.nameEnricher.enrichUserNames(guildId, userMap);
    await this.nameEnricher.enrichChannelNames(guildId, userMap);

    return Array.from(userMap.values())
      .map((user) => {
        const activeDays = user.activeDaysSet.size;
        const avgDailyVoiceTime = activeDays > 0 ? user.totalVoiceTime / activeDays : 0;
        const micUsageRate =
          user.totalVoiceTime > 0 ? (user.totalMicOnTime / user.totalVoiceTime) * 100 : 0;

        const activeChannels = Array.from(user.channelMap.entries())
          .map(([channelId, info]) => ({
            channelId,
            channelName: info.name || `Channel-${channelId.slice(0, 6)}`,
            duration: Math.round(info.duration),
          }))
          .sort((a, b) => b.duration - a.duration);

        return {
          userId: user.userId,
          username: user.username || `User-${user.userId.slice(0, 6)}`,
          totalVoiceTime: Math.round(user.totalVoiceTime),
          totalMicOnTime: Math.round(user.totalMicOnTime),
          totalMicOffTime: Math.round(user.totalMicOffTime),
          aloneTime: Math.round(user.aloneTime),
          activeChannels,
          activeDays,
          avgDailyVoiceTime: Math.round(avgDailyVoiceTime),
          micUsageRate: Math.round(micUsageRate * 10) / 10,
        };
      })
      .sort((a, b) => b.totalVoiceTime - a.totalVoiceTime);
  }

  private async aggregateChannelStats(guildId: string, channelData: VoiceDailyOrm[]) {
    const channelMap = new Map<string, ChannelAggregate>();

    channelData.forEach((record) => {
      if (!channelMap.has(record.channelId)) {
        channelMap.set(record.channelId, {
          channelId: record.channelId,
          channelName: record.channelName || null,
          totalVoiceTime: 0,
          uniqueUsers: new Set<string>(),
          sessionCount: 0,
        });
      }

      const channel = channelMap.get(record.channelId);
      if (channel) {
        channel.totalVoiceTime += record.channelDurationSec || 0;
        channel.uniqueUsers.add(record.userId);
        channel.sessionCount++;
      }
    });

    await this.nameEnricher.enrichChannelStatsNames(guildId, channelMap);

    return Array.from(channelMap.values())
      .map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName || `Channel-${channel.channelId.slice(0, 6)}`,
        totalVoiceTime: Math.round(channel.totalVoiceTime),
        uniqueUsers: channel.uniqueUsers.size,
        avgSessionDuration: Math.round(channel.totalVoiceTime / channel.sessionCount),
      }))
      .sort((a, b) => b.totalVoiceTime - a.totalVoiceTime);
  }

  private aggregateDailyTrends(globalData: VoiceDailyOrm[], channelData: VoiceDailyOrm[]) {
    const dailyMap = new Map<string, DailyAggregate>();

    globalData.forEach((record) => {
      if (!dailyMap.has(record.date)) {
        dailyMap.set(record.date, {
          date: record.date,
          totalVoiceTime: 0,
          activeUsers: new Set<string>(),
          totalMicOnTime: 0,
        });
      }

      const daily = dailyMap.get(record.date);
      if (daily) {
        daily.totalMicOnTime += record.micOnSec || 0;
        daily.activeUsers.add(record.userId);
      }
    });

    channelData.forEach((record) => {
      if (!dailyMap.has(record.date)) {
        dailyMap.set(record.date, {
          date: record.date,
          totalVoiceTime: 0,
          activeUsers: new Set<string>(),
          totalMicOnTime: 0,
        });
      }

      const daily = dailyMap.get(record.date);
      if (daily) {
        daily.totalVoiceTime += record.channelDurationSec || 0;
        daily.activeUsers.add(record.userId);
      }
    });

    return Array.from(dailyMap.values())
      .map((daily) => ({
        date: daily.date,
        totalVoiceTime: Math.round(daily.totalVoiceTime),
        activeUsers: daily.activeUsers.size,
        avgMicUsage:
          daily.totalVoiceTime > 0
            ? Math.round((daily.totalMicOnTime / daily.totalVoiceTime) * 100 * 10) / 10
            : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async createEmptyResponse(
    guildId: string,
    startDate: string,
    endDate: string,
  ): Promise<VoiceActivityData> {
    const guildName = await this.discordGateway.getGuildName(guildId);

    return {
      guildId,
      guildName,
      timeRange: { start: startDate, end: endDate },
      totalStats: {
        totalUsers: 0,
        totalVoiceTime: 0,
        totalMicOnTime: 0,
        avgDailyActiveUsers: 0,
      },
      userActivities: [],
      channelStats: [],
      dailyTrends: [],
    };
  }

  async getDailySummary(guildId: string, days: number): Promise<DailyTrendItem[]> {
    const { start, end } = VoiceAnalyticsService.getDateRange(days);
    const data = await this.collectVoiceActivityData(guildId, start, end);

    return data.dailyTrends.map((trend) => ({
      date: trend.date,
      totalSec: trend.totalVoiceTime,
      activeUsers: trend.activeUsers,
    }));
  }

  async getHealthScore(
    guildId: string,
    days: number,
  ): Promise<{
    score: number;
    prevScore: number;
    delta: number;
    totalStats: VoiceActivityData['totalStats'];
    dailyTrends: VoiceActivityData['dailyTrends'];
  }> {
    const currentRange = VoiceAnalyticsService.getDateRange(days);
    const prevRange = VoiceAnalyticsService.getPrevDateRange(days);

    const [currentData, prevData] = await Promise.all([
      this.collectVoiceActivityData(guildId, currentRange.start, currentRange.end),
      this.collectVoiceActivityData(guildId, prevRange.start, prevRange.end),
    ]);

    const score = this.calculateHealthScore(currentData.totalStats, days);
    const prevScore = this.calculateHealthScore(prevData.totalStats, days);
    const delta = score - prevScore;

    return {
      score,
      prevScore,
      delta,
      totalStats: currentData.totalStats,
      dailyTrends: currentData.dailyTrends,
    };
  }

  /** 지정 기간의 raw VoiceDaily 레코드를 직접 조회한다. */
  private async fetchRawRecords(
    guildId: string,
    start: string,
    end: string,
  ): Promise<VoiceDailyOrm[]> {
    return this.voiceDailyRepo.find({
      where: { guildId, date: Between(start, end) },
      order: { date: 'ASC' },
    });
  }

  async getLeaderboard(
    guildId: string,
    options: { days: number; page: number; limit: number },
  ): Promise<{ users: LeaderboardUser[]; total: number }> {
    const { days, page, limit } = options;
    const { start, end } = VoiceAnalyticsService.getDateRange(days);
    const records = await this.fetchRawRecords(guildId, start, end);

    const globalMap = new Map<string, { micOnSec: number; activeDays: Set<string> }>();
    const channelMap = new Map<
      string,
      { totalSec: number; userName: string | null; activeDays: Set<string> }
    >();

    for (const r of records) {
      if (r.channelId === 'GLOBAL') {
        const existing = globalMap.get(r.userId) ?? { micOnSec: 0, activeDays: new Set<string>() };
        existing.micOnSec += r.micOnSec;
        existing.activeDays.add(r.date);
        globalMap.set(r.userId, existing);
      } else {
        const existing = channelMap.get(r.userId) ?? {
          totalSec: 0,
          userName: null,
          activeDays: new Set<string>(),
        };
        existing.totalSec += r.channelDurationSec;
        existing.activeDays.add(r.date);
        if (r.userName) existing.userName = r.userName;
        channelMap.set(r.userId, existing);
      }
    }

    const userIds = new Set([...globalMap.keys(), ...channelMap.keys()]);
    const allUsers: LeaderboardUser[] = [];
    for (const userId of userIds) {
      const ch = channelMap.get(userId);
      const gl = globalMap.get(userId);
      const activeDays = new Set([...(gl?.activeDays ?? []), ...(ch?.activeDays ?? [])]);
      allUsers.push({
        rank: 0,
        userId,
        nickName: ch?.userName ?? `User-${userId.slice(0, 6)}`,
        avatarUrl: null,
        totalSec: ch?.totalSec ?? 0,
        micOnSec: gl?.micOnSec ?? 0,
        activeDays: activeDays.size,
      });
    }

    allUsers.sort((a, b) => b.totalSec - a.totalSec);
    const total = allUsers.length;
    const offset = (page - 1) * limit;
    const paged = allUsers.slice(offset, offset + limit);
    paged.forEach((user, index) => {
      user.rank = offset + index + 1;
    });

    return { users: paged, total };
  }

  async getChannelStats(guildId: string, days: number): Promise<ChannelStatItem[]> {
    const { start, end } = VoiceAnalyticsService.getDateRange(days);
    const records = await this.fetchRawRecords(guildId, start, end);

    const chMap = new Map<
      string,
      {
        channelName: string;
        categoryId: string | null;
        categoryName: string | null;
        totalSec: number;
        uniqueUsers: Set<string>;
      }
    >();

    for (const r of records) {
      if (r.channelId === 'GLOBAL') continue;

      const existing = chMap.get(r.channelId) ?? {
        channelName: r.channelName ?? `Channel-${r.channelId.slice(0, 6)}`,
        categoryId: r.categoryId ?? null,
        categoryName: r.categoryName ?? null,
        totalSec: 0,
        uniqueUsers: new Set<string>(),
      };
      existing.totalSec += r.channelDurationSec;
      existing.uniqueUsers.add(r.userId);
      if (r.channelName) existing.channelName = r.channelName;
      if (r.categoryId) existing.categoryId = r.categoryId;
      if (r.categoryName) existing.categoryName = r.categoryName;
      chMap.set(r.channelId, existing);
    }

    return Array.from(chMap.entries())
      .map(([channelId, ch]) => ({
        channelId,
        channelName: ch.channelName,
        categoryId: ch.categoryId,
        categoryName: ch.categoryName,
        totalSec: ch.totalSec,
        uniqueUsers: ch.uniqueUsers.size,
      }))
      .sort((a, b) => b.totalSec - a.totalSec);
  }

  private calculateHealthScore(totalStats: VoiceActivityData['totalStats'], days: number): number {
    const activeUserScore = totalStats.avgDailyActiveUsers * 10;
    const voiceTimeScore = (totalStats.totalVoiceTime / 3600 / days) * 5;
    return Math.min(100, Math.round(activeUserScore + voiceTimeScore));
  }

  static getDateRange(days: number): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };

    return {
      start: formatDate(start),
      end: formatDate(end),
    };
  }

  /** 현재 기간 이전 동일 기간의 날짜 범위를 반환한다. */
  static getPrevDateRange(days: number): { start: string; end: string } {
    const end = new Date();
    end.setDate(end.getDate() - days);
    const start = new Date(end);
    start.setDate(start.getDate() - days);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };

    return {
      start: formatDate(start),
      end: formatDate(end),
    };
  }
}
