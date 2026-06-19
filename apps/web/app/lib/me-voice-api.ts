import { apiClient } from './api-client';

/** 본인이 활동한 길드 목록 항목 */
export interface MeVoiceGuild {
  guildId: string;
  guildName: string | null;
  guildIcon: string | null;
}

/** 일별 음성 활동 차트 데이터 항목 */
export interface MeDailyChartEntry {
  date: string; // YYYYMMDD
  durationSec: number;
}

/** 뱃지 코드 */
export type MeBadgeCode = string;

/** 제외 채널 항목 */
export interface MeExcludedChannelEntry {
  name: string;
  type: string;
}

/** GET /api/users/me/voice/profile 응답 */
export interface MeProfileData {
  rank: number;
  totalUsers: number;
  totalSec: number;
  activeDays: number;
  avgDailySec: number;
  micOnSec: number;
  micOffSec: number;
  micUsageRate: number;
  aloneSec: number;
  dailyChart: MeDailyChartEntry[];
  peakDayOfWeek: string | null; // 한글 요일명("일".."토"), null=데이터 없음
  weeklyAvgSec: number;
  badges: MeBadgeCode[];
  excludedChannels: MeExcludedChannelEntry[];
}

/**
 * 본인이 음성 활동을 한 길드 목록을 조회한다.
 * @returns 활동 기록이 있는 길드 배열. 없으면 빈 배열.
 */
export async function fetchMeGuilds(): Promise<MeVoiceGuild[]> {
  return apiClient<MeVoiceGuild[]>('/api/users/me/voice/guilds');
}

// eslint-disable-next-line no-magic-numbers -- API 허용 기간값 7/15/30: BE ALLOWED_DAYS 상수와 동기화
export type MeVoicePeriod = 7 | 15 | 30;

/**
 * 본인의 음성 활동 프로필을 조회한다.
 * @param guildId 조회할 길드 ID
 * @param days 기간 (7 | 15 | 30)
 * @returns 프로필 데이터, 해당 기간 활동 없으면 null (204 No Content)
 */
export async function fetchMeProfile(
  guildId: string,
  days: MeVoicePeriod,
): Promise<MeProfileData | null> {
  const result = await apiClient<MeProfileData | undefined>(
    `/api/users/me/voice/profile?guildId=${encodeURIComponent(guildId)}&days=${days}`,
  );
  return result ?? null;
}
