/**
 * toast.tsx (ToastProvider / useToast) 단위 테스트
 *
 * 검증 항목:
 * - useToast().success/error/info 호출 시 메시지가 렌더링된다
 * - variant 별 role/aria-live가 올바르다 (success/info: status/polite, error: alert/assertive)
 * - durationMs 경과 후 자동으로 제거된다 (fake timers)
 * - 닫기 버튼 클릭 시 즉시 제거된다
 * - useToast()를 ToastProvider 밖에서 호출하면 에러를 던진다
 */

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { ToastProvider, useToast } from '../toast';

// toast.tsx 내부 DEFAULT_DURATION_MS / ERROR_DURATION_MS 와 동일한 값 (테스트 전용 상수)
const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;
const ERROR_REMAINING_MS = ERROR_DURATION_MS - DEFAULT_DURATION_MS;

function TestTrigger({ variant }: { variant: 'success' | 'error' | 'info' }) {
  const toast = useToast();

  function handleClick() {
    toast[variant](`${variant} 메시지`);
  }

  return (
    <button type="button" onClick={handleClick}>
      트리거-{variant}
    </button>
  );
}

describe('ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('success 호출 시 메시지가 렌더링되고 role=status, aria-live=polite를 가진다', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <TestTrigger variant="success" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('트리거-success'));

    const toastEl = await screen.findByText('success 메시지');
    const container = toastEl.closest('[role]');
    expect(container).toHaveAttribute('role', 'status');
    expect(container).toHaveAttribute('aria-live', 'polite');
  });

  it('error 호출 시 role=alert, aria-live=assertive를 가진다', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <TestTrigger variant="error" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('트리거-error'));

    const toastEl = await screen.findByText('error 메시지');
    const container = toastEl.closest('[role]');
    expect(container).toHaveAttribute('role', 'alert');
    expect(container).toHaveAttribute('aria-live', 'assertive');
  });

  it('닫기 버튼이 렌더링되고 클릭 시 토스트가 제거된다', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <TestTrigger variant="info" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('트리거-info'));
    await screen.findByText('info 메시지');

    const dismissButton = screen.getByRole('button', { name: 'toast.dismiss' });
    await user.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('info 메시지')).not.toBeInTheDocument();
    });
  });

  it('기본 durationMs(4000ms) 경과 후 success 토스트가 자동으로 제거된다', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <TestTrigger variant="success" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('트리거-success'));
    await screen.findByText('success 메시지');

    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_DURATION_MS);
    });

    await waitFor(() => {
      expect(screen.queryByText('success 메시지')).not.toBeInTheDocument();
    });
  });

  it('error 토스트는 6000ms 이후에 자동으로 제거된다 (4000ms 시점에는 유지)', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <TestTrigger variant="error" />
      </ToastProvider>,
    );

    await user.click(screen.getByText('트리거-error'));
    await screen.findByText('error 메시지');

    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_DURATION_MS);
    });
    expect(screen.getByText('error 메시지')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(ERROR_REMAINING_MS);
    });

    await waitFor(() => {
      expect(screen.queryByText('error 메시지')).not.toBeInTheDocument();
    });
  });

  it('ToastProvider 밖에서 useToast()를 호출하면 에러를 던진다', () => {
    // renderHook은 에러를 throw하는 훅 검증에 적합 — console.error 억제
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within ToastProvider',
    );
    consoleErrorSpy.mockRestore();
  });
});
