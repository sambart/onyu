import { type Mocked } from 'vitest';

import { MockRedisService } from '../../../test-utils/mock-redis.service';
import { type VoiceDailyRepository } from '../infrastructure/voice-daily.repository';
import { type VoiceRedisRepository } from '../infrastructure/voice-redis.repository';
import { VoiceDailyFlushService } from './voice-daily-flush-service';

const VIDEO_DURATION_SEC = 120;
const DEAF_DURATION_SEC = 600;
const ALL_DURATION_STREAMING_SEC = 300;
const ALL_DURATION_VIDEO_SEC = 120;
const ALL_DURATION_DEAF_SEC = 600;

describe('VoiceDailyFlushService.flushDate', () => {
  let service: VoiceDailyFlushService;
  let redis: MockRedisService;
  let voiceDailyRepository: Mocked<VoiceDailyRepository>;
  let voiceRedisRepository: Mocked<VoiceRedisRepository>;

  const guild = 'guild-1';
  const user = 'user-1';
  const date = '20260316';

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
      getChannelName: vi.fn().mockResolvedValue('General'),
      getCategoryInfo: vi.fn().mockResolvedValue(null),
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

  describe('streaming flush', () => {
    it('streamingDuration 키에 값이 있으면 accumulateStreamingDuration을 호출한다', async () => {
      const streamingKey = `voice:duration:streaming:${guild}:${user}:${date}`;
      await redis.set(streamingKey, 300); // 300초

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateStreamingDuration).toHaveBeenCalledWith(
        guild,
        user,
        date,
        300,
      );
    });

    it('streaming flush 후 Redis 키를 삭제한다', async () => {
      const streamingKey = `voice:duration:streaming:${guild}:${user}:${date}`;
      await redis.set(streamingKey, 300);

      await service.flushDate(guild, user, date);

      const remaining = await redis.get(streamingKey);
      expect(remaining).toBeNull();
    });

    it('streamingDuration 키가 0이면 accumulateStreamingDuration을 호출하지 않는다', async () => {
      const streamingKey = `voice:duration:streaming:${guild}:${user}:${date}`;
      await redis.set(streamingKey, 0);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateStreamingDuration).not.toHaveBeenCalled();
    });

    it('streamingDuration 키가 없으면 accumulateStreamingDuration을 호출하지 않는다', async () => {
      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateStreamingDuration).not.toHaveBeenCalled();
    });
  });

  describe('video flush', () => {
    it('videoDuration 키에 값이 있으면 accumulateVideoDuration을 호출한다', async () => {
      const videoKey = `voice:duration:video:${guild}:${user}:${date}`;
      await redis.set(videoKey, VIDEO_DURATION_SEC);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateVideoDuration).toHaveBeenCalledWith(
        guild,
        user,
        date,
        VIDEO_DURATION_SEC,
      );
    });

    it('video flush 후 Redis 키를 삭제한다', async () => {
      const videoKey = `voice:duration:video:${guild}:${user}:${date}`;
      await redis.set(videoKey, VIDEO_DURATION_SEC);

      await service.flushDate(guild, user, date);

      const remaining = await redis.get(videoKey);
      expect(remaining).toBeNull();
    });

    it('videoDuration 키가 없으면 accumulateVideoDuration을 호출하지 않는다', async () => {
      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateVideoDuration).not.toHaveBeenCalled();
    });
  });

  describe('deaf flush', () => {
    it('deafDuration 키에 값이 있으면 accumulateDeafDuration을 호출한다', async () => {
      const deafKey = `voice:duration:deaf:${guild}:${user}:${date}`;
      await redis.set(deafKey, DEAF_DURATION_SEC);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateDeafDuration).toHaveBeenCalledWith(
        guild,
        user,
        date,
        DEAF_DURATION_SEC,
      );
    });

    it('deaf flush 후 Redis 키를 삭제한다', async () => {
      const deafKey = `voice:duration:deaf:${guild}:${user}:${date}`;
      await redis.set(deafKey, DEAF_DURATION_SEC);

      await service.flushDate(guild, user, date);

      const remaining = await redis.get(deafKey);
      expect(remaining).toBeNull();
    });

    it('deafDuration 키가 없으면 accumulateDeafDuration을 호출하지 않는다', async () => {
      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateDeafDuration).not.toHaveBeenCalled();
    });
  });

  describe('streaming/video/deaf 모두 동시에 flush', () => {
    it('세 가지 키 모두에 값이 있으면 각각의 accumulate를 호출한다', async () => {
      await redis.set(
        `voice:duration:streaming:${guild}:${user}:${date}`,
        ALL_DURATION_STREAMING_SEC,
      );
      await redis.set(`voice:duration:video:${guild}:${user}:${date}`, ALL_DURATION_VIDEO_SEC);
      await redis.set(`voice:duration:deaf:${guild}:${user}:${date}`, ALL_DURATION_DEAF_SEC);

      await service.flushDate(guild, user, date);

      expect(voiceDailyRepository.accumulateStreamingDuration).toHaveBeenCalledWith(
        guild,
        user,
        date,
        ALL_DURATION_STREAMING_SEC,
      );
      expect(voiceDailyRepository.accumulateVideoDuration).toHaveBeenCalledWith(
        guild,
        user,
        date,
        ALL_DURATION_VIDEO_SEC,
      );
      expect(voiceDailyRepository.accumulateDeafDuration).toHaveBeenCalledWith(
        guild,
        user,
        date,
        ALL_DURATION_DEAF_SEC,
      );
    });
  });
});
