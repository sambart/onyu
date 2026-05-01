import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { getErrorStack } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { DiscordVoiceGateway } from '../../voice/infrastructure/discord-voice.gateway';
import { AutoChannelRedisRepository } from '../infrastructure/auto-channel-redis.repository';

/**
 * F-VOICE-012 백스톱:
 *
 * 1) `auto_channel:pending_delete` 큐 — Discord delete가 일시 실패한 채널 ID들. 주기적으로 재시도.
 *    - 사용자가 다시 채널에 입장하면 join 핸들러가 큐에서 제거하므로 활성 사용자 강퇴 위험은 차단됨.
 *    - 채널이 이미 사라진 경우(404)는 Redis 키만 정리.
 *
 * 2) `auto_channel:confirmed:*` 전수 스캔 — Discord 측에서는 채널이 사라졌는데
 *    Redis 키만 남은 고아 상태(다른 봇/관리자 수동 삭제, 과거 미정리분 등)를 정리.
 *
 * 너무 잦은 호출은 REST 부담이 되므로 5분 주기로 제한한다.
 */
@Injectable()
export class AutoChannelSweepScheduler {
  private readonly logger = new Logger(AutoChannelSweepScheduler.name);

  constructor(
    private readonly autoChannelRedis: AutoChannelRedisRepository,
    private readonly discordRest: DiscordRestService,
    private readonly discordVoiceGateway: DiscordVoiceGateway,
  ) {}

  @Cron('*/5 * * * *', { name: 'auto-channel-sweep' })
  async sweep(): Promise<void> {
    const startedAt = Date.now();
    let retryCleaned = 0;
    let retryFailed = 0;
    let orphanCleaned = 0;

    try {
      // (1) 재시도 큐 처리
      const pendingIds = await this.autoChannelRedis.listPendingDeletes();
      for (const channelId of pendingIds) {
        const result = await this.retryDelete(channelId);
        if (result === 'cleaned') retryCleaned++;
        else retryFailed++;
      }

      // (2) confirmed 키 전수 스캔으로 Redis 고아 정리
      const confirmedIds = await this.autoChannelRedis.scanConfirmedChannelIds();
      for (const channelId of confirmedIds) {
        const cleaned = await this.cleanupOrphan(channelId);
        if (cleaned) orphanCleaned++;
      }
    } catch (error) {
      this.logger.error(`[AUTO CHANNEL SWEEP] failed`, getErrorStack(error));
    }

    const elapsed = Date.now() - startedAt;
    this.logger.log(
      `[AUTO CHANNEL SWEEP] done in ${elapsed}ms — retried=${retryCleaned + retryFailed} ` +
        `(cleaned=${retryCleaned}, failed=${retryFailed}), orphans cleaned=${orphanCleaned}`,
    );
  }

  /**
   * pending 큐의 항목 처리:
   *   - Discord에 채널 없음(404) → Redis 정리, 큐 제거
   *   - Discord에 존재 → delete 재시도; 성공 시 Redis/큐 정리, 실패 시 큐 잔류
   */
  private async retryDelete(channelId: string): Promise<'cleaned' | 'failed'> {
    const channel = await this.discordRest.fetchChannel(channelId);
    if (channel === null) {
      // 이미 삭제됐거나 존재하지 않음 — Redis만 정리
      await this.autoChannelRedis.deleteConfirmedState(channelId).catch(() => {});
      await this.autoChannelRedis.unmarkPendingDelete(channelId).catch(() => {});
      return 'cleaned';
    }

    try {
      await this.discordVoiceGateway.deleteChannel(channelId);
      await this.autoChannelRedis.deleteConfirmedState(channelId);
      await this.autoChannelRedis.unmarkPendingDelete(channelId);
      this.logger.log(`[AUTO CHANNEL SWEEP] retry succeeded: channel=${channelId}`);
      return 'cleaned';
    } catch (error) {
      this.logger.warn(
        `[AUTO CHANNEL SWEEP] retry failed: channel=${channelId} — ${getErrorStack(error)}`,
      );
      return 'failed';
    }
  }

  /**
   * Redis에 confirmed 키가 있지만 Discord에 채널이 존재하지 않는 고아를 정리한다.
   * 채널이 살아있으면 손대지 않는다 (활성 사용자 보호).
   */
  private async cleanupOrphan(channelId: string): Promise<boolean> {
    const channel = await this.discordRest.fetchChannel(channelId);
    if (channel !== null) return false;

    await this.autoChannelRedis.deleteConfirmedState(channelId).catch(() => {});
    await this.autoChannelRedis.unmarkPendingDelete(channelId).catch(() => {});
    return true;
  }
}
