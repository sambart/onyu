/**
 * RolePanelRoleValidator 단위 테스트
 *
 * 커버 케이스:
 * - EC-RP-09: 봇 최상위보다 위계 높은 역할 → 400
 * - EC-RP-10: @everyone / managed 역할 → 400
 * - EC-RP-11: ADMINISTRATOR 비트 보유 역할 → 403, 다중 위반 시 403 우선
 * - 미존재 역할 → 400
 * - 정상 역할 → 예외 없음
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { APIRole } from 'discord.js';

import { RolePanelRoleValidator, type ValidateRolesParams } from './role-panel-role-validator';

/** APIRole 픽스처 생성 헬퍼 */
function makeRole(overrides: Partial<APIRole> = {}): APIRole {
  return {
    id: 'role-1',
    name: '테스트 역할',
    permissions: '0', // ADMINISTRATOR 없음
    position: 1,
    color: 0,
    hoist: false,
    managed: false,
    mentionable: false,
    tags: undefined,
    icon: null,
    unicode_emoji: null,
    flags: 0,
    ...overrides,
  };
}

describe('RolePanelRoleValidator', () => {
  let validator: RolePanelRoleValidator;

  beforeEach(() => {
    validator = new RolePanelRoleValidator();
  });

  describe('validate — 정상 케이스', () => {
    it('위계가 낮고 ADMINISTRATOR 없는 일반 역할은 예외 없음', () => {
      const role = makeRole({ id: 'role-1', position: 1 });
      const params: ValidateRolesParams = {
        roleIds: ['role-1'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).not.toThrow();
    });

    it('roleIds가 빈 배열이면 예외 없음', () => {
      const params: ValidateRolesParams = {
        roleIds: [],
        roles: [],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).not.toThrow();
    });

    it('봇 최상위 position보다 낮은 position의 역할은 통과', () => {
      const role = makeRole({ id: 'role-1', position: 9 });
      const params: ValidateRolesParams = {
        roleIds: ['role-1'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).not.toThrow();
    });
  });

  describe('validate — EC-RP-09: 봇 최상위 역할보다 위계가 높거나 같은 역할', () => {
    it('봇 최상위 position과 동일한 역할은 BadRequestException', () => {
      const role = makeRole({ id: 'role-1', position: 10 });
      const params: ValidateRolesParams = {
        roleIds: ['role-1'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(BadRequestException);
    });

    it('봇 최상위 position보다 높은 역할은 BadRequestException', () => {
      const role = makeRole({ id: 'role-1', position: 15 });
      const params: ValidateRolesParams = {
        roleIds: ['role-1'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(BadRequestException);
    });
  });

  describe('validate — EC-RP-10: @everyone / managed 역할', () => {
    it('@everyone 역할(id === guildId)은 BadRequestException', () => {
      const guildId = 'guild-everyone';
      const role = makeRole({ id: guildId, position: 0 });
      const params: ValidateRolesParams = {
        roleIds: [guildId],
        roles: [role],
        botTopPosition: 10,
        guildId,
      };

      expect(() => validator.validate(params)).toThrow(BadRequestException);
    });

    it('managed=true 역할은 BadRequestException', () => {
      const role = makeRole({ id: 'role-managed', managed: true, position: 1 });
      const params: ValidateRolesParams = {
        roleIds: ['role-managed'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(BadRequestException);
    });

    it('tags가 존재하는 봇 통합 역할은 BadRequestException', () => {
      const role = makeRole({
        id: 'role-bot',
        managed: false,
        position: 1,
        tags: { bot_id: 'bot-123' },
      });
      const params: ValidateRolesParams = {
        roleIds: ['role-bot'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(BadRequestException);
    });
  });

  describe('validate — ADMINISTRATOR 비트 역할 (EC-RP-11)', () => {
    it('ADMINISTRATOR 비트(1<<3=8) 보유 역할은 ForbiddenException', () => {
      // ADMINISTRATOR = 1 << 3 = 8
      const role = makeRole({ id: 'role-admin', permissions: '8', position: 1 });
      const params: ValidateRolesParams = {
        roleIds: ['role-admin'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(ForbiddenException);
    });

    it('ADMINISTRATOR 비트를 포함하는 복합 permissions 값도 ForbiddenException', () => {
      // 8 | 2048 = 2056
      const role = makeRole({ id: 'role-admin', permissions: '2056', position: 1 });
      const params: ValidateRolesParams = {
        roleIds: ['role-admin'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(ForbiddenException);
    });

    it('EC-RP-11 다중 위반: ADMINISTRATOR(403) + 위계(400) 혼재 시 ForbiddenException 우선', () => {
      const adminRole = makeRole({ id: 'role-admin', permissions: '8', position: 1 });
      const highRole = makeRole({ id: 'role-high', permissions: '0', position: 20 });
      const params: ValidateRolesParams = {
        roleIds: ['role-admin', 'role-high'],
        roles: [adminRole, highRole],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(ForbiddenException);
    });

    it('ADMINISTRATOR 위반만 있는 경우 ForbiddenException (BadRequestException 아님)', () => {
      const adminRole = makeRole({ id: 'role-admin', permissions: '8', position: 1 });
      const params: ValidateRolesParams = {
        roleIds: ['role-admin'],
        roles: [adminRole],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      let thrownError: unknown;
      try {
        validator.validate(params);
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError).toBeInstanceOf(ForbiddenException);
      expect(thrownError).not.toBeInstanceOf(BadRequestException);
    });
  });

  describe('validate — 미존재 역할', () => {
    it('roleIds에 있는 roleId가 roles 목록에 없으면 BadRequestException', () => {
      const params: ValidateRolesParams = {
        roleIds: ['nonexistent-role'],
        roles: [],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      expect(() => validator.validate(params)).toThrow(BadRequestException);
    });
  });

  describe('validate — 에러 메시지 내용', () => {
    it('BadRequestException 메시지에 역할 이름이 포함된다', () => {
      const role = makeRole({ id: 'role-1', name: '관리자', position: 20 });
      const params: ValidateRolesParams = {
        roleIds: ['role-1'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      let caughtError: unknown;
      try {
        validator.validate(params);
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      expect((caughtError as BadRequestException).message).toContain('관리자');
    });

    it('ForbiddenException 메시지에 ADMINISTRATOR 문구가 포함된다', () => {
      const role = makeRole({ id: 'role-admin', name: 'Admin', permissions: '8', position: 1 });
      const params: ValidateRolesParams = {
        roleIds: ['role-admin'],
        roles: [role],
        botTopPosition: 10,
        guildId: 'guild-1',
      };

      let caughtError: unknown;
      try {
        validator.validate(params);
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(ForbiddenException);
      expect((caughtError as ForbiddenException).message).toContain('ADMINISTRATOR');
    });
  });
});
