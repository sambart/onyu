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
    let heartbeatRefreshed = 0;

    try {
      // (1) 재시도 큐 처리
      const pendingIds = await this.autoChannelRedis.listPendingDeletes();
      for (const channelId of pendingIds) {
        const result = await this.retryDelete(channelId);
        if (result === 'cleaned') retryCleaned++;
        else retryFailed++;
      }

      // (2) confirmed 키 전수 스캔으로 Redis 고아 정리 + 살아있는 채널 TTL heartbeat
      const confirmedIds = await this.autoChannelRedis.scanConfirmedChannelIds();
      for (const channelId of confirmedIds) {
        const result = await this.cleanupOrphan(channelId);
        if (result === 'cleaned') orphanCleaned++;
        else if (result === 'refreshed') heartbeatRefreshed++;
      }
    } catch (error) {
      this.logger.error(`[AUTO CHANNEL SWEEP] failed`, getErrorStack(error));
    }

    const elapsed = Date.now() - startedAt;
    this.logger.log(
      `[AUTO CHANNEL SWEEP] done in ${elapsed}ms — retried=${retryCleaned + retryFailed} ` +
        `(cleaned=${retryCleaned}, failed=${retryFailed}), orphans cleaned=${orphanCleaned}, ` +
        `heartbeat refreshed=${heartbeatRefreshed}`,
    );
  }

  /**
   * pending 큐의 항목 처리.
   *   - 'gone'    : 확실히 없음 → Redis/큐 정리 → 'cleaned'
   *   - 'exists'  : 채널 존재 → delete 재시도; 성공 시 'cleaned', 실패 시 'failed'
   *   - 'unknown' : 일시 오류 → 큐 유지 → 'failed' (다음 sweep 재시도)
   *
   * Why 'unknown'에서 정리 안 함: 일시 오류(429/5xx)를 "채널 없음"으로 오판하면
   * 살아있는 채널의 Redis state가 사라져 handleChannelEmpty가 일반 채널로 취급한다.
   */
  private async retryDelete(channelId: string): Promise<'cleaned' | 'failed'> {
    const probe = await this.discordRest.probeChannel(channelId);

    if (probe === 'gone') {
      // 이미 삭제됨 — Redis만 정리
      await this.autoChannelRedis.deleteConfirmedState(channelId).catch(() => {});
      await this.autoChannelRedis.unmarkPendingDelete(channelId).catch(() => {});
      return 'cleaned';
    }

    if (probe === 'unknown') {
      // 일시 오류 — 상태 보존, 다음 sweep 재시도
      return 'failed';
    }

    // probe === 'exists': 채널 존재 → delete 재시도
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
   * 살아있는 채널은 TTL heartbeat를 갱신하고 손대지 않는다.
   * 일시 오류 시에는 절대 상태를 삭제하지 않는다.
   *
   * Why heartbeat: 확정방 TTL이 만료되면 handleChannelEmpty가 상태를 못 찾아 채널을 누수한다.
   * sweep 주기(5분)마다 TTL을 7일로 리셋해 점유 기간과 무관하게 만료를 방지한다.
   */
  private async cleanupOrphan(channelId: string): Promise<'cleaned' | 'refreshed' | 'skipped'> {
    const probe = await this.discordRest.probeChannel(channelId);

    if (probe === 'exists') {
      // 살아있는 채널 — TTL heartbeat 갱신 후 손대지 않음
      await this.autoChannelRedis.refreshConfirmedTtl(channelId).catch(() => {});
      return 'refreshed';
    }

    if (probe === 'unknown') {
      // 일시 오류 — 상태 보존
      return 'skipped';
    }

    // probe === 'gone': 고아 확정 → Redis state/큐 정리
    await this.autoChannelRedis.deleteConfirmedState(channelId).catch(() => {});
    await this.autoChannelRedis.unmarkPendingDelete(channelId).catch(() => {});
    return 'cleaned';
  }
}
