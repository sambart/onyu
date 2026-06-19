import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../../common/guards/guild-membership.guard';
import { BadgeService } from '../application/badge.service';
import { VoiceHealthConfigOrmEntity as VoiceHealthConfig } from '../infrastructure/voice-health-config.orm-entity';
import { VoiceHealthConfigRepository } from '../infrastructure/voice-health-config.repository';
import { VoiceHealthConfigSaveDto } from './dto/voice-health-config-save.dto';

@Controller('api/guilds/:guildId/voice-health')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class SelfDiagnosisController {
  constructor(
    private readonly configRepo: VoiceHealthConfigRepository,
    private readonly badgeService: BadgeService,
  ) {}

  /** GET /api/guilds/:guildId/voice-health/config */
  @Get('config')
  async getConfig(@Param('guildId') guildId: string): Promise<VoiceHealthConfig | null> {
    return this.configRepo.findByGuildId(guildId);
  }

  /** POST /api/guilds/:guildId/voice-health/config */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: VoiceHealthConfigSaveDto,
  ): Promise<{ ok: boolean }> {
    await this.configRepo.upsert(guildId, dto);
    return { ok: true };
  }

  /** POST /api/guilds/:guildId/voice-health/recalc-badges — 뱃지 수동 재계산 */
  @Post('recalc-badges')
  @HttpCode(HttpStatus.OK)
  async recalcBadges(
    @Param('guildId') guildId: string,
  ): Promise<{ ok: boolean; processed: number }> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.isEnabled) {
      return { ok: false, processed: 0 };
    }
    const processed = await this.badgeService.judgeAll(config);
    return { ok: true, processed };
  }
}
