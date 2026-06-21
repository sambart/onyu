/**
 * buildRolePanelCustomId / parseRolePanelCustomId 단위 테스트
 *
 * shared 라이브러리의 customId 빌더/파서 검증 (role-panel 핵심 계약).
 * 봇 버튼 customId 파싱 실패 시 null 반환 보장.
 *
 * 커버 케이스:
 * - buildRolePanelCustomId: 형식 `role_panel:{panelId}:{buttonId}`
 * - parseRolePanelCustomId: 정상 파싱
 * - parseRolePanelCustomId: 접두사 불일치 → null
 * - parseRolePanelCustomId: 파트 수 부족/과다 → null
 * - parseRolePanelCustomId: 숫자 변환 불가 → null
 * - build/parse 왕복 검증
 */

import {
  buildRolePanelCustomId,
  parseRolePanelCustomId,
  ROLE_PANEL_CUSTOM_ID_PREFIX,
} from '@onyu/shared';

const LARGE_PANEL_ID = 999999; // 큰 숫자 경계값 테스트용 panelId
const LARGE_BUTTON_ID = 888888; // 큰 숫자 경계값 테스트용 buttonId

describe('buildRolePanelCustomId', () => {
  it('형식: role_panel:{panelId}:{buttonId}', () => {
    const result = buildRolePanelCustomId(3, 12);

    expect(result).toBe('role_panel:3:12');
  });

  it('PREFIX 상수가 "role_panel"임', () => {
    expect(ROLE_PANEL_CUSTOM_ID_PREFIX).toBe('role_panel');
  });

  it('panelId=0, buttonId=0 경계값', () => {
    expect(buildRolePanelCustomId(0, 0)).toBe('role_panel:0:0');
  });

  it('큰 숫자도 올바르게 변환', () => {
    expect(buildRolePanelCustomId(LARGE_PANEL_ID, LARGE_BUTTON_ID)).toBe(
      `role_panel:${LARGE_PANEL_ID}:${LARGE_BUTTON_ID}`,
    );
  });
});

describe('parseRolePanelCustomId', () => {
  it('정상 형식: panelId와 buttonId를 숫자로 파싱', () => {
    const result = parseRolePanelCustomId('role_panel:3:12');

    expect(result).not.toBeNull();
    expect(result.panelId).toBe(3);
    expect(result.buttonId).toBe(12);
  });

  it('접두사 불일치 → null', () => {
    expect(parseRolePanelCustomId('other_panel:1:2')).toBeNull();
    expect(parseRolePanelCustomId('role_panel_x:1:2')).toBeNull();
    expect(parseRolePanelCustomId(':1:2')).toBeNull();
  });

  it('파트 수 2개 (부족) → null', () => {
    expect(parseRolePanelCustomId('role_panel:1')).toBeNull();
  });

  it('파트 수 4개 (과다) → null', () => {
    expect(parseRolePanelCustomId('role_panel:1:2:3')).toBeNull();
  });

  it('panelId가 숫자 변환 불가 → null', () => {
    expect(parseRolePanelCustomId('role_panel:abc:2')).toBeNull();
  });

  it('buttonId가 숫자 변환 불가 → null', () => {
    expect(parseRolePanelCustomId('role_panel:1:xyz')).toBeNull();
  });

  it('빈 문자열 → null', () => {
    expect(parseRolePanelCustomId('')).toBeNull();
  });

  it('build → parse 왕복: 동일 값 복원', () => {
    const panelId = 7;
    const buttonId = 42;
    const customId = buildRolePanelCustomId(panelId, buttonId);
    const parsed = parseRolePanelCustomId(customId);

    expect(parsed).not.toBeNull();
    expect(parsed.panelId).toBe(panelId);
    expect(parsed.buttonId).toBe(buttonId);
  });

  it('NaN 포함 파트 → null', () => {
    expect(parseRolePanelCustomId('role_panel:NaN:2')).toBeNull();
    expect(parseRolePanelCustomId('role_panel:1:NaN')).toBeNull();
  });
});
