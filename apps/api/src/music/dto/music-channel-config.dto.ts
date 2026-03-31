import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import type { MusicButtonConfigJson } from '../infrastructure/music-channel-config.orm-entity';

export class MusicButtonItemDto {
  @IsString()
  type: string;

  @IsString()
  label: string;

  @IsString()
  emoji: string;

  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(0)
  @Max(4)
  row: number;
}

export class MusicButtonConfigJsonDto implements MusicButtonConfigJson {
  @ValidateNested({ each: true })
  @Type(() => MusicButtonItemDto)
  buttons: MusicButtonItemDto[];
}

export class MusicChannelConfigSaveDto {
  @IsString()
  @ValidateIf((o: MusicChannelConfigSaveDto) => o.enabled)
  @IsNotEmpty()
  channelId: string;

  @IsOptional()
  @IsString()
  embedTitle?: string | null;

  @IsOptional()
  @IsString()
  embedDescription?: string | null;

  @IsOptional()
  @IsString()
  embedColor?: string | null;

  @IsOptional()
  @IsString()
  embedThumbnailUrl?: string | null;

  @ValidateNested()
  @Type(() => MusicButtonConfigJsonDto)
  buttonConfig: MusicButtonConfigJsonDto;

  @IsBoolean()
  enabled: boolean;
}
