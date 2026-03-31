import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import { ButtonEditModal } from '../components/ButtonEditModal';
import type { ButtonForm } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}(${JSON.stringify(params)})`;
    }
    return key;
  },
}));

// GuildEmojiPicker는 빈 emojis 배열이면 null을 반환하므로 별도 모킹 불필요

const mockCategories: DiscordChannel[] = [
  { id: 'cat-1', name: '게임방', type: 4 },
  { id: 'cat-2', name: '공부방', type: 4 },
];

const mockButton: ButtonForm = {
  label: '오버워치',
  emoji: '🎮',
  targetCategoryId: 'cat-1',
  channelNameTemplate: '{username}의 오버워치',
  subOptions: [],
};

describe('ButtonEditModal', () => {
  describe('열림/닫힘 상태', () => {
    it('isOpen이 false이면 모달을 렌더링하지 않는다', () => {
      render(
        <ButtonEditModal
          isOpen={false}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.queryByText('autoChannel.addButton')).toBeNull();
    });

    it('isOpen이 true이면 모달을 렌더링한다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('autoChannel.addButton')).toBeInTheDocument();
    });
  });

  describe('신규 버튼 추가 모드 (button=null)', () => {
    it('폼 필드(라벨, 이모지, 카테고리, 채널명 템플릿)가 렌더링된다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      // 라벨 필드 input 존재 확인 (placeholder로 특정)
      expect(screen.getByPlaceholderText('오버워치')).toBeInTheDocument();
      expect(screen.getByText('autoChannel.buttonEmoji')).toBeInTheDocument();
      // 카테고리 select에 기본 옵션 존재로 확인
      expect(screen.getByRole('option', { name: 'autoChannel.categorySelect' })).toBeInTheDocument();
      expect(screen.getByText('autoChannel.channelNameTemplate')).toBeInTheDocument();
    });

    it('카테고리 목록이 select에 표시된다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole('option', { name: '게임방' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '공부방' })).toBeInTheDocument();
    });

    it('라벨을 입력하고 저장하면 변경된 값이 onSave에 전달된다', async () => {
      const user = userEvent.setup();
      const handleSave = vi.fn();

      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={handleSave}
          onClose={vi.fn()}
        />,
      );

      // label input을 placeholder로 특정
      const labelInput = screen.getByPlaceholderText('오버워치');
      await user.type(labelInput, '롤');

      await user.click(screen.getByText('autoChannel.modalSave'));

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({ label: '롤' }),
      );
    });
  });

  describe('기존 버튼 수정 모드 (button != null)', () => {
    it('기존 버튼 데이터가 폼에 채워진다', () => {
      render(
        <ButtonEditModal
          isOpen={true}
          button={mockButton}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const labelInput = screen.getByPlaceholderText('오버워치') as HTMLInputElement;
      expect(labelInput.value).toBe('오버워치');

      const emojiInput = screen.getByPlaceholderText('🎮') as HTMLInputElement;
      expect(emojiInput.value).toBe('🎮');
    });

    it('값을 변경하고 저장하면 변경된 값이 onSave에 전달된다', async () => {
      const user = userEvent.setup();
      const handleSave = vi.fn();

      render(
        <ButtonEditModal
          isOpen={true}
          button={mockButton}
          categories={mockCategories}
          emojis={[]}
          onSave={handleSave}
          onClose={vi.fn()}
        />,
      );

      const labelInput = screen.getByPlaceholderText('오버워치') as HTMLInputElement;
      await user.clear(labelInput);
      await user.type(labelInput, '롤');

      await user.click(screen.getByText('autoChannel.modalSave'));

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({ label: '롤' }),
      );
    });
  });

  describe('닫기 동작', () => {
    it('헤더 X 버튼을 클릭하면 onClose를 호출한다', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={handleClose}
        />,
      );

      // 헤더의 X 아이콘 버튼 — 첫 번째 autoChannel.modalCancel aria-label 버튼
      const closeButtons = screen.getAllByRole('button', { name: 'autoChannel.modalCancel' });
      await user.click(closeButtons[0]);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('취소 버튼을 클릭하면 onClose를 호출한다', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={handleClose}
        />,
      );

      // 푸터의 취소 버튼 (텍스트로 선택)
      const cancelButton = screen.getAllByText('autoChannel.modalCancel')[0];
      await user.click(cancelButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('하위 선택지', () => {
    it('+ 추가 버튼을 클릭하면 하위 선택지 행이 추가된다', async () => {
      const user = userEvent.setup();

      render(
        <ButtonEditModal
          isOpen={true}
          button={null}
          categories={mockCategories}
          emojis={[]}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      // 초기 상태: 하위 선택지 0개
      expect(
        screen.getByText('autoChannel.subOptions({"count":0})'),
      ).toBeInTheDocument();

      await user.click(screen.getByText('common.tabAdd'));

      expect(
        screen.getByText('autoChannel.subOptions({"count":1})'),
      ).toBeInTheDocument();
    });
  });
});
