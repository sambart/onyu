import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { LocaleResolverService } from '../application/locale-resolver.service';
import { GuildMembershipGuard } from '../guards/guild-membership.guard';

class SetLocaleDto {
  locale: string;
}

@SkipThrottle()
@Controller('api/locale')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class LocaleController {
  constructor(private readonly localeResolver: LocaleResolverService) {}

  @Get('user/:userId')
  async getUserLocale(@Param('userId') userId: string) {
    const locale = await this.localeResolver.getUserLocale(userId);
    return { locale: locale ?? 'en' };
  }

  @Put('user/:userId')
  async setUserLocale(@Param('userId') userId: string, @Body() dto: SetLocaleDto) {
    await this.localeResolver.setUserLocale(userId, dto.locale);
    return { locale: dto.locale };
  }

  @Get('guild/:guildId')
  async getGuildLocale(@Param('guildId') guildId: string) {
    const locale = await this.localeResolver.getGuildLocale(guildId);
    return { locale: locale ?? 'en' };
  }

  @Put('guild/:guildId')
  async setGuildLocale(@Param('guildId') guildId: string, @Body() dto: SetLocaleDto) {
    await this.localeResolver.setGuildLocale(guildId, dto.locale);
    return { locale: dto.locale };
  }
}
