import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { getKSTDateString } from '@onyu/shared';

import { getErrorStack } from '../../../common/util/error.util';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbiePeriodRepository } from '../../infrastructure/newbie-period.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import { NewbieRoleDiscordAdapter } from './newbie-role-discord.adapter';

/** 24시간 인터벌 (ms) */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class NewbieRoleScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NewbieRoleScheduler.name);
  private initialTimer: NodeJS.Timeout | null = null;
  private dailyInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly discordAdapter: NewbieRoleDiscordAdapter,
    private readonly periodRepository: NewbiePeriodRepository,
    private readonly redisRepository: NewbieRedisRepository,
    private readonly configRepository: NewbieConfigRepository,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduleNextMidnight();
  }

  onApplicationShutdown(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.dailyInterval) {
      clearInterval(this.dailyInterval);
      this.dailyInterval = null;
    }
  }

  private scheduleNextMidnight(): void {
    const msUntilMidnight = this.getMsUntilNextKSTMidnight();

    this.logger.log(
      `[NEWBIE ROLE SCHEDULER] Next run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`,
    );

    this.initialTimer = setTimeout(() => {
      void this.processExpired();

      this.dailyInterval = setInterval(() => {
        void this.processExpired();
      }, ONE_DAY_MS);
    }, msUntilMidnight);
  }

  private getMsUntilNextKSTMidnight(): number {
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const nowKst = nowUtc + KST_OFFSET_MS;

    const todayKstMidnightUtc = Math.floor(nowKst / ONE_DAY_MS) * ONE_DAY_MS - KST_OFFSET_MS;
    const nextKstMidnightUtc = todayKstMidnightUtc + ONE_DAY_MS;

    return nextKstMidnightUtc - nowUtc;
  }

  async processExpired(): Promise<void> {
    const configCache = new Map<string, string | null>();
    const today = getKSTDateString();
    this.logger.log(`[NEWBIE ROLE SCHEDULER] processExpired start: today=${today}`);

    let expiredRecords;
    try {
      expiredRecords = await this.periodRepository.findExpired(today);
    } catch (error) {
      this.logger.error(
        '[NEWBIE ROLE SCHEDULER] Failed to query expired periods',
        getErrorStack(error),
      );
      return;
    }

    if (expiredRecords.length === 0) {
      this.logger.log('[NEWBIE ROLE SCHEDULER] No expired periods found.');
      return;
    }

    this.logger.log(
      `[NEWBIE ROLE SCHEDULER] Processing ${expiredRecords.length} expired period(s)`,
    );

    const affectedGuilds = new Set<string>();

    for (const period of expiredRecords) {
      await this.processOne(period.guildId, period.memberId, period.id, configCache);
      affectedGuilds.add(period.guildId);
    }

    for (const guildId of affectedGuilds) {
      try {
        await this.redisRepository.deletePeriodActive(guildId);
        this.logger.log(`[NEWBIE ROLE SCHEDULER] Cache invalidated: guild=${guildId}`);
      } catch (error) {
        this.logger.error(
          `[NEWBIE ROLE SCHEDULER] Failed to invalidate cache: guild=${guildId}`,
          getErrorStack(error),
        );
      }
    }

    this.logger.log('[NEWBIE ROLE SCHEDULER] processExpired complete.');
  }

  private async processOne(
    guildId: string,
    memberId: string,
    periodId: number,
    configCache: Map<string, string | null>,
  ): Promise<void> {
    const roleId = await this.getNewbieRoleId(guildId, configCache);
    if (roleId) {
      await this.discordAdapter.tryRemoveRole(guildId, memberId, roleId);
    }

    try {
      await this.periodRepository.markExpired(periodId);
    } catch (error) {
      this.logger.error(
        `[NEWBIE ROLE SCHEDULER] Failed to mark expired: periodId=${periodId}`,
        getErrorStack(error),
      );
    }
  }

  private async getNewbieRoleId(
    guildId: string,
    configCache: Map<string, string | null>,
  ): Promise<string | null> {
    if (configCache.has(guildId)) {
      return configCache.get(guildId) ?? null;
    }
    const config = await this.configRepository.findByGuildId(guildId);
    const roleId = config?.newbieRoleId ?? null;
    configCache.set(guildId, roleId);
    return roleId;
  }
}
