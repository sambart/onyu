import { UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { type Mocked, vi } from 'vitest';

import { type AuthService } from '../application/auth.service';
import { AuthController } from './auth.controller';
import { type AuthExchangeDto } from './dto/auth-exchange.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Mocked<AuthService>;
  let configService: Mocked<ConfigService>;

  beforeEach(() => {
    authService = {
      createToken: vi.fn(),
      issueAuthCode: vi.fn(),
      consumeAuthCode: vi.fn(),
    } as unknown as Mocked<AuthService>;

    configService = {
      get: vi.fn(),
    } as unknown as Mocked<ConfigService>;

    controller = new AuthController(authService, configService);
  });

  describe('callback', () => {
    it('createToken 및 issueAuthCode를 호출한 뒤 ?code= 포함 URL로 리다이렉트한다', async () => {
      const mockUser = {
        discordId: 'user-123',
        username: 'TestUser',
        avatar: 'avatar-hash',
        guilds: [],
      };
      const mockReq = { user: mockUser } as unknown as Parameters<typeof controller.callback>[0];
      const mockRedirect = vi.fn();
      const mockRes = { redirect: mockRedirect } as unknown as Response;

      authService.createToken.mockReturnValue('jwt-token');
      authService.issueAuthCode.mockResolvedValue('generated-code-abc');
      configService.get.mockReturnValue('http://localhost:4000');

      await controller.callback(mockReq, mockRes);

      expect(authService.createToken).toHaveBeenCalledWith(mockUser);
      expect(authService.issueAuthCode).toHaveBeenCalledWith('jwt-token');
      expect(mockRedirect).toHaveBeenCalledTimes(1);
      const redirectUrl: string = mockRedirect.mock.calls[0]?.[0] as string;
      expect(redirectUrl).toContain('?code=generated-code-abc');
    });

    it('리다이렉트 URL에 token= 이 포함되지 않는다(JWT 미노출 보안 보장)', async () => {
      const mockUser = {
        discordId: 'user-456',
        username: 'SecureUser',
        avatar: 'hash',
        guilds: [],
      };
      const mockReq = { user: mockUser } as unknown as Parameters<typeof controller.callback>[0];
      const mockRedirect = vi.fn();
      const mockRes = { redirect: mockRedirect } as unknown as Response;

      authService.createToken.mockReturnValue('super-secret-jwt');
      authService.issueAuthCode.mockResolvedValue('safe-code-xyz');
      configService.get.mockReturnValue('https://example.com');

      await controller.callback(mockReq, mockRes);

      const redirectUrl: string = mockRedirect.mock.calls[0]?.[0] as string;
      expect(redirectUrl).not.toContain('token=');
      expect(redirectUrl).not.toContain('super-secret-jwt');
    });

    it('WEB_URL 환경변수 기반 URL로 리다이렉트한다', async () => {
      const mockUser = {
        discordId: 'user-789',
        username: 'EnvUser',
        avatar: 'hash',
        guilds: [],
      };
      const mockReq = { user: mockUser } as unknown as Parameters<typeof controller.callback>[0];
      const mockRedirect = vi.fn();
      const mockRes = { redirect: mockRedirect } as unknown as Response;

      authService.createToken.mockReturnValue('jwt');
      authService.issueAuthCode.mockResolvedValue('code-111');
      configService.get.mockReturnValue('https://my-app.example.com');

      await controller.callback(mockReq, mockRes);

      const redirectUrl: string = mockRedirect.mock.calls[0]?.[0] as string;
      expect(redirectUrl).toContain('https://my-app.example.com');
      expect(redirectUrl).toContain('/auth/callback');
    });
  });

  describe('exchange', () => {
    it('consumeAuthCode가 token 반환 시 { token } 객체를 반환한다', async () => {
      authService.consumeAuthCode.mockResolvedValue('valid-jwt-token');
      const dto = { code: 'valid-code' } as AuthExchangeDto;

      const result = await controller.exchange(dto);

      expect(result).toEqual({ token: 'valid-jwt-token' });
      expect(authService.consumeAuthCode).toHaveBeenCalledWith('valid-code');
    });

    it('consumeAuthCode가 null 반환 시 UnauthorizedException을 throw한다', async () => {
      authService.consumeAuthCode.mockResolvedValue(null);
      const dto = { code: 'invalid-code' } as AuthExchangeDto;

      await expect(controller.exchange(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('만료된 코드로 exchange 요청 시 UnauthorizedException을 throw한다', async () => {
      authService.consumeAuthCode.mockResolvedValue(null);
      const dto = { code: 'expired-code' } as AuthExchangeDto;

      await expect(controller.exchange(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('consumeAuthCode에 dto.code 값을 그대로 전달한다', async () => {
      authService.consumeAuthCode.mockResolvedValue('some-token');
      const dto = { code: 'my-specific-code' } as AuthExchangeDto;

      await controller.exchange(dto);

      expect(authService.consumeAuthCode).toHaveBeenCalledWith('my-specific-code');
    });
  });
});
