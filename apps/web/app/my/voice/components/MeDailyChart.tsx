'use client';

import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type { MeDailyChartEntry } from '@/app/lib/me-voice-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface Props {
  dailyChart: MeDailyChartEntry[];
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${m}/${d}`;
}

export default function MeDailyChart({ dailyChart }: Props) {
  const t = useTranslations('dashboard');

  const chartConfig = {
    durationMin: {
      label: t('me.dailyChart.durationMin'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  const chartData = dailyChart.map((entry) => ({
    date: formatDate(entry.date),
    durationMin: Math.round(entry.durationSec / 60),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('me.dailyChart.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="durationMin" fill="var(--color-durationMin)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
