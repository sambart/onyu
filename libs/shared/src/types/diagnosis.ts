export interface DailyTrendItem {
  date: string;
  totalSec: number;
  activeUsers: number;
}

export interface DiagnosisSummaryResponse {
  daily: DailyTrendItem[];
}

export interface HealthScoreResponse {
  score: number;
  prevScore: number;
  delta: number;
  diagnosis: string;
}

export interface HealthDiagnosisResponse {
  diagnosis: string;
}

export interface LeaderboardUser {
  rank: number;
  userId: string;
  nickName: string;
  avatarUrl: string | null;
  totalSec: number;
  micOnSec: number;
  activeDays: number;
}

export interface LeaderboardResponse {
  users: LeaderboardUser[];
  total: number;
}

export interface ChannelStatItem {
  channelId: string;
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  totalSec: number;
  uniqueUsers: number;
  channelType: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId: number | null;
  autoChannelConfigName: string | null;
}

export interface ChannelStatsResponse {
  channels: ChannelStatItem[];
}

export interface AiInsightResponse {
  insights: string | null;
  suggestions: string[];
  generatedAt: string | null;
}
