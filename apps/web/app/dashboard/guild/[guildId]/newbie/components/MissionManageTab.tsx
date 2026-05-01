'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DiscordRole } from '../../../../../lib/discord-api';
import type {
  MissionItem,
  MissionListResponse,
  MissionStatusType,
} from '../../../../../lib/newbie-api';
import {
  completeMission,
  failMission,
  fetchMissions,
  hideMission,
  unhideMission,
} from '../../../../../lib/newbie-api';

interface MissionManageTabProps {
  guildId: string;
  roles: DiscordRole[];
  readonly?: boolean;
  missionUseMicTime?: boolean;
}

// ─── 성공 처리 모달 ──────────────────────────────────────────────────────────

interface CompleteModalProps {
  mission: MissionItem;
  roles: DiscordRole[];
  guildId: string;
  onClose: () => void;
  onDone: () => void;
}

function CompleteModal({ mission, roles, guildId, onClose, onDone }: CompleteModalProps) {
  const t = useTranslations('dashboard');
  const [roleId, setRoleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await completeMission(guildId, mission.id, roleId || null);
      if (result.warning) {
        setError(result.warning);
        setTimeout(() => {
          onDone();
          onClose();
        }, 2000);
      } else {
        onDone();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t('newbie.missionManage.completeModal.title')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('newbie.missionManage.completeModal.description', {
            name: mission.memberName ?? mission.memberId,
          })}
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('newbie.missionManage.completeModal.roleLabel')}
          </label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">{t('newbie.missionManage.completeModal.roleNone')}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {t('newbie.missionManage.completeModal.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? t('common.processing') : t('newbie.missionManage.completeModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 실패 처리 모달 ──────────────────────────────────────────────────────────

interface FailModalProps {
  mission: MissionItem;
  guildId: string;
  onClose: () => void;
  onDone: () => void;
}

function FailModal({ mission, guildId, onClose, onDone }: FailModalProps) {
  const t = useTranslations('dashboard');
  const [kick, setKick] = useState(false);
  const [dmReason, setDmReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await failMission(guildId, mission.id, kick, dmReason || null);
      if (result.warning) {
        setError(result.warning);
        setTimeout(() => {
          onDone();
          onClose();
        }, 2000);
      } else {
        onDone();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          {t('newbie.missionManage.failModal.title')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('newbie.missionManage.failModal.description', {
            name: mission.memberName ?? mission.memberId,
          })}
        </p>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={kick}
              onChange={(e) => setKick(e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            {t('newbie.missionManage.failModal.kickLabel')}
          </label>
        </div>

        {kick && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('newbie.missionManage.failModal.dmLabel')}
            </label>
            <textarea
              value={dmReason}
              onChange={(e) => setDmReason(e.target.value)}
              placeholder={t('newbie.missionManage.failModal.dmPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
        )}

        {error && <p className="text-sm text-amber-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {t('newbie.missionManage.failModal.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? t('common.processing') : t('newbie.missionManage.failModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 상태 뱃지 ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MissionStatusType }) {
  const t = useTranslations('dashboard');

  const styles: Record<MissionStatusType, string> = {
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    LEFT: 'bg-gray-100 text-gray-800',
  };

  const labelKeys: Record<MissionStatusType, string> = {
    IN_PROGRESS: 'newbie.missionManage.status.inProgress',
    COMPLETED: 'newbie.missionManage.status.completed',
    FAILED: 'newbie.missionManage.status.failed',
    LEFT: 'newbie.missionManage.status.left',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {/* labelKeys[status]는 런타임에 항상 유효한 t() 키 — 타입 정의의 string 제한을 좁힘 */}
      {t(labelKeys[status] as Parameters<typeof t>[0])}
    </span>
  );
}

// ─── 포맷 유틸 ──────────────────────────────────────────────────────────────

function formatDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(2, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

function formatPlaytimeMin(sec: number, unitLabel: string): string {
  return `${Math.floor(sec / 60)}${unitLabel}`;
}

// ─── 상태 필터 옵션 ──────────────────────────────────────────────────────────

type StatusFilter = MissionStatusType | '';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: '', labelKey: 'newbie.missionManage.filterAll' },
  { value: 'IN_PROGRESS', labelKey: 'newbie.missionManage.filterInProgress' },
  { value: 'COMPLETED', labelKey: 'newbie.missionManage.filterCompleted' },
  { value: 'FAILED', labelKey: 'newbie.missionManage.filterFailed' },
  { value: 'LEFT', labelKey: 'newbie.missionManage.filterLeft' },
];

const DEFAULT_STATUS_FILTER: StatusFilter = 'IN_PROGRESS';
const PAGE_SIZE = 10;

// ─── 미션 행 ─────────────────────────────────────────────────────────────────

interface MissionRowProps {
  mission: MissionItem;
  guildId: string;
  roles: DiscordRole[];
  onRefresh: () => void;
  showEmbed: boolean;
  readonly?: boolean;
}

function MissionRow({ mission, guildId, roles, onRefresh, showEmbed, readonly }: MissionRowProps) {
  const t = useTranslations('dashboard');
  const [dropOpen, setDropOpen] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [failModal, setFailModal] = useState(false);
  const [toggling, setToggling] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const canChangeStatus = mission.status === 'IN_PROGRESS' && !readonly;

  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      // EventTarget → Node 좁히기 (contains() 호출에 필요)
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const handleToggleEmbed = async () => {
    setToggling(true);
    try {
      if (mission.hiddenFromEmbed) {
        await unhideMission(guildId, mission.id);
      } else {
        await hideMission(guildId, mission.id);
      }
      onRefresh();
    } catch (err) {
      console.warn('[MissionRow] embed toggle failed', err);
    }
    setToggling(false);
  };

  const minuteUnit = t('common.unit.minute');

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="px-3 py-2 text-sm text-gray-700">
          {mission.memberName ?? mission.memberId}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">
          {formatDate(mission.startDate)}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">
          {formatDate(mission.endDate)}
        </td>
        <td className="px-3 py-2 text-xs text-gray-600 tabular-nums">
          {formatPlaytimeMin(mission.currentPlaytimeSec ?? 0, minuteUnit)}/
          {formatPlaytimeMin(mission.targetPlaytimeSec, minuteUnit)}
        </td>
        <td className="px-3 py-2">
          <div className="relative inline-block" ref={dropRef}>
            {canChangeStatus ? (
              <button type="button" onClick={() => setDropOpen(!dropOpen)}>
                <StatusBadge status={mission.status} />
              </button>
            ) : (
              <StatusBadge status={mission.status} />
            )}
            {dropOpen && canChangeStatus && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex flex-col gap-1 min-w-[110px]">
                <button
                  type="button"
                  onClick={() => {
                    setDropOpen(false);
                    setCompleteModal(true);
                  }}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                >
                  {t('newbie.missionManage.status.completed')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDropOpen(false);
                    setFailModal(true);
                  }}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                >
                  {t('newbie.missionManage.status.failed')}
                </button>
              </div>
            )}
          </div>
        </td>
        {showEmbed && (
          <td className="px-3 py-2">
            <button
              type="button"
              onClick={() => {
                void handleToggleEmbed();
              }}
              disabled={toggling || readonly}
              title={t('newbie.missionManage.table.embedTooltip')}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                mission.hiddenFromEmbed ? 'bg-gray-300' : 'bg-indigo-500'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  mission.hiddenFromEmbed ? 'translate-x-1' : 'translate-x-[18px]'
                }`}
              />
            </button>
          </td>
        )}
      </tr>

      {completeModal && (
        <CompleteModal
          mission={mission}
          roles={roles}
          guildId={guildId}
          onClose={() => setCompleteModal(false)}
          onDone={onRefresh}
        />
      )}
      {failModal && (
        <FailModal
          mission={mission}
          guildId={guildId}
          onClose={() => setFailModal(false)}
          onDone={onRefresh}
        />
      )}
    </>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export default function MissionManageTab({
  guildId,
  roles,
  readonly,
  missionUseMicTime = false,
}: MissionManageTabProps) {
  const t = useTranslations('dashboard');

  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const [page, setPage] = useState(1);

  const loadMissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data: MissionListResponse = await fetchMissions(guildId, statusFilter, page, PAGE_SIZE);
      setMissions(data.items);
      setTotal(data.total);
    } catch {
      setMissions([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [guildId, statusFilter, page]);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  const handleRefresh = () => {
    void loadMissions();
  };

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const isEmpty = !isLoading && missions.length === 0;

  return (
    <div className="space-y-4">
      {/* ───── 헤더: 필터 버튼 그룹 + 갱신 버튼 ───── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleStatusFilterChange(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {/* opt.labelKey는 런타임에 항상 유효한 t() 키 */}
              {t(opt.labelKey as Parameters<typeof t>[0])}
              {statusFilter === opt.value && !isLoading && (
                <span className="ml-1 opacity-80">({total})</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 shrink-0"
        >
          {t('newbie.missionManage.refresh')}
        </button>
      </div>

      {/* ───── 테이블 본문 ───── */}
      {isLoading ? (
        <p className="text-sm text-gray-400">{t('newbie.missionManage.loading')}</p>
      ) : isEmpty ? (
        <p className="text-sm text-gray-400">{t('newbie.missionManage.noMissions')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t('newbie.missionManage.table.member')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t('newbie.missionManage.table.start')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t('newbie.missionManage.table.end')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <div>{t('newbie.missionManage.table.playtime')}</div>
                    {missionUseMicTime && (
                      <div className="text-[10px] text-gray-400 font-normal">
                        {t('newbie.missionManage.table.playtimeMicHint')}
                      </div>
                    )}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    {t('newbie.missionManage.table.status')}
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                    title={t('newbie.missionManage.table.embedTooltip')}
                  >
                    Embed
                  </th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <MissionRow
                    key={m.id}
                    mission={m}
                    guildId={guildId}
                    roles={roles}
                    onRefresh={handleRefresh}
                    showEmbed
                    readonly={readonly}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.prev')}
              </button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
