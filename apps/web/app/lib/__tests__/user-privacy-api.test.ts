/**
 * user-privacy-api.ts 단위 테스트
 *
 * fetchUserPrivacy / saveUserPrivacy 의 URL 구성, 메서드, 페이로드,
 * 성공/실패 응답 처리를 검증한다.
 *
 * fetch를 직접 모킹하여 네트워크 레이어 의존성을 제거한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchUserPrivacy, saveUserPrivacy } from '../user-privacy-api';

// ─── fetch 모킹 헬퍼 ────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function mockFetchError(status: number, message: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ message, statusCode: status })),
    json: () => Promise.resolve({ message, statusCode: status }),
  } as unknown as Response);
}

// ─── HTTP 상태 코드 상수 ─────────────────────────────────────────────────────

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild-privacy-test';

const PRIVACY_FIXTURE = {
  guildId: GUILD_ID,
  userId: 'user-001',
  disableRelationshipShare: false,
};

const PRIVACY_PRIVATE_FIXTURE = {
  guildId: GUILD_ID,
  userId: 'user-001',
  disableRelationshipShare: true,
};

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('fetchUserPrivacy', () => {
  beforeEach(() => vi.restoreAllMocks());

  describe('URL 구성', () => {
    it('guildId가 query string으로 올바르게 인코딩된다', async () => {
      mockFetchOk(PRIVACY_FIXTURE);

      await fetchUserPrivacy(GUILD_ID);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/users/me/privacy?guildId=${encodeURIComponent(GUILD_ID)}`),
        expect.anything(),
      );
    });

    it('특수문자가 포함된 guildId도 인코딩된다', async () => {
      const specialGuildId = 'guild/special&id';
      mockFetchOk({ ...PRIVACY_FIXTURE, guildId: specialGuildId });

      await fetchUserPrivacy(specialGuildId);

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain(`guildId=${encodeURIComponent(specialGuildId)}`);
      // 인코딩 안 된 슬래시나 앰퍼샌드가 노출되지 않아야 한다
      expect(calledUrl).not.toContain('guildId=guild/special&id');
    });
  });

  describe('응답 처리', () => {
    it('정상 응답(200) 시 UserPrivacyConfig 객체를 반환한다', async () => {
      mockFetchOk(PRIVACY_FIXTURE);

      const result = await fetchUserPrivacy(GUILD_ID);

      expect(result).toEqual(PRIVACY_FIXTURE);
    });

    it('disableRelationshipShare=true인 응답도 그대로 반환한다', async () => {
      mockFetchOk(PRIVACY_PRIVATE_FIXTURE);

      const result = await fetchUserPrivacy(GUILD_ID);

      expect(result.disableRelationshipShare).toBe(true);
    });
  });

  describe('API 실패 처리', () => {
    it('API 실패(401) 시 ApiError를 throw한다', async () => {
      mockFetchError(HTTP_STATUS_UNAUTHORIZED, '인증이 필요합니다.');

      await expect(fetchUserPrivacy(GUILD_ID)).rejects.toThrow('인증이 필요합니다.');
    });

    it('API 실패(403) 시 ApiError를 throw한다', async () => {
      mockFetchError(HTTP_STATUS_FORBIDDEN, '권한이 없습니다.');

      await expect(fetchUserPrivacy(GUILD_ID)).rejects.toThrow('권한이 없습니다.');
    });

    it('API 실패(500) 시 ApiError를 throw한다', async () => {
      mockFetchError(500, '서버 내부 오류');

      await expect(fetchUserPrivacy(GUILD_ID)).rejects.toThrow('서버 내부 오류');
    });
  });
});

describe('saveUserPrivacy', () => {
  beforeEach(() => vi.restoreAllMocks());

  describe('URL 및 메서드 구성', () => {
    it('PUT 메서드로 올바른 엔드포인트를 호출한다', async () => {
      mockFetchOk(PRIVACY_FIXTURE);

      await saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: false });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/users/me/privacy?guildId=${encodeURIComponent(GUILD_ID)}`),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('Content-Type: application/json 헤더가 포함된다', async () => {
      mockFetchOk(PRIVACY_FIXTURE);

      await saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: false });

      const calledInit = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      const headers = calledInit.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('요청 바디', () => {
    it('disableRelationshipShare=false 값이 JSON 바디에 포함된다', async () => {
      mockFetchOk(PRIVACY_FIXTURE);

      await saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: false });

      const calledInit = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      const body = JSON.parse(calledInit.body as string) as { disableRelationshipShare: boolean };
      expect(body.disableRelationshipShare).toBe(false);
    });

    it('disableRelationshipShare=true 값이 JSON 바디에 포함된다', async () => {
      mockFetchOk(PRIVACY_PRIVATE_FIXTURE);

      await saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: true });

      const calledInit = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      const body = JSON.parse(calledInit.body as string) as { disableRelationshipShare: boolean };
      expect(body.disableRelationshipShare).toBe(true);
    });

    it('guildId가 요청 바디에 포함된다', async () => {
      mockFetchOk(PRIVACY_FIXTURE);

      await saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: false });

      const calledInit = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
      const body = JSON.parse(calledInit.body as string) as { guildId: string };
      expect(body.guildId).toBe(GUILD_ID);
    });
  });

  describe('응답 처리', () => {
    it('정상 응답(200) 시 저장된 UserPrivacyConfig 객체를 반환한다', async () => {
      mockFetchOk(PRIVACY_PRIVATE_FIXTURE);

      const result = await saveUserPrivacy(GUILD_ID, {
        guildId: GUILD_ID,
        disableRelationshipShare: true,
      });

      expect(result).toEqual(PRIVACY_PRIVATE_FIXTURE);
    });
  });

  describe('API 실패 처리', () => {
    it('API 실패(400) 시 ApiError를 throw한다', async () => {
      mockFetchError(HTTP_STATUS_BAD_REQUEST, '잘못된 요청입니다.');

      await expect(
        saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: false }),
      ).rejects.toThrow('잘못된 요청입니다.');
    });

    it('API 실패(401) 시 ApiError를 throw한다', async () => {
      mockFetchError(HTTP_STATUS_UNAUTHORIZED, '인증이 필요합니다.');

      await expect(
        saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: false }),
      ).rejects.toThrow('인증이 필요합니다.');
    });

    it('API 실패(500) 시 ApiError를 throw한다', async () => {
      mockFetchError(500, '서버 내부 오류');

      await expect(
        saveUserPrivacy(GUILD_ID, { guildId: GUILD_ID, disableRelationshipShare: true }),
      ).rejects.toThrow('서버 내부 오류');
    });
  });
});
