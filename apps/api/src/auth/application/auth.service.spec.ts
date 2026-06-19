import { type ConfigService } from '@nestjs/config';
import { type JwtService } from '@nestjs/jwt';
import { type Mocked, vi } from 'vitest';

import { type RedisService } from '../../redis/redis.service';
import { type AuthGuildRepository } from '../infrastructure/auth-guild.repository';
import { AuthService } from './auth.service';

// auth.service.ts 와 동일한 Discord 권한 비트 상수 (테스트 가독성 유지)
const ADMINISTRATOR = 0x8;
const MANAGE_GUILD = 0x20;

/**
 * vitest mock의 첫 번째 call 첫 번째 인수를 타입 안전하게 꺼낸다.
 * mock.calls는 beforeEach에서 항상 초기화되고 createToken이 직후 호출되므로 undefined 가드는 throw로 처리.
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
  let configService: Mocked<ConfigService>;
  let authGuildRepository: Mocked<AuthGuildRepository>;

  beforeEach(() => {
    jwtService = {
      sign: vi.fn().mockReturnValue('signed-token'),
    } as unknown as Mocked<JwtService>;

    redisService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    } as unknown as Mocked<RedisService>;

    configService = {
      get: vi.fn().mockReturnValue(''),
    } as unknown as Mocked<ConfigService>;

    // 기본적으로 모든 길드가 봇 참여 상태로 가정 — 개별 테스트에서 재정의 가능
    authGuildRepository = {
      findBotGuildIds: vi.fn().mockResolvedValue(new Set(['g1', 'g2', 'g3'])),
    } as unknown as Mocked<AuthGuildRepository>;

    service = new AuthService(jwtService, redisService, configService, authGuildRepository);
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
      // base64url: A-Z a-z 0-9 - _ 만 허용; +, /, = 미포함
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
    it('관리 권한(ADMINISTRATOR)이 있는 길드만 포함하여 토큰을 생성한다', async () => {
      const result = await service.createToken({
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

      expect(result).toBe('signed-token');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'TestUser',
        avatar: 'avatar-hash',
        guilds: [{ id: 'g1', name: 'Admin Guild', icon: 'icon1' }],
        isSuperAdmin: false,
      });
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
          // 0x1(CREATE_INSTANT_INVITE), 0x10(ADD_REACTIONS) — ADMINISTRATOR·MANAGE_GUILD 이외 권한
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

    it('페이로드에서 permissions 필드를 제거한다', async () => {
      await service.createToken({
        discordId: 'user-1',
        username: 'TestUser',
        guilds: [{ id: 'g1', name: 'Admin', icon: null, owner: true, permissions: ADMINISTRATOR }],
      });

      const payload = getFirstCallArg<{ guilds: Array<Record<string, unknown>> }>(jwtService.sign);
      expect(payload.guilds[0]).toEqual({ id: 'g1', name: 'Admin', icon: null });
      expect(payload.guilds[0]).not.toHaveProperty('permissions');
      expect(payload.guilds[0]).not.toHaveProperty('owner');
    });

    it('allowlist에 포함된 discordId → isSuperAdmin:true', async () => {
      configService.get.mockReturnValue('admin-user-1,admin-user-2');

      await service.createToken({
        discordId: 'admin-user-1',
        username: 'AdminUser',
      });

      const payload = getFirstCallArg<{ isSuperAdmin: boolean }>(jwtService.sign);
      expect(payload.isSuperAdmin).toBe(true);
    });

    it('allowlist에 없는 discordId → isSuperAdmin:false', async () => {
      configService.get.mockReturnValue('admin-user-1');

      await service.createToken({
        discordId: 'regular-user',
        username: 'RegularUser',
      });

      const payload = getFirstCallArg<{ isSuperAdmin: boolean }>(jwtService.sign);
      expect(payload.isSuperAdmin).toBe(false);
    });

    it('SUPER_ADMIN_IDS 미설정(빈 문자열) → 전원 isSuperAdmin:false', async () => {
      configService.get.mockReturnValue('');

      await service.createToken({
        discordId: 'any-user',
        username: 'AnyUser',
      });

      const payload = getFirstCallArg<{ isSuperAdmin: boolean }>(jwtService.sign);
      expect(payload.isSuperAdmin).toBe(false);
    });

    it('allowlist 공백·빈 항목 파싱 — 앞뒤 공백 trim, 빈 항목 무시 (E2)', async () => {
      // "123, ,456," → {123, 456}
      configService.get.mockReturnValue('123, ,456,');
      authGuildRepository.findBotGuildIds.mockResolvedValue(new Set(['123', '456']));

      await service.createToken({ discordId: '123', username: 'User123' });
      const payload1 = getFirstCallArg<{ isSuperAdmin: boolean }>(jwtService.sign);
      expect(payload1.isSuperAdmin).toBe(true);

      jwtService.sign.mockClear();

      await service.createToken({ discordId: '456', username: 'User456' });
      const payload2 = getFirstCallArg<{ isSuperAdmin: boolean }>(jwtService.sign);
      expect(payload2.isSuperAdmin).toBe(true);

      jwtService.sign.mockClear();

      // 빈 항목(" ")은 allowlist에 없는 것으로 처리
      await service.createToken({ discordId: ' ', username: 'SpaceUser' });
      const payload3 = getFirstCallArg<{ isSuperAdmin: boolean }>(jwtService.sign);
      expect(payload3.isSuperAdmin).toBe(false);
    });

    it('봇이 참여하지 않은 길드는 관리 권한이 있어도 제외한다', async () => {
      // g1: 봇 참여 O, g2: 봇 참여 X
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

    it('슈퍼 관리자도 봇 미참여 길드는 제외한다', async () => {
      // 슈퍼 관리자 예외 없음 — 비운영 길드 열람은 GET /api/admin/guilds 경로에서 처리
      configService.get.mockReturnValue('super-admin-1');
      authGuildRepository.findBotGuildIds.mockResolvedValue(new Set(['g1']));

      await service.createToken({
        discordId: 'super-admin-1',
        username: 'SuperAdmin',
        guilds: [
          { id: 'g1', name: 'Bot Guild', icon: null, owner: true, permissions: ADMINISTRATOR },
          { id: 'g99', name: 'Non-bot Guild', icon: null, owner: true, permissions: ADMINISTRATOR },
        ],
      });

      const payload = getFirstCallArg<{ guilds: Array<{ id: string }>; isSuperAdmin: boolean }>(
        jwtService.sign,
      );
      expect(payload.isSuperAdmin).toBe(true);
      expect(payload.guilds).toHaveLength(1);
      expect(payload.guilds[0]?.id).toBe('g1');
    });
  });
});
