/**
 * AdminPage 통합 테스트
 *
 * 유저 관점 검증 항목:
 * - 길드 목록 로드 성공 시 GuildTable 이 렌더링된다
 * - 검색어 입력 → 이름/ID 부분일치 필터링
 * - 검색 결과가 없으면 guilds.noResults 메시지가 표시된다
 * - 전체 길드가 없으면 guilds.empty 메시지가 표시된다
 * - API 실패 시 loadFailed 에러 메시지가 표시된다
 * - 로딩 중에는 loading 메시지가 표시된다
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminGuild, PlatformHealth } from '@/app/lib/admin-api';

// ─── 전역 모킹 ────────────────────────────────────────────────────────────────

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

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  Search: () => <svg data-testid="search-icon" />,
  Activity: () => <svg />,
  Server: () => <svg />,
  Bot: () => <svg />,
  Database: () => <svg />,
}));

// admin-api 전체 모킹
const mockFetchAdminGuilds = vi.fn();
const mockFetchPlatformHealth = vi.fn();

vi.mock('@/app/lib/admin-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/lib/admin-api')>();
  return {
    ...actual,
    fetchAdminGuilds: (...args: unknown[]) => mockFetchAdminGuilds(...args),
    fetchPlatformHealth: (...args: unknown[]) => mockFetchPlatformHealth(...args),
  };
});

import AdminPage from '../page';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const GUILD_A: AdminGuild = {
  id: '111',
  name: '알파 서버',
  icon: null,
  memberCount: 100,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const GUILD_B: AdminGuild = {
  id: '222',
  name: '베타 서버',
  icon: null,
  memberCount: 200,
  joinedAt: '2024-02-01T00:00:00.000Z',
};

const DEFAULT_HEALTH: PlatformHealth = {
  api: 'up',
  bot: 'up',
  database: 'up',
  redis: 'up',
};

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('AdminPage — 길드 현황 페이지 통합 테스트', () => {
  beforeEach(() => {
    mockFetchAdminGuilds.mockReset();
    mockFetchPlatformHealth.mockReset();
    mockFetchPlatformHealth.mockResolvedValue(DEFAULT_HEALTH);
  });

  describe('길드 목록 로드 성공', () => {
    it('길드 목록이 로드되면 각 길드 이름이 렌더링된다', async () => {
      mockFetchAdminGuilds.mockResolvedValue([GUILD_A, GUILD_B]);

      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('알파 서버')).toBeInTheDocument();
        expect(screen.getByText('베타 서버')).toBeInTheDocument();
      });
    });

    it('로딩 중에는 loading 메시지가 표시된다', async () => {
      // 로딩 상태 유지: 완료되지 않는 promise
      mockFetchAdminGuilds.mockReturnValue(new Promise(() => {}));
      mockFetchPlatformHealth.mockReturnValue(new Promise(() => {}));

      render(<AdminPage />);

      expect(screen.getByText('loading')).toBeInTheDocument();
    });
  });

  describe('빈 목록', () => {
    it('전체 길드가 없으면 guilds.empty 메시지가 표시된다', async () => {
      mockFetchAdminGuilds.mockResolvedValue([]);

      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('guilds.empty')).toBeInTheDocument();
      });
    });
  });

  describe('API 오류', () => {
    it('fetchAdminGuilds 실패 시 loadFailed 에러 메시지가 표시된다', async () => {
      mockFetchAdminGuilds.mockRejectedValue(new Error('Forbidden'));

      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('loadFailed')).toBeInTheDocument();
      });
    });
  });

  describe('검색 필터링', () => {
    it('이름으로 검색하면 일치하는 길드만 표시된다', async () => {
      mockFetchAdminGuilds.mockResolvedValue([GUILD_A, GUILD_B]);
      const user = userEvent.setup();

      render(<AdminPage />);

      // 목록 로드 대기
      await waitFor(() => {
        expect(screen.getByText('알파 서버')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('textbox');
      await user.type(searchInput, '알파');

      expect(screen.getByText('알파 서버')).toBeInTheDocument();
      expect(screen.queryByText('베타 서버')).not.toBeInTheDocument();
    });

    it('ID 로 검색하면 일치하는 길드만 표시된다', async () => {
      mockFetchAdminGuilds.mockResolvedValue([GUILD_A, GUILD_B]);
      const user = userEvent.setup();

      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('베타 서버')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('textbox');
      await user.type(searchInput, '222');

      expect(screen.getByText('베타 서버')).toBeInTheDocument();
      expect(screen.queryByText('알파 서버')).not.toBeInTheDocument();
    });

    it('검색 결과가 없으면 guilds.noResults 메시지가 표시된다', async () => {
      mockFetchAdminGuilds.mockResolvedValue([GUILD_A, GUILD_B]);
      const user = userEvent.setup();

      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('알파 서버')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('textbox');
      await user.type(searchInput, '존재하지않는길드이름xyz');

      expect(screen.getByText('guilds.noResults')).toBeInTheDocument();
      expect(screen.queryByText('알파 서버')).not.toBeInTheDocument();
    });

    it('검색어를 지우면 전체 목록이 다시 표시된다', async () => {
      mockFetchAdminGuilds.mockResolvedValue([GUILD_A, GUILD_B]);
      const user = userEvent.setup();

      render(<AdminPage />);

      await waitFor(() => {
        expect(screen.getByText('알파 서버')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('textbox');
      await user.type(searchInput, '알파');
      expect(screen.queryByText('베타 서버')).not.toBeInTheDocument();

      await user.clear(searchInput);
      expect(screen.getByText('알파 서버')).toBeInTheDocument();
      expect(screen.getByText('베타 서버')).toBeInTheDocument();
    });
  });
});
