import { NotFoundException } from '@nestjs/common';
import { type Mock } from 'vitest';

import { DomainException } from '../../../common/domain-exception';
import { MissionStatus } from '../../domain/newbie-mission.types';
import { type NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { type NewbieMissionOrmEntity as NewbieMission } from '../../infrastructure/newbie-mission.orm-entity';
import { MissionService } from './mission.service';

function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    missionEnabled: true,
    missionDurationDays: 7,
    missionTargetPlaytimeHours: 3,
    missionNotifyChannelId: 'notify-ch',
    missionNotifyMessageId: null,
    missionEmbedTitle: null,
    missionEmbedDescription: null,
    missionEmbedColor: null,
    missionEmbedThumbnailUrl: null,
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
    status: MissionStatus.IN_PROGRESS,
    hiddenFromEmbed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
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
  let presenter: { refreshMissionEmbed: Mock; fetchMemberDisplayName: Mock; deleteEmbed: Mock };
  let discordAction: {
    grantRole: Mock;
    sendDmAndKick: Mock;
    fetchMemberDisplayName: Mock;
    checkMemberExists: Mock;
    fetchGuildMembers: Mock;
  };
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
    };
    discordAction = {
      grantRole: vi.fn(),
      sendDmAndKick: vi.fn(),
      fetchMemberDisplayName: vi.fn(),
      checkMemberExists: vi.fn(),
      fetchGuildMembers: vi.fn(),
    };

    // createQueryBuilder 체이닝 mock
    const makeQb = (rawResult: unknown) => {
      const qb: Record<string, Mock> = {};
      const chain = () => qb as unknown as ReturnType<typeof makeQb>;
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
      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '3600' });

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
      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue(null);

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

      const distinctQb: Record<string, Mock> = {};
      const dSelf = () => distinctQb as never;
      distinctQb.select = vi.fn().mockReturnValue(dSelf());
      distinctQb.where = vi.fn().mockReturnValue(dSelf());
      distinctQb.andWhere = vi.fn().mockReturnValue(dSelf());
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);

      const historyQb: Record<string, Mock> = {};
      const hSelf = () => historyQb as never;
      historyQb.select = vi.fn().mockReturnValue(hSelf());
      historyQb.innerJoin = vi.fn().mockReturnValue(hSelf());
      historyQb.where = vi.fn().mockReturnValue(hSelf());
      historyQb.andWhere = vi.fn().mockReturnValue(hSelf());
      historyQb.orderBy = vi.fn().mockReturnValue(hSelf());
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

      const distinctQb: Record<string, Mock> = {};
      const dSelf = () => distinctQb as never;
      distinctQb.select = vi.fn().mockReturnValue(dSelf());
      distinctQb.where = vi.fn().mockReturnValue(dSelf());
      distinctQb.andWhere = vi.fn().mockReturnValue(dSelf());
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

      const distinctQb: Record<string, Mock> = {};
      const dSelf = () => distinctQb as never;
      distinctQb.select = vi.fn().mockReturnValue(dSelf());
      distinctQb.where = vi.fn().mockReturnValue(dSelf());
      distinctQb.andWhere = vi.fn().mockReturnValue(dSelf());
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);

      const historyQb: Record<string, Mock> = {};
      const hSelf = () => historyQb as never;
      historyQb.select = vi.fn().mockReturnValue(hSelf());
      historyQb.innerJoin = vi.fn().mockReturnValue(hSelf());
      historyQb.where = vi.fn().mockReturnValue(hSelf());
      historyQb.andWhere = vi.fn().mockReturnValue(hSelf());
      historyQb.orderBy = vi.fn().mockReturnValue(hSelf());
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

      const distinctQb: Record<string, Mock> = {};
      const dSelf = () => distinctQb as never;
      distinctQb.select = vi.fn().mockReturnValue(dSelf());
      distinctQb.where = vi.fn().mockReturnValue(dSelf());
      distinctQb.andWhere = vi.fn().mockReturnValue(dSelf());
      distinctQb.getRawMany = vi.fn().mockResolvedValue([{ channelId: 'ch-1' }]);

      const historyQb: Record<string, Mock> = {};
      const hSelf = () => historyQb as never;
      historyQb.select = vi.fn().mockReturnValue(hSelf());
      historyQb.innerJoin = vi.fn().mockReturnValue(hSelf());
      historyQb.where = vi.fn().mockReturnValue(hSelf());
      historyQb.andWhere = vi.fn().mockReturnValue(hSelf());
      historyQb.orderBy = vi.fn().mockReturnValue(hSelf());
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

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '7200' });
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

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '0' });
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissions('guild-1', [mission]);

      expect(missionRepo.updateMemberName).toHaveBeenCalledWith(mission.id, '새닉네임');
      expect(result[0].memberName).toBe('새닉네임');
    });

    it('Discord 닉네임이 DB memberName과 같으면 updateMemberName을 호출하지 않는다', async () => {
      const mission = makeMission({ memberName: '동현' });
      presenter.fetchMemberDisplayName.mockResolvedValue('동현');

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '0' });
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

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

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '3600' });
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(result[0].memberName).toBe('저장된이름');
      // presenter.fetchMemberNickname은 presenter에 없음 → 직접 mock 없이 확인
    });

    it('memberName이 null이면 fetchMemberNickname을 호출한다', async () => {
      const mission = makeMission({ status: MissionStatus.COMPLETED, memberName: null });
      const mockFetchNickname = vi.fn().mockResolvedValue('Discord닉네임');
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;
      missionRepo.updateMemberName.mockResolvedValue(undefined);

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '0' });
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
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '0' });
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichHistoryMissions('guild-1', [mission]);

      expect(result[0].memberName).toBeNull();
      expect(missionRepo.updateMemberName).not.toHaveBeenCalled();
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

      // IN_PROGRESS → enrichMissions 경로: fetchMemberDisplayName 사용
      presenter.fetchMemberDisplayName.mockResolvedValue('활성멤버');
      // COMPLETED → enrichHistoryMissions 경로: DB memberName 사용 (fetchMemberNickname 불필요)
      const mockFetchNickname = vi.fn();
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '0' });
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissionItems('guild-1', [activeMission, completedMission]);

      expect(result).toHaveLength(2);
      // 원래 배열 순서 보존
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      // COMPLETED는 DB memberName 사용 → fetchMemberNickname 미호출
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

      presenter.fetchMemberDisplayName.mockResolvedValue('진행중');
      const mockFetchNickname = vi.fn();
      (presenter as unknown as Record<string, unknown>)['fetchMemberNickname'] = mockFetchNickname;

      const qb: Record<string, Mock> = {};
      const self = () => qb as never;
      qb.select = vi.fn().mockReturnValue(self());
      qb.where = vi.fn().mockReturnValue(self());
      qb.andWhere = vi.fn().mockReturnValue(self());
      qb.getRawOne = vi.fn().mockResolvedValue({ total: '0' });
      voiceDailyRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.enrichMissionItems('guild-1', [mission1, mission2, mission3]);

      expect(result.map((r) => r.id)).toEqual([10, 20, 30]);
    });
  });
});
