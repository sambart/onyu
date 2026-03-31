import { ListChecks, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AutoChannelMode } from '../types';

interface ModeSelectorProps {
  value: AutoChannelMode;
  onChange: (mode: AutoChannelMode) => void;
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const t = useTranslations('settings');

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{t('autoChannel.modeLabel')}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('instant')}
          className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
            value === 'instant'
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          <Zap
            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              value === 'instant' ? 'text-indigo-600' : 'text-gray-400'
            }`}
          />
          <div>
            <p
              className={`text-sm font-semibold ${
                value === 'instant' ? 'text-indigo-700' : 'text-gray-700'
              }`}
            >
              {t('autoChannel.modeInstant')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('autoChannel.modeInstantDesc')}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange('select')}
          className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
            value === 'select'
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          <ListChecks
            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              value === 'select' ? 'text-indigo-600' : 'text-gray-400'
            }`}
          />
          <div>
            <p
              className={`text-sm font-semibold ${
                value === 'select' ? 'text-indigo-700' : 'text-gray-700'
              }`}
            >
              {t('autoChannel.modeSelect')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('autoChannel.modeSelectDesc')}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
