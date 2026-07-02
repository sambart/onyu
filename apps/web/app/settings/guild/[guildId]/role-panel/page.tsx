'use client';

import { Loader2, RefreshCw, Server, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast';

import GuildEmojiPicker from '../../../../components/GuildEmojiPicker';
import { LastAppliedBadge } from '../../../../components/settings/LastAppliedBadge';
import { ReApplyButton } from '../../../../components/settings/ReApplyButton';
import { useUnsavedChangesGuard } from '../../../../components/settings/useUnsavedChangesGuard';
import type { DiscordChannel, DiscordEmoji } from '../../../../lib/discord-api';
import { fetchGuildChannels, fetchGuildEmojis } from '../../../../lib/discord-api';
import type { AssignableRole } from '../../../../lib/role-panel-api';
import {
  createRolePanel,
  deleteRolePanel,
  fetchAssignableRoles,
  fetchRolePanels,
  publishRolePanel,
  updateRolePanel,
} from '../../../../lib/role-panel-api';
import { useSettings } from '../../../SettingsContext';
import { ButtonCardGrid } from './components/ButtonCardGrid';
import { ButtonEditModal } from './components/ButtonEditModal';
import { PreviewPanel } from './components/PreviewPanel';
import { StepSection } from './components/StepSection';
import {
  type ButtonForm,
  DEFAULT_TAB_STATE,
  EMPTY_PANEL,
  MAX_BUTTONS,
  type PanelForm,
  SAVE_SUCCESS_DURATION_MS,
  type TabState,
} from './types';

// ─── 컴포넌트 ──────────────────────────────────────────────────

export default function RolePanelSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');
  const toast = useToast();

  const [tabs, setTabs] = useState<PanelForm[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabStates, setTabStates] = useState<Map<number, TabState>>(new Map());

  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<AssignableRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 버튼 편집 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null);

  const embedDescRef = useRef<HTMLTextAreaElement>(null);

  // 탭별 저장 스냅샷(로드/저장 직후 상태) — dirty 판정용. index를 키로 사용하며
  // 탭 추가/삭제 시 tabStates와 동일한 방식으로 재정렬한다.
  const savedSnapshotsRef = useRef<Map<number, string>>(new Map());
  const isDirty = tabs.some((tab, i) => JSON.stringify(tab) !== savedSnapshotsRef.current.get(i));
  useUnsavedChangesGuard(isDirty);

  const textChannels = channels.filter((c) => c.type === 0);

  // ─── 탭 상태 헬퍼 ─────────────────────────────────────────────

  const getTabState = (index: number): TabState => tabStates.get(index) ?? DEFAULT_TAB_STATE;

  const setTabState = (index: number, partial: Partial<TabState>) => {
    setTabStates((prev) => {
      const next = new Map(prev);
      next.set(index, { ...(prev.get(index) ?? DEFAULT_TAB_STATE), ...partial });
      return next;
    });
  };

  // ─── 탭 데이터 헬퍼 ───────────────────────────────────────────

  const getCurrentTab = (): PanelForm | undefined => tabs[activeTabIndex];

  const updateCurrentTab = (partial: Partial<PanelForm>) => {
    setTabs((prev) => prev.map((tab, i) => (i === activeTabIndex ? { ...tab, ...partial } : tab)));
  };

  // ─── 데이터 로드 ──────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setTabs([]);
    setActiveTabIndex(0);
    setTabStates(new Map());
    savedSnapshotsRef.current = new Map();

    void Promise.all([
      fetchRolePanels(selectedGuildId),
      fetchGuildChannels(selectedGuildId),
      fetchAssignableRoles(selectedGuildId),
      fetchGuildEmojis(selectedGuildId),
    ])
      .then(([panels, chs, roles, ems]) => {
        setChannels(chs);
        setAssignableRoles(roles);
        setEmojis(ems);

        if (Array.isArray(panels) && panels.length > 0) {
          const loaded: PanelForm[] = panels.map((cfg) => ({
            id: cfg.id,
            name: cfg.name ?? '',
            channelId: cfg.channelId ?? '',
            embedTitle: cfg.embedTitle ?? '',
            embedDescription: cfg.embedDescription ?? '',
            embedColor: cfg.embedColor ?? '#5865F2',
            published: cfg.published,
            messageId: cfg.messageId,
            lastAppliedAt: cfg.lastAppliedAt,
            buttons: (cfg.buttons ?? [])
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((btn) => ({
                label: btn.label,
                emoji: btn.emoji ?? '',
                roleId: btn.roleId,
                roleName: btn.roleName ?? '',
                mode: btn.mode,
                style: btn.style,
              })),
          }));
          setTabs(loaded);
          savedSnapshotsRef.current = new Map(loaded.map((tab, i) => [i, JSON.stringify(tab)]));
        } else {
          setTabs([{ ...EMPTY_PANEL }]);
          savedSnapshotsRef.current = new Map([[0, JSON.stringify(EMPTY_PANEL)]]);
        }
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  const handleRefresh = async () => {
    if (!selectedGuildId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [chs, roles, ems] = await Promise.all([
        fetchGuildChannels(selectedGuildId, true),
        fetchAssignableRoles(selectedGuildId, true),
        fetchGuildEmojis(selectedGuildId, true),
      ]);
      setChannels(chs);
      setAssignableRoles(roles);
      setEmojis(ems);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── 탭 관리 ──────────────────────────────────────────────────

  const handleAddNewTab = () => {
    const newIndex = tabs.length;
    setTabs((prev) => [...prev, { ...EMPTY_PANEL }]);
    savedSnapshotsRef.current.set(newIndex, JSON.stringify(EMPTY_PANEL));
    setActiveTabIndex(newIndex);
  };

  const handleDeleteTab = async (idx: number, e: React.SyntheticEvent) => {
    e.stopPropagation();
    const tab = tabs[idx];
    if (!tab) return;

    if (!window.confirm(t('rolePanel.deleteConfirm'))) return;

    if (tab.id !== undefined && selectedGuildId) {
      try {
        await deleteRolePanel(selectedGuildId, tab.id);
      } catch {
        toast.error(t('common.deleteNetworkError'));
        return;
      }
    }

    setTabs((prev) => prev.filter((_, i) => i !== idx));
    setTabStates((prev) => {
      const next = new Map<number, TabState>();
      prev.forEach((v, k) => {
        if (k < idx) next.set(k, v);
        else if (k > idx) next.set(k - 1, v);
      });
      return next;
    });
    const nextSnapshots = new Map<number, string>();
    savedSnapshotsRef.current.forEach((v, k) => {
      if (k < idx) nextSnapshots.set(k, v);
      else if (k > idx) nextSnapshots.set(k - 1, v);
    });
    savedSnapshotsRef.current = nextSnapshots;
    setActiveTabIndex((prev) => {
      if (tabs.length <= 1) return 0;
      if (prev >= idx && prev > 0) return prev - 1;
      return prev;
    });
  };

  // ─── embed 설명 커서 삽입 ────────────────────────────────────

  const insertAtCursor = (insertText: string) => {
    const textarea = embedDescRef.current;
    const tab = getCurrentTab();
    const currentValue = tab?.embedDescription ?? '';

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = currentValue.substring(0, start) + insertText + currentValue.substring(end);
      updateCurrentTab({ embedDescription: newValue });
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + insertText.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      updateCurrentTab({ embedDescription: currentValue + insertText });
    }
  };

  // ─── 버튼 모달 헬퍼 ──────────────────────────────────────────

  const handleOpenEditModal = (index: number) => {
    setEditingButtonIndex(index);
    setIsModalOpen(true);
  };

  const handleOpenAddModal = () => {
    setEditingButtonIndex(null);
    setIsModalOpen(true);
  };

  const handleModalSave = (button: ButtonForm) => {
    const tab = getCurrentTab();
    if (!tab) return;

    if (editingButtonIndex === null) {
      updateCurrentTab({ buttons: [...tab.buttons, button] });
    } else {
      updateCurrentTab({
        buttons: tab.buttons.map((b, i) => (i === editingButtonIndex ? button : b)),
      });
    }
    setIsModalOpen(false);
  };

  const handleDeleteButton = (index: number) => {
    const tab = getCurrentTab();
    if (!tab) return;
    updateCurrentTab({ buttons: tab.buttons.filter((_, i) => i !== index) });
  };

  const handleMoveButton = (index: number, direction: 'up' | 'down') => {
    const tab = getCurrentTab();
    if (!tab) return;
    const newButtons = [...tab.buttons];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newButtons.length) return;
    [newButtons[index], newButtons[swapIdx]] = [newButtons[swapIdx], newButtons[index]];
    updateCurrentTab({ buttons: newButtons });
  };

  // ─── 클라이언트 검증 ─────────────────────────────────────────

  const validatePanel = (currentTab: PanelForm): string | null => {
    if (!currentTab.name.trim()) return t('rolePanel.validationName');
    if (currentTab.buttons.length === 0) return t('rolePanel.validationButtonRequired');
    if (currentTab.buttons.length > MAX_BUTTONS) {
      return t('rolePanel.validationMaxButtons', { max: MAX_BUTTONS });
    }
    for (let i = 0; i < currentTab.buttons.length; i++) {
      const btn = currentTab.buttons[i];
      if (!btn.label.trim()) return t('rolePanel.validationButtonLabel', { index: i + 1 });
      if (!btn.roleId) return t('rolePanel.validationButtonRole', { index: i + 1 });
    }
    return null;
  };

  // ─── 저장 ──────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedGuildId) return;
    const currentTab = getCurrentTab();
    if (!currentTab) return;

    const currentState = getTabState(activeTabIndex);
    if (currentState.isSaving) return;

    const validationError = validatePanel(currentTab);
    if (validationError) {
      setTabState(activeTabIndex, { saveError: validationError });
      return undefined;
    }

    setTabState(activeTabIndex, {
      isSaving: true,
      saveError: null,
    });

    const dto = {
      name: currentTab.name,
      channelId: currentTab.channelId.trim() || null,
      embedTitle: currentTab.embedTitle.trim() || null,
      embedDescription: currentTab.embedDescription.trim() || null,
      embedColor: currentTab.embedColor || null,
      buttons: currentTab.buttons.map((b, i) => ({
        label: b.label,
        emoji: b.emoji.trim() || null,
        roleId: b.roleId,
        mode: b.mode,
        style: b.style,
        sortOrder: i,
      })),
    };

    try {
      let saved;
      if (currentTab.id === undefined) {
        saved = await createRolePanel(selectedGuildId, dto);
      } else {
        saved = await updateRolePanel(selectedGuildId, currentTab.id, dto);
      }

      const updatedTab: PanelForm = {
        ...currentTab,
        id: saved.id,
        published: saved.published,
        messageId: saved.messageId,
        lastAppliedAt: saved.lastAppliedAt,
      };
      setTabs((prev) => prev.map((tab, i) => (i === activeTabIndex ? updatedTab : tab)));
      savedSnapshotsRef.current.set(activeTabIndex, JSON.stringify(updatedTab));
      setTabState(activeTabIndex, { isSaving: false });
      toast.success(t('common.saveSuccess'));
      return saved.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.saveError');
      setTabState(activeTabIndex, { isSaving: false });
      toast.error(message);
      return undefined;
    }
  };

  // ─── 다시 반영 ──────────────────────────────────────────────────

  const handleReApply = async () => {
    if (!selectedGuildId) return;
    const currentTab = getCurrentTab();
    if (!currentTab || currentTab.id === undefined) return;

    const currentState = getTabState(activeTabIndex);
    if (currentState.isPublishing || currentState.isSaving) return;

    setTabState(activeTabIndex, {
      isPublishing: true,
      publishError: null,
      publishSuccess: false,
    });

    try {
      const result = await publishRolePanel(selectedGuildId, currentTab.id);
      setTabs((prev) =>
        prev.map((tab, i) =>
          i === activeTabIndex
            ? {
                ...tab,
                published: result.published,
                messageId: result.messageId,
                lastAppliedAt: result.lastAppliedAt,
              }
            : tab,
        ),
      );
      setTabState(activeTabIndex, { isPublishing: false, publishSuccess: true });
      setTimeout(
        () => setTabState(activeTabIndex, { publishSuccess: false }),
        SAVE_SUCCESS_DURATION_MS,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.apply.reApplyError');
      setTabState(activeTabIndex, { isPublishing: false, publishError: message });
    }
  };

  // ─── 렌더링 ────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('rolePanel.title')}</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('rolePanel.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  const currentTab = getCurrentTab();
  const currentTabState = getTabState(activeTabIndex);
  const editingButton =
    editingButtonIndex === null ? null : (currentTab?.buttons[editingButtonIndex] ?? null);

  return (
    <div className="max-w-3xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('rolePanel.title')}</h1>
        <button
          type="button"
          onClick={() => {
            void handleRefresh();
          }}
          disabled={isRefreshing}
          title={t('common.refreshRoles')}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{t('common.refreshRoles')}</span>
        </button>
      </div>

      {/* 탭 바 */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveTabIndex(idx)}
            className={`group flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTabIndex === idx
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{tab.name.trim() || t('common.tabUnsaved')}</span>
            {tab.id !== undefined && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  void handleDeleteTab(idx, e);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleDeleteTab(idx, e);
                  }
                }}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors"
                aria-label={t('rolePanel.deleteAriaLabel')}
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={handleAddNewTab}
          className="px-4 py-3 text-sm font-medium text-indigo-500 border-b-2 border-transparent hover:text-indigo-700 hover:border-indigo-300 whitespace-nowrap transition-colors"
        >
          {t('common.tabAdd')}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {currentTab && (
        <>
          {/* STEP 1: 기본정보 */}
          <StepSection stepNumber={1} title={t('rolePanel.stepBasic')} hasConnector>
            {/* 패널 이름 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('rolePanel.panelName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={currentTab.name}
                onChange={(e) => updateCurrentTab({ name: e.target.value })}
                placeholder={t('rolePanel.panelNamePlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 대상 채널 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('rolePanel.targetChannel')}
              </label>
              <p className="text-xs text-gray-400 mb-2">{t('rolePanel.targetChannelDesc')}</p>
              <select
                value={currentTab.channelId}
                onChange={(e) => updateCurrentTab({ channelId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('common.textChannelSelect')}</option>
                {textChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    # {ch.name}
                  </option>
                ))}
              </select>
              {textChannels.length === 0 && (
                <p className="text-xs text-amber-500 mt-1">{t('common.noTextChannels')}</p>
              )}
            </div>
          </StepSection>

          {/* STEP 2: Embed 설정 */}
          <StepSection stepNumber={2} title={t('rolePanel.stepEmbed')} hasConnector>
            <div className="space-y-4">
              {/* Embed 제목 */}
              <div>
                <label
                  htmlFor={`rp-embed-title-${activeTabIndex}`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('rolePanel.embedTitleOptional')}
                </label>
                <input
                  id={`rp-embed-title-${activeTabIndex}`}
                  type="text"
                  value={currentTab.embedTitle}
                  onChange={(e) => updateCurrentTab({ embedTitle: e.target.value })}
                  placeholder={t('rolePanel.embedTitlePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Embed 설명 */}
              <div>
                <label
                  htmlFor={`rp-embed-desc-${activeTabIndex}`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('rolePanel.embedDescOptional')}
                </label>
                <textarea
                  ref={embedDescRef}
                  id={`rp-embed-desc-${activeTabIndex}`}
                  value={currentTab.embedDescription}
                  onChange={(e) => updateCurrentTab({ embedDescription: e.target.value })}
                  placeholder={t('rolePanel.embedDescPlaceholder')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <div className="flex items-center mt-2">
                  <GuildEmojiPicker emojis={emojis} onSelect={(val) => insertAtCursor(val)} />
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
                    value={currentTab.embedColor}
                    onChange={(e) => updateCurrentTab({ embedColor: e.target.value })}
                    aria-label={t('common.embedColorPicker')}
                    className="h-9 w-16 border border-gray-300 rounded cursor-pointer p-1"
                  />
                  <input
                    type="text"
                    value={currentTab.embedColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                        updateCurrentTab({ embedColor: val });
                      }
                    }}
                    maxLength={7}
                    placeholder="#5865F2"
                    aria-label={t('common.embedColorHex')}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* 미리보기 */}
              <PreviewPanel panel={currentTab} />
            </div>
          </StepSection>

          {/* STEP 3: 버튼 목록 */}
          <StepSection stepNumber={3} title={t('rolePanel.stepButtons')}>
            <p className="text-xs text-gray-500 mb-3">
              {t('rolePanel.buttonCount', { count: currentTab.buttons.length })}
            </p>
            <ButtonCardGrid
              buttons={currentTab.buttons}
              onEdit={handleOpenEditModal}
              onDelete={handleDeleteButton}
              onMove={handleMoveButton}
              onAdd={handleOpenAddModal}
            />
          </StepSection>

          {/* 저장 액션 바 */}
          <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
            {/* 마지막 반영 배지 */}
            <div className="mb-3">
              <LastAppliedBadge at={currentTab.lastAppliedAt ?? null} variant="applied" />
            </div>

            {/* 메시지 영역 */}
            <div className="mb-3 min-h-[20px]">
              {currentTabState.saveError && (
                <p className="text-sm text-red-600 font-medium">{currentTabState.saveError}</p>
              )}
              {currentTabState.publishSuccess && (
                <p className="text-sm text-green-600 font-medium">
                  {t('common.apply.reApplySuccess')}
                </p>
              )}
              {currentTabState.publishError && (
                <p className="text-sm text-red-600 font-medium">{currentTabState.publishError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              {/* 다시 반영 버튼 — 저장된 적 없으면 비활성 */}
              <ReApplyButton onReApply={handleReApply} disabled={currentTab.id === undefined} />

              {/* 저장 버튼 (저장 = persist + 즉시 게시) */}
              <button
                type="button"
                onClick={() => {
                  void handleSave();
                }}
                disabled={currentTabState.isSaving || currentTabState.isPublishing}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {currentTabState.isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 버튼 편집 모달 */}
      <ButtonEditModal
        isOpen={isModalOpen}
        button={editingButton}
        roles={assignableRoles}
        emojis={emojis}
        onSave={handleModalSave}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
