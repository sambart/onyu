import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import { VoiceKeys } from './voice-cache.keys';
import { VoiceRedisRepository } from './voice-redis.repository';
import type { VoiceSession } from './voice-session.keys';

const BASE_TIMESTAMP = 1710720000000;
const OFFSET_30_SEC = 30_000;
const OFFSET_60_SEC = 60_000;
const OFFSET_10_SEC = 10_000;
const TIMESTAMP_PLUS_10 = BASE_TIMESTAMP + OFFSET_10_SEC;
const TIMESTAMP_PLUS_20 = BASE_TIMESTAMP + OFFSET_10_SEC + OFFSET_10_SEC;

function makeSession(overrides: Partial<VoiceSession> = {}): VoiceSession {
  return {
    channelId: 'ch-1',
    joinedAt: BASE_TIMESTAMP,
    mic: true,
    alone: false,
    lastUpdatedAt: BASE_TIMESTAMP,
    date: '20260318',
    streaming: false,
    videoOn: false,
    selfDeaf: false,
    ...overrides,
  };
}

describe('VoiceRedisRepository (Integration)', () => {
  let module: TestingModule;
  let repository: VoiceRedisRepository;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      providers: [VoiceRedisRepository],
    }).compile();

    repository = module.get(VoiceRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  describe('setSession / getSession / deleteSession', () => {
    it('세션을 저장하고 조회한다', async () => {
      const session = makeSession();
      await repository.setSession('guild-1', 'user-1', session);

      const result = await repository.getSession('guild-1', 'user-1');
      expect(result).toEqual(session);
    });

    it('세션이 없으면 null을 반환한다', async () => {
      const result = await repository.getSession('guild-1', 'non-existent');
      expect(result).toBeNull();
    });

    it('세션을 삭제한다', async () => {
      await repository.setSession('guild-1', 'user-1', makeSession());
      await repository.deleteSession('guild-1', 'user-1');

      const result = await repository.getSession('guild-1', 'user-1');
      expect(result).toBeNull();
    });

    it('세션에 TTL이 설정된다', async () => {
      await repository.setSession('guild-1', 'user-1', makeSession());

      const ttl = await redisClient.ttl(VoiceKeys.session('guild-1', 'user-1'));
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60 * 12);
    });
  });

  describe('accumulateDuration', () => {
    it('Pipeline으로 채널 duration과 마이크 시간을 누적한다', async () => {
      const session = makeSession({ lastUpdatedAt: BASE_TIMESTAMP });
      const now = BASE_TIMESTAMP + OFFSET_30_SEC; // 30초 후

      await repository.accumulateDuration('guild-1', 'user-1', session, now);

      const channelDuration = await redisClient.get(
        VoiceKeys.channelDuration('guild-1', 'user-1', '20260318', 'ch-1'),
      );
      expect(Number(channelDuration)).toBe(30);

      const micOn = await redisClient.get(
        VoiceKeys.micDuration('guild-1', 'user-1', '20260318', 'on'),
      );
      expect(Number(micOn)).toBe(30);
    });

    it('alone 상태일 때 alone duration을 누적한다', async () => {
      const session = makeSession({ alone: true, lastUpdatedAt: BASE_TIMESTAMP });
      const now = BASE_TIMESTAMP + OFFSET_60_SEC;

      await repository.accumulateDuration('guild-1', 'user-1', session, now);

      const aloneDuration = await redisClient.get(
        VoiceKeys.aloneDuration('guild-1', 'user-1', '20260318'),
      );
      expect(Number(aloneDuration)).toBe(60);
    });

    it('streaming, videoOn, selfDeaf 상태를 누적한다', async () => {
      const session = makeSession({
        streaming: true,
        videoOn: true,
        selfDeaf: true,
        lastUpdatedAt: BASE_TIMESTAMP,
      });
      const now = BASE_TIMESTAMP + OFFSET_10_SEC;

      await repository.accumulateDuration('guild-1', 'user-1', session, now);

      const streaming = await redisClient.get(
        VoiceKeys.streamingDuration('guild-1', 'user-1', '20260318'),
      );
      const video = await redisClient.get(VoiceKeys.videoDuration('guild-1', 'user-1', '20260318'));
      const deaf = await redisClient.get(VoiceKeys.deafDuration('guild-1', 'user-1', '20260318'));
      expect(Number(streaming)).toBe(10);
      expect(Number(video)).toBe(10);
      expect(Number(deaf)).toBe(10);
    });

    it('여러 번 호출하면 duration이 누적된다', async () => {
      const session = makeSession({ lastUpdatedAt: BASE_TIMESTAMP });

      await repository.accumulateDuration('guild-1', 'user-1', session, TIMESTAMP_PLUS_10);
      await repository.accumulateDuration('guild-1', 'user-1', session, TIMESTAMP_PLUS_20);

      const channelDuration = await redisClient.get(
        VoiceKeys.channelDuration('guild-1', 'user-1', '20260318', 'ch-1'),
      );
      expect(Number(channelDuration)).toBe(20);
    });

    it('lastUpdatedAt이 없으면 누적하지 않고 설정만 한다', async () => {
      const session = makeSession({ lastUpdatedAt: 0 });

      await repository.accumulateDuration('guild-1', 'user-1', session, TIMESTAMP_PLUS_10);

      const channelDuration = await redisClient.get(
        VoiceKeys.channelDuration('guild-1', 'user-1', '20260318', 'ch-1'),
      );
      expect(channelDuration).toBeNull();
    });
  });

  describe('채널명 / 유저명 캐시', () => {
    it('채널명을 저장하고 조회한다', async () => {
      await repository.setChannelName('guild-1', 'ch-1', 'General');

      const name = await repository.getChannelName('guild-1', 'ch-1');
      expect(name).toBe('General');
    });

    it('유저명을 저장하고 조회한다', async () => {
      await repository.setUserName('guild-1', 'user-1', 'Alice');

      const name = await repository.getUserName('guild-1', 'user-1');
      expect(name).toBe('Alice');
    });

    it('MGET으로 여러 유저명을 일괄 조회한다', async () => {
      await repository.setUserName('guild-1', 'user-1', 'Alice');
      await repository.setUserName('guild-1', 'user-2', 'Bob');

      const names = await repository.getUserNames('guild-1', ['user-1', 'user-2', 'user-3']);
      expect(names.get('user-1')).toBe('Alice');
      expect(names.get('user-2')).toBe('Bob');
      expect(names.get('user-3')).toBeNull();
    });

    it('MGET으로 여러 채널명을 일괄 조회한다', async () => {
      await repository.setChannelName('guild-1', 'ch-1', 'General');

      const names = await repository.getChannelNames('guild-1', ['ch-1', 'ch-missing']);
      expect(names.get('ch-1')).toBe('General');
      expect(names.get('ch-missing')).toBeNull();
    });

    it('카테고리 정보를 저장하고 조회한다', async () => {
      await repository.setCategoryInfo('guild-1', 'ch-1', 'cat-1', 'Voice Channels');

      const info = await repository.getCategoryInfo('guild-1', 'ch-1');
      expect(info).toEqual({ categoryId: 'cat-1', categoryName: 'Voice Channels' });
    });
  });
});
