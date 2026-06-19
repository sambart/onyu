import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

import { MocoResetScheduler } from './moco-reset.scheduler';

describe('MocoResetScheduler', () => {
  let scheduler: MocoResetScheduler;

  const mockConfigRepo = {
    findAllMocoEnabled: vi.fn(),
    updateMocoCurrentPeriodStart: vi.fn(),
  };

  const mockMocoService = {
    sendOrUpdateRankEmbed: vi.fn(),
  };

  const mockCoPresenceScheduler = {
    flushGuildSessions: vi.fn(),
  };

  // ioredis raw client mock (MocoResetScheduler는 @Inject(REDIS_CLIENT)로 직접 사용)
  const mockRedisClient = {
    del: vi.fn(),
    scan: vi.fn(),
  };

  // runExclusive가 task를 즉시 실행하도록 mock
  const mockSchedulerLock = {
    runExclusive: vi.fn((_name: string, _ttl: number, task: () => Promise<void>) => task()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    scheduler = new MocoResetScheduler(
      mockConfigRepo as never,
      mockMocoService as never,
      mockCoPresenceScheduler as never,
      mockRedisClient as never,
      mockSchedulerLock as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 통합 케이스: runExclusive 위임 + processAllGuilds 실행 ─────────────
  describe('runDailyReset — SchedulerLockService 위임', () => {
    it('runExclusive를 lockName=moco-period-reset, ttl=900으로 호출하고 task 위임으로 processAllGuilds가 실행된다', async () => {
      mockConfigRepo.findAllMocoEnabled.mockResolvedValue([]);

      await scheduler.runDailyReset();

      expect(mockSchedulerLock.runExclusive).toHaveBeenCalledTimes(1);
      expect(mockSchedulerLock.runExclusive).toHaveBeenCalledWith(
        'moco-period-reset',
        900,
        expect.any(Function),
      );
      // task 위임으로 processAllGuilds가 실행 → findAllMocoEnabled 호출됨
      expect(mockConfigRepo.findAllMocoEnabled).toHaveBeenCalledTimes(1);
    });

    it('mocoEnabled 길드가 없으면 resetGuild를 실행하지 않는다', async () => {
      mockConfigRepo.findAllMocoEnabled.mockResolvedValue([]);

      await scheduler.runDailyReset();

      expect(mockCoPresenceScheduler.flushGuildSessions).not.toHaveBeenCalled();
    });
  });
});
