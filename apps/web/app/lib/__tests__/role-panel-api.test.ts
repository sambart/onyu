/**
 * role-panel-api.ts 단위 테스트
 *
 * 순수 API 클라이언트 호출 URL·메서드·에러 전파 검증.
 * 유저 시나리오가 아닌 순수 함수(apiClient 래퍼) 계층이므로 Unit 레벨로 작성한다.
 *
 * 커버:
 *  - fetchRolePanels   → GET /api/guilds/{guildId}/role-panel
 *  - fetchAssignableRoles → GET /api/guilds/{guildId}/role-panel/assignable-roles
 *  - fetchAssignableRoles(refresh=true) → ?refresh=true 쿼리스트링 포함
 *  - createRolePanel   → POST /api/guilds/{guildId}/role-panel
 *  - updateRolePanel   → PUT  /api/guilds/{guildId}/role-panel/{panelId}
 *  - deleteRolePanel   → DELETE /api/guilds/{guildId}/role-panel/{panelId}
 *  - publishRolePanel  → POST /api/guilds/{guildId}/role-panel/{panelId}/publish
 *  - 에러 응답 → ApiError throw 전파
 */

import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRolePanel,
  deleteRolePanel,
  fetchAssignableRoles,
  fetchRolePanels,
  publishRolePanel,
  updateRolePanel,
} from '../role-panel-api';

// ─── fetch 글로벌 모킹 ─────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** 성공 응답 mock 헬퍼 */
function mockOkJson(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
}

/** 에러 응답 mock 헬퍼 */
function mockErrorJson(status: number, body: { message: string; code?: string }) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  });
}

// ─── 샘플 DTO ─────────────────────────────────────────────────

const SAVE_DTO = {
  name: '역할 패널',
  channelId: 'ch-1',
  embedTitle: null,
  embedDescription: null,
  embedColor: '#5865F2',
  buttons: [
    {
      label: '게이머',
      emoji: null,
      roleId: 'r1',
      mode: RolePanelButtonMode.GRANT,
      style: RolePanelButtonStyle.PRIMARY,
      sortOrder: 0,
    },
  ],
};

const PANEL_RESPONSE = {
  id: 1,
  name: '역할 패널',
  channelId: 'ch-1',
  messageId: null,
  embedTitle: null,
  embedDescription: null,
  embedColor: '#5865F2',
  published: false,
  buttons: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ─── 테스트 ───────────────────────────────────────────────────

describe('role-panel-api', () => {
  describe('fetchRolePanels', () => {
    it('GET /api/guilds/{guildId}/role-panel 를 호출한다', async () => {
      mockOkJson([PANEL_RESPONSE]);

      const result = await fetchRolePanels('guild-1');

      // apiClient GET은 method를 명시하지 않는다 — URL만 검증
      const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('/api/guilds/guild-1/role-panel');
      expect(result).toEqual([PANEL_RESPONSE]);
    });

    it('API 실패 시 빈 배열(fallback)을 반환한다 (apiGet 폴백 동작)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'err' }),
      });

      const result = await fetchRolePanels('guild-1');

      expect(result).toEqual([]);
    });
  });

  describe('fetchAssignableRoles', () => {
    it('GET /api/guilds/{guildId}/role-panel/assignable-roles 를 호출한다', async () => {
      mockOkJson([]);

      await fetchAssignableRoles('guild-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/guilds/guild-1/role-panel/assignable-roles',
        expect.anything(),
      );
    });

    it('refresh=true이면 ?refresh=true 쿼리스트링을 포함한다', async () => {
      mockOkJson([]);

      await fetchAssignableRoles('guild-1', true);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/guilds/guild-1/role-panel/assignable-roles?refresh=true',
        expect.anything(),
      );
    });

    it('refresh 기본값(false)이면 쿼리스트링을 붙이지 않는다', async () => {
      mockOkJson([]);

      await fetchAssignableRoles('guild-1');

      const url = (mockFetch.mock.calls[0] as unknown[])[0] as string;
      expect(url).not.toContain('refresh');
    });
  });

  describe('createRolePanel', () => {
    it('POST /api/guilds/{guildId}/role-panel 를 JSON 바디와 함께 호출한다', async () => {
      mockOkJson(PANEL_RESPONSE);

      const result = await createRolePanel('guild-1', SAVE_DTO);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/guilds/guild-1/role-panel');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(SAVE_DTO));
      expect(result).toEqual(PANEL_RESPONSE);
    });

    it('403 응답 시 ApiError를 throw한다', async () => {
      mockErrorJson(403, { message: '관리자 권한 역할은 매핑할 수 없습니다', code: 'FORBIDDEN' });

      await expect(createRolePanel('guild-1', SAVE_DTO)).rejects.toMatchObject({
        status: 403,
        message: '관리자 권한 역할은 매핑할 수 없습니다',
      });
    });

    it('400 응답 시 ApiError를 throw한다', async () => {
      mockErrorJson(400, { message: '버튼 0개 패널은 저장할 수 없습니다' });

      await expect(createRolePanel('guild-1', SAVE_DTO)).rejects.toMatchObject({
        status: 400,
        message: '버튼 0개 패널은 저장할 수 없습니다',
      });
    });
  });

  describe('updateRolePanel', () => {
    it('PUT /api/guilds/{guildId}/role-panel/{panelId} 를 호출한다', async () => {
      mockOkJson(PANEL_RESPONSE);

      await updateRolePanel('guild-1', 42, SAVE_DTO);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/guilds/guild-1/role-panel/42');
      expect(init.method).toBe('PUT');
    });

    it('403 응답 시 ApiError message를 포함한 에러를 throw한다', async () => {
      mockErrorJson(403, { message: '비운영 길드 mutation 차단' });

      await expect(updateRolePanel('guild-1', 1, SAVE_DTO)).rejects.toMatchObject({
        status: 403,
        message: '비운영 길드 mutation 차단',
      });
    });
  });

  describe('deleteRolePanel', () => {
    it('DELETE /api/guilds/{guildId}/role-panel/{panelId} 를 호출한다', async () => {
      mockOkJson({ ok: true });

      const result = await deleteRolePanel('guild-1', 7);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/guilds/guild-1/role-panel/7');
      expect(init.method).toBe('DELETE');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('publishRolePanel', () => {
    it('POST /api/guilds/{guildId}/role-panel/{panelId}/publish 를 호출한다', async () => {
      const publishedPanel = { ...PANEL_RESPONSE, published: true, messageId: 'msg-1' };
      mockOkJson(publishedPanel);

      const result = await publishRolePanel('guild-1', 5);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/guilds/guild-1/role-panel/5/publish');
      expect(init.method).toBe('POST');
      expect(result.published).toBe(true);
      expect(result.messageId).toBe('msg-1');
    });

    it('503 응답 시 ApiError를 throw한다 (봇 채널 권한 없음 EC-RP-21)', async () => {
      mockErrorJson(503, { message: '봇이 채널 전송 권한이 없습니다' });

      await expect(publishRolePanel('guild-1', 5)).rejects.toMatchObject({
        status: 503,
        message: '봇이 채널 전송 권한이 없습니다',
      });
    });
  });
});
