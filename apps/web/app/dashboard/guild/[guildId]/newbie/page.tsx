'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import type { DiscordRole } from '../../../../lib/discord-api';
import { fetchGuildRoles } from '../../../../lib/discord-api';
import type { NewbieConfig } from '../../../../lib/newbie-api';
import { fetchMissions, fetchNewbieConfig } from '../../../../lib/newbie-api';
import DisabledBanner from './components/DisabledBanner';
import MissionManageTab from './components/MissionManageTab';
import MocoRankingTab from './components/MocoRankingTab';

type TabKey = 'mission' | 'moco';

export default function NewbieDashboardPage() {
  const t = useTranslations('dashboard');
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;

  const [config, setConfig] = useState<NewbieConfig | null>(null);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('mission');
  const [hasMissionData, setHasMissionData] = useState<boolean | null>(null);

  const settingsUrl = `/settings/guild/${guildId}/newbie`;

  const loadConfig = useCallback(async () => {
    setIsConfigLoading(true);
    try {
      const [cfg, roleList] = await Promise.all([
        fetchNewbieConfig(guildId),
        fetchGuildRoles(guildId),
      ]);
      setConfig(cfg);
      setRoles(roleList);

      if (cfg) {
        if (!cfg.missionEnabled && cfg.mocoEnabled) {
          setActiveTab('moco');
        } else {
          setActiveTab('mission');
        }
      }
    } catch (err) {
      console.error('[NEWBIE DASHBOARD] config load failed', err);
    } finally {
      setIsConfigLoading(false);
    }
  }, [guildId]);

  const loadMissionDataCheck = useCallback(async () => {
    if (!config || config.missionEnabled) {
      setHasMissionData(null);
      return;
    }
    try {
      const data = await fetchMissions(guildId, undefined, 1, 1);
      setHasMissionData(data.total > 0);
    } catch {
      setHasMissionData(false);
    }
  }, [config, guildId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadMissionDataCheck();
  }, [loadMissionDataCheck]);

  if (isConfigLoading) {
    return (
      <div className="flex items-center justify-center p-6 py-20">
        <div className="text-gray-400">{t('common.loadingConfig')}</div>
      </div>
    );
  }

  // 양쪽 모두 비활성
  if (config && !config.missionEnabled && !config.mocoEnabled) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">{t('newbie.title')}</h1>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 py-20 text-center">
          <p className="text-gray-500">{t('newbie.bothDisabled')}</p>
          <Link
            href={settingsUrl}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t('newbie.goToSettings')}
          </Link>
        </div>
      </div>
    );
  }

  const isMissionEnabled = config?.missionEnabled ?? false;
  const isMocoEnabled = config?.mocoEnabled ?? false;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">{t('newbie.title')}</h1>

      {/* 탭 헤더 */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          type="button"
          disabled={!isMissionEnabled && hasMissionData === false}
          onClick={() => setActiveTab('mission')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            activeTab === 'mission'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('newbie.missionTab')}
          {!isMissionEnabled && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {t('newbie.inactive')}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('moco')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'moco'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('newbie.mocoTab')}
          {!isMocoEnabled && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {t('newbie.inactive')}
            </span>
          )}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'mission' && (
        <div className="space-y-4">
          {/* missionEnabled=false & 데이터 있음 → 경고 배너 + 읽기 전용 */}
          {!isMissionEnabled && hasMissionData && (
            <DisabledBanner featureName={t('newbie.missionTab')} settingsUrl={settingsUrl} />
          )}

          {/* missionEnabled=false & 데이터 없음 → 빈 상태 안내 */}
          {!isMissionEnabled && hasMissionData === false && (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 py-16 text-center">
              <p className="text-gray-500">{t('newbie.missionDisabled')}</p>
              <Link
                href={settingsUrl}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {t('newbie.goToSettings')}
              </Link>
            </div>
          )}

          {/* 활성 상태 또는 데이터 있는 비활성 → 컴포넌트 표시 */}
          {(isMissionEnabled || hasMissionData) && (
            <MissionManageTab
              guildId={guildId}
              roles={roles}
              readonly={!isMissionEnabled}
              missionUseMicTime={config?.missionUseMicTime ?? false}
            />
          )}
        </div>
      )}

      {activeTab === 'moco' && config && (
        <MocoRankingTab
          guildId={guildId}
          config={config}
          isEnabled={isMocoEnabled}
          settingsUrl={settingsUrl}
        />
      )}
    </div>
  );
}
