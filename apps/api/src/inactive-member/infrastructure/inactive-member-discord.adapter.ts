import { Injectable, Logger } from '@nestjs/common';
import type { APIGuildMember } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

import { getErrorStack } from '../../common/util/error.util';
import { DiscordRestService } from '../../discord-rest/discord-rest.service';

/** Discord REST API를 통한 비활동 회원 관련 조작 전담. */
@Injectable()
export class InactiveMemberDiscordAdapter {
  private readonly logger = new Logger(InactiveMemberDiscordAdapter.name);

  constructor(private readonly discordRest: DiscordRestService) {}

  /** 길드 정보를 REST API로 페치한다. */
  async fetchGuild(guildId: string) {
    return this.discordRest.fetchGuild(guildId);
  }

  /**
   * 길드 전체 멤버를 REST API로 가져온다.
   * 페이지네이션으로 전체 멤버를 조회.
   */
  async fetchGuildMembers(guildId: string, maxRetries = 3): Promise<APIGuildMember[] | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.discordRest.fetchAllGuildMembers(guildId);
      } catch (err) {
        if (attempt === maxRetries) {
          this.logger.error(`[INACTIVE] Members fetch failed guild=${guildId}`, getErrorStack(err));
          return null;
        }

        const retryAfterMs = (err instanceof Error ? this.extractRetryAfter(err) : null) ?? 25_000;
        this.logger.warn(
          `[INACTIVE] Rate limit hit (attempt ${attempt}/${maxRetries}), retrying after ${retryAfterMs}ms`,
        );
        await this.sleep(retryAfterMs);
      }
    }

    return null;
  }

  /** 멤버를 강퇴한다. */
  async kickMember(guildId: string, userId: string, reason: string): Promise<boolean> {
    try {
      await this.discordRest.kickMember(guildId, userId, reason);
      return true;
    } catch (err) {
      this.logger.warn(`[INACTIVE] Kick failed userId=${userId}`, getErrorStack(err));
      return false;
    }
  }

  /** 멤버에게 DM을 보낸다. */
  async sendDm(guildId: string, userId: string, embed: EmbedBuilder): Promise<boolean> {
    try {
      return await this.discordRest.sendDMEmbed(userId, { embeds: [embed.toJSON()] });
    } catch (err) {
      this.logger.warn(`[INACTIVE] DM failed userId=${userId}`, getErrorStack(err));
      return false;
    }
  }

  /** 멤버에게 역할을 부여/제거한다. */
  async modifyRole(
    guildId: string,
    userId: string,
    roleId: string,
    action: 'add' | 'remove',
  ): Promise<boolean> {
    try {
      if (action === 'add') {
        await this.discordRest.addMemberRole(guildId, userId, roleId);
      } else {
        await this.discordRest.removeMemberRole(guildId, userId, roleId);
      }
      return true;
    } catch (err) {
      this.logger.warn(`[INACTIVE] Role ${action} failed userId=${userId}`, getErrorStack(err));
      return false;
    }
  }

  private extractRetryAfter(err: Error): number | null {
    const match = err.message.match(/Retry after ([\d.]+)/);
    if (!match) return null;
    return Math.ceil(parseFloat(match[1]) * 1000) + 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
