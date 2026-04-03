import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

/** 모코코 신입 기간 최대 일수 */
const MOCO_NEWBIE_DAYS_MAX = 365;
/** 자동 갱신 주기 최대 분수 (1440 = 24시간) */
const MOCO_AUTO_REFRESH_MAX_MINUTES = 1440;

export class NewbieConfigSaveDto {
  // 환영인사
  @IsBoolean()
  welcomeEnabled: boolean;

  @IsOptional()
  @IsString()
  welcomeChannelId?: string | null;

  @IsOptional()
  @IsString()
  welcomeEmbedTitle?: string | null;

  @IsOptional()
  @IsString()
  welcomeEmbedDescription?: string | null;

  @IsOptional()
  @IsString()
  welcomeEmbedColor?: string | null;

  @IsOptional()
  @IsUrl()
  welcomeEmbedThumbnailUrl?: string | null;

  @IsOptional()
  @IsString()
  welcomeContent?: string | null;

  // 미션
  @IsBoolean()
  missionEnabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  missionDurationDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  missionTargetPlaytimeHours?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  playCountMinDurationMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  playCountIntervalMin?: number | null;

  @IsOptional()
  @IsString()
  missionNotifyChannelId?: string | null;

  @IsOptional()
  @IsString()
  missionEmbedTitle?: string | null;

  @IsOptional()
  @IsString()
  missionEmbedDescription?: string | null;

  @IsOptional()
  @IsString()
  missionEmbedColor?: string | null;

  @IsOptional()
  @IsUrl()
  missionEmbedThumbnailUrl?: string | null;

  // 모코코 사냥
  @IsBoolean()
  mocoEnabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MOCO_NEWBIE_DAYS_MAX)
  mocoNewbieDays?: number | null;

  @IsOptional()
  @IsBoolean()
  mocoAllowNewbieHunter?: boolean;

  @IsOptional()
  @IsString()
  mocoRankChannelId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MOCO_AUTO_REFRESH_MAX_MINUTES)
  mocoAutoRefreshMinutes?: number | null;

  @IsOptional()
  @IsString()
  mocoEmbedTitle?: string | null;

  @IsOptional()
  @IsString()
  mocoEmbedDescription?: string | null;

  @IsOptional()
  @IsString()
  mocoEmbedColor?: string | null;

  @IsOptional()
  @IsUrl()
  mocoEmbedThumbnailUrl?: string | null;

  // 모코코 사냥 — 플레이횟수 카운팅
  @IsOptional()
  @IsInt()
  @Min(1)
  mocoPlayCountMinDurationMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  mocoPlayCountIntervalMin?: number | null;

  // 모코코 사냥 — 점수/세션/리셋
  @IsOptional()
  @IsInt()
  @Min(1)
  mocoMinCoPresenceMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  mocoScorePerSession?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  mocoScorePerMinute?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  mocoScorePerUnique?: number | null;

  @IsOptional()
  @IsString()
  mocoResetPeriod?: 'NONE' | 'MONTHLY' | 'CUSTOM' | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  mocoResetIntervalDays?: number | null;

  // 모코코 사냥 — 표시 방식
  @IsOptional()
  @IsString()
  mocoDisplayMode?: 'EMBED' | 'CANVAS' | null;

  // 신입기간 역할
  @IsBoolean()
  roleEnabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  roleDurationDays?: number | null;

  @IsOptional()
  @IsString()
  newbieRoleId?: string | null;
}
