import { Injectable, Logger } from '@nestjs/common';
import type {
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageJSONBody,
} from 'discord.js';

import { getErrorMessage } from '../../common/util/error.util';
import { DiscordRestService } from '../../discord-rest/discord-rest.service';

/** Discord REST API를 통한 음악 채널 임베드 관련 조작 전담. */
@Injectable()
export class MusicChannelDiscordAdapter {
  private readonly logger = new Logger(MusicChannelDiscordAdapter.name);

  constructor(private readonly discordRest: DiscordRestService) {}

  /**
   * 채널에 임베드 + 버튼 ActionRow가 포함된 메시지를 전송하고, 전송된 메시지 ID를 반환한다.
   */
  async sendMessage(
    channelId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
  ): Promise<string> {
    const message = await this.discordRest.sendMessage(channelId, payload);
    return message.id;
  }

  /**
   * 기존 메시지를 수정한다 (임베드 + 버튼 갱신).
   */
  async editMessage(
    channelId: string,
    messageId: string,
    payload: RESTPatchAPIChannelMessageJSONBody,
  ): Promise<void> {
    await this.discordRest.editMessage(channelId, messageId, payload);
  }

  /**
   * 메시지를 삭제한다. 실패 시 warn 로그 후 무시.
   */
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.discordRest.deleteMessage(channelId, messageId);
    } catch (err) {
      this.logger.warn(
        `[MUSIC_CHANNEL] Failed to delete message ${messageId} in channel ${channelId}: ${getErrorMessage(err)}`,
      );
    }
  }
}
