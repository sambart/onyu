import { RolePanelButtonStyle } from '@onyu/shared';
import { useTranslations } from 'next-intl';

interface StyleSelectorProps {
  value: RolePanelButtonStyle;
  onChange: (style: RolePanelButtonStyle) => void;
}

/** Discord 버튼 스타일별 색상 (미리보기 칩 표시용) */
const STYLE_COLORS: Record<RolePanelButtonStyle, string> = {
  [RolePanelButtonStyle.PRIMARY]: 'bg-indigo-500',
  [RolePanelButtonStyle.SECONDARY]: 'bg-gray-500',
  [RolePanelButtonStyle.SUCCESS]: 'bg-green-500',
  [RolePanelButtonStyle.DANGER]: 'bg-red-500',
};

const STYLE_OPTIONS: RolePanelButtonStyle[] = [
  RolePanelButtonStyle.PRIMARY,
  RolePanelButtonStyle.SECONDARY,
  RolePanelButtonStyle.SUCCESS,
  RolePanelButtonStyle.DANGER,
];

const STYLE_LABEL_KEYS: Record<RolePanelButtonStyle, string> = {
  [RolePanelButtonStyle.PRIMARY]: 'rolePanel.stylePrimary',
  [RolePanelButtonStyle.SECONDARY]: 'rolePanel.styleSecondary',
  [RolePanelButtonStyle.SUCCESS]: 'rolePanel.styleSuccess',
  [RolePanelButtonStyle.DANGER]: 'rolePanel.styleDanger',
};

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  const t = useTranslations('settings');

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{t('rolePanel.style')}</p>
      <div className="flex flex-wrap gap-2">
        {STYLE_OPTIONS.map((style) => (
          <button
            key={style}
            type="button"
            onClick={() => onChange(style)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
              value === style
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 text-gray-700 hover:border-indigo-300'
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full flex-shrink-0 ${STYLE_COLORS[style]}`}
              aria-hidden="true"
            />
            {t(STYLE_LABEL_KEYS[style])}
          </button>
        ))}
      </div>
    </div>
  );
}
