import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { BadgeQueryService } from '../../../voice-analytics/self-diagnosis/application/badge-query.service';
import type { VoiceExcludedChannelType } from '../domain/voice-excluded-channel.types';
import { VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { VoiceDailyFlushService } from './voice-daily-flush-service';
import { VoiceExcludedChannelService } from './voice-excluded-channel.service';

export interface ExcludedChannelEntry {
  name: string;
  type: VoiceExcludedChannelType;
}

export interface MeProfileData {
  rank: number;
  totalUsers: number;
  totalSec: number;
  activeDays: number;
  avgDailySec: number;
  micOnSec: number;
  micOffSec: number;
  micUsageRate: number;
  aloneSec: number;
  dailyChart: DailyChartEntry[];
  peakDayOfWeek: string | null;
  weeklyAvgSec: number;
  badges: string[];
  excludedChannels: ExcludedChannelEntry[];
}

export interface DailyChartEntry {
  date: string; // YYYYMMDD
  durationSec: number;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

@Injectable()
export class MeProfileService {
  private readonly logger = new Logger(MeProfileService.name);

  constructor(
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    private readonly flushService: VoiceDailyFlushService,
    private readonly badgeQueryService: BadgeQueryService,
    private readonly excludedChannelService: VoiceExcludedChannelService,
    private readonly discordRest: DiscordRestService,
  ) {}

  async getProfile(guildId: string, userId: string, days: number): Promise<MeProfileData | null> {
    await this.safeFlush();

    const { start, end } = this.getDateRange(days);

    const rangeArgs = { guildId, userId, start, end };
    const [globalStats, channelRecords, rankInfo, dailyChart, badgeCodes, excludedChannels] =
      await Promise.all([
        this.getGlobalStats(rangeArgs),
        this.getChannelRecords(rangeArgs),
        this.getRankInfo(rangeArgs),
        this.getDailyChart(guildId, userId),
        this.safeFindBadgeCodes(guildId, userId),
        this.safeGetExcludedChannels(guildId),
      ]);

    const totalSec = channelRecords.reduce((sum, r) => sum + r.durationSec, 0);

    if (totalSec === 0 && globalStats.micOnSec === 0 && globalStats.micOffSec === 0) {
      return null;
    }

    const activeDays = globalStats.activeDays;
    const avgDailySec = activeDays > 0 ? Math.round(totalSec / activeDays) : 0;
    const micUsageRate =
      totalSec > 0 ? Math.round((globalStats.micOnSec / totalSec) * 1000) / 10 : 0;

    const { peakDayOfWeek, weeklyAvgSec } = this.calculatePeakDay(dailyChart);

    return {
      rank: rankInfo.rank,
      totalUsers: rankInfo.totalUsers,
      totalSec,
      activeDays,
      avgDailySec,
      micOnSec: globalStats.micOnSec,
      micOffSec: globalStats.micOffSec,
      micUsageRate,
      aloneSec: globalStats.aloneSec,
      dailyChart,
      peakDayOfWeek,
      weeklyAvgSec,
      badges: badgeCodes,
      excludedChannels,
    };
  }

  private async getGlobalStats({
    guildId,
    userId,
    start,
    end,
  }: {
    guildId: string;
    userId: string;
    start: string;
    end: string;
  }): Promise<{ micOnSec: number; micOffSec: number; aloneSec: number; activeDays: number }> {
    const result = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('COALESCE(SUM(vd."micOnSec"), 0)', 'micOn')
      .addSelect('COALESCE(SUM(vd."micOffSec"), 0)', 'micOff')
      .addSelect('COALESCE(SUM(vd."aloneSec"), 0)', 'alone')
      .addSelect('COUNT(DISTINCT vd.date)', 'days')
      .where('vd."guildId" = :guildId', { guildId })
      .andWhere('vd."userId" = :userId', { userId })
      .andWhere('vd."channelId" = :global', { global: 'GLOBAL' })
      .andWhere('vd.date BETWEEN :start AND :end', { start, end })
      .getRawOne<{ micOn: string; micOff: string; alone: string; days: string }>();

    return {
      micOnSec: parseInt(result?.micOn ?? '0', 10),
      micOffSec: parseInt(result?.micOff ?? '0', 10),
      aloneSec: parseInt(result?.alone ?? '0', 10),
      activeDays: parseInt(result?.days ?? '0', 10),
    };
  }

  private async getChannelRecords({
    guildId,
    userId,
    start,
    end,
  }: {
    guildId: string;
    userId: string;
    start: string;
    end: string;
  }): Promise<
    Array<{
      channelId: string;
      channelName: string;
      categoryName: string | null;
      durationSec: number;
    }>
  > {
    const rows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd."channelId"', 'channelId')
      .addSelect('MAX(vd."channelName")', 'channelName')
      .addSelect('MAX(vd."categoryName")', 'categoryName')
      .addSelect('SUM(vd."channelDurationSec")', 'duration')
      .where('vd."guildId" = :guildId', { guildId })
      .andWhere('vd."userId" = :userId', { userId })
      .andWhere('vd."channelId" != :global', { global: 'GLOBAL' })
      .andWhere('vd.date BETWEEN :start AND :end', { start, end })
      .groupBy('vd."channelId"')
      .getRawMany<{
        channelId: string;
        channelName: string;
        categoryName: string | null;
        duration: string;
      }>();

    return rows.map((r) => ({
      channelId: r.channelId,
      channelName: r.channelName || `Channel-${r.channelId.slice(0, 6)}`,
      categoryName: r.categoryName || null,
      durationSec: parseInt(r.duration ?? '0', 10),
    }));
  }

  private async getRankInfo({
    guildId,
    userId,
    start,
    end,
  }: {
    guildId: string;
    userId: string;
    start: string;
    end: string;
  }): Promise<{ rank: number; totalUsers: number }> {
    const rows = await this.voiceDailyRepo.query(
      `
      WITH user_totals AS (
        SELECT "userId", SUM("channelDurationSec") AS total
        FROM voice_daily
        WHERE "guildId" = $1 AND "channelId" != 'GLOBAL'
          AND "date" BETWEEN $2 AND $3
        GROUP BY "userId"
      )
      SELECT
        (SELECT COUNT(*) FROM user_totals WHERE total > COALESCE((SELECT total FROM user_totals WHERE "userId" = $4), 0)) + 1 AS rank,
        (SELECT COUNT(*) FROM user_totals) AS "totalUsers"
      `,
      [guildId, start, end, userId],
    );

    const row = rows[0];
    return {
      rank: parseInt(String(row?.rank ?? '0'), 10),
      totalUsers: parseInt(String(row?.totalUsers ?? '0'), 10),
    };
  }

  private async getDailyChart(guildId: string, userId: string): Promise<DailyChartEntry[]> {
    const { start, end } = this.getDateRange(15);

    const rows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.date', 'date')
      .addSelect('SUM(vd."channelDurationSec")', 'duration')
      .where('vd."guildId" = :guildId', { guildId })
      .andWhere('vd."userId" = :userId', { userId })
      .andWhere('vd."channelId" != :global', { global: 'GLOBAL' })
      .andWhere('vd.date BETWEEN :start AND :end', { start, end })
      .groupBy('vd.date')
      .orderBy('vd.date', 'ASC')
      .getRawMany<{ date: string; duration: string }>();

    const dataMap = new Map(rows.map((r) => [r.date, parseInt(r.duration ?? '0', 10)]));

    const result: DailyChartEntry[] = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - 14);
    for (let i = 0; i < 15; i++) {
      const dateStr = this.formatDate(cursor);
      result.push({ date: dateStr, durationSec: dataMap.get(dateStr) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  private calculatePeakDay(dailyChart: DailyChartEntry[]): {
    peakDayOfWeek: string | null;
    weeklyAvgSec: number;
  } {
    const totalSec = dailyChart.reduce((sum, d) => sum + d.durationSec, 0);
    const weeks = 15 / 7;
    const weeklyAvgSec = Math.round(totalSec / weeks);

    const dayOfWeekTotals = new Array<number>(7).fill(0);
    for (const entry of dailyChart) {
      if (entry.durationSec > 0) {
        const date = this.parseDate(entry.date);
        dayOfWeekTotals[date.getDay()] += entry.durationSec;
      }
    }

    const maxIdx = dayOfWeekTotals.indexOf(Math.max(...dayOfWeekTotals));
    const peakDayOfWeek = dayOfWeekTotals[maxIdx] > 0 ? DAY_NAMES[maxIdx] : null;

    return { peakDayOfWeek, weeklyAvgSec };
  }

  private parseDate(yyyymmdd: string): Date {
    const y = parseInt(yyyymmdd.slice(0, 4), 10);
    const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
    const d = parseInt(yyyymmdd.slice(6, 8), 10);
    return new Date(y, m, d);
  }

  private getDateRange(days: number): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start: this.formatDate(start), end: this.formatDate(end) };
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private async safeFlush(): Promise<void> {
    try {
      await this.flushService.safeFlushAll();
    } catch {
      this.logger.warn('Flush skipped (already in progress or failed)');
    }
  }

  private async safeFindBadgeCodes(guildId: string, userId: string): Promise<string[]> {
    try {
      return await this.badgeQueryService.findBadgeCodes(guildId, userId);
    } catch {
      this.logger.warn('Failed to fetch badge codes, using empty array');
      return [];
    }
  }

  private async safeGetExcludedChannels(guildId: string): Promise<ExcludedChannelEntry[]> {
    try {
      const items = await this.excludedChannelService.getExcludedChannels(guildId);
      if (items.length === 0) return [];

      const channels = await this.discordRest.fetchGuildChannels(guildId);
      const channelMap = new Map(
        channels.map((ch) => [ch.id, 'name' in ch ? (ch.name ?? null) : null]),
      );

      return items.map((item) => ({
        name: channelMap.get(item.discordChannelId) ?? `채널-${item.discordChannelId.slice(0, 6)}`,
        type: item.type,
      }));
    } catch {
      this.logger.warn('Failed to fetch excluded channels, using empty array');
      return [];
    }
  }
}
