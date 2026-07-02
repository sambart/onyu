import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div role="status" aria-label={t('loadingAria')} className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-56 lg:col-span-2" />
      </div>
      <SkeletonTable />
    </div>
  );
}
