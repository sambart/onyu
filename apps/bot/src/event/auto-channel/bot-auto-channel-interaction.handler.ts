import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { AutoChannelButtonResult } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Interaction,
} from 'discord.js';

const CUSTOM_ID_PREFIX = {
  BUTTON: 'auto_btn:',
  SUB_OPTION: 'auto_sub:',
} as const;

/** Discord 버튼 제약: ActionRow당 최대 버튼 수 */
const BUTTONS_PER_ROW = 5;

/**
 * Discord interactionCreate 이벤트를 수신하여 auto_btn/auto_sub 버튼을 처리한다.
 * 비즈니스 로직(설정 검증, 채널 생성, 유저 이동)은 API에 위임하고,
 * Discord 응답(deferReply, editReply)은 Bot에서 직접 수행한다.
 */
@Injectable()
export class BotAutoChannelInteractionHandler {
  private readonly logger = new Logger(BotAutoChannelInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    @InjectDiscordClient() private readonly discord: Client,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isButton = customId.startsWith(CUSTOM_ID_PREFIX.BUTTON);
    const isSubOption = customId.startsWith(CUSTOM_ID_PREFIX.SUB_OPTION);
    if (!isButton && !isSubOption) return;
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    try {
      await interaction.deferReply({ ephemeral: true });

      // Gateway 캐시에서 voice state 확보 (REST fetch에는 voice 정보 없음)
      const guild = this.discord.guilds.cache.get(guildId);
      const voiceState = guild?.voiceStates.cache.get(userId);
      const voiceChannelId = voiceState?.channelId ?? null;
      const member = guild?.members.cache.get(userId);
      const displayName = member?.displayName ?? interaction.user.displayName;

      this.logger.warn(
        `[AUTO_CHANNEL] guild=${!!guild} voiceState=${!!voiceState} voiceChannelId=${voiceChannelId} member=${!!member} displayName=${displayName}`,
      );

      let result: AutoChannelButtonResult;

      if (isButton) {
        const buttonId = parseInt(customId.slice(CUSTOM_ID_PREFIX.BUTTON.length), 10);
        if (isNaN(buttonId)) {
          await interaction.editReply({ content: '잘못된 요청입니다.' });
          return;
        }

        result = await this.apiClient.autoChannelButtonClick({
          guildId,
          userId,
          buttonId,
          voiceChannelId,
          displayName,
        });
      } else {
        const subOptionId = parseInt(customId.slice(CUSTOM_ID_PREFIX.SUB_OPTION.length), 10);
        if (isNaN(subOptionId)) {
          await interaction.editReply({ content: '잘못된 요청입니다.' });
          return;
        }

        result = await this.apiClient.autoChannelSubOption({
          guildId,
          userId,
          subOptionId,
          voiceChannelId,
          displayName,
        });
      }

      if (result.action === 'show_sub_options' && result.subOptions) {
        const rows = this.buildSubOptionActionRows(result.subOptions);
        await interaction.editReply({ content: result.message, components: rows });
      } else {
        await interaction.editReply({ content: result.message });
      }
    } catch (error) {
      this.logger.error(
        `[AUTO_CHANNEL] Interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );

      try {
        const content = '오류가 발생했습니다. 잠시 후 다시 시도하세요.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, content });
        } else {
          await interaction.reply({ ephemeral: true, content });
        }
      } catch {
        // 응답 실패 무시
      }
    }
  }

  /**
   * 유니코드 이모지 또는 Discord 커스텀 이모지 형식인지 검증.
   */
  private isValidEmoji(value: string): boolean {
    if (/^<a?:\w+:\d+>$/.test(value)) return true;
    const codePoint = value.codePointAt(0) ?? 0;
    return codePoint > 127;
  }

  /**
   * API에서 반환된 하위 선택지 목록을 Discord ActionRow 컴포넌트 배열로 변환.
   */
  private buildSubOptionActionRows(
    subOptions: Array<{ id: number; label: string; emoji: string | null }>,
  ): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < subOptions.length; i += BUTTONS_PER_ROW) {
      const rowOptions = subOptions.slice(i, i + BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowOptions.map((opt) => {
          const builder = new ButtonBuilder()
            .setCustomId(`${CUSTOM_ID_PREFIX.SUB_OPTION}${opt.id}`)
            .setLabel(opt.label)
            .setStyle(ButtonStyle.Primary);

          if (opt.emoji?.trim() && this.isValidEmoji(opt.emoji.trim())) {
            try {
              builder.setEmoji(opt.emoji.trim());
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
