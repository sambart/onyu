import { Injectable, Logger } from '@nestjs/common';

import { getErrorMessage } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import type { GuildMemberOrmEntity } from '../../../guild-member/infrastructure/guild-member.orm-entity';

/** Discord REST API 액션 (역할 부여/강퇴/DM) 및 DB 기반 멤버 조회 전담. */
@Injectable()
export class MissionDiscordActionService {
  private readonly logger = new Logger(MissionDiscordActionService.name);

  constructor(
    private readonly discordRest: DiscordRestService,
    private readonly guildMemberService: GuildMemberService,
  ) {}

  /**
   * 멤버에게 역할을 부여한다.
   * @returns warning 메시지 (실패 시) 또는 undefined
   */
  async grantRole(guildId: string, memberId: string, roleId: string): Promise<string | undefined> {
    try {
      await this.discordRest.addMemberRole(guildId, memberId, roleId);
      this.logger.log(`[MISSION] Role granted: member=${memberId} role=${roleId}`);
      return undefined;
    } catch (err) {
      const warning = `역할 부여에 실패했습니다: ${getErrorMessage(err)}`;
      this.logger.warn(`[MISSION] Role grant failed: ${warning}`);
      return warning;
    }
  }

  /**
   * DM 사유 전송 후 멤버를 강퇴한다.
   * @returns warning 메시지 (실패 시) 또는 undefined
   */
  async sendDmAndKick(
    guildId: string,
    memberId: string,
    dmReason?: string | null,
  ): Promise<string | undefined> {
    try {
      if (dmReason) {
        await this.discordRest.sendDM(memberId, dmReason).catch(() => {
          this.logger.warn(`[MISSION] DM failed (blocked or unavailable): member=${memberId}`);
        });
      }

      await this.discordRest.kickMember(guildId, memberId, '미션 실패 처리');
      this.logger.log(`[MISSION] Kicked: member=${memberId}`);
      return undefined;
    } catch (err) {
      const warning = `강퇴에 실패했습니다: ${getErrorMessage(err)}`;
      this.logger.warn(`[MISSION] Kick failed: ${warning}`);
      return warning;
    }
  }

  /**
   * 길드 활성 비봇 멤버 목록을 DB에서 조회한다.
   * @returns GuildMemberOrmEntity 배열 또는 null
   */
  async fetchGuildMembers(guildId: string): Promise<GuildMemberOrmEntity[] | null> {
    try {
      return await this.guildMemberService.findActiveMembersExcludingBots(guildId);
    } catch (err) {
      this.logger.warn(
        `[MISSION] fetchGuildMembers failed: guild=${guildId}`,
        err instanceof Error ? err.stack : err,
      );
      return null;
    }
  }

  /**
   * DB에서 멤버 활성 여부를 확인한다.
   * @returns { member, isConfirmedAbsent }
   *   - member가 null이고 isConfirmedAbsent가 false이면 판단 불가(DB에 없음)
   *   - member가 null이고 isConfirmedAbsent가 true이면 탈퇴 확정
   */
  async checkMemberExists(
    guildId: string,
    memberId: string,
  ): Promise<{ member: GuildMemberOrmEntity | null; isConfirmedAbsent: boolean }> {
    const member = await this.guildMemberService.findByUserId(guildId, memberId);
    if (!member) {
      // DB에 없는 경우는 판단 불가로 처리
      return { member: null, isConfirmedAbsent: false };
    }
    if (member.isActive === false) {
      return { member: null, isConfirmedAbsent: true };
    }
    return { member, isConfirmedAbsent: false };
  }

  /**
   * 멤버의 displayName을 DB에서 조회한다.
   */
  async fetchMemberDisplayName(guildId: string, memberId: string): Promise<string | null> {
    const member = await this.guildMemberService.findByUserId(guildId, memberId);
    return member?.displayName ?? null;
  }
}
