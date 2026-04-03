import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import { MemberSearchResultDto } from '../dto/member-search-result.dto';
import { VoiceDailyOrm } from '../infrastructure/voice-daily.orm-entity';

@Injectable()
export class MemberSearchService {
  constructor(
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    private readonly guildMemberService: GuildMemberService,
  ) {}

  async search(guildId: string, q: string): Promise<MemberSearchResultDto[]> {
    const rows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd."userId"', 'userId')
      .addSelect('MIN(vd."userName")', 'userName')
      .where('vd."guildId" = :guildId', { guildId })
      .andWhere('vd."userName" ILIKE :q', { q: `%${q}%` })
      .groupBy('vd."userId"')
      .orderBy('MIN(vd."userName")', 'ASC')
      .limit(20)
      .getRawMany<{ userId: string; userName: string }>();

    return rows.map((r) => ({ userId: r.userId, userName: r.userName }));
  }

  async getProfile(
    guildId: string,
    userId: string,
  ): Promise<{ userId: string; userName: string; avatarUrl: string | null } | null> {
    const member = await this.guildMemberService.findByUserId(guildId, userId);
    if (!member) return null;
    return {
      userId: member.userId,
      userName: member.nick ?? member.displayName,
      avatarUrl: member.avatarUrl ?? null,
    };
  }

  async getProfiles(
    guildId: string,
    userIds: string[],
  ): Promise<Record<string, { userName: string; avatarUrl: string | null }>> {
    if (userIds.length === 0) return {};

    const memberMap = await this.guildMemberService.findByUserIds(guildId, userIds);
    const result: Record<string, { userName: string; avatarUrl: string | null }> = {};

    for (const [userId, member] of memberMap) {
      result[userId] = {
        userName: member.nick ?? member.displayName,
        avatarUrl: member.avatarUrl ?? null,
      };
    }

    return result;
  }
}
