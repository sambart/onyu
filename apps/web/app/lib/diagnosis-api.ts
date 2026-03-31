import type {
  AiInsightResponse,
  ChannelStatsResponse,
  DiagnosisSummaryResponse,
  HealthScoreResponse,
  LeaderboardResponse,
} from '@onyu/shared';

import { apiClient, apiGet } from './api-client';

// ─── 타입 re-export (libs/shared/src/types/diagnosis.ts) ─────────────────────
export type {
  AiInsightResponse,
  ChannelStatItem,
  ChannelStatsResponse,
  DailyTrendItem,
  DiagnosisSummaryResponse,
  HealthScoreResponse,
  LeaderboardResponse,
  LeaderboardUser,
} from '@onyu/shared';

// ─── API 함수 ────────────────────────────────────────────────────────────────

/** 일별 활동 트렌드 요약 조회 */
export async function fetchDiagnosisSummary(
  guildId: string,
  days: number,
): Promise<DiagnosisSummaryResponse> {
  return apiGet<DiagnosisSummaryResponse>(
    `/api/guilds/${guildId}/voice-analytics/summary?days=${days}`,
    { daily: [] },
  );
}

/** 서버 건강도 스코어 + AI 진단 조회 */
export async function fetchHealthScore(
  guildId: string,
  days: number,
): Promise<HealthScoreResponse> {
  return apiGet<HealthScoreResponse>(
    `/api/guilds/${guildId}/voice-analytics/health-score?days=${days}`,
    { score: 0, prevScore: 0, delta: 0, diagnosis: '' },
  );
}

/** 유저 리더보드 조회 */
export async function fetchLeaderboard(
  guildId: string,
  days: number,
  page: number,
  limit: number,
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({
    days: String(days),
    page: String(page),
    limit: String(limit),
  });
  return apiGet<LeaderboardResponse>(
    `/api/guilds/${guildId}/voice-analytics/leaderboard?${params.toString()}`,
    { users: [], total: 0 },
  );
}

/** 채널별 통계 조회 */
export async function fetchChannelStats(
  guildId: string,
  days: number,
): Promise<ChannelStatsResponse> {
  return apiGet<ChannelStatsResponse>(
    `/api/guilds/${guildId}/voice-analytics/channel-stats?days=${days}`,
    { channels: [] },
  );
}

/** 캐시된 AI 인사이트 조회 (GET) — 페이지 초기 로드용 */
export async function fetchAiInsight(
  guildId: string,
  days: number,
): Promise<AiInsightResponse | null> {
  return apiGet<AiInsightResponse | null>(
    `/api/guilds/${guildId}/voice-analytics/ai-insight?days=${days}`,
    null,
  );
}

/** AI 인사이트 수동 재생성 (POST) — 새로고침 버튼용 */
export async function generateAiInsight(guildId: string, days: number): Promise<AiInsightResponse> {
  return apiClient<AiInsightResponse>(
    `/api/guilds/${guildId}/voice-analytics/ai-insight?days=${days}`,
    { method: 'POST' },
  );
}
