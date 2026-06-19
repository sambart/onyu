import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AdminRole, AdminScope } from '@onyu/shared';

import { RedisService } from '../../redis/redis.service';
import { AdminUserRepository } from '../../super-admin/infrastructure/admin-user.repository';
import { resolveScopes } from '../../super-admin/role-scope.constants';
import { AuthGuildRepository } from '../infrastructure/auth-guild.repository';

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
    private readonly authGuildRepository: AuthGuildRepository,
    private readonly adminUserRepository: AdminUserRepository,
  ) {}

  /**
   * Discord 사용자 정보로 JWT를 생성한다.
   * managedGuilds 는 관리 권한(owner/Administrator/Manage Guild) 보유 길드 중
   * 봇이 실제 참여한 길드만 포함한다 — 봇 미참여 길드는 서비스를 제공할 수 없으므로 제외.
   * role/scopes 는 admin_user 테이블 조회 결과로 산출한다 (방식 A — JWT baked-in).
   */
  async createToken(user: {
    discordId: string;
    username: string;
    avatar?: string;
    guilds?: DiscordGuild[];
  }): Promise<string> {
    const botGuildIds = await this.authGuildRepository.findBotGuildIds();

    const managedGuilds = (user.guilds ?? [])
      .filter(
        (g) =>
          botGuildIds.has(g.id) &&
          (g.owner || (g.permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0),
      )
      .map(({ id, name, icon }) => ({ id, name, icon }));

    const { role, scopes } = await this.resolveAdminRoleAndScopes(user.discordId);

    const payload = {
      sub: user.discordId,
      username: user.username,
      avatar: user.avatar,
      guilds: managedGuilds,
      role,
      scopes,
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

  /**
   * admin_user 테이블 조회 결과로 role/scopes 를 산출한다.
   * 4케이스:
   * 1. 미등록 → role: null, scopes: []
   * 2. 비활성(isActive=false) → role: null, scopes: []
   * 3. super_admin(active) → role: 'super_admin', scopes: resolveScopes
   * 4. bot_operator(active) → role: 'bot_operator', scopes: resolveScopes
   */
  private async resolveAdminRoleAndScopes(
    discordId: string,
  ): Promise<{ role: AdminRole | null; scopes: AdminScope[] }> {
    const adminUser = await this.adminUserRepository.findByDiscordId(discordId);

    if (!adminUser?.isActive) {
      return { role: null, scopes: [] };
    }

    // admin_user.role 컬럼은 varchar이므로 DB 계층 타입이 string.
    // DTO(@IsIn) + seed INSERT로 항상 AdminRole 유니온 값만 저장됨을 보장하므로 단언 안전.
    const role = adminUser.role as AdminRole;
    const scopes = resolveScopes(role, adminUser.permissions);
    return { role, scopes };
  }
}
