import { Body, Controller, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
import type { WeeklyReportConfigDto } from '@onyu/shared';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import type { WeeklyReportConfigOrmEntity } from '../infrastructure/weekly-report-config.orm-entity';
import { WeeklyReportConfigRepository } from '../infrastructure/weekly-report-config.repository';
import { WeeklyReportConfigSaveDto } from './dto/weekly-report-config.dto';

const DEFAULT_CONFIG: WeeklyReportConfigDto = {
  isEnabled: false,
  channelId: null,
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
};

@Controller('api/guilds/:guildId/weekly-report')
@UseGuards(JwtAuthGuard)
export class WeeklyReportController {
  private readonly logger = new Logger(WeeklyReportController.name);

  constructor(private readonly configRepo: WeeklyReportConfigRepository) {}

  @Get('config')
  async getConfig(@Param('guildId') guildId: string): Promise<WeeklyReportConfigDto> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config) {
      return DEFAULT_CONFIG;
    }
    return this.toDto(config);
  }

  @Post('config')
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: WeeklyReportConfigSaveDto,
  ): Promise<WeeklyReportConfigDto> {
    this.logger.log(`Saving weekly report config for guild=${guildId}`);
    const saved = await this.configRepo.upsert(guildId, dto);
    return this.toDto(saved);
  }

  private toDto(entity: WeeklyReportConfigOrmEntity): WeeklyReportConfigDto {
    return {
      isEnabled: entity.isEnabled,
      channelId: entity.channelId,
      dayOfWeek: entity.dayOfWeek,
      hour: entity.hour,
      timezone: entity.timezone,
    };
  }
}
