'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type {
  CoPresenceGraphData,
  CoPresenceSummary,
  DailyTrendPoint,
  IsolatedMember,
  TopPair,
} from '@/app/lib/co-presence-api';
import {
  fetchCoPresenceGraph,
  fetchCoPresenceSummary,
  fetchDailyTrend,
  fetchIsolatedMembers,
  fetchTopPairs,
} from '@/app/lib/co-presence-api';
import { PeriodSelector } from '@/components/ui/period-selector';

import CoPresenceSummaryCards from './components/CoPresenceSummaryCards';
import DailyTrendChart from './components/DailyTrendChart';
import IsolatedMemberList from './components/IsolatedMemberList';
import PairsTable from './components/PairsTable';
import TopPairsPanel from './components/TopPairsPanel';

// sigma.js는 SSR에서 동작하지 않으므로 dynamic import로 SSR 비활성화
const CoPresenceGraph = dynamic(() => import('./components/CoPresenceGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
      <div className="text-muted-foreground">...</div>
    </div>
  ),
});

type Days = 7 | 30 | 90;

const DAY_OPTIONS: Days[] = [7, 30, 90];

export default function CoPresencePage() {
  const t = useTranslations('dashboard');
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;

  const [days, setDays] = useState<Days>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CoPresenceSummary | null>(null);
  const [graphData, setGraphData] = useState<CoPresenceGraphData | null>(null);
  const [topPairs, setTopPairs] = useState<TopPair[]>([]);
  const [isolated, setIsolated] = useState<IsolatedMember[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrendPoint[]>([]);
  // 그래프 최소 임계값 (분)
  const [minMinutes, setMinMinutes] = useState(10);
  const [graphLoading, setGraphLoading] = useState(false);

  // 메인 데이터 로딩 (기간 변경 시)
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [s, g, tp, iso, trend] = await Promise.all([
          fetchCoPresenceSummary(guildId, days),
          fetchCoPresenceGraph(guildId, days, minMinutes),
          fetchTopPairs(guildId, days, 10),
          fetchIsolatedMembers(guildId, days),
          fetchDailyTrend(guildId, days),
        ]);
        if (cancelled) return;
        setSummary(s);
        setGraphData(g);
        setTopPairs(tp);
        setIsolated(iso);
        setDailyTrend(trend);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('common.loadFailed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
    // minMinutes는 별도 useEffect에서 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, days]);

  // 그래프 최소 임계값 변경 시 그래프만 재조회
  useEffect(() => {
    let cancelled = false;

    async function loadGraph() {
      setGraphLoading(true);
      try {
        const g = await fetchCoPresenceGraph(guildId, days, minMinutes);
        if (!cancelled) setGraphData(g);
      } catch {
        // 그래프 재로딩 실패는 현재 데이터 유지
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    }

    // 초기 로딩(loading=true) 중에는 중복 호출 방지
    if (!loading) {
      void loadGraph();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, minMinutes]);

  return (
    <div className="space-y-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('coPresence.title')}</h1>
        <PeriodSelector
          options={DAY_OPTIONS.map((opt) => ({
            value: opt,
            label: `${opt}${t('coPresence.dayUnit')}`,
          }))}
          value={days}
          onChange={setDays}
        />
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      ) : (
        <>
          {/* 요약 카드 4종 */}
          {summary && <CoPresenceSummaryCards summary={summary} />}

          {/* 네트워크 그래프 (2/3) + 친밀도 TOP N (1/3) */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {graphData && (
                <CoPresenceGraph
                  data={graphData}
                  minMinutes={minMinutes}
                  isLoading={graphLoading}
                  onMinMinutesChange={setMinMinutes}
                />
              )}
            </div>
            <div>
              <TopPairsPanel topPairs={topPairs} />
            </div>
          </div>

          {/* 일별 추이 차트 (전체 폭) */}
          <DailyTrendChart data={dailyTrend} />

          {/* 관계 상세 테이블 (전체 폭) */}
          <PairsTable guildId={guildId} days={days} />

          {/* 고립 멤버 목록 (전체 폭) */}
          <IsolatedMemberList members={isolated} />
        </>
      )}
    </div>
  );
}
