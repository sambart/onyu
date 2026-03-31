"use client";

import { Loader2, RefreshCw, Server, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import GuildEmojiPicker from "../../../../components/GuildEmojiPicker";
import type { DiscordChannel, DiscordEmoji } from "../../../../lib/discord-api";
import { fetchGuildChannels, fetchGuildEmojis } from "../../../../lib/discord-api";
import { useSettings } from "../../../SettingsContext";
import { ButtonCardGrid } from "./components/ButtonCardGrid";
import { ButtonEditModal } from "./components/ButtonEditModal";
import { InstantModeSettings } from "./components/InstantModeSettings";
import { ModeSelector } from "./components/ModeSelector";
import { PreviewPanel } from "./components/PreviewPanel";
import { StepSection } from "./components/StepSection";
import {
  type ButtonForm,
  type ConfigForm,
  DEFAULT_TAB_STATE,
  EMPTY_CONFIG,
  SAVE_SUCCESS_DURATION_MS,
  type TabState,
} from "./types";

// ─── 컴포넌트 ──────────────────────────────────────────────────

export default function AutoChannelSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations("settings");

  const [tabs, setTabs] = useState<ConfigForm[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabStates, setTabStates] = useState<Map<number, TabState>>(new Map());

  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 버튼 편집 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null);

  const embedDescRef = useRef<HTMLTextAreaElement>(null);

  const voiceChannels = channels.filter((c) => c.type === 2);
  const textChannels = channels.filter((c) => c.type === 0);
  const categories = channels.filter((c) => c.type === 4);

  // ─── 탭 상태 헬퍼 ─────────────────────────────────────────────

  const getTabState = (index: number): TabState =>
    tabStates.get(index) ?? DEFAULT_TAB_STATE;

  const setTabState = (index: number, partial: Partial<TabState>) => {
    setTabStates((prev) => {
      const next = new Map(prev);
      next.set(index, { ...(prev.get(index) ?? DEFAULT_TAB_STATE), ...partial });
      return next;
    });
  };

  // ─── 탭 데이터 헬퍼 ───────────────────────────────────────────

  const getCurrentTab = (): ConfigForm | undefined => tabs[activeTabIndex];

  const updateCurrentTab = (partial: Partial<ConfigForm>) => {
    setTabs((prev) =>
      prev.map((tab, i) => (i === activeTabIndex ? { ...tab, ...partial } : tab)),
    );
  };

  // ─── 데이터 로드 ──────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setTabs([]);
    setActiveTabIndex(0);
    setTabStates(new Map());

    void Promise.all([
      fetch(`/api/guilds/${selectedGuildId}/auto-channel`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetchGuildChannels(selectedGuildId),
      fetchGuildEmojis(selectedGuildId),
    ])
      .then(([configs, chs, ems]) => {
        setChannels(chs);
        setEmojis(ems);

        if (Array.isArray(configs) && configs.length > 0) {
          const loaded: ConfigForm[] = configs.map(
            (cfg: {
              id: number;
              name: string;
              triggerChannelId: string;
              mode?: string;
              instantCategoryId?: string | null;
              instantNameTemplate?: string | null;
              guideChannelId: string | null;
              guideMessage: string;
              embedTitle: string | null;
              embedColor: string | null;
              buttons: {
                label: string;
                emoji: string | null;
                targetCategoryId: string;
                channelNameTemplate: string | null;
                sortOrder: number;
                subOptions: {
                  label: string;
                  emoji: string | null;
                  channelNameTemplate: string;
                  sortOrder: number;
                }[];
              }[];
            }) => ({
              id: cfg.id,
              name: cfg.name ?? "",
              triggerChannelId: cfg.triggerChannelId ?? "",
              // API 응답의 mode 값을 타입 리터럴로 좁히기 위한 단언 — cfg.mode가 string이므로 필요
              mode: (cfg.mode === "instant" ? "instant" : "select") as "select" | "instant",
              instantCategoryId: cfg.instantCategoryId ?? "",
              instantNameTemplate: cfg.instantNameTemplate ?? "",
              guideChannelId: cfg.guideChannelId ?? "",
              guideMessage: cfg.guideMessage ?? "",
              embedTitle: cfg.embedTitle ?? "",
              embedColor: cfg.embedColor ?? "#5865F2",
              buttons: (cfg.buttons ?? [])
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((btn) => ({
                  label: btn.label,
                  emoji: btn.emoji ?? "",
                  targetCategoryId: btn.targetCategoryId,
                  channelNameTemplate: btn.channelNameTemplate ?? "",
                  subOptions: (btn.subOptions ?? [])
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((s) => ({
                      label: s.label,
                      emoji: s.emoji ?? "",
                      channelNameTemplate: s.channelNameTemplate,
                    })),
                })),
            }),
          );
          setTabs(loaded);
        } else {
          setTabs([{ ...EMPTY_CONFIG }]);
        }
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId]);

  const refreshChannels = async () => {
    if (!selectedGuildId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const [chs, ems] = await Promise.all([
        fetchGuildChannels(selectedGuildId, true),
        fetchGuildEmojis(selectedGuildId, true),
      ]);
      setChannels(chs);
      setEmojis(ems);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── 탭 관리 ──────────────────────────────────────────────────

  const addNewTab = () => {
    setTabs((prev) => [...prev, { ...EMPTY_CONFIG }]);
    setActiveTabIndex(tabs.length);
  };

  const handleDeleteTab = async (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs[idx];
    if (!tab) return;

    if (!window.confirm(t("common.deleteConfig"))) return;

    if (tab.id !== undefined) {
      if (!selectedGuildId) return;
      try {
        const res = await fetch(
          `/api/guilds/${selectedGuildId}/auto-channel/${tab.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          alert(t("common.deleteError", { status: res.status }));
          return;
        }
      } catch {
        alert(t("common.deleteNetworkError"));
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
    setActiveTabIndex((prev) => {
      if (tabs.length <= 1) return 0;
      if (prev >= idx && prev > 0) return prev - 1;
      return prev;
    });
  };

  // ─── 폼 헬퍼 ──────────────────────────────────────────────────

  const insertAtCursor = (insertText: string) => {
    const textarea = embedDescRef.current;
    const tab = getCurrentTab();
    const currentValue = tab?.guideMessage ?? "";

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue =
        currentValue.substring(0, start) + insertText + currentValue.substring(end);
      updateCurrentTab({ guideMessage: newValue });
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + insertText.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      updateCurrentTab({ guideMessage: currentValue + insertText });
    }
  };

  // ─── 버튼 모달 헬퍼 ──────────────────────────────────────────

  const openEditModal = (index: number) => {
    setEditingButtonIndex(index);
    setModalOpen(true);
  };

  const openAddModal = () => {
    setEditingButtonIndex(null);
    setModalOpen(true);
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
    setModalOpen(false);
  };

  const handleDeleteButton = (index: number) => {
    const tab = getCurrentTab();
    if (!tab) return;
    updateCurrentTab({ buttons: tab.buttons.filter((_, i) => i !== index) });
  };

  // ─── 검증 헬퍼 ─────────────────────────────────────────────────

  const validateSelectMode = (currentTab: ConfigForm): string | null => {
    if (!currentTab.guideChannelId) return t("autoChannel.validationGuideChannel");
    if (!currentTab.guideMessage.trim()) return t("autoChannel.validationGuideMessage");
    if (currentTab.buttons.length === 0) return t("autoChannel.validationButtonRequired");

    for (let i = 0; i < currentTab.buttons.length; i++) {
      const btn = currentTab.buttons[i];
      if (!btn.label.trim()) return t("autoChannel.validationButtonLabel", { index: i + 1 });
      if (!btn.targetCategoryId) return t("autoChannel.validationButtonCategory", { index: i + 1 });

      for (let j = 0; j < btn.subOptions.length; j++) {
        const sub = btn.subOptions[j];
        if (!sub.label.trim()) {
          return t("autoChannel.validationSubOptionLabel", { btnIndex: i + 1, subIndex: j + 1 });
        }
        if (!sub.channelNameTemplate.trim()) {
          return t("autoChannel.validationSubOptionTemplate", { btnIndex: i + 1, subIndex: j + 1 });
        }
      }
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

    // 공통 검증
    if (!currentTab.name.trim()) {
      setTabState(activeTabIndex, { saveError: t("autoChannel.validationName") });
      return;
    }
    if (!currentTab.triggerChannelId) {
      setTabState(activeTabIndex, { saveError: t("autoChannel.validationTriggerChannel") });
      return;
    }

    if (currentTab.mode === "instant") {
      if (!currentTab.instantCategoryId) {
        setTabState(activeTabIndex, { saveError: t("autoChannel.validationInstantCategory") });
        return;
      }
    } else {
      const selectError = validateSelectMode(currentTab);
      if (selectError) {
        setTabState(activeTabIndex, { saveError: selectError });
        return;
      }
    }

    setTabState(activeTabIndex, { isSaving: true, saveError: null, saveSuccess: false });

    const body =
      currentTab.mode === "instant"
        ? {
            name: currentTab.name,
            triggerChannelId: currentTab.triggerChannelId,
            mode: currentTab.mode,
            instantCategoryId: currentTab.instantCategoryId,
            instantNameTemplate: currentTab.instantNameTemplate || undefined,
            buttons: [],
          }
        : {
            name: currentTab.name,
            triggerChannelId: currentTab.triggerChannelId,
            mode: currentTab.mode,
            guideChannelId: currentTab.guideChannelId,
            guideMessage: currentTab.guideMessage,
            embedTitle: currentTab.embedTitle || null,
            embedColor: currentTab.embedColor || null,
            buttons: currentTab.buttons.map((b, i) => ({
              label: b.label,
              emoji: b.emoji.trim() || undefined,
              targetCategoryId: b.targetCategoryId,
              channelNameTemplate: b.channelNameTemplate || undefined,
              sortOrder: i,
              subOptions: b.subOptions.map((s, j) => ({
                label: s.label,
                emoji: s.emoji.trim() || undefined,
                channelNameTemplate: s.channelNameTemplate,
                sortOrder: j,
              })),
            })),
          };

    try {
      const res = await fetch(`/api/guilds/${selectedGuildId}/auto-channel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // fetch Response.json()은 unknown을 반환하므로 NestJS 에러 응답 형태로 단언
        const errorBody = (await res
          .json()
          .catch(() => null)) as { message?: string | string[] } | null;
        const detail = Array.isArray(errorBody?.message)
          ? errorBody.message[0]
          : errorBody?.message;
        throw new Error(detail ?? t("common.saveError"));
      }
      // 서버가 반환하는 성공 응답 형태: { configId: number }
      const data = (await res.json()) as { configId: number };
      setTabs((prev) =>
        prev.map((tab, i) =>
          i === activeTabIndex ? { ...tab, id: data.configId } : tab,
        ),
      );
      setTabState(activeTabIndex, { isSaving: false, saveSuccess: true });
      setTimeout(() => setTabState(activeTabIndex, { saveSuccess: false }), SAVE_SUCCESS_DURATION_MS);
    } catch (err) {
      setTabState(activeTabIndex, {
        isSaving: false,
        saveError: err instanceof Error ? err.message : t("common.saveError"),
      });
    }
  };

  // ─── 렌더링 ────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("autoChannel.title")}</h1>
        <section className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="flex flex-col items-center text-center py-8">
            <Server className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-sm text-gray-500">{t("common.selectServer")}</p>
          </div>
        </section>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("autoChannel.title")}</h1>
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
        <h1 className="text-2xl font-bold text-gray-900">{t("autoChannel.title")}</h1>
        <button
          type="button"
          onClick={refreshChannels}
          disabled={isRefreshing}
          title={t("common.refreshChannels")}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>{t("common.refreshChannels")}</span>
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
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <span>{tab.name.trim() || t("common.tabUnsaved")}</span>
            {tab.id !== undefined && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => handleDeleteTab(idx, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    // Radix UI 이벤트 타입 불일치 — React.MouseEvent로 변환
                    handleDeleteTab(idx, e as unknown as React.MouseEvent);
                  }
                }}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors"
                aria-label={t("autoChannel.deleteAriaLabel")}
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={addNewTab}
          className="px-4 py-3 text-sm font-medium text-indigo-500 border-b-2 border-transparent hover:text-indigo-700 hover:border-indigo-300 whitespace-nowrap transition-colors"
        >
          {t("common.tabAdd")}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {currentTab && (
        <>
          {/* STEP 1: 트리거 설정 */}
          <StepSection
            stepNumber={1}
            title={t("autoChannel.stepTrigger")}
            hasConnector={true}
          >
            {/* 설정 이름 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("autoChannel.configName")}
              </label>
              <input
                type="text"
                value={currentTab.name}
                onChange={(e) => updateCurrentTab({ name: e.target.value })}
                placeholder={t("autoChannel.configNamePlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 트리거 채널 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("autoChannel.triggerChannel")}
              </label>
              <p className="text-xs text-gray-400 mb-2">{t("autoChannel.triggerChannelDesc")}</p>
              <select
                value={currentTab.triggerChannelId}
                onChange={(e) => updateCurrentTab({ triggerChannelId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t("common.voiceChannelSelect")}</option>
                {voiceChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
              {voiceChannels.length === 0 && (
                <p className="text-xs text-amber-500 mt-1">{t("common.noVoiceChannels")}</p>
              )}
            </div>

            {/* 모드 선택 */}
            <ModeSelector
              value={currentTab.mode}
              onChange={(mode) => updateCurrentTab({ mode })}
            />
          </StepSection>

          {/* STEP 2 (instant 모드): 채널 생성 설정 */}
          {currentTab.mode === "instant" && (
            <StepSection stepNumber={2} title={t("autoChannel.stepChannelCreate")}>
              <InstantModeSettings
                instantCategoryId={currentTab.instantCategoryId}
                instantNameTemplate={currentTab.instantNameTemplate}
                categories={categories}
                onChange={(partial) => updateCurrentTab(partial)}
              />
            </StepSection>
          )}

          {/* STEP 2 (select 모드): 안내 메시지 설정 */}
          {currentTab.mode === "select" && (
            <>
              <StepSection
                stepNumber={2}
                title={t("autoChannel.stepGuideMessage")}
                hasConnector={true}
              >
                {/* 안내 메시지 채널 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("autoChannel.guideChannel")}
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    {t("autoChannel.guideChannelDesc")}
                  </p>
                  <select
                    value={currentTab.guideChannelId}
                    onChange={(e) => updateCurrentTab({ guideChannelId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{t("common.textChannelSelect")}</option>
                    {textChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        # {ch.name}
                      </option>
                    ))}
                  </select>
                  {textChannels.length === 0 && (
                    <p className="text-xs text-amber-500 mt-1">{t("common.noTextChannels")}</p>
                  )}
                </div>

                {/* Embed 설정 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">{t("autoChannel.embed")}</h3>

                  {/* Embed 제목 */}
                  <div>
                    <label
                      htmlFor={`ac-embed-title-${activeTabIndex}`}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {t("autoChannel.embedTitleOptional")}
                    </label>
                    <input
                      id={`ac-embed-title-${activeTabIndex}`}
                      type="text"
                      value={currentTab.embedTitle}
                      onChange={(e) => updateCurrentTab({ embedTitle: e.target.value })}
                      placeholder={t("autoChannel.embedTitlePlaceholder")}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Embed 설명 */}
                  <div>
                    <label
                      htmlFor={`ac-embed-desc-${activeTabIndex}`}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {t("autoChannel.embedDescRequired")}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      ref={embedDescRef}
                      id={`ac-embed-desc-${activeTabIndex}`}
                      value={currentTab.guideMessage}
                      onChange={(e) => updateCurrentTab({ guideMessage: e.target.value })}
                      placeholder={t("autoChannel.embedDescPlaceholder")}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <div className="flex items-center mt-2">
                      <GuildEmojiPicker
                        emojis={emojis}
                        onSelect={(val) => insertAtCursor(val)}
                      />
                    </div>
                  </div>

                  {/* Embed 색상 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t("common.embedColor")}
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={currentTab.embedColor}
                        onChange={(e) => updateCurrentTab({ embedColor: e.target.value })}
                        aria-label={t("common.embedColorPicker")}
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
                        aria-label={t("common.embedColorHex")}
                        className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* 미리보기 */}
                  <PreviewPanel
                    config={currentTab}
                    voiceChannels={voiceChannels}
                    categories={categories}
                  />
                </div>
              </StepSection>

              {/* STEP 3 (select 모드): 게임 선택 버튼 */}
              <StepSection stepNumber={3} title={t("autoChannel.stepButtonSetup")}>
                <p className="text-xs text-gray-500 mb-3">
                  {t("autoChannel.buttons", { count: currentTab.buttons.length })}
                </p>
                <ButtonCardGrid
                  buttons={currentTab.buttons}
                  categories={categories}
                  onEdit={openEditModal}
                  onDelete={handleDeleteButton}
                  onAdd={openAddModal}
                />
              </StepSection>
            </>
          )}

          {/* instant 모드 미리보기 */}
          {currentTab.mode === "instant" && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mt-0">
              <PreviewPanel
                config={currentTab}
                voiceChannels={voiceChannels}
                categories={categories}
              />
            </div>
          )}

          {/* 저장 */}
          <div className="flex items-center justify-between gap-4 mt-6">
            <div className="flex-1">
              {currentTabState.saveSuccess && (
                <p className="text-sm text-green-600 font-medium">{t("common.saveSuccess")}</p>
              )}
              {currentTabState.saveError && (
                <p className="text-sm text-red-600 font-medium">{currentTabState.saveError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={currentTabState.isSaving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {currentTabState.isSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </>
      )}

      {/* 버튼 편집 모달 */}
      <ButtonEditModal
        isOpen={modalOpen}
        button={editingButton}
        categories={categories}
        emojis={emojis}
        onSave={handleModalSave}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
