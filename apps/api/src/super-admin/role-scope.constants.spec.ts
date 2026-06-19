import { resolveScopes, ROLE_SCOPES } from './role-scope.constants';

describe('ROLE_SCOPES', () => {
  it('super_admin은 admin:manage를 포함한다', () => {
    expect(ROLE_SCOPES['super_admin']).toContain('admin:manage');
  });

  it('bot_operator는 admin:manage를 포함하지 않는다', () => {
    expect(ROLE_SCOPES['bot_operator']).not.toContain('admin:manage');
  });

  it('bot_operator는 운영 scope(guild:view 등)를 포함한다', () => {
    const expected = [
      'guild:view',
      'guild:manage',
      'billing:manage',
      'churn:view',
      'usage:view',
      'onboarding:view',
      'notification:manage',
      'feature-flag:manage',
    ];
    for (const scope of expected) {
      expect(ROLE_SCOPES['bot_operator']).toContain(scope);
    }
  });

  it('super_admin은 bot_operator의 모든 scope를 포함한다', () => {
    for (const scope of ROLE_SCOPES['bot_operator']) {
      expect(ROLE_SCOPES['super_admin']).toContain(scope);
    }
  });
});

describe('resolveScopes', () => {
  it('permissions=null → role 기본 scope 반환 (super_admin)', () => {
    const result = resolveScopes('super_admin', null);
    expect(result).toEqual(ROLE_SCOPES['super_admin']);
  });

  it('permissions=null → role 기본 scope 반환 (bot_operator)', () => {
    const result = resolveScopes('bot_operator', null);
    expect(result).toEqual(ROLE_SCOPES['bot_operator']);
  });

  it('permissions=[] → 빈 배열 반환 (전체 차단)', () => {
    const result = resolveScopes('super_admin', []);
    expect(result).toEqual([]);
  });

  it('permissions=[guild:view] → [guild:view] override 반환', () => {
    const result = resolveScopes('super_admin', ['guild:view']);
    expect(result).toEqual(['guild:view']);
  });

  it('permissions=[guild:view, usage:view] → override 목록 그대로 반환', () => {
    const result = resolveScopes('bot_operator', ['guild:view', 'usage:view']);
    expect(result).toEqual(['guild:view', 'usage:view']);
  });

  it('permissions=null과 permissions=[]는 다른 결과를 반환한다 (null≠[] 구분)', () => {
    const withNull = resolveScopes('super_admin', null);
    const withEmpty = resolveScopes('super_admin', []);
    expect(withNull).not.toEqual(withEmpty);
    expect(withNull.length).toBeGreaterThan(0);
    expect(withEmpty.length).toBe(0);
  });
});
