/**
 * Discord OAuth 진입점 라우트 핸들러 통합 테스트
 *
 * 검증 대상: apps/web/app/auth/discord/route.ts
 *
 * 유저 시나리오:
 * 1. 사용자가 Discord 로그인 버튼을 누르면 API의 Discord OAuth URL로 리다이렉트된다
 * 2. 안전한 returnTo 파라미터가 있으면 쿠키에 저장해 콜백 이후 해당 경로로 돌아간다
 * 3. 악성 returnTo 파라미터(open-redirect 벡터)는 쿠키에 저장하지 않는다
 *
 * 보안 회귀 방지:
 * - 외부 URL·프로토콜-상대 URL returnTo는 쿠키에 절대 저장되지 않음
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '../route';

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function makeRequest(searchParams: Record<string, string> = {}): NextRequest {
  const url = new URL('http://test.example.com/auth/discord');
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

// ─── HTTP 상태 코드 상수 ─────────────────────────────────────────────────────

const HTTP_STATUS_BAD_REQUEST = 400;

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('GET /auth/discord — Discord OAuth 진입점 라우트', () => {
  // ── 1. 기본 리다이렉트 동작 ──────────────────────────────────────────────────

  describe('기본 동작', () => {
    it('사용자가 /auth/discord에 진입하면 API의 Discord OAuth URL로 리다이렉트된다', async () => {
      const req = makeRequest();

      const response = await GET(req);

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(HTTP_STATUS_BAD_REQUEST);
      const location = response.headers.get('location') ?? '';
      expect(location).toContain('/auth/discord');
    });
  });

  // ── 2. 안전한 returnTo 쿠키 저장 ────────────────────────────────────────────

  describe('[보안] 안전한 returnTo 파라미터', () => {
    it('안전한 내부 경로 "/dashboard"를 returnTo로 전달하면 쿠키에 저장된다', async () => {
      const req = makeRequest({ returnTo: '/dashboard' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeDefined();
      // NextResponse는 쿠키 값을 URL 인코딩하므로 /dashboard → %2Fdashboard
      expect(decodeURIComponent(returnToCookie ?? '')).toContain('returnTo=/dashboard');
    });

    it('안전한 returnTo 쿠키는 HttpOnly로 설정된다', async () => {
      const req = makeRequest({ returnTo: '/select-guild' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie?.toLowerCase()).toContain('httponly');
    });

    it('안전한 returnTo 쿠키는 SameSite=Lax로 설정된다', async () => {
      const req = makeRequest({ returnTo: '/foo/bar' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie?.toLowerCase()).toContain('samesite=lax');
    });

    it('안전한 returnTo 쿠키에 10분(Max-Age=600) TTL이 설정된다', async () => {
      const req = makeRequest({ returnTo: '/foo/bar' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie?.toLowerCase()).toContain('max-age=600');
    });
  });

  // ── 3. 악성 returnTo — 쿠키 저장 금지 ─────────────────────────────────────

  describe('[보안] 악성 returnTo 파라미터 — 쿠키 저장 금지', () => {
    it('"//evil.com"은 open-redirect 벡터이므로 returnTo 쿠키에 저장되지 않는다', async () => {
      const req = makeRequest({ returnTo: '//evil.com' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeUndefined();
    });

    it('"https://evil.com"은 외부 절대 URL이므로 returnTo 쿠키에 저장되지 않는다', async () => {
      const req = makeRequest({ returnTo: 'https://evil.com' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeUndefined();
    });

    it('"/\\evil.com"은 슬래시-백슬래시 우회 벡터이므로 returnTo 쿠키에 저장되지 않는다', async () => {
      const req = makeRequest({ returnTo: '/\\evil.com' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeUndefined();
    });

    it('"javascript:alert(1)"은 스킴 인젝션 벡터이므로 returnTo 쿠키에 저장되지 않는다', async () => {
      const req = makeRequest({ returnTo: 'javascript:alert(1)' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeUndefined();
    });

    it('탭 제어문자가 포함된 경로는 returnTo 쿠키에 저장되지 않는다', async () => {
      const tab = String.fromCharCode(9);
      const req = makeRequest({ returnTo: '/' + tab + '/evil.com' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeUndefined();
    });

    it('returnTo가 없으면 returnTo 쿠키가 설정되지 않는다', async () => {
      const req = makeRequest();

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeUndefined();
    });
  });
});
