/**
 * RolePanelPage 보강 통합 테스트
 *
 * 커버 목표 (QA 체크리스트 그룹 A·B 누락 케이스):
 *  - [P0] 신규 패널 저장 성공 → POST 호출, saveSuccess 표시
 *  - [P0] 기존 패널 저장 성공 → PUT 호출 (POST 아님)
 *  - [P0] publish stale-closure 회귀: 저장 직후 게시가 저장 반환 id를 사용한다
 *  - [P0] API 400 → saveError 폼 에러 표시 (EC-RP-09/10)
 *  - [P0] 게시 API 503 → publishError 표시 (EC-RP-21)
 *  - [P0] 버튼 라벨 미입력 저장 → validationButtonLabel 에러
 *  - [P0] 버튼 roleId 미선택 저장 → validationButtonRole 에러
 *  - [P1] 게시 중 버튼 disabled (EC-RP-18)
 *  - [P1] 새 탭 추가 → 미저장 탭 렌더
 */

import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RolePanelSettingsPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

vi.mock('../../../../SettingsContext', () => ({
  useSettings: () => ({ selectedGuildId: 'guild-123' }),
}));

vi.mock('../../../../../lib/discord-api', () => ({
  fetchGuildChannels: vi.fn().mockResolvedValue([{ id: 'txt-1', name: '일반', type: 0 }]),
  fetchGuildEmojis: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../components/GuildEmojiPicker', () => ({
  default: () => null,
}));

// ─── role-panel-api 모킹 ──────────────────────────────────────

const mockFetchRolePanels = vi.fn();
const mockFetchAssignableRoles = vi.fn();
const mockCreateRolePanel = vi.fn();
const mockUpdateRolePanel = vi.fn();
const mockPublishRolePanel = vi.fn();

vi.mock('../../../../../lib/role-panel-api', () => ({
  fetchRolePanels: (...args: unknown[]) => mockFetchRolePanels(...args),
  fetchAssignableRoles: (...args: unknown[]) => mockFetchAssignableRoles(...args),
  createRolePanel: (...args: unknown[]) => mockCreateRolePanel(...args),
  updateRolePanel: (...args: unknown[]) => mockUpdateRolePanel(...args),
  deleteRolePanel: vi.fn().mockResolvedValue({ ok: true }),
  publishRolePanel: (...args: unknown[]) => mockPublishRolePanel(...args),
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────

const BUTTON_DTO = {
  id: 1,
  label: '게이머',
  emoji: null,
  roleId: 'r1',
  roleName: '게이머',
  mode: RolePanelButtonMode.GRANT,
  style: RolePanelButtonStyle.PRIMARY,
  sortOrder: 0,
};

const BASE_PANEL_RESPONSE = {
  id: 1,
  name: '기존 패널',
  channelId: 'txt-1',
  embedTitle: null,
  embedDescription: null,
  embedColor: null,
  published: false,
  // 게시 테스트에서 messageId 를 string 으로 재설정하므로 타입을 넓힌다 (리터럴 null 고정 방지)
  messageId: null as string | null,
  buttons: [BUTTON_DTO],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function renderAndWaitForLoad() {
  render(<RolePanelSettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('rolePanel.stepBasic')).toBeInTheDocument();
  });
}

/** 버튼 모달을 열어 라벨·역할 입력 후 저장한다. */
async function addButtonViaModal(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  roleId?: string,
) {
  await user.click(screen.getByText('rolePanel.addButtonCard'));
  await waitFor(() => {
    expect(screen.getByText('rolePanel.addButton')).toBeInTheDocument();
  });
  if (label) {
    const labelInput = screen.getByPlaceholderText('rolePanel.buttonLabelPlaceholder');
    await user.type(labelInput, label);
  }
  if (roleId) {
    // 모달 안의 역할 select를 특정한다 (채널 select와 구분: common.roleSelect 옵션)
    const roleSelect = screen.getByDisplayValue('common.roleSelect');
    await user.selectOptions(roleSelect, roleId);
  }
  await user.click(screen.getByText('rolePanel.modalSave'));
}

// ─── 테스트 ─────────────────────────────────────────────────────

describe('RolePanelSettingsPage 보강 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRolePanels.mockResolvedValue([]);
    mockFetchAssignableRoles.mockResolvedValue([
      { id: 'r1', name: '게이머', color: 0, position: 1, assignable: true, disabledReason: null },
    ]);
    mockCreateRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      id: 99,
      name: '신규 패널',
      channelId: null,
    });
    mockUpdateRolePanel.mockResolvedValue(BASE_PANEL_RESPONSE);
    mockPublishRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      published: true,
      messageId: 'msg-001',
    });
  });

  // ─── A-2. 저장 흐름 ──────────────────────────────────────────

  describe('저장 — POST (신규 패널, A-2 P0)', () => {
    it('신규 패널에 이름·버튼 입력 후 저장하면 createRolePanel(POST)이 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');
      await addButtonViaModal(user, '게이머', 'r1');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockCreateRolePanel).toHaveBeenCalledTimes(1);
        expect(mockUpdateRolePanel).not.toHaveBeenCalled();
      });
    });

    it('신규 패널 저장 성공 시 saveSuccess 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');
      await addButtonViaModal(user, '게이머', 'r1');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('common.saveSuccess')).toBeInTheDocument();
      });
    });
  });

  describe('저장 — PUT (기존 패널, A-2 P0)', () => {
    it('기존 패널(id 있음) 저장 시 updateRolePanel(PUT)이 호출되고 createRolePanel은 호출되지 않는다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockUpdateRolePanel).toHaveBeenCalledTimes(1);
        expect(mockCreateRolePanel).not.toHaveBeenCalled();
      });
    });

    it('기존 패널 저장 성공 시 saveSuccess 메시지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('common.saveSuccess')).toBeInTheDocument();
      });
    });
  });

  // ─── A-6. publish stale-closure 회귀 ────────────────────────

  describe('publish stale-closure 회귀 (Phase 5 수정 버그)', () => {
    it('미저장 신규 패널에서 게시 클릭 시 저장 반환 id(77)로 publishRolePanel을 호출한다', async () => {
      const savedId = 77;
      mockCreateRolePanel.mockResolvedValue({
        ...BASE_PANEL_RESPONSE,
        id: savedId,
        channelId: 'txt-1',
        name: '신규 패널',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 이름 입력
      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');

      // 버튼 추가
      await addButtonViaModal(user, '게이머', 'r1');

      // 채널 선택 (첫 번째 select는 채널, 두 번째는 모달의 역할 picker — 모달은 닫힌 상태)
      const channelSelect = screen.getByDisplayValue('common.textChannelSelect');
      await user.selectOptions(channelSelect, 'txt-1');

      // 게시 버튼 클릭 (저장 없이 바로)
      await user.click(screen.getByText('rolePanel.publish'));

      await waitFor(() => {
        // stale closure 버그가 있으면 undefined로 호출됨. 수정 후에는 savedId(77)로 호출
        expect(mockPublishRolePanel).toHaveBeenCalledWith('guild-123', savedId);
      });
    });

    it('미저장 패널 게시 후 publishSuccess 메시지가 표시된다', async () => {
      const savedId = 88;
      mockCreateRolePanel.mockResolvedValue({
        ...BASE_PANEL_RESPONSE,
        id: savedId,
        channelId: 'txt-1',
        name: '신규 패널',
      });
      mockPublishRolePanel.mockResolvedValue({
        ...BASE_PANEL_RESPONSE,
        id: savedId,
        published: true,
        messageId: 'msg-ok',
        channelId: 'txt-1',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');
      await addButtonViaModal(user, '게이머', 'r1');

      const channelSelect = screen.getByDisplayValue('common.textChannelSelect');
      await user.selectOptions(channelSelect, 'txt-1');

      await user.click(screen.getByText('rolePanel.publish'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.publishSuccess')).toBeInTheDocument();
      });
    });
  });

  // ─── B. 저장 API 400 에러 처리 ──────────────────────────────

  describe('저장 API 400 에러 처리 (EC-RP-09/10)', () => {
    it('저장 API가 400 응답하면 saveError에 에러 메시지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockUpdateRolePanel.mockRejectedValue(
        Object.assign(new Error('봇보다 위계 높은 역할은 매핑할 수 없습니다'), { status: 400 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('봇보다 위계 높은 역할은 매핑할 수 없습니다')).toBeInTheDocument();
      });
    });

    it('저장 API 400 에러 후에도 폼 데이터(패널 이름)가 유지된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockUpdateRolePanel.mockRejectedValue(
        Object.assign(new Error('부여불가 역할'), { status: 400 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('부여불가 역할')).toBeInTheDocument();
      });

      // 패널 이름 필드가 유지되어야 한다
      const nameInput = screen.getByPlaceholderText(
        'rolePanel.panelNamePlaceholder',
      ) as HTMLInputElement;
      expect(nameInput.value).toBe('기존 패널');
    });
  });

  // ─── B. 게시 API 503 에러 처리 (EC-RP-21) ───────────────────

  describe('게시 API 503 에러 처리 (EC-RP-21)', () => {
    it('게시 API가 503 응답하면 publishError에 에러 메시지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockPublishRolePanel.mockRejectedValue(
        Object.assign(new Error('봇이 채널 전송 권한이 없습니다'), { status: 503 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('rolePanel.publish'));

      await waitFor(() => {
        expect(screen.getByText('봇이 채널 전송 권한이 없습니다')).toBeInTheDocument();
      });
    });
  });

  // ─── A-4. 버튼 검증 에러 (클라이언트 차단) ──────────────────

  describe('버튼 라벨 미입력 검증 에러 (A-4)', () => {
    it('버튼 라벨이 비어있으면 validationButtonLabel 에러를 표시하고 API를 호출하지 않는다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '테스트');

      // 라벨 비우고 역할만 선택하여 버튼 추가
      await addButtonViaModal(user, '', 'r1');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(
          screen.getByText('rolePanel.validationButtonLabel({"index":1})'),
        ).toBeInTheDocument();
      });
      expect(mockCreateRolePanel).not.toHaveBeenCalled();
    });
  });

  describe('버튼 roleId 미선택 검증 에러 (A-4)', () => {
    it('버튼 roleId가 선택되지 않으면 validationButtonRole 에러를 표시하고 API를 호출하지 않는다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '테스트');

      // 라벨만 입력, 역할 미선택으로 버튼 추가
      await addButtonViaModal(user, '라벨만', undefined);

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationButtonRole({"index":1})')).toBeInTheDocument();
      });
      expect(mockCreateRolePanel).not.toHaveBeenCalled();
    });
  });

  // ─── EC-RP-18: 게시 중 중복 클릭 차단 ──────────────────────

  describe('게시 중 버튼 disabled (EC-RP-18, A-6 P1)', () => {
    it('게시가 진행 중이면 게시 버튼이 disabled 상태가 된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);

      let resolvePublish!: (val: typeof BASE_PANEL_RESPONSE) => void;
      mockPublishRolePanel.mockReturnValue(
        new Promise<typeof BASE_PANEL_RESPONSE>((resolve) => {
          resolvePublish = resolve;
        }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const publishBtn = screen.getByText('rolePanel.publish').closest('button')!;

      // 첫 번째 클릭으로 게시 시작
      await user.click(publishBtn);

      // 게시 진행 중 버튼이 disabled
      await waitFor(() => {
        expect(publishBtn).toBeDisabled();
      });

      // 게시 완료
      resolvePublish({ ...BASE_PANEL_RESPONSE, published: true, messageId: 'm' });

      await waitFor(() => {
        expect(screen.getByText('rolePanel.publishSuccess')).toBeInTheDocument();
      });
    });
  });

  // ─── A-1. 탭 추가 ───────────────────────────────────────────

  describe('새 탭 추가 (A-1 P1)', () => {
    it('[새 패널 +] 클릭하면 미저장 탭이 추가된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기에 미저장 탭 1개
      expect(screen.getAllByText('common.tabUnsaved')).toHaveLength(1);

      await user.click(screen.getByText('common.tabAdd'));

      // 미저장 탭 2개
      await waitFor(() => {
        expect(screen.getAllByText('common.tabUnsaved')).toHaveLength(2);
      });
    });

    it('기존 패널이 있을 때 [새 패널 +]을 클릭하면 기존 탭과 새 탭이 함께 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 기존 패널 탭
      expect(screen.getByText('기존 패널')).toBeInTheDocument();

      await user.click(screen.getByText('common.tabAdd'));

      await waitFor(() => {
        expect(screen.getByText('기존 패널')).toBeInTheDocument();
        expect(screen.getByText('common.tabUnsaved')).toBeInTheDocument();
      });
    });
  });
});
