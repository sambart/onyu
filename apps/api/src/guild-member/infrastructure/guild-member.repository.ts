import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GuildMemberOrmEntity } from './guild-member.orm-entity';

export interface BulkUpsertMemberData {
  userId: string;
  displayName: string;
  username: string;
  nick?: string | null;
  avatarUrl?: string | null;
  isBot: boolean;
  joinedAt?: string | null;
}

// DB 단일 쿼리 파라미터 제한 및 락 경합을 줄이기 위해 500건 단위로 나눈다
const BULK_UPSERT_CHUNK_SIZE = 500;

// 파라미터화되는 컬럼 수 (isActive=true, updatedAt=NOW()는 리터럴이므로 제외)
const BULK_UPSERT_COL_COUNT = 8;

@Injectable()
export class GuildMemberRepository {
  constructor(
    @InjectRepository(GuildMemberOrmEntity)
    private readonly repo: Repository<GuildMemberOrmEntity>,
  ) {}

  async upsert(guildId: string, data: BulkUpsertMemberData): Promise<void> {
    await this.repo.query(
      `INSERT INTO guild_member
        ("guildId","userId","displayName","username","nick","avatarUrl","isBot","joinedAt","isActive","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7::boolean,$8::timestamp,true,NOW())
      ON CONFLICT ("guildId","userId")
      DO UPDATE SET
        "displayName" = EXCLUDED."displayName",
        "username" = EXCLUDED."username",
        "nick" = EXCLUDED."nick",
        "avatarUrl" = EXCLUDED."avatarUrl",
        "isBot" = EXCLUDED."isBot",
        "joinedAt" = EXCLUDED."joinedAt",
        "isActive" = true,
        "updatedAt" = NOW()`,
      [
        guildId,
        data.userId,
        data.displayName,
        data.username,
        data.nick ?? null,
        data.avatarUrl ?? null,
        data.isBot,
        data.joinedAt ?? null,
      ],
    );
  }

  async bulkUpsert(guildId: string, members: BulkUpsertMemberData[]): Promise<void> {
    if (members.length === 0) return;

    for (let i = 0; i < members.length; i += BULK_UPSERT_CHUNK_SIZE) {
      const chunk = members.slice(i, i + BULK_UPSERT_CHUNK_SIZE);
      const params: (string | boolean | null)[] = [];
      const valueClauses: string[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const o = j * BULK_UPSERT_COL_COUNT;
        valueClauses.push(
          `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7}::boolean,$${o + 8}::timestamp,true,NOW())`,
        );
        params.push(
          guildId,
          chunk[j].userId,
          chunk[j].displayName,
          chunk[j].username,
          chunk[j].nick ?? null,
          chunk[j].avatarUrl ?? null,
          chunk[j].isBot,
          chunk[j].joinedAt ?? null,
        );
      }

      await this.repo.query(
        `INSERT INTO guild_member
          ("guildId","userId","displayName","username","nick","avatarUrl","isBot","joinedAt","isActive","updatedAt")
        VALUES ${valueClauses.join(', ')}
        ON CONFLICT ("guildId","userId")
        DO UPDATE SET
          "displayName" = EXCLUDED."displayName",
          "username" = EXCLUDED."username",
          "nick" = EXCLUDED."nick",
          "avatarUrl" = EXCLUDED."avatarUrl",
          "isBot" = EXCLUDED."isBot",
          "joinedAt" = EXCLUDED."joinedAt",
          "isActive" = true,
          "updatedAt" = NOW()`,
        params,
      );
    }
  }

  async deactivate(guildId: string, userId: string): Promise<void> {
    await this.repo.query(
      `UPDATE guild_member SET "isActive" = false, "updatedAt" = NOW()
       WHERE "guildId" = $1 AND "userId" = $2`,
      [guildId, userId],
    );
  }

  async updateDisplayName(
    guildId: string,
    userId: string,
    displayName: string,
    nick: string | null,
    avatarUrl: string | null,
  ): Promise<void> {
    await this.repo.query(
      `UPDATE guild_member
       SET "displayName" = $3, "nick" = $4, "avatarUrl" = $5, "updatedAt" = NOW()
       WHERE "guildId" = $1 AND "userId" = $2`,
      [guildId, userId, displayName, nick, avatarUrl],
    );
  }

  async updateGlobalProfile(userId: string, displayName: string, username: string): Promise<void> {
    await this.repo.query(
      `UPDATE guild_member
       SET "displayName" = $2, "username" = $3, "updatedAt" = NOW()
       WHERE "userId" = $1 AND "nick" IS NULL`,
      [userId, displayName, username],
    );
  }

  async findByGuildAndUser(guildId: string, userId: string): Promise<GuildMemberOrmEntity | null> {
    return this.repo.findOne({ where: { guildId, userId } });
  }

  async findByGuildAndUsers(guildId: string, userIds: string[]): Promise<GuildMemberOrmEntity[]> {
    if (userIds.length === 0) return [];

    return this.repo
      .createQueryBuilder('gm')
      .where('gm.guildId = :guildId', { guildId })
      .andWhere('gm.userId IN (:...userIds)', { userIds })
      .getMany();
  }

  async findActiveMembers(guildId: string): Promise<GuildMemberOrmEntity[]> {
    return this.repo.find({ where: { guildId, isActive: true } });
  }

  async findActiveMembersExcludingBots(guildId: string): Promise<GuildMemberOrmEntity[]> {
    return this.repo.find({ where: { guildId, isActive: true, isBot: false } });
  }

  async findByJoinedAfter(guildId: string, date: Date): Promise<GuildMemberOrmEntity[]> {
    return this.repo
      .createQueryBuilder('gm')
      .where('gm.guildId = :guildId', { guildId })
      .andWhere('gm.joinedAt >= :date', { date })
      .getMany();
  }
}
