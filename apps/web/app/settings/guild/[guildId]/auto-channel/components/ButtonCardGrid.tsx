import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { DiscordChannel } from '../../../../../lib/discord-api';
import type { ButtonForm } from '../types';
import { MAX_BUTTONS } from '../types';

interface ButtonCardGridProps {
  buttons: ButtonForm[];
  categories: DiscordChannel[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}

function getCategoryName(categories: DiscordChannel[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.name ?? categoryId;
}

export function ButtonCardGrid({
  buttons,
  categories,
  onEdit,
  onDelete,
  onAdd,
}: ButtonCardGridProps) {
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
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  className="p-1 text-indigo-500 hover:text-indigo-700 rounded"
                  aria-label={t('autoChannel.editButton')}
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
            {btn.targetCategoryId && (
              <p className="text-xs text-gray-500 truncate">
                {getCategoryName(categories, btn.targetCategoryId)}
              </p>
            )}
            {btn.subOptions.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {t('autoChannel.subOptionCount', { count: btn.subOptions.length })}
              </p>
            )}
          </div>
        ))}

        {!isMaxReached && (
          <button
            type="button"
            onClick={onAdd}
            className="border border-dashed border-gray-300 rounded-lg p-3 text-gray-400 hover:text-indigo-500 hover:border-indigo-400 transition-colors text-sm font-medium flex items-center justify-center min-h-[72px]"
          >
            {t('autoChannel.addButtonCard')}
          </button>
        )}
      </div>
      {buttons.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2 mt-2">
          {t('autoChannel.noButtons')}
        </p>
      )}
    </div>
  );
}
