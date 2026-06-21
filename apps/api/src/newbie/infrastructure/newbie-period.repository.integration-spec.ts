import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { NewbiePeriodOrmEntity as NewbiePeriod } from './newbie-period.orm-entity';
import { NewbiePeriodRepository } from './newbie-period.repository';

describe('NewbiePeriodRepository (Integration)', () => {
  let module: TestingModule;
  let repository: NewbiePeriodRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [NewbiePeriod],
      providers: [NewbiePeriodRepository],
      withRedis: false,
    }).compile();

    repository = module.get(NewbiePeriodRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('create + findActiveByGuild', () => {
    it('신입기간 레코드를 생성하고 findActiveByGuild로 조회한다', async () => {
      await repository.create('guild-1', 'member-1', '20260101', '20260201');

      const results = await repository.findActiveByGuild('guild-1');

      expect(results).toHaveLength(1);
      expect(results[0].guildId).toBe('guild-1');
      expect(results[0].memberId).toBe('member-1');
      expect(results[0].startDate).toBe('20260101');
      expect(results[0].expiresDate).toBe('20260201');
      expect(results[0].isExpired).toBe(false);
    });

    it('생성된 레코드의 id가 0보다 크다', async () => {
      const result = await repository.create('guild-1', 'member-1', '20260101', '20260201');

      expect(result.id).toBeGreaterThan(0);
    });

    it('같은 guild의 여러 멤버를 모두 조회한다', async () => {
      await repository.create('guild-1', 'member-1', '20260101', '20260201');
      await repository.create('guild-1', 'member-2', '20260101', '20260201');
      await repository.create('guild-1', 'member-3', '20260101', '20260201');

      const results = await repository.findActiveByGuild('guild-1');

      expect(results).toHaveLength(3);
    });

    it('다른 guildId의 레코드는 조회되지 않는다', async () => {
      await repository.create('guild-1', 'member-1', '20260101', '20260201');
      await repository.create('guild-2', 'member-2', '20260101', '20260201');

      const results = await repository.findActiveByGuild('guild-1');

      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe('member-1');
    });

    it('저장된 레코드가 없으면 빈 배열을 반환한다', async () => {
      const results = await repository.findActiveByGuild('guild-no-data');

      expect(results).toHaveLength(0);
    });
  });

  describe('findActiveMemberByGuild', () => {
    it('특정 멤버의 활성 신입기간을 단건 조회한다', async () => {
      await repository.create('guild-1', 'member-1', '20260101', '20260201');

      const result = await repository.findActiveMemberByGuild('guild-1', 'member-1');

      expect(result).not.toBeNull();
      expect(result.memberId).toBe('member-1');
      expect(result.isExpired).toBe(false);
    });

    it('존재하지 않는 멤버이면 null을 반환한다', async () => {
      const result = await repository.findActiveMemberByGuild('guild-1', 'member-no-exist');

      expect(result).toBeNull();
    });

    it('다른 guildId이면 null을 반환한다', async () => {
      await repository.create('guild-1', 'member-1', '20260101', '20260201');

      const result = await repository.findActiveMemberByGuild('guild-2', 'member-1');

      expect(result).toBeNull();
    });

    it('isExpired=true인 레코드는 조회되지 않는다', async () => {
      const created = await repository.create('guild-1', 'member-1', '20260101', '20260201');
      await repository.markExpired(created.id);

      const result = await repository.findActiveMemberByGuild('guild-1', 'member-1');

      expect(result).toBeNull();
    });
  });

  describe('findExpired', () => {
    it('만료일이 today보다 이전인 레코드를 조회한다', async () => {
      // today: 20260318, expiresDate: 20260301 (이전) → 만료
      await repository.create('guild-1', 'member-1', '20260101', '20260301');

      const results = await repository.findExpired('20260318');

      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe('member-1');
    });

    it('만료일이 today 이후인 레코드는 조회되지 않는다', async () => {
      // today: 20260318, expiresDate: 20260401 (이후) → 미만료
      await repository.create('guild-1', 'member-1', '20260101', '20260401');

      const results = await repository.findExpired('20260318');

      expect(results).toHaveLength(0);
    });

    it('이미 isExpired=true인 레코드는 조회되지 않는다', async () => {
      const created = await repository.create('guild-1', 'member-1', '20260101', '20260301');
      await repository.markExpired(created.id);

      const results = await repository.findExpired('20260318');

      expect(results).toHaveLength(0);
    });

    it('만료된 레코드와 미만료 레코드가 혼재할 때 만료된 것만 반환한다', async () => {
      await repository.create('guild-1', 'member-expired', '20260101', '20260201');
      await repository.create('guild-1', 'member-active', '20260101', '20260501');

      const results = await repository.findExpired('20260318');

      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe('member-expired');
    });

    it('만료된 레코드가 없으면 빈 배열을 반환한다', async () => {
      await repository.create('guild-1', 'member-1', '20260101', '20260501');

      const results = await repository.findExpired('20260318');

      expect(results).toHaveLength(0);
    });
  });

  describe('markExpired', () => {
    it('isExpired=true로 갱신한다', async () => {
      const created = await repository.create('guild-1', 'member-1', '20260101', '20260201');

      await repository.markExpired(created.id);

      const result = await dataSource.getRepository(NewbiePeriod).findOne({
        where: { id: created.id },
      });
      expect(result.isExpired).toBe(true);
    });

    it('markExpired 후 findActiveByGuild에서 제외된다', async () => {
      const period1 = await repository.create('guild-1', 'member-1', '20260101', '20260201');
      await repository.create('guild-1', 'member-2', '20260101', '20260201');

      await repository.markExpired(period1.id);

      const results = await repository.findActiveByGuild('guild-1');
      expect(results).toHaveLength(1);
      expect(results[0].memberId).toBe('member-2');
    });

    it('markExpired 후 findActiveMemberByGuild에서 null을 반환한다', async () => {
      const created = await repository.create('guild-1', 'member-1', '20260101', '20260201');

      await repository.markExpired(created.id);

      const result = await repository.findActiveMemberByGuild('guild-1', 'member-1');
      expect(result).toBeNull();
    });
  });
});
