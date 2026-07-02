import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Mocked } from 'vitest';

import { BotApiAuthGuard } from './bot-api-auth.guard';

function makeContext(headers: Partial<Request['headers']>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }) as Request,
    }),
  } as unknown as ExecutionContext;
}

function makeGuard(botApiKey: string): BotApiAuthGuard {
  const configService = {
    get: vi.fn().mockReturnValue(botApiKey),
  } as unknown as Mocked<ConfigService>;

  return new BotApiAuthGuard(configService);
}

describe('BotApiAuthGuard', () => {
  describe('canActivate', () => {
    it('BOT_API_KEY가 설정되지 않으면(빈 문자열) UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('');
      const ctx = makeContext({ authorization: 'Bearer sometoken' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('BOT_API_KEY is not configured');
    });

    it('authorization 헤더가 없으면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('secret-key');
      const ctx = makeContext({});

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Missing or invalid authorization header');
    });

    it('authorization 헤더가 Bearer 접두사로 시작하지 않으면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('secret-key');
      const ctx = makeContext({ authorization: 'Basic c2VjcmV0LWtleQ==' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Missing or invalid authorization header');
    });

    it('올바른 키를 Bearer 토큰으로 전달하면 true를 반환한다', () => {
      const apiKey = 'correct-secret-key';
      const guard = makeGuard(apiKey);
      const ctx = makeContext({ authorization: `Bearer ${apiKey}` });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('같은 길이지만 틀린 키를 전달하면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('correct-key-12'); // length 14
      const ctx = makeContext({ authorization: 'Bearer wrong-key-12' }); // length 14

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid API key');
    });

    it('다른 길이의 틀린 키를 전달해도 timingSafeEqual throw 없이 UnauthorizedException을 throw한다', () => {
      // 회귀 핵심: 길이 선검사가 없으면 timingSafeEqual이 RangeError를 throw함
      const guard = makeGuard('short');
      const ctx = makeContext({ authorization: 'Bearer this-is-a-much-longer-wrong-key' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid API key');
    });

    it('Bearer 뒤 빈 문자열(토큰 없음)이고 키는 비어있지 않으면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('some-key');
      const ctx = makeContext({ authorization: 'Bearer ' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid API key');
    });
  });
});
