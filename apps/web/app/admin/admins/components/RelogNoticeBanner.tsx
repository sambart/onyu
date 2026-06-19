'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function RelogNoticeBanner() {
  const t = useTranslations('admin');

  return (
    <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-amber-800">{t('admins.relogNotice')}</p>
    </div>
  );
}
