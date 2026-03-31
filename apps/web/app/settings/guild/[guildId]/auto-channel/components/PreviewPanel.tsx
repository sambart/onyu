import { useTranslations } from 'next-intl';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import type { ConfigForm } from '../types';

interface PreviewPanelProps {
  config: ConfigForm;
  voiceChannels: DiscordChannel[];
  categories: DiscordChannel[];
}

export function PreviewPanel({ config, voiceChannels, categories }: PreviewPanelProps) {
  const t = useTranslations('settings');

  const triggerChannelName =
    voiceChannels.find((c) => c.id === config.triggerChannelId)?.name ?? null;

  if (config.mode === 'instant') {
    const categoryName =
      categories.find((c) => c.id === config.instantCategoryId)?.name ?? null;
    const exampleChannelName = config.instantNameTemplate
      ? config.instantNameTemplate.replace('{username}', 'username').replace('{n}', '1')
      : 'username의 채널';

    return (
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">{t('common.preview')}</p>
        <div className="bg-[#2B2D31] rounded-lg p-4 font-mono text-sm">
          {triggerChannelName && (
            <div className="flex items-center gap-2 text-gray-300 mb-2">
              <span className="text-gray-500">🔊</span>
              <span>{triggerChannelName}</span>
              <span className="text-xs text-indigo-400 ml-1">(트리거)</span>
            </div>
          )}
          {categoryName && (
            <div className="mt-1 ml-2">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <span className="text-[10px] uppercase tracking-wider">{categoryName}</span>
              </div>
              <div className="ml-3 flex items-center gap-2 text-indigo-300">
                <span className="text-gray-500">🔊</span>
                <span>{exampleChannelName}</span>
                <span className="text-xs text-gray-500 ml-1">(생성 예시)</span>
              </div>
            </div>
          )}
          {!triggerChannelName && !categoryName && (
            <p className="text-gray-500 text-xs">{t('common.noDescription')}</p>
          )}
        </div>
      </div>
    );
  }

  // select 모드: 기존 Embed 미리보기
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{t('common.preview')}</p>
      <div className="bg-[#2B2D31] rounded-lg p-4">
        <div
          className="bg-[#313338] rounded-md overflow-hidden"
          style={{ borderLeft: `4px solid ${config.embedColor || '#5865F2'}` }}
        >
          <div className="p-4">
            {config.embedTitle && (
              <p className="text-white font-semibold text-sm mb-1 break-words">
                {config.embedTitle}
              </p>
            )}
            <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">
              {config.guideMessage || t('common.noDescription')}
            </p>
            {config.buttons.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {config.buttons.map((btn, idx) => (
                  <span
                    key={idx}
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
        {triggerChannelName && (
          <div className="mt-3 pt-3 border-t border-gray-700 flex items-center gap-2 text-gray-400 text-xs">
            <span>🔊</span>
            <span>{triggerChannelName}</span>
            <span className="text-indigo-400">(트리거 채널)</span>
          </div>
        )}
      </div>
    </div>
  );
}
