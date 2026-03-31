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
import { AutoChannelSaveDto } from './dto/auto-channel-save.dto';
import { AutoChannelConfigRepository } from './infrastructure/auto-channel-config.repository';
import type { GuideMessageButtonPayload } from './infrastructure/auto-channel-discord.gateway';
import { AutoChannelDiscordGateway } from './infrastructure/auto-channel-discord.gateway';

@Controller('api/guilds/:guildId/auto-channel')
@UseGuards(JwtAuthGuard)
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
  ): Promise<{ ok: boolean; configId: number; guideMessageId: string | null }> {
    // 1. DB upsert
    const config = await this.configRepo.upsert(guildId, dto);

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

    return { ok: true, configId: config.id, guideMessageId };
  }

  /** 안내 메시지 전송 또는 수정 후 messageId 반환. */
  private async sendOrEditGuideMessage(
    dto: AutoChannelSaveDto,
    existingMessageId: string | null,
    buttonPayloads: GuideMessageButtonPayload[],
  ): Promise<string> {
    if (!existingMessageId) {
      return this.discordGateway.sendGuideMessage(
        dto.guideChannelId,
        dto.guideMessage,
        dto.embedTitle ?? null,
        dto.embedColor ?? null,
        buttonPayloads,
      );
    }

    const editResult = await this.discordGateway.editGuideMessage(
      dto.guideChannelId,
      existingMessageId,
      dto.guideMessage,
      dto.embedTitle ?? null,
      dto.embedColor ?? null,
      buttonPayloads,
    );

    if (editResult !== null) {
      return editResult;
    }

    return this.discordGateway.sendGuideMessage(
      dto.guideChannelId,
      dto.guideMessage,
      dto.embedTitle ?? null,
      dto.embedColor ?? null,
      buttonPayloads,
    );
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
