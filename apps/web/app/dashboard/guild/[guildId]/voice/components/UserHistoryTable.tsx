'use client';

import { useLocale, useTranslations } from 'next-intl';

import { formatDateTime, formatDurationSecI18n } from '@/app/lib/format-utils';
import type { VoiceHistoryPage } from '@/app/lib/user-detail-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  data: VoiceHistoryPage | null;
  loading: boolean;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function UserHistoryTable({ data, loading, currentPage, onPageChange }: Props) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const locale = useLocale();
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('voice.userDetail.historyTable.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {/* 헤더 */}
              <div className="grid grid-cols-5 gap-2 border-b pb-2 text-sm font-medium text-muted-foreground">
                <span>{t('voice.userDetail.historyTable.category')}</span>
                <span>{t('voice.userDetail.historyTable.channel')}</span>
                <span>{t('voice.userDetail.historyTable.joinAt')}</span>
                <span>{t('voice.userDetail.historyTable.leftAt')}</span>
                <span>{t('voice.userDetail.historyTable.duration')}</span>
              </div>

              {/* 데이터 행 */}
              {data && data.items.length > 0 ? (
                data.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-5 gap-2 items-center text-sm py-1">
                    <span className="truncate text-muted-foreground">
                      {item.categoryName ?? t('voice.userDetail.historyTable.uncategorized')}
                    </span>
                    <span className="truncate font-medium">{item.channelName}</span>
                    <span className="text-muted-foreground">
                      {formatDateTime(item.joinAt, locale)}
                    </span>
                    <span className="text-muted-foreground">
                      {item.leftAt === null ? (
                        <Badge variant="secondary">
                          {t('voice.userDetail.historyTable.online')}
                        </Badge>
                      ) : (
                        formatDateTime(item.leftAt, locale)
                      )}
                    </span>
                    <span>
                      {item.durationSec === null
                        ? '-'
                        : formatDurationSecI18n(item.durationSec, tc)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  {t('voice.userDetail.historyTable.noData')}
                </p>
              )}
            </div>

            {/* 페이지네이션 */}
            {data && data.total > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {currentPage} / {totalPages} 페이지 (총 {data.total}건)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => onPageChange(currentPage - 1)}
                  >
                    {t('common.prev')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
