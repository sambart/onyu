/**
 * admin-api.ts CRUD 함수 단위 테스트
 *
 * 검증 항목:
 * fetchAdmins
 * - GET /api/admin/admins 호출 확인
 * - 배열 직반환 형태 처리
 * - envelope { admins: [...] } 형태 처리
 * - 실패 시 ApiError throw
 *
 * createAdmin
 * - POST /api/admin/admins 호출 + body 형태 확인
 * - 실패 시 ApiError throw (409 중복)
 *
 * updateAdminRole
 * - PATCH /api/admin/admins/:id 호출 + body 형태 확인
 * - discordUserId가 URL 인코딩됨
 *
 * deactivateAdmin
 * - DELETE /api/admin/admins/:id 호출 확인
 * - 204 응답 시 정상 처리
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api-client';
import { createAdmin, deactivateAdmin, fetchAdmins, updateAdminRole } from '../admin-api';
import type { AdminUser } from '../admin-api';

// ─── fetch mock 헬퍼 ──────────────────────────────────────────────────────────

function mockFetchOk(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status,
    text: () => Promise.resolve(status === 204 ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function mockFetchError(status: number, body: unknown = { message: '에러', code: undefined }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const sampleAdmin: AdminUser = {
  discordUserId: '111222333444555666',
  role: 'bot_operator',
  grantedBy: 'system',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
};

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('fetchAdmins', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/admin/admins 를 호출한다', async () => {
    mockFetchOk([sampleAdmin]);

    await fetchAdmins();

    // method가 명시되지 않으면 GET이 기본값 — URL만 검증
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit?,
    ];
    expect(url).toBe('/api/admin/admins');
  });

  it('배열 직반환 형태를 처리한다', async () => {
    mockFetchOk([sampleAdmin]);

    const result = await fetchAdmins();

    expect(result).toEqual([sampleAdmin]);
  });

  it('envelope { admins: [...] } 형태를 처리한다', async () => {
    mockFetchOk({ admins: [sampleAdmin] });

    const result = await fetchAdmins();

    expect(result).toEqual([sampleAdmin]);
  });

  it('API 실패 시 ApiError 를 throw 한다', async () => {
    mockFetchError(401, { message: '인증 필요' });

    await expect(fetchAdmins()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('createAdmin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /api/admin/admins 를 호출하고 body에 discordUserId와 role을 포함한다', async () => {
    mockFetchOk(undefined, 201);

    await createAdmin({ discordUserId: '111222333444555666', role: 'bot_operator' });

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/admin/admins');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      discordUserId: '111222333444555666',
      role: 'bot_operator',
    });
  });

  it('409 에러 시 ApiError(status=409) 를 throw 한다', async () => {
    mockFetchError(409, { message: '이미 등록된 관리자', code: 'DUPLICATE_ADMIN' });

    const error = await createAdmin({
      discordUserId: '111222333444555666',
      role: 'bot_operator',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).code).toBe('DUPLICATE_ADMIN');
  });

  it('super_admin 역할로도 정상 호출된다', async () => {
    mockFetchOk(undefined, 201);

    await createAdmin({ discordUserId: '999888777666555444', role: 'super_admin' });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toMatchObject({ role: 'super_admin' });
  });
});

describe('updateAdminRole', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('PATCH /api/admin/admins/:id 를 호출하고 body에 role을 포함한다', async () => {
    mockFetchOk(undefined, 200);

    await updateAdminRole('111222333444555666', 'super_admin');

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/admin/admins/111222333444555666');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ role: 'super_admin' });
  });

  it('discordUserId 가 URL 인코딩된다', async () => {
    mockFetchOk(undefined, 200);

    // 특수문자 포함 ID (실제로는 숫자지만 encodeURIComponent 동작 확인)
    await updateAdminRole('111/222', 'bot_operator');

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('/api/admin/admins/111%2F222');
  });

  it('404 에러 시 ApiError(status=404) 를 throw 한다', async () => {
    mockFetchError(404, { message: '관리자를 찾을 수 없음' });

    const error = await updateAdminRole('111222333444555666', 'super_admin').catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });
});

describe('deactivateAdmin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETE /api/admin/admins/:id 를 호출한다', async () => {
    mockFetchOk(undefined, 204);

    await deactivateAdmin('111222333444555666');

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/admin/admins/111222333444555666');
    expect(init.method).toBe('DELETE');
  });

  it('204 No Content 응답 시 정상적으로 완료된다', async () => {
    mockFetchOk(undefined, 204);

    await expect(deactivateAdmin('111222333444555666')).resolves.toBeUndefined();
  });

  it('400 에러 시 ApiError(status=400) 를 throw 한다', async () => {
    mockFetchError(400, { message: '마지막 super_admin은 비활성화할 수 없습니다' });

    const error = await deactivateAdmin('111222333444555666').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });
});
