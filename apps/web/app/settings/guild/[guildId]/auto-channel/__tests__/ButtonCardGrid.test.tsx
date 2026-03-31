import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import { ButtonCardGrid } from '../components/ButtonCardGrid';
import type { ButtonForm } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}(${JSON.stringify(params)})`;
    }
    return key;
  },
}));

const mockCategories: DiscordChannel[] = [
  { id: 'cat-1', name: '게임방', type: 4 },
];

const makeButton = (override: Partial<ButtonForm> = {}): ButtonForm => ({
  label: '오버워치',
  emoji: '🎮',
  targetCategoryId: 'cat-1',
  channelNameTemplate: '',
  subOptions: [],
  ...override,
});

describe('ButtonCardGrid', () => {
  it('버튼 카드들이 렌더링된다', () => {
    const buttons = [makeButton({ label: '오버워치' }), makeButton({ label: '리그오브레전드' })];

    render(
      <ButtonCardGrid
        buttons={buttons}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByText('오버워치')).toBeInTheDocument();
    expect(screen.getByText('리그오브레전드')).toBeInTheDocument();
  });

  it('버튼이 없을 때 빈 상태 안내 메시지를 표시한다', () => {
    render(
      <ButtonCardGrid
        buttons={[]}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByText('autoChannel.noButtons')).toBeInTheDocument();
  });

  it('카드의 수정 버튼(편집 아이콘)을 클릭하면 onEdit(index)를 호출한다', async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    const buttons = [makeButton({ label: '오버워치' })];

    render(
      <ButtonCardGrid
        buttons={buttons}
        categories={mockCategories}
        onEdit={handleEdit}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    const editButton = screen.getByRole('button', { name: 'autoChannel.editButton' });
    await user.click(editButton);

    expect(handleEdit).toHaveBeenCalledWith(0);
  });

  it('카드의 삭제 버튼을 클릭하면 onDelete(index)를 호출한다', async () => {
    const user = userEvent.setup();
    const handleDelete = vi.fn();
    const buttons = [makeButton({ label: '오버워치' })];

    render(
      <ButtonCardGrid
        buttons={buttons}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={handleDelete}
        onAdd={vi.fn()}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: 'common.deleteConfig' });
    await user.click(deleteButton);

    expect(handleDelete).toHaveBeenCalledWith(0);
  });

  it('추가 카드 버튼을 클릭하면 onAdd를 호출한다', async () => {
    const user = userEvent.setup();
    const handleAdd = vi.fn();

    render(
      <ButtonCardGrid
        buttons={[]}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={handleAdd}
      />,
    );

    await user.click(screen.getByText('autoChannel.addButtonCard'));

    expect(handleAdd).toHaveBeenCalledTimes(1);
  });

  it('하위 선택지 개수를 표시한다', () => {
    const buttons = [
      makeButton({
        label: '오버워치',
        subOptions: [
          { label: '경쟁전', emoji: '', channelNameTemplate: '경쟁 {name}' },
          { label: '빠른대전', emoji: '', channelNameTemplate: '빠전 {name}' },
        ],
      }),
    ];

    render(
      <ButtonCardGrid
        buttons={buttons}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(
      screen.getByText('autoChannel.subOptionCount({"count":2})'),
    ).toBeInTheDocument();
  });

  it('대상 카테고리 이름이 카드에 표시된다', () => {
    const buttons = [makeButton({ targetCategoryId: 'cat-1' })];

    render(
      <ButtonCardGrid
        buttons={buttons}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.getByText('게임방')).toBeInTheDocument();
  });

  it('버튼 수가 MAX_BUTTONS(25)에 도달하면 추가 카드 버튼을 표시하지 않는다', () => {
    const buttons = Array.from({ length: 25 }, (_, i) =>
      makeButton({ label: `버튼 ${i + 1}` }),
    );

    render(
      <ButtonCardGrid
        buttons={buttons}
        categories={mockCategories}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.queryByText('autoChannel.addButtonCard')).toBeNull();
  });
});
