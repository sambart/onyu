import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import { VoiceGameRedisRepository } from './voice-game-redis.repository';
import type { VoiceGameSession } from './voice-game-session';

function makeGameSession(overrides: Partial<VoiceGameSession> = {}): VoiceGameSession {
  return {
    gameName: 'Valorant',
    applicationId: 'app-valorant',
    startedAt: 1710720000000,
    channelId: 'ch-1',
    ...overrides,
  };
}

describe('VoiceGameRedisRepository (Integration)', () => {
  let module: TestingModule;
  let repository: VoiceGameRedisRepository;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      providers: [VoiceGameRedisRepository],
    }).compile();

    repository = module.get(VoiceGameRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  describe('setGameSession / getGameSession / deleteGameSession', () => {
    it('게임 세션을 저장하고 조회한다', async () => {
      const session = makeGameSession();
      await repository.setGameSession('guild-1', 'user-1', session);

      const result = await repository.getGameSession('guild-1', 'user-1');
      expect(result).toEqual(session);
    });

    it('세션이 없으면 null을 반환한다', async () => {
      const result = await repository.getGameSession('guild-1', 'non-existent');
      expect(result).toBeNull();
    });

    it('세션을 삭제한다', async () => {
      await repository.setGameSession('guild-1', 'user-1', makeGameSession());
      await repository.deleteGameSession('guild-1', 'user-1');

      const result = await repository.getGameSession('guild-1', 'user-1');
      expect(result).toBeNull();
    });

    it('applicationId가 null인 세션도 저장한다', async () => {
      const session = makeGameSession({ applicationId: null });
      await repository.setGameSession('guild-1', 'user-1', session);

      const result = await repository.getGameSession('guild-1', 'user-1');
      expect(result.applicationId).toBeNull();
    });
  });

  describe('scanAllSessionKeys', () => {
    it('모든 게임 세션 키를 반환한다', async () => {
      await repository.setGameSession('guild-1', 'user-1', makeGameSession());
      await repository.setGameSession('guild-1', 'user-2', makeGameSession({ gameName: 'LoL' }));
      await repository.setGameSession(
        'guild-2',
        'user-3',
        makeGameSession({ gameName: 'Overwatch' }),
      );

      const keys = await repository.scanAllSessionKeys();
      expect(keys).toHaveLength(3);
    });

    it('게임 세션이 없으면 빈 배열을 반환한다', async () => {
      const keys = await repository.scanAllSessionKeys();
      expect(keys).toHaveLength(0);
    });
  });
});
