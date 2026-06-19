import type { AdminRole } from '@onyu/shared';
import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const VALID_ROLES: AdminRole[] = ['super_admin', 'bot_operator'];

export class CreateAdminDto {
  @IsString()
  @IsNotEmpty()
  @Matches(DISCORD_SNOWFLAKE_PATTERN, { message: 'discordUserId는 17~20자리 숫자여야 합니다.' })
  discordUserId!: string;

  @IsIn(VALID_ROLES, { message: 'role은 super_admin 또는 bot_operator여야 합니다.' })
  role!: AdminRole;
}

export class UpdateAdminRoleDto {
  @IsIn(VALID_ROLES, { message: 'role은 super_admin 또는 bot_operator여야 합니다.' })
  role!: AdminRole;
}

export class AdminUserResponseDto {
  discordUserId: string;
  role: string;
  grantedBy: string | null;
  isActive: boolean;
  createdAt: string; // ISO8601

  constructor(data: {
    discordUserId: string;
    role: string;
    grantedBy: string | null;
    isActive: boolean;
    createdAt: Date;
  }) {
    this.discordUserId = data.discordUserId;
    this.role = data.role;
    this.grantedBy = data.grantedBy;
    this.isActive = data.isActive;
    this.createdAt = data.createdAt.toISOString();
  }
}
