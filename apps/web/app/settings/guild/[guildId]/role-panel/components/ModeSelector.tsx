import { RolePanelButtonMode } from '@onyu/shared';
import { RefreshCw, ToggleLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ModeSelectorProps {
  value: RolePanelButtonMode;
  onChange: (mode: RolePanelButtonMode) => void;
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const t = useTranslations('settings');

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{t('rolePanel.mode')}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange(RolePanelButtonMode.GRANT)}
          className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
            value === RolePanelButtonMode.GRANT
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          <RefreshCw
            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              value === RolePanelButtonMode.GRANT ? 'text-indigo-600' : 'text-gray-400'
            }`}
          />
          <div>
            <p
              className={`text-sm font-semibold ${
                value === RolePanelButtonMode.GRANT ? 'text-indigo-700' : 'text-gray-700'
              }`}
            >
              {t('rolePanel.modeGrant')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('rolePanel.modeGrantDesc')}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange(RolePanelButtonMode.TOGGLE)}
          className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
            value === RolePanelButtonMode.TOGGLE
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300'
          }`}
        >
          <ToggleLeft
            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              value === RolePanelButtonMode.TOGGLE ? 'text-indigo-600' : 'text-gray-400'
            }`}
          />
          <div>
            <p
              className={`text-sm font-semibold ${
                value === RolePanelButtonMode.TOGGLE ? 'text-indigo-700' : 'text-gray-700'
              }`}
            >
              {t('rolePanel.modeToggle')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{t('rolePanel.modeToggleDesc')}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
