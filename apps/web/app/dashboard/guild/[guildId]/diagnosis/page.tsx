'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type {
  AiInsightResponse,
  ChannelStatsResponse,
  DiagnosisSummaryResponse,
  HealthScoreResponse,
  LeaderboardResponse,
} from '@/app/lib/diagnosis-api';
import {
  fetchChannelStats,
  fetchDiagnosisSummary,
  fetchHealthDiagnosis,
  fetchHealthScore,
  fetchLeaderboard,
  generateAiInsight,
} from '@/app/lib/diagnosis-api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import ActivityTrendChart from './components/ActivityTrendChart';
import AiInsightPanel from './components/AiInsightPanel';
import ChannelAnalysisChart from './components/ChannelAnalysisChart';
import HealthScoreGauge from './components/HealthScoreGauge';
import LeaderboardTable from './components/LeaderboardTable';

type DayPreset = 7 | 14 | 30 | 90;

const DAY_PRESETS: DayPreset[] = [7, 14, 30, 90];
const DEFAULT_DAYS: DayPreset = 30;
const LEADERBOARD_LIMIT = 10;

export default function DiagnosisDashboardPage() {
  const t = useTranslations('dashboard');
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;
  const router = useRouter();

  const [days, setDays] = useState<DayPreset>(DEFAULT_DAYS);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiagnosisLoading, setIsDiagnosisLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DiagnosisSummaryResponse>({ daily: [] });
  const [healthScore, setHealthScore] = useState<HealthScoreResponse>({
    score: 0,
    prevScore: 0,
    delta: 0,
    diagnosis: '',
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse>({ users: [], total: 0 });
  const [channelStats, setChannelStats] = useState<ChannelStatsResponse>({ channels: [] });
  const [aiInsight, setAiInsight] = useState<AiInsightResponse>({
    insights: null,
    suggestions: [],
    generatedAt: null,
  });
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  // 메인 데이터 + AI 인사이트 로드
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setIsDiagnosisLoading(true);
      setError(null);
      setLeaderboardPage(1);

      try {
        const [summaryData, healthData, leaderboardData, channelData] = await Promise.all([
          fetchDiagnosisSummary(guildId, days),
          fetchHealthScore(guildId, days),
          fetchLeaderboard(guildId, days, 1, LEADERBOARD_LIMIT),
          fetchChannelStats(guildId, days),
        ]);

        if (cancelled) return;
        setSummary(summaryData);
        setHealthScore(healthData);
        setLeaderboard(leaderboardData);
        setChannelStats(channelData);
      } catch {
        if (!cancelled) setError(t('error.loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }

      // 건강도 AI 진단 텍스트만 비동기 로드 (AI 인사이트는 수동 새로고침으로만 생성)
      try {
        const diagnosisData = await fetchHealthDiagnosis(guildId, days);
        if (!cancelled) {
          setHealthScore((prev) => ({ ...prev, diagnosis: diagnosisData.diagnosis }));
        }
      } catch {
        // 진단 텍스트 실패는 전체 에러로 처리하지 않음
      } finally {
        if (!cancelled) setIsDiagnosisLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [guildId, days]);

  // 리더보드 페이지 변경
  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      setIsLeaderboardLoading(true);
      try {
        const data = await fetchLeaderboard(guildId, days, leaderboardPage, LEADERBOARD_LIMIT);
        if (!cancelled) setLeaderboard(data);
      } finally {
        if (!cancelled) setIsLeaderboardLoading(false);
      }
    }

    // 초기 로드(1페이지)는 메인 effect에서 처리하므로 스킵
    if (leaderboardPage === 1 && isLoading) return;
    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
    // guildId·days 변경 시 메인 effect가 1페이지를 직접 로드하므로 의존성에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardPage]);

  function handleUserClick(userId: string) {
    router.push(`/dashboard/guild/${guildId}/voice?userId=${userId}`);
  }

  async function handleAiRefresh() {
    if (isAiLoading) return;
    setIsAiLoading(true);
    try {
      const data = await generateAiInsight(guildId, days);
      setAiInsight(data);
    } finally {
      setIsAiLoading(false);
    }
  }

  function handleDaysChange(value: string) {
    setDays(Number(value) as DayPreset);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">{t('diagnosis.title')}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{t('diagnosis.periodLabel')}</span>
          <Select
            value={String(days)}
            onValueChange={(v) => handleDaysChange(v ?? String(DEFAULT_DAYS))}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_PRESETS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {/* 동적 키 구성 — DayPreset 타입이 보장하므로 as 단언 사용 */}
                  {t(`diagnosis.period.${d}d` as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-red-500">{error}</p>
        </div>
      ) : (
        <>
          {/* 건강도 게이지 */}
          <div className="grid gap-6 lg:grid-cols-3">
            <HealthScoreGauge
              score={healthScore.score}
              delta={healthScore.delta}
              diagnosis={healthScore.diagnosis}
              isLoading={isLoading}
              isDiagnosisLoading={isDiagnosisLoading}
            />
            {/* 활동 트렌드 차트 */}
            <div className="lg:col-span-2">
              <ActivityTrendChart data={summary.daily} />
            </div>
          </div>

          {/* 리더보드 + 채널 분석 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <LeaderboardTable
              users={leaderboard.users}
              total={leaderboard.total}
              page={leaderboardPage}
              onPageChange={setLeaderboardPage}
              onUserClick={handleUserClick}
              isLoading={isLoading || isLeaderboardLoading}
            />
            <ChannelAnalysisChart channels={channelStats.channels} />
          </div>

          {/* AI 인사이트 */}
          <AiInsightPanel
            insights={aiInsight.insights}
            suggestions={aiInsight.suggestions}
            generatedAt={aiInsight.generatedAt}
            isLoading={isAiLoading}
            onRefresh={() => {
              void handleAiRefresh();
            }}
          />
        </>
      )}
    </div>
  );
}
