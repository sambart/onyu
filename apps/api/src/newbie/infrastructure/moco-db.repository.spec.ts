import type { Repository } from 'typeorm';
import type { Mocked } from 'vitest';

import { MocoDbRepository } from './moco-db.repository';
import { type MocoHuntingDailyOrmEntity as MocoHuntingDaily } from './moco-hunting-daily.orm-entity';
import { type MocoHuntingSessionOrmEntity as MocoHuntingSession } from './moco-hunting-session.orm-entity';

function makeDailyQb(rawOneValue?: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue(rawOneValue ?? null),
  };
}

describe('MocoDbRepository', () => {
  let repository: MocoDbRepository;
  let sessionRepo: Mocked<Repository<MocoHuntingSession>>;
  let dailyRepo: Mocked<Repository<MocoHuntingDaily>>;

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
      query: vi.fn(),
      metadata: {
        tableName: 'moco_hunting_session',
        schema: 'public',
      },
    } as unknown as Mocked<Repository<MocoHuntingSession>>;

    dailyRepo = {
      createQueryBuilder: vi.fn(),
      query: vi.fn(),
      metadata: {
        tableName: 'moco_hunting_daily',
        schema: 'public',
      },
    } as unknown as Mocked<Repository<MocoHuntingDaily>>;

    repository = new MocoDbRepository(sessionRepo, dailyRepo);
  });

  describe('saveSession', () => {
    it('세션 데이터를 생성하고 저장한다', async () => {
      const sessionData = {
        guildId: 'guild-1',
        hunterId: 'hunter-1',
        channelId: 'ch-1',
        startedAt: new Date('2026-03-19T10:00:00Z'),
        endedAt: new Date('2026-03-19T10:30:00Z'),
        durationMin: 30,
        newbieMemberIds: ['newbie-1', 'newbie-2'],
        isValid: true,
      };

      const mockSession = { id: 1, ...sessionData } as MocoHuntingSession;
      sessionRepo.create.mockReturnValue(mockSession);
      sessionRepo.save.mockResolvedValue(mockSession);

      const result = await repository.saveSession(sessionData);

      expect(sessionRepo.create).toHaveBeenCalledWith(sessionData);
      expect(sessionRepo.save).toHaveBeenCalledWith(mockSession);
      expect(result).toBe(mockSession);
    });

    it('endedAt이 null인 세션을 저장한다', async () => {
      const sessionData = {
        guildId: 'guild-1',
        hunterId: 'hunter-1',
        channelId: 'ch-1',
        startedAt: new Date(),
        endedAt: null,
        durationMin: null,
        newbieMemberIds: [],
        isValid: false,
      };

      const mockSession = { id: 2, ...sessionData } as MocoHuntingSession;
      sessionRepo.create.mockReturnValue(mockSession);
      sessionRepo.save.mockResolvedValue(mockSession);

      const result = await repository.saveSession(sessionData);

      expect(result.endedAt).toBeNull();
      expect(result.durationMin).toBeNull();
    });

    it('newbieMemberIds가 빈 배열인 세션을 저장한다', async () => {
      const sessionData = {
        guildId: 'guild-1',
        hunterId: 'hunter-1',
        channelId: 'ch-1',
        startedAt: new Date(),
        endedAt: null,
        durationMin: null,
        newbieMemberIds: [],
        isValid: false,
      };

      const mockSession = { id: 3, ...sessionData } as MocoHuntingSession;
      sessionRepo.create.mockReturnValue(mockSession);
      sessionRepo.save.mockResolvedValue(mockSession);

      const result = await repository.saveSession(sessionData);

      expect(result.newbieMemberIds).toEqual([]);
    });
  });

  describe('upsertDaily', () => {
    const weights = { perSession: 1, perMinute: 0.5, perUnique: 2 };

    it('INSERT ... ON CONFLICT 쿼리를 올바른 인자로 실행한다', async () => {
      dailyRepo.query.mockResolvedValue(undefined);

      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 30, sessionCount: 2, uniqueNewbieCount: 3 },
        weights,
      );

      expect(dailyRepo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dailyRepo.query.mock.calls[0] as [string, unknown[]];

      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE');
      expect(params).toContain('guild-1');
      expect(params).toContain('hunter-1');
      expect(params).toContain('20260319');
      expect(params).toContain(30); // channelMinutes
      expect(params).toContain(2); // sessionCount
      expect(params).toContain(3); // uniqueNewbieCount
    });

    it('score 가중치 파라미터가 쿼리에 포함된다', async () => {
      dailyRepo.query.mockResolvedValue(undefined);

      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 10, sessionCount: 1, uniqueNewbieCount: 1 },
        { perSession: 2, perMinute: 1, perUnique: 3 },
      );

      const [, params] = dailyRepo.query.mock.calls[0] as [string, unknown[]];
      expect(params).toContain(2); // perSession
      expect(params).toContain(1); // perMinute
      expect(params).toContain(3); // perUnique
    });
  });

  describe('getDailyAggregates', () => {
    it('집계 결과를 숫자로 파싱하여 반환한다', async () => {
      const TOTAL_CHANNEL_MINUTES = 120;
      const qb = makeDailyQb({
        totalChannelMinutes: String(TOTAL_CHANNEL_MINUTES),
        totalSessionCount: '5',
        totalUniqueNewbieCount: '3',
        totalScore: '25',
      });
      dailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof dailyRepo.createQueryBuilder>,
      );

      const result = await repository.getDailyAggregates('guild-1', 'hunter-1');

      expect(result.totalChannelMinutes).toBe(TOTAL_CHANNEL_MINUTES);
      expect(result.totalSessionCount).toBe(5);
      expect(result.totalUniqueNewbieCount).toBe(3);
      expect(result.totalScore).toBe(25);
    });

    it('데이터가 없으면 모든 집계값이 0이다', async () => {
      const qb = makeDailyQb(null);
      dailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof dailyRepo.createQueryBuilder>,
      );

      const result = await repository.getDailyAggregates('guild-1', 'hunter-1');

      expect(result.totalChannelMinutes).toBe(0);
      expect(result.totalSessionCount).toBe(0);
      expect(result.totalUniqueNewbieCount).toBe(0);
      expect(result.totalScore).toBe(0);
    });

    it('fromDate가 있으면 andWhere 조건이 추가된다', async () => {
      const qb = makeDailyQb({
        totalChannelMinutes: '0',
        totalSessionCount: '0',
        totalUniqueNewbieCount: '0',
        totalScore: '0',
      });
      dailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof dailyRepo.createQueryBuilder>,
      );

      await repository.getDailyAggregates('guild-1', 'hunter-1', '20260301');

      expect(qb.andWhere).toHaveBeenCalledWith('d.date >= :fromDate', { fromDate: '20260301' });
    });

    it('fromDate가 없으면 날짜 조건이 추가되지 않는다', async () => {
      const qb = makeDailyQb({
        totalChannelMinutes: '0',
        totalSessionCount: '0',
        totalUniqueNewbieCount: '0',
        totalScore: '0',
      });
      dailyRepo.createQueryBuilder.mockReturnValue(
        qb as ReturnType<typeof dailyRepo.createQueryBuilder>,
      );

      await repository.getDailyAggregates('guild-1', 'hunter-1');

      // andWhere는 guildId, hunterId에만 호출되어야 함 (fromDate 없음)
      const andWhereCalls = qb.andWhere.mock.calls as [string, unknown][];
      const fromDateCall = andWhereCalls.find(([sql]) => sql.includes('fromDate'));
      expect(fromDateCall).toBeUndefined();
    });
  });

  describe('getSessionCountByHunterAndNewbie', () => {
    it('신입별 유효 세션 횟수를 Record로 반환한다', async () => {
      const rows = [
        { newbie_id: 'newbie-1', session_count: 3 },
        { newbie_id: 'newbie-2', session_count: 1 },
      ];
      sessionRepo.query.mockResolvedValue(rows);

      const result = await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      expect(result['newbie-1']).toBe(3);
      expect(result['newbie-2']).toBe(1);
    });

    it('세션이 없으면 빈 객체를 반환한다', async () => {
      sessionRepo.query.mockResolvedValue([]);

      const result = await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      expect(result).toEqual({});
    });

    it('JSON unnest 쿼리에 guildId와 hunterId가 포함된다', async () => {
      sessionRepo.query.mockResolvedValue([]);

      await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      const [, params] = sessionRepo.query.mock.calls[0] as [string, string[]];
      expect(params).toContain('guild-1');
      expect(params).toContain('hunter-1');
    });

    it('isValid=true인 세션만 집계하는 쿼리가 실행된다', async () => {
      sessionRepo.query.mockResolvedValue([]);

      await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      const [sql] = sessionRepo.query.mock.calls[0] as [string, string[]];
      expect(sql).toContain('isValid');
      expect(sql).toContain('true');
    });
  });
});
