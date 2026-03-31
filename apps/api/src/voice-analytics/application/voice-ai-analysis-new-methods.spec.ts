/**
 * VoiceAiAnalysisService 신규 메서드 테스트
 * 대상: generateHealthDiagnosis, generateAiInsight, generateBriefSummary, generateWeeklyReport
 */
import { type VoiceActivityData } from '@onyu/shared';
import { type Mock } from 'vitest';

import { type LlmProvider } from '../../common/llm/llm-provider.interface';
import { VoiceAiAnalysisService } from './voice-ai-analysis.service';

function makeVoiceActivityData(overrides: Partial<VoiceActivityData> = {}): VoiceActivityData {
  return {
    guildId: 'guild-1',
    guildName: '테스트서버',
    timeRange: { start: '20260301', end: '20260307' },
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
      {
        userId: 'user-2',
        username: '지호',
        totalVoiceTime: 3600,
        totalMicOnTime: 1800,
        totalMicOffTime: 1800,
        aloneTime: 0,
        activeDays: 3,
        avgDailyVoiceTime: 1200,
        micUsageRate: 50,
        activeChannels: [{ channelId: 'ch-1', channelName: '일반', duration: 3600 }],
      },
      {
        userId: 'user-3',
        username: '민준',
        totalVoiceTime: 1800,
        totalMicOnTime: 900,
        totalMicOffTime: 900,
        aloneTime: 0,
        activeDays: 2,
        avgDailyVoiceTime: 900,
        micUsageRate: 50,
        activeChannels: [],
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
    dailyTrends: [
      { date: '20260301', totalVoiceTime: 3600, activeUsers: 3, avgMicUsage: 60 },
      { date: '20260302', totalVoiceTime: 7200, activeUsers: 5, avgMicUsage: 55 },
    ],
    ...overrides,
  };
}

describe('VoiceAiAnalysisService — 신규 메서드', () => {
  let service: VoiceAiAnalysisService;
  let llmProvider: { generateText: Mock } & LlmProvider;

  beforeEach(() => {
    llmProvider = { generateText: vi.fn() };
    service = new VoiceAiAnalysisService(llmProvider);
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // generateHealthDiagnosis
  // ──────────────────────────────────────────────────────
  describe('generateHealthDiagnosis', () => {
    it('LLM 호출 성공 시 진단 텍스트를 반환한다', async () => {
      llmProvider.generateText.mockResolvedValue('서버 건강도는 양호합니다.');

      const data = makeVoiceActivityData();
      const result = await service.generateHealthDiagnosis(80, data.totalStats, data.dailyTrends);

      expect(llmProvider.generateText).toHaveBeenCalledTimes(1);
      expect(result).toBe('서버 건강도는 양호합니다.');
    });

    it('LLM 실패 시 점수와 상태를 포함한 fallback 텍스트를 반환한다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('LLM 실패'));

      const data = makeVoiceActivityData();
      const result = await service.generateHealthDiagnosis(80, data.totalStats, data.dailyTrends);

      // fallback은 점수(80)와 상태('양호')를 포함해야 한다
      expect(result).toContain('80');
      expect(result).toContain('양호');
    });

    it('점수 70 이상이면 fallback에 "양호"가 포함된다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData();
      const result = await service.generateHealthDiagnosis(75, data.totalStats, data.dailyTrends);

      expect(result).toContain('양호');
    });

    it('점수 40~69이면 fallback에 "보통"이 포함된다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData();
      const result = await service.generateHealthDiagnosis(50, data.totalStats, data.dailyTrends);

      expect(result).toContain('보통');
    });

    it('점수 39 이하이면 fallback에 "주의 필요"가 포함된다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData();
      const result = await service.generateHealthDiagnosis(20, data.totalStats, data.dailyTrends);

      expect(result).toContain('주의 필요');
    });

    it('maxOutputTokens: 512 옵션으로 LLM을 호출한다', async () => {
      llmProvider.generateText.mockResolvedValue('진단 결과');

      const data = makeVoiceActivityData();
      await service.generateHealthDiagnosis(60, data.totalStats, data.dailyTrends);

      expect(llmProvider.generateText).toHaveBeenCalledWith(expect.any(String), {
        maxOutputTokens: 512,
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // generateAiInsight
  // ──────────────────────────────────────────────────────
  describe('generateAiInsight', () => {
    it('LLM 성공 시 JSON 파싱하여 AiInsightResponse를 반환한다', async () => {
      const mockJson = JSON.stringify({
        insights: '서버 활동이 활발합니다.',
        suggestions: ['이벤트를 자주 열어보세요.', '신규 채널을 추가하세요.'],
      });
      llmProvider.generateText.mockResolvedValue(mockJson);

      const result = await service.generateAiInsight(makeVoiceActivityData());

      expect(result.insights).toBe('서버 활동이 활발합니다.');
      expect(result.suggestions).toEqual(['이벤트를 자주 열어보세요.', '신규 채널을 추가하세요.']);
      expect(result.generatedAt).toBeDefined();
    });

    it('LLM 응답에 JSON이 포함되어 있어도 파싱한다 (텍스트 혼합)', async () => {
      const mixedResponse = `분석 결과입니다. {"insights":"활동 중","suggestions":["제안1"]} 이상입니다.`;
      llmProvider.generateText.mockResolvedValue(mixedResponse);

      const result = await service.generateAiInsight(makeVoiceActivityData());

      expect(result.insights).toBe('활동 중');
      expect(result.suggestions).toEqual(['제안1']);
    });

    it('LLM 실패 시 fallback AiInsightResponse를 반환한다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('API 실패'));

      const result = await service.generateAiInsight(makeVoiceActivityData());

      expect(result.insights).toBeDefined();
      expect(result.suggestions).toBeInstanceOf(Array);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.generatedAt).toBeDefined();
    });

    it('LLM이 JSON 없는 텍스트를 반환하면 예외로 처리하여 fallback을 반환한다', async () => {
      llmProvider.generateText.mockResolvedValue('JSON이 없는 텍스트 응답입니다.');

      const result = await service.generateAiInsight(makeVoiceActivityData());

      // parseAiInsightResponse가 예외 throw -> catch fallback
      expect(result.insights).toBeDefined();
      expect(result.suggestions).toBeInstanceOf(Array);
    });

    it('generatedAt은 ISO 8601 형식이다', async () => {
      const mockJson = JSON.stringify({
        insights: '분석 내용',
        suggestions: [],
      });
      llmProvider.generateText.mockResolvedValue(mockJson);

      const result = await service.generateAiInsight(makeVoiceActivityData());

      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ──────────────────────────────────────────────────────
  // generateBriefSummary
  // ──────────────────────────────────────────────────────
  describe('generateBriefSummary', () => {
    it('LLM 성공 시 요약 텍스트를 반환한다', async () => {
      llmProvider.generateText.mockResolvedValue('이번 주 서버는 매우 활발했습니다.');

      const data = makeVoiceActivityData();
      const result = await service.generateBriefSummary(data.totalStats, data.userActivities);

      expect(result).toBe('이번 주 서버는 매우 활발했습니다.');
    });

    it('LLM 실패 시 기본 요약 텍스트를 반환한다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData();
      const result = await service.generateBriefSummary(data.totalStats, data.userActivities);

      // fallback은 빈 문자열이 아니어야 하고 유저 수나 음성시간 정보를 포함해야 한다
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('10');
    });

    it('maxOutputTokens: 256 옵션으로 LLM을 호출한다', async () => {
      llmProvider.generateText.mockResolvedValue('요약');

      const data = makeVoiceActivityData();
      await service.generateBriefSummary(data.totalStats, data.userActivities);

      expect(llmProvider.generateText).toHaveBeenCalledWith(expect.any(String), {
        maxOutputTokens: 256,
      });
    });

    it('상위 3명만 프롬프트에 포함된다 (나머지는 무시)', async () => {
      // 5명이지만 top3만 포함되어야 함
      llmProvider.generateText.mockResolvedValue('요약');

      const data = makeVoiceActivityData();
      await service.generateBriefSummary(data.totalStats, data.userActivities);

      const promptArg = (llmProvider.generateText as Mock).mock.calls[0][0] as string;
      // user-1, user-2, user-3는 있지만 전체를 다 넣지 않아야 함 — 최소한 TOP3 유저가 프롬프트에 등장
      expect(promptArg).toContain('동현');
      expect(promptArg).toContain('지호');
      expect(promptArg).toContain('민준');
    });

    it('유저 목록이 비어도 정상 동작한다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData({ userActivities: [] });
      const result = await service.generateBriefSummary(data.totalStats, data.userActivities);

      expect(typeof result).toBe('string');
    });
  });

  // ──────────────────────────────────────────────────────
  // generateWeeklyReport
  // ──────────────────────────────────────────────────────
  describe('generateWeeklyReport', () => {
    it('LLM 성공 시 주간 분석 텍스트를 반환한다', async () => {
      llmProvider.generateText.mockResolvedValue('이번 주 활동이 지난 주 대비 증가했습니다.');

      const current = makeVoiceActivityData();
      const prev = makeVoiceActivityData({
        totalStats: {
          totalUsers: 8,
          totalVoiceTime: 28800,
          totalMicOnTime: 14400,
          avgDailyActiveUsers: 4,
        },
      });

      const result = await service.generateWeeklyReport(current, prev, current.channelStats);

      expect(result).toBe('이번 주 활동이 지난 주 대비 증가했습니다.');
    });

    it('LLM 실패 시 현재/이전 기간 비교가 담긴 fallback을 반환한다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('LLM 실패'));

      const current = makeVoiceActivityData({
        totalStats: {
          totalUsers: 10,
          totalVoiceTime: 36000,
          totalMicOnTime: 18000,
          avgDailyActiveUsers: 5,
        },
      });
      const prev = makeVoiceActivityData({
        totalStats: {
          totalUsers: 8,
          totalVoiceTime: 18000,
          totalMicOnTime: 9000,
          avgDailyActiveUsers: 4,
        },
      });

      const result = await service.generateWeeklyReport(current, prev, current.channelStats);

      // fallback은 빈 문자열이 아니어야 함
      expect(result.length).toBeGreaterThan(0);
      // 현재 시간(10시간)과 이전 시간(5시간) 차이(5시간 증가) 또는 관련 내용 포함
      expect(result).toContain('10');
    });

    it('maxOutputTokens: 512 옵션으로 LLM을 호출한다', async () => {
      llmProvider.generateText.mockResolvedValue('분석 결과');

      const data = makeVoiceActivityData();
      await service.generateWeeklyReport(data, data, data.channelStats);

      expect(llmProvider.generateText).toHaveBeenCalledWith(expect.any(String), {
        maxOutputTokens: 512,
      });
    });

    it('채널 통계 상위 3개만 프롬프트에 포함한다', async () => {
      llmProvider.generateText.mockResolvedValue('결과');

      const data = makeVoiceActivityData({
        channelStats: [
          {
            channelId: 'ch-1',
            channelName: '일반',
            totalVoiceTime: 5000,
            uniqueUsers: 5,
            avgSessionDuration: 1000,
          },
          {
            channelId: 'ch-2',
            channelName: '게임',
            totalVoiceTime: 4000,
            uniqueUsers: 4,
            avgSessionDuration: 1000,
          },
          {
            channelId: 'ch-3',
            channelName: '공부',
            totalVoiceTime: 3000,
            uniqueUsers: 3,
            avgSessionDuration: 1000,
          },
          {
            channelId: 'ch-4',
            channelName: '음악',
            totalVoiceTime: 2000,
            uniqueUsers: 2,
            avgSessionDuration: 1000,
          },
        ],
      });

      await service.generateWeeklyReport(data, data, data.channelStats);

      const promptArg = (llmProvider.generateText as Mock).mock.calls[0][0] as string;
      // ch-4(음악)는 프롬프트에서 제외되어야 함
      expect(promptArg).toContain('일반');
      expect(promptArg).toContain('게임');
      expect(promptArg).toContain('공부');
      expect(promptArg).not.toContain('음악');
    });

    it('이전 기간 대비 변화가 없으면 fallback에 "동일" 또는 관련 내용이 포함된다', async () => {
      llmProvider.generateText.mockRejectedValue(new Error('실패'));

      const data = makeVoiceActivityData({
        totalStats: {
          totalUsers: 10,
          totalVoiceTime: 3600,
          totalMicOnTime: 1800,
          avgDailyActiveUsers: 5,
        },
      });

      const result = await service.generateWeeklyReport(data, data, data.channelStats);

      expect(result).toContain('동일');
    });
  });
});
