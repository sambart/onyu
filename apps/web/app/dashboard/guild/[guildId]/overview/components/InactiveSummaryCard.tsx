'use client';

import { ChevronRight, UserX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  grades: {
    fullyInactive: number;
    lowActive: number;
    declining: number;
  };
  guildId: string;
}

export default function InactiveSummaryCard({ grades, guildId }: Props) {
  const t = useTranslations('dashboard');
  const total = grades.fullyInactive + grades.lowActive + grades.declining;

  const items = [
    {
      label: t('overview.inactiveGrade.fullyInactive'),
      count: grades.fullyInactive,
      color: 'bg-red-500',
    },
    {
      label: t('overview.inactiveGrade.lowActive'),
      count: grades.lowActive,
      color: 'bg-orange-500',
    },
    {
      label: t('overview.inactiveGrade.declining'),
      count: grades.declining,
      color: 'bg-yellow-500',
    },
  ];

  return (
    <Link href={`/dashboard/guild/${guildId}/inactive-member`} className="block">
      <Card className="transition-colors hover:ring-indigo-300">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <UserX className="h-5 w-5" />
              {t('overview.inactiveGrade.title')}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">
                  {item.count}
                  {t('common.unit.person')}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${item.color}`}
                  style={{
                    width: total > 0 ? `${(item.count / total) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          ))}
          <div className="pt-2 border-t text-sm text-muted-foreground">
            {t('overview.inactiveGrade.total', { count: total })}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
