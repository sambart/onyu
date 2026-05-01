import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class InactiveMemberQueryDto {
  @IsOptional()
  @IsIn(['FULLY_INACTIVE', 'LOW_ACTIVE', 'DECLINING'])
  grade?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['lastVoiceDate', 'totalMinutes', 'decreaseRate'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
