/**
 * DeactivateConfirmDialog 컴포넌트 단위 테스트
 *
 * 유저 관점 검증 항목:
 * - isOpen=false 이면 아무것도 렌더링하지 않는다
 * - isOpen=true 이면 다이얼로그와 discordUserId가 표시된다
 * - 확인 버튼 클릭 시 onConfirm이 호출된다
 * - 취소 버튼 클릭 시 onCancel이 호출된다
 * - isSubmitting=true 이면 확인/취소 버튼이 비활성화된다
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import DeactivateConfirmDialog from '../components/DeactivateConfirmDialog';

describe('DeactivateConfirmDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();
  const TEST_DISCORD_ID = '555555555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderDialog(props: { isOpen?: boolean; isSubmitting?: boolean } = {}) {
    const { isOpen = true, isSubmitting = false } = props;
    return render(
      <DeactivateConfirmDialog
        discordUserId={TEST_DISCORD_ID}
        isOpen={isOpen}
        isSubmitting={isSubmitting}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />,
    );
  }

  it('isOpen=false 이면 아무것도 렌더링하지 않는다', () => {
    const { container } = renderDialog({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('isOpen=true 이면 다이얼로그 타이틀과 discordUserId가 표시된다', () => {
    renderDialog({ isOpen: true });

    expect(screen.getByText('admins.deactivate.confirmTitle')).toBeInTheDocument();
    expect(screen.getByText(TEST_DISCORD_ID)).toBeInTheDocument();
  });

  it('확인 버튼 클릭 시 onConfirm이 호출된다', async () => {
    const user = userEvent.setup();
    renderDialog();

    // 다이얼로그 내부의 "action" 버튼 (두 번째 button — 확인)
    const buttons = screen.getAllByRole('button');
    const confirmBtn = buttons.find((b) => b.textContent === 'admins.deactivate.action')!;
    await user.click(confirmBtn);

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it('취소 버튼 클릭 시 onCancel이 호출된다', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText('admins.deactivate.cancel'));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('isSubmitting=true 이면 확인/취소 버튼이 비활성화된다', () => {
    renderDialog({ isSubmitting: true });

    // isSubmitting=true 이면 확인 버튼이 'loading' 텍스트로 표시됨
    expect(screen.getByText('loading')).toBeDisabled();
    expect(screen.getByText('admins.deactivate.cancel')).toBeDisabled();
  });
});
