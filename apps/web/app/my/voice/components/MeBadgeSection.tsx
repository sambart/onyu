'use client';

import { useTranslations } from 'next-intl';

interface Props {
  badges: string[];
}

export default function MeBadgeSection({ badges }: Props) {
  const t = useTranslations('dashboard');

  if (badges.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('me.badges.title')}</h3>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700"
          >
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}
