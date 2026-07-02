/**
 * relative-time.ts 단위 테스트
 *
 * 순수 함수 formatRelativeTime의 로직 검증.
 * 구간별 출력 형식(방금 전 / 분 / 시간 / 날짜)을 커버한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeTime } from '../relative-time';

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-06-21T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('방금 전 (60초 미만)', () => {
    it('0초 차이이면 방금 전을 반환한다', () => {
      const result = formatRelativeTime(new Date(NOW), 'ko');
      expect(result).toBe('방금 전');
    });

    it('59초 전이면 방금 전을 반환한다', () => {
      const past = new Date(NOW - 59 * 1000);
      expect(formatRelativeTime(past, 'ko')).toBe('방금 전');
    });

    it('영문 로케일에서 59초 전이면 just now를 반환한다', () => {
      const past = new Date(NOW - 59 * 1000);
      expect(formatRelativeTime(past, 'en')).toBe('just now');
    });
  });

  describe('분 단위 (60초 이상 ~ 3600초 미만)', () => {
    it('1분 전이면 분 단위 상대시각을 반환한다', () => {
      const past = new Date(NOW - 60 * 1000);
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/분/);
    });

    it('30분 전이면 분 단위 상대시각을 반환한다', () => {
      const past = new Date(NOW - 30 * 60 * 1000);
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/분/);
    });

    it('59분 59초 전이면 분 단위를 반환한다 (시간 단위 아님)', () => {
      const past = new Date(NOW - (3600 - 1) * 1000);
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/분/);
    });
  });

  describe('시간 단위 (3600초 이상 ~ 86400초 미만)', () => {
    it('1시간 전이면 시간 단위 상대시각을 반환한다', () => {
      const past = new Date(NOW - 3600 * 1000);
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/시간/);
    });

    it('23시간 전이면 시간 단위를 반환한다 (날짜 아님)', () => {
      const past = new Date(NOW - 23 * 3600 * 1000);
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/시간/);
    });
  });

  describe('날짜 단위 (86400초 이상)', () => {
    it('1일 이상이면 날짜 문자열을 반환한다', () => {
      const past = new Date(NOW - 86400 * 1000);
      const result = formatRelativeTime(past, 'ko');
      // toLocaleDateString 형식 — 숫자가 포함되어야 함
      expect(result).toMatch(/\d/);
    });

    it('7일 전이면 날짜 문자열을 반환한다', () => {
      const past = new Date(NOW - 7 * 86400 * 1000);
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/\d/);
    });
  });

  describe('ISO 8601 문자열 입력', () => {
    it('ISO 문자열을 입력해도 동일하게 동작한다', () => {
      const past = new Date(NOW - 5 * 60 * 1000).toISOString();
      const result = formatRelativeTime(past, 'ko');
      expect(result).toMatch(/분/);
    });
  });

  describe('기본 로케일', () => {
    it('로케일 미지정 시 ko가 기본값으로 사용된다', () => {
      const past = new Date(NOW - 59 * 1000);
      const result = formatRelativeTime(past);
      expect(result).toBe('방금 전');
    });
  });
});
