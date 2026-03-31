import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';

import type { MusicChannelConfigOrm } from '../../music/infrastructure/music-channel-config.orm-entity';
import { MusicChannelConfigRepository } from '../../music/infrastructure/music-channel-config.repository';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

class UpdateMessageIdDto {
  @IsString()
  guildId: string;

  @IsOptional()
  @IsString()
  messageId: string | null;
}

/**
 * Bot → API 음악 채널 설정 조회 엔드포인트.
 */
@Controller('bot-api/music')
@UseGuards(BotApiAuthGuard)
export class BotMusicController {
  constructor(private readonly configRepo: MusicChannelConfigRepository) {}

  /** Bot이 guildId로 음악 채널 설정을 조회한다. */
  @Get('channel-config')
  async getChannelConfig(
    @Query('guildId') guildId: string,
  ): Promise<{ ok: boolean; data: MusicChannelConfigOrm | null }> {
    const data = await this.configRepo.findByGuildId(guildId);
    return { ok: true, data };
  }

  /** Bot이 channelId로 음악 채널 설정을 조회한다 (메시지 리스너용). */
  @Get('channel-config/by-channel')
  async getByChannelId(
    @Query('channelId') channelId: string,
  ): Promise<{ ok: boolean; data: MusicChannelConfigOrm | null }> {
    const data = await this.configRepo.findByChannelId(channelId);
    return { ok: true, data };
  }

  /** Bot이 messageId를 갱신한다 (임베드 전송 후). */
  @Post('channel-config/update-message-id')
  @HttpCode(HttpStatus.OK)
  async updateMessageId(@Body() dto: UpdateMessageIdDto): Promise<{ ok: boolean }> {
    const config = await this.configRepo.findByGuildId(dto.guildId);
    if (config) {
      await this.configRepo.updateMessageId(config.id, dto.messageId);
    }
    return { ok: true };
  }
}
