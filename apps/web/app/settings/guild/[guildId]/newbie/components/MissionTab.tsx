'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { DiscordChannel, DiscordEmoji } from '../../../../../lib/discord-api';
import type { MissionTemplate, NewbieConfig } from '../../../../../lib/newbie-api';
import CollapsibleSection from './CollapsibleSection';
import MissionTemplateSection from './MissionTemplateSection';

// ─── 내부 헬퍼 컴포넌트 ──────────────────────────────────────────────────────

interface MissionUseMicTimeFieldProps {
  value: boolean;
  initialValue: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

function MissionUseMicTimeField({
  value,
  initialValue,
  disabled,
  onChange,
}: MissionUseMicTimeFieldProps) {
  const t = useTranslations('settings');
  const isChanged = value !== initialValue;

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <input
          id="mission-use-mic-time"
          type="checkbox"
          checked={value}
          onChange={handleToggle}
          disabled={disabled}
          className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
        />
        <label htmlFor="mission-use-mic-time" className="text-sm font-medium text-gray-700">
          {t('newbie.mission.useMicTime')}
        </label>
      </div>
      <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.useMicTimeDesc')}</p>
      {isChanged && (
        <p
          role="alert"
          className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
        >
          {t('newbie.mission.useMicTimeWarning')}
        </p>
      )}
    </div>
  );
}

// ─── MissionTab ──────────────────────────────────────────────────────────────

interface MissionTabProps {
  config: NewbieConfig;
  channels: DiscordChannel[];
  emojis: DiscordEmoji[];
  onChange: (partial: Partial<NewbieConfig>) => void;
  missionTemplate: MissionTemplate;
  onMissionTemplateChange: (template: MissionTemplate) => void;
  onSaveMissionTemplate: () => void;
  isSavingMissionTemplate: boolean;
  missionTemplateSaveError: string | null;
  missionTemplateSaveSuccess: boolean;
}

export default function MissionTab({
  config,
  channels,
  onChange,
  missionTemplate,
  onMissionTemplateChange,
  onSaveMissionTemplate,
  isSavingMissionTemplate,
  missionTemplateSaveError,
  missionTemplateSaveSuccess,
}: MissionTabProps) {
  const isEnabled = config.missionEnabled;
  const t = useTranslations('settings');
  // 마운트 시점의 값을 보존해 "초기값과 다름" 경고 비교에 사용 (한 번만 캡처)
  const [initialUseMicTime] = useState<boolean>(config.missionUseMicTime);

  /* ── 요약 텍스트 생성 ── */
  const basicSummary = [
    config.missionDurationDays != null && `${config.missionDurationDays}일`,
    config.missionTargetPlaytimeHours != null && `목표 ${config.missionTargetPlaytimeHours}시간`,
    config.missionUseMicTime && t('newbie.mission.useMicTimeBadge'),
    config.missionTargetPlayCount != null && `목표 ${config.missionTargetPlayCount}회`,
    config.missionNotifyChannelId
      ? `# ${channels.find((c) => c.id === config.missionNotifyChannelId)?.name ?? '...'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const playCountParts: string[] = [];
  if (config.playCountMinDurationMin != null)
    playCountParts.push(`최소 ${config.playCountMinDurationMin}분`);
  if (config.playCountIntervalMin != null)
    playCountParts.push(`간격 ${config.playCountIntervalMin}분`);
  const playCountSummary =
    playCountParts.length > 0 ? playCountParts.join(' · ') : t('newbie.mission.inactive');

  const embedSummary = (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm border border-gray-300"
        style={{ backgroundColor: config.missionEmbedColor ?? '#57F287' }}
      />
      <span>{config.missionEmbedColor ?? '#57F287'}</span>
    </span>
  );

  return (
    <div className="space-y-4">
      {/* 기능 활성화 토글 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{t('newbie.mission.toggle')}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('newbie.mission.toggleDesc')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={() => onChange({ missionEnabled: !isEnabled })}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            isEnabled ? 'bg-indigo-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* 표시 방식 선택 */}
      <div>
        <label
          htmlFor="mission-display-mode"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('newbie.mission.displayMode')}
        </label>
        <select
          id="mission-display-mode"
          value={config.missionDisplayMode ?? 'EMBED'}
          onChange={(e) => onChange({ missionDisplayMode: e.target.value as 'EMBED' | 'CANVAS' })}
          disabled={!isEnabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <option value="EMBED">{t('newbie.mission.displayModeEmbed')}</option>
          <option value="CANVAS">{t('newbie.mission.displayModeCanvas')}</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.displayModeDesc')}</p>
      </div>

      {/* ── 그룹 1: 기본 설정 (기본 펼침) ── */}
      <CollapsibleSection
        title={t('newbie.mission.basicSettings')}
        summary={basicSummary || undefined}
        defaultOpen
      >
        {/* 미션 기간 (일수) */}
        <div>
          <label
            htmlFor="mission-duration-days"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.mission.durationDays')}
          </label>
          <input
            id="mission-duration-days"
            type="number"
            min={1}
            max={365}
            value={config.missionDurationDays ?? ''}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({ missionDurationDays: isNaN(val) ? null : val });
            }}
            disabled={!isEnabled}
            placeholder="예: 7"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.durationDaysDesc')}</p>
        </div>

        {/* 목표 플레이타임 (시간) */}
        <div>
          <label
            htmlFor="mission-target-playtime"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.mission.targetPlaytime')}
          </label>
          <input
            id="mission-target-playtime"
            type="number"
            min={1}
            max={9999}
            value={config.missionTargetPlaytimeHours ?? ''}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({ missionTargetPlaytimeHours: isNaN(val) ? null : val });
            }}
            disabled={!isEnabled}
            placeholder="예: 10"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.targetPlaytimeDesc')}</p>
        </div>

        {/* 마이크 ON 시간만 반영 */}
        <MissionUseMicTimeField
          value={config.missionUseMicTime}
          initialValue={initialUseMicTime}
          disabled={!isEnabled}
          onChange={(next) => onChange({ missionUseMicTime: next })}
        />

        {/* 목표 플레이횟수 (회) */}
        <div>
          <label
            htmlFor="mission-target-play-count"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.mission.targetPlayCount')}
          </label>
          <input
            id="mission-target-play-count"
            type="number"
            min={1}
            max={9999}
            value={config.missionTargetPlayCount ?? ''}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({ missionTargetPlayCount: isNaN(val) ? null : val });
            }}
            disabled={!isEnabled}
            placeholder={t('newbie.mission.targetPlayCountPlaceholder')}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.targetPlayCountDesc')}</p>
        </div>

        {/* 알림 채널 선택 */}
        <div>
          <label
            htmlFor="mission-notify-channel"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.mission.notifyChannel')}
          </label>
          <select
            id="mission-notify-channel"
            value={config.missionNotifyChannelId ?? ''}
            onChange={(e) => onChange({ missionNotifyChannelId: e.target.value || null })}
            disabled={!isEnabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <option value="">{t('common.channelSelect')}</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                # {ch.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.notifyChannelDesc')}</p>
          {channels.length === 0 && (
            <p className="text-xs text-amber-500 mt-1">{t('common.noChannels')}</p>
          )}
        </div>
      </CollapsibleSection>

      {/* ── 그룹 2: 플레이횟수 규칙 (기본 접힘) ── */}
      <CollapsibleSection title={t('newbie.mission.playCountRules')} summary={playCountSummary}>
        {/* 플레이횟수 최소 참여시간 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <input
              id="play-count-min-duration-enabled"
              type="checkbox"
              checked={config.playCountMinDurationMin !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ playCountMinDurationMin: 30 });
                } else {
                  onChange({ playCountMinDurationMin: null });
                }
              }}
              disabled={!isEnabled}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="play-count-min-duration-enabled"
              className="text-sm font-medium text-gray-700"
            >
              {t('newbie.mission.playCountMinDuration')}
            </label>
          </div>
          <input
            id="play-count-min-duration"
            type="number"
            min={1}
            max={9999}
            value={config.playCountMinDurationMin ?? 30}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({
                playCountMinDurationMin: isNaN(val) || val < 1 ? 30 : val,
              });
            }}
            disabled={!isEnabled || config.playCountMinDurationMin === null}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">
            {t('newbie.mission.playCountMinDurationDesc')}
          </p>
        </div>

        {/* 플레이횟수 시간 간격 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <input
              id="play-count-interval-enabled"
              type="checkbox"
              checked={config.playCountIntervalMin !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ playCountIntervalMin: 30 });
                } else {
                  onChange({ playCountIntervalMin: null });
                }
              }}
              disabled={!isEnabled}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="play-count-interval-enabled"
              className="text-sm font-medium text-gray-700"
            >
              {t('newbie.mission.playCountInterval')}
            </label>
          </div>
          <input
            id="play-count-interval"
            type="number"
            min={1}
            max={9999}
            value={config.playCountIntervalMin ?? 30}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({
                playCountIntervalMin: isNaN(val) || val < 1 ? 30 : val,
              });
            }}
            disabled={!isEnabled || config.playCountIntervalMin === null}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.mission.playCountIntervalDesc')}</p>
        </div>
      </CollapsibleSection>

      {/* ── 그룹 3: Embed 외관 & 템플릿 (Embed 모드에서만 표시) ── */}
      {config.missionDisplayMode !== 'CANVAS' && (
        <CollapsibleSection title={t('newbie.mission.embedSection')} summary={embedSummary}>
          {/* Embed 색상 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.embedColor')}
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={config.missionEmbedColor ?? '#57F287'}
                onChange={(e) => onChange({ missionEmbedColor: e.target.value })}
                disabled={!isEnabled}
                aria-label={t('common.embedColorPicker')}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1"
              />
              <input
                type="text"
                value={config.missionEmbedColor ?? '#57F287'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    onChange({ missionEmbedColor: val });
                  }
                }}
                disabled={!isEnabled}
                maxLength={7}
                placeholder="#57F287"
                aria-label={t('common.embedColorHex')}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 템플릿 설정 섹션 */}
          <MissionTemplateSection
            template={missionTemplate}
            onChange={onMissionTemplateChange}
            onSave={onSaveMissionTemplate}
            isSaving={isSavingMissionTemplate}
            saveError={missionTemplateSaveError}
            saveSuccess={missionTemplateSaveSuccess}
            isEnabled={isEnabled}
          />
        </CollapsibleSection>
      )}

      {/* Canvas 모드 안내 배너 */}
      {config.missionDisplayMode === 'CANVAS' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">{t('newbie.mission.canvasInfo')}</p>
        </div>
      )}
    </div>
  );
}
