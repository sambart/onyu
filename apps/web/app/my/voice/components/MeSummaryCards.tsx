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

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

export default function MeSummaryCards({ profile }: Props) {
  const t = useTranslations('dashboard');

  const rankDisplay = t('me.summary.rankValue', { rank: profile.rank, total: profile.totalUsers });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard label={t('me.summary.totalSec')} value={formatDuration(profile.totalSec)} />
      <StatCard label={t('me.summary.rank')} value={rankDisplay} />
      <StatCard
        label={t('me.summary.activeDays')}
        value={t('me.summary.activeDaysValue', { days: profile.activeDays })}
      />
      <StatCard label={t('me.summary.avgDailySec')} value={formatDuration(profile.avgDailySec)} />
      <StatCard
        label={t('me.summary.micUsageRate')}
        value={`${Math.round(profile.micUsageRate)}%`}
      />
    </div>
  );
}
