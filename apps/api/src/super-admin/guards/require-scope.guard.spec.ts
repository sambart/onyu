import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Mocked } from 'vitest';

import { RequireScopeGuard } from './require-scope.guard';

function makeContext(userScopes: string[] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () =>
        ({
          user: userScopes !== undefined ? { scopes: userScopes } : {},
        }) as unknown as Request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredScopes: string[] | undefined): RequireScopeGuard {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredScopes),
  } as unknown as Mocked<Reflector>;
  return new RequireScopeGuard(reflector);
}

describe('RequireScopeGuard', () => {
  describe('canActivate', () => {
    it('메타데이터 없음(undefined) → 통과', () => {
      const guard = makeGuard(undefined);
      const ctx = makeContext(['some:scope']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('빈 scopes 메타데이터([]) → 통과', () => {
      const guard = makeGuard([]);
      const ctx = makeContext(['some:scope']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('required scope 1개 — user가 보유 → 통과', () => {
      const guard = makeGuard(['admin:manage']);
      const ctx = makeContext(['admin:manage', 'guild:view']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('required scope 2개 — user가 모두 보유 → 통과', () => {
      const guard = makeGuard(['admin:manage', 'guild:view']);
      const ctx = makeContext(['admin:manage', 'guild:view', 'usage:view']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('required scope 1개 — user가 미보유 → ForbiddenException', () => {
      const guard = makeGuard(['admin:manage']);
      const ctx = makeContext(['guild:view']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('required scope 2개 — 하나만 보유 → ForbiddenException', () => {
      const guard = makeGuard(['admin:manage', 'guild:view']);
      const ctx = makeContext(['guild:view']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('user.scopes 미설정([]) + required 있음 → ForbiddenException', () => {
      const guard = makeGuard(['admin:manage']);
      const ctx = makeContext([]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('에러 메시지는 "해당 작업을 수행할 권한이 없습니다."이다', () => {
      const guard = makeGuard(['admin:manage']);
      const ctx = makeContext([]);
      expect(() => guard.canActivate(ctx)).toThrow('해당 작업을 수행할 권한이 없습니다.');
    });
  });
});
