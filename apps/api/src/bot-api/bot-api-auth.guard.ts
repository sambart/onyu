import { timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Bot → API 서비스 간 인증 가드.
 * 환경 변수 BOT_API_KEY와 Bearer 토큰을 비교한다.
 */
@Injectable()
export class BotApiAuthGuard implements CanActivate {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BOT_API_KEY', '');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) {
      throw new UnauthorizedException('BOT_API_KEY is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const tokenBuffer = Buffer.from(token);
    const apiKeyBuffer = Buffer.from(this.apiKey);
    // timingSafeEqual 은 길이가 다르면 throw 하므로 길이 선검사(길이는 비밀이 아님)
    if (tokenBuffer.length !== apiKeyBuffer.length || !timingSafeEqual(tokenBuffer, apiKeyBuffer)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
