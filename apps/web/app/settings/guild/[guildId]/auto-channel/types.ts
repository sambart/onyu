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
}

export interface TabState {
  isSaving: boolean;
  saveSuccess: boolean;
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
};

export const DEFAULT_TAB_STATE: TabState = {
  isSaving: false,
  saveSuccess: false,
  saveError: null,
};

export const MAX_BUTTONS = 25;

/** 저장 성공 메시지를 표시하는 지속 시간 (ms) */
export const SAVE_SUCCESS_DURATION_MS = 3_000;
