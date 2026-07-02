import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import {
  CoPresenceDbRepository,
  type SaveSessionDto,
  type UpsertPairDailyRow,
} from './co-presence-db.repository';
import { VoiceCoPresenceDailyOrm } from './infrastructure/voice-co-presence-daily.orm-entity';
import { VoiceCoPresencePairDailyOrm } from './infrastructure/voice-co-presence-pair-daily.orm-entity';
import { VoiceCoPresenceSessionOrm } from './infrastructure/voice-co-presence-session.orm-entity';

function makeSession(overrides: Partial<SaveSessionDto> = {}): SaveSessionDto {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    channelId: 'ch-1',
    startedAt: new Date('2026-03-18T10:00:00Z'),
    endedAt: new Date('2026-03-18T10:15:00Z'),
    durationMin: 15,
    peerIds: ['user-2', 'user-3'],
    peerMinutes: { 'user-2': 10, 'user-3': 5 },
    ...overrides,
  };
}

describe('CoPresenceDbRepository (Integration)', () => {
  let module: TestingModule;
  let repository: CoPresenceDbRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [VoiceCoPresenceSessionOrm, VoiceCoPresenceDailyOrm, VoiceCoPresencePairDailyOrm],
      providers: [CoPresenceDbRepository],
      withRedis: false,
    }).compile();

    repository = module.get(CoPresenceDbRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  describe('saveSession / saveSessionBatch', () => {
    it('단일 세션을 저장한다', async () => {
      await repository.saveSession(makeSession());

      const records = await dataSource.getRepository(VoiceCoPresenceSessionOrm).find();
      expect(records).toHaveLength(1);
      expect(records[0].durationMin).toBe(15);
      expect(records[0].peerIds).toEqual(['user-2', 'user-3']);
    });

    it('배치로 여러 세션을 저장한다', async () => {
      await repository.saveSessionBatch([
        makeSession({ userId: 'user-1' }),
        makeSession({ userId: 'user-2', peerIds: ['user-1'], peerMinutes: { 'user-1': 15 } }),
      ]);

      const records = await dataSource.getRepository(VoiceCoPresenceSessionOrm).find();
      expect(records).toHaveLength(2);
    });

    it('빈 배열은 아무것도 하지 않는다', async () => {
      await repository.saveSessionBatch([]);

      const records = await dataSource.getRepository(VoiceCoPresenceSessionOrm).find();
      expect(records).toHaveLength(0);
    });
  });

  describe('upsertDaily / upsertDailyBatch', () => {
    it('신규 Daily 레코드를 INSERT한다', async () => {
      await repository.upsertDaily('guild-1', 'user-1', '2026-03-18', 15, 1);

      const record = await dataSource.getRepository(VoiceCoPresenceDailyOrm).findOneBy({
        guildId: 'guild-1',
        userId: 'user-1',
      });
      expect(record.channelMinutes).toBe(15);
      expect(record.sessionCount).toBe(1);
    });

    it('기존 Daily 레코드에 누적한다', async () => {
      await repository.upsertDaily('guild-1', 'user-1', '2026-03-18', 15, 1);
      await repository.upsertDaily('guild-1', 'user-1', '2026-03-18', 10, 1);

      const record = await dataSource.getRepository(VoiceCoPresenceDailyOrm).findOneBy({
        guildId: 'guild-1',
        userId: 'user-1',
      });
      expect(record.channelMinutes).toBe(25);
      expect(record.sessionCount).toBe(2);
    });

    it('배치로 여러 Daily를 UPSERT한다', async () => {
      await repository.upsertDailyBatch([
        { guildId: 'guild-1', userId: 'user-1', date: '2026-03-18', minutes: 15, sessionCount: 1 },
        { guildId: 'guild-1', userId: 'user-2', date: '2026-03-18', minutes: 20, sessionCount: 2 },
      ]);

      const records = await dataSource.getRepository(VoiceCoPresenceDailyOrm).find();
      expect(records).toHaveLength(2);
    });

    it('빈 배열로 upsertDailyBatch를 호출하면 아무것도 하지 않는다', async () => {
      await repository.upsertDailyBatch([]);

      const records = await dataSource.getRepository(VoiceCoPresenceDailyOrm).find();
      expect(records).toHaveLength(0);
    });
  });

  describe('upsertPairDailyBatch', () => {
    it('쌍별 Daily 레코드를 배치 UPSERT한다', async () => {
      const rows: UpsertPairDailyRow[] = [
        {
          guildId: 'guild-1',
          userId: 'user-1',
          peerId: 'user-2',
          date: '2026-03-18',
          minutes: 10,
          sessionCount: 1,
        },
        {
          guildId: 'guild-1',
          userId: 'user-1',
          peerId: 'user-3',
          date: '2026-03-18',
          minutes: 5,
          sessionCount: 1,
        },
      ];

      await repository.upsertPairDailyBatch(rows);

      const records = await dataSource.getRepository(VoiceCoPresencePairDailyOrm).find();
      expect(records).toHaveLength(2);
    });

    it('동일 쌍에 minutes와 sessionCount를 누적한다', async () => {
      await repository.upsertPairDailyBatch([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          peerId: 'user-2',
          date: '2026-03-18',
          minutes: 10,
          sessionCount: 1,
        },
      ]);
      await repository.upsertPairDailyBatch([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          peerId: 'user-2',
          date: '2026-03-18',
          minutes: 5,
          sessionCount: 1,
        },
      ]);

      const record = await dataSource.getRepository(VoiceCoPresencePairDailyOrm).findOneBy({
        guildId: 'guild-1',
        userId: 'user-1',
        peerId: 'user-2',
      });
      expect(record.minutes).toBe(15);
      expect(record.sessionCount).toBe(2);
    });

    it('빈 배열은 아무것도 하지 않는다', async () => {
      await repository.upsertPairDailyBatch([]);

      const records = await dataSource.getRepository(VoiceCoPresencePairDailyOrm).find();
      expect(records).toHaveLength(0);
    });
  });

  describe('deleteExpiredSessions', () => {
    it('cutoff 이전 세션을 삭제한다', async () => {
      await repository.saveSession(
        makeSession({
          endedAt: new Date('2025-12-01T00:00:00Z'),
        }),
      );
      await repository.saveSession(
        makeSession({
          userId: 'user-2',
          endedAt: new Date('2026-03-18T10:00:00Z'),
        }),
      );

      const deleted = await repository.deleteExpiredSessions(new Date('2026-01-01T00:00:00Z'));

      expect(deleted).toBe(1);
      const remaining = await dataSource.getRepository(VoiceCoPresenceSessionOrm).find();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].userId).toBe('user-2');
    });
  });
});
