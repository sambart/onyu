import { IsString } from 'class-validator';

export class GuildMemberDeactivateDto {
  @IsString()
  guildId: string;

  @IsString()
  userId: string;
}
