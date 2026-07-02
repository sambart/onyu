export type AutoChannelMode = 'select' | 'instant';

export interface SubOptionForm {
  label: string;
  emoji: string;
  channelNameTemplate: string;
}

export interface ButtonForm {
  label: string;
  emoji: string;
  targetCategoryId: string;
  channelNameTemplate: string;
  subOptions: SubOptionForm[];
}

export interface ConfigForm {
  id?: number;
  name: string;
  triggerChannelId: string;
  mode: AutoChannelMode;
  instantCategoryId: string;
  instantNameTemplate: string;
  guideChannelId: string;
  guideMessage: string;
  embedTitle: string;
  embedColor: string;
  buttons: ButtonForm[];
  lastSavedAt: string | null;
}

export interface TabState {
  isSaving: boolean;
  /** 클라이언트 사전 검증(필수값 미입력 등) 에러 — 필드 맥락이 필요하므로 인라인 표시 유지 */
  saveError: string | null;
}

export const EMPTY_BUTTON: ButtonForm = {
  label: '',
  emoji: '',
  targetCategoryId: '',
  channelNameTemplate: '',
  subOptions: [],
};

export const EMPTY_SUB: SubOptionForm = {
  label: '',
  emoji: '',
  channelNameTemplate: '',
};

export const EMPTY_CONFIG: ConfigForm = {
  name: '',
  triggerChannelId: '',
  mode: 'select',
  instantCategoryId: '',
  instantNameTemplate: '',
  guideChannelId: '',
  guideMessage: '',
  embedTitle: '',
  embedColor: '#5865F2',
  buttons: [],
  lastSavedAt: null,
};

export const DEFAULT_TAB_STATE: TabState = {
  isSaving: false,
  saveError: null,
};

export const MAX_BUTTONS = 25;
