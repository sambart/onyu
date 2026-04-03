import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { getErrorStack } from '../../../common/util/error.util';
import { MocoHuntingDailyOrmEntity as MocoHuntingDaily } from '../../infrastructure/moco-hunting-daily.orm-entity';
import { MocoHuntingSessionOrmEntity as MocoHuntingSession } from '../../infrastructure/moco-hunting-session.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';

interface HunterAggregateRow {
  hunterId: string;
  totalScore: string;
  totalChannelMinutes: string;
  totalSessionCount: string;
}

@Injectable()
export class MocoBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MocoBootstrapService.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    @InjectRepository(MocoHuntingDaily)
    private readonly dailyRepo: Repository<MocoHuntingDaily>,
    @InjectRepository(MocoHuntingSession)
    private readonly sessionRepo: Repository<MocoHuntingSession>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.recoverAllGuilds();
    } catch (err) {
      this.logger.error('[MOCO BOOTSTRAP] Recovery failed', getErrorStack(err));
    }
  }

  private async recoverAllGuilds(): Promise<void> {
    const configs = await this.configRepo.findAllMocoEnabled();
    let totalRecovered = 0;

    for (const config of configs) {
      const hasRank = await this.newbieRedis.getMocoRankCount(config.guildId);
      if (hasRank > 0) continue; // Redis에 이미 데이터가 있으면 스킵

      const count = await this.recoverGuild(
        config.guildId,
        config.mocoCurrentPeriodStart ?? undefined,
      );
      if (count > 0) {
        totalRecovered += count;
      }
    }

    this.logger.log(
      `[MOCO BOOTSTRAP] Recovery complete. ${configs.length} guild(s) checked, ${totalRecovered} hunter(s) recovered.`,
    );
  }

  private async recoverGuild(guildId: string, fromDate?: string): Promise<number> {
    // 1. Daily 집계에서 score, channelMinutes, sessionCount를 합산
    const qb = this.dailyRepo
      .createQueryBuilder('d')
      .select('d.hunterId', 'hunterId')
      .addSelect('SUM(d.score)', 'totalScore')
      .addSelect('SUM(d.channelMinutes)', 'totalChannelMinutes')
      .addSelect('SUM(d.sessionCount)', 'totalSessionCount')
      .where('d.guildId = :guildId', { guildId })
      .groupBy('d.hunterId')
      .orderBy('"totalScore"', 'DESC');

    if (fromDate) {
      qb.andWhere('d.date >= :fromDate', { fromDate });
    }

    const rows = await qb.getRawMany<HunterAggregateRow>();
    if (rows.length === 0) return 0;

    // 2. 유효 세션에서 사냥꾼별 고유 모코코 ID를 추출
    const uniqueNewbieMap = await this.getUniqueNewbieCountMap(guildId, fromDate);

    for (const row of rows) {
      const score = parseInt(row.totalScore, 10);
      const totalMinutes = parseInt(row.totalChannelMinutes, 10);
      const sessionCount = parseInt(row.totalSessionCount, 10);
      const uniqueNewbieCount = uniqueNewbieMap.get(row.hunterId) ?? 0;

      await this.newbieRedis.setMocoRankScore(guildId, row.hunterId, score);
      await this.newbieRedis.setMocoSessionCount(guildId, row.hunterId, sessionCount);
      await this.newbieRedis.setMocoChannelMinutes(guildId, row.hunterId, totalMinutes);
      await this.newbieRedis.setMocoHunterMeta(guildId, row.hunterId, {
        score,
        sessionCount,
        uniqueNewbieCount,
        totalMinutes,
      });
    }

    this.logger.log(`[MOCO BOOTSTRAP] Recovered guild=${guildId}: ${rows.length} hunter(s)`);
    return rows.length;
  }

  /**
   * MocoHuntingSession의 newbieMemberIds에서 사냥꾼별 고유 모코코 수를 계산한다.
   * 일별 합산이 아닌 실제 고유 ID 기준이므로 중복 카운트가 발생하지 않는다.
   */
  private async getUniqueNewbieCountMap(
    guildId: string,
    fromDate?: string,
  ): Promise<Map<string, number>> {
    const sqb = this.sessionRepo
      .createQueryBuilder('s')
      .select('s.hunterId', 'hunterId')
      .addSelect('s.newbieMemberIds', 'newbieMemberIds')
      .where('s.guildId = :guildId', { guildId })
      .andWhere('s.isValid = true');

    if (fromDate) {
      // fromDate는 YYYYMMDD 형식 → Date로 변환
      const year = parseInt(fromDate.slice(0, 4), 10);
      const month = parseInt(fromDate.slice(4, 6), 10) - 1;
      const day = parseInt(fromDate.slice(6, 8), 10);
      const fromDateObj = new Date(year, month, day);
      sqb.andWhere('s.startedAt >= :fromDateObj', { fromDateObj });
    }

    const sessions = await sqb.getRawMany<{
      hunterId: string;
      newbieMemberIds: string | string[];
    }>();

    // 사냥꾼별 고유 모코코 ID Set 구축
    const hunterNewbieMap = new Map<string, Set<string>>();
    for (const session of sessions) {
      const set = hunterNewbieMap.get(session.hunterId) ?? new Set<string>();
      // newbieMemberIds가 JSON 문자열로 올 수 있으므로 파싱 처리
      const ids =
        typeof session.newbieMemberIds === 'string'
          ? (JSON.parse(session.newbieMemberIds) as string[])
          : session.newbieMemberIds;
      for (const id of ids) {
        set.add(id);
      }
      hunterNewbieMap.set(session.hunterId, set);
    }

    // Set 크기 → 고유 모코코 수
    const result = new Map<string, number>();
    for (const [hunterId, set] of hunterNewbieMap) {
      result.set(hunterId, set.size);
    }
    return result;
  }
}
