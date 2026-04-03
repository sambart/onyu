'use client';

import { useTranslations } from 'next-intl';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import type { MocoTemplate, NewbieConfig } from '../../../../../lib/newbie-api';
import CollapsibleSection from './CollapsibleSection';
import MocoTemplateSection from './MocoTemplateSection';

interface MocoTabProps {
  config: NewbieConfig;
  channels: DiscordChannel[];
  onChange: (partial: Partial<NewbieConfig>) => void;
  mocoTemplate: MocoTemplate;
  onMocoTemplateChange: (template: MocoTemplate) => void;
  onSaveMocoTemplate: () => void;
  isSavingMocoTemplate: boolean;
  mocoTemplateSaveError: string | null;
  mocoTemplateSaveSuccess: boolean;
}

export default function MocoTab({
  config,
  channels,
  onChange,
  mocoTemplate,
  onMocoTemplateChange,
  onSaveMocoTemplate,
  isSavingMocoTemplate,
  mocoTemplateSaveError,
  mocoTemplateSaveSuccess,
}: MocoTabProps) {
  const isEnabled = config.mocoEnabled;
  const t = useTranslations('settings');

  const resetPeriodLabels: Record<string, string> = {
    NONE: t('newbie.moco.labelNone'),
    MONTHLY: t('newbie.moco.labelMonthly'),
    CUSTOM: t('newbie.moco.labelCustom'),
  };

  /* ── 요약 텍스트 생성 ── */
  const basicSummary = [
    t('newbie.moco.newbieDaysSummary', { days: config.mocoNewbieDays ?? 30 }),
    config.mocoAllowNewbieHunter && t('newbie.moco.allowNewbieHunterSummary'),
    config.mocoRankChannelId
      ? `# ${channels.find((c) => c.id === config.mocoRankChannelId)?.name ?? '...'}`
      : null,
    config.mocoAutoRefreshMinutes != null &&
      t('newbie.moco.autoRefreshSummary', { minutes: config.mocoAutoRefreshMinutes }),
  ]
    .filter(Boolean)
    .join(' · ');

  const playCountParts: string[] = [];
  if (config.mocoPlayCountMinDurationMin != null)
    playCountParts.push(
      t('newbie.moco.playCountMinSummary', { minutes: config.mocoPlayCountMinDurationMin }),
    );
  if (config.mocoPlayCountIntervalMin != null)
    playCountParts.push(
      t('newbie.moco.playCountIntervalSummary', { minutes: config.mocoPlayCountIntervalMin }),
    );
  const playCountSummary =
    playCountParts.length > 0 ? playCountParts.join(' · ') : t('newbie.moco.inactive');

  const resetLabel =
    resetPeriodLabels[config.mocoResetPeriod ?? 'NONE'] ?? t('newbie.moco.labelNone');
  const scoreSummary = t('newbie.moco.scoreSummary', {
    session: config.mocoScorePerSession ?? 10,
    minute: config.mocoScorePerMinute ?? 1,
    unique: config.mocoScorePerUnique ?? 5,
    reset: resetLabel,
  });

  const embedSummary = (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-sm border border-gray-300"
        style={{ backgroundColor: config.mocoEmbedColor ?? '#5865F2' }}
      />
      <span>{config.mocoEmbedColor ?? '#5865F2'}</span>
    </span>
  );

  return (
    <div className="space-y-4">
      {/* 기능 활성화 토글 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{t('newbie.moco.toggle')}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('newbie.moco.toggleDesc')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={() => onChange({ mocoEnabled: !isEnabled })}
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
        <label htmlFor="moco-display-mode" className="block text-sm font-medium text-gray-700 mb-1">
          {t('newbie.moco.displayMode')}
        </label>
        <select
          id="moco-display-mode"
          value={config.mocoDisplayMode ?? 'EMBED'}
          onChange={(e) => onChange({ mocoDisplayMode: e.target.value as 'EMBED' | 'CANVAS' })}
          disabled={!isEnabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <option value="EMBED">{t('newbie.moco.displayModeEmbed')}</option>
          <option value="CANVAS">{t('newbie.moco.displayModeCanvas')}</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.displayModeDesc')}</p>
      </div>

      {/* ── 그룹 1: 기본 설정 (기본 펼침) ── */}
      <CollapsibleSection
        title={t('newbie.moco.basicSettings')}
        summary={basicSummary || undefined}
        defaultOpen
      >
        {/* 모코코 기준 일수 */}
        <div>
          <label
            htmlFor="moco-newbie-days"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.moco.newbieDays')}
          </label>
          <input
            id="moco-newbie-days"
            type="number"
            min={1}
            max={365}
            value={config.mocoNewbieDays ?? 30}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({ mocoNewbieDays: isNaN(val) ? null : val });
            }}
            disabled={!isEnabled}
            placeholder="30"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.newbieDaysDesc')}</p>
        </div>

        {/* 모코코도 사냥꾼 허용 토글 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">
              {t('newbie.moco.allowNewbieHunter')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('newbie.moco.allowNewbieHunterDesc')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={config.mocoAllowNewbieHunter}
            onClick={() => onChange({ mocoAllowNewbieHunter: !config.mocoAllowNewbieHunter })}
            disabled={!isEnabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              config.mocoAllowNewbieHunter ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                config.mocoAllowNewbieHunter ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 순위 표시 채널 */}
        <div>
          <label
            htmlFor="moco-rank-channel"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.moco.rankChannel')}
          </label>
          <select
            id="moco-rank-channel"
            value={config.mocoRankChannelId ?? ''}
            onChange={(e) => onChange({ mocoRankChannelId: e.target.value || null })}
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
          <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.rankChannelDesc')}</p>
          {channels.length === 0 && (
            <p className="text-xs text-amber-500 mt-1">{t('common.noChannels')}</p>
          )}
        </div>

        {/* 자동 갱신 간격 (분) */}
        <div>
          <label
            htmlFor="moco-auto-refresh"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.moco.autoRefreshMinutes')}
          </label>
          <input
            id="moco-auto-refresh"
            type="number"
            min={1}
            max={1440}
            value={config.mocoAutoRefreshMinutes ?? ''}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({ mocoAutoRefreshMinutes: isNaN(val) ? null : val });
            }}
            disabled={!isEnabled}
            placeholder="예: 30"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.autoRefreshMinutesDesc')}</p>
        </div>
      </CollapsibleSection>

      {/* ── 그룹 2: 플레이횟수 규칙 (기본 접힘) ── */}
      <CollapsibleSection title={t('newbie.moco.playCountRules')} summary={playCountSummary}>
        {/* 플레이횟수 최소 참여시간 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <input
              id="moco-play-count-min-duration-enabled"
              type="checkbox"
              checked={config.mocoPlayCountMinDurationMin !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ mocoPlayCountMinDurationMin: 30 });
                } else {
                  onChange({ mocoPlayCountMinDurationMin: null });
                }
              }}
              disabled={!isEnabled}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="moco-play-count-min-duration-enabled"
              className="text-sm font-medium text-gray-700"
            >
              {t('newbie.moco.playCountMinDuration')}
            </label>
          </div>
          <input
            id="moco-play-count-min-duration"
            type="number"
            min={1}
            max={9999}
            value={config.mocoPlayCountMinDurationMin ?? 30}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({
                mocoPlayCountMinDurationMin: isNaN(val) || val < 1 ? 30 : val,
              });
            }}
            disabled={!isEnabled || config.mocoPlayCountMinDurationMin === null}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.playCountMinDurationDesc')}</p>
        </div>

        {/* 플레이횟수 시간 간격 */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <input
              id="moco-play-count-interval-enabled"
              type="checkbox"
              checked={config.mocoPlayCountIntervalMin !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ mocoPlayCountIntervalMin: 30 });
                } else {
                  onChange({ mocoPlayCountIntervalMin: null });
                }
              }}
              disabled={!isEnabled}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="moco-play-count-interval-enabled"
              className="text-sm font-medium text-gray-700"
            >
              {t('newbie.moco.playCountInterval')}
            </label>
          </div>
          <input
            id="moco-play-count-interval"
            type="number"
            min={1}
            max={9999}
            value={config.mocoPlayCountIntervalMin ?? 30}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({
                mocoPlayCountIntervalMin: isNaN(val) || val < 1 ? 30 : val,
              });
            }}
            disabled={!isEnabled || config.mocoPlayCountIntervalMin === null}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.playCountIntervalDesc')}</p>
        </div>
      </CollapsibleSection>

      {/* ── 그룹 3: 점수 & 리셋 (기본 접힘) ── */}
      <CollapsibleSection title={t('newbie.moco.scoreAndReset')} summary={scoreSummary}>
        {/* 최소 동시접속 시간 */}
        <div>
          <label
            htmlFor="moco-min-co-presence"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.moco.minCoPresenceMin')}
          </label>
          <input
            id="moco-min-co-presence"
            type="number"
            min={1}
            value={config.mocoMinCoPresenceMin ?? 10}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onChange({ mocoMinCoPresenceMin: isNaN(val) ? null : val });
            }}
            disabled={!isEnabled}
            placeholder="10"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t('newbie.moco.minCoPresenceMinDesc')}</p>
        </div>

        {/* 점수 가중치 설정 */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">{t('newbie.moco.scoreWeights')}</p>
          <p className="text-xs text-gray-500">{t('newbie.moco.scoreWeightsDesc')}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="moco-score-per-session"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                {t('newbie.moco.scorePerSession')}
              </label>
              <input
                id="moco-score-per-session"
                type="number"
                min={0}
                value={config.mocoScorePerSession ?? 10}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange({ mocoScorePerSession: isNaN(val) ? null : val });
                }}
                disabled={!isEnabled}
                placeholder="10"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label
                htmlFor="moco-score-per-minute"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                {t('newbie.moco.scorePerMinute')}
              </label>
              <input
                id="moco-score-per-minute"
                type="number"
                min={0}
                value={config.mocoScorePerMinute ?? 1}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange({ mocoScorePerMinute: isNaN(val) ? null : val });
                }}
                disabled={!isEnabled}
                placeholder="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label
                htmlFor="moco-score-per-unique"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                {t('newbie.moco.scorePerUnique')}
              </label>
              <input
                id="moco-score-per-unique"
                type="number"
                min={0}
                value={config.mocoScorePerUnique ?? 5}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange({ mocoScorePerUnique: isNaN(val) ? null : val });
                }}
                disabled={!isEnabled}
                placeholder="5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* 리셋 주기 */}
        <div>
          <label
            htmlFor="moco-reset-period"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t('newbie.moco.resetPeriod')}
          </label>
          <select
            id="moco-reset-period"
            value={config.mocoResetPeriod ?? 'NONE'}
            onChange={(e) =>
              onChange({
                mocoResetPeriod: e.target.value === 'NONE' ? null : e.target.value,
              })
            }
            disabled={!isEnabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <option value="NONE">{t('newbie.moco.resetNone')}</option>
            <option value="MONTHLY">{t('newbie.moco.resetMonthly')}</option>
            <option value="CUSTOM">{t('newbie.moco.resetCustom')}</option>
          </select>
          {config.mocoResetPeriod === 'CUSTOM' && (
            <div className="mt-2">
              <label
                htmlFor="moco-reset-interval-days"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                {t('newbie.moco.resetIntervalDays')}
              </label>
              <input
                id="moco-reset-interval-days"
                type="number"
                min={1}
                value={config.mocoResetIntervalDays ?? 30}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onChange({
                    mocoResetIntervalDays: isNaN(val) ? null : val,
                  });
                }}
                disabled={!isEnabled}
                placeholder="30"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── 그룹 4: Embed 외관 & 템플릿 (Embed 모드 전용) ── */}
      {config.mocoDisplayMode !== 'CANVAS' && (
        <CollapsibleSection title={t('newbie.moco.embedSection')} summary={embedSummary}>
          {/* Embed 색상 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.embedColor')}
            </label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={config.mocoEmbedColor ?? '#5865F2'}
                onChange={(e) => onChange({ mocoEmbedColor: e.target.value })}
                disabled={!isEnabled}
                aria-label={t('common.embedColorPicker')}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1"
              />
              <input
                type="text"
                value={config.mocoEmbedColor ?? '#5865F2'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                    onChange({ mocoEmbedColor: val });
                  }
                }}
                disabled={!isEnabled}
                maxLength={7}
                placeholder="#5865F2"
                aria-label={t('common.embedColorHex')}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 템플릿 설정 섹션 */}
          <MocoTemplateSection
            template={mocoTemplate}
            onChange={onMocoTemplateChange}
            onSave={onSaveMocoTemplate}
            isSaving={isSavingMocoTemplate}
            saveError={mocoTemplateSaveError}
            saveSuccess={mocoTemplateSaveSuccess}
            isEnabled={isEnabled}
          />
        </CollapsibleSection>
      )}

      {/* ── Canvas 모드 안내 ── */}
      {config.mocoDisplayMode === 'CANVAS' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">{t('newbie.moco.canvasInfo')}</p>
        </div>
      )}
    </div>
  );
}
