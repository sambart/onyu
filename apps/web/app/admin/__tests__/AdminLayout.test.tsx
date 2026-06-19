/**
 * AdminLayout 통합 테스트
 *
 * 유저 관점 검증 항목:
 * - isSuperAdmin=true 이면 콘솔 타이틀 + children 이 렌더링된다
 * - isSuperAdmin=false 이면 accessDenied UI 가 렌더링되고 router.replace('/') 가 호출된다
 * - 미로그인(data 없음) 이면 로그인 유도 UI 가 렌더링된다
 * - fetch 실패(네트워크 오류) 이면 재시도 UI 가 렌더링된다
 * - 로딩 중(fetch 미완료) 이면 스켈레톤이 렌더링된다
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── 전역 모킹 ────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/admin',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import AdminLayout from '../layout';

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function mockFetchMe(response: { ok: boolean; body?: unknown; shouldThrow?: boolean }) {
  if (response.shouldThrow) {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'));
    return;
  }
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    json: () => Promise.resolve(response.body ?? null),
  } as unknown as Response);
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('AdminLayout 가드 — 인증/권한 분기', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('isSuperAdmin=true 이면 콘솔 타이틀과 children 이 렌더링된다', async () => {
    mockFetchMe({
      ok: true,
      body: { user: { isSuperAdmin: true } },
    });

    render(
      <AdminLayout>
        <div data-testid="protected-content">슈퍼어드민 콘텐츠</div>
      </AdminLayout>,
    );

    // 로딩 → 성공 상태 전이 대기
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    // 콘솔 타이틀 렌더링 확인
    expect(screen.getByText('console.title')).toBeInTheDocument();

    // router.replace 호출되지 않아야 함
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('isSuperAdmin=false 이면 accessDenied UI 가 렌더링되고 children 은 보이지 않는다', async () => {
    mockFetchMe({
      ok: true,
      body: { user: { isSuperAdmin: false } },
    });

    render(
      <AdminLayout>
        <div data-testid="protected-content">민감 콘텐츠</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      expect(screen.getByText('accessDenied')).toBeInTheDocument();
    });

    // 민감 콘텐츠가 렌더링되지 않아야 함
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // 홈으로 리다이렉트 호출 확인
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('미로그인(응답 data 없음) 이면 로그인 유도 UI 가 렌더링된다', async () => {
    mockFetchMe({ ok: false });

    render(
      <AdminLayout>
        <div data-testid="protected-content">민감 콘텐츠</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      // tAuth('loginRequired') → useTranslations mock 이 namespace 없이 key 그대로 반환
      expect(screen.getByText('loginRequired')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('fetch 실패(네트워크 오류) 이면 재시도 UI 가 렌더링된다', async () => {
    mockFetchMe({ ok: false, shouldThrow: true });

    render(
      <AdminLayout>
        <div data-testid="protected-content">민감 콘텐츠</div>
      </AdminLayout>,
    );

    await waitFor(() => {
      // tAuth('networkError') → useTranslations mock 에 의해 'networkError' 문자열 반환
      expect(screen.getByText('networkError')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('로딩 중에는 animate-pulse 스켈레톤이 렌더링된다', () => {
    // fetch 가 resolve 되지 않도록 절대 완료되지 않는 promise 사용
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <AdminLayout>
        <div data-testid="protected-content">콘텐츠</div>
      </AdminLayout>,
    );

    // 로딩 상태: animate-pulse 클래스 존재 확인
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();

    // children 은 렌더링되지 않아야 함
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});
