/**
 * DiagnosisController 테스트
 * 대상: getSummary, getHealthScore, getLeaderboard, getChannelStats, generateAiInsight
 */
import { type Mock } from 'vitest';

// DiagnosisController 생성자는 VoiceAnalyticsService, VoiceAiAnalysisService, RedisService만 받는다.
// 해당 클래스들이 ioredis/discord.js 등 외부 패키지를 직접 import하므로
// vi.mock으로 외부 의존성 체인을 끊는다.
vi.mock('../../redis/redis.service', () => ({ RedisService: vi.fn() }));
vi.mock('../application/voice-analytics.service', () => ({
  // static 메서드 getDateRange가 DiagnosisController에서 직접 호출되므로 포함해야 한다.
  VoiceAnalyticsService: Object.assign(vi.fn(), {
    getDateRange: vi.fn().mockReturnValue({ start: '20260301', end: '20260307' }),
    getPrevDateRange: vi.fn().mockReturnValue({ start: '20260222', end: '20260301' }),
  }),
}));
vi.mock('../application/voice-ai-analysis.service', () => ({ VoiceAiAnalysisService: vi.fn() }));

import { DiagnosisController } from './diagnosis.controller';
import { DiagnosisQueryDto, LeaderboardQueryDto } from './dto/diagnosis-query.dto';

describe('DiagnosisController', () => {
  let controller: DiagnosisController;
  let analyticsService: {
    getDailySummary: Mock;
    getHealthScore: Mock;
    getLeaderboard: Mock;
    getChannelStats: Mock;
    collectVoiceActivityData: Mock;
  };
  let aiAnalysisService: {
    generateHealthDiagnosis: Mock;
    generateAiInsight: Mock;
  };
  let redis: {
    get: Mock;
    set: Mock;
  };

  const GUILD_ID = 'guild-123';

  beforeEach(() => {
    analyticsService = {
      getDailySummary: vi.fn(),
      getHealthScore: vi.fn(),
      getLeaderboard: vi.fn(),
      getChannelStats: vi.fn(),
      collectVoiceActivityData: vi.fn(),
    };
    aiAnalysisService = {
      generateHealthDiagnosis: vi.fn(),
      generateAiInsight: vi.fn(),
    };
    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };

    controller = new DiagnosisController(
      analyticsService as never,
      aiAnalysisService as never,
      redis as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // getSummary
  // ──────────────────────────────────────────────────────
  describe('getSummary', () => {
    it('정상 응답: daily 배열을 포함한 DiagnosisSummaryResponse를 반환한다', async () => {
      const daily = [{ date: '20260301', totalSec: 3600, activeUsers: 5 }];
      analyticsService.getDailySummary.mockResolvedValue(daily);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.getSummary(GUILD_ID, query);

      expect(result.daily).toEqual(daily);
      expect(analyticsService.getDailySummary).toHaveBeenCalledWith(GUILD_ID, 7);
    });

    it('Redis 캐시 히트 시 서비스를 호출하지 않는다', async () => {
      const cached = { daily: [{ date: '20260301', totalSec: 3600, activeUsers: 3 }] };
      redis.get.mockResolvedValue(cached);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.getSummary(GUILD_ID, query);

      expect(result).toEqual(cached);
      expect(analyticsService.getDailySummary).not.toHaveBeenCalled();
    });

    it('캐시 미스 시 결과를 Redis에 저장한다', async () => {
      const daily = [{ date: '20260301', totalSec: 1800, activeUsers: 2 }];
      analyticsService.getDailySummary.mockResolvedValue(daily);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      await controller.getSummary(GUILD_ID, query);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(GUILD_ID),
        { daily },
        expect.any(Number),
      );
    });

    it('days 기본값은 7이다 (query.days가 undefined인 경우)', async () => {
      analyticsService.getDailySummary.mockResolvedValue([]);

      const query = new DiagnosisQueryDto();
      // days를 설정하지 않음

      await controller.getSummary(GUILD_ID, query);

      expect(analyticsService.getDailySummary).toHaveBeenCalledWith(GUILD_ID, 7);
    });
  });

  // ──────────────────────────────────────────────────────
  // getHealthScore
  // ──────────────────────────────────────────────────────
  describe('getHealthScore', () => {
    const mockHealthScoreData = {
      score: 75,
      prevScore: 60,
      delta: 15,
      totalStats: {
        totalUsers: 10,
        totalVoiceTime: 36000,
        totalMicOnTime: 18000,
        avgDailyActiveUsers: 5,
      },
      dailyTrends: [{ date: '20260301', totalVoiceTime: 3600, activeUsers: 3, avgMicUsage: 60 }],
    };

    it('정상 응답: score, prevScore, delta, diagnosis를 반환한다', async () => {
      analyticsService.getHealthScore.mockResolvedValue(mockHealthScoreData);
      aiAnalysisService.generateHealthDiagnosis.mockResolvedValue('서버 상태 양호');

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.getHealthScore(GUILD_ID, query);

      expect(result.score).toBe(75);
      expect(result.prevScore).toBe(60);
      expect(result.delta).toBe(15);
      expect(result.diagnosis).toBe('서버 상태 양호');
    });

    it('getHealthScore 후 generateHealthDiagnosis를 호출한다', async () => {
      analyticsService.getHealthScore.mockResolvedValue(mockHealthScoreData);
      aiAnalysisService.generateHealthDiagnosis.mockResolvedValue('진단 결과');

      const query = new DiagnosisQueryDto();
      query.days = 7;

      await controller.getHealthScore(GUILD_ID, query);

      expect(aiAnalysisService.generateHealthDiagnosis).toHaveBeenCalledWith(
        75,
        mockHealthScoreData.totalStats,
        mockHealthScoreData.dailyTrends,
      );
    });

    it('Redis 캐시 히트 시 서비스를 호출하지 않는다', async () => {
      const cached = { score: 80, prevScore: 70, delta: 10, diagnosis: '캐시 진단' };
      redis.get.mockResolvedValue(cached);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.getHealthScore(GUILD_ID, query);

      expect(result).toEqual(cached);
      expect(analyticsService.getHealthScore).not.toHaveBeenCalled();
      expect(aiAnalysisService.generateHealthDiagnosis).not.toHaveBeenCalled();
    });

    it('캐시 키에 guildId와 days가 포함된다', async () => {
      analyticsService.getHealthScore.mockResolvedValue(mockHealthScoreData);
      aiAnalysisService.generateHealthDiagnosis.mockResolvedValue('진단');

      const query = new DiagnosisQueryDto();
      query.days = 14;

      await controller.getHealthScore(GUILD_ID, query);

      expect(redis.get).toHaveBeenCalledWith(expect.stringContaining(GUILD_ID));
      expect(redis.get).toHaveBeenCalledWith(expect.stringContaining('14'));
    });
  });

  // ──────────────────────────────────────────────────────
  // getLeaderboard
  // ──────────────────────────────────────────────────────
  describe('getLeaderboard', () => {
    it('정상 응답: users 배열과 total을 반환한다', async () => {
      const leaderboard = {
        users: [
          {
            rank: 1,
            userId: 'user-1',
            nickName: '동현',
            avatarUrl: null,
            totalSec: 7200,
            micOnSec: 3600,
            activeDays: 5,
          },
        ],
        total: 1,
      };
      analyticsService.getLeaderboard.mockResolvedValue(leaderboard);

      const query = new LeaderboardQueryDto();
      query.days = 7;
      query.page = 1;
      query.limit = 20;

      const result = await controller.getLeaderboard(GUILD_ID, query);

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(analyticsService.getLeaderboard).toHaveBeenCalledWith(GUILD_ID, {
        days: 7,
        page: 1,
        limit: 20,
      });
    });

    it('Redis 캐시 히트 시 서비스를 호출하지 않는다', async () => {
      const cached = { users: [], total: 0 };
      redis.get.mockResolvedValue(cached);

      const query = new LeaderboardQueryDto();
      query.days = 7;
      query.page = 1;
      query.limit = 20;

      const result = await controller.getLeaderboard(GUILD_ID, query);

      expect(result).toEqual(cached);
      expect(analyticsService.getLeaderboard).not.toHaveBeenCalled();
    });

    it('페이지네이션 파라미터가 서비스로 전달된다', async () => {
      analyticsService.getLeaderboard.mockResolvedValue({ users: [], total: 0 });

      const query = new LeaderboardQueryDto();
      query.days = 30;
      query.page = 3;
      query.limit = 10;

      await controller.getLeaderboard(GUILD_ID, query);

      expect(analyticsService.getLeaderboard).toHaveBeenCalledWith(GUILD_ID, {
        days: 30,
        page: 3,
        limit: 10,
      });
    });

    it('기본값: days=7, page=1, limit=20', async () => {
      analyticsService.getLeaderboard.mockResolvedValue({ users: [], total: 0 });

      const query = new LeaderboardQueryDto();
      // 값 설정 안 함

      await controller.getLeaderboard(GUILD_ID, query);

      expect(analyticsService.getLeaderboard).toHaveBeenCalledWith(GUILD_ID, {
        days: 7,
        page: 1,
        limit: 20,
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // getChannelStats
  // ──────────────────────────────────────────────────────
  describe('getChannelStats', () => {
    it('정상 응답: channels 배열을 포함한 ChannelStatsResponse를 반환한다', async () => {
      const channels = [
        {
          channelId: 'ch-1',
          channelName: '일반',
          categoryId: null,
          categoryName: null,
          totalSec: 3600,
          uniqueUsers: 5,
        },
      ];
      analyticsService.getChannelStats.mockResolvedValue(channels);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.getChannelStats(GUILD_ID, query);

      expect(result.channels).toEqual(channels);
      expect(analyticsService.getChannelStats).toHaveBeenCalledWith(GUILD_ID, 7);
    });

    it('Redis 캐시 히트 시 서비스를 호출하지 않는다', async () => {
      const cached = { channels: [] };
      redis.get.mockResolvedValue(cached);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.getChannelStats(GUILD_ID, query);

      expect(result).toEqual(cached);
      expect(analyticsService.getChannelStats).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // generateAiInsight (POST)
  // ──────────────────────────────────────────────────────
  describe('generateAiInsight', () => {
    const mockActivityData = {
      guildId: GUILD_ID,
      guildName: '테스트서버',
      timeRange: { start: '20260301', end: '20260307' },
      totalStats: {
        totalUsers: 10,
        totalVoiceTime: 36000,
        totalMicOnTime: 18000,
        avgDailyActiveUsers: 5,
      },
      userActivities: [],
      channelStats: [],
      dailyTrends: [],
    };

    it('정상 응답: AiInsightResponse를 반환한다', async () => {
      analyticsService.collectVoiceActivityData.mockResolvedValue(mockActivityData);
      const insightResponse = {
        insights: '서버 활동 인사이트',
        suggestions: ['이벤트를 열어보세요'],
        generatedAt: new Date().toISOString(),
      };
      aiAnalysisService.generateAiInsight.mockResolvedValue(insightResponse);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.generateAiInsight(GUILD_ID, query);

      expect(result.insights).toBe('서버 활동 인사이트');
      expect(result.suggestions).toEqual(['이벤트를 열어보세요']);
    });

    it('Redis 캐시 히트 시 서비스를 호출하지 않는다', async () => {
      const cached = {
        insights: '캐시된 인사이트',
        suggestions: [],
        generatedAt: new Date().toISOString(),
      };
      redis.get.mockResolvedValue(cached);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      const result = await controller.generateAiInsight(GUILD_ID, query);

      expect(result).toEqual(cached);
      expect(analyticsService.collectVoiceActivityData).not.toHaveBeenCalled();
      expect(aiAnalysisService.generateAiInsight).not.toHaveBeenCalled();
    });

    it('캐시 미스 시 collectVoiceActivityData 후 generateAiInsight를 호출한다', async () => {
      analyticsService.collectVoiceActivityData.mockResolvedValue(mockActivityData);
      const insight = { insights: '결과', suggestions: [], generatedAt: new Date().toISOString() };
      aiAnalysisService.generateAiInsight.mockResolvedValue(insight);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      await controller.generateAiInsight(GUILD_ID, query);

      expect(analyticsService.collectVoiceActivityData).toHaveBeenCalledWith(
        GUILD_ID,
        expect.any(String),
        expect.any(String),
      );
      expect(aiAnalysisService.generateAiInsight).toHaveBeenCalledWith(mockActivityData);
    });

    it('결과를 30분 TTL로 Redis에 캐시한다', async () => {
      analyticsService.collectVoiceActivityData.mockResolvedValue(mockActivityData);
      const insight = { insights: '결과', suggestions: [], generatedAt: new Date().toISOString() };
      aiAnalysisService.generateAiInsight.mockResolvedValue(insight);

      const query = new DiagnosisQueryDto();
      query.days = 7;

      await controller.generateAiInsight(GUILD_ID, query);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(GUILD_ID),
        insight,
        60 * 30, // 30분
      );
    });
  });
});
