import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

export class GuildMemberSyncItemDto {
  @IsString()
  userId: string;

  @IsString()
  displayName: string;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  nick?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsBoolean()
  isBot: boolean;

  @IsOptional()
  @IsString()
  joinedAt?: string | null;
}

export class GuildMemberSyncDto {
  @IsString()
  guildId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuildMemberSyncItemDto)
  members: GuildMemberSyncItemDto[];
}
