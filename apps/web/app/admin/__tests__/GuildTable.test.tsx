/**
 * GuildTable 통합 테스트
 *
 * 유저 관점 검증 항목:
 * - AdminGuild[] 가 주어지면 각 행에 이름/ID/멤버수/참여일/열람 링크가 렌더링된다
 * - 열람 링크의 href 가 /dashboard/guild/{id}/overview 이어야 한다
 * - memberCount=null 이면 '알 수 없음' 안전 렌더 (침묵 없음)
 * - joinedAt=null 이면 '—' 안전 렌더 (침묵 없음)
 * - icon=null 이면 이미지 대신 이니셜 fallback 이 렌더링된다
 * - icon 이 있으면 Discord CDN URL Image 가 렌더링된다
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminGuild } from '@/app/lib/admin-api';

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

import GuildTable from '../components/GuildTable';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const GUILD_FULL: AdminGuild = {
  id: '111222333444555666',
  name: '테스트 서버',
  icon: 'abcdef1234567890',
  memberCount: 1500,
  joinedAt: '2024-01-15T00:00:00.000Z',
};

const GUILD_NULL_FIELDS: AdminGuild = {
  id: '999888777666555444',
  name: '빈 서버',
  icon: null,
  memberCount: null,
  joinedAt: null,
};

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('GuildTable — 길드 목록 렌더링', () => {
  describe('정상 데이터 렌더링', () => {
    it('길드 이름이 테이블 행에 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL]} />);
      expect(screen.getByText('테스트 서버')).toBeInTheDocument();
    });

    it('길드 ID 가 테이블 행에 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL]} />);
      expect(screen.getByText('111222333444555666')).toBeInTheDocument();
    });

    it('멤버 수가 포맷되어 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL]} />);
      // toLocaleString() 결과는 환경마다 다를 수 있으므로 포함 여부로 검증
      expect(screen.getByText(/1[,.]?500/)).toBeInTheDocument();
    });

    it('참여일이 날짜 형식으로 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL]} />);
      // new Date().toLocaleDateString() 결과 포함 확인 (환경 무관)
      const dateStr = new Date(GUILD_FULL.joinedAt!).toLocaleDateString();
      expect(screen.getByText(dateStr)).toBeInTheDocument();
    });

    it('열람 링크의 href 가 /dashboard/guild/{id}/overview 이다', () => {
      render(<GuildTable guilds={[GUILD_FULL]} />);
      const link = screen.getByText('guilds.view').closest('a');
      expect(link).toHaveAttribute('href', `/dashboard/guild/${GUILD_FULL.id}/overview`);
    });

    it('icon 이 있으면 Discord CDN 이미지 img 태그가 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL]} />);
      const img = screen.getByAltText('테스트 서버');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        'src',
        `https://cdn.discordapp.com/icons/${GUILD_FULL.id}/${GUILD_FULL.icon}.png?size=128`,
      );
    });
  });

  describe('null 필드 안전 렌더링', () => {
    it('memberCount=null 이면 guilds.memberCountUnknown 키로 렌더링된다 (침묵 없음)', () => {
      render(<GuildTable guilds={[GUILD_NULL_FIELDS]} />);
      expect(screen.getByText('guilds.memberCountUnknown')).toBeInTheDocument();
    });

    it('joinedAt=null 이면 "—" 으로 렌더링된다 (침묵 없음)', () => {
      render(<GuildTable guilds={[GUILD_NULL_FIELDS]} />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('icon=null 이면 이미지 대신 이니셜 fallback 이 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_NULL_FIELDS]} />);
      // img 태그가 없어야 함
      expect(screen.queryByAltText('빈 서버')).not.toBeInTheDocument();
      // 이름 첫 글자 fallback 확인
      expect(screen.getByText('빈')).toBeInTheDocument();
    });
  });

  describe('다수 길드 렌더링', () => {
    it('여러 길드가 각자 열람 링크를 가지며 올바른 href 가 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL, GUILD_NULL_FIELDS]} />);

      const links = screen.getAllByText('guilds.view').map((el) => el.closest('a'));
      const hrefs = links.map((a) => a?.getAttribute('href'));

      expect(hrefs).toContain(`/dashboard/guild/${GUILD_FULL.id}/overview`);
      expect(hrefs).toContain(`/dashboard/guild/${GUILD_NULL_FIELDS.id}/overview`);
    });

    it('두 길드 이름이 모두 렌더링된다', () => {
      render(<GuildTable guilds={[GUILD_FULL, GUILD_NULL_FIELDS]} />);
      expect(screen.getByText('테스트 서버')).toBeInTheDocument();
      expect(screen.getByText('빈 서버')).toBeInTheDocument();
    });
  });
});
