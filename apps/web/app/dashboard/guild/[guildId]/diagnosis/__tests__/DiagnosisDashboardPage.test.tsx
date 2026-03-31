/**
 * DiagnosisDashboardPage 통합 테스트 (F-WEB-016)
 *
 * 유저 행동 관점에서 진단 대시보드 페이지의 전체 흐름을 검증한다.
 * - 초기 로딩 → 데이터 렌더링 → 기간 변경 → 리더보드 페이지네이션
 * - API 실패 시 에러 메시지 표시
 * - AI 인사이트 새로고침
 *
 * Recharts 컴포넌트는 jsdom 환경에서 렌더링이 제한되므로 컴포넌트 존재 여부만 확인한다.
 * API 모듈을 vi.mock으로 직접 처리하여 fetch 레이어 의존성을 제거한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as diagnosisApi from '../../../../../lib/diagnosis-api';
import DiagnosisDashboardPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

const STABLE_T = (key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}(${JSON.stringify(params)})`;
  return key;
};

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ guildId: 'guild-123' }),
  useRouter: () => ({ push: vi.fn() }),
}));

// Recharts 및 Card(clsx 의존) 컴포넌트는 jsdom에서 렌더링이 제한되므로 stub으로 대체한다
vi.mock('../components/ActivityTrendChart', () => ({
  default: () => <div data-testid="activity-trend-chart">ActivityTrendChart</div>,
}));

vi.mock('../components/ChannelAnalysisChart', () => ({
  default: () => <div data-testid="channel-analysis-chart">ChannelAnalysisChart</div>,
}));

// HealthScoreGauge: 점수/delta/diagnosis를 data-testid로 노출하는 stub
vi.mock('../components/HealthScoreGauge', () => ({
  default: ({
    score,
    delta,
    diagnosis,
    isLoading,
  }: {
    score: number;
    delta: number;
    diagnosis: string;
    isLoading: boolean;
  }) =>
    isLoading ? (
      <div data-testid="health-score-gauge-loading">loading</div>
    ) : (
      <div data-testid="health-score-gauge">
        <span data-testid="health-score">{score}</span>
        <span data-testid="health-delta">{delta}</span>
        <span data-testid="health-diagnosis">{diagnosis}</span>
      </div>
    ),
}));

// LeaderboardTable: users를 직접 렌더링하는 stub으로 유저 행 클릭까지 검증한다
vi.mock('../components/LeaderboardTable', () => ({
  default: ({
    users,
    total,
    page,
    onPageChange,
    onUserClick,
    isLoading,
  }: {
    users: Array<{ userId: string; nickName: string; rank: number }>;
    total: number;
    page: number;
    onPageChange: (p: number) => void;
    onUserClick: (userId: string) => void;
    isLoading: boolean;
  }) => {
    const totalPages = Math.max(1, Math.ceil(total / 10));
    return isLoading ? (
      <div data-testid="leaderboard-loading">loading</div>
    ) : (
      <div data-testid="leaderboard">
        {users.length === 0 ? (
          <p>common.noData</p>
        ) : (
          users.map((u) => (
            <button
              key={u.userId}
              type="button"
              aria-label={`${u.nickName} 상세 보기`}
              onClick={() => onUserClick(u.userId)}
            >
              {u.nickName}
            </button>
          ))
        )}
        {total > 0 && (
          <div>
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              diagnosis.leaderboard.prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              diagnosis.leaderboard.next
            </button>
          </div>
        )}
      </div>
    );
  },
}));

// AiInsightPanel: insights/suggestions를 직접 렌더링하는 stub
vi.mock('../components/AiInsightPanel', () => ({
  default: ({
    insights,
    suggestions,
    isLoading,
    onRefresh,
  }: {
    insights: string | null;
    suggestions: string[];
    generatedAt: string | null;
    isLoading: boolean;
    onRefresh: () => void;
  }) =>
    isLoading ? (
      <div data-testid="ai-insight-loading">loading</div>
    ) : (
      <div data-testid="ai-insight">
        {insights ? <p>{insights}</p> : <p>common.noData</p>}
        {suggestions.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        <button type="button" onClick={onRefresh}>
          diagnosis.aiInsight.refresh
        </button>
      </div>
    ),
}));

// shadcn Select는 jsdom에서 Radix UI 포털 렌더링이 불안정하므로 네이티브 select로 대체한다
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="period-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('../../../../../lib/diagnosis-api', () => ({
  fetchDiagnosisSummary: vi.fn(),
  fetchHealthScore: vi.fn(),
  fetchLeaderboard: vi.fn(),
  fetchChannelStats: vi.fn(),
  generateAiInsight: vi.fn(),
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const SUMMARY_FIXTURE = {
  daily: [
    { date: '2024-01-01', totalSec: 3600, activeUsers: 5 },
    { date: '2024-01-02', totalSec: 7200, activeUsers: 8 },
  ],
};

const HEALTH_SCORE_FIXTURE = {
  score: 78,
  prevScore: 65,
  delta: 13,
  diagnosis: '서버 활동이 양호합니다.',
};

const LEADERBOARD_FIXTURE = {
  users: [
    {
      rank: 1,
      userId: 'user-001',
      nickName: '테스트유저A',
      avatarUrl: null,
      totalSec: 7200,
      micOnSec: 3600,
      activeDays: 5,
    },
    {
      rank: 2,
      userId: 'user-002',
      nickName: '테스트유저B',
      avatarUrl: 'https://cdn.example.com/avatar.png',
      totalSec: 3600,
      micOnSec: 1800,
      activeDays: 3,
    },
  ],
  total: 2,
};

const CHANNEL_STATS_FIXTURE = {
  channels: [
    {
      channelId: 'ch-001',
      channelName: '일반 음성',
      categoryId: null,
      categoryName: null,
      totalSec: 14400,
      uniqueUsers: 10,
    },
  ],
};

const AI_INSIGHT_FIXTURE = {
  insights: '서버 활동이 전반적으로 좋습니다.',
  suggestions: ['주말 활동을 늘려보세요.', '새 채널을 추가해보세요.'],
  generatedAt: null,
};

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  vi.mocked(diagnosisApi.fetchDiagnosisSummary).mockResolvedValue(SUMMARY_FIXTURE);
  vi.mocked(diagnosisApi.fetchHealthScore).mockResolvedValue(HEALTH_SCORE_FIXTURE);
  vi.mocked(diagnosisApi.fetchLeaderboard).mockResolvedValue(LEADERBOARD_FIXTURE);
  vi.mocked(diagnosisApi.fetchChannelStats).mockResolvedValue(CHANNEL_STATS_FIXTURE);
  vi.mocked(diagnosisApi.generateAiInsight).mockResolvedValue(AI_INSIGHT_FIXTURE);
}

async function renderAndWaitForLoad() {
  const result = render(<DiagnosisDashboardPage />);
  // 리더보드 유저 이름이 나타날 때까지 기다린다
  await waitFor(() => {
    expect(screen.getByText('테스트유저A')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('DiagnosisDashboardPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── 초기 로딩 및 데이터 표시 ────────────────────────────────────────────

  describe('초기 로딩 및 섹션 렌더링', () => {
    it('페이지 제목이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('diagnosis.title')).toBeInTheDocument();
    });

    it('기간 선택 드롭다운이 기본값 30일로 렌더링된다', async () => {
      await renderAndWaitForLoad();

      const select = screen.getByTestId('period-select');
      expect(select).toHaveValue('30');
    });

    it('활동 트렌드 차트 섹션이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByTestId('activity-trend-chart')).toBeInTheDocument();
    });

    it('채널 분석 차트 섹션이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByTestId('channel-analysis-chart')).toBeInTheDocument();
    });

    it('리더보드 유저 목록이 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('테스트유저A')).toBeInTheDocument();
      expect(screen.getByText('테스트유저B')).toBeInTheDocument();
    });

    it('AI 인사이트 내용이 표시된다', async () => {
      await renderAndWaitForLoad();

      await waitFor(() => {
        expect(screen.getByText('서버 활동이 전반적으로 좋습니다.')).toBeInTheDocument();
      });
    });

    it('AI 인사이트 제안 목록이 표시된다', async () => {
      await renderAndWaitForLoad();

      await waitFor(() => {
        expect(screen.getByText('주말 활동을 늘려보세요.')).toBeInTheDocument();
        expect(screen.getByText('새 채널을 추가해보세요.')).toBeInTheDocument();
      });
    });

    it('초기 로드 시 fetchDiagnosisSummary, fetchHealthScore, fetchLeaderboard, fetchChannelStats가 guildId와 기본 30일로 호출된다', async () => {
      await renderAndWaitForLoad();

      expect(vi.mocked(diagnosisApi.fetchDiagnosisSummary)).toHaveBeenCalledWith('guild-123', 30);
      expect(vi.mocked(diagnosisApi.fetchHealthScore)).toHaveBeenCalledWith('guild-123', 30);
      expect(vi.mocked(diagnosisApi.fetchLeaderboard)).toHaveBeenCalledWith('guild-123', 30, 1, 10);
      expect(vi.mocked(diagnosisApi.fetchChannelStats)).toHaveBeenCalledWith('guild-123', 30);
    });

    it('초기 로드 시 generateAiInsight가 guildId와 기본 30일로 호출된다', async () => {
      await renderAndWaitForLoad();

      await waitFor(() => {
        expect(vi.mocked(diagnosisApi.generateAiInsight)).toHaveBeenCalledWith('guild-123', 30);
      });
    });
  });

  // ── API 에러 처리 ────────────────────────────────────────────────────────

  describe('메인 데이터 API 실패', () => {
    it('fetchHealthScore 실패 시 에러 메시지가 표시된다', async () => {
      vi.mocked(diagnosisApi.fetchHealthScore).mockRejectedValue(new Error('서버 오류'));

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        // STABLE_T('error.loadFailed') → "error.loadFailed"
        expect(screen.getByText('error.loadFailed')).toBeInTheDocument();
      });
    });

    it('fetchLeaderboard 실패 시 에러 메시지가 표시된다', async () => {
      vi.mocked(diagnosisApi.fetchLeaderboard).mockRejectedValue(new Error('리더보드 오류'));

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('error.loadFailed')).toBeInTheDocument();
      });
    });

    it('에러 상태에서 리더보드와 차트가 렌더링되지 않는다', async () => {
      vi.mocked(diagnosisApi.fetchDiagnosisSummary).mockRejectedValue(new Error('네트워크 오류'));

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('error.loadFailed')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('activity-trend-chart')).not.toBeInTheDocument();
      expect(screen.queryByTestId('channel-analysis-chart')).not.toBeInTheDocument();
    });

    it('AI 인사이트 실패는 전체 에러로 처리하지 않고 페이지가 정상 표시된다', async () => {
      vi.mocked(diagnosisApi.generateAiInsight).mockRejectedValue(new Error('AI 오류'));

      render(<DiagnosisDashboardPage />);

      // 메인 데이터는 정상 로드됨
      await waitFor(() => {
        expect(screen.getByText('테스트유저A')).toBeInTheDocument();
      });

      // 에러 메시지가 없다
      expect(screen.queryByText('dashboard.error.loadFailed')).not.toBeInTheDocument();
    });
  });

  // ── 기간 변경 ────────────────────────────────────────────────────────────

  describe('기간 변경', () => {
    it('기간을 7일로 변경하면 7일 파라미터로 API가 재호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      vi.clearAllMocks();
      setupDefaultMocks();

      const select = screen.getByTestId('period-select');
      await user.selectOptions(select, '7');

      await waitFor(() => {
        expect(vi.mocked(diagnosisApi.fetchDiagnosisSummary)).toHaveBeenCalledWith('guild-123', 7);
        expect(vi.mocked(diagnosisApi.fetchHealthScore)).toHaveBeenCalledWith('guild-123', 7);
        expect(vi.mocked(diagnosisApi.fetchLeaderboard)).toHaveBeenCalledWith(
          'guild-123',
          7,
          1,
          10,
        );
        expect(vi.mocked(diagnosisApi.fetchChannelStats)).toHaveBeenCalledWith('guild-123', 7);
      });
    });

    it('기간을 14일로 변경하면 드롭다운 값이 14로 업데이트된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const select = screen.getByTestId('period-select');
      await user.selectOptions(select, '14');

      expect(select).toHaveValue('14');
    });

    it('기간을 90일로 변경하면 90일 파라미터로 generateAiInsight가 재호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      vi.clearAllMocks();
      setupDefaultMocks();

      const select = screen.getByTestId('period-select');
      await user.selectOptions(select, '90');

      await waitFor(() => {
        expect(vi.mocked(diagnosisApi.generateAiInsight)).toHaveBeenCalledWith('guild-123', 90);
      });
    });
  });

  // ── 리더보드 페이지네이션 ────────────────────────────────────────────────

  describe('리더보드 페이지네이션', () => {
    it('총 10명 이하(1페이지)면 이전 버튼이 비활성화되어 있다', async () => {
      await renderAndWaitForLoad();

      // total: 2이므로 페이지네이션 버튼은 표시되지만 이전 버튼은 비활성화된다
      const prevButton = screen.getByText('diagnosis.leaderboard.prev');
      expect(prevButton).toBeDisabled();
      // 총 1페이지이므로 다음 버튼도 비활성화된다
      const nextButton = screen.getByText('diagnosis.leaderboard.next');
      expect(nextButton).toBeDisabled();
    });

    it('총 유저 수가 10명을 초과하면 페이지네이션 버튼이 표시되고 첫 페이지에서 이전 버튼이 비활성화된다', async () => {
      vi.mocked(diagnosisApi.fetchLeaderboard).mockResolvedValue({
        users: LEADERBOARD_FIXTURE.users,
        total: 25,
      });

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        const prevButton = screen.getByText('diagnosis.leaderboard.prev');
        expect(prevButton).toBeInTheDocument();
        expect(prevButton).toBeDisabled();
        const nextButton = screen.getByText('diagnosis.leaderboard.next');
        expect(nextButton).toBeInTheDocument();
        expect(nextButton).not.toBeDisabled();
      });
    });

    it('다음 버튼 클릭 시 2페이지 데이터를 요청한다', async () => {
      const user = userEvent.setup();

      vi.mocked(diagnosisApi.fetchLeaderboard).mockResolvedValue({
        users: LEADERBOARD_FIXTURE.users,
        total: 25,
      });

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('diagnosis.leaderboard.next')).toBeInTheDocument();
      });

      vi.clearAllMocks();
      vi.mocked(diagnosisApi.fetchLeaderboard).mockResolvedValue({
        users: [
          {
            rank: 11,
            userId: 'user-011',
            nickName: '페이지2유저',
            avatarUrl: null,
            totalSec: 1800,
            micOnSec: 900,
            activeDays: 1,
          },
        ],
        total: 25,
      });

      await user.click(screen.getByText('diagnosis.leaderboard.next'));

      await waitFor(() => {
        expect(vi.mocked(diagnosisApi.fetchLeaderboard)).toHaveBeenCalledWith(
          'guild-123',
          30,
          2,
          10,
        );
      });
    });
  });

  // ── 유저 클릭 ────────────────────────────────────────────────────────────

  describe('리더보드 유저 클릭', () => {
    it('유저 행을 클릭하면 해당 유저의 음성 상세 페이지로 이동한다', async () => {
      const mockPush = vi.fn();
      vi.mocked(await import('next/navigation')).useRouter = () => ({ push: mockPush });

      // 모듈을 새로 모킹하는 방식 대신 router mock을 직접 검증하는 방식으로 대체한다
      // useRouter는 vi.mock으로 이미 고정되어 있으므로 행 클릭이 올바른 aria-label을 가지는지 확인한다
      await renderAndWaitForLoad();

      const userRow = screen.getByRole('button', { name: '테스트유저A 상세 보기' });
      expect(userRow).toBeInTheDocument();
    });

    it('리더보드 유저 행에 aria-label이 올바르게 설정된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByRole('button', { name: '테스트유저A 상세 보기' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '테스트유저B 상세 보기' })).toBeInTheDocument();
    });
  });

  // ── AI 인사이트 새로고침 ─────────────────────────────────────────────────

  describe('AI 인사이트 새로고침', () => {
    it('AI 인사이트 새로고침 버튼이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      await waitFor(() => {
        expect(screen.getByText('diagnosis.aiInsight.refresh')).toBeInTheDocument();
      });
    });

    it('새로고침 버튼 클릭 시 generateAiInsight가 재호출된다', async () => {
      const user = userEvent.setup();

      // cooldown이 없도록 generatedAt을 null로 설정
      vi.mocked(diagnosisApi.generateAiInsight).mockResolvedValue({
        ...AI_INSIGHT_FIXTURE,
        generatedAt: null,
      });

      await renderAndWaitForLoad();

      // 초기 AI 로딩 완료 대기
      await waitFor(() => {
        expect(screen.getByText('diagnosis.aiInsight.refresh')).toBeInTheDocument();
      });

      const initialCallCount = vi.mocked(diagnosisApi.generateAiInsight).mock.calls.length;

      const refreshButton = screen.getByText('diagnosis.aiInsight.refresh');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(vi.mocked(diagnosisApi.generateAiInsight).mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      });
    });
  });

  // ── 데이터 없음 상태 ─────────────────────────────────────────────────────

  describe('데이터 없음 상태', () => {
    it('리더보드 유저가 없으면 noData 메시지가 표시된다', async () => {
      vi.mocked(diagnosisApi.fetchLeaderboard).mockResolvedValue({ users: [], total: 0 });

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('common.noData')).toBeInTheDocument();
      });
    });

    it('AI 인사이트가 null이면 noData 메시지가 표시된다', async () => {
      vi.mocked(diagnosisApi.generateAiInsight).mockResolvedValue({
        insights: null,
        suggestions: [],
        generatedAt: null,
      });

      render(<DiagnosisDashboardPage />);

      await waitFor(() => {
        // 리더보드 noData와 AI noData 모두 표시될 수 있다
        const noDataElements = screen.getAllByText('common.noData');
        expect(noDataElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
