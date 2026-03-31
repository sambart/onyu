import { Injectable, Logger } from '@nestjs/common';
import { getKSTDateString } from '@onyu/shared';
import { GuildMember } from 'discord.js';

import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbiePeriodRepository } from '../../infrastructure/newbie-period.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';

@Injectable()
export class NewbieRoleService {
  private readonly logger = new Logger(NewbieRoleService.name);

  constructor(
    private readonly periodRepository: NewbiePeriodRepository,
    private readonly redisRepository: NewbieRedisRepository,
  ) {}

  /**
   * guildMemberAdd 이벤트 수신 시 NewbieMemberAddHandler에서 호출된다.
   * config는 Handler에서 이미 조회하여 전달한다.
   * roleEnabled 조건은 Handler에서 사전 확인됨.
   */
  async assignRole(member: GuildMember, config: NewbieConfig): Promise<void> {
    if (!config.newbieRoleId) {
      this.logger.debug(`[NEWBIE ROLE] newbieRoleId not set: guild=${member.guild.id}`);
      return;
    }

    const guildId = member.guild.id;
    const memberId = member.id;
    const roleId = config.newbieRoleId;

    // 1. Discord API — 역할 부여 (GuildMember 객체를 통해 직접 호출)
    try {
      await member.roles.add(roleId);
    } catch (error) {
      this.logger.error(
        `[NEWBIE ROLE] Failed to assign role ${roleId} to ${memberId} in guild ${guildId}`,
        error instanceof Error ? error.stack : error,
      );
      return;
    }
    this.logger.log(`[NEWBIE ROLE] Assigned role ${roleId} to ${memberId} in guild ${guildId}`);

    // 2. NewbiePeriod 레코드 생성 + Redis 갱신
    try {
      const startDate = getKSTDateString();
      const expiresDate = this.calcExpiresDate(startDate, config.roleDurationDays!);

      await this.periodRepository.create(guildId, memberId, startDate, expiresDate);
      await this.redisRepository.addPeriodActiveMember(guildId, memberId);

      this.logger.log(
        `[NEWBIE ROLE] NewbiePeriod created: guild=${guildId} member=${memberId} ` +
          `startDate=${startDate} expiresDate=${expiresDate}`,
      );
    } catch (error) {
      this.logger.error(
        `[NEWBIE ROLE] Failed to create period record: guild=${guildId} member=${memberId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** startDate(YYYYMMDD) + days 일수를 더한 expiresDate(YYYYMMDD) 계산 */
  private calcExpiresDate(startDate: string, days: number): string {
    const year = parseInt(startDate.slice(0, 4), 10);
    const month = parseInt(startDate.slice(4, 6), 10) - 1; // 0-indexed
    const day = parseInt(startDate.slice(6, 8), 10);

    const date = new Date(year, month, day);
    date.setDate(date.getDate() + days);

    const y = date.getFullYear().toString();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}${m}${d}`;
  }
}
