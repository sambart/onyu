import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { Message } from 'discord.js';

/**
 * Discord messageCreate 이벤트를 수신하여 API로 전달한다.
 * 고정 메시지 갱신 로직(Redis 디바운싱 등)은 API에서 처리한다.
 */
@Injectable()
export class BotStickyMessageHandler {
  private readonly logger = new Logger(BotStickyMessageHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('messageCreate')
  async handleMessageCreate(message: Message): Promise<void> {
    try {
      const guildId = message.guildId;
      if (!guildId) return; // DM 메시지 무시

      await this.apiClient.sendMessageCreated({
        guildId,
        channelId: message.channelId,
        authorId: message.author.id,
        isBot: message.author.bot,
      });
    } catch (err) {
      // fire-and-forget: API 호출 실패 시 로그만 남김
      this.logger.error(
        `[BOT] messageCreate forwarding failed: guild=${message.guildId} channel=${message.channelId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
