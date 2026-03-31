import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Discord ActionRow당 최대 버튼 수 (5개) × 최대 ActionRow 수 (5개) */
const MAX_BUTTONS = 25;

export class AutoChannelSubOptionDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsString()
  @IsNotEmpty()
  channelNameTemplate: string;

  @IsInt()
  sortOrder: number;
}

export class AutoChannelButtonDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsString()
  @IsNotEmpty()
  targetCategoryId: string;

  @IsOptional()
  @IsString()
  channelNameTemplate?: string;

  @IsInt()
  sortOrder: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutoChannelSubOptionDto)
  subOptions: AutoChannelSubOptionDto[];
}

export class AutoChannelSaveDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  triggerChannelId: string;

  @IsOptional()
  @IsIn(['select', 'instant'])
  mode?: 'select' | 'instant';

  // select 모드에서만 필수
  @ValidateIf((o: AutoChannelSaveDto) => o.mode !== 'instant')
  @IsString()
  @IsNotEmpty()
  guideChannelId?: string;

  @IsOptional()
  @IsString()
  waitingRoomTemplate?: string;

  // select 모드에서만 필수
  @ValidateIf((o: AutoChannelSaveDto) => o.mode !== 'instant')
  @IsString()
  @IsNotEmpty()
  guideMessage?: string;

  @IsOptional()
  @IsString()
  embedTitle?: string;

  @IsOptional()
  @IsString()
  embedColor?: string;

  @IsArray()
  @ArrayMaxSize(MAX_BUTTONS)
  @ValidateNested({ each: true })
  @Type(() => AutoChannelButtonDto)
  buttons: AutoChannelButtonDto[];

  // instant 모드에서만 필수
  @ValidateIf((o: AutoChannelSaveDto) => o.mode === 'instant')
  @IsString()
  @IsNotEmpty({ message: 'instant 모드에서는 instantCategoryId가 필수입니다.' })
  instantCategoryId?: string;

  @IsOptional()
  @IsString()
  instantNameTemplate?: string;
}
