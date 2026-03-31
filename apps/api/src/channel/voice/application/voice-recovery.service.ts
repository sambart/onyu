import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { getErrorStack } from '../../../common/util/error.util';
import { RedisService } from '../../../redis/redis.service';
import { VoiceRedisRepository } from '../infrastructure/voice-redis.repository';
import { VoiceStateDto } from '../infrastructure/voice-state.dto';
import { VoiceChannelService } from './voice-channel.service';
import { VoiceChannelHistoryService } from './voice-channel-history.service';
import { VoiceDailyFlushService } from './voice-daily-flush-service';
import { VoiceExcludedChannelService } from './voice-excluded-channel.service';

@Injectable()
export class VoiceRecoveryService implements OnApplicationShutdown, OnApplicationBootstrap {
  private readonly logger = new Logger(VoiceRecoveryService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly voiceRedisRepository: VoiceRedisRepository,
    private readonly flushService: VoiceDailyFlushService,
    private readonly historyService: VoiceChannelHistoryService,
    private readonly voiceChannelService: VoiceChannelService,
    private readonly excludedChannelService: VoiceExcludedChannelService,
  ) {}

  /** 2단계 — 부팅 시 고아 세션 복구 (F-VOICE-023) */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('App bootstrap -- recovering orphan sessions...');

    // 고아 history 레코드 일괄 종료 (크래시 복구)
    await this.historyService.closeOrphanRecords();

    // Redis orphan 세션 flush
    await this.recoverOrphanSessions();

    this.logger.log('Session recovery complete.');
  }

  /** 1단계 — 정상 종료 시 세션 flush (F-VOICE-023) */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Shutting down -- flushing all active voice sessions...');

    await this.flushAllActiveSessions();
    await this.historyService.closeOrphanRecords();

    this.logger.log('All voice sessions flushed.');
  }

  /**
   * 3단계 — Discord ready 후 음성 상태 동기화 (F-VOICE-023).
   * Bot의 clientReady 이벤트에서 수집한 음성 채널 사용자 목록을 받아
   * 각 유저에 대해 세션을 생성한다.
   */
  async syncVoiceStates(guildId: string, users: Array<Record<string, unknown>>): Promise<number> {
    let synced = 0;

    for (const user of users) {
      try {
        const channelId = user.channelId as string;

        const parentCategoryId = (user.parentCategoryId as string | null) ?? null;
        const isExcluded = await this.excludedChannelService.isExcludedChannel(
          guildId,
          channelId,
          parentCategoryId,
        );
        if (isExcluded) continue;

        // 이미 세션이 있으면 스킵 (중복 방지)
        const existingSession = await this.voiceRedisRepository.getSession(
          guildId,
          user.userId as string,
        );
        if (existingSession) continue;

        const cmd = new VoiceStateDto(
          guildId,
          user.userId as string,
          channelId,
          (user.userName as string) ?? '',
          (user.channelName as string) ?? '',
          (user.parentCategoryId as string | null) ?? null,
          (user.categoryName as string | null) ?? null,
          (user.micOn as boolean) ?? true,
          users.filter((u) => u.channelId === channelId).length === 1,
          users.filter((u) => u.channelId === channelId).length,
          (user.avatarUrl as string | null) ?? null,
          (user.streaming as boolean) ?? false,
          (user.selfVideo as boolean) ?? false,
          (user.selfDeaf as boolean) ?? false,
        );

        await this.voiceChannelService.onUserJoined(cmd);
        synced++;
      } catch (err) {
        this.logger.error(
          `[VOICE-SYNC] Failed to sync user=${user.userId} in guild=${guildId}`,
          getErrorStack(err),
        );
      }
    }

    this.logger.log(`[VOICE-SYNC] guild=${guildId}: synced ${synced}/${users.length} user(s)`);
    return synced;
  }

  /** 서버 재시작 시 Redis에 남아있는 orphan 세션을 flush 처리 */
  private async recoverOrphanSessions(): Promise<void> {
    const sessionKeys = await this.redis.scanKeys('voice:session:*');

    if (sessionKeys.length === 0) {
      this.logger.log('No orphan voice sessions found.');
      return;
    }

    this.logger.warn(`Found ${sessionKeys.length} orphan voice session(s). Recovering...`);

    const now = Date.now();

    for (const key of sessionKeys) {
      try {
        const parts = key.split(':');
        const guildId = parts[2];
        const userId = parts[3];

        const session = await this.voiceRedisRepository.getSession(guildId, userId);
        if (!session) continue;

        // 남은 시간 누적
        await this.voiceRedisRepository.accumulateDuration(guildId, userId, session, now);

        // DB로 flush
        await this.flushService.flushDate(guildId, userId, session.date);

        // 세션 제거
        await this.voiceRedisRepository.deleteSession(guildId, userId);

        this.logger.log(`Recovered orphan session: guild=${guildId} user=${userId}`);
      } catch (error) {
        this.logger.error(`Failed to recover session from key=${key}`, getErrorStack(error));
      }
    }
  }

  /** 정상 종료 시 모든 활성 세션의 현재까지 누적분 flush */
  private async flushAllActiveSessions(): Promise<void> {
    const sessionKeys = await this.redis.scanKeys('voice:session:*');
    const now = Date.now();

    for (const key of sessionKeys) {
      try {
        const parts = key.split(':');
        const guildId = parts[2];
        const userId = parts[3];

        const session = await this.voiceRedisRepository.getSession(guildId, userId);
        if (!session) continue;

        await this.voiceRedisRepository.accumulateDuration(guildId, userId, session, now);
        await this.flushService.flushDate(guildId, userId, session.date);
      } catch (error) {
        this.logger.error(`Failed to flush session from key=${key}`, getErrorStack(error));
      }
    }
  }
}
