import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class GuildMemberUpsertDto {
  @IsString()
  guildId: string;

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
