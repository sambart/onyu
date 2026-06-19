'use client';

import { useTranslations } from 'next-intl';

import type { MeExcludedChannelEntry } from '@/app/lib/me-voice-api';

interface Props {
  excludedChannels: MeExcludedChannelEntry[];
}

export default function MeExcludedChannelBanner({ excludedChannels }: Props) {
  const t = useTranslations('dashboard');

  if (excludedChannels.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start space-x-2">
      <span className="text-amber-500 text-base leading-none mt-0.5">!</span>
      <div>
        <p className="text-xs font-medium text-amber-700">{t('me.excluded.title')}</p>
        <p className="text-xs text-amber-600 mt-0.5">
          {excludedChannels.map((ch) => ch.name).join(', ')}
        </p>
      </div>
    </div>
  );
}
