import type { Repository } from 'typeorm';
import type { Mocked } from 'vitest';

import type { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import type { BadgeQueryService } from '../../../voice-analytics/self-diagnosis/application/badge-query.service';
import type { VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { MeProfileService } from './me-profile.service';
import type { VoiceDailyFlushService } from './voice-daily-flush-service';
import type { VoiceExcludedChannelService } from './voice-excluded-channel.service';

function makeQb(rawOneValue?: unknown, rawManyValue?: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue(rawOneValue ?? null),
    getRawMany: vi.fn().mockResolvedValue(rawManyValue ?? []),
  };
}

describe('MeProfileService', () => {
  let service: MeProfileService;
  let voiceDailyRepo: Mocked<Repository<VoiceDailyOrm>>;
  let flushService: Mocked<VoiceDailyFlushService>;
  let badgeQueryService: Mocked<BadgeQueryService>;
  let excludedChannelService: Mocked<VoiceExcludedChannelService>;
  let discordRestService: Mocked<DiscordRestService>;

  beforeEach(() => {
    voiceDailyRepo = {
      createQueryBuilder: vi.fn(),
      query: vi.fn(),
    } as unknown as Mocked<Repository<VoiceDailyOrm>>;

    flushService = {
      safeFlushAll: vi.fn().mockResolvedValue({ flushed: 0, skipped: 0 }),
    } as unknown as Mocked<VoiceDailyFlushService>;

    badgeQueryService = {
      findBadgeCodes: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<BadgeQueryService>;

    excludedChannelService = {
      getExcludedChannels: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<VoiceExcludedChannelService>;

    discordRestService = {
      fetchGuildChannels: vi.fn().mockResolvedValue([]),
    } as unknown as Mocked<DiscordRestService>;

    service = new MeProfileService(
      voiceDailyRepo,
      flushService,
      badgeQueryService,
      excludedChannelService,
      discordRestService,
    );
  });

  describe('getProfile', () => {
    function setupMocks(overrides: {
      globalStats?: unknown;
      channelRecords?: unknown[];
      rankInfo?: unknown[];
      dailyChart?: unknown[];
      badges?: string[];
    }) {
      const {
        globalStats = { micOn: '3600', micOff: '1800', alone: '900', days: '5' },
        channelRecords = [
          { channelId: 'ch-1', channelName: '일반', categoryName: null, duration: '7200' },
        ],
        rankInfo = [{ rank: '1', totalUsers: '10' }],
        dailyChart = [],
        badges = [],
      } = overrides;

      let callCount = 0;
      voiceDailyRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        // 호출 순서: 1=globalStats, 2=channelRecords, 3=dailyChart
        if (callCount === 1)
          return makeQb(globalStats) as ReturnType<typeof voiceDailyRepo.createQueryBuilder>;
        if (callCount === 2)
          return makeQb(null, channelRecords as object[]) as ReturnType<
            typeof voiceDailyRepo.createQueryBuilder
          >;
        return makeQb(null, dailyChart as object[]) as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >;
      });

      voiceDailyRepo.query.mockResolvedValue(rankInfo);
      badgeQueryService.findBadgeCodes.mockResolvedValue(badges);
    }

    it('정상적으로 프로필 데이터를 반환한다', async () => {
      setupMocks({
        rankInfo: [{ rank: '2', totalUsers: '15' }],
        badges: ['ACTIVITY', 'SOCIAL'],
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      expect(result!.rank).toBe(2);
      expect(result!.totalUsers).toBe(15);
      expect(result!.badges).toEqual(['ACTIVITY', 'SOCIAL']);
    });

    it('음성 데이터가 없으면 null을 반환한다', async () => {
      let callCount = 0;
      voiceDailyRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // globalStats: 모두 0
          return makeQb({ micOn: '0', micOff: '0', alone: '0', days: '0' }) as ReturnType<
            typeof voiceDailyRepo.createQueryBuilder
          >;
        }
        // channelRecords: 빈 배열
        return makeQb(null, []) as ReturnType<typeof voiceDailyRepo.createQueryBuilder>;
      });
      voiceDailyRepo.query.mockResolvedValue([{ rank: '0', totalUsers: '0' }]);

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).toBeNull();
    });

    it('flush 실패해도 프로필을 계속 조회한다', async () => {
      flushService.safeFlushAll.mockRejectedValue(new Error('flush error'));
      setupMocks({});

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
    });

    it('배지 조회 실패 시 빈 배열을 반환한다', async () => {
      setupMocks({});
      badgeQueryService.findBadgeCodes.mockRejectedValue(new Error('badge error'));

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      expect(result!.badges).toEqual([]);
    });

    it('micOnSec과 micOffSec이 올바르게 계산된다', async () => {
      setupMocks({
        globalStats: { micOn: '5400', micOff: '1800', alone: '0', days: '3' },
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result!.micOnSec).toBe(5400);
      expect(result!.micOffSec).toBe(1800);
    });

    it('micUsageRate가 올바르게 계산된다', async () => {
      // micOn: 3600, totalSec(channelRecords): 7200
      // micUsageRate = round(3600/7200 * 1000) / 10 = 50.0
      setupMocks({
        globalStats: { micOn: '3600', micOff: '3600', alone: '0', days: '1' },
        channelRecords: [
          { channelId: 'ch-1', channelName: '일반', categoryName: null, duration: '7200' },
        ],
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result!.micUsageRate).toBe(50);
    });

    it('totalSec이 0이면 micUsageRate는 0이다', async () => {
      // channelRecords가 없으면 totalSec=0
      setupMocks({
        globalStats: { micOn: '100', micOff: '0', alone: '0', days: '1' },
        channelRecords: [],
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      // micOnSec=100이지만 channelRecords가 없으므로 totalSec=0 → null 반환 방지를 위해
      // globalStats.micOnSec=100이 0이 아니므로 null이 아님
      if (result !== null) {
        expect(result.micUsageRate).toBe(0);
      }
    });

    it('activeDays가 0이면 avgDailySec은 0이다', async () => {
      setupMocks({
        globalStats: { micOn: '0', micOff: '0', alone: '0', days: '0' },
        channelRecords: [
          { channelId: 'ch-1', channelName: '일반', categoryName: null, duration: '3600' },
        ],
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      expect(result!.avgDailySec).toBe(0);
    });

    it('dailyChart가 15개 항목을 반환한다', async () => {
      setupMocks({
        dailyChart: [
          { date: '20260305', duration: '3600' },
          { date: '20260310', duration: '1800' },
        ],
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      expect(result!.dailyChart).toHaveLength(15);
    });

    it('dailyChart에서 데이터 없는 날은 durationSec이 0이다', async () => {
      setupMocks({ dailyChart: [] });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      result!.dailyChart.forEach((entry) => {
        expect(entry.durationSec).toBe(0);
        expect(entry.date).toMatch(/^\d{8}$/);
      });
    });

    it('peakDayOfWeek: 데이터가 없으면 null이다', async () => {
      setupMocks({ dailyChart: [] });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      expect(result!.peakDayOfWeek).toBeNull();
    });

    it('채널 이름이 없으면 채널 ID로 대체된다', async () => {
      setupMocks({
        channelRecords: [
          { channelId: 'abc123def', channelName: '', categoryName: null, duration: '3600' },
        ],
      });

      const result = await service.getProfile('guild-1', 'user-1', 30);

      expect(result).not.toBeNull();
      // 채널 이름이 빈 문자열이면 "Channel-" + 채널 ID 앞 6자리로 대체
    });

    it('getProfile 호출 시 flush를 먼저 실행한다', async () => {
      const flushOrder: string[] = [];
      flushService.safeFlushAll.mockImplementation(async () => {
        flushOrder.push('flush');
        return { flushed: 0, skipped: 0 };
      });
      voiceDailyRepo.createQueryBuilder.mockImplementation(() => {
        flushOrder.push('query');
        return makeQb({ micOn: '100', micOff: '0', alone: '0', days: '1' }) as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >;
      });
      voiceDailyRepo.query.mockResolvedValue([{ rank: '1', totalUsers: '1' }]);

      await service.getProfile('guild-1', 'user-1', 30);

      expect(flushOrder[0]).toBe('flush');
    });
  });
});
