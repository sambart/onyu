import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { getErrorStack } from '../../common/util/error.util';
import { MissionService } from '../application/mission/mission.service';
import { MocoService } from '../application/moco/moco.service';
import { findInvalidVars } from '../application/util/newbie-template-validator.util';
import { MissionStatus } from '../domain/newbie-mission.types';
import { NewbieConfigRepository } from '../infrastructure/newbie-config.repository';
import { NewbieMissionRepository } from '../infrastructure/newbie-mission.repository';
import { NewbieMissionTemplateRepository } from '../infrastructure/newbie-mission-template.repository';
import { NewbieMocoTemplateRepository } from '../infrastructure/newbie-moco-template.repository';
import { NewbieRedisRepository } from '../infrastructure/newbie-redis.repository';
import {
  DEFAULT_MOCO_BODY_TEMPLATE,
  DEFAULT_MOCO_FOOTER_TEMPLATE,
  DEFAULT_MOCO_ITEM_TEMPLATE,
  DEFAULT_MOCO_SCORING_TEMPLATE,
  DEFAULT_MOCO_TITLE_TEMPLATE,
  MISSION_FOOTER_ALLOWED_VARS,
  MISSION_HEADER_ALLOWED_VARS,
  MISSION_ITEM_ALLOWED_VARS,
  MISSION_TITLE_ALLOWED_VARS,
  MOCO_BODY_ALLOWED_VARS,
  MOCO_FOOTER_ALLOWED_VARS,
  MOCO_ITEM_ALLOWED_VARS,
  MOCO_SCORING_ALLOWED_VARS,
  MOCO_TITLE_ALLOWED_VARS,
} from '../infrastructure/newbie-template.constants';
import { MissionCompleteDto, MissionFailDto, MissionHideDto } from './dto/mission-action.dto';
import { NewbieConfigSaveDto } from './dto/newbie-config-save.dto';
import { NewbieMissionTemplateSaveDto } from './dto/newbie-mission-template-save.dto';
import { NewbieMocoTemplateSaveDto } from './dto/newbie-moco-template-save.dto';

@Controller('api/guilds/:guildId/newbie')
@UseGuards(JwtAuthGuard)
export class NewbieController {
  private readonly logger = new Logger(NewbieController.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly missionRepo: NewbieMissionRepository,
    private readonly redisRepo: NewbieRedisRepository,
    private readonly missionService: MissionService,
    private readonly mocoService: MocoService,
    private readonly missionTmplRepo: NewbieMissionTemplateRepository,
    private readonly mocoTmplRepo: NewbieMocoTemplateRepository,
  ) {}

  /**
   * GET /api/guilds/:guildId/newbie/config
   * 설정 조회. Redis 캐시 우선, 미스 시 DB 조회 후 캐시 저장.
   */
  @Get('config')
  async getConfig(@Param('guildId') guildId: string) {
    const cached = await this.redisRepo.getConfig(guildId);
    if (cached) return cached;

    const config = await this.configRepo.findByGuildId(guildId);
    if (config) {
      await this.redisRepo.setConfig(guildId, config);
    }
    return config;
  }

  /**
   * POST /api/guilds/:guildId/newbie/config
   * 설정 저장. DB upsert 후 Redis 캐시 갱신.
   * 반환: { ok: boolean }
   */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: NewbieConfigSaveDto,
  ): Promise<{ ok: boolean }> {
    // prevConfig 스냅샷 (dto와 비교하여 변경 감지용, TypeORM identity map 무관)
    const prevConfig = await this.configRepo.findByGuildId(guildId);
    const prevMission = {
      channelId: prevConfig?.missionNotifyChannelId ?? null,
      messageId: prevConfig?.missionNotifyMessageId ?? null,
    };
    const prevMoco = {
      channelId: prevConfig?.mocoRankChannelId ?? null,
      messageId: prevConfig?.mocoRankMessageId ?? null,
    };

    const savedConfig = await this.configRepo.upsert(guildId, dto);

    // mocoResetPeriod가 MONTHLY/CUSTOM으로 변경되었고 mocoCurrentPeriodStart가 아직 없으면 오늘 날짜로 초기화
    const prevPeriod = prevConfig?.mocoResetPeriod ?? 'NONE';
    const newPeriod = dto.mocoResetPeriod ?? 'NONE';
    if (newPeriod !== 'NONE' && (prevPeriod !== newPeriod || !savedConfig.mocoCurrentPeriodStart)) {
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const today = kst.toISOString().slice(0, 10).replace(/-/g, '');
      await this.configRepo.updateMocoCurrentPeriodStart(guildId, today);
      savedConfig.mocoCurrentPeriodStart = today;
    }

    await this.redisRepo.setConfig(guildId, savedConfig);

    // missionUseMicTime 변경 시 진행 중 미션의 누적 시간 재계산 강제 + Canvas 캐시 삭제
    const prevUseMicTime = prevConfig?.missionUseMicTime ?? false;
    const newUseMicTime = savedConfig.missionUseMicTime;
    if (prevUseMicTime !== newUseMicTime) {
      await this.redisRepo.deleteMissionActive(guildId);
      await this.missionService.invalidateMissionCanvasCache(guildId);
    }

    // 미션 Embed: 저장 시 항상 기존 메시지 삭제 후 새로 전송한다.
    // Discord API 오류가 설정 저장 자체를 실패시키지 않도록 try-catch 처리.
    try {
      if (savedConfig.missionEnabled && savedConfig.missionNotifyChannelId) {
        if (prevMission.messageId && prevMission.channelId) {
          await this.missionService.deleteEmbed(prevMission.channelId, prevMission.messageId);
          await this.configRepo.updateMissionNotifyMessageId(guildId, null);
          savedConfig.missionNotifyMessageId = null;
        }
        await this.missionService.refreshMissionEmbed(guildId, savedConfig);
      } else if (
        prevMission.messageId &&
        prevMission.channelId &&
        !savedConfig.missionNotifyChannelId
      ) {
        await this.missionService.deleteEmbed(prevMission.channelId, prevMission.messageId);
        await this.configRepo.updateMissionNotifyMessageId(guildId, null);
      }
    } catch (err) {
      this.logger.error(`[MISSION] Embed 갱신 실패: guild=${guildId}`, getErrorStack(err));
    }

    // 모코코 Embed: 저장 시 항상 기존 메시지 삭제 후 새로 전송한다.
    try {
      if (savedConfig.mocoEnabled && savedConfig.mocoRankChannelId) {
        if (prevMoco.messageId && prevMoco.channelId) {
          await this.mocoService.deleteEmbed(prevMoco.channelId, prevMoco.messageId);
          await this.configRepo.updateMocoRankMessageId(guildId, null);
          savedConfig.mocoRankMessageId = null;
        }
        await this.mocoService.sendOrUpdateRankEmbed(guildId, 1);
      } else if (prevMoco.messageId && prevMoco.channelId && !savedConfig.mocoRankChannelId) {
        await this.mocoService.deleteEmbed(prevMoco.channelId, prevMoco.messageId);
        await this.configRepo.updateMocoRankMessageId(guildId, null);
      }
    } catch (err) {
      this.logger.error(`[MOCO] Embed 갱신 실패: guild=${guildId}`, getErrorStack(err));
    }

    return { ok: true };
  }

  /**
   * GET /api/guilds/:guildId/newbie/missions
   * 길드의 미션 목록 통합 조회 (상태 필터 + 페이지네이션). F-NEWBIE-005.
   * status 생략 시 전체 상태 조회.
   */
  @Get('missions')
  async getMissions(
    @Param('guildId') guildId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = parseInt(page ?? '', 10);
    const parsedPageSize = parseInt(pageSize ?? '', 10);
    const resolvedPage = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const resolvedPageSize = isNaN(parsedPageSize) || parsedPageSize < 1 ? 10 : parsedPageSize;

    const validStatuses = Object.values(MissionStatus);
    // includes() 호출로 런타임 검증 후 단언하므로 안전
    const resolvedStatus =
      status && validStatuses.includes(status as MissionStatus)
        ? (status as MissionStatus)
        : undefined;

    const { items, total } = await this.missionRepo.findByGuild(
      guildId,
      resolvedStatus,
      resolvedPage,
      resolvedPageSize,
    );

    const enriched = await this.missionService.enrichMissionItems(guildId, items);

    return { items: enriched, total, page: resolvedPage, pageSize: resolvedPageSize };
  }

  /**
   * POST /api/guilds/:guildId/newbie/missions/complete
   * 미션 수동 성공 처리. F-NEWBIE-005.
   */
  @Post('missions/complete')
  @HttpCode(HttpStatus.OK)
  async completeMission(@Param('guildId') guildId: string, @Body() dto: MissionCompleteDto) {
    return this.missionService.completeMission(guildId, dto.missionId, dto.roleId);
  }

  /**
   * POST /api/guilds/:guildId/newbie/missions/fail
   * 미션 수동 실패 처리. F-NEWBIE-005.
   */
  @Post('missions/fail')
  @HttpCode(HttpStatus.OK)
  async failMission(@Param('guildId') guildId: string, @Body() dto: MissionFailDto) {
    return this.missionService.failMission(guildId, dto.missionId, dto.kick, dto.dmReason);
  }

  /**
   * POST /api/guilds/:guildId/newbie/missions/hide
   * 미션 Embed 숨김 처리. F-NEWBIE-005.
   */
  @Post('missions/hide')
  @HttpCode(HttpStatus.OK)
  async hideMission(
    @Param('guildId') guildId: string,
    @Body() dto: MissionHideDto,
  ): Promise<{ ok: boolean }> {
    await this.missionService.hideMission(guildId, dto.missionId);
    return { ok: true };
  }

  /**
   * POST /api/guilds/:guildId/newbie/missions/unhide
   * 미션 Embed 숨김 해제. F-NEWBIE-005.
   */
  @Post('missions/unhide')
  @HttpCode(HttpStatus.OK)
  async unhideMission(
    @Param('guildId') guildId: string,
    @Body() dto: MissionHideDto,
  ): Promise<{ ok: boolean }> {
    await this.missionService.unhideMission(guildId, dto.missionId);
    return { ok: true };
  }

  /**
   * GET /api/guilds/:guildId/newbie/moco?page=1&pageSize=10
   * 모코코 사냥 순위 페이지 조회.
   * 반환: { items: Array<{ hunterId, totalMinutes }>, total: number, page: number, pageSize: number }
   */
  @Get('moco')
  async getMocoRank(
    @Param('guildId') guildId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = parseInt(page ?? '', 10);
    const parsedPageSize = parseInt(pageSize ?? '', 10);

    const resolvedPage = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const resolvedPageSize = isNaN(parsedPageSize) || parsedPageSize < 1 ? 10 : parsedPageSize;

    const total = await this.redisRepo.getMocoRankCount(guildId);
    const totalPages = Math.max(1, Math.ceil(total / resolvedPageSize));
    const clampedPage = Math.min(resolvedPage, totalPages);

    const rawItems = await this.redisRepo.getMocoRankPage(guildId, clampedPage, resolvedPageSize);

    // Enrich each item with meta data (score, sessionCount, uniqueNewbieCount)
    const items = await Promise.all(
      rawItems.map(async (item) => {
        const meta = await this.redisRepo.getMocoHunterMeta(guildId, item.hunterId);
        return {
          ...item,
          score: meta?.score ?? Math.round(item.totalMinutes),
          sessionCount: meta?.sessionCount ?? 0,
          uniqueNewbieCount: meta?.uniqueNewbieCount ?? 0,
          channelMinutes: meta?.totalMinutes ?? Math.round(item.totalMinutes),
        };
      }),
    );

    return { items, total, page: clampedPage, pageSize: resolvedPageSize };
  }

  /**
   * GET /api/guilds/:guildId/newbie/moco/:hunterId
   * 특정 사냥꾼이 도움한 모코코 상세 목록 반환.
   * 반환: { newbies: Array<{ newbieId, newbieName, minutes, sessions }> }
   */
  @Get('moco/:hunterId')
  async getMocoHunterDetail(
    @Param('guildId') guildId: string,
    @Param('hunterId') hunterId: string,
  ): Promise<{
    newbies: Array<{ newbieId: string; newbieName: string; minutes: number; sessions: number }>;
  }> {
    const newbies = await this.mocoService.getHunterDetail(guildId, hunterId);
    return { newbies };
  }

  /**
   * GET /api/guilds/:guildId/newbie/mission-template
   * 미션 템플릿 조회. 레코드 없으면 null 반환 (프론트에서 기본값 표시).
   */
  @Get('mission-template')
  async getMissionTemplate(@Param('guildId') guildId: string) {
    return this.missionTmplRepo.findByGuildId(guildId);
  }

  /**
   * POST /api/guilds/:guildId/newbie/mission-template
   * 미션 템플릿 저장. 허용 변수 검증 후 upsert.
   * 검증 실패 시 400 응답.
   */
  @Post('mission-template')
  @HttpCode(HttpStatus.OK)
  async saveMissionTemplate(
    @Param('guildId') guildId: string,
    @Body() dto: NewbieMissionTemplateSaveDto,
  ): Promise<{ ok: boolean }> {
    this.validateMissionTemplate(dto);
    await this.missionTmplRepo.upsert(guildId, dto);
    return { ok: true };
  }

  /**
   * GET /api/guilds/:guildId/newbie/moco-template
   * 모코코 템플릿 조회. 레코드 없으면 null 반환.
   */
  @Get('moco-template')
  async getMocoTemplate(@Param('guildId') guildId: string) {
    const tmpl = await this.mocoTmplRepo.findByGuildId(guildId);
    return {
      titleTemplate: tmpl?.titleTemplate ?? DEFAULT_MOCO_TITLE_TEMPLATE,
      bodyTemplate: tmpl?.bodyTemplate ?? DEFAULT_MOCO_BODY_TEMPLATE,
      itemTemplate: tmpl?.itemTemplate ?? DEFAULT_MOCO_ITEM_TEMPLATE,
      footerTemplate: tmpl?.footerTemplate ?? DEFAULT_MOCO_FOOTER_TEMPLATE,
      scoringTemplate: tmpl?.scoringTemplate ?? DEFAULT_MOCO_SCORING_TEMPLATE,
    };
  }

  /**
   * POST /api/guilds/:guildId/newbie/moco-template
   * 모코코 템플릿 저장. 허용 변수 검증 후 upsert.
   * 검증 실패 시 400 응답.
   */
  @Post('moco-template')
  @HttpCode(HttpStatus.OK)
  async saveMocoTemplate(
    @Param('guildId') guildId: string,
    @Body() dto: NewbieMocoTemplateSaveDto,
  ): Promise<{ ok: boolean }> {
    this.validateMocoTemplate(dto);
    await this.mocoTmplRepo.upsert(guildId, dto);
    return { ok: true };
  }

  private validateMissionTemplate(dto: NewbieMissionTemplateSaveDto): void {
    const errors: Record<string, string[]> = {};

    if (dto.titleTemplate) {
      const invalid = findInvalidVars(dto.titleTemplate, MISSION_TITLE_ALLOWED_VARS);
      if (invalid.length > 0) errors['titleTemplate'] = invalid;
    }
    if (dto.headerTemplate) {
      const invalid = findInvalidVars(dto.headerTemplate, MISSION_HEADER_ALLOWED_VARS);
      if (invalid.length > 0) errors['headerTemplate'] = invalid;
    }
    if (dto.itemTemplate) {
      const invalid = findInvalidVars(dto.itemTemplate, MISSION_ITEM_ALLOWED_VARS);
      if (invalid.length > 0) errors['itemTemplate'] = invalid;
    }
    if (dto.footerTemplate) {
      const invalid = findInvalidVars(dto.footerTemplate, MISSION_FOOTER_ALLOWED_VARS);
      if (invalid.length > 0) errors['footerTemplate'] = invalid;
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: '허용되지 않은 변수가 포함되어 있습니다.', errors });
    }
  }

  private validateMocoTemplate(dto: NewbieMocoTemplateSaveDto): void {
    const errors: Record<string, string[]> = {};

    if (dto.titleTemplate) {
      const invalid = findInvalidVars(dto.titleTemplate, MOCO_TITLE_ALLOWED_VARS);
      if (invalid.length > 0) errors['titleTemplate'] = invalid;
    }
    if (dto.bodyTemplate) {
      const invalid = findInvalidVars(dto.bodyTemplate, MOCO_BODY_ALLOWED_VARS);
      if (invalid.length > 0) errors['bodyTemplate'] = invalid;
    }
    if (dto.itemTemplate) {
      const invalid = findInvalidVars(dto.itemTemplate, MOCO_ITEM_ALLOWED_VARS);
      if (invalid.length > 0) errors['itemTemplate'] = invalid;
    }
    if (dto.footerTemplate) {
      const invalid = findInvalidVars(dto.footerTemplate, MOCO_FOOTER_ALLOWED_VARS);
      if (invalid.length > 0) errors['footerTemplate'] = invalid;
    }
    if (dto.scoringTemplate) {
      const invalid = findInvalidVars(dto.scoringTemplate, MOCO_SCORING_ALLOWED_VARS);
      if (invalid.length > 0) errors['scoringTemplate'] = invalid;
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: '허용되지 않은 변수가 포함되어 있습니다.', errors });
    }
  }
}
