import { RolePanelButtonStyle } from '@onyu/shared';
import { useTranslations } from 'next-intl';

import type { PanelForm } from '../types';
import { MAX_BUTTONS_PER_ROW } from '../types';

interface PreviewPanelProps {
  panel: PanelForm;
}

/** Discord 버튼 스타일 → 미리보기 CSS 클래스 */
const STYLE_CLASS: Record<RolePanelButtonStyle, string> = {
  [RolePanelButtonStyle.PRIMARY]: 'bg-indigo-500 text-white',
  [RolePanelButtonStyle.SECONDARY]: 'bg-gray-500 text-white',
  [RolePanelButtonStyle.SUCCESS]: 'bg-green-600 text-white',
  [RolePanelButtonStyle.DANGER]: 'bg-red-500 text-white',
};

export function PreviewPanel({ panel }: PreviewPanelProps) {
  const t = useTranslations('settings');

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{t('common.preview')}</p>
      <div className="bg-[#2B2D31] rounded-lg p-4">
        <div
          className="bg-[#313338] rounded-md overflow-hidden"
          style={{ borderLeft: `4px solid ${panel.embedColor || '#5865F2'}` }}
        >
          <div className="p-4">
            {panel.embedTitle && (
              <p className="text-white font-semibold text-sm mb-1 break-words">
                {panel.embedTitle}
              </p>
            )}
            {panel.embedDescription ? (
              <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">
                {panel.embedDescription}
              </p>
            ) : (
              <p className="text-gray-500 text-xs italic">{t('common.noDescription')}</p>
            )}

            {/* 버튼 미리보기 — 5개씩 줄바꿈 */}
            {panel.buttons.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {Array.from(
                  { length: Math.ceil(panel.buttons.length / MAX_BUTTONS_PER_ROW) },
                  (_, rowIdx) => (
                    <div key={rowIdx} className="flex flex-wrap gap-1.5">
                      {panel.buttons
                        .slice(rowIdx * MAX_BUTTONS_PER_ROW, (rowIdx + 1) * MAX_BUTTONS_PER_ROW)
                        .map((btn, btnIdx) => (
                          <span
                            key={btnIdx}
                            className={`px-3 py-1 text-xs rounded font-medium ${STYLE_CLASS[btn.style]}`}
                          >
                            {btn.emoji ? `${btn.emoji} ` : ''}
                            {btn.label || t('common.noLabel')}
                          </span>
                        ))}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
