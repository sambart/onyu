/**
 * GradeTabs 단위 테스트
 *
 * 유저 행동 관점에서 등급 탭 컴포넌트의 렌더링과 상호작용을 검증한다.
 * - 4개 탭(all, FULLY_INACTIVE, LOW_ACTIVE, DECLINING) 모두 렌더되는지
 * - stats가 있을 때 각 탭에 카운트 배지가 표시되는지
 * - stats=null이면 카운트 배지가 렌더링되지 않는지
 * - 탭 클릭 시 onChange가 해당 탭 키로 호출되는지
 * - aria-selected 속성이 activeTab과 일치하는지
 *
 * next-intl은 키를 그대로 반환하는 stub으로 대체한다.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { InactiveMemberStats } from '@/app/lib/inactive-member-api';

import GradeTabs from '../components/GradeTabs';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const STATS_FIXTURE: InactiveMemberStats = {
  totalMembers: 100,
  activeCount: 70,
  fullyInactiveCount: 12,
  lowActiveCount: 8,
  decliningCount: 10,
  returnedCount: 3,
  trend: [],
};

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('GradeTabs', () => {
  describe('4개 탭 렌더링', () => {
    it('stats=null일 때도 4개 탭이 모두 렌더링된다', () => {
      render(<GradeTabs activeTab="all" stats={null} onChange={vi.fn()} />);

      expect(screen.getByText('inactive.tabs.all')).toBeInTheDocument();
      expect(screen.getByText('inactive.tabs.fullyInactive')).toBeInTheDocument();
      expect(screen.getByText('inactive.tabs.lowActive')).toBeInTheDocument();
      expect(screen.getByText('inactive.tabs.declining')).toBeInTheDocument();
    });

    it('role="tablist" 컨테이너 안에 4개의 role="tab" 버튼이 있다', () => {
      render(<GradeTabs activeTab="all" stats={null} onChange={vi.fn()} />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(4);
    });
  });

  describe('카운트 배지', () => {
    it('stats가 있으면 FULLY_INACTIVE 탭에 fullyInactiveCount 배지가 표시된다', () => {
      render(<GradeTabs activeTab="all" stats={STATS_FIXTURE} onChange={vi.fn()} />);

      // "12"가 카운트 배지로 표시된다
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('stats가 있으면 LOW_ACTIVE 탭에 lowActiveCount 배지가 표시된다', () => {
      render(<GradeTabs activeTab="all" stats={STATS_FIXTURE} onChange={vi.fn()} />);

      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('stats가 있으면 DECLINING 탭에 decliningCount 배지가 표시된다', () => {
      render(<GradeTabs activeTab="all" stats={STATS_FIXTURE} onChange={vi.fn()} />);

      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('all 탭에는 stats가 있어도 카운트 배지가 표시되지 않는다', () => {
      render(<GradeTabs activeTab="all" stats={STATS_FIXTURE} onChange={vi.fn()} />);

      const allTab = screen.getByText('inactive.tabs.all').closest('button')!;
      // all 탭 버튼 안에 span 배지가 없어야 한다
      expect(allTab.querySelector('span')).not.toBeInTheDocument();
    });

    it('stats=null이면 카운트 배지(숫자 span)가 하나도 렌더링되지 않는다', () => {
      render(<GradeTabs activeTab="all" stats={null} onChange={vi.fn()} />);

      // FULLY_INACTIVE, LOW_ACTIVE, DECLINING 배지 수치가 없어야 한다
      expect(screen.queryByText('12')).not.toBeInTheDocument();
      expect(screen.queryByText('8')).not.toBeInTheDocument();
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });

    it('카운트가 0이면 배지에 0이 표시된다', () => {
      const zeroStats: InactiveMemberStats = {
        ...STATS_FIXTURE,
        fullyInactiveCount: 0,
        lowActiveCount: 0,
        decliningCount: 0,
      };

      render(<GradeTabs activeTab="all" stats={zeroStats} onChange={vi.fn()} />);

      // 0도 배지로 표시되어야 한다 (null이 아니므로)
      const zeroBadges = screen.getAllByText('0');
      expect(zeroBadges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('탭 클릭 → onChange 호출', () => {
    it('all 탭 클릭 시 onChange("all")이 호출된다', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<GradeTabs activeTab="FULLY_INACTIVE" stats={null} onChange={handleChange} />);

      await user.click(screen.getByText('inactive.tabs.all'));

      expect(handleChange).toHaveBeenCalledWith('all');
    });

    it('FULLY_INACTIVE 탭 클릭 시 onChange("FULLY_INACTIVE")가 호출된다', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<GradeTabs activeTab="all" stats={null} onChange={handleChange} />);

      await user.click(screen.getByText('inactive.tabs.fullyInactive'));

      expect(handleChange).toHaveBeenCalledWith('FULLY_INACTIVE');
    });

    it('LOW_ACTIVE 탭 클릭 시 onChange("LOW_ACTIVE")가 호출된다', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<GradeTabs activeTab="all" stats={null} onChange={handleChange} />);

      await user.click(screen.getByText('inactive.tabs.lowActive'));

      expect(handleChange).toHaveBeenCalledWith('LOW_ACTIVE');
    });

    it('DECLINING 탭 클릭 시 onChange("DECLINING")가 호출된다', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<GradeTabs activeTab="all" stats={null} onChange={handleChange} />);

      await user.click(screen.getByText('inactive.tabs.declining'));

      expect(handleChange).toHaveBeenCalledWith('DECLINING');
    });
  });

  describe('aria-selected 속성 정합성', () => {
    it('activeTab="all"이면 all 탭의 aria-selected가 true이다', () => {
      render(<GradeTabs activeTab="all" stats={null} onChange={vi.fn()} />);

      const allTab = screen.getByText('inactive.tabs.all').closest('[role="tab"]')!;
      expect(allTab).toHaveAttribute('aria-selected', 'true');
    });

    it('activeTab="all"이면 나머지 탭들의 aria-selected는 false이다', () => {
      render(<GradeTabs activeTab="all" stats={null} onChange={vi.fn()} />);

      const fullyInactiveTab = screen
        .getByText('inactive.tabs.fullyInactive')
        .closest('[role="tab"]')!;
      const lowActiveTab = screen.getByText('inactive.tabs.lowActive').closest('[role="tab"]')!;
      const decliningTab = screen.getByText('inactive.tabs.declining').closest('[role="tab"]')!;

      expect(fullyInactiveTab).toHaveAttribute('aria-selected', 'false');
      expect(lowActiveTab).toHaveAttribute('aria-selected', 'false');
      expect(decliningTab).toHaveAttribute('aria-selected', 'false');
    });

    it('activeTab="DECLINING"이면 DECLINING 탭만 aria-selected=true이다', () => {
      render(<GradeTabs activeTab="DECLINING" stats={null} onChange={vi.fn()} />);

      const tabs = screen.getAllByRole('tab');
      const selectedTabs = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true');
      const deselectedTabs = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'false');

      expect(selectedTabs).toHaveLength(1);
      expect(deselectedTabs).toHaveLength(3);

      const decliningTab = screen.getByText('inactive.tabs.declining').closest('[role="tab"]')!;
      expect(decliningTab).toHaveAttribute('aria-selected', 'true');
    });

    it('activeTab="LOW_ACTIVE"이면 LOW_ACTIVE 탭만 aria-selected=true이다', () => {
      render(<GradeTabs activeTab="LOW_ACTIVE" stats={null} onChange={vi.fn()} />);

      const lowActiveTab = screen.getByText('inactive.tabs.lowActive').closest('[role="tab"]')!;
      expect(lowActiveTab).toHaveAttribute('aria-selected', 'true');

      const allTab = screen.getByText('inactive.tabs.all').closest('[role="tab"]')!;
      expect(allTab).toHaveAttribute('aria-selected', 'false');
    });
  });
});
