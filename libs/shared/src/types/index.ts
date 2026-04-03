// API response types shared between api and web

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

export type { GuildOverviewResponse } from './overview';

export interface VoiceActivityData {
  guildId: string;
  guildName: string;
  timeRange: {
    start: string;
    end: string;
  };
  totalStats: {
    totalUsers: number;
    totalVoiceTime: number;
    totalMicOnTime: number;
    avgDailyActiveUsers: number;
  };
  userActivities: Array<{
    userId: string;
    username: string;
    totalVoiceTime: number;
    totalMicOnTime: number;
    totalMicOffTime: number;
    aloneTime: number;
    activeChannels: Array<{
      channelId: string;
      channelName: string;
      duration: number;
    }>;
    activeDays: number;
    avgDailyVoiceTime: number;
    micUsageRate: number;
  }>;
  channelStats: Array<{
    channelId: string;
    channelName: string;
    totalVoiceTime: number;
    uniqueUsers: number;
    avgSessionDuration: number;
  }>;
  dailyTrends: Array<{
    date: string;
    totalVoiceTime: number;
    activeUsers: number;
    avgMicUsage: number;
  }>;
}

export interface VoiceAnalysisResult {
  text: string;
}

export type {
  AiInsightResponse,
  ChannelStatItem,
  ChannelStatsResponse,
  DailyTrendItem,
  DiagnosisSummaryResponse,
  HealthDiagnosisResponse,
  HealthScoreResponse,
  LeaderboardResponse,
  LeaderboardUser,
} from './diagnosis';
export type { WeeklyReportConfigDto } from './weekly-report';
