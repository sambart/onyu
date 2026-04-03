import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class InactiveMemberConfigSaveDto {
  @IsOptional()
  @IsIn([7, 15, 30])
  periodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lowActiveThresholdMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  decliningPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  gracePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  autoActionEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoRoleAdd?: boolean;

  @IsOptional()
  @IsBoolean()
  autoDm?: boolean;

  @IsOptional()
  @IsString()
  inactiveRoleId?: string | null;

  @IsOptional()
  @IsString()
  removeRoleId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedRoleIds?: string[];

  @IsOptional()
  @IsString()
  dmEmbedTitle?: string | null;

  @IsOptional()
  @IsString()
  dmEmbedBody?: string | null;

  @IsOptional()
  @IsString()
  dmEmbedColor?: string | null;
}
