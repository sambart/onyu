import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

import { GuildMembershipGuard } from './guild-membership.guard';

// user 타입은 가드 내부 캐스트와 동일하게 사용
interface MockUser {
  guilds?: Array<{ id: string }>;
  isSuperAdmin?: boolean;
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
    /**
     * T1: 슈퍼 관리자 + GET + 비멤버 → 통과 (우회)
     * QA B.P0: 슈퍼 관리자 + GET + 비멤버 길드 → 통과(우회)
     */
    it('슈퍼관리자 + GET + 비멤버 길드 → true 반환 (read-only 우회)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    /**
     * T2: 슈퍼 관리자 + POST + 비멤버 → 403 (fail-closed)
     * QA B.P0: 슈퍼 관리자 + POST/PUT/PATCH/DELETE + 비멤버 길드 → 403
     */
    it('슈퍼관리자 + POST + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'POST', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('슈퍼관리자 + PUT + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'PUT', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('슈퍼관리자 + PATCH + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'PATCH', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('슈퍼관리자 + DELETE + 비멤버 길드 → ForbiddenException (fail-closed)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'DELETE', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    /**
     * 조회성 POST (ai-insight, classify) + 슈퍼관리자 + 비멤버 → 403
     * QA B.P0: 슈퍼 관리자 + 조회성 POST(/voice-analytics/ai-insight, /inactive-members/classify) + 비멤버 → 403
     * 가드는 경로가 아닌 HTTP method 기준으로 차단 — POST는 조회성 여부와 관계없이 차단됨이 의도된 동작
     */
    it('슈퍼관리자 + 조회성POST(ai-insight) + 비멤버 → ForbiddenException (의도된 차단)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'POST', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('슈퍼관리자 + 조회성POST(classify) + 비멤버 → ForbiddenException (의도된 차단)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [] }, 'POST', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    /**
     * T4: 일반 사용자 + GET + 멤버 길드 → 통과 (기존 동작 불변)
     * QA B.P0: 일반 사용자 + GET + 멤버 길드 → 통과
     */
    it('일반사용자 + GET + 멤버 길드 → true 반환 (기존 동작)', () => {
      const ctx = makeContext({ isSuperAdmin: false, guilds: [{ id: 'g1' }] }, 'GET', {
        guildId: 'g1',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    /**
     * T5/T6: 일반 사용자 + any + 비멤버 → 403 (기존 동작 불변)
     * QA B.P0: 일반 사용자 + any + 비멤버 길드 → 403
     */
    it('일반사용자 + GET + 비멤버 길드 → ForbiddenException', () => {
      const ctx = makeContext({ isSuperAdmin: false, guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('일반사용자 + DELETE + 비멤버 길드 → ForbiddenException', () => {
      const ctx = makeContext({ isSuperAdmin: false, guilds: [] }, 'DELETE', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    /**
     * P1: 슈퍼 관리자 + GET + 멤버 길드(본인 운영) → 통과 (기존 경로, 중복 우회 무해)
     * QA B.P1: 슈퍼 관리자 + GET + 멤버 길드(본인이 운영자) → 통과
     */
    it('슈퍼관리자 + GET + 멤버 길드 → true 반환 (기존 경로)', () => {
      const ctx = makeContext({ isSuperAdmin: true, guilds: [{ id: 'g1' }] }, 'GET', {
        guildId: 'g1',
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('canActivate — 기존 동작 보존 (회귀)', () => {
    /**
     * guildId 파라미터 없는 경로 → 통과 (기존 동작)
     */
    it('guildId 파라미터 없는 라우트 → true 반환 (통과)', () => {
      const ctx = makeContext({ isSuperAdmin: false, guilds: [] }, 'GET', {});
      expect(guard.canActivate(ctx)).toBe(true);
    });

    /**
     * request.params 자체가 없는 non-HTTP 컨텍스트 → 통과
     */
    it('request.params 없는 non-HTTP 컨텍스트 → true 반환 (skip)', () => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { isSuperAdmin: false, guilds: [] } }) as unknown as Request,
        }),
      } as unknown as ExecutionContext;
      expect(guard.canActivate(ctx)).toBe(true);
    });

    /**
     * 미인증(user 없음) + guildId 있음 → 통과 (기존: JWT 인증 안 된 경우 통과)
     */
    it('미인증(user.guilds 없음) + guildId 있음 → true 반환 (JWT 가드에 위임)', () => {
      const ctx = makeContext(undefined, 'GET', { guildId: 'g1' });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    /**
     * isSuperAdmin=undefined(레거시 JWT) + GET + 비멤버 → 403 (우회 미적용)
     * Plan Phase C: ??: false 하위호환 처리로 === true 미충족 시 우회 안 함
     */
    it('isSuperAdmin=undefined(레거시JWT) + GET + 비멤버 길드 → ForbiddenException (우회 미적용)', () => {
      const ctx = makeContext({ guilds: [] }, 'GET', { guildId: 'non-member-guild' });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    /**
     * isSuperAdmin이 truthy 값(문자열 "true")이어도 우회 미적용 — strict === true 비교
     */
    it('isSuperAdmin=문자열"true"(truthy) + GET + 비멤버 → ForbiddenException (strict === true)', () => {
      const ctx = makeContext({ isSuperAdmin: 'true' as unknown as boolean, guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('에러 메시지', () => {
    it('비멤버 403 메시지는 "해당 길드에 접근 권한이 없습니다."이다', () => {
      const ctx = makeContext({ isSuperAdmin: false, guilds: [] }, 'GET', {
        guildId: 'non-member-guild',
      });
      expect(() => guard.canActivate(ctx)).toThrow('해당 길드에 접근 권한이 없습니다.');
    });
  });
});
