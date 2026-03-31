import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { RedisService } from '../../../redis/redis.service';
import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import { AutoChannelRedisRepository } from './auto-channel-redis.repository';
import type { AutoChannelConfirmedState } from './auto-channel-state';

function makeState(overrides: Partial<AutoChannelConfirmedState> = {}): AutoChannelConfirmedState {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    configId: 1,
    buttonId: 10,
    ...overrides,
  };
}

describe('AutoChannelRedisRepository (Integration)', () => {
  let module: TestingModule;
  let repository: AutoChannelRedisRepository;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      providers: [RedisService, AutoChannelRedisRepository],
    }).compile();

    repository = module.get(AutoChannelRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('setConfirmedState / getConfirmedState', () => {
    it('확정방 상태를 저장하고 동일하게 조회한다', async () => {
      const state = makeState();

      await repository.setConfirmedState('ch-1', state);

      const result = await repository.getConfirmedState('ch-1');
      expect(result).not.toBeNull();
      expect(result!.guildId).toBe('guild-1');
      expect(result!.userId).toBe('user-1');
      expect(result!.buttonId).toBe(10);
    });

    it('subOptionId가 있는 상태도 저장/조회된다', async () => {
      const state = makeState({ subOptionId: 42 });

      await repository.setConfirmedState('ch-1', state);

      const result = await repository.getConfirmedState('ch-1');
      expect(result!.subOptionId).toBe(42);
    });

    it('subOptionId가 없으면 undefined로 조회된다', async () => {
      const state = makeState();

      await repository.setConfirmedState('ch-1', state);

      const result = await repository.getConfirmedState('ch-1');
      expect(result!.subOptionId).toBeUndefined();
    });

    it('저장하지 않은 channelId이면 null을 반환한다', async () => {
      const result = await repository.getConfirmedState('ch-no-data');

      expect(result).toBeNull();
    });

    it('TTL이 설정된다', async () => {
      const twelveHoursInSeconds = 60 * 60 * 12;
      await repository.setConfirmedState('ch-1', makeState());

      const ttl = await redisClient.ttl('auto_channel:confirmed:ch-1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(twelveHoursInSeconds);
    });

    it('다른 channelId는 독립적으로 저장된다', async () => {
      const state1 = makeState({ guildId: 'guild-1', userId: 'user-1' });
      const state2 = makeState({ guildId: 'guild-2', userId: 'user-2' });

      await repository.setConfirmedState('ch-1', state1);
      await repository.setConfirmedState('ch-2', state2);

      const result1 = await repository.getConfirmedState('ch-1');
      const result2 = await repository.getConfirmedState('ch-2');

      expect(result1!.userId).toBe('user-1');
      expect(result2!.userId).toBe('user-2');
    });

    it('같은 channelId로 덮어쓰면 최신 상태로 갱신된다', async () => {
      await repository.setConfirmedState('ch-1', makeState({ buttonId: 10 }));
      await repository.setConfirmedState('ch-1', makeState({ buttonId: 20 }));

      const result = await repository.getConfirmedState('ch-1');
      expect(result!.buttonId).toBe(20);
    });
  });

  describe('deleteConfirmedState', () => {
    it('삭제 후 getConfirmedState가 null을 반환한다', async () => {
      await repository.setConfirmedState('ch-1', makeState());

      await repository.deleteConfirmedState('ch-1');

      const result = await repository.getConfirmedState('ch-1');
      expect(result).toBeNull();
    });

    it('존재하지 않는 키를 삭제해도 오류가 발생하지 않는다', async () => {
      await expect(repository.deleteConfirmedState('ch-no-exist')).resolves.not.toThrow();
    });

    it('다른 channelId의 상태는 삭제되지 않는다', async () => {
      await repository.setConfirmedState('ch-1', makeState());
      await repository.setConfirmedState('ch-2', makeState());

      await repository.deleteConfirmedState('ch-1');

      const result2 = await repository.getConfirmedState('ch-2');
      expect(result2).not.toBeNull();
    });
  });
});
