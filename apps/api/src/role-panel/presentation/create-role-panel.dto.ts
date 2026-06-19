import {
  ROLE_PANEL_LABEL_MAX_LENGTH,
  ROLE_PANEL_MAX_BUTTONS,
  RolePanelButtonMode,
  RolePanelButtonStyle,
} from '@onyu/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RolePanelButtonInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_PANEL_LABEL_MAX_LENGTH)
  label: string;

  @IsOptional()
  @IsString()
  emoji?: string | null;

  @IsString()
  @IsNotEmpty()
  roleId: string;

  @IsEnum(RolePanelButtonMode)
  mode: RolePanelButtonMode;

  @IsEnum(RolePanelButtonStyle)
  style: RolePanelButtonStyle;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class CreateRolePanelDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  channelId?: string | null;

  @IsOptional()
  @IsString()
  embedTitle?: string | null;

  @IsOptional()
  @IsString()
  embedDescription?: string | null;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  embedColor?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ROLE_PANEL_MAX_BUTTONS)
  @ValidateNested({ each: true })
  @Type(() => RolePanelButtonInputDto)
  buttons: RolePanelButtonInputDto[];
}
