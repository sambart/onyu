/**
 * InactiveSummaryCard 통합 테스트
 *
 * 오버뷰 비활동 요약 카드가 비활동 회원 처리 페이지로 연결되는지 검증한다.
 * - 카드 전체가 /dashboard/guild/{guildId}/inactive-member 로 향하는 링크인지 확인
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import InactiveSummaryCard from '../InactiveSummaryCard';

// ─── 전역 모킹 ──────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────

const GUILD_ID = 'guild-abc';

const DEFAULT_GRADES = {
  fullyInactive: 3,
  lowActive: 5,
  declining: 2,
};

// ─── 테스트 ─────────────────────────────────────────────────────

describe('InactiveSummaryCard 통합 테스트', () => {
  it('카드가 비활동 회원 처리 페이지로 향하는 링크로 렌더링된다', () => {
    render(<InactiveSummaryCard grades={DEFAULT_GRADES} guildId={GUILD_ID} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `/dashboard/guild/${GUILD_ID}/inactive-member`);
  });

  it('카드 제목과 등급별 인원이 함께 렌더링된다', () => {
    render(<InactiveSummaryCard grades={DEFAULT_GRADES} guildId={GUILD_ID} />);

    expect(screen.getByText('overview.inactiveGrade.title')).toBeInTheDocument();
    expect(screen.getByText('overview.inactiveGrade.fullyInactive')).toBeInTheDocument();
  });
});
