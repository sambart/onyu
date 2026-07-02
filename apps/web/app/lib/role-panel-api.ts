import type { RolePanelDisabledReason } from '@onyu/shared';
import { type RolePanelButtonMode, type RolePanelButtonStyle } from '@onyu/shared';

import { apiClient, apiGet } from './api-client';

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** GET /api/guilds/{guildId}/role-panel 응답 항목 */
export interface RolePanelButtonDto {
  id: number;
  label: string;
  emoji: string | null;
  roleId: string;
  roleName: string | null;
  mode: RolePanelButtonMode;
  style: RolePanelButtonStyle;
  sortOrder: number;
}

/** 패널 단건 응답 */
export interface RolePanelConfig {
  id: number;
  name: string;
  channelId: string | null;
  channelName?: string | null;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  published: boolean;
  lastAppliedAt: string | null;
  buttons: RolePanelButtonDto[];
  createdAt: string;
  updatedAt: string;
}

/** assignable-roles 응답 항목 */
export interface AssignableRole {
  id: string;
  name: string;
  color: number;
  position: number;
  assignable: boolean;
  disabledReason: RolePanelDisabledReason | null;
}

/** 저장 요청 버튼 항목 */
export interface RolePanelButtonInputDto {
  label: string;
  emoji: string | null;
  roleId: string;
  mode: RolePanelButtonMode;
  style: RolePanelButtonStyle;
  sortOrder: number;
}

/** 저장 요청 바디 */
export interface RolePanelSaveDto {
  name: string;
  channelId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: RolePanelButtonInputDto[];
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

/** 길드의 역할 패널 목록을 조회한다. */
export async function fetchRolePanels(guildId: string): Promise<RolePanelConfig[]> {
  return apiGet<RolePanelConfig[]>(`/api/guilds/${guildId}/role-panel`, []);
}

/**
 * 부여 가능한 역할 목록을 조회한다.
 * @param refresh true이면 서버 캐시를 무시하고 Discord API에서 재조회한다.
 */
export async function fetchAssignableRoles(
  guildId: string,
  refresh = false,
): Promise<AssignableRole[]> {
  const qs = refresh ? '?refresh=true' : '';
  return apiGet<AssignableRole[]>(`/api/guilds/${guildId}/role-panel/assignable-roles${qs}`, []);
}

/** 역할 패널을 생성한다 (저장, published=false). */
export async function createRolePanel(
  guildId: string,
  dto: RolePanelSaveDto,
): Promise<RolePanelConfig> {
  return apiClient<RolePanelConfig>(`/api/guilds/${guildId}/role-panel`, {
    method: 'POST',
    body: dto,
  });
}

/** 역할 패널을 수정한다. published=true이면 Discord 동기화를 트리거한다. */
export async function updateRolePanel(
  guildId: string,
  panelId: number,
  dto: RolePanelSaveDto,
): Promise<RolePanelConfig> {
  return apiClient<RolePanelConfig>(`/api/guilds/${guildId}/role-panel/${panelId}`, {
    method: 'PUT',
    body: dto,
  });
}

/** 역할 패널을 삭제한다. Discord 메시지도 함께 삭제한다. */
export async function deleteRolePanel(guildId: string, panelId: number): Promise<{ ok: boolean }> {
  return apiClient<{ ok: boolean }>(`/api/guilds/${guildId}/role-panel/${panelId}`, {
    method: 'DELETE',
  });
}

/**
 * 역할 패널을 Discord 채널에 다시 반영한다(re-apply).
 * 설정 변경 없이 현재 저장본을 재게시하며, 성공 시 lastAppliedAt 이 갱신된다.
 */
export async function publishRolePanel(guildId: string, panelId: number): Promise<RolePanelConfig> {
  return apiClient<RolePanelConfig>(`/api/guilds/${guildId}/role-panel/${panelId}/publish`, {
    method: 'POST',
  });
}
