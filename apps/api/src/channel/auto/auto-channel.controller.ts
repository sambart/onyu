import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../common/guards/guild-membership.guard';
import { AutoChannelSaveDto } from './dto/auto-channel-save.dto';
import { AutoChannelConfigRepository } from './infrastructure/auto-channel-config.repository';
import type { GuideMessageButtonPayload } from './infrastructure/auto-channel-discord.gateway';
import { AutoChannelDiscordGateway } from './infrastructure/auto-channel-discord.gateway';

/**
 * 안내 메시지 전송/수정에 필요한 최소 필드.
 * save()의 AutoChannelSaveDto와 re-apply()의 저장된 config 양쪽에서 공유한다.
 */
interface GuideMessagePayloadSource {
  guideChannelId?: string;
  guideMessage?: string;
  embedTitle?: string | null;
  embedColor?: string | null;
}

@Controller('api/guilds/:guildId/auto-channel')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class AutoChannelController {
  private readonly logger = new Logger(AutoChannelController.name);

  constructor(
    private readonly configRepo: AutoChannelConfigRepository,
    private readonly discordGateway: AutoChannelDiscordGateway,
  ) {}

  /**
   * POST /api/guilds/:guildId/auto-channel
   *
   * 처리 순서:
   *   1. DB upsert (config + buttons + subOptions)
   *   2. 안내 메시지 전송 또는 갱신 (guideChannelId 텍스트 채널)
   *   3. guideMessageId DB 저장
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async save(
    @Param('guildId') guildId: string,
    @Body() dto: AutoChannelSaveDto,
  ): Promise<{
    ok: boolean;
    configId: number;
    guideMessageId: string | null;
    lastSavedAt: string;
  }> {
    // 1. DB upsert
    const config = await this.configRepo.upsert(guildId, dto);

    // 1-b. 저장 성공 직후 stamp (select/instant 무관 — auto-channel은 저장 시각 = 반영 시각)
    const savedAt = new Date();
    await this.configRepo.stampLastSavedAt(config.id, savedAt);

    this.logger.log(
      `[SAVE] configId=${config.id} mode=${dto.mode} guideMessageId=${config.guideMessageId} guideChannelId=${dto.guideChannelId} buttons=${config.buttons.length}`,
    );

    // 2. 모드별 안내 메시지 처리
    let guideMessageId: string | null = null;

    if (dto.mode === 'instant') {
      // instant 모드: 기존 안내 메시지가 있으면 삭제
      if (config.guideMessageId && config.guideChannelId) {
        try {
          await this.discordGateway.deleteGuideMessage(
            config.guideChannelId,
            config.guideMessageId,
          );
        } catch (error) {
          this.logger.warn(
            `instant 모드 전환 시 안내 메시지 삭제 실패 (configId=${config.id}): ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
        await this.configRepo.updateGuideMessageId(config.id, null);
      }
    } else {
      // select 모드: 안내 메시지 전송/갱신
      const buttonPayloads = config.buttons.map((btn) => ({
        id: btn.id,
        label: btn.label,
        emoji: btn.emoji,
      }));

      try {
        guideMessageId = await this.sendOrEditGuideMessage(
          dto,
          config.guideMessageId,
          buttonPayloads,
        );
      } catch (error) {
        this.logger.warn(
          `Discord 안내 메시지 전송 실패 (configId=${config.id}): ${
            error instanceof Error ? error.message : error
          }`,
        );
        // DB 저장은 성공했으므로 Discord 메시지 실패를 무시하고 계속 진행
      }

      // 3. guideMessageId DB 저장 (Discord 전송 성공 시에만)
      if (guideMessageId) {
        await this.configRepo.updateGuideMessageId(config.id, guideMessageId);
      }
    }

    return { ok: true, configId: config.id, guideMessageId, lastSavedAt: savedAt.toISOString() };
  }

  /** 안내 메시지 전송 또는 수정 후 messageId 반환. */
  private async sendOrEditGuideMessage(
    source: GuideMessagePayloadSource,
    existingMessageId: string | null,
    buttonPayloads: GuideMessageButtonPayload[],
  ): Promise<string> {
    if (!existingMessageId) {
      return this.discordGateway.sendGuideMessage(
        source.guideChannelId,
        source.guideMessage,
        source.embedTitle ?? null,
        source.embedColor ?? null,
        buttonPayloads,
      );
    }

    const editResult = await this.discordGateway.editGuideMessage(
      source.guideChannelId,
      existingMessageId,
      source.guideMessage,
      source.embedTitle ?? null,
      source.embedColor ?? null,
      buttonPayloads,
    );

    if (editResult !== null) {
      return editResult;
    }

    return this.discordGateway.sendGuideMessage(
      source.guideChannelId,
      source.guideMessage,
      source.embedTitle ?? null,
      source.embedColor ?? null,
      buttonPayloads,
    );
  }

  /**
   * POST /api/guilds/:guildId/auto-channel/:configId/re-apply
   *
   * 저장된 config를 기반으로 안내 메시지를 다시 게시한다 ("다시 반영").
   * lastSavedAt은 갱신하지 않는다 — 재게시는 "저장"이 아니라 이미 저장된 config를
   * Discord에 다시 뿌리는 복구성 동작이다 (settings-apply-model 2차 §4-A).
   * instant 모드는 게시할 안내 메시지가 없으므로 no-op 처리한다(웹에서 버튼 disabled로 이미 차단).
   */
  @Post(':configId/re-apply')
  @HttpCode(HttpStatus.OK)
  async reApply(
    @Param('guildId') guildId: string,
    @Param('configId', ParseIntPipe) configId: number,
  ): Promise<{ ok: boolean; guideMessageId: string | null }> {
    const config = await this.configRepo.findById(configId);
    if (config?.guildId !== guildId) {
      throw new NotFoundException(`AutoChannelConfig not found: configId=${configId}`);
    }

    if (config.mode === 'instant' || !config.guideChannelId || !config.guideMessage) {
      return { ok: false, guideMessageId: null };
    }

    const buttonPayloads = config.buttons.map((btn) => ({
      id: btn.id,
      label: btn.label,
      emoji: btn.emoji,
    }));

    const guideMessageId = await this.sendOrEditGuideMessage(
      {
        guideChannelId: config.guideChannelId,
        guideMessage: config.guideMessage,
        embedTitle: config.embedTitle,
        embedColor: config.embedColor,
      },
      config.guideMessageId,
      buttonPayloads,
    );

    await this.configRepo.updateGuideMessageId(config.id, guideMessageId);

    return { ok: true, guideMessageId };
  }

  /**
   * GET /api/guilds/:guildId/auto-channel
   *
   * 서버의 모든 자동방 설정 반환 (웹 대시보드 초기 데이터 로드).
   */
  @Get()
  async findAll(@Param('guildId') guildId: string) {
    return this.configRepo.findAllByGuildId(guildId);
  }

  /**
   * DELETE /api/guilds/:guildId/auto-channel/:configId
   *
   * 처리 순서:
   *   1. configId로 설정 조회 (guildId 일치 확인)
   *   2. guideMessageId가 있으면 Discord 안내 메시지 삭제 시도 (실패해도 무시)
   *   3. DB에서 설정 삭제 (CASCADE로 buttons, subOptions도 삭제)
   */
  @Delete(':configId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('guildId') guildId: string,
    @Param('configId', ParseIntPipe) configId: number,
  ): Promise<{ ok: boolean }> {
    // 1. 설정 조회 및 guildId 일치 확인
    const config = await this.configRepo.findById(configId);
    if (config?.guildId !== guildId) {
      throw new NotFoundException(`AutoChannelConfig not found: configId=${configId}`);
    }

    // 2. Discord 안내 메시지 삭제 시도 (실패 무시)
    if (config.guideMessageId && config.guideChannelId) {
      await this.discordGateway.deleteGuideMessage(config.guideChannelId, config.guideMessageId);
    }

    // 3. DB에서 설정 삭제 (guildId 재검증 포함)
    await this.configRepo.deleteByIdAndGuildId(configId, guildId);

    return { ok: true };
  }
}
