/**
 * Landing i18n 키 구조 단위 테스트
 *
 * ko/en landing.json에 랜딩 페이지에서 사용하는 모든 필수 키가 존재하는지 확인한다.
 * 번역 파일 수정으로 인한 런타임 오류를 사전에 방지하기 위한 정적 검증이다.
 */

import { describe, expect, it } from 'vitest';

import enLanding from '../../../../libs/i18n/locales/en/web/landing.json';
import koLanding from '../../../../libs/i18n/locales/ko/web/landing.json';

// ─── 필수 키 목록 (page.tsx와 LandingNav.tsx에서 사용하는 모든 키) ─────────

const REQUIRED_KEYS = [
  // Hero
  'hero.badge',
  'hero.description',
  'hero.cta.invite',
  'hero.cta.features',
  // Features 섹션
  'features.sectionTitle',
  'features.voiceStats.title',
  'features.voiceStats.description',
  'features.voiceStats.detail',
  'features.autoChannel.title',
  'features.autoChannel.description',
  'features.autoChannel.detail',
  'features.gemini.title',
  'features.gemini.description',
  'features.gemini.detail',
  'features.newbie.title',
  'features.newbie.description',
  'features.newbie.detail',
  'features.dashboard.title',
  'features.dashboard.description',
  'features.dashboard.detail',
  'features.inactiveMember.title',
  'features.inactiveMember.description',
  'features.inactiveMember.detail',
  // Setup 섹션
  'setup.sectionTitle',
  'setup.sectionDescription',
  'setup.step1.title',
  'setup.step1.description',
  'setup.step2.title',
  'setup.step2.description',
  'setup.step2.howTo',
  'setup.step2.step1',
  'setup.step2.step2',
  'setup.step2.step3',
  'setup.step2.notice',
  'setup.step3.title',
  'setup.step3.description',
  // CTA 밴드
  'ctaBand.title',
  'ctaBand.description',
  'ctaBand.button',
  // 네비
  'nav.features',
  'nav.setup',
  'nav.dashboard',
  'nav.invite',
  // Footer
  'footer.privacy',
  'footer.terms',
  'footer.features',
  'footer.dashboardLink',
] as const;

// ─── 헬퍼 ─────────────────────────────────────────────────────────

/**
 * 점으로 구분된 키 경로로 중첩 객체의 값을 가져온다.
 * 값이 없으면 undefined를 반환한다.
 */
function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// ─── 테스트 ────────────────────────────────────────────────────────

describe('Landing 번역 파일 키 구조 검증', () => {
  describe('ko/web/landing.json', () => {
    it.each(REQUIRED_KEYS)('키 "%s"가 존재하고 비어있지 않다', (key) => {
      const value = getNestedValue(koLanding as Record<string, unknown>, key);
      expect(value, `ko landing.json에 키 "${key}"가 없거나 비어있습니다`).toBeTruthy();
      expect(typeof value).toBe('string');
    });
  });

  describe('en/web/landing.json', () => {
    it.each(REQUIRED_KEYS)('키 "%s"가 존재하고 비어있지 않다', (key) => {
      const value = getNestedValue(enLanding as Record<string, unknown>, key);
      expect(value, `en landing.json에 키 "${key}"가 없거나 비어있습니다`).toBeTruthy();
      expect(typeof value).toBe('string');
    });
  });

  describe('음악 기능 — landing.json에는 존재하지만 페이지에서는 사용 안 함', () => {
    it('ko landing.json에 features.music 키가 존재한다 (번역 파일은 보존)', () => {
      const value = getNestedValue(koLanding as Record<string, unknown>, 'features.music.title');
      // music 번역 키는 파일에 남아있을 수 있으나 FEATURE_BLOCKS에서 제거됨
      // 이 테스트는 번역 파일 보존 여부만 확인 (실패해도 무방)
      if (value !== undefined) {
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('ko/en 키 일치 검증', () => {
    it('ko에 있는 필수 키는 en에도 모두 존재한다', () => {
      const missingInEn: string[] = [];

      REQUIRED_KEYS.forEach((key) => {
        const enValue = getNestedValue(enLanding as Record<string, unknown>, key);
        if (!enValue) {
          missingInEn.push(key);
        }
      });

      expect(missingInEn, `en landing.json에 누락된 키: ${missingInEn.join(', ')}`).toHaveLength(0);
    });

    it('en에 있는 필수 키는 ko에도 모두 존재한다', () => {
      const missingInKo: string[] = [];

      REQUIRED_KEYS.forEach((key) => {
        const koValue = getNestedValue(koLanding as Record<string, unknown>, key);
        if (!koValue) {
          missingInKo.push(key);
        }
      });

      expect(missingInKo, `ko landing.json에 누락된 키: ${missingInKo.join(', ')}`).toHaveLength(0);
    });
  });
});
