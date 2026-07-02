/**
 * RolePanelPage 보강 통합 테스트 (settings-apply collapse 이후 갱신)
 *
 * 커버 목표:
 *  - [P0] 신규 패널 저장 → POST 호출, saveSuccess 표시
 *  - [P0] 기존 패널 저장 → PUT 호출 (POST 아님)
 *  - [P0] 저장 성공 시 lastAppliedAt 배지 갱신 (응답에서 갱신)
 *  - [P0] 저장 API 400 → saveError 표시
 *  - [P0] 버튼 라벨 미입력 → validationButtonLabel 에러
 *  - [P0] 버튼 roleId 미선택 → validationButtonRole 에러
 *  - [P1] 다시 반영 중 버튼 disabled (로딩 중 중복 클릭 방지)
 *  - [P1] 새 탭 추가 → 미저장 탭 렌더
 *  - [P1] "게시" 버튼 부재 확인 (collapse 검증)
 */

import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RolePanelSettingsPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => 'ko',
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

vi.mock('../../../../../lib/relative-time', () => ({
  formatRelativeTime: () => '방금 전',
}));

// 토스트 — Provider 없이 렌더링하므로 useToast를 스텁으로 대체한다
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError, info: vi.fn() }),
}));

// UnsavedChangesContext — Provider 없이 렌더링하므로 스텁으로 대체한다
vi.mock('../../../../../components/settings/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscardIfDirty: () => true }),
}));

// ─── role-panel-api 모킹 ─────────────────────────────────────────────────────

const mockFetchRolePanels = vi.fn();
const mockFetchAssignableRoles = vi.fn();
const mockCreateRolePanel = vi.fn();
const mockUpdateRolePanel = vi.fn();
const mockPublishRolePanel = vi.fn();
const mockDeleteRolePanel = vi.fn();

vi.mock('../../../../../lib/role-panel-api', () => ({
  fetchRolePanels: (...args: unknown[]) => mockFetchRolePanels(...args),
  fetchAssignableRoles: (...args: unknown[]) => mockFetchAssignableRoles(...args),
  createRolePanel: (...args: unknown[]) => mockCreateRolePanel(...args),
  updateRolePanel: (...args: unknown[]) => mockUpdateRolePanel(...args),
  deleteRolePanel: (...args: unknown[]) => mockDeleteRolePanel(...args),
  publishRolePanel: (...args: unknown[]) => mockPublishRolePanel(...args),
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

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
  published: true,
  messageId: 'msg-001' as string | null,
  lastAppliedAt: '2026-06-21T10:00:00.000Z' as string | null,
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
    const roleSelect = screen.getByDisplayValue('common.roleSelect');
    await user.selectOptions(roleSelect, roleId);
  }
  await user.click(screen.getByText('rolePanel.modalSave'));
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('RolePanelSettingsPage 보강 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockFetchRolePanels.mockResolvedValue([]);
    mockFetchAssignableRoles.mockResolvedValue([
      { id: 'r1', name: '게이머', color: 0, position: 1, assignable: true, disabledReason: null },
    ]);
    mockCreateRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      id: 99,
      name: '신규 패널',
      channelId: null,
      lastAppliedAt: null,
    });
    mockUpdateRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      lastAppliedAt: '2026-06-21T12:00:00.000Z',
    });
    mockPublishRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      lastAppliedAt: '2026-06-21T13:00:00.000Z',
    });
    mockDeleteRolePanel.mockResolvedValue({ ok: true });
  });

  // ─── 저장 흐름 ──────────────────────────────────────────────────────────

  describe('저장 — POST (신규 패널)', () => {
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

    it('신규 패널 저장 성공 시 toast.success가 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');
      await addButtonViaModal(user, '게이머', 'r1');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('common.saveSuccess');
      });
    });
  });

  describe('저장 — PUT (기존 패널)', () => {
    it('기존 패널(id 있음) 저장 시 updateRolePanel(PUT)이 호출되고 createRolePanel은 미호출이다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockUpdateRolePanel).toHaveBeenCalledTimes(1);
        expect(mockCreateRolePanel).not.toHaveBeenCalled();
      });
    });

    it('기존 패널 저장 성공 시 toast.success가 호출된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('common.saveSuccess');
      });
    });

    it('저장 성공 시 배지가 응답의 lastAppliedAt으로 갱신된다', async () => {
      mockFetchRolePanels.mockResolvedValue([{ ...BASE_PANEL_RESPONSE, lastAppliedAt: null }]);
      mockUpdateRolePanel.mockResolvedValue({
        ...BASE_PANEL_RESPONSE,
        lastAppliedAt: '2026-06-21T12:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기: 미반영 배지
      expect(screen.getByText('notApplied')).toBeInTheDocument();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        // 배지가 lastApplied 상태로 변해야 한다
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });
  });

  // ─── "게시" 버튼 부재 확인 (collapse 검증) ──────────────────────────────

  describe('"게시" 버튼 부재 (collapse 검증)', () => {
    it('저장된 패널에서 rolePanel.publish 텍스트 버튼이 없다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      await renderAndWaitForLoad();

      expect(screen.queryByText('rolePanel.publish')).not.toBeInTheDocument();
    });

    it('미저장 신규 패널에서도 rolePanel.publish 텍스트 버튼이 없다', async () => {
      await renderAndWaitForLoad();

      expect(screen.queryByText('rolePanel.publish')).not.toBeInTheDocument();
    });
  });

  // ─── 저장 API 400 에러 처리 ─────────────────────────────────────────────

  describe('저장 API 400 에러 처리', () => {
    it('저장 API 400 응답 시 toast.error가 호출된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockUpdateRolePanel.mockRejectedValue(
        Object.assign(new Error('봇보다 위계 높은 역할은 매핑할 수 없습니다'), { status: 400 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('봇보다 위계 높은 역할은 매핑할 수 없습니다');
      });
    });
  });

  // ─── 버튼 검증 에러 ──────────────────────────────────────────────────────

  describe('버튼 라벨 미입력 검증 에러', () => {
    it('버튼 라벨이 비어있으면 validationButtonLabel 에러를 표시하고 API를 호출하지 않는다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '테스트');

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

  describe('버튼 roleId 미선택 검증 에러', () => {
    it('버튼 roleId가 선택되지 않으면 validationButtonRole 에러를 표시하고 API를 호출하지 않는다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '테스트');

      await addButtonViaModal(user, '라벨만', undefined);

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationButtonRole({"index":1})')).toBeInTheDocument();
      });
      expect(mockCreateRolePanel).not.toHaveBeenCalled();
    });
  });

  // ─── 다시 반영 중 중복 클릭 차단 ────────────────────────────────────────

  describe('다시 반영 중 버튼 disabled', () => {
    it('다시 반영이 진행 중이면 저장 버튼도 disabled 상태가 된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);

      let resolveReApply!: (val: typeof BASE_PANEL_RESPONSE) => void;
      mockPublishRolePanel.mockReturnValue(
        new Promise<typeof BASE_PANEL_RESPONSE>((resolve) => {
          resolveReApply = resolve;
        }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 다시 반영 클릭
      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      await user.click(reApplyBtn);

      // 진행 중: 저장 버튼도 비활성화
      await waitFor(() => {
        const saveBtn = screen.getByText('common.save').closest('button');
        expect(saveBtn).toBeDisabled();
      });

      resolveReApply({ ...BASE_PANEL_RESPONSE });

      await waitFor(() => {
        expect(screen.getByText('common.apply.reApplySuccess')).toBeInTheDocument();
      });
    });
  });

  // ─── 탭 추가 ─────────────────────────────────────────────────────────────

  describe('새 탭 추가', () => {
    it('[새 패널 +] 클릭하면 미저장 탭이 추가된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      expect(screen.getAllByText('common.tabUnsaved')).toHaveLength(1);

      await user.click(screen.getByText('common.tabAdd'));

      await waitFor(() => {
        expect(screen.getAllByText('common.tabUnsaved')).toHaveLength(2);
      });
    });

    it('기존 패널이 있을 때 [새 패널 +]을 클릭하면 기존 탭과 새 탭이 함께 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      expect(screen.getByText('기존 패널')).toBeInTheDocument();

      await user.click(screen.getByText('common.tabAdd'));

      await waitFor(() => {
        expect(screen.getByText('기존 패널')).toBeInTheDocument();
        expect(screen.getByText('common.tabUnsaved')).toBeInTheDocument();
      });
    });
  });

  // ─── 탭 삭제 — T-4: alert() → toast.error 대체 ─────────────────────────

  describe('탭 삭제 (T-4: 삭제 에러 alert → toast.error)', () => {
    it('삭제 확인 다이얼로그에서 취소하면 deleteRolePanel이 호출되지 않고 탭이 유지된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      expect(screen.getByText('기존 패널')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'rolePanel.deleteAriaLabel' }));

      expect(confirmSpy).toHaveBeenCalledWith('rolePanel.deleteConfirm');
      expect(mockDeleteRolePanel).not.toHaveBeenCalled();
      expect(screen.getByText('기존 패널')).toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    it('삭제 API가 네트워크 오류로 실패하면 toast.error(deleteNetworkError)가 호출되고 탭이 유지된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockDeleteRolePanel.mockRejectedValue(new Error('network down'));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: 'rolePanel.deleteAriaLabel' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('common.deleteNetworkError');
      });
      // 실패 시 탭은 화면에서 제거되지 않아야 한다
      expect(screen.getByText('기존 패널')).toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    it('삭제 API가 성공하면 탭이 화면에서 제거된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockDeleteRolePanel.mockResolvedValue({ ok: true });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: 'rolePanel.deleteAriaLabel' }));

      await waitFor(() => {
        expect(mockDeleteRolePanel).toHaveBeenCalledWith('guild-123', BASE_PANEL_RESPONSE.id);
      });
      await waitFor(() => {
        expect(screen.queryByText('기존 패널')).not.toBeInTheDocument();
      });
      expect(mockToastError).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });
});
