import { Injectable, Logger } from '@nestjs/common';

import { getErrorStack } from '../../common/util/error.util';
import type { GuildMemberOrmEntity } from '../infrastructure/guild-member.orm-entity';
import type { BulkUpsertMemberData } from '../infrastructure/guild-member.repository';
import { GuildMemberRepository } from '../infrastructure/guild-member.repository';

@Injectable()
export class GuildMemberService {
  private readonly logger = new Logger(GuildMemberService.name);

  constructor(private readonly guildMemberRepository: GuildMemberRepository) {}

  /** 단일 멤버 upsert (입장/재입장). F-003 */
  async upsertMember(guildId: string, data: BulkUpsertMemberData): Promise<void> {
    try {
      await this.guildMemberRepository.upsert(guildId, data);
    } catch (err) {
      this.logger.error(
        `[GuildMemberService] upsert failed: guild=${guildId} user=${data.userId}`,
        getErrorStack(err),
      );
      throw err;
    }
  }

  /** 초기 동기화 및 길드 추가 시 대량 upsert. F-001, F-002 */
  async bulkUpsertMembers(guildId: string, members: BulkUpsertMemberData[]): Promise<void> {
    if (members.length === 0) return;

    try {
      await this.guildMemberRepository.bulkUpsert(guildId, members);
      this.logger.log(`[GuildMemberService] bulk upsert: guild=${guildId} count=${members.length}`);
    } catch (err) {
      this.logger.error(
        `[GuildMemberService] bulk upsert failed: guild=${guildId} count=${members.length}`,
        getErrorStack(err),
      );
      throw err;
    }
  }

  /** 멤버 퇴장 처리 (isActive=false). F-006 */
  async deactivateMember(guildId: string, userId: string): Promise<void> {
    this.logger.debug(`[GuildMemberService] deactivate: guild=${guildId} user=${userId}`);
    try {
      await this.guildMemberRepository.deactivate(guildId, userId);
    } catch (err) {
      this.logger.error(
        `[GuildMemberService] deactivate failed: guild=${guildId} user=${userId}`,
        getErrorStack(err),
      );
      throw err;
    }
  }

  /** 닉네임 변경 처리. F-004 */
  async updateDisplayName(
    guildId: string,
    userId: string,
    displayName: string,
    nick: string | null,
    avatarUrl: string | null,
  ): Promise<void> {
    this.logger.debug(
      `[GuildMemberService] updateDisplayName: guild=${guildId} user=${userId} displayName=${displayName}`,
    );
    try {
      await this.guildMemberRepository.updateDisplayName(
        guildId,
        userId,
        displayName,
        nick,
        avatarUrl,
      );
    } catch (err) {
      this.logger.error(
        `[GuildMemberService] updateDisplayName failed: guild=${guildId} user=${userId}`,
        getErrorStack(err),
      );
      throw err;
    }
  }

  /** 전역 프로필 변경 — nick=null인 행만 갱신. F-005 */
  async updateGlobalProfile(userId: string, displayName: string, username: string): Promise<void> {
    try {
      await this.guildMemberRepository.updateGlobalProfile(userId, displayName, username);
    } catch (err) {
      this.logger.error(
        `[GuildMemberService] updateGlobalProfile failed: user=${userId}`,
        getErrorStack(err),
      );
      throw err;
    }
  }

  /** 단일 멤버 조회. null 반환 가능. F-007 */
  async findByUserId(guildId: string, userId: string): Promise<GuildMemberOrmEntity | null> {
    return this.guildMemberRepository.findByGuildAndUser(guildId, userId);
  }

  /** 복수 멤버 조회. Map<userId, GuildMemberOrmEntity> 반환. F-007 */
  async findByUserIds(
    guildId: string,
    userIds: string[],
  ): Promise<Map<string, GuildMemberOrmEntity>> {
    const members = await this.guildMemberRepository.findByGuildAndUsers(guildId, userIds);
    const map = new Map<string, GuildMemberOrmEntity>();
    for (const member of members) {
      map.set(member.userId, member);
    }
    return map;
  }

  /** 활성 멤버 전체 조회. F-007 */
  async findActiveMembers(guildId: string): Promise<GuildMemberOrmEntity[]> {
    return this.guildMemberRepository.findActiveMembers(guildId);
  }

  /** 활성 비봇 멤버 조회. F-007 */
  async findActiveMembersExcludingBots(guildId: string): Promise<GuildMemberOrmEntity[]> {
    return this.guildMemberRepository.findActiveMembersExcludingBots(guildId);
  }

  /** 가입일 이후 멤버 조회. F-007 */
  async findByJoinedAfter(guildId: string, date: Date): Promise<GuildMemberOrmEntity[]> {
    return this.guildMemberRepository.findByJoinedAfter(guildId, date);
  }
}
