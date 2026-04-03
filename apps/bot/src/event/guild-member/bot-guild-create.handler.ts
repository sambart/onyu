import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { type Guild } from 'discord.js';

import { BotGuildMemberSyncHandler } from './bot-guild-member-sync.handler';

/**
 * Discord guildCreate 이벤트 수신 후 신규 길드의 전체 멤버를 bulk upsert한다.
 * F-GUILD-MEMBER-002: 봇이 새 길드에 추가될 때 초기 동기화.
 */
@Injectable()
export class BotGuildCreateHandler {
  private readonly logger = new Logger(BotGuildCreateHandler.name);

  constructor(private readonly syncHandler: BotGuildMemberSyncHandler) {}

  @On('guildCreate')
  async handleGuildCreate(guild: Guild): Promise<void> {
    this.logger.log(`[GUILD-MEMBER-SYNC] guildCreate — syncing guild=${guild.id}`);

    const synced = await this.syncHandler.syncGuild(guild);

    if (synced === 0) {
      this.logger.warn(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} initial sync failed or empty — members will accumulate via guildMemberAdd`,
      );
    }
  }
}
