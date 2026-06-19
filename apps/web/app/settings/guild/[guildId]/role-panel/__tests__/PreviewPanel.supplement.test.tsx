/**
 * PreviewPanel 보강 테스트
 *
 * 누락 커버 목표 (QA A-5 P2):
 *  - 버튼이 5개를 초과하면 행 단위로 분할되어 렌더된다 (MAX_BUTTONS_PER_ROW=5 검증)
 *  - 버튼이 0개이면 버튼 영역 자체가 표시되지 않는다
 *  - SECONDARY / SUCCESS 스타일 클래스도 적용된다
 */

import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PreviewPanel } from '../components/PreviewPanel';
import type { PanelForm } from '../types';
import { MAX_BUTTONS_PER_ROW } from '../types';

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

const makeButton = (label: string, style: RolePanelButtonStyle) => ({
  label,
  emoji: '',
  roleId: 'r1',
  roleName: '역할',
  mode: RolePanelButtonMode.GRANT,
  style,
});

describe('PreviewPanel 보강 — 버튼 행 분할 (A-5 P2)', () => {
  it(`버튼이 ${MAX_BUTTONS_PER_ROW + 1}개이면 두 행으로 분할된다`, () => {
    const buttons = Array.from({ length: MAX_BUTTONS_PER_ROW + 1 }, (_, i) =>
      makeButton(`버튼${i + 1}`, RolePanelButtonStyle.PRIMARY),
    );
    const { container } = render(<PreviewPanel panel={{ ...BASE_PANEL, buttons }} />);

    // flex row div 개수 = ceil((N) / MAX_BUTTONS_PER_ROW)
    const rows = container.querySelectorAll('.space-y-1\\.5 > .flex');
    expect(rows.length).toBe(2);
  });

  it(`버튼이 ${MAX_BUTTONS_PER_ROW}개이면 단일 행으로 표시된다`, () => {
    const buttons = Array.from({ length: MAX_BUTTONS_PER_ROW }, (_, i) =>
      makeButton(`버튼${i + 1}`, RolePanelButtonStyle.PRIMARY),
    );
    const { container } = render(<PreviewPanel panel={{ ...BASE_PANEL, buttons }} />);

    const rows = container.querySelectorAll('.space-y-1\\.5 > .flex');
    expect(rows.length).toBe(1);
  });

  it(`첫 번째 행에는 버튼이 최대 ${MAX_BUTTONS_PER_ROW}개 표시된다`, () => {
    const buttons = Array.from({ length: MAX_BUTTONS_PER_ROW + 2 }, (_, i) =>
      makeButton(`행분할버튼${i + 1}`, RolePanelButtonStyle.PRIMARY),
    );
    const { container } = render(<PreviewPanel panel={{ ...BASE_PANEL, buttons }} />);

    const rows = container.querySelectorAll('.space-y-1\\.5 > .flex');
    expect(rows[0]?.children.length).toBe(MAX_BUTTONS_PER_ROW);
    expect(rows[1]?.children.length).toBe(2);
  });

  it('버튼이 0개이면 버튼 행 영역이 표시되지 않는다', () => {
    const { container } = render(<PreviewPanel panel={BASE_PANEL} />);

    const rowContainer = container.querySelector('.space-y-1\\.5');
    expect(rowContainer).toBeNull();
  });

  it('SECONDARY 버튼에 bg-gray-500 스타일 클래스가 적용된다', () => {
    const panel: PanelForm = {
      ...BASE_PANEL,
      buttons: [makeButton('회색', RolePanelButtonStyle.SECONDARY)],
    };
    const { container } = render(<PreviewPanel panel={panel} />);

    const btn = container.querySelector('.bg-gray-500');
    expect(btn).not.toBeNull();
  });

  it('SUCCESS 버튼에 bg-green-600 스타일 클래스가 적용된다', () => {
    const panel: PanelForm = {
      ...BASE_PANEL,
      buttons: [makeButton('초록', RolePanelButtonStyle.SUCCESS)],
    };
    const { container } = render(<PreviewPanel panel={panel} />);

    const btn = container.querySelector('.bg-green-600');
    expect(btn).not.toBeNull();
  });
});
