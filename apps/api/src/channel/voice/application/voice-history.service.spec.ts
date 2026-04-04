import { type Mocked, vi } from 'vitest';

import { type VoiceHistoryQueryDto } from '../dto/voice-history-query.dto';
import { type VoiceChannelHistoryOrm } from '../infrastructure/voice-channel-history.orm-entity';
import { VoiceHistoryService } from './voice-history.service';

function makeHistoryOrm(overrides: Partial<VoiceChannelHistoryOrm> = {}): VoiceChannelHistoryOrm {
  const joinedAt = new Date('2026-03-15T10:00:00Z');
  const leftAt = new Date('2026-03-15T11:00:00Z');
  return {
    id: 1,
    joinedAt,
    leftAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    channel: {
      discordChannelId: 'ch-1',
      channelName: '일반 음성',
      categoryId: 'cat-1',
      categoryName: '음성 채널',
    },
    guildMember: {
      userId: 'user-1',
    },
    get duration() {
      if (this.joinedAt && this.leftAt) {
        return Math.floor((+this.leftAt - +this.joinedAt) / 1000);
      }
      return null;
    },
    ...overrides,
  } as unknown as VoiceChannelHistoryOrm;
}

describe('VoiceHistoryService', () => {
  let service: VoiceHistoryService;
  let mockQb: Record<string, Mocked<ReturnType<typeof vi.fn>>>;
  let historyRepo: { createQueryBuilder: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockQb = {
      innerJoin: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
    };

    historyRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(mockQb),
    };

    service = new VoiceHistoryService(historyRepo as never);
  });

  describe('getHistory', () => {
    it('기본 페이지네이션 (page=1, limit=20)으로 조회한다', async () => {
      const query: VoiceHistoryQueryDto = {};

      const result = await service.getHistory('guild-1', 'user-1', query);

      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({ total: 0, page: 1, limit: 20, items: [] });
    });

    it('page, limit 값을 적용하여 조회한다', async () => {
      const query: VoiceHistoryQueryDto = { page: 3, limit: 10 };

      await service.getHistory('guild-1', 'user-1', query);

      expect(mockQb.skip).toHaveBeenCalledWith(20); // (3-1) * 10
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });

    it('from/to 날짜 필터를 적용한다', async () => {
      const query: VoiceHistoryQueryDto = { from: '20260301', to: '20260315' };

      await service.getHistory('guild-1', 'user-1', query);

      expect(mockQb.andWhere).toHaveBeenCalledWith(expect.stringContaining('TO_DATE(:from'), {
        from: '20260301',
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(expect.stringContaining('TO_DATE(:to'), {
        to: '20260315',
      });
    });

    it('from만 지정하면 to 필터는 적용하지 않는다', async () => {
      const query: VoiceHistoryQueryDto = { from: '20260301' };

      await service.getHistory('guild-1', 'user-1', query);

      // andWhere: guildId 조건 + from 조건 = 2번 호출
      const andWhereCalls = mockQb.andWhere.mock.calls;
      const hasToFilter = andWhereCalls.some(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes(':to'),
      );
      expect(hasToFilter).toBe(false);
    });

    it('조회 결과를 DTO로 매핑한다', async () => {
      const historyItem = makeHistoryOrm();
      mockQb.getManyAndCount.mockResolvedValue([[historyItem], 1]);

      const result = await service.getHistory('guild-1', 'user-1', {});

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 1,
        channelId: 'ch-1',
        channelName: '일반 음성',
        categoryId: 'cat-1',
        categoryName: '음성 채널',
        joinAt: expect.any(String),
        leftAt: expect.any(String),
        durationSec: 3600,
      });
    });

    it('leftAt이 null이면 durationSec도 null이다', async () => {
      const historyItem = makeHistoryOrm({ leftAt: null });
      mockQb.getManyAndCount.mockResolvedValue([[historyItem], 1]);

      const result = await service.getHistory('guild-1', 'user-1', {});

      expect(result.items[0]!.leftAt).toBeNull();
      expect(result.items[0]!.durationSec).toBeNull();
    });

    it('categoryId/categoryName이 없으면 null로 매핑한다', async () => {
      const historyItem = makeHistoryOrm();
      (historyItem.channel as Record<string, unknown>).categoryId = undefined;
      (historyItem.channel as Record<string, unknown>).categoryName = undefined;
      mockQb.getManyAndCount.mockResolvedValue([[historyItem], 1]);

      const result = await service.getHistory('guild-1', 'user-1', {});

      expect(result.items[0]!.categoryId).toBeNull();
      expect(result.items[0]!.categoryName).toBeNull();
    });
  });
});
