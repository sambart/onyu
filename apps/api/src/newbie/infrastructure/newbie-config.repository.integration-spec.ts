import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import type { NewbieConfigSaveDto } from '../presentation/dto/newbie-config-save.dto';
import { NewbieConfigOrmEntity as NewbieConfig } from './newbie-config.orm-entity';
import { NewbieConfigRepository } from './newbie-config.repository';

function makeDto(overrides: Partial<NewbieConfigSaveDto> = {}): NewbieConfigSaveDto {
  return {
    welcomeEnabled: false,
    welcomeChannelId: null,
    missionEnabled: false,
    missionDurationDays: null,
    missionTargetPlaytimeHours: null,
    missionNotifyChannelId: null,
    mocoEnabled: false,
    mocoNewbieDays: 30,
    mocoAllowNewbieHunter: false,
    roleEnabled: false,
    roleDurationDays: null,
    newbieRoleId: null,
    ...overrides,
  };
}

describe('NewbieConfigRepository (Integration)', () => {
  let module: TestingModule;
  let repository: NewbieConfigRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [NewbieConfig],
      providers: [NewbieConfigRepository],
      withRedis: false,
    }).compile();

    repository = module.get(NewbieConfigRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('findByGuildId', () => {
    it('존재하는 설정을 반환한다', async () => {
      await repository.upsert('guild-1', makeDto({ welcomeEnabled: true }));

      const result = await repository.findByGuildId('guild-1');

      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
      expect(result.welcomeEnabled).toBe(true);
    });

    it('존재하지 않는 guildId이면 null을 반환한다', async () => {
      const result = await repository.findByGuildId('guild-no-exist');

      expect(result).toBeNull();
    });
  });

  describe('upsert — 신규 생성', () => {
    it('기본값과 함께 신규 설정을 생성한다', async () => {
      const result = await repository.upsert('guild-1', makeDto());

      expect(result.id).toBeGreaterThan(0);
      expect(result.guildId).toBe('guild-1');
      expect(result.missionNotifyMessageId).toBeNull();
      expect(result.mocoRankMessageId).toBeNull();
    });

    it('모든 enabled 플래그를 true로 설정해서 저장된다', async () => {
      const result = await repository.upsert(
        'guild-1',
        makeDto({
          welcomeEnabled: true,
          missionEnabled: true,
          mocoEnabled: true,
          roleEnabled: true,
        }),
      );

      expect(result.welcomeEnabled).toBe(true);
      expect(result.missionEnabled).toBe(true);
      expect(result.mocoEnabled).toBe(true);
      expect(result.roleEnabled).toBe(true);
    });

    it('missionDurationDays, roleDurationDays 등 숫자 필드가 저장된다', async () => {
      const result = await repository.upsert(
        'guild-1',
        makeDto({
          missionEnabled: true,
          missionDurationDays: 30,
          roleEnabled: true,
          roleDurationDays: 14,
          newbieRoleId: 'role-123',
        }),
      );

      expect(result.missionDurationDays).toBe(30);
      expect(result.roleDurationDays).toBe(14);
      expect(result.newbieRoleId).toBe('role-123');
    });
  });

  describe('upsert — 기존 업데이트', () => {
    it('같은 guildId로 upsert하면 기존 레코드를 업데이트한다', async () => {
      await repository.upsert('guild-1', makeDto({ welcomeEnabled: false }));
      const updated = await repository.upsert(
        'guild-1',
        makeDto({ welcomeEnabled: true, welcomeChannelId: 'ch-welcome' }),
      );

      expect(updated.welcomeEnabled).toBe(true);
      expect(updated.welcomeChannelId).toBe('ch-welcome');

      const allConfigs = await dataSource.getRepository(NewbieConfig).find({
        where: { guildId: 'guild-1' },
      });
      expect(allConfigs).toHaveLength(1);
    });

    it('upsert 후 missionNotifyMessageId와 mocoRankMessageId는 보존된다', async () => {
      await repository.upsert('guild-1', makeDto());
      await repository.updateMissionNotifyMessageId('guild-1', 'msg-mission');
      await repository.updateMocoRankMessageId('guild-1', 'msg-moco');

      await repository.upsert('guild-1', makeDto({ welcomeEnabled: true }));

      const result = await repository.findByGuildId('guild-1');
      expect(result.missionNotifyMessageId).toBe('msg-mission');
      expect(result.mocoRankMessageId).toBe('msg-moco');
    });
  });

  describe('updateMissionNotifyMessageId', () => {
    it('missionNotifyMessageId를 갱신한다', async () => {
      await repository.upsert('guild-1', makeDto());

      await repository.updateMissionNotifyMessageId('guild-1', 'msg-001');

      const result = await repository.findByGuildId('guild-1');
      expect(result.missionNotifyMessageId).toBe('msg-001');
    });

    it('null로 갱신하면 null이 저장된다', async () => {
      await repository.upsert('guild-1', makeDto());
      await repository.updateMissionNotifyMessageId('guild-1', 'msg-001');

      await repository.updateMissionNotifyMessageId('guild-1', null);

      const result = await repository.findByGuildId('guild-1');
      expect(result.missionNotifyMessageId).toBeNull();
    });
  });

  describe('updateMocoRankMessageId', () => {
    it('mocoRankMessageId를 갱신한다', async () => {
      await repository.upsert('guild-1', makeDto());

      await repository.updateMocoRankMessageId('guild-1', 'msg-rank');

      const result = await repository.findByGuildId('guild-1');
      expect(result.mocoRankMessageId).toBe('msg-rank');
    });

    it('null로 갱신하면 null이 저장된다', async () => {
      await repository.upsert('guild-1', makeDto());
      await repository.updateMocoRankMessageId('guild-1', 'msg-rank');

      await repository.updateMocoRankMessageId('guild-1', null);

      const result = await repository.findByGuildId('guild-1');
      expect(result.mocoRankMessageId).toBeNull();
    });
  });

  describe('findAllMocoEnabled', () => {
    it('mocoEnabled=true인 설정만 조회한다', async () => {
      await repository.upsert('guild-1', makeDto({ mocoEnabled: true }));
      await repository.upsert('guild-2', makeDto({ mocoEnabled: false }));
      await repository.upsert('guild-3', makeDto({ mocoEnabled: true }));

      const results = await repository.findAllMocoEnabled();

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.guildId)).toContain('guild-1');
      expect(results.map((r) => r.guildId)).toContain('guild-3');
      expect(results.map((r) => r.guildId)).not.toContain('guild-2');
    });

    it('mocoEnabled=true인 설정이 없으면 빈 배열을 반환한다', async () => {
      await repository.upsert('guild-1', makeDto({ mocoEnabled: false }));

      const results = await repository.findAllMocoEnabled();

      expect(results).toHaveLength(0);
    });

    it('저장된 설정이 없으면 빈 배열을 반환한다', async () => {
      const results = await repository.findAllMocoEnabled();

      expect(results).toHaveLength(0);
    });
  });
});
