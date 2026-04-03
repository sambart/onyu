'use client';

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">성공 처리</h3>
        <p className="text-sm text-gray-600 mb-4">
          멤버{' '}
          <span className="font-semibold text-indigo-600">
            {mission.memberName ?? mission.memberId}
          </span>
          의 미션을 성공 처리합니다.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">역할 부여 (옵션)</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">역할 부여 안함</option>
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
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '성공 처리'}
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">실패 처리</h3>
        <p className="text-sm text-gray-600 mb-4">
          멤버{' '}
          <span className="font-semibold text-indigo-600">
            {mission.memberName ?? mission.memberId}
          </span>
          의 미션을 실패 처리합니다.
        </p>

        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={kick}
              onChange={(e) => setKick(e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            서버에서 강퇴
          </label>
        </div>

        {kick && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DM 사유 메시지 (옵션)
            </label>
            <textarea
              value={dmReason}
              onChange={(e) => setDmReason(e.target.value)}
              placeholder="강퇴 전 멤버에게 보낼 메시지"
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
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={loading}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '실패 처리'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 상태 뱃지 ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MissionStatusType }) {
  const styles: Record<MissionStatusType, string> = {
    IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    LEFT: 'bg-gray-100 text-gray-800',
  };
  const labels: Record<MissionStatusType, string> = {
    IN_PROGRESS: '진행중',
    COMPLETED: '완료',
    FAILED: '실패',
    LEFT: '퇴장',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

// ─── 포맷 유틸 ──────────────────────────────────────────────────────────────

function formatDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(2, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

function formatPlaytimeMin(sec: number): string {
  return `${Math.floor(sec / 60)}분`;
}

// ─── 미션 행 ─────────────────────────────────────────────────────────────────

interface MissionRowProps {
  mission: MissionItem;
  guildId: string;
  roles: DiscordRole[];
  onRefresh: () => void;
  showEmbed: boolean;
}

function MissionRow({ mission, guildId, roles, onRefresh, showEmbed }: MissionRowProps) {
  const [dropOpen, setDropOpen] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [failModal, setFailModal] = useState(false);
  const [toggling, setToggling] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const canChangeStatus = mission.status === 'IN_PROGRESS';

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
          {formatPlaytimeMin(mission.currentPlaytimeSec ?? 0)}/
          {formatPlaytimeMin(mission.targetPlaytimeSec)}
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
                  완료
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDropOpen(false);
                    setFailModal(true);
                  }}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                >
                  실패
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
              disabled={toggling}
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

export default function MissionManageTab({ guildId, roles }: MissionManageTabProps) {
  const [tab, setTab] = useState<'active' | 'history'>('active');

  // 진행 중 미션
  const [activeMissions, setActiveMissions] = useState<MissionItem[]>([]);
  const [activeLoading, setActiveLoading] = useState(true);

  // 전체 이력
  const [history, setHistory] = useState<MissionListResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<MissionStatusType | ''>('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadActive = useCallback(async () => {
    setActiveLoading(true);
    try {
      const data = await fetchMissions(guildId, 'IN_PROGRESS', 1, 100);
      setActiveMissions(data.items);
    } catch {
      setActiveMissions([]);
    } finally {
      setActiveLoading(false);
    }
  }, [guildId]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchMissions(guildId, statusFilter || undefined, page, pageSize);
      setHistory(data);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [guildId, statusFilter, page]);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleRefresh = () => {
    void loadActive();
    void loadHistory();
  };

  const totalPages = history ? Math.max(1, Math.ceil(history.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      {/* ───── 탭 헤더 ───── */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'active'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          진행 중
          {!activeLoading && (
            <span className="ml-1 text-xs text-gray-400">({activeMissions.length})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          전체 이력
          {!historyLoading && history && (
            <span className="ml-1 text-xs text-gray-400">({history.total})</span>
          )}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={handleRefresh}
            className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1"
          >
            새로고침
          </button>
        </div>
      </div>

      {/* ───── 진행 중 미션 탭 ───── */}
      {tab === 'active' && (
        <>
          {activeLoading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : activeMissions.length === 0 ? (
            <p className="text-sm text-gray-400">진행 중인 미션이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">멤버</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">시작</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">마감</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      플레이타임
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">상태</th>
                    <th
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                      title="디스코드 임베드 메시지에 표시 여부"
                    >
                      Embed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeMissions.map((m) => (
                    <MissionRow
                      key={m.id}
                      mission={m}
                      guildId={guildId}
                      roles={roles}
                      onRefresh={handleRefresh}
                      showEmbed
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ───── 전체 이력 탭 ───── */}
      {tab === 'history' && (
        <>
          <div className="flex justify-end">
            <select
              value={statusFilter}
              onChange={(e) => {
                // select의 option value가 MissionStatusType | '' 리터럴만 포함하므로 안전한 단언
                setStatusFilter(e.target.value as MissionStatusType | '');
                setPage(1);
              }}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">전체</option>
              <option value="COMPLETED">완료</option>
              <option value="FAILED">실패</option>
              <option value="LEFT">퇴장</option>
            </select>
          </div>

          {historyLoading ? (
            <p className="text-sm text-gray-400">불러오는 중...</p>
          ) : !history || history.items.length === 0 ? (
            <p className="text-sm text-gray-400">미션 이력이 없습니다.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        멤버
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        시작
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        마감
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        플레이타임
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                        상태
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500"
                        title="디스코드 임베드 메시지에 표시 여부"
                      >
                        Embed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.map((m) => (
                      <MissionRow
                        key={m.id}
                        mission={m}
                        guildId={guildId}
                        roles={roles}
                        onRefresh={handleRefresh}
                        showEmbed
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
                    이전
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
                    다음
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
