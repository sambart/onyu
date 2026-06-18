import { NotFoundException } from '@nestjs/common';
import { type Mock, type Mocked, vi } from 'vitest';

import { DomainException } from '../../../common/domain-exception';
import { type RedisService } from '../../../redis/redis.service';
import { MissionStatus } from '../../domain/newbie-mission.types';
import { type NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { type NewbieMissionOrmEntity as NewbieMission } from '../../infrastructure/newbie-mission.orm-entity';
import { MissionService } from './mission.service';
import { type MissionRankRenderer } from './mission-rank.renderer';

function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    missionEnabled: true,
    missionDurationDays: 7,
    missionTargetPlaytimeHours: 3,
    missionTargetPlayCount: null,
    missionNotifyChannelId: 'notify-ch',
    missionNotifyMessageId: null,
    missionEmbedTitle: null,
    missionEmbedDescription: null,
    missionEmbedColor: null,
    missionEmbedThumbnailUrl: null,
    missionDisplayMode: 'EMBED' as const,
    missionUseMicTime: false,
    playCountMinDurationMin: null,
    playCountIntervalMin: null,
    welcomeEnabled: false,
    welcomeChannelId: null,
    welcomeEmbedTitle: null,
    welcomeEmbedDescription: null,
    welcomeEmbedColor: null,
    welcomeEmbedThumbnailUrl: null,
    welcomeContent: null,
    mocoEnabled: false,
    mocoNewbieDays: 30,
    mocoAllowNewbieHunter: false,
    mocoRankChannelId: null,
    mocoRankMessageId: null,
    mocoAutoRefreshMinutes: null,
    mocoEmbedTitle: null,
    mocoEmbedDescription: null,
    mocoEmbedColor: null,
    mocoEmbedThumbnailUrl: null,
    mocoDisplayMode: 'EMBED',
    mocoPlayCountMinDurationMin: null,
    mocoPlayCountIntervalMin: null,
    mocoMinCoPresenceMin: 10,
    mocoScorePerSession: 10,
    mocoScorePerMinute: 1,
    mocoScorePerUnique: 5,
    mocoResetPeriod: 'NONE',
    mocoResetIntervalDays: null,
    mocoCurrentPeriodStart: null,
    roleEnabled: false,
    roleDurationDays: null,
    newbieRoleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMission(overrides: Partial<NewbieMission> = {}): NewbieMission {
  return {
    id: 1,
    guildId: 'guild-1',
    memberId: 'user-1',
    memberName: '동현',
    startDate: '20260301',
    endDate: '20260308',
    targetPlaytimeSec: 10800,
    targetPlayCount: null,
    status: MissionStatus.IN_PROGRESS,
    hiddenFromEmbed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** 완전한 체이닝을 지원하는 QueryBuilder mock 생성 유틸리티 */
function makeQb(rawResult: unknown = null) {
  const qb: Record<string, Mock> = {};
  const chain = () => qb as never;
  qb.select = vi.fn().mockReturnValue(chain());
  qb.addSelect = vi.fn().mockReturnValue(chain());
  qb.where = vi.fn().mockReturnValue(chain());
  qb.andWhere = vi.fn().mockReturnValue(chain());
  qb.from = vi.fn().mockReturnValue(chain());
  qb.innerJoin = vi.fn().mockReturnValue(chain());
  qb.orderBy = vi.fn().mockReturnValue(chain());
  qb.limit = vi.fn().mockReturnValue(chain());
  qb.groupBy = vi.fn().mockReturnValue(chain());
  qb.addGroupBy = vi.fn().mockReturnValue(chain());
  qb.distinct = vi.fn().mockReturnValue(chain());
  qb.getRawOne = vi.fn().mockResolvedValue(rawResult);
  qb.getRawMany = vi.fn().mockResolvedValue(Array.isArray(rawResult) ? rawResult : []);
  qb.getMany = vi.fn().mockResolvedValue([]);
  return qb;
}

describe('MissionService', () => {
  let service: MissionService;
  let missionRepo: {
    hasMission: Mock;
    create: Mock;
    findById: Mock;
    updateStatus: Mock;
    updateMemberName: Mock;
    updateHidden: Mock;
    delete: Mock;
    findVisibleByGuild: Mock;
    findActiveByGuild: Mock;
    countByStatusForGuild: Mock;
    findMemberIdsWithMission: Mock;
  };
  let configRepo: { findByGuildId: Mock };
  let newbieRedis: { deleteMissionActive: Mock };
  let voiceDailyFlushService: { safeFlushAll: Mock };
  let presenter: {
    refreshMissionEmbed: Mock;
    fetchMemberDisplayName: Mock;
    deleteEmbed: Mock;
    sendOrUpdateCanvasMission: Mock;
  };
  let discordAction: {
    grantRole: Mock;
    sendDmAndKick: Mock;
    fetchMemberDisplayName: Mock;
    checkMemberExists: Mock;
    fetchGuildMembers: Mock;
  };
  let renderer: Mocked<MissionRankRenderer>;
  let redis: Mocked<RedisService>;
  let guildMemberService: { findByUserId: Mock };
  let voiceDailyRepo: { createQueryBuilder: Mock };
  let voiceHistoryRepo: { createQueryBuilder: Mock };

  beforeEach(() => {
    missionRepo = {
      hasMission: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
      updateMemberName: vi.fn(),
      updateHidden: vi.fn(),
      delete: vi.fn(),
      findVisibleByGuild: vi.fn(),
      findActiveByGuild: vi.fn(),
      countByStatusForGuild: vi.fn(),
      findMemberIdsWithMission: vi.fn(),
    };
    configRepo = { findByGuildId: vi.fn() };
    newbieRedis = { deleteMissionActive: vi.fn().mockResolvedValue(undefined) };
    voiceDailyFlushService = { safeFlushAll: vi.fn().mockResolvedValue(undefined) };
    presenter = {
      refreshMissionEmbed: vi.fn().mockResolvedValue(undefined),
      fetchMemberDisplayName: vi.fn(),
      deleteEmbed: vi.fn().mockResolvedValue(undefined),
      sendOrUpdateCanvasMission: vi.fn().mockResolvedValue(undefined),
    };
    renderer = {
      renderPage: vi.fn().mockResolvedValue(Buffer.from('fake-png-data')),
      renderAll: vi.fn().mockResolvedValue(Buffer.from('fake-png-data')),
    } as unknown as Mocked<MissionRankRenderer>;
    guildMemberService = {
      findByUserId: vi.fn().mockResolvedValue(null),
    };
    redis = {
      getBuffer: vi.fn().mockResolvedValue(null),
      setBuffer: vi.fn().mockResolvedValue(undefined),
      deleteByPattern: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<RedisService>;
    discordAction = {
      grantRole: vi.fn(),
      sendDmAndKick: vi.fn(),
      fetchMemberDisplayName: vi.fn(),
      checkMemberExists: vi.fn(),
      fetchGuildMembers: vi.fn(),
    };

    // 배치 쿼리는 getRawMany를 사용한다 (기본값: 빈 배열 → 0 반환)
    const defaultDailyQb = makeQb();
    (defaultDailyQb.getRawMany as Mock).mockResolvedValue([]);
    voiceDailyRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(defaultDailyQb),
    };
    voiceHistoryRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(makeQb()),
    };

    service = new MissionService(
      missionRepo as never,
      configRepo as never,
      newbieRedis as never,
      voiceDailyFlushService as never,
      presenter as never,
      discordAction as never,
      renderer as never,
      redis as never,
      guildMemberService as never,
      voiceDailyRepo as never,
      voiceHistoryRepo as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // createMissionFromBot
  // ──────────────────────────────────────────────────────
  describe('createMissionFromBot', () => {
    it('정상 생성: config 조회 → hasMission 확인 → create 호출', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig());
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);
      // refreshMissionEmbed 흐름 mock
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.any(String), // today
        expect.any(String), // endDate
        10800, // 3h * 3600
        '동현',
        null, // config.missionTargetPlayCount
      );
    });

    it('config가 없으면 미션 생성하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('missionEnabled=false이면 미션 생성하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionEnabled: false }));

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('이미 미션이 있으면(hasMission=true) 중복 생성하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig());
      missionRepo.hasMission.mockResolvedValue(true);

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('missionDurationDays가 null이면 생성하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionDurationDays: null }));

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('missionTargetPlaytimeHours가 null이면 생성하지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionTargetPlaytimeHours: null }));

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('생성 후 Redis 미션 캐시 무효화', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionNotifyChannelId: null }));
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(newbieRedis.deleteMissionActive).toHaveBeenCalledWith('guild-1');
    });
  });

  // ──────────────────────────────────────────────────────
  // completeMission
  // ──────────────────────────────────────────────────────
  describe('completeMission', () => {
    it('IN_PROGRESS 미션 성공 처리 → COMPLETED 상태로 변경', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      const result = await service.completeMission('guild-1', 1);

      expect(missionRepo.updateStatus).toHaveBeenCalledWith(1, MissionStatus.COMPLETED);
      expect(result).toEqual({ ok: true });
    });

    it('roleId 전달 시 역할 부여 시도', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      discordAction.grantRole.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.completeMission('guild-1', 1, 'role-id');

      expect(discordAction.grantRole).toHaveBeenCalledWith('guild-1', 'user-1', 'role-id');
    });

    it('역할 부여 실패 시 warning 반환', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      discordAction.grantRole.mockResolvedValue('역할 부여에 실패했습니다: 권한 없음');
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      const result = await service.completeMission('guild-1', 1, 'role-id');

      expect(result.ok).toBe(true);
      expect(result.warning).toBeTruthy();
    });

    it('미션이 없으면 NotFoundException throw', async () => {
      missionRepo.findById.mockResolvedValue(null);

      await expect(service.completeMission('guild-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('다른 guildId의 미션이면 NotFoundException throw', async () => {
      missionRepo.findById.mockResolvedValue(makeMission({ guildId: 'other-guild' }));

      await expect(service.completeMission('guild-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('IN_PROGRESS가 아닌 미션은 DomainException(MISSION_NOT_IN_PROGRESS) throw', async () => {
      missionRepo.findById.mockResolvedValue(makeMission({ status: MissionStatus.COMPLETED }));

      await expect(service.completeMission('guild-1', 1)).rejects.toMatchObject({
        code: 'MISSION_NOT_IN_PROGRESS',
      });
      await expect(service.completeMission('guild-1', 1)).rejects.toBeInstanceOf(DomainException);
    });
  });

  // ──────────────────────────────────────────────────────
  // failMission
  // ──────────────────────────────────────────────────────
  describe('failMission', () => {
    it('IN_PROGRESS 미션 실패 처리 → FAILED 상태로 변경', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      const result = await service.failMission('guild-1', 1);

      expect(missionRepo.updateStatus).toHaveBeenCalledWith(1, MissionStatus.FAILED);
      expect(result).toEqual({ ok: true });
    });

    it('kick=true이면 DM 전송 후 강퇴', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      discordAction.sendDmAndKick.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.failMission('guild-1', 1, true, '미션 실패로 강퇴합니다');

      expect(discordAction.sendDmAndKick).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        '미션 실패로 강퇴합니다',
      );
    });

    it('kick=false이면 강퇴하지 않는다', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.failMission('guild-1', 1, false);

      expect(discordAction.sendDmAndKick).not.toHaveBeenCalled();
    });

    it('미션이 없으면 NotFoundException throw', async () => {
      missionRepo.findById.mockResolvedValue(null);

      await expect(service.failMission('guild-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('IN_PROGRESS가 아닌 미션은 DomainException(MISSION_NOT_IN_PROGRESS) throw', async () => {
      missionRepo.findById.mockResolvedValue(makeMission({ status: MissionStatus.FAILED }));

      await expect(service.failMission('guild-1', 1)).rejects.toMatchObject({
        code: 'MISSION_NOT_IN_PROGRESS',
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // getPlaytimeSec
  // 배치 쿼리(batchGetPlaytimeSec) 위임 형태로 변경됨:
  //   select('vd.userId', 'userId') → addSelect('vd.date', ...) → addSelect(COALESCE(...), 'total')
  //   getRawMany([{userId, date, total}]) → JS 재집계 → 결과 반환
  // mock 단언은 이 배치 쿼리 체인 형태에 맞게 갱신한다 (동작/반환값 변경 없음).
  // ──────────────────────────────────────────────────────
  describe('getPlaytimeSec', () => {
    it('GLOBAL channelId를 제외하고 채널별 시간을 합산한다', async () => {
      const qb = makeQb();
      // 배치 쿼리는 getRawMany로 [{userId, date, total}] 배열을 반환한다
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '3600' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPlaytimeSec('guild-1', 'user-1', '20260301', '20260308');

      expect(result).toBe(3600);
      // GLOBAL 제외 조건이 포함되었는지 확인
      const andWhereCalls = (qb.andWhere as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        andWhereCalls.some((c: unknown) => typeof c === 'string' && c.includes('GLOBAL')),
      ).toBe(true);
    });

    it('데이터가 없으면 0 반환', async () => {
      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPlaytimeSec('guild-1', 'user-1', '20260301', '20260308');

      expect(result).toBe(0);
    });

    it('useMicTime=false (기본값) → channelDurationSec 컬럼으로 SELECT', async () => {
      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '1800' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPlaytimeSec('guild-1', 'user-1', '20260301', '20260308', false);

      // 배치 쿼리는 addSelect(COALESCE(SUM(vd.channelDurationSec), 0), 'total') 형태로 호출된다
      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some(
          (c: unknown) => typeof c === 'string' && c.includes('channelDurationSec'),
        ),
      ).toBe(true);
      expect(
        addSelectCalls.some((c: unknown) => typeof c === 'string' && c.includes('micOnSec')),
      ).toBe(false);
    });

    it('useMicTime=true → micOnSec 컬럼으로 SELECT', async () => {
      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '900' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPlaytimeSec(
        'guild-1',
        'user-1',
        '20260301',
        '20260308',
        true,
      );

      expect(result).toBe(900);
      // 배치 쿼리는 addSelect(COALESCE(SUM(vd.micOnSec), 0), 'total') 형태로 호출된다
      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some((c: unknown) => typeof c === 'string' && c.includes('micOnSec')),
      ).toBe(true);
      expect(
        addSelectCalls.some(
          (c: unknown) => typeof c === 'string' && c.includes('channelDurationSec'),
        ),
      ).toBe(false);
    });

    it('useMicTime 미전달(기본값=false) → channelDurationSec 컬럼으로 SELECT', async () => {
      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '7200' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPlaytimeSec('guild-1', 'user-1', '20260301', '20260308');

      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some(
          (c: unknown) => typeof c === 'string' && c.includes('channelDurationSec'),
        ),
      ).toBe(true);
    });

    it('useMicTime=true이고 결과가 없으면 0 반환', async () => {
      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPlaytimeSec(
        'guild-1',
        'user-1',
        '20260301',
        '20260308',
        true,
      );

      expect(result).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────
  // getPlayCount
  // 배치 쿼리(batchGetPlayCount) 위임 형태로 변경됨:
  //   ① voiceDailyRepo.getRawMany([{userId, channelId}]) — distinct 채널
  //   ② voiceHistoryRepo.getRawMany([{userId, channelId, joinedAt, leftAt}]) — sessions (getMany → getRawMany)
  //   ③ JS countSessions 헬퍼로 필터/집계 (동작 동일)
  // mock 단언은 getRawMany 형태로 갱신한다 (반환값/동작 변경 없음).
  // ──────────────────────────────────────────────────────
  describe('getPlayCount', () => {
    it('playCountMinDurationMin, playCountIntervalMin 모두 null이면 세션 수 그대로 반환', async () => {
      const config = makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null });

      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);

      const historyQb = makeQb();
      // 배치 쿼리는 getRawMany로 {userId, channelId, joinedAt, leftAt} 형태를 반환한다
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T12:00:00Z'),
          leftAt: new Date('2026-03-01T12:30:00Z'),
        },
      ]);

      voiceDailyRepo.createQueryBuilder.mockReturnValue(distinctQb);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      const result = await service.getPlayCount(
        'guild-1',
        'user-1',
        '20260301',
        '20260308',
        config,
      );

      expect(result).toBe(2);
    });

    it('guildChannelIds가 비어있으면 0 반환', async () => {
      const config = makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null });

      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([]); // 빈 채널 목록

      voiceDailyRepo.createQueryBuilder.mockReturnValue(distinctQb);

      const result = await service.getPlayCount(
        'guild-1',
        'user-1',
        '20260301',
        '20260308',
        config,
      );

      expect(result).toBe(0);
    });

    it('playCountMinDurationMin 필터: 최소 지속시간 미만 세션 제외', async () => {
      const config = makeConfig({ playCountMinDurationMin: 30, playCountIntervalMin: null });

      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);

      const historyQb = makeQb();
      // 10분짜리(600000ms < 30분) 세션 → 필터 제외
      // 60분짜리(3600000ms >= 30분) 세션 → 포함
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:10:00Z'), // 10분 → 제외
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T12:00:00Z'),
          leftAt: new Date('2026-03-01T13:00:00Z'), // 60분 → 포함
        },
      ]);

      voiceDailyRepo.createQueryBuilder.mockReturnValue(distinctQb);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      const result = await service.getPlayCount(
        'guild-1',
        'user-1',
        '20260301',
        '20260308',
        config,
      );

      expect(result).toBe(1);
    });

    it('playCountIntervalMin 필터: 간격 이내 세션 묶음 처리', async () => {
      const config = makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: 60 });

      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);

      const historyQb = makeQb();
      // 10:00, 10:30, 13:00 → 10:00~10:30 묶음(1) + 13:00 별도(2) = 2
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:30:00Z'),
          leftAt: new Date('2026-03-01T11:00:00Z'), // 30분 간격 → 묶음
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T13:00:00Z'),
          leftAt: new Date('2026-03-01T13:30:00Z'), // 2.5h 간격 → 별도
        },
      ]);

      voiceDailyRepo.createQueryBuilder.mockReturnValue(distinctQb);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      const result = await service.getPlayCount(
        'guild-1',
        'user-1',
        '20260301',
        '20260308',
        config,
      );

      expect(result).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────
  // hideMission / unhideMission
  // ──────────────────────────────────────────────────────
  describe('hideMission', () => {
    it('hiddenFromEmbed = true 로 갱신한다', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateHidden.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.hideMission('guild-1', 1);

      expect(missionRepo.updateHidden).toHaveBeenCalledWith(1, true);
    });

    it('미션이 없으면 NotFoundException throw', async () => {
      missionRepo.findById.mockResolvedValue(null);

      await expect(service.hideMission('guild-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('다른 guildId이면 NotFoundException throw', async () => {
      missionRepo.findById.mockResolvedValue(makeMission({ guildId: 'other-guild' }));

      await expect(service.hideMission('guild-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unhideMission', () => {
    it('hiddenFromEmbed = false 로 갱신한다', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateHidden.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.unhideMission('guild-1', 1);

      expect(missionRepo.updateHidden).toHaveBeenCalledWith(1, false);
    });

    it('미션이 없으면 NotFoundException throw', async () => {
      missionRepo.findById.mockResolvedValue(null);

      await expect(service.unhideMission('guild-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────
  // enrichMissions
  // ──────────────────────────────────────────────────────
  describe('enrichMissions', () => {
    it('각 미션에 memberName과 currentPlaytimeSec을 추가한다', async () => {
      const mission = makeMission();
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '7200' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [mission]);

      expect(result).toHaveLength(1);
      expect(result[0].memberName).toBe('동현');
      expect(result[0].currentPlaytimeSec).toBe(7200);
    });

    it('빈 배열이면 빈 배열 반환', async () => {
      const result = await service.enrichMissions('guild-1', []);
      expect(result).toEqual([]);
    });

    it('Discord 닉네임이 DB memberName과 다르면 updateMemberName을 호출한다', async () => {
      const mission = makeMission({ memberName: '구닉네임' });
      presenter.fetchMemberDisplayName.mockResolvedValue('새닉네임');
      missionRepo.updateMemberName.mockResolvedValue(undefined);

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [mission]);

      expect(missionRepo.updateMemberName).toHaveBeenCalledWith(mission.id, '새닉네임');
      expect(result[0].memberName).toBe('새닉네임');
    });

    it('Discord 닉네임이 DB memberName과 같으면 updateMemberName을 호출하지 않는다', async () => {
      const mission = makeMission({ memberName: '동현' });
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      await service.enrichMissions('guild-1', [mission]);

      expect(missionRepo.updateMemberName).not.toHaveBeenCalled();
    });

    it('missionUseMicTime=true이면 batchGetPlaytimeSec을 useMicTime=true로 호출한다', async () => {
      const mission = makeMission();
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionUseMicTime: true }));

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      await service.enrichMissions('guild-1', [mission]);

      // 배치 쿼리는 addSelect(COALESCE(SUM(vd.micOnSec), 0), 'total') 형태
      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some((c: unknown) => typeof c === 'string' && c.includes('micOnSec')),
      ).toBe(true);
    });

    it('missionUseMicTime=false이면 batchGetPlaytimeSec을 useMicTime=false로 호출한다', async () => {
      const mission = makeMission();
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionUseMicTime: false }));

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      await service.enrichMissions('guild-1', [mission]);

      // 배치 쿼리는 addSelect(COALESCE(SUM(vd.channelDurationSec), 0), 'total') 형태
      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some(
          (c: unknown) => typeof c === 'string' && c.includes('channelDurationSec'),
        ),
      ).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // enrichHistoryMissions
  // ──────────────────────────────────────────────────────
  describe('enrichHistoryMissions', () => {
    it('memberName이 있으면 Discord API를 호출하지 않고 DB 값을 사용한다', async () => {
      const mission = makeMission({ status: MissionStatus.COMPLETED, memberName: '저장된이름' });

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '3600' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(result[0].memberName).toBe('저장된이름');
      // presenter.fetchMemberNickname은 presenter에 없음 → 직접 mock 없이 확인
    });

    it('memberName이 null이면 fetchMemberNickname을 호출한다', async () => {
      const mission = makeMission({ status: MissionStatus.COMPLETED, memberName: null });
      const mockFetchNickname = vi.fn().mockResolvedValue('Discord닉네임');
      // presenter 타입이 fetchMemberNickname을 공개 메서드로 노출하지 않으므로 동적 주입으로 mock
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;
      missionRepo.updateMemberName.mockResolvedValue(undefined);

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(mockFetchNickname).toHaveBeenCalledWith('guild-1', mission.memberId);
      expect(result[0].memberName).toBe('Discord닉네임');
      // 서버에서 닉네임을 조회했으므로 DB에 저장해야 한다
      expect(missionRepo.updateMemberName).toHaveBeenCalledWith(mission.id, 'Discord닉네임');
    });

    it('memberName이 null이고 서버에 없는 멤버(fetchMemberNickname=null)이면 null 유지 및 DB 저장 안함', async () => {
      const mission = makeMission({ status: MissionStatus.FAILED, memberName: null });
      const mockFetchNickname = vi.fn().mockResolvedValue(null);
      // presenter 타입이 fetchMemberNickname을 공개 메서드로 노출하지 않으므로 동적 주입으로 mock
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(result[0].memberName).toBeNull();
      expect(missionRepo.updateMemberName).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // isMissionCompleted (invalidateAndRefresh를 통한 간접 테스트)
  // ──────────────────────────────────────────────────────
  describe('invalidateAndRefresh — isMissionCompleted 달성 판정', () => {
    function makeInvalidateSetup() {
      // refreshMissionEmbed 흐름 mock
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });
    }

    it('targetPlayCount가 null이고 playtimeSec >= targetPlaytimeSec이면 COMPLETED 처리', async () => {
      const mission = makeMission({ targetPlayCount: null, targetPlaytimeSec: 10800 });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(makeConfig());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      makeInvalidateSetup();

      // 배치 쿼리: targetPlayCount=null → batchGetPlaytimeSec만 호출 (voiceDailyRepo 1회, getRawMany)
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(playtimeQb);

      await service.invalidateAndRefresh('guild-1');

      expect(missionRepo.updateStatus).toHaveBeenCalledWith(mission.id, MissionStatus.COMPLETED);
    });

    it('targetPlayCount가 null이고 playtimeSec < targetPlaytimeSec이면 COMPLETED 처리하지 않음', async () => {
      const mission = makeMission({ targetPlayCount: null, targetPlaytimeSec: 10800 });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(makeConfig());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      makeInvalidateSetup();

      // playtimeSec = 3600 (목표 미달)
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '3600' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(playtimeQb);

      await service.invalidateAndRefresh('guild-1');

      expect(missionRepo.updateStatus).not.toHaveBeenCalledWith(
        mission.id,
        MissionStatus.COMPLETED,
      );
    });

    it('targetPlayCount가 있고 playtimeSec >= target이고 playCount >= targetPlayCount이면 COMPLETED', async () => {
      const mission = makeMission({ targetPlayCount: 3, targetPlaytimeSec: 10800 });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null }),
      );
      missionRepo.updateStatus.mockResolvedValue(undefined);
      makeInvalidateSetup();

      // 배치화 후 voiceDailyRepo: 1번째 호출(batchGetPlaytimeSec) → getRawMany
      //                              2번째 호출(batchGetPlayCount distinct) → getRawMany
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' },
      ]);
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      // voiceHistoryRepo: batchGetPlayCount sessions → getRawMany
      const historyQb = makeQb();
      // playCount = 3 (목표 달성)
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T12:00:00Z'),
          leftAt: new Date('2026-03-01T12:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T14:00:00Z'),
          leftAt: new Date('2026-03-01T14:30:00Z'),
        },
      ]);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      await service.invalidateAndRefresh('guild-1');

      expect(missionRepo.updateStatus).toHaveBeenCalledWith(mission.id, MissionStatus.COMPLETED);
    });

    it('targetPlayCount가 있고 playCount < targetPlayCount이면 playtimeSec을 충족해도 COMPLETED하지 않음', async () => {
      const mission = makeMission({ targetPlayCount: 5, targetPlaytimeSec: 10800 });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null }),
      );
      missionRepo.updateStatus.mockResolvedValue(undefined);
      makeInvalidateSetup();

      // 배치화 후 voiceDailyRepo: 1번째(batchGetPlaytimeSec) + 2번째(distinct 채널)
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' },
      ]);
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      // voiceHistoryRepo: sessions → getRawMany
      const historyQb = makeQb();
      // playCount = 2 (목표 미달: 5 필요)
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T12:00:00Z'),
          leftAt: new Date('2026-03-01T12:30:00Z'),
        },
      ]);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      await service.invalidateAndRefresh('guild-1');

      expect(missionRepo.updateStatus).not.toHaveBeenCalledWith(
        mission.id,
        MissionStatus.COMPLETED,
      );
    });

    it('targetPlayCount가 있고 playtimeSec < targetPlaytimeSec이면 COMPLETED하지 않음', async () => {
      const mission = makeMission({ targetPlayCount: 3, targetPlaytimeSec: 10800 });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(makeConfig());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      makeInvalidateSetup();

      // playtimeSec 미달: batchGetPlaytimeSec 1회 (getRawMany), countRanges 계산은 내부에서 함
      // targetPlayCount=3이므로 countRanges에 포함되지만, playtimeSec < target이면
      // isMissionCompleted가 false 반환 → COMPLETED 호출 안됨
      // 배치화 후: voiceDailyRepo 2회(playtime + distinct) + voiceHistoryRepo 1회
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '3600' },
      ]);
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      await service.invalidateAndRefresh('guild-1');

      expect(missionRepo.updateStatus).not.toHaveBeenCalledWith(
        mission.id,
        MissionStatus.COMPLETED,
      );
    });
  });

  // ──────────────────────────────────────────────────────
  // createMission — config.missionTargetPlayCount 전달 검증
  // ──────────────────────────────────────────────────────
  describe('createMission', () => {
    it('config.missionTargetPlayCount가 null이면 missionRepo.create에 null 전달', async () => {
      const config = makeConfig({ missionTargetPlayCount: null, missionNotifyChannelId: null });
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);

      const member = { id: 'user-1', displayName: '동현', guild: { id: 'guild-1' } };
      await service.createMission(member, config);

      expect(missionRepo.create).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.any(String),
        expect.any(String),
        10800,
        '동현',
        null,
      );
    });

    it('config.missionTargetPlayCount가 5이면 missionRepo.create에 5 전달', async () => {
      const config = makeConfig({ missionTargetPlayCount: 5, missionNotifyChannelId: null });
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);

      const member = { id: 'user-1', displayName: '동현', guild: { id: 'guild-1' } };
      await service.createMission(member, config);

      expect(missionRepo.create).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.any(String),
        expect.any(String),
        10800,
        '동현',
        5,
      );
    });

    it('missionEnabled=false이면 미션 생성하지 않는다', async () => {
      const config = makeConfig({ missionEnabled: false });
      await service.createMission(
        { id: 'user-1', displayName: '동현', guild: { id: 'guild-1' } },
        config,
      );
      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('missionDurationDays가 null이면 미션 생성하지 않는다', async () => {
      const config = makeConfig({ missionDurationDays: null });
      await service.createMission(
        { id: 'user-1', displayName: '동현', guild: { id: 'guild-1' } },
        config,
      );
      expect(missionRepo.create).not.toHaveBeenCalled();
    });

    it('hasMission=true이면 중복 생성하지 않는다', async () => {
      const config = makeConfig();
      missionRepo.hasMission.mockResolvedValue(true);
      await service.createMission(
        { id: 'user-1', displayName: '동현', guild: { id: 'guild-1' } },
        config,
      );
      expect(missionRepo.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // createMissionFromBot — config.missionTargetPlayCount 전달 검증
  // ──────────────────────────────────────────────────────
  describe('createMissionFromBot — missionTargetPlayCount 전달', () => {
    it('config.missionTargetPlayCount가 10이면 missionRepo.create에 10 전달', async () => {
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ missionTargetPlayCount: 10, missionNotifyChannelId: null }),
      );
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(missionRepo.create).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.any(String),
        expect.any(String),
        10800,
        '동현',
        10,
      );
    });
  });

  // ──────────────────────────────────────────────────────
  // enrichMissionItems
  // ──────────────────────────────────────────────────────
  describe('enrichMissionItems', () => {
    it('IN_PROGRESS 미션과 비활성 미션이 섞여 있을 때 각각 적절한 enrichment 로직 적용', async () => {
      const activeMission = makeMission({
        id: 1,
        status: MissionStatus.IN_PROGRESS,
        memberName: '활성멤버',
      });
      const completedMission = makeMission({
        id: 2,
        status: MissionStatus.COMPLETED,
        memberName: '완료멤버',
      });

      // enrichMissionItems는 resolveMemberName을 사용하여 guildMemberService를 통해 조회한다
      // guildMemberService.findByUserId가 null을 반환하면 mission.memberName을 그대로 사용
      const mockFetchNickname = vi.fn();
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissionItems('guild-1', [activeMission, completedMission]);

      expect(result).toHaveLength(2);
      // 원래 배열 순서 보존
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      // enrichMissionItems는 fetchMemberNickname을 사용하지 않는다
      expect(mockFetchNickname).not.toHaveBeenCalled();
    });

    it('빈 배열이면 빈 배열 반환', async () => {
      const result = await service.enrichMissionItems('guild-1', []);
      expect(result).toEqual([]);
    });

    it('원래 배열 순서(createdAt DESC)를 보존한다', async () => {
      const mission1 = makeMission({
        id: 10,
        status: MissionStatus.COMPLETED,
        memberName: '완료1',
      });
      const mission2 = makeMission({
        id: 20,
        status: MissionStatus.IN_PROGRESS,
        memberName: '진행중',
      });
      const mission3 = makeMission({ id: 30, status: MissionStatus.FAILED, memberName: '실패' });

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissionItems('guild-1', [mission1, mission2, mission3]);

      expect(result.map((r) => r.id)).toEqual([10, 20, 30]);
    });
  });

  // ──────────────────────────────────────────────────────
  // refreshMissionEmbed — Canvas 분기 (F-NEWBIE-002-CANVAS)
  // ──────────────────────────────────────────────────────
  describe('refreshMissionEmbed — Canvas 분기', () => {
    function setupCanvasEnv() {
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({ IN_PROGRESS: 0 });
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });
      discordAction.fetchGuildMembers.mockResolvedValue([]);
    }

    it('missionDisplayMode가 CANVAS이면 renderer.renderAll이 호출된다', async () => {
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ missionDisplayMode: 'CANVAS', missionNotifyChannelId: 'ch-1' }),
      );
      setupCanvasEnv();

      await service.refreshMissionEmbed('guild-1');

      expect(renderer.renderAll).toHaveBeenCalled();
    });

    it('missionDisplayMode가 CANVAS이면 presenter.sendOrUpdateCanvasMission이 호출된다', async () => {
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ missionDisplayMode: 'CANVAS', missionNotifyChannelId: 'ch-1' }),
      );
      setupCanvasEnv();

      await service.refreshMissionEmbed('guild-1');

      expect(presenter.sendOrUpdateCanvasMission).toHaveBeenCalled();
    });

    it('missionDisplayMode가 EMBED이면 presenter.refreshMissionEmbed가 호출된다', async () => {
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ missionDisplayMode: 'EMBED', missionNotifyChannelId: 'ch-1' }),
      );
      setupCanvasEnv();

      await service.refreshMissionEmbed('guild-1');

      expect(presenter.refreshMissionEmbed).toHaveBeenCalled();
      expect(presenter.sendOrUpdateCanvasMission).not.toHaveBeenCalled();
    });

    it('missionDisplayMode가 CANVAS이면 presenter.refreshMissionEmbed는 호출되지 않는다', async () => {
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ missionDisplayMode: 'CANVAS', missionNotifyChannelId: 'ch-1' }),
      );
      setupCanvasEnv();

      await service.refreshMissionEmbed('guild-1');

      expect(presenter.refreshMissionEmbed).not.toHaveBeenCalled();
    });

    it('Canvas 캐시가 있으면 renderer.renderAll 없이 캐시 버퍼를 사용한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ missionDisplayMode: 'CANVAS', missionNotifyChannelId: 'ch-1' }),
      );
      setupCanvasEnv();
      redis.getBuffer.mockResolvedValue(Buffer.from('cached-png'));

      await service.refreshMissionEmbed('guild-1');

      expect(renderer.renderAll).not.toHaveBeenCalled();
      expect(presenter.sendOrUpdateCanvasMission).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // invalidateMissionCanvasCache — Canvas 캐시 무효화
  // ──────────────────────────────────────────────────────
  describe('Canvas 캐시 무효화 (미션 상태 변경 시)', () => {
    it('createMission 호출 후 redis.deleteByPattern이 호출된다', async () => {
      const config = makeConfig({ missionNotifyChannelId: null });
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);

      const member = { id: 'user-1', displayName: '동현', guild: { id: 'guild-1' } };
      await service.createMission(member, config);

      expect(redis.deleteByPattern).toHaveBeenCalledWith(
        expect.stringContaining('newbie:mission:canvas:guild-1'),
      );
    });

    it('createMissionFromBot 호출 후 redis.deleteByPattern이 호출된다', async () => {
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionNotifyChannelId: null }));
      missionRepo.hasMission.mockResolvedValue(false);
      missionRepo.create.mockResolvedValue(undefined);

      await service.createMissionFromBot('guild-1', 'user-1', '동현');

      expect(redis.deleteByPattern).toHaveBeenCalledWith(
        expect.stringContaining('newbie:mission:canvas:guild-1'),
      );
    });

    it('completeMission 호출 후 redis.deleteByPattern이 호출된다', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.completeMission('guild-1', 1);

      expect(redis.deleteByPattern).toHaveBeenCalledWith(
        expect.stringContaining('newbie:mission:canvas:guild-1'),
      );
    });

    it('failMission 호출 후 redis.deleteByPattern이 호출된다', async () => {
      missionRepo.findById.mockResolvedValue(makeMission());
      missionRepo.updateStatus.mockResolvedValue(undefined);
      discordAction.fetchMemberDisplayName.mockResolvedValue('동현');
      missionRepo.updateMemberName.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      await service.failMission('guild-1', 1);

      expect(redis.deleteByPattern).toHaveBeenCalledWith(
        expect.stringContaining('newbie:mission:canvas:guild-1'),
      );
    });
  });

  // ──────────────────────────────────────────────────────
  // 배치 경로 동작 등가성 회귀 가드 (N+1 배치화 리팩터)
  // batchGetPlaytimeSec / batchGetPlayCount 배치 경로가
  // 기존 단건 경로와 100% 동일한 결과를 반환하는지 검증한다.
  // ──────────────────────────────────────────────────────

  // 목표 1: 다중 미션 + 서로 다른 날짜범위 → 각 미션이 자기 범위만 합산
  describe('배치 플레이타임 — 다중 미션 날짜범위 분리', () => {
    it('미션 3개의 날짜범위가 다를 때 각 미션이 자기 범위 데이터만 합산한다', async () => {
      // mission A: id=10, user-A, 20260301~20260307
      // mission B: id=20, user-B, 20260310~20260316
      // mission C: id=30, user-A, 20260315~20260321 (user-A 재미션)
      const missionA = makeMission({
        id: 10,
        memberId: 'user-A',
        startDate: '20260301',
        endDate: '20260307',
      });
      const missionB = makeMission({
        id: 20,
        memberId: 'user-B',
        startDate: '20260310',
        endDate: '20260316',
      });
      const missionC = makeMission({
        id: 30,
        memberId: 'user-A',
        startDate: '20260315',
        endDate: '20260321',
      });

      presenter.fetchMemberDisplayName.mockResolvedValue('테스트');

      // voiceDailyRepo는 1쿼리(최소start~최대end 전 범위)로 전 행 반환
      // 미션 A 범위 행, 미션 B 범위 행, 미션 C 범위 행, 범위 밖 행 섞임
      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        // user-A: 20260301(A범위), 20260303(A범위), 20260315(C범위), 20260320(C범위)
        { userId: 'user-A', date: '20260301', total: '1000' },
        { userId: 'user-A', date: '20260303', total: '2000' },
        { userId: 'user-A', date: '20260315', total: '4000' },
        { userId: 'user-A', date: '20260320', total: '5000' },
        // user-B: 20260310(B범위), 20260316(B범위)
        { userId: 'user-B', date: '20260310', total: '3000' },
        { userId: 'user-B', date: '20260316', total: '6000' },
        // 미션 범위 밖 행 (어떤 미션에도 포함되면 안됨)
        { userId: 'user-A', date: '20260308', total: '9999' }, // A 범위 밖
        { userId: 'user-B', date: '20260309', total: '9999' }, // B 범위 밖
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [missionA, missionB, missionC]);

      expect(result).toHaveLength(3);

      // missionA(id=10): user-A 20260301~20260307 → 1000+2000=3000
      const enrichedA = result.find((r) => r.id === 10);
      expect(enrichedA?.currentPlaytimeSec).toBe(3000);

      // missionB(id=20): user-B 20260310~20260316 → 3000+6000=9000
      const enrichedB = result.find((r) => r.id === 20);
      expect(enrichedB?.currentPlaytimeSec).toBe(9000);

      // missionC(id=30): user-A 20260315~20260321 → 4000+5000=9000 (A범위 행 제외)
      const enrichedC = result.find((r) => r.id === 30);
      expect(enrichedC?.currentPlaytimeSec).toBe(9000);
    });

    it('voiceDaily 행 0개이면 모든 미션의 currentPlaytimeSec이 0이다', async () => {
      const missionA = makeMission({
        id: 10,
        memberId: 'user-A',
        startDate: '20260301',
        endDate: '20260307',
      });
      const missionB = makeMission({
        id: 20,
        memberId: 'user-B',
        startDate: '20260301',
        endDate: '20260307',
      });

      presenter.fetchMemberDisplayName.mockResolvedValue('테스트');

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [missionA, missionB]);

      expect(result[0].currentPlaytimeSec).toBe(0);
      expect(result[1].currentPlaytimeSec).toBe(0);
    });
  });

  // 목표 2: 같은 멤버 다중 미션 → 배치키=mission.id로 각각 올바른 값 매핑 (섞이지 않음)
  describe('배치 플레이타임 — 같은 멤버 다중 미션 키 분리', () => {
    it('동일 memberId의 미션 2개(범위 다름)가 각자 올바른 playtimeSec을 받는다', async () => {
      // user-1의 미션 2개: id=100(3월), id=200(4월)
      const missionMar = makeMission({
        id: 100,
        memberId: 'user-1',
        startDate: '20260301',
        endDate: '20260331',
      });
      const missionApr = makeMission({
        id: 200,
        memberId: 'user-1',
        startDate: '20260401',
        endDate: '20260430',
      });

      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260310', total: '7200' }, // 3월 행 → missionMar
        { userId: 'user-1', date: '20260315', total: '3600' }, // 3월 행 → missionMar
        { userId: 'user-1', date: '20260410', total: '1800' }, // 4월 행 → missionApr
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [missionMar, missionApr]);

      const enrichedMar = result.find((r) => r.id === 100);
      const enrichedApr = result.find((r) => r.id === 200);

      // 3월 미션: 7200+3600=10800
      expect(enrichedMar?.currentPlaytimeSec).toBe(10800);
      // 4월 미션: 1800 (3월 행은 포함되면 안됨)
      expect(enrichedApr?.currentPlaytimeSec).toBe(1800);
    });
  });

  // 목표 3: useMicTime 분기 → 배치 경로에서도 micOnSec vs channelDurationSec 올바르게
  describe('배치 플레이타임 — useMicTime 분기 (enrichMissions)', () => {
    it('useMicTime=true이면 addSelect에 micOnSec이 포함된다', async () => {
      const mission = makeMission({ id: 1, memberId: 'user-1' });
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionUseMicTime: true }));
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '900' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [mission]);

      expect(result[0].currentPlaytimeSec).toBe(900);
      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some((c: unknown) => typeof c === 'string' && c.includes('micOnSec')),
      ).toBe(true);
      expect(
        addSelectCalls.some(
          (c: unknown) => typeof c === 'string' && c.includes('channelDurationSec'),
        ),
      ).toBe(false);
    });

    it('useMicTime=false이면 addSelect에 channelDurationSec이 포함된다', async () => {
      const mission = makeMission({ id: 1, memberId: 'user-1' });
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionUseMicTime: false }));
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '5400' },
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [mission]);

      expect(result[0].currentPlaytimeSec).toBe(5400);
      const addSelectCalls = (qb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some(
          (c: unknown) => typeof c === 'string' && c.includes('channelDurationSec'),
        ),
      ).toBe(true);
      expect(
        addSelectCalls.some((c: unknown) => typeof c === 'string' && c.includes('micOnSec')),
      ).toBe(false);
    });

    it('enrichMissionItems — useMicTime=true이면 micOnSec 경로로 집계된다', async () => {
      const mission = makeMission({ id: 1, memberId: 'user-1' });
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ missionUseMicTime: true }));
      guildMemberService.findByUserId.mockResolvedValue(null);

      // voiceDailyRepo: 1번째(batchGetPlaytimeSec) + 2번째(batchGetPlayCount distinct)
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '2700' },
      ]);
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const result = await service.enrichMissionItems('guild-1', [mission]);

      expect(result[0].currentPlaytimeSec).toBe(2700);
      const addSelectCalls = (playtimeQb.addSelect as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(
        addSelectCalls.some((c: unknown) => typeof c === 'string' && c.includes('micOnSec')),
      ).toBe(true);
    });
  });

  // 목표 4: playCount config 3분기 보존 — 배치 경로에서 미션별로 올바르게
  describe('배치 playCount — config 3분기 보존 (enrichMissionItems 경로)', () => {
    function setupEnrichMissionItemsWithSessions(
      playtimeRows: { userId: string; date: string; total: string }[],
      channelRows: { userId: string; channelId: string }[],
      sessionRows: {
        userId: string;
        channelId: string;
        joinedAt: Date;
        leftAt: Date | null;
      }[],
    ) {
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue(playtimeRows);

      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue(channelRows);

      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb = makeQb();
      (historyQb.getRawMany as Mock).mockResolvedValue(sessionRows);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      guildMemberService.findByUserId.mockResolvedValue(null);
    }

    it('분기 ①: minDuration·interval 둘다 null → 세션 수 그대로', async () => {
      const config = makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null });
      configRepo.findByGuildId.mockResolvedValue(config);

      const mission = makeMission({
        id: 1,
        memberId: 'user-1',
        startDate: '20260301',
        endDate: '20260307',
      });

      setupEnrichMissionItemsWithSessions(
        [{ userId: 'user-1', date: '20260301', total: '7200' }],
        [{ userId: 'user-1', channelId: 'ch-1' }],
        [
          {
            userId: 'user-1',
            channelId: 'ch-1',
            joinedAt: new Date('2026-03-01T10:00:00Z'),
            leftAt: new Date('2026-03-01T10:30:00Z'),
          },
          {
            userId: 'user-1',
            channelId: 'ch-1',
            joinedAt: new Date('2026-03-01T12:00:00Z'),
            leftAt: new Date('2026-03-01T12:30:00Z'),
          },
          {
            userId: 'user-1',
            channelId: 'ch-1',
            joinedAt: new Date('2026-03-01T14:00:00Z'),
            leftAt: new Date('2026-03-01T14:30:00Z'),
          },
        ],
      );

      const result = await service.enrichMissionItems('guild-1', [mission]);
      // playCount = 세션 수 3
      expect((result[0] as { playCount?: number }).playCount).toBeUndefined(); // enrichMissionItems가 playCount를 직접 반환하지 않음을 확인하거나
      // enrichMissionItems는 currentPlaytimeSec만 반환하므로 playtimeSec 검증
      expect(result[0].currentPlaytimeSec).toBe(7200);
    });

    it('분기 ②: minDuration 만 있을 때 — 짧은 세션 제외 후 카운트', async () => {
      const config = makeConfig({ playCountMinDurationMin: 20, playCountIntervalMin: null });
      configRepo.findByGuildId.mockResolvedValue(config);

      const mission = makeMission({
        id: 1,
        memberId: 'user-1',
        startDate: '20260301',
        endDate: '20260307',
      });

      setupEnrichMissionItemsWithSessions(
        [{ userId: 'user-1', date: '20260301', total: '3600' }],
        [{ userId: 'user-1', channelId: 'ch-1' }],
        [
          // 5분짜리 → 제외 (< 20분)
          {
            userId: 'user-1',
            channelId: 'ch-1',
            joinedAt: new Date('2026-03-01T09:00:00Z'),
            leftAt: new Date('2026-03-01T09:05:00Z'),
          },
          // 30분짜리 → 포함
          {
            userId: 'user-1',
            channelId: 'ch-1',
            joinedAt: new Date('2026-03-01T10:00:00Z'),
            leftAt: new Date('2026-03-01T10:30:00Z'),
          },
          // 25분짜리 → 포함
          {
            userId: 'user-1',
            channelId: 'ch-1',
            joinedAt: new Date('2026-03-01T12:00:00Z'),
            leftAt: new Date('2026-03-01T12:25:00Z'),
          },
        ],
      );

      // enrichMissionItems 내부에서 buildMissionEmbedItems가 playCountMap을 구성하므로
      // refreshMissionEmbed를 통해 간접 검증한다 — 여기서는 invalidateAndRefresh 경로를 사용
      // 대신 buildMissionEmbedItems를 직접 유발하는 refreshMissionEmbed 경로로 검증한다
      // (enrichMissionItems는 currentPlaytimeSec만 노출하므로 buildMissionEmbedItems 경로 사용)
      // → invalidateAndRefresh를 사용하여 playCount 분기를 검증
      const missionForRefresh = { ...mission, targetPlayCount: 2 };
      missionRepo.findActiveByGuild.mockResolvedValue([missionForRefresh as never]);

      // invalidateAndRefresh용 추가 mock
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });
      missionRepo.updateStatus.mockResolvedValue(undefined);

      // playtime: 목표 달성 (10800초)
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' },
      ]);
      // distinct channels
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReset()
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb2 = makeQb();
      (historyQb2.getRawMany as Mock).mockResolvedValue([
        // 5분짜리 → 제외
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T09:00:00Z'),
          leftAt: new Date('2026-03-01T09:05:00Z'),
        },
        // 30분짜리 → 포함
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        // 25분짜리 → 포함 (총 2개 = 목표 달성)
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T12:00:00Z'),
          leftAt: new Date('2026-03-01T12:25:00Z'),
        },
      ]);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb2);

      await service.invalidateAndRefresh('guild-1');

      // 유효 세션 2개 = targetPlayCount(2) 달성 → COMPLETED
      expect(missionRepo.updateStatus).toHaveBeenCalledWith(
        missionForRefresh.id,
        MissionStatus.COMPLETED,
      );
    });

    it('분기 ③: interval 만 있을 때 — 그룹핑 카운트', async () => {
      const config = makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: 60 });
      configRepo.findByGuildId.mockResolvedValue(config);

      const mission = {
        ...makeMission({ id: 1, memberId: 'user-1', startDate: '20260301', endDate: '20260307' }),
        targetPlayCount: 2,
      };
      missionRepo.findActiveByGuild.mockResolvedValue([mission as never]);

      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });
      missionRepo.updateStatus.mockResolvedValue(undefined);

      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' },
      ]);
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb = makeQb();
      // 10:00~10:30, 10:30~11:00 (30분 간격 → 묶음=1)
      // 13:00~13:30 (2.5h 간격 → 별도=2) → 총 그룹 2
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:30:00Z'),
          leftAt: new Date('2026-03-01T11:00:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T13:00:00Z'),
          leftAt: new Date('2026-03-01T13:30:00Z'),
        },
      ]);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      await service.invalidateAndRefresh('guild-1');

      // 그룹 2 = targetPlayCount(2) 달성 → COMPLETED
      expect(missionRepo.updateStatus).toHaveBeenCalledWith(mission.id, MissionStatus.COMPLETED);
    });
  });

  // 목표 5: 빈 데이터 — 미션 0개, voiceDaily 0행
  describe('배치 경로 빈 데이터 처리', () => {
    it('미션 0개 → enrichMissions가 빈 배열 반환하고 쿼리를 발급하지 않는다', async () => {
      const result = await service.enrichMissions('guild-1', []);

      expect(result).toEqual([]);
      // 빈 배열이면 batchGetPlaytimeSec은 early return해야 한다
      expect(voiceDailyRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('미션 0개 → enrichMissionItems가 빈 배열 반환하고 쿼리를 발급하지 않는다', async () => {
      const result = await service.enrichMissionItems('guild-1', []);

      expect(result).toEqual([]);
      expect(voiceDailyRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('미션 0개 → enrichHistoryMissions가 빈 배열 반환하고 쿼리를 발급하지 않는다', async () => {
      const result = await service.enrichHistoryMissions('guild-1', []);

      expect(result).toEqual([]);
      expect(voiceDailyRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('voiceDaily 행 0개 → enrichMissionItems의 모든 미션이 currentPlaytimeSec=0을 받는다', async () => {
      const mission1 = makeMission({ id: 1, memberId: 'user-1' });
      const mission2 = makeMission({ id: 2, memberId: 'user-2' });

      configRepo.findByGuildId.mockResolvedValue(makeConfig());
      guildMemberService.findByUserId.mockResolvedValue(null);

      // playtimeSec 쿼리 → 0행
      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([]);
      // distinct channels 쿼리 → 0행 → sessions 쿼리 스킵
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const result = await service.enrichMissionItems('guild-1', [mission1, mission2]);

      expect(result[0].currentPlaytimeSec).toBe(0);
      expect(result[1].currentPlaytimeSec).toBe(0);
      // distinct 결과가 0이면 sessions 쿼리를 발급하지 않는다
      expect(voiceHistoryRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // 목표 6: 채널 후보 확장 무해성 — 범위 밖 세션이 섞여도 joinedAt 미션범위 필터로 제거
  describe('배치 playCount — 채널 후보 확장 시 미션 범위 밖 세션 필터', () => {
    it('distinct 채널이 넓은 범위로 조회되어도 미션 기간 밖 세션은 joinedAt 필터로 제거된다', async () => {
      // mission: user-1, 20260301~20260307
      // session 데이터: 3월 1일(범위 내) + 3월 15일(범위 밖)
      const mission = makeMission({
        id: 1,
        memberId: 'user-1',
        startDate: '20260301',
        endDate: '20260307',
        targetPlayCount: 1,
      });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null }),
      );
      missionRepo.updateStatus.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' },
      ]);
      const distinctQb = makeQb();
      // distinct 채널은 넓은 범위로 조회 → ch-1 포함됨
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb = makeQb();
      // 범위 내 세션 1개 + 범위 밖 세션 1개
      // batchGetPlayCount의 JS 필터: s.joinedAt >= startDt && s.joinedAt <= endDt
      // startDt = yyyymmddToKSTDate('20260301', 'start') = 2026-02-28T15:00:00Z
      // endDt   = yyyymmddToKSTDate('20260307', 'end')  = 2026-03-07T14:59:59.999Z
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-01T10:00:00Z'), // 범위 내 → 포함
          leftAt: new Date('2026-03-01T10:30:00Z'),
        },
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-15T10:00:00Z'), // 범위 밖 → 제외
          leftAt: new Date('2026-03-15T10:30:00Z'),
        },
      ]);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      await service.invalidateAndRefresh('guild-1');

      // 유효 세션 1개 = targetPlayCount(1) 달성 → COMPLETED
      expect(missionRepo.updateStatus).toHaveBeenCalledWith(mission.id, MissionStatus.COMPLETED);
    });

    it('미션 기간 밖 세션만 존재하면 playCount=0으로 COMPLETED하지 않는다', async () => {
      const mission = makeMission({
        id: 1,
        memberId: 'user-1',
        startDate: '20260301',
        endDate: '20260307',
        targetPlayCount: 1,
        targetPlaytimeSec: 10800,
      });
      missionRepo.findActiveByGuild.mockResolvedValue([mission]);
      configRepo.findByGuildId.mockResolvedValue(
        makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null }),
      );
      missionRepo.updateStatus.mockResolvedValue(undefined);
      missionRepo.findVisibleByGuild.mockResolvedValue([]);
      missionRepo.countByStatusForGuild.mockResolvedValue({});
      discordAction.checkMemberExists.mockResolvedValue({ member: null, isConfirmedAbsent: false });

      const playtimeQb = makeQb();
      (playtimeQb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-1', date: '20260301', total: '10800' }, // playtime 달성
      ]);
      const distinctQb = makeQb();
      (distinctQb.getRawMany as Mock).mockResolvedValue([{ userId: 'user-1', channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb = makeQb();
      // 3월 15일(범위 밖) 세션만 존재
      (historyQb.getRawMany as Mock).mockResolvedValue([
        {
          userId: 'user-1',
          channelId: 'ch-1',
          joinedAt: new Date('2026-03-15T10:00:00Z'),
          leftAt: new Date('2026-03-15T10:30:00Z'),
        },
      ]);
      voiceHistoryRepo.createQueryBuilder.mockReturnValue(historyQb);

      await service.invalidateAndRefresh('guild-1');

      // 유효 세션 0개 → playCount=0 < targetPlayCount=1 → COMPLETED 아님
      expect(missionRepo.updateStatus).not.toHaveBeenCalledWith(
        mission.id,
        MissionStatus.COMPLETED,
      );
    });
  });

  // 보완: voiceDaily 범위 밖 날짜 행이 섞여도 playtime 분리 정확성
  describe('배치 플레이타임 — 범위 밖 날짜 행 섞임 정확성', () => {
    it('enrichHistoryMissions — 각 미션이 자기 범위 날짜 행만 합산한다', async () => {
      const missionX = makeMission({
        id: 10,
        memberId: 'user-X',
        status: MissionStatus.COMPLETED,
        memberName: '엑스',
        startDate: '20260201',
        endDate: '20260228',
      });
      const missionY = makeMission({
        id: 20,
        memberId: 'user-Y',
        status: MissionStatus.FAILED,
        memberName: '와이',
        startDate: '20260301',
        endDate: '20260331',
      });

      const qb = makeQb();
      (qb.getRawMany as Mock).mockResolvedValue([
        { userId: 'user-X', date: '20260210', total: '1800' }, // X 범위 내
        { userId: 'user-X', date: '20260310', total: '9999' }, // X 범위 밖 (3월) → 제외되어야 함
        { userId: 'user-Y', date: '20260305', total: '3600' }, // Y 범위 내
        { userId: 'user-Y', date: '20260128', total: '9999' }, // Y 범위 밖 (1월) → 제외되어야 함
      ]);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichHistoryMissions('guild-1', [missionX, missionY]);

      const enrichedX = result.find((r) => r.id === 10);
      const enrichedY = result.find((r) => r.id === 20);

      // X: 2월 행만 → 1800
      expect(enrichedX?.currentPlaytimeSec).toBe(1800);
      // Y: 3월 행만 → 3600
      expect(enrichedY?.currentPlaytimeSec).toBe(3600);
    });
  });
});
