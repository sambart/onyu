import { apiClient, ApiError } from './api-client';

export interface NewbieConfig {
  // 환영인사
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeEmbedTitle: string | null;
  welcomeEmbedDescription: string | null;
  welcomeEmbedColor: string | null;
  welcomeEmbedThumbnailUrl: string | null;
  welcomeContent: string | null;

  // 미션
  missionEnabled: boolean;
  missionDurationDays: number | null;
  missionTargetPlaytimeHours: number | null;
  playCountMinDurationMin: number | null;
  playCountIntervalMin: number | null;
  missionNotifyChannelId: string | null;
  missionEmbedColor: string | null;

  // 모코코 사냥
  mocoEnabled: boolean;
  mocoNewbieDays: number | null;
  mocoAllowNewbieHunter: boolean;
  mocoRankChannelId: string | null;
  mocoAutoRefreshMinutes: number | null;
  mocoEmbedColor: string | null;
  mocoDisplayMode: 'EMBED' | 'CANVAS';

  // 모코코 사냥 — 플레이횟수 카운팅
  mocoPlayCountMinDurationMin: number | null;
  mocoPlayCountIntervalMin: number | null;

  // 모코코 사냥 — 점수/세션/리셋 (신규)
  mocoMinCoPresenceMin: number | null;
  mocoScorePerSession: number | null;
  mocoScorePerMinute: number | null;
  mocoScorePerUnique: number | null;
  mocoResetPeriod: string | null;
  mocoResetIntervalDays: number | null;
  mocoCurrentPeriodStart?: string | null;

  // 신입기간 역할
  roleEnabled: boolean;
  roleDurationDays: number | null;
  newbieRoleId: string | null;
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

/** 현재 서버의 신입 관리 설정을 조회한다. 404 시 null 반환. */
export async function fetchNewbieConfig(guildId: string): Promise<NewbieConfig | null> {
  try {
    return await apiClient<NewbieConfig>(`/api/guilds/${guildId}/newbie/config`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** 신입 관리 설정을 저장한다. */
export async function saveNewbieConfig(guildId: string, config: NewbieConfig): Promise<void> {
  await apiClient<void>(`/api/guilds/${guildId}/newbie/config`, {
    method: 'POST',
    body: config,
  });
}

// ─── 미션 관리 (F-NEWBIE-005) ────────────────────────────────────────────────

export type MissionStatusType = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'LEFT';

export interface MissionItem {
  id: number;
  guildId: string;
  memberId: string;
  memberName?: string;
  currentPlaytimeSec?: number;
  startDate: string;
  endDate: string;
  targetPlaytimeSec: number;
  status: MissionStatusType;
  hiddenFromEmbed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MissionListResponse {
  items: MissionItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MissionActionResult {
  ok: boolean;
  warning?: string;
}

/** 미션 목록 조회 (상태 필터 + 페이지네이션) */
export async function fetchMissions(
  guildId: string,
  status?: MissionStatusType | '',
  page = 1,
  pageSize = 10,
): Promise<MissionListResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  return apiClient<MissionListResponse>(`/api/guilds/${guildId}/newbie/missions?${params}`);
}

/** 미션 수동 성공 처리 */
export async function completeMission(
  guildId: string,
  missionId: number,
  roleId?: string | null,
): Promise<MissionActionResult> {
  return apiClient<MissionActionResult>(`/api/guilds/${guildId}/newbie/missions/complete`, {
    method: 'POST',
    body: { missionId, roleId: roleId || null },
  });
}

/** 미션 수동 실패 처리 */
export async function failMission(
  guildId: string,
  missionId: number,
  kick?: boolean,
  dmReason?: string | null,
): Promise<MissionActionResult> {
  return apiClient<MissionActionResult>(`/api/guilds/${guildId}/newbie/missions/fail`, {
    method: 'POST',
    body: { missionId, kick: kick ?? false, dmReason: dmReason || null },
  });
}

/** 미션 Embed 숨김 처리 */
export async function hideMission(guildId: string, missionId: number): Promise<void> {
  await apiClient<void>(`/api/guilds/${guildId}/newbie/missions/hide`, {
    method: 'POST',
    body: { missionId },
  });
}

/** 미션 Embed 숨김 해제 */
export async function unhideMission(guildId: string, missionId: number): Promise<void> {
  await apiClient<void>(`/api/guilds/${guildId}/newbie/missions/unhide`, {
    method: 'POST',
    body: { missionId },
  });
}

// ─── 미션 템플릿 ─────────────────────────────────────────────────────────────

export interface MissionStatusEntry {
  emoji: string;
  text: string;
}

export interface MissionStatusMapping {
  IN_PROGRESS: MissionStatusEntry;
  COMPLETED: MissionStatusEntry;
  FAILED: MissionStatusEntry;
  LEFT: MissionStatusEntry;
}

/**
 * NewbieMissionTemplate 테이블 대응 타입.
 * null 필드는 백엔드가 기본값을 사용한다는 의미.
 */
export interface MissionTemplate {
  titleTemplate: string | null;
  headerTemplate: string | null;
  itemTemplate: string | null;
  footerTemplate: string | null;
  statusMapping: MissionStatusMapping | null;
}

export const DEFAULT_MISSION_TEMPLATE: MissionTemplate = {
  titleTemplate: '🧑‍🌾 신입 미션 체크',
  headerTemplate: '🧑‍🌾 뉴비 멤버 (총 인원: {totalCount}명)',
  itemTemplate:
    '{mention} 🌱\n{startDate} ~ {endDate}\n{statusEmoji} {statusText} | 플레이타임: {playtime} | 플레이횟수: {playCount}회',
  footerTemplate: '마지막 갱신: {updatedAt}',
  statusMapping: {
    IN_PROGRESS: { emoji: '🟡', text: '진행중' },
    COMPLETED: { emoji: '✅', text: '완료' },
    FAILED: { emoji: '❌', text: '실패' },
    LEFT: { emoji: '🚪', text: '퇴장' },
  },
};

/** 미션 템플릿 조회. 404 시 null 반환 (프론트에서 DEFAULT_MISSION_TEMPLATE 사용). */
export async function fetchMissionTemplate(guildId: string): Promise<MissionTemplate | null> {
  try {
    return await apiClient<MissionTemplate>(`/api/guilds/${guildId}/newbie/mission-template`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** 미션 템플릿을 저장한다. */
export async function saveMissionTemplate(
  guildId: string,
  template: MissionTemplate,
): Promise<void> {
  await apiClient<void>(`/api/guilds/${guildId}/newbie/mission-template`, {
    method: 'POST',
    body: template,
  });
}

// ─── 모코코 템플릿 ────────────────────────────────────────────────────────────

/**
 * NewbieMocoTemplate 테이블 대응 타입.
 */
export interface MocoTemplate {
  titleTemplate: string | null;
  bodyTemplate: string | null;
  itemTemplate: string | null;
  footerTemplate: string | null;
  scoringTemplate: string | null;
}

export const DEFAULT_MOCO_TEMPLATE: MocoTemplate = {
  titleTemplate: '🌱 모코코 사냥 #{rank} — {hunterName}',
  bodyTemplate:
    '**🏆 {score}점**\n⏱️ {totalMinutes}분 · 🎮 {sessionCount}회 · 🌱 {uniqueNewbieCount}명\n\n{mocoList}',
  itemTemplate: '🌱 **{newbieName}** — {minutes}분 ({sessions}회)',
  footerTemplate: '페이지 {currentPage}/{totalPages} | 자동 갱신 {interval}분',
  scoringTemplate:
    '── 점수 산정 ──\n🎮 {scorePerSession}점/회 · ⏱️ {scorePerMinute}점/분 · 🌱 {scorePerUnique}점/명\n⏳ 최소 {minCoPresence}분 동시접속',
};

/** 모코코 사냥 순위 템플릿을 조회한다. 404 시 null 반환 (프론트에서 DEFAULT_MOCO_TEMPLATE 사용). */
export async function fetchMocoTemplate(guildId: string): Promise<MocoTemplate | null> {
  try {
    return await apiClient<MocoTemplate>(`/api/guilds/${guildId}/newbie/moco-template`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** 모코코 사냥 순위 템플릿을 저장한다. */
export async function saveMocoTemplate(guildId: string, template: MocoTemplate): Promise<void> {
  await apiClient<void>(`/api/guilds/${guildId}/newbie/moco-template`, {
    method: 'POST',
    body: template,
  });
}
