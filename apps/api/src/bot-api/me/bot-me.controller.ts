import { Controller, HttpCode, HttpStatus, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { MeProfileService } from '../../channel/voice/application/me-profile.service';
import { ProfileCardRenderer } from '../../channel/voice/application/profile-card-renderer';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

/**
 * Bot -> API 프로필 카드 엔드포인트.
 * /me 명령어에서 프로필 이미지를 생성하여 base64로 반환한다.
 */
@SkipThrottle()
@Controller('bot-api/me')
@UseGuards(BotApiAuthGuard)
export class BotMeController {
  private readonly logger = new Logger(BotMeController.name);

  constructor(
    private readonly meProfileService: MeProfileService,
    private readonly profileCardRenderer: ProfileCardRenderer,
  ) {}

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  async getProfile(
    @Query('guildId') guildId: string,
    @Query('userId') userId: string,
    @Query('displayName') displayName: string,
    @Query('avatarUrl') avatarUrl: string,
  ): Promise<Record<string, unknown>> {
    const days = 15;
    const profile = await this.meProfileService.getProfile(guildId, userId, days);

    if (!profile) {
      return { ok: true, data: null, days };
    }

    const imageBuffer = await this.profileCardRenderer.render(profile, displayName, avatarUrl);
    const base64Image = imageBuffer.toString('base64');

    return {
      ok: true,
      data: { imageBase64: base64Image },
      days,
    };
  }
}
