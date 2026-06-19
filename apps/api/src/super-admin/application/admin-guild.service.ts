import { Injectable } from '@nestjs/common';

import { DiscordRestService } from '../../discord-rest/discord-rest.service';
import type { AdminGuildDto } from '../dto/admin-guild.dto';
import { AdminGuildRepository } from '../infrastructure/admin-guild.repository';

@Injectable()
export class AdminGuildService {
  constructor(
    private readonly adminGuildRepository: AdminGuildRepository,
    private readonly discordRest: DiscordRestService,
  ) {}

  async listGuilds(): Promise<AdminGuildDto[]> {
    const distinct = await this.adminGuildRepository.findDistinctGuilds();

    return Promise.all(
      distinct.map(async ({ guildId, memberCount }) => {
        const meta = await this.discordRest.fetchGuild(guildId);
        return {
          id: guildId,
          name: meta?.name ?? guildId,
          icon: meta?.icon ?? null,
          memberCount,
          joinedAt: null,
        } satisfies AdminGuildDto;
      }),
    );
  }

  /**
   * 단일 길드의 표시 정보(이름/아이콘)만 조회한다.
   * 사이드바 길드명 resolve용 — 전체 길드를 Discord로 보강하는 listGuilds 와 달리
   * Discord fetchGuild 1회만 수행해 비운영 길드 열람 시 지연을 방지한다.
   */
  async getGuild(guildId: string): Promise<AdminGuildDto> {
    const meta = await this.discordRest.fetchGuild(guildId);
    return {
      id: guildId,
      name: meta?.name ?? guildId,
      icon: meta?.icon ?? null,
      memberCount: null,
      joinedAt: null,
    } satisfies AdminGuildDto;
  }
}
