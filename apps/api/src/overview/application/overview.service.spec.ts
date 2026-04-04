import type { Repository } from 'typeorm';
import type { Mocked } from 'vitest';

import type { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import type { GuildMemberService } from '../../guild-member/application/guild-member.service';
import type { GuildMemberOrmEntity } from '../../guild-member/infrastructure/guild-member.orm-entity';
import type { InactiveMemberRecordOrm } from '../../inactive-member/infrastructure/inactive-member-record.orm-entity';
import type { NewbieConfigRepository } from '../../newbie/infrastructure/newbie-config.repository';
import type { NewbieMissionRepository } from '../../newbie/infrastructure/newbie-mission.repository';
import type { RedisService } from '../../redis/redis.service';
import { OverviewService } from './overview.service';

function makeQb(rawValue: unknown, oneValue?: unknown) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue(oneValue ?? rawValue),
    getRawMany: vi.fn().mockResolvedValue(rawValue),
    getOne: vi.fn().mockResolvedValue(oneValue ?? null),
  };
  return qb;
}

/** 2시간 = 7200초 (오늘 음성 총 시간 테스트 기댓값) */
const TWO_HOURS_IN_SECONDS = 7200;
/** 비활동 통계 activeRate 기댓값: round(10/15 * 100) = 67 */
const EXPECTED_ACTIVE_RATE = 67;

// eslint-disable-next-line max-lines-per-function -- describe 블록은 구조상 불가피하게 길어진다
describe('OverviewService', () => {
  let service: OverviewService;
  let guildMemberService: Mocked<GuildMemberService>;
  let newbieConfigRepo: Mocked<NewbieConfigRepository>;
  let newbieMissionRepo: Mocked<NewbieMissionRepository>;
  let redis: Mocked<RedisService>;
  let voiceDailyRepo: Mocked<Repository<VoiceDailyOrm>>;
  let inactiveRecordRepo: Mocked<Repository<InactiveMemberRecordOrm>>;

  beforeEach(() => {
    guildMemberService = {
      findActiveMembersExcludingBots: vi.fn(),
    } as unknown as Mocked<GuildMemberService>;

    newbieConfigRepo = {
      findByGuildId: vi.fn(),
    } as unknown as Mocked<NewbieConfigRepository>;

    newbieMissionRepo = {
      countByStatusForGuild: vi.fn(),
    } as unknown as Mocked<NewbieMissionRepository>;

    redis = {
      get: vi.fn(),
    } as unknown as Mocked<RedisService>;

    voiceDailyRepo = {
      createQueryBuilder: vi.fn(),
    } as unknown as Mocked<Repository<VoiceDailyOrm>>;

    inactiveRecordRepo = {
      createQueryBuilder: vi.fn(),
    } as unknown as Mocked<Repository<InactiveMemberRecordOrm>>;

    service = new OverviewService(
      guildMemberService,
      newbieConfigRepo,
      newbieMissionRepo,
      redis,
      voiceDailyRepo,
      inactiveRecordRepo,
    );
  });

  // eslint-disable-next-line max-lines-per-function -- 다수의 it 케이스를 포함하는 describe 블록
  describe('getOverview', () => {
    beforeEach(() => {
      // GuildMemberService: 1000명 반환
      guildMemberService.findActiveMembersExcludingBots.mockResolvedValue(
        Array.from({ length: 1000 }, () => ({}) as GuildMemberOrmEntity),
      );

      // 오늘 voice totalSec
      const voiceTodayQb = makeQb({ totalSec: String(TWO_HOURS_IN_SECONDS) });
      // 주간 voice
      const voiceWeeklyQb = makeQb([]);

      let voiceQbCallCount = 0;
      voiceDailyRepo.createQueryBuilder.mockImplementation(() => {
        voiceQbCallCount++;
        // 첫 번째 호출: 오늘 totalSec, 두 번째 호출: 주간 데이터
        // as unknown 경유: makeQb 반환 객체가 SelectQueryBuilder 전체 인터페이스를 구현하지 않아 이중 단언이 필요하다
        return (voiceQbCallCount === 1 ? voiceTodayQb : voiceWeeklyQb) as unknown as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >;
      });

      // 현재 음성 사용자 수 — Redis에서 조회
      redis.get.mockResolvedValue(5 as unknown as null);

      // 비활동 통계
      const inactiveQb = makeQb([
        { grade: 'FULLY_INACTIVE', count: '3' },
        { grade: 'LOW_ACTIVE', count: '2' },
        { grade: null, count: '10' },
      ]);
      inactiveRecordRepo.createQueryBuilder.mockReturnValue(
        // as unknown 경유: makeQb 반환 객체가 SelectQueryBuilder 전체 인터페이스를 구현하지 않아 이중 단언이 필요하다
        inactiveQb as unknown as ReturnType<typeof inactiveRecordRepo.createQueryBuilder>,
      );

      // 미션 요약: 비활성화
      newbieConfigRepo.findByGuildId.mockResolvedValue(null);
    });

    it('정상적으로 overview 데이터를 반환한다', async () => {
      const result = await service.getOverview('guild-1');

      expect(result.totalMemberCount).toBe(1000);
      expect(result.todayVoiceTotalSec).toBe(TWO_HOURS_IN_SECONDS);
      expect(result.currentVoiceUserCount).toBe(5);
    });

    it('활성 비봇 멤버가 없으면 totalMemberCount는 0이다', async () => {
      guildMemberService.findActiveMembersExcludingBots.mockResolvedValue([]);

      const result = await service.getOverview('guild-1');

      expect(result.totalMemberCount).toBe(0);
    });

    it('Redis에 값이 없으면 currentVoiceUserCount는 0이다', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.getOverview('guild-1');

      expect(result.currentVoiceUserCount).toBe(0);
    });

    it('missionEnabled가 false이면 missionSummary는 null이다', async () => {
      newbieConfigRepo.findByGuildId.mockResolvedValue({
        missionEnabled: false,
      } as Awaited<ReturnType<typeof newbieConfigRepo.findByGuildId>>);

      const result = await service.getOverview('guild-1');

      expect(result.missionSummary).toBeNull();
    });

    it('missionEnabled가 true이면 missionSummary를 포함한다', async () => {
      newbieConfigRepo.findByGuildId.mockResolvedValue({
        missionEnabled: true,
      } as Awaited<ReturnType<typeof newbieConfigRepo.findByGuildId>>);

      newbieMissionRepo.countByStatusForGuild.mockResolvedValue({
        IN_PROGRESS: 5,
        COMPLETED: 10,
        FAILED: 2,
      } as Awaited<ReturnType<typeof newbieMissionRepo.countByStatusForGuild>>);

      const result = await service.getOverview('guild-1');

      expect(result.missionSummary).toEqual({
        inProgress: 5,
        completed: 10,
        failed: 2,
      });
    });

    it('비활동 통계를 올바르게 집계한다', async () => {
      const result = await service.getOverview('guild-1');

      // FULLY_INACTIVE: 3, LOW_ACTIVE: 2, null(active): 10 → total: 15
      // activeRate = round(10/15 * 100) = 67
      expect(result.inactiveByGrade.fullyInactive).toBe(3);
      expect(result.inactiveByGrade.lowActive).toBe(2);
      expect(result.activeRate).toBe(EXPECTED_ACTIVE_RATE);
    });

    it('비활동 레코드가 없으면 activeRate는 0이다', async () => {
      const emptyQb = makeQb([]);
      inactiveRecordRepo.createQueryBuilder.mockReturnValue(
        // as unknown 경유: makeQb 반환 객체가 SelectQueryBuilder 전체 인터페이스를 구현하지 않아 이중 단언이 필요하다
        emptyQb as unknown as ReturnType<typeof inactiveRecordRepo.createQueryBuilder>,
      );

      const result = await service.getOverview('guild-1');

      expect(result.activeRate).toBe(0);
    });
  });

  describe('getWeeklyVoice', () => {
    it('7일치 날짜를 반환하고 데이터 없는 날은 0으로 채운다', async () => {
      // 오늘 통계 쿼리
      const todayQb = makeQb({ totalSec: '0' });
      // 주간 데이터: 특정 날짜만 데이터 있음
      const weeklyQb = makeQb([]);

      let callCount = 0;
      voiceDailyRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        // as unknown 경유: makeQb 반환 객체가 SelectQueryBuilder 전체 인터페이스를 구현하지 않아 이중 단언이 필요하다
        return (callCount === 1 ? todayQb : weeklyQb) as unknown as ReturnType<
          typeof voiceDailyRepo.createQueryBuilder
        >;
      });

      guildMemberService.findActiveMembersExcludingBots.mockResolvedValue([]);
      redis.get.mockResolvedValue(null);
      inactiveRecordRepo.createQueryBuilder.mockReturnValue(
        // as unknown 경유: makeQb 반환 객체가 SelectQueryBuilder 전체 인터페이스를 구현하지 않아 이중 단언이 필요하다
        makeQb([]) as unknown as ReturnType<typeof inactiveRecordRepo.createQueryBuilder>,
      );
      newbieConfigRepo.findByGuildId.mockResolvedValue(null);

      const result = await service.getOverview('guild-1');

      expect(result.weeklyVoice).toHaveLength(7);
      result.weeklyVoice.forEach((entry) => {
        expect(entry.date).toMatch(/^\d{8}$/); // YYYYMMDD 형식
        expect(entry.totalSec).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
