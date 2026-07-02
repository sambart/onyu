/**
 * InactiveMemberRepository 단위 테스트 — manager 선택 인자 하위호환 검증.
 *
 * batchUpsertRecords / deleteRecordsNotIn 의 manager 선택 인자(manager?: EntityManager) 동작:
 *   - manager 전달 시 → manager.query / manager.createQueryBuilder() 경로를 사용한다.
 *   - manager 미전달 시 → 기존 this.recordRepo 경로를 사용한다(하위호환).
 *
 * DB 없이 mock 으로만 검증한다(integration-spec 과 분리).
 */

import type { EntityManager } from 'typeorm';

import { InactiveMemberGrade } from '../domain/inactive-member.types';
import { InactiveMemberRepository } from './inactive-member.repository';

// QueryBuilder 체인 mock 팩토리
function makeDeleteQb(affectedRows = 0) {
  const qb = {
    where: vi.fn(),
    andWhere: vi.fn(),
    execute: vi.fn().mockResolvedValue({ affected: affectedRows }),
  };
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  return qb;
}

describe('InactiveMemberRepository', () => {
  // TypeORM Repository mock
  const mockRecordRepo = {
    query: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const mockConfigRepo = { findOne: vi.fn(), find: vi.fn(), create: vi.fn(), save: vi.fn() };
  const mockActionLogRepo = { create: vi.fn(), save: vi.fn() };
  const mockTrendDailyRepo = { query: vi.fn(), createQueryBuilder: vi.fn() };

  let repository: InactiveMemberRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    repository = new (InactiveMemberRepository as unknown as new (
      ...args: unknown[]
    ) => InactiveMemberRepository)(
      mockConfigRepo,
      mockRecordRepo,
      mockActionLogRepo,
      mockTrendDailyRepo,
    );
  });

  // ──────────────────────────────────────────────
  // batchUpsertRecords
  // ──────────────────────────────────────────────

  describe('batchUpsertRecords', () => {
    const baseRecord = {
      guildId: 'guild-1',
      userId: 'user-1',
      nickName: 'User One',
      grade: InactiveMemberGrade.FULLY_INACTIVE,
      totalMinutes: 0,
      prevTotalMinutes: 10,
      lastVoiceDate: '20260301',
      classifiedAt: new Date('2026-03-18T00:00:00Z'),
    };

    it('manager 없이 호출하면 recordRepo.query 를 사용한다(하위호환)', async () => {
      mockRecordRepo.query.mockResolvedValue(undefined);

      await repository.batchUpsertRecords([baseRecord]);

      expect(mockRecordRepo.query).toHaveBeenCalledTimes(1);
    });

    it('manager 전달 시 manager.query 를 사용하고 recordRepo.query 는 호출되지 않는다', async () => {
      const fakeManager = { query: vi.fn().mockResolvedValue(undefined) };

      await repository.batchUpsertRecords([baseRecord], fakeManager as unknown as EntityManager);

      expect(fakeManager.query).toHaveBeenCalledTimes(1);
      expect(mockRecordRepo.query).not.toHaveBeenCalled();
    });

    it('records 가 비어 있으면 manager 여부와 무관하게 아무것도 실행하지 않는다', async () => {
      const fakeManager = { query: vi.fn() };

      await repository.batchUpsertRecords([], fakeManager as unknown as EntityManager);

      expect(fakeManager.query).not.toHaveBeenCalled();
      expect(mockRecordRepo.query).not.toHaveBeenCalled();
    });

    it('manager 전달 시 SQL 에 올바른 파라미터를 포함하여 호출한다', async () => {
      const fakeManager = { query: vi.fn().mockResolvedValue(undefined) };

      await repository.batchUpsertRecords([baseRecord], fakeManager as unknown as EntityManager);

      expect(fakeManager.query).toHaveBeenCalledTimes(1);
      const [sql, params] = fakeManager.query.mock.calls[0] as [string, unknown[]];

      // SQL 에 INSERT 와 ON CONFLICT upsert 구문이 포함되어야 한다
      expect(sql).toContain('INSERT INTO inactive_member_record');
      expect(sql).toContain('ON CONFLICT');

      // 파라미터 배열에 핵심 값이 포함되어야 한다
      expect(params).toContain('guild-1');
      expect(params).toContain('user-1');
      expect(params).toContain('User One');
      expect(params).toContain(InactiveMemberGrade.FULLY_INACTIVE);
    });

    it('manager 없이 호출 시 SQL 에 올바른 파라미터를 포함하여 recordRepo.query 를 호출한다', async () => {
      mockRecordRepo.query.mockResolvedValue(undefined);

      await repository.batchUpsertRecords([baseRecord]);

      expect(mockRecordRepo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockRecordRepo.query.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('INSERT INTO inactive_member_record');
      expect(params).toContain('guild-1');
      expect(params).toContain('user-1');
    });
  });

  // ──────────────────────────────────────────────
  // deleteRecordsNotIn
  // ──────────────────────────────────────────────

  describe('deleteRecordsNotIn', () => {
    it('manager 없이 호출하면 recordRepo.createQueryBuilder 를 사용한다(하위호환)', async () => {
      const deleteQb = makeDeleteQb(2);
      // delete() 가 qb 를 반환해야 한다
      const outerQb = { delete: vi.fn().mockReturnValue(deleteQb) };
      mockRecordRepo.createQueryBuilder.mockReturnValue(outerQb);

      const result = await repository.deleteRecordsNotIn('guild-1', new Set(['user-1', 'user-2']));

      expect(mockRecordRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(result).toBe(2);
    });

    it('manager 전달 시 manager.createQueryBuilder 를 사용하고 recordRepo.createQueryBuilder 는 호출되지 않는다', async () => {
      const deleteQb = makeDeleteQb(3);
      const _fakeManager = {
        createQueryBuilder: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue(deleteQb),
          from: vi.fn().mockReturnValue(deleteQb),
        }),
      };

      // manager 경로: manager.createQueryBuilder().delete().from(Entity)...
      // 실제 구현은 manager.createQueryBuilder().delete().from(InactiveMemberRecordOrm)
      const managerQb = {
        delete: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        execute: vi.fn().mockResolvedValue({ affected: 3 }),
      };
      managerQb.delete.mockReturnValue({
        from: vi.fn().mockReturnValue(managerQb),
      });
      managerQb.where.mockReturnValue(managerQb);
      managerQb.andWhere.mockReturnValue(managerQb);

      const fakeManagerWithQb = {
        createQueryBuilder: vi.fn().mockReturnValue(managerQb),
      };

      const result = await repository.deleteRecordsNotIn(
        'guild-1',
        new Set(['user-1']),
        fakeManagerWithQb as unknown as EntityManager,
      );

      expect(fakeManagerWithQb.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(mockRecordRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toBe(3);
    });

    it('currentUserIds 가 비어 있으면 쿼리 없이 0 을 반환한다', async () => {
      const result = await repository.deleteRecordsNotIn('guild-1', new Set());

      expect(mockRecordRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('affected 가 null 이면 0 을 반환한다', async () => {
      const deleteQb = {
        where: vi.fn(),
        andWhere: vi.fn(),
        execute: vi.fn().mockResolvedValue({ affected: null }),
      };
      deleteQb.where.mockReturnValue(deleteQb);
      deleteQb.andWhere.mockReturnValue(deleteQb);

      const outerQb = { delete: vi.fn().mockReturnValue(deleteQb) };
      mockRecordRepo.createQueryBuilder.mockReturnValue(outerQb);

      const result = await repository.deleteRecordsNotIn('guild-1', new Set(['user-1']));

      expect(result).toBe(0);
    });

    it('manager 전달 시 affected 결과를 그대로 반환한다', async () => {
      const managerQb = {
        delete: vi.fn(),
        where: vi.fn(),
        andWhere: vi.fn(),
        execute: vi.fn().mockResolvedValue({ affected: 5 }),
      };
      managerQb.delete.mockReturnValue({
        from: vi.fn().mockReturnValue(managerQb),
      });
      managerQb.where.mockReturnValue(managerQb);
      managerQb.andWhere.mockReturnValue(managerQb);

      const fakeManager = {
        createQueryBuilder: vi.fn().mockReturnValue(managerQb),
      };

      const result = await repository.deleteRecordsNotIn(
        'guild-1',
        new Set(['user-a', 'user-b']),
        fakeManager as unknown as EntityManager,
      );

      expect(result).toBe(5);
    });
  });
});
