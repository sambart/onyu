import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ButtonCardGrid } from '../components/ButtonCardGrid';
import type { ButtonForm } from '../types';
import { MAX_BUTTONS } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

const makeButton = (label: string, roleId: string, roleName: string): ButtonForm => ({
  label,
  emoji: '',
  roleId,
  roleName,
  mode: RolePanelButtonMode.GRANT,
  style: RolePanelButtonStyle.PRIMARY,
});

describe('ButtonCardGrid', () => {
  describe('카드 렌더링', () => {
    it('버튼 카드에 역할명과 모드 뱃지를 표시한다', () => {
      const buttons: ButtonForm[] = [makeButton('게이머', 'r1', '게임 역할')];
      render(
        <ButtonCardGrid
          buttons={buttons}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
          onAdd={vi.fn()}
        />,
      );

      expect(screen.getByText('게이머')).toBeInTheDocument();
      expect(screen.getByText('게임 역할')).toBeInTheDocument();
      expect(screen.getByText('GRANT')).toBeInTheDocument();
    });

    it('버튼이 없으면 noButtons 메시지를 표시한다', () => {
      render(
        <ButtonCardGrid
          buttons={[]}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
          onAdd={vi.fn()}
        />,
      );

      expect(screen.getByText('rolePanel.noButtons')).toBeInTheDocument();
    });
  });

  describe('25개 가드', () => {
    it('버튼이 MAX_BUTTONS개 미만이면 [추가] 버튼이 표시된다', () => {
      const buttons = Array.from({ length: MAX_BUTTONS - 1 }, (_, i) =>
        makeButton(`버튼${i}`, `r${i}`, `역할${i}`),
      );
      render(
        <ButtonCardGrid
          buttons={buttons}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
          onAdd={vi.fn()}
        />,
      );

      expect(screen.getByText('rolePanel.addButtonCard')).toBeInTheDocument();
    });

    it('버튼이 MAX_BUTTONS개에 도달하면 [추가] 버튼이 숨겨진다', () => {
      const buttons = Array.from({ length: MAX_BUTTONS }, (_, i) =>
        makeButton(`버튼${i}`, `r${i}`, `역할${i}`),
      );
      render(
        <ButtonCardGrid
          buttons={buttons}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
          onAdd={vi.fn()}
        />,
      );

      expect(screen.queryByText('rolePanel.addButtonCard')).not.toBeInTheDocument();
    });

    it('MAX_BUTTONS에 도달하면 최대 개수 안내 메시지가 표시된다', () => {
      const buttons = Array.from({ length: MAX_BUTTONS }, (_, i) =>
        makeButton(`버튼${i}`, `r${i}`, `역할${i}`),
      );
      render(
        <ButtonCardGrid
          buttons={buttons}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
          onAdd={vi.fn()}
        />,
      );

      const maxMsg = screen.getByText(`rolePanel.validationMaxButtons({"max":${MAX_BUTTONS}})`);
      expect(maxMsg).toBeInTheDocument();
    });
  });

  describe('순서 화살표', () => {
    it('onMove("up")를 올바른 index로 호출한다', async () => {
      const user = userEvent.setup();
      const handleMove = vi.fn();
      const buttons: ButtonForm[] = [
        makeButton('버튼A', 'r1', '역할A'),
        makeButton('버튼B', 'r2', '역할B'),
      ];

      const { container } = render(
        <ButtonCardGrid
          buttons={buttons}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={handleMove}
          onAdd={vi.fn()}
        />,
      );

      // 두 번째 카드의 위로 이동 버튼 (aria-label="위로 이동")
      const upButtons = container.querySelectorAll('[aria-label="위로 이동"]');
      // 두 번째 버튼의 위로 이동 (index 1)
      await user.click(upButtons[1]);

      expect(handleMove).toHaveBeenCalledWith(1, 'up');
    });

    it('onMove("down")을 올바른 index로 호출한다', async () => {
      const user = userEvent.setup();
      const handleMove = vi.fn();
      const buttons: ButtonForm[] = [
        makeButton('버튼A', 'r1', '역할A'),
        makeButton('버튼B', 'r2', '역할B'),
      ];

      const { container } = render(
        <ButtonCardGrid
          buttons={buttons}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMove={handleMove}
          onAdd={vi.fn()}
        />,
      );

      const downButtons = container.querySelectorAll('[aria-label="아래로 이동"]');
      await user.click(downButtons[0]);

      expect(handleMove).toHaveBeenCalledWith(0, 'down');
    });
  });
});
