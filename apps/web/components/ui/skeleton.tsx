import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

// ─── 기본 스켈레톤 블록 ────────────────────────────────────────────────────

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-gray-100', className)}
      {...props}
    />
  );
}

// ─── 프리셋: 카드 형태 ─────────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-xl border border-gray-200 bg-white p-4', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  );
}

// ─── 프리셋: 테이블 형태 ───────────────────────────────────────────────────

const DEFAULT_TABLE_ROWS = 5;

function SkeletonTable({
  rows = DEFAULT_TABLE_ROWS,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  const rowKeys = Array.from({ length: rows }, (_, index) => index);

  return (
    <div className={cn('overflow-hidden rounded-lg border border-gray-200 bg-white', className)}>
      <Skeleton className="h-10 w-full rounded-none" />
      <div className="divide-y divide-gray-100">
        {rowKeys.map((key) => (
          <Skeleton key={key} className="h-12 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonTable };
