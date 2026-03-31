/**
 * SettingsSidebar 통합 테스트
 *
 * 9개 플랫 메뉴 → 4그룹(서버설정/음성채널/회원관리/분석) 구조 변경 후
 * 유저가 사이드바를 보았을 때 기대하는 결과를 검증한다.
 *
 * - 4개 그룹 헤더가 렌더링되는지 확인 (분석 그룹 포함)
 * - 각 그룹에 올바른 메뉴 항목이 포함되는지 확인 (진단/주간 리포트 포함)
 * - 활성 경로의 메뉴 항목에 활성 스타일이 적용되는지 확인
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SettingsSidebar from '../SettingsSidebar';

// ─── 전역 모킹 ──────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick: _onClick,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} className={className}>
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

function renderSidebar(pathname = `/settings/guild/${GUILD_ID}`) {
  vi.mocked(usePathname).mockReturnValue(pathname);
  return render(<SettingsSidebar guilds={DEFAULT_GUILDS} selectedGuildId={GUILD_ID} />);
}

// ─── 테스트 ─────────────────────────────────────────────────────

describe('SettingsSidebar 통합 테스트', () => {
  describe('그룹 헤더 렌더링', () => {
    it('3개 그룹 헤더(서버 설정, 음성 채널, 회원 관리)가 모두 렌더링된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.settingsGroup.serverSettings')).toBeInTheDocument();
      expect(screen.getByText('sidebar.settingsGroup.voiceChannel')).toBeInTheDocument();
      expect(screen.getByText('sidebar.settingsGroup.memberManagement')).toBeInTheDocument();
    });

    it('분석 그룹 헤더(analytics)가 렌더링된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.settingsGroup.analytics')).toBeInTheDocument();
    });
  });

  describe('그룹별 메뉴 항목', () => {
    it('서버 설정 그룹에 일반 설정, 음악 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('settings.general')).toBeInTheDocument();
      expect(screen.getByText('settings.music')).toBeInTheDocument();
    });

    it('음성 채널 그룹에 음성, 음성상태, 자동방 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('settings.voice')).toBeInTheDocument();
      expect(screen.getByText('settings.voiceHealth')).toBeInTheDocument();
      expect(screen.getByText('settings.autoChannel')).toBeInTheDocument();
    });

    it('회원 관리 그룹에 신규회원, 비활동회원, 상태접두사, 고정메세지 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('settings.newbie')).toBeInTheDocument();
      expect(screen.getByText('settings.inactiveMember')).toBeInTheDocument();
      expect(screen.getByText('settings.statusPrefix')).toBeInTheDocument();
      expect(screen.getByText('settings.stickyMessage')).toBeInTheDocument();
    });

    it('분석 그룹에 진단(diagnosis) 항목이 포함된다', () => {
      renderSidebar();

      expect(screen.getByText('settings.diagnosis')).toBeInTheDocument();
    });
  });

  describe('메뉴 항목 링크 href', () => {
    it('일반 설정 링크가 /settings/guild/:id 경로를 가진다', () => {
      renderSidebar();

      const generalLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.general') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}`,
        );

      expect(generalLink).toBeDefined();
    });

    it('음악 설정 링크가 /settings/guild/:id/music 경로를 가진다', () => {
      renderSidebar();

      const musicLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.music') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/music`,
        );

      expect(musicLink).toBeDefined();
    });

    it('자동방 설정 링크가 /settings/guild/:id/auto-channel 경로를 가진다', () => {
      renderSidebar();

      const autoChannelLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.autoChannel') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/auto-channel`,
        );

      expect(autoChannelLink).toBeDefined();
    });

    it('진단 설정 링크가 /settings/guild/:id/diagnosis 경로를 가진다', () => {
      renderSidebar();

      const diagnosisLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.diagnosis') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/diagnosis`,
        );

      expect(diagnosisLink).toBeDefined();
    });
  });

  describe('활성 메뉴 항목 스타일', () => {
    it('현재 경로가 /settings/guild/:id이면 일반 설정 링크에 활성 클래스가 적용된다', () => {
      renderSidebar(`/settings/guild/${GUILD_ID}`);

      const generalLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.general') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}`,
        );

      expect(generalLink).toBeDefined();
      expect(generalLink?.className).toContain('bg-indigo-50');
    });

    it('현재 경로가 /settings/guild/:id/voice이면 음성 링크에 활성 클래스가 적용된다', () => {
      renderSidebar(`/settings/guild/${GUILD_ID}/voice`);

      const voiceLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.voice') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/voice`,
        );

      expect(voiceLink).toBeDefined();
      expect(voiceLink?.className).toContain('bg-indigo-50');
    });

    it('현재 경로가 /settings/guild/:id이면 음악 링크에는 활성 클래스가 적용되지 않는다', () => {
      renderSidebar(`/settings/guild/${GUILD_ID}`);

      const musicLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.music') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/music`,
        );

      expect(musicLink).toBeDefined();
      expect(musicLink?.className).not.toContain('bg-indigo-50');
    });

    it('활성 경로의 링크는 text-indigo-700 클래스를 가진다', () => {
      renderSidebar(`/settings/guild/${GUILD_ID}/newbie`);

      const newbieLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.newbie') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/newbie`,
        );

      expect(newbieLink).toBeDefined();
      expect(newbieLink?.className).toContain('text-indigo-700');
    });

    it('현재 경로가 /settings/guild/:id/diagnosis이면 진단 링크에 활성 클래스가 적용된다', () => {
      renderSidebar(`/settings/guild/${GUILD_ID}/diagnosis`);

      const diagnosisLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.diagnosis') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/diagnosis`,
        );

      expect(diagnosisLink).toBeDefined();
      expect(diagnosisLink?.className).toContain('bg-indigo-50');
    });

    it('현재 경로가 /settings/guild/:id이면 진단 링크에 활성 클래스가 적용되지 않는다', () => {
      renderSidebar(`/settings/guild/${GUILD_ID}`);

      const diagnosisLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('settings.diagnosis') &&
            el.getAttribute('href') === `/settings/guild/${GUILD_ID}/diagnosis`,
        );

      expect(diagnosisLink).toBeDefined();
      expect(diagnosisLink?.className).not.toContain('bg-indigo-50');
    });
  });

  describe('대시보드 이동 링크', () => {
    it('대시보드로 이동 링크가 렌더링된다', () => {
      renderSidebar();

      expect(screen.getByText('sidebar.toDashboard')).toBeInTheDocument();
    });

    it('대시보드로 이동 링크가 올바른 href를 가진다', () => {
      renderSidebar();

      const dashboardLink = screen
        .getAllByRole('link')
        .find((el) => el.textContent?.includes('sidebar.toDashboard'));

      expect(dashboardLink).toBeDefined();
      expect(dashboardLink?.getAttribute('href')).toBe(`/dashboard/guild/${GUILD_ID}/voice`);
    });
  });

  describe('길드가 2개 이상일 때 서버 전환 링크', () => {
    it('길드가 1개이면 서버 전환 링크가 표시되지 않는다', () => {
      renderSidebar();

      expect(screen.queryByText('sidebar.switchServer')).toBeNull();
    });

    it('길드가 2개 이상이면 서버 전환 링크가 표시된다', () => {
      vi.mocked(usePathname).mockReturnValue(`/settings/guild/${GUILD_ID}`);
      render(
        <SettingsSidebar
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
