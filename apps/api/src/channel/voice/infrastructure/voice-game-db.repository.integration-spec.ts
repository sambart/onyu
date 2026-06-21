import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import { VoiceGameActivityOrm } from './voice-game-activity.orm-entity';
import { VoiceGameDailyOrm } from './voice-game-daily.orm-entity';
import { type SaveGameActivityDto, VoiceGameDbRepository } from './voice-game-db.repository';

const ACCUMULATED_DURATION_MIN = 45; // 30 + 15 누적 결과
const ACCUMULATED_TOTAL_MIN = 75; // 30 + 45 누적 결과

function makeActivity(overrides: Partial<SaveGameActivityDto> = {}): SaveGameActivityDto {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    channelId: 'ch-1',
    gameName: 'Valorant',
    applicationId: 'app-1',
    startedAt: new Date('2026-03-18T10:00:00Z'),
    endedAt: new Date('2026-03-18T10:30:00Z'),
    durationMin: 30,
    ...overrides,
  };
}

describe('VoiceGameDbRepository (Integration)', () => {
  let module: TestingModule;
  let repository: VoiceGameDbRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [VoiceGameActivityOrm, VoiceGameDailyOrm],
      providers: [VoiceGameDbRepository],
      withRedis: false,
    }).compile();

    repository = module.get(VoiceGameDbRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  describe('saveActivity', () => {
    it('게임 활동 레코드를 INSERT한다', async () => {
      await repository.saveActivity(makeActivity());

      const records = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(records).toHaveLength(1);
      expect(records[0].gameName).toBe('Valorant');
      expect(records[0].durationMin).toBe(30);
    });

    it('applicationId가 null인 경우도 저장한다', async () => {
      await repository.saveActivity(makeActivity({ applicationId: null }));

      const record = await dataSource
        .getRepository(VoiceGameActivityOrm)
        .findOneBy({ gameName: 'Valorant' });
      expect(record.applicationId).toBeNull();
    });
  });

  describe('upsertDaily', () => {
    it('신규 레코드를 INSERT한다', async () => {
      await repository.upsertDaily('guild-1', 'user-1', 'Valorant', '2026-03-18', 30);

      const record = await dataSource.getRepository(VoiceGameDailyOrm).findOneBy({
        guildId: 'guild-1',
        userId: 'user-1',
        gameName: 'Valorant',
      });
      expect(record.totalMinutes).toBe(30);
      expect(record.sessionCount).toBe(1);
    });

    it('기존 레코드에 totalMinutes와 sessionCount를 누적한다', async () => {
      await repository.upsertDaily('guild-1', 'user-1', 'Valorant', '2026-03-18', 30);
      await repository.upsertDaily(
        'guild-1',
        'user-1',
        'Valorant',
        '2026-03-18',
        ACCUMULATED_DURATION_MIN,
      );

      const record = await dataSource.getRepository(VoiceGameDailyOrm).findOneBy({
        guildId: 'guild-1',
        userId: 'user-1',
        gameName: 'Valorant',
      });
      expect(record.totalMinutes).toBe(ACCUMULATED_TOTAL_MIN);
      expect(record.sessionCount).toBe(2);
    });

    it('다른 게임은 별도 레코드로 저장한다', async () => {
      await repository.upsertDaily('guild-1', 'user-1', 'Valorant', '2026-03-18', 30);
      await repository.upsertDaily('guild-1', 'user-1', 'League of Legends', '2026-03-18', 60);

      const records = await dataSource.getRepository(VoiceGameDailyOrm).findBy({
        guildId: 'guild-1',
        userId: 'user-1',
      });
      expect(records).toHaveLength(2);
    });
  });

  describe('deleteExpiredActivities', () => {
    it('cutoff 이전 레코드를 삭제한다', async () => {
      await repository.saveActivity(
        makeActivity({
          startedAt: new Date('2025-12-01T00:00:00Z'),
          endedAt: new Date('2025-12-01T01:00:00Z'),
        }),
      );
      await repository.saveActivity(
        makeActivity({
          userId: 'user-2',
          startedAt: new Date('2026-03-18T10:00:00Z'),
          endedAt: new Date('2026-03-18T11:00:00Z'),
        }),
      );

      const deleted = await repository.deleteExpiredActivities(new Date('2026-01-01T00:00:00Z'));

      expect(deleted).toBe(1);
      const remaining = await dataSource.getRepository(VoiceGameActivityOrm).find();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].userId).toBe('user-2');
    });
  });
});
