import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';

import { CoPresenceScheduler } from '../../../channel/voice/co-presence/co-presence.scheduler';
import { getErrorStack } from '../../../common/util/error.util';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { NewbieKeys } from '../../infrastructure/newbie-cache.keys';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { MocoService } from './moco.service';

@Injectable()
export class MocoResetScheduler {
  private readonly logger = new Logger(MocoResetScheduler.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    @Inject(forwardRef(() => MocoService))
    private readonly mocoService: MocoService,
    private readonly coPresenceScheduler: CoPresenceScheduler,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * 매일 자정 KST 실행.
   * 리셋 주기에 해당하는 길드의 Redis 데이터 초기화.
   */
  @Cron('0 0 * * *', { name: 'moco-period-reset', timeZone: 'Asia/Seoul' })
  async runDailyReset(): Promise<void> {
    this.logger.log('[MOCO RESET] Starting daily reset check...');
    try {
      await this.processAllGuilds();
    } catch (err) {
      this.logger.error('[MOCO RESET] Unhandled error during reset check', getErrorStack(err));
    }
  }

  private async processAllGuilds(): Promise<void> {
    const configs = await this.configRepo.findAllMocoEnabled();

    for (const config of configs) {
      if (config.mocoResetPeriod === 'NONE' || !config.mocoResetPeriod) continue;

      try {
        if (this.shouldReset(config)) {
          await this.resetGuild(config);
        }
      } catch (err) {
        this.logger.error(`[MOCO RESET] Failed guild=${config.guildId}`, getErrorStack(err));
      }
    }
  }

  private shouldReset(config: {
    mocoResetPeriod?: string | null;
    mocoCurrentPeriodStart?: string | null;
    mocoResetIntervalDays?: number | null;
  }): boolean {
    const today = this.toDateString();

    if (config.mocoResetPeriod === 'MONTHLY') {
      const day = parseInt(today.slice(6, 8), 10);
      if (day !== 1) return false;
      return config.mocoCurrentPeriodStart !== today;
    }

    if (config.mocoResetPeriod === 'CUSTOM') {
      if (!config.mocoCurrentPeriodStart) return false; // first setup handled elsewhere
      const start = this.parseDate(config.mocoCurrentPeriodStart);
      const now = this.parseDate(today);
      const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
      return diffDays >= (config.mocoResetIntervalDays ?? 30);
    }

    return false;
  }

  private async resetGuild(config: {
    guildId: string;
    mocoResetPeriod?: string | null;
  }): Promise<void> {
    const guildId = config.guildId;
    this.logger.log(`[MOCO RESET] Resetting guild=${guildId} period=${config.mocoResetPeriod}`);

    // 활성 세션을 먼저 종료하여 Redis 데이터 정합성 보장
    await this.coPresenceScheduler.flushGuildSessions(guildId);

    // Delete Redis keys
    await this.deleteAllMocoRedisKeys(guildId);

    // Update period start to today
    const today = this.toDateString();
    await this.configRepo.updateMocoCurrentPeriodStart(guildId, today);

    // Refresh embed to show cleared data
    await this.mocoService
      .sendOrUpdateRankEmbed(guildId, 1)
      .catch((err) =>
        this.logger.warn(`[MOCO RESET] Embed refresh failed guild=${guildId}`, getErrorStack(err)),
      );

    this.logger.log(`[MOCO RESET] Completed guild=${guildId}`);
  }

  private async deleteAllMocoRedisKeys(guildId: string): Promise<void> {
    // 1. Delete rank sorted set
    await this.redis.del(NewbieKeys.mocoRank(guildId));

    // 2. SCAN and delete all hunter-specific keys (total, channel-min, sessions, meta, newbie-sessions)
    const patterns = [
      `newbie:moco:total:${guildId}:*`,
      `newbie:moco:channel-min:${guildId}:*`,
      `newbie:moco:sessions:${guildId}:*`,
      `newbie:moco:meta:${guildId}:*`,
      `newbie:moco:newbie-sessions:${guildId}:*`,
    ];

    for (const pattern of patterns) {
      try {
        await this.scanAndDeleteKeys(pattern);
      } catch (error) {
        this.logger.error(
          `[MOCO RESET] Failed to delete keys for pattern=${pattern} guild=${guildId}`,
          getErrorStack(error),
        );
      }
    }
  }

  private async scanAndDeleteKeys(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  /**
   * Date 객체를 KST 기준 YYYYMMDD 형식 문자열로 변환.
   */
  private toDateString(date: Date = new Date()): string {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private parseDate(yyyymmdd: string): Date {
    const y = parseInt(yyyymmdd.slice(0, 4), 10);
    const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
    const d = parseInt(yyyymmdd.slice(6, 8), 10);
    return new Date(y, m, d);
  }
}
