/**
 * LastAppliedBadge 컴포넌트 단위 테스트
 *
 * 순수 렌더링 결과를 유저 관점에서 검증한다.
 * - at=null: 미반영/미저장 텍스트 표시
 * - at 있음: 상대시각 포함 텍스트 표시
 * - variant='applied' vs 'saved'
 * - disabled=true: opacity 클래스 적용
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LastAppliedBadge } from '../settings/LastAppliedBadge';

// ─── next-intl 모킹 — useLocale 포함 ──────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => 'ko',
}));

// ─── relative-time 모킹 — 순수함수 격리 ───────────────────────────────────

vi.mock('@/app/lib/relative-time', () => ({
  formatRelativeTime: (_input: string | Date, _locale: string) => '5분 전',
}));

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('LastAppliedBadge', () => {
  describe('variant="applied" (기본값)', () => {
    it('at=null이면 notApplied 키 텍스트를 표시한다', () => {
      render(<LastAppliedBadge at={null} />);

      expect(screen.getByText('notApplied')).toBeInTheDocument();
    });

    it('at 있으면 lastApplied 키와 상대시각을 표시한다', () => {
      render(<LastAppliedBadge at="2026-06-21T10:00:00Z" />);

      // i18n 키가 시각 파라미터와 함께 렌더되어야 한다
      expect(screen.getByText('lastApplied({"time":"5분 전"})')).toBeInTheDocument();
    });
  });

  describe('variant="saved"', () => {
    it('at=null이면 notSaved 키 텍스트를 표시한다', () => {
      render(<LastAppliedBadge at={null} variant="saved" />);

      expect(screen.getByText('notSaved')).toBeInTheDocument();
    });

    it('at 있으면 lastSaved 키와 상대시각을 표시한다', () => {
      render(<LastAppliedBadge at="2026-06-21T10:00:00Z" variant="saved" />);

      expect(screen.getByText('lastSaved({"time":"5분 전"})')).toBeInTheDocument();
    });
  });

  describe('disabled prop', () => {
    it('disabled=true이면 배지에 opacity-40 클래스가 적용된다', () => {
      const { container } = render(<LastAppliedBadge at={null} disabled />);

      const badge = container.querySelector('span');
      expect(badge?.className).toContain('opacity-40');
    });

    it('disabled=false(기본값)이면 opacity-40 클래스가 없다', () => {
      const { container } = render(<LastAppliedBadge at={null} />);

      const badge = container.querySelector('span');
      expect(badge?.className).not.toContain('opacity-40');
    });
  });

  describe('색상 클래스', () => {
    it('at=null이면 회색 계열 클래스가 적용된다', () => {
      const { container } = render(<LastAppliedBadge at={null} />);

      const badge = container.querySelector('span');
      expect(badge?.className).toContain('bg-gray-100');
    });

    it('at 있으면 파란색 계열 클래스가 적용된다', () => {
      const { container } = render(<LastAppliedBadge at="2026-06-21T10:00:00Z" />);

      const badge = container.querySelector('span');
      expect(badge?.className).toContain('bg-blue-50');
    });
  });
});
