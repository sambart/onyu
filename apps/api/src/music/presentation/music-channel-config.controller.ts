import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { MusicChannelConfigService } from '../application/music-channel-config.service';
import { MusicChannelConfigSaveDto } from '../dto/music-channel-config.dto';
import type { MusicChannelConfigOrm } from '../infrastructure/music-channel-config.orm-entity';

@Controller('api/guilds/:guildId/music/config')
@UseGuards(JwtAuthGuard)
export class MusicChannelConfigController {
  constructor(private readonly configService: MusicChannelConfigService) {}

  /**
   * GET /api/guilds/:guildId/music/config
   * 음악 채널 설정 조회.
   */
  @Get()
  async getConfig(@Param('guildId') guildId: string): Promise<MusicChannelConfigOrm | null> {
    return this.configService.getConfig(guildId);
  }

  /**
   * PUT /api/guilds/:guildId/music/config
   * 음악 채널 설정 upsert (신규 생성 또는 수정) + 임베드 갱신.
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async upsertConfig(
    @Param('guildId') guildId: string,
    @Body() dto: MusicChannelConfigSaveDto,
  ): Promise<MusicChannelConfigOrm> {
    return this.configService.upsertConfig(guildId, dto);
  }

  /**
   * POST /api/guilds/:guildId/music/config/reset
   * 음악 채널 설정을 기본값으로 초기화 (채널 지정은 유지).
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetConfig(@Param('guildId') guildId: string): Promise<MusicChannelConfigOrm> {
    return this.configService.resetConfig(guildId);
  }

  /**
   * DELETE /api/guilds/:guildId/music/config
   * 음악 채널 설정 삭제.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteConfig(@Param('guildId') guildId: string): Promise<{ ok: boolean }> {
    await this.configService.deleteConfig(guildId);
    return { ok: true };
  }
}
