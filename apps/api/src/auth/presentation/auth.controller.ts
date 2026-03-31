import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common/decorators';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from '../application/auth.service';

@Throttle({ default: { ttl: 60000, limit: 10 } })
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
  callback(@Req() req, @Res() res) {
    const token = this.authService.createToken(req.user);
    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:4000');

    res.redirect(`${webUrl}/auth/callback?token=${token}`);
  }
}
