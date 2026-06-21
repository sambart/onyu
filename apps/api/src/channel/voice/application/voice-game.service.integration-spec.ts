import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';

import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import { VoiceGameActivityOrm } from '../infrastructure/voice-game-activity.orm-entity';
import { VoiceGameDailyOrm } from '../infrastructure/voice-game-daily.orm-entity';
import { VoiceGameDbRepository } from '../infrastructure/voice-game-db.repository';
import { VoiceGameRedisRepository } from '../infrastructure/voice-game-redis.repository';
import type { VoiceGameSession } from '../infrastructure/voice-game-session';
import { VoiceGameService } from './voice-game.service';

const GUILD = 'guild-game-1';
const USER = 'user-game-1';
const CHANNEL = 'ch-game-001';
const GAME_NAME = 'Valorant';
const APP_ID = 'app-valorant';

const OVER_1_MIN_AGO_MS = 90_000; // 90초 전 (1분 초과)
const UNDER_1_MIN_AGO_MS = 30_000; // 30초 전 (1분 미만)

/** 1분 이상 경과 세션 — startedAt을 충분히 과거로 설정 */
function makeSessionOver1Min(overrides: Partial<VoiceGameSession> = {}): VoiceGameSession {
  return {
    gameName: GAME_NAME,
    applicationId: APP_ID,
    startedAt: Date.now() - OVER_1_MIN_AGO_MS,
    channelId: CHANNEL,
    ...overrides,
  };
}

/** 1분 미만 세션 */
function makeSessionUnder1Min(overrides: Partial<VoiceGameSession> = {}): VoiceGameSession {
  return {
    gameName: GAME_NAME,
    applicationId: APP_ID,
    startedAt: Date.now() - UNDER_1_MIN_AGO_MS,
    channelId: CHANNEL,
    ...overrides,
  };
}

describe('VoiceGameService (Integration)', () => {
  let module: TestingModule;
  let service: VoiceGameService;
  let redisRepo: VoiceGameRedisRepository;
  let redisClient: Redis;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [VoiceGameActivityOrm, VoiceGameDailyOrm],
      providers: [VoiceGameService, VoiceGameRedisRepository, VoiceGameDbRepository],
    }).compile();

    service = module.get(VoiceGameService);
    redisRepo = module.get(VoiceGameRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
    await cleanRedis(redisClient);
  });

  describe('onUserJoined', () => {
    it('음성 입장 시 Redis에 게임 세션이 생성된다', async () => {
      await service.onUserJoined(GUILD, USER, CHANNEL, {
        gameName: GAME_NAME,
        applicationId: APP_ID,
      });
      const session = await redisRepo.getGameSession(GUILD, USER);
      expect(session).not.toBeNull();
      expect(session.gameName).toBe(GAME_NAME);
      expect(session.applicationId).toBe(APP_ID);
      expect(session.channelId).toBe(CHANNEL);
      expect(session.startedAt).toBeGreaterThan(0);
    });

    it('applicationId가 null인 경우에도 세션이 생성된다', async () => {
      await service.onUserJoined(GUILD, USER, CHANNEL, {
        gameName: GAME_NAME,
        applicationId: null,
      });
      const session = await redisRepo.getGameSession(GUILD, USER);
      expect(session).not.toBeNull();
      expect(session.applicationId).toBeNull();
    });
  });

  describe('onUserLeft', () => {
    it('1분 이상 게임 세션이 있을 때 onUserLeft를 호출하면 DB에 activity와 daily가 저장된다', async () => {
      const session = makeSessionOver1Min();
      await redisRepo.setGameSession(GUILD, USER, session);

      await service.onUserLeft(GUILD, USER);

      const activities = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(activities).toHaveLength(1);
      expect(activities[0].guildId).toBe(GUILD);
      expect(activities[0].userId).toBe(USER);
      expect(activities[0].gameName).toBe(GAME_NAME);
      expect(activities[0].durationMin).toBeGreaterThanOrEqual(1);

      const dailies = await dataSource.getRepository(VoiceGameDailyOrm).find();
      expect(dailies).toHaveLength(1);
      expect(dailies[0].gameName).toBe(GAME_NAME);
      expect(dailies[0].totalMinutes).toBeGreaterThanOrEqual(1);
      expect(dailies[0].sessionCount).toBe(1);
    });

    it('1분 미만 세션은 DB에 저장되지 않는다', async () => {
      const session = makeSessionUnder1Min();
      await redisRepo.setGameSession(GUILD, USER, session);

      await service.onUserLeft(GUILD, USER);

      const activities = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(activities).toHaveLength(0);

      const dailies = await dataSource.getRepository(VoiceGameDailyOrm).find();
      expect(dailies).toHaveLength(0);
    });

    it('1분 미만 세션이라도 onUserLeft 후 Redis 키는 삭제된다', async () => {
      const session = makeSessionUnder1Min();
      await redisRepo.setGameSession(GUILD, USER, session);

      await service.onUserLeft(GUILD, USER);

      const remaining = await redisRepo.getGameSession(GUILD, USER);
      expect(remaining).toBeNull();
    });

    it('Redis에 세션이 없으면 아무것도 저장되지 않는다', async () => {
      await service.onUserLeft(GUILD, USER);

      const activities = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(activities).toHaveLength(0);
    });
  });

  describe('endSession', () => {
    it('1분 이상 세션을 endSession으로 종료하면 activity INSERT + daily UPSERT 후 Redis 키가 삭제된다', async () => {
      const session = makeSessionOver1Min();
      await redisRepo.setGameSession(GUILD, USER, session);

      await service.endSession(GUILD, USER, session);

      const activities = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(activities).toHaveLength(1);
      expect(activities[0].channelId).toBe(CHANNEL);

      const dailies = await dataSource.getRepository(VoiceGameDailyOrm).find();
      expect(dailies).toHaveLength(1);
      expect(dailies[0].sessionCount).toBe(1);

      const redisSession = await redisRepo.getGameSession(GUILD, USER);
      expect(redisSession).toBeNull();
    });

    it('같은 게임을 두 번 endSession하면 daily의 totalMinutes와 sessionCount가 누적된다', async () => {
      const session1 = makeSessionOver1Min();
      await redisRepo.setGameSession(GUILD, USER, session1);
      await service.endSession(GUILD, USER, session1);

      const session2 = makeSessionOver1Min();
      await redisRepo.setGameSession(GUILD, USER, session2);
      await service.endSession(GUILD, USER, session2);

      const dailies = await dataSource.getRepository(VoiceGameDailyOrm).find();
      expect(dailies).toHaveLength(1);
      expect(dailies[0].sessionCount).toBe(2);
      expect(dailies[0].totalMinutes).toBeGreaterThanOrEqual(2);
    });

    it('1분 미만 세션은 endSession 호출 시 DB 저장 없이 Redis 키만 삭제된다', async () => {
      const session = makeSessionUnder1Min();
      await redisRepo.setGameSession(GUILD, USER, session);

      await service.endSession(GUILD, USER, session);

      const activities = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(activities).toHaveLength(0);

      const redisSession = await redisRepo.getGameSession(GUILD, USER);
      expect(redisSession).toBeNull();
    });
  });

  describe('endAllSessions', () => {
    it('여러 유저의 세션을 endAllSessions로 일괄 종료하면 각 유저의 activity가 저장된다', async () => {
      const user2 = 'user-game-2';
      const session1 = makeSessionOver1Min();
      const session2 = makeSessionOver1Min({ gameName: 'League of Legends', applicationId: null });
      await redisRepo.setGameSession(GUILD, USER, session1);
      await redisRepo.setGameSession(GUILD, user2, session2);

      await service.endAllSessions();

      const activities = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(activities).toHaveLength(2);

      const keys = await redisRepo.scanAllSessionKeys();
      expect(keys).toHaveLength(0);
    });
  });
});
