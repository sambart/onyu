import { apiClient, apiGet } from './api-client';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

/** 백엔드 AdminGuildDto 와 일치 */
export interface AdminGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number | null;
  joinedAt: string | null;
}

/**
 * @nestjs/terminus 헬스 응답 형태.
 * 각 컴포넌트(database/redis/discord)의 status("up" | "down")를 포함한다.
 */
export interface TerminusHealth {
  status: string;
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string }>;
  details?: Record<string, { status: string }>;
}

/** web 컴포넌트에서 사용하는 정규화된 플랫폼 상태 */
export interface PlatformHealth {
  api: 'up' | 'down' | 'unknown';
  bot: 'up' | 'down' | 'unknown';
  database: 'up' | 'down' | 'unknown';
  redis: 'up' | 'down' | 'unknown';
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

const DISCORD_ICON_BASE = 'https://cdn.discordapp.com/icons';
const DISCORD_ICON_SIZE = 128;

/**
 * 길드 아이콘 URL을 반환한다. icon 해시가 없으면 null을 반환한다.
 * select-guild/page.tsx 와 동일한 규칙.
 */
export function getGuildIconUrl(guildId: string, icon: string | null): string | null {
  if (!icon) return null;
  return `${DISCORD_ICON_BASE}/${guildId}/${icon}.png?size=${DISCORD_ICON_SIZE}`;
}

/**
 * Terminus 응답을 PlatformHealth 형태로 정규화한다.
 * API 서버 자체가 응답했으면 api=up. 각 컴포넌트는 details/info 에서 추출.
 */
export function normalizeHealth(raw: TerminusHealth): PlatformHealth {
  const combined: Record<string, { status: string }> = {
    ...(raw.info ?? {}),
    ...(raw.error ?? {}),
    ...(raw.details ?? {}),
  };

  function resolveStatus(key: string): 'up' | 'down' | 'unknown' {
    const entry = combined[key];
    if (!entry) return 'unknown';
    return entry.status === 'up' ? 'up' : 'down';
  }

  // API 서버가 응답했으므로 api는 항상 up
  const isApiUp = raw.status === 'ok' || raw.status === 'error';

  return {
    api: isApiUp ? 'up' : 'unknown',
    bot: resolveStatus('discord'),
    database: resolveStatus('database'),
    redis: resolveStatus('redis'),
  };
}

const PLATFORM_HEALTH_FALLBACK: PlatformHealth = {
  api: 'unknown',
  bot: 'unknown',
  database: 'unknown',
  redis: 'unknown',
};

// ─── API 함수 ────────────────────────────────────────────────────────────────

/**
 * 슈퍼 관리자 전용 전체 길드 목록 조회.
 * 백엔드가 AdminGuildDto[] 배열을 반환한다.
 * 실패 시 ApiError를 throw한다.
 */
export async function fetchAdminGuilds(): Promise<AdminGuild[]> {
  return apiClient<AdminGuild[]>('/api/admin/guilds');
}

/**
 * 슈퍼 관리자가 비운영 길드를 열람할 때, 사이드바 표시용 길드명/아이콘을 전체 길드
 * 목록에서 resolve한다. 목록 조회 실패 또는 미발견 시 guildId를 이름으로 fallback한다.
 * 반환 형태는 Header의 Guild({ id, name, icon })와 호환된다.
 */
export async function resolveAdminGuild(
  guildId: string,
): Promise<{ id: string; name: string; icon: string | null }> {
  const guilds = await fetchAdminGuilds().catch(() => [] as AdminGuild[]);
  const found = guilds.find((g) => g.id === guildId);
  if (!found) return { id: guildId, name: guildId, icon: null };
  return { id: found.id, name: found.name, icon: found.icon };
}

/**
 * 플랫폼 헬스 조회. 실패해도 fallback(모두 unknown)을 반환하여 UI를 깨뜨리지 않는다.
 */
export async function fetchPlatformHealth(): Promise<PlatformHealth> {
  const raw = await apiGet<TerminusHealth | null>('/api/health', null);
  if (!raw) return PLATFORM_HEALTH_FALLBACK;
  return normalizeHealth(raw);
}
