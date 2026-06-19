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
}
