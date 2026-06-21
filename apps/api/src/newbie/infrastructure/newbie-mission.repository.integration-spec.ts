import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { MissionStatus } from '../domain/newbie-mission.types';
import { NewbieMissionOrmEntity } from './newbie-mission.orm-entity';
import { NewbieMissionRepository } from './newbie-mission.repository';

async function createMission(
  repository: NewbieMissionRepository,
  overrides: {
    guildId?: string;
    memberId?: string;
    startDate?: string;
    endDate?: string;
    targetPlaytimeSec?: number;
    memberName?: string | null;
  } = {},
) {
  return repository.create(
    overrides.guildId ?? 'guild-1',
    overrides.memberId ?? 'member-1',
    overrides.startDate ?? '20260301',
    overrides.endDate ?? '20260331',
    overrides.targetPlaytimeSec ?? 3600,
    'memberName' in overrides ? (overrides.memberName ?? null) : '테스터',
  );
}

describe('NewbieMissionRepository (Integration)', () => {
  let module: TestingModule;
  let repository: NewbieMissionRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [NewbieMissionOrmEntity],
      providers: [NewbieMissionRepository],
      withRedis: false,
    }).compile();

    repository = module.get(NewbieMissionRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  describe('create', () => {
    it('미션을 생성하고 IN_PROGRESS 상태로 저장한다', async () => {
      const mission = await createMission(repository);

      expect(mission.id).toBeGreaterThan(0);
      expect(mission.guildId).toBe('guild-1');
      expect(mission.memberId).toBe('member-1');
      expect(mission.memberName).toBe('테스터');
      expect(mission.startDate).toBe('20260301');
      expect(mission.endDate).toBe('20260331');
      expect(mission.targetPlaytimeSec).toBe(3600);
      expect(mission.status).toBe(MissionStatus.IN_PROGRESS);
      expect(mission.hiddenFromEmbed).toBe(false);
    });

    it('memberName이 null이면 null로 저장된다', async () => {
      const mission = await createMission(repository, { memberName: null });
      expect(mission.memberName).toBeNull();
    });

    it('DB에 실제로 저장되어 조회 가능하다', async () => {
      const created = await createMission(repository);

      const fromDb = await dataSource
        .getRepository(NewbieMissionOrmEntity)
        .findOneBy({ id: created.id });

      expect(fromDb).not.toBeNull();
      expect(fromDb.status).toBe(MissionStatus.IN_PROGRESS);
    });
  });

  describe('findActiveByGuild', () => {
    it('IN_PROGRESS 미션만 조회한다', async () => {
      const m1 = await createMission(repository, { memberId: 'member-1' });
      const m2 = await createMission(repository, { memberId: 'member-2' });
      await createMission(repository, { memberId: 'member-3' });

      // member-1 완료 처리
      await repository.updateStatus(m1.id, MissionStatus.COMPLETED);
      // member-2 실패 처리
      await repository.updateStatus(m2.id, MissionStatus.FAILED);

      const active = await repository.findActiveByGuild('guild-1');

      expect(active).toHaveLength(1);
      expect(active[0].memberId).toBe('member-3');
    });

    it('다른 guild의 미션은 포함되지 않는다', async () => {
      await createMission(repository, { guildId: 'guild-1' });
      await createMission(repository, { guildId: 'guild-2' });

      const active = await repository.findActiveByGuild('guild-1');

      expect(active).toHaveLength(1);
      expect(active[0].guildId).toBe('guild-1');
    });

    it('IN_PROGRESS 미션이 없으면 빈 배열을 반환한다', async () => {
      const active = await repository.findActiveByGuild('guild-empty');
      expect(active).toEqual([]);
    });

    it('여러 IN_PROGRESS 미션이 모두 조회된다', async () => {
      await createMission(repository, { memberId: 'member-1' });
      await createMission(repository, { memberId: 'member-2' });
      await createMission(repository, { memberId: 'member-3' });

      const active = await repository.findActiveByGuild('guild-1');

      expect(active).toHaveLength(3);
    });
  });

  describe('updateStatus', () => {
    it('IN_PROGRESS → COMPLETED 상태 전이가 저장된다', async () => {
      const mission = await createMission(repository);

      await repository.updateStatus(mission.id, MissionStatus.COMPLETED);

      const updated = await repository.findById(mission.id);
      expect(updated.status).toBe(MissionStatus.COMPLETED);
    });

    it('IN_PROGRESS → FAILED 상태 전이가 저장된다', async () => {
      const mission = await createMission(repository);

      await repository.updateStatus(mission.id, MissionStatus.FAILED);

      const updated = await repository.findById(mission.id);
      expect(updated.status).toBe(MissionStatus.FAILED);
    });

    it('IN_PROGRESS → LEFT 상태 전이가 저장된다', async () => {
      const mission = await createMission(repository);

      await repository.updateStatus(mission.id, MissionStatus.LEFT);

      const updated = await repository.findById(mission.id);
      expect(updated.status).toBe(MissionStatus.LEFT);
    });

    it('상태 변경 후 findActiveByGuild에서 제외된다', async () => {
      const m1 = await createMission(repository, { memberId: 'member-1' });
      await createMission(repository, { memberId: 'member-2' });

      await repository.updateStatus(m1.id, MissionStatus.COMPLETED);

      const active = await repository.findActiveByGuild('guild-1');
      expect(active.map((m) => m.memberId)).not.toContain('member-1');
    });
  });

  describe('findExpired', () => {
    it('endDate가 today보다 이전인 IN_PROGRESS 미션을 조회한다', async () => {
      // 만료된 미션 (endDate: 어제)
      await createMission(repository, { memberId: 'member-expired', endDate: '20260317' });
      // 진행 중인 미션 (endDate: 오늘)
      await createMission(repository, { memberId: 'member-today', endDate: '20260318' });
      // 아직 남은 미션 (endDate: 내일)
      await createMission(repository, { memberId: 'member-future', endDate: '20260319' });

      const expired = await repository.findExpired('20260318');

      expect(expired).toHaveLength(1);
      expect(expired[0].memberId).toBe('member-expired');
    });

    it('COMPLETED된 미션은 만료 목록에 포함되지 않는다', async () => {
      const mission = await createMission(repository, { endDate: '20260310' });
      await repository.updateStatus(mission.id, MissionStatus.COMPLETED);

      const expired = await repository.findExpired('20260318');

      expect(expired).toHaveLength(0);
    });

    it('만료된 미션이 없으면 빈 배열을 반환한다', async () => {
      await createMission(repository, { endDate: '20260331' });

      const expired = await repository.findExpired('20260318');

      expect(expired).toHaveLength(0);
    });

    it('여러 만료 미션이 모두 조회된다', async () => {
      await createMission(repository, { memberId: 'member-1', endDate: '20260310' });
      await createMission(repository, { memberId: 'member-2', endDate: '20260315' });
      await createMission(repository, { memberId: 'member-3', endDate: '20260319' });

      const expired = await repository.findExpired('20260318');

      expect(expired).toHaveLength(2);
      const memberIds = expired.map((m) => m.memberId);
      expect(memberIds).toContain('member-1');
      expect(memberIds).toContain('member-2');
    });
  });
});
