/**
 * LandingNav 통합 테스트
 *
 * 유저 관점 검증 항목:
 * - 네비 링크가 올바른 목적지로 연결되는지 확인
 * - inviteUrl 유무에 따라 초대 버튼 노출 여부 확인
 * - 스크롤 발생 시 배경 클래스 전환 확인
 * - 랜드마크 구조(nav) 존재 확인
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ─── 전역 모킹 ─────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.features': '기능',
      'nav.setup': '설정 가이드',
      'nav.dashboard': '대시보드',
      'nav.invite': '서버 추가',
    };
    return map[key] ?? key;
  },
}));

import LandingNav from '../LandingNav';

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 테스트 ────────────────────────────────────────────────────────

describe('LandingNav 통합 테스트', () => {
  describe('기본 렌더링', () => {
    it('nav 랜드마크가 존재한다', () => {
      render(<LandingNav inviteUrl={null} />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('Onyu 로고 텍스트가 표시된다', () => {
      render(<LandingNav inviteUrl={null} />);
      expect(screen.getByText('Onyu')).toBeInTheDocument();
    });

    it('로고 링크가 / 경로로 연결된다', () => {
      render(<LandingNav inviteUrl={null} />);
      const logoLink = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/');
      expect(logoLink).toBeDefined();
    });
  });

  describe('네비게이션 링크', () => {
    it('"대시보드" 링크가 /auth/discord로 연결된다', () => {
      render(<LandingNav inviteUrl={null} />);
      const dashboardLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('대시보드') && el.getAttribute('href') === '/auth/discord',
        );
      expect(dashboardLink).toBeDefined();
    });

    it('"기능" 앵커가 #features로 연결된다', () => {
      render(<LandingNav inviteUrl={null} />);
      const featuresLink = screen
        .getAllByRole('link')
        .find((el) => el.textContent?.includes('기능') && el.getAttribute('href') === '#features');
      expect(featuresLink).toBeDefined();
    });

    it('"설정 가이드" 앵커가 #setup으로 연결된다', () => {
      render(<LandingNav inviteUrl={null} />);
      const setupLink = screen
        .getAllByRole('link')
        .find(
          (el) => el.textContent?.includes('설정 가이드') && el.getAttribute('href') === '#setup',
        );
      expect(setupLink).toBeDefined();
    });
  });

  describe('inviteUrl 조건 분기', () => {
    it('inviteUrl이 null이면 초대 버튼이 표시되지 않는다', () => {
      render(<LandingNav inviteUrl={null} />);
      expect(screen.queryByText('서버 추가')).not.toBeInTheDocument();
    });

    it('inviteUrl이 있으면 초대 버튼이 표시된다', () => {
      render(<LandingNav inviteUrl="https://discord.com/oauth2/authorize?client_id=test" />);
      // 데스크톱 + 모바일 두 곳에 렌더링될 수 있으므로 getAllByText 사용
      const inviteButtons = screen.getAllByText('서버 추가');
      expect(inviteButtons.length).toBeGreaterThan(0);
    });

    it('초대 버튼이 제공된 inviteUrl로 연결된다', () => {
      const url = 'https://discord.com/oauth2/authorize?client_id=test123';
      render(<LandingNav inviteUrl={url} />);
      const link = screen.getAllByRole('link').find((el) => el.getAttribute('href') === url);
      expect(link).toBeDefined();
    });

    it('초대 버튼이 target="_blank"로 새 탭에서 열린다', () => {
      const url = 'https://discord.com/oauth2/authorize?client_id=test123';
      render(<LandingNav inviteUrl={url} />);
      const links = screen.getAllByRole('link').filter((el) => el.getAttribute('href') === url);
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => {
        expect(link).toHaveAttribute('target', '_blank');
      });
    });
  });

  describe('스크롤 상태 전환', () => {
    it('초기 상태에서는 배경이 투명(bg-transparent)하다', () => {
      render(<LandingNav inviteUrl={null} />);
      const header = document.querySelector('header');
      expect(header?.className).toContain('bg-transparent');
    });

    it('scrollY > 10 이후에는 반투명 배경 클래스(bg-white/90)가 적용된다', async () => {
      render(<LandingNav inviteUrl={null} />);

      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 15, configurable: true });
        window.dispatchEvent(new Event('scroll'));
      });

      const header = document.querySelector('header');
      expect(header?.className).toContain('bg-white/90');
    });

    it('scrollY <= 10 으로 되돌아오면 투명 배경으로 복원된다', async () => {
      render(<LandingNav inviteUrl={null} />);

      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 15, configurable: true });
        window.dispatchEvent(new Event('scroll'));
      });

      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 5, configurable: true });
        window.dispatchEvent(new Event('scroll'));
      });

      const header = document.querySelector('header');
      expect(header?.className).toContain('bg-transparent');
    });
  });
});
