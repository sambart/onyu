import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../../common/guards/guild-membership.guard';
import { VoiceDailyService } from '../application/voice-daily.service';
import { VoiceDailyQueryDto } from '../dto/voice-daily-query.dto';
import { VoiceDailyRecordDto } from '../dto/voice-daily-record.dto';

@Controller('api/guilds/:guildId/voice')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class VoiceDailyController {
  constructor(private readonly voiceDailyService: VoiceDailyService) {}

  @Get('daily')
  async getDailyRecords(
    @Param('guildId') guildId: string,
    @Query() query: VoiceDailyQueryDto,
  ): Promise<VoiceDailyRecordDto[]> {
    return this.voiceDailyService.getDailyRecords(
      guildId,
      query.from,
      query.to,
      query.userId,
      query.timezone,
    );
  }
}
