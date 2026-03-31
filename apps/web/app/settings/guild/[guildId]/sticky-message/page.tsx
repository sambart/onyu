'use client';

import { Loader2, Pin, RefreshCw, Server, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import GuildEmojiPicker from '../../../../components/GuildEmojiPicker';
import type { DiscordChannel, DiscordEmoji } from '../../../../lib/discord-api';
import { fetchGuildEmojis, fetchGuildTextChannels } from '../../../../lib/discord-api';
import type { StickyMessageConfig, StickyMessageSaveDto } from '../../../../lib/sticky-message-api';
import {
  deleteStickyMessage,
  fetchStickyMessages,
  saveStickyMessage,
} from '../../../../lib/sticky-message-api';
import { useSettings } from '../../../SettingsContext';

// ─── 로컬 타입 ─────────────────────────────────────────────────────────────

/** 클라이언트 폼 상태 — 미저장 탭도 표현 가능 */
interface TabForm {
  /** DB ID. null이면 아직 저장되지 않은 신규 탭 */
  id: number | null;
  /** 임시 클라이언트 키 (React key용). 항상 존재 */
  clientKey: number;
  channelId: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  enabled: boolean;
  sortOrder: number;
}

/** 탭별 저장/삭제 상태 */
interface TabState {
  isSaving: boolean;
  isDeleting: boolean;
  saveSuccess: boolean;
  saveError: string | null;
}

const DEFAULT_TAB_STATE: TabState = {
  isSaving: false,
  isDeleting: false,
  saveSuccess: false,
  saveError: null,
};

const DEFAULT_EMBED_COLOR = '#5865F2';

// ─── 컴포넌트 ───────────────────────────────────────────────────────────────

export default function StickyMessageSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');

  const [tabs, setTabs] = useState<TabForm[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabStates, setTabStates] = useState<Map<number, TabState>>(new Map());
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** 각 탭의 embedDescription textarea ref — clientKey → ref */
  const embedDescRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  // ─── 탭 상태 헬퍼 ───────────────────────────────────────────────────────

  const getTabState = (clientKey: number): TabState =>
    tabStates.get(clientKey) ?? DEFAULT_TAB_STATE;

  const setTabState = (clientKey: number, partial: Partial<TabState>) => {
    setTabStates((prev) => {
      const next = new Map(prev);
      next.set(clientKey, { ...(prev.get(clientKey) ?? DEFAULT_TAB_STATE), ...partial });
      return next;
    });
  };

  // ─── 탭 라벨 헬퍼 ──────────────────────────────────────────────────────

  const getTabLabel = (tab: TabForm): string => {
    if (tab.channelId) {
      const ch = channels.find((c) => c.id === tab.channelId);
      if (ch) return `# ${ch.name}`;
    }
    return t('stickyMessage.newTab');
  };

  // ─── 초기 데이터 로드 ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setTabs([]);
    setTabStates(new Map());
    setActiveTabIndex(0);

    Promise.all([
      fetchStickyMessages(selectedGuildId).catch((): StickyMessageConfig[] => []),
      fetchGuildTextChannels(selectedGuildId).catch((): DiscordChannel[] => []),
      fetchGuildEmojis(selectedGuildId).catch((): DiscordEmoji[] => []),
    ])
      .then(([configs, chs, ems]) => {
        if (configs.length > 0) {
          const loaded: TabForm[] = configs.map((c) => ({
            id: c.id,
            clientKey: c.id,
            channelId: c.channelId,
            embedTitle: c.embedTitle ?? '',
            embedDescription: c.embedDescription ?? '',
            embedColor: c.embedColor ?? DEFAULT_EMBED_COLOR,
            enabled: c.enabled,
            sortOrder: c.sortOrder,
          }));
          setTabs(loaded);
        } else {
          // 설정이 없으면 빈 탭 1개 기본 표시
          setTabs([createEmptyTab(0)]);
        }
        setChannels(chs);
        setEmojis(ems);
      })
      .catch(() => {})  // 개별 fetch에 이미 .catch() 적용됨
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  // ─── 채널 새로고침 ────────────────────────────────────────────────────────

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

  // ─── 탭 CRUD ────────────────────────────────────────────────────────────

  const createEmptyTab = (sortOrder: number): TabForm => ({
    id: null,
    clientKey: -Date.now(),
    channelId: '',
    embedTitle: '',
    embedDescription: '',
    embedColor: DEFAULT_EMBED_COLOR,
    enabled: true,
    sortOrder,
  });

  const addTab = () => {
    const maxOrder = tabs.reduce((m, t) => Math.max(m, t.sortOrder), -1);
    const newTab = createEmptyTab(maxOrder + 1);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabIndex(tabs.length); // 새 탭으로 포커스
  };

  const updateTab = (clientKey: number, patch: Partial<TabForm>) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.clientKey === clientKey ? { ...tab, ...patch } : tab)),
    );
  };

  // ─── 이모지 삽입 (커서 위치) ──────────────────────────────────────────────

  const insertEmojiAtCursor = (clientKey: number, insertText: string) => {
    const textarea = embedDescRefs.current.get(clientKey);
    const tab = tabs.find((tab) => tab.clientKey === clientKey);
    if (!tab) return;
    const currentValue = tab.embedDescription;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue =
        currentValue.substring(0, start) + insertText + currentValue.substring(end);
      updateTab(clientKey, { embedDescription: newValue });
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + insertText.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      updateTab(clientKey, { embedDescription: currentValue + insertText });
    }
  };

  // ─── 저장 핸들러 ──────────────────────────────────────────────────────────

  const handleSave = async (clientKey: number) => {
    const tab = tabs.find((tab) => tab.clientKey === clientKey);
    if (!tab || !selectedGuildId) return;

    const state = getTabState(clientKey);
    if (state.isSaving) return;

    // 유효성 검사: channelId 필수
    if (!tab.channelId) {
      setTabState(clientKey, { saveError: t('stickyMessage.validationChannel') });
      return;
    }

    setTabState(clientKey, { isSaving: true, saveError: null, saveSuccess: false });

    const payload: StickyMessageSaveDto = {
      id: tab.id,
      channelId: tab.channelId,
      embedTitle: tab.embedTitle || null,
      embedDescription: tab.embedDescription || null,
      embedColor: tab.embedColor,
      enabled: tab.enabled,
      sortOrder: tab.sortOrder,
    };

    try {
      const saved = await saveStickyMessage(selectedGuildId, payload);
      // 저장 후 id를 DB id로 갱신 (신규 탭의 경우 null → 실제 id로 교체)
      setTabs((prev) =>
        prev.map((t) => (t.clientKey === clientKey ? { ...t, id: saved.id } : t)),
      );
      setTabState(clientKey, { isSaving: false, saveSuccess: true });
      setTimeout(() => setTabState(clientKey, { saveSuccess: false }), 3000);
    } catch (err) {
      setTabState(clientKey, {
        isSaving: false,
        saveError: err instanceof Error ? err.message : t('common.saveError'),
      });
    }
  };

  // ─── 삭제 핸들러 ──────────────────────────────────────────────────────────

  const handleDelete = async (tabIndex: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tab = tabs[tabIndex];
    if (!tab || !selectedGuildId) return;

    // 미저장 탭(id === null)는 API 호출 없이 바로 제거
    if (tab.id === null) {
      removeTabAtIndex(tabIndex);
      return;
    }

    const confirmed = window.confirm(t('stickyMessage.deleteConfirm'));
    if (!confirmed) return;

    setTabState(tab.clientKey, { isDeleting: true, saveError: null });

    try {
      await deleteStickyMessage(selectedGuildId, tab.id);
      removeTabAtIndex(tabIndex);
      setTabStates((prev) => {
        const next = new Map(prev);
        next.delete(tab.clientKey);
        return next;
      });
    } catch (err) {
      setTabState(tab.clientKey, {
        isDeleting: false,
        saveError: err instanceof Error ? err.message : t('stickyMessage.deleteError'),
      });
    }
  };

  const removeTabAtIndex = (tabIndex: number) => {
    setTabs((prev) => {
      const next = prev.filter((_, i) => i !== tabIndex);
      // 탭이 모두 삭제되면 빈 탭 1개 추가
      if (next.length === 0) {
        return [createEmptyTab(0)];
      }
      return next;
    });
    // 활성 탭 인덱스 조정
    setActiveTabIndex((prev) => {
      if (tabIndex < prev) return prev - 1;
      if (tabIndex === prev) return Math.max(0, tabIndex - 1);
      return prev;
    });
  };

  // ─── 조건부 렌더링 ────────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('stickyMessage.title')}</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('stickyMessage.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  const activeTab = tabs[activeTabIndex];
  const activeState = activeTab ? getTabState(activeTab.clientKey) : DEFAULT_TAB_STATE;

  // ─── 메인 렌더링 ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Pin className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('stickyMessage.title')}</h1>
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

      {/* 탭 바 */}
      <div className="flex border-b border-gray-200 mb-0 overflow-x-auto">
        {tabs.map((tab, idx) => (
          <button
            key={tab.clientKey}
            type="button"
            onClick={() => setActiveTabIndex(idx)}
            className={`group flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTabIndex === idx
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{getTabLabel(tab)}</span>
            {!(tabs.length === 1 && tab.id === null && !tab.channelId) && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => handleDelete(idx, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    // Radix UI 이벤트 타입 불일치 — React.MouseEvent로 변환
                    handleDelete(idx, e as unknown as React.MouseEvent);
                  }
                }}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors"
                aria-label={t('stickyMessage.tabDeleteAriaLabel')}
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={addTab}
          className="px-4 py-3 text-sm font-medium text-indigo-500 border-b-2 border-transparent hover:text-indigo-700 hover:border-indigo-300 whitespace-nowrap transition-colors"
        >
          {t('common.tabAdd')}
        </button>
      </div>

      {/* 활성 탭 설정 폼 */}
      {activeTab && (
        <section className="bg-white rounded-b-xl border border-t-0 border-gray-200 p-6">
          <div className="space-y-6">
            {/* 섹션: 채널 설정 */}
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('stickyMessage.channelSettings')}</h2>
              <div className="space-y-4">

                {/* 텍스트 채널 선택 */}
                <div>
                  <label
                    htmlFor={`sm-channel-${activeTab.clientKey}`}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('stickyMessage.textChannelRequired')}
                  </label>
                  <select
                    id={`sm-channel-${activeTab.clientKey}`}
                    value={activeTab.channelId}
                    onChange={(e) =>
                      updateTab(activeTab.clientKey, { channelId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      {t('stickyMessage.noChannels')}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {t('stickyMessage.textChannelDesc')}
                  </p>
                </div>

                {/* 기능 활성화 토글 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t('stickyMessage.enableFeature')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('stickyMessage.enableFeatureDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeTab.enabled}
                    onClick={() =>
                      updateTab(activeTab.clientKey, { enabled: !activeTab.enabled })
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      activeTab.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        activeTab.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

              </div>
            </div>

            {/* 구분선 */}
            <hr className="border-gray-100" />

            {/* 섹션: Embed 설정 */}
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('stickyMessage.embedSettings')}</h2>
              <div className="space-y-4">

                {/* Embed 제목 */}
                <div>
                  <label
                    htmlFor={`sm-title-${activeTab.clientKey}`}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('common.embedTitle')}
                  </label>
                  <input
                    id={`sm-title-${activeTab.clientKey}`}
                    type="text"
                    value={activeTab.embedTitle}
                    onChange={(e) =>
                      updateTab(activeTab.clientKey, { embedTitle: e.target.value })
                    }
                    placeholder="예: 공지 안내"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Embed 설명 */}
                <div>
                  <label
                    htmlFor={`sm-desc-${activeTab.clientKey}`}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {t('common.embedDescription')}
                  </label>
                  <textarea
                    ref={(el) => {
                      if (el) {
                        embedDescRefs.current.set(activeTab.clientKey, el);
                      } else {
                        embedDescRefs.current.delete(activeTab.clientKey);
                      }
                    }}
                    id={`sm-desc-${activeTab.clientKey}`}
                    value={activeTab.embedDescription}
                    onChange={(e) =>
                      updateTab(activeTab.clientKey, { embedDescription: e.target.value })
                    }
                    placeholder="예: 이 채널은 공지 전용입니다."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex items-center mt-2">
                    <GuildEmojiPicker
                      emojis={emojis}
                      onSelect={(val) => insertEmojiAtCursor(activeTab.clientKey, val)}
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
                      value={activeTab.embedColor}
                      onChange={(e) =>
                        updateTab(activeTab.clientKey, { embedColor: e.target.value })
                      }
                      aria-label={t('common.embedColorPicker')}
                      className="h-9 w-16 border border-gray-300 rounded cursor-pointer p-1"
                    />
                    <input
                      type="text"
                      value={activeTab.embedColor}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                          updateTab(activeTab.clientKey, { embedColor: val });
                        }
                      }}
                      maxLength={7}
                      placeholder="#5865F2"
                      aria-label={t('common.embedColorHex')}
                      className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        borderLeft: `4px solid ${activeTab.embedColor || DEFAULT_EMBED_COLOR}`,
                      }}
                    >
                      <div className="p-4">
                        <p className="text-white font-semibold text-sm mb-1 break-words">
                          {activeTab.embedTitle || t('common.noTitle')}
                        </p>
                        <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">
                          {activeTab.embedDescription || t('common.noDescription')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* 탭 푸터: 저장 피드백 + 저장 버튼 */}
            <div className="flex items-center justify-between gap-4 pt-2">
              <div className="flex-1">
                {activeState.saveSuccess && (
                  <p className="text-sm text-green-600 font-medium">
                    {t('common.saveSuccess')}
                  </p>
                )}
                {activeState.saveError && (
                  <p className="text-sm text-red-600 font-medium">
                    {activeState.saveError}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSave(activeTab.clientKey)}
                disabled={activeState.isSaving || activeState.isDeleting}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {activeState.isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
