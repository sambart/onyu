/* eslint-disable no-magic-numbers -- 컨트롤러 상수(ALLOWED_DAYS/DEFAULT_DAYS)는 API 계약값. 변경 시 BE ALLOWED_DAYS + FE MeVoicePeriod 동기화 필요 */
/* eslint-disable max-params -- NestJS 데코레이터(@Query×2 + @Req + @Res) 기반 파라미터: 분리 불가 패턴 */
import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import type { JwtUser } from '../../../common/types/jwt-user.types';
import {
  type MeProfileData,
  MeProfileService,
  type MeVoiceGuild,
} from '../application/me-profile.service';

const ALLOWED_DAYS = [7, 15, 30] as const;
const DEFAULT_DAYS: (typeof ALLOWED_DAYS)[number] = 15;

@Controller('api/users/me/voice')
@UseGuards(JwtAuthGuard)
export class MeVoiceController {
  constructor(private readonly meProfileService: MeProfileService) {}

  @Get('guilds')
  async getMyGuilds(@Req() req: Request): Promise<MeVoiceGuild[]> {
    const user = (req as unknown as { user: JwtUser }).user;
    return this.meProfileService.getMyGuilds(user.discordId);
  }

  @Get('profile')
  async getMyProfile(
    @Query('guildId') guildId: string | undefined,
    @Query('days') daysRaw: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeProfileData | undefined> {
    if (!guildId) {
      throw new BadRequestException('guildId 쿼리 파라미터가 필요합니다.');
    }

    const parsedDays = daysRaw === undefined ? DEFAULT_DAYS : parseInt(daysRaw, 10);
    if (!(ALLOWED_DAYS as readonly number[]).includes(parsedDays)) {
      throw new BadRequestException(`days는 ${ALLOWED_DAYS.join(', ')} 중 하나여야 합니다.`);
    }

    const user = (req as unknown as { user: JwtUser }).user;
    const profile = await this.meProfileService.getProfile(guildId, user.discordId, parsedDays);

    if (profile) {
      return profile;
    }

    res.status(HttpStatus.NO_CONTENT);
    return undefined;
  }
}
