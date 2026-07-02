import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

import { GuildMembershipGuard } from './guild-membership.guard';

interface MockUser {
  guilds?: Array<{ id: string }>;
  role?: string | null;
}

function makeContext(
  user: MockUser | undefined,
  method: string,
  params: Record<string, string | undefined>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () =>
        ({
          user,
          method,
          params,
        }) as unknown as Request,
    }),
  } as unknown as ExecutionContext;
}

describe('GuildMembershipGuard', () => {
  const guard = new GuildMembershipGuard();

  describe('canActivate — 가드 분기 매트릭스 (Endpoint Spec §3)', () => {
    it('관리자(role=super_admin) + GET + 비멤버 길드 → true 반환 (read-only 우회)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('관리자(role=bot_operator) + GET + 비멤버 길드 → true 반환 (read-only 우회)', () => {
      const ctx = makeContext({ role: 'bot_operator', guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('관리자(role=super_admin) + POST + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [] }, 'POST', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('관리자(role=super_admin) + PUT + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [] }, 'PUT', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('관리자(role=super_admin) + PATCH + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [] }, 'PATCH', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('관리자(role=super_admin) + DELETE + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [] }, 'DELETE', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('조회성 POST(ai-insight) + 관리자 + 비멤버 → ForbiddenException (HTTP method 기준 차단)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [] }, 'POST', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('일반사용자(role=null) + GET + 멤버 길드 → true 반환', () => {
      const ctx = makeContext({ role: null, guilds: [{ id: 'g1' }] }, 'GET', {
        guildId: 'g1',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('일반사용자(role=null) + GET + 비멤버 길드 → ForbiddenException', () => {
      const ctx = makeContext({ role: null, guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('일반사용자(role=null) + DELETE + 비멤버 길드 → ForbiddenException', () => {
      const ctx = makeContext({ role: null, guilds: [] }, 'DELETE', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('관리자(role=super_admin) + GET + 멤버 길드 → true 반환 (기존 경로, 중복 우회 무해)', () => {
      const ctx = makeContext({ role: 'super_admin', guilds: [{ id: 'g1' }] }, 'GET', {
        guildId: 'g1',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('canActivate — 기존 동작 보존 (회귀)', () => {
    it('guildId 파라미터 없는 라우트 → true 반환 (통과)', () => {
      const ctx = makeContext({ role: null, guilds: [] }, 'GET', {});
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('request.params 없는 non-HTTP 컨텍스트 → true 반환 (skip)', () => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { role: null, guilds: [] } }) as unknown as Request,
        }),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('미인증(user.guilds 없음) + guildId 있음 → true 반환 (JWT 가드에 위임)', () => {
      const ctx = makeContext(undefined, 'GET', { guildId: 'g1' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('role=undefined(레거시JWT) + GET + 비멤버 길드 → ForbiddenException (우회 미적용)', () => {
      const ctx = makeContext({ guilds: [] }, 'GET', { guildId: 'non-member-guild' });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('에러 메시지', () => {
    it('비멤버 403 메시지는 "해당 길드에 접근 권한이 없습니다."이다', () => {
      const ctx = makeContext({ role: null, guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow('해당 길드에 접근 권한이 없습니다.');
    });
  });
});
