'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  type ChannelTypeFilter,
  computeCategoryStats,
  type VoiceAutoChannelGroupStat,
  type VoiceChannelStat,
  type VoiceDailyRecord,
} from '@/app/lib/voice-dashboard-api';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Props {
  data: VoiceChannelStat[];
  records: VoiceDailyRecord[];
  autoGroupStats: VoiceAutoChannelGroupStat[];
  channelTypeFilter: ChannelTypeFilter;
  onChannelTypeFilterChange: (filter: ChannelTypeFilter) => void;
}

type TabValue = 'channel' | 'category' | 'autoGroup';

const CHART_MIN_HEIGHT = 300;
const CHART_HEIGHT_PER_ITEM = 40;

const TAB_BASE = 'rounded-md px-2 py-1 text-sm font-medium transition-colors';
const TAB_ACTIVE = 'bg-background text-foreground shadow-sm';
const TAB_INACTIVE = 'text-muted-foreground hover:text-foreground';

export default function ChannelBarChart({
  data,
  records,
  autoGroupStats,
  channelTypeFilter,
  onChannelTypeFilterChange,
}: Props) {
  const t = useTranslations('dashboard');

  const chartConfig = {
    durationMin: {
      label: t('voice.channelChart.durationMin'),
      color: 'var(--chart-1)',
    },
    micOnMin: {
      label: t('voice.channelChart.micOnMin'),
      color: 'var(--chart-2)',
    },
    micOffMin: {
      label: t('voice.channelChart.micOffMin'),
      color: 'var(--chart-3)',
    },
  } satisfies ChartConfig;

  const [tab, setTab] = useState<TabValue>('channel');

  const channelChartData = data.slice(0, 10).map((d) => ({
    name: d.channelName || d.channelId.slice(0, 8),
    durationMin: Math.round(d.totalDurationSec / 60),
    micOnMin: Math.round(d.micOnSec / 60),
    micOffMin: Math.round(d.micOffSec / 60),
  }));

  const categoryChartData = computeCategoryStats(records)
    .slice(0, 10)
    .map((d) => ({
      name: d.categoryName,
      durationMin: Math.round(d.totalDurationSec / 60),
      micOnMin: Math.round(d.micOnSec / 60),
      micOffMin: Math.round(d.micOffSec / 60),
    }));

  const autoGroupChartData = autoGroupStats.slice(0, 10).map((d) => ({
    name: d.autoChannelConfigName,
    durationMin: Math.round(d.totalDurationSec / 60),
    micOnMin: 0,
    micOffMin: 0,
  }));

  const chartData =
    tab === 'channel'
      ? channelChartData
      : tab === 'category'
        ? categoryChartData
        : autoGroupChartData;

  const chartHeight = Math.max(CHART_MIN_HEIGHT, chartData.length * CHART_HEIGHT_PER_ITEM);

  // 채널 탭에서만 유형 필터 표시
  const isFilterVisible = tab === 'channel';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('voice.channelChart.title')}</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {isFilterVisible && (
              <Select
                value={channelTypeFilter}
                onValueChange={(v) => onChannelTypeFilterChange(v as ChannelTypeFilter)}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('voice.channelChart.filterAll')}</SelectItem>
                  <SelectItem value="permanent">
                    {t('voice.channelChart.filterPermanent')}
                  </SelectItem>
                  <SelectItem value="auto">{t('voice.channelChart.filterAuto')}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-[3px]">
              <button
                type="button"
                className={cn(TAB_BASE, tab === 'channel' ? TAB_ACTIVE : TAB_INACTIVE)}
                onClick={() => setTab('channel')}
              >
                {t('voice.channelChart.tabChannel')}
              </button>
              <button
                type="button"
                className={cn(TAB_BASE, tab === 'category' ? TAB_ACTIVE : TAB_INACTIVE)}
                onClick={() => setTab('category')}
              >
                {t('voice.channelChart.tabCategory')}
              </button>
              <button
                type="button"
                className={cn(TAB_BASE, tab === 'autoGroup' ? TAB_ACTIVE : TAB_INACTIVE)}
                onClick={() => setTab('autoGroup')}
              >
                {t('voice.channelChart.tabAutoGroup')}
              </button>
            </div>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tab === 'autoGroup' && autoGroupChartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            {t('common.noData')}
          </div>
        ) : (
          <ChartContainer config={chartConfig} style={{ height: chartHeight }} className="w-full">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={100}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: string) =>
                  value.length > 8 ? `${value.slice(0, 8)}…` : value
                }
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="durationMin" fill="var(--color-durationMin)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
