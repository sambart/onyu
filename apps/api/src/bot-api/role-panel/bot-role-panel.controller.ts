import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { RolePanelBotService } from '../../role-panel/application/role-panel-bot.service';
import type { BotRolePanelConfigDto } from '../../role-panel/presentation/role-panel-response.dto';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

/**
 * Bot → API 역할 패널 설정 조회 엔드포인트.
 * 봇 인터랙션 핸들러의 캐시 미스 DB 폴백용.
 */
@SkipThrottle()
@Controller('bot-api/role-panel')
@UseGuards(BotApiAuthGuard)
export class BotRolePanelController {
  constructor(private readonly botService: RolePanelBotService) {}

  /**
   * GET /bot-api/role-panel/config?guildId=
   * 길드 패널 설정 목록 (버튼 클릭 처리 최소 데이터).
   */
  @Get('config')
  async getConfig(
    @Query('guildId') guildId: string,
  ): Promise<{ ok: boolean; data: BotRolePanelConfigDto[] }> {
    const data = await this.botService.getConfigForBot(guildId);
    return { ok: true, data };
  }
}
