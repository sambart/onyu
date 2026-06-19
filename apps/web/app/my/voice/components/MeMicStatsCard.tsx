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

export default function MeMicStatsCard({ profile }: Props) {
  const t = useTranslations('dashboard');

  const micOnPct =
    profile.totalSec > 0 ? Math.round((profile.micOnSec / profile.totalSec) * 100) : 0;
  const micOffPct =
    profile.totalSec > 0 ? Math.round((profile.micOffSec / profile.totalSec) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('me.mic.title')}</h3>
      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">{t('me.mic.micOn')}</span>
          <span className="font-medium text-gray-900">
            {formatDuration(profile.micOnSec)}{' '}
            <span className="text-xs text-gray-400">({micOnPct}%)</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">{t('me.mic.micOff')}</span>
          <span className="font-medium text-gray-900">
            {formatDuration(profile.micOffSec)}{' '}
            <span className="text-xs text-gray-400">({micOffPct}%)</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">{t('me.mic.alone')}</span>
          <span className="font-medium text-gray-900">{formatDuration(profile.aloneSec)}</span>
        </div>
      </div>

      {/* 마이크 사용률 바 */}
      <div className="mt-3">
        <div className="flex rounded-full overflow-hidden h-2">
          <div
            className="bg-indigo-500"
            style={{ width: `${micOnPct}%` }}
            title={t('me.mic.micOn')}
          />
          <div
            className="bg-gray-300"
            style={{ width: `${micOffPct}%` }}
            title={t('me.mic.micOff')}
          />
        </div>
      </div>
    </div>
  );
}
