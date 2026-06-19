import { Injectable, Logger } from '@nestjs/common';
import type {
  APIGuildMember,
  APIMessage,
  APIRole,
  RESTPostAPIChannelMessageJSONBody,
} from 'discord.js';

import { getErrorMessage } from '../../common/util/error.util';
import { DiscordRestService } from '../../discord-rest/discord-rest.service';

/** Discord REST API를 통한 역할 패널 관련 조작 전담. */
@Injectable()
export class RolePanelDiscordAdapter {
  private readonly logger = new Logger(RolePanelDiscordAdapter.name);

  constructor(private readonly discordRest: DiscordRestService) {}

  /** 봇 유저 ID를 반환한다. */
  getBotUserId(): string {
    return this.discordRest.getBotUserId();
  }

  /** 길드 역할 목록을 조회한다. */
  async fetchGuildRoles(guildId: string): Promise<APIRole[]> {
    return this.discordRest.fetchGuildRoles(guildId);
  }

  /**
   * 길드 멤버 정보를 조회한다.
   * 봇 최상위 역할 position 산출에 사용.
   */
  async fetchGuildMember(guildId: string, userId: string): Promise<APIGuildMember | null> {
    return this.discordRest.fetchGuildMember(guildId, userId);
  }

  /** 채널에 메시지(Embed + 버튼 포함)를 전송하고, 전송된 메시지 ID를 반환한다. */
  async sendMessage(
    channelId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
  ): Promise<APIMessage> {
    return this.discordRest.sendMessage(channelId, payload);
  }

  /** 기존 메시지를 수정한다. */
  async editMessage(
    channelId: string,
    messageId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
  ): Promise<APIMessage> {
    return this.discordRest.editMessage(channelId, messageId, payload);
  }

  /**
   * 메시지를 삭제한다. 실패 시 warn 로그 후 무시
   * (삭제 시 이미 없는 메시지인 경우를 고려).
   */
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.discordRest.deleteMessage(channelId, messageId);
    } catch (err) {
      this.logger.warn(
        `[ROLE_PANEL] Failed to delete message ${messageId} in channel ${channelId}: ${getErrorMessage(err)}`,
      );
    }
  }
}
