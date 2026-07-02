/**
 * OAuth callback 라우트 핸들러 통합 테스트
 *
 * 검증 대상: apps/web/app/auth/callback/route.ts
 *
 * 유저 시나리오:
 * 1. OAuth 제공자가 ?code= 쿼리와 함께 콜백 URL로 리다이렉트한다
 * 2. 서버가 code를 API 서버로 전달해 JWT를 교환한다 (code는 URL에 절대 노출되지 않음)
 * 3. 성공 시 httpOnly token 쿠키를 설정하고 대시보드로 이동한다
 * 4. 실패 시 로그인 페이지의 에러 상태로 이동한다
 *
 * 보안 회귀 방지:
 * - token이 redirect Location URL에 포함되지 않음 (서버사이드 교환)
 * - token 쿠키가 httpOnly로 설정됨
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

/**
 * NextRequest를 생성한다.
 * x-forwarded-host 헤더를 설정하여 getOrigin()이 http://test.example.com을 반환하게 한다.
 */
function makeRequest(
  searchParams: Record<string, string> = {},
  cookies: Record<string, string> = {},
): NextRequest {
  const url = new URL('http://test.example.com/auth/callback');
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  const req = new NextRequest(url.toString(), {
    headers: {
      'x-forwarded-host': 'test.example.com',
      'x-forwarded-proto': 'http',
    },
  });

  // 쿠키 주입: NextRequest의 쿠키는 Cookie 헤더로 주입한다
  if (Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    return new NextRequest(url.toString(), {
      headers: {
        'x-forwarded-host': 'test.example.com',
        'x-forwarded-proto': 'http',
        Cookie: cookieHeader,
      },
    });
  }

  return req;
}

/** fetch 성공 응답을 mock한다 */
function mockExchangeSuccess(token: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token }),
    }),
  );
}

/** fetch HTTP 오류 응답을 mock한다 */
function mockExchangeHttpError(status = 400) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: 'invalid_code' }),
    }),
  );
}

/** fetch가 token 필드 없이 응답하는 경우를 mock한다 */
function mockExchangeNoToken() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok' }), // token 필드 없음
    }),
  );
}

/** fetch가 네트워크 오류로 throw하는 경우를 mock한다 */
function mockExchangeNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
}

/** 응답의 Location 헤더(redirect URL)를 반환한다 */
function getLocation(response: Response): string {
  return response.headers.get('location') ?? '';
}

/** 응답의 Set-Cookie 헤더 문자열 목록을 반환한다 */
function getSetCookieHeaders(response: Response): string[] {
  // Headers.getSetCookie() — jsdom / undici 모두 지원
  // eslint 규칙상 unknown cast 후 사용
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  // 폴백: 단일 set-cookie 헤더
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

// ─── HTTP 상태 코드 상수 ─────────────────────────────────────────────────────

const HTTP_STATUS_BAD_REQUEST = 400;

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('GET /auth/callback — OAuth code exchange 라우트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // API_INTERNAL_URL 환경변수 초기화
    delete process.env.API_INTERNAL_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── 1. code 쿼리 없음 ──────────────────────────────────────────────────────

  describe('?code 파라미터가 없는 요청', () => {
    it('사용자가 code 없이 callback URL에 진입하면 /login?error=no_code로 리다이렉트된다', async () => {
      const req = makeRequest({}); // code 없음

      const response = await GET(req);

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(HTTP_STATUS_BAD_REQUEST);
      expect(getLocation(response)).toContain('/login?error=no_code');
    });

    it('code가 없으면 exchange API를 호출하지 않는다', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const req = makeRequest({});

      await GET(req);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── 2. exchange API 실패 ────────────────────────────────────────────────────

  describe('exchange API가 실패하는 경우', () => {
    it('exchange API가 !res.ok를 반환하면 /login?error=exchange_failed로 리다이렉트된다', async () => {
      mockExchangeHttpError(HTTP_STATUS_BAD_REQUEST);
      const req = makeRequest({ code: 'invalid-code' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/login?error=exchange_failed');
    });

    it('exchange API가 500 오류를 반환해도 /login?error=exchange_failed로 리다이렉트된다', async () => {
      mockExchangeHttpError(500);
      const req = makeRequest({ code: 'some-code' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/login?error=exchange_failed');
    });

    it('exchange 응답에 token 필드가 없으면 /login?error=exchange_failed로 리다이렉트된다', async () => {
      mockExchangeNoToken();
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/login?error=exchange_failed');
    });

    it('네트워크 오류(fetch throw)가 발생하면 /login?error=exchange_failed로 리다이렉트된다', async () => {
      mockExchangeNetworkError();
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/login?error=exchange_failed');
    });

    it('오류 발생 시 token 쿠키가 설정되지 않는다', async () => {
      mockExchangeHttpError();
      const req = makeRequest({ code: 'bad-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie).toBeUndefined();
    });
  });

  // ── 3. 정상 흐름 — returnTo 없음 ────────────────────────────────────────────

  describe('정상 흐름 — returnTo 쿠키 없음', () => {
    it('code 교환 성공 시 /select-guild로 리다이렉트된다', async () => {
      mockExchangeSuccess('jwt-token-abc');
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/select-guild');
    });

    it('응답에 httpOnly token 쿠키가 설정된다', async () => {
      mockExchangeSuccess('my-jwt-token');
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
    });

    it('token 쿠키에 올바른 JWT 값이 담긴다', async () => {
      const expectedToken = 'eyJhbGciOiJIUzI1NiJ9.payload.sig';
      mockExchangeSuccess(expectedToken);
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie).toContain(`token=${expectedToken}`);
    });

    it('token 쿠키가 SameSite=Lax로 설정된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie?.toLowerCase()).toContain('samesite=lax');
    });

    it('token 쿠키가 Max-Age=3600으로 설정된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie?.toLowerCase()).toContain('max-age=3600');
    });

    it('token 쿠키가 Path=/으로 설정된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie).toContain('Path=/');
    });
  });

  // ── 4. 정상 흐름 — returnTo 쿠키 있음 ──────────────────────────────────────

  describe('정상 흐름 — returnTo 쿠키가 있음', () => {
    it('returnTo 쿠키가 있으면 해당 경로로 리다이렉트된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/dashboard/guild/123/voice' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/dashboard/guild/123/voice');
    });

    it('returnTo 경로로 리다이렉트될 때 /select-guild를 사용하지 않는다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/dashboard/guild/123/voice' });

      const response = await GET(req);

      expect(getLocation(response)).not.toContain('/select-guild');
    });

    it('returnTo 쿠키를 삭제하는 Set-Cookie 헤더가 포함된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/dashboard/guild/123' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      // returnTo 쿠키를 삭제할 때 Max-Age=0 또는 빈 값으로 Set-Cookie를 보낸다
      const returnToCookie = setCookies.find((c) => c.startsWith('returnTo='));
      expect(returnToCookie).toBeDefined();
      // Max-Age=0 또는 expires=epoch로 삭제를 표현한다
      const isDeleted =
        returnToCookie?.toLowerCase().includes('max-age=0') ||
        returnToCookie?.toLowerCase().includes('expires=thu, 01 jan 1970') ||
        returnToCookie === 'returnTo=; Path=/';
      expect(isDeleted).toBe(true);
    });
  });

  // ── 5. exchange API 호출 검증 ────────────────────────────────────────────────

  describe('exchange API 호출 방식 검증', () => {
    it('올바른 URL(http://api:3000/auth/discord/exchange)로 POST 호출한다', async () => {
      mockExchangeSuccess('jwt-token');
      const fetchMock = vi.mocked(globalThis.fetch);
      const req = makeRequest({ code: 'my-code' });

      await GET(req);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://api:3000/auth/discord/exchange',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('API_INTERNAL_URL 환경변수를 기본값 대신 사용한다', async () => {
      // route.ts는 모듈 최상단에서 process.env.API_INTERNAL_URL을 읽는다.
      // vitest의 모듈 캐싱 때문에 런타임 env 변경이 반영되지 않으므로
      // 모듈을 다시 로드해 테스트한다.
      process.env.API_INTERNAL_URL = 'http://internal-api:8080';
      vi.resetModules();

      mockExchangeSuccess('jwt-token');
      const fetchMock = vi.mocked(globalThis.fetch);

      // 모듈을 동적 import해 환경변수가 반영된 버전을 사용한다
      const { GET: GETWithEnv } = await import('../route');
      const req = makeRequest({ code: 'my-code' });

      await GETWithEnv(req);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://internal-api:8080/auth/discord/exchange',
        expect.anything(),
      );

      delete process.env.API_INTERNAL_URL;
      vi.resetModules();
    });

    it('요청 body에 code가 JSON으로 포함된다', async () => {
      mockExchangeSuccess('jwt-token');
      const fetchMock = vi.mocked(globalThis.fetch);
      const req = makeRequest({ code: 'exchange-code-123' });

      await GET(req);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ code: 'exchange-code-123' }),
        }),
      );
    });

    it('Content-Type: application/json 헤더로 호출한다', async () => {
      mockExchangeSuccess('jwt-token');
      const fetchMock = vi.mocked(globalThis.fetch);
      const req = makeRequest({ code: 'valid-code' });

      await GET(req);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  // ── 5-b. returnTo open-redirect 방어 ────────────────────────────────────────

  describe('[보안] returnTo open-redirect 방어', () => {
    it('returnTo 쿠키가 "//evil.com"이면 /select-guild로 리다이렉트된다 (외부 이동 금지)', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '//evil.com' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/select-guild');
    });

    it('returnTo 쿠키가 "//evil.com"이면 redirect Location에 "evil.com"이 포함되지 않는다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '//evil.com' });

      const response = await GET(req);

      expect(getLocation(response)).not.toContain('evil.com');
    });

    it('returnTo 쿠키가 "https://evil.com"이면 /select-guild로 리다이렉트된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: 'https://evil.com' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/select-guild');
    });

    it('returnTo 쿠키가 "/\\evil.com"이면 /select-guild로 리다이렉트된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/\\evil.com' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/select-guild');
    });

    it('탭 제어문자가 포함된 returnTo 쿠키는 /select-guild로 리다이렉트된다', async () => {
      mockExchangeSuccess('jwt-token');
      const tab = String.fromCharCode(9);
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/' + tab + '/evil.com' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/select-guild');
    });

    it('안전한 returnTo 쿠키 "/dashboard"는 해당 경로로 리다이렉트된다', async () => {
      mockExchangeSuccess('jwt-token');
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/dashboard' });

      const response = await GET(req);

      expect(getLocation(response)).toContain('/dashboard');
    });
  });

  // ── 6. 보안 회귀 방지 ───────────────────────────────────────────────────────

  describe('[보안] token이 URL에 노출되지 않음 (서버사이드 교환)', () => {
    it('정상 흐름에서 redirect Location URL에 token 값이 포함되지 않는다', async () => {
      const secretToken = 'super-secret-jwt-value';
      mockExchangeSuccess(secretToken);
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const location = getLocation(response);
      expect(location).not.toContain(secretToken);
    });

    it('returnTo가 있을 때도 redirect Location URL에 token 값이 포함되지 않는다', async () => {
      const secretToken = 'another-secret-jwt';
      mockExchangeSuccess(secretToken);
      const req = makeRequest({ code: 'valid-code' }, { returnTo: '/dashboard/guild/999/voice' });

      const response = await GET(req);

      const location = getLocation(response);
      expect(location).not.toContain(secretToken);
    });

    it('token 쿠키는 반드시 HttpOnly 속성을 가진다', async () => {
      mockExchangeSuccess('any-token');
      const req = makeRequest({ code: 'valid-code' });

      const response = await GET(req);

      const setCookies = getSetCookieHeaders(response);
      const tokenCookie = setCookies.find((c) => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      // HttpOnly는 대소문자 무관
      expect(tokenCookie?.toLowerCase()).toContain('httponly');
    });
  });
});
