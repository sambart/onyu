'use client';

import { useTranslations } from 'next-intl';

import type { PlatformHealth } from '@/app/lib/admin-api';

interface PlatformHealthPanelProps {
  health: PlatformHealth | null;
  isLoading: boolean;
  isError: boolean;
}

type HealthStatus = 'up' | 'down' | 'unknown';

const STATUS_CLASS: Record<HealthStatus, string> = {
  up: 'bg-green-100 text-green-800',
  down: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-600',
};

interface StatusBadgeProps {
  status: HealthStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const t = useTranslations('admin');
  const labelKey =
    status === 'up' ? 'health.up' : status === 'down' ? 'health.down' : 'health.unknown';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {t(labelKey)}
    </span>
  );
}

export default function PlatformHealthPanel({
  health,
  isLoading,
  isError,
}: PlatformHealthPanelProps) {
  const t = useTranslations('admin');

  const items: Array<{ labelKey: string; status: HealthStatus }> = health
    ? [
        { labelKey: 'health.api', status: health.api },
        { labelKey: 'health.bot', status: health.bot },
        { labelKey: 'health.db', status: health.database },
        { labelKey: 'health.redis', status: health.redis },
      ]
    : [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('health.title')}</h2>

      {isLoading ? (
        <div className="flex space-x-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>
      ) : isError || !health ? (
        <p className="text-sm text-red-500">{t('health.loadFailed')}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map(({ labelKey, status }) => (
            <div key={labelKey} className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">{t(labelKey)}</span>
              <StatusBadge status={status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
