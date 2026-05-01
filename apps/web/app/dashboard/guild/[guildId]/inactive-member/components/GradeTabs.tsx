'use client';

import { useTranslations } from 'next-intl';

import type { InactiveMemberGrade, InactiveMemberStats } from '@/app/lib/inactive-member-api';

type TabKey = InactiveMemberGrade | 'all';

interface Props {
  activeTab: TabKey;
  stats: InactiveMemberStats | null;
  onChange: (tab: TabKey) => void;
}

interface TabDef {
  key: TabKey;
  labelKey: string;
  count: number | null;
}

export default function GradeTabs({ activeTab, stats, onChange }: Props) {
  const t = useTranslations('dashboard');

  const tabs: TabDef[] = [
    { key: 'all', labelKey: 'inactive.tabs.all', count: null },
    {
      key: 'FULLY_INACTIVE',
      labelKey: 'inactive.tabs.fullyInactive',
      count: stats?.fullyInactiveCount ?? null,
    },
    {
      key: 'LOW_ACTIVE',
      labelKey: 'inactive.tabs.lowActive',
      count: stats?.lowActiveCount ?? null,
    },
    { key: 'DECLINING', labelKey: 'inactive.tabs.declining', count: stats?.decliningCount ?? null },
  ];

  return (
    <div role="tablist" className="flex flex-wrap gap-2 border-b border-border">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              isActive
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t(tab.labelKey)}
            {tab.count !== null && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
