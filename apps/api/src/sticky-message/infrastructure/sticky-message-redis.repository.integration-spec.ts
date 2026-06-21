import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanRedis } from '../../test-utils/redis-cleaner';
import { StickyMessageConfigOrm } from './sticky-message-config.orm-entity';
import { StickyMessageRedisRepository } from './sticky-message-redis.repository';

function makeConfigOrm(overrides: Partial<StickyMessageConfigOrm> = {}): StickyMessageConfigOrm {
  const config = new StickyMessageConfigOrm();
  config.id = 1;
  config.guildId = 'guild-1';
  config.channelId = 'ch-1';
  config.embedTitle = '고정 메시지';
  config.embedDescription = null;
  config.embedColor = null;
  config.messageId = null;
  config.enabled = true;
  config.sortOrder = 0;
  config.createdAt = new Date();
  config.updatedAt = new Date();
  return Object.assign(config, overrides);
}

describe('StickyMessageRedisRepository (Integration)', () => {
  let module: TestingModule;
  let repository: StickyMessageRedisRepository;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      providers: [RedisService, StickyMessageRedisRepository],
    }).compile();

    repository = module.get(StickyMessageRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('setConfig / getConfig', () => {
    it('설정 배열을 저장하고 동일하게 조회한다', async () => {
      const configs = [
        makeConfigOrm({ id: 1, channelId: 'ch-1', sortOrder: 0 }),
        makeConfigOrm({ id: 2, channelId: 'ch-2', sortOrder: 1 }),
      ];

      await repository.setConfig('guild-1', configs);

      const result = await repository.getConfig('guild-1');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result[0].channelId).toBe('ch-1');
      expect(result[1].channelId).toBe('ch-2');
    });

    it('빈 배열도 저장/조회된다', async () => {
      await repository.setConfig('guild-1', []);

      const result = await repository.getConfig('guild-1');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(0);
    });

    it('JSON 직렬화/역직렬화 후 모든 필드가 보존된다', async () => {
      const config = makeConfigOrm({ embedTitle: '제목', embedColor: '#ff0000', enabled: false });

      await repository.setConfig('guild-1', [config]);

      const result = await repository.getConfig('guild-1');
      expect(result[0].embedTitle).toBe('제목');
      expect(result[0].embedColor).toBe('#ff0000');
      expect(result[0].enabled).toBe(false);
    });

    it('저장하지 않은 guildId는 null을 반환한다', async () => {
      const result = await repository.getConfig('guild-no-data');

      expect(result).toBeNull();
    });

    it('TTL이 설정된다', async () => {
      await repository.setConfig('guild-1', [makeConfigOrm()]);

      const ttl = await redisClient.ttl('sticky_message:config:guild-1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60);
    });

    it('다른 guildId는 독립적으로 저장된다', async () => {
      await repository.setConfig('guild-1', [makeConfigOrm({ id: 1, channelId: 'ch-1' })]);
      await repository.setConfig('guild-2', [makeConfigOrm({ id: 2, channelId: 'ch-2' })]);

      const result1 = await repository.getConfig('guild-1');
      const result2 = await repository.getConfig('guild-2');

      expect(result1[0].channelId).toBe('ch-1');
      expect(result2[0].channelId).toBe('ch-2');
    });
  });

  describe('deleteConfig', () => {
    it('삭제 후 getConfig가 null을 반환한다', async () => {
      await repository.setConfig('guild-1', [makeConfigOrm()]);

      await repository.deleteConfig('guild-1');

      const result = await repository.getConfig('guild-1');
      expect(result).toBeNull();
    });

    it('존재하지 않는 키를 삭제해도 오류가 발생하지 않는다', async () => {
      await expect(repository.deleteConfig('guild-no-exist')).resolves.not.toThrow();
    });

    it('다른 guildId의 설정은 삭제되지 않는다', async () => {
      await repository.setConfig('guild-1', [makeConfigOrm()]);
      await repository.setConfig('guild-2', [makeConfigOrm()]);

      await repository.deleteConfig('guild-1');

      const result2 = await repository.getConfig('guild-2');
      expect(result2).not.toBeNull();
    });
  });

  describe('setDebounce / deleteDebounce', () => {
    it('디바운스를 설정하면 키가 존재한다', async () => {
      await repository.setDebounce('ch-1');

      const exists = await redisClient.exists('sticky_message:debounce:ch-1');
      expect(exists).toBe(1);
    });

    it('디바운스 설정 후 TTL이 존재한다', async () => {
      await repository.setDebounce('ch-1');

      const ttl = await redisClient.ttl('sticky_message:debounce:ch-1');
      expect(ttl).toBeGreaterThan(0);
    });

    it('deleteDebounce 후 키가 삭제된다', async () => {
      await repository.setDebounce('ch-1');

      await repository.deleteDebounce('ch-1');

      const exists = await redisClient.exists('sticky_message:debounce:ch-1');
      expect(exists).toBe(0);
    });

    it('존재하지 않는 키를 삭제해도 오류가 발생하지 않는다', async () => {
      await expect(repository.deleteDebounce('ch-no-exist')).resolves.not.toThrow();
    });

    it('다른 channelId는 독립적으로 관리된다', async () => {
      await repository.setDebounce('ch-1');
      await repository.setDebounce('ch-2');

      await repository.deleteDebounce('ch-1');

      const existsCh1 = await redisClient.exists('sticky_message:debounce:ch-1');
      const existsCh2 = await redisClient.exists('sticky_message:debounce:ch-2');

      expect(existsCh1).toBe(0);
      expect(existsCh2).toBe(1);
    });
  });
});
