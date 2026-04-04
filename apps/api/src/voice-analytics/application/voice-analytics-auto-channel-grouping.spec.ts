/**
 * VoiceAnalyticsService — auto-channel 그룹핑 테스트
 * 대상: getChannelStats(groupAutoChannels=true/false), groupByAutoChannelConfig (F-VOICE-035, F-VOICE-036)
 *
 * fetchRawRecords → voiceDailyRepo.find (단일 호출)
 */

vi.mock('../../discord-rest/discord-rest.service', () => ({ DiscordRestService: vi.fn() }));
vi.mock('../../gateway/discord.gateway', () => ({ DiscordGateway: vi.fn() }));
vi.mock('./voice-name-enricher.service', () => ({ VoiceNameEnricherService: vi.fn() }));

import { type Mock } from 'vitest';

import { type VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceAnalyticsService } from './voice-analytics.service';

/** 채널별 레코드 팩토리 */
function makeChannelRecord(overrides: Partial<VoiceDailyOrm> = {}): VoiceDailyOrm {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    date: '20260301',
    channelId: 'ch-1',
    channelName: '일반',
    userName: 'Alice',
    categoryId: null as unknown as string,
    categoryName: null as unknown as string,
    channelDurationSec: 3600,
    micOnSec: 0,
    micOffSec: 0,
    aloneSec: 0,
    streamingSec: 0,
    videoOnSec: 0,
    deafSec: 0,
    recordedAt: null,
    channelType: 'permanent',
    autoChannelConfigId: null,
    autoChannelConfigName: null,
    autoChannelButtonId: null,
    autoChannelButtonLabel: null,
    ...overrides,
  };
}

describe('VoiceAnalyticsService — getChannelStats (auto-channel 그룹핑)', () => {
  let service: VoiceAnalyticsService;
  let voiceDailyRepo: { find: Mock };
  let nameEnricher: {
    enrichUserNames: Mock;
    enrichChannelNames: Mock;
    enrichChannelStatsNames: Mock;
  };

  beforeEach(() => {
    voiceDailyRepo = { find: vi.fn() };
    nameEnricher = {
      enrichUserNames: vi.fn().mockResolvedValue(undefined),
      enrichChannelNames: vi.fn().mockResolvedValue(undefined),
      enrichChannelStatsNames: vi.fn().mockResolvedValue(undefined),
    };

    service = new VoiceAnalyticsService(
      voiceDailyRepo as never,
      { getGuildName: vi.fn().mockResolvedValue('테스트서버') } as never,
      nameEnricher as never,
      { findByUserIds: vi.fn().mockResolvedValue(new Map()) } as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // groupAutoChannels=false (기존 동작)
  // ──────────────────────────────────────────────────────
  describe('groupAutoChannels=false (기존 동작 유지)', () => {
    it('옵션 미지정 시 channelId 단위로 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({ channelId: 'ch-1', channelDurationSec: 1000 }),
        makeChannelRecord({
          channelId: 'ch-2',
          channelDurationSec: 2000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result).toHaveLength(2);
      const channelIds = result.map((r) => r.channelId);
      expect(channelIds).toContain('ch-1');
      expect(channelIds).toContain('ch-2');
    });

    it('groupAutoChannels=false이면 자동방도 channelId 단위로 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          channelDurationSec: 2000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: false });

      expect(result).toHaveLength(2);
      const channelIds = result.map((r) => r.channelId);
      expect(channelIds).toContain('ch-a1');
      expect(channelIds).toContain('ch-a2');
    });

    it('channelType, autoChannelConfigId, autoChannelConfigName 필드가 응답에 포함된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 1000,
          autoChannelConfigId: 7,
          autoChannelConfigName: '스터디방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result[0].channelType).toBe('auto_select');
      expect(result[0].autoChannelConfigId).toBe(7);
      expect(result[0].autoChannelConfigName).toBe('스터디방');
    });

    it('상설 채널의 channelType=permanent, configId=null, configName=null이 반환된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({ channelId: 'ch-perm', channelDurationSec: 500 }),
      ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result[0].channelType).toBe('permanent');
      expect(result[0].autoChannelConfigId).toBeNull();
      expect(result[0].autoChannelConfigName).toBeNull();
    });

    it('totalSec 내림차순으로 정렬된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({ channelId: 'ch-1', channelDurationSec: 100 }),
        makeChannelRecord({ channelId: 'ch-2', channelDurationSec: 5000 }),
        makeChannelRecord({ channelId: 'ch-3', channelDurationSec: 2000 }),
      ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result[0].channelId).toBe('ch-2');
      expect(result[1].channelId).toBe('ch-3');
      expect(result[2].channelId).toBe('ch-1');
    });

    it('GLOBAL 레코드는 결과에서 제외된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({ channelId: 'GLOBAL', channelDurationSec: 9999 }),
        makeChannelRecord({ channelId: 'ch-1', channelDurationSec: 500 }),
      ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result.every((r) => r.channelId !== 'GLOBAL')).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────
  // groupAutoChannels=true (자동방 그룹핑)
  // ──────────────────────────────────────────────────────
  describe('groupAutoChannels=true (자동방 그룹핑)', () => {
    it('buttonId가 없는 자동방들이 auto:config:{configId} 기준으로 합산된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          userId: 'user-1',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          userId: 'user-2',
          channelDurationSec: 2000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('auto:config:1');
      expect(result[0].totalSec).toBe(3000);
    });

    it('buttonId가 없는 경우 그룹핑된 항목의 channelId는 auto:config:{configId} 형식이다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 500,
          autoChannelConfigId: 99,
          autoChannelConfigName: '스터디방',
          channelType: 'auto_select',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result[0].channelId).toBe('auto:config:99');
    });

    it('buttonId가 있는 자동방들이 auto:button:{buttonId} 기준으로 합산된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          userId: 'user-1',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: 10,
          autoChannelButtonLabel: '오버워치',
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          userId: 'user-2',
          channelDurationSec: 2000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: 10,
          autoChannelButtonLabel: '오버워치',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('auto:button:10');
      expect(result[0].totalSec).toBe(3000);
    });

    it('buttonId가 있는 경우 그룹핑된 항목의 channelId는 auto:button:{buttonId} 형식이다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 500,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: 55,
          autoChannelButtonLabel: '리그오브레전드',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result[0].channelId).toBe('auto:button:55');
    });

    it('같은 configId라도 buttonId가 다르면 별도 그룹으로 분리된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: 10,
          autoChannelButtonLabel: '오버워치',
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          channelDurationSec: 2000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: 20,
          autoChannelButtonLabel: '리그오브레전드',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(2);
      const channelIds = result.map((r) => r.channelId);
      expect(channelIds).toContain('auto:button:10');
      expect(channelIds).toContain('auto:button:20');
    });

    it('buttonId가 있는 그룹의 channelName은 autoChannelButtonLabel이다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelName: '게임방-1호',
          channelDurationSec: 500,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: 10,
          autoChannelButtonLabel: '오버워치',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result[0].channelName).toBe('오버워치');
    });

    it('그룹핑된 항목의 channelName은 autoChannelConfigName이다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelName: '게임방-1호',
          channelDurationSec: 500,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          channelName: '게임방-2호',
          channelDurationSec: 300,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result[0].channelName).toBe('게임방');
    });

    it('uniqueUsers가 Set 합집합으로 계산된다 (중복 제거)', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          userId: 'user-1',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
        makeChannelRecord({
          channelId: 'ch-a1',
          userId: 'user-2',
          channelDurationSec: 500,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          userId: 'user-1', // user-1이 두 채널 모두 방문 → 합집합에서 1명으로 계산
          channelDurationSec: 800,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          userId: 'user-3', // 새 유저
          channelDurationSec: 200,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      // user-1, user-2, user-3 → 3명 (user-1 중복 제거)
      expect(result[0].uniqueUsers).toBe(3);
    });

    it('서로 다른 configId는 (buttonId 없을 때) 별도 그룹으로 분리된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          channelType: 'auto_select',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
        makeChannelRecord({
          channelId: 'ch-b1',
          channelDurationSec: 2000,
          autoChannelConfigId: 2,
          autoChannelConfigName: '스터디방',
          channelType: 'auto_select',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(2);
      const channelIds = result.map((r) => r.channelId);
      expect(channelIds).toContain('auto:config:1');
      expect(channelIds).toContain('auto:config:2');
    });

    it('상설 채널은 그룹핑되지 않고 그대로 유지된다 (buttonId 없는 자동방과 혼재)', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-perm',
          channelName: '상설채널',
          channelDurationSec: 500,
          channelType: 'permanent',
          autoChannelConfigId: null,
          autoChannelConfigName: null,
        }),
        makeChannelRecord({
          channelId: 'ch-auto',
          channelDurationSec: 1000,
          channelType: 'auto_select',
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(2);
      const channelIds = result.map((r) => r.channelId);
      expect(channelIds).toContain('ch-perm');
      expect(channelIds).toContain('auto:config:1');
    });

    it('상설 채널과 그룹핑된 자동방이 totalSec 내림차순으로 함께 정렬된다 (buttonId 없는 경우)', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-perm',
          channelDurationSec: 500,
          channelType: 'permanent',
          autoChannelConfigId: null,
          autoChannelConfigName: null,
        }),
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 2000,
          channelType: 'auto_select',
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
        makeChannelRecord({
          channelId: 'ch-a2',
          channelDurationSec: 3000,
          channelType: 'auto_select',
          autoChannelConfigId: 1,
          autoChannelConfigName: '게임방',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
      ]);

      // auto:config:1 = 2000+3000 = 5000, ch-perm = 500
      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result[0].channelId).toBe('auto:config:1');
      expect(result[0].totalSec).toBe(5000);
      expect(result[1].channelId).toBe('ch-perm');
      expect(result[1].totalSec).toBe(500);
    });

    it('자동방이 없으면 상설 채널만 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-perm-1',
          channelDurationSec: 1000,
          channelType: 'permanent',
        }),
        makeChannelRecord({
          channelId: 'ch-perm-2',
          channelDurationSec: 500,
          channelType: 'permanent',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.channelType === 'permanent')).toBe(true);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toEqual([]);
    });

    it('그룹핑된 항목의 autoChannelConfigId, autoChannelConfigName이 포함된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          channelDurationSec: 1000,
          autoChannelConfigId: 7,
          autoChannelConfigName: '스터디방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result[0].autoChannelConfigId).toBe(7);
      expect(result[0].autoChannelConfigName).toBe('스터디방');
    });

    it('auto_instant 타입은 buttonId가 null이므로 auto:config:{configId} 기준으로 그룹핑된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-inst-1',
          channelDurationSec: 1500,
          autoChannelConfigId: 5,
          autoChannelConfigName: '즉시방',
          channelType: 'auto_instant',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
        makeChannelRecord({
          channelId: 'ch-inst-2',
          channelDurationSec: 2500,
          autoChannelConfigId: 5,
          autoChannelConfigName: '즉시방',
          channelType: 'auto_instant',
          autoChannelButtonId: null,
          autoChannelButtonLabel: null,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('auto:config:5');
      expect(result[0].totalSec).toBe(4000);
    });

    it('configId가 다른 자동방이 3개이면 3개의 그룹으로 분리된다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-1',
          autoChannelConfigId: 1,
          autoChannelConfigName: '방1',
          channelType: 'auto_select',
          channelDurationSec: 100,
        }),
        makeChannelRecord({
          channelId: 'ch-2',
          autoChannelConfigId: 2,
          autoChannelConfigName: '방2',
          channelType: 'auto_select',
          channelDurationSec: 200,
        }),
        makeChannelRecord({
          channelId: 'ch-3',
          autoChannelConfigId: 3,
          autoChannelConfigName: '방3',
          channelType: 'auto_select',
          channelDurationSec: 300,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      expect(result).toHaveLength(3);
    });
  });

  // ──────────────────────────────────────────────────────
  // 경계값 및 엣지 케이스
  // ──────────────────────────────────────────────────────
  describe('경계값 및 엣지 케이스', () => {
    it('같은 채널의 같은 유저가 여러 날 활동한 경우 uniqueUsers는 1이다', async () => {
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-a1',
          userId: 'user-1',
          date: '20260301',
          channelDurationSec: 1000,
          autoChannelConfigId: 1,
          autoChannelConfigName: '방',
          channelType: 'auto_select',
        }),
        makeChannelRecord({
          channelId: 'ch-a1',
          userId: 'user-1',
          date: '20260302',
          channelDurationSec: 500,
          autoChannelConfigId: 1,
          autoChannelConfigName: '방',
          channelType: 'auto_select',
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      // 같은 channelId이므로 그룹핑 대상이 아니라 chMap에서 합산됨
      // uniqueUsers는 Set이므로 1명
      expect(result[0].uniqueUsers).toBe(1);
    });

    it('channelType이 auto이지만 autoChannelConfigId=null이면 그룹핑하지 않는다', async () => {
      // 비정상 케이스: channelType이 auto_select이지만 configId=null
      // 문서 요구사항: autoChannelConfigId === null이면 상설 채널로 취급
      voiceDailyRepo.find.mockResolvedValue([
        makeChannelRecord({
          channelId: 'ch-weird',
          channelDurationSec: 1000,
          channelType: 'auto_select',
          autoChannelConfigId: null,
          autoChannelConfigName: null,
        }),
      ]);

      const result = await service.getChannelStats('guild-1', 7, { groupAutoChannels: true });

      // configId=null이므로 상설 채널로 취급 → 원래 channelId로 유지
      expect(result[0].channelId).toBe('ch-weird');
    });
  });
});
