import { type Mocked, vi } from 'vitest';

const TWO_HOURS_SEC = 7200; // 2시간

import { type VoiceDailyFlushService } from './voice-daily-flush-service';
import { VoiceStatsQueryService } from './voice-stats-query.service';

describe('VoiceStatsQueryService', () => {
  let service: VoiceStatsQueryService;
  let voiceDailyRepo: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let flushService: Mocked<VoiceDailyFlushService>;

  let mockQb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockQb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue(null),
    };

    voiceDailyRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(mockQb),
      query: vi.fn().mockResolvedValue([]),
    };

    flushService = {
      safeFlushAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<VoiceDailyFlushService>;

    service = new VoiceStatsQueryService(voiceDailyRepo as never, flushService);
  });

  describe('getUserVoiceStats', () => {
    it('쿼리 전 flush를 호출한다', async () => {
      await service.getUserVoiceStats('guild-1', 'user-1', 7);

      expect(flushService.safeFlushAll).toHaveBeenCalled();
    });

    it('flush 실패 시에도 쿼리를 계속 실행한다', async () => {
      flushService.safeFlushAll.mockRejectedValue(new Error('flush error'));

      await expect(service.getUserVoiceStats('guild-1', 'user-1', 7)).resolves.not.toThrow();
    });

    it('채널 duration과 마이크 ON/OFF 통계를 반환한다', async () => {
      mockQb.getRawOne
        .mockResolvedValueOnce({ total: '3600' }) // channel duration
        .mockResolvedValueOnce({ micOn: '2400', micOff: '1200' }); // mic stats

      const result = await service.getUserVoiceStats('guild-1', 'user-1', 7);

      expect(result).toEqual({
        totalSec: 3600,
        micOnSec: 2400,
        micOffSec: 1200,
      });
    });

    it('데이터가 없으면 모두 0을 반환한다', async () => {
      mockQb.getRawOne.mockResolvedValue(null);

      const result = await service.getUserVoiceStats('guild-1', 'user-1', 7);

      expect(result).toEqual({
        totalSec: 0,
        micOnSec: 0,
        micOffSec: 0,
      });
    });
  });

  describe('getGuildVoiceRank', () => {
    it('쿼리 전 flush를 호출한다', async () => {
      await service.getGuildVoiceRank('guild-1', 7);

      expect(flushService.safeFlushAll).toHaveBeenCalled();
    });

    it('길드 음성 랭킹을 반환한다', async () => {
      voiceDailyRepo.query.mockResolvedValue([
        {
          userId: 'user-1',
          userName: 'Alice',
          totalSec: '7200',
          micOnSec: '3600',
          micOffSec: '3600',
        },
        {
          userId: 'user-2',
          userName: 'Bob',
          totalSec: '3600',
          micOnSec: '1800',
          micOffSec: '1800',
        },
      ]);

      const result = await service.getGuildVoiceRank('guild-1', 7);

      expect(result).toEqual([
        { userId: 'user-1', userName: 'Alice', totalSec: 7200, micOnSec: 3600, micOffSec: 3600 },
        { userId: 'user-2', userName: 'Bob', totalSec: 3600, micOnSec: 1800, micOffSec: 1800 },
      ]);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      voiceDailyRepo.query.mockResolvedValue([]);

      const result = await service.getGuildVoiceRank('guild-1', 7);

      expect(result).toEqual([]);
    });

    it('숫자형 totalSec도 정수로 변환한다', async () => {
      voiceDailyRepo.query.mockResolvedValue([
        { userId: 'user-1', userName: 'Alice', totalSec: TWO_HOURS_SEC, micOnSec: 0, micOffSec: 0 },
      ]);

      const result = await service.getGuildVoiceRank('guild-1', 7);

      expect(result[0].totalSec).toBe(TWO_HOURS_SEC);
    });
  });
});
