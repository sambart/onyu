import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { RedisService } from '../../redis/redis.service';

const ADMINISTRATOR = 0x8;
const MANAGE_GUILD = 0x20;

const AUTH_CODE_TTL_SECONDS = 60;
const AUTH_CODE_KEY_PREFIX = 'auth:code:';
const AUTH_CODE_RANDOM_BYTES = 32;

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  createToken(user: {
    discordId: string;
    username: string;
    avatar?: string;
    guilds?: DiscordGuild[];
  }) {
    const managedGuilds = (user.guilds ?? [])
      .filter((g) => g.owner || (g.permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0)
      .map(({ id, name, icon }) => ({ id, name, icon }));

    const payload = {
      sub: user.discordId,
      username: user.username,
      avatar: user.avatar,
      guilds: managedGuilds,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * JWT를 Redis에 일회용 코드와 매핑하여 저장하고 코드를 반환한다.
   * 코드는 256-bit 무작위 base64url 문자열(TTL 60초)이며, URL 쿼리에 노출되어도
   * 실제 JWT가 노출되지 않는다.
   */
  async issueAuthCode(token: string): Promise<string> {
    const code = randomBytes(AUTH_CODE_RANDOM_BYTES).toString('base64url');
    await this.redisService.set(`${AUTH_CODE_KEY_PREFIX}${code}`, token, AUTH_CODE_TTL_SECONDS);
    return code;
  }

  /**
   * 일회용 코드를 소비하여 JWT를 반환한다.
   * 코드가 유효하면 Redis에서 즉시 삭제(1회 사용 보장) 후 JWT를 반환한다.
   * 코드가 없거나 만료된 경우 null을 반환한다.
   */
  async consumeAuthCode(code: string): Promise<string | null> {
    const key = `${AUTH_CODE_KEY_PREFIX}${code}`;
    const token = await this.redisService.get<string>(key);
    if (!token) {
      return null;
    }
    await this.redisService.del(key);
    return token;
  }
}
