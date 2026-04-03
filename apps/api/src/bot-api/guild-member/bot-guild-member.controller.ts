import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';

import { getErrorStack } from '../../common/util/error.util';
import { GuildMemberService } from '../../guild-member/application/guild-member.service';
import { BotApiAuthGuard } from '../bot-api-auth.guard';
import { GuildMemberDeactivateDto } from './dto/guild-member-deactivate.dto';
import { GuildMemberSyncDto } from './dto/guild-member-sync.dto';
import { GuildMemberUpdateDisplayNameDto } from './dto/guild-member-update-display-name.dto';
import { GuildMemberUpdateGlobalProfileDto } from './dto/guild-member-update-global-profile.dto';
import { GuildMemberUpsertDto } from './dto/guild-member-upsert.dto';

/**
 * Bot → API 길드 멤버 관련 엔드포인트.
 * Discord Gateway 이벤트(guildMemberAdd/Update/Remove, userUpdate, clientReady, guildCreate)를 HTTP로 수신하여 처리한다.
 */
@Controller('bot-api/guild-member')
@UseGuards(BotApiAuthGuard)
export class BotGuildMemberController {
  private readonly logger = new Logger(BotGuildMemberController.name);

  constructor(private readonly guildMemberService: GuildMemberService) {}

  /**
   * 초기 동기화 및 길드 추가 시 전체 멤버 bulk upsert (F-001, F-002).
   * clientReady 또는 guildCreate 이벤트에서 호출된다.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(@Body() dto: GuildMemberSyncDto): Promise<{ ok: boolean; upserted: number }> {
    this.logger.log(
      `[BOT-API] guild-member/sync: guild=${dto.guildId} count=${dto.members.length}`,
    );

    try {
      await this.guildMemberService.bulkUpsertMembers(dto.guildId, dto.members);
    } catch (err) {
      this.logger.error(
        `[BOT-API] guild-member/sync failed: guild=${dto.guildId}`,
        getErrorStack(err),
      );
    }

    return { ok: true, upserted: dto.members.length };
  }

  /**
   * 멤버 입장 처리 (F-003).
   * guildMemberAdd 이벤트에서 호출된다.
   */
  @Post('upsert')
  @HttpCode(HttpStatus.OK)
  async upsert(@Body() dto: GuildMemberUpsertDto): Promise<{ ok: boolean }> {
    this.logger.debug(`[BOT-API] guild-member/upsert: guild=${dto.guildId} user=${dto.userId}`);

    try {
      await this.guildMemberService.upsertMember(dto.guildId, {
        userId: dto.userId,
        displayName: dto.displayName,
        username: dto.username,
        nick: dto.nick,
        avatarUrl: dto.avatarUrl,
        isBot: dto.isBot,
        joinedAt: dto.joinedAt,
      });
    } catch (err) {
      this.logger.error(
        `[BOT-API] guild-member/upsert failed: guild=${dto.guildId} user=${dto.userId}`,
        getErrorStack(err),
      );
    }

    return { ok: true };
  }

  /**
   * 멤버 퇴장 처리 (F-006).
   * guildMemberRemove 이벤트에서 호출된다.
   */
  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Body() dto: GuildMemberDeactivateDto): Promise<{ ok: boolean }> {
    this.logger.debug(`[BOT-API] guild-member/deactivate: guild=${dto.guildId} user=${dto.userId}`);

    try {
      await this.guildMemberService.deactivateMember(dto.guildId, dto.userId);
    } catch (err) {
      this.logger.error(
        `[BOT-API] guild-member/deactivate failed: guild=${dto.guildId} user=${dto.userId}`,
        getErrorStack(err),
      );
    }

    return { ok: true };
  }

  /**
   * 닉네임 변경 처리 (F-004).
   * guildMemberUpdate 이벤트에서 호출된다.
   */
  @Post('update-display-name')
  @HttpCode(HttpStatus.OK)
  async updateDisplayName(@Body() dto: GuildMemberUpdateDisplayNameDto): Promise<{ ok: boolean }> {
    this.logger.debug(
      `[BOT-API] guild-member/update-display-name: guild=${dto.guildId} user=${dto.userId}`,
    );

    try {
      await this.guildMemberService.updateDisplayName(
        dto.guildId,
        dto.userId,
        dto.displayName,
        dto.nick ?? null,
        dto.avatarUrl ?? null,
      );
    } catch (err) {
      this.logger.error(
        `[BOT-API] guild-member/update-display-name failed: guild=${dto.guildId} user=${dto.userId}`,
        getErrorStack(err),
      );
    }

    return { ok: true };
  }

  /**
   * 전역 프로필 변경 처리 (F-005).
   * userUpdate 이벤트에서 호출된다. nick=null인 행만 갱신된다.
   */
  @Post('update-global-profile')
  @HttpCode(HttpStatus.OK)
  async updateGlobalProfile(
    @Body() dto: GuildMemberUpdateGlobalProfileDto,
  ): Promise<{ ok: boolean }> {
    this.logger.debug(`[BOT-API] guild-member/update-global-profile: user=${dto.userId}`);

    try {
      await this.guildMemberService.updateGlobalProfile(dto.userId, dto.displayName, dto.username);
    } catch (err) {
      this.logger.error(
        `[BOT-API] guild-member/update-global-profile failed: user=${dto.userId}`,
        getErrorStack(err),
      );
    }

    return { ok: true };
  }
}
