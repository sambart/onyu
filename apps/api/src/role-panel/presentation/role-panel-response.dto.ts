import type {
  RolePanelButtonMode,
  RolePanelButtonStyle,
  RolePanelDisabledReason,
} from '@onyu/shared';

export class RolePanelButtonDto {
  id: number;
  label: string;
  emoji: string | null;
  roleId: string;
  roleName: string | null;
  mode: RolePanelButtonMode;
  style: RolePanelButtonStyle;
  sortOrder: number;
}

export class RolePanelDto {
  id: number;
  name: string;
  channelId: string | null;
  channelName: string | null;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  published: boolean;
  buttons: RolePanelButtonDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class AssignableRoleDto {
  id: string;
  name: string;
  color: number;
  position: number;
  assignable: boolean;
  disabledReason: RolePanelDisabledReason | null;
}

/**
 * 봇 폴백용 패널 설정 응답 DTO (2.1 GET /bot-api/role-panel/config).
 * 버튼 클릭 처리에 필요한 최소 데이터만 포함.
 */
export class BotRolePanelConfigDto {
  panelId: number;
  buttons: Array<{
    buttonId: number;
    roleId: string;
    mode: 'GRANT' | 'TOGGLE';
  }>;
}
