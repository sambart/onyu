'use client';

import { useTranslations } from 'next-intl';

import type { MeVoicePeriod } from '@/app/lib/me-voice-api';

type Period = MeVoicePeriod;

const PERIOD_7: Period = 7;
const PERIOD_15: Period = 15;
const PERIOD_30: Period = 30;
const PERIODS: Period[] = [PERIOD_7, PERIOD_15, PERIOD_30];

type PeriodTranslationKey = 'me.period.7d' | 'me.period.15d' | 'me.period.30d';

function getPeriodTranslationKey(period: Period): PeriodTranslationKey {
  if (period === PERIOD_7) return 'me.period.7d';
  if (period === PERIOD_15) return 'me.period.15d';
  return 'me.period.30d';
}

interface Props {
  selected: Period;
  onPeriodChange: (period: MeVoicePeriod) => void;
}

export default function PeriodSelector({ selected, onPeriodChange }: Props) {
  const t = useTranslations('dashboard');

  return (
    <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
      {PERIODS.map((period) => {
        const isSelected = selected === period;
        function handleClick() {
          onPeriodChange(period);
        }
        return (
          <button
            key={period}
            type="button"
            onClick={handleClick}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              isSelected
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(getPeriodTranslationKey(period))}
          </button>
        );
      })}
    </div>
  );
}
