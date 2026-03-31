import { Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';

import { getErrorMessage, getErrorStack } from '../../common/util/error.util';
import { StickyMessageConfigRepository } from '../infrastructure/sticky-message-config.repository';
import { StickyMessageDiscordAdapter } from '../infrastructure/sticky-message-discord.adapter';
import { STICKY_FOOTER_MARKER } from '../sticky-message.constants';

@Injectable()
export class StickyMessageRefreshService {
  private readonly logger = new Logger(StickyMessageRefreshService.name);

  /** 채널별 잠금 — 동시 refresh 방지 (값: 잠금 시작 타임스탬프) */
  private readonly refreshing = new Map<string, number>();
  /** 잠금 타임아웃 (ms): 10초 — 이 시간이 지나면 stale 잠금으로 간주하여 강제 해제 */
  private static readonly REFRESH_LOCK_TIMEOUT_MS = 10_000;

  /** 해당 채널에서 고정메세지 재전송이 진행 중인지 확인 (무한루프 방지) */
  isRefreshing(channelId: string): boolean {
    const lockedAt = this.refreshing.get(channelId);
    if (lockedAt === undefined) return false;
    return Date.now() - lockedAt < StickyMessageRefreshService.REFRESH_LOCK_TIMEOUT_MS;
  }

  constructor(
    private readonly configRepo: StickyMessageConfigRepository,
    private readonly discordAdapter: StickyMessageDiscordAdapter,
  ) {}

  /**
   * 채널의 고정메세지 재전송 (F-STICKY-004 디바운스 만료 후 호출).
   * 처리 순서:
   *   1. 채널 잠금 확인 (이미 진행 중이면 스킵)
   *   2. enabled=true 설정 목록 조회 (sortOrder ASC)
   *   3. 고아 메세지 정리 (스티키 footer 마커가 있지만 DB에 추적되지 않는 메시지 삭제)
   *   4. 각 설정에 대해: 기존 메시지 삭제 → 신규 Embed 전송 → messageId 갱신
   */
  async refresh(guildId: string, channelId: string): Promise<void> {
    const lockedAt = this.refreshing.get(channelId);
    if (lockedAt !== undefined) {
      if (Date.now() - lockedAt < StickyMessageRefreshService.REFRESH_LOCK_TIMEOUT_MS) {
        this.logger.warn(
          `[STICKY_MESSAGE] refresh skipped (already in progress): guild=${guildId} channel=${channelId}`,
        );
        return;
      }
      this.logger.warn(
        `[STICKY_MESSAGE] stale lock released (>${StickyMessageRefreshService.REFRESH_LOCK_TIMEOUT_MS}ms): channel=${channelId}`,
      );
    }

    this.refreshing.set(channelId, Date.now());
    try {
      await this.doRefresh(guildId, channelId);
    } finally {
      this.refreshing.delete(channelId);
    }
  }

  private async doRefresh(guildId: string, channelId: string): Promise<void> {
    const configs = await this.configRepo.findByGuildAndChannel(guildId, channelId);
    if (configs.length === 0) return;

    // 고아 메세지 정리: 스티키 footer 마커가 있지만 DB에 추적되지 않는 메시지 삭제
    const trackedIds = new Set(configs.map((c) => c.messageId).filter(Boolean));
    await this.cleanupOrphanedMessages(channelId, trackedIds as Set<string>);

    for (const config of configs) {
      if (config.messageId) {
        await this.tryDeleteMessage(config.channelId, config.messageId);
      }

      try {
        const newMessageId = await this.sendEmbed(config.channelId, config);
        await this.configRepo.updateMessageId(config.id, newMessageId);
      } catch (err) {
        const errMsg = getErrorMessage(err);
        const isForbidden =
          errMsg.includes('403') ||
          errMsg.includes('Missing Permissions') ||
          errMsg.includes('Missing Access');
        this.logger.error(
          `[STICKY_MESSAGE] refresh: Failed to send embed: guild=${guildId} channel=${channelId} config=${config.id}${isForbidden ? ' (permission denied)' : ''}`,
          getErrorStack(err),
        );
      }
    }
  }

  /** Discord 텍스트 채널에 Embed 메시지 전송. 스티키 식별용 footer를 포함한다. */
  private async sendEmbed(
    channelId: string,
    config: {
      embedTitle: string | null;
      embedDescription: string | null;
      embedColor: string | null;
    },
  ): Promise<string> {
    const embed = new EmbedBuilder();
    if (config.embedTitle) embed.setTitle(config.embedTitle);
    if (config.embedDescription) embed.setDescription(config.embedDescription);
    if (config.embedColor) embed.setColor(config.embedColor as `#${string}`);
    embed.setFooter({ text: STICKY_FOOTER_MARKER });

    return this.discordAdapter.sendMessage(channelId, { embeds: [embed.toJSON()] });
  }

  /**
   * 고아 메세지 정리: 채널 최근 메세지에서 스티키 footer 마커를 가진 봇 메시지 중
   * DB에 추적되지 않는 것을 삭제한다. 다른 시스템(미션, 모코코 등)의 Embed는
   * footer 마커가 다르므로 영향받지 않는다.
   */
  private async cleanupOrphanedMessages(channelId: string, trackedIds: Set<string>): Promise<void> {
    try {
      const messages = await this.discordAdapter.fetchMessages(channelId, 30);
      if (!messages) return;

      const botId = this.discordAdapter.getBotUserId();
      if (!botId) return;

      const orphaned = messages.filter(
        (msg) =>
          msg.author.id === botId &&
          msg.embeds.length > 0 &&
          msg.embeds.some((e) => e.footer?.text === STICKY_FOOTER_MARKER) &&
          !trackedIds.has(msg.id),
      );

      for (const msg of orphaned) {
        try {
          await this.discordAdapter.deleteMessage(channelId, msg.id);
        } catch (err) {
          this.logger.warn(
            `[STICKY_MESSAGE] Failed to delete orphaned message ${msg.id}: ${getErrorMessage(err)}`,
          );
        }
      }

      if (orphaned.length > 0) {
        this.logger.log(
          `[STICKY_MESSAGE] Cleaned up ${orphaned.length} orphaned message(s) in channel=${channelId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[STICKY_MESSAGE] cleanupOrphanedMessages failed: channel=${channelId}: ${getErrorMessage(err)}`,
      );
    }
  }

  /** Discord 메시지 삭제 시도. 실패 시 warn 로그 후 무시. */
  private async tryDeleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.discordAdapter.deleteMessage(channelId, messageId);
  }
}
