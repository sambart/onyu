/**
 * LandingNav 통합 테스트
 *
 * 유저 관점 검증 항목:
 * - 네비 링크가 올바른 목적지로 연결되는지 확인
 * - 로그인 상태(/auth/me)에 따라 로그인 버튼 ↔ 사용자 프로필이 전환되는지 확인
 * - 로그아웃 동작 시 로그인 버튼으로 되돌아가는지 확인
 * - 스크롤 발생 시 배경 클래스 전환 확인
 * - 랜드마크 구조(nav) 존재 확인
 *
 * 참고: 컴포넌트는 props를 받지 않고(<LandingNav />), 마운트 시 자체적으로
 * `/auth/me`를 호출해 로그인 상태를 판단한다 (app/page.tsx 사용부 참조).
 * 과거 inviteUrl prop 기반 초대 버튼은 현재 구현에서 제거되었고
 * (초대 CTA는 app/page.tsx의 Hero/CtaBand 섹션으로 이동), 대신 로그인 여부에 따른
 * 로그인/로그아웃 슬롯이 도입되었다 — 이에 맞춰 시나리오를 재작성한다.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      'auth.login': '로그인',
      'auth.logout': '로그아웃',
    };
    return map[key] ?? key;
  },
}));

interface LandingUser {
  discordId: string;
  username: string;
  avatar: string | null;
}

/** `/auth/me`, `/auth/logout` 호출을 흉내내는 fetch 모킹 헬퍼 */
function mockAuthFetch(user: LandingUser | null) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/auth/me') {
      return Promise.resolve({
        ok: user !== null,
        json: () => Promise.resolve(user ? { user } : null),
      } as Response);
    }
    if (url === '/auth/logout') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response);
  });
}

import LandingNav from '../LandingNav';

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 테스트 ────────────────────────────────────────────────────────

describe('LandingNav 통합 테스트', () => {
  describe('기본 렌더링', () => {
    it('nav 랜드마크가 존재한다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('Onyu 로고 텍스트가 표시된다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      expect(screen.getByText('Onyu')).toBeInTheDocument();
    });

    it('로고 링크가 / 경로로 연결된다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      const logoLink = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/');
      expect(logoLink).toBeDefined();
    });
  });

  describe('네비게이션 링크', () => {
    it('"대시보드" 링크가 /select-guild?mode=dashboard로 연결된다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      const dashboardLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('대시보드') &&
            el.getAttribute('href') === '/select-guild?mode=dashboard',
        );
      expect(dashboardLink).toBeDefined();
    });

    it('"기능" 앵커가 #features로 연결된다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      const featuresLink = screen
        .getAllByRole('link')
        .find((el) => el.textContent?.includes('기능') && el.getAttribute('href') === '#features');
      expect(featuresLink).toBeDefined();
    });

    it('"설정 가이드" 앵커가 #setup으로 연결된다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      const setupLink = screen
        .getAllByRole('link')
        .find(
          (el) => el.textContent?.includes('설정 가이드') && el.getAttribute('href') === '#setup',
        );
      expect(setupLink).toBeDefined();
    });
  });

  describe('로그인 상태 슬롯', () => {
    it('인증 확인이 끝나기 전에는 로그인 버튼도 사용자 정보도 보이지 않는다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      // /auth/me 응답이 아직 도착하지 않은 시점 — 로딩 스켈레톤만 표시된다
      expect(screen.queryByText('로그인')).not.toBeInTheDocument();
      expect(screen.queryByText('로그아웃')).not.toBeInTheDocument();
    });

    it('로그인되어 있지 않으면 로그인 버튼이 /auth/discord로 연결된다', async () => {
      mockAuthFetch(null);
      render(<LandingNav />);

      const loginLink = await screen.findByText('로그인');

      expect(loginLink.closest('a')).toHaveAttribute('href', '/auth/discord');
    });

    it('로그인되어 있으면 사용자 이름과 로그아웃 버튼이 표시되고 로그인 버튼은 사라진다', async () => {
      mockAuthFetch({ discordId: 'user-1', username: '테스트유저', avatar: null });
      render(<LandingNav />);

      expect(await screen.findByText('테스트유저')).toBeInTheDocument();
      expect(screen.getByText('로그아웃')).toBeInTheDocument();
      expect(screen.queryByText('로그인')).not.toBeInTheDocument();
    });

    it('로그아웃 버튼을 클릭하면 로그아웃 API가 호출되고 로그인 버튼으로 되돌아간다', async () => {
      const user = userEvent.setup();
      mockAuthFetch({ discordId: 'user-1', username: '테스트유저', avatar: null });
      render(<LandingNav />);

      await screen.findByText('테스트유저');
      await user.click(screen.getByText('로그아웃'));

      expect(global.fetch).toHaveBeenCalledWith(
        '/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(await screen.findByText('로그인')).toBeInTheDocument();
    });
  });

  describe('스크롤 상태 전환', () => {
    it('초기 상태에서는 배경이 투명(bg-transparent)하다', () => {
      mockAuthFetch(null);
      render(<LandingNav />);
      const header = document.querySelector('header');
      expect(header?.className).toContain('bg-transparent');
    });

    it('scrollY > 10 이후에는 반투명 배경 클래스(bg-white/90)가 적용된다', async () => {
      mockAuthFetch(null);
      render(<LandingNav />);

      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 15, configurable: true });
        window.dispatchEvent(new Event('scroll'));
      });

      const header = document.querySelector('header');
      expect(header?.className).toContain('bg-white/90');
    });

    it('scrollY <= 10 으로 되돌아오면 투명 배경으로 복원된다', async () => {
      mockAuthFetch(null);
      render(<LandingNav />);

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
