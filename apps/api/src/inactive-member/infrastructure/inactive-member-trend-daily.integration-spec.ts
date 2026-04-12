/**
 * inactive_member_trend_daily 스냅샷 기능 통합 테스트
 *
 * 실행 전제: PostgreSQL 컨테이너가 기동 중이어야 한다.
 * 로컬 단독 실행: docker exec -w //workspace nest-api pnpm --filter @nexus/api test -- --testPathPattern='inactive-member-trend-daily.integration-spec' --no-coverage
 */
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { InactiveMemberRepository } from './inactive-member.repository';
import { InactiveMemberActionLogOrm } from './inactive-member-action-log.orm-entity';
import { InactiveMemberConfigOrm } from './inactive-member-config.orm-entity';
import { InactiveMemberQueryRepository } from './inactive-member-query.repository';
import { InactiveMemberRecordOrm } from './inactive-member-record.orm-entity';
import { InactiveMemberTrendDailyOrm } from './inactive-member-trend-daily.orm-entity';

// 테스트에서 사용할 고정 날짜 헬퍼
function dateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

describe('InactiveMemberTrendDaily (Integration)', () => {
  let module: TestingModule;
  let queryRepo: InactiveMemberQueryRepository;
  let repo: InactiveMemberRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [
        InactiveMemberConfigOrm,
        InactiveMemberRecordOrm,
        InactiveMemberActionLogOrm,
        InactiveMemberTrendDailyOrm,
        VoiceDailyOrm,
      ],
      providers: [InactiveMemberQueryRepository, InactiveMemberRepository],
      withRedis: false,
    }).compile();

    queryRepo = module.get(InactiveMemberQueryRepository);
    repo = module.get(InactiveMemberRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  // ---------------------------------------------------------------
  // InactiveMemberQueryRepository.findTrend()
  // ---------------------------------------------------------------
  describe('InactiveMemberQueryRepository.findTrend()', () => {
    it('빈 테이블에서 빈 배열을 반환한다', async () => {
      const result = await queryRepo.findTrend('guild-1');
      expect(result).toEqual([]);
    });

    it('30일 이내 데이터만 반환한다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      // 29일 전 — 포함 대상
      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(29),
        fullyInactiveCount: 3,
        lowActiveCount: 1,
        decliningCount: 0,
        totalClassified: 4,
      });

      // 31일 전 — 제외 대상
      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(31),
        fullyInactiveCount: 99,
        lowActiveCount: 99,
        decliningCount: 99,
        totalClassified: 99,
      });

      const result = await queryRepo.findTrend('guild-1');

      expect(result).toHaveLength(1);
      expect(result[0].fullyInactive).toBe(3);
      expect(result[0].lowActive).toBe(1);
      expect(result[0].declining).toBe(0);
    });

    it('여러 날짜의 데이터가 날짜 오름차순으로 모두 반환된다 (이전 버그: 1일치만 반환)', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      // 날짜를 내림차순으로 INSERT하여 정렬 동작도 검증
      await trendRepo.save([
        {
          guildId: 'guild-1',
          date: dateString(10),
          fullyInactiveCount: 10,
          lowActiveCount: 2,
          decliningCount: 1,
          totalClassified: 13,
        },
        {
          guildId: 'guild-1',
          date: dateString(5),
          fullyInactiveCount: 8,
          lowActiveCount: 3,
          decliningCount: 2,
          totalClassified: 13,
        },
        {
          guildId: 'guild-1',
          date: dateString(1),
          fullyInactiveCount: 5,
          lowActiveCount: 4,
          decliningCount: 3,
          totalClassified: 12,
        },
      ]);

      const result = await queryRepo.findTrend('guild-1');

      expect(result).toHaveLength(3);

      // 날짜 오름차순 확인
      expect(new Date(result[0].date) <= new Date(result[1].date)).toBe(true);
      expect(new Date(result[1].date) <= new Date(result[2].date)).toBe(true);

      // 가장 오래된 항목 (10일 전)
      expect(result[0].fullyInactive).toBe(10);
      expect(result[0].lowActive).toBe(2);
      expect(result[0].declining).toBe(1);

      // 가장 최근 항목 (1일 전)
      expect(result[2].fullyInactive).toBe(5);
      expect(result[2].lowActive).toBe(4);
      expect(result[2].declining).toBe(3);
    });

    it('date 필드가 YYYY-MM-DD 형식 10글자로 반환된다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(1),
        fullyInactiveCount: 1,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 1,
      });

      const result = await queryRepo.findTrend('guild-1');

      expect(result).toHaveLength(1);
      expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result[0].date).toHaveLength(10);
    });

    it('다른 길드의 데이터는 반환하지 않는다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      await trendRepo.save([
        {
          guildId: 'guild-1',
          date: dateString(1),
          fullyInactiveCount: 5,
          lowActiveCount: 0,
          decliningCount: 0,
          totalClassified: 5,
        },
        {
          guildId: 'guild-2',
          date: dateString(1),
          fullyInactiveCount: 99,
          lowActiveCount: 99,
          decliningCount: 99,
          totalClassified: 99,
        },
      ]);

      const result = await queryRepo.findTrend('guild-1');

      expect(result).toHaveLength(1);
      expect(result[0].fullyInactive).toBe(5);
    });

    it('TrendEntry 인터페이스 { date, fullyInactive, lowActive, declining } 형식을 반환한다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(2),
        fullyInactiveCount: 7,
        lowActiveCount: 3,
        decliningCount: 2,
        totalClassified: 12,
      });

      const [entry] = await queryRepo.findTrend('guild-1');

      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('fullyInactive');
      expect(entry).toHaveProperty('lowActive');
      expect(entry).toHaveProperty('declining');
      expect(typeof entry.fullyInactive).toBe('number');
      expect(typeof entry.lowActive).toBe('number');
      expect(typeof entry.declining).toBe('number');
      expect(entry.fullyInactive).toBe(7);
      expect(entry.lowActive).toBe(3);
      expect(entry.declining).toBe(2);
    });
  });

  // ---------------------------------------------------------------
  // InactiveMemberRepository.saveTrendSnapshot()
  // ---------------------------------------------------------------
  describe('InactiveMemberRepository.saveTrendSnapshot()', () => {
    it('새 레코드를 INSERT한다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      await repo.saveTrendSnapshot('guild-1', dateString(0), {
        fullyInactiveCount: 10,
        lowActiveCount: 5,
        decliningCount: 2,
        totalClassified: 17,
      });

      const saved = await trendRepo.findOne({
        where: { guildId: 'guild-1', date: dateString(0) },
      });

      expect(saved).not.toBeNull();
      expect(saved!.fullyInactiveCount).toBe(10);
      expect(saved!.lowActiveCount).toBe(5);
      expect(saved!.decliningCount).toBe(2);
      expect(saved!.totalClassified).toBe(17);
    });

    it('동일한 (guildId, date) 조합이 이미 존재하면 카운트를 UPSERT로 덮어쓴다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);
      const today = dateString(0);

      // 첫 번째 INSERT
      await repo.saveTrendSnapshot('guild-1', today, {
        fullyInactiveCount: 10,
        lowActiveCount: 5,
        decliningCount: 2,
        totalClassified: 17,
      });

      // 두 번째 UPSERT — 카운트 변경
      await repo.saveTrendSnapshot('guild-1', today, {
        fullyInactiveCount: 15,
        lowActiveCount: 3,
        decliningCount: 1,
        totalClassified: 19,
      });

      const records = await trendRepo.find({ where: { guildId: 'guild-1', date: today } });

      // 레코드가 1개만 존재해야 한다 (INSERT가 아닌 UPDATE)
      expect(records).toHaveLength(1);
      expect(records[0].fullyInactiveCount).toBe(15);
      expect(records[0].lowActiveCount).toBe(3);
      expect(records[0].decliningCount).toBe(1);
      expect(records[0].totalClassified).toBe(19);
    });

    it('서로 다른 길드 + 같은 날짜는 별도 레코드로 저장된다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);
      const today = dateString(0);

      await repo.saveTrendSnapshot('guild-1', today, {
        fullyInactiveCount: 1,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 1,
      });

      await repo.saveTrendSnapshot('guild-2', today, {
        fullyInactiveCount: 2,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 2,
      });

      const all = await trendRepo.find();
      expect(all).toHaveLength(2);
    });

    it('같은 길드 + 서로 다른 날짜는 별도 레코드로 저장된다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      await repo.saveTrendSnapshot('guild-1', dateString(0), {
        fullyInactiveCount: 1,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 1,
      });

      await repo.saveTrendSnapshot('guild-1', dateString(1), {
        fullyInactiveCount: 2,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 2,
      });

      const all = await trendRepo.find({ where: { guildId: 'guild-1' } });
      expect(all).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------
  // InactiveMemberRepository.deleteTrendBefore()
  // ---------------------------------------------------------------
  describe('InactiveMemberRepository.deleteTrendBefore()', () => {
    it('90일 초과 레코드만 삭제하고 최근 레코드는 유지한다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      // 91일 전 — 삭제 대상
      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(91),
        fullyInactiveCount: 1,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 1,
      });

      // 89일 전 — 유지 대상
      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(89),
        fullyInactiveCount: 2,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 2,
      });

      // 오늘 — 유지 대상
      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(0),
        fullyInactiveCount: 3,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 3,
      });

      const deleted = await repo.deleteTrendBefore(90);

      expect(deleted).toBe(1);

      const remaining = await trendRepo.find({ where: { guildId: 'guild-1' } });
      expect(remaining).toHaveLength(2);

      const remainingDates = remaining.map((r) => r.date);
      // 91일 전 레코드가 없어야 한다
      expect(remainingDates).not.toContain(dateString(91));
    });

    it('삭제 대상이 없으면 0을 반환한다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      // 최근 데이터만 존재
      await trendRepo.save({
        guildId: 'guild-1',
        date: dateString(1),
        fullyInactiveCount: 1,
        lowActiveCount: 0,
        decliningCount: 0,
        totalClassified: 1,
      });

      const deleted = await repo.deleteTrendBefore(90);

      expect(deleted).toBe(0);
    });

    it('빈 테이블에서 호출해도 오류 없이 0을 반환한다', async () => {
      const deleted = await repo.deleteTrendBefore(90);
      expect(deleted).toBe(0);
    });

    it('여러 길드의 90일 초과 레코드를 모두 삭제한다', async () => {
      const trendRepo = dataSource.getRepository(InactiveMemberTrendDailyOrm);

      // guild-1, guild-2 모두 91일 전 레코드
      await trendRepo.save([
        {
          guildId: 'guild-1',
          date: dateString(92),
          fullyInactiveCount: 1,
          lowActiveCount: 0,
          decliningCount: 0,
          totalClassified: 1,
        },
        {
          guildId: 'guild-2',
          date: dateString(95),
          fullyInactiveCount: 1,
          lowActiveCount: 0,
          decliningCount: 0,
          totalClassified: 1,
        },
        // 유지 대상
        {
          guildId: 'guild-1',
          date: dateString(0),
          fullyInactiveCount: 5,
          lowActiveCount: 0,
          decliningCount: 0,
          totalClassified: 5,
        },
      ]);

      const deleted = await repo.deleteTrendBefore(90);

      expect(deleted).toBe(2);

      const remaining = await trendRepo.find();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].guildId).toBe('guild-1');
      expect(remaining[0].fullyInactiveCount).toBe(5);
    });
  });
});
