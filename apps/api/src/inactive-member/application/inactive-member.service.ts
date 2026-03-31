import { Injectable, Logger } from '@nestjs/common';
import { getKSTDateString } from '@onyu/shared';
import type { APIGuildMember } from 'discord.js';

import { VoiceDailyFlushService } from '../../channel/voice/application/voice-daily-flush-service';
import { InactiveMemberRecord } from '../domain/inactive-member-record.entity';
import {
  InactiveMemberRepository,
  type UpsertRecordData,
} from '../infrastructure/inactive-member.repository';
import { InactiveMemberConfigOrm } from '../infrastructure/inactive-member-config.orm-entity';
import { InactiveMemberDiscordAdapter } from '../infrastructure/inactive-member-discord.adapter';
import {
  InactiveMemberQueryRepository,
  type TrendEntry,
} from '../infrastructure/inactive-member-query.repository';

const SEC_PER_MIN = 60;

export interface InactiveStats {
  totalMembers: number;
  activeCount: number;
  fullyInactiveCount: number;
  lowActiveCount: number;
  decliningCount: number;
  returnedCount: number;
  trend: TrendEntry[];
}

@Injectable()
export class InactiveMemberService {
  private readonly logger = new Logger(InactiveMemberService.name);

  constructor(
    private readonly repo: InactiveMemberRepository,
    private readonly queryRepo: InactiveMemberQueryRepository,
    private readonly flushService: VoiceDailyFlushService,
    private readonly discordAdapter: InactiveMemberDiscordAdapter,
  ) {}

  async getOrCreateConfig(guildId: string): Promise<InactiveMemberConfigOrm> {
    const config = await this.repo.findConfigByGuildId(guildId);
    return config ?? this.repo.createDefaultConfig(guildId);
  }

  async classifyGuild(guildId: string): Promise<InactiveMemberRecord[]> {
    try {
      await this.flushService.safeFlushAll();
    } catch {
      this.logger.warn('[INACTIVE] Flush skipped (already in progress or failed)');
    }

    const config = await this.getOrCreateConfig(guildId);

    const { fromDate, toDate, prevFromDate, prevToDate } = this.buildDateRanges(config.periodDays);

    const members = await this.discordAdapter.fetchGuildMembers(guildId);
    if (!members) {
      this.logger.warn(`[INACTIVE] Guild members not available: ${guildId}`);
      return [];
    }

    const targetMembers = members.filter(
      (m: APIGuildMember) =>
        !m.user?.bot && !config.excludedRoleIds.some((roleId) => m.roles.includes(roleId)),
    );

    const [currentMap, prevMap, lastVoiceDateMap] = await Promise.all([
      this.queryRepo.sumVoiceDurationByUser(guildId, fromDate, toDate),
      this.queryRepo.sumVoiceDurationByUser(guildId, prevFromDate, prevToDate),
      this.queryRepo.findLastVoiceDateByUser(guildId, prevFromDate),
    ]);

    const domainRecords: InactiveMemberRecord[] = [];
    const upsertData: UpsertRecordData[] = [];

    for (const member of targetMembers) {
      const userId = member.user!.id;
      const totalSec = currentMap.get(userId) ?? 0;
      const totalMinutes = Math.floor(totalSec / SEC_PER_MIN);
      const prevTotalSec = prevMap.get(userId) ?? 0;
      const prevTotalMinutes = Math.floor(prevTotalSec / SEC_PER_MIN);
      const lastVoiceDate = lastVoiceDateMap.get(userId) ?? null;

      const record = InactiveMemberRecord.create(guildId, userId);
      record.classify(totalMinutes, prevTotalMinutes, lastVoiceDate, {
        lowActiveThresholdMin: config.lowActiveThresholdMin,
        decliningPercent: config.decliningPercent,
      });

      domainRecords.push(record);
      upsertData.push({
        guildId,
        userId,
        grade: record.grade,
        totalMinutes: record.totalMinutes,
        prevTotalMinutes: record.prevTotalMinutes,
        lastVoiceDate: record.lastVoiceDate,
        classifiedAt: record.classifiedAt,
      });
    }

    await this.repo.batchUpsertRecords(upsertData);

    this.logger.log(`[INACTIVE] Classified guild=${guildId} members=${domainRecords.length}`);

    return domainRecords;
  }

  async getStats(guildId: string): Promise<InactiveStats> {
    const [gradeStats, returnedCount, trend] = await Promise.all([
      this.queryRepo.countByGrade(guildId),
      this.queryRepo.findReturnedCount(guildId),
      this.queryRepo.findTrend(guildId),
    ]);

    const inactiveTotal =
      gradeStats.fullyInactiveCount + gradeStats.lowActiveCount + gradeStats.decliningCount;

    const totalMembers = gradeStats.totalClassified;

    return {
      totalMembers,
      activeCount: totalMembers - inactiveTotal,
      fullyInactiveCount: gradeStats.fullyInactiveCount,
      lowActiveCount: gradeStats.lowActiveCount,
      decliningCount: gradeStats.decliningCount,
      returnedCount,
      trend,
    };
  }

  private buildDateRanges(periodDays: number): {
    fromDate: string;
    toDate: string;
    prevFromDate: string;
    prevToDate: string;
  } {
    const toDate = getKSTDateString();

    const toDateObj = this.parseYyyymmdd(toDate);
    const fromDateObj = new Date(toDateObj);
    fromDateObj.setDate(fromDateObj.getDate() - periodDays + 1);
    const fromDate = this.formatYyyymmdd(fromDateObj);

    const prevToDateObj = new Date(fromDateObj);
    prevToDateObj.setDate(prevToDateObj.getDate() - 1);
    const prevToDate = this.formatYyyymmdd(prevToDateObj);

    const prevFromDateObj = new Date(prevToDateObj);
    prevFromDateObj.setDate(prevFromDateObj.getDate() - periodDays + 1);
    const prevFromDate = this.formatYyyymmdd(prevFromDateObj);

    return { fromDate, toDate, prevFromDate, prevToDate };
  }

  private formatYyyymmdd(date: Date): string {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  }

  private parseYyyymmdd(dateStr: string): Date {
    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10) - 1;
    const day = parseInt(dateStr.slice(6, 8), 10);
    return new Date(year, month, day);
  }
}
