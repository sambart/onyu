import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type GuildMember, type PartialGuildMember } from 'discord.js';

/**
 * Discord guildMemberRemove 이벤트 수신 후 해당 멤버를 비활성화(isActive=false)한다.
 * F-GUILD-MEMBER-006: 멤버 퇴장/강퇴 시 isActive 마킹.
 */
@Injectable()
export class BotMemberRemoveHandler {
  private readonly logger = new Logger(BotMemberRemoveHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('guildMemberRemove')
  async handleGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
    const guildId = member.guild.id;
    // PartialGuildMember는 user가 null일 수 있으므로 member.id를 사용한다.
    const userId = member.id;

    try {
      await this.apiClient.deactivateGuildMember({ guildId, userId });
    } catch (err) {
      this.logger.error(
        `[GUILD-MEMBER-REMOVE] deactivate failed: guild=${guildId} member=${userId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
