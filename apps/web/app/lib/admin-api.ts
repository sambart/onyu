import { apiClient, apiGet } from './api-client';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

/** 관리자 역할 타입 */
export type AdminRole = 'super_admin' | 'bot_operator';

/** 관리자 사용자 정보 */
export interface AdminUser {
  discordUserId: string;
  role: AdminRole;
  grantedBy: string | null;
  isActive: boolean;
  createdAt: string;
}

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
 * 단일 길드의 표시 정보(이름/아이콘)를 조회한다. 실패 시 null fallback.
 * 전체 목록(fetchAdminGuilds)과 달리 Discord 보강이 1회뿐이라 비운영 길드 열람 시 빠르다.
 */
export async function fetchAdminGuild(guildId: string): Promise<AdminGuild | null> {
  return apiGet<AdminGuild | null>(`/api/admin/guilds/${guildId}`, null);
}

/**
 * 슈퍼 관리자가 비운영 길드를 열람할 때, 사이드바 표시용 길드명/아이콘을 resolve한다.
 * 단일 길드 조회로 처리하며, 실패/미발견 시 guildId를 이름으로 fallback한다.
 * 반환 형태는 Header의 Guild({ id, name, icon })와 호환된다.
 */
export async function resolveAdminGuild(
  guildId: string,
): Promise<{ id: string; name: string; icon: string | null }> {
  const found = await fetchAdminGuild(guildId);
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

// ─── 관리자 CRUD API ────────────────────────────────────────────────────────

/**
 * 관리자 목록 조회.
 * GET /api/admin/admins → { admins: AdminUser[] }
 * 실패 시 ApiError를 throw한다.
 */
export async function fetchAdmins(): Promise<AdminUser[]> {
  const res = await apiClient<{ admins: AdminUser[] } | AdminUser[]>('/api/admin/admins');
  // BE가 envelope({ admins: [...] }) 또는 배열 직반환 모두 수용
  if (Array.isArray(res)) return res;
  return res.admins;
}

/**
 * 관리자 추가.
 * POST /api/admin/admins → 201
 * 실패 시 ApiError를 throw한다 (409: 중복, 400: 유효성 등).
 */
export async function createAdmin(input: {
  discordUserId: string;
  role: AdminRole;
}): Promise<void> {
  await apiClient<void>('/api/admin/admins', {
    method: 'POST',
    body: input,
  });
}

/**
 * 관리자 역할 변경.
 * PATCH /api/admin/admins/:discordUserId → 200
 * 실패 시 ApiError를 throw한다 (404: 미존재, 400/409: 최소 1명 제약 등).
 */
export async function updateAdminRole(discordUserId: string, role: AdminRole): Promise<void> {
  await apiClient<void>(`/api/admin/admins/${encodeURIComponent(discordUserId)}`, {
    method: 'PATCH',
    body: { role },
  });
}

/**
 * 관리자 비활성화.
 * DELETE /api/admin/admins/:discordUserId → 200/204
 * 실패 시 ApiError를 throw한다 (400/409: 유일 super_admin 제약 등).
 */
export async function deactivateAdmin(discordUserId: string): Promise<void> {
  await apiClient<void>(`/api/admin/admins/${encodeURIComponent(discordUserId)}`, {
    method: 'DELETE',
  });
}
