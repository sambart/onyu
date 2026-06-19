import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AssignableRole } from '../../../../../lib/role-panel-api';
import { ButtonEditModal } from '../components/ButtonEditModal';
import type { ButtonForm } from '../types';
import { MAX_LABEL_LEN } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// GuildEmojiPicker: 이모지 없으면 null 반환 — 별도 모킹 불필요
vi.mock('../../../../../components/GuildEmojiPicker', () => ({
  default: () => null,
}));

const ROLES: AssignableRole[] = [
  { id: 'r1', name: '게이머', color: 0, position: 1, assignable: true, disabledReason: null },
  { id: 'r2', name: '스태프', color: 0, position: 2, assignable: true, disabledReason: null },
];

const SAMPLE_BUTTON: ButtonForm = {
  label: '기존 라벨',
  emoji: '🎮',
  roleId: 'r1',
  roleName: '게이머',
  mode: RolePanelButtonMode.TOGGLE,
  style: RolePanelButtonStyle.SECONDARY,
};

describe('ButtonEditModal', () => {
  describe('isOpen 상태', () => {
    it('isOpen=false이면 모달을 렌더링하지 않는다', () => {
      render(
        <ButtonEditModal
          isOpen={false}
          button={null}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.queryByText('rolePanel.addButton')).not.toBeInTheDocument();
    });

    it('isOpen=true이면 모달을 렌더링한다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('rolePanel.addButton')).toBeInTheDocument();
    });
  });

  describe('신규 버튼 추가', () => {
    it('button=null이면 "버튼 추가" 제목을 표시한다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('rolePanel.addButton')).toBeInTheDocument();
    });

    it('라벨 입력 후 저장하면 onSave가 입력 값을 포함한 ButtonForm으로 호출된다', async () => {
      const user = userEvent.setup();
      const handleSave = vi.fn();

      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          roles={ROLES}
          emojis={[]}
          onSave={handleSave}
          onClose={vi.fn()}
        />,
      );

      const labelInput = screen.getByPlaceholderText('rolePanel.buttonLabelPlaceholder');
      await user.type(labelInput, '신규버튼');

      await user.click(screen.getByText('rolePanel.modalSave'));

      expect(handleSave).toHaveBeenCalledWith(expect.objectContaining({ label: '신규버튼' }));
    });
  });

  describe('기존 버튼 편집', () => {
    it('button이 있으면 "버튼 수정" 제목을 표시한다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={SAMPLE_BUTTON}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('rolePanel.editButton')).toBeInTheDocument();
    });

    it('기존 버튼의 라벨이 입력 필드에 미리 채워진다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={SAMPLE_BUTTON}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const labelInput = screen.getByPlaceholderText(
        'rolePanel.buttonLabelPlaceholder',
      ) as HTMLInputElement;
      expect(labelInput.value).toBe('기존 라벨');
    });
  });

  describe('라벨 maxLength 가드', () => {
    it(`라벨 input에 maxLength=${MAX_LABEL_LEN}이 적용된다`, () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const labelInput = screen.getByPlaceholderText(
        'rolePanel.buttonLabelPlaceholder',
      ) as HTMLInputElement;
      expect(labelInput.maxLength).toBe(MAX_LABEL_LEN);
    });
  });

  describe('닫기', () => {
    it('닫기(X) 버튼 클릭 시 onClose를 호출한다', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          roles={ROLES}
          emojis={[]}
          onSave={vi.fn()}
          onClose={handleClose}
        />,
      );

      await user.click(screen.getByLabelText('rolePanel.modalCancel'));

      expect(handleClose).toHaveBeenCalled();
    });
  });
});
