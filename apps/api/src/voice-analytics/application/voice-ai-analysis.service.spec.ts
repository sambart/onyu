import { type VoiceActivityData } from '@onyu/shared';
import { type Mock } from 'vitest';

import { type LlmProvider } from '../../common/llm/llm-provider.interface';
import { VoiceAiAnalysisService } from './voice-ai-analysis.service';

function makeVoiceActivityData(overrides: Partial<VoiceActivityData> = {}): VoiceActivityData {
  return {
    guildId: 'guild-1',
    guildName: '테스트서버',
    timeRange: {
      start: '2026-03-01',
      end: '2026-03-18',
    },
    totalStats: {
      totalUsers: 10,
      totalVoiceTime: 36000,
      totalMicOnTime: 18000,
      avgDailyActiveUsers: 5,
    },
    userActivities: [
      {
        userId: 'user-1',
        username: '동현',
        totalVoiceTime: 7200,
        totalMicOnTime: 3600,
        totalMicOffTime: 3600,
        aloneTime: 0,
        activeDays: 5,
        avgDailyVoiceTime: 1440,
        micUsageRate: 50,
        activeChannels: [{ channelId: 'ch-1', channelName: '일반', duration: 7200 }],
      },
    ],
    channelStats: [
      {
        channelId: 'ch-1',
        channelName: '일반',
        totalVoiceTime: 36000,
        uniqueUsers: 8,
        avgSessionDuration: 4500,
      },
    ],
    dailyTrends: [{ date: '20260318', totalVoiceTime: 3600, activeUsers: 3, avgMicUsage: 60 }],
    ...overrides,
  };
}

describe('VoiceAiAnalysisService', () => {
  let service: VoiceAiAnalysisService;
  let llmProvider: { generateText: Mock } & LlmProvider;

  beforeEach(() => {
    llmProvider = {
      generateText: vi.fn(),
    };

    // constructor에 직접 모킹 객체 전달
    service = new VoiceAiAnalysisService(llmProvider);

    vi.clearAllMocks();
  });

  describe('analyzeVoiceActivity', () => {
    it('LLM 호출 성공 시 text 반환', async () => {
      llmProvider.generateText.mockResolvedValue('분석 결과 텍스트');

      const result = await service.analyzeVoiceActivity(makeVoiceActivityData());

      expect(llmProvider.generateText).toHaveBeenCalledTimes(1);
      expect(result.text).toBe('분석 결과 텍스트');
    });

    it('LLM 에러 시 기본 통계 폴백 텍스트 반환 (AI 분석 불가 안내 포함)', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('API 에러'));

      const result = await service.analyzeVoiceActivity(makeVoiceActivityData());

      expect(result.text).toContain('AI 분석을 일시적으로 사용할 수 없어');
      expect(result.text).toContain('총 활성 유저');
    });
  });

  describe('analyzeSpecificUser', () => {
    it('정상 분석: LLM 호출 성공 시 텍스트 반환', async () => {
      llmProvider.generateText.mockResolvedValue('유저 분석 결과');

      const result = await service.analyzeSpecificUser(makeVoiceActivityData(), 'user-1');

      expect(llmProvider.generateText).toHaveBeenCalledTimes(1);
      expect(result).toBe('유저 분석 결과');
    });

    it('유저를 찾을 수 없으면 Error throw', async () => {
      await expect(
        service.analyzeSpecificUser(makeVoiceActivityData(), 'nonexistent-user'),
      ).rejects.toThrow('User not found in activity data');

      expect(llmProvider.generateText).not.toHaveBeenCalled();
    });

    it('LLM 에러 시 기본 통계 폴백 텍스트 반환', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('LLM 실패'));

      const result = await service.analyzeSpecificUser(makeVoiceActivityData(), 'user-1');

      expect(result).toContain('AI 분석을 일시적으로 사용할 수 없어');
      expect(result).toContain('총 음성 시간');
    });
  });

  describe('calculateCommunityHealth', () => {
    it('LLM 성공 시 텍스트 반환', async () => {
      llmProvider.generateText.mockResolvedValue('건강도 분석 결과');

      const result = await service.calculateCommunityHealth(makeVoiceActivityData());

      expect(llmProvider.generateText).toHaveBeenCalledTimes(1);
      expect(result).toBe('건강도 분석 결과');
    });

    it('LLM 실패 시 기본 통계 폴백 텍스트 반환', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('할당량 초과'));

      const result = await service.calculateCommunityHealth(makeVoiceActivityData());

      expect(result).toContain('AI 분석을 일시적으로 사용할 수 없어');
      expect(result).toContain('총 활성 유저');
    });
  });

  describe('buildFallbackAnalysis (analyzeVoiceActivity를 통해 간접 테스트)', () => {
    it('3600초는 1시간 0분으로 포맷된다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData({
        totalStats: {
          totalUsers: 5,
          totalVoiceTime: 3600,
          totalMicOnTime: 3600,
          avgDailyActiveUsers: 2,
        },
      });

      const result = await service.analyzeVoiceActivity(data);

      expect(result.text).toContain('1시간 0분');
    });

    it('유저가 없으면 TOP 5 유저 항목에 데이터 없음 표시', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData({ userActivities: [] });

      const result = await service.analyzeVoiceActivity(data);

      expect(result.text).toContain('데이터 없음');
    });

    it('채널 통계가 없으면 인기 채널 항목에 데이터 없음 표시', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData({ channelStats: [] });

      const result = await service.analyzeVoiceActivity(data);

      expect(result.text).toContain('데이터 없음');
    });
  });
});
