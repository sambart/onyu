import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';

import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { RedisService } from '../../../redis/redis.service';
import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import { VoiceKeys } from '../infrastructure/voice-cache.keys';
import { VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';
import { VoiceDailyRepository } from '../infrastructure/voice-daily.repository';
import { VoiceRedisRepository } from '../infrastructure/voice-redis.repository';
import { VoiceDailyFlushService } from './voice-daily-flush-service';

const GUILD = 'guild-flush-1';
const USER = 'user-flush-1';
const DATE = '20260318';
const CHANNEL_A = 'ch-001';
const CHANNEL_B = 'ch-002';
const CHANNEL_A_DURATION_SEC = 180;
const CHANNEL_B_DURATION_SEC = 240;
const MIC_ON_DURATION_SEC = 600;
const MIC_OFF_DURATION_SEC = 120;
const MIC_ON_AND_OFF_DURATION_SEC = 400;
const MIC_ON_AND_OFF_OFF_DURATION_SEC = 200;
const ALONE_DURATION_SEC = 90;
const STREAMING_DURATION_SEC = 150;
const VIDEO_DURATION_SEC = 75;

describe('VoiceDailyFlushService (Integration)', () => {
  let module: TestingModule;
  let service: VoiceDailyFlushService;
  let redisService: RedisService;
  let redisClient: Redis;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [VoiceDailyOrm],
      providers: [VoiceDailyFlushService, VoiceDailyRepository, VoiceRedisRepository],
    }).compile();

    service = module.get(VoiceDailyFlushService);
    redisService = module.get(RedisService);
    redisClient = module.get(REDIS_CLIENT);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
    await cleanRedis(redisClient);
  });

  describe('flushDate — 채널 duration', () => {
    it('Redis에 채널 duration을 설정한 후 flushDate 호출 시 DB에 레코드가 생성된다', async () => {
      // Redis에 채널 duration 설정
      const key = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_A);
      await redisClient.set(key, '300');

      await service.flushDate(GUILD, USER, DATE);

      const records = await dataSource.getRepository(VoiceDailyOrm).find();
      expect(records).toHaveLength(1);
      expect(records[0].guildId).toBe(GUILD);
      expect(records[0].userId).toBe(USER);
      expect(records[0].date).toBe(DATE);
      expect(records[0].channelId).toBe(CHANNEL_A);
      expect(records[0].channelDurationSec).toBe(300);
    });

    it('여러 채널의 duration은 각각 별도 DB 레코드로 생성된다', async () => {
      const keyA = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_A);
      const keyB = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_B);
      await redisClient.set(keyA, String(CHANNEL_A_DURATION_SEC));
      await redisClient.set(keyB, String(CHANNEL_B_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const records = await dataSource
        .getRepository(VoiceDailyOrm)
        .find({ where: { guildId: GUILD, userId: USER, date: DATE } });

      const channelIds = records.map((r) => r.channelId).sort();
      expect(channelIds).toContain(CHANNEL_A);
      expect(channelIds).toContain(CHANNEL_B);

      const recA = records.find((r) => r.channelId === CHANNEL_A);
      const recB = records.find((r) => r.channelId === CHANNEL_B);
      expect(recA.channelDurationSec).toBe(CHANNEL_A_DURATION_SEC);
      expect(recB.channelDurationSec).toBe(CHANNEL_B_DURATION_SEC);
    });

    it('duration이 0인 채널 키는 DB에 저장되지 않는다', async () => {
      const key = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_A);
      await redisClient.set(key, '0');

      await service.flushDate(GUILD, USER, DATE);

      const records = await dataSource.getRepository(VoiceDailyOrm).find();
      // GLOBAL 레코드도 없어야 하며, 채널 레코드도 없어야 한다
      const channelRecords = records.filter((r) => r.channelId === CHANNEL_A);
      expect(channelRecords).toHaveLength(0);
    });
  });

  describe('flushDate — 마이크 ON/OFF duration', () => {
    it('mic on duration이 Redis에 있으면 DB GLOBAL 레코드의 micOnSec에 저장된다', async () => {
      const micOnKey = VoiceKeys.micDuration(GUILD, USER, DATE, 'on');
      await redisClient.set(micOnKey, String(MIC_ON_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record).not.toBeNull();
      expect(record.micOnSec).toBe(MIC_ON_DURATION_SEC);
      expect(record.micOffSec).toBe(0);
    });

    it('mic off duration이 Redis에 있으면 DB GLOBAL 레코드의 micOffSec에 저장된다', async () => {
      const micOffKey = VoiceKeys.micDuration(GUILD, USER, DATE, 'off');
      await redisClient.set(micOffKey, String(MIC_OFF_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record).not.toBeNull();
      expect(record.micOffSec).toBe(MIC_OFF_DURATION_SEC);
      expect(record.micOnSec).toBe(0);
    });

    it('mic on과 off를 모두 설정하면 각각 누적되어 GLOBAL 레코드에 저장된다', async () => {
      const micOnKey = VoiceKeys.micDuration(GUILD, USER, DATE, 'on');
      const micOffKey = VoiceKeys.micDuration(GUILD, USER, DATE, 'off');
      await redisClient.set(micOnKey, String(MIC_ON_AND_OFF_DURATION_SEC));
      await redisClient.set(micOffKey, String(MIC_ON_AND_OFF_OFF_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record.micOnSec).toBe(MIC_ON_AND_OFF_DURATION_SEC);
      expect(record.micOffSec).toBe(MIC_ON_AND_OFF_OFF_DURATION_SEC);
    });
  });

  describe('flushDate — 기타 duration (alone, streaming, video, deaf)', () => {
    it('alone duration이 Redis에 있으면 DB GLOBAL 레코드의 aloneSec에 저장된다', async () => {
      const aloneKey = VoiceKeys.aloneDuration(GUILD, USER, DATE);
      await redisClient.set(aloneKey, String(ALONE_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record.aloneSec).toBe(ALONE_DURATION_SEC);
    });

    it('streaming duration이 Redis에 있으면 DB GLOBAL 레코드의 streamingSec에 저장된다', async () => {
      const streamingKey = VoiceKeys.streamingDuration(GUILD, USER, DATE);
      await redisClient.set(streamingKey, String(STREAMING_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record.streamingSec).toBe(STREAMING_DURATION_SEC);
    });

    it('video duration이 Redis에 있으면 DB GLOBAL 레코드의 videoOnSec에 저장된다', async () => {
      const videoKey = VoiceKeys.videoDuration(GUILD, USER, DATE);
      await redisClient.set(videoKey, String(VIDEO_DURATION_SEC));

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record.videoOnSec).toBe(VIDEO_DURATION_SEC);
    });

    it('deaf duration이 Redis에 있으면 DB GLOBAL 레코드의 deafSec에 저장된다', async () => {
      const deafKey = VoiceKeys.deafDuration(GUILD, USER, DATE);
      await redisClient.set(deafKey, '50');

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: 'GLOBAL' });
      expect(record.deafSec).toBe(50);
    });
  });

  describe('flushDate — Redis 키 삭제', () => {
    it('채널 duration 키는 flushDate 후 Redis에서 삭제된다', async () => {
      const key = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_A);
      await redisClient.set(key, '300');

      await service.flushDate(GUILD, USER, DATE);

      const remaining = await redisClient.get(key);
      expect(remaining).toBeNull();
    });

    it('mic on/off, alone, streaming, video, deaf 키는 flushDate 후 Redis에서 삭제된다', async () => {
      const micOnKey = VoiceKeys.micDuration(GUILD, USER, DATE, 'on');
      const micOffKey = VoiceKeys.micDuration(GUILD, USER, DATE, 'off');
      const aloneKey = VoiceKeys.aloneDuration(GUILD, USER, DATE);
      const streamingKey = VoiceKeys.streamingDuration(GUILD, USER, DATE);
      const videoKey = VoiceKeys.videoDuration(GUILD, USER, DATE);
      const deafKey = VoiceKeys.deafDuration(GUILD, USER, DATE);

      await redisClient.set(micOnKey, '100');
      await redisClient.set(micOffKey, '200');
      await redisClient.set(aloneKey, '50');
      await redisClient.set(streamingKey, '80');
      await redisClient.set(videoKey, '30');
      await redisClient.set(deafKey, '60');

      await service.flushDate(GUILD, USER, DATE);

      const results = await Promise.all([
        redisClient.get(micOnKey),
        redisClient.get(micOffKey),
        redisClient.get(aloneKey),
        redisClient.get(streamingKey),
        redisClient.get(videoKey),
        redisClient.get(deafKey),
      ]);

      for (const val of results) {
        expect(val).toBeNull();
      }
    });

    it('Redis에 데이터가 없으면 flushDate를 호출해도 DB 레코드가 생성되지 않는다', async () => {
      await service.flushDate(GUILD, USER, DATE);

      const records = await dataSource.getRepository(VoiceDailyOrm).find();
      expect(records).toHaveLength(0);
    });
  });

  describe('flushDate — channelName/userName 캐시', () => {
    it('Redis에 채널명 캐시가 있으면 DB 레코드의 channelName에 저장된다', async () => {
      const channelKey = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_A);
      await redisClient.set(channelKey, '300');
      // channelName 캐시 설정 (RedisService.set은 JSON.stringify를 사용)
      await redisService.set(VoiceKeys.channelName(GUILD, CHANNEL_A), '일반 채널');
      await redisService.set(VoiceKeys.userName(GUILD, USER), '테스트유저');

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: CHANNEL_A });
      expect(record.channelName).toBe('일반 채널');
      expect(record.userName).toBe('테스트유저');
    });

    it('Redis에 채널명 캐시가 없으면 channelName이 UNKNOWN으로 저장된다', async () => {
      const channelKey = VoiceKeys.channelDuration(GUILD, USER, DATE, CHANNEL_A);
      await redisClient.set(channelKey, '300');

      await service.flushDate(GUILD, USER, DATE);

      const record = await dataSource
        .getRepository(VoiceDailyOrm)
        .findOneBy({ guildId: GUILD, userId: USER, date: DATE, channelId: CHANNEL_A });
      expect(record.channelName).toBe('UNKNOWN');
    });
  });
});
