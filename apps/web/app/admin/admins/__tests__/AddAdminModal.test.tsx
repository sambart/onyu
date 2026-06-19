/**
 * AddAdminModal 컴포넌트 단위 테스트
 *
 * 유저 관점 검증 항목:
 * - isOpen=false 이면 아무것도 렌더링하지 않는다
 * - isOpen=true 이면 모달이 렌더링된다
 * - Discord ID 빈 값 제출 시 검증 에러 메시지가 표시된다
 * - 공백만 입력 후 제출 시 검증 에러 메시지가 표시된다
 * - 정상 입력 후 제출 시 onSubmit(trimmed id, role)이 호출된다
 * - 취소 버튼 클릭 시 onCancel이 호출되고 입력이 초기화된다
 * - isSubmitting=true 이면 입력/버튼이 비활성화된다
 * - Discord ID 입력 시 검증 에러가 자동 해소된다
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import AddAdminModal from '../components/AddAdminModal';

describe('AddAdminModal', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(
    props: {
      isOpen?: boolean;
      isSubmitting?: boolean;
    } = {},
  ) {
    const { isOpen = true, isSubmitting = false } = props;
    return render(
      <AddAdminModal
        isOpen={isOpen}
        isSubmitting={isSubmitting}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />,
    );
  }

  it('isOpen=false 이면 아무것도 렌더링하지 않는다', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('isOpen=true 이면 모달 타이틀이 렌더링된다', () => {
    renderModal({ isOpen: true });
    expect(screen.getByText('admins.add.title')).toBeInTheDocument();
  });

  it('Discord ID 빈 값으로 제출 시 검증 에러가 표시된다', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('admins.add.submit'));

    expect(screen.getByText('admins.add.discordIdRequired')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('공백만 입력 후 제출 시 검증 에러가 표시된다', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText('000000000000000000'), '   ');
    await user.click(screen.getByText('admins.add.submit'));

    expect(screen.getByText('admins.add.discordIdRequired')).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('정상 입력 후 제출 시 trimmed ID와 선택한 역할로 onSubmit이 호출된다', async () => {
    const user = userEvent.setup();
    renderModal();

    const input = screen.getByPlaceholderText('000000000000000000');
    await user.type(input, '  123456789012345678  ');

    await user.click(screen.getByText('admins.add.submit'));

    expect(mockOnSubmit).toHaveBeenCalledWith('123456789012345678', 'bot_operator');
  });

  it('역할을 super_admin 으로 변경 후 제출 시 super_admin 역할로 onSubmit이 호출된다', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByPlaceholderText('000000000000000000'), '123456789012345678');
    await user.selectOptions(screen.getByRole('combobox'), 'super_admin');
    await user.click(screen.getByText('admins.add.submit'));

    expect(mockOnSubmit).toHaveBeenCalledWith('123456789012345678', 'super_admin');
  });

  it('취소 버튼 클릭 시 onCancel이 호출된다', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText('admins.add.cancel'));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('isSubmitting=true 이면 입력 필드가 비활성화된다', () => {
    renderModal({ isSubmitting: true });

    expect(screen.getByPlaceholderText('000000000000000000')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('isSubmitting=true 이면 제출/취소 버튼이 비활성화된다', () => {
    renderModal({ isSubmitting: true });

    // 제출 버튼은 loading key로 대체됨
    expect(screen.getByText('loading')).toBeDisabled();
    expect(screen.getByText('admins.add.cancel')).toBeDisabled();
  });

  it('검증 에러 노출 후 Discord ID 입력 시 에러가 자동 해소된다', async () => {
    const user = userEvent.setup();
    renderModal();

    // 빈 값 제출 → 에러 노출
    await user.click(screen.getByText('admins.add.submit'));
    expect(screen.getByText('admins.add.discordIdRequired')).toBeInTheDocument();

    // 입력 시작 → 에러 해소
    await user.type(screen.getByPlaceholderText('000000000000000000'), '1');
    expect(screen.queryByText('admins.add.discordIdRequired')).not.toBeInTheDocument();
  });
});
