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
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../common/guards/guild-membership.guard';
import { StickyMessageConfigService } from '../application/sticky-message-config.service';
import { StickyMessageSaveDto } from '../dto/sticky-message-save.dto';
import type { StickyMessageConfigOrm } from '../infrastructure/sticky-message-config.orm-entity';

@Controller('api/guilds/:guildId/sticky-message')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class StickyMessageController {
  constructor(private readonly configService: StickyMessageConfigService) {}

  /**
   * GET /api/guilds/:guildId/sticky-message
   * 설정 목록 조회 (F-STICKY-001).
   */
  @Get()
  async getConfigs(@Param('guildId') guildId: string): Promise<StickyMessageConfigOrm[]> {
    return this.configService.getConfigs(guildId);
  }

  /**
   * POST /api/guilds/:guildId/sticky-message
   * 설정 저장/수정 (F-STICKY-002).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: StickyMessageSaveDto,
  ): Promise<StickyMessageConfigOrm> {
    return this.configService.saveConfig(guildId, dto);
  }

  /**
   * POST /api/guilds/:guildId/sticky-message/:id/re-apply
   * 다시 반영 — 설정 변경 없이 현재 저장된 설정을 Discord 에 재게시한다.
   * enabled=false 인 설정은 거부(400).
   */
  @Post(':id/re-apply')
  @HttpCode(HttpStatus.OK)
  async reApply(
    @Param('guildId') guildId: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<StickyMessageConfigOrm> {
    return this.configService.reApply(guildId, id);
  }

  /**
   * DELETE /api/guilds/:guildId/sticky-message/:id
   * 설정 삭제 (F-STICKY-003).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteConfig(
    @Param('guildId') guildId: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ ok: boolean }> {
    await this.configService.deleteConfig(guildId, id);
    return { ok: true };
  }
}
