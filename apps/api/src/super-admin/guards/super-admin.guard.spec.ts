import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

import { SuperAdminGuard } from './super-admin.guard';

function makeContext(user: Request['user'] | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }) as Request,
    }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  describe('canActivate', () => {
    it('isSuperAdmin === true → true 반환', () => {
      const ctx = makeContext({ isSuperAdmin: true } as Record<string, unknown>);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('isSuperAdmin === false → ForbiddenException throw', () => {
      const ctx = makeContext({ isSuperAdmin: false } as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('isSuperAdmin 필드 없음(undefined) → ForbiddenException throw', () => {
      const ctx = makeContext({} as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('req.user 자체가 undefined → ForbiddenException throw', () => {
      const ctx = makeContext(undefined);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('isSuperAdmin이 truthy 문자열("true") → ForbiddenException throw (strict === 비교)', () => {
      // truthy 함정 방어: === true 엄격 비교를 보장
      const ctx = makeContext({ isSuperAdmin: 'true' } as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('isSuperAdmin이 1(number truthy) → ForbiddenException throw (strict === 비교)', () => {
      const ctx = makeContext({ isSuperAdmin: 1 } as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
