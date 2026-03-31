'use client';

import { useTranslations } from 'next-intl';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DailyTrendItem } from '@/app/lib/diagnosis-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ActivityTrendChartProps {
  data: DailyTrendItem[];
}

/** YYYY-MM-DD → MM/DD */
function formatChartDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  return `${parts[1]}/${parts[2]}`;
}

/** 초 → 소수점 1자리 시간 */
function secToHour(sec: number): number {
  return Math.round((sec / 3600) * 10) / 10;
}

/** 초 → h:mm 형식 문자열 */
function secToHourMin(sec: number): string {
  const totalMin = Math.floor(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}시간 ${m}분`;
}

export default function ActivityTrendChart({ data }: ActivityTrendChartProps) {
  const t = useTranslations('dashboard');

  const chartData = data.map((d) => ({
    date: formatChartDate(d.date),
    voiceHours: secToHour(d.totalSec),
    activeUsers: d.activeUsers,
    _totalSec: d.totalSec,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('diagnosis.trend.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            {/* 좌측 Y축: 음성시간(시간) */}
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              unit="h"
            />
            {/* 우측 Y축: 활성유저 */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              unit="명"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const voiceItem = payload.find((p) => p.dataKey === 'voiceHours');
                const userItem = payload.find((p) => p.dataKey === 'activeUsers');
                // recharts Tooltip payload.payload 타입이 unknown이므로 as 단언 사용
                const rawSec =
                  (voiceItem?.payload as { _totalSec: number } | undefined)?._totalSec ?? 0;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm text-sm">
                    <p className="font-semibold text-gray-700 mb-1">{label}</p>
                    {voiceItem && (
                      <p style={{ color: voiceItem.color }}>
                        {t('diagnosis.trend.voiceHours')}: {secToHourMin(rawSec)}
                      </p>
                    )}
                    {userItem && (
                      <p style={{ color: userItem.color }}>
                        {t('diagnosis.trend.activeUsers')}: {String(userItem.value)}명
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Legend />
            <Bar
              yAxisId="right"
              dataKey="activeUsers"
              name={t('diagnosis.trend.activeUsers')}
              fill="var(--chart-2, #818CF8)"
              fillOpacity={0.6}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="voiceHours"
              name={t('diagnosis.trend.voiceHours')}
              stroke="var(--chart-1, #6366F1)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
