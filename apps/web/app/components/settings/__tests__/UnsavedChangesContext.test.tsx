/**
 * UnsavedChangesContext 테스트
 *
 * 검증 범위:
 * - confirmLeave(): dirty가 아니면 window.confirm 호출 없이 true 반환
 * - confirmLeave(): dirty이면 window.confirm을 호출하고 그 결과를 그대로 반환
 * - dirty 상태에 따라 beforeunload 리스너가 등록/해제된다
 * - Provider 밖에서 useUnsavedChangesContext를 호출하면 에러를 throw한다
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnsavedChangesProvider, useUnsavedChangesContext } from '../UnsavedChangesContext';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function TestConsumer() {
  const { isDirty, setDirty, confirmLeave } = useUnsavedChangesContext();
  return (
    <div>
      <span data-testid="dirty-state">{String(isDirty)}</span>
      <button type="button" onClick={() => setDirty(true)}>
        make-dirty
      </button>
      <button type="button" onClick={() => setDirty(false)}>
        make-clean
      </button>
      <button
        type="button"
        onClick={() => {
          const result = confirmLeave();
          const el = document.getElementById('confirm-result');
          if (el) el.textContent = String(result);
        }}
      >
        try-leave
      </button>
      <span id="confirm-result" data-testid="confirm-result" />
    </div>
  );
}

describe('UnsavedChangesContext', () => {
  it('Provider 밖에서 사용하면 에러를 throw한다', () => {
    // 콘솔 에러 출력 억제 (React가 에러 바운더리 없이 throw된 에러를 로깅함)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Unwrapped() {
      useUnsavedChangesContext();
      return null;
    }

    expect(() => render(<Unwrapped />)).toThrow(
      'useUnsavedChangesContext must be used within UnsavedChangesProvider',
    );

    consoleSpy.mockRestore();
  });

  it('dirty가 아니면 confirmLeave()는 window.confirm 없이 true를 반환한다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <UnsavedChangesProvider>
        <TestConsumer />
      </UnsavedChangesProvider>,
    );

    await user.click(screen.getByText('try-leave'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-result')).toHaveTextContent('true');

    confirmSpy.mockRestore();
  });

  it('dirty이면 confirmLeave()는 window.confirm을 호출하고 그 결과를 반환한다 (true)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <UnsavedChangesProvider>
        <TestConsumer />
      </UnsavedChangesProvider>,
    );

    await user.click(screen.getByText('make-dirty'));
    await user.click(screen.getByText('try-leave'));

    expect(confirmSpy).toHaveBeenCalledWith('confirmLeave');
    expect(screen.getByTestId('confirm-result')).toHaveTextContent('true');

    confirmSpy.mockRestore();
  });

  it('dirty이면 confirmLeave()는 window.confirm의 false 결과도 그대로 반환한다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    render(
      <UnsavedChangesProvider>
        <TestConsumer />
      </UnsavedChangesProvider>,
    );

    await user.click(screen.getByText('make-dirty'));
    await user.click(screen.getByText('try-leave'));

    expect(confirmSpy).toHaveBeenCalledWith('confirmLeave');
    expect(screen.getByTestId('confirm-result')).toHaveTextContent('false');

    confirmSpy.mockRestore();
  });

  it('dirty가 true가 되면 beforeunload 리스너가 등록되고, false가 되면 해제된다', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const user = userEvent.setup();

    render(
      <UnsavedChangesProvider>
        <TestConsumer />
      </UnsavedChangesProvider>,
    );

    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    await user.click(screen.getByText('make-dirty'));
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    await user.click(screen.getByText('make-clean'));
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
