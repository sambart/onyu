/**
 * 웹 API 프록시 라우트 회귀 가드 테스트
 *
 * 검증 대상: apps/web/app/api/guilds/[...path]/route.ts
 *
 * 테스트 목적:
 * 1. [보안 회귀 가드] 요청/응답 본문(PII)을 console.warn으로 출력하지 않음
 * 2. 정상 프록시 동작 — URL 조합, 메서드 전달, 헤더 포워딩, 응답 패스스루
 * 3. 연결 실패 시 502 반환 + console.error 호출(에러 정보만, 본문 미포함)
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// next/headers cookies() 모킹 — route.ts가 import 시 참조하므로 최상단에서 선언한다
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';

import { DELETE, GET, PATCH, POST, PUT } from '../route';

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

/**
 * cookies() mock이 지정된 token 값을 반환하도록 설정한다.
 * token이 undefined이면 쿠키가 없는 상태를 시뮬레이션한다.
 */
function mockCookiesWithToken(token: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'token' && token ? { name: 'token', value: token } : undefined,
    // CookieStore의 나머지 메서드는 이 테스트에서 사용하지 않는다
  } as Awaited<ReturnType<typeof cookies>>);
}

/**
 * NextRequest를 생성한다.
 * path는 [...path] 세그먼트에 해당하는 경로 배열이다.
 */
function makeRequest(
  method: string,
  pathSegments: string[],
  options: {
    body?: string;
    contentType?: string;
    queryString?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const search = options.queryString ?? '';
  const url = `http://localhost:4000/api/guilds/${pathSegments.join('/')}${search}`;

  const initHeaders: Record<string, string> = {};
  if (options.contentType) {
    initHeaders['Content-Type'] = options.contentType;
  }
  if (options.headers) {
    Object.assign(initHeaders, options.headers);
  }

  return new NextRequest(url, {
    method,
    body: options.body,
    headers: initHeaders,
  });
}

/**
 * proxy 핸들러에 전달할 params 인자를 생성한다.
 * route.ts는 params를 Promise<{ path: string[] }>로 받는다.
 */
function makeParams(pathSegments: string[]) {
  return { params: Promise.resolve({ path: pathSegments }) };
}

/** fetch 성공 응답을 mock한다 */
function mockFetchSuccess(body: string, options: { status?: number; contentType?: string } = {}) {
  const status = options.status ?? 200;
  const contentType = options.contentType ?? 'application/json';

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      text: async () => body,
      headers: {
        get: (name: string) => (name === 'Content-Type' ? contentType : null),
      },
    }),
  );
}

/** fetch가 네트워크 오류로 throw하는 경우를 mock한다 */
function mockFetchNetworkError(message = 'ECONNREFUSED') {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

// ─── HTTP 상태 코드 상수 ─────────────────────────────────────────────────────
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_BAD_GATEWAY = 502;

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('GET|POST|PUT|PATCH|DELETE /api/guilds/[...path] — 프록시 라우트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.API_INTERNAL_URL;
    // 기본: token 없는 쿠키 상태
    mockCookiesWithToken(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── 1. PII 미로깅 회귀 가드 (보안 핵심) ────────────────────────────────────

  describe('[보안 회귀 가드] PII가 console.warn으로 출력되지 않음', () => {
    it('POST 요청(본문 있음) 프록시 시 console.warn이 한 번도 호출되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const piiBody = JSON.stringify({
        userId: '123456789',
        nickname: '홍길동',
        avatar: 'abc.png',
      });
      mockFetchSuccess(JSON.stringify({ success: true }));
      mockCookiesWithToken('my-jwt-token');

      const req = makeRequest('POST', ['123', 'members'], {
        body: piiBody,
        contentType: 'application/json',
      });
      await POST(req, makeParams(['123', 'members']));

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('POST 성공 응답 시 응답 본문이 어떤 console 출력에도 포함되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const secretResponse = JSON.stringify({ discordId: '999', token: 'secret-pii-value' });
      mockFetchSuccess(secretResponse);
      mockCookiesWithToken('auth-token');

      const req = makeRequest('POST', ['456', 'config'], {
        body: JSON.stringify({ key: 'value' }),
        contentType: 'application/json',
      });
      await POST(req, makeParams(['456', 'config']));

      // warn, log 어느 채널에도 응답 본문이 노출되면 안 된다
      const allWarnArgs = warnSpy.mock.calls.flat().join('');
      const allLogArgs = logSpy.mock.calls.flat().join('');
      expect(allWarnArgs).not.toContain('secret-pii-value');
      expect(allLogArgs).not.toContain('secret-pii-value');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('GET 성공 응답 시에도 console.warn이 호출되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetchSuccess(JSON.stringify([{ id: '1', name: '길드A' }]));
      mockCookiesWithToken('valid-token');

      const req = makeRequest('GET', ['123', 'voice', 'stats']);
      await GET(req, makeParams(['123', 'voice', 'stats']));

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('PUT 요청 시 요청 본문이 console.warn을 통해 노출되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const piiBody = JSON.stringify({ userId: 'u-pii-001', role: 'admin' });
      mockFetchSuccess(JSON.stringify({ updated: true }));

      const req = makeRequest('PUT', ['789', 'roles'], {
        body: piiBody,
        contentType: 'application/json',
      });
      await PUT(req, makeParams(['789', 'roles']));

      // warn 호출이 없거나, 있더라도 PII 내용을 포함하지 않아야 한다
      const allWarnArgs = warnSpy.mock.calls.flat().join('');
      expect(allWarnArgs).not.toContain('u-pii-001');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('PATCH 요청 시 console.warn이 호출되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetchSuccess(JSON.stringify({ patched: true }));

      const req = makeRequest('PATCH', ['321', 'settings'], {
        body: JSON.stringify({ enabled: true }),
        contentType: 'application/json',
      });
      await PATCH(req, makeParams(['321', 'settings']));

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('DELETE 요청 시 console.warn이 호출되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetchSuccess(JSON.stringify({ deleted: true }));

      const req = makeRequest('DELETE', ['111', 'members', 'u-999']);
      await DELETE(req, makeParams(['111', 'members', 'u-999']));

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ── 2. 정상 프록시 동작 ─────────────────────────────────────────────────────

  describe('정상 프록시 동작', () => {
    describe('URL 조합 및 메서드 전달', () => {
      it('GET 요청 시 올바른 URL로 fetch가 호출된다', async () => {
        mockFetchSuccess('[]');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'voice', 'stats']);
        await GET(req, makeParams(['123', 'voice', 'stats']));

        expect(fetchMock).toHaveBeenCalledWith(
          'http://api:3000/api/guilds/123/voice/stats',
          expect.objectContaining({ method: 'GET' }),
        );
      });

      it('단일 path 세그먼트도 올바르게 조합된다', async () => {
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['guild-abc']);
        await GET(req, makeParams(['guild-abc']));

        expect(fetchMock).toHaveBeenCalledWith(
          'http://api:3000/api/guilds/guild-abc',
          expect.anything(),
        );
      });

      it('쿼리 문자열이 URL에 그대로 전달된다', async () => {
        mockFetchSuccess('[]');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'members'], { queryString: '?page=2&limit=10' });
        await GET(req, makeParams(['123', 'members']));

        expect(fetchMock).toHaveBeenCalledWith(
          'http://api:3000/api/guilds/123/members?page=2&limit=10',
          expect.anything(),
        );
      });

      it('POST 요청 시 method: POST로 fetch가 호출된다', async () => {
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('POST', ['123', 'events'], {
          body: JSON.stringify({ type: 'voice_join' }),
          contentType: 'application/json',
        });
        await POST(req, makeParams(['123', 'events']));

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ method: 'POST' }),
        );
      });

      it('API_INTERNAL_URL 환경변수가 설정된 경우 해당 URL을 기본값 대신 사용한다', async () => {
        process.env.API_INTERNAL_URL = 'http://internal-api:8080';
        vi.resetModules();

        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const { GET: GETWithEnv } = await import('../route');
        const req = makeRequest('GET', ['555', 'info']);
        await GETWithEnv(req, makeParams(['555', 'info']));

        expect(fetchMock).toHaveBeenCalledWith(
          'http://internal-api:8080/api/guilds/555/info',
          expect.anything(),
        );

        delete process.env.API_INTERNAL_URL;
        vi.resetModules();
      });
    });

    describe('헤더 포워딩', () => {
      it('token 쿠키가 있으면 Authorization: Bearer 헤더로 전달된다', async () => {
        mockCookiesWithToken('my-secret-jwt');
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'data']);
        await GET(req, makeParams(['123', 'data']));

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer my-secret-jwt',
            }),
          }),
        );
      });

      it('token 쿠키가 없으면 Authorization 헤더가 포함되지 않는다', async () => {
        mockCookiesWithToken(undefined);
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'public']);
        await GET(req, makeParams(['123', 'public']));

        const calledHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as
          | Record<string, string>
          | undefined;
        expect(calledHeaders).not.toHaveProperty('Authorization');
      });

      it('X-Real-IP 헤더가 있으면 그대로 전달된다', async () => {
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'voice'], {
          headers: { 'X-Real-IP': '203.0.113.1' },
        });
        await GET(req, makeParams(['123', 'voice']));

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Real-IP': '203.0.113.1',
            }),
          }),
        );
      });

      it('X-Forwarded-For 헤더가 있으면 그대로 전달된다', async () => {
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'stats'], {
          headers: { 'X-Forwarded-For': '10.0.0.1, 10.0.0.2' },
        });
        await GET(req, makeParams(['123', 'stats']));

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Forwarded-For': '10.0.0.1, 10.0.0.2',
            }),
          }),
        );
      });

      it('Content-Type 헤더가 있으면 그대로 전달된다', async () => {
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('POST', ['123', 'config'], {
          body: '{"key":"val"}',
          contentType: 'application/json',
        });
        await POST(req, makeParams(['123', 'config']));

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          }),
        );
      });
    });

    describe('요청 본문 전달', () => {
      it('POST 요청 시 요청 본문이 fetch body로 전달된다', async () => {
        mockFetchSuccess('{}');
        const fetchMock = vi.mocked(globalThis.fetch);
        const body = JSON.stringify({ action: 'create', name: '테스트' });

        const req = makeRequest('POST', ['123', 'channels'], {
          body,
          contentType: 'application/json',
        });
        await POST(req, makeParams(['123', 'channels']));

        expect(fetchMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ body }),
        );
      });

      it('GET 요청 시 body가 fetch에 전달되지 않는다', async () => {
        mockFetchSuccess('[]');
        const fetchMock = vi.mocked(globalThis.fetch);

        const req = makeRequest('GET', ['123', 'list']);
        await GET(req, makeParams(['123', 'list']));

        const fetchOptions = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
        expect(fetchOptions?.body).toBeUndefined();
      });
    });

    describe('응답 패스스루', () => {
      it('API가 200을 반환하면 프록시도 200을 반환한다', async () => {
        mockFetchSuccess(JSON.stringify({ data: [] }), { status: 200 });

        const req = makeRequest('GET', ['123', 'members']);
        const response = await GET(req, makeParams(['123', 'members']));

        expect(response.status).toBe(200);
      });

      it('API가 201을 반환하면 프록시도 201을 반환한다', async () => {
        mockFetchSuccess(JSON.stringify({ id: 'new-resource' }), { status: HTTP_STATUS_CREATED });

        const req = makeRequest('POST', ['123', 'channels'], {
          body: JSON.stringify({ name: '새채널' }),
        });
        const response = await POST(req, makeParams(['123', 'channels']));

        expect(response.status).toBe(HTTP_STATUS_CREATED);
      });

      it('API가 404를 반환하면 프록시도 404를 반환한다', async () => {
        mockFetchSuccess(JSON.stringify({ error: 'not found' }), { status: 404 });

        const req = makeRequest('GET', ['123', 'nonexistent']);
        const response = await GET(req, makeParams(['123', 'nonexistent']));

        expect(response.status).toBe(404);
      });

      it('응답 본문이 그대로 패스스루된다', async () => {
        const expectedBody = JSON.stringify({ users: [{ id: '1', name: 'Alice' }] });
        mockFetchSuccess(expectedBody);

        const req = makeRequest('GET', ['123', 'members']);
        const response = await GET(req, makeParams(['123', 'members']));
        const text = await response.text();

        expect(text).toBe(expectedBody);
      });

      it('API의 Content-Type이 응답 헤더에 포함된다', async () => {
        mockFetchSuccess('{"ok":true}', { contentType: 'application/json; charset=utf-8' });

        const req = makeRequest('GET', ['123', 'data']);
        const response = await GET(req, makeParams(['123', 'data']));

        expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      });

      it('응답 헤더에 Cache-Control: no-store가 포함된다', async () => {
        mockFetchSuccess('{}');

        const req = makeRequest('GET', ['123', 'data']);
        const response = await GET(req, makeParams(['123', 'data']));

        expect(response.headers.get('Cache-Control')).toContain('no-store');
      });
    });
  });

  // ── 3. 연결 실패 ────────────────────────────────────────────────────────────

  describe('연결 실패 (fetch throw)', () => {
    it('fetch가 throw하면 502를 반환한다', async () => {
      mockFetchNetworkError('ECONNREFUSED');

      const req = makeRequest('GET', ['123', 'stats']);
      const response = await GET(req, makeParams(['123', 'stats']));

      expect(response.status).toBe(HTTP_STATUS_BAD_GATEWAY);
    });

    it('502 응답 body에 { error: "Backend API is unreachable" }가 포함된다', async () => {
      mockFetchNetworkError();

      const req = makeRequest('GET', ['123', 'stats']);
      const response = await GET(req, makeParams(['123', 'stats']));
      const body = (await response.json()) as { error: string };

      expect(body.error).toBe('Backend API is unreachable');
    });

    it('연결 실패 시 console.error가 호출된다 (에러 정보 로깅은 유지)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetchNetworkError('connection refused');

      const req = makeRequest('POST', ['123', 'events'], { body: '{}' });
      await POST(req, makeParams(['123', 'events']));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('연결 실패 시 console.error 메시지에 [PROXY] 접두사가 포함된다', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetchNetworkError();

      const req = makeRequest('GET', ['999', 'voice']);
      await GET(req, makeParams(['999', 'voice']));

      const firstArg = errorSpy.mock.calls[0]?.[0] as string | undefined;
      expect(firstArg).toContain('[PROXY]');
    });

    it('연결 실패 시에도 console.warn은 호출되지 않는다', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetchNetworkError();

      const req = makeRequest('POST', ['123', 'config'], {
        body: JSON.stringify({ pii: 'sensitive-data' }),
        contentType: 'application/json',
      });
      await POST(req, makeParams(['123', 'config']));

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('POST 연결 실패 시 요청 본문이 console.error 출력에 포함되지 않는다', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetchNetworkError();
      const piiBody = JSON.stringify({ userId: 'pii-user-id', password: 'secret123' });

      const req = makeRequest('POST', ['123', 'auth'], {
        body: piiBody,
        contentType: 'application/json',
      });
      await POST(req, makeParams(['123', 'auth']));

      const allErrorArgs = errorSpy.mock.calls.flat().map(String).join('');
      expect(allErrorArgs).not.toContain('pii-user-id');
      expect(allErrorArgs).not.toContain('secret123');
    });
  });
});
