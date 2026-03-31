import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

import { VoiceGameService } from '../application/voice-game.service';
import { CoPresenceService } from './co-presence.service';

/**
 * CoPresence 세션 관리 스케줄러.
 * tick 로직은 Bot 프로세스로 이관됨 (BotCoPresenceScheduler).
 * API에서는 길드 세션 flush와 종료 시 세션 정리만 담당한다.
 */
@Injectable()
export class CoPresenceScheduler implements OnApplicationShutdown {
  private readonly logger = new Logger(CoPresenceScheduler.name);

  constructor(
    private readonly coPresenceService: CoPresenceService,
    private readonly voiceGameService: VoiceGameService,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.coPresenceService.endAllSessions();
      await this.voiceGameService.endAllSessions();
      this.logger.log('[CO-PRESENCE SCHEDULER] Stopped (all sessions ended)');
    } catch (error) {
      this.logger.error(
        '[CO-PRESENCE SCHEDULER] Failed to end sessions during shutdown',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * 특정 길드의 모든 활성 세션을 강제 종료한다.
   * MocoResetScheduler가 Redis 키 삭제 전에 호출하여 데이터 정합성을 보장한다.
   */
  async flushGuildSessions(guildId: string): Promise<void> {
    await this.coPresenceService.endAllGuildSessions(guildId);
  }
}
