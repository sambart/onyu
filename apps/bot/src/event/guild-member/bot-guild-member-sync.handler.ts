import { InjectDiscordClient, Once } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type GuildMemberUpsertDto } from '@onyu/bot-api-client';
import { Client, type Guild, type GuildMember } from 'discord.js';

import { waitForApi } from '../../common/util/wait-for-api';

const BATCH_SIZE = 500;

/**
 * Discord clientReady 이벤트 수신 후 모든 길드의 멤버를 bulk upsert한다.
 * F-GUILD-MEMBER-001: 봇 시작 시 초기 동기화.
 */
@Injectable()
export class BotGuildMemberSyncHandler {
  private readonly logger = new Logger(BotGuildMemberSyncHandler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  @Once('clientReady')
  async handleReady(): Promise<void> {
    this.logger.log('[GUILD-MEMBER-SYNC] Discord ready — waiting for API...');

    const isApiReady = await waitForApi(this.apiClient);
    if (!isApiReady) {
      this.logger.error('[GUILD-MEMBER-SYNC] API 연결 실패 — guild member sync 중단');
      return;
    }

    this.logger.log('[GUILD-MEMBER-SYNC] API connected — syncing all guild members...');

    let totalSynced = 0;

    for (const guild of this.client.guilds.cache.values()) {
      const synced = await this.syncGuild(guild);
      totalSynced += synced;
    }

    this.logger.log(
      `[GUILD-MEMBER-SYNC] Complete — ${totalSynced} member(s) synced across all guilds`,
    );
  }

  /**
   * 단일 길드의 전체 멤버를 fetch하여 bulk upsert한다.
   * guildCreate 핸들러에서도 재사용된다.
   * @returns 동기화된 멤버 수 (실패 시 0)
   */
  async syncGuild(guild: Guild): Promise<number> {
    try {
      const members = await guild.members.fetch({ withPresences: false });
      const memberList = [...members.values()];

      const batches = this.chunk(memberList, BATCH_SIZE);

      for (const batch of batches) {
        await this.apiClient.bulkUpsertGuildMembers({
          guildId: guild.id,
          members: batch.map((m) => this.toUpsertDto(guild.id, m)),
        });
      }

      this.logger.log(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} synced ${memberList.length} member(s)`,
      );
      return memberList.length;
    } catch (err) {
      this.logger.error(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} sync failed`,
        err instanceof Error ? err.stack : err,
      );
      return 0;
    }
  }

  private toUpsertDto(guildId: string, member: GuildMember): GuildMemberUpsertDto {
    return {
      guildId,
      userId: member.id,
      displayName: member.displayName,
      username: member.user.username,
      nick: member.nickname,
      avatarUrl: member.displayAvatarURL({ size: 128 }),
      isBot: member.user.bot,
      joinedAt: member.joinedAt?.toISOString() ?? null,
    };
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
