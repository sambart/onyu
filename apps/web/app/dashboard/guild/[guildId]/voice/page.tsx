'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { fetchMemberProfiles } from '@/app/lib/user-detail-api';
import {
  type ChannelTypeFilter,
  computeAutoChannelGroupStats,
  computeChannelStats,
  computeDailyTrends,
  computeSummary,
  computeUserStats,
  fetchVoiceDaily,
  filterRecordsByChannelType,
  type VoiceDailyRecord,
  type VoiceDailyTrend,
  type VoiceSummary,
  type VoiceUserStat,
} from '@/app/lib/voice-dashboard-api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import ChannelBarChart from './components/ChannelBarChart';
import DailyTrendChart from './components/DailyTrendChart';
import MicDistributionChart from './components/MicDistributionChart';
import SummaryCards from './components/SummaryCards';
import UserDetailView from './components/UserDetailView';
import UserRankingTable from './components/UserRankingTable';

const RANKING_PAGE_SIZE = 20;

type Period = '7d' | '14d' | '30d' | '60d' | '90d';

function getDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = formatYmd(now);
  const dayMap: Record<Period, number> = { '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90 };
  const days = dayMap[period];
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  const from = formatYmd(fromDate);
  return { from, to };
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export default function VoiceDashboardPage() {
  const t = useTranslations('dashboard');
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get('userId');

  const [period, setPeriod] = useState<Period>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VoiceSummary | null>(null);
  const [trends, setTrends] = useState<VoiceDailyTrend[]>([]);
  const [rawRecords, setRawRecords] = useState<VoiceDailyRecord[]>([]);
  const [userStats, setUserStats] = useState<VoiceUserStat[]>([]);
  const [profiles, setProfiles] = useState<
    Record<string, { userName: string; avatarUrl: string | null }>
  >({});
  const [channelTypeFilter, setChannelTypeFilter] = useState<ChannelTypeFilter>('all');
  const [rankingPage, setRankingPage] = useState(1);

  useEffect(() => {
    if (selectedUserId) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      setRankingPage(1);
      try {
        const { from, to } = getDateRange(period);
        const data = await fetchVoiceDaily(guildId, from, to);
        if (cancelled) return;
        setRawRecords(data);
        setSummary(computeSummary(data));
        setTrends(computeDailyTrends(data));
        const stats = computeUserStats(data);
        setUserStats(stats);

        const userIds = stats.slice(0, RANKING_PAGE_SIZE).map((u) => u.userId);
        if (userIds.length > 0) {
          const p = await fetchMemberProfiles(guildId, userIds);
          if (!cancelled) setProfiles(p);
        }
      } catch {
        if (!cancelled) setError(t('error.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [guildId, period, selectedUserId]);

  // 랭킹 페이지 변경 시 해당 페이지 유저 프로필 fetch
  useEffect(() => {
    if (userStats.length === 0 || rankingPage === 1) return;

    let cancelled = false;
    const offset = (rankingPage - 1) * RANKING_PAGE_SIZE;
    const pageUserIds = userStats.slice(offset, offset + RANKING_PAGE_SIZE).map((u) => u.userId);
    const missingIds = pageUserIds.filter((id) => !profiles[id]);

    if (missingIds.length === 0) return;

    async function loadProfiles() {
      const p = await fetchMemberProfiles(guildId, missingIds);
      if (!cancelled) setProfiles((prev) => ({ ...prev, ...p }));
    }

    loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [rankingPage, userStats, guildId]);

  function handleUserSelect(userId: string) {
    router.push(`/dashboard/guild/${guildId}/voice?userId=${userId}`);
  }

  function handleBackToGuild() {
    router.push(`/dashboard/guild/${guildId}/voice`);
  }

  if (selectedUserId) {
    return (
      <div className="p-4 md:p-6">
        <UserDetailView
          guildId={guildId}
          userId={selectedUserId}
          onBack={handleBackToGuild}
          onUserSelect={handleUserSelect}
        />
      </div>
    );
  }

  // 렌더링 시점 집계 (channelTypeFilter 의존, API 재호출 없음)
  const filteredRecords = filterRecordsByChannelType(rawRecords, channelTypeFilter);
  const channelStats = computeChannelStats(filteredRecords);
  const autoGroupStats = computeAutoChannelGroupStats(rawRecords);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">{t('voice.title')}</h1>
        <Select
          value={period}
          // select onChange: value는 런타임에 Period 유니온 멤버만 가능
          onValueChange={(v) => setPeriod(v as Period)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue>{t(`voice.period.${period}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t('voice.period.7d')}</SelectItem>
            <SelectItem value="14d">{t('voice.period.14d')}</SelectItem>
            <SelectItem value="30d">{t('voice.period.30d')}</SelectItem>
            <SelectItem value="60d">{t('voice.period.60d')}</SelectItem>
            <SelectItem value="90d">{t('voice.period.90d')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-red-500">{error}</div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      ) : (
        <>
          {summary && <SummaryCards summary={summary} />}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DailyTrendChart data={trends} />
            </div>
            <div>{summary && <MicDistributionChart summary={summary} />}</div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChannelBarChart
              data={channelStats}
              records={filteredRecords}
              autoGroupStats={autoGroupStats}
              channelTypeFilter={channelTypeFilter}
              onChannelTypeFilterChange={setChannelTypeFilter}
            />
            <UserRankingTable
              data={userStats}
              guildId={guildId}
              page={rankingPage}
              onPageChange={setRankingPage}
              profiles={profiles}
              onUserSelect={handleUserSelect}
            />
          </div>
        </>
      )}
    </div>
  );
}
