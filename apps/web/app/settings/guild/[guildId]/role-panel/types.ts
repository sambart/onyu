import {
  ROLE_PANEL_BUTTONS_PER_ROW,
  ROLE_PANEL_LABEL_MAX_LENGTH,
  ROLE_PANEL_MAX_BUTTONS,
  RolePanelButtonMode,
  RolePanelButtonStyle,
} from '@onyu/shared';

// ─── 상수 재수출 (컴포넌트에서 단순 import 가능하도록) ──────────────────────

export const MAX_BUTTONS = ROLE_PANEL_MAX_BUTTONS;
export const MAX_BUTTONS_PER_ROW = ROLE_PANEL_BUTTONS_PER_ROW;
export const MAX_LABEL_LEN = ROLE_PANEL_LABEL_MAX_LENGTH;

/** 저장 성공 메시지 표시 지속 시간 (ms) */
export const SAVE_SUCCESS_DURATION_MS = 3_000;

// ─── 로컬 타입 ─────────────────────────────────────────────────────────────

export type ButtonMode = RolePanelButtonMode;
export type ButtonStyle = RolePanelButtonStyle;

export interface ButtonForm {
  label: string;
  emoji: string;
  roleId: string;
  roleName: string;
  mode: RolePanelButtonMode;
  style: RolePanelButtonStyle;
}

export interface PanelForm {
  id?: number;
  name: string;
  channelId: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  published: boolean;
  messageId: string | null;
  buttons: ButtonForm[];
}

export interface TabState {
  isSaving: boolean;
  saveSuccess: boolean;
  saveError: string | null;
  isPublishing: boolean;
  publishSuccess: boolean;
  publishError: string | null;
}

export const EMPTY_BUTTON: ButtonForm = {
  label: '',
  emoji: '',
  roleId: '',
  roleName: '',
  mode: RolePanelButtonMode.GRANT,
  style: RolePanelButtonStyle.PRIMARY,
};

export const EMPTY_PANEL: PanelForm = {
  name: '',
  channelId: '',
  embedTitle: '',
  embedDescription: '',
  embedColor: '#5865F2',
  published: false,
  messageId: null,
  buttons: [],
};

export const DEFAULT_TAB_STATE: TabState = {
  isSaving: false,
  saveSuccess: false,
  saveError: null,
  isPublishing: false,
  publishSuccess: false,
  publishError: null,
};
