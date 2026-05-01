/**
 * InactiveMemberPage 통합 테스트
 *
 * 유저 행동 관점에서 비활동 회원 대시보드 페이지의 전체 흐름을 검증한다.
 * - 초기 로딩 → 탭 렌더링 → 탭 변경 → sortBy/sortOrder/page/selectedIds 초기화
 * - DECLINING 탭일 때만 decreaseRate sortBy 옵션이 노출된다
 * - 다른 탭에서는 decreaseRate 옵션이 없다
 * - API 실패 시 에러 메시지가 표시된다
 *
 * API 모듈은 vi.mock으로 처리하여 네트워크 의존성을 제거한다.
 * Recharts 기반 차트 컴포넌트는 jsdom에서 렌더링이 제한되므로 stub으로 대체한다.
 * next-intl, next/navigation은 stub으로 대체한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as inactiveApi from '@/app/lib/inactive-member-api';
import InactiveMemberPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

const STABLE_T = (key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}(${JSON.stringify(params)})`;
  return key;
};

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ guildId: 'guild-test-123' }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Recharts 기반 차트 컴포넌트는 jsdom에서 렌더링이 불안정하므로 stub으로 대체한다
vi.mock('../components/ActivityPieChart', () => ({
  default: () => <div data-testid="activity-pie-chart">ActivityPieChart</div>,
}));

vi.mock('../components/InactiveTrendChart', () => ({
  default: () => <div data-testid="inactive-trend-chart">InactiveTrendChart</div>,
}));

vi.mock('@/app/lib/inactive-member-api', () => ({
  fetchInactiveMembers: vi.fn(),
  fetchInactiveMemberStats: vi.fn(),
  fetchInactiveMemberConfig: vi.fn(),
  classifyInactiveMembers: vi.fn(),
  executeInactiveMemberAction: vi.fn(),
  gradeBadgeClass: vi.fn(() => ''),
  formatMinutes: vi.fn((m: number) => `${m}분`),
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const STATS_FIXTURE: inactiveApi.InactiveMemberStats = {
  totalMembers: 50,
  activeCount: 30,
  fullyInactiveCount: 8,
  lowActiveCount: 7,
  decliningCount: 5,
  returnedCount: 2,
  trend: [],
};

const CONFIG_FIXTURE: inactiveApi.InactiveMemberConfig = {
  id: 1,
  guildId: 'guild-test-123',
  periodDays: 30,
  lowActiveThresholdMin: 60,
  decliningPercent: 30,
  gracePeriodDays: 7,
  autoActionEnabled: false,
  autoRoleAdd: false,
  autoDm: false,
  inactiveRoleId: null,
  removeRoleId: null,
  excludedRoleIds: [],
  dmEmbedTitle: null,
  dmEmbedBody: null,
  dmEmbedColor: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function makeItem(
  overrides: Partial<inactiveApi.InactiveMemberItem> = {},
): inactiveApi.InactiveMemberItem {
  return {
    userId: 'user-001',
    nickName: '테스트유저',
    grade: 'FULLY_INACTIVE',
    totalMinutes: 10,
    prevTotalMinutes: 50,
    lastVoiceDate: '2024-01-05',
    gradeChangedAt: '2024-01-10T00:00:00.000Z',
    classifiedAt: '2024-01-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeListResponse(
  items: inactiveApi.InactiveMemberItem[] = [],
  total = items.length,
): inactiveApi.InactiveMemberListResponse {
  return { total, page: 1, limit: 20, items };
}

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  vi.mocked(inactiveApi.fetchInactiveMemberStats).mockResolvedValue(STATS_FIXTURE);
  vi.mocked(inactiveApi.fetchInactiveMemberConfig).mockResolvedValue(CONFIG_FIXTURE);
  vi.mocked(inactiveApi.fetchInactiveMembers).mockResolvedValue(makeListResponse([makeItem()]));
}

/**
 * 페이지를 렌더링하고 탭 컴포넌트(all 탭)가 나타날 때까지 기다린다.
 * inactive.tabs.all 텍스트가 표시되면 초기 로딩이 완료된 것으로 간주한다.
 */
async function renderAndWaitForLoad() {
  const result = render(<InactiveMemberPage />);
  await waitFor(() => {
    expect(screen.getByText('inactive.tabs.all')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('InactiveMemberPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── 초기 로딩 ────────────────────────────────────────────────────────────

  describe('초기 로딩', () => {
    it('페이지 제목이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('inactive.title')).toBeInTheDocument();
    });

    it('초기 로드 시 fetchInactiveMembers가 guildId와 함께 호출된다', async () => {
      await renderAndWaitForLoad();

      expect(vi.mocked(inactiveApi.fetchInactiveMembers)).toHaveBeenCalledWith(
        'guild-test-123',
        expect.objectContaining({ page: 1 }),
      );
    });

    it('초기 로드 시 fetchInactiveMemberStats가 호출된다', async () => {
      await renderAndWaitForLoad();

      expect(vi.mocked(inactiveApi.fetchInactiveMemberStats)).toHaveBeenCalledWith(
        'guild-test-123',
      );
    });

    it('4개 탭이 모두 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('inactive.tabs.all')).toBeInTheDocument();
      expect(screen.getByText('inactive.tabs.fullyInactive')).toBeInTheDocument();
      expect(screen.getByText('inactive.tabs.lowActive')).toBeInTheDocument();
      expect(screen.getByText('inactive.tabs.declining')).toBeInTheDocument();
    });

    it('stats 로드 후 탭에 카운트 배지가 표시된다', async () => {
      await renderAndWaitForLoad();

      // STATS_FIXTURE.fullyInactiveCount = 8
      await waitFor(() => {
        expect(screen.getByText('8')).toBeInTheDocument();
      });
    });

    it('초기 정렬 기준은 lastVoiceDate이다', async () => {
      await renderAndWaitForLoad();

      const sortBySelect = screen.getByDisplayValue('inactive.filter.sortBy.lastVoiceDate');
      expect(sortBySelect).toBeInTheDocument();
    });
  });

  // ── 탭 변경 → 상태 초기화 ────────────────────────────────────────────────

  describe('탭 변경 시 상태 초기화', () => {
    it('FULLY_INACTIVE 탭 클릭 시 fetchInactiveMembers가 grade=FULLY_INACTIVE, page=1로 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      vi.clearAllMocks();
      vi.mocked(inactiveApi.fetchInactiveMembers).mockResolvedValue(makeListResponse([]));

      await user.click(screen.getByText('inactive.tabs.fullyInactive'));

      await waitFor(() => {
        expect(vi.mocked(inactiveApi.fetchInactiveMembers)).toHaveBeenCalledWith(
          'guild-test-123',
          expect.objectContaining({ grade: 'FULLY_INACTIVE', page: 1 }),
        );
      });
    });

    it('LOW_ACTIVE 탭 클릭 시 sortBy가 totalMinutes로 변경된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('inactive.tabs.lowActive'));

      await waitFor(() => {
        expect(vi.mocked(inactiveApi.fetchInactiveMembers)).toHaveBeenCalledWith(
          'guild-test-123',
          expect.objectContaining({ sortBy: 'totalMinutes', grade: 'LOW_ACTIVE' }),
        );
      });
    });

    it('DECLINING 탭 클릭 시 sortBy가 decreaseRate로, sortOrder가 DESC로 변경된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      vi.clearAllMocks();
      vi.mocked(inactiveApi.fetchInactiveMembers).mockResolvedValue(makeListResponse([]));

      await user.click(screen.getByText('inactive.tabs.declining'));

      await waitFor(() => {
        expect(vi.mocked(inactiveApi.fetchInactiveMembers)).toHaveBeenCalledWith(
          'guild-test-123',
          expect.objectContaining({
            grade: 'DECLINING',
            sortBy: 'decreaseRate',
            sortOrder: 'DESC',
            page: 1,
          }),
        );
      });
    });

    it('all 탭 클릭 시 grade 필터 없이 page=1로 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 먼저 FULLY_INACTIVE로 이동
      await user.click(screen.getByText('inactive.tabs.fullyInactive'));
      await waitFor(() =>
        expect(vi.mocked(inactiveApi.fetchInactiveMembers)).toHaveBeenCalledWith(
          'guild-test-123',
          expect.objectContaining({ grade: 'FULLY_INACTIVE' }),
        ),
      );

      vi.clearAllMocks();
      vi.mocked(inactiveApi.fetchInactiveMembers).mockResolvedValue(makeListResponse([]));

      // all 탭으로 복귀
      await user.click(screen.getByText('inactive.tabs.all'));

      await waitFor(() => {
        const calls = vi.mocked(inactiveApi.fetchInactiveMembers).mock.calls;
        // grade가 undefined (all 탭에서는 grade 파라미터 없음)
        expect(calls.some(([, q]) => q?.grade === undefined && q?.page === 1)).toBe(true);
      });
    });
  });

  // ── decreaseRate sortBy 옵션 조건부 노출 ─────────────────────────────────

  describe('decreaseRate sortBy 옵션 조건부 노출', () => {
    it('초기(all 탭)에는 decreaseRate 옵션이 없다', async () => {
      await renderAndWaitForLoad();

      expect(screen.queryByText('inactive.filter.sortBy.decreaseRate')).not.toBeInTheDocument();
    });

    it('FULLY_INACTIVE 탭에서는 decreaseRate 옵션이 없다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('inactive.tabs.fullyInactive'));

      await waitFor(() => {
        expect(screen.queryByText('inactive.filter.sortBy.decreaseRate')).not.toBeInTheDocument();
      });
    });

    it('LOW_ACTIVE 탭에서는 decreaseRate 옵션이 없다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('inactive.tabs.lowActive'));

      await waitFor(() => {
        expect(screen.queryByText('inactive.filter.sortBy.decreaseRate')).not.toBeInTheDocument();
      });
    });

    it('DECLINING 탭에서는 decreaseRate sortBy 옵션이 노출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('inactive.tabs.declining'));

      await waitFor(() => {
        expect(screen.getByText('inactive.filter.sortBy.decreaseRate')).toBeInTheDocument();
      });
    });

    it('DECLINING 탭에서 all 탭으로 이동하면 decreaseRate 옵션이 사라진다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // DECLINING으로 이동
      await user.click(screen.getByText('inactive.tabs.declining'));
      await waitFor(() => {
        expect(screen.getByText('inactive.filter.sortBy.decreaseRate')).toBeInTheDocument();
      });

      // all 탭으로 복귀
      await user.click(screen.getByText('inactive.tabs.all'));

      await waitFor(() => {
        expect(screen.queryByText('inactive.filter.sortBy.decreaseRate')).not.toBeInTheDocument();
      });
    });
  });

  // ── API 에러 처리 ────────────────────────────────────────────────────────

  describe('API 실패 처리', () => {
    it('fetchInactiveMembers 실패 시 에러 메시지가 표시된다', async () => {
      vi.mocked(inactiveApi.fetchInactiveMembers).mockRejectedValue(new Error('서버 오류'));

      render(<InactiveMemberPage />);

      await waitFor(() => {
        expect(screen.getByText('서버 오류')).toBeInTheDocument();
      });
    });

    it('fetchInactiveMembers 실패 시 non-Error 객체면 common.loadFailed가 표시된다', async () => {
      vi.mocked(inactiveApi.fetchInactiveMembers).mockRejectedValue('알 수 없는 오류');

      render(<InactiveMemberPage />);

      await waitFor(() => {
        expect(screen.getByText('common.loadFailed')).toBeInTheDocument();
      });
    });

    it('fetchInactiveMemberStats 실패해도 페이지는 계속 로드된다', async () => {
      vi.mocked(inactiveApi.fetchInactiveMemberStats).mockRejectedValue(new Error('통계 오류'));

      render(<InactiveMemberPage />);

      // 목록은 여전히 로드된다
      await waitFor(() => {
        expect(screen.getByText('inactive.tabs.all')).toBeInTheDocument();
      });
    });
  });

  // ── 분류 실행 ────────────────────────────────────────────────────────────

  describe('분류 실행', () => {
    it('분류 버튼이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('inactive.classify')).toBeInTheDocument();
    });

    it('분류 성공 시 분류 완료 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      vi.mocked(inactiveApi.classifyInactiveMembers).mockResolvedValue({
        classifiedCount: 15,
      });

      await renderAndWaitForLoad();

      await user.click(screen.getByText('inactive.classify'));

      await waitFor(() => {
        // t("inactive.classifyDone", { count: 15 }) → "inactive.classifyDone({"count":15})"
        expect(screen.getByText(/inactive\.classifyDone/)).toBeInTheDocument();
      });
    });
  });

  // ── 검색 ────────────────────────────────────────────────────────────────

  describe('검색 입력', () => {
    it('검색 input placeholder가 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByPlaceholderText('inactive.filter.search')).toBeInTheDocument();
    });
  });

  // ── 페이지네이션 ─────────────────────────────────────────────────────────

  describe('페이지네이션', () => {
    it('이전/다음 버튼이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('common.prev')).toBeInTheDocument();
      expect(screen.getByText('common.next')).toBeInTheDocument();
    });

    it('첫 페이지에서 이전 버튼이 비활성화된다', async () => {
      await renderAndWaitForLoad();

      const prevButton = screen.getByText('common.prev').closest('button');
      expect(prevButton).toBeDisabled();
    });

    it('total=1이면 다음 버튼도 비활성화된다', async () => {
      vi.mocked(inactiveApi.fetchInactiveMembers).mockResolvedValue(
        makeListResponse([makeItem()], 1),
      );

      await renderAndWaitForLoad();

      const nextButton = screen.getByText('common.next').closest('button');
      expect(nextButton).toBeDisabled();
    });
  });
});
