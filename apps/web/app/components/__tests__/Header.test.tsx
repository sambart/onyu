/**
 * Header 컴포넌트 테스트
 *
 * 유저 관점 검증 항목:
 * - pathname === "/" 일 때 Header가 null을 반환하여 DOM에 아무것도 없는지 확인
 * - 랜딩 이외의 경로에서는 header가 렌더링되는지 확인
 * - role 존재(super_admin/bot_operator) 이면 /admin 링크가 노출된다
 * - role=null(또는 미로그인) 이면 /admin 링크가 노출되지 않는다
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

const mockPathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../SidebarContext', () => ({
  useSidebar: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn() }),
}));

vi.mock('../LocaleSwitcher', () => ({
  default: () => <div data-testid="locale-switcher" />,
}));

// ─── 헬퍼 ──────────────────────────────────────────────────────────

type MockRole = 'super_admin' | 'bot_operator' | null;

function mockFetchMe(role: MockRole) {
  if (role === null) {
    // 미로그인 또는 role 없음: fetch 실패 또는 role=null 반환
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(null),
    } as unknown as Response);
    return;
  }
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        user: {
          discordId: '12345',
          username: 'testuser',
          role,
          scopes: role === 'super_admin' ? ['admin:manage'] : [],
        },
      }),
  } as unknown as Response);
}

import Header from '../Header';

// ─── 테스트 ────────────────────────────────────────────────────────

describe('Header 컴포넌트 — pathname 조건 분기', () => {
  it('pathname이 "/"이면 아무것도 렌더링하지 않는다', () => {
    mockPathname.mockReturnValue('/');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(null),
    } as unknown as Response);

    const { container } = render(<Header />);
    expect(container.firstChild).toBeNull();
  });

  it('pathname이 "/dashboard"이면 header 요소가 렌더링된다', () => {
    mockPathname.mockReturnValue('/dashboard');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(null),
    } as unknown as Response);

    const { container } = render(<Header />);
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('header')).toBeInTheDocument();
  });

  it('pathname이 "/select-guild"이면 header 요소가 렌더링된다', () => {
    mockPathname.mockReturnValue('/select-guild');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(null),
    } as unknown as Response);

    const { container } = render(<Header />);
    expect(container.querySelector('header')).toBeInTheDocument();
  });
});

describe('Header 컴포넌트 — role 기반 링크 노출 분기', () => {
  it('role=super_admin 이면 /admin 링크가 렌더링된다', async () => {
    mockPathname.mockReturnValue('/dashboard');
    mockFetchMe('super_admin');

    render(<Header />);

    await waitFor(() => {
      const adminLinks = screen
        .getAllByRole('link')
        .filter((el) => el.getAttribute('href') === '/admin');
      expect(adminLinks.length).toBeGreaterThan(0);
    });
  });

  it('role=bot_operator 이면 /admin 링크가 렌더링된다', async () => {
    mockPathname.mockReturnValue('/dashboard');
    mockFetchMe('bot_operator');

    render(<Header />);

    await waitFor(() => {
      const adminLinks = screen
        .getAllByRole('link')
        .filter((el) => el.getAttribute('href') === '/admin');
      expect(adminLinks.length).toBeGreaterThan(0);
    });
  });

  it('role=null(또는 미로그인) 이면 /admin 링크가 렌더링되지 않는다', async () => {
    mockPathname.mockReturnValue('/dashboard');
    mockFetchMe(null);

    render(<Header />);

    // fetch 완료 대기를 위해 header 렌더링이 안정된 후 확인
    await waitFor(() => {
      // fetch 응답이 처리되었는지 확인 — header 자체는 존재해야 함
      expect(screen.queryByRole('banner')).not.toBeNull();
    });

    const adminLinks = screen
      .queryAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/admin');
    expect(adminLinks).toHaveLength(0);
  });
});
