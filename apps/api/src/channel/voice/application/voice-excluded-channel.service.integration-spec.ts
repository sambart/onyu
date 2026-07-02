import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';

import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { RedisService } from '../../../redis/redis.service';
import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import { VoiceExcludedChannelType } from '../domain/voice-excluded-channel.types';
import { VoiceKeys } from '../infrastructure/voice-cache.keys';
import { VoiceExcludedChannelOrm } from '../infrastructure/voice-excluded-channel.orm-entity';
import { VoiceExcludedChannelRepository } from '../infrastructure/voice-excluded-channel.repository';
import { VoiceExcludedChannelService } from './voice-excluded-channel.service';

const GUILD = 'guild-excluded-1';
const CHANNEL_A = 'ch-excluded-001';
const CHANNEL_B = 'ch-excluded-002';
const CATEGORY_A = 'cat-excluded-001';

describe('VoiceExcludedChannelService (Integration)', () => {
  let module: TestingModule;
  let service: VoiceExcludedChannelService;
  let dataSource: DataSource;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [VoiceExcludedChannelOrm],
      providers: [VoiceExcludedChannelService, VoiceExcludedChannelRepository, RedisService],
    }).compile();

    service = module.get(VoiceExcludedChannelService);
    dataSource = module.get(DataSource);
    redisClient = module.get<Redis>(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
    await cleanRedis(redisClient);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('getExcludedChannels', () => {
    it('최초 조회 시 DB에서 가져오고 Redis 캐시에 저장한다', async () => {
      // DB에 레코드 직접 삽입
      await dataSource.getRepository(VoiceExcludedChannelOrm).save([
        { guildId: GUILD, discordChannelId: CHANNEL_A, type: VoiceExcludedChannelType.CHANNEL },
        { guildId: GUILD, discordChannelId: CHANNEL_B, type: VoiceExcludedChannelType.CHANNEL },
      ]);

      const result = await service.getExcludedChannels(GUILD);

      // 서비스 반환값 검증
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.discordChannelId).sort()).toEqual([CHANNEL_A, CHANNEL_B].sort());

      // Redis 캐시가 채워졌는지 확인
      const cached = await redisClient.get(VoiceKeys.excludedChannels(GUILD));
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached) as VoiceExcludedChannelOrm[];
      expect(parsed).toHaveLength(2);
    });

    it('두 번째 호출 시 캐시에서 반환한다', async () => {
      // DB에 레코드 삽입 후 첫 번째 호출로 캐시 워밍
      await dataSource
        .getRepository(VoiceExcludedChannelOrm)
        .save([
          { guildId: GUILD, discordChannelId: CHANNEL_A, type: VoiceExcludedChannelType.CHANNEL },
        ]);
      await service.getExcludedChannels(GUILD);

      // DB 레코드를 직접 추가 (캐시를 우회한 변경)
      await dataSource
        .getRepository(VoiceExcludedChannelOrm)
        .save([
          { guildId: GUILD, discordChannelId: CHANNEL_B, type: VoiceExcludedChannelType.CHANNEL },
        ]);

      // 두 번째 호출은 캐시에서 반환해야 하므로 DB 변경이 반영되지 않음
      const result = await service.getExcludedChannels(GUILD);
      expect(result).toHaveLength(1);
      expect(result[0].discordChannelId).toBe(CHANNEL_A);
    });
  });

  describe('saveExcludedChannel', () => {
    it('DB에 저장 후 해당 길드의 캐시를 무효화한다', async () => {
      // 캐시를 미리 채워놓음
      await redisClient.set(
        VoiceKeys.excludedChannels(GUILD),
        JSON.stringify([{ discordChannelId: 'stale', type: VoiceExcludedChannelType.CHANNEL }]),
      );

      await service.saveExcludedChannel(GUILD, {
        channelId: CHANNEL_A,
        type: VoiceExcludedChannelType.CHANNEL,
      });

      // DB에 레코드가 생성됐는지 확인
      const records = await dataSource.getRepository(VoiceExcludedChannelOrm).find();
      expect(records).toHaveLength(1);
      expect(records[0].discordChannelId).toBe(CHANNEL_A);
      expect(records[0].guildId).toBe(GUILD);

      // 캐시가 무효화됐는지 확인
      const cached = await redisClient.get(VoiceKeys.excludedChannels(GUILD));
      expect(cached).toBeNull();
    });
  });

  describe('deleteExcludedChannel', () => {
    it('DB 삭제 후 캐시를 무효화한다', async () => {
      // DB에 레코드 삽입
      const [record] = await dataSource
        .getRepository(VoiceExcludedChannelOrm)
        .save([
          { guildId: GUILD, discordChannelId: CHANNEL_A, type: VoiceExcludedChannelType.CHANNEL },
        ]);

      // 캐시를 미리 채워놓음
      await redisClient.set(VoiceKeys.excludedChannels(GUILD), JSON.stringify([record]));

      await service.deleteExcludedChannel(GUILD, record.id);

      // DB에서 삭제됐는지 확인
      const records = await dataSource.getRepository(VoiceExcludedChannelOrm).find();
      expect(records).toHaveLength(0);

      // 캐시가 무효화됐는지 확인
      const cached = await redisClient.get(VoiceKeys.excludedChannels(GUILD));
      expect(cached).toBeNull();
    });
  });

  describe('syncExcludedChannels', () => {
    it('벌크 동기화 후 새 목록으로 캐시를 갱신한다', async () => {
      // 기존 레코드 삽입
      await dataSource.getRepository(VoiceExcludedChannelOrm).save([
        {
          guildId: GUILD,
          discordChannelId: 'old-channel',
          type: VoiceExcludedChannelType.CHANNEL,
        },
      ]);

      const result = await service.syncExcludedChannels(GUILD, {
        channels: [
          { channelId: CHANNEL_A, type: VoiceExcludedChannelType.CHANNEL },
          { channelId: CATEGORY_A, type: VoiceExcludedChannelType.CATEGORY },
        ],
      });

      // 반환값 검증
      expect(result).toHaveLength(2);

      // DB가 새 목록으로 교체됐는지 확인 (old-channel은 사라져야 함)
      const records = await dataSource.getRepository(VoiceExcludedChannelOrm).find({
        where: { guildId: GUILD },
      });
      expect(records).toHaveLength(2);
      const channelIds = records.map((r) => r.discordChannelId).sort();
      expect(channelIds).toEqual([CATEGORY_A, CHANNEL_A].sort());

      // 캐시가 새 목록으로 채워졌는지 확인
      const cached = await redisClient.get(VoiceKeys.excludedChannels(GUILD));
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached) as VoiceExcludedChannelOrm[];
      expect(parsed).toHaveLength(2);
    });

    it('빈 목록으로 동기화하면 DB와 캐시가 모두 비워진다', async () => {
      // 기존 레코드 삽입
      await dataSource
        .getRepository(VoiceExcludedChannelOrm)
        .save([
          { guildId: GUILD, discordChannelId: CHANNEL_A, type: VoiceExcludedChannelType.CHANNEL },
        ]);
      // 캐시도 채워놓음
      await redisClient.set(
        VoiceKeys.excludedChannels(GUILD),
        JSON.stringify([{ discordChannelId: CHANNEL_A }]),
      );

      const result = await service.syncExcludedChannels(GUILD, { channels: [] });

      expect(result).toHaveLength(0);

      const records = await dataSource.getRepository(VoiceExcludedChannelOrm).find({
        where: { guildId: GUILD },
      });
      expect(records).toHaveLength(0);

      // 빈 목록이므로 캐시는 저장되지 않고 무효화됨
      const cached = await redisClient.get(VoiceKeys.excludedChannels(GUILD));
      expect(cached).toBeNull();
    });
  });

  describe('isExcludedChannel', () => {
    beforeEach(async () => {
      await dataSource.getRepository(VoiceExcludedChannelOrm).save([
        { guildId: GUILD, discordChannelId: CHANNEL_A, type: VoiceExcludedChannelType.CHANNEL },
        { guildId: GUILD, discordChannelId: CATEGORY_A, type: VoiceExcludedChannelType.CATEGORY },
      ]);
    });

    it('CHANNEL 타입으로 등록된 채널 ID와 정확히 일치하면 true를 반환한다', async () => {
      const result = await service.isExcludedChannel(GUILD, CHANNEL_A, null);
      expect(result).toBe(true);
    });

    it('CATEGORY 타입으로 등록된 카테고리 ID가 parentCategoryId와 일치하면 true를 반환한다', async () => {
      const result = await service.isExcludedChannel(GUILD, 'some-voice-channel', CATEGORY_A);
      expect(result).toBe(true);
    });

    it('등록되지 않은 채널과 카테고리이면 false를 반환한다', async () => {
      const result = await service.isExcludedChannel(GUILD, 'unknown-ch', 'unknown-cat');
      expect(result).toBe(false);
    });

    it('조회 후 Redis 캐시가 채워진다', async () => {
      await service.isExcludedChannel(GUILD, CHANNEL_A, null);

      const cached = await redisClient.get(VoiceKeys.excludedChannels(GUILD));
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached) as VoiceExcludedChannelOrm[];
      expect(parsed.length).toBeGreaterThan(0);
    });
  });
});
