import type { AdminRole, AdminScope } from '@onyu/shared';

const ALL_OPERATIONAL: AdminScope[] = [
  'guild:view',
  'guild:manage',
  'billing:manage',
  'churn:view',
  'usage:view',
  'onboarding:view',
  'notification:manage',
  'feature-flag:manage',
];

export const ROLE_SCOPES: Record<AdminRole, AdminScope[]> = {
  super_admin: [...ALL_OPERATIONAL, 'admin:manage'],
  bot_operator: [...ALL_OPERATIONAL], // admin:manage 제외
};

/**
 * permissions 컬럼 값에 따라 실제 scope 배열을 산출한다.
 * - null: role 기본 scope (ROLE_SCOPES[role])
 * - []: scope 전체 차단
 * - [...]: override 목록을 그대로 반환
 */
export function resolveScopes(role: AdminRole, permissions: string[] | null): AdminScope[] {
  if (permissions === null) return ROLE_SCOPES[role];
  // permissions 컬럼은 text[] (string[]).
  // 값은 AdminScope 유니온 내 문자열만 저장되도록 서비스 레이어에서 강제하므로 단언 안전.
  return permissions as AdminScope[];
}
