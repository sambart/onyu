/**
 * format-utils.ts 신규 로케일 인지 포맷 함수 단위 테스트
 *
 * formatDate / formatDateTime / formatNumber는 Intl API를 그대로 위임하므로
 * 실행 환경의 ICU 데이터에 의존하지 않도록, 테스트도 동일한 Intl 호출로
 * 기대값을 계산해 비교한다 (환경 무관 검증).
 */

import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatNumber } from '../format-utils';

describe('formatDate', () => {
  it('ko 로케일로 날짜를 포맷한다', () => {
    const iso = '2026-07-02T10:00:00.000Z';
    const expected = new Intl.DateTimeFormat('ko', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(iso));

    expect(formatDate(iso, 'ko')).toBe(expected);
  });

  it('en 로케일로 날짜를 포맷한다', () => {
    const iso = '2026-07-02T10:00:00.000Z';
    const expected = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(iso));

    expect(formatDate(iso, 'en')).toBe(expected);
  });

  it('Date 객체 입력도 지원한다', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const expected = new Intl.DateTimeFormat('ko', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(date);

    expect(formatDate(date, 'ko')).toBe(expected);
  });

  it('잘못된 날짜 문자열이면 "—"를 반환한다', () => {
    expect(formatDate('not-a-date', 'ko')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('ko 로케일로 날짜+시각을 포맷한다', () => {
    const iso = '2026-07-02T10:00:00.000Z';
    const expected = new Intl.DateTimeFormat('ko', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(iso));

    expect(formatDateTime(iso, 'ko')).toBe(expected);
  });

  it('en 로케일로 날짜+시각을 포맷한다', () => {
    const iso = '2026-07-02T10:00:00.000Z';
    const expected = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(iso));

    expect(formatDateTime(iso, 'en')).toBe(expected);
  });

  it('잘못된 날짜 문자열이면 "—"를 반환한다', () => {
    expect(formatDateTime('invalid', 'en')).toBe('—');
  });
});

describe('formatNumber', () => {
  const SAMPLE_VALUE_KO = 1500;
  const SAMPLE_VALUE_EN = 1234567;

  it('ko 로케일에서 천단위 구분 기호를 적용한다', () => {
    expect(formatNumber(SAMPLE_VALUE_KO, 'ko')).toBe(
      new Intl.NumberFormat('ko').format(SAMPLE_VALUE_KO),
    );
    expect(formatNumber(SAMPLE_VALUE_KO, 'ko')).toContain('1');
  });

  it('en 로케일에서 천단위 구분 기호를 적용한다', () => {
    expect(formatNumber(SAMPLE_VALUE_EN, 'en')).toBe(
      new Intl.NumberFormat('en').format(SAMPLE_VALUE_EN),
    );
  });

  it('0을 포맷할 수 있다', () => {
    expect(formatNumber(0, 'ko')).toBe('0');
  });
});
