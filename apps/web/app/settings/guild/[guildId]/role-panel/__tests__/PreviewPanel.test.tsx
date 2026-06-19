import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PreviewPanel } from '../components/PreviewPanel';
import type { PanelForm } from '../types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const BASE_PANEL: PanelForm = {
  name: '테스트 패널',
  channelId: 'ch-1',
  embedTitle: '',
  embedDescription: '',
  embedColor: '#5865F2',
  published: false,
  messageId: null,
  buttons: [],
};

describe('PreviewPanel', () => {
  it('embedTitle이 있으면 표시한다', () => {
    const panel: PanelForm = { ...BASE_PANEL, embedTitle: '역할을 선택하세요' };
    render(<PreviewPanel panel={panel} />);

    expect(screen.getByText('역할을 선택하세요')).toBeInTheDocument();
  });

  it('embedDescription이 있으면 표시한다', () => {
    const panel: PanelForm = {
      ...BASE_PANEL,
      embedDescription: '원하는 역할을 선택하세요.',
    };
    render(<PreviewPanel panel={panel} />);

    expect(screen.getByText('원하는 역할을 선택하세요.')).toBeInTheDocument();
  });

  it('embedDescription이 없으면 noDescription 폴백 텍스트를 표시한다', () => {
    render(<PreviewPanel panel={BASE_PANEL} />);

    expect(screen.getByText('common.noDescription')).toBeInTheDocument();
  });

  it('embedColor가 border-left 스타일로 적용된다', () => {
    const panel: PanelForm = { ...BASE_PANEL, embedColor: '#FF0000' };
    const { container } = render(<PreviewPanel panel={panel} />);

    const embedBox = container.querySelector('[style*="border-left"]');
    const style = embedBox?.getAttribute('style') ?? '';
    // jsdom은 #RRGGBB를 rgb()로 변환할 수 있으므로 두 형태 모두 허용
    const hasColor =
      style.includes('#FF0000') ||
      style.includes('rgb(255, 0, 0)') ||
      style.includes('rgb(255,0,0)');
    expect(hasColor).toBe(true);
  });

  it('버튼 라벨과 이모지가 표시된다', () => {
    const panel: PanelForm = {
      ...BASE_PANEL,
      buttons: [
        {
          label: '게이머',
          emoji: '🎮',
          roleId: 'r1',
          roleName: '게임 역할',
          mode: RolePanelButtonMode.GRANT,
          style: RolePanelButtonStyle.PRIMARY,
        },
      ],
    };
    render(<PreviewPanel panel={panel} />);

    expect(screen.getByText(/게이머/)).toBeInTheDocument();
    expect(screen.getByText(/🎮/)).toBeInTheDocument();
  });

  it('PRIMARY 버튼에 bg-indigo-500 스타일 클래스가 적용된다', () => {
    const panel: PanelForm = {
      ...BASE_PANEL,
      buttons: [
        {
          label: '기본',
          emoji: '',
          roleId: 'r1',
          roleName: '역할',
          mode: RolePanelButtonMode.GRANT,
          style: RolePanelButtonStyle.PRIMARY,
        },
      ],
    };
    const { container } = render(<PreviewPanel panel={panel} />);

    const btnSpan = container.querySelector('.bg-indigo-500');
    expect(btnSpan).not.toBeNull();
  });

  it('DANGER 버튼에 bg-red-500 스타일 클래스가 적용된다', () => {
    const panel: PanelForm = {
      ...BASE_PANEL,
      buttons: [
        {
          label: '위험',
          emoji: '',
          roleId: 'r2',
          roleName: '역할',
          mode: RolePanelButtonMode.TOGGLE,
          style: RolePanelButtonStyle.DANGER,
        },
      ],
    };
    const { container } = render(<PreviewPanel panel={panel} />);

    const btnSpan = container.querySelector('.bg-red-500.text-white');
    expect(btnSpan).not.toBeNull();
  });
});
