import type { Repository } from 'typeorm';
import type { Mocked } from 'vitest';

import { MockRedisService } from '../../../test-utils/mock-redis.service';
import type { VoiceHealthConfigSaveDto } from '../presentation/dto/voice-health-config-save.dto';
import { VoiceHealthKeys } from './voice-health-cache.keys';
import { type VoiceHealthConfigOrmEntity as VoiceHealthConfig } from './voice-health-config.orm-entity';
import { VoiceHealthConfigRepository } from './voice-health-config.repository';

const MIC_RATE_THRESHOLD = 0.6; // 마이크 최소 비율 임계값 테스트용

function makeDto(overrides: Partial<VoiceHealthConfigSaveDto> = {}): VoiceHealthConfigSaveDto {
  return {
    isEnabled: true,
    analysisDays: 30,
    isCooldownEnabled: true,
    cooldownHours: 24,
    isLlmSummaryEnabled: false,
    minActivityMinutes: 600,
    minActiveDaysRatio: 0.5,
    hhiThreshold: 0.3,
    minPeerCount: 3,
    badgeActivityTopPercent: 10,
    badgeSocialHhiMax: 0.25,
    badgeSocialMinPeers: 5,
    badgeHunterTopPercent: 10,
    badgeConsistentMinRatio: 0.8,
    badgeMicMinRate: 0.7,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<VoiceHealthConfig> = {}): VoiceHealthConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    isEnabled: true,
    analysisDays: 30,
    isCooldownEnabled: true,
    cooldownHours: 24,
    isLlmSummaryEnabled: false,
    minActivityMinutes: 600,
    minActiveDaysRatio: 0.5,
    hhiThreshold: 0.3,
    minPeerCount: 3,
    badgeActivityTopPercent: 10,
    badgeSocialHhiMax: 0.25,
    badgeSocialMinPeers: 5,
    badgeHunterTopPercent: 10,
    badgeConsistentMinRatio: 0.8,
    badgeMicMinRate: 0.7,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VoiceHealthConfigRepository', () => {
  let repository: VoiceHealthConfigRepository;
  let repo: Mocked<Repository<VoiceHealthConfig>>;
  let redis: MockRedisService;

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      find: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
    } as unknown as Mocked<Repository<VoiceHealthConfig>>;

    redis = new MockRedisService();

    repository = new VoiceHealthConfigRepository(repo, redis as never);
  });

  afterEach(() => {
    redis.clear();
  });

  describe('findByGuildId', () => {
    it('Redis 캐시 히트 시 DB를 조회하지 않는다', async () => {
      const config = makeConfig();
      await redis.set(VoiceHealthKeys.config('guild-1'), config);

      const result = await repository.findByGuildId('guild-1');

      expect(result).toMatchObject({ guildId: 'guild-1', isEnabled: true });
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('Redis 캐시 미스 시 DB를 조회한다', async () => {
      const config = makeConfig();
      repo.findOne.mockResolvedValue(config);

      const result = await repository.findByGuildId('guild-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { guildId: 'guild-1' } });
      expect(result).toBe(config);
    });

    it('DB 조회 후 Redis에 캐시를 저장한다', async () => {
      const config = makeConfig();
      repo.findOne.mockResolvedValue(config);

      await repository.findByGuildId('guild-1');

      const cached = await redis.get(VoiceHealthKeys.config('guild-1'));
      expect(cached).not.toBeNull();
    });

    it('DB에도 없으면 null을 반환하고 캐시하지 않는다', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await repository.findByGuildId('guild-not-exist');

      expect(result).toBeNull();
      const cached = await redis.get(VoiceHealthKeys.config('guild-not-exist'));
      expect(cached).toBeNull();
    });
  });

  describe('upsert', () => {
    it('기존 설정이 없으면 새로 생성한다', async () => {
      repo.findOne.mockResolvedValue(null);
      const newConfig = makeConfig({ id: 2 });
      repo.create.mockReturnValue(newConfig);
      repo.save.mockResolvedValue(newConfig);

      const result = await repository.upsert('guild-2', makeDto());

      expect(repo.create).toHaveBeenCalledWith({ guildId: 'guild-2', ...makeDto() });
      expect(repo.save).toHaveBeenCalled();
      expect(result).toBe(newConfig);
    });

    it('기존 설정이 있으면 필드를 업데이트한다', async () => {
      const existing = makeConfig({ isEnabled: false, analysisDays: 7 });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({
        ...existing,
        isEnabled: true,
        analysisDays: 30,
      } as VoiceHealthConfig);

      const dto = makeDto({ isEnabled: true, analysisDays: 30 });
      const result = await repository.upsert('guild-1', dto);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      // 기존 객체의 필드가 업데이트되어야 함
      expect(existing.isEnabled).toBe(true);
      expect(existing.analysisDays).toBe(30);
      expect(result.isEnabled).toBe(true);
    });

    it('저장 후 Redis 캐시를 갱신한다', async () => {
      repo.findOne.mockResolvedValue(null);
      const newConfig = makeConfig({ guildId: 'guild-3' });
      repo.create.mockReturnValue(newConfig);
      repo.save.mockResolvedValue(newConfig);

      await repository.upsert('guild-3', makeDto());

      const cached = await redis.get(VoiceHealthKeys.config('guild-3'));
      expect(cached).not.toBeNull();
    });

    it('모든 설정 필드가 업데이트된다', async () => {
      const existing = makeConfig();
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation(async (e) => e as VoiceHealthConfig);

      const dto = makeDto({
        isEnabled: false,
        analysisDays: 14,
        isCooldownEnabled: false,
        cooldownHours: 12,
        isLlmSummaryEnabled: true,
        minActivityMinutes: 300,
        minActiveDaysRatio: 0.3,
        hhiThreshold: 0.5,
        minPeerCount: 5,
        badgeActivityTopPercent: 20,
        badgeSocialHhiMax: 0.1,
        badgeSocialMinPeers: 3,
        badgeHunterTopPercent: 5,
        badgeConsistentMinRatio: 0.9,
        badgeMicMinRate: 0.6,
      });

      await repository.upsert('guild-1', dto);

      expect(existing.isEnabled).toBe(false);
      expect(existing.analysisDays).toBe(14);
      expect(existing.isCooldownEnabled).toBe(false);
      expect(existing.cooldownHours).toBe(12);
      expect(existing.isLlmSummaryEnabled).toBe(true);
      expect(existing.minActivityMinutes).toBe(300);
      expect(existing.badgeActivityTopPercent).toBe(20);
      expect(existing.badgeMicMinRate).toBe(MIC_RATE_THRESHOLD);
    });
  });

  describe('findAllEnabled', () => {
    it('isEnabled=true인 설정만 반환한다', async () => {
      const configs = [makeConfig({ id: 1 }), makeConfig({ id: 2, guildId: 'guild-2' })];
      repo.find.mockResolvedValue(configs);

      const result = await repository.findAllEnabled();

      expect(repo.find).toHaveBeenCalledWith({ where: { isEnabled: true } });
      expect(result).toHaveLength(2);
    });

    it('활성 설정이 없으면 빈 배열을 반환한다', async () => {
      repo.find.mockResolvedValue([]);

      const result = await repository.findAllEnabled();

      expect(result).toEqual([]);
    });
  });

  describe('deleteCache', () => {
    it('Redis에서 해당 guildId 캐시를 삭제한다', async () => {
      const config = makeConfig();
      await redis.set(VoiceHealthKeys.config('guild-1'), config);

      await repository.deleteCache('guild-1');

      const cached = await redis.get(VoiceHealthKeys.config('guild-1'));
      expect(cached).toBeNull();
    });
  });
});
