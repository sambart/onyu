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
  qb.where = vi.fn().mockReturnValue(chain());
  qb.andWhere = vi.fn().mockReturnValue(chain());
  qb.from = vi.fn().mockReturnValue(chain());
  qb.innerJoin = vi.fn().mockReturnValue(chain());
  qb.orderBy = vi.fn().mockReturnValue(chain());
  qb.limit = vi.fn().mockReturnValue(chain());
  qb.getRawOne = vi.fn().mockResolvedValue(rawResult);
  qb.getRawMany = vi.fn().mockResolvedValue([]);
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

    voiceDailyRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(makeQb({ total: '0' })),
    };
    voiceHistoryRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(makeQb(null)),
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
  // ──────────────────────────────────────────────────────
  describe('getPlaytimeSec', () => {
    it('GLOBAL channelId를 제외하고 채널별 시간을 합산한다', async () => {
      const qb = makeQb({ total: '3600' });
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
      const qb = makeQb(null);
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPlaytimeSec('guild-1', 'user-1', '20260301', '20260308');

      expect(result).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────
  // getPlayCount
  // ──────────────────────────────────────────────────────
  describe('getPlayCount', () => {
    it('playCountMinDurationMin, playCountIntervalMin 모두 null이면 세션 수 그대로 반환', async () => {
      const config = makeConfig({ playCountMinDurationMin: null, playCountIntervalMin: null });

      const distinctQb = makeQb(null);
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);

      const historyQb = makeQb(null);
      historyQb.getMany = vi.fn().mockResolvedValue([
        { joinedAt: new Date('2026-03-01T10:00:00Z'), leftAt: new Date('2026-03-01T10:30:00Z') },
        { joinedAt: new Date('2026-03-01T12:00:00Z'), leftAt: new Date('2026-03-01T12:30:00Z') },
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

      const distinctQb = makeQb(null);
      distinctQb.getRawMany = vi.fn().mockResolvedValue([]); // 빈 채널 목록

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

      const distinctQb = makeQb(null);
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);

      const historyQb = makeQb(null);
      // 10분짜리(600000ms < 30분) 세션 → 필터 제외
      // 60분짜리(3600000ms >= 30분) 세션 → 포함
      historyQb.getMany = vi.fn().mockResolvedValue([
        {
          joinedAt: new Date('2026-03-01T10:00:00Z'),
          leftAt: new Date('2026-03-01T10:10:00Z'), // 10분 → 제외
        },
        {
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

      const distinctQb = makeQb(null);
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);

      const historyQb = makeQb(null);
      // 10:00, 10:30, 13:00 → 10:00~10:30 묶음(1) + 13:00 별도(2) = 2
      historyQb.getMany = vi.fn().mockResolvedValue([
        { joinedAt: new Date('2026-03-01T10:00:00Z'), leftAt: new Date('2026-03-01T10:30:00Z') },
        { joinedAt: new Date('2026-03-01T10:30:00Z'), leftAt: new Date('2026-03-01T11:00:00Z') }, // 30분 간격 → 묶음
        { joinedAt: new Date('2026-03-01T13:00:00Z'), leftAt: new Date('2026-03-01T13:30:00Z') }, // 2.5h 간격 → 별도
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

      const qb = makeQb({ total: '7200' });
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

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '0' }));

      const result = await service.enrichMissions('guild-1', [mission]);

      expect(missionRepo.updateMemberName).toHaveBeenCalledWith(mission.id, '새닉네임');
      expect(result[0].memberName).toBe('새닉네임');
    });

    it('Discord 닉네임이 DB memberName과 같으면 updateMemberName을 호출하지 않는다', async () => {
      const mission = makeMission({ memberName: '동현' });
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '0' }));

      await service.enrichMissions('guild-1', [mission]);

      expect(missionRepo.updateMemberName).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // enrichHistoryMissions
  // ──────────────────────────────────────────────────────
  describe('enrichHistoryMissions', () => {
    it('memberName이 있으면 Discord API를 호출하지 않고 DB 값을 사용한다', async () => {
      const mission = makeMission({ status: MissionStatus.COMPLETED, memberName: '저장된이름' });

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '3600' }));

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(result[0].memberName).toBe('저장된이름');
      // presenter.fetchMemberNickname은 presenter에 없음 → 직접 mock 없이 확인
    });

    it('memberName이 null이면 fetchMemberNickname을 호출한다', async () => {
      const mission = makeMission({ status: MissionStatus.COMPLETED, memberName: null });
      const mockFetchNickname = vi.fn().mockResolvedValue('Discord닉네임');
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;
      missionRepo.updateMemberName.mockResolvedValue(undefined);

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '0' }));

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(mockFetchNickname).toHaveBeenCalledWith('guild-1', mission.memberId);
      expect(result[0].memberName).toBe('Discord닉네임');
      // 서버에서 닉네임을 조회했으므로 DB에 저장해야 한다
      expect(missionRepo.updateMemberName).toHaveBeenCalledWith(mission.id, 'Discord닉네임');
    });

    it('memberName이 null이고 서버에 없는 멤버(fetchMemberNickname=null)이면 null 유지 및 DB 저장 안함', async () => {
      const mission = makeMission({ status: MissionStatus.FAILED, memberName: null });
      const mockFetchNickname = vi.fn().mockResolvedValue(null);
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '0' }));

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

      // targetPlayCount = null → getPlaytimeSec만 호출 (voiceDailyRepo 1회)
      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '10800' }));

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
      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '3600' }));

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

      // voiceDailyRepo: 1번째 호출(getPlaytimeSec) → getRawOne, 2번째 호출(getPlayCount) → getRawMany
      const playtimeQb = makeQb({ total: '10800' });
      const distinctQb = makeQb(null);
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb = makeQb(null);
      // playCount = 3 (목표 달성)
      historyQb.getMany = vi.fn().mockResolvedValue([
        { joinedAt: new Date('2026-03-01T10:00:00Z'), leftAt: new Date('2026-03-01T10:30:00Z') },
        { joinedAt: new Date('2026-03-01T12:00:00Z'), leftAt: new Date('2026-03-01T12:30:00Z') },
        { joinedAt: new Date('2026-03-01T14:00:00Z'), leftAt: new Date('2026-03-01T14:30:00Z') },
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

      // voiceDailyRepo: 1번째 호출(getPlaytimeSec) → getRawOne, 2번째 호출(getPlayCount) → getRawMany
      const playtimeQb = makeQb({ total: '10800' });
      const distinctQb = makeQb(null);
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);
      voiceDailyRepo.createQueryBuilder
        .mockReturnValueOnce(playtimeQb)
        .mockReturnValueOnce(distinctQb);

      const historyQb = makeQb(null);
      // playCount = 2 (목표 미달: 5 필요)
      historyQb.getMany = vi.fn().mockResolvedValue([
        { joinedAt: new Date('2026-03-01T10:00:00Z'), leftAt: new Date('2026-03-01T10:30:00Z') },
        { joinedAt: new Date('2026-03-01T12:00:00Z'), leftAt: new Date('2026-03-01T12:30:00Z') },
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

      // playtimeSec 미달 → getPlaytimeSec만 호출 (playtimeSec < targetPlaytimeSec이면 isMissionCompleted가 false 반환 즉시)
      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '3600' }));

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

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '0' }));

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

      voiceDailyRepo.createQueryBuilder.mockReturnValue(makeQb({ total: '0' }));

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
});
