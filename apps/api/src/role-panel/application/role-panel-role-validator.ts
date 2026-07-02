import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DISCORD_ADMINISTRATOR_BIT } from '@onyu/shared';
import type { APIRole } from 'discord.js';

/** BigInt 0 상수 (no-magic-numbers 준수) */
const BIGINT_ZERO = 0n;

/** 역할 검증 결과 분류 */
const enum ViolationKind {
  FORBIDDEN = 'FORBIDDEN',
  BAD_REQUEST = 'BAD_REQUEST',
}

/** 역할 검증 위반 정보 */
interface RoleViolation {
  roleId: string;
  reason: string;
  kind: ViolationKind;
}

/** validate 파라미터 묶음 */
export interface ValidateRolesParams {
  roleIds: string[];
  roles: APIRole[];
  botTopPosition: number;
  guildId: string;
}

/**
 * 패널 저장(POST 1.3 / PUT 1.4) 시 역할 위계·권한 검증.
 * fail-closed 최종 방어선 — fail-open 금지.
 *
 * 우선순위: ADMINISTRATOR(403) > 부여불가(400)
 */
@Injectable()
export class RolePanelRoleValidator {
  /**
   * 버튼에 매핑된 roleId 목록을 검증한다.
   *
   * @throws ForbiddenException ADMINISTRATOR 비트 보유 역할 매핑 시도
   * @throws BadRequestException 위계 높음 / managed / @everyone / 미존재 역할
   */
  validate({ roleIds, roles, botTopPosition, guildId }: ValidateRolesParams): void {
    const roleMap = new Map(roles.map((r) => [r.id, r]));
    const violations = roleIds
      .map((roleId) =>
        this.evaluateRole({ roleId, role: roleMap.get(roleId), botTopPosition, guildId }),
      )
      .filter((v): v is RoleViolation => v !== null);

    if (violations.length === 0) return;

    // ADMINISTRATOR(403) 위반이 하나라도 있으면 우선 처리
    const forbiddenViolations = violations.filter((v) => v.kind === ViolationKind.FORBIDDEN);
    if (forbiddenViolations.length > 0) {
      throw new ForbiddenException(forbiddenViolations.map((v) => v.reason).join('; '));
    }

    throw new BadRequestException(violations.map((v) => v.reason).join('; '));
  }

  /**
   * 단일 역할의 위반 여부를 평가한다.
   * 위반이 없으면 null 반환, 위반 시 RoleViolation 반환.
   */
  private evaluateRole({
    roleId,
    role,
    botTopPosition,
    guildId,
  }: {
    roleId: string;
    role: APIRole | undefined;
    botTopPosition: number;
    guildId: string;
  }): RoleViolation | null {
    if (!role) {
      return {
        roleId,
        reason: `역할 ID ${roleId}를 찾을 수 없습니다`,
        kind: ViolationKind.BAD_REQUEST,
      };
    }

    // ADMINISTRATOR 비트 검증 (403) — 우선순위 최고
    if ((BigInt(role.permissions) & DISCORD_ADMINISTRATOR_BIT) !== BIGINT_ZERO) {
      return {
        roleId,
        reason: `역할 "${role.name}"은 ADMINISTRATOR 권한을 보유하여 매핑할 수 없습니다`,
        kind: ViolationKind.FORBIDDEN,
      };
    }

    // @everyone 역할 검증 (400)
    if (role.id === guildId) {
      return {
        roleId,
        reason: `@everyone 역할은 매핑할 수 없습니다`,
        kind: ViolationKind.BAD_REQUEST,
      };
    }

    // managed/integration 역할 검증 (400)
    if (role.managed || (role.tags !== undefined && role.tags !== null)) {
      return {
        roleId,
        reason: `역할 "${role.name}"은 봇/통합 관리 역할(managed)이라 매핑할 수 없습니다`,
        kind: ViolationKind.BAD_REQUEST,
      };
    }

    // 봇 최상위 역할보다 위계가 높은 역할 (400)
    if (role.position >= botTopPosition) {
      return {
        roleId,
        reason: `역할 "${role.name}"(position=${role.position})은 봇 최상위 역할(position=${botTopPosition})보다 위계가 높거나 같아 매핑할 수 없습니다`,
        kind: ViolationKind.BAD_REQUEST,
      };
    }

    return null;
  }
}
