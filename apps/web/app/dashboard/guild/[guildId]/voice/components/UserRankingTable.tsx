'use client';

import { useTranslations } from 'next-intl';

import { formatDurationSecI18n } from '@/app/lib/format-utils';
import type { VoiceUserStat } from '@/app/lib/voice-dashboard-api';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import UserSearchDropdown from './UserSearchDropdown';

const PAGE_SIZE = 20;

interface Props {
  data: VoiceUserStat[];
  guildId: string;
  page: number;
  onPageChange: (page: number) => void;
  profiles?: Record<string, { userName: string; avatarUrl: string | null }>;
  onUserSelect: (userId: string) => void;
}

export default function UserRankingTable({
  data,
  guildId,
  page,
  onPageChange,
  profiles,
  onUserSelect,
}: Props) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const offset = (page - 1) * PAGE_SIZE;
  const paged = data.slice(offset, offset + PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('voice.userRanking.title')}</CardTitle>
        <CardAction>
          <UserSearchDropdown guildId={guildId} onSelect={onUserSelect} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
            <span>{t('voice.userRanking.rank')}</span>
            <span className="col-span-2">{t('voice.userRanking.user')}</span>
            <span>{t('voice.userRanking.duration')}</span>
            <span>{t('voice.userRanking.micOn')}</span>
            <span>{t('voice.userRanking.alone')}</span>
          </div>
          {paged.map((user, index) => {
            const rank = offset + index + 1;
            const profile = profiles?.[user.userId];
            const avatarUrl = profile?.avatarUrl;
            const displayName = profile?.userName ?? user.userName;

            return (
              <div
                key={user.userId}
                className="grid grid-cols-6 gap-2 items-center text-sm py-1 cursor-pointer hover:bg-muted/50 rounded-sm transition-colors"
                onClick={() => onUserSelect(user.userId)}
              >
                <span>
                  {rank <= 3 ? (
                    <Badge variant={rank === 1 ? 'default' : 'secondary'}>{rank}</Badge>
                  ) : (
                    <span className="text-muted-foreground pl-2">{rank}</span>
                  )}
                </span>
                <span className="col-span-2 flex items-center gap-2 font-medium truncate">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold flex-shrink-0">
                      {displayName.charAt(0)}
                    </div>
                  )}
                  <span className="truncate">{displayName}</span>
                </span>
                <span>{formatDurationSecI18n(user.totalDurationSec, tc)}</span>
                <span>{formatDurationSecI18n(user.micOnSec, tc)}</span>
                <span className="text-muted-foreground">
                  {formatDurationSecI18n(user.aloneSec, tc)}
                </span>
              </div>
            );
          })}
          {paged.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {t('voice.userRanking.noData')}
            </p>
          )}
        </div>

        {/* 페이지네이션 */}
        {data.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-3 border-t mt-3">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted rounded hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.prev')}
            </button>
            <span className="text-xs text-muted-foreground">
              {t('voice.userRanking.page', { current: page, total: totalPages })}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted rounded hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.next')}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
