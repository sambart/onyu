import { RolePanelButtonMode } from '@onyu/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModeSelector } from '../components/ModeSelector';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ModeSelector (GRANT/TOGGLE)', () => {
  it('GRANT 카드와 TOGGLE 카드를 렌더링한다', () => {
    render(<ModeSelector value={RolePanelButtonMode.GRANT} onChange={vi.fn()} />);

    expect(screen.getByText('rolePanel.modeGrant')).toBeInTheDocument();
    expect(screen.getByText('rolePanel.modeGrantDesc')).toBeInTheDocument();
    expect(screen.getByText('rolePanel.modeToggle')).toBeInTheDocument();
    expect(screen.getByText('rolePanel.modeToggleDesc')).toBeInTheDocument();
  });

  it('GRANT 카드를 클릭하면 onChange(GRANT)를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<ModeSelector value={RolePanelButtonMode.TOGGLE} onChange={handleChange} />);
    const grantBtn = screen.getByText('rolePanel.modeGrant').closest('button');
    expect(grantBtn).not.toBeNull();
    await user.click(grantBtn as HTMLButtonElement);

    expect(handleChange).toHaveBeenCalledWith(RolePanelButtonMode.GRANT);
  });

  it('TOGGLE 카드를 클릭하면 onChange(TOGGLE)를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<ModeSelector value={RolePanelButtonMode.GRANT} onChange={handleChange} />);
    const toggleBtn = screen.getByText('rolePanel.modeToggle').closest('button');
    expect(toggleBtn).not.toBeNull();
    await user.click(toggleBtn as HTMLButtonElement);

    expect(handleChange).toHaveBeenCalledWith(RolePanelButtonMode.TOGGLE);
  });

  it('현재 선택된 모드(GRANT)의 카드에 활성 스타일이 적용된다', () => {
    render(<ModeSelector value={RolePanelButtonMode.GRANT} onChange={vi.fn()} />);

    const grantButton = screen.getByText('rolePanel.modeGrant').closest('button');
    const toggleButton = screen.getByText('rolePanel.modeToggle').closest('button');
    expect(grantButton).not.toBeNull();
    expect(toggleButton).not.toBeNull();

    expect(grantButton).toHaveClass('border-indigo-600');
    expect(grantButton).toHaveClass('bg-indigo-50');
    expect(toggleButton).not.toHaveClass('border-indigo-600');
  });

  it('현재 선택된 모드(TOGGLE)의 카드에 활성 스타일이 적용된다', () => {
    render(<ModeSelector value={RolePanelButtonMode.TOGGLE} onChange={vi.fn()} />);

    const toggleButton = screen.getByText('rolePanel.modeToggle').closest('button');
    const grantButton = screen.getByText('rolePanel.modeGrant').closest('button');
    expect(toggleButton).not.toBeNull();
    expect(grantButton).not.toBeNull();

    expect(toggleButton).toHaveClass('border-indigo-600');
    expect(toggleButton).toHaveClass('bg-indigo-50');
    expect(grantButton).not.toHaveClass('border-indigo-600');
  });
});
