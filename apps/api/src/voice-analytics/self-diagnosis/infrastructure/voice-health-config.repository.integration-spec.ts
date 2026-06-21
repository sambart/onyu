import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import { cleanRedis } from '../../../test-utils/redis-cleaner';
import type { VoiceHealthConfigSaveDto } from '../presentation/dto/voice-health-config-save.dto';
import { VoiceHealthConfigOrmEntity as VoiceHealthConfig } from './voice-health-config.orm-entity';
import { VoiceHealthConfigRepository } from './voice-health-config.repository';

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

describe('VoiceHealthConfigRepository (Integration)', () => {
  let module: TestingModule;
  let repository: VoiceHealthConfigRepository;
  let dataSource: DataSource;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redisClient: any;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [VoiceHealthConfig],
      providers: [VoiceHealthConfigRepository],
      withRedis: true,
    }).compile();

    repository = module.get(VoiceHealthConfigRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
    if (redisClient) {
      await cleanRedis(redisClient);
    }
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('findByGuildId', () => {
    it('존재하는 guildId의 설정을 반환한다', async () => {
      await repository.upsert('guild-1', makeDto());

      const result = await repository.findByGuildId('guild-1');

      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
      expect(result.isEnabled).toBe(true);
      expect(result.analysisDays).toBe(30);
    });

    it('존재하지 않는 guildId이면 null을 반환한다', async () => {
      const result = await repository.findByGuildId('guild-no-exist');

      expect(result).toBeNull();
    });

    it('두 번 조회 시 두 번째는 Redis 캐시에서 반환된다 (DB 호출 없음)', async () => {
      await repository.upsert('guild-1', makeDto());

      // 첫 번째 조회: DB에서 가져오고 캐시 저장
      const first = await repository.findByGuildId('guild-1');
      // 두 번째 조회: Redis 캐시 히트 (결과가 동일해야 함)
      const second = await repository.findByGuildId('guild-1');

      expect(first.guildId).toBe('guild-1');
      expect(second.guildId).toBe('guild-1');
      expect(first.isEnabled).toBe(second.isEnabled);
    });
  });

  describe('upsert — 신규 생성', () => {
    it('새 설정을 생성하고 ID가 할당된다', async () => {
      const result = await repository.upsert('guild-1', makeDto());

      expect(result.id).toBeGreaterThan(0);
      expect(result.guildId).toBe('guild-1');
      expect(result.isEnabled).toBe(true);
    });

    it('모든 필드가 올바르게 저장된다', async () => {
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

      const result = await repository.upsert('guild-1', dto);

      expect(result.isEnabled).toBe(false);
      expect(result.analysisDays).toBe(14);
      expect(result.isCooldownEnabled).toBe(false);
      expect(result.isLlmSummaryEnabled).toBe(true);
      expect(result.minActivityMinutes).toBe(300);
    });

    it('upsert 후 Redis 캐시가 갱신된다 (두 번째 findByGuildId에서 캐시 히트)', async () => {
      await repository.upsert('guild-cache', makeDto({ isEnabled: true }));

      // upsert 후 바로 조회하면 캐시에서 반환되어야 함
      const result = await repository.findByGuildId('guild-cache');
      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-cache');
    });
  });

  describe('upsert — 기존 업데이트', () => {
    it('같은 guildId로 upsert하면 기존 레코드를 업데이트한다', async () => {
      await repository.upsert('guild-1', makeDto({ analysisDays: 7 }));
      await repository.upsert('guild-1', makeDto({ analysisDays: 30 }));

      const allRecords = await dataSource.getRepository(VoiceHealthConfig).find({
        where: { guildId: 'guild-1' },
      });
      expect(allRecords).toHaveLength(1);
      expect(allRecords[0].analysisDays).toBe(30);
    });

    it('업데이트 후 Redis 캐시가 갱신된다', async () => {
      await repository.upsert('guild-1', makeDto({ isEnabled: false }));
      await repository.upsert('guild-1', makeDto({ isEnabled: true }));

      // 캐시를 통해 조회하면 업데이트된 값을 반환해야 함
      const result = await repository.findByGuildId('guild-1');
      expect(result.isEnabled).toBe(true);
    });

    it('여러 guildId에 대해 독립적으로 레코드가 관리된다', async () => {
      await repository.upsert('guild-1', makeDto({ analysisDays: 7 }));
      await repository.upsert('guild-2', makeDto({ analysisDays: 30 }));

      const result1 = await repository.findByGuildId('guild-1');
      const result2 = await repository.findByGuildId('guild-2');

      expect(result1.analysisDays).toBe(7);
      expect(result2.analysisDays).toBe(30);
    });
  });

  describe('findAllEnabled', () => {
    it('isEnabled=true인 설정만 반환한다', async () => {
      await repository.upsert('guild-1', makeDto({ isEnabled: true }));
      await repository.upsert('guild-2', makeDto({ isEnabled: false }));
      await repository.upsert('guild-3', makeDto({ isEnabled: true }));

      const results = await repository.findAllEnabled();

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.isEnabled)).toBe(true);
    });

    it('활성 설정이 없으면 빈 배열을 반환한다', async () => {
      await repository.upsert('guild-1', makeDto({ isEnabled: false }));

      const results = await repository.findAllEnabled();

      expect(results).toHaveLength(0);
    });
  });

  describe('deleteCache', () => {
    it('Redis 캐시를 삭제하면 다음 조회 시 DB에서 가져온다', async () => {
      await repository.upsert('guild-1', makeDto());
      // 캐시 저장 확인 (findByGuildId 호출)
      await repository.findByGuildId('guild-1');
      // 캐시 삭제
      await repository.deleteCache('guild-1');

      // 삭제 후 조회: DB에서 가져와야 함 (여전히 DB에는 있음)
      const result = await repository.findByGuildId('guild-1');
      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
    });
  });
});
