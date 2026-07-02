import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../../common/guards/guild-membership.guard';
import { VoiceHistoryService } from '../application/voice-history.service';
import { VoiceHistoryPageDto } from '../dto/voice-history-page.dto';
import { VoiceHistoryQueryDto } from '../dto/voice-history-query.dto';

@Controller('api/guilds/:guildId/voice')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class VoiceHistoryController {
  constructor(private readonly voiceHistoryService: VoiceHistoryService) {}

  /**
   * GET /api/guilds/:guildId/voice/history/:userId
   * F-VOICE-020: 유저 입퇴장 이력 페이지네이션 조회
   */
  @Get('history/:userId')
  async getHistory(
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
    @Query() query: VoiceHistoryQueryDto,
  ): Promise<VoiceHistoryPageDto> {
    return this.voiceHistoryService.getHistory(guildId, userId, query);
  }
}
