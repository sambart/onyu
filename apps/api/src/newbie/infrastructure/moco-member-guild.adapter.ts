import { Injectable } from '@nestjs/common';

import { GuildMemberService } from '../../guild-member/application/guild-member.service';
import type { MocoMemberResolver } from '../application/moco/moco-member-resolver.port';

/** GuildMemberService(DB) 기반 MocoMemberResolver 구현체. */
@Injectable()
export class MocoMemberGuildAdapter implements MocoMemberResolver {
  constructor(private readonly guildMemberService: GuildMemberService) {}

  async getNewbieIds(
    guildId: string,
    _channelId: string,
    userIds: string[],
    cutoffMs: number,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];

    const memberMap = await this.guildMemberService.findByUserIds(guildId, userIds);
    const newbieIds: string[] = [];

    for (const userId of userIds) {
      const member = memberMap.get(userId);
      if (!member || member.isBot) continue;

      const joinedAtMs = member.joinedAt?.getTime() ?? null;
      if (joinedAtMs !== null && joinedAtMs >= cutoffMs) {
        newbieIds.push(userId);
      }
    }

    return newbieIds;
  }

  async isValidHunter(
    guildId: string,
    hunterId: string,
    cutoffMs: number,
    allowNewbie: boolean,
  ): Promise<boolean> {
    const member = await this.guildMemberService.findByUserId(guildId, hunterId);
    if (!member || member.isBot || !member.isActive) return false;

    const joinedAtMs = member.joinedAt?.getTime() ?? null;
    const isNewbie = joinedAtMs !== null && joinedAtMs >= cutoffMs;
    if (isNewbie && !allowNewbie) return false;

    return true;
  }

  async getNewbiePeerIds(guildId: string, peerIds: string[], cutoffMs: number): Promise<string[]> {
    if (peerIds.length === 0) return [];

    const memberMap = await this.guildMemberService.findByUserIds(guildId, peerIds);
    const newbies: string[] = [];

    for (const peerId of peerIds) {
      const member = memberMap.get(peerId);
      if (!member || member.isBot) continue;

      const joinedAtMs = member.joinedAt?.getTime() ?? null;
      if (joinedAtMs !== null && joinedAtMs >= cutoffMs) {
        newbies.push(peerId);
      }
    }

    return newbies;
  }
}
