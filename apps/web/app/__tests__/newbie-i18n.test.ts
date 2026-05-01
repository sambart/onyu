/**
 * Newbie 신규 i18n 키 검증 단위 테스트
 *
 * missionUseMicTime 관련 변경으로 추가된 신규 키 5종이
 * ko/en settings.json 및 ko/en dashboard.json에 존재하는지 정적으로 확인한다.
 *
 * 런타임에 next-intl이 키를 찾지 못하면 빈 문자열이나 키 그대로 노출되므로
 * 번역 파일 누락을 사전 방지하기 위한 Unit 테스트이다.
 */

import { describe, expect, it } from 'vitest';

import enDashboard from '../../../../libs/i18n/locales/en/web/dashboard.json';
import enSettings from '../../../../libs/i18n/locales/en/web/settings.json';
import koDashboard from '../../../../libs/i18n/locales/ko/web/dashboard.json';
import koSettings from '../../../../libs/i18n/locales/ko/web/settings.json';

// ─── 헬퍼: 점 경로로 중첩 객체 값을 가져온다 ────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current == null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

// ─── settings.json 신규 키 4종 ───────────────────────────────────────────────

// MissionTab에서 사용하는 missionUseMicTime 관련 신규 키
const SETTINGS_NEW_KEYS = [
  'newbie.mission.useMicTime',
  'newbie.mission.useMicTimeDesc',
  'newbie.mission.useMicTimeWarning',
  'newbie.mission.useMicTimeBadge',
];

// ─── dashboard.json 신규 키 1종 ──────────────────────────────────────────────

// MissionManageTab 플레이타임 컬럼 헤더 힌트
const DASHBOARD_NEW_KEYS = ['newbie.missionManage.table.playtimeMicHint'];

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('newbie settings.json 신규 i18n 키 검증', () => {
  describe('ko/settings.json', () => {
    it.each(SETTINGS_NEW_KEYS)('"%s" 키가 존재한다', (key) => {
      const value = getNestedValue(koSettings as Record<string, unknown>, key);
      expect(value, `ko/settings.json에 "${key}" 키가 없거나 비어 있습니다`).toBeTruthy();
    });
  });

  describe('en/settings.json', () => {
    it.each(SETTINGS_NEW_KEYS)('"%s" 키가 존재한다', (key) => {
      const value = getNestedValue(enSettings as Record<string, unknown>, key);
      expect(value, `en/settings.json에 "${key}" 키가 없거나 비어 있습니다`).toBeTruthy();
    });
  });
});

describe('newbie dashboard.json 신규 i18n 키 검증', () => {
  describe('ko/dashboard.json', () => {
    it.each(DASHBOARD_NEW_KEYS)('"%s" 키가 존재한다', (key) => {
      const value = getNestedValue(koDashboard as Record<string, unknown>, key);
      expect(value, `ko/dashboard.json에 "${key}" 키가 없거나 비어 있습니다`).toBeTruthy();
    });
  });

  describe('en/dashboard.json', () => {
    it.each(DASHBOARD_NEW_KEYS)('"%s" 키가 존재한다', (key) => {
      const value = getNestedValue(enDashboard as Record<string, unknown>, key);
      expect(value, `en/dashboard.json에 "${key}" 키가 없거나 비어 있습니다`).toBeTruthy();
    });
  });
});
