import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { GuildMemberOrmEntity } from '../../guild-member/infrastructure/guild-member.orm-entity';

export interface GuildDistinctRow {
  guildId: string;
  memberCount: number;
}

/**
 * guild_member 테이블에서 distinct guildId 를 집계하는 read-only 레포지토리.
 * GuildMemberModule 을 수정하지 않고 super-admin 모듈 내에서 TypeOrmModule.forFeature 로 재등록한다.
 */
@Injectable()
export class AdminGuildRepository {
  constructor(
    @InjectRepository(GuildMemberOrmEntity)
    private readonly repo: Repository<GuildMemberOrmEntity>,
  ) {}

  /**
   * 봇 참여 길드 = guild_member 의 distinct guildId.
   * memberCount = 활성 비봇 멤버 수.
   */
  async findDistinctGuilds(): Promise<GuildDistinctRow[]> {
    const rows = await this.repo
      .createQueryBuilder('gm')
      .select('gm.guildId', 'guildId')
      .addSelect('COUNT(*) FILTER (WHERE gm.isActive = true AND gm.isBot = false)', 'memberCount')
      .groupBy('gm.guildId')
      .getRawMany<{ guildId: string; memberCount: string }>();

    return rows.map((r) => ({ guildId: r.guildId, memberCount: Number(r.memberCount) }));
  }
}
