import type { WeeklyReportConfigDto } from '@onyu/shared';

import { apiClient, apiGet } from './api-client';

// ─── 타입 re-export (libs/shared/src/types/weekly-report.ts) ─────────────────
export type { WeeklyReportConfigDto } from '@onyu/shared';

// ─── 기본값 ───────────────────────────────────────────────────────────────────

export const DEFAULT_WEEKLY_REPORT_CONFIG: WeeklyReportConfigDto = {
  isEnabled: false,
  channelId: null,
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
};

// ─── API 함수 ────────────────────────────────────────────────────────────────

/** 주간 리포트 설정 조회 */
export async function fetchWeeklyReportConfig(guildId: string): Promise<WeeklyReportConfigDto> {
  return apiGet<WeeklyReportConfigDto>(
    `/api/guilds/${guildId}/weekly-report/config`,
    DEFAULT_WEEKLY_REPORT_CONFIG,
  );
}

/** 주간 리포트 설정 저장 (upsert) */
export async function saveWeeklyReportConfig(
  guildId: string,
  config: WeeklyReportConfigDto,
): Promise<WeeklyReportConfigDto> {
  return apiClient<WeeklyReportConfigDto>(`/api/guilds/${guildId}/weekly-report/config`, {
    method: 'POST',
    body: config,
  });
}
