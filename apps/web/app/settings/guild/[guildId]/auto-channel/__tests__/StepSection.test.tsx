import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepSection } from '../components/StepSection';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('StepSection', () => {
  it('stepNumber, title, children를 렌더링한다', () => {
    render(
      <StepSection stepNumber={1} title="트리거 설정">
        <p>child content</p>
      </StepSection>,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('트리거 설정')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('hasConnector가 false이면 화살표 아이콘을 렌더링하지 않는다', () => {
    const { container } = render(
      <StepSection stepNumber={2} title="채널 설정">
        <span>child</span>
      </StepSection>,
    );

    // ChevronDown 아이콘을 감싸는 connector div가 없어야 한다
    const connectorDiv = container.querySelector('.flex.justify-center.py-2');
    expect(connectorDiv).toBeNull();
  });

  it('hasConnector가 true이면 커넥터를 렌더링한다', () => {
    const { container } = render(
      <StepSection stepNumber={1} title="트리거 설정" hasConnector>
        <span>child</span>
      </StepSection>,
    );

    const connectorDiv = container.querySelector('.flex.justify-center.py-2');
    expect(connectorDiv).not.toBeNull();
  });
});
