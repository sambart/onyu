/**
 * diagnosis-api.ts 유닛 테스트
 *
 * apiGet/apiClient 레이어를 통과하는 네트워크 호출 로직을 검증한다.
 * fetch를 직접 모킹하여 URL 생성, 파라미터 처리, fallback 동작을 확인한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchChannelStats,
  fetchDiagnosisSummary,
  fetchHealthScore,
  fetchLeaderboard,
  generateAiInsight,
} from '../diagnosis-api';

// ─── fetch 모킹 헬퍼 ────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchError(status: number, message: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message, statusCode: status }),
  } as Response);
}

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild-test';

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('fetchDiagnosisSummary', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('정상 응답(200) 시 daily 배열을 포함한 객체를 반환한다', async () => {
    const fixture = {
      daily: [
        { date: '2024-01-01', totalSec: 3600, activeUsers: 5 },
        { date: '2024-01-02', totalSec: 7200, activeUsers: 8 },
      ],
    };
    mockFetchOk(fixture);

    const result = await fetchDiagnosisSummary(GUILD_ID, 7);

    expect(result).toEqual(fixture);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/voice-analytics/summary?days=7`,
      expect.anything(),
    );
  });

  it('days 파라미터가 URL에 올바르게 포함된다', async () => {
    mockFetchOk({ daily: [] });

    await fetchDiagnosisSummary(GUILD_ID, 30);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('days=30'),
      expect.anything(),
    );
  });

  it('API 실패(500) 시 fallback 기본값 { daily: [] }를 반환한다 (apiGet 동작)', async () => {
    mockFetchError(500, '서버 내부 오류');

    const result = await fetchDiagnosisSummary(GUILD_ID, 7);

    expect(result).toEqual({ daily: [] });
  });
});

describe('fetchHealthScore', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('정상 응답(200) 시 score, delta, diagnosis를 포함한 객체를 반환한다', async () => {
    const fixture = { score: 78, prevScore: 65, delta: 13, diagnosis: '활동량이 증가했습니다.' };
    mockFetchOk(fixture);

    const result = await fetchHealthScore(GUILD_ID, 30);

    expect(result).toEqual(fixture);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/voice-analytics/health-score?days=30`,
      expect.anything(),
    );
  });

  it('API 실패 시 fallback 기본값 { score: 0, prevScore: 0, delta: 0, diagnosis: "" }를 반환한다', async () => {
    mockFetchError(503, 'Service Unavailable');

    const result = await fetchHealthScore(GUILD_ID, 30);

    expect(result).toEqual({ score: 0, prevScore: 0, delta: 0, diagnosis: '' });
  });

  it('days 파라미터가 URL에 올바르게 포함된다', async () => {
    mockFetchOk({ score: 0, prevScore: 0, delta: 0, diagnosis: '' });

    await fetchHealthScore(GUILD_ID, 14);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('days=14'),
      expect.anything(),
    );
  });
});

describe('fetchLeaderboard', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('정상 응답(200) 시 users 배열과 total을 반환한다', async () => {
    const fixture = {
      users: [
        {
          rank: 1,
          userId: 'user-001',
          nickName: '테스트유저',
          avatarUrl: null,
          totalSec: 7200,
          micOnSec: 3600,
          activeDays: 5,
        },
      ],
      total: 1,
    };
    mockFetchOk(fixture);

    const result = await fetchLeaderboard(GUILD_ID, 30, 1, 10);

    expect(result).toEqual(fixture);
  });

  it('days, page, limit 파라미터가 모두 URL에 포함된다', async () => {
    mockFetchOk({ users: [], total: 0 });

    await fetchLeaderboard(GUILD_ID, 14, 2, 5);

    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/api/guilds/${GUILD_ID}/voice-analytics/leaderboard`);
    expect(calledUrl).toContain('days=14');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=5');
  });

  it('API 실패 시 fallback 기본값 { users: [], total: 0 }을 반환한다', async () => {
    mockFetchError(500, '오류');

    const result = await fetchLeaderboard(GUILD_ID, 30, 1, 10);

    expect(result).toEqual({ users: [], total: 0 });
  });
});

describe('fetchChannelStats', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('정상 응답(200) 시 channels 배열을 반환한다', async () => {
    const fixture = {
      channels: [
        {
          channelId: 'ch-001',
          channelName: '일반 음성',
          categoryId: null,
          categoryName: null,
          totalSec: 14400,
          uniqueUsers: 10,
        },
      ],
    };
    mockFetchOk(fixture);

    const result = await fetchChannelStats(GUILD_ID, 30);

    expect(result).toEqual(fixture);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/voice-analytics/channel-stats?days=30`,
      expect.anything(),
    );
  });

  it('API 실패 시 fallback 기본값 { channels: [] }를 반환한다', async () => {
    mockFetchError(500, '오류');

    const result = await fetchChannelStats(GUILD_ID, 30);

    expect(result).toEqual({ channels: [] });
  });
});

describe('generateAiInsight', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POST 메서드로 AI 인사이트 엔드포인트를 호출하고 결과를 반환한다', async () => {
    const fixture = {
      insights: '서버 활동이 전반적으로 양호합니다.',
      suggestions: ['야간 활동 증가가 필요합니다.'],
      generatedAt: '2024-01-15T09:00:00.000Z',
    };
    mockFetchOk(fixture);

    const result = await generateAiInsight(GUILD_ID, 30);

    expect(result).toEqual(fixture);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/voice-analytics/ai-insight?days=30`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('days 파라미터가 URL에 포함된다', async () => {
    mockFetchOk({ insights: null, suggestions: [], generatedAt: null });

    await generateAiInsight(GUILD_ID, 7);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('days=7'), expect.anything());
  });

  it('API 실패(500) 시 ApiError를 throw한다 (apiClient 동작)', async () => {
    mockFetchError(500, 'AI 서비스 오류');

    await expect(generateAiInsight(GUILD_ID, 30)).rejects.toThrow('AI 서비스 오류');
  });

  it('API 실패(403) 시 ApiError를 throw한다', async () => {
    mockFetchError(403, '권한이 없습니다.');

    await expect(generateAiInsight(GUILD_ID, 30)).rejects.toThrow('권한이 없습니다.');
  });
});
