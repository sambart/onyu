/**
 * useUnsavedChangesGuard 테스트
 *
 * 검증 범위:
 * - isDirty를 context에 동기화한다 (context 소비자가 갱신된 값을 본다)
 * - isDirty=true 시 beforeunload가 등록된다 (context를 통해)
 * - 언마운트 시 dirty를 false로 초기화한다
 * - confirmDiscardIfDirty()는 context의 confirmLeave와 동일하게 동작한다
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { UnsavedChangesProvider, useUnsavedChangesContext } from '../UnsavedChangesContext';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function DirtyDisplay() {
  const { isDirty } = useUnsavedChangesContext();
  return <span data-testid="context-dirty">{String(isDirty)}</span>;
}

function GuardedPage({ isDirty }: { isDirty: boolean }) {
  const { confirmDiscardIfDirty } = useUnsavedChangesGuard(isDirty);
  return (
    <button type="button" onClick={() => confirmDiscardIfDirty()}>
      switch-tab
    </button>
  );
}

function Harness({ initialDirty, mounted }: { initialDirty: boolean; mounted: boolean }) {
  const [isDirty] = useState(initialDirty);
  return (
    <UnsavedChangesProvider>
      <DirtyDisplay />
      {mounted && <GuardedPage isDirty={isDirty} />}
    </UnsavedChangesProvider>
  );
}

describe('useUnsavedChangesGuard', () => {
  it('isDirty=true로 마운트되면 context의 isDirty가 true로 동기화된다', () => {
    render(<Harness initialDirty mounted />);

    expect(screen.getByTestId('context-dirty')).toHaveTextContent('true');
  });

  it('isDirty=false로 마운트되면 context의 isDirty가 false로 유지된다', () => {
    render(<Harness initialDirty={false} mounted />);

    expect(screen.getByTestId('context-dirty')).toHaveTextContent('false');
  });

  it('isDirty=true일 때 beforeunload 리스너가 등록된다', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    render(<Harness initialDirty mounted />);

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
  });

  it('언마운트 시 dirty가 false로 초기화된다', () => {
    const { rerender } = render(<Harness initialDirty mounted />);

    expect(screen.getByTestId('context-dirty')).toHaveTextContent('true');

    // GuardedPage 언마운트 (다른 설정 페이지로 이동하는 상황을 시뮬레이션)
    rerender(<Harness initialDirty mounted={false} />);

    expect(screen.getByTestId('context-dirty')).toHaveTextContent('false');
  });

  it('confirmDiscardIfDirty()는 dirty가 아니면 window.confirm 없이 true를 반환한다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<Harness initialDirty={false} mounted />);

    await user.click(screen.getByText('switch-tab'));

    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('confirmDiscardIfDirty()는 dirty이면 window.confirm을 호출한다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    render(<Harness initialDirty mounted />);

    await user.click(screen.getByText('switch-tab'));

    expect(confirmSpy).toHaveBeenCalledWith('confirmLeave');

    confirmSpy.mockRestore();
  });
});
