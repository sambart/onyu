import { type Mock } from 'vitest';

import { MissionStatus } from '../domain/newbie-mission.types';
import { type NewbieConfigOrmEntity as NewbieConfig } from '../infrastructure/newbie-config.orm-entity';
import { type NewbieMissionOrmEntity as NewbieMission } from '../infrastructure/newbie-mission.orm-entity';
import { NewbieController } from './newbie.controller';

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

describe('NewbieController', () => {
  let controller: NewbieController;
  let configRepo: {
    findByGuildId: Mock;
    upsert: Mock;
    updateMissionNotifyMessageId: Mock;
    updateMocoRankMessageId: Mock;
    updateMocoCurrentPeriodStart: Mock;
  };
  let missionRepo: { findByGuild: Mock };
  let redisRepo: {
    getConfig: Mock;
    setConfig: Mock;
    getMocoRankCount: Mock;
    getMocoRankPage: Mock;
    getMocoHunterMeta: Mock;
  };
  let missionService: {
    enrichMissionItems: Mock;
    completeMission: Mock;
    failMission: Mock;
    hideMission: Mock;
    unhideMission: Mock;
    deleteEmbed: Mock;
    refreshMissionEmbed: Mock;
    invalidateMissionCanvasCache: Mock;
  };
  let mocoService: { sendOrUpdateRankEmbed: Mock; deleteEmbed: Mock; getHunterDetail: Mock };
  let missionTmplRepo: { findByGuildId: Mock; upsert: Mock };
  let mocoTmplRepo: { findByGuildId: Mock; upsert: Mock };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      upsert: vi.fn(),
      updateMissionNotifyMessageId: vi.fn().mockResolvedValue(undefined),
      updateMocoRankMessageId: vi.fn().mockResolvedValue(undefined),
      updateMocoCurrentPeriodStart: vi.fn().mockResolvedValue(undefined),
    };
    missionRepo = {
      findByGuild: vi.fn(),
    };
    redisRepo = {
      getConfig: vi.fn().mockResolvedValue(null),
      setConfig: vi.fn().mockResolvedValue(undefined),
      getMocoRankCount: vi.fn(),
      getMocoRankPage: vi.fn(),
      getMocoHunterMeta: vi.fn(),
      deleteMissionActive: vi.fn().mockResolvedValue(undefined),
    };
    missionService = {
      enrichMissionItems: vi.fn(),
      completeMission: vi.fn(),
      failMission: vi.fn(),
      hideMission: vi.fn(),
      unhideMission: vi.fn(),
      deleteEmbed: vi.fn().mockResolvedValue(undefined),
      refreshMissionEmbed: vi.fn().mockResolvedValue(undefined),
      invalidateMissionCanvasCache: vi.fn().mockResolvedValue(undefined),
    };
    mocoService = {
      sendOrUpdateRankEmbed: vi.fn().mockResolvedValue(undefined),
      deleteEmbed: vi.fn().mockResolvedValue(undefined),
      getHunterDetail: vi.fn(),
    };
    missionTmplRepo = {
      findByGuildId: vi.fn(),
      upsert: vi.fn(),
    };
    mocoTmplRepo = {
      findByGuildId: vi.fn(),
      upsert: vi.fn(),
    };

    controller = new NewbieController(
      configRepo as never,
      missionRepo as never,
      redisRepo as never,
      missionService as never,
      mocoService as never,
      missionTmplRepo as never,
      mocoTmplRepo as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // getMissions
  // ──────────────────────────────────────────────────────
  describe('getMissions', () => {
    it('status 없이 호출하면 resolvedStatus=undefined로 findByGuild 호출', async () => {
      const items = [makeMission()];
      missionRepo.findByGuild.mockResolvedValue({ items, total: 1 });
      missionService.enrichMissionItems.mockResolvedValue(items);

      const result = await controller.getMissions('guild-1');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 10);
      expect(result).toEqual({ items, total: 1, page: 1, pageSize: 10 });
    });

    it('status=IN_PROGRESS이면 MissionStatus.IN_PROGRESS로 필터링', async () => {
      const items = [makeMission()];
      missionRepo.findByGuild.mockResolvedValue({ items, total: 1 });
      missionService.enrichMissionItems.mockResolvedValue(items);

      await controller.getMissions('guild-1', 'IN_PROGRESS');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith(
        'guild-1',
        MissionStatus.IN_PROGRESS,
        1,
        10,
      );
    });

    it('status=COMPLETED이면 MissionStatus.COMPLETED로 필터링', async () => {
      const items = [makeMission({ status: MissionStatus.COMPLETED })];
      missionRepo.findByGuild.mockResolvedValue({ items, total: 1 });
      missionService.enrichMissionItems.mockResolvedValue(items);

      await controller.getMissions('guild-1', 'COMPLETED');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith(
        'guild-1',
        MissionStatus.COMPLETED,
        1,
        10,
      );
    });

    it('status=FAILED이면 MissionStatus.FAILED로 필터링', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', 'FAILED');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', MissionStatus.FAILED, 1, 10);
    });

    it('status=LEFT이면 MissionStatus.LEFT로 필터링', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', 'LEFT');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', MissionStatus.LEFT, 1, 10);
    });

    it('유효하지 않은 status 값이면 undefined로 전달 (전체 조회)', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', 'INVALID_STATUS');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 10);
    });

    it('page=2, pageSize=5 파라미터 파싱', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, '2', '5');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 2, 5);
    });

    it('page가 없으면 기본값 1', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, undefined, '20');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 20);
    });

    it('pageSize가 없으면 기본값 10', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, '3', undefined);

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 3, 10);
    });

    it('page=0이면 기본값 1로 클램핑', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, '0', undefined);

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 10);
    });

    it('page=-1이면 기본값 1로 클램핑', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, '-1', undefined);

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 10);
    });

    it('pageSize=0이면 기본값 10으로 클램핑', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, undefined, '0');

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 10);
    });

    it('page="abc"이면 기본값 1', async () => {
      missionRepo.findByGuild.mockResolvedValue({ items: [], total: 0 });
      missionService.enrichMissionItems.mockResolvedValue([]);

      await controller.getMissions('guild-1', undefined, 'abc', undefined);

      expect(missionRepo.findByGuild).toHaveBeenCalledWith('guild-1', undefined, 1, 10);
    });

    it('응답에 items, total, page, pageSize를 포함한다', async () => {
      const items = [makeMission()];
      const enriched = [{ ...makeMission(), memberName: '동현', currentPlaytimeSec: 3600 }];
      missionRepo.findByGuild.mockResolvedValue({ items, total: 5 });
      missionService.enrichMissionItems.mockResolvedValue(enriched);

      const result = await controller.getMissions('guild-1', 'IN_PROGRESS', '1', '10');

      expect(result).toEqual({ items: enriched, total: 5, page: 1, pageSize: 10 });
    });

    it('enrichMissionItems에 올바른 인수를 전달한다', async () => {
      const items = [makeMission()];
      missionRepo.findByGuild.mockResolvedValue({ items, total: 1 });
      missionService.enrichMissionItems.mockResolvedValue(items);

      await controller.getMissions('guild-1', 'IN_PROGRESS', '1', '10');

      expect(missionService.enrichMissionItems).toHaveBeenCalledWith('guild-1', items);
    });
  });

  // ──────────────────────────────────────────────────────
  // saveConfig — missionUseMicTime 캐시 무효화
  // ──────────────────────────────────────────────────────
  describe('saveConfig', () => {
    function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
      return {
        id: 1,
        guildId: 'guild-1',
        missionEnabled: false,
        missionDurationDays: null,
        missionTargetPlaytimeHours: null,
        missionUseMicTime: false,
        missionTargetPlayCount: null,
        missionNotifyChannelId: null,
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
        mocoDisplayMode: 'EMBED' as const,
        mocoPlayCountMinDurationMin: null,
        mocoPlayCountIntervalMin: null,
        mocoMinCoPresenceMin: 10,
        mocoScorePerSession: 10,
        mocoScorePerMinute: 1,
        mocoScorePerUnique: 5,
        mocoResetPeriod: 'NONE' as const,
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

    function makeDto(overrides: Record<string, unknown> = {}) {
      return {
        welcomeEnabled: false,
        missionEnabled: false,
        mocoEnabled: false,
        roleEnabled: false,
        missionUseMicTime: false,
        ...overrides,
      } as never;
    }

    it('prevUseMicTime !== newUseMicTime이면 deleteMissionActive와 invalidateMissionCanvasCache를 호출한다', async () => {
      const prevConfig = makeConfig({ missionUseMicTime: false });
      const savedConfig = makeConfig({ missionUseMicTime: true });
      configRepo.findByGuildId.mockResolvedValue(prevConfig);
      configRepo.upsert.mockResolvedValue(savedConfig);

      await controller.saveConfig('guild-1', makeDto({ missionUseMicTime: true }));

      expect(redisRepo.deleteMissionActive).toHaveBeenCalledWith('guild-1');
      expect(missionService.invalidateMissionCanvasCache).toHaveBeenCalledWith('guild-1');
    });

    it('prevUseMicTime === newUseMicTime이면 캐시 무효화 호출이 없다', async () => {
      const prevConfig = makeConfig({ missionUseMicTime: false });
      const savedConfig = makeConfig({ missionUseMicTime: false });
      configRepo.findByGuildId.mockResolvedValue(prevConfig);
      configRepo.upsert.mockResolvedValue(savedConfig);

      await controller.saveConfig('guild-1', makeDto({ missionUseMicTime: false }));

      expect(redisRepo.deleteMissionActive).not.toHaveBeenCalled();
      expect(missionService.invalidateMissionCanvasCache).not.toHaveBeenCalled();
    });

    it('prevConfig가 null(신규 길드)이면 prevUseMicTime=false로 처리 — newUseMicTime=true이면 캐시 무효화 호출', async () => {
      const savedConfig = makeConfig({ missionUseMicTime: true });
      configRepo.findByGuildId.mockResolvedValue(null);
      configRepo.upsert.mockResolvedValue(savedConfig);

      await controller.saveConfig('guild-1', makeDto({ missionUseMicTime: true }));

      expect(redisRepo.deleteMissionActive).toHaveBeenCalledWith('guild-1');
      expect(missionService.invalidateMissionCanvasCache).toHaveBeenCalledWith('guild-1');
    });

    it('prevConfig가 null(신규 길드)이고 newUseMicTime=false이면 캐시 무효화 호출 없음', async () => {
      const savedConfig = makeConfig({ missionUseMicTime: false });
      configRepo.findByGuildId.mockResolvedValue(null);
      configRepo.upsert.mockResolvedValue(savedConfig);

      await controller.saveConfig('guild-1', makeDto({ missionUseMicTime: false }));

      expect(redisRepo.deleteMissionActive).not.toHaveBeenCalled();
      expect(missionService.invalidateMissionCanvasCache).not.toHaveBeenCalled();
    });

    it('saveConfig는 항상 { ok: true }를 반환한다', async () => {
      const savedConfig = makeConfig({ missionUseMicTime: false });
      configRepo.findByGuildId.mockResolvedValue(null);
      configRepo.upsert.mockResolvedValue(savedConfig);

      const result = await controller.saveConfig('guild-1', makeDto());

      expect(result).toEqual({ ok: true });
    });

    it('true→false 변경 시에도 캐시 무효화 호출된다', async () => {
      const prevConfig = makeConfig({ missionUseMicTime: true });
      const savedConfig = makeConfig({ missionUseMicTime: false });
      configRepo.findByGuildId.mockResolvedValue(prevConfig);
      configRepo.upsert.mockResolvedValue(savedConfig);

      await controller.saveConfig('guild-1', makeDto({ missionUseMicTime: false }));

      expect(redisRepo.deleteMissionActive).toHaveBeenCalledWith('guild-1');
      expect(missionService.invalidateMissionCanvasCache).toHaveBeenCalledWith('guild-1');
    });
  });
});
