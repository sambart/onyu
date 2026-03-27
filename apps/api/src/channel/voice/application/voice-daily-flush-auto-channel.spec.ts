/**
 * VoiceDailyFlushService — auto-channel 메타데이터 flush 테스트
 * 대상: flushDate()에서 getAutoChannelInfo 조회 후 accumulateChannelDuration에 전달 (F-VOICE-034)
 */

import { type Mocked } from 'vitest';

import { MockRedisService } from '../../../test-utils/mock-redis.service';
import { type VoiceDailyRepository } from '../infrastructure/voice-daily.repository';
import {
  type AutoChannelInfo,
  type VoiceRedisRepository,
} from '../infrastructure/voice-redis.repository';
import { VoiceDailyFlushService } from './voice-daily-flush-service';

describe('VoiceDailyFlushService — auto-channel 메타데이터 flush', () => {
  let service: VoiceDailyFlushService;
  let redis: MockRedisService;
  let voiceDailyRepository: Mocked<VoiceDailyRepository>;
  let voiceRedisRepository: Mocked<VoiceRedisRepository>;

  const guild = 'guild-1';
  const user = 'user-1';
  const date = '20260316';
  const channelId = 'ch-auto-1';

  beforeEach(() => {
    redis = new MockRedisService();

    voiceDailyRepository = {
      accumulateChannelDuration: vi.fn().mockResolvedValue(undefined),
      accumulateMicDuration: vi.fn().mockResolvedValue(undefined),
      accumulateAloneDuration: vi.fn().mockResolvedValue(undefined),
      accumulateStreamingDuration: vi.fn().mockResolvedValue(undefined),
      accumulateVideoDuration: vi.fn().mockResolvedValue(undefined),
      accumulateDeafDuration: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<VoiceDailyRepository>;

    voiceRedisRepository = {
      getUserName: vi.fn().mockResolvedValue('Alice'),
      getChannelName: vi.fn().mockResolvedValue('게임방-1호'),
      getCategoryInfo: vi.fn().mockResolvedValue(null),
      getAutoChannelInfo: vi.fn().mockResolvedValue(null),
      getSession: vi.fn().mockResolvedValue(null),
      setSession: vi.fn().mockResolvedValue(undefined),
      accumulateDuration: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<VoiceRedisRepository>;

    service = new VoiceDailyFlushService(
      redis as never,
      voiceDailyRepository,
      voiceRedisRepository,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    redis.clear();
  });

  describe('flushDate — auto-channel 메타데이터 전달', () => {
    it('autoChannelInfo가 있을 때 channelType=auto_select로 accumulateChannelDuration을 호출한다', async () => {
      const channelKey = `voice:duration:channel:${guild}:${user}:${date}:${channelId}`;
      await redis.set(channelKey, 300);

      const autoInfo: AutoChannelInfo = {
        configId: 1,
        configName: '게임방',
        channelType: 'auto_select',
      };
      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(autoInfo);
      voiceRedisRepository.getUserName.mockResolvedValue('Alice');
      voiceRedisRepository.getChannelName.mockResolvedValue('게임방-1호');
      voiceRedisRepository.getCategoryInfo.mockResolvedValue(null);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateChannelDuration).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: 'auto_select',
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
        }),
      );
    });

    it('autoChannelInfo가 있을 때 channelType=auto_instant로 accumulateChannelDuration을 호출한다', async () => {
      const channelKey = `voice:duration:channel:${guild}:${user}:${date}:${channelId}`;
      await redis.set(channelKey, 600);

      const autoInfo: AutoChannelInfo = {
        configId: 42,
        configName: '즉시생성방',
        channelType: 'auto_instant',
      };
      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(autoInfo);
      voiceRedisRepository.getUserName.mockResolvedValue('Alice');
      voiceRedisRepository.getChannelName.mockResolvedValue('즉시생성방-1호');
      voiceRedisRepository.getCategoryInfo.mockResolvedValue(null);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateChannelDuration).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: 'auto_instant',
          autoChannelConfigId: 42,
          autoChannelConfigName: '즉시생성방',
        }),
      );
    });

    it('autoChannelInfo가 null일 때 channelType=permanent, configId=null, configName=null로 호출한다', async () => {
      const channelKey = `voice:duration:channel:${guild}:${user}:${date}:${channelId}`;
      await redis.set(channelKey, 300);

      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(null);
      voiceRedisRepository.getUserName.mockResolvedValue('Alice');
      voiceRedisRepository.getChannelName.mockResolvedValue('일반채널');
      voiceRedisRepository.getCategoryInfo.mockResolvedValue(null);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateChannelDuration).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: 'permanent',
          autoChannelConfigId: null,
          autoChannelConfigName: null,
        }),
      );
    });

    it('getAutoChannelInfo가 채널 ID별로 호출된다', async () => {
      const ch1Key = `voice:duration:channel:${guild}:${user}:${date}:ch-1`;
      const ch2Key = `voice:duration:channel:${guild}:${user}:${date}:ch-2`;
      await redis.set(ch1Key, 100);
      await redis.set(ch2Key, 200);

      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(null);
      voiceRedisRepository.getUserName.mockResolvedValue('Alice');
      voiceRedisRepository.getChannelName.mockResolvedValue('채널');
      voiceRedisRepository.getCategoryInfo.mockResolvedValue(null);

      await service.flushDate(guild, user, date);

      // 두 채널에 대해 각각 호출
      expect(voiceRedisRepository.getAutoChannelInfo).toHaveBeenCalledWith(guild, 'ch-1');
      expect(voiceRedisRepository.getAutoChannelInfo).toHaveBeenCalledWith(guild, 'ch-2');
      expect(voiceRedisRepository.getAutoChannelInfo).toHaveBeenCalledTimes(2);
    });

    it('채널 duration이 0이면 accumulateChannelDuration을 호출하지 않는다', async () => {
      const channelKey = `voice:duration:channel:${guild}:${user}:${date}:${channelId}`;
      await redis.set(channelKey, 0);

      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(null);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateChannelDuration).not.toHaveBeenCalled();
    });

    it('autoChannelInfo와 categoryInfo가 모두 있으면 두 정보가 함께 전달된다', async () => {
      const channelKey = `voice:duration:channel:${guild}:${user}:${date}:${channelId}`;
      await redis.set(channelKey, 300);

      const autoInfo: AutoChannelInfo = {
        configId: 5,
        configName: '음성방',
        channelType: 'auto_select',
      };
      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(autoInfo);
      voiceRedisRepository.getUserName.mockResolvedValue('Alice');
      voiceRedisRepository.getChannelName.mockResolvedValue('음성방-2호');
      voiceRedisRepository.getCategoryInfo.mockResolvedValue({
        categoryId: 'cat-1',
        categoryName: '음성 카테고리',
      });

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateChannelDuration).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: guild,
          userId: user,
          date,
          channelId,
          channelName: '음성방-2호',
          durationSec: 300,
          categoryId: 'cat-1',
          categoryName: '음성 카테고리',
          channelType: 'auto_select',
          autoChannelConfigId: 5,
          autoChannelConfigName: '음성방',
        }),
      );
    });

    it('flush 후 채널 duration Redis 키가 삭제된다', async () => {
      const channelKey = `voice:duration:channel:${guild}:${user}:${date}:${channelId}`;
      await redis.set(channelKey, 300);

      voiceRedisRepository.getAutoChannelInfo.mockResolvedValue(null);
      voiceRedisRepository.getUserName.mockResolvedValue('Alice');
      voiceRedisRepository.getChannelName.mockResolvedValue('일반채널');
      voiceRedisRepository.getCategoryInfo.mockResolvedValue(null);

      await service.flushDate(guild, user, date);

      const remaining = await redis.get(channelKey);
      expect(remaining).toBeNull();
    });
  });
});
