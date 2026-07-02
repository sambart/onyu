import { getTranslations } from 'next-intl/server';

import { SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div role="status" aria-label={t('loadingAria')} className="space-y-6">
      <SkeletonCard className="h-24" />
      <SkeletonTable />
    </div>
  );
}
