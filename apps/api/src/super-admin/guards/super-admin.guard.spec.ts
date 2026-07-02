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
    it('role=super_admin → true 반환', () => {
      const ctx = makeContext({ role: 'super_admin' } as Record<string, unknown>);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('role=bot_operator → true 반환 (모든 admin role 통과)', () => {
      const ctx = makeContext({ role: 'bot_operator' } as Record<string, unknown>);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('role=null → ForbiddenException throw', () => {
      const ctx = makeContext({ role: null } as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('role 필드 없음(undefined) → ForbiddenException throw', () => {
      const ctx = makeContext({} as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('req.user 자체가 undefined → ForbiddenException throw', () => {
      const ctx = makeContext(undefined);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('에러 메시지는 "슈퍼 관리자 권한이 필요합니다."이다', () => {
      const ctx = makeContext({ role: null } as Record<string, unknown>);
      expect(() => guard.canActivate(ctx)).toThrow('슈퍼 관리자 권한이 필요합니다.');
    });
  });
});
