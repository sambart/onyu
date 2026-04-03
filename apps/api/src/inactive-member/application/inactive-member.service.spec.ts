import {
  type InactiveMemberClassifyParams,
  InactiveMemberGrade,
} from '../domain/inactive-member.types';
import { InactiveMemberRecord } from '../domain/inactive-member-record.entity';
import { InactiveMemberService } from './inactive-member.service';

/**
 * InactiveMemberRecord 도메인 Entity + InactiveMemberService 단위 테스트.
 * classify 로직이 핵심 비즈니스 규칙이므로 집중 테스트한다.
 */
describe('InactiveMemberRecord.classify (도메인 로직)', () => {
  const defaultConfig: InactiveMemberClassifyParams = {
    lowActiveThresholdMin: 30,
    decliningPercent: 50,
  };

  function createAndClassify(
    totalMinutes: number,
    prevTotalMinutes: number,
    config: InactiveMemberClassifyParams = defaultConfig,
  ): InactiveMemberRecord {
    const record = InactiveMemberRecord.create('guild-1', 'user-1', null);
    record.classify(totalMinutes, prevTotalMinutes, null, config);
    return record;
  }

  it('음성 활동이 0분이면 FULLY_INACTIVE', () => {
    const record = createAndClassify(0, 100);
    expect(record.grade).toBe(InactiveMemberGrade.FULLY_INACTIVE);
  });

  it('음성 활동이 0분이고 이전 기간도 0이면 FULLY_INACTIVE', () => {
    const record = createAndClassify(0, 0);
    expect(record.grade).toBe(InactiveMemberGrade.FULLY_INACTIVE);
  });

  it('활동 시간이 lowActiveThresholdMin 미만이면 LOW_ACTIVE', () => {
    const record = createAndClassify(29, 100);
    expect(record.grade).toBe(InactiveMemberGrade.LOW_ACTIVE);
  });

  it('활동 시간이 lowActiveThresholdMin과 정확히 같으면 LOW_ACTIVE가 아님', () => {
    const record = createAndClassify(30, 0);
    expect(record.grade).not.toBe(InactiveMemberGrade.LOW_ACTIVE);
  });

  it('이전 대비 50% 이상 감소하면 DECLINING', () => {
    const record = createAndClassify(50, 100);
    expect(record.grade).toBe(InactiveMemberGrade.DECLINING);
  });

  it('이전 대비 50% 미만 감소하면 활동 회원 (null)', () => {
    const record = createAndClassify(51, 100);
    expect(record.grade).toBeNull();
  });

  it('이전 기간 활동이 0이면 DECLINING 판정하지 않는다', () => {
    const record = createAndClassify(30, 0);
    expect(record.grade).toBeNull();
  });

  it('활동이 증가한 경우 활동 회원 (null)', () => {
    const record = createAndClassify(100, 50);
    expect(record.grade).toBeNull();
  });

  it('커스텀 lowActiveThresholdMin=60 적용', () => {
    const config: InactiveMemberClassifyParams = {
      lowActiveThresholdMin: 60,
      decliningPercent: 50,
    };
    expect(createAndClassify(59, 0, config).grade).toBe(InactiveMemberGrade.LOW_ACTIVE);
    expect(createAndClassify(60, 0, config).grade).toBeNull();
  });

  it('커스텀 decliningPercent=30 적용', () => {
    const config: InactiveMemberClassifyParams = {
      lowActiveThresholdMin: 30,
      decliningPercent: 30,
    };
    expect(createAndClassify(70, 100, config).grade).toBe(InactiveMemberGrade.DECLINING);
    expect(createAndClassify(71, 100, config).grade).toBeNull();
  });

  it('lowActiveThresholdMin보다 낮으면 DECLINING보다 LOW_ACTIVE가 우선', () => {
    const record = createAndClassify(10, 100);
    expect(record.grade).toBe(InactiveMemberGrade.LOW_ACTIVE);
  });

  it('등급이 변경되면 gradeChangedAt이 갱신된다', () => {
    const record = InactiveMemberRecord.create('guild-1', 'user-1', null);
    expect(record.gradeChangedAt).toBeNull();

    record.classify(0, 0, null, defaultConfig);
    expect(record.gradeChangedAt).toBeInstanceOf(Date);
  });

  it('isInactive getter 동작', () => {
    expect(createAndClassify(0, 0).isInactive).toBe(true);
    expect(createAndClassify(100, 50).isInactive).toBe(false);
  });
});

describe('InactiveMemberService', () => {
  let service: InactiveMemberService;

  const mockRepo = {
    findConfigByGuildId: vi.fn(),
    createDefaultConfig: vi.fn(),
    batchUpsertRecords: vi.fn(),
  };

  const mockQueryRepo = {
    sumVoiceDurationByUser: vi.fn(),
    findLastVoiceDateByUser: vi.fn(),
    countByGrade: vi.fn(),
    findReturnedCount: vi.fn(),
    findTrend: vi.fn(),
  };

  const mockFlushService = { safeFlushAll: vi.fn() };
  const mockDiscordClient = { guilds: { cache: { get: vi.fn() } } };

  beforeEach(() => {
    service = new (InactiveMemberService as unknown as new (
      ...args: unknown[]
    ) => InactiveMemberService)(mockRepo, mockQueryRepo, mockFlushService, mockDiscordClient);
    vi.clearAllMocks();
  });

  // private 메서드 접근
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callPrivate = (method: string, ...args: unknown[]) => (service as any)[method](...args);

  describe('buildDateRanges', () => {
    it('30일 기간에 대해 올바른 날짜 범위를 생성한다', () => {
      const ranges = callPrivate('buildDateRanges', 30);

      expect(ranges.fromDate).toBeDefined();
      expect(ranges.toDate).toBeDefined();
      expect(ranges.prevFromDate).toBeDefined();
      expect(ranges.prevToDate).toBeDefined();

      // toDate >= fromDate
      expect(ranges.toDate >= ranges.fromDate).toBe(true);
      // prevToDate < fromDate (이전 기간은 현재 기간 전)
      expect(ranges.prevToDate < ranges.fromDate).toBe(true);
      // prevToDate >= prevFromDate
      expect(ranges.prevToDate >= ranges.prevFromDate).toBe(true);
    });
  });

  describe('formatYyyymmdd / parseYyyymmdd', () => {
    it('Date를 YYYYMMDD 형식으로 변환한다', () => {
      const date = new Date(2026, 2, 15); // 2026-03-15 (month는 0-based)
      expect(callPrivate('formatYyyymmdd', date)).toBe('20260315');
    });

    it('YYYYMMDD 문자열을 Date로 파싱한다', () => {
      const date = callPrivate('parseYyyymmdd', '20260315') as Date;
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(2); // 0-based
      expect(date.getDate()).toBe(15);
    });
  });

  describe('getStats', () => {
    it('통계를 올바르게 집계한다', async () => {
      mockQueryRepo.countByGrade.mockResolvedValue({
        totalClassified: 100,
        fullyInactiveCount: 20,
        lowActiveCount: 15,
        decliningCount: 5,
      });
      mockQueryRepo.findReturnedCount.mockResolvedValue(3);
      mockQueryRepo.findTrend.mockResolvedValue([]);

      const stats = await service.getStats('guild-1');

      expect(stats.totalMembers).toBe(100);
      expect(stats.activeCount).toBe(60);
      expect(stats.fullyInactiveCount).toBe(20);
      expect(stats.returnedCount).toBe(3);
    });
  });

  describe('classifyGuild — gracePeriodDays 필터링', () => {
    /**
     * classifyGuild에서 gracePeriodDays 필터 동작을 검증하기 위해
     * discordAdapter, repo, queryRepo 모두 mock이 필요하다.
     * 기존 mockDiscordClient를 discordAdapter mock으로 확장한다.
     */

    /** APIGuildMember 최소 구조를 생성하는 헬퍼 */
    function makeMember(userId: string, joinedAt: string | null): Record<string, unknown> {
      return {
        user: { id: userId, bot: false, global_name: userId, username: userId },
        nick: null,
        roles: [],
        joined_at: joinedAt,
      };
    }

    /** 날짜 오프셋 헬퍼: 오늘로부터 daysAgo일 전 ISO 문자열 반환 */
    function daysAgo(daysAgoCount: number): string {
      const d = new Date();
      d.setDate(d.getDate() - daysAgoCount);
      return d.toISOString();
    }

    /** classifyGuild 실행에 필요한 공통 mock 설정 */
    function setupClassifyMocks(members: Record<string, unknown>[], gracePeriodDays: number): void {
      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockResolvedValue(undefined);
      mockRepo.deleteRecordsNotIn = vi.fn().mockResolvedValue(0);

      mockDiscordClient.fetchGuildMembers = vi.fn().mockResolvedValue(members);

      mockQueryRepo.sumVoiceDurationByUser.mockResolvedValue(new Map());
      mockQueryRepo.findLastVoiceDateByUser.mockResolvedValue(new Map());

      mockFlushService.safeFlushAll.mockResolvedValue(undefined);
    }

    it('gracePeriodDays=0이면 유예 없이 모든 멤버가 분류 대상이다', async () => {
      const members = [
        makeMember('user-1', daysAgo(1)), // 가입 1일 전
        makeMember('user-2', daysAgo(3)), // 가입 3일 전
        makeMember('user-3', daysAgo(10)), // 가입 10일 전
      ];
      setupClassifyMocks(members, 0);

      const result = await service.classifyGuild('guild-1');

      expect(result).toHaveLength(3);
    });

    it('gracePeriodDays=7이고 가입 3일 전인 멤버는 분류 대상에서 제외된다', async () => {
      const members = [
        makeMember('user-new', daysAgo(3)), // 가입 3일 전 — 유예 기간 내
        makeMember('user-old', daysAgo(10)), // 가입 10일 전 — 유예 기간 초과
      ];
      setupClassifyMocks(members, 7);

      const result = await service.classifyGuild('guild-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-old');
    });

    it('gracePeriodDays=7이고 가입 10일 전인 멤버는 분류 대상에 포함된다', async () => {
      const members = [
        makeMember('user-old', daysAgo(10)), // 가입 10일 전 — 유예 기간 초과
      ];
      setupClassifyMocks(members, 7);

      const result = await service.classifyGuild('guild-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-old');
    });

    it('joined_at이 null인 멤버는 유예 기간과 무관하게 분류 대상에 포함된다', async () => {
      const members = [
        makeMember('user-no-join', null), // joined_at 없음
      ];
      setupClassifyMocks(members, 7);

      const result = await service.classifyGuild('guild-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-no-join');
    });
  });
});
