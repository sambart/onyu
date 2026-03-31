import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { CoPresenceDbRepository } from './co-presence-db.repository';

@Injectable()
export class CoPresenceCleanupScheduler {
  private readonly logger = new Logger(CoPresenceCleanupScheduler.name);

  constructor(private readonly dbRepo: CoPresenceDbRepository) {}

  /** 매일 자정 KST 실행 (UTC 15:00) */
  @Cron('0 0 15 * * *', { name: 'co-presence-cleanup' })
  async cleanup(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      const deleted = await this.dbRepo.deleteExpiredSessions(cutoff);
      this.logger.log(`[CO-PRESENCE CLEANUP] Deleted ${deleted} expired sessions`);
    } catch (error) {
      this.logger.error(
        '[CO-PRESENCE CLEANUP] Failed to delete expired sessions',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
