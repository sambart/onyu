import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { BotGuildMetric, BotStatusPayload } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { Client, Status } from 'discord.js';

/** 폴링 주기 (밀리초) */
const INTERVAL_MS = 60_000;

/**
 * Discord Gateway 메트릭을 주기적으로 수집하여 API로 전송한다.
 * 60초마다 봇 상태, 길드별 메트릭을 API에 push한다.
 */
@Injectable()
export class BotMonitoringScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotMonitoringScheduler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  onApplicationBootstrap(): void {
    this.intervalId = setInterval(() => void this.tick(), INTERVAL_MS);
    this.logger.log('[MONITORING] Scheduler started (interval=60s)');
  }

  onApplicationShutdown(): void {
    this.isShuttingDown = true;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.log('[MONITORING] Scheduler stopped');
  }

  private async tick(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      const isOnline = this.client.ws.status === Status.Ready;
      const mem = process.memoryUsage();
      const heapUsedMb = parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1));
      const heapTotalMb = parseFloat((mem.heapTotal / 1024 / 1024).toFixed(1));
      const pingMs = this.client.ws.ping;
      const guildCount = this.client.guilds.cache.size;

      // 전체 음성 사용자 수 (봇 제외)
      let totalVoiceUserCount = 0;

      // 길드별 메트릭 수집
      const metrics: BotGuildMetric[] = [];

      for (const guild of this.client.guilds.cache.values()) {
        const voiceUserCount = guild.voiceStates.cache.filter(
          (vs) => vs.channelId !== null && !vs.member?.user.bot,
        ).size;

        totalVoiceUserCount += voiceUserCount;

        metrics.push({
          guildId: guild.id,
          status: isOnline ? 'ONLINE' : 'OFFLINE',
          pingMs,
          heapUsedMb,
          heapTotalMb,
          voiceUserCount,
          guildCount,
        });
      }

      // 메트릭 전송
      if (metrics.length > 0) {
        await this.apiClient.pushBotMetrics(metrics);
      }

      // 봇 상태 전송
      const status: BotStatusPayload = {
        online: isOnline,
        uptimeMs: this.client.uptime ?? 0,
        startedAt: this.client.readyAt?.toISOString() ?? null,
        pingMs,
        guildCount,
        memoryUsage: { heapUsedMb, heapTotalMb },
        voiceUserCount: totalVoiceUserCount,
      };

      await this.apiClient.pushBotStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.stack : String(err);
      this.logger.error('[MONITORING] Tick failed', message);
    }
  }
}
