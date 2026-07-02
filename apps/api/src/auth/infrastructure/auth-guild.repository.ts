import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { GuildMemberOrmEntity } from '../../guild-member/infrastructure/guild-member.orm-entity';

/**
 * auth 모듈에서 봇 참여 길드 집합을 조회하는 read-only 레포지토리.
 * GuildMemberModule 을 수정하지 않고 auth 모듈 내부에서 TypeOrmModule.forFeature 로 재등록한다
 * (super-admin 모듈의 AdminGuildRepository 와 동일한 재등록 패턴).
 */
@Injectable()
export class AuthGuildRepository {
  constructor(
    @InjectRepository(GuildMemberOrmEntity)
    private readonly repo: Repository<GuildMemberOrmEntity>,
  ) {}

  /**
   * 봇이 참여한 길드의 guildId 집합을 반환한다.
   * guild_member 테이블의 distinct guildId 를 기준으로 한다.
   */
  async findBotGuildIds(): Promise<Set<string>> {
    const rows = await this.repo
      .createQueryBuilder('gm')
      .select('DISTINCT gm.guildId', 'guildId')
      .getRawMany<{ guildId: string }>();

    return new Set(rows.map((r) => r.guildId));
  }
}
