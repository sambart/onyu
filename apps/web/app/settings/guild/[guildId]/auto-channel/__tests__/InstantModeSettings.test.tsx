import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import { InstantModeSettings } from '../components/InstantModeSettings';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockCategories: DiscordChannel[] = [
  { id: 'cat-1', name: '게임방', type: 4 },
  { id: 'cat-2', name: '공부방', type: 4 },
];

describe('InstantModeSettings', () => {
  it('카테고리 select와 템플릿 input이 렌더링된다', () => {
    render(
      <InstantModeSettings
        instantCategoryId=""
        instantNameTemplate=""
        categories={mockCategories}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/autoChannel\.instantCategory/)).toBeInTheDocument();
    expect(screen.getByLabelText(/autoChannel\.instantNameTemplate/)).toBeInTheDocument();
  });

  it('카테고리 목록이 select에 옵션으로 표시된다', () => {
    render(
      <InstantModeSettings
        instantCategoryId=""
        instantNameTemplate=""
        categories={mockCategories}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: '게임방' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '공부방' })).toBeInTheDocument();
  });

  it('카테고리를 선택하면 onChange({ instantCategoryId })를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <InstantModeSettings
        instantCategoryId=""
        instantNameTemplate=""
        categories={mockCategories}
        onChange={handleChange}
      />,
    );

    const select = screen.getByLabelText(/autoChannel\.instantCategory/);
    await user.selectOptions(select, 'cat-1');

    expect(handleChange).toHaveBeenCalledWith({ instantCategoryId: 'cat-1' });
  });

  it('템플릿 input 값을 변경하면 onChange({ instantNameTemplate })를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <InstantModeSettings
        instantCategoryId=""
        instantNameTemplate=""
        categories={mockCategories}
        onChange={handleChange}
      />,
    );

    const input = screen.getByLabelText(/autoChannel\.instantNameTemplate/);
    await user.type(input, 'a');

    // 한 글자 입력 시 해당 문자열이 onChange에 전달된다
    expect(handleChange).toHaveBeenCalledWith({ instantNameTemplate: 'a' });
  });

  it('현재 선택된 카테고리 값이 select에 반영된다', () => {
    render(
      <InstantModeSettings
        instantCategoryId="cat-2"
        instantNameTemplate=""
        categories={mockCategories}
        onChange={vi.fn()}
      />,
    );

    const select = screen.getByLabelText(/autoChannel\.instantCategory/) as HTMLSelectElement;
    expect(select.value).toBe('cat-2');
  });

  it('현재 템플릿 값이 input에 반영된다', () => {
    render(
      <InstantModeSettings
        instantCategoryId=""
        instantNameTemplate="{username}의 채널"
        categories={mockCategories}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/autoChannel\.instantNameTemplate/) as HTMLInputElement;
    expect(input.value).toBe('{username}의 채널');
  });
});
