/**
 * VoiceAnalyticsService 신규 메서드 테스트
 * 대상: getDailySummary, getHealthScore, getLeaderboard, getChannelStats
 *
 * VoiceAnalyticsService → VoiceNameEnricherService → DiscordGateway → DiscordRestService → discord.js
 * 위 체인의 외부 패키지 의존성을 vi.mock으로 차단한다.
 */

vi.mock('../../discord-rest/discord-rest.service', () => ({ DiscordRestService: vi.fn() }));
vi.mock('../../gateway/discord.gateway', () => ({ DiscordGateway: vi.fn() }));
vi.mock('./voice-name-enricher.service', () => ({ VoiceNameEnricherService: vi.fn() }));

import { type Mock } from 'vitest';

import { type VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceAnalyticsService } from './voice-analytics.service';

function makeGlobalRecord(overrides: Partial<VoiceDailyOrm> = {}): VoiceDailyOrm {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    date: '20260301',
    channelId: 'GLOBAL',
    channelName: '',
    userName: 'Alice',
    categoryId: null as unknown as string,
    categoryName: null as unknown as string,
    channelDurationSec: 0,
    micOnSec: 3600,
    micOffSec: 0,
    aloneSec: 0,
    streamingSec: 0,
    videoOnSec: 0,
    deafSec: 0,
    recordedAt: null,
    channelType: 'permanent',
    autoChannelConfigId: null,
    autoChannelConfigName: null,
    ...overrides,
  };
}

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
    ...overrides,
  };
}

describe('VoiceAnalyticsService — 신규 메서드', () => {
  let service: VoiceAnalyticsService;
  let voiceDailyRepo: { find: Mock };
  let discordGateway: { getGuildName: Mock };
  let nameEnricher: {
    enrichUserNames: Mock;
    enrichChannelNames: Mock;
    enrichChannelStatsNames: Mock;
  };

  beforeEach(() => {
    voiceDailyRepo = { find: vi.fn() };
    discordGateway = { getGuildName: vi.fn().mockResolvedValue('테스트서버') };
    nameEnricher = {
      enrichUserNames: vi.fn().mockResolvedValue(undefined),
      enrichChannelNames: vi.fn().mockResolvedValue(undefined),
      enrichChannelStatsNames: vi.fn().mockResolvedValue(undefined),
    };

    service = new VoiceAnalyticsService(
      voiceDailyRepo as never,
      discordGateway as never,
      nameEnricher as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // getDailySummary
  // ──────────────────────────────────────────────────────
  describe('getDailySummary', () => {
    it('날짜별 totalSec, activeUsers를 DailyTrendItem[]으로 반환한다', async () => {
      const globalDay1 = makeGlobalRecord({ date: '20260301' });
      const globalDay2 = makeGlobalRecord({ date: '20260302', userId: 'user-2', userName: 'Bob' });
      const channelDay1 = makeChannelRecord({ date: '20260301', channelDurationSec: 3600 });
      const channelDay2 = makeChannelRecord({
        date: '20260302',
        channelDurationSec: 7200,
        userId: 'user-2',
        userName: 'Bob',
      });

      voiceDailyRepo.find
        .mockResolvedValueOnce([globalDay1, globalDay2])
        .mockResolvedValueOnce([channelDay1, channelDay2]);

      const result = await service.getDailySummary('guild-1', 7);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: '20260301', totalSec: 3600, activeUsers: 1 });
      expect(result[1]).toMatchObject({ date: '20260302', totalSec: 7200, activeUsers: 1 });
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.getDailySummary('guild-1', 7);

      expect(result).toEqual([]);
    });

    it('days=1이면 1일치 요약만 반환한다', async () => {
      const globalRecord = makeGlobalRecord({ date: '20260320' });
      const channelRecord = makeChannelRecord({ date: '20260320', channelDurationSec: 1800 });

      voiceDailyRepo.find
        .mockResolvedValueOnce([globalRecord])
        .mockResolvedValueOnce([channelRecord]);

      const result = await service.getDailySummary('guild-1', 1);

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('20260320');
      expect(result[0].totalSec).toBe(1800);
    });

    it('날짜 오름차순으로 정렬된다', async () => {
      const globalDay3 = makeGlobalRecord({ date: '20260303' });
      const globalDay1 = makeGlobalRecord({ date: '20260301' });
      const channelDay3 = makeChannelRecord({ date: '20260303', channelDurationSec: 300 });
      const channelDay1 = makeChannelRecord({ date: '20260301', channelDurationSec: 100 });

      voiceDailyRepo.find
        .mockResolvedValueOnce([globalDay3, globalDay1])
        .mockResolvedValueOnce([channelDay3, channelDay1]);

      const result = await service.getDailySummary('guild-1', 7);

      expect(result[0].date).toBe('20260301');
      expect(result[1].date).toBe('20260303');
    });
  });

  // ──────────────────────────────────────────────────────
  // getLeaderboard
  // ──────────────────────────────────────────────────────
  describe('getLeaderboard', () => {
    it('totalVoiceTime 내림차순으로 정렬된다', async () => {
      const global1 = makeGlobalRecord({ userId: 'user-1', micOnSec: 100 });
      const global2 = makeGlobalRecord({ userId: 'user-2', userName: 'Bob', micOnSec: 200 });
      const channel1 = makeChannelRecord({ userId: 'user-1', channelDurationSec: 1000 });
      const channel2 = makeChannelRecord({
        userId: 'user-2',
        channelDurationSec: 5000,
        userName: 'Bob',
      });

      voiceDailyRepo.find
        .mockResolvedValueOnce([global1, global2])
        .mockResolvedValueOnce([channel1, channel2]);

      const result = await service.getLeaderboard('guild-1', { days: 7, page: 1, limit: 20 });

      expect(result.users[0].userId).toBe('user-2');
      expect(result.users[1].userId).toBe('user-1');
    });

    it('total은 전체 유저 수다', async () => {
      const globals = ['user-1', 'user-2', 'user-3'].map((userId) =>
        makeGlobalRecord({ userId, userName: userId }),
      );
      const channels = ['user-1', 'user-2', 'user-3'].map((userId, i) =>
        makeChannelRecord({ userId, userName: userId, channelDurationSec: (i + 1) * 1000 }),
      );

      voiceDailyRepo.find.mockResolvedValueOnce(globals).mockResolvedValueOnce(channels);

      const result = await service.getLeaderboard('guild-1', { days: 7, page: 1, limit: 20 });

      expect(result.total).toBe(3);
    });

    it('페이지네이션이 적용된다 (page=2, limit=1이면 두 번째 유저)', async () => {
      const globals = ['user-1', 'user-2'].map((userId) =>
        makeGlobalRecord({ userId, userName: userId }),
      );
      const channels = [
        makeChannelRecord({ userId: 'user-1', channelDurationSec: 5000 }),
        makeChannelRecord({ userId: 'user-2', channelDurationSec: 3000, userName: 'user-2' }),
      ];

      voiceDailyRepo.find.mockResolvedValueOnce(globals).mockResolvedValueOnce(channels);

      const result = await service.getLeaderboard('guild-1', { days: 7, page: 2, limit: 1 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0].userId).toBe('user-2');
      expect(result.users[0].rank).toBe(2);
    });

    it('데이터가 없으면 users=[], total=0을 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.getLeaderboard('guild-1', { days: 7, page: 1, limit: 20 });

      expect(result.users).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('LeaderboardUser 필드(rank, userId, nickName, totalSec, micOnSec, activeDays)를 포함한다', async () => {
      voiceDailyRepo.find
        .mockResolvedValueOnce([makeGlobalRecord({ micOnSec: 1800 })])
        .mockResolvedValueOnce([makeChannelRecord({ channelDurationSec: 3600 })]);

      const result = await service.getLeaderboard('guild-1', { days: 7, page: 1, limit: 20 });

      const user = result.users[0];
      expect(user.rank).toBe(1);
      expect(user.userId).toBe('user-1');
      expect(typeof user.nickName).toBe('string');
      expect(user.totalSec).toBe(3600);
      expect(user.micOnSec).toBe(1800);
      expect(typeof user.activeDays).toBe('number');
    });

    it('page=1, limit이 total보다 크면 전체 결과를 반환한다', async () => {
      const globals = ['user-1', 'user-2'].map((userId) =>
        makeGlobalRecord({ userId, userName: userId }),
      );
      const channels = [
        makeChannelRecord({ userId: 'user-1', channelDurationSec: 1000 }),
        makeChannelRecord({ userId: 'user-2', channelDurationSec: 2000, userName: 'user-2' }),
      ];

      voiceDailyRepo.find.mockResolvedValueOnce(globals).mockResolvedValueOnce(channels);

      const result = await service.getLeaderboard('guild-1', { days: 7, page: 1, limit: 100 });

      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────
  // getChannelStats
  // ──────────────────────────────────────────────────────
  describe('getChannelStats', () => {
    it('채널별 ChannelStatItem을 반환한다', async () => {
      voiceDailyRepo.find
        .mockResolvedValueOnce([makeGlobalRecord()])
        .mockResolvedValueOnce([
          makeChannelRecord({ channelId: 'ch-1', channelName: '일반', channelDurationSec: 3600 }),
        ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('ch-1');
      expect(result[0].channelName).toBe('일반');
      expect(result[0].totalSec).toBe(3600);
      expect(result[0].uniqueUsers).toBe(1);
    });

    it('데이터가 없으면 빈 배열을 반환한다', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result).toEqual([]);
    });

    it('채널별 uniqueUsers가 정확히 집계된다', async () => {
      voiceDailyRepo.find
        .mockResolvedValueOnce([
          makeGlobalRecord({ userId: 'user-1' }),
          makeGlobalRecord({ userId: 'user-2', userName: 'Bob' }),
        ])
        .mockResolvedValueOnce([
          makeChannelRecord({ userId: 'user-1', channelDurationSec: 1000 }),
          makeChannelRecord({ userId: 'user-2', channelDurationSec: 2000, userName: 'Bob' }),
        ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result[0].uniqueUsers).toBe(2);
    });

    it('여러 채널이 있으면 totalSec 내림차순으로 정렬된다', async () => {
      voiceDailyRepo.find
        .mockResolvedValueOnce([makeGlobalRecord()])
        .mockResolvedValueOnce([
          makeChannelRecord({ channelId: 'ch-1', channelName: '일반', channelDurationSec: 1000 }),
          makeChannelRecord({ channelId: 'ch-2', channelName: '게임', channelDurationSec: 5000 }),
        ]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result[0].channelId).toBe('ch-2');
      expect(result[1].channelId).toBe('ch-1');
    });

    it('ChannelStatItem에 categoryId=null, categoryName=null이 포함된다', async () => {
      voiceDailyRepo.find
        .mockResolvedValueOnce([makeGlobalRecord()])
        .mockResolvedValueOnce([makeChannelRecord({ channelDurationSec: 3600 })]);

      const result = await service.getChannelStats('guild-1', 7);

      expect(result[0].categoryId).toBeNull();
      expect(result[0].categoryName).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────
  // getHealthScore
  // ──────────────────────────────────────────────────────
  describe('getHealthScore', () => {
    it('score, prevScore, delta를 반환한다', async () => {
      // 현재 기간: 유저 1명, 10시간 음성
      const currentGlobal = makeGlobalRecord({ micOnSec: 1800 });
      const currentChannel = makeChannelRecord({ channelDurationSec: 36000 });
      // 이전 기간: 유저 1명, 5시간 음성
      const prevGlobal = makeGlobalRecord({ micOnSec: 900 });
      const prevChannel = makeChannelRecord({ channelDurationSec: 18000 });

      // find 4번 호출 (current globalData, current channelData, prev globalData, prev channelData)
      voiceDailyRepo.find
        .mockResolvedValueOnce([currentGlobal])
        .mockResolvedValueOnce([currentChannel])
        .mockResolvedValueOnce([prevGlobal])
        .mockResolvedValueOnce([prevChannel]);

      const result = await service.getHealthScore('guild-1', 7);

      expect(typeof result.score).toBe('number');
      expect(typeof result.prevScore).toBe('number');
      expect(result.delta).toBe(result.score - result.prevScore);
    });

    it('score는 0 이상 100 이하다', async () => {
      // 극단적으로 많은 음성 시간 (무한정 커지지 않아야 함)
      const currentGlobal = makeGlobalRecord({ micOnSec: 99999999 });
      const currentChannel = makeChannelRecord({ channelDurationSec: 99999999 });
      const prevGlobal = makeGlobalRecord({ micOnSec: 0 });
      const prevChannel = makeChannelRecord({ channelDurationSec: 0 });

      voiceDailyRepo.find
        .mockResolvedValueOnce([currentGlobal])
        .mockResolvedValueOnce([currentChannel])
        .mockResolvedValueOnce([prevGlobal])
        .mockResolvedValueOnce([prevChannel]);

      const result = await service.getHealthScore('guild-1', 7);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('데이터가 없으면 score=0이다', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.getHealthScore('guild-1', 7);

      expect(result.score).toBe(0);
      expect(result.prevScore).toBe(0);
      expect(result.delta).toBe(0);
    });

    it('totalStats와 dailyTrends도 함께 반환한다', async () => {
      const currentGlobal = makeGlobalRecord({ micOnSec: 3600 });
      const currentChannel = makeChannelRecord({ channelDurationSec: 7200 });
      const prevGlobal = makeGlobalRecord({ micOnSec: 1800 });
      const prevChannel = makeChannelRecord({ channelDurationSec: 3600 });

      voiceDailyRepo.find
        .mockResolvedValueOnce([currentGlobal])
        .mockResolvedValueOnce([currentChannel])
        .mockResolvedValueOnce([prevGlobal])
        .mockResolvedValueOnce([prevChannel]);

      const result = await service.getHealthScore('guild-1', 7);

      expect(result.totalStats).toBeDefined();
      expect(result.totalStats.totalUsers).toBeGreaterThanOrEqual(0);
      expect(result.dailyTrends).toBeInstanceOf(Array);
    });

    it('이전 기간보다 현재 기간이 활발하면 delta > 0이다', async () => {
      // collectVoiceActivityData를 spy로 직접 제어하여 Promise.all 병렬 호출 순서 불확실성을 제거
      const currentGlobal = makeGlobalRecord({ micOnSec: 3600 });
      const currentChannel = makeChannelRecord({ channelDurationSec: 36000 });

      const collectSpy = vi.spyOn(service, 'collectVoiceActivityData');
      // 현재 기간 데이터: 유저 1명, 36000초 → score > 0
      collectSpy
        .mockResolvedValueOnce({
          guildId: 'guild-1',
          guildName: '테스트서버',
          timeRange: { start: '20260301', end: '20260307' },
          totalStats: {
            totalUsers: 5,
            totalVoiceTime: 36000,
            totalMicOnTime: 18000,
            avgDailyActiveUsers: 5,
          },
          userActivities: [],
          channelStats: [],
          dailyTrends: [],
        })
        // 이전 기간 데이터: 없음 → score = 0
        .mockResolvedValueOnce({
          guildId: 'guild-1',
          guildName: '테스트서버',
          timeRange: { start: '20260222', end: '20260301' },
          totalStats: {
            totalUsers: 0,
            totalVoiceTime: 0,
            totalMicOnTime: 0,
            avgDailyActiveUsers: 0,
          },
          userActivities: [],
          channelStats: [],
          dailyTrends: [],
        });

      const result = await service.getHealthScore('guild-1', 7);

      // score = min(100, 5*10 + (36000/3600/7)*5) = min(100, 50 + 7.14) = 57
      // prevScore = min(100, 0*10 + 0) = 0
      // delta = 57 > 0
      expect(result.delta).toBeGreaterThan(0);

      collectSpy.mockRestore();
    });
  });

  // ──────────────────────────────────────────────────────
  // getDateRange / getPrevDateRange (static)
  // ──────────────────────────────────────────────────────
  describe('getDateRange (static)', () => {
    it('반환값이 YYYYMMDD 형식의 8자리 문자열이다', () => {
      const { start, end } = VoiceAnalyticsService.getDateRange(7);

      expect(start).toMatch(/^\d{8}$/);
      expect(end).toMatch(/^\d{8}$/);
    });

    it('start가 end보다 작거나 같다', () => {
      const { start, end } = VoiceAnalyticsService.getDateRange(7);

      expect(parseInt(start, 10)).toBeLessThanOrEqual(parseInt(end, 10));
    });
  });

  describe('getPrevDateRange (static)', () => {
    it('이전 기간 start가 현재 기간 start보다 작다', () => {
      const current = VoiceAnalyticsService.getDateRange(7);
      const prev = VoiceAnalyticsService.getPrevDateRange(7);

      expect(parseInt(prev.start, 10)).toBeLessThan(parseInt(current.start, 10));
    });

    it('이전 기간 end가 현재 기간 start와 같거나 가깝다', () => {
      const current = VoiceAnalyticsService.getDateRange(7);
      const prev = VoiceAnalyticsService.getPrevDateRange(7);

      // prev.end <= current.start
      expect(parseInt(prev.end, 10)).toBeLessThanOrEqual(parseInt(current.start, 10));
    });
  });
});
