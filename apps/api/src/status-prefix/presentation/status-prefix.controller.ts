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

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../common/guards/guild-membership.guard';
import { StatusPrefixConfigService } from '../application/status-prefix-config.service';
import { StatusPrefixConfigSaveDto } from './status-prefix-config-save.dto';

@Controller('api/guilds/:guildId/status-prefix')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class StatusPrefixController {
  constructor(private readonly configService: StatusPrefixConfigService) {}

  /**
   * GET /api/guilds/:guildId/status-prefix/config
   * 설정 조회 (F-STATUS-PREFIX-001).
   * Redis 캐시 우선, 미스 시 DB 조회.
   * 설정 없으면 null 반환 (프론트엔드에서 기본값으로 처리).
   */
  @Get('config')
  async getConfig(@Param('guildId') guildId: string) {
    return this.configService.getConfig(guildId);
  }

  /**
   * POST /api/guilds/:guildId/status-prefix/config
   * 설정 저장 (F-STATUS-PREFIX-002).
   * DB upsert → Redis 캐시 갱신 → Discord 메시지 전송/갱신.
   * 반환: { ok: boolean; lastAppliedAt: string | null }
   */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: StatusPrefixConfigSaveDto,
  ): Promise<{ ok: boolean; lastAppliedAt: string | null }> {
    const config = await this.configService.saveConfig(guildId, dto);
    return { ok: true, lastAppliedAt: config.lastAppliedAt?.toISOString() ?? null };
  }

  /**
   * POST /api/guilds/:guildId/status-prefix/re-apply
   * 현재 설정으로 Discord 메시지를 재게시한다 (F-3 다시 반영).
   * 인가: 클래스 레벨 JwtAuthGuard + GuildMembershipGuard 자동 상속.
   * 반환: { ok: boolean; lastAppliedAt: string | null }
   */
  @Post('re-apply')
  @HttpCode(HttpStatus.OK)
  async reApply(
    @Param('guildId') guildId: string,
  ): Promise<{ ok: boolean; lastAppliedAt: string | null }> {
    const config = await this.configService.reApply(guildId);
    return { ok: true, lastAppliedAt: config.lastAppliedAt?.toISOString() ?? null };
  }
}
