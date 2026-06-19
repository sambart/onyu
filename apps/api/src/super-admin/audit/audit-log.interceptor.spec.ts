import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { of } from 'rxjs';
import type { Mocked } from 'vitest';

import type { AuditLogRepository } from '../infrastructure/audit-log.repository';
import { AuditLogInterceptor } from './audit-log.interceptor';

function makeContext(req: Partial<Request> & { user?: Record<string, unknown> }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req as Request,
    }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(): CallHandler {
  return { handle: () => of(null) };
}

function makeRepository(insertImpl?: () => Promise<void>): Mocked<AuditLogRepository> {
  return {
    insert: vi.fn().mockImplementation(insertImpl ?? (() => Promise.resolve())),
  } as unknown as Mocked<AuditLogRepository>;
}

describe('AuditLogInterceptor', () => {
  describe('intercept — 기록 대상 필터', () => {
    it('슈퍼관리자 + /api/admin/guilds → insert 호출(guildId=null)', () => {
      const repo = makeRepository();
      const interceptor = new AuditLogInterceptor(repo);

      const ctx = makeContext({
        user: { discordId: 'admin-1', isSuperAdmin: true },
        path: '/api/admin/guilds',
        method: 'GET',
        params: {},
      });

      interceptor.intercept(ctx, makeCallHandler());

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: null, adminDiscordUserId: 'admin-1' }),
      );
    });

    it('슈퍼관리자 + /api/guilds/g1/overview → insert 호출(guildId=g1)', () => {
      const repo = makeRepository();
      const interceptor = new AuditLogInterceptor(repo);

      const ctx = makeContext({
        user: { discordId: 'admin-1', isSuperAdmin: true },
        path: '/api/guilds/g1/overview',
        method: 'GET',
        params: { guildId: 'g1' },
      });

      interceptor.intercept(ctx, makeCallHandler());

      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: 'g1', adminDiscordUserId: 'admin-1' }),
      );
    });

    it('비-슈퍼관리자 → insert 미호출', () => {
      const repo = makeRepository();
      const interceptor = new AuditLogInterceptor(repo);

      const ctx = makeContext({
        user: { discordId: 'user-1', isSuperAdmin: false },
        path: '/api/guilds/g1/overview',
        method: 'GET',
        params: { guildId: 'g1' },
      });

      interceptor.intercept(ctx, makeCallHandler());

      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('req.user 없는 경로(health 등) → insert 미호출', () => {
      const repo = makeRepository();
      const interceptor = new AuditLogInterceptor(repo);

      const ctx = makeContext({ path: '/health', method: 'GET', params: {} });

      interceptor.intercept(ctx, makeCallHandler());

      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('슈퍼관리자 + 대상 외 경로(/health) → insert 미호출', () => {
      const repo = makeRepository();
      const interceptor = new AuditLogInterceptor(repo);

      const ctx = makeContext({
        user: { discordId: 'admin-1', isSuperAdmin: true },
        path: '/health',
        method: 'GET',
        params: {},
      });

      interceptor.intercept(ctx, makeCallHandler());

      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('intercept — 비차단 보장 (E5)', () => {
    it('insert reject 시 본 요청이 정상 완료되고 Observable이 throw하지 않는다', async () => {
      const repo = makeRepository(() => Promise.reject(new Error('DB down')));
      const interceptor = new AuditLogInterceptor(repo);

      const ctx = makeContext({
        user: { discordId: 'admin-1', isSuperAdmin: true },
        path: '/api/admin/guilds',
        method: 'GET',
        params: {},
      });

      const result$ = interceptor.intercept(ctx, makeCallHandler());

      // Observable이 에러 없이 완료되어야 함 (비차단)
      await expect(
        new Promise<void>((resolve, reject) => {
          result$.subscribe({ next: () => resolve(), error: reject });
        }),
      ).resolves.toBeUndefined();

      // insert가 호출되었는지 확인(fire-and-forget)
      expect(repo.insert).toHaveBeenCalledTimes(1);
    });
  });
});
