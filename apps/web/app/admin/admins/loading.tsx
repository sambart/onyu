import { getTranslations } from 'next-intl/server';

import { Skeleton, SkeletonTable } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div role="status" aria-label={t('loadingAria')} className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <SkeletonTable />
    </div>
  );
}
