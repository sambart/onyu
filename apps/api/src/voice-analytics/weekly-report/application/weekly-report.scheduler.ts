import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { toZonedTime } from 'date-fns-tz';

import { getErrorStack } from '../../../common/util/error.util';
import { WeeklyReportConfigRepository } from '../infrastructure/weekly-report-config.repository';
import { WeeklyReportService } from './weekly-report.service';

@Injectable()
export class WeeklyReportScheduler {
  private readonly logger = new Logger(WeeklyReportScheduler.name);

  constructor(
    private readonly configRepo: WeeklyReportConfigRepository,
    private readonly reportService: WeeklyReportService,
  ) {}

  /** 매시간 정각에 실행하여 해당 길드 타임존 기준으로 발송 조건을 확인한다. */
  @Cron('0 * * * *', { name: 'weekly-report-hourly', timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    this.logger.log('[WEEKLY] Checking weekly report schedule...');

    try {
      const configs = await this.configRepo.findAllEnabled();
      const now = new Date();

      const matchedConfigs = configs.filter((config) => {
        const localNow = toZonedTime(now, config.timezone);
        return localNow.getDay() === config.dayOfWeek && localNow.getHours() === config.hour;
      });

      if (matchedConfigs.length === 0) {
        return;
      }

      this.logger.log(`[WEEKLY] Matched ${matchedConfigs.length} guild(s) for report`);

      const results = await Promise.allSettled(
        matchedConfigs.map((config) => this.reportService.generateAndSendReport(config)),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const guildId = matchedConfigs[index]?.guildId ?? 'unknown';
          this.logger.error(
            `[WEEKLY] Report failed for guild=${guildId}`,
            getErrorStack(result.reason),
          );
        }
      });
    } catch (err) {
      this.logger.error('[WEEKLY] Unhandled error in scheduler', getErrorStack(err));
    }
  }
}
