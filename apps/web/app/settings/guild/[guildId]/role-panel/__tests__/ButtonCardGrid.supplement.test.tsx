/**
 * ButtonCardGrid 보강 테스트
 *
 * 기존 테스트가 커버하지 않는 경계 케이스:
 *  - 첫 번째 버튼의 위로 이동 버튼이 disabled 상태이다
 *  - 마지막 버튼의 아래로 이동 버튼이 disabled 상태이다
 *  - 버튼 클릭 시 onEdit/onDelete가 올바른 index로 호출된다
 *  - 버튼 1개일 때 위·아래 화살표 모두 disabled
 */

import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ButtonCardGrid } from '../components/ButtonCardGrid';
import type { ButtonForm } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

const makeButton = (label: string, roleId: string): ButtonForm => ({
  label,
  emoji: '',
  roleId,
  roleName: `역할${roleId}`,
  mode: RolePanelButtonMode.GRANT,
  style: RolePanelButtonStyle.PRIMARY,
});

describe('ButtonCardGrid 보강 — 순서 화살표 경계', () => {
  it('버튼이 1개이면 위로 이동 버튼과 아래로 이동 버튼이 모두 disabled 상태이다', () => {
    const { container } = render(
      <ButtonCardGrid
        buttons={[makeButton('버튼A', 'r1')]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const upBtn = container.querySelector('[aria-label="위로 이동"]') as HTMLButtonElement;
    const downBtn = container.querySelector('[aria-label="아래로 이동"]') as HTMLButtonElement;

    expect(upBtn).not.toBeNull();
    expect(downBtn).not.toBeNull();
    expect(upBtn).toBeDisabled();
    expect(downBtn).toBeDisabled();
  });

  it('첫 번째 버튼의 위로 이동 버튼은 disabled 상태이다', () => {
    const buttons = [makeButton('첫번째', 'r1'), makeButton('두번째', 'r2')];
    const { container } = render(
      <ButtonCardGrid
        buttons={buttons}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const upButtons = container.querySelectorAll('[aria-label="위로 이동"]');
    // 첫 번째 카드의 위로 이동 버튼 (index 0)
    expect(upButtons[0]).toBeDisabled();
    // 두 번째 카드의 위로 이동 버튼 (index 1)은 활성
    expect(upButtons[1]).not.toBeDisabled();
  });

  it('마지막 버튼의 아래로 이동 버튼은 disabled 상태이다', () => {
    const buttons = [makeButton('첫번째', 'r1'), makeButton('두번째', 'r2')];
    const { container } = render(
      <ButtonCardGrid
        buttons={buttons}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const downButtons = container.querySelectorAll('[aria-label="아래로 이동"]');
    // 첫 번째 카드의 아래로 이동 (index 0)은 활성
    expect(downButtons[0]).not.toBeDisabled();
    // 마지막 카드의 아래로 이동 (index 1)은 disabled
    expect(downButtons[1]).toBeDisabled();
  });

  it('편집 버튼 클릭 시 onEdit이 해당 index로 호출된다', async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    const buttons = [makeButton('버튼A', 'r1'), makeButton('버튼B', 'r2')];

    const { container } = render(
      <ButtonCardGrid
        buttons={buttons}
        onEdit={handleEdit}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    // aria-label="rolePanel.editButton" 을 가진 버튼들
    const editButtons = container.querySelectorAll('[aria-label="rolePanel.editButton"]');
    await user.click(editButtons[1] as HTMLButtonElement);

    expect(handleEdit).toHaveBeenCalledWith(1);
  });

  it('삭제 버튼 클릭 시 onDelete가 해당 index로 호출된다', async () => {
    const user = userEvent.setup();
    const handleDelete = vi.fn();
    const buttons = [makeButton('버튼A', 'r1'), makeButton('버튼B', 'r2')];

    const { container } = render(
      <ButtonCardGrid
        buttons={buttons}
        onEdit={vi.fn()}
        onDelete={handleDelete}
        onMove={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const deleteButtons = container.querySelectorAll('[aria-label="common.deleteConfig"]');
    await user.click(deleteButtons[0] as HTMLButtonElement);

    expect(handleDelete).toHaveBeenCalledWith(0);
  });
});
