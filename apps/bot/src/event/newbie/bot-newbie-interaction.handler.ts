import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { ButtonInteraction, Interaction } from 'discord.js';

/** 뉴비 모듈 버튼 customId 접두사 */
const NEWBIE_CUSTOM_ID = {
  MISSION_REFRESH: 'newbie_mission:refresh:',
  MOCO_PREV: 'newbie_moco:prev:',
  MOCO_NEXT: 'newbie_moco:next:',
  MOCO_REFRESH: 'newbie_moco:refresh:',
  MOCO_MY: 'newbie_moco:my:',
} as const;

/**
 * Discord interactionCreate 이벤트를 수신하여 뉴비 관련 버튼 인터랙션을 API로 전달한다.
 * newbie_mission: 또는 newbie_moco: 접두사를 가진 버튼만 처리한다.
 */
@Injectable()
export class BotNewbieInteractionHandler {
  private readonly logger = new Logger(BotNewbieInteractionHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isMission = customId.startsWith(NEWBIE_CUSTOM_ID.MISSION_REFRESH);
    const isMoco =
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_PREV) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_NEXT) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_REFRESH) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_MY);

    if (!isMission && !isMoco) return;

    try {
      if (isMission) {
        await this.handleMissionButton(interaction);
      } else {
        await this.handleMocoButton(interaction);
      }
    } catch (error) {
      this.logger.error(
        `[BOT] Newbie interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );

      try {
        const content = '오류가 발생했습니다. 잠시 후 다시 시도하세요.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, content });
        } else {
          await interaction.reply({ ephemeral: true, content });
        }
      } catch (replyError) {
        this.logger.error(
          '[BOT] Failed to send error reply',
          replyError instanceof Error ? replyError.stack : replyError,
        );
      }
    }
  }

  /**
   * newbie_mission:refresh:{guildId} 버튼 처리.
   * API에 미션 Embed 갱신을 요청한다.
   */
  private async handleMissionButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.customId.slice(NEWBIE_CUSTOM_ID.MISSION_REFRESH.length);

    if (!guildId) {
      await interaction.reply({ ephemeral: true, content: '잘못된 요청입니다.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await this.apiClient.refreshMissionEmbed({ guildId });
    await interaction.editReply({ content: '미션 현황이 갱신되었습니다.' });
  }

  /**
   * newbie_moco 버튼 처리 (prev/next/refresh/my).
   * API에서 랭킹 데이터를 받아 인터랙션을 업데이트한다.
   */
  private async handleMocoButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_REFRESH)) {
      // newbie_moco:refresh:{guildId}
      const guildId = customId.slice(NEWBIE_CUSTOM_ID.MOCO_REFRESH.length);
      await interaction.deferUpdate();
      const response = await this.apiClient.getMocoRankData(guildId, 1);
      await interaction.message.edit(response as never);
      return;
    }

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_PREV)) {
      // newbie_moco:prev:{guildId}:{currentPage}
      const rest = customId.slice(NEWBIE_CUSTOM_ID.MOCO_PREV.length);
      const lastColon = rest.lastIndexOf(':');
      const guildId = rest.slice(0, lastColon);
      const currentPage = parseInt(rest.slice(lastColon + 1), 10);
      await interaction.deferUpdate();
      const response = await this.apiClient.getMocoRankData(guildId, currentPage - 1);
      await interaction.message.edit(response as never);
      return;
    }

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_NEXT)) {
      // newbie_moco:next:{guildId}:{currentPage}
      const rest = customId.slice(NEWBIE_CUSTOM_ID.MOCO_NEXT.length);
      const lastColon = rest.lastIndexOf(':');
      const guildId = rest.slice(0, lastColon);
      const currentPage = parseInt(rest.slice(lastColon + 1), 10);
      await interaction.deferUpdate();
      const response = await this.apiClient.getMocoRankData(guildId, currentPage + 1);
      await interaction.message.edit(response as never);
      return;
    }

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_MY)) {
      // newbie_moco:my:{guildId}
      const guildId = customId.slice(NEWBIE_CUSTOM_ID.MOCO_MY.length);
      const userId = interaction.user.id;
      await interaction.deferReply({ ephemeral: true });
      const response = await this.apiClient.getMyHuntingData(guildId, userId);
      await interaction.editReply({ content: response.data ?? '데이터를 불러올 수 없습니다.' });
    }
  }
}
