import { RolePanelButtonStyle } from '@onyu/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StyleSelector } from '../components/StyleSelector';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('StyleSelector', () => {
  it('4가지 스타일 버튼을 렌더링한다', () => {
    render(<StyleSelector value={RolePanelButtonStyle.PRIMARY} onChange={vi.fn()} />);

    expect(screen.getByText('rolePanel.stylePrimary')).toBeInTheDocument();
    expect(screen.getByText('rolePanel.styleSecondary')).toBeInTheDocument();
    expect(screen.getByText('rolePanel.styleSuccess')).toBeInTheDocument();
    expect(screen.getByText('rolePanel.styleDanger')).toBeInTheDocument();
  });

  it('각 스타일 버튼에 색상 칩(colored dot)이 표시된다', () => {
    render(<StyleSelector value={RolePanelButtonStyle.PRIMARY} onChange={vi.fn()} />);

    // aria-hidden 색상 칩 스팬 확인
    const colorDots = document.querySelectorAll('[aria-hidden="true"]');
    expect(colorDots.length).toBeGreaterThanOrEqual(4);
  });

  it('PRIMARY 스타일을 클릭하면 onChange(PRIMARY)를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<StyleSelector value={RolePanelButtonStyle.SECONDARY} onChange={handleChange} />);
    const primaryBtn = screen.getByText('rolePanel.stylePrimary').closest('button');
    expect(primaryBtn).not.toBeNull();
    await user.click(primaryBtn as HTMLButtonElement);

    expect(handleChange).toHaveBeenCalledWith(RolePanelButtonStyle.PRIMARY);
  });

  it('DANGER 스타일을 클릭하면 onChange(DANGER)를 호출한다', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<StyleSelector value={RolePanelButtonStyle.PRIMARY} onChange={handleChange} />);
    const dangerBtn = screen.getByText('rolePanel.styleDanger').closest('button');
    expect(dangerBtn).not.toBeNull();
    await user.click(dangerBtn as HTMLButtonElement);

    expect(handleChange).toHaveBeenCalledWith(RolePanelButtonStyle.DANGER);
  });

  it('현재 선택된 스타일 버튼에 활성 스타일(border-indigo-600)이 적용된다', () => {
    render(<StyleSelector value={RolePanelButtonStyle.SUCCESS} onChange={vi.fn()} />);

    const successButton = screen.getByText('rolePanel.styleSuccess').closest('button');
    const primaryButton = screen.getByText('rolePanel.stylePrimary').closest('button');
    expect(successButton).not.toBeNull();
    expect(primaryButton).not.toBeNull();

    expect(successButton).toHaveClass('border-indigo-600');
    expect(primaryButton).not.toHaveClass('border-indigo-600');
  });
});
