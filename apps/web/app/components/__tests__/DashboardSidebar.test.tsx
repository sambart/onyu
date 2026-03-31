/**
 * DashboardSidebar 통합 테스트
 *
 * 6개 플랫 메뉴 → 4그룹(개요/회원활동/분석/시스템) 구조 변경 후
 * 유저가 사이드바를 보았을 때 기대하는 결과를 검증한다.
 *
 * - 4개 그룹 헤더가 렌더링되는지 확인
 * - 각 그룹에 올바른 메뉴 항목이 포함되는지 확인 (진단 메뉴 포함)
 * - 크로스링크 설정 아이콘이 settingsHref가 있는 항목에만 렌더링되는지 확인
 * - 활성 경로의 메뉴 항목에 활성 스타일이 적용되는지 확인
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DashboardSidebar from '../DashboardSidebar';

// ─── 전역 모킹 ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    title,
    onClick: _onClick,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    title?: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} title={title} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../SidebarContext', () => ({
  useSidebar: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn() }),
}));

vi.mock('../SidebarDrawer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────

import { usePathname } from 'next/navigation';

const GUILD_ID = 'guild-abc';

const DEFAULT_GUILDS = [{ id: GUILD_ID, name: '테스트 서버', icon: null }];

function renderSidebar(pathname = `/dashboard/guild/${GUILD_ID}/overview`) {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return render(<DashboardSidebar guilds={DEFAULT_GUILDS} selectedGuildId={GUILD_ID} />);
}

// ─── 테스트 ─────────────────────────────────────────────────────

describe('DashboardSidebar 통합 테스트', () => {
  describe('그룹 헤더 렌더링', () => {
    it('3개 그룹 헤더(개요, 회원 활동, 분석)가 모두 렌더링된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.dashboardGroup.overview')).toBeInTheDocument();
      expect(screen.getByText('sidebar.dashboardGroup.memberActivity')).toBeInTheDocument();
      expect(screen.getByText('sidebar.dashboardGroup.analytics')).toBeInTheDocument();
    });

    it('시스템 그룹 헤더(system)는 렌더링되지 않는다', () => {
      renderSidebar();

      expect(screen.queryByText('sidebar.dashboardGroup.system')).toBeNull();
    });
  });

  describe('그룹별 메뉴 항목', () => {
    it('개요 그룹에 "대시보드" 메뉴 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.overview')).toBeInTheDocument();
    });

    it('회원 활동 그룹에 음성, 동시접속, 신규회원, 비활동회원 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.voice')).toBeInTheDocument();
      expect(screen.getByText('sidebar.coPresence')).toBeInTheDocument();
      expect(screen.getByText('sidebar.newbie')).toBeInTheDocument();
      expect(screen.getByText('sidebar.inactiveMember')).toBeInTheDocument();
    });

    it('모니터링 항목은 렌더링되지 않는다', () => {
      renderSidebar();

      expect(screen.queryByText('sidebar.monitoring')).toBeNull();
    });

    it('분석 그룹에 진단(diagnosis) 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.diagnosis')).toBeInTheDocument();
    });
  });

  describe('크로스링크 설정 아이콘', () => {
    it('settingsHref가 있는 항목(음성, 신규회원, 비활동회원, 진단)에만 설정 링크가 렌더링된다', () => {
      renderSidebar();

      // title 속성으로 설정 크로스링크를 식별한다
      const settingsLinks = screen
        .getAllByRole('link')
        .filter((el: HTMLElement) => el.getAttribute('title') === 'sidebar.crosslink.settings');

      // voice, newbie, inactive-member, diagnosis — 4개
      expect(settingsLinks).toHaveLength(4);
    });

    it('음성 항목의 설정 크로스링크가 올바른 href를 가진다', () => {
      renderSidebar();

      const settingsLinks = screen
        .getAllByRole('link')
        .filter((el: HTMLElement) => el.getAttribute('title') === 'sidebar.crosslink.settings');

      const hrefs = settingsLinks.map((el: HTMLElement) => el.getAttribute('href'));
      expect(hrefs).toContain(`/settings/guild/${GUILD_ID}/voice`);
    });

    it('신규회원 항목의 설정 크로스링크가 올바른 href를 가진다', () => {
      renderSidebar();

      const settingsLinks = screen
        .getAllByRole('link')
        .filter((el: HTMLElement) => el.getAttribute('title') === 'sidebar.crosslink.settings');

      const hrefs = settingsLinks.map((el: HTMLElement) => el.getAttribute('href'));
      expect(hrefs).toContain(`/settings/guild/${GUILD_ID}/newbie`);
    });

    it('비활동회원 항목의 설정 크로스링크가 올바른 href를 가진다', () => {
      renderSidebar();

      const settingsLinks = screen
        .getAllByRole('link')
        .filter((el: HTMLElement) => el.getAttribute('title') === 'sidebar.crosslink.settings');

      const hrefs = settingsLinks.map((el: HTMLElement) => el.getAttribute('href'));
      expect(hrefs).toContain(`/settings/guild/${GUILD_ID}/inactive-member`);
    });

    it('진단 항목의 설정 크로스링크가 올바른 href를 가진다', () => {
      renderSidebar();

      const settingsLinks = screen
        .getAllByRole('link')
        .filter((el: HTMLElement) => el.getAttribute('title') === 'sidebar.crosslink.settings');

      const hrefs = settingsLinks.map((el: HTMLElement) => el.getAttribute('href'));
      expect(hrefs).toContain(`/settings/guild/${GUILD_ID}/diagnosis`);
    });

    it('settingsHref가 없는 항목(개요, 동시접속)에는 설정 크로스링크가 렌더링되지 않는다', () => {
      renderSidebar();

      const settingsLinks = screen
        .getAllByRole('link')
        .filter((el: HTMLElement) => el.getAttribute('title') === 'sidebar.crosslink.settings');

      const hrefs = settingsLinks.map((el: HTMLElement) => el.getAttribute('href'));

      // overview, co-presence 경로의 설정 링크가 없어야 한다
      expect(hrefs).not.toContain(`/settings/guild/${GUILD_ID}/overview`);
      expect(hrefs).not.toContain(`/settings/guild/${GUILD_ID}/co-presence`);
    });
  });

  describe('활성 메뉴 항목 스타일', () => {
    it('현재 경로가 /overview이면 개요 메뉴 링크에 활성 클래스가 적용된다', () => {
      renderSidebar(`/dashboard/guild/${GUILD_ID}/overview`);

      // 개요 메뉴 링크를 텍스트로 찾아 활성 클래스를 확인한다
      const overviewLink = screen
        .getAllByRole('link')
        .find(
          (el: HTMLElement) =>
            el.textContent?.includes('sidebar.overview') &&
            el.getAttribute('href') === `/dashboard/guild/${GUILD_ID}/overview`,
        );

      expect(overviewLink).toBeDefined();
      expect(overviewLink?.className).toContain('bg-indigo-50');
    });

    it('현재 경로가 /voice이면 음성 메뉴 링크에 활성 클래스가 적용된다', () => {
      renderSidebar(`/dashboard/guild/${GUILD_ID}/voice`);

      const voiceLink = screen
        .getAllByRole('link')
        .find(
          (el: HTMLElement) =>
            el.textContent?.includes('sidebar.voice') &&
            el.getAttribute('href') === `/dashboard/guild/${GUILD_ID}/voice`,
        );

      expect(voiceLink).toBeDefined();
      expect(voiceLink?.className).toContain('bg-indigo-50');
    });

    it('현재 경로가 /overview이면 다른 메뉴 링크에는 활성 클래스가 적용되지 않는다', () => {
      renderSidebar(`/dashboard/guild/${GUILD_ID}/overview`);

      const voiceLink = screen
        .getAllByRole('link')
        .find(
          (el: HTMLElement) =>
            el.textContent?.trim() === 'sidebar.voice' &&
            el.getAttribute('href') === `/dashboard/guild/${GUILD_ID}/voice`,
        );

      expect(voiceLink).toBeDefined();
      expect(voiceLink?.className).not.toContain('bg-indigo-50');
    });

    it('현재 경로가 /diagnosis이면 진단 메뉴 링크에 활성 클래스가 적용된다', () => {
      renderSidebar(`/dashboard/guild/${GUILD_ID}/diagnosis`);

      const diagnosisLink = screen
        .getAllByRole('link')
        .find(
          (el: HTMLElement) =>
            el.textContent?.includes('sidebar.diagnosis') &&
            el.getAttribute('href') === `/dashboard/guild/${GUILD_ID}/diagnosis`,
        );

      expect(diagnosisLink).toBeDefined();
      expect(diagnosisLink?.className).toContain('bg-indigo-50');
    });
  });

  describe('길드가 2개 이상일 때 서버 전환 링크', () => {
    it('길드가 1개이면 서버 전환 링크가 표시되지 않는다', () => {
      renderSidebar();

      expect(screen.queryByText('sidebar.switchServer')).toBeNull();
    });

    it('길드가 2개 이상이면 서버 전환 링크가 표시된다', () => {
      vi.mocked(usePathname).mockReturnValue(`/dashboard/guild/${GUILD_ID}/overview`);
      render(
        <DashboardSidebar
          guilds={[
            { id: GUILD_ID, name: '서버 A', icon: null },
            { id: 'guild-xyz', name: '서버 B', icon: null },
          ]}
          selectedGuildId={GUILD_ID}
        />,
      );

      expect(screen.getByText('sidebar.switchServer')).toBeInTheDocument();
    });
  });
});
