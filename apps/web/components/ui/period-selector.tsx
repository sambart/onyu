'use client';

import { cn } from '@/lib/utils';

// ─── 타입 ─────────────────────────────────────────────────────────────────

interface PeriodOption<T extends string | number> {
  value: T;
  label: string;
}

interface PeriodSelectorProps<T extends string | number> {
  options: PeriodOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

// ─── 스타일 ────────────────────────────────────────────────────────────────

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────

function PeriodSelector<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  ariaLabel,
}: PeriodSelectorProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-1 rounded-lg bg-gray-100 p-1"
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        function handleClick() {
          onChange(option.value);
        }

        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={isSelected}
            onClick={handleClick}
            className={cn(
              'rounded-md font-medium transition-colors',
              SIZE_CLASSES[size],
              isSelected
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { PeriodSelector };
export type { PeriodOption, PeriodSelectorProps };
