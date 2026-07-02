'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { fetchOverview, type OverviewData } from '@/app/lib/overview-api';

import InactiveSummaryCard from './components/InactiveSummaryCard';
import MissionSummaryCard from './components/MissionSummaryCard';
import OverviewSummaryCards from './components/OverviewSummaryCards';
import WeeklyVoiceChart from './components/WeeklyVoiceChart';

export default function OverviewPage() {
  const t = useTranslations('dashboard');
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchOverview(guildId);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('common.loadFailed'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [guildId, t]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('overview.title')}</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-red-500">{error}</div>
        </div>
      ) : data ? (
        <>
          <OverviewSummaryCards data={data} />

          {data.missionSummary !== null && <MissionSummaryCard mission={data.missionSummary} />}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <WeeklyVoiceChart data={data.weeklyVoice} />
            </div>
            <div>
              <InactiveSummaryCard grades={data.inactiveByGrade} guildId={guildId} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
