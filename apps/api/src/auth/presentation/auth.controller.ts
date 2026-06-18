import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthService } from '../application/auth.service';
import { AuthExchangeDto } from './dto/auth-exchange.dto';

const HTTP_OK = 200;

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: number;
}

/** Discord OAuth2 콜백 후 Passport가 req.user에 주입하는 사용자 정보 */
interface DiscordAuthUser {
  discordId: string;
  username: string;
  avatar: string;
  guilds: DiscordGuild[];
}

interface DiscordCallbackRequest extends Request {
  user: DiscordAuthUser;
}

@Throttle({ default: { ttl: 60000, limit: 20 } })
@Controller('auth/discord')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('discord'))
  login() {}

  @Get('callback')
  @UseGuards(AuthGuard('discord'))
  async callback(@Req() req: DiscordCallbackRequest, @Res() res: Response) {
    const token = this.authService.createToken(req.user);
    const code = await this.authService.issueAuthCode(token);
    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:4000');

    res.redirect(`${webUrl}/auth/callback?code=${code}`);
  }

  @Post('exchange')
  @HttpCode(HTTP_OK)
  async exchange(@Body() dto: AuthExchangeDto) {
    const token = await this.authService.consumeAuthCode(dto.code);

    if (!token) {
      throw new UnauthorizedException('Invalid or expired authorization code');
    }

    return { token };
  }
}
