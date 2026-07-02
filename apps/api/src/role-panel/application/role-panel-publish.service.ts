import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  buildRolePanelCustomId,
  ROLE_PANEL_BUTTONS_PER_ROW,
  ROLE_PANEL_MAX_BUTTONS,
  RolePanelButtonStyle,
} from '@onyu/shared';
import {
  ActionRowBuilder,
  type APIMessage,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  EmbedBuilder,
  type RESTPostAPIChannelMessageJSONBody,
} from 'discord.js';

import { getErrorMessage, getErrorStack } from '../../common/util/error.util';
import type { RolePanelButtonOrm } from '../infrastructure/role-panel-button.orm-entity';
import type { RolePanelConfigOrm } from '../infrastructure/role-panel-config.orm-entity';
import { RolePanelConfigRepository } from '../infrastructure/role-panel-config.repository';
import { RolePanelDiscordAdapter } from '../infrastructure/role-panel-discord.adapter';
import { RolePanelRedisRepository } from '../infrastructure/role-panel-redis.repository';

/** Discord Unknown Message 에러 코드 */
const DISCORD_ERR_UNKNOWN_MESSAGE = 10008;

/** 공유 enum 값을 discord.js ButtonStyle로 매핑 */
function mapButtonStyle(style: RolePanelButtonStyle): ButtonStyle {
  switch (style) {
    case RolePanelButtonStyle.PRIMARY:
      return ButtonStyle.Primary;
    case RolePanelButtonStyle.SECONDARY:
      return ButtonStyle.Secondary;
    case RolePanelButtonStyle.SUCCESS:
      return ButtonStyle.Success;
    case RolePanelButtonStyle.DANGER:
      return ButtonStyle.Danger;
  }
}

/**
 * 패널 게시/동기화 서비스.
 * API가 DiscordRestService를 통해 직접 메시지를 전송/수정/삭제한다.
 */
@Injectable()
export class RolePanelPublishService {
  private readonly logger = new Logger(RolePanelPublishService.name);

  constructor(
    private readonly configRepo: RolePanelConfigRepository,
    private readonly discordAdapter: RolePanelDiscordAdapter,
    private readonly redisRepo: RolePanelRedisRepository,
  ) {}

  /**
   * 패널을 Discord 채널에 게시(신규 전송 또는 기존 메시지 편집).
   *
   * 흐름:
   * 1. panelId+guildId로 패널 조회
   * 2. channelId 필수 검증 (없으면 400)
   * 3. 기존 messageId가 있으면 editMessage 시도; Unknown Message면 신규 sendMessage 폴백
   * 4. 신규 messageId·published=true DB 저장
   * 5. Redis 캐시 무효화
   */
  async publish(guildId: string, panelId: number): Promise<RolePanelConfigOrm> {
    const config = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!config) {
      throw new NotFoundException(`RolePanelConfig id=${panelId} not found in guild ${guildId}`);
    }

    if (!config.channelId) {
      throw new BadRequestException('채널을 먼저 선택해야 게시할 수 있습니다');
    }

    const payload = this.buildPayload(config, config.buttons);
    let newMessageId: string;

    if (config.messageId) {
      newMessageId = await this.editOrFallbackSend(config.channelId, config.messageId, payload);
    } else {
      newMessageId = await this.sendToDiscord(config.channelId, payload);
    }

    await this.configRepo.updateMessageId(panelId, newMessageId, true);
    await this.redisRepo.deleteConfig(guildId);

    // 최신 config 재조회
    const updated = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!updated) {
      throw new NotFoundException(`RolePanelConfig id=${panelId} not found after publish`);
    }
    return updated;
  }

  /**
   * 패널 수정 후 이미 게시된 경우 Discord 메시지를 동기화한다.
   * 채널 변경 시: 기존 채널 메시지 삭제 → 새 채널 신규 전송 → messageId 갱신
   * 채널 동일 시: editMessage 시도 → Unknown Message면 신규 sendMessage 폴백
   */
  async resyncOnUpdate({
    guildId,
    panelId,
    oldChannelId,
    oldMessageId,
  }: {
    guildId: string;
    panelId: number;
    oldChannelId: string | null;
    oldMessageId: string | null;
  }): Promise<void> {
    const config = await this.configRepo.findByIdAndGuild(panelId, guildId);
    if (!config?.channelId) return;

    const payload = this.buildPayload(config, config.buttons);
    const isChannelChanged = oldChannelId !== null && config.channelId !== oldChannelId;

    let newMessageId: string;

    if (isChannelChanged) {
      // 기존 채널 메시지 삭제 (실패 무시)
      if (oldChannelId && oldMessageId) {
        await this.discordAdapter.deleteMessage(oldChannelId, oldMessageId);
      }
      // 새 채널에 신규 전송
      newMessageId = await this.sendToDiscord(config.channelId, payload);
    } else {
      // 동일 채널: edit 시도, 실패 시 신규 전송
      newMessageId = config.messageId
        ? await this.editOrFallbackSend(config.channelId, config.messageId, payload)
        : await this.sendToDiscord(config.channelId, payload);
    }

    await this.configRepo.updateMessageId(panelId, newMessageId, true);
    await this.redisRepo.deleteConfig(guildId);
  }

  /**
   * Discord 메시지 페이로드 빌드 (Embed + ActionRow 버튼).
   * 25개 초과 시 BadRequestException.
   */
  buildPayload(
    config: Pick<RolePanelConfigOrm, 'id' | 'embedTitle' | 'embedDescription' | 'embedColor'>,
    buttons: RolePanelButtonOrm[],
  ): RESTPostAPIChannelMessageJSONBody {
    if (buttons.length > ROLE_PANEL_MAX_BUTTONS) {
      throw new BadRequestException(
        `버튼 수(${buttons.length})가 최대값(${ROLE_PANEL_MAX_BUTTONS})을 초과합니다`,
      );
    }

    // 임베드는 제목 또는 설명이 있을 때만 포함한다.
    // 둘 다 비면 빈 임베드({})가 되어 Discord가 거부한다
    // (Invalid Form Body embeds[0].description[BASE_TYPE_REQUIRED]).
    const hasEmbedContent = Boolean(config.embedTitle || config.embedDescription);
    const embed = new EmbedBuilder();
    if (config.embedTitle) embed.setTitle(config.embedTitle);
    if (config.embedDescription) embed.setDescription(config.embedDescription);
    if (config.embedColor) embed.setColor(config.embedColor as `#${string}`);

    // 버튼을 5개씩 ActionRow로 분할
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const sortedButtons = [...buttons].sort((a, b) => a.sortOrder - b.sortOrder);

    for (let i = 0; i < sortedButtons.length; i += ROLE_PANEL_BUTTONS_PER_ROW) {
      const rowButtons = sortedButtons.slice(i, i + ROLE_PANEL_BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>();

      for (const btn of rowButtons) {
        const button = new ButtonBuilder()
          .setCustomId(buildRolePanelCustomId(config.id, btn.id))
          .setLabel(btn.label)
          .setStyle(mapButtonStyle(btn.style));

        if (btn.emoji) {
          button.setEmoji(btn.emoji);
        }

        row.addComponents(button);
      }

      rows.push(row);
    }

    const payload: RESTPostAPIChannelMessageJSONBody = {
      components: rows.map((r) => r.toJSON()),
    };
    if (hasEmbedContent) {
      payload.embeds = [embed.toJSON()];
    }
    return payload;
  }

  /** Discord 채널에 메시지를 전송하고 messageId를 반환한다. Discord 오류를 서비스 에러로 매핑. */
  private async sendToDiscord(
    channelId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
  ): Promise<string> {
    try {
      const message: APIMessage = await this.discordAdapter.sendMessage(channelId, payload);
      return message.id;
    } catch (err) {
      this.logger.error(
        `[ROLE_PANEL] sendMessage failed: channel=${channelId}`,
        getErrorStack(err),
      );
      throw new ServiceUnavailableException(
        `Discord 채널에 메시지를 전송할 수 없습니다: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * 기존 메시지 편집 시도. Unknown Message(10008) 에러 시 신규 전송으로 폴백.
   * 그 외 Discord 오류는 ServiceUnavailableException으로 매핑.
   */
  private async editOrFallbackSend(
    channelId: string,
    messageId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
  ): Promise<string> {
    try {
      await this.discordAdapter.editMessage(channelId, messageId, payload);
      return messageId;
    } catch (err) {
      if (err instanceof DiscordAPIError && err.code === DISCORD_ERR_UNKNOWN_MESSAGE) {
        this.logger.warn(
          `[ROLE_PANEL] Unknown Message ${messageId} in channel ${channelId}, falling back to sendMessage`,
        );
        return this.sendToDiscord(channelId, payload);
      }

      this.logger.error(
        `[ROLE_PANEL] editMessage failed: channel=${channelId} message=${messageId}`,
        getErrorStack(err),
      );
      throw new ServiceUnavailableException(
        `Discord 메시지를 수정할 수 없습니다: ${getErrorMessage(err)}`,
      );
    }
  }
}
