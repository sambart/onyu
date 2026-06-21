import { MockRedisService } from '../../../test-utils/mock-redis.service';
import { VoiceGameKeys } from './voice-game.keys';
import { VoiceGameRedisRepository } from './voice-game-redis.repository';
import { type VoiceGameSession } from './voice-game-session';

describe('VoiceGameRedisRepository', () => {
  let repo: VoiceGameRedisRepository;
  let redis: MockRedisService;

  beforeEach(() => {
    redis = new MockRedisService();
    repo = new VoiceGameRedisRepository(redis as never);
  });

  afterEach(() => {
    redis.clear();
  });

  const guildId = 'guild-1';
  const userId = 'user-1';

  const sampleSession: VoiceGameSession = {
    gameName: 'League of Legends',
    applicationId: 'app-123',
    startedAt: 1700000000000,
    channelId: 'ch-1',
  };

  describe('getGameSession', () => {
    it('저장된 세션을 조회할 수 있다', async () => {
      await redis.set(VoiceGameKeys.gameSession(guildId, userId), sampleSession);

      const result = await repo.getGameSession(guildId, userId);

      expect(result).toEqual(sampleSession);
    });

    it('세션이 없으면 null을 반환한다', async () => {
      const result = await repo.getGameSession(guildId, userId);

      expect(result).toBeNull();
    });
  });

  describe('setGameSession', () => {
    it('세션을 저장하면 getGameSession으로 조회할 수 있다', async () => {
      await repo.setGameSession(guildId, userId, sampleSession);

      const result = await repo.getGameSession(guildId, userId);

      expect(result).toEqual(sampleSession);
    });

    it('applicationId가 null인 세션도 저장할 수 있다', async () => {
      const sessionWithNullApp: VoiceGameSession = {
        ...sampleSession,
        applicationId: null,
      };

      await repo.setGameSession(guildId, userId, sessionWithNullApp);
      const result = await repo.getGameSession(guildId, userId);

      expect(result).not.toBeNull();
      expect(result.applicationId).toBeNull();
    });

    it('올바른 Redis 키 패턴으로 저장된다', async () => {
      await repo.setGameSession(guildId, userId, sampleSession);

      const expectedKey = VoiceGameKeys.gameSession(guildId, userId);
      const keys = await redis.scanKeys('voice:game:session:*');

      expect(keys).toContain(expectedKey);
    });
  });

  describe('deleteGameSession', () => {
    it('세션을 삭제하면 조회 시 null을 반환한다', async () => {
      await repo.setGameSession(guildId, userId, sampleSession);

      await repo.deleteGameSession(guildId, userId);

      const result = await repo.getGameSession(guildId, userId);
      expect(result).toBeNull();
    });

    it('존재하지 않는 세션 삭제는 에러를 발생시키지 않는다', async () => {
      await expect(repo.deleteGameSession(guildId, userId)).resolves.not.toThrow();
    });
  });

  describe('scanAllSessionKeys', () => {
    it('저장된 모든 게임 세션 키를 반환한다', async () => {
      await repo.setGameSession('guild-1', 'user-1', sampleSession);
      await repo.setGameSession('guild-1', 'user-2', sampleSession);
      await repo.setGameSession('guild-2', 'user-1', sampleSession);

      const keys = await repo.scanAllSessionKeys();

      expect(keys).toHaveLength(3);
      expect(keys).toContain(VoiceGameKeys.gameSession('guild-1', 'user-1'));
      expect(keys).toContain(VoiceGameKeys.gameSession('guild-1', 'user-2'));
      expect(keys).toContain(VoiceGameKeys.gameSession('guild-2', 'user-1'));
    });

    it('세션이 없으면 빈 배열을 반환한다', async () => {
      const keys = await repo.scanAllSessionKeys();

      expect(keys).toEqual([]);
    });
  });
});
