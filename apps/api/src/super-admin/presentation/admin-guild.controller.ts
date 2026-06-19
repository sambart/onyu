import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { AdminGuildService } from '../application/admin-guild.service';
import type { AdminGuildDto } from '../dto/admin-guild.dto';
import { SuperAdminGuard } from '../guards/super-admin.guard';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminGuildController {
  constructor(private readonly adminGuildService: AdminGuildService) {}

  @Get('guilds')
  async listGuilds(): Promise<AdminGuildDto[]> {
    return this.adminGuildService.listGuilds();
  }
}
