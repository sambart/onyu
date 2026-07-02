import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div role="status" aria-label={t('loadingAria')} className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-56 lg:col-span-2" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonTable />
        <SkeletonCard className="h-72" />
      </div>
    </div>
  );
}
