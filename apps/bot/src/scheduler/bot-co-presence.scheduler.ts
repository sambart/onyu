import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { CoPresenceMemberActivity, CoPresenceSnapshot } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { ActivityType, ChannelType, Client } from 'discord.js';

/** 폴링 주기 (밀리초) */
const INTERVAL_MS = 60_000;

/**
 * 음성 채널 동시접속 스냅샷을 주기적으로 수집하여 API로 전송한다.
 * 60초마다 Discord Gateway 캐시에서 음성 채널 멤버를 조회한다.
 */
@Injectable()
export class BotCoPresenceScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotCoPresenceScheduler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  onApplicationBootstrap(): void {
    this.intervalId = setInterval(() => void this.tick(), INTERVAL_MS);
    this.logger.log('[CO-PRESENCE] Scheduler started (interval=60s)');
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 종료 시 API에 flush 요청하여 모든 활성 세션 종료
    try {
      await this.apiClient.pushCoPresenceFlush();
      this.logger.log('[CO-PRESENCE] Flush completed on shutdown');
    } catch (err) {
      const message = err instanceof Error ? err.stack : String(err);
      this.logger.error('[CO-PRESENCE] Flush failed on shutdown', message);
    }
  }

  private async tick(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      const snapshots = this.collectSnapshots();

      await this.apiClient.pushCoPresenceSnapshots(snapshots);
    } catch (err) {
      const message = err instanceof Error ? err.stack : String(err);
      this.logger.error('[CO-PRESENCE] Tick failed', message);
    }
  }

  /** Discord Gateway 캐시에서 음성 채널 멤버 스냅샷을 수집한다. */
  private collectSnapshots(): CoPresenceSnapshot[] {
    const snapshots: CoPresenceSnapshot[] = [];

    for (const guild of this.client.guilds.cache.values()) {
      const voiceChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice,
      );

      for (const channel of voiceChannels.values()) {
        if (channel.type !== ChannelType.GuildVoice) continue;

        const nonBotMembers = channel.members.filter((m) => !m.user.bot);
        if (nonBotMembers.size === 0) continue;

        // Phase 2: 멤버별 게임 활동 수집
        const memberActivities: CoPresenceMemberActivity[] = nonBotMembers.map((m) => {
          const playing = m.presence?.activities?.find(
            (a) => a.type === ActivityType.Playing,
          );
          return {
            userId: m.id,
            gameName: playing?.name ?? null,
            applicationId: playing?.applicationId ?? null,
          };
        });

        snapshots.push({
          guildId: guild.id,
          channelId: channel.id,
          userIds: nonBotMembers.map((m) => m.id),
          memberActivities,
        });
      }
    }

    return snapshots;
  }
}
