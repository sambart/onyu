'use client';

import { useTranslations } from 'next-intl';

interface HealthScoreGaugeProps {
  score: number;
  delta: number;
  diagnosis: string;
  isLoading: boolean;
  isDiagnosisLoading: boolean;
}

const SCORE_RED = '#EF4444';
const SCORE_YELLOW = '#EAB308';
const SCORE_GREEN = '#22C55E';

const GAUGE_RADIUS = 80;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
// 반원 게이지: 180도(π) 사용
const GAUGE_ARC = GAUGE_CIRCUMFERENCE / 2;

function getScoreColor(score: number): string {
  if (score >= 70) return SCORE_GREEN;
  if (score >= 40) return SCORE_YELLOW;
  return SCORE_RED;
}

export default function HealthScoreGauge({
  score,
  delta,
  diagnosis,
  isLoading,
  isDiagnosisLoading,
}: HealthScoreGaugeProps) {
  const t = useTranslations('dashboard');

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">
          {t('diagnosis.healthScore.title')}
        </h2>
        <div className="flex flex-col items-center gap-4">
          <div className="w-48 h-28 bg-gray-100 animate-pulse rounded-full" />
          <div className="w-3/4 h-4 bg-gray-100 animate-pulse rounded" />
          <div className="w-full h-12 bg-gray-100 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  const color = getScoreColor(clampedScore);
  // dashoffset: 0=꽉 참, GAUGE_ARC=빔
  const dashOffset = GAUGE_ARC - (clampedScore / 100) * GAUGE_ARC;
  const isPositive = delta >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-700 mb-4">
        {t('diagnosis.healthScore.title')}
      </h2>

      <div className="flex flex-col items-center gap-3">
        {/* SVG 반원 게이지 */}
        <div className="relative w-48 h-28 overflow-hidden">
          <svg
            viewBox="0 0 200 110"
            className="w-full h-full"
            aria-label={t('diagnosis.healthScore.ariaLabel', { score: clampedScore })}
          >
            {/* 배경 트랙 */}
            <path
              d="M 10 100 A 90 90 0 0 1 190 100"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="18"
              strokeLinecap="round"
            />
            {/* 점수 아크 */}
            <path
              d="M 10 100 A 90 90 0 0 1 190 100"
              fill="none"
              stroke={color}
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${GAUGE_ARC} ${GAUGE_CIRCUMFERENCE}`}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            {/* 중앙 점수 텍스트 */}
            <text x="100" y="92" textAnchor="middle" fontSize="36" fontWeight="700" fill={color}>
              {clampedScore}
            </text>
          </svg>
        </div>

        {/* delta */}
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {isPositive ? (
            <>
              <span className="text-green-500">▲</span>
              <span className="text-green-600">
                {t('diagnosis.healthScore.increase', { delta: Math.abs(delta) })}
              </span>
            </>
          ) : (
            <>
              <span className="text-red-500">▼</span>
              <span className="text-red-600">
                {t('diagnosis.healthScore.decrease', { delta: Math.abs(delta) })}
              </span>
            </>
          )}
          <span className="text-gray-400">{t('diagnosis.healthScore.vsPrev')}</span>
        </div>

        {/* AI 진단 텍스트 */}
        {isDiagnosisLoading ? (
          <div className="w-full border-t border-gray-100 pt-3">
            <div className="w-full h-4 bg-gray-100 animate-pulse rounded mb-2" />
            <div className="w-3/4 h-4 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : (
          diagnosis && (
            <p className="text-sm text-gray-600 text-center leading-relaxed border-t border-gray-100 pt-3 w-full">
              {diagnosis}
            </p>
          )
        )}
      </div>
    </div>
  );
}
