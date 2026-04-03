import { IsOptional, IsString } from 'class-validator';

export class GuildMemberUpdateDisplayNameDto {
  @IsString()
  guildId: string;

  @IsString()
  userId: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  nick?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
