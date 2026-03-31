'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AiInsightPanelProps {
  insights: string | null;
  suggestions: string[];
  generatedAt: string | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const COOLDOWN_SEC = 600; // 10분

/** ISO 날짜 문자열 → 현재와의 차이(초) */
function diffSecFromNow(isoString: string): number {
  const generated = new Date(isoString).getTime();
  const now = Date.now();
  return Math.floor((now - generated) / 1000);
}

export default function AiInsightPanel({
  insights,
  suggestions,
  generatedAt,
  isLoading,
  onRefresh,
}: AiInsightPanelProps) {
  const t = useTranslations('dashboard');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!generatedAt) return;

    const timer = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [generatedAt]);

  // tick 또는 generatedAt 변경 시 매번 재계산
  const remainSec = generatedAt ? Math.max(0, COOLDOWN_SEC - diffSecFromNow(generatedAt)) : 0;
  void tick; // tick 변경이 리렌더링을 트리거하여 remainSec이 재계산됨

  const isCooldown = remainSec > 0;
  const cooldownMin = Math.floor(remainSec / 60);
  const cooldownSec = remainSec % 60;

  const lastAnalyzedMin = generatedAt ? Math.floor(diffSecFromNow(generatedAt) / 60) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{t('diagnosis.aiInsight.title')}</CardTitle>
          <div className="flex items-center gap-2">
            {isCooldown && (
              <span className="text-xs text-gray-400">
                {t('diagnosis.aiInsight.cooldown', {
                  minutes: cooldownMin,
                  seconds: cooldownSec,
                })}
              </span>
            )}
            {generatedAt && !isCooldown && (
              <span className="text-xs text-gray-400">
                {t('diagnosis.aiInsight.lastAnalyzed', { minutes: lastAnalyzedMin })}
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading || isCooldown}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {t('diagnosis.aiInsight.refresh')}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 animate-pulse">
              {t('diagnosis.aiInsight.loading')}
            </p>
            <div className="h-4 bg-gray-100 animate-pulse rounded w-full" />
            <div className="h-4 bg-gray-100 animate-pulse rounded w-5/6" />
            <div className="h-4 bg-gray-100 animate-pulse rounded w-4/6" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 인사이트 본문 */}
            {insights && insights.length > 0 ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {insights}
              </p>
            ) : (
              <p className="text-sm text-gray-400">{t('common.noData')}</p>
            )}

            {/* 개선 제안 */}
            {suggestions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {t('diagnosis.aiInsight.suggestions')}
                </h3>
                <ul className="space-y-1.5">
                  {suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
