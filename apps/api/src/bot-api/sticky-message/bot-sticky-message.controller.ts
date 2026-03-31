import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  OnApplicationShutdown,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString } from 'class-validator';

import { StickyMessageConfigService } from '../../sticky-message/application/sticky-message-config.service';
import { StickyMessageRefreshService } from '../../sticky-message/application/sticky-message-refresh.service';
import { StickyMessageConfigRepository } from '../../sticky-message/infrastructure/sticky-message-config.repository';
import { StickyMessageRedisRepository } from '../../sticky-message/infrastructure/sticky-message-redis.repository';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

class MessageCreatedDto {
  @IsString()
  guildId: string;

  @IsString()
  channelId: string;

  @IsString()
  authorId: string;

  @IsBoolean()
  isBot: boolean;
}

/** 디바운스 대기 시간 (ms): Redis TTL(3초) 이내에서 마지막 메시지 기준으로 지연 */
const DEBOUNCE_DELAY_MS = 1500;

/**
 * Bot -> API 고정메세지 이벤트 수신 엔드포인트.
 * Bot의 messageCreate 이벤트를 HTTP로 수신하여 디바운스 후 고정메세지를 갱신한다.
 */
@Controller('bot-api/sticky-message')
@UseGuards(BotApiAuthGuard)
export class BotStickyMessageController implements OnApplicationShutdown {
  private readonly logger = new Logger(BotStickyMessageController.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly redisRepo: StickyMessageRedisRepository,
    private readonly configRepo: StickyMessageConfigRepository,
    private readonly refreshService: StickyMessageRefreshService,
    private readonly configService: StickyMessageConfigService,
  ) {}

  onApplicationShutdown(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  @Post('message-created')
  @HttpCode(HttpStatus.OK)
  async handleMessageCreated(@Body() dto: MessageCreatedDto): Promise<{ ok: boolean }> {
    this.logger.debug(
      `[BOT-API] sticky-message/message-created: guild=${dto.guildId} channel=${dto.channelId} author=${dto.authorId}`,
    );

    // 봇 자신의 메시지이고 해당 채널에서 고정메세지 재전송 진행 중이면 무시 (무한루프 방지)
    if (dto.isBot && this.refreshService.isRefreshing(dto.channelId)) {
      return { ok: true };
    }

    const { guildId, channelId } = dto;

    // 설정 조회 (Redis 캐시 우선)
    let configs = await this.redisRepo.getConfig(guildId);
    if (!configs) {
      configs = await this.configRepo.findByGuildId(guildId);
      await this.redisRepo.setConfig(guildId, configs);
    }

    // 해당 채널에 활성화된 고정메세지 설정이 없으면 무시
    const hasConfig = configs.some((c) => c.channelId === channelId && c.enabled);
    if (!hasConfig) {
      return { ok: true };
    }

    // 디바운스: 기존 타이머가 있으면 취소하고 새로 설정
    const existing = this.timers.get(channelId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(channelId);
      this.refreshService.refresh(guildId, channelId).catch((err: Error) => {
        this.logger.error(
          `[messageCreated] refresh failed: guild=${guildId} channel=${channelId}`,
          err.stack,
        );
      });
    }, DEBOUNCE_DELAY_MS);
    this.timers.set(channelId, timer);

    this.redisRepo.setDebounce(channelId).catch((err: Error) => {
      this.logger.warn(`[messageCreated] setDebounce failed: channel=${channelId}`, err.stack);
    });

    return { ok: true };
  }

  /** 서버의 고정메세지 설정 목록 조회 (Bot 슬래시 커맨드 /고정메세지목록 용) */
  @Get('configs')
  async getConfigs(@Query('guildId') guildId: string): Promise<{
    ok: boolean;
    data: Array<{
      channelId: string;
      embedTitle: string | null;
      enabled: boolean;
    }>;
  }> {
    const configs = await this.configService.getConfigs(guildId);

    return {
      ok: true,
      data: configs.map((c) => ({
        channelId: c.channelId,
        embedTitle: c.embedTitle,
        enabled: c.enabled,
      })),
    };
  }

  /** 채널 내 고정메세지 전체 삭제 (Bot 슬래시 커맨드 /고정메세지삭제 용) */
  @Delete('by-channel')
  @HttpCode(HttpStatus.OK)
  async deleteByChannel(
    @Query('guildId') guildId: string,
    @Query('channelId') channelId: string,
  ): Promise<{ ok: boolean; deletedCount: number }> {
    const { deletedCount } = await this.configService.deleteByChannel(guildId, channelId);

    return { ok: true, deletedCount };
  }
}
