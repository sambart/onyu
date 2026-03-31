// ─── API 클라이언트 ──────────────────────────────────────────────────────────

import { apiClient, ApiError } from './api-client';

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** 음악 플레이어 버튼 타입 */
export type MusicButtonType =
  | 'search'
  | 'pause_resume'
  | 'skip'
  | 'stop'
  | 'queue'
  | 'melon_chart'
  | 'billboard_chart';

/** 버튼 개별 설정 */
export interface MusicButtonConfig {
  type: MusicButtonType;
  label: string;
  emoji: string;
  enabled: boolean;
  /** Discord 메시지 행 번호 (0~4) */
  row: number;
}

/** GET /api/guilds/{guildId}/music/config 응답 (프론트엔드용 — buttons 평탄화) */
export interface MusicChannelConfig {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttons: MusicButtonConfig[];
  enabled: boolean;
}

/** PUT /api/guilds/{guildId}/music/config 요청 바디 (프론트엔드용) */
export interface MusicChannelConfigSaveDto {
  channelId: string;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttons: MusicButtonConfig[];
  enabled: boolean;
}

// ─── API 응답 타입 (실제 서버 구조) ─────────────────────────────────────────

interface ApiMusicChannelConfigResponse {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttonConfig: { buttons: MusicButtonConfig[] };
  enabled: boolean;
}

/** API 응답을 프론트엔드 타입으로 변환 (buttonConfig.buttons → buttons) */
function toFrontendConfig(raw: ApiMusicChannelConfigResponse): MusicChannelConfig {
  return {
    id: raw.id,
    guildId: raw.guildId,
    channelId: raw.channelId,
    messageId: raw.messageId,
    embedTitle: raw.embedTitle,
    embedDescription: raw.embedDescription,
    embedColor: raw.embedColor,
    embedThumbnailUrl: raw.embedThumbnailUrl,
    buttons: raw.buttonConfig.buttons,
    enabled: raw.enabled,
  };
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

/**
 * 음악 채널 설정을 조회한다.
 * 설정이 없으면 null을 반환한다 (백엔드가 404를 반환하는 경우 처리).
 */
export async function fetchMusicConfig(
  guildId: string,
): Promise<MusicChannelConfig | null> {
  try {
    const raw = await apiClient<ApiMusicChannelConfigResponse>(
      `/api/guilds/${guildId}/music/config`,
    );
    return raw ? toFrontendConfig(raw) : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * 음악 채널 설정을 저장한다 (upsert).
 * 저장 후 백엔드에서 Discord 채널 임베드를 갱신한다.
 */
export async function saveMusicConfig(
  guildId: string,
  data: MusicChannelConfigSaveDto,
): Promise<MusicChannelConfig> {
  const raw = await apiClient<ApiMusicChannelConfigResponse>(
    `/api/guilds/${guildId}/music/config`,
    {
      method: 'PUT',
      body: {
        channelId: data.channelId,
        embedTitle: data.embedTitle,
        embedDescription: data.embedDescription,
        embedColor: data.embedColor,
        embedThumbnailUrl: data.embedThumbnailUrl,
        buttonConfig: { buttons: data.buttons },
        enabled: data.enabled,
      },
    },
  );
  return toFrontendConfig(raw);
}

/**
 * 음악 채널 설정을 기본값으로 초기화한다.
 * 채널 지정(channelId)은 유지되며 임베드·버튼만 초기화된다.
 */
export async function resetMusicConfig(
  guildId: string,
): Promise<MusicChannelConfig> {
  const raw = await apiClient<ApiMusicChannelConfigResponse>(
    `/api/guilds/${guildId}/music/config/reset`,
    { method: 'POST' },
  );
  return toFrontendConfig(raw);
}
