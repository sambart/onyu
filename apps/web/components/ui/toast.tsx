'use client';

import { cva } from 'class-variance-authority';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

// ─── 타입 ─────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'info';

interface ToastOptions {
  durationMs?: number;
}

interface ToastApi {
  success(message: string, opts?: ToastOptions): void;
  error(message: string, opts?: ToastOptions): void;
  info(message: string, opts?: ToastOptions): void;
}

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  durationMs: number;
}

// 기본 노출 시간 — 성공/안내는 4초, 실패는 조금 더 길게 6초
const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;

const ToastContext = createContext<ToastApi | null>(null);

// ─── 스타일 (cva — badge/button 과 동일 토큰 체계) ───────────────────────────

const toastVariants = cva(
  'pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-md',
  {
    variants: {
      variant: {
        success: 'bg-green-50 text-green-800 border-green-200',
        error: 'bg-red-50 text-red-700 border-red-200',
        info: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

const TOAST_ICONS: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

// ─── ToastItem 렌더 ───────────────────────────────────────────────────────

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const t = useTranslations('common');
  const Icon = TOAST_ICONS[item.variant];

  function handleDismiss() {
    onDismiss(item.id);
  }

  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      className={cn(toastVariants({ variant: item.variant }))}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">{item.message}</p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('toast.dismiss')}
        className="shrink-0 rounded p-0.5 text-current opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Viewport (Portal → document.body) ───────────────────────────────────

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // document.body 는 클라이언트에서만 존재 — SSR 중 createPortal 호출 방지를 위한
    // 마운트 감지 (portal 컴포넌트의 통상적인 패턴)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe portal 마운트 감지
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return createPortal(
    <div role="region" className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {items.map((item) => (
        <ToastItemView key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, opts?: ToastOptions) => {
      const id = crypto.randomUUID();
      const durationMs =
        opts?.durationMs ?? (variant === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
      setItems((prev) => [...prev, { id, variant, message, durationMs }]);
      const timer = setTimeout(() => remove(id), durationMs);
      timersRef.current.set(id, timer);
    },
    [remove],
  );

  // 언마운트 시 남은 타이머 정리
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, opts) => push('success', message, opts),
      error: (message, opts) => push('error', message, opts),
      info: (message, opts) => push('info', message, opts),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

export { ToastProvider, useToast };
export type { ToastApi, ToastOptions, ToastVariant };
