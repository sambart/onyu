// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** GET /api/guilds/{guildId}/sticky-message 응답 항목 */
export interface StickyMessageConfig {
  id: number;
  channelId: string;
  channelName?: string;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  messageId: string | null;
  enabled: boolean;
  sortOrder: number;
  /** ISO 8601 문자열. null이면 아직 Discord 에 반영된 적 없음. */
  lastAppliedAt: string | null;
}

/** POST /api/guilds/{guildId}/sticky-message 요청 바디 */
export interface StickyMessageSaveDto {
  /** null이면 신규 생성, 양의 정수이면 수정 */
  id: number | null;
  channelId: string;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  enabled: boolean;
  sortOrder: number;
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

import { apiClient } from './api-client';

/** 길드의 고정메세지 설정 목록을 조회한다 (sortOrder 오름차순). */
export async function fetchStickyMessages(guildId: string): Promise<StickyMessageConfig[]> {
  return apiClient<StickyMessageConfig[]>(`/api/guilds/${guildId}/sticky-message`);
}

/** 고정메세지 설정을 저장한다 (신규/수정 upsert). */
export async function saveStickyMessage(
  guildId: string,
  data: StickyMessageSaveDto,
): Promise<StickyMessageConfig> {
  return apiClient<StickyMessageConfig>(`/api/guilds/${guildId}/sticky-message`, {
    method: 'POST',
    body: data,
  });
}

/** 고정메세지 설정을 삭제한다. 백엔드에서 Discord 채널의 메시지도 함께 삭제한다. */
export async function deleteStickyMessage(guildId: string, id: number): Promise<void> {
  await apiClient<void>(`/api/guilds/${guildId}/sticky-message/${id}`, {
    method: 'DELETE',
  });
}

/** 설정 변경 없이 현재 저장된 설정을 디스코드에 다시 반영한다. */
export async function reApplyStickyMessage(
  guildId: string,
  id: number,
): Promise<StickyMessageConfig> {
  return apiClient<StickyMessageConfig>(`/api/guilds/${guildId}/sticky-message/${id}/re-apply`, {
    method: 'POST',
  });
}
