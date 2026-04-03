// ─── 타입 정의 ──────────────────────────────────────────────────────────────

export type InactiveMemberGrade = 'FULLY_INACTIVE' | 'LOW_ACTIVE' | 'DECLINING';
export type ActionType = 'ACTION_DM' | 'ACTION_ROLE_ADD' | 'ACTION_ROLE_REMOVE' | 'ACTION_KICK';

export interface InactiveMemberItem {
  userId: string;
  nickName: string;
  grade: InactiveMemberGrade;
  totalMinutes: number;
  lastVoiceDate: string | null;
  gradeChangedAt: string | null;
  classifiedAt: string;
}

export interface InactiveMemberListResponse {
  total: number;
  page: number;
  limit: number;
  items: InactiveMemberItem[];
}

export interface InactiveMemberListQuery {
  grade?: InactiveMemberGrade;
  periodDays?: 7 | 15 | 30;
  search?: string;
  sortBy?: 'lastVoiceDate' | 'totalMinutes';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export interface InactiveTrendPoint {
  date: string;
  fullyInactive: number;
  lowActive: number;
  declining: number;
}

export interface InactiveMemberStats {
  totalMembers: number;
  activeCount: number;
  fullyInactiveCount: number;
  lowActiveCount: number;
  decliningCount: number;
  returnedCount: number;
  trend: InactiveTrendPoint[];
}

export interface ExecuteActionDto {
  actionType: ActionType;
  targetUserIds: string[];
}

export interface ExecuteActionResponse {
  actionType: ActionType;
  successCount: number;
  failCount: number;
  logId: number;
}

export interface InactiveMemberConfig {
  id: number;
  guildId: string;
  periodDays: 7 | 15 | 30;
  lowActiveThresholdMin: number;
  decliningPercent: number;
  gracePeriodDays: number;
  autoActionEnabled: boolean;
  autoRoleAdd: boolean;
  autoDm: boolean;
  inactiveRoleId: string | null;
  removeRoleId: string | null;
  excludedRoleIds: string[];
  dmEmbedTitle: string | null;
  dmEmbedBody: string | null;
  dmEmbedColor: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InactiveMemberConfigSaveDto = Partial<
  Omit<InactiveMemberConfig, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>
>;

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────

export { formatMinutes } from './format-utils';

/** 'YYYY-MM-DD' → 'MM/DD' 형식 (차트 X축용) */
export function formatTrendDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  return `${parts[1]}/${parts[2]}`;
}

/** 등급 → 한국어 레이블 */
export function gradeLabel(grade: InactiveMemberGrade): string {
  switch (grade) {
    case 'FULLY_INACTIVE':
      return '완전 비활동';
    case 'LOW_ACTIVE':
      return '저활동';
    case 'DECLINING':
      return '활동 감소';
  }
}

/** 등급 → Badge 색상 클래스 (Tailwind) */
export function gradeBadgeClass(grade: InactiveMemberGrade): string {
  switch (grade) {
    case 'FULLY_INACTIVE':
      return 'bg-red-100 text-red-700';
    case 'LOW_ACTIVE':
      return 'bg-yellow-100 text-yellow-700';
    case 'DECLINING':
      return 'bg-orange-100 text-orange-700';
  }
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

import { apiClient } from './api-client';

/** 비활동 회원 목록 조회 */
export async function fetchInactiveMembers(
  guildId: string,
  query?: InactiveMemberListQuery,
): Promise<InactiveMemberListResponse> {
  const params = new URLSearchParams();
  if (query?.grade) params.set('grade', query.grade);
  if (query?.periodDays !== undefined) params.set('periodDays', String(query.periodDays));
  if (query?.search) params.set('search', query.search);
  if (query?.sortBy) params.set('sortBy', query.sortBy);
  if (query?.sortOrder) params.set('sortOrder', query.sortOrder);
  if (query?.page !== undefined) params.set('page', String(query.page));
  if (query?.limit !== undefined) params.set('limit', String(query.limit));

  const qs = params.toString();
  return apiClient<InactiveMemberListResponse>(
    `/api/guilds/${guildId}/inactive-members${qs ? `?${qs}` : ''}`,
  );
}

/** 통계 조회 */
export async function fetchInactiveMemberStats(guildId: string): Promise<InactiveMemberStats> {
  return apiClient<InactiveMemberStats>(`/api/guilds/${guildId}/inactive-members/stats`);
}

/** 수동 분류 실행 */
export async function classifyInactiveMembers(
  guildId: string,
): Promise<{ classifiedCount: number }> {
  return apiClient<{ classifiedCount: number }>(
    `/api/guilds/${guildId}/inactive-members/classify`,
    { method: 'POST' },
  );
}

/** 조치 실행 */
export async function executeInactiveMemberAction(
  guildId: string,
  dto: ExecuteActionDto,
): Promise<ExecuteActionResponse> {
  return apiClient<ExecuteActionResponse>(`/api/guilds/${guildId}/inactive-members/actions`, {
    method: 'POST',
    body: dto,
  });
}

/** 설정 조회 */
export async function fetchInactiveMemberConfig(guildId: string): Promise<InactiveMemberConfig> {
  return apiClient<InactiveMemberConfig>(`/api/guilds/${guildId}/inactive-members/config`);
}

/** 설정 저장 */
export async function saveInactiveMemberConfig(
  guildId: string,
  dto: InactiveMemberConfigSaveDto,
): Promise<InactiveMemberConfig> {
  return apiClient<InactiveMemberConfig>(`/api/guilds/${guildId}/inactive-members/config`, {
    method: 'PUT',
    body: dto,
  });
}
