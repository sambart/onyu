import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type GuildMember, type PartialGuildMember } from 'discord.js';

/**
 * Discord guildMemberUpdate 이벤트 수신 후 displayName/avatarUrl 변경 시에만 API에 upsert한다.
 * F-GUILD-MEMBER-004: 닉네임/아바타 변경 동기화.
 */
@Injectable()
export class BotMemberUpdateHandler {
  private readonly logger = new Logger(BotMemberUpdateHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('guildMemberUpdate')
  async handleGuildMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    if (!newMember.user) {
      this.logger.warn(
        `[GUILD-MEMBER-UPDATE] newMember.user is null — guild=${newMember.guild.id} member=${newMember.id}`,
      );
      return;
    }

    const hasDisplayNameChanged = oldMember.displayName !== newMember.displayName;
    const hasAvatarChanged = oldMember.displayAvatarURL() !== newMember.displayAvatarURL();

    if (!hasDisplayNameChanged && !hasAvatarChanged) {
      return;
    }

    const guildId = newMember.guild.id;

    try {
      await this.apiClient.upsertGuildMember({
        guildId,
        userId: newMember.id,
        displayName: newMember.displayName,
        username: newMember.user.username,
        nick: newMember.nickname,
        avatarUrl: newMember.displayAvatarURL({ size: 128 }),
        isBot: newMember.user.bot,
        joinedAt: newMember.joinedAt?.toISOString() ?? null,
      });
    } catch (err) {
      this.logger.error(
        `[GUILD-MEMBER-UPDATE] upsert failed: guild=${guildId} member=${newMember.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
