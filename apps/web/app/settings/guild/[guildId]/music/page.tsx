'use client';

import { Loader2, Music, RefreshCw, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import GuildEmojiPicker from '../../../../components/GuildEmojiPicker';
import type { DiscordChannel, DiscordEmoji } from '../../../../lib/discord-api';
import { fetchGuildEmojis, fetchGuildTextChannels } from '../../../../lib/discord-api';
import type {
  MusicButtonConfig,
  MusicButtonType,
  MusicChannelConfig,
  MusicChannelConfigSaveDto,
} from '../../../../lib/music-config-api';
import {
  fetchMusicConfig,
  resetMusicConfig,
  saveMusicConfig,
} from '../../../../lib/music-config-api';
import { useSettings } from '../../../SettingsContext';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const DEFAULT_EMBED_COLOR = '#5865F2';
const BUTTON_ROW_OPTIONS = [0, 1, 2, 3, 4] as const;

const DEFAULT_BUTTONS: MusicButtonConfig[] = [
  { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
  { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
  { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
  { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
  { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
  { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
  { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
];

// ─── 폼 타입 ─────────────────────────────────────────────────────────────────

interface FormState {
  channelId: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  embedThumbnailUrl: string;
  buttons: MusicButtonConfig[];
  enabled: boolean;
}

const DEFAULT_FORM: FormState = {
  channelId: '',
  embedTitle: '',
  embedDescription: '',
  embedColor: DEFAULT_EMBED_COLOR,
  embedThumbnailUrl: '',
  buttons: DEFAULT_BUTTONS,
  enabled: false,
};

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/** URL 형식 유효성 검사 (빈 문자열은 유효로 처리) */
function isValidUrl(url: string): boolean {
  if (!url) return true;
  return /^https?:\/\/.+/.test(url);
}

/** 서버 응답을 폼 상태로 변환한다 */
function configToFormState(cfg: MusicChannelConfig): FormState {
  return {
    channelId: cfg.channelId,
    embedTitle: cfg.embedTitle ?? '',
    embedDescription: cfg.embedDescription ?? '',
    embedColor: cfg.embedColor ?? DEFAULT_EMBED_COLOR,
    embedThumbnailUrl: cfg.embedThumbnailUrl ?? '',
    buttons: cfg.buttons.length > 0 ? cfg.buttons : DEFAULT_BUTTONS,
    enabled: cfg.enabled,
  };
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function MusicSettingsPage() {
  const { selectedGuildId } = useSettings();
  const t = useTranslations('settings');

  const [config, setConfig] = useState<FormState>(DEFAULT_FORM);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [thumbnailUrlError, setThumbnailUrlError] = useState<string | null>(null);

  const embedDescRef = useRef<HTMLTextAreaElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 언마운트 시 성공 메시지 타이머 정리
  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) clearTimeout(successTimerRef.current);
    };
  }, []);

  // ─── 초기 데이터 로드 ───────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedGuildId) return;

    setIsLoading(true);
    setConfig(DEFAULT_FORM);

    Promise.all([
      fetchMusicConfig(selectedGuildId).catch((): MusicChannelConfig | null => null),
      fetchGuildTextChannels(selectedGuildId).catch((): DiscordChannel[] => []),
      fetchGuildEmojis(selectedGuildId).catch((): DiscordEmoji[] => []),
    ])
      .then(([cfg, chs, ems]) => {
        if (cfg) setConfig(configToFormState(cfg));
        setChannels(chs);
        setEmojis(ems);
      })
      .catch((err: unknown) => {
        setSaveError(err instanceof Error ? err.message : t('common.loadError'));
      })
      .finally(() => setIsLoading(false));
  }, [selectedGuildId, t]);

  // ─── 채널 새로고침 ──────────────────────────────────────────────────────

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

  // ─── 이모지 삽입 (커서 위치) ────────────────────────────────────────────

  const insertAtCursor = (insertText: string) => {
    const textarea = embedDescRef.current;
    const currentValue = config.embedDescription;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = currentValue.substring(0, start) + insertText + currentValue.substring(end);
      setConfig((prev) => ({ ...prev, embedDescription: newValue }));
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + insertText.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      setConfig((prev) => ({
        ...prev,
        embedDescription: currentValue + insertText,
      }));
    }
  };

  // ─── 버튼 업데이트 헬퍼 ────────────────────────────────────────────────

  const updateButton = (type: MusicButtonType, patch: Partial<MusicButtonConfig>) => {
    setConfig((prev) => ({
      ...prev,
      buttons: prev.buttons.map((btn) => (btn.type === type ? { ...btn, ...patch } : btn)),
    }));
  };

  // ─── 저장 핸들러 ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedGuildId || isSaving) return;

    // 유효성 검사
    if (config.enabled && !config.channelId) {
      setSaveError(t('music.validationChannel'));
      return;
    }
    if (config.embedThumbnailUrl && !isValidUrl(config.embedThumbnailUrl)) {
      setSaveError(t('music.validationThumbnailUrl'));
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccessMessage(null);

    const payload: MusicChannelConfigSaveDto = {
      channelId: config.channelId,
      embedTitle: config.embedTitle || null,
      embedDescription: config.embedDescription || null,
      embedColor: config.embedColor,
      embedThumbnailUrl: config.embedThumbnailUrl || null,
      buttons: config.buttons,
      enabled: config.enabled,
    };

    try {
      const saved = await saveMusicConfig(selectedGuildId, payload);
      setConfig(configToFormState(saved));
      if (successTimerRef.current !== null) clearTimeout(successTimerRef.current);
      setSaveSuccessMessage(t('music.saveSuccess'));
      successTimerRef.current = setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 초기화 핸들러 ──────────────────────────────────────────────────────

  const handleReset = async () => {
    if (!selectedGuildId || isResetting) return;

    const confirmed = window.confirm(t('music.resetConfirm'));
    if (!confirmed) return;

    setIsResetting(true);
    setSaveError(null);
    setSaveSuccessMessage(null);

    try {
      const reset = await resetMusicConfig(selectedGuildId);
      setConfig(configToFormState(reset));
      if (successTimerRef.current !== null) clearTimeout(successTimerRef.current);
      setSaveSuccessMessage(t('music.resetSuccess'));
      successTimerRef.current = setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.saveError'));
    } finally {
      setIsResetting(false);
    }
  };

  // ─── 버튼 미리보기 렌더링 ──────────────────────────────────────────────

  const renderButtonPreview = () => {
    const activeButtons = config.buttons.filter((btn) => btn.enabled);
    if (activeButtons.length === 0) return null;

    // row 번호로 그룹핑
    const rowMap = new Map<number, MusicButtonConfig[]>();
    for (const btn of activeButtons) {
      const existing = rowMap.get(btn.row) ?? [];
      rowMap.set(btn.row, [...existing, btn]);
    }

    const sortedRows = [...rowMap.entries()].sort(([a], [b]) => a - b);

    return (
      <div className="mt-3 space-y-1">
        {sortedRows.map(([rowIndex, buttons]) => (
          <div key={rowIndex} className="flex flex-wrap gap-1">
            {buttons.map((btn) => (
              <span
                key={btn.type}
                className="px-2 py-1 bg-[#4F545C] text-white text-xs rounded font-medium"
              >
                {btn.emoji ? `${btn.emoji} ` : ''}
                {btn.label || t('common.noLabel')}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  };

  // ─── 조건부 렌더링 ──────────────────────────────────────────────────────

  if (!selectedGuildId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('music.title')}</h1>
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('music.title')}</h1>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      </div>
    );
  }

  // ─── 메인 렌더링 ────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Music className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">{t('music.title')}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshChannels();
          }}
          disabled={isRefreshing}
          title={t('common.refreshChannels')}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{t('common.refreshChannels')}</span>
        </button>
      </div>

      {/* 일시 중단 안내 배너 */}
      <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="flex items-start space-x-3">
          <span className="text-amber-500 text-lg flex-shrink-0">&#9888;</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">음악 기능 일시 중단</p>
            <p className="text-xs text-amber-700 mt-1">
              YouTube API 정책 변경으로 인해 음악 재생 기능이 일시 중단되었습니다. 복구 시점은
              미정이며, 아래 설정은 저장은 가능하지만 실제 재생에는 반영되지 않습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 섹션 1: 기본 설정 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('music.basicSettings')}</h2>
        <div className="space-y-6">
          {/* 기능 활성화 토글 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('music.enableFeature')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('music.enableFeatureDesc')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
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

          {/* 텍스트 채널 선택 */}
          <div>
            <label htmlFor="music-channel" className="block text-sm font-medium text-gray-700 mb-1">
              {t('music.channelLabel')}
            </label>
            <select
              id="music-channel"
              value={config.channelId}
              onChange={(e) => setConfig((prev) => ({ ...prev, channelId: e.target.value }))}
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
              <p className="text-xs text-gray-400 mt-1">{t('common.noChannels')}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{t('music.channelDesc')}</p>
          </div>
        </div>
      </section>

      {/* 섹션 2: 임베드 커스터마이징 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('music.embedSettings')}</h2>
        <div className="space-y-6">
          {/* Embed 제목 */}
          <div>
            <label
              htmlFor="music-embed-title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('common.embedTitle')}
            </label>
            <input
              id="music-embed-title"
              type="text"
              value={config.embedTitle}
              onChange={(e) => setConfig((prev) => ({ ...prev, embedTitle: e.target.value }))}
              disabled={!config.enabled}
              placeholder="예: 음악 플레이어"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Embed 설명 */}
          <div>
            <label
              htmlFor="music-embed-desc"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('common.embedDescription')}
            </label>
            <textarea
              ref={embedDescRef}
              id="music-embed-desc"
              value={config.embedDescription}
              onChange={(e) => setConfig((prev) => ({ ...prev, embedDescription: e.target.value }))}
              disabled={!config.enabled}
              placeholder="예: 아래 버튼을 눌러 음악을 검색하고 재생하세요."
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
                value={config.embedColor}
                onChange={(e) => setConfig((prev) => ({ ...prev, embedColor: e.target.value }))}
                disabled={!config.enabled}
                aria-label={t('common.embedColorPicker')}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1"
              />
              <input
                type="text"
                value={config.embedColor}
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

          {/* 썸네일 URL */}
          <div>
            <label
              htmlFor="music-thumbnail-url"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('music.thumbnailUrl')}
            </label>
            <input
              id="music-thumbnail-url"
              type="text"
              value={config.embedThumbnailUrl}
              onChange={(e) => {
                const val = e.target.value;
                setConfig((prev) => ({ ...prev, embedThumbnailUrl: val }));
                setThumbnailUrlError(
                  val && !isValidUrl(val) ? t('music.validationThumbnailUrl') : null,
                );
              }}
              disabled={!config.enabled}
              placeholder={t('music.thumbnailUrlPlaceholder')}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${
                thumbnailUrlError ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {thumbnailUrlError ? (
              <p className="text-xs text-red-500 mt-1">{thumbnailUrlError}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">{t('music.thumbnailUrlDesc')}</p>
            )}
          </div>

          {/* Embed 미리보기 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('common.preview')}</p>
            <div className="bg-[#2B2D31] rounded-lg p-4">
              <div
                className="bg-[#313338] rounded-md overflow-hidden"
                style={{
                  borderLeft: `4px solid ${config.embedColor || DEFAULT_EMBED_COLOR}`,
                }}
              >
                <div className="p-4 flex gap-4">
                  {/* 좌측: 텍스트 영역 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm mb-1 break-words">
                      {config.embedTitle || t('common.noTitle')}
                    </p>
                    <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">
                      {config.embedDescription || t('common.noDescription')}
                    </p>
                    {renderButtonPreview()}
                  </div>
                  {/* 우측: 썸네일 */}
                  {config.embedThumbnailUrl && isValidUrl(config.embedThumbnailUrl) && (
                    /* next/image 대신 img 사용 — 외부 URL이 미리 알려지지 않으므로 */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={config.embedThumbnailUrl}
                      alt="thumbnail"
                      className="w-16 h-16 rounded object-cover flex-shrink-0"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 섹션 3: 버튼 구성 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">{t('music.buttonSettings')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('music.buttonSettingsDesc')}</p>
        </div>

        <div className="space-y-3">
          {config.buttons.map((btn) => (
            <div key={btn.type} className="border border-gray-200 rounded-lg p-4">
              {/* 카드 헤더: 토글 + 타입 배지 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                    {t(`music.buttonType_${btn.type}`)}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={btn.enabled}
                  onClick={() => updateButton(btn.type, { enabled: !btn.enabled })}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                    btn.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      btn.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* 카드 바디: 필드 그리드 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 라벨 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('music.buttonLabel')}
                  </label>
                  <input
                    type="text"
                    value={btn.label}
                    onChange={(e) => updateButton(btn.type, { label: e.target.value })}
                    disabled={!btn.enabled}
                    placeholder={t(`music.buttonType_${btn.type}`)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                </div>

                {/* 이모지 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('music.buttonEmoji')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={btn.emoji}
                      onChange={(e) => updateButton(btn.type, { emoji: e.target.value })}
                      disabled={!btn.enabled}
                      placeholder="예: 🔍"
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    />
                    <GuildEmojiPicker
                      emojis={emojis}
                      onSelect={(val) => updateButton(btn.type, { emoji: val })}
                      disabled={!btn.enabled}
                    />
                  </div>
                </div>

                {/* Row 선택 */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t('music.buttonRow')}
                  </label>
                  <select
                    value={btn.row}
                    onChange={(e) => updateButton(btn.type, { row: Number(e.target.value) })}
                    disabled={!btn.enabled}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {BUTTON_ROW_OPTIONS.map((rowValue) => (
                      <option key={rowValue} value={rowValue}>
                        {t('music.buttonRowOption', { row: rowValue + 1 })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 섹션 4: 기본설정 초기화 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{t('music.resetSettings')}</h2>
        <p className="text-xs text-gray-500 mb-4">{t('music.resetSettingsDesc')}</p>
        <button
          type="button"
          onClick={() => {
            void handleReset();
          }}
          disabled={isResetting || !selectedGuildId}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isResetting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('music.resetResetting')}
            </span>
          ) : (
            t('music.resetButton')
          )}
        </button>
      </section>

      {/* 저장 버튼 + 피드백 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {saveSuccessMessage && (
            <p className="text-sm text-green-600 font-medium">{saveSuccessMessage}</p>
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
