import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';

import { getErrorStack } from '../../common/util/error.util';
import { MissionService } from '../../newbie/application/mission/mission.service';
import { MocoService } from '../../newbie/application/moco/moco.service';
import { NewbieConfigRepository } from '../../newbie/infrastructure/newbie-config.repository';
import { NewbiePeriodRepository } from '../../newbie/infrastructure/newbie-period.repository';
import { NewbieRedisRepository } from '../../newbie/infrastructure/newbie-redis.repository';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

class MemberJoinDto {
  @IsString()
  guildId: string;

  @IsString()
  memberId: string;

  @IsString()
  displayName: string;
}

class MissionRefreshDto {
  @IsString()
  guildId: string;
}

class RoleAssignedDto {
  @IsString()
  guildId: string;

  @IsString()
  memberId: string;
}

/**
 * Bot → API 신규사용자 관련 엔드포인트.
 * Bot의 guildMemberAdd, 갱신 버튼 등을 HTTP로 수신하여 처리한다.
 */
@Controller('bot-api/newbie')
@UseGuards(BotApiAuthGuard)
export class BotNewbieController {
  private readonly logger = new Logger(BotNewbieController.name);

  constructor(
    private readonly missionService: MissionService,
    private readonly mocoService: MocoService,
    private readonly configRepo: NewbieConfigRepository,
    private readonly redisRepo: NewbieRedisRepository,
    private readonly periodRepo: NewbiePeriodRepository,
  ) {}

  /**
   * 신규 멤버 가입 시 미션 생성 (GuildMember 불필요한 부분만 처리).
   * welcomeService, roleService는 GuildMember가 필요하므로 Bot에서 직접 처리한다.
   */
  @Post('member-join')
  @HttpCode(HttpStatus.OK)
  async handleMemberJoin(@Body() dto: MemberJoinDto): Promise<{ ok: boolean }> {
    this.logger.debug(
      `[BOT-API] newbie/member-join: guild=${dto.guildId} member=${dto.memberId} name=${dto.displayName}`,
    );

    try {
      await this.missionService.createMissionFromBot(dto.guildId, dto.memberId, dto.displayName);
    } catch (err) {
      this.logger.error(
        `[member-join] mission creation failed: guild=${dto.guildId} member=${dto.memberId}`,
        getErrorStack(err),
      );
    }

    return { ok: true };
  }

  /**
   * Bot에서 신입 설정 조회.
   * 환영인사/역할 부여 판단을 위해 Bot이 호출한다.
   */
  @Get('config')
  async getConfig(@Query('guildId') guildId: string): Promise<{ ok: boolean; data: unknown }> {
    let config = await this.redisRepo.getConfig(guildId);
    if (!config) {
      config = await this.configRepo.findByGuildId(guildId);
      if (config) await this.redisRepo.setConfig(guildId, config);
    }
    if (!config) return { ok: true, data: null };

    return {
      ok: true,
      data: {
        welcomeEnabled: config.welcomeEnabled,
        welcomeChannelId: config.welcomeChannelId,
        welcomeContent: config.welcomeContent,
        welcomeEmbedTitle: config.welcomeEmbedTitle,
        welcomeEmbedDescription: config.welcomeEmbedDescription,
        welcomeEmbedColor: config.welcomeEmbedColor,
        welcomeEmbedThumbnailUrl: config.welcomeEmbedThumbnailUrl,
        missionEnabled: config.missionEnabled,
        roleEnabled: config.roleEnabled,
        newbieRoleId: config.newbieRoleId,
        roleDurationDays: config.roleDurationDays,
      },
    };
  }

  /**
   * Bot에서 역할 부여 완료 통보.
   * NewbiePeriod 레코드를 생성한다 (기존 NewbieRoleService.assignRole의 DB 부분).
   */
  @Post('role-assigned')
  @HttpCode(HttpStatus.OK)
  async handleRoleAssigned(@Body() dto: RoleAssignedDto): Promise<{ ok: boolean }> {
    try {
      const config = await this.configRepo.findByGuildId(dto.guildId);
      if (config?.roleDurationDays) {
        const { getKSTDateString } = await import('@onyu/shared');
        const startDate = getKSTDateString();
        const expiresDate = this.calcExpiresDate(startDate, config.roleDurationDays);
        await this.periodRepo.create(dto.guildId, dto.memberId, startDate, expiresDate);
        await this.redisRepo.addPeriodActiveMember(dto.guildId, dto.memberId);
        this.logger.log(
          `[BOT-API] NewbiePeriod created: guild=${dto.guildId} member=${dto.memberId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[BOT-API] role-assigned failed: guild=${dto.guildId} member=${dto.memberId}`,
        getErrorStack(err),
      );
    }
    return { ok: true };
  }

  private calcExpiresDate(startDate: string, days: number): string {
    const year = parseInt(startDate.slice(0, 4), 10);
    const month = parseInt(startDate.slice(4, 6), 10) - 1;
    const day = parseInt(startDate.slice(6, 8), 10);
    const date = new Date(year, month, day);
    date.setDate(date.getDate() + days);
    const y = date.getFullYear().toString();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}${m}${d}`;
  }

  @Post('mission-refresh')
  @HttpCode(HttpStatus.OK)
  async refreshMissionEmbed(@Body() dto: MissionRefreshDto): Promise<{ ok: boolean }> {
    await this.missionService.invalidateAndRefresh(dto.guildId);
    return { ok: true };
  }

  @Get('moco-rank')
  async getMocoRank(
    @Query('guildId') guildId: string,
    @Query('page') page: string,
  ): Promise<unknown> {
    return this.mocoService.buildRankPayload(guildId, parseInt(page, 10) || 1);
  }

  @Get('moco-my')
  async getMyHunting(
    @Query('guildId') guildId: string,
    @Query('userId') userId: string,
  ): Promise<{ ok: boolean; data: string }> {
    const message = await this.mocoService.buildMyHuntingMessage(guildId, userId);
    return { ok: true, data: message };
  }
}
