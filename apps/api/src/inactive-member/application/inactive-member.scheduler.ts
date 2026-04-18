import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getKSTDateString } from '@onyu/shared';

import { getErrorStack } from '../../common/util/error.util';
import { InactiveMemberGrade } from '../domain/inactive-member.types';
import type { InactiveMemberRecord } from '../domain/inactive-member-record.entity';
import type { TrendSnapshotCounts } from '../infrastructure/inactive-member.repository';
import { InactiveMemberRepository } from '../infrastructure/inactive-member.repository';
import { InactiveMemberService } from './inactive-member.service';
import { InactiveMemberActionService } from './inactive-member-action.service';

@Injectable()
export class InactiveMemberScheduler {
  private readonly logger = new Logger(InactiveMemberScheduler.name);

  constructor(
    private readonly inactiveMemberService: InactiveMemberService,
    private readonly actionService: InactiveMemberActionService,
    private readonly repo: InactiveMemberRepository,
  ) {}

  @Cron('0 0 * * *', {
    name: 'inactive-member-classify',
    timeZone: 'Asia/Seoul',
  })
  async runDailyClassify(): Promise<void> {
    this.logger.log('[INACTIVE] Starting daily classify...');
    try {
      await this.processAllGuilds();
    } catch (err) {
      this.logger.error('[INACTIVE] Unhandled error during daily classify', getErrorStack(err));
    }
  }

  @Cron('30 19 * * *', {
    name: 'inactive-trend-retention',
    timeZone: 'Asia/Seoul',
  })
  async purgeTrendData(): Promise<void> {
    const retentionDays = 90;
    try {
      const deleted = await this.repo.deleteTrendBefore(retentionDays);
      this.logger.log(
        `[INACTIVE] Trend retention: deleted ${deleted.toString()} records older than ${retentionDays.toString()} days`,
      );
    } catch (err) {
      this.logger.error('[INACTIVE] Trend retention failed', getErrorStack(err));
    }
  }

  private async processAllGuilds(): Promise<void> {
    // Gateway 캐시 대신 DB에서 설정된 길드 목록 조회
    const guildIds = await this.repo.findAllConfiguredGuildIds();

    for (const guildId of guildIds) {
      try {
        const records = await this.inactiveMemberService.classifyGuild(guildId);

        const counts = this.aggregateGradeCounts(records);
        await this.repo.saveTrendSnapshot(guildId, this.getTodayDateString(), counts);

        const config = await this.inactiveMemberService.getOrCreateConfig(guildId);

        if (config.autoActionEnabled) {
          const newlyFullyInactiveIds = records
            .filter((r) => r.grade === InactiveMemberGrade.FULLY_INACTIVE)
            .map((r) => r.userId);

          await this.actionService.executeAutoActions(guildId, newlyFullyInactiveIds);
        }
      } catch (err) {
        this.logger.error(`[INACTIVE] Failed guild=${guildId}`, getErrorStack(err));
      }
    }
  }

  private aggregateGradeCounts(records: InactiveMemberRecord[]): TrendSnapshotCounts {
    let fullyInactiveCount = 0;
    let lowActiveCount = 0;
    let decliningCount = 0;

    for (const r of records) {
      if (r.grade === InactiveMemberGrade.FULLY_INACTIVE) fullyInactiveCount++;
      else if (r.grade === InactiveMemberGrade.LOW_ACTIVE) lowActiveCount++;
      else if (r.grade === InactiveMemberGrade.DECLINING) decliningCount++;
    }

    return {
      fullyInactiveCount,
      lowActiveCount,
      decliningCount,
      totalClassified: records.length,
    };
  }

  private getTodayDateString(): string {
    const s = getKSTDateString();
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
}
