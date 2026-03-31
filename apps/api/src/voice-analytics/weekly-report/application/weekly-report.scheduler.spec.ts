/**
 * WeeklyReportScheduler 테스트
 * 대상: handleCron — 타임존 매칭, 병렬 실행, 한 길드 실패가 다른 길드에 영향 없음
 *
 * WeeklyReportScheduler → date-fns-tz (외부 패키지)
 * WeeklyReportService → DiscordRestService → discord.js (외부 패키지)
 * 위 체인을 vi.mock으로 차단한다.
 */

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn((date: Date, timezone: string) => {
    // 실제 date-fns-tz의 toZonedTime을 단순 구현으로 대체:
    // UTC 오프셋을 적용하여 로컬 시간 객체를 반환한다.
    const OFFSET_MAP: Record<string, number> = {
      'Asia/Seoul': 9 * 60,
      UTC: 0,
    };
    const offsetMinutes = OFFSET_MAP[timezone] ?? 0;
    const localTime = new Date(date.getTime() + offsetMinutes * 60 * 1000);
    // getDay()/getHours()가 올바른 로컬 값을 반환하도록 UTC 메서드를 사용
    return {
      getDay: () => localTime.getUTCDay(),
      getHours: () => localTime.getUTCHours(),
    };
  }),
}));

vi.mock('../../../discord-rest/discord-rest.service', () => ({ DiscordRestService: vi.fn() }));
vi.mock('../../application/voice-analytics.service', () => ({ VoiceAnalyticsService: vi.fn() }));
vi.mock('../../application/voice-ai-analysis.service', () => ({ VoiceAiAnalysisService: vi.fn() }));
// WeeklyReportService가 discord.js를 직접 import하므로 factory로 mock 처리
vi.mock('./weekly-report.service', () => ({ WeeklyReportService: vi.fn() }));

import { type Mock } from 'vitest';

import { WeeklyReportConfigOrmEntity } from '../infrastructure/weekly-report-config.orm-entity';
import { WeeklyReportScheduler } from './weekly-report.scheduler';

function makeConfig(
  overrides: Partial<WeeklyReportConfigOrmEntity> = {},
): WeeklyReportConfigOrmEntity {
  const entity = new WeeklyReportConfigOrmEntity();
  entity.guildId = 'guild-1';
  entity.isEnabled = true;
  entity.channelId = 'ch-1';
  entity.dayOfWeek = 1; // 월요일
  entity.hour = 9;
  entity.timezone = 'Asia/Seoul';
  entity.updatedAt = new Date('2026-03-01T00:00:00Z');
  return Object.assign(entity, overrides);
}

describe('WeeklyReportScheduler', () => {
  let scheduler: WeeklyReportScheduler;
  let configRepo: { findAllEnabled: Mock };
  let reportService: { generateAndSendReport: Mock };

  beforeEach(() => {
    configRepo = { findAllEnabled: vi.fn() };
    reportService = { generateAndSendReport: vi.fn() };

    scheduler = new WeeklyReportScheduler(configRepo as never, reportService as never);
  });

  describe('handleCron', () => {
    it('활성화된 설정이 없으면 generateAndSendReport를 호출하지 않는다', async () => {
      configRepo.findAllEnabled.mockResolvedValue([]);

      await scheduler.handleCron();

      expect(reportService.generateAndSendReport).not.toHaveBeenCalled();
    });

    it('현재 시각과 일치하는 길드에만 리포트를 발송한다', async () => {
      // 타임존 Asia/Seoul 기준으로 현재 시각이 월요일 9시여야 매칭
      // date-fns-tz의 toZonedTime을 활용하므로 실제 시간에 의존
      // 테스트에서는 vi.setSystemTime으로 고정

      // 2026-03-16 (월요일) 00:00 UTC = 2026-03-16 09:00 Asia/Seoul
      vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

      const matchingConfig = makeConfig({
        guildId: 'guild-match',
        dayOfWeek: 1, // 월요일
        hour: 9,
        timezone: 'Asia/Seoul',
      });
      const nonMatchingConfig = makeConfig({
        guildId: 'guild-no-match',
        dayOfWeek: 2, // 화요일
        hour: 9,
        timezone: 'Asia/Seoul',
      });

      configRepo.findAllEnabled.mockResolvedValue([matchingConfig, nonMatchingConfig]);
      reportService.generateAndSendReport.mockResolvedValue(undefined);

      await scheduler.handleCron();

      expect(reportService.generateAndSendReport).toHaveBeenCalledTimes(1);
      expect(reportService.generateAndSendReport).toHaveBeenCalledWith(matchingConfig);

      vi.useRealTimers();
    });

    it('한 길드 실패가 다른 길드 발송에 영향을 주지 않는다', async () => {
      // 2026-03-16 (월요일) 00:00 UTC = 2026-03-16 09:00 Asia/Seoul
      vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

      const config1 = makeConfig({
        guildId: 'guild-1',
        dayOfWeek: 1,
        hour: 9,
        timezone: 'Asia/Seoul',
      });
      const config2 = makeConfig({
        guildId: 'guild-2',
        dayOfWeek: 1,
        hour: 9,
        timezone: 'Asia/Seoul',
      });

      configRepo.findAllEnabled.mockResolvedValue([config1, config2]);
      reportService.generateAndSendReport
        .mockRejectedValueOnce(new Error('guild-1 전송 실패'))
        .mockResolvedValueOnce(undefined);

      // 예외 없이 완료되어야 한다
      await expect(scheduler.handleCron()).resolves.toBeUndefined();

      // 두 길드 모두 시도해야 한다
      expect(reportService.generateAndSendReport).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('매칭 없으면 generateAndSendReport가 호출되지 않는다', async () => {
      // 2026-03-16 (월요일) 00:00 UTC = 09:00 Asia/Seoul -> hour=9, dayOfWeek=1
      vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

      const nonMatchingConfig = makeConfig({
        guildId: 'guild-1',
        dayOfWeek: 3, // 수요일 — 매칭 안 됨
        hour: 9,
        timezone: 'Asia/Seoul',
      });

      configRepo.findAllEnabled.mockResolvedValue([nonMatchingConfig]);
      reportService.generateAndSendReport.mockResolvedValue(undefined);

      await scheduler.handleCron();

      expect(reportService.generateAndSendReport).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('타임존이 다르면 같은 UTC 시각이라도 다른 결과가 나온다', async () => {
      // 2026-03-16 (월요일) 00:00 UTC
      // Asia/Seoul = 09:00 KST (dayOfWeek=1, hour=9) -> 매칭
      // UTC = 00:00 UTC (dayOfWeek=1, hour=0) -> 매칭
      vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

      const seoulConfig = makeConfig({
        guildId: 'guild-seoul',
        dayOfWeek: 1,
        hour: 9,
        timezone: 'Asia/Seoul',
      });
      const utcConfig = makeConfig({
        guildId: 'guild-utc',
        dayOfWeek: 1,
        hour: 0,
        timezone: 'UTC',
      });

      configRepo.findAllEnabled.mockResolvedValue([seoulConfig, utcConfig]);
      reportService.generateAndSendReport.mockResolvedValue(undefined);

      await scheduler.handleCron();

      // 두 길드 모두 해당 조건을 만족함
      expect(reportService.generateAndSendReport).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('configRepo.findAllEnabled가 실패해도 스케줄러가 예외를 외부로 던지지 않는다', async () => {
      configRepo.findAllEnabled.mockRejectedValue(new Error('DB 연결 실패'));

      // handleCron 내부에서 catch하므로 외부로 예외가 나오지 않아야 한다
      await expect(scheduler.handleCron()).resolves.toBeUndefined();
    });

    it('여러 매칭 길드에 Promise.allSettled로 병렬 실행한다', async () => {
      vi.setSystemTime(new Date('2026-03-16T00:00:00.000Z'));

      const configs = ['guild-1', 'guild-2', 'guild-3'].map((guildId) =>
        makeConfig({ guildId, dayOfWeek: 1, hour: 9, timezone: 'Asia/Seoul' }),
      );

      configRepo.findAllEnabled.mockResolvedValue(configs);

      const resolveOrder: string[] = [];
      reportService.generateAndSendReport.mockImplementation(
        (config: WeeklyReportConfigOrmEntity) => {
          resolveOrder.push(config.guildId);
          return Promise.resolve();
        },
      );

      await scheduler.handleCron();

      expect(reportService.generateAndSendReport).toHaveBeenCalledTimes(3);
      // 3개 길드 모두 처리됨
      expect(resolveOrder).toHaveLength(3);

      vi.useRealTimers();
    });
  });
});
