import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GuildOverviewResponse } from '@onyu/shared';
import { Repository } from 'typeorm';

import { VoiceKeys } from '../../channel/voice/infrastructure/voice-cache.keys';
import { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { DiscordRestService } from '../../discord-rest/discord-rest.service';
import { InactiveMemberRecordOrm } from '../../inactive-member/infrastructure/inactive-member-record.orm-entity';
import { NewbieConfigRepository } from '../../newbie/infrastructure/newbie-config.repository';
import { NewbieMissionRepository } from '../../newbie/infrastructure/newbie-mission.repository';
import { RedisService } from '../../redis/redis.service';

const GLOBAL_CHANNEL_ID = 'GLOBAL';
const WEEKLY_VOICE_DAYS = 7;

@Injectable()
export class OverviewService {
  // eslint-disable-next-line max-params -- NestJS DI로 인해 다수의 의존성 주입이 불가피하다
  constructor(
    private readonly discordRest: DiscordRestService,
    private readonly newbieConfigRepo: NewbieConfigRepository,
    private readonly newbieMissionRepo: NewbieMissionRepository,
    private readonly redis: RedisService,
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    @InjectRepository(InactiveMemberRecordOrm)
    private readonly inactiveRecordRepo: Repository<InactiveMemberRecordOrm>,
  ) {}

  async getOverview(guildId: string): Promise<GuildOverviewResponse> {
    const [
      totalMemberCount,
      todayVoiceTotalSec,
      currentVoiceUserCount,
      inactiveStats,
      missionSummary,
      weeklyVoice,
    ] = await Promise.all([
      this.getTotalMemberCount(guildId),
      this.getTodayVoiceTotalSec(guildId),
      this.getCurrentVoiceUserCount(guildId),
      this.getInactiveStats(guildId),
      this.getMissionSummary(guildId),
      this.getWeeklyVoice(guildId),
    ]);

    return {
      totalMemberCount,
      todayVoiceTotalSec,
      currentVoiceUserCount,
      activeRate: inactiveStats.activeRate,
      inactiveByGrade: inactiveStats.inactiveByGrade,
      missionSummary,
      weeklyVoice,
    };
  }

  private async getTotalMemberCount(guildId: string): Promise<number> {
    const guild = await this.discordRest.fetchGuild(guildId);
    return guild?.approximate_member_count ?? 0;
  }

  private async getTodayVoiceTotalSec(guildId: string): Promise<number> {
    const today = this.getTodayDateString();
    const result = await this.voiceDailyRepo
      .createQueryBuilder('v')
      .select('COALESCE(SUM(v."channelDurationSec"), 0)', 'totalSec')
      .where('v.guildId = :guildId', { guildId })
      .andWhere('v.date = :today', { today })
      .andWhere('v.channelId != :globalId', { globalId: GLOBAL_CHANNEL_ID })
      .getRawOne<{ totalSec: string }>();
    return parseInt(result?.totalSec ?? '0', 10);
  }

  private async getCurrentVoiceUserCount(guildId: string): Promise<number> {
    // Bot이 60초마다 voice:user-count:{guildId} 키에 push한 값을 조회한다 (TTL 120초)
    const count = await this.redis.get<number>(VoiceKeys.userCount(guildId));
    return count ?? 0;
  }

  private async getInactiveStats(guildId: string): Promise<{
    activeRate: number;
    inactiveByGrade: { fullyInactive: number; lowActive: number; declining: number };
  }> {
    const raw = await this.inactiveRecordRepo
      .createQueryBuilder('r')
      .select('r.grade', 'grade')
      .addSelect('COUNT(*)', 'count')
      .where('r.guildId = :guildId', { guildId })
      .groupBy('r.grade')
      .getRawMany<{ grade: string | null; count: string }>();

    const gradeMap = new Map(raw.map((r) => [r.grade, parseInt(r.count, 10)]));
    const totalClassified = raw.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    const fullyInactive = gradeMap.get('FULLY_INACTIVE') ?? 0;
    const lowActive = gradeMap.get('LOW_ACTIVE') ?? 0;
    const declining = gradeMap.get('DECLINING') ?? 0;
    // NULL grade는 비활동 분류 이력이 없는 정상 활동 회원을 의미한다
    const activeCount = gradeMap.get(null) ?? 0;

    const activeRate = totalClassified > 0 ? Math.round((activeCount / totalClassified) * 100) : 0;

    return {
      activeRate,
      inactiveByGrade: { fullyInactive, lowActive, declining },
    };
  }

  private async getMissionSummary(guildId: string): Promise<{
    inProgress: number;
    completed: number;
    failed: number;
  } | null> {
    const config = await this.newbieConfigRepo.findByGuildId(guildId);
    if (!config?.missionEnabled) return null;

    const counts = await this.newbieMissionRepo.countByStatusForGuild(guildId);
    return {
      inProgress: counts.IN_PROGRESS,
      completed: counts.COMPLETED,
      failed: counts.FAILED,
    };
  }

  private async getWeeklyVoice(
    guildId: string,
  ): Promise<Array<{ date: string; totalSec: number }>> {
    const dates = this.getRecentDates(WEEKLY_VOICE_DAYS);
    const fromDate = dates[0];
    const toDate = dates[dates.length - 1];

    const raw = await this.voiceDailyRepo
      .createQueryBuilder('v')
      .select('v.date', 'date')
      .addSelect('COALESCE(SUM(v."channelDurationSec"), 0)', 'totalSec')
      .where('v.guildId = :guildId', { guildId })
      .andWhere('v.date >= :fromDate', { fromDate })
      .andWhere('v.date <= :toDate', { toDate })
      .andWhere('v.channelId != :globalId', { globalId: GLOBAL_CHANNEL_ID })
      .groupBy('v.date')
      .orderBy('v.date', 'ASC')
      .getRawMany<{ date: string; totalSec: string }>();

    const dataMap = new Map(raw.map((r) => [r.date, parseInt(r.totalSec, 10)]));

    // 빈 날짜를 0으로 채워 7일 완전 배열 반환
    return dates.map((date) => ({
      date,
      totalSec: dataMap.get(date) ?? 0,
    }));
  }

  /** 오늘 날짜를 YYYYMMDD 형식으로 반환한다 */
  private getTodayDateString(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  /** 최근 N일의 날짜를 YYYYMMDD 배열로 반환한다 (오늘 포함) */
  private getRecentDates(days: number): string[] {
    const result: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      result.push(`${yyyy}${mm}${dd}`);
    }
    return result;
  }
}
