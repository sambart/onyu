/**
 * newbie-api.ts — fetchMissions 유닛 테스트
 *
 * fetchMissions()가 URL 파라미터를 올바르게 구성하는지,
 * 상태 필터 전달 여부, API 실패 시 ApiError throw 동작을 검증한다.
 *
 * apiClient는 실패 시 throw하므로 fetchMissions도 그대로 throw한다.
 * fetch를 직접 모킹하여 네트워크 레이어 의존성을 제거한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMissions } from '../newbie-api';

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

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild-newbie-test';

const MISSION_LIST_FIXTURE = {
  items: [
    {
      id: 1,
      guildId: GUILD_ID,
      memberId: 'member-001',
      memberName: '신입유저A',
      currentPlaytimeSec: 3600,
      startDate: '20240101',
      endDate: '20240131',
      targetPlaytimeSec: 7200,
      targetPlayCount: null,
      status: 'IN_PROGRESS' as const,
      hiddenFromEmbed: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
};

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('fetchMissions', () => {
  beforeEach(() => vi.restoreAllMocks());

  describe('URL 구성', () => {
    it('guildId가 URL 경로에 올바르게 포함된다', async () => {
      mockFetchOk(MISSION_LIST_FIXTURE);

      await fetchMissions(GUILD_ID);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/guilds/${GUILD_ID}/newbie/missions`),
        expect.anything(),
      );
    });

    it('page, pageSize 파라미터가 기본값(1, 10)으로 URL에 포함된다', async () => {
      mockFetchOk(MISSION_LIST_FIXTURE);

      await fetchMissions(GUILD_ID);

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('pageSize=10');
    });

    it('page, pageSize를 명시하면 해당 값이 URL에 포함된다', async () => {
      mockFetchOk({ ...MISSION_LIST_FIXTURE, page: 3, pageSize: 5 });

      await fetchMissions(GUILD_ID, undefined, 3, 5);

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=3');
      expect(calledUrl).toContain('pageSize=5');
    });
  });

  describe('상태 필터 파라미터', () => {
    it('status를 생략하면 URL에 status 파라미터가 포함되지 않는다', async () => {
      mockFetchOk(MISSION_LIST_FIXTURE);

      await fetchMissions(GUILD_ID);

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('status=');
    });

    it("status가 빈 문자열('')이면 URL에 status 파라미터가 포함되지 않는다", async () => {
      mockFetchOk(MISSION_LIST_FIXTURE);

      await fetchMissions(GUILD_ID, '');

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('status=');
    });

    it("status가 'IN_PROGRESS'이면 URL에 status=IN_PROGRESS가 포함된다", async () => {
      mockFetchOk(MISSION_LIST_FIXTURE);

      await fetchMissions(GUILD_ID, 'IN_PROGRESS');

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=IN_PROGRESS');
    });

    it("status가 'COMPLETED'이면 URL에 status=COMPLETED가 포함된다", async () => {
      mockFetchOk({ ...MISSION_LIST_FIXTURE, items: [] });

      await fetchMissions(GUILD_ID, 'COMPLETED');

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=COMPLETED');
    });

    it("status가 'FAILED'이면 URL에 status=FAILED가 포함된다", async () => {
      mockFetchOk({ ...MISSION_LIST_FIXTURE, items: [] });

      await fetchMissions(GUILD_ID, 'FAILED');

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=FAILED');
    });

    it("status가 'LEFT'이면 URL에 status=LEFT가 포함된다", async () => {
      mockFetchOk({ ...MISSION_LIST_FIXTURE, items: [] });

      await fetchMissions(GUILD_ID, 'LEFT');

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('status=LEFT');
    });
  });

  describe('응답 처리', () => {
    it('정상 응답(200) 시 items, total, page, pageSize를 포함한 객체를 반환한다', async () => {
      mockFetchOk(MISSION_LIST_FIXTURE);

      const result = await fetchMissions(GUILD_ID, 'IN_PROGRESS', 1, 10);

      expect(result).toEqual(MISSION_LIST_FIXTURE);
    });

    it('items가 빈 배열인 응답도 그대로 반환한다', async () => {
      const empty = { items: [], total: 0, page: 1, pageSize: 10 };
      mockFetchOk(empty);

      const result = await fetchMissions(GUILD_ID, 'COMPLETED');

      expect(result).toEqual(empty);
    });
  });

  describe('API 실패 처리', () => {
    it('API 실패(500) 시 ApiError를 throw한다', async () => {
      mockFetchError(500, '서버 내부 오류');

      await expect(fetchMissions(GUILD_ID)).rejects.toThrow('서버 내부 오류');
    });

    it('API 실패(403) 시 ApiError를 throw한다', async () => {
      mockFetchError(403, '권한이 없습니다.');

      await expect(fetchMissions(GUILD_ID)).rejects.toThrow('권한이 없습니다.');
    });

    it('API 실패(401) 시 ApiError를 throw한다', async () => {
      mockFetchError(401, '인증이 필요합니다.');

      await expect(fetchMissions(GUILD_ID, 'IN_PROGRESS', 1, 10)).rejects.toThrow(
        '인증이 필요합니다.',
      );
    });
  });
});
