'use client';

import { BarChart3, Check, ChevronDown, Loader2, Mic, RefreshCw, Server } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { DiscordChannel } from '../../../../lib/discord-api';
import { fetchGuildChannels } from '../../../../lib/discord-api';
import type { ExcludedChannelEntry } from '../../../../lib/voice-api';
import { fetchVoiceExcludedChannels, saveVoiceExcludedChannels } from '../../../../lib/voice-api';
import { useSettings } from '../../../SettingsContext';

// ─── 로컬 타입 ─────────────────────────────────────────────────────────────

/** 멀티 셀렉트 드롭다운의 옵션 항목 */
interface ChannelOption {
  id: string;
  name: string;
  type: 2 | 4; // 2 = GUILD_VOICE, 4 = GUILD_CATEGORY
}

// ─── 컴포넌트 ───────────────────────────────────────────────────────────────

export default function VoiceSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── 드롭다운 외부 클릭 닫기 ─────────────────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // EventTarget → Node 좁히기 (contains() 호출에 필요)
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── 초기 데이터 로드 ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setSelectedIds([]);

    Promise.all([fetchVoiceExcludedChannels(selectedGuildId), fetchGuildChannels(selectedGuildId)])
      .then(([excludedIds, allChannels]) => {
        const options: ChannelOption[] = allChannels
          .filter((ch) => ch.type === 2 || ch.type === 4)
          // Discord.js ChannelType enum → 리터럴 (필터로 2 | 4 임이 보장됨)
          .map((ch) => ({ id: ch.id, name: ch.name, type: ch.type as 2 | 4 }));
        setChannelOptions(options);
        setSelectedIds(excludedIds);
      })
      .catch(() => {
        setSaveError(t('common.loadError'));
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  // ─── 채널 새로고침 ────────────────────────────────────────────────────────

  const refreshChannels = async () => {
    if (!selectedGuildId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const allChannels = await fetchGuildChannels(selectedGuildId, true).catch(
        (): DiscordChannel[] => [],
      );
      const options: ChannelOption[] = allChannels
        .filter((ch) => ch.type === 2 || ch.type === 4)
        // Discord.js ChannelType enum → 리터럴 (필터로 2 | 4 임이 보장됨)
        .map((ch) => ({ id: ch.id, name: ch.name, type: ch.type as 2 | 4 }));
      setChannelOptions(options);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── 멀티 셀렉트 핸들러 ──────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const removeSelected = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  // ─── 저장 핸들러 ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedGuildId || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const channelMap = new Map(channelOptions.map((o) => [o.id, o]));
      const entries: ExcludedChannelEntry[] = selectedIds
        .map((id) => {
          const opt = channelMap.get(id);
          if (!opt) return null;
          return {
            channelId: id,
            type: opt.type === 4 ? 'CATEGORY' : 'CHANNEL',
          } as ExcludedChannelEntry;
        })
        .filter((e): e is ExcludedChannelEntry => e !== null);
      await saveVoiceExcludedChannels(selectedGuildId, entries);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 파생 데이터 ──────────────────────────────────────────────────────────

  const selectedOptions = channelOptions.filter((o) => selectedIds.includes(o.id));
  const hasCategorySelected = selectedOptions.some((o) => o.type === 4);

  // ─── 조건부 렌더링 ────────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('voice.title')}</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('voice.title')}</h1>
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
          <Mic className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('voice.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/guild/${selectedGuildId}/voice`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            <span>{tc('sidebar.crosslink.dashboard')}</span>
          </Link>
          <button
            type="button"
            onClick={refreshChannels}
            disabled={isRefreshing}
            title={t('common.refreshChannels')}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('common.refreshChannels')}</span>
          </button>
        </div>
      </div>

      {/* 설정 섹션 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('voice.excludedChannels')}</h2>

        {/* 선택된 태그 목록 */}
        {selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium"
              >
                {opt.type === 4 ? '📁' : '🔊'} {opt.name}
                <button
                  type="button"
                  onClick={() => removeSelected(opt.id)}
                  aria-label={t('voice.deselect', { name: opt.name })}
                  className="ml-1 text-indigo-400 hover:text-indigo-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 멀티 셀렉트 드롭다운 */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen((v) => !v)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <span className="text-gray-500">{t('voice.channelOrCategorySelect')}</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isDropdownOpen && (
            <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {channelOptions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-400">{t('voice.noChannelOptions')}</li>
              ) : (
                channelOptions.map((opt) => {
                  const isSelected = selectedIds.includes(opt.id);
                  return (
                    <li
                      key={opt.id}
                      onClick={() => toggleSelect(opt.id)}
                      className={`flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                      }`}
                    >
                      <span className="mr-2">{opt.type === 4 ? '📁' : '🔊'}</span>
                      <span className="flex-1">{opt.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* 카테고리 선택 안내 문구 */}
        {hasCategorySelected && (
          <p className="text-xs text-amber-600 mt-2">{t('voice.categoryNote')}</p>
        )}

        {/* 저장 피드백 + 저장 버튼 */}
        <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-100">
          <div className="flex-1">
            {saveSuccess && (
              <p className="text-sm text-green-600 font-medium">{t('common.saveSuccess')}</p>
            )}
            {saveError && <p className="text-sm text-red-600 font-medium">{saveError}</p>}
          </div>
          <button
            type="button"
            onClick={handleSave}
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
