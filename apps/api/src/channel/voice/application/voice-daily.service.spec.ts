import { type Mock } from 'vitest';

import { type VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { VoiceDailyService } from './voice-daily.service';

function makeEntity(overrides: Partial<VoiceDailyOrm> = {}): VoiceDailyOrm {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    date: '20260301',
    channelId: 'ch-1',
    channelName: '일반',
    userName: 'Alice',
    categoryId: null as unknown as string,
    categoryName: null as unknown as string,
    channelDurationSec: 3600,
    micOnSec: 1800,
    micOffSec: 1800,
    aloneSec: 600,
    streamingSec: 0,
    videoOnSec: 0,
    deafSec: 0,
    recordedAt: null,
    channelType: 'permanent',
    autoChannelConfigId: null,
    autoChannelConfigName: null,
    ...overrides,
  };
}

describe('VoiceDailyService', () => {
  let service: VoiceDailyService;
  let voiceDailyRepository: { findByGuildIdAndDateRange: Mock };

  beforeEach(() => {
    voiceDailyRepository = {
      findByGuildIdAndDateRange: vi.fn(),
    };

    service = new VoiceDailyService(voiceDailyRepository as never);
  });

  describe('getDailyRecords', () => {
    it('엔티티를 DTO로 변환하여 반환한다', async () => {
      const entity = makeEntity();
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([entity]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(result).toHaveLength(1);
      const dto = result[0];
      expect(dto.guildId).toBe('guild-1');
      expect(dto.userId).toBe('user-1');
      expect(dto.userName).toBe('Alice');
      expect(dto.date).toBe('20260301');
      expect(dto.channelId).toBe('ch-1');
      expect(dto.channelName).toBe('일반');
      expect(dto.channelDurationSec).toBe(3600);
      expect(dto.micOnSec).toBe(1800);
      expect(dto.micOffSec).toBe(1800);
      expect(dto.aloneSec).toBe(600);
    });

    it('categoryId, categoryName이 undefined이면 null로 변환한다', async () => {
      const entity = makeEntity({
        categoryId: undefined as unknown as string,
        categoryName: undefined as unknown as string,
      });
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([entity]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(result[0].categoryId).toBeNull();
      expect(result[0].categoryName).toBeNull();
    });

    it('빈 결과이면 빈 배열 반환', async () => {
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(result).toEqual([]);
    });

    it('날짜 범위 파라미터를 레포지토리에 전달한다', async () => {
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([]);

      await service.getDailyRecords('guild-1', '20260301', '20260307', 'user-1', 'Asia/Tokyo');

      expect(voiceDailyRepository.findByGuildIdAndDateRange).toHaveBeenCalledWith(
        'guild-1',
        '20260301',
        '20260307',
        'user-1',
        'Asia/Tokyo',
      );
    });

    it('userId 없이 호출 시 레포지토리에 undefined 전달', async () => {
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([]);

      await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(voiceDailyRepository.findByGuildIdAndDateRange).toHaveBeenCalledWith(
        'guild-1',
        '20260301',
        '20260307',
        undefined,
        undefined,
      );
    });

    it('복수 엔티티 모두 DTO로 변환된다', async () => {
      const entities = [
        makeEntity({ userId: 'user-1', date: '20260301' }),
        makeEntity({ userId: 'user-2', date: '20260302', channelDurationSec: 7200 }),
      ];
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue(entities);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260302');

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-1');
      expect(result[1].userId).toBe('user-2');
      expect(result[1].channelDurationSec).toBe(7200);
    });
  });
});
