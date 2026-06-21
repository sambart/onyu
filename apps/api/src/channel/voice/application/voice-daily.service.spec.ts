import { type Mock } from 'vitest';

import { type VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { VoiceDailyService } from './voice-daily.service';

const DEFAULT_CHANNEL_DURATION_SEC = 3600;
const DEFAULT_MIC_ON_SEC = 1800;
const DEFAULT_MIC_OFF_SEC = 1800;
const DEFAULT_ALONE_SEC = 600;
const SECOND_ENTITY_DURATION_SEC = 7200;
const BUTTON_ID_EXAMPLE = 77;

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
    channelDurationSec: DEFAULT_CHANNEL_DURATION_SEC,
    micOnSec: DEFAULT_MIC_ON_SEC,
    micOffSec: DEFAULT_MIC_OFF_SEC,
    aloneSec: DEFAULT_ALONE_SEC,
    streamingSec: 0,
    videoOnSec: 0,
    deafSec: 0,
    recordedAt: null,
    channelType: 'permanent',
    autoChannelConfigId: null,
    autoChannelConfigName: null,
    autoChannelButtonId: null,
    autoChannelButtonLabel: null,
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
      expect(dto.channelDurationSec).toBe(DEFAULT_CHANNEL_DURATION_SEC);
      expect(dto.micOnSec).toBe(DEFAULT_MIC_ON_SEC);
      expect(dto.micOffSec).toBe(DEFAULT_MIC_OFF_SEC);
      expect(dto.aloneSec).toBe(DEFAULT_ALONE_SEC);
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
        makeEntity({
          userId: 'user-2',
          date: '20260302',
          channelDurationSec: SECOND_ENTITY_DURATION_SEC,
        }),
      ];
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue(entities);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260302');

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-1');
      expect(result[1].userId).toBe('user-2');
      expect(result[1].channelDurationSec).toBe(SECOND_ENTITY_DURATION_SEC);
    });

    it('autoChannelButtonId, autoChannelButtonLabel이 DTO에 포함된다', async () => {
      const entity = makeEntity({
        channelType: 'auto_select',
        autoChannelConfigId: 1,
        autoChannelConfigName: '게임방',
        autoChannelButtonId: 10,
        autoChannelButtonLabel: '오버워치',
      });
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([entity]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(result[0].autoChannelButtonId).toBe(10);
      expect(result[0].autoChannelButtonLabel).toBe('오버워치');
    });

    it('autoChannelButtonId=null, autoChannelButtonLabel=null이면 null로 변환된다', async () => {
      const entity = makeEntity({
        channelType: 'auto_instant',
        autoChannelConfigId: 42,
        autoChannelConfigName: '즉시생성방',
        autoChannelButtonId: null,
        autoChannelButtonLabel: null,
      });
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([entity]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(result[0].autoChannelButtonId).toBeNull();
      expect(result[0].autoChannelButtonLabel).toBeNull();
    });

    it('autoChannelButtonId, autoChannelButtonLabel이 undefined이면 null로 변환된다', async () => {
      const entity = makeEntity({
        autoChannelButtonId: undefined as unknown as null,
        autoChannelButtonLabel: undefined as unknown as null,
      });
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([entity]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      expect(result[0].autoChannelButtonId).toBeNull();
      expect(result[0].autoChannelButtonLabel).toBeNull();
    });

    it('channelType, autoChannelConfigId, autoChannelConfigName, autoChannelButtonId, autoChannelButtonLabel 필드가 모두 DTO에 포함된다', async () => {
      const entity = makeEntity({
        channelType: 'auto_select',
        autoChannelConfigId: 7,
        autoChannelConfigName: '스터디방',
        autoChannelButtonId: BUTTON_ID_EXAMPLE,
        autoChannelButtonLabel: '스터디',
      });
      voiceDailyRepository.findByGuildIdAndDateRange.mockResolvedValue([entity]);

      const result = await service.getDailyRecords('guild-1', '20260301', '20260307');

      const dto = result[0];
      expect(dto.channelType).toBe('auto_select');
      expect(dto.autoChannelConfigId).toBe(7);
      expect(dto.autoChannelConfigName).toBe('스터디방');
      expect(dto.autoChannelButtonId).toBe(BUTTON_ID_EXAMPLE);
      expect(dto.autoChannelButtonLabel).toBe('스터디');
    });
  });
});
