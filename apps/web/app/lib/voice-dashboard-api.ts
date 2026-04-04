// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** voice_daily 테이블의 일별 집계 레코드 */
export interface VoiceDailyRecord {
  guildId: string;
  userId: string;
  date: string; // YYYYMMDD
  channelId: string; // 'GLOBAL' 또는 실제 채널 ID
  channelName: string;
  userName: string;
  categoryId: string | null;
  categoryName: string | null;
  channelDurationSec: number;
  micOnSec: number;
  micOffSec: number;
  aloneSec: number;
  channelType?: 'permanent' | 'auto_select' | 'auto_instant';
  autoChannelConfigId?: number | null;
  autoChannelConfigName?: string | null;
  autoChannelButtonId?: number | null;
  autoChannelButtonLabel?: string | null;
}

/** 대시보드 요약 카드용 통계 */
export interface VoiceSummary {
  totalDurationSec: number;
  totalMicOnSec: number;
  totalMicOffSec: number;
  totalAloneSec: number;
  uniqueUsers: number;
  uniqueChannels: number;
}

/** 일별 추이 데이터 */
export interface VoiceDailyTrend {
  date: string;
  channelDurationSec: number;
  micOnSec: number;
  micOffSec: number;
  aloneSec: number;
}

/** 채널별 통계 */
export interface VoiceChannelStat {
  channelId: string;
  channelName: string;
  totalDurationSec: number;
  micOnSec: number;
  micOffSec: number;
  aloneSec: number;
}

/** 카테고리별 통계 */
export interface VoiceCategoryStat {
  categoryId: string | null;
  categoryName: string;
  totalDurationSec: number;
  micOnSec: number;
  micOffSec: number;
  aloneSec: number;
}

/** 자동방 config 단위 그룹 통계 */
export interface VoiceAutoChannelGroupStat {
  autoChannelConfigId: number;
  autoChannelConfigName: string;
  autoChannelButtonId: number | null;
  autoChannelButtonLabel: string | null;
  channelType: 'auto_select' | 'auto_instant';
  totalDurationSec: number;
  instanceCount: number; // 해당 config로 생성된 고유 channelId 수
}

export type ChannelStatsGroupMode = 'individual' | 'auto_grouped';

export type ChannelTypeFilter = 'all' | 'permanent' | 'auto';

/** 유저별 통계 */
export interface VoiceUserStat {
  userId: string;
  userName: string;
  totalDurationSec: number;
  micOnSec: number;
  micOffSec: number;
  aloneSec: number;
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

export { formatDuration } from './format-utils';

/** YYYYMMDD → MM/DD 형식 */
export function formatDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

import { apiGet } from './api-client';

/**
 * 음성 일별 집계 데이터를 조회한다.
 * @param guildId 서버 ID
 * @param from 시작일 (YYYYMMDD)
 * @param to 종료일 (YYYYMMDD)
 * @param timezone IANA 타임존 (예: 'America/New_York'). 미제공 시 서버 기본 KST 기준
 */
export async function fetchVoiceDaily(
  guildId: string,
  from: string,
  to: string,
  timezone?: string,
): Promise<VoiceDailyRecord[]> {
  let url = `/api/guilds/${guildId}/voice/daily?from=${from}&to=${to}`;
  if (timezone) url += `&timezone=${encodeURIComponent(timezone)}`;
  return apiGet<VoiceDailyRecord[]>(url, []);
}

// ─── 클라이언트 집계 함수 ─────────────────────────────────────────────────────

/** 음성 활동 레코드를 기반으로 전체 통계 요약을 계산한다 */
export function computeSummary(records: VoiceDailyRecord[]): VoiceSummary {
  const globalRecords = records.filter((r) => r.channelId === 'GLOBAL');
  const channelRecords = records.filter((r) => r.channelId !== 'GLOBAL');

  const userIds = new Set(globalRecords.map((r) => r.userId));

  // 상설 채널: channelId 단위 카운트
  const permanentChannelIds = new Set(
    channelRecords.filter((r) => (r.autoChannelConfigId ?? null) == null).map((r) => r.channelId),
  );
  // 자동방: buttonId ?? configId 단위 카운트 (button 단위 그룹핑)
  const autoGroupKeys = new Set(
    channelRecords
      .filter((r) => r.autoChannelConfigId != null)
      .map((r) => {
        const buttonId = r.autoChannelButtonId ?? null;
        return buttonId != null ? `btn:${buttonId}` : `cfg:${r.autoChannelConfigId}`;
      }),
  );

  return {
    totalDurationSec: channelRecords.reduce((sum, r) => sum + r.channelDurationSec, 0),
    totalMicOnSec: globalRecords.reduce((sum, r) => sum + r.micOnSec, 0),
    totalMicOffSec: globalRecords.reduce((sum, r) => sum + r.micOffSec, 0),
    totalAloneSec: globalRecords.reduce((sum, r) => sum + r.aloneSec, 0),
    uniqueUsers: userIds.size,
    uniqueChannels: permanentChannelIds.size + autoGroupKeys.size,
  };
}

/** 음성 활동 레코드를 일별 트렌드로 집계한다 */
export function computeDailyTrends(records: VoiceDailyRecord[]): VoiceDailyTrend[] {
  const byDate = new Map<string, VoiceDailyTrend>();

  // 채널 레코드에서 channelDurationSec 집계
  const channelRecords = records.filter((r) => r.channelId !== 'GLOBAL');
  for (const r of channelRecords) {
    const existing = byDate.get(r.date);
    if (existing) {
      existing.channelDurationSec += r.channelDurationSec;
    } else {
      byDate.set(r.date, {
        date: r.date,
        channelDurationSec: r.channelDurationSec,
        micOnSec: 0,
        micOffSec: 0,
        aloneSec: 0,
      });
    }
  }

  // GLOBAL 레코드에서 마이크/혼자 시간 병합
  const globalRecords = records.filter((r) => r.channelId === 'GLOBAL');
  for (const r of globalRecords) {
    const existing = byDate.get(r.date);
    if (existing) {
      existing.micOnSec += r.micOnSec;
      existing.micOffSec += r.micOffSec;
      existing.aloneSec += r.aloneSec;
    } else {
      byDate.set(r.date, {
        date: r.date,
        channelDurationSec: 0,
        micOnSec: r.micOnSec,
        micOffSec: r.micOffSec,
        aloneSec: r.aloneSec,
      });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** 음성 활동 레코드를 채널별 통계로 집계한다 */
export function computeChannelStats(
  records: VoiceDailyRecord[],
  groupMode: ChannelStatsGroupMode = 'individual',
): VoiceChannelStat[] {
  const channelRecords = records.filter((r) => r.channelId !== 'GLOBAL');

  if (groupMode === 'individual') {
    const byChannel = new Map<string, VoiceChannelStat>();

    for (const r of channelRecords) {
      const existing = byChannel.get(r.channelId);
      if (existing) {
        existing.totalDurationSec += r.channelDurationSec;
        existing.micOnSec += r.micOnSec;
        existing.micOffSec += r.micOffSec;
        existing.aloneSec += r.aloneSec;
      } else {
        byChannel.set(r.channelId, {
          channelId: r.channelId,
          channelName: r.channelName,
          totalDurationSec: r.channelDurationSec,
          micOnSec: r.micOnSec,
          micOffSec: r.micOffSec,
          aloneSec: r.aloneSec,
        });
      }
    }

    return Array.from(byChannel.values()).sort((a, b) => b.totalDurationSec - a.totalDurationSec);
  }

  // auto_grouped 모드: 자동방은 buttonId ?? configId 단위로 합산, 상설 채널은 channelId 단위
  const byKey = new Map<string, VoiceChannelStat>();

  for (const r of channelRecords) {
    const configId = r.autoChannelConfigId;
    const buttonId = r.autoChannelButtonId ?? null;
    const key =
      configId != null
        ? buttonId != null
          ? `auto:btn:${buttonId}`
          : `auto:cfg:${configId}`
        : r.channelId;
    const name =
      configId != null
        ? (r.autoChannelButtonLabel ?? r.autoChannelConfigName ?? `Config-${configId}`)
        : r.channelName;

    const existing = byKey.get(key);
    if (existing) {
      existing.totalDurationSec += r.channelDurationSec;
      existing.micOnSec += r.micOnSec;
      existing.micOffSec += r.micOffSec;
      existing.aloneSec += r.aloneSec;
    } else {
      byKey.set(key, {
        channelId: key,
        channelName: name,
        totalDurationSec: r.channelDurationSec,
        micOnSec: r.micOnSec,
        micOffSec: r.micOffSec,
        aloneSec: r.aloneSec,
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}

/** 음성 활동 레코드를 카테고리별 통계로 집계한다 */
export function computeCategoryStats(records: VoiceDailyRecord[]): VoiceCategoryStat[] {
  const channelRecords = records.filter((r) => r.channelId !== 'GLOBAL');
  const byCategory = new Map<string, VoiceCategoryStat>();

  for (const r of channelRecords) {
    const key = r.categoryId ?? '__null__';
    const existing = byCategory.get(key);
    if (existing) {
      existing.totalDurationSec += r.channelDurationSec;
      existing.micOnSec += r.micOnSec;
      existing.micOffSec += r.micOffSec;
      existing.aloneSec += r.aloneSec;
    } else {
      byCategory.set(key, {
        categoryId: r.categoryId,
        categoryName: r.categoryName ?? '미분류',
        totalDurationSec: r.channelDurationSec,
        micOnSec: r.micOnSec,
        micOffSec: r.micOffSec,
        aloneSec: r.aloneSec,
      });
    }
  }

  return Array.from(byCategory.values()).sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}

/** 자동방 config 단위로 그룹 통계를 집계한다 */
export function computeAutoChannelGroupStats(
  records: VoiceDailyRecord[],
): VoiceAutoChannelGroupStat[] {
  const channelRecords = records.filter(
    (r) => r.channelId !== 'GLOBAL' && (r.autoChannelConfigId ?? null) != null,
  );

  const byGroup = new Map<string, { stat: VoiceAutoChannelGroupStat; channelIds: Set<string> }>();

  for (const r of channelRecords) {
    // filter 조건에서 autoChannelConfigId != null을 검증했으므로 안전한 단언
    const configId = r.autoChannelConfigId as number;
    const buttonId = r.autoChannelButtonId ?? null;
    const groupKey = buttonId != null ? `btn:${buttonId}` : `cfg:${configId}`;
    const existing = byGroup.get(groupKey);
    if (existing) {
      existing.stat.totalDurationSec += r.channelDurationSec;
      existing.channelIds.add(r.channelId);
    } else {
      // autoChannelConfigId가 있는 레코드는 auto_select 또는 auto_instant만 가능
      const channelType: 'auto_select' | 'auto_instant' =
        r.channelType === 'auto_instant' ? 'auto_instant' : 'auto_select';
      byGroup.set(groupKey, {
        stat: {
          autoChannelConfigId: configId,
          autoChannelConfigName: r.autoChannelConfigName ?? `Config-${configId}`,
          autoChannelButtonId: buttonId,
          autoChannelButtonLabel: r.autoChannelButtonLabel ?? null,
          channelType,
          totalDurationSec: r.channelDurationSec,
          instanceCount: 0,
        },
        channelIds: new Set([r.channelId]),
      });
    }
  }

  return Array.from(byGroup.values())
    .map(({ stat, channelIds }) => ({ ...stat, instanceCount: channelIds.size }))
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}

/** 채널 유형 필터에 따라 레코드를 필터링한다 */
export function filterRecordsByChannelType(
  records: VoiceDailyRecord[],
  filter: ChannelTypeFilter,
): VoiceDailyRecord[] {
  if (filter === 'all') return records;
  if (filter === 'permanent') {
    return records.filter(
      (r) => r.channelId === 'GLOBAL' || (r.channelType ?? 'permanent') === 'permanent',
    );
  }
  // filter === 'auto'
  return records.filter(
    (r) => r.channelId === 'GLOBAL' || (r.channelType ?? 'permanent') !== 'permanent',
  );
}

/** 음성 활동 레코드를 사용자별 통계로 집계한다 */
export function computeUserStats(records: VoiceDailyRecord[]): VoiceUserStat[] {
  const byUser = new Map<string, VoiceUserStat>();

  // 개별 채널 레코드에서 userName과 channelDurationSec를 집계
  const channelRecords = records.filter((r) => r.channelId !== 'GLOBAL');
  for (const r of channelRecords) {
    const existing = byUser.get(r.userId);
    if (existing) {
      existing.totalDurationSec += r.channelDurationSec;
      if (!existing.userName && r.userName) existing.userName = r.userName;
    } else {
      byUser.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        totalDurationSec: r.channelDurationSec,
        micOnSec: 0,
        micOffSec: 0,
        aloneSec: 0,
      });
    }
  }

  // GLOBAL 레코드에서 마이크/혼자 시간을 병합
  const globalRecords = records.filter((r) => r.channelId === 'GLOBAL');
  for (const r of globalRecords) {
    const existing = byUser.get(r.userId);
    if (existing) {
      existing.micOnSec += r.micOnSec;
      existing.micOffSec += r.micOffSec;
      existing.aloneSec += r.aloneSec;
      if (!existing.userName && r.userName) existing.userName = r.userName;
    } else {
      byUser.set(r.userId, {
        userId: r.userId,
        userName: r.userName,
        totalDurationSec: 0,
        micOnSec: r.micOnSec,
        micOffSec: r.micOffSec,
        aloneSec: r.aloneSec,
      });
    }
  }

  return Array.from(byUser.values()).sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}
