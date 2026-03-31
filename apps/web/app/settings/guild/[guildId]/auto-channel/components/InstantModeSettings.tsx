import { useTranslations } from 'next-intl';

import type { DiscordChannel } from '../../../../../lib/discord-api';

interface InstantModeSettingsProps {
  instantCategoryId: string;
  instantNameTemplate: string;
  categories: DiscordChannel[];
  onChange: (partial: { instantCategoryId?: string; instantNameTemplate?: string }) => void;
}

export function InstantModeSettings({
  instantCategoryId,
  instantNameTemplate,
  categories,
  onChange,
}: InstantModeSettingsProps) {
  const t = useTranslations('settings');

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="instant-category-select"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('autoChannel.instantCategory')} <span className="text-red-500">*</span>
        </label>
        <select
          id="instant-category-select"
          value={instantCategoryId}
          onChange={(e) => onChange({ instantCategoryId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">{t('autoChannel.categorySelect')}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="instant-name-template-input"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {t('autoChannel.instantNameTemplate')}
        </label>
        <input
          id="instant-name-template-input"
          type="text"
          value={instantNameTemplate}
          onChange={(e) => onChange({ instantNameTemplate: e.target.value })}
          placeholder="{username}의 채널"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 mt-1">{t('autoChannel.instantNameTemplateDesc')}</p>
      </div>
    </div>
  );
}
