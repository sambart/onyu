'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ChannelStatItem } from '@/app/lib/diagnosis-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ChannelAnalysisChartProps {
  channels: ChannelStatItem[];
}

type TabType = 'channel' | 'category';

interface CategoryAgg {
  name: string;
  totalSec: number;
  uniqueUsers: number;
}

const TOP_N = 10;

/** 초 → 소수점 1자리 시간 */
function secToHour(sec: number): number {
  return Math.round((sec / 3600) * 10) / 10;
}

interface ChartItem {
  name: string;
  voiceHours: number;
  uniqueUsers: number;
}

/** 상위 TOP_N개만 표시하고 나머지를 '기타(N개)'로 합산한다 */
function truncateWithOthers(items: ChartItem[], othersLabel: string): ChartItem[] {
  if (items.length <= TOP_N) return items;

  const top = items.slice(0, TOP_N);
  const rest = items.slice(TOP_N);
  const othersHours = rest.reduce((sum, item) => sum + item.voiceHours, 0);
  const othersUsers = new Set(rest.map((_, i) => i)).size; // 개별 채널 수

  top.push({
    name: `${othersLabel}(${rest.length})`,
    voiceHours: Math.round(othersHours * 10) / 10,
    uniqueUsers: othersUsers,
  });

  return top;
}

/** 채널 데이터를 카테고리별로 집계한다 */
function aggregateByCategory(
  channels: ChannelStatItem[],
  uncategorizedLabel: string,
): CategoryAgg[] {
  const byCategory = new Map<string, CategoryAgg>();

  for (const ch of channels) {
    const key = ch.categoryId ?? '__null__';
    const name = ch.categoryName ?? uncategorizedLabel;
    const existing = byCategory.get(key);
    if (existing) {
      existing.totalSec += ch.totalSec;
      existing.uniqueUsers += ch.uniqueUsers;
    } else {
      byCategory.set(key, { name, totalSec: ch.totalSec, uniqueUsers: ch.uniqueUsers });
    }
  }

  return Array.from(byCategory.values()).sort((a, b) => b.totalSec - a.totalSec);
}

export default function ChannelAnalysisChart({ channels }: ChannelAnalysisChartProps) {
  const t = useTranslations('dashboard');
  const [activeTab, setActiveTab] = useState<TabType>('channel');

  const uncategorizedLabel = t('diagnosis.channel.uncategorized');

  const sortedChannels = [...channels].sort((a, b) => b.totalSec - a.totalSec);
  const categoryData = aggregateByCategory(channels, uncategorizedLabel);

  const channelChartData = truncateWithOthers(
    sortedChannels.map((ch) => ({
      name: ch.channelName,
      voiceHours: secToHour(ch.totalSec),
      uniqueUsers: ch.uniqueUsers,
    })),
    t('diagnosis.channel.others'),
  );

  const categoryChartData = categoryData.map((cat) => ({
    name: cat.name,
    voiceHours: secToHour(cat.totalSec),
    uniqueUsers: cat.uniqueUsers,
  }));

  const chartData = activeTab === 'channel' ? channelChartData : categoryChartData;

  const tabs: { id: TabType; label: string }[] = [
    { id: 'channel', label: t('diagnosis.channel.tabByChannel') },
    { id: 'category', label: t('diagnosis.channel.tabByCategory') },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{t('diagnosis.channel.title')}</CardTitle>
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            {t('common.noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 60, left: 8, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                unit="h"
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={90}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0];
                  // recharts Tooltip payload.payload 타입이 unknown이므로 as 단언 사용
                  const users =
                    (item?.payload as { uniqueUsers: number } | undefined)?.uniqueUsers ?? 0;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm text-xs">
                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                      <p style={{ color: item?.color }}>
                        {t('diagnosis.trend.voiceHours')}: {String(item?.value)}h
                      </p>
                      <p className="text-gray-500">
                        {t('diagnosis.channel.users', { count: users })}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="voiceHours"
                name={t('diagnosis.trend.voiceHours')}
                fill="var(--chart-1, #6366F1)"
                fillOpacity={0.8}
                radius={[0, 4, 4, 0]}
              >
                <LabelList
                  dataKey="uniqueUsers"
                  position="right"
                  formatter={(v: unknown) =>
                    t('diagnosis.channel.users', { count: typeof v === 'number' ? v : 0 })
                  }
                  style={{ fontSize: 11, fill: '#6B7280' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
