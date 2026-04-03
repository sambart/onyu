import { Controller, Get, UseGuards } from '@nestjs/common';

import { BotApiAuthGuard } from '../bot-api-auth.guard';

@Controller('bot-api/health')
@UseGuards(BotApiAuthGuard)
export class BotHealthController {
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
