export interface WeeklyReportConfigDto {
  isEnabled: boolean;
  channelId: string | null;
  dayOfWeek: number;
  hour: number;
  timezone: string;
}
