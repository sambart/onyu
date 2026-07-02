import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div role="status" aria-label={t('loadingAria')} className="space-y-6 p-4 md:p-6">
      <Skeleton className="h-7 w-36" />
      <div className="grid gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable />
    </div>
  );
}
