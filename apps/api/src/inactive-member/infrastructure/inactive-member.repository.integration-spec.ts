import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { InactiveMemberGrade } from '../domain/inactive-member.types';
import { InactiveMemberRepository } from './inactive-member.repository';
import { InactiveMemberActionLogOrm } from './inactive-member-action-log.orm-entity';
import { InactiveMemberConfigOrm } from './inactive-member-config.orm-entity';
import { InactiveMemberRecordOrm } from './inactive-member-record.orm-entity';

describe('InactiveMemberRepository (Integration)', () => {
  let module: TestingModule;
  let repository: InactiveMemberRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [InactiveMemberRecordOrm, InactiveMemberConfigOrm, InactiveMemberActionLogOrm],
      providers: [InactiveMemberRepository],
      withRedis: false,
    }).compile();

    repository = module.get(InactiveMemberRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  describe('batchUpsertRecords', () => {
    it('신규 레코드를 배치 INSERT한다', async () => {
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 10,
          prevTotalMinutes: 0,
          lastVoiceDate: '2026-03-01',
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-2',
          nickName: 'user-2',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 25,
          prevTotalMinutes: 30,
          lastVoiceDate: '2026-03-10',
          classifiedAt,
        },
      ]);

      const records = await dataSource
        .getRepository(InactiveMemberRecordOrm)
        .findBy({ guildId: 'guild-1' });

      expect(records).toHaveLength(2);

      const user1 = records.find((r) => r.userId === 'user-1');
      expect(user1).toBeDefined();
      expect(user1.grade).toBe(InactiveMemberGrade.FULLY_INACTIVE);
      expect(user1.totalMinutes).toBe(10);
      expect(user1.lastVoiceDate).toBe('2026-03-01');

      const user2 = records.find((r) => r.userId === 'user-2');
      expect(user2).toBeDefined();
      expect(user2.grade).toBe(InactiveMemberGrade.LOW_ACTIVE);
      expect(user2.totalMinutes).toBe(25);
    });

    it('기존 레코드 업데이트 시 등급 변경이 있으면 gradeChangedAt을 갱신한다', async () => {
      const firstClassifiedAt = new Date('2026-03-17T00:00:00Z');

      // 1차 INSERT: LOW_ACTIVE로 등록
      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 25,
          prevTotalMinutes: 30,
          lastVoiceDate: '2026-03-10',
          classifiedAt: firstClassifiedAt,
        },
      ]);

      const beforeUpdate = await dataSource
        .getRepository(InactiveMemberRecordOrm)
        .findOneBy({ guildId: 'guild-1', userId: 'user-1' });

      expect(beforeUpdate).not.toBeNull();
      expect(beforeUpdate.grade).toBe(InactiveMemberGrade.LOW_ACTIVE);

      // 잠시 대기하여 gradeChangedAt 차이를 확인할 수 있도록 함
      await new Promise((resolve) => setTimeout(resolve, 100));

      const secondClassifiedAt = new Date('2026-03-18T00:00:00Z');

      // 2차 UPSERT: FULLY_INACTIVE로 등급 변경
      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 5,
          prevTotalMinutes: 25,
          lastVoiceDate: '2026-03-10',
          classifiedAt: secondClassifiedAt,
        },
      ]);

      const afterUpdate = await dataSource
        .getRepository(InactiveMemberRecordOrm)
        .findOneBy({ guildId: 'guild-1', userId: 'user-1' });

      expect(afterUpdate.grade).toBe(InactiveMemberGrade.FULLY_INACTIVE);
      expect(afterUpdate.totalMinutes).toBe(5);
      expect(afterUpdate.gradeChangedAt).not.toBeNull();

      // 등급이 변경되었으므로 gradeChangedAt이 갱신되어야 함
      if (beforeUpdate.gradeChangedAt) {
        expect(afterUpdate.gradeChangedAt.getTime()).toBeGreaterThanOrEqual(
          beforeUpdate.gradeChangedAt.getTime(),
        );
      }
    });
  });

  describe('upsertConfig', () => {
    it('설정이 없을 때 새로 생성한다', async () => {
      const result = await repository.upsertConfig('guild-1', {
        periodDays: 30,
        lowActiveThresholdMin: 60,
        decliningPercent: 40,
      });
      expect(result.guildId).toBe('guild-1');
      expect(result.periodDays).toBe(30);
      expect(result.lowActiveThresholdMin).toBe(60);
      expect(result.decliningPercent).toBe(40);

      const saved = await dataSource
        .getRepository(InactiveMemberConfigOrm)
        .findOneBy({ guildId: 'guild-1' });

      expect(saved).not.toBeNull();
      expect(saved.periodDays).toBe(30);
    });

    it('설정이 있을 때 일부 필드만 업데이트한다', async () => {
      // 기본 설정 생성
      await repository.upsertConfig('guild-1', {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        autoActionEnabled: false,
      });
      // periodDays만 변경
      await repository.upsertConfig('guild-1', {
        periodDays: 60,
      });
      const saved = await dataSource
        .getRepository(InactiveMemberConfigOrm)
        .findOneBy({ guildId: 'guild-1' });

      expect(saved.periodDays).toBe(60);
      // 변경하지 않은 필드는 유지
      expect(saved.lowActiveThresholdMin).toBe(30);
      expect(saved.autoActionEnabled).toBe(false);
    });
  });

  describe('findNewlyFullyInactive', () => {
    it('등급이 FULLY_INACTIVE로 변경된 멤버를 조회한다', async () => {
      const classifiedAt = new Date('2020-01-01T00:00:00Z');

      // 1단계: LOW_ACTIVE로 먼저 생성
      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 10,
          prevTotalMinutes: 20,
          lastVoiceDate: '2026-03-10',
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-2',
          nickName: 'user-2',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 20,
          prevTotalMinutes: 40,
          lastVoiceDate: '2026-03-15',
          classifiedAt,
        },
      ]);

      // 2단계: user-1만 FULLY_INACTIVE로 변경 → gradeChangedAt = NOW()
      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 0,
          prevTotalMinutes: 10,
          lastVoiceDate: null,
          classifiedAt,
        },
      ]);

      const result = await repository.findNewlyFullyInactive('guild-1', classifiedAt);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].grade).toBe(InactiveMemberGrade.FULLY_INACTIVE);
    });

    it('gradeChangedAt이 classifiedAt 이전이면 조회되지 않는다', async () => {
      const oldDate = new Date('2026-03-17T00:00:00Z');

      // LOW_ACTIVE → FULLY_INACTIVE 변경 (gradeChangedAt = NOW())
      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 10,
          prevTotalMinutes: 20,
          lastVoiceDate: null,
          classifiedAt: oldDate,
        },
      ]);
      await repository.batchUpsertRecords([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          nickName: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 0,
          prevTotalMinutes: 10,
          lastVoiceDate: null,
          classifiedAt: oldDate,
        },
      ]);

      // 미래 시점으로 조회 → gradeChangedAt < futureDate이므로 조회 안 됨
      const futureDate = new Date('2099-01-01T00:00:00Z');
      const result = await repository.findNewlyFullyInactive('guild-1', futureDate);

      expect(result).toHaveLength(0);
    });
  });
});
