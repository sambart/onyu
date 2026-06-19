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
    deleteRecordsNotIn: vi.fn(),
  };

  const mockQueryRepo = {
    sumVoiceDurationByUser: vi.fn(),
    findLastVoiceDateByUser: vi.fn(),
    countByGrade: vi.fn(),
    findReturnedCount: vi.fn(),
    findTrend: vi.fn(),
  };

  const mockFlushService = { safeFlushAll: vi.fn() };
  const mockDiscordClient = {
    guilds: { cache: { get: vi.fn() } },
    fetchGuildMembers: vi.fn(),
  };
  const mockDataSource = {
    transaction: vi.fn((cb: (manager: unknown) => Promise<unknown>) => cb({})),
  };

  beforeEach(() => {
    service = new (InactiveMemberService as unknown as new (
      ...args: unknown[]
    ) => InactiveMemberService)(
      mockRepo,
      mockQueryRepo,
      mockFlushService,
      mockDiscordClient,
      mockDataSource,
    );
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
      mockRepo.deleteRecordsNotIn.mockResolvedValue(0);

      // dataSource.transaction mock: 콜백을 즉시 실행하며 빈 manager 객체를 전달한다
      mockDataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) =>
        cb({}),
      );

      mockDiscordClient.fetchGuildMembers.mockResolvedValue(members);

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

  describe('classifyGuild — 트랜잭션 경계 회귀 가드', () => {
    /** APIGuildMember 최소 구조를 생성하는 헬퍼 */
    function makeMember(userId: string): Record<string, unknown> {
      return {
        user: { id: userId, bot: false, global_name: userId, username: userId },
        nick: null,
        roles: [],
        joined_at: null,
      };
    }

    /** 기본 mock 설정: fakeManager 를 외부에서 주입받아 단언에 재사용 */
    function setupWithManager(fakeManager: object): void {
      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 0,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockResolvedValue(undefined);
      mockRepo.deleteRecordsNotIn.mockResolvedValue(0);

      // transaction mock: 콜백에 fakeManager 를 전달하고 결과를 그대로 반환
      mockDataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) =>
        cb(fakeManager),
      );

      mockDiscordClient.fetchGuildMembers.mockResolvedValue([makeMember('user-1')]);
      mockQueryRepo.sumVoiceDurationByUser.mockResolvedValue(new Map());
      mockQueryRepo.findLastVoiceDateByUser.mockResolvedValue(new Map());
      mockFlushService.safeFlushAll.mockResolvedValue(undefined);
    }

    it('classifyGuild 실행 시 dataSource.transaction 이 정확히 1회 호출된다', async () => {
      setupWithManager({});

      await service.classifyGuild('guild-1');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('batchUpsertRecords 와 deleteRecordsNotIn 이 동일한 manager 인자로 호출된다', async () => {
      // 식별 가능한 객체를 fakeManager로 사용하여 동일 참조 여부를 단언한다
      const fakeManager = { __txId: 'test-transaction-marker' };
      setupWithManager(fakeManager);

      await service.classifyGuild('guild-1');

      // batchUpsertRecords 의 두 번째 인자가 fakeManager 인지 확인
      expect(mockRepo.batchUpsertRecords).toHaveBeenCalledTimes(1);
      expect(mockRepo.batchUpsertRecords.mock.calls[0][1]).toBe(fakeManager);

      // deleteRecordsNotIn 의 세 번째 인자가 동일한 fakeManager 인지 확인
      expect(mockRepo.deleteRecordsNotIn).toHaveBeenCalledTimes(1);
      expect(mockRepo.deleteRecordsNotIn.mock.calls[0][2]).toBe(fakeManager);
    });

    it('batchUpsertRecords 와 deleteRecordsNotIn 이 transaction 콜백 내부(동일 트랜잭션)에서 호출된다', async () => {
      const callOrder: string[] = [];

      const fakeManager = { __txId: 'tx' };
      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 0,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockImplementation(async () => {
        callOrder.push('batchUpsert');
      });
      mockRepo.deleteRecordsNotIn.mockImplementation(async () => {
        callOrder.push('deleteNotIn');
        return 0;
      });

      // transaction 콜백 실행 전후에 마커를 삽입하여 두 write 가 콜백 안에 있음을 검증한다
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: unknown) => Promise<unknown>) => {
          callOrder.push('tx:begin');
          const result = await cb(fakeManager);
          callOrder.push('tx:end');
          return result;
        },
      );

      mockDiscordClient.fetchGuildMembers.mockResolvedValue([makeMember('user-1')]);
      mockQueryRepo.sumVoiceDurationByUser.mockResolvedValue(new Map());
      mockQueryRepo.findLastVoiceDateByUser.mockResolvedValue(new Map());
      mockFlushService.safeFlushAll.mockResolvedValue(undefined);

      await service.classifyGuild('guild-1');

      // tx:begin → batchUpsert → deleteNotIn → tx:end 순서여야 한다
      expect(callOrder).toEqual(['tx:begin', 'batchUpsert', 'deleteNotIn', 'tx:end']);
    });

    it('deleteRecordsNotIn 이 reject 하면 classifyGuild 가 그 에러를 전파한다(트랜잭션 롤백 시뮬레이션)', async () => {
      const fakeManager = { __txId: 'tx-fail' };
      const deleteError = new Error('DB connection lost during delete');

      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 0,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockResolvedValue(undefined);
      // deleteRecordsNotIn 이 실패하면 콜백 전체가 reject → transaction 도 reject
      mockRepo.deleteRecordsNotIn.mockRejectedValue(deleteError);

      // transaction mock: 콜백 에러를 그대로 전파(실제 DB와 동일 동작)
      mockDataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) =>
        cb(fakeManager),
      );

      mockDiscordClient.fetchGuildMembers.mockResolvedValue([makeMember('user-1')]);
      mockQueryRepo.sumVoiceDurationByUser.mockResolvedValue(new Map());
      mockQueryRepo.findLastVoiceDateByUser.mockResolvedValue(new Map());
      mockFlushService.safeFlushAll.mockResolvedValue(undefined);

      await expect(service.classifyGuild('guild-1')).rejects.toThrow(
        'DB connection lost during delete',
      );
    });

    it('batchUpsertRecords 가 reject 하면 deleteRecordsNotIn 은 호출되지 않는다(트랜잭션 단락)', async () => {
      const fakeManager = { __txId: 'tx-upsert-fail' };
      const upsertError = new Error('Upsert constraint violation');

      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 0,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockRejectedValue(upsertError);
      mockRepo.deleteRecordsNotIn.mockResolvedValue(0);

      mockDataSource.transaction.mockImplementation((cb: (manager: unknown) => Promise<unknown>) =>
        cb(fakeManager),
      );

      mockDiscordClient.fetchGuildMembers.mockResolvedValue([makeMember('user-1')]);
      mockQueryRepo.sumVoiceDurationByUser.mockResolvedValue(new Map());
      mockQueryRepo.findLastVoiceDateByUser.mockResolvedValue(new Map());
      mockFlushService.safeFlushAll.mockResolvedValue(undefined);

      await expect(service.classifyGuild('guild-1')).rejects.toThrow('Upsert constraint violation');

      // batchUpsert 실패로 인해 deleteRecordsNotIn 은 실행되지 않아야 한다
      expect(mockRepo.deleteRecordsNotIn).not.toHaveBeenCalled();
    });

    it('Discord 멤버 조회(fetchGuildMembers)는 transaction 콜백 밖에서 호출된다', async () => {
      const fetchCallOrder: string[] = [];

      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 0,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockResolvedValue(undefined);
      mockRepo.deleteRecordsNotIn.mockResolvedValue(0);

      // fetchGuildMembers 호출 시 마커 기록
      mockDiscordClient.fetchGuildMembers.mockImplementation(async () => {
        fetchCallOrder.push('fetchGuildMembers');
        return [makeMember('user-1')];
      });

      // transaction 콜백 진입 시 마커 기록
      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: unknown) => Promise<unknown>) => {
          fetchCallOrder.push('tx:begin');
          const result = await cb({});
          fetchCallOrder.push('tx:end');
          return result;
        },
      );

      mockQueryRepo.sumVoiceDurationByUser.mockResolvedValue(new Map());
      mockQueryRepo.findLastVoiceDateByUser.mockResolvedValue(new Map());
      mockFlushService.safeFlushAll.mockResolvedValue(undefined);

      await service.classifyGuild('guild-1');

      // fetchGuildMembers 는 tx:begin 보다 먼저 호출되어야 한다(트랜잭션 밖)
      const fetchIdx = fetchCallOrder.indexOf('fetchGuildMembers');
      const txBeginIdx = fetchCallOrder.indexOf('tx:begin');
      expect(fetchIdx).toBeGreaterThanOrEqual(0);
      expect(txBeginIdx).toBeGreaterThanOrEqual(0);
      expect(fetchIdx).toBeLessThan(txBeginIdx);
    });

    it('read 쿼리(sumVoiceDurationByUser)는 transaction 콜백 밖에서 호출된다', async () => {
      const callOrder: string[] = [];

      const config = {
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 0,
        excludedRoleIds: [],
      };

      mockRepo.findConfigByGuildId.mockResolvedValue(config);
      mockRepo.batchUpsertRecords.mockResolvedValue(undefined);
      mockRepo.deleteRecordsNotIn.mockResolvedValue(0);
      mockDiscordClient.fetchGuildMembers.mockResolvedValue([makeMember('user-1')]);

      mockQueryRepo.sumVoiceDurationByUser.mockImplementation(async () => {
        callOrder.push('sumVoiceDuration');
        return new Map();
      });
      mockQueryRepo.findLastVoiceDateByUser.mockImplementation(async () => {
        callOrder.push('findLastVoiceDate');
        return new Map();
      });

      mockDataSource.transaction.mockImplementation(
        async (cb: (manager: unknown) => Promise<unknown>) => {
          callOrder.push('tx:begin');
          const result = await cb({});
          callOrder.push('tx:end');
          return result;
        },
      );

      mockFlushService.safeFlushAll.mockResolvedValue(undefined);

      await service.classifyGuild('guild-1');

      // read 쿼리들이 모두 tx:begin 이전에 호출되었는지 확인
      const txBeginIdx = callOrder.indexOf('tx:begin');
      const sumIdx = callOrder.indexOf('sumVoiceDuration');
      const lastVoiceIdx = callOrder.indexOf('findLastVoiceDate');

      expect(txBeginIdx).toBeGreaterThanOrEqual(0);
      expect(sumIdx).toBeLessThan(txBeginIdx);
      expect(lastVoiceIdx).toBeLessThan(txBeginIdx);
    });
  });
});
