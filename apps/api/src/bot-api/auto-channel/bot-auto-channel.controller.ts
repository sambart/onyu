import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { AutoChannelService } from '../../channel/auto/application/auto-channel.service';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

class ButtonClickDto {
  @IsString()
  @IsNotEmpty()
  guildId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  buttonId: number;

  @IsOptional()
  @IsString()
  voiceChannelId: string | null;

  @IsString()
  @IsNotEmpty()
  displayName: string;
}

class SubOptionDto {
  @IsString()
  @IsNotEmpty()
  guildId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  subOptionId: number;

  @IsOptional()
  @IsString()
  voiceChannelId: string | null;

  @IsString()
  @IsNotEmpty()
  displayName: string;
}

@SkipThrottle()
@Controller('bot-api/auto-channel')
@UseGuards(BotApiAuthGuard)
export class BotAutoChannelController {
  private readonly logger = new Logger(BotAutoChannelController.name);

  constructor(private readonly autoChannelService: AutoChannelService) {}

  @Post('button-click')
  @HttpCode(HttpStatus.OK)
  async handleButtonClick(@Body() dto: ButtonClickDto) {
    this.logger.warn(`[BUTTON-CLICK] dto=${JSON.stringify(dto)}`);
    const result = await this.autoChannelService.handleButtonClickFromBot(dto);
    this.logger.warn(`[BUTTON-CLICK] result=${JSON.stringify(result)}`);
    return result;
  }

  @Post('sub-option')
  @HttpCode(HttpStatus.OK)
  async handleSubOption(@Body() dto: SubOptionDto) {
    return this.autoChannelService.handleSubOptionClickFromBot(dto);
  }
}
