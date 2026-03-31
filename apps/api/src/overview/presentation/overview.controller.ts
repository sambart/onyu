import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { GuildOverviewResponse } from '@onyu/shared';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { OverviewService } from '../application/overview.service';

@Controller('api/guilds/:guildId')
@UseGuards(JwtAuthGuard)
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get('overview')
  async getOverview(@Param('guildId') guildId: string): Promise<GuildOverviewResponse> {
    return this.overviewService.getOverview(guildId);
  }
}
