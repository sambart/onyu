import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanRedis } from '../../test-utils/redis-cleaner';
import { StatusPrefixButtonType } from '../domain/status-prefix.types';
import { StatusPrefixButtonOrm } from './status-prefix-button.orm-entity';
import { StatusPrefixConfigOrm } from './status-prefix-config.orm-entity';
import { StatusPrefixRedisRepository } from './status-prefix-redis.repository';

function makeButtonOrm(overrides: Partial<StatusPrefixButtonOrm> = {}): StatusPrefixButtonOrm {
  const button = new StatusPrefixButtonOrm();
  button.id = 1;
  button.configId = 1;
  button.label = '게임';
  button.emoji = null;
  button.prefix = '게임';
  button.type = StatusPrefixButtonType.PREFIX;
  button.sortOrder = 0;
  button.createdAt = new Date();
  button.updatedAt = new Date();
  return Object.assign(button, overrides);
}

function makeConfigOrm(overrides: Partial<StatusPrefixConfigOrm> = {}): StatusPrefixConfigOrm {
  const config = new StatusPrefixConfigOrm();
  config.id = 1;
  config.guildId = 'guild-1';
  config.enabled = true;
  config.channelId = 'ch-1';
  config.messageId = null;
  config.embedTitle = '상태 설정';
  config.embedDescription = null;
  config.embedColor = null;
  config.prefixTemplate = '[{prefix}] {nickname}';
  config.buttons = [makeButtonOrm()];
  config.createdAt = new Date();
  config.updatedAt = new Date();
  return Object.assign(config, overrides);
}

describe('StatusPrefixRedisRepository (Integration)', () => {
  let module: TestingModule;
  let repository: StatusPrefixRedisRepository;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      providers: [RedisService, StatusPrefixRedisRepository],
    }).compile();

    repository = module.get(StatusPrefixRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('setOriginalNicknameNx / getOriginalNickname', () => {
    it('최초 저장 시 true를 반환하고 값이 저장된다', async () => {
      const result = await repository.setOriginalNicknameNx('guild-1', 'member-1', '디하윤');

      expect(result).toBe(true);

      const value = await repository.getOriginalNickname('guild-1', 'member-1');
      expect(value).toBe('디하윤');
    });

    it('이미 존재하면 false를 반환하고 기존 값이 보존된다', async () => {
      await repository.setOriginalNicknameNx('guild-1', 'member-1', '원래닉');
      const result = await repository.setOriginalNicknameNx('guild-1', 'member-1', '새닉');

      expect(result).toBe(false);

      const value = await repository.getOriginalNickname('guild-1', 'member-1');
      expect(value).toBe('원래닉');
    });

    it('저장하지 않은 키는 null을 반환한다', async () => {
      const value = await repository.getOriginalNickname('guild-no-data', 'member-no-data');

      expect(value).toBeNull();
    });

    it('다른 (guildId, memberId) 조합은 독립적으로 저장된다', async () => {
      await repository.setOriginalNicknameNx('guild-1', 'member-1', '닉1');
      await repository.setOriginalNicknameNx('guild-1', 'member-2', '닉2');
      await repository.setOriginalNicknameNx('guild-2', 'member-1', '닉3');

      expect(await repository.getOriginalNickname('guild-1', 'member-1')).toBe('닉1');
      expect(await repository.getOriginalNickname('guild-1', 'member-2')).toBe('닉2');
      expect(await repository.getOriginalNickname('guild-2', 'member-1')).toBe('닉3');
    });
  });

  describe('deleteOriginalNickname', () => {
    it('삭제 후 getOriginalNickname이 null을 반환한다', async () => {
      await repository.setOriginalNicknameNx('guild-1', 'member-1', '닉네임');

      await repository.deleteOriginalNickname('guild-1', 'member-1');

      const value = await repository.getOriginalNickname('guild-1', 'member-1');
      expect(value).toBeNull();
    });

    it('존재하지 않는 키를 삭제해도 오류가 발생하지 않는다', async () => {
      await expect(
        repository.deleteOriginalNickname('guild-no-exist', 'member-no-exist'),
      ).resolves.not.toThrow();
    });
  });

  describe('setConfig / getConfig', () => {
    it('설정을 저장하고 동일하게 조회한다', async () => {
      const config = makeConfigOrm();

      await repository.setConfig('guild-1', config);

      const result = await repository.getConfig('guild-1');
      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
      expect(result.enabled).toBe(true);
      expect(result.prefixTemplate).toBe('[{prefix}] {nickname}');
    });

    it('JSON 직렬화/역직렬화 후 buttons 배열이 보존된다', async () => {
      const config = makeConfigOrm();

      await repository.setConfig('guild-1', config);

      const result = await repository.getConfig('guild-1');
      expect(result.buttons).toHaveLength(1);
      expect(result.buttons[0].label).toBe('게임');
      expect(result.buttons[0].type).toBe(StatusPrefixButtonType.PREFIX);
    });

    it('저장하지 않은 guildId는 null을 반환한다', async () => {
      const result = await repository.getConfig('guild-no-data');

      expect(result).toBeNull();
    });

    it('TTL이 설정된다', async () => {
      const config = makeConfigOrm();
      await repository.setConfig('guild-1', config);

      const ttl = await redisClient.ttl('status_prefix:config:guild-1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60);
    });
  });

  describe('deleteConfig', () => {
    it('삭제 후 getConfig가 null을 반환한다', async () => {
      await repository.setConfig('guild-1', makeConfigOrm());

      await repository.deleteConfig('guild-1');

      const result = await repository.getConfig('guild-1');
      expect(result).toBeNull();
    });

    it('존재하지 않는 키를 삭제해도 오류가 발생하지 않는다', async () => {
      await expect(repository.deleteConfig('guild-no-exist')).resolves.not.toThrow();
    });
  });
});
