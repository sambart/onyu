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
    autoChannelButtonId: null,
    autoChannelButtonLabel: null,
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
    autoChannelButtonId: null,
    autoChannelButtonLabel: null,
    ...overrides,
  };
}

describe('VoiceAnalyticsService', () => {
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
      { findByUserIds: vi.fn().mockResolvedValue(new Map()) } as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // collectVoiceActivityData
  // ──────────────────────────────────────────────────────
  describe('collectVoiceActivityData', () => {
    it('데이터가 없으면 빈 응답 반환', async () => {
      voiceDailyRepo.find.mockResolvedValue([]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.guildId).toBe('guild-1');
      expect(result.guildName).toBe('테스트서버');
      expect(result.totalStats.totalUsers).toBe(0);
      expect(result.totalStats.totalVoiceTime).toBe(0);
      expect(result.userActivities).toEqual([]);
      expect(result.channelStats).toEqual([]);
      expect(result.dailyTrends).toEqual([]);
      expect(result.timeRange).toEqual({ start: '20260301', end: '20260307' });
    });

    it('GLOBAL 데이터에서 totalStats 집계', async () => {
      const globalRecord = makeGlobalRecord({ channelDurationSec: 7200, micOnSec: 3600 });
      voiceDailyRepo.find
        .mockResolvedValueOnce([globalRecord]) // globalData
        .mockResolvedValueOnce([]); // channelData

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.totalStats.totalUsers).toBe(1);
      expect(result.totalStats.totalVoiceTime).toBe(7200);
      expect(result.totalStats.totalMicOnTime).toBe(3600);
    });

    it('채널별 데이터 집계 (GLOBAL 제외)', async () => {
      const globalRecord = makeGlobalRecord();
      const channelRecord = makeChannelRecord({ channelDurationSec: 1800 });
      voiceDailyRepo.find
        .mockResolvedValueOnce([globalRecord])
        .mockResolvedValueOnce([channelRecord]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.channelStats).toHaveLength(1);
      expect(result.channelStats[0].channelId).toBe('ch-1');
      expect(result.channelStats[0].totalVoiceTime).toBe(1800);
    });

    it('사용자별 activeDays, totalVoiceTime 집계', async () => {
      const globalDay1 = makeGlobalRecord({ date: '20260301', micOnSec: 1000 });
      const globalDay2 = makeGlobalRecord({ date: '20260302', micOnSec: 2000 });
      const channelDay1 = makeChannelRecord({ date: '20260301', channelDurationSec: 3600 });
      const channelDay2 = makeChannelRecord({ date: '20260302', channelDurationSec: 1800 });

      voiceDailyRepo.find
        .mockResolvedValueOnce([globalDay1, globalDay2])
        .mockResolvedValueOnce([channelDay1, channelDay2]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.userActivities).toHaveLength(1);
      const user = result.userActivities[0];
      expect(user.userId).toBe('user-1');
      expect(user.activeDays).toBe(2);
      expect(user.totalVoiceTime).toBe(5400); // 3600 + 1800
    });

    it('복수 사용자 데이터 집계 후 totalVoiceTime 내림차순 정렬', async () => {
      const globalUser1 = makeGlobalRecord({ userId: 'user-1', micOnSec: 100 });
      const globalUser2 = makeGlobalRecord({ userId: 'user-2', micOnSec: 200, userName: 'Bob' });
      const channelUser1 = makeChannelRecord({ userId: 'user-1', channelDurationSec: 1000 });
      const channelUser2 = makeChannelRecord({
        userId: 'user-2',
        channelDurationSec: 5000,
        userName: 'Bob',
      });

      voiceDailyRepo.find
        .mockResolvedValueOnce([globalUser1, globalUser2])
        .mockResolvedValueOnce([channelUser1, channelUser2]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.userActivities[0].userId).toBe('user-2');
      expect(result.userActivities[1].userId).toBe('user-1');
    });

    it('dailyTrends 날짜별 집계 오름차순 정렬', async () => {
      const globalDay2 = makeGlobalRecord({ date: '20260302' });
      const globalDay1 = makeGlobalRecord({ date: '20260301' });
      const channelDay2 = makeChannelRecord({ date: '20260302', channelDurationSec: 500 });
      const channelDay1 = makeChannelRecord({ date: '20260301', channelDurationSec: 300 });

      voiceDailyRepo.find
        .mockResolvedValueOnce([globalDay2, globalDay1])
        .mockResolvedValueOnce([channelDay2, channelDay1]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.dailyTrends[0].date).toBe('20260301');
      expect(result.dailyTrends[1].date).toBe('20260302');
    });

    it('avgDailyActiveUsers 계산 (1일 2명이면 2.0)', async () => {
      const user1 = makeGlobalRecord({ userId: 'user-1' });
      const user2 = makeGlobalRecord({ userId: 'user-2', userName: 'Bob' });

      voiceDailyRepo.find.mockResolvedValueOnce([user1, user2]).mockResolvedValueOnce([]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.totalStats.avgDailyActiveUsers).toBe(2);
    });

    it('채널 uniqueUsers 수 집계', async () => {
      const ch1user1 = makeChannelRecord({ userId: 'user-1', channelDurationSec: 1000 });
      const ch1user2 = makeChannelRecord({
        userId: 'user-2',
        userName: 'Bob',
        channelDurationSec: 2000,
      });

      voiceDailyRepo.find
        .mockResolvedValueOnce([makeGlobalRecord(), makeGlobalRecord({ userId: 'user-2' })])
        .mockResolvedValueOnce([ch1user1, ch1user2]);

      const result = await service.collectVoiceActivityData('guild-1', '20260301', '20260307');

      expect(result.channelStats[0].uniqueUsers).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────
  // getDateRange (static)
  // ──────────────────────────────────────────────────────
  describe('getDateRange', () => {
    it('days=7이면 오늘 기준 7일 전 start, 오늘 end 반환', () => {
      const { start, end } = VoiceAnalyticsService.getDateRange(7);

      expect(start).toMatch(/^\d{8}$/);
      expect(end).toMatch(/^\d{8}$/);
      expect(parseInt(end, 10)).toBeGreaterThanOrEqual(parseInt(start, 10));
    });
  });
});
