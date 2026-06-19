import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ChannelType } from 'discord.js';

import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../common/guards/guild-membership.guard';
import { DiscordRestService } from '../discord-rest/discord-rest.service';

@Controller('api/guilds/:guildId')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class GuildInfoController {
  constructor(private readonly discordRest: DiscordRestService) {}

  @Get('channels')
  async getChannels(@Param('guildId') guildId: string, @Query('refresh') _refresh?: string) {
    // REST API는 항상 최신 데이터를 반환하므로 refresh 파라미터는 무시
    const channels = await this.discordRest.fetchGuildChannels(guildId);

    return channels
      .filter((ch) => 'type' in ch && ch.type !== undefined)
      .map((ch) => ({
        id: ch.id,
        name: 'name' in ch ? ch.name : undefined,
        type: 'type' in ch ? ch.type : undefined,
      }))
      .filter((ch) =>
        [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory].includes(
          ch.type as ChannelType,
        ),
      );
  }

  @Get('roles')
  async getRoles(@Param('guildId') guildId: string, @Query('refresh') _refresh?: string) {
    const roles = await this.discordRest.fetchGuildRoles(guildId);

    return roles
      .filter((role) => !role.managed && role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
      }));
  }

  @Get('emojis')
  async getEmojis(@Param('guildId') guildId: string, @Query('refresh') _refresh?: string) {
    const emojis = await this.discordRest.fetchGuildEmojis(guildId);

    return emojis
      .filter((emoji) => emoji.available !== false)
      .map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated ?? false,
      }));
  }

  @Get('commands')
  async getCommands() {
    try {
      const commands = await this.discordRest.fetchApplicationCommands();
      if (!commands || commands.length === 0) return [];

      return (commands as Array<Record<string, unknown>>).map((cmd) => ({
        id: cmd.id,
        name: cmd.name,
        description: cmd.description,
      }));
    } catch {
      return [];
    }
  }
}
