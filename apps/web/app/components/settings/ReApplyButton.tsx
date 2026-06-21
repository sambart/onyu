'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ReApplyButtonProps {
  /** 클릭 시 호출되는 비동기 핸들러. 성공/실패 토스트는 호출측에서 처리한다. */
  onReApply: () => Promise<void> | void;
  /** true이면 버튼을 비활성화한다. (예: 저장된 적 없는 경우) */
  disabled?: boolean;
}

/**
 * "다시 반영" 버튼 컴포넌트.
 *
 * - 클릭 시 내부 로딩 상태를 활성화하여 중복 클릭을 방지한다.
 * - 성공/실패 토스트는 onReApply 호출측에서 처리한다.
 * - disabled=true이면 버튼을 비활성화한다.
 */
export function ReApplyButton({ onReApply, disabled = false }: ReApplyButtonProps) {
  const t = useTranslations('settings.common.apply');
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onReApply();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || isLoading}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
        'bg-indigo-600 text-white hover:bg-indigo-700',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors duration-150',
      ].join(' ')}
    >
      {isLoading ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
            aria-hidden="true"
          />
          {t('reApplying')}
        </>
      ) : (
        t('reApply')
      )}
    </button>
  );
}
