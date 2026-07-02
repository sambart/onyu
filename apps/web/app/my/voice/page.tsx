'use client';

import { Loader2, MicOff, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchMeGuilds,
  fetchMeProfile,
  type MeProfileData,
  type MeVoiceGuild,
  type MeVoicePeriod,
} from '@/app/lib/me-voice-api';
import { PeriodSelector } from '@/components/ui/period-selector';

import GuildSelector from './components/GuildSelector';
import MeBadgeSection from './components/MeBadgeSection';
import MeDailyChart from './components/MeDailyChart';
import MeExcludedChannelBanner from './components/MeExcludedChannelBanner';
import MeMicStatsCard from './components/MeMicStatsCard';
import MePeakDayCard from './components/MePeakDayCard';
import MeSummaryCards from './components/MeSummaryCards';

type Period = MeVoicePeriod;
const DEFAULT_PERIOD: Period = 15;
const PERIOD_7: Period = 7;
const PERIOD_15: Period = 15;
const PERIOD_30: Period = 30;

type PageState =
  | { kind: 'loading-guilds' }
  | { kind: 'empty-no-guilds' }
  | { kind: 'loading-profile'; guilds: MeVoiceGuild[]; selectedGuildId: string; days: Period }
  | {
      kind: 'ready';
      guilds: MeVoiceGuild[];
      selectedGuildId: string;
      days: Period;
      profile: MeProfileData;
    }
  | {
      kind: 'empty-no-activity';
      guilds: MeVoiceGuild[];
      selectedGuildId: string;
      days: Period;
    }
  | { kind: 'error-guilds' }
  | {
      kind: 'error-profile';
      guilds: MeVoiceGuild[];
      selectedGuildId: string;
      days: Period;
    };

// eslint-disable-next-line max-lines-per-function -- 상태 머신(7종 PageState)과 렌더 분기를 한 컴포넌트에서 관리. 각 분기는 별도 컴포넌트 없이 인라인 렌더로 충분히 이해 가능
export default function MyVoicePage() {
  const t = useTranslations('dashboard');
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading-guilds' });
  const requestSeqRef = useRef(0);
  // 재시도 트리거: 증가 시 길드 로드 useEffect 재실행
  const [guildsLoadKey, setGuildsLoadKey] = useState(0);

  // 길드 목록 로드 (마운트 시 + 재시도 시)
  useEffect(() => {
    let cancelled = false;

    async function loadGuilds() {
      try {
        const guilds = await fetchMeGuilds();
        if (cancelled) return;

        if (guilds.length === 0) {
          setPageState({ kind: 'empty-no-guilds' });
          return;
        }

        const firstGuildId = guilds[0].guildId;
        setPageState({
          kind: 'loading-profile',
          guilds,
          selectedGuildId: firstGuildId,
          days: DEFAULT_PERIOD,
        });
      } catch {
        if (!cancelled) setPageState({ kind: 'error-guilds' });
      }
    }

    void loadGuilds();
    return () => {
      cancelled = true;
    };
  }, [guildsLoadKey]);

  // 프로필 로드 (loading-profile 상태 진입 시)
  useEffect(() => {
    if (pageState.kind !== 'loading-profile') return;

    const seq = ++requestSeqRef.current;
    const { guilds, selectedGuildId, days } = pageState;

    async function loadProfile() {
      try {
        const profile = await fetchMeProfile(selectedGuildId, days);
        if (requestSeqRef.current !== seq) return;

        if (profile === null) {
          setPageState({ kind: 'empty-no-activity', guilds, selectedGuildId, days });
        } else {
          setPageState({ kind: 'ready', guilds, selectedGuildId, days, profile });
        }
      } catch {
        if (requestSeqRef.current === seq) {
          setPageState({ kind: 'error-profile', guilds, selectedGuildId, days });
        }
      }
    }

    void loadProfile();
  }, [pageState]);

  const handleGuildChange = useCallback(
    (guildId: string) => {
      if (
        pageState.kind === 'ready' ||
        pageState.kind === 'empty-no-activity' ||
        pageState.kind === 'error-profile'
      ) {
        setPageState({
          kind: 'loading-profile',
          guilds: pageState.guilds,
          selectedGuildId: guildId,
          days: pageState.days,
        });
      }
    },
    [pageState],
  );

  const handlePeriodChange = useCallback(
    (days: Period) => {
      if (
        pageState.kind === 'ready' ||
        pageState.kind === 'empty-no-activity' ||
        pageState.kind === 'error-profile'
      ) {
        setPageState({
          kind: 'loading-profile',
          guilds: pageState.guilds,
          selectedGuildId: pageState.selectedGuildId,
          days,
        });
      }
    },
    [pageState],
  );

  const handleRetryGuilds = useCallback(() => {
    setPageState({ kind: 'loading-guilds' });
    setGuildsLoadKey((prev) => prev + 1);
  }, []);

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  if (pageState.kind === 'loading-guilds') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (pageState.kind === 'error-guilds') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <p className="text-gray-700 font-medium mb-4">{t('error.loadFailed')}</p>
          <button
            type="button"
            onClick={handleRetryGuilds}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            {t('common.refresh')}
          </button>
        </div>
      </div>
    );
  }

  if (pageState.kind === 'empty-no-guilds') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center px-4">
          <Volume2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('me.title')}</h2>
          <p className="text-sm text-gray-500">{t('me.noGuilds')}</p>
        </div>
      </div>
    );
  }

  // 이 이후: 길드 목록 있음 (loading-profile | ready | empty-no-activity | error-profile)
  const { guilds, selectedGuildId, days } = pageState;
  const isLoadingProfile = pageState.kind === 'loading-profile';
  const hasProfileError = pageState.kind === 'error-profile';
  const profile = pageState.kind === 'ready' ? pageState.profile : null;
  const isNoActivity = pageState.kind === 'empty-no-activity';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('me.title')}</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:space-x-3">
          <GuildSelector
            guilds={guilds}
            selectedGuildId={selectedGuildId}
            onGuildChange={handleGuildChange}
          />
          <PeriodSelector
            options={[
              { value: PERIOD_7, label: t('me.period.7d') },
              { value: PERIOD_15, label: t('me.period.15d') },
              { value: PERIOD_30, label: t('me.period.30d') },
            ]}
            value={days}
            onChange={handlePeriodChange}
          />
        </div>
      </div>

      {/* 프로필 로딩 스피너 */}
      {isLoadingProfile && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* 활동 없음 안내 */}
      {isNoActivity && !isLoadingProfile && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <MicOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t('me.noActivity')}</p>
          </div>
        </div>
      )}

      {/* 프로필 로드 에러 */}
      {hasProfileError && !isLoadingProfile && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-red-500">{t('error.loadFailed')}</p>
        </div>
      )}

      {/* 프로필 정상 렌더 */}
      {profile && !isLoadingProfile && (
        <div className="space-y-4">
          {/* 제외 채널 배너 */}
          <MeExcludedChannelBanner excludedChannels={profile.excludedChannels} />

          {/* 요약 카드 */}
          <MeSummaryCards profile={profile} />

          {/* 일별 차트 + 마이크/피크 */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MeDailyChart dailyChart={profile.dailyChart} />
            </div>
            <div className="flex flex-col gap-4">
              <MeMicStatsCard profile={profile} />
              <MePeakDayCard profile={profile} />
            </div>
          </div>

          {/* 뱃지 */}
          <MeBadgeSection badges={profile.badges} />
        </div>
      )}
    </div>
  );
}
