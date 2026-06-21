/**
 * ReApplyButton 컴포넌트 단위 테스트
 *
 * 유저 관점 시나리오:
 * - 클릭 → onReApply 호출 + 로딩 상태 표시 (중복 클릭 방지)
 * - disabled=true → 버튼 비활성
 * - 로딩 중 → 버튼 비활성 (자동)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReApplyButton } from '../settings/ReApplyButton';

// ─── next-intl 모킹 ─────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('ReApplyButton', () => {
  describe('정상 클릭', () => {
    it('버튼을 클릭하면 onReApply가 호출된다', async () => {
      const onReApply = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ReApplyButton onReApply={onReApply} />);
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(onReApply).toHaveBeenCalledTimes(1);
      });
    });

    it('버튼은 기본적으로 reApply 키 텍스트를 표시한다', () => {
      render(<ReApplyButton onReApply={vi.fn()} />);

      expect(screen.getByRole('button')).toHaveTextContent('reApply');
    });
  });

  describe('로딩 상태 (중복 클릭 방지)', () => {
    it('클릭 후 onReApply가 진행 중이면 버튼이 disabled 상태가 된다', async () => {
      let resolveReApply!: () => void;
      const onReApply = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveReApply = resolve;
          }),
      );
      const user = userEvent.setup();

      render(<ReApplyButton onReApply={onReApply} />);

      const btn = screen.getByRole('button');
      await user.click(btn);

      // 로딩 중 — 버튼이 disabled 되어야 한다
      expect(btn).toBeDisabled();

      // 완료
      resolveReApply();
      await waitFor(() => {
        expect(btn).not.toBeDisabled();
      });
    });

    it('로딩 중이면 reApplying 텍스트를 표시한다', async () => {
      let resolveReApply!: () => void;
      const onReApply = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveReApply = resolve;
          }),
      );
      const user = userEvent.setup();

      render(<ReApplyButton onReApply={onReApply} />);
      await user.click(screen.getByRole('button'));

      expect(screen.getByText('reApplying')).toBeInTheDocument();

      resolveReApply();
      await waitFor(() => {
        expect(screen.queryByText('reApplying')).not.toBeInTheDocument();
      });
    });

    it('로딩 중에 재클릭해도 onReApply가 중복 호출되지 않는다', async () => {
      let resolveReApply!: () => void;
      const onReApply = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveReApply = resolve;
          }),
      );
      const user = userEvent.setup();

      render(<ReApplyButton onReApply={onReApply} />);
      await user.click(screen.getByRole('button'));
      // 두 번째 클릭 시도 (버튼이 disabled이므로 무시됨)
      await user.click(screen.getByRole('button'));

      expect(onReApply).toHaveBeenCalledTimes(1);

      resolveReApply();
    });
  });

  describe('disabled prop', () => {
    it('disabled=true이면 버튼이 비활성화된다', () => {
      render(<ReApplyButton onReApply={vi.fn()} disabled />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('disabled=true이면 클릭해도 onReApply가 호출되지 않는다', async () => {
      const onReApply = vi.fn();
      const user = userEvent.setup();

      render(<ReApplyButton onReApply={onReApply} disabled />);
      await user.click(screen.getByRole('button'));

      expect(onReApply).not.toHaveBeenCalled();
    });
  });
});
