import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const MAX_DAY_OF_WEEK = 6;
const MAX_HOUR = 23;

export class WeeklyReportConfigSaveDto {
  @IsBoolean()
  isEnabled: boolean;

  @IsOptional()
  @IsString()
  channelId: string | null;

  @IsInt()
  @Min(0)
  @Max(MAX_DAY_OF_WEEK)
  dayOfWeek: number;

  @IsInt()
  @Min(0)
  @Max(MAX_HOUR)
  hour: number;

  @IsString()
  timezone: string;
}
