'use client';

import { Loader2, RefreshCw, Server, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import GuildEmojiPicker from '../../../../components/GuildEmojiPicker';
import type { DiscordChannel, DiscordEmoji } from '../../../../lib/discord-api';
import { fetchGuildEmojis, fetchGuildTextChannels } from '../../../../lib/discord-api';
import type {
  StatusPrefixButton,
  StatusPrefixButtonType,
  StatusPrefixConfig,
} from '../../../../lib/status-prefix-api';
import {
  fetchStatusPrefixConfig,
  saveStatusPrefixConfig,
} from '../../../../lib/status-prefix-api';
import { useSettings } from '../../../SettingsContext';

type TFn = ReturnType<typeof useTranslations<'settings'>>;

const validateButtons = (buttons: StatusPrefixButton[], t: TFn): string[] => {
  const sorted = [...buttons].sort((a, b) => a.sortOrder - b.sortOrder);
  const seenPrefixes = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const btn = sorted[i];
    if (!btn.label.trim()) return [t('statusPrefix.validationButtonLabel', { index: i + 1 })];
    if (btn.type === 'PREFIX' && !btn.prefix?.trim()) {
      return [t('statusPrefix.validationButtonPrefix', { index: i + 1 })];
    }
    if (btn.type === 'PREFIX' && btn.prefix) {
      const trimmed = btn.prefix.trim();
      if (seenPrefixes.has(trimmed)) return [t('statusPrefix.validationDuplicatePrefix', { prefix: trimmed })];
      seenPrefixes.add(trimmed);
    }
  }
  return [];
};

const DEFAULT_CONFIG: StatusPrefixConfig = {
  enabled: false,
  channelId: null,
  embedTitle: '게임방 상태 설정 시스템',
  embedDescription: '아래 버튼을 클릭하여 닉네임 접두사를 변경할 수 있습니다.',
  embedColor: '#5865F2',
  prefixTemplate: '[{prefix}] {nickname}',
  buttons: [],
};

export default function StatusPrefixSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');

  const [config, setConfig] = useState<StatusPrefixConfig>(DEFAULT_CONFIG);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const embedDescRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = (insertText: string) => {
    const textarea = embedDescRef.current;
    const currentValue = config.embedDescription ?? '';

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue =
        currentValue.substring(0, start) +
        insertText +
        currentValue.substring(end);

      setConfig((prev) => ({ ...prev, embedDescription: newValue || null }));

      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + insertText.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      setConfig((prev) => ({
        ...prev,
        embedDescription: (currentValue + insertText) || null,
      }));
    }
  };

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setConfig(DEFAULT_CONFIG);

    Promise.all([
      fetchStatusPrefixConfig(selectedGuildId).catch(() => null),
      fetchGuildTextChannels(selectedGuildId).catch((): DiscordChannel[] => []),
      fetchGuildEmojis(selectedGuildId).catch((): DiscordEmoji[] => []),
    ])
      .then(([cfg, chs, ems]) => {
        if (cfg) setConfig(cfg);
        setChannels(chs);
        setEmojis(ems);
      })
      .catch(() => {
        setSaveError(t('common.loadError'));
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  const refreshChannels = async () => {
    if (!selectedGuildId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [chs, ems] = await Promise.all([
        fetchGuildTextChannels(selectedGuildId, true).catch((): DiscordChannel[] => []),
        fetchGuildEmojis(selectedGuildId, true).catch((): DiscordEmoji[] => []),
      ]);
      setChannels(chs);
      setEmojis(ems);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── 버튼 목록 헬퍼 ─────────────────────────────────────────────────────

  const updateButtons = (buttons: StatusPrefixButton[]) => {
    setConfig((prev) => ({ ...prev, buttons }));
  };

  const addButton = () => {
    const maxOrder = config.buttons.reduce(
      (m, b) => Math.max(m, b.sortOrder),
      -1,
    );
    const newButton: StatusPrefixButton = {
      id: -Date.now(),
      label: '',
      emoji: null,
      prefix: null,
      type: 'PREFIX',
      sortOrder: maxOrder + 1,
    };
    updateButtons([...config.buttons, newButton]);
  };

  const removeButton = (id: number) => {
    const filtered = config.buttons
      .filter((b) => b.id !== id)
      .map((b, idx) => ({ ...b, sortOrder: idx }));
    updateButtons(filtered);
  };

  const updateButton = (id: number, patch: Partial<StatusPrefixButton>) => {
    updateButtons(
      config.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  };

  const moveButton = (id: number, direction: 'up' | 'down') => {
    const sorted = [...config.buttons].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((b) => b.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newSorted = [...sorted];
    const tempOrder = newSorted[idx].sortOrder;
    newSorted[idx] = { ...newSorted[idx], sortOrder: newSorted[swapIdx].sortOrder };
    newSorted[swapIdx] = { ...newSorted[swapIdx], sortOrder: tempOrder };
    updateButtons(newSorted);
  };

  // ─── 저장 핸들러 ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedGuildId || isSaving) return;

    // 유효성 검사
    const errors: string[] = [];
    if (config.enabled && !config.channelId) {
      errors.push(t('statusPrefix.validationChannel'));
    }
    if (config.enabled) {
      errors.push(...validateButtons(config.buttons, t));
    }
    if (errors.length > 0) {
      setSaveError(errors.join(' '));
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const sorted = [...config.buttons].sort((a, b) => a.sortOrder - b.sortOrder);
    const normalizedButtons = sorted.map((b, idx) => ({ ...b, sortOrder: idx }));
    const payload: StatusPrefixConfig = { ...config, buttons: normalizedButtons };

    try {
      await saveStatusPrefixConfig(selectedGuildId, payload);
      setConfig(payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : t('common.saveError'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 조건부 렌더링 ────────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('statusPrefix.title')}
        </h1>
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center text-center py-8">
            <Server className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-sm text-gray-500">
              {t('common.selectServer')}
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {t('statusPrefix.title')}
        </h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  const sortedButtons = [...config.buttons].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  // ─── 메인 렌더링 ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Tag className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('statusPrefix.title')}</h1>
        </div>
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

      {/* 섹션 1: 기본 설정 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('statusPrefix.basicSettings')}</h2>
        <div className="space-y-6">

          {/* 기능 활성화 토글 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('statusPrefix.enableFeature')}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('statusPrefix.enableFeatureDesc')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() =>
                setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                config.enabled ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* 안내 채널 선택 */}
          <div>
            <label
              htmlFor="sp-channel"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('statusPrefix.guideChannel')}
            </label>
            <select
              id="sp-channel"
              value={config.channelId ?? ''}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  channelId: e.target.value || null,
                }))
              }
              disabled={!config.enabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <option value="">{t('common.channelSelect')}</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  # {ch.name}
                </option>
              ))}
            </select>
            {channels.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {t('statusPrefix.noChannels')}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {t('statusPrefix.guideChannelDesc')}
            </p>
          </div>

          {/* 접두사 형식 템플릿 */}
          <div>
            <label
              htmlFor="sp-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('statusPrefix.prefixTemplate')}
            </label>
            <input
              id="sp-template"
              type="text"
              value={config.prefixTemplate}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  prefixTemplate: e.target.value,
                }))
              }
              disabled={!config.enabled}
              placeholder="예: [{prefix}] {nickname}"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('statusPrefix.prefixTemplateDesc')}
            </p>
          </div>

          {/* 템플릿 변수 안내 */}
          <div className="bg-indigo-50 rounded-lg p-4">
            <p className="text-xs font-semibold text-indigo-700 mb-2">
              {t('statusPrefix.templateVarsTitle')}
            </p>
            <dl className="space-y-1.5">
              {[
                {
                  variable: '{prefix}',
                  description: t('statusPrefix.varPrefix'),
                },
                {
                  variable: '{nickname}',
                  description: t('statusPrefix.varNickname'),
                },
              ].map((item) => (
                <div key={item.variable} className="flex items-center space-x-2">
                  <code className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">
                    {item.variable}
                  </code>
                  <span className="text-xs text-indigo-600">
                    {item.description}
                  </span>
                </div>
              ))}
            </dl>
          </div>

        </div>
      </section>

      {/* 섹션 2: Embed 설정 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {t('statusPrefix.embedSettings')}
        </h2>
        <div className="space-y-6">

          {/* Embed 제목 */}
          <div>
            <label
              htmlFor="sp-embed-title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('common.embedTitle')}
            </label>
            <input
              id="sp-embed-title"
              type="text"
              value={config.embedTitle ?? ''}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  embedTitle: e.target.value || null,
                }))
              }
              disabled={!config.enabled}
              placeholder="예: 게임방 상태 설정 시스템"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Embed 설명 (멀티라인) */}
          <div>
            <label
              htmlFor="sp-embed-desc"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('common.embedDescription')}
            </label>
            <textarea
              ref={embedDescRef}
              id="sp-embed-desc"
              value={config.embedDescription ?? ''}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  embedDescription: e.target.value || null,
                }))
              }
              disabled={!config.enabled}
              placeholder="예: 아래 버튼을 클릭하여 닉네임 접두사를 변경할 수 있습니다."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed resize-none"
            />
            <div className="flex items-center mt-2">
              <GuildEmojiPicker
                emojis={emojis}
                onSelect={(val) => insertAtCursor(val)}
                disabled={!config.enabled}
              />
            </div>
          </div>

          {/* Embed 색상 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.embedColor')}
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={config.embedColor ?? '#5865F2'}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    embedColor: e.target.value,
                  }))
                }
                disabled={!config.enabled}
                aria-label={t('common.embedColorPicker')}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1"
              />
              <input
                type="text"
                value={config.embedColor ?? '#5865F2'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    setConfig((prev) => ({ ...prev, embedColor: val }));
                  }
                }}
                disabled={!config.enabled}
                maxLength={7}
                placeholder="#5865F2"
                aria-label={t('common.embedColorHex')}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Embed 미리보기 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('common.preview')}</p>
            <div className="bg-[#2B2D31] rounded-lg p-4">
              <div
                className="bg-[#313338] rounded-md overflow-hidden"
                style={{
                  borderLeft: `4px solid ${config.embedColor ?? '#5865F2'}`,
                }}
              >
                <div className="p-4">
                  <p className="text-white font-semibold text-sm mb-1 break-words">
                    {config.embedTitle || t('common.noTitle')}
                  </p>
                  <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">
                    {config.embedDescription || t('common.noDescription')}
                  </p>
                  {sortedButtons.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {sortedButtons.map((btn) => (
                        <span
                          key={btn.id}
                          className="px-3 py-1 bg-indigo-500 text-white text-xs rounded font-medium"
                        >
                          {btn.emoji ? `${btn.emoji} ` : ''}
                          {btn.label || t('common.noLabel')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 섹션 3: 버튼 목록 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t('statusPrefix.buttonList')}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('statusPrefix.buttonListDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={addButton}
            disabled={!config.enabled || config.buttons.length >= 25}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t('statusPrefix.addButton')}
          </button>
        </div>

        {sortedButtons.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {t('statusPrefix.noButtons')}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedButtons.map((btn, idx, arr) => (
              <div
                key={btn.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                {/* 버튼 카드 헤더: 순서 이동 + 타입 배지 + 삭제 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => moveButton(btn.id, 'up')}
                      disabled={idx === 0}
                      aria-label={t('statusPrefix.moveUp')}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveButton(btn.id, 'down')}
                      disabled={idx === arr.length - 1}
                      aria-label={t('statusPrefix.moveDown')}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ▼
                    </button>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        btn.type === 'PREFIX'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {btn.type === 'PREFIX' ? t('statusPrefix.typePrefixLabel') : t('statusPrefix.typeResetLabel')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeButton(btn.id)}
                    aria-label={t('statusPrefix.deleteButton')}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    {t('statusPrefix.deleteButton')}
                  </button>
                </div>

                {/* 버튼 카드 바디: 필드 그리드 */}
                <div className="grid grid-cols-2 gap-3">

                  {/* 버튼 타입 선택 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('statusPrefix.buttonType')}
                    </label>
                    <select
                      value={btn.type}
                      onChange={(e) =>
                        updateButton(btn.id, {
                          // select onChange: value는 런타임에 StatusPrefixButtonType 멤버만 가능
                        type: e.target.value as StatusPrefixButtonType,
                          prefix:
                            e.target.value === 'RESET' ? null : btn.prefix,
                        })
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="PREFIX">{t('statusPrefix.typePrefixOption')}</option>
                      <option value="RESET">{t('statusPrefix.typeResetOption')}</option>
                    </select>
                  </div>

                  {/* 버튼 라벨 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('statusPrefix.buttonLabelRequired')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={btn.label}
                      onChange={(e) =>
                        updateButton(btn.id, { label: e.target.value })
                      }
                      placeholder="예: 관전 적용"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* 이모지 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('statusPrefix.buttonEmoji')}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={btn.emoji ?? ''}
                        onChange={(e) =>
                          updateButton(btn.id, {
                            emoji: e.target.value || null,
                          })
                        }
                        placeholder="예: 👁"
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <GuildEmojiPicker
                        emojis={emojis}
                        onSelect={(val) => updateButton(btn.id, { emoji: val })}
                        disabled={!config.enabled}
                      />
                    </div>
                  </div>

                  {/* 접두사 텍스트 — PREFIX 타입일 때만 활성화 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {btn.type === 'PREFIX' ? t('statusPrefix.buttonPrefixRequired') : t('statusPrefix.buttonPrefixText')}
                      {btn.type === 'PREFIX' && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={btn.prefix ?? ''}
                      onChange={(e) =>
                        updateButton(btn.id, {
                          prefix: e.target.value || null,
                        })
                      }
                      disabled={btn.type === 'RESET'}
                      placeholder="예: 관전"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    />
                    {btn.type === 'RESET' && (
                      <p className="text-xs text-gray-400 mt-1">
                        {t('statusPrefix.buttonResetNote')}
                      </p>
                    )}
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 저장 버튼 + 피드백 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {saveSuccess && (
            <p className="text-sm text-green-600 font-medium">
              {t('statusPrefix.saveSuccess')}
            </p>
          )}
          {saveError && (
            <p className="text-sm text-red-600 font-medium">{saveError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !selectedGuildId}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
