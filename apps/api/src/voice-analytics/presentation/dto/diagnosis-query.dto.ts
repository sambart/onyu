import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_DAYS = 90;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class DiagnosisQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DAYS)
  days?: number = 7;
}

export class ChannelStatsQueryDto extends DiagnosisQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === '1' || value === true)
  @IsBoolean()
  groupAutoChannels?: boolean = false;
}

export class LeaderboardQueryDto extends DiagnosisQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number = DEFAULT_LIMIT;
}
