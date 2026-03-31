/**
 * GettingStarted 페이지 통합 테스트
 *
 * 모니터링 도메인 전환 후 fetchBotStatus → /api/health 대체 검증:
 * - 봇 온라인/오프라인 상태가 /api/health 응답 기반으로 올바르게 표시되는지 확인
 * - 로딩 → 성공/실패 상태 전이가 유저에게 올바르게 노출되는지 확인
 * - 스텝 네비게이션(다음/이전/완료) 흐름이 정상 동작하는지 확인
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GettingStartedPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────

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

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ guildId: 'guild-test-123' }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      // stepOf 같은 파라미터 포함 키 처리
      return `${ns}.${key}(${JSON.stringify(params)})`;
    }
    return `${ns}.${key}`;
  },
}));

// ─── fetch 모킹 헬퍼 ────────────────────────────────────────────

function mockHealthOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    }),
  );
}

function mockHealthOffline() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ status: 'error' }),
    }),
  );
}

function mockHealthNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network Error')));
}

// ─── 테스트 ─────────────────────────────────────────────────────

describe('GettingStarted 페이지 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
  });

  describe('Step 1 — 봇 권한 확인 (/api/health 연동)', () => {
    it('/api/health 호출 중에는 로딩 상태가 표시된다', async () => {
      // fetch가 절대 resolve되지 않는 pending 상태로 설정
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

      render(<GettingStartedPage />);

      // 로딩 텍스트가 나타나야 한다
      expect(
        screen.getByText('dashboard.gettingStarted.botPermission.checking'),
      ).toBeInTheDocument();
    });

    it('/api/health가 { status: "ok" }를 반환하면 봇 온라인 메시지가 표시된다', async () => {
      mockHealthOk();

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.online'),
        ).toBeInTheDocument();
      });
    });

    it('/api/health가 { status: "error" }를 반환하면 봇 오프라인 메시지가 표시된다', async () => {
      mockHealthOffline();

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.offline'),
        ).toBeInTheDocument();
      });
    });

    it('네트워크 오류 시 봇 오프라인 메시지가 표시된다', async () => {
      mockHealthNetworkError();

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.offline'),
        ).toBeInTheDocument();
      });
    });

    it('봇이 오프라인이면 오프라인 경고 메시지가 표시된다', async () => {
      mockHealthOffline();

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.offlineWarning'),
        ).toBeInTheDocument();
      });
    });

    it('봇이 온라인이면 오프라인 경고 메시지가 표시되지 않는다', async () => {
      mockHealthOk();

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(
          screen.queryByText('dashboard.gettingStarted.botPermission.offlineWarning'),
        ).toBeNull();
      });
    });

    it('/api/health를 cache: no-store 옵션으로 호출한다', async () => {
      mockHealthOk();
      const fetchSpy = vi.mocked(globalThis.fetch);

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/health', { cache: 'no-store' });
      });
    });
  });

  describe('스텝 네비게이션', () => {
    it('초기 렌더링 시 Step 1 컨텐츠가 표시된다', async () => {
      mockHealthOk();

      render(<GettingStartedPage />);

      // 봇 권한 확인 컨텐츠가 있어야 한다
      expect(
        screen.getByText('dashboard.gettingStarted.botPermission.connectionTitle'),
      ).toBeInTheDocument();

      // fetch가 settle될 때까지 기다려 act() 경고를 방지한다
      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.online'),
        ).toBeInTheDocument();
      });
    });

    it('Step 1에서 "다음" 버튼을 클릭하면 Step 2 컨텐츠가 표시된다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.online'),
        ).toBeInTheDocument();
      });

      const nextButton = screen.getByText('dashboard.gettingStarted.next');
      await user.click(nextButton);

      // Step 2: 음성 추적 컨텐츠가 표시되어야 한다
      expect(
        screen.getByText('dashboard.gettingStarted.voiceTracking.autoTitle'),
      ).toBeInTheDocument();
    });

    it('Step 1에서 "이전" 버튼은 비활성화된다', async () => {
      mockHealthOk();

      render(<GettingStartedPage />);

      // fetch가 settle될 때까지 기다려 act() 경고를 방지한다
      await waitFor(() => {
        expect(
          screen.getByText('dashboard.gettingStarted.botPermission.online'),
        ).toBeInTheDocument();
      });

      const prevButton = screen.getByText('dashboard.gettingStarted.prev').closest('button');
      expect(prevButton).toBeDisabled();
    });

    it('Step 2에서 "이전" 버튼을 클릭하면 Step 1로 돌아간다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      // Step 2로 이동
      const nextButton = screen.getByText('dashboard.gettingStarted.next');
      await user.click(nextButton);

      // Step 1로 복귀
      const prevButton = screen.getByText('dashboard.gettingStarted.prev');
      await user.click(prevButton);

      expect(
        screen.getByText('dashboard.gettingStarted.botPermission.connectionTitle'),
      ).toBeInTheDocument();
    });

    it('4번째 스텝에서는 "다음" 대신 "완료" 버튼이 표시된다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      // Step 4까지 이동
      for (let i = 0; i < 3; i++) {
        const nextButton = screen.getByText('dashboard.gettingStarted.next');
        await user.click(nextButton);
      }

      expect(screen.getByText('dashboard.gettingStarted.finish')).toBeInTheDocument();
      expect(screen.queryByText('dashboard.gettingStarted.next')).toBeNull();
    });

    it('"완료" 버튼을 클릭하면 overview 페이지로 이동한다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      // Step 4까지 이동
      for (let i = 0; i < 3; i++) {
        const nextButton = screen.getByText('dashboard.gettingStarted.next');
        await user.click(nextButton);
      }

      const finishButton = screen.getByText('dashboard.gettingStarted.finish');
      await user.click(finishButton);

      expect(mockPush).toHaveBeenCalledWith('/dashboard/guild/guild-test-123/overview');
    });
  });

  describe('Step 2 — 음성 추적 설정 링크', () => {
    it('음성 설정으로 이동하는 링크가 올바른 guildId href를 가진다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      const nextButton = screen.getByText('dashboard.gettingStarted.next');
      await user.click(nextButton);

      const voiceSettingsLink = screen
        .getAllByRole('link')
        .find((el) => el.getAttribute('href') === '/settings/guild/guild-test-123/voice');

      expect(voiceSettingsLink).toBeDefined();
    });
  });

  describe('Step 3 — 알림 채널 설정 링크', () => {
    it('신규회원 설정 링크가 올바른 guildId href를 가진다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      // Step 3까지 이동
      for (let i = 0; i < 2; i++) {
        const nextButton = screen.getByText('dashboard.gettingStarted.next');
        await user.click(nextButton);
      }

      const newbieLink = screen
        .getAllByRole('link')
        .find((el) => el.getAttribute('href') === '/settings/guild/guild-test-123/newbie');

      expect(newbieLink).toBeDefined();
    });

    it('비활동회원 설정 링크가 올바른 guildId href를 가진다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      for (let i = 0; i < 2; i++) {
        const nextButton = screen.getByText('dashboard.gettingStarted.next');
        await user.click(nextButton);
      }

      const inactiveLink = screen
        .getAllByRole('link')
        .find((el) => el.getAttribute('href') === '/settings/guild/guild-test-123/inactive-member');

      expect(inactiveLink).toBeDefined();
    });
  });

  describe('Step 4 — 완료 화면 피처 링크', () => {
    it('overview, voice, newbie, inactive-member 링크가 모두 렌더링된다', async () => {
      mockHealthOk();
      const user = userEvent.setup();

      render(<GettingStartedPage />);

      for (let i = 0; i < 3; i++) {
        const nextButton = screen.getByText('dashboard.gettingStarted.next');
        await user.click(nextButton);
      }

      const links = screen.getAllByRole('link').map((el) => el.getAttribute('href'));

      expect(links).toContain('/dashboard/guild/guild-test-123/overview');
      expect(links).toContain('/dashboard/guild/guild-test-123/voice');
      expect(links).toContain('/dashboard/guild/guild-test-123/newbie');
      expect(links).toContain('/dashboard/guild/guild-test-123/inactive-member');
    });
  });
});
