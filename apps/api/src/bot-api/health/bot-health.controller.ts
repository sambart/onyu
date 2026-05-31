import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { BotApiAuthGuard } from '../bot-api-auth.guard';

@SkipThrottle()
@Controller('bot-api/health')
@UseGuards(BotApiAuthGuard)
export class BotHealthController {
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
