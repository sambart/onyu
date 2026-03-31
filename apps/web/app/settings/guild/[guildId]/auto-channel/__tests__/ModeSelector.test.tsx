import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModeSelector } from '../components/ModeSelector';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ModeSelector', () => {
  it('instant 모드 카드와 select 모드 카드를 렌더링한다', () => {
    render(<ModeSelector value="select" onChange={vi.fn()} />);

    expect(screen.getByText('autoChannel.modeInstant')).toBeInTheDocument();
    expect(screen.getByText('autoChannel.modeInstantDesc')).toBeInTheDocument();
    expect(screen.getByText('autoChannel.modeSelect')).toBeInTheDocument();
    expect(screen.getByText('autoChannel.modeSelectDesc')).toBeInTheDocument();
  });

  it('instant 카드를 클릭하면 onChange("instant")를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<ModeSelector value="select" onChange={handleChange} />);
    await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);

    expect(handleChange).toHaveBeenCalledWith('instant');
  });

  it('select 카드를 클릭하면 onChange("select")를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<ModeSelector value="instant" onChange={handleChange} />);
    await user.click(screen.getByText('autoChannel.modeSelect').closest('button')!);

    expect(handleChange).toHaveBeenCalledWith('select');
  });

  it('현재 선택된 모드(instant)의 카드에 활성 스타일이 적용된다', () => {
    render(<ModeSelector value="instant" onChange={vi.fn()} />);

    const instantButton = screen.getByText('autoChannel.modeInstant').closest('button')!;
    const selectButton = screen.getByText('autoChannel.modeSelect').closest('button')!;

    expect(instantButton).toHaveClass('border-indigo-600');
    expect(instantButton).toHaveClass('bg-indigo-50');
    expect(selectButton).not.toHaveClass('border-indigo-600');
  });

  it('현재 선택된 모드(select)의 카드에 활성 스타일이 적용된다', () => {
    render(<ModeSelector value="select" onChange={vi.fn()} />);

    const selectButton = screen.getByText('autoChannel.modeSelect').closest('button')!;
    const instantButton = screen.getByText('autoChannel.modeInstant').closest('button')!;

    expect(selectButton).toHaveClass('border-indigo-600');
    expect(selectButton).toHaveClass('bg-indigo-50');
    expect(instantButton).not.toHaveClass('border-indigo-600');
  });
});
