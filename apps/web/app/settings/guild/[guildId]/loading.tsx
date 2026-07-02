import { getTranslations } from 'next-intl/server';

import { Skeleton } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div role="status" aria-label={t('loadingAria')} className="max-w-3xl space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
