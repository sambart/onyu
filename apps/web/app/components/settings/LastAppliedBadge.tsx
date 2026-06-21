'use client';

import { useLocale, useTranslations } from 'next-intl';

import { formatRelativeTime } from '@/app/lib/relative-time';

interface LastAppliedBadgeProps {
  /** ISO 8601 문자열 또는 null. null이면 미반영/미저장 상태. */
  at: string | null;
  /** 'applied': 반영 시각 배지 (status-prefix/sticky-message/role-panel용).
   *  'saved': 저장 시각 배지 (auto-channel용).
   *  기본값: 'applied'. */
  variant?: 'applied' | 'saved';
  /** true이면 배지를 흐리게 표시한다. */
  disabled?: boolean;
}

/**
 * 마지막 반영/저장 시각을 상대 시각으로 표시하는 배지 컴포넌트.
 *
 * - variant='applied': "마지막 반영: {상대시각}" / null이면 "미반영"
 * - variant='saved': "마지막 저장: {상대시각}" / null이면 "저장 안 됨"
 * - disabled=true이면 흐리게 표시
 */
export function LastAppliedBadge({
  at,
  variant = 'applied',
  disabled = false,
}: LastAppliedBadgeProps) {
  const t = useTranslations('settings.common.apply');
  const locale = useLocale();

  const label =
    at === null
      ? variant === 'saved'
        ? t('notSaved')
        : t('notApplied')
      : variant === 'saved'
        ? t('lastSaved', { time: formatRelativeTime(at, locale) })
        : t('lastApplied', { time: formatRelativeTime(at, locale) });

  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        at === null
          ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        disabled ? 'opacity-40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  );
}
