import { RolePanelButtonStyle } from '@onyu/shared';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ButtonForm } from '../types';
import { MAX_BUTTONS } from '../types';

interface ButtonCardGridProps {
  buttons: ButtonForm[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onAdd: () => void;
}

/** Discord 버튼 스타일 → 색상 점 클래스 */
const STYLE_DOT_CLASS: Record<RolePanelButtonStyle, string> = {
  [RolePanelButtonStyle.PRIMARY]: 'bg-indigo-500',
  [RolePanelButtonStyle.SECONDARY]: 'bg-gray-500',
  [RolePanelButtonStyle.SUCCESS]: 'bg-green-500',
  [RolePanelButtonStyle.DANGER]: 'bg-red-500',
};

export function ButtonCardGrid({ buttons, onEdit, onDelete, onMove, onAdd }: ButtonCardGridProps) {
  const t = useTranslations('settings');
  const isMaxReached = buttons.length >= MAX_BUTTONS;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {buttons.map((btn, i) => (
          <div
            key={i}
            className="border border-gray-200 rounded-lg p-3 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {btn.emoji && <span className="flex-shrink-0 text-sm">{btn.emoji}</span>}
                <span className="font-medium text-sm text-gray-800 truncate">
                  {btn.label || t('common.noLabel')}
                </span>
                {/* 스타일 색상 점 */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${STYLE_DOT_CLASS[btn.style]}`}
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  className="p-1 text-indigo-500 hover:text-indigo-700 rounded"
                  aria-label={t('rolePanel.editButton')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(i)}
                  className="p-1 text-red-400 hover:text-red-600 rounded"
                  aria-label={t('common.deleteConfig')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 역할명 + 모드 뱃지 */}
            <div className="flex items-center gap-1.5 mt-1">
              {btn.roleName && <p className="text-xs text-gray-500 truncate">{btn.roleName}</p>}
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 flex-shrink-0">
                {btn.mode}
              </span>
            </div>

            {/* 순서 화살표 */}
            <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onMove(i, 'up')}
                disabled={i === 0}
                className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                aria-label="위로 이동"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onMove(i, 'down')}
                disabled={i === buttons.length - 1}
                className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                aria-label="아래로 이동"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

        {!isMaxReached && (
          <button
            type="button"
            onClick={onAdd}
            className="border border-dashed border-gray-300 rounded-lg p-3 text-gray-400 hover:text-indigo-500 hover:border-indigo-400 transition-colors text-sm font-medium flex items-center justify-center min-h-[72px]"
          >
            {t('rolePanel.addButtonCard')}
          </button>
        )}
      </div>

      {isMaxReached && (
        <p className="text-xs text-amber-600 text-center mt-2">
          {t('rolePanel.validationMaxButtons', { max: MAX_BUTTONS })}
        </p>
      )}

      {buttons.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2 mt-2">{t('rolePanel.noButtons')}</p>
      )}
    </div>
  );
}
