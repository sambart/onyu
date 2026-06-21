import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';

import { getErrorStack } from '../../common/util/error.util';
import { StickyMessageSaveDto } from '../dto/sticky-message-save.dto';
import { StickyMessageConfigOrm } from '../infrastructure/sticky-message-config.orm-entity';
import { StickyMessageConfigRepository } from '../infrastructure/sticky-message-config.repository';
import { StickyMessageDiscordAdapter } from '../infrastructure/sticky-message-discord.adapter';
import { StickyMessageRedisRepository } from '../infrastructure/sticky-message-redis.repository';
import { STICKY_FOOTER_MARKER } from '../sticky-message.constants';

@Injectable()
export class StickyMessageConfigService {
  private readonly logger = new Logger(StickyMessageConfigService.name);

  constructor(
    private readonly configRepo: StickyMessageConfigRepository,
    private readonly redisRepo: StickyMessageRedisRepository,
    private readonly discordAdapter: StickyMessageDiscordAdapter,
  ) {}

  /**
   * 설정 목록 조회 (F-STICKY-001).
   * Redis 캐시 우선, 미스 시 DB 조회 후 캐시 저장.
   */
  async getConfigs(guildId: string): Promise<StickyMessageConfigOrm[]> {
    const cached = await this.redisRepo.getConfig(guildId);
    if (cached) return cached;

    const configs = await this.configRepo.findByGuildId(guildId);
    if (configs.length > 0) {
      await this.redisRepo.setConfig(guildId, configs);
    }
    return configs;
  }

  /**
   * 설정 저장 (F-STICKY-002).
   * 처리 순서:
   *   1. DB save (id 기준 upsert)
   *   2. Redis 설정 캐시 갱신
   *   3. enabled = true이면 기존 메시지 삭제 후 신규 Embed 전송 및 messageId 갱신
   */
  async saveConfig(guildId: string, dto: StickyMessageSaveDto): Promise<StickyMessageConfigOrm> {
    // 1. DB save
    const config = await this.configRepo.save(guildId, dto);

    // 2. Redis 캐시 갱신 (최신 전체 목록 재조회)
    const allConfigs = await this.configRepo.findByGuildId(guildId);
    await this.redisRepo.setConfig(guildId, allConfigs);

    // 3. enabled = true이면 Discord 메시지 처리
    if (config.enabled) {
      if (config.messageId) {
        await this.tryDeleteMessage(config.channelId, config.messageId);
      }

      try {
        const appliedAt = await this.sendAndStamp(guildId, config);
        config.lastAppliedAt = appliedAt;
      } catch (err) {
        this.logger.error(
          `[STICKY_MESSAGE] Failed to send embed: guild=${guildId} channel=${config.channelId}`,
          getErrorStack(err),
        );
        throw err;
      }
    }

    return config;
  }

  /**
   * 다시 반영 (F-STICKY-RE-APPLY).
   * 설정 변경 없이 현재 저장된 설정을 Discord 에 재게시하고 lastAppliedAt 을 갱신한다.
   */
  async reApply(guildId: string, id: number): Promise<StickyMessageConfigOrm> {
    const config = await this.configRepo.findById(id);
    if (!config) {
      throw new NotFoundException(`StickyMessageConfig id=${id} not found`);
    }

    if (!config.enabled) {
      throw new BadRequestException(
        `StickyMessageConfig id=${id} is disabled. Enable it before re-applying.`,
      );
    }

    if (config.messageId) {
      await this.tryDeleteMessage(config.channelId, config.messageId);
    }

    try {
      const appliedAt = await this.sendAndStamp(guildId, config);
      config.lastAppliedAt = appliedAt;
    } catch (err) {
      this.logger.error(
        `[STICKY_MESSAGE] Failed to re-apply embed: guild=${guildId} id=${id}`,
        getErrorStack(err),
      );
      throw err;
    }

    return config;
  }

  /**
   * 설정 삭제 (F-STICKY-003).
   * 처리 순서:
   *   1. 단건 조회 (messageId, channelId 확인)
   *   2. messageId 존재 시 Discord 메시지 삭제 시도
   *   3. DB 삭제
   *   4. Redis 캐시 무효화
   */
  async deleteConfig(guildId: string, id: number): Promise<void> {
    const config = await this.configRepo.findById(id);

    if (config?.messageId) {
      await this.tryDeleteMessage(config.channelId, config.messageId);
    }

    await this.configRepo.delete(id);
    await this.redisRepo.deleteConfig(guildId);
  }

  /**
   * 채널 내 고정메세지 전체 삭제 (F-STICKY-007).
   * 처리 순서:
   *   1. guildId + channelId로 전체 설정 목록 조회 (enabled 무관)
   *   2. 각 설정의 Discord 메시지 삭제 시도 (실패 시 계속)
   *   3. DB에서 채널 전체 삭제
   *   4. Redis 캐시 무효화
   */
  async deleteByChannel(guildId: string, channelId: string): Promise<{ deletedCount: number }> {
    const allConfigs = await this.configRepo.findByGuildId(guildId);
    const channelConfigs = allConfigs.filter((c) => c.channelId === channelId);

    for (const config of channelConfigs) {
      if (config.messageId) {
        await this.tryDeleteMessage(config.channelId, config.messageId);
      }
    }

    await this.configRepo.deleteByGuildAndChannel(guildId, channelId);
    await this.redisRepo.deleteConfig(guildId);

    return { deletedCount: channelConfigs.length };
  }

  /**
   * Embed 전송 → messageId + lastAppliedAt DB 갱신 → Redis 캐시 재갱신 (§1-4 (A)).
   * 전송 성공 시 appliedAt 을 반환한다.
   */
  private async sendAndStamp(guildId: string, config: StickyMessageConfigOrm): Promise<Date> {
    const newMessageId = await this.sendEmbed(config.channelId, config);
    const appliedAt = new Date();
    await this.configRepo.updateMessageIdAndStamp(config.id, newMessageId, appliedAt);
    config.messageId = newMessageId;
    // §1-4 (A): stamp 후 캐시 재갱신 — stale lastAppliedAt 방지
    const refreshed = await this.configRepo.findByGuildId(guildId);
    await this.redisRepo.setConfig(guildId, refreshed);
    return appliedAt;
  }

  /** Discord 텍스트 채널에 Embed 메시지 전송. 전송된 메시지 ID 반환. */
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

  /** Discord 메시지 삭제 시도. 실패 시 warn 로그 후 무시. */
  private async tryDeleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.discordAdapter.deleteMessage(channelId, messageId);
  }
}
