/**
 * Header 컴포넌트 테스트
 *
 * 유저 관점 검증 항목:
 * - pathname === "/" 일 때 Header가 null을 반환하여 DOM에 아무것도 없는지 확인
 * - 랜딩 이외의 경로에서는 header가 렌더링되는지 확인
 */

import { render } from '@testing-library/react';
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

// /auth/me fetch를 조용히 처리
global.fetch = vi.fn().mockResolvedValue({
  ok: false,
  json: () => Promise.resolve(null),
} as unknown as Response);

import Header from '../Header';

// ─── 테스트 ────────────────────────────────────────────────────────

describe('Header 컴포넌트 — pathname 조건 분기', () => {
  it('pathname이 "/"이면 아무것도 렌더링하지 않는다', () => {
    mockPathname.mockReturnValue('/');
    const { container } = render(<Header />);
    expect(container.firstChild).toBeNull();
  });

  it('pathname이 "/dashboard"이면 header 요소가 렌더링된다', () => {
    mockPathname.mockReturnValue('/dashboard');
    const { container } = render(<Header />);
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector('header')).toBeInTheDocument();
  });

  it('pathname이 "/select-guild"이면 header 요소가 렌더링된다', () => {
    mockPathname.mockReturnValue('/select-guild');
    const { container } = render(<Header />);
    expect(container.querySelector('header')).toBeInTheDocument();
  });
});
