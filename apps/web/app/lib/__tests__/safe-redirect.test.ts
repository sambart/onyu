/**
 * safe-redirect.ts — isSafeReturnPath 단위 테스트
 *
 * open-redirect 방어 회귀 가드.
 * 내부 절대경로만 true, 외부 URL·프로토콜-상대 URL·제어문자 포함 경로는 false.
 *
 * 검증 대상: apps/web/app/lib/safe-redirect.ts
 */

import { describe, expect, it } from 'vitest';

import { isSafeReturnPath } from '../safe-redirect';

// ─── true 케이스 (안전한 내부 경로) ────────────────────────────────────────────

describe('isSafeReturnPath — 안전한 내부 경로 (true)', () => {
  it('루트 경로 "/"는 true를 반환한다', () => {
    expect(isSafeReturnPath('/')).toBe(true);
  });

  it('일반 경로 "/foo"는 true를 반환한다', () => {
    expect(isSafeReturnPath('/foo')).toBe(true);
  });

  it('중첩 경로 "/foo/bar"는 true를 반환한다', () => {
    expect(isSafeReturnPath('/foo/bar')).toBe(true);
  });

  it('쿼리 파라미터가 포함된 경로 "/foo/bar?x=1"은 true를 반환한다', () => {
    expect(isSafeReturnPath('/foo/bar?x=1')).toBe(true);
  });

  it('실제 앱 경로 "/select-guild"는 true를 반환한다', () => {
    expect(isSafeReturnPath('/select-guild')).toBe(true);
  });

  it('깊은 경로 "/dashboard/guild/123/voice"는 true를 반환한다', () => {
    expect(isSafeReturnPath('/dashboard/guild/123/voice')).toBe(true);
  });
});

// ─── false 케이스 — open-redirect 벡터 ────────────────────────────────────────

describe('isSafeReturnPath — open-redirect 벡터 (false)', () => {
  it('"//evil.com"은 프로토콜-상대 URL로 false를 반환한다', () => {
    expect(isSafeReturnPath('//evil.com')).toBe(false);
  });

  it('"/\\evil.com"은 슬래시-백슬래시 우회 벡터로 false를 반환한다', () => {
    expect(isSafeReturnPath('/\\evil.com')).toBe(false);
  });

  it('"https://evil.com"은 절대 URL로 false를 반환한다', () => {
    expect(isSafeReturnPath('https://evil.com')).toBe(false);
  });

  it('"http:evil"은 슬래시 없이 시작하므로 false를 반환한다', () => {
    expect(isSafeReturnPath('http:evil')).toBe(false);
  });

  it('"\\\\evil"은 슬래시로 시작하지 않으므로 false를 반환한다', () => {
    expect(isSafeReturnPath('\\\\evil')).toBe(false);
  });

  it('"javascript:alert(1)"은 슬래시로 시작하지 않으므로 false를 반환한다', () => {
    expect(isSafeReturnPath('javascript:alert(1)')).toBe(false);
  });
});

// ─── false 케이스 — 빈값 / nullish ────────────────────────────────────────────

describe('isSafeReturnPath — 빈값 및 nullish (false)', () => {
  it('빈 문자열 ""은 false를 반환한다', () => {
    expect(isSafeReturnPath('')).toBe(false);
  });

  it('null은 false를 반환한다', () => {
    expect(isSafeReturnPath(null)).toBe(false);
  });

  it('undefined는 false를 반환한다', () => {
    expect(isSafeReturnPath(undefined)).toBe(false);
  });
});

// ─── false 케이스 — 제어문자 우회 ────────────────────────────────────────────

describe('isSafeReturnPath — 제어문자 포함 경로 (false)', () => {
  it('탭(0x09)이 포함된 경로는 false를 반환한다', () => {
    const tab = String.fromCharCode(9);
    expect(isSafeReturnPath('/' + tab + '/evil.com')).toBe(false);
  });

  it('개행(0x0A)이 포함된 경로는 false를 반환한다', () => {
    const lf = String.fromCharCode(10);
    expect(isSafeReturnPath('/' + lf + '/evil.com')).toBe(false);
  });

  it('캐리지 리턴(0x0D)이 포함된 경로는 false를 반환한다', () => {
    const cr = String.fromCharCode(13);
    expect(isSafeReturnPath('/' + cr + '/evil.com')).toBe(false);
  });

  it('NUL(0x00)이 포함된 경로는 false를 반환한다', () => {
    const nul = String.fromCharCode(0);
    expect(isSafeReturnPath('/' + nul + '/evil.com')).toBe(false);
  });
});
