'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ActionType,
  InactiveMemberConfig,
  InactiveMemberGrade,
  InactiveMemberItem,
  InactiveMemberStats,
} from '@/app/lib/inactive-member-api';
import {
  classifyInactiveMembers,
  executeInactiveMemberAction,
  fetchInactiveMemberConfig,
  fetchInactiveMembers,
  fetchInactiveMemberStats,
} from '@/app/lib/inactive-member-api';

import ActionBar from './components/ActionBar';
import ActivityPieChart from './components/ActivityPieChart';
import GradeTabs from './components/GradeTabs';
import InactiveMemberTable from './components/InactiveMemberTable';
import InactiveTrendChart from './components/InactiveTrendChart';
import StatsCards from './components/StatsCards';

type TabKey = InactiveMemberGrade | 'all';
type SortByKey = 'lastVoiceDate' | 'totalMinutes' | 'decreaseRate';

const LIMIT = 20;
const RESULT_CLEAR_DELAY_MS = 3_000;

const TAB_DEFAULT_SORT: Record<TabKey, { sortBy: SortByKey; sortOrder: 'ASC' | 'DESC' }> = {
  all: { sortBy: 'lastVoiceDate', sortOrder: 'ASC' },
  FULLY_INACTIVE: { sortBy: 'lastVoiceDate', sortOrder: 'ASC' },
  LOW_ACTIVE: { sortBy: 'totalMinutes', sortOrder: 'ASC' },
  DECLINING: { sortBy: 'decreaseRate', sortOrder: 'DESC' },
};

export default function InactiveMemberPage() {
  const t = useTranslations('dashboard');
  const params = useParams<{ guildId: string }>();
  const guildId = params.guildId;
  const mountedRef = useRef(true);

  const [stats, setStats] = useState<InactiveMemberStats | null>(null);
  const [config, setConfig] = useState<InactiveMemberConfig | null>(null);
  const [items, setItems] = useState<InactiveMemberItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 필터 상태
  const [gradeFilter, setGradeFilter] = useState<TabKey>('all');
  const [sortBy, setSortBy] = useState<SortByKey>('lastVoiceDate');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // 선택 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 분류 실행 상태
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<string | null>(null);

  // 조치 상태
  const [isActing, setIsActing] = useState(false);
  const [actionResult, setActionResult] = useState<{
    successCount: number;
    failCount: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 언마운트 추적
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 통계 로드
  const loadStats = useCallback(async () => {
    try {
      const data = await fetchInactiveMemberStats(guildId);
      if (mountedRef.current) setStats(data);
    } catch {
      // 통계 로드 실패는 무시 — 목록은 별도로 로드
    }
  }, [guildId]);

  // 설정 로드 (마운트 1회 — 저활동 임계값 표시용)
  const loadConfig = useCallback(async () => {
    try {
      const data = await fetchInactiveMemberConfig(guildId);
      if (mountedRef.current) setConfig(data);
    } catch {
      // 설정 로드 실패는 무시 — 임계값 표시만 fallback
    }
  }, [guildId]);

  // 목록 로드
  const loadItems = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInactiveMembers(guildId, {
        grade: gradeFilter !== 'all' ? gradeFilter : undefined,
        search: searchQuery || undefined,
        sortBy,
        sortOrder,
        page,
        limit: LIMIT,
      });
      if (mountedRef.current) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : t('common.loadFailed'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [guildId, gradeFilter, searchQuery, sortBy, sortOrder, page, t]);

  // 초기 로드
  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // 검색 debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 탭 변경 핸들러 — 기본 정렬 자동 적용 + 선택 초기화 + 페이지 리셋
  const handleTabChange = useCallback((tab: TabKey) => {
    setGradeFilter(tab);
    const def = TAB_DEFAULT_SORT[tab];
    setSortBy(def.sortBy);
    setSortOrder(def.sortOrder);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleSortByChange = (value: string) => {
    // select onChange: value는 런타임에 해당 유니온 멤버만 가능
    setSortBy(value as SortByKey);
    setPage(1);
  };

  const handleSortOrderChange = (value: string) => {
    // select onChange: value는 런타임에 'ASC' | 'DESC' 멤버만 가능
    setSortOrder(value as 'ASC' | 'DESC');
    setPage(1);
  };

  // 분류 실행 핸들러
  const handleClassify = useCallback(async () => {
    if (isClassifying) return;
    setIsClassifying(true);
    setClassifyResult(null);
    try {
      const result = await classifyInactiveMembers(guildId);
      setClassifyResult(t('inactive.classifyDone', { count: result.classifiedCount }));
      setTimeout(() => setClassifyResult(null), RESULT_CLEAR_DELAY_MS);
      void loadStats();
      void loadItems();
    } catch (err) {
      setClassifyResult(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setIsClassifying(false);
    }
  }, [guildId, isClassifying, loadStats, loadItems, t]);

  // 조치 핸들러
  const handleAction = useCallback(
    async (actionType: ActionType) => {
      if (selectedIds.size === 0 || isActing) return;
      setIsActing(true);
      setActionResult(null);
      setActionError(null);
      try {
        const result = await executeInactiveMemberAction(guildId, {
          actionType,
          targetUserIds: Array.from(selectedIds),
        });
        setActionResult({
          successCount: result.successCount,
          failCount: result.failCount,
        });
        setTimeout(() => setActionResult(null), RESULT_CLEAR_DELAY_MS);
        void loadItems();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t('common.loadFailed'));
      } finally {
        setIsActing(false);
      }
    },
    [guildId, selectedIds, isActing, loadItems, t],
  );

  // 선택 핸들러
  const handleToggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map((item) => item.userId)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">{t('inactive.title')}</h1>
        <div className="flex items-center gap-3">
          {classifyResult && <span className="text-sm text-green-600">{classifyResult}</span>}
          <button
            type="button"
            disabled={isClassifying}
            onClick={handleClassify}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isClassifying ? t('inactive.classifying') : t('inactive.classify')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground">{t('common.loading')}</div>
        </div>
      ) : (
        <>
          {/* 통계 카드 */}
          {stats && <StatsCards stats={stats} />}

          {/* 파이 차트 + 추이 차트 */}
          {stats && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <ActivityPieChart stats={stats} />
              </div>
              <div className="lg:col-span-2">
                <InactiveTrendChart trend={stats.trend} />
              </div>
            </div>
          )}

          {/* 등급 탭 */}
          <GradeTabs activeTab={gradeFilter} stats={stats} onChange={handleTabChange} />

          {/* 검색 + 정렬 */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('inactive.filter.search')}
              className="w-full sm:w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <select
              value={sortBy}
              onChange={(e) => handleSortByChange(e.target.value)}
              className="w-full sm:w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="lastVoiceDate">{t('inactive.filter.sortBy.lastVoiceDate')}</option>
              <option value="totalMinutes">{t('inactive.filter.sortBy.totalMinutes')}</option>
              {gradeFilter === 'DECLINING' && (
                <option value="decreaseRate">{t('inactive.filter.sortBy.decreaseRate')}</option>
              )}
            </select>

            <select
              value={sortOrder}
              onChange={(e) => handleSortOrderChange(e.target.value)}
              className="w-full sm:w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ASC">{t('inactive.filter.sortOrder.ASC')}</option>
              <option value="DESC">{t('inactive.filter.sortOrder.DESC')}</option>
            </select>
          </div>

          {/* 액션바 */}
          <ActionBar
            selectedCount={selectedIds.size}
            isActing={isActing}
            actionResult={actionResult}
            actionError={actionError}
            onAction={handleAction}
          />

          {/* 테이블 */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="text-muted-foreground">{t('common.loadingList')}</div>
            </div>
          ) : (
            <InactiveMemberTable
              tab={gradeFilter}
              items={items}
              selectedIds={selectedIds}
              lowActiveThresholdMin={config?.lowActiveThresholdMin}
              onToggleSelect={handleToggleSelect}
              onToggleAll={handleToggleAll}
            />
          )}

          {/* 페이지네이션 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t('common.pagination', { page, totalPages, total })}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-input text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.prev')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-input text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
