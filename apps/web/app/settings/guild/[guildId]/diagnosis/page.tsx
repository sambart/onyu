'use client';

import { BarChart3, Loader2, RefreshCw, Server } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { DiscordChannel } from '../../../../lib/discord-api';
import { fetchGuildTextChannels } from '../../../../lib/discord-api';
import type { WeeklyReportConfigDto } from '../../../../lib/weekly-report-api';
import {
  DEFAULT_WEEKLY_REPORT_CONFIG,
  fetchWeeklyReportConfig,
  saveWeeklyReportConfig,
} from '../../../../lib/weekly-report-api';
import { useSettings } from '../../../SettingsContext';

const DAY_KEYS: Record<number, string> = { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' };
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function WeeklyReportSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [config, setConfig] = useState<WeeklyReportConfigDto>(DEFAULT_WEEKLY_REPORT_CONFIG);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setSaveSuccess(false);
    setSaveError(null);
    setValidationError(null);

    void Promise.all([
      fetchWeeklyReportConfig(selectedGuildId),
      fetchGuildTextChannels(selectedGuildId).catch((): DiscordChannel[] => []),
    ])
      .then(([cfg, chs]) => {
        setConfig(cfg);
        setChannels(chs);
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  function updateConfig(partial: Partial<WeeklyReportConfigDto>) {
    setConfig((prev: WeeklyReportConfigDto) => ({ ...prev, ...partial }));
    setValidationError(null);
  }

  async function handleRefreshChannels() {
    if (!selectedGuildId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const chs = await fetchGuildTextChannels(selectedGuildId, true).catch(
        (): DiscordChannel[] => [],
      );
      setChannels(chs);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSave() {
    if (!selectedGuildId || isSaving) return;

    if (config.isEnabled && !config.channelId) {
      setValidationError(t('weeklyReport.validationChannelRequired'));
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const saved = await saveWeeklyReportConfig(selectedGuildId, config);
      setConfig(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSaving(false);
    }
  }

  if (!selectedGuildId) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('weeklyReport.title')}</h1>
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
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('weeklyReport.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  const isFormDisabled = !config.isEnabled;

  return (
    <div className="max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('weeklyReport.title')}</h1>
        <Link
          href={`/dashboard/guild/${selectedGuildId}/diagnosis`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          <span>{tc('sidebar.crosslink.dashboard')}</span>
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* 활성화 토글 */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900">{t('weeklyReport.enableToggle')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('weeklyReport.enableDescription')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.isEnabled}
            onClick={() => updateConfig({ isEnabled: !config.isEnabled })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              config.isEnabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                config.isEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 나머지 폼 — isEnabled가 false면 dimmed */}
        <div className={isFormDisabled ? 'opacity-50 pointer-events-none' : ''}>
          {/* 텍스트 채널 선택 */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  {t('weeklyReport.channel')}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    void handleRefreshChannels();
                  }}
                  disabled={isRefreshing}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {t('weeklyReport.refreshChannels')}
                </button>
              </div>
              <select
                value={config.channelId ?? ''}
                onChange={(e) => updateConfig({ channelId: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">{t('weeklyReport.channelPlaceholder')}</option>
                {channels.map((ch: DiscordChannel) => (
                  <option key={ch.id} value={ch.id}>
                    # {ch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 발송 요일 */}
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">
                {t('weeklyReport.dayOfWeek')}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(DAY_KEYS).map(([dayNum, dayKey]) => {
                  const day = Number(dayNum);
                  const isActive = config.dayOfWeek === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => updateConfig({ dayOfWeek: day })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {/* DAY_KEYS 값이 0-6 문자열을 보장하므로 as 단언 사용 */}
                      {t(`weeklyReport.days.${dayKey}` as Parameters<typeof t>[0])}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 발송 시각 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('weeklyReport.hour')}
              </label>
              <select
                value={config.hour}
                onChange={(e) => updateConfig({ hour: Number(e.target.value) })}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {t('weeklyReport.hourFormat', { hour: h })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 저장 버튼 + 피드백 */}
      <div className="flex items-center justify-between gap-4 mt-6">
        <div className="flex-1">
          {validationError && <p className="text-sm text-red-600 font-medium">{validationError}</p>}
          {saveSuccess && (
            <p className="text-sm text-green-600 font-medium">{t('weeklyReport.saveSuccess')}</p>
          )}
          {saveError && <p className="text-sm text-red-600 font-medium">{saveError}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving || !selectedGuildId}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
