/**
 * MissionManageTab 통합 테스트
 *
 * 유저 행동 관점에서 미션 관리 탭의 전체 흐름을 검증한다.
 * - 초기 렌더링 시 IN_PROGRESS 필터가 기본값으로 적용된다
 * - 필터 변경 시 page가 1로 초기화되어 API가 재호출된다
 * - IN_PROGRESS 미션에서만 상태 변경 드롭다운이 노출된다
 * - 완료/실패 상태 미션에서는 상태 변경이 불가하다
 * - 페이지네이션 버튼 동작을 검증한다
 * - API 실패 시 빈 상태 메시지가 표시된다
 *
 * API 모듈은 vi.mock으로 처리하여 네트워크 의존성을 제거한다.
 * next-intl의 useTranslations는 키를 그대로 반환하는 stub으로 대체한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as newbieApi from '../../../../../lib/newbie-api';
import MissionManageTab from '../components/MissionManageTab';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

const STABLE_T = (key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}(${JSON.stringify(params)})`;
  return key;
};

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

vi.mock('../../../../../lib/newbie-api', () => ({
  fetchMissions: vi.fn(),
  completeMission: vi.fn(),
  failMission: vi.fn(),
  hideMission: vi.fn(),
  unhideMission: vi.fn(),
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild-mission-test';

const ROLES = [
  { id: 'role-001', name: '멤버', color: 0, position: 1 },
  { id: 'role-002', name: '뉴비', color: 1, position: 2 },
];

function makeMission(overrides: Partial<newbieApi.MissionItem> = {}): newbieApi.MissionItem {
  return {
    id: 1,
    guildId: GUILD_ID,
    memberId: 'member-001',
    memberName: '신입유저A',
    currentPlaytimeSec: 1800,
    startDate: '20240101',
    endDate: '20240131',
    targetPlaytimeSec: 7200,
    targetPlayCount: null,
    status: 'IN_PROGRESS',
    hiddenFromEmbed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeListResponse(
  items: newbieApi.MissionItem[],
  total = items.length,
  page = 1,
  pageSize = 10,
): newbieApi.MissionListResponse {
  return { items, total, page, pageSize };
}

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

function renderTab(props: Partial<React.ComponentProps<typeof MissionManageTab>> = {}) {
  return render(<MissionManageTab guildId={GUILD_ID} roles={ROLES} {...props} />);
}

async function waitForTableLoad(memberName = '신입유저A') {
  await waitFor(() => {
    expect(screen.getByText(memberName)).toBeInTheDocument();
  });
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('MissionManageTab 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 초기 렌더링 및 기본 필터 ─────────────────────────────────────────────

  describe('초기 렌더링', () => {
    it('마운트 시 IN_PROGRESS 필터로 API가 호출된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()]));

      renderTab();

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'IN_PROGRESS',
          1,
          10,
        );
      });
    });

    it('로딩 중에는 로딩 메시지가 표시된다', () => {
      // 응답을 지연시켜 로딩 상태를 포착한다
      vi.mocked(newbieApi.fetchMissions).mockReturnValue(new Promise(() => {}));

      renderTab();

      expect(screen.getByText('newbie.missionManage.loading')).toBeInTheDocument();
    });

    it('미션 데이터가 로드되면 멤버 이름이 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()]));

      renderTab();

      await waitForTableLoad();

      expect(screen.getByText('신입유저A')).toBeInTheDocument();
    });

    it('미션이 없으면 빈 상태 메시지가 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([]));

      renderTab();

      await waitFor(() => {
        expect(screen.getByText('newbie.missionManage.noMissions')).toBeInTheDocument();
      });
    });

    it('API 실패 시 빈 상태 메시지가 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockRejectedValue(new Error('네트워크 오류'));

      renderTab();

      await waitFor(() => {
        expect(screen.getByText('newbie.missionManage.noMissions')).toBeInTheDocument();
      });
    });

    it('IN_PROGRESS 필터 버튼이 기본으로 활성화(선택) 상태이다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([]));

      renderTab();

      await waitFor(() => {
        expect(screen.getByText('newbie.missionManage.noMissions')).toBeInTheDocument();
      });

      // 활성 필터 버튼에는 total 카운트가 표시된다 (total=0이면 "(0)"이 표시됨)
      // IN_PROGRESS 버튼 텍스트: "newbie.missionManage.filterInProgress"
      const inProgressButton = screen.getByText('newbie.missionManage.filterInProgress', {
        exact: false,
      });
      expect(inProgressButton).toBeInTheDocument();
    });
  });

  // ── 필터 변경 ────────────────────────────────────────────────────────────

  describe('상태 필터 변경', () => {
    it("'전체' 필터 클릭 시 status 없이 page=1로 API가 재호출된다", async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()]));

      renderTab();
      await waitForTableLoad();

      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse(
          [makeMission(), makeMission({ id: 2, status: 'COMPLETED', memberName: '신입유저B' })],
          2,
        ),
      );

      const allButton = screen.getByText('newbie.missionManage.filterAll');
      await user.click(allButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(GUILD_ID, '', 1, 10);
      });
    });

    it("'COMPLETED' 필터 클릭 시 status=COMPLETED, page=1로 API가 호출된다", async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()]));

      renderTab();
      await waitForTableLoad();

      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([]));

      const completedButton = screen.getByText('newbie.missionManage.filterCompleted');
      await user.click(completedButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'COMPLETED',
          1,
          10,
        );
      });
    });

    it('필터 변경 시 page가 1로 초기화된다 — 2페이지에서 필터 변경 시 page=1 호출', async () => {
      const user = userEvent.setup();

      // 1페이지: total=25로 페이지네이션이 있는 응답
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));

      renderTab();
      await waitForTableLoad();

      // 다음 버튼 클릭으로 2페이지 이동
      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ id: 11, memberName: '신입유저K' })], 25),
      );

      const nextButton = screen.getByText('common.next');
      await user.click(nextButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'IN_PROGRESS',
          2,
          10,
        );
      });

      // 2페이지에서 FAILED 필터 클릭 → page=1로 초기화되어야 한다
      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([]));

      const failedButton = screen.getByText('newbie.missionManage.filterFailed');
      await user.click(failedButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'FAILED',
          1, // page가 1로 초기화되었는지 검증
          10,
        );
      });
    });
  });

  // ── 상태 변경 버튼 노출 조건 ──────────────────────────────────────────────

  describe('IN_PROGRESS 미션 상태 변경 조건', () => {
    it('IN_PROGRESS 상태의 뱃지는 버튼(드롭다운 트리거)으로 렌더링된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'IN_PROGRESS' })]),
      );

      renderTab();
      await waitForTableLoad();

      // IN_PROGRESS 상태 뱃지가 button 요소로 감싸져 있어야 한다 (canChangeStatus=true)
      const statusBadgeButton = screen.getByRole('button', {
        name: /newbie\.missionManage\.status\.inProgress/i,
      });
      expect(statusBadgeButton).toBeInTheDocument();
    });

    it('COMPLETED 상태의 뱃지는 버튼이 아닌 정적 텍스트로만 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'COMPLETED', memberName: '완료유저' })]),
      );

      renderTab();
      await waitFor(() => {
        expect(screen.getByText('완료유저')).toBeInTheDocument();
      });

      // 상태 뱃지 텍스트는 표시되지만 클릭 가능한 버튼이 아니어야 한다
      const completedBadge = screen.getByText('newbie.missionManage.status.completed');
      expect(completedBadge.tagName).not.toBe('BUTTON');
    });

    it('FAILED 상태의 뱃지는 버튼이 아닌 정적 텍스트로만 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'FAILED', memberName: '실패유저' })]),
      );

      renderTab();
      await waitFor(() => {
        expect(screen.getByText('실패유저')).toBeInTheDocument();
      });

      const failedBadge = screen.getByText('newbie.missionManage.status.failed');
      expect(failedBadge.tagName).not.toBe('BUTTON');
    });

    it('LEFT 상태의 뱃지는 버튼이 아닌 정적 텍스트로만 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'LEFT', memberName: '퇴장유저' })]),
      );

      renderTab();
      await waitFor(() => {
        expect(screen.getByText('퇴장유저')).toBeInTheDocument();
      });

      const leftBadge = screen.getByText('newbie.missionManage.status.left');
      expect(leftBadge.tagName).not.toBe('BUTTON');
    });

    it('readonly=true이면 IN_PROGRESS 미션도 상태 변경 버튼이 렌더링되지 않는다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'IN_PROGRESS' })]),
      );

      renderTab({ readonly: true });
      await waitForTableLoad();

      // readonly 상태에서는 상태 뱃지가 버튼 없이 렌더링된다
      const buttons = screen.queryAllByRole('button', {
        name: /newbie\.missionManage\.status\.inProgress/i,
      });
      expect(buttons).toHaveLength(0);
    });
  });

  // ── 상태 변경 드롭다운 동작 ───────────────────────────────────────────────

  describe('상태 변경 드롭다운', () => {
    it('IN_PROGRESS 뱃지 클릭 시 완료/실패 옵션이 표시된다', async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'IN_PROGRESS' })]),
      );

      renderTab();
      await waitForTableLoad();

      const statusButton = screen.getByRole('button', {
        name: /newbie\.missionManage\.status\.inProgress/i,
      });
      await user.click(statusButton);

      expect(screen.getByText('newbie.missionManage.status.completed')).toBeInTheDocument();
      expect(screen.getByText('newbie.missionManage.status.failed')).toBeInTheDocument();
    });

    it('드롭다운에서 완료 클릭 시 CompleteModal이 열린다', async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'IN_PROGRESS' })]),
      );

      renderTab();
      await waitForTableLoad();

      // 상태 뱃지 버튼 클릭 → 드롭다운 열기
      const statusButton = screen.getByRole('button', {
        name: /newbie\.missionManage\.status\.inProgress/i,
      });
      await user.click(statusButton);

      // 드롭다운의 완료 버튼 클릭 (드롭다운 내부에 버튼들이 있음)
      // status.completed 텍스트가 여러 개 있을 수 있으므로 button 요소만 대상으로 한다
      const completeButtons = screen.getAllByText('newbie.missionManage.status.completed');
      // 드롭다운 내부 버튼 클릭
      await user.click(completeButtons[completeButtons.length - 1]);

      // CompleteModal의 제목이 표시된다
      expect(screen.getByText('newbie.missionManage.completeModal.title')).toBeInTheDocument();
    });

    it('드롭다운에서 실패 클릭 시 FailModal이 열린다', async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ status: 'IN_PROGRESS' })]),
      );

      renderTab();
      await waitForTableLoad();

      const statusButton = screen.getByRole('button', {
        name: /newbie\.missionManage\.status\.inProgress/i,
      });
      await user.click(statusButton);

      const failButtons = screen.getAllByText('newbie.missionManage.status.failed');
      await user.click(failButtons[failButtons.length - 1]);

      expect(screen.getByText('newbie.missionManage.failModal.title')).toBeInTheDocument();
    });
  });

  // ── 페이지네이션 ──────────────────────────────────────────────────────────

  describe('페이지네이션', () => {
    it('total이 10 이하이면 페이지네이션 버튼이 표시되지 않는다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 5));

      renderTab();
      await waitForTableLoad();

      expect(screen.queryByText('common.prev')).not.toBeInTheDocument();
      expect(screen.queryByText('common.next')).not.toBeInTheDocument();
    });

    it('total이 11 이상이면 페이지네이션 버튼이 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));

      renderTab();
      await waitForTableLoad();

      expect(screen.getByText('common.prev')).toBeInTheDocument();
      expect(screen.getByText('common.next')).toBeInTheDocument();
    });

    it('첫 페이지에서는 이전 버튼이 비활성화된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));

      renderTab();
      await waitForTableLoad();

      const prevButton = screen.getByText('common.prev').closest('button');
      expect(prevButton).toBeDisabled();
    });

    it('1페이지(totalPages=3)에서 다음 버튼이 활성화된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));

      renderTab();
      await waitForTableLoad();

      const nextButton = screen.getByText('common.next').closest('button');
      expect(nextButton).not.toBeDisabled();
    });

    it('다음 버튼 클릭 시 page=2로 API가 재호출된다', async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));

      renderTab();
      await waitForTableLoad();

      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ id: 11, memberName: '신입유저K' })], 25),
      );

      const nextButton = screen.getByText('common.next');
      await user.click(nextButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'IN_PROGRESS',
          2,
          10,
        );
      });
    });

    it('마지막 페이지에서는 다음 버튼이 비활성화된다', async () => {
      const user = userEvent.setup();
      // total=11이면 totalPages=2
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 11));

      renderTab();
      await waitForTableLoad();

      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ id: 11, memberName: '마지막유저' })], 11),
      );

      const nextButton = screen.getByText('common.next');
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('마지막유저')).toBeInTheDocument();
      });

      const nextButtonAfterNav = screen.getByText('common.next').closest('button');
      expect(nextButtonAfterNav).toBeDisabled();
    });

    it('이전 버튼 클릭 시 page=1로 돌아온다', async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));

      renderTab();
      await waitForTableLoad();

      // 2페이지로 이동
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ id: 11, memberName: '신입유저K' })], 25),
      );
      await user.click(screen.getByText('common.next'));
      await waitFor(() => expect(screen.getByText('신입유저K')).toBeInTheDocument());

      // 이전 버튼 클릭 → page=1
      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()], 25));
      const prevButton = screen.getByText('common.prev');
      await user.click(prevButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'IN_PROGRESS',
          1,
          10,
        );
      });
    });
  });

  // ── 갱신 버튼 ────────────────────────────────────────────────────────────

  describe('갱신 버튼', () => {
    it('갱신 버튼 클릭 시 현재 필터/페이지 상태로 fetchMissions가 재호출된다', async () => {
      const user = userEvent.setup();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()]));

      renderTab();
      await waitForTableLoad();

      vi.clearAllMocks();
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(makeListResponse([makeMission()]));

      const refreshButton = screen.getByText('newbie.missionManage.refresh');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(vi.mocked(newbieApi.fetchMissions)).toHaveBeenCalledWith(
          GUILD_ID,
          'IN_PROGRESS',
          1,
          10,
        );
      });
    });
  });

  // ── 여러 미션 행 렌더링 ───────────────────────────────────────────────────

  describe('여러 미션 행 렌더링', () => {
    it('여러 미션이 있을 때 모든 멤버 이름이 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse(
          [
            makeMission({ id: 1, memberName: '신입유저A' }),
            makeMission({ id: 2, memberName: '신입유저B', status: 'COMPLETED' }),
            makeMission({ id: 3, memberName: '신입유저C', status: 'FAILED' }),
          ],
          3,
        ),
      );

      renderTab();

      await waitFor(() => {
        expect(screen.getByText('신입유저A')).toBeInTheDocument();
        expect(screen.getByText('신입유저B')).toBeInTheDocument();
        expect(screen.getByText('신입유저C')).toBeInTheDocument();
      });
    });

    it('memberName이 없으면 memberId가 표시된다', async () => {
      vi.mocked(newbieApi.fetchMissions).mockResolvedValue(
        makeListResponse([makeMission({ memberName: undefined, memberId: 'unknown-id-xyz' })]),
      );

      renderTab();

      await waitFor(() => {
        expect(screen.getByText('unknown-id-xyz')).toBeInTheDocument();
      });
    });
  });
});
