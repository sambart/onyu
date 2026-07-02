import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { AdminRole, AdminScope } from '@onyu/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    username: string;
    avatar?: string;
    guilds?: Array<{ id: string; name: string; icon: string | null }>;
    role?: AdminRole | null;
    scopes?: AdminScope[];
  }) {
    return {
      discordId: payload.sub,
      username: payload.username,
      avatar: payload.avatar,
      guilds: payload.guilds ?? [],
      role: payload.role ?? null,
      scopes: payload.scopes ?? [],
    };
  }
}
