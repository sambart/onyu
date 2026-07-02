import { type JwtService } from '@nestjs/jwt';
import { type Mocked, vi } from 'vitest';

import { type RedisService } from '../../redis/redis.service';
import { type AdminUserRepository } from '../../super-admin/infrastructure/admin-user.repository';
import { type AuthGuildRepository } from '../infrastructure/auth-guild.repository';
import { AuthService } from './auth.service';

// auth.service.ts 와 동일한 Discord 권한 비트 상수 (테스트 가독성 유지)
const ADMINISTRATOR = 0x8;
const MANAGE_GUILD = 0x20;

// role-scope.constants.ts 의 ALL_OPERATIONAL 과 동일
const ALL_OPERATIONAL = [
  'guild:view',
  'guild:manage',
  'billing:manage',
  'churn:view',
  'usage:view',
  'onboarding:view',
  'notification:manage',
  'feature-flag:manage',
];
const SUPER_ADMIN_SCOPES = [...ALL_OPERATIONAL, 'admin:manage'];
const BOT_OPERATOR_SCOPES = [...ALL_OPERATIONAL];

/**
 * vitest mock의 첫 번째 call 첫 번째 인수를 타입 안전하게 꺼낸다.
 */
function getFirstCallArg<T>(mock: Mocked<JwtService>['sign']): T {
  const firstCall = mock.mock.calls[0];
  if (!firstCall) {
    throw new Error('sign이 호출되지 않았습니다');
  }
  return firstCall[0] as T;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: Mocked<JwtService>;
  let redisService: Mocked<RedisService>;
  let authGuildRepository: Mocked<AuthGuildRepository>;
  let adminUserRepository: Mocked<AdminUserRepository>;

  beforeEach(() => {
    jwtService = {
      sign: vi.fn().mockReturnValue('signed-token'),
    } as unknown as Mocked<JwtService>;

    redisService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    } as unknown as Mocked<RedisService>;

    // 기본적으로 모든 길드가 봇 참여 상태로 가정
    authGuildRepository = {
      findBotGuildIds: vi.fn().mockResolvedValue(new Set(['g1', 'g2', 'g3'])),
    } as unknown as Mocked<AuthGuildRepository>;

    // 기본: DB 미등록 → null
    adminUserRepository = {
      findByDiscordId: vi.fn().mockResolvedValue(null),
    } as unknown as Mocked<AdminUserRepository>;

    service = new AuthService(jwtService, redisService, authGuildRepository, adminUserRepository);
  });

  describe('issueAuthCode', () => {
    it('비어있지 않은 문자열 코드를 반환한다', async () => {
      redisService.set.mockResolvedValue(undefined);
      const code = await service.issueAuthCode('my-token');
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    it('반환된 코드는 base64url 문자(+/= 미포함)로만 구성된다', async () => {
      redisService.set.mockResolvedValue(undefined);
      const code = await service.issueAuthCode('my-token');
      expect(code).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('redisService.set을 auth:code:<code> 키 + token + TTL 60 인자로 호출한다', async () => {
      redisService.set.mockResolvedValue(undefined);
      const token = 'jwt-token-abc';
      const code = await service.issueAuthCode(token);
      expect(redisService.set).toHaveBeenCalledTimes(1);
      expect(redisService.set).toHaveBeenCalledWith(`auth:code:${code}`, token, 60);
    });

    it('매 호출마다 다른 코드를 반환한다(랜덤성)', async () => {
      redisService.set.mockResolvedValue(undefined);
      const codes = await Promise.all(
        Array.from({ length: 5 }, () => service.issueAuthCode('token')),
      );
      const unique = new Set(codes);
      expect(unique.size).toBe(5);
    });
  });

  describe('consumeAuthCode', () => {
    it('유효한 코드: del이 같은 키로 1회 호출되고 token을 반환한다', async () => {
      const token = 'valid-jwt-token';
      redisService.get.mockResolvedValue(token);
      redisService.del.mockResolvedValue(undefined);

      const result = await service.consumeAuthCode('valid-code');

      expect(result).toBe(token);
      expect(redisService.del).toHaveBeenCalledTimes(1);
      expect(redisService.del).toHaveBeenCalledWith('auth:code:valid-code');
    });

    it('유효한 코드: get은 auth:code:<code> 키로 호출된다', async () => {
      redisService.get.mockResolvedValue('some-token');
      redisService.del.mockResolvedValue(undefined);

      await service.consumeAuthCode('abc123');

      expect(redisService.get).toHaveBeenCalledWith('auth:code:abc123');
    });

    it('코드가 없음(get null): del을 호출하지 않고 null을 반환한다', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.consumeAuthCode('nonexistent-code');

      expect(result).toBeNull();
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('만료된 코드(get null): null을 반환한다', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.consumeAuthCode('expired-code');

      expect(result).toBeNull();
    });
  });

  describe('createToken', () => {
    describe('길드 필터링', () => {
      it('관리 권한(ADMINISTRATOR)이 있는 길드만 포함하여 토큰을 생성한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          avatar: 'avatar-hash',
          guilds: [
            {
              id: 'g1',
              name: 'Admin Guild',
              icon: 'icon1',
              owner: false,
              permissions: ADMINISTRATOR,
            },
            { id: 'g2', name: 'No Perm Guild', icon: null, owner: false, permissions: 0 },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toHaveLength(1);
        expect(payload.guilds[0]?.id).toBe('g1');
      });

      it('MANAGE_GUILD 권한이 있는 길드를 포함한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [
            { id: 'g1', name: 'Manage Guild', icon: null, owner: false, permissions: MANAGE_GUILD },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toHaveLength(1);
        expect(payload.guilds[0]?.id).toBe('g1');
      });

      it('owner인 길드를 포함한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [{ id: 'g1', name: 'Owner Guild', icon: null, owner: true, permissions: 0 }],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toHaveLength(1);
      });

      it('ADMINISTRATOR + MANAGE_GUILD 복합 권한도 필터링한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [
            {
              id: 'g1',
              name: 'Both',
              icon: null,
              owner: false,
              permissions: ADMINISTRATOR | MANAGE_GUILD,
            },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toHaveLength(1);
      });

      it('권한이 없는 길드는 제외한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [
            { id: 'g1', name: 'No Perm', icon: null, owner: false, permissions: 0x1 },
            { id: 'g2', name: 'Also No Perm', icon: null, owner: false, permissions: 0x10 },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toEqual([]);
      });

      it('guilds가 없으면 빈 배열로 처리한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toEqual([]);
      });

      it('페이로드에서 permissions 필드와 owner 필드를 제거한다', async () => {
        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [
            { id: 'g1', name: 'Admin', icon: null, owner: true, permissions: ADMINISTRATOR },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<Record<string, unknown>> }>(
          jwtService.sign,
        );
        expect(payload.guilds[0]).toEqual({ id: 'g1', name: 'Admin', icon: null });
        expect(payload.guilds[0]).not.toHaveProperty('permissions');
        expect(payload.guilds[0]).not.toHaveProperty('owner');
      });

      it('봇이 참여하지 않은 길드는 관리 권한이 있어도 제외한다', async () => {
        authGuildRepository.findBotGuildIds.mockResolvedValue(new Set(['g1']));

        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [
            { id: 'g1', name: 'Bot Guild', icon: null, owner: true, permissions: ADMINISTRATOR },
            { id: 'g2', name: 'No Bot Guild', icon: null, owner: true, permissions: ADMINISTRATOR },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toHaveLength(1);
        expect(payload.guilds[0]?.id).toBe('g1');
      });

      it('봇 참여 길드가 하나도 없으면 빈 배열을 반환한다', async () => {
        authGuildRepository.findBotGuildIds.mockResolvedValue(new Set<string>());

        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          guilds: [
            { id: 'g1', name: 'Guild A', icon: null, owner: true, permissions: ADMINISTRATOR },
            { id: 'g2', name: 'Guild B', icon: null, owner: false, permissions: MANAGE_GUILD },
          ],
        });

        const payload = getFirstCallArg<{ guilds: Array<{ id: string }> }>(jwtService.sign);
        expect(payload.guilds).toEqual([]);
      });
    });

    describe('role/scopes 산출 — DB 조회 4케이스', () => {
      it('DB 미등록(findByDiscordId=null) → role: null, scopes: []', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue(null);

        await service.createToken({ discordId: 'unknown-user', username: 'Unknown' });

        const payload = getFirstCallArg<{ role: string | null; scopes: string[] }>(jwtService.sign);
        expect(payload.role).toBeNull();
        expect(payload.scopes).toEqual([]);
      });

      it('isActive=false → role: null, scopes: []', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue({
          discordUserId: 'inactive-user',
          role: 'super_admin',
          permissions: null,
          isActive: false,
        } as never);

        await service.createToken({ discordId: 'inactive-user', username: 'InactiveUser' });

        const payload = getFirstCallArg<{ role: string | null; scopes: string[] }>(jwtService.sign);
        expect(payload.role).toBeNull();
        expect(payload.scopes).toEqual([]);
      });

      it('super_admin + isActive=true + permissions=null → role: super_admin, scopes: 전체(admin:manage 포함)', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue({
          discordUserId: 'super-user',
          role: 'super_admin',
          permissions: null,
          isActive: true,
        } as never);

        await service.createToken({ discordId: 'super-user', username: 'SuperUser' });

        const payload = getFirstCallArg<{ role: string; scopes: string[] }>(jwtService.sign);
        expect(payload.role).toBe('super_admin');
        expect(payload.scopes).toEqual(expect.arrayContaining(SUPER_ADMIN_SCOPES));
        expect(payload.scopes).toHaveLength(SUPER_ADMIN_SCOPES.length);
        expect(payload.scopes).toContain('admin:manage');
      });

      it('bot_operator + isActive=true + permissions=null → role: bot_operator, scopes: 운영(admin:manage 제외)', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue({
          discordUserId: 'operator-user',
          role: 'bot_operator',
          permissions: null,
          isActive: true,
        } as never);

        await service.createToken({ discordId: 'operator-user', username: 'OperatorUser' });

        const payload = getFirstCallArg<{ role: string; scopes: string[] }>(jwtService.sign);
        expect(payload.role).toBe('bot_operator');
        expect(payload.scopes).toEqual(expect.arrayContaining(BOT_OPERATOR_SCOPES));
        expect(payload.scopes).toHaveLength(BOT_OPERATOR_SCOPES.length);
        expect(payload.scopes).not.toContain('admin:manage');
      });

      it('permissions=[] → role 무관 scopes: [] (전체 차단)', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue({
          discordUserId: 'blocked-user',
          role: 'super_admin',
          permissions: [],
          isActive: true,
        } as never);

        await service.createToken({ discordId: 'blocked-user', username: 'BlockedUser' });

        const payload = getFirstCallArg<{ role: string; scopes: string[] }>(jwtService.sign);
        expect(payload.role).toBe('super_admin');
        expect(payload.scopes).toEqual([]);
      });

      it('permissions=[guild:view] → scopes: [guild:view] (override)', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue({
          discordUserId: 'partial-user',
          role: 'super_admin',
          permissions: ['guild:view'],
          isActive: true,
        } as never);

        await service.createToken({ discordId: 'partial-user', username: 'PartialUser' });

        const payload = getFirstCallArg<{ role: string; scopes: string[] }>(jwtService.sign);
        expect(payload.role).toBe('super_admin');
        expect(payload.scopes).toEqual(['guild:view']);
      });
    });

    describe('JWT payload 구조', () => {
      it('payload에 sub, username, avatar, guilds, role, scopes 필드가 포함된다', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue(null);

        await service.createToken({
          discordId: 'user-1',
          username: 'TestUser',
          avatar: 'avatar-hash',
          guilds: [],
        });

        const payload = getFirstCallArg<Record<string, unknown>>(jwtService.sign);
        expect(payload).toHaveProperty('sub', 'user-1');
        expect(payload).toHaveProperty('username', 'TestUser');
        expect(payload).toHaveProperty('avatar', 'avatar-hash');
        expect(payload).toHaveProperty('guilds');
        expect(payload).toHaveProperty('role');
        expect(payload).toHaveProperty('scopes');
      });

      it('payload에 isSuperAdmin 필드가 없다 (구 필드 제거)', async () => {
        adminUserRepository.findByDiscordId.mockResolvedValue(null);

        await service.createToken({ discordId: 'user-1', username: 'TestUser' });

        const payload = getFirstCallArg<Record<string, unknown>>(jwtService.sign);
        expect(payload).not.toHaveProperty('isSuperAdmin');
      });
    });
  });
});
