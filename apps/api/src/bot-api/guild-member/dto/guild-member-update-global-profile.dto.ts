import { IsString } from 'class-validator';

export class GuildMemberUpdateGlobalProfileDto {
  @IsString()
  userId: string;

  @IsString()
  displayName: string;

  @IsString()
  username: string;
}
