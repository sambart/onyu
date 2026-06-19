import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../../common/guards/guild-membership.guard';
import { VoiceExcludedChannelService } from '../application/voice-excluded-channel.service';
import { VoiceExcludedChannelSaveDto } from '../dto/voice-excluded-channel-save.dto';
import { VoiceExcludedChannelSyncDto } from '../dto/voice-excluded-channel-sync.dto';
import { VoiceExcludedChannelOrm } from '../infrastructure/voice-excluded-channel.orm-entity';

@Controller('api/guilds/:guildId/voice/excluded-channels')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class VoiceExcludedChannelController {
  constructor(private readonly excludedChannelService: VoiceExcludedChannelService) {}

  /**
   * GET /api/guilds/:guildId/voice/excluded-channels
   * 제외 채널 목록 조회 (F-VOICE-013).
   */
  @Get()
  async getExcludedChannels(@Param('guildId') guildId: string): Promise<VoiceExcludedChannelOrm[]> {
    return this.excludedChannelService.getExcludedChannels(guildId);
  }

  /**
   * POST /api/guilds/:guildId/voice/excluded-channels
   * 제외 채널 등록 (F-VOICE-014).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async saveExcludedChannel(
    @Param('guildId') guildId: string,
    @Body() dto: VoiceExcludedChannelSaveDto,
  ): Promise<VoiceExcludedChannelOrm> {
    return this.excludedChannelService.saveExcludedChannel(guildId, dto);
  }

  /**
   * PUT /api/guilds/:guildId/voice/excluded-channels
   * 제외 채널 전체 교체 (벌크 동기화).
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async syncExcludedChannels(
    @Param('guildId') guildId: string,
    @Body() dto: VoiceExcludedChannelSyncDto,
  ): Promise<{ ok: boolean }> {
    await this.excludedChannelService.syncExcludedChannels(guildId, dto);
    return { ok: true };
  }

  /**
   * DELETE /api/guilds/:guildId/voice/excluded-channels/:id
   * 제외 채널 삭제 (F-VOICE-015).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteExcludedChannel(
    @Param('guildId') guildId: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ ok: boolean }> {
    await this.excludedChannelService.deleteExcludedChannel(guildId, id);
    return { ok: true };
  }
}
