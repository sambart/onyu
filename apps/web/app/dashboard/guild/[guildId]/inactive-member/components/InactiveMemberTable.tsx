'use client';

import { useTranslations } from 'next-intl';

import { formatMinutesI18n, gradeLabelI18n } from '@/app/lib/format-utils';
import type { InactiveMemberGrade, InactiveMemberItem } from '@/app/lib/inactive-member-api';
import { gradeBadgeClass } from '@/app/lib/inactive-member-api';
import { Card, CardContent } from '@/components/ui/card';

type TabKey = InactiveMemberGrade | 'all';

interface Props {
  tab: TabKey;
  items: InactiveMemberItem[];
  selectedIds: Set<string>;
  lowActiveThresholdMin?: number;
  onToggleSelect: (userId: string) => void;
  onToggleAll: (checked: boolean) => void;
}

const COLSPAN_BY_TAB: Record<TabKey, number> = {
  all: 6,
  FULLY_INACTIVE: 5,
  LOW_ACTIVE: 5,
  DECLINING: 7,
};

function formatIsoToDate(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 오늘 기준 iso 날짜까지 경과 일수를 반환. null이면 날짜 없음, 미래 날짜는 0으로 clamp. */
function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const MS_PER_DAY = 86_400_000;
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

/** 이전 대비 현재의 감소율(%). prev가 0 이하이면 null 반환. */
function decreaseRate(prev: number, current: number): number | null {
  if (prev <= 0) return null;
  const PERCENT = 100;
  return Math.round(((prev - current) / prev) * PERCENT);
}

/** 이전 대비 현재의 감소량(분). 음수는 0으로 clamp. */
function decreaseAmount(prev: number, current: number): number {
  return Math.max(0, prev - current);
}

const PERCENT_MAX = 100;

/** value / threshold 비율을 0~100 범위로 clamp하여 반환. */
function progressPercent(value: number, threshold: number): number {
  if (threshold <= 0) return 0;
  const ratio = (value / threshold) * PERCENT_MAX;
  if (ratio < 0) return 0;
  if (ratio > PERCENT_MAX) return PERCENT_MAX;
  return Math.round(ratio);
}

type TranslateFn = ReturnType<typeof useTranslations>;

interface RenderBodyCellsParams {
  tab: TabKey;
  item: InactiveMemberItem;
  lowActiveThresholdMin: number | undefined;
  t: TranslateFn;
  tc: TranslateFn;
}

function renderHeaderCells(tab: TabKey, t: TranslateFn) {
  if (tab === 'FULLY_INACTIVE') {
    return (
      <>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.nickname')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.lastVoiceDate')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.daysAbsentHeader')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.gradeChangedAt')}
        </th>
      </>
    );
  }
  if (tab === 'LOW_ACTIVE') {
    return (
      <>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.nickname')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.thresholdProgressHeader')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.lastVoiceDate')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.gradeChangedAt')}
        </th>
      </>
    );
  }
  if (tab === 'DECLINING') {
    return (
      <>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.nickname')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.prevTotalMinutesHeader')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.decreaseRateHeader')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.decreaseAmountHeader')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.lastVoiceDate')}
        </th>
        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
          {t('inactive.table.gradeChangedAt')}
        </th>
      </>
    );
  }
  // tab === 'all'
  return (
    <>
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
        {t('inactive.table.nickname')}
      </th>
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
        {t('inactive.table.grade')}
      </th>
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
        {t('inactive.table.lastVoiceDate')}
      </th>
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
        {t('inactive.table.totalMinutes')}
      </th>
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
        {t('inactive.table.gradeChangedAt')}
      </th>
    </>
  );
}

function renderBodyCells({ tab, item, lowActiveThresholdMin, t, tc }: RenderBodyCellsParams) {
  if (tab === 'FULLY_INACTIVE') {
    const days = daysSince(item.lastVoiceDate);
    return (
      <>
        <td className="px-4 py-3 font-medium">{item.nickName}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {item.lastVoiceDate ?? t('inactive.table.noVoiceDate')}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {days === null
            ? t('inactive.table.noVoiceDate')
            : t('inactive.table.daysAbsent', { days })}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
      </>
    );
  }
  if (tab === 'LOW_ACTIVE') {
    const percent =
      lowActiveThresholdMin !== undefined
        ? progressPercent(item.totalMinutes, lowActiveThresholdMin)
        : null;
    return (
      <>
        <td className="px-4 py-3 font-medium">{item.nickName}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">
              {t('inactive.table.thresholdProgress', {
                current: item.totalMinutes,
                threshold: lowActiveThresholdMin ?? '?',
              })}
            </span>
            {lowActiveThresholdMin !== undefined && percent !== null && (
              <div
                className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-yellow-500" style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {item.lastVoiceDate ?? t('inactive.table.noVoiceDate')}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
      </>
    );
  }
  if (tab === 'DECLINING') {
    const rate = decreaseRate(item.prevTotalMinutes, item.totalMinutes);
    const amount = decreaseAmount(item.prevTotalMinutes, item.totalMinutes);
    return (
      <>
        <td className="px-4 py-3 font-medium">{item.nickName}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {t('inactive.table.prevTotalMinutes', {
            prev: item.prevTotalMinutes,
            current: item.totalMinutes,
          })}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{rate === null ? '-' : `${rate}%`}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {t('inactive.table.decreaseAmount', { minutes: amount })}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {item.lastVoiceDate ?? t('inactive.table.noVoiceDate')}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
      </>
    );
  }
  // tab === 'all'
  return (
    <>
      <td className="px-4 py-3 font-medium">{item.nickName}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${gradeBadgeClass(item.grade)}`}
        >
          {gradeLabelI18n(item.grade, (key) => t(`inactive.grade.${key}`))}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.lastVoiceDate ?? t('inactive.table.noVoiceDate')}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatMinutesI18n(item.totalMinutes, tc)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{formatIsoToDate(item.gradeChangedAt)}</td>
    </>
  );
}

export default function InactiveMemberTable({
  tab,
  items,
  selectedIds,
  lowActiveThresholdMin,
  onToggleSelect,
  onToggleAll,
}: Props) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const isAllSelected = items.length > 0 && items.every((item) => selectedIds.has(item.userId));

  const colSpan = COLSPAN_BY_TAB[tab];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => onToggleAll(e.target.checked)}
                    aria-label={t('inactive.table.selectAll')}
                    className="rounded border-gray-300"
                  />
                </th>
                {renderHeaderCells(tab, t)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                    {t('inactive.table.noData')}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.userId}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.userId)}
                        onChange={() => onToggleSelect(item.userId)}
                        aria-label={item.nickName}
                        className="rounded border-gray-300"
                      />
                    </td>
                    {renderBodyCells({ tab, item, lowActiveThresholdMin, t, tc })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
