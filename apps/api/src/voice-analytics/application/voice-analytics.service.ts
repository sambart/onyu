import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ChannelStatItem, DailyTrendItem, LeaderboardUser } from '@onyu/shared';
import type { VoiceActivityData } from '@onyu/shared';
import { Between, Not, Repository } from 'typeorm';

import { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { getErrorStack } from '../../common/util/error.util';
import { DiscordGateway } from '../../gateway/discord.gateway';
import { GuildMemberService } from '../../guild-member/application/guild-member.service';
import { UserAggregateData, VoiceNameEnricherService } from './voice-name-enricher.service';

export type { VoiceActivityData } from '@onyu/shared';

type ChannelType = 'permanent' | 'auto_select' | 'auto_instant';

interface ChannelAggregate {
  channelId: string;
  channelName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  totalVoiceTime: number;
  uniqueUsers: Set<string>;
  sessionCount: number;
  channelType: ChannelType;
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}

/** getChannelStats 내부 집계용 Map 값 타입 */
interface ChannelStatAggregate {
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  totalSec: number;
  uniqueUsers: Set<string>;
  channelType: ChannelType;
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
  autoChannelButtonId: number | null;
  autoChannelButtonLabel: string | null;
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
    private guildMemberService: GuildMemberService,
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
          categoryId: record.categoryId ?? null,
          categoryName: record.categoryName ?? null,
          totalVoiceTime: 0,
          uniqueUsers: new Set<string>(),
          sessionCount: 0,
          channelType: record.channelType ?? 'permanent',
          autoChannelConfigId: record.autoChannelConfigId ?? null,
          autoChannelConfigName: record.autoChannelConfigName ?? null,
        });
      }

      const channel = channelMap.get(record.channelId);
      if (channel) {
        channel.totalVoiceTime += record.channelDurationSec || 0;
        channel.uniqueUsers.add(record.userId);
        channel.sessionCount++;
        if (record.channelType && record.channelType !== 'permanent') {
          channel.channelType = record.channelType;
        }
        if (record.autoChannelConfigId) channel.autoChannelConfigId = record.autoChannelConfigId;
        if (record.autoChannelConfigName) {
          channel.autoChannelConfigName = record.autoChannelConfigName;
        }
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

    const score = this.calculateHealthScore(currentData.totalStats, currentData.dailyTrends, days);
    const prevScore = this.calculateHealthScore(prevData.totalStats, prevData.dailyTrends, days);
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

    const pagedUserIds = paged.map((u) => u.userId);
    const memberMap = await this.guildMemberService.findByUserIds(guildId, pagedUserIds);
    for (const user of paged) {
      const member = memberMap.get(user.userId);
      if (member) {
        user.avatarUrl = member.avatarUrl ?? null;
      }
    }

    return { users: paged, total };
  }

  async getChannelStats(
    guildId: string,
    days: number,
    options?: { groupAutoChannels?: boolean },
  ): Promise<ChannelStatItem[]> {
    const { start, end } = VoiceAnalyticsService.getDateRange(days);
    const records = await this.fetchRawRecords(guildId, start, end);

    const chMap = new Map<string, ChannelStatAggregate>();

    for (const r of records) {
      if (r.channelId === 'GLOBAL') continue;

      const existing = chMap.get(r.channelId) ?? {
        channelName: r.channelName ?? `Channel-${r.channelId.slice(0, 6)}`,
        categoryId: r.categoryId ?? null,
        categoryName: r.categoryName ?? null,
        totalSec: 0,
        uniqueUsers: new Set<string>(),
        channelType: r.channelType ?? 'permanent',
        autoChannelConfigId: r.autoChannelConfigId ?? null,
        autoChannelConfigName: r.autoChannelConfigName ?? null,
        autoChannelButtonId: r.autoChannelButtonId ?? null,
        autoChannelButtonLabel: r.autoChannelButtonLabel ?? null,
      };
      existing.totalSec += r.channelDurationSec;
      existing.uniqueUsers.add(r.userId);
      if (r.channelName) existing.channelName = r.channelName;
      if (r.categoryId) existing.categoryId = r.categoryId;
      if (r.categoryName) existing.categoryName = r.categoryName;
      if (r.channelType && r.channelType !== 'permanent') existing.channelType = r.channelType;
      if (r.autoChannelConfigId) existing.autoChannelConfigId = r.autoChannelConfigId;
      if (r.autoChannelConfigName) existing.autoChannelConfigName = r.autoChannelConfigName;
      if (r.autoChannelButtonId) existing.autoChannelButtonId = r.autoChannelButtonId;
      if (r.autoChannelButtonLabel) existing.autoChannelButtonLabel = r.autoChannelButtonLabel;
      chMap.set(r.channelId, existing);
    }

    if (options?.groupAutoChannels) {
      return this.groupByAutoChannelConfig(chMap);
    }

    return Array.from(chMap.entries())
      .map(([channelId, ch]) => ({
        channelId,
        channelName: ch.channelName,
        categoryId: ch.categoryId,
        categoryName: ch.categoryName,
        totalSec: ch.totalSec,
        uniqueUsers: ch.uniqueUsers.size,
        channelType: ch.channelType,
        autoChannelConfigId: ch.autoChannelConfigId,
        autoChannelConfigName: ch.autoChannelConfigName,
        autoChannelButtonId: ch.autoChannelButtonId,
        autoChannelButtonLabel: ch.autoChannelButtonLabel,
      }))
      .sort((a, b) => b.totalSec - a.totalSec);
  }

  /**
   * 자동방 채널을 autoChannelConfigId 기준으로 합산한다.
   * 상설 채널은 그대로 유지하고, 같은 configId를 가진 자동방들을 하나의 항목으로 합친다.
   * uniqueUsers는 Set 합집합으로 정확한 중복 제거 값을 반환한다.
   */
  private groupByAutoChannelConfig(chMap: Map<string, ChannelStatAggregate>): ChannelStatItem[] {
    const resultMap = this.buildGroupedResultMap(chMap);

    return Array.from(resultMap.entries())
      .map(([channelId, ch]) => ({
        channelId,
        channelName: ch.channelName,
        categoryId: ch.categoryId,
        categoryName: ch.categoryName,
        channelType: ch.channelType,
        autoChannelConfigId: ch.autoChannelConfigId,
        autoChannelConfigName: ch.autoChannelConfigName,
        autoChannelButtonId: ch.autoChannelButtonId,
        autoChannelButtonLabel: ch.autoChannelButtonLabel,
        totalSec: ch.totalSec,
        uniqueUsers: ch.uniqueUsers.size,
      }))
      .sort((a, b) => b.totalSec - a.totalSec);
  }

  /** configId 기준으로 자동방을 합산한 Map을 생성한다. */
  private buildGroupedResultMap(
    chMap: Map<string, ChannelStatAggregate>,
  ): Map<string, ChannelStatAggregate> {
    const resultMap = new Map<string, ChannelStatAggregate>();

    for (const [channelId, ch] of chMap) {
      if (ch.autoChannelConfigId == null) {
        // 상설 채널: 그대로 유지
        resultMap.set(channelId, { ...ch });
        continue;
      }

      // 자동방: buttonId가 있으면 button 기준, 없으면 configId 기준 그룹핑
      const groupKey =
        ch.autoChannelButtonId != null
          ? `auto:button:${ch.autoChannelButtonId}`
          : `auto:config:${ch.autoChannelConfigId}`;
      const existing = resultMap.get(groupKey);

      if (existing) {
        existing.totalSec += ch.totalSec;
        for (const userId of ch.uniqueUsers) {
          existing.uniqueUsers.add(userId);
        }
        if (ch.autoChannelButtonLabel) existing.autoChannelButtonLabel = ch.autoChannelButtonLabel;
      } else {
        resultMap.set(groupKey, {
          channelName: ch.autoChannelButtonLabel ?? ch.autoChannelConfigName ?? ch.channelName,
          categoryId: ch.categoryId,
          categoryName: ch.categoryName,
          channelType: ch.channelType,
          autoChannelConfigId: ch.autoChannelConfigId,
          autoChannelConfigName: ch.autoChannelConfigName,
          autoChannelButtonId: ch.autoChannelButtonId,
          autoChannelButtonLabel: ch.autoChannelButtonLabel,
          totalSec: ch.totalSec,
          uniqueUsers: new Set(ch.uniqueUsers),
        });
      }
    }

    return resultMap;
  }

  /**
   * 서버 음성 활동 건강도를 0~100으로 산출한다.
   *
   * 각 지표를 로그 커브(value / (value + midpoint))로 0~100 정규화한 뒤 가중 합산.
   * - 일평균 활성 유저 (40%) midpoint=10
   * - 일평균 총 음성 시간 (30%) midpoint=5h
   * - 마이크 사용률 (20%) midpoint=30%
   * - 활동일 비율 (10%) midpoint=50%
   */
  private calculateHealthScore(
    totalStats: VoiceActivityData['totalStats'],
    dailyTrends: VoiceActivityData['dailyTrends'],
    days: number,
  ): number {
    const normalize = (value: number, midpoint: number) =>
      midpoint === 0 ? 0 : (100 * value) / (value + midpoint);

    const avgDailyUsers = totalStats.avgDailyActiveUsers;
    const avgDailyHours = totalStats.totalVoiceTime / 3600 / days;
    const micUsageRate =
      totalStats.totalVoiceTime > 0
        ? (totalStats.totalMicOnTime / totalStats.totalVoiceTime) * 100
        : 0;
    const activeDayRatio = days > 0 ? (dailyTrends.length / days) * 100 : 0;

    const score =
      normalize(avgDailyUsers, 10) * 0.4 +
      normalize(avgDailyHours, 5) * 0.3 +
      normalize(micUsageRate, 30) * 0.2 +
      normalize(activeDayRatio, 50) * 0.1;

    return Math.min(100, Math.round(score));
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
