/**
 * 역할 패널 customId 유틸 — @onyu/shared 의 파서/빌더를 재export한다.
 * 봇 내부에서 직접 정의하지 않고 shared 모듈 단일 진실의 소스를 사용한다.
 */
export {
  buildRolePanelCustomId,
  parseRolePanelCustomId,
  ROLE_PANEL_CUSTOM_ID_PREFIX,
} from '@onyu/shared';
