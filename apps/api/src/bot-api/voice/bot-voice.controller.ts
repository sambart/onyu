import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { VoiceDailyFlushService } from '../../channel/voice/application/voice-daily-flush-service';
import { VoiceKeys } from '../../channel/voice/infrastructure/voice-cache.keys';
import { RedisService } from '../../redis/redis.service';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

/** 봇이 전송하는 길드별 음성 접속자 수 페이로드 */
interface GuildVoiceUserCountDto {
  guildId: string;
  count: number;
}

/** voice:user-count:{guildId} 키의 TTL (초) */
const VOICE_USER_COUNT_TTL = 120;

/**
 * Bot → API 음성 이벤트 수신 엔드포인트.
 * Bot의 voiceStateUpdate 이벤트를 HTTP로 수신하여 BotVoiceEventListener로 분배한다.
 */
@Controller('bot-api/voice')
@UseGuards(BotApiAuthGuard)
export class BotVoiceController {
  private readonly logger = new Logger(BotVoiceController.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly flushService: VoiceDailyFlushService,
    private readonly redis: RedisService,
  ) {}

  @Post('state-update')
  @HttpCode(HttpStatus.OK)
  async handleVoiceStateUpdate(@Body() dto: Record<string, unknown>): Promise<{ ok: boolean }> {
    this.logger.debug(
      `[BOT-API] voice/${dto.eventType}: guild=${dto.guildId} user=${dto.userId} channel=${dto.channelId}`,
    );

    // 단일 이벤트명으로 통합 — BotVoiceEventListener가 수신
    await this.eventEmitter.emitAsync('bot-api.voice.state-update', dto);

    return { ok: true };
  }

  @Post('flush')
  @HttpCode(HttpStatus.OK)
  async handleVoiceFlush(): Promise<{ ok: boolean; flushed: number; skipped: number }> {
    const result = await this.flushService.safeFlushAll();
    return { ok: true, flushed: result.flushed, skipped: result.skipped };
  }

  @Post('user-count')
  @HttpCode(HttpStatus.OK)
  async handleVoiceUserCount(
    @Body() body: { counts: GuildVoiceUserCountDto[] },
  ): Promise<{ ok: boolean }> {
    for (const { guildId, count } of body.counts) {
      await this.redis.set(VoiceKeys.userCount(guildId), count, VOICE_USER_COUNT_TTL);
    }

    this.logger.debug(`[BOT-API] voice/user-count: ${body.counts.length} guild(s) updated`);

    return { ok: true };
  }
}
