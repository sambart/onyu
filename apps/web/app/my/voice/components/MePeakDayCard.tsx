'use client';

import { useTranslations } from 'next-intl';

import type { MeProfileData } from '@/app/lib/me-voice-api';

interface Props {
  profile: MeProfileData;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function MePeakDayCard({ profile }: Props) {
  const t = useTranslations('dashboard');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('me.peak.title')}</h3>
      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">{t('me.peak.peakDay')}</span>
          <span className="font-medium text-gray-900">{profile.peakDayOfWeek ?? '-'}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">{t('me.peak.weeklyAvg')}</span>
          <span className="font-medium text-gray-900">{formatDuration(profile.weeklyAvgSec)}</span>
        </div>
      </div>
    </div>
  );
}
