'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

import { formatNumber } from '../../../../../lib/format-utils';
import type { MocoRankItem } from '../../../../../lib/newbie-dashboard-api';
import MocoHunterDetail from './MocoHunterDetail';

interface MemberProfile {
  userName: string;
  avatarUrl: string | null;
}

interface MocoRankingTableProps {
  guildId: string;
  items: MocoRankItem[];
  profiles: Record<string, MemberProfile>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const TABLE_COL_SPAN = 7;
const AVATAR_PLACEHOLDER = 'https://cdn.discordapp.com/embed/avatars/0.png';

export default function MocoRankingTable({
  guildId,
  items,
  profiles,
  page,
  pageSize,
  total,
  onPageChange,
}: MocoRankingTableProps) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [expandedHunterId, setExpandedHunterId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleRowClick(hunterId: string) {
    setExpandedHunterId((prev) => (prev === hunterId ? null : hunterId));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                {t('newbie.moco.table.rank')}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                {t('newbie.moco.table.hunter')}
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                {t('newbie.moco.table.score')}
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                {t('newbie.moco.table.huntTime')}
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                {t('newbie.moco.table.sessions')}
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                {t('newbie.moco.table.assistedMoco')}
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                {t('newbie.moco.table.detail')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={TABLE_COL_SPAN}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  {t('newbie.moco.table.noData')}
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const rank = (page - 1) * pageSize + idx + 1;
                const profile = profiles[item.hunterId];
                const avatarUrl = profile?.avatarUrl ?? AVATAR_PLACEHOLDER;
                const userName = profile?.userName ?? item.hunterId;
                const isExpanded = expandedHunterId === item.hunterId;

                return (
                  <Fragment key={item.hunterId}>
                    <tr
                      className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${isExpanded ? 'bg-indigo-50' : ''}`}
                      onClick={() => handleRowClick(item.hunterId)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-700">{rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Image
                            src={avatarUrl}
                            alt={userName}
                            width={28}
                            height={28}
                            className="rounded-full"
                          />
                          <span className="text-sm text-gray-900">{userName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-indigo-700 tabular-nums">
                        {t('newbie.moco.stats.huntMinutes', {
                          minutes: formatNumber(item.score, locale),
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                        {t('newbie.moco.stats.huntMinutes', { minutes: item.channelMinutes })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                        {t('newbie.moco.stats.sessions', { count: item.sessionCount })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                        {t('newbie.moco.stats.mocoCount', { count: item.uniqueNewbieCount })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isExpanded ? (
                          <ChevronUp className="inline-block h-4 w-4 text-indigo-500" />
                        ) : (
                          <ChevronDown className="inline-block h-4 w-4 text-gray-400" />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <MocoHunterDetail
                        guildId={guildId}
                        hunterId={item.hunterId}
                        colSpan={TABLE_COL_SPAN}
                      />
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {t('common.pagination', { page, totalPages, total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('common.prev')}
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('common.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
