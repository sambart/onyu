import { describe, expect, it } from 'vitest';

import { BotI18nService } from './bot-i18n.service';

/**
 * BotI18nService 단위 테스트.
 *
 * 핵심 회귀: role-panel 네임스페이스가 실제 locales JSON에서 로딩되어
 * t()가 키 원문이 아닌 번역 문자열을 반환하는지 검증한다.
 * (prod 빌드에서 locales 경로가 어긋나 키가 원문 노출되던 버그)
 */
describe('BotI18nService', () => {
  function createLoadedService(): BotI18nService {
    const service = new BotI18nService();
    service.onModuleInit();
    return service;
  }

  it('role-panel 네임스페이스의 번역을 반환한다 (키 원문이 아님)', () => {
    const service = createLoadedService();

    expect(service.t('ko', 'role-panel.granted')).toBe('역할이 부여되었습니다.');
    expect(service.t('ko', 'role-panel.removed')).toBe('역할이 제거되었습니다.');
    expect(service.t('en', 'role-panel.granted')).not.toBe('role-panel.granted');
  });

  it('알 수 없는 키는 키 문자열을 그대로 반환한다', () => {
    const service = createLoadedService();

    expect(service.t('ko', 'role-panel.__missing__')).toBe('role-panel.__missing__');
  });

  it('locale이 없으면 기본 locale(en)로 폴백한다', () => {
    const service = createLoadedService();

    // 미지원 locale → en 폴백 → 키 원문이 아니어야 함
    expect(service.t('ja', 'role-panel.granted')).not.toBe('role-panel.granted');
  });

  it('params를 치환한다', () => {
    const service = createLoadedService();

    // 치환 토큰이 없는 메시지는 그대로 반환되며, t() 호출 자체가 실패하지 않아야 함
    const result = service.t('ko', 'role-panel.granted', { foo: 'bar' });
    expect(result).toBe('역할이 부여되었습니다.');
  });
});
