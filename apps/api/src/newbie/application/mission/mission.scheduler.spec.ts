import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

import { MissionScheduler } from './mission.scheduler';

const SCHEDULER_LOCK_TTL_SEC = 900; // 스케줄러 락 TTL

describe('MissionScheduler', () => {
  let scheduler: MissionScheduler;

  const mockMissionRepo = {
    findExpired: vi.fn(),
    updateStatus: vi.fn(),
  };

  const mockConfigRepo = {
    findByGuildId: vi.fn(),
  };

  const mockNewbieRedis = {
    deleteMissionActive: vi.fn(),
  };

  const mockMissionService = {
    getPlaytimeSec: vi.fn(),
    getPlayCount: vi.fn(),
    invalidateMissionCanvasCache: vi.fn(),
    registerMissingMembers: vi.fn(),
    refreshMissionEmbed: vi.fn(),
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

    scheduler = new MissionScheduler(
      mockMissionRepo as never,
      mockConfigRepo as never,
      mockNewbieRedis as never,
      mockMissionService as never,
      mockSchedulerLock as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 통합 케이스: runExclusive 위임 + processExpiredMissions 실행 ────────
  describe('runDailyExpiry — SchedulerLockService 위임', () => {
    it('runExclusive를 lockName=mission-daily-expiry, ttl=900으로 호출하고 task 위임으로 processExpiredMissions가 실행된다', async () => {
      mockMissionRepo.findExpired.mockResolvedValue([]);

      await scheduler.runDailyExpiry();

      expect(mockSchedulerLock.runExclusive).toHaveBeenCalledTimes(1);
      expect(mockSchedulerLock.runExclusive).toHaveBeenCalledWith(
        'mission-daily-expiry',
        SCHEDULER_LOCK_TTL_SEC,
        expect.any(Function),
      );
      // task 위임으로 processExpiredMissions가 실행 → findExpired 호출됨
      expect(mockMissionRepo.findExpired).toHaveBeenCalledTimes(1);
    });

    it('만료 미션이 없으면 updateStatus를 호출하지 않는다', async () => {
      mockMissionRepo.findExpired.mockResolvedValue([]);

      await scheduler.runDailyExpiry();

      expect(mockMissionRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
