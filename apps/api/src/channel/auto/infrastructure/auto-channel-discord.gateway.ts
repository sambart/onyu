import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';

import { getErrorMessage } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';

/** 안내 메시지 전송/수정에 사용하는 버튼 페이로드 */
export interface GuideMessageButtonPayload {
  id: number;
  label: string;
  emoji: string | null;
}

/** Discord 버튼 제약: ActionRow당 최대 버튼 수 */
const BUTTONS_PER_ROW = 5;

@Injectable()
export class AutoChannelDiscordGateway {
  private readonly logger = new Logger(AutoChannelDiscordGateway.name);

  constructor(private readonly discordRest: DiscordRestService) {}

  /**
   * F-VOICE-009: 텍스트 채널에 안내 메시지 + 버튼 신규 전송.
   * 반환값: Discord message ID
   */
  async sendGuideMessage(
    channelId: string,
    guideMessage: string,
    embedTitle: string | null,
    embedColor: string | null,
    buttons: GuideMessageButtonPayload[],
  ): Promise<string> {
    const embed = this.buildEmbed(guideMessage, embedTitle, embedColor);
    const components = this.buildActionRows(buttons);
    const message = await this.discordRest.sendMessage(channelId, {
      embeds: [embed.toJSON()],
      components: components.map((c) => c.toJSON()),
    });

    return message.id;
  }

  /**
   * F-VOICE-009: 기존 안내 메시지 수정.
   * 실패 시 (메시지 삭제됨 등) null 반환 -- 호출자가 신규 전송으로 폴백.
   */
  async editGuideMessage(
    channelId: string,
    messageId: string,
    guideMessage: string,
    embedTitle: string | null,
    embedColor: string | null,
    buttons: GuideMessageButtonPayload[],
  ): Promise<string | null> {
    try {
      const embed = this.buildEmbed(guideMessage, embedTitle, embedColor);
      const components = this.buildActionRows(buttons);

      const payload = {
        embeds: [embed.toJSON()],
        components: components.map((c) => c.toJSON()),
      };

      this.logger.log(
        `[EDIT] channelId=${channelId} messageId=${messageId} payload=${JSON.stringify(payload).substring(0, 500)}`,
      );

      const result = await this.discordRest.editMessage(channelId, messageId, payload);

      this.logger.log(
        `[EDIT] success: resultId=${result.id} embedCount=${result.embeds?.length} embedDesc="${result.embeds?.[0]?.description?.substring(0, 50)}" componentCount=${result.components?.length}`,
      );

      return messageId;
    } catch (error) {
      this.logger.warn(
        `Failed to edit guide message (channelId=${channelId}, messageId=${messageId}): ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * 안내 메시지 삭제.
   * 실패 시 (메시지 이미 삭제됨 등) 오류를 무시한다.
   */
  async deleteGuideMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.discordRest.deleteMessage(channelId, messageId);
    } catch (error) {
      this.logger.warn(
        `Failed to delete guide message (channelId=${channelId}, messageId=${messageId}): ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 특정 카테고리 내 음성 채널 이름 목록 조회.
   * 카테고리별 독립 넘버링을 위해 parentId로 필터링한다.
   */
  async fetchVoiceChannelNamesByCategory(guildId: string, categoryId: string): Promise<string[]> {
    const channels = await this.discordRest.fetchGuildChannels(guildId);
    return channels
      .filter(
        (ch) =>
          'type' in ch &&
          (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) &&
          'parent_id' in ch &&
          ch.parent_id === categoryId,
      )
      .map((ch) => ('name' in ch ? (ch.name ?? '') : ''));
  }

  /**
   * 유니코드 이모지 또는 Discord 커스텀 이모지 형식인지 검증.
   * 일반 텍스트(예: "11")는 Discord API에서 Invalid Form Body를 유발한다.
   */
  private isValidEmoji(value: string): boolean {
    // Discord 커스텀 이모지: <:name:id> 또는 <a:name:id>
    if (/^<a?:\w+:\d+>$/.test(value)) return true;

    // 유니코드 이모지: ASCII 범위 밖의 문자로 시작 (일반 텍스트 제외)
    const codePoint = value.codePointAt(0) ?? 0;
    return codePoint > 127;
  }

  /**
   * 안내 메시지용 Embed 생성.
   */
  private buildEmbed(
    description: string,
    title: string | null,
    color: string | null,
  ): EmbedBuilder {
    const embed = new EmbedBuilder();
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (color) embed.setColor(color as `#${string}`);
    return embed;
  }

  /**
   * 버튼 페이로드 목록을 Discord ActionRow 컴포넌트 배열로 변환.
   * Discord 제약: ActionRow 최대 5개, 버튼 최대 5개/행 -> 총 25개.
   * customId 형식: auto_btn:{buttonId}
   */
  private buildActionRows(buttons: GuideMessageButtonPayload[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
      const rowButtons = buttons.slice(i, i + BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowButtons.map((btn) => {
          const builder = new ButtonBuilder()
            .setCustomId(`auto_btn:${btn.id}`)
            .setLabel(btn.label)
            .setStyle(ButtonStyle.Primary);

          if (btn.emoji?.trim() && this.isValidEmoji(btn.emoji.trim())) {
            try {
              builder.setEmoji(btn.emoji.trim());
            } catch {
              // 유효하지 않은 이모지 무시
            }
          }

          return builder;
        }),
      );
      rows.push(row);
    }

    return rows;
  }
}
