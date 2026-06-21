import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { MocoDbRepository } from './moco-db.repository';
import { MocoHuntingDailyOrmEntity as MocoHuntingDaily } from './moco-hunting-daily.orm-entity';
import { MocoHuntingSessionOrmEntity as MocoHuntingSession } from './moco-hunting-session.orm-entity';

function makeSessionData(
  overrides: Partial<{
    guildId: string;
    hunterId: string;
    channelId: string;
    startedAt: Date;
    endedAt: Date | null;
    durationMin: number | null;
    newbieMemberIds: string[];
    isValid: boolean;
  }> = {},
) {
  return {
    guildId: 'guild-1',
    hunterId: 'hunter-1',
    channelId: 'ch-1',
    startedAt: new Date('2026-03-19T10:00:00Z'),
    endedAt: new Date('2026-03-19T10:30:00Z'),
    durationMin: 30,
    newbieMemberIds: ['newbie-1', 'newbie-2'],
    isValid: true,
    ...overrides,
  };
}

const DEFAULT_WEIGHTS = { perSession: 1, perMinute: 0.5, perUnique: 2 };

describe('MocoDbRepository (Integration)', () => {
  let module: TestingModule;
  let repository: MocoDbRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [MocoHuntingSession, MocoHuntingDaily],
      providers: [MocoDbRepository],
      withRedis: false,
    }).compile();

    repository = module.get(MocoDbRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('saveSession', () => {
    it('세션을 저장하고 ID가 할당된다', async () => {
      const result = await repository.saveSession(makeSessionData());

      expect(result.id).toBeGreaterThan(0);
      expect(result.guildId).toBe('guild-1');
      expect(result.hunterId).toBe('hunter-1');
      expect(result.durationMin).toBe(30);
      expect(result.isValid).toBe(true);
    });

    it('newbieMemberIds가 JSON 배열로 저장된다', async () => {
      const result = await repository.saveSession(
        makeSessionData({ newbieMemberIds: ['a', 'b', 'c'] }),
      );

      const saved = await dataSource
        .getRepository(MocoHuntingSession)
        .findOne({ where: { id: result.id } });

      expect(saved.newbieMemberIds).toEqual(['a', 'b', 'c']);
    });

    it('endedAt이 null인 세션을 저장한다', async () => {
      const result = await repository.saveSession(
        makeSessionData({ endedAt: null, durationMin: null, isValid: false }),
      );

      expect(result.endedAt).toBeNull();
      expect(result.durationMin).toBeNull();
      expect(result.isValid).toBe(false);
    });

    it('빈 newbieMemberIds 세션을 저장한다', async () => {
      const result = await repository.saveSession(
        makeSessionData({ newbieMemberIds: [], isValid: false }),
      );

      expect(result.newbieMemberIds).toEqual([]);
    });
  });

  describe('upsertDaily', () => {
    it('새 일별 집계를 삽입한다', async () => {
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 30, sessionCount: 2, uniqueNewbieCount: 3 },
        DEFAULT_WEIGHTS,
      );

      const record = await dataSource
        .getRepository(MocoHuntingDaily)
        .findOne({ where: { guildId: 'guild-1', hunterId: 'hunter-1', date: '20260319' } });

      expect(record).not.toBeNull();
      expect(record.channelMinutes).toBe(30);
      expect(record.sessionCount).toBe(2);
      expect(record.uniqueNewbieCount).toBe(3);
    });

    it('score가 가중치로 계산된다 (sessionCount*perSession + channelMinutes*perMinute + uniqueNewbieCount*perUnique)', async () => {
      // score = 2*1 + 30*0.5 + 3*2 = 2 + 15 + 6 = 23
      const EXPECTED_SCORE = 23;
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 30, sessionCount: 2, uniqueNewbieCount: 3 },
        DEFAULT_WEIGHTS,
      );

      const record = await dataSource
        .getRepository(MocoHuntingDaily)
        .findOne({ where: { guildId: 'guild-1', hunterId: 'hunter-1', date: '20260319' } });

      expect(record.score).toBe(EXPECTED_SCORE);
    });

    it('같은 (guildId, hunterId, date) ON CONFLICT 시 값을 누적한다', async () => {
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 10, sessionCount: 1, uniqueNewbieCount: 1 },
        DEFAULT_WEIGHTS,
      );
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 20, sessionCount: 2, uniqueNewbieCount: 2 },
        DEFAULT_WEIGHTS,
      );

      const record = await dataSource
        .getRepository(MocoHuntingDaily)
        .findOne({ where: { guildId: 'guild-1', hunterId: 'hunter-1', date: '20260319' } });

      expect(record.channelMinutes).toBe(30);
      expect(record.sessionCount).toBe(3);
      expect(record.uniqueNewbieCount).toBe(3);
    });

    it('누적 후 score가 재계산된다', async () => {
      // 1차: 10min, 1session, 1unique → score = 1*1 + 10*0.5 + 1*2 = 8
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 10, sessionCount: 1, uniqueNewbieCount: 1 },
        DEFAULT_WEIGHTS,
      );
      // 2차 누적: total = 30min, 3session, 3unique → score = 3*1 + 30*0.5 + 3*2 = 24
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 20, sessionCount: 2, uniqueNewbieCount: 2 },
        DEFAULT_WEIGHTS,
      );

      const record = await dataSource
        .getRepository(MocoHuntingDaily)
        .findOne({ where: { guildId: 'guild-1', hunterId: 'hunter-1', date: '20260319' } });

      expect(record.score).toBe(24);
    });

    it('다른 날짜는 별도 레코드로 저장된다', async () => {
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260318',
        { channelMinutes: 5, sessionCount: 1, uniqueNewbieCount: 1 },
        DEFAULT_WEIGHTS,
      );
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 10, sessionCount: 2, uniqueNewbieCount: 2 },
        DEFAULT_WEIGHTS,
      );

      const records = await dataSource
        .getRepository(MocoHuntingDaily)
        .find({ where: { guildId: 'guild-1', hunterId: 'hunter-1' } });
      expect(records).toHaveLength(2);
    });
  });

  describe('getDailyAggregates', () => {
    it('지정 기간의 집계를 합산하여 반환한다', async () => {
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260318',
        { channelMinutes: 10, sessionCount: 1, uniqueNewbieCount: 1 },
        DEFAULT_WEIGHTS,
      );
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 20, sessionCount: 2, uniqueNewbieCount: 2 },
        DEFAULT_WEIGHTS,
      );

      const result = await repository.getDailyAggregates('guild-1', 'hunter-1');

      expect(result.totalChannelMinutes).toBe(30);
      expect(result.totalSessionCount).toBe(3);
      expect(result.totalUniqueNewbieCount).toBe(3);
    });

    it('데이터가 없으면 모든 집계값이 0이다', async () => {
      const result = await repository.getDailyAggregates('guild-no-data', 'hunter-1');

      expect(result.totalChannelMinutes).toBe(0);
      expect(result.totalSessionCount).toBe(0);
      expect(result.totalUniqueNewbieCount).toBe(0);
      expect(result.totalScore).toBe(0);
    });

    it('fromDate 이전 데이터는 제외된다', async () => {
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260301',
        { channelMinutes: 100, sessionCount: 10, uniqueNewbieCount: 5 },
        DEFAULT_WEIGHTS,
      );
      await repository.upsertDaily(
        'guild-1',
        'hunter-1',
        '20260319',
        { channelMinutes: 5, sessionCount: 1, uniqueNewbieCount: 1 },
        DEFAULT_WEIGHTS,
      );

      const result = await repository.getDailyAggregates('guild-1', 'hunter-1', '20260315');

      expect(result.totalChannelMinutes).toBe(5);
      expect(result.totalSessionCount).toBe(1);
    });
  });

  describe('getSessionCountByHunterAndNewbie', () => {
    it('유효 세션에서 신입별 횟수를 반환한다', async () => {
      await repository.saveSession(
        makeSessionData({
          newbieMemberIds: ['newbie-1', 'newbie-2'],
          isValid: true,
        }),
      );
      await repository.saveSession(
        makeSessionData({
          newbieMemberIds: ['newbie-1'],
          isValid: true,
        }),
      );

      const result = await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      expect(result['newbie-1']).toBe(2);
      expect(result['newbie-2']).toBe(1);
    });

    it('isValid=false 세션은 집계에서 제외된다', async () => {
      await repository.saveSession(
        makeSessionData({
          newbieMemberIds: ['newbie-1'],
          isValid: false,
        }),
      );

      const result = await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      expect(result['newbie-1']).toBeUndefined();
    });

    it('세션이 없으면 빈 객체를 반환한다', async () => {
      const result = await repository.getSessionCountByHunterAndNewbie('guild-no-data', 'hunter-1');

      expect(result).toEqual({});
    });

    it('빈 newbieMemberIds 세션은 집계에서 제외된다', async () => {
      await repository.saveSession(
        makeSessionData({
          newbieMemberIds: [],
          isValid: true,
        }),
      );

      const result = await repository.getSessionCountByHunterAndNewbie('guild-1', 'hunter-1');

      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
