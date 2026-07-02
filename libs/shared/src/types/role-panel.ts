// 역할 패널 공유 타입·상수·헬퍼 (api/bot/web 공통 사용)

// ── Enum ──

/** 버튼 클릭 동작 모드 (DB role_panel_button_mode_enum 값과 일치) */
export enum RolePanelButtonMode {
  GRANT = 'GRANT',
  TOGGLE = 'TOGGLE',
}

/** 버튼 스타일 (DB role_panel_button_style_enum 값과 일치) */
export enum RolePanelButtonStyle {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  SUCCESS = 'SUCCESS',
  DANGER = 'DANGER',
}

// ── customId 형식: role_panel:{panelId}:{buttonId} ──

export const ROLE_PANEL_CUSTOM_ID_PREFIX = 'role_panel';

/**
 * 역할 패널 버튼의 Discord customId를 생성한다.
 * 형식: `role_panel:{panelId}:{buttonId}`
 */
export function buildRolePanelCustomId(panelId: number, buttonId: number): string {
  return `${ROLE_PANEL_CUSTOM_ID_PREFIX}:${panelId}:${buttonId}`;
}

/**
 * Discord customId에서 panelId와 buttonId를 파싱한다.
 * 형식이 맞지 않거나 숫자 변환에 실패하면 null 반환.
 */
export function parseRolePanelCustomId(
  customId: string,
): { panelId: number; buttonId: number } | null {
  const parts = customId.split(':');
  if (parts.length !== 3 || parts[0] !== ROLE_PANEL_CUSTOM_ID_PREFIX) {
    return null;
  }

  const panelId = parseInt(parts[1], 10);
  const buttonId = parseInt(parts[2], 10);

  if (isNaN(panelId) || isNaN(buttonId)) {
    return null;
  }

  return { panelId, buttonId };
}

// ── Discord 제약 상수 ──

/** Discord ActionRow 5개 × 버튼 5개 = 메시지당 최대 25개 버튼 */
export const ROLE_PANEL_MAX_BUTTONS = 25;

/** Discord ActionRow 당 최대 버튼 수 */
export const ROLE_PANEL_BUTTONS_PER_ROW = 5;

/** Discord 버튼 label 최대 글자 수 */
export const ROLE_PANEL_LABEL_MAX_LENGTH = 80;

// ── assignable-roles 비활성 사유 ──

export type RolePanelDisabledReason = 'HIGHER_THAN_BOT' | 'MANAGED' | 'EVERYONE' | 'ADMINISTRATOR';

// ── Discord 권한 비트 ──

/** ADMINISTRATOR 비트 위치 (Discord 권한 비트마스크 계산용) */
// BigInt 생성자 사용 — 리터럴(3n)은 target ES2020 미만 소비자(web=ES2017)에서 TS2737 에러
const ADMINISTRATOR_BIT_POSITION = BigInt(3);

/** BigInt 1 기저 값 (비트 시프트 계산용) */
const BIGINT_ONE = BigInt(1);

/** Discord ADMINISTRATOR 권한 비트마스크 (1 << 3 = 8) */
export const DISCORD_ADMINISTRATOR_BIT = BIGINT_ONE << ADMINISTRATOR_BIT_POSITION;
