'use client';

import { BarChart3, Loader2, RefreshCw, Server } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast';

import { useUnsavedChangesGuard } from '../../../../components/settings/useUnsavedChangesGuard';
import type { DiscordChannel, DiscordEmoji, DiscordRole } from '../../../../lib/discord-api';
import {
  fetchGuildEmojis,
  fetchGuildRoles,
  fetchGuildTextChannels,
} from '../../../../lib/discord-api';
import type { MissionTemplate, MocoTemplate, NewbieConfig } from '../../../../lib/newbie-api';
import {
  DEFAULT_MISSION_TEMPLATE,
  DEFAULT_MOCO_TEMPLATE,
  fetchMissionTemplate,
  fetchMocoTemplate,
  fetchNewbieConfig,
  saveMissionTemplate,
  saveMocoTemplate,
  saveNewbieConfig,
} from '../../../../lib/newbie-api';
import {
  validateMissionTemplate,
  validateMocoTemplate,
} from '../../../../lib/newbie-template-utils';
import { useSettings } from '../../../SettingsContext';
import MissionTab from './components/MissionTab';
import MocoTab from './components/MocoTab';
import RoleTab from './components/RoleTab';
import WelcomeTab from './components/WelcomeTab';

type TabId = 'welcome' | 'mission' | 'moco' | 'role';

const DEFAULT_CONFIG: NewbieConfig = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeEmbedTitle: null,
  welcomeEmbedDescription: null,
  welcomeEmbedColor: '#5865F2',
  welcomeEmbedThumbnailUrl: null,
  welcomeContent: null,
  missionEnabled: false,
  missionDurationDays: null,
  missionTargetPlaytimeHours: null,
  missionUseMicTime: false,
  missionTargetPlayCount: null,
  playCountMinDurationMin: 30,
  playCountIntervalMin: 30,
  missionNotifyChannelId: null,
  missionEmbedColor: '#57F287',
  missionDisplayMode: 'EMBED' as const,
  mocoEnabled: false,
  mocoNewbieDays: 30,
  mocoAllowNewbieHunter: false,
  mocoRankChannelId: null,
  mocoAutoRefreshMinutes: null,
  mocoEmbedColor: '#5865F2',
  mocoDisplayMode: 'EMBED' as const,
  mocoPlayCountMinDurationMin: 30,
  mocoPlayCountIntervalMin: 30,
  mocoMinCoPresenceMin: 10,
  mocoScorePerSession: 10,
  mocoScorePerMinute: 1,
  mocoScorePerUnique: 5,
  mocoResetPeriod: 'NONE',
  mocoResetIntervalDays: null,
  roleEnabled: false,
  roleDurationDays: null,
  newbieRoleId: null,
};

export default function NewbieSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const toast = useToast();
  const [config, setConfig] = useState<NewbieConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<TabId>('welcome');
  const [isSaving, setIsSaving] = useState(false);
  /** 채널 미선택 등 필드 맥락이 필요한 사전 검증 에러 — 인라인 표시 유지 */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 미션 템플릿 상태
  const [missionTemplate, setMissionTemplate] = useState<MissionTemplate>(DEFAULT_MISSION_TEMPLATE);
  const [isSavingMissionTemplate, setIsSavingMissionTemplate] = useState(false);
  /** 템플릿 변수 화이트리스트 위반 등 필드 맥락이 필요한 사전 검증 에러 — 인라인 표시 유지 */
  const [missionTemplateSaveError, setMissionTemplateSaveError] = useState<string | null>(null);

  // 모코코 템플릿 상태
  const [mocoTemplate, setMocoTemplate] = useState<MocoTemplate>(DEFAULT_MOCO_TEMPLATE);
  const [isSavingMocoTemplate, setIsSavingMocoTemplate] = useState(false);
  /** 템플릿 변수 화이트리스트 위반 등 필드 맥락이 필요한 사전 검증 에러 — 인라인 표시 유지 */
  const [mocoTemplateSaveError, setMocoTemplateSaveError] = useState<string | null>(null);

  // 저장 스냅샷(로드/저장 직후 상태) — 3개 독립 스코프의 dirty 판정용
  const savedConfigSnapshotRef = useRef<string>(JSON.stringify(DEFAULT_CONFIG));
  const savedMissionTemplateSnapshotRef = useRef<string>(JSON.stringify(DEFAULT_MISSION_TEMPLATE));
  const savedMocoTemplateSnapshotRef = useRef<string>(JSON.stringify(DEFAULT_MOCO_TEMPLATE));
  const isConfigDirty = JSON.stringify(config) !== savedConfigSnapshotRef.current;
  const isMissionTemplateDirty =
    JSON.stringify(missionTemplate) !== savedMissionTemplateSnapshotRef.current;
  const isMocoTemplateDirty = JSON.stringify(mocoTemplate) !== savedMocoTemplateSnapshotRef.current;
  // 3개 스코프 중 하나라도 dirty면 페이지 dirty (탭 전환은 동일 config 뷰이므로 폐기 없음 → 가드 불요)
  useUnsavedChangesGuard(isConfigDirty || isMissionTemplateDirty || isMocoTemplateDirty);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'welcome', label: t('newbie.tabWelcome') },
    { id: 'mission', label: t('newbie.tabMission') },
    { id: 'moco', label: t('newbie.tabMoco') },
    { id: 'role', label: t('newbie.tabRole') },
  ];

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setConfigLoaded(false);
    setConfig(DEFAULT_CONFIG);
    setMissionTemplate(DEFAULT_MISSION_TEMPLATE);
    setMocoTemplate(DEFAULT_MOCO_TEMPLATE);
    savedConfigSnapshotRef.current = JSON.stringify(DEFAULT_CONFIG);
    savedMissionTemplateSnapshotRef.current = JSON.stringify(DEFAULT_MISSION_TEMPLATE);
    savedMocoTemplateSnapshotRef.current = JSON.stringify(DEFAULT_MOCO_TEMPLATE);

    Promise.all([
      fetchNewbieConfig(selectedGuildId).catch(() => null),
      fetchGuildTextChannels(selectedGuildId).catch((): DiscordChannel[] => []),
      fetchGuildRoles(selectedGuildId).catch((): DiscordRole[] => []),
      fetchGuildEmojis(selectedGuildId).catch((): DiscordEmoji[] => []),
      fetchMissionTemplate(selectedGuildId).catch(() => null),
      fetchMocoTemplate(selectedGuildId).catch(() => null),
    ])
      .then(([cfg, chs, rls, ems, mTmpl, mocoTmpl]) => {
        if (cfg) {
          setConfig(cfg);
          savedConfigSnapshotRef.current = JSON.stringify(cfg);
        }
        setChannels(chs);
        setRoles(rls);
        setEmojis(ems);
        if (mTmpl) {
          setMissionTemplate(mTmpl);
          savedMissionTemplateSnapshotRef.current = JSON.stringify(mTmpl);
        }
        if (mocoTmpl) {
          setMocoTemplate(mocoTmpl);
          savedMocoTemplateSnapshotRef.current = JSON.stringify(mocoTmpl);
        }
        setConfigLoaded(true);
      })
      .catch(() => {
        setSaveError(t('common.loadError'));
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId, t]);

  const refreshChannels = async () => {
    if (!selectedGuildId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [chs, rls, ems] = await Promise.all([
        fetchGuildTextChannels(selectedGuildId, true).catch((): DiscordChannel[] => []),
        fetchGuildRoles(selectedGuildId, true).catch((): DiscordRole[] => []),
        fetchGuildEmojis(selectedGuildId, true).catch((): DiscordEmoji[] => []),
      ]);
      setChannels(chs);
      setRoles(rls);
      setEmojis(ems);
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateConfig = (partial: Partial<NewbieConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const handleSave = async () => {
    if (!selectedGuildId || isSaving) return;

    // 채널 필수값 유효성 검사
    const errors: string[] = [];
    if (config.welcomeEnabled && !config.welcomeChannelId) {
      errors.push(t('newbie.validationWelcomeChannel'));
    }
    if (config.missionEnabled && !config.missionNotifyChannelId) {
      errors.push(t('newbie.validationMissionChannel'));
    }
    if (config.mocoEnabled && !config.mocoRankChannelId) {
      errors.push(t('newbie.validationMocoChannel'));
    }
    if (errors.length > 0) {
      setSaveError(errors.join(' '));
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await saveNewbieConfig(selectedGuildId, config);
      savedConfigSnapshotRef.current = JSON.stringify(config);
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMissionTemplate = async () => {
    if (!selectedGuildId || isSavingMissionTemplate) return;

    // 프론트엔드 유효성 검사
    const errors = validateMissionTemplate(missionTemplate);
    if (errors.size > 0) {
      const msgs = [...errors.entries()].map(
        ([field, vars]) => `${field}: 허용되지 않는 변수 ${vars.join(', ')}`,
      );
      setMissionTemplateSaveError(msgs.join('\n'));
      return;
    }

    setIsSavingMissionTemplate(true);
    setMissionTemplateSaveError(null);

    try {
      await saveMissionTemplate(selectedGuildId, missionTemplate);
      savedMissionTemplateSnapshotRef.current = JSON.stringify(missionTemplate);
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSavingMissionTemplate(false);
    }
  };

  const handleSaveMocoTemplate = async () => {
    if (!selectedGuildId || isSavingMocoTemplate) return;

    // 프론트엔드 유효성 검사
    const errors = validateMocoTemplate(mocoTemplate);
    if (errors.size > 0) {
      const msgs = [...errors.entries()].map(
        ([field, vars]) => `${field}: 허용되지 않는 변수 ${vars.join(', ')}`,
      );
      setMocoTemplateSaveError(msgs.join('\n'));
      return;
    }

    setIsSavingMocoTemplate(true);
    setMocoTemplateSaveError(null);

    try {
      await saveMocoTemplate(selectedGuildId, mocoTemplate);
      savedMocoTemplateSnapshotRef.current = JSON.stringify(mocoTemplate);
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSavingMocoTemplate(false);
    }
  };

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newbie.title')}</h1>
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center text-center py-8">
            <Server className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-sm text-gray-500">{t('common.selectServer')}</p>
          </div>
        </section>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newbie.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'welcome':
        return (
          <WelcomeTab config={config} channels={channels} emojis={emojis} onChange={updateConfig} />
        );
      case 'mission':
        return (
          <MissionTab
            config={config}
            channels={channels}
            emojis={emojis}
            onChange={updateConfig}
            missionTemplate={missionTemplate}
            onMissionTemplateChange={setMissionTemplate}
            onSaveMissionTemplate={handleSaveMissionTemplate}
            isSavingMissionTemplate={isSavingMissionTemplate}
            missionTemplateSaveError={missionTemplateSaveError}
            isMissionTemplateDirty={isMissionTemplateDirty}
          />
        );
      case 'moco':
        return (
          <MocoTab
            config={config}
            channels={channels}
            onChange={updateConfig}
            mocoTemplate={mocoTemplate}
            onMocoTemplateChange={setMocoTemplate}
            onSaveMocoTemplate={handleSaveMocoTemplate}
            isSavingMocoTemplate={isSavingMocoTemplate}
            mocoTemplateSaveError={mocoTemplateSaveError}
            isMocoTemplateDirty={isMocoTemplateDirty}
          />
        );
      case 'role':
        return <RoleTab config={config} roles={roles} onChange={updateConfig} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('newbie.title')}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/guild/${selectedGuildId}/newbie`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            <span>{tc('sidebar.crosslink.dashboard')}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              void refreshChannels();
            }}
            disabled={isRefreshing}
            title={t('newbie.refreshChannels')}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('newbie.refreshChannels')}</span>
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        {renderTabContent()}
      </div>

      {/* 저장 버튼 + 피드백 (채널 검증 에러만 인라인 유지 — 성공/네트워크 실패는 토스트) */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {saveError && <p className="text-sm text-red-600 font-medium">{saveError}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving || !selectedGuildId || !configLoaded}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? t('common.saving') : t('newbie.saveConfigOnly')}
        </button>
      </div>
    </div>
  );
}
