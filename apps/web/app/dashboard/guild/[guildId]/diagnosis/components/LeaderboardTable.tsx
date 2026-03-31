'use client';

import { useTranslations } from 'next-intl';

import type { LeaderboardUser } from '@/app/lib/diagnosis-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LeaderboardTableProps {
  users: LeaderboardUser[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  onUserClick: (userId: string) => void;
  isLoading: boolean;
}

const LEADERBOARD_PAGE_SIZE = 10;

/** 초 → h:mm 형식 */
function secToHourMin(sec: number): string {
  const totalMin = Math.floor(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-yellow-100 text-yellow-700 font-bold';
  if (rank === 2) return 'bg-gray-100 text-gray-600 font-bold';
  if (rank === 3) return 'bg-orange-100 text-orange-600 font-bold';
  return 'text-gray-500';
}

export default function LeaderboardTable({
  users,
  total,
  page,
  onPageChange,
  onUserClick,
  isLoading,
}: LeaderboardTableProps) {
  const t = useTranslations('dashboard');

  const totalPages = Math.max(1, Math.ceil(total / LEADERBOARD_PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('diagnosis.leaderboard.title')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              // 스켈레톤 행: key는 인덱스로 충분
              <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 w-12">
                      {t('diagnosis.leaderboard.rank')}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">
                      {t('diagnosis.leaderboard.nickname')}
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">
                      {t('diagnosis.leaderboard.totalTime')}
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">
                      {t('diagnosis.leaderboard.micOnTime')}
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">
                      {t('diagnosis.leaderboard.activeDays')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-gray-400">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr
                        key={user.userId}
                        onClick={() => onUserClick(user.userId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') onUserClick(user.userId);
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`${user.nickName} 상세 보기`}
                        className="border-b border-gray-50 hover:bg-indigo-50 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${getRankBadgeClass(user.rank)}`}
                          >
                            {user.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.nickName}
                                width={28}
                                height={28}
                                className="rounded-full flex-shrink-0"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-indigo-600 text-xs font-semibold">
                                  {user.nickName.charAt(0)}
                                </span>
                              </div>
                            )}
                            <span className="font-medium text-gray-800 truncate max-w-[120px]">
                              {user.nickName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {secToHourMin(user.totalSec)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {secToHourMin(user.micOnSec)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{user.activeDays}일</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('diagnosis.leaderboard.prev')}
                </button>
                <span className="text-xs text-gray-500">
                  {t('diagnosis.leaderboard.page', { current: page, total: totalPages })}
                </span>
                <button
                  type="button"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('diagnosis.leaderboard.next')}
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
