'use client';

import { BarChart3, HeartPulse, Loader2, Server } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast';

import { useUnsavedChangesGuard } from '../../../../components/settings/useUnsavedChangesGuard';
import type { VoiceHealthConfig } from '../../../../lib/voice-health-api';
import { fetchVoiceHealthConfig, saveVoiceHealthConfig } from '../../../../lib/voice-health-api';
import { useSettings } from '../../../SettingsContext';

const DEFAULT_CONFIG: VoiceHealthConfig = {
  isEnabled: false,
  analysisDays: 30,
  isCooldownEnabled: true,
  cooldownHours: 24,
  isLlmSummaryEnabled: false,
  minActivityMinutes: 600,
  minActiveDaysRatio: 0.5,
  hhiThreshold: 0.3,
  minPeerCount: 3,
  badgeActivityTopPercent: 10,
  badgeSocialHhiMax: 0.25,
  badgeSocialMinPeers: 5,
  badgeHunterTopPercent: 10,
  badgeConsistentMinRatio: 0.8,
  badgeMicMinRate: 0.7,
};

export default function VoiceHealthSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const toast = useToast();

  const [form, setForm] = useState<VoiceHealthConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 저장 스냅샷(로드/저장 직후 상태) — dirty 판정용
  const savedSnapshotRef = useRef<string>(JSON.stringify(DEFAULT_CONFIG));
  const isDirty = JSON.stringify(form) !== savedSnapshotRef.current;
  useUnsavedChangesGuard(isDirty);

  // ─── 초기 데이터 로드 ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    fetchVoiceHealthConfig(selectedGuildId)
      .then((config) => {
        const normalized: VoiceHealthConfig = {
          ...config,
          minActiveDaysRatio: Number(config.minActiveDaysRatio),
          hhiThreshold: Number(config.hhiThreshold),
          badgeSocialHhiMax: Number(config.badgeSocialHhiMax),
          badgeConsistentMinRatio: Number(config.badgeConsistentMinRatio),
          badgeMicMinRate: Number(config.badgeMicMinRate),
        };
        setForm(normalized);
        savedSnapshotRef.current = JSON.stringify(normalized);
      })
      .catch(() => {
        setForm(DEFAULT_CONFIG);
        savedSnapshotRef.current = JSON.stringify(DEFAULT_CONFIG);
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  // ─── 폼 헬퍼 ────────────────────────────────────────────────────────────

  const updateForm = <K extends keyof VoiceHealthConfig>(key: K, value: VoiceHealthConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ─── 저장 핸들러 ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedGuildId || isSaving) return;
    setIsSaving(true);
    try {
      await saveVoiceHealthConfig(selectedGuildId, form);
      savedSnapshotRef.current = JSON.stringify(form);
      toast.success(t('common.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 토글 컴포넌트 (인라인) ────────────────────────────────────────────────

  const renderToggle = (checked: boolean, onToggle: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  // ─── 조건부 렌더링 ────────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('voiceHealth.title')}</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('voiceHealth.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  // ─── 메인 렌더링 ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <HeartPulse className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('voiceHealth.title')}</h1>
        </div>
        <Link
          href={`/dashboard/guild/${selectedGuildId}/diagnosis`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          <span>{tc('sidebar.crosslink.dashboard')}</span>
        </Link>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-8">
        {/* 섹션 1: 기본 설정 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {t('voiceHealth.basicSettings')}
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {t('voiceHealth.enableFeature')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t('voiceHealth.enableFeatureDesc')}</p>
              </div>
              {renderToggle(form.isEnabled, () => updateForm('isEnabled', !form.isEnabled))}
            </div>

            <div>
              <label
                htmlFor="analysis-days"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('voiceHealth.analysisDays')}
              </label>
              <p className="text-xs text-gray-500 mb-1">{t('voiceHealth.analysisDaysDesc')}</p>
              <input
                id="analysis-days"
                type="number"
                min={7}
                max={90}
                value={form.analysisDays}
                onChange={(e) => updateForm('analysisDays', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('voiceHealth.cooldown')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('voiceHealth.cooldownDesc')}</p>
              </div>
              {renderToggle(form.isCooldownEnabled, () =>
                updateForm('isCooldownEnabled', !form.isCooldownEnabled),
              )}
            </div>

            {form.isCooldownEnabled && (
              <div>
                <label
                  htmlFor="cooldown-hours"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('voiceHealth.cooldownHours')}
                </label>
                <p className="text-xs text-gray-500 mb-1">{t('voiceHealth.cooldownHoursDesc')}</p>
                <input
                  id="cooldown-hours"
                  type="number"
                  min={1}
                  max={168}
                  value={form.cooldownHours}
                  onChange={(e) => updateForm('cooldownHours', Number(e.target.value))}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('voiceHealth.llmSummary')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('voiceHealth.llmSummaryDesc')}</p>
              </div>
              {renderToggle(form.isLlmSummaryEnabled, () =>
                updateForm('isLlmSummaryEnabled', !form.isLlmSummaryEnabled),
              )}
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* 섹션 2: 정책 기준 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {t('voiceHealth.policyCriteria')}
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="min-activity-minutes"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('voiceHealth.minActivityMinutes')}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.minActivityMinutesDesc')}
              </p>
              <input
                id="min-activity-minutes"
                type="number"
                min={1}
                value={form.minActivityMinutes}
                onChange={(e) => updateForm('minActivityMinutes', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('voiceHealth.minActiveDaysRatio', {
                  value: Math.round(form.minActiveDaysRatio * 100),
                })}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.minActiveDaysRatioDesc')}
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(form.minActiveDaysRatio * 100)}
                onChange={(e) => updateForm('minActiveDaysRatio', Number(e.target.value) / 100)}
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('voiceHealth.diversityScore', {
                  value: Math.round((1 - form.hhiThreshold) * 100),
                })}
              </label>
              <p className="text-xs text-gray-500 mb-1">{t('voiceHealth.diversityScoreDesc')}</p>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((1 - form.hhiThreshold) * 100)}
                onChange={(e) => updateForm('hhiThreshold', (100 - Number(e.target.value)) / 100)}
                className="w-full accent-indigo-600"
              />
              <div className="flex gap-2 mt-2">
                {[
                  {
                    labelKey: 'voiceHealth.presetLoose' as const,
                    score: 50,
                    hhiThreshold: 0.5,
                    minPeerCount: 2,
                  },
                  {
                    labelKey: 'voiceHealth.presetNormal' as const,
                    score: 70,
                    hhiThreshold: 0.3,
                    minPeerCount: 3,
                  },
                  {
                    labelKey: 'voiceHealth.presetStrict' as const,
                    score: 80,
                    hhiThreshold: 0.2,
                    minPeerCount: 5,
                  },
                ].map((preset) => {
                  const isActive =
                    form.hhiThreshold === preset.hhiThreshold &&
                    form.minPeerCount === preset.minPeerCount;
                  return (
                    <button
                      key={preset.labelKey}
                      type="button"
                      onClick={() => {
                        // hhiThreshold + minPeerCount 동시 업데이트 — 원자적 처리를 위해 단일 setForm 호출
                        setForm((prev) => ({
                          ...prev,
                          hhiThreshold: preset.hhiThreshold,
                          minPeerCount: preset.minPeerCount,
                        }));
                      }}
                      className={`border rounded-lg px-3 py-1 text-xs transition-colors ${
                        isActive
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {t('voiceHealth.presetLabel', {
                        label: t(preset.labelKey),
                        score: preset.score,
                      })}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="min-peer-count"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('voiceHealth.minPeerCount')}
              </label>
              <p className="text-xs text-gray-500 mb-1">{t('voiceHealth.minPeerCountDesc')}</p>
              <input
                id="min-peer-count"
                type="number"
                min={1}
                value={form.minPeerCount}
                onChange={(e) => updateForm('minPeerCount', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* 섹션 3: 뱃지 기준 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {t('voiceHealth.badgeCriteria')}
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="badge-activity-top-percent"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('voiceHealth.badgeActivityTopPercent')}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.badgeActivityTopPercentDesc')}
              </p>
              <input
                id="badge-activity-top-percent"
                type="number"
                min={1}
                max={100}
                value={form.badgeActivityTopPercent}
                onChange={(e) => updateForm('badgeActivityTopPercent', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('voiceHealth.badgeSocialDiversity', {
                  value: Math.round((1 - form.badgeSocialHhiMax) * 100),
                })}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.badgeSocialDiversityDesc')}
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((1 - form.badgeSocialHhiMax) * 100)}
                onChange={(e) =>
                  updateForm('badgeSocialHhiMax', (100 - Number(e.target.value)) / 100)
                }
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <label
                htmlFor="badge-social-min-peers"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('voiceHealth.badgeSocialMinPeers')}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.badgeSocialMinPeersDesc')}
              </p>
              <input
                id="badge-social-min-peers"
                type="number"
                min={1}
                value={form.badgeSocialMinPeers}
                onChange={(e) => updateForm('badgeSocialMinPeers', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="badge-hunter-top-percent"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('voiceHealth.badgeHunterTopPercent')}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.badgeHunterTopPercentDesc')}
              </p>
              <input
                id="badge-hunter-top-percent"
                type="number"
                min={1}
                max={100}
                value={form.badgeHunterTopPercent}
                onChange={(e) => updateForm('badgeHunterTopPercent', Number(e.target.value))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('voiceHealth.badgeConsistentMinRatio', {
                  value: Math.round(form.badgeConsistentMinRatio * 100),
                })}
              </label>
              <p className="text-xs text-gray-500 mb-1">
                {t('voiceHealth.badgeConsistentMinRatioDesc')}
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(form.badgeConsistentMinRatio * 100)}
                onChange={(e) =>
                  updateForm('badgeConsistentMinRatio', Number(e.target.value) / 100)
                }
                className="w-full accent-indigo-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('voiceHealth.badgeMicMinRate', {
                  value: Math.round(form.badgeMicMinRate * 100),
                })}
              </label>
              <p className="text-xs text-gray-500 mb-1">{t('voiceHealth.badgeMicMinRateDesc')}</p>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(form.badgeMicMinRate * 100)}
                onChange={(e) => updateForm('badgeMicMinRate', Number(e.target.value) / 100)}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={isSaving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </section>
    </div>
  );
}
