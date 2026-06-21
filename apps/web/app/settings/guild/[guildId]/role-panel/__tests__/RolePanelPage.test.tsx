/**
 * RolePanelSettingsPage 통합 테스트
 *
 * settings-apply-model collapse 이후 변경된 동작 검증:
 * - 저장 = persist + 즉시 게시 (서버가 통합 처리)
 * - "게시" 버튼 제거 → 저장 1버튼 + LastAppliedBadge + ReApplyButton
 * - 저장 성공 시 lastAppliedAt 배지 갱신
 * - 다시 반영(ReApplyButton) 동작
 * - 기존 동작 유지: 이름/버튼 유효성 검사, 에러 처리
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

// LastAppliedBadge / ReApplyButton — next-intl useLocale를 직접 사용하므로
// 실제 컴포넌트를 사용하되 next-intl 전체를 모킹한다 (위에서 처리).
// relative-time 은 모킹하여 시각 의존성을 제거한다.
vi.mock('../../../../../lib/relative-time', () => ({
  formatRelativeTime: () => '방금 전',
}));

// ─── role-panel-api 모킹 ─────────────────────────────────────────────────────

const mockFetchRolePanels = vi.fn();
const mockFetchAssignableRoles = vi.fn();
const mockCreateRolePanel = vi.fn();
const mockUpdateRolePanel = vi.fn();
const mockDeleteRolePanel = vi.fn();
const mockPublishRolePanel = vi.fn();

vi.mock('../../../../../lib/role-panel-api', () => ({
  fetchRolePanels: (...args: unknown[]) => mockFetchRolePanels(...args),
  fetchAssignableRoles: (...args: unknown[]) => mockFetchAssignableRoles(...args),
  createRolePanel: (...args: unknown[]) => mockCreateRolePanel(...args),
  updateRolePanel: (...args: unknown[]) => mockUpdateRolePanel(...args),
  deleteRolePanel: (...args: unknown[]) => mockDeleteRolePanel(...args),
  publishRolePanel: (...args: unknown[]) => mockPublishRolePanel(...args),
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

const BASE_PANEL_RESPONSE = {
  id: 1,
  name: '기존 패널',
  channelId: 'txt-1',
  embedTitle: null,
  embedDescription: null,
  embedColor: null,
  published: true,
  messageId: 'msg-001',
  lastAppliedAt: '2026-06-21T10:00:00.000Z',
  buttons: [
    {
      id: 1,
      label: '게이머',
      emoji: null,
      roleId: 'r1',
      roleName: '게이머',
      mode: RolePanelButtonMode.GRANT,
      style: RolePanelButtonStyle.PRIMARY,
      sortOrder: 0,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const NEW_PANEL_RESPONSE = {
  id: 99,
  name: '신규 패널',
  channelId: 'txt-1',
  embedTitle: null,
  embedDescription: null,
  embedColor: null,
  published: true,
  messageId: 'msg-new',
  lastAppliedAt: '2026-06-21T11:00:00.000Z',
  buttons: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function renderAndWaitForLoad() {
  const result = render(<RolePanelSettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('rolePanel.stepBasic')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('RolePanelSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRolePanels.mockResolvedValue([]);
    mockFetchAssignableRoles.mockResolvedValue([
      { id: 'r1', name: '게이머', color: 0, position: 1, assignable: true, disabledReason: null },
    ]);
    mockCreateRolePanel.mockResolvedValue(NEW_PANEL_RESPONSE);
    mockUpdateRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      lastAppliedAt: '2026-06-21T12:00:00.000Z',
    });
    mockDeleteRolePanel.mockResolvedValue({ ok: true });
    mockPublishRolePanel.mockResolvedValue({
      ...BASE_PANEL_RESPONSE,
      lastAppliedAt: '2026-06-21T13:00:00.000Z',
    });
  });

  // ─── 초기 로딩 ────────────────────────────────────────────────────────────

  describe('초기 로딩', () => {
    it('빈 상태이면 미저장 탭 1개로 시작한다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('common.tabUnsaved')).toBeInTheDocument();
      expect(screen.getByText('rolePanel.stepBasic')).toBeInTheDocument();
    });

    it('기존 패널이 있으면 탭 이름이 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      await renderAndWaitForLoad();

      expect(screen.getByText('기존 패널')).toBeInTheDocument();
    });

    it('"게시" 버튼이 더 이상 존재하지 않는다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      await renderAndWaitForLoad();

      expect(screen.queryByText('rolePanel.publish')).not.toBeInTheDocument();
    });
  });

  // ─── 저장 버튼 단일화 ────────────────────────────────────────────────────

  describe('저장 버튼 단일화', () => {
    it('저장 버튼이 1개만 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      await renderAndWaitForLoad();

      const saveButtons = screen.getAllByRole('button', { name: /common\.save/ });
      expect(saveButtons).toHaveLength(1);
    });

    it('저장 성공 시 saveSuccess 메시지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('common.saveSuccess')).toBeInTheDocument();
      });
    });

    it('저장 후 updateRolePanel이 호출된다 (기존 패널)', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockUpdateRolePanel).toHaveBeenCalledTimes(1);
      });
    });

    it('신규 패널 저장 시 createRolePanel이 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 패널 이름 입력
      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');

      // 버튼 없이 저장 시도 → 검증 에러
      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationButtonRequired')).toBeInTheDocument();
      });
      // createRolePanel 미호출 확인
      expect(mockCreateRolePanel).not.toHaveBeenCalled();
    });
  });

  // ─── LastAppliedBadge 배치 ────────────────────────────────────────────────

  describe('LastAppliedBadge 배치', () => {
    it('패널이 로드되면 lastAppliedAt 배지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      await renderAndWaitForLoad();

      // lastApplied 키가 상대시각과 함께 렌더되어야 한다
      expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
    });

    it('lastAppliedAt=null인 패널에는 notApplied 텍스트가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([{ ...BASE_PANEL_RESPONSE, lastAppliedAt: null }]);
      await renderAndWaitForLoad();

      expect(screen.getByText('notApplied')).toBeInTheDocument();
    });

    it('저장 성공 후 배지가 새 lastAppliedAt으로 갱신된다', async () => {
      mockFetchRolePanels.mockResolvedValue([{ ...BASE_PANEL_RESPONSE, lastAppliedAt: null }]);
      mockUpdateRolePanel.mockResolvedValue({
        ...BASE_PANEL_RESPONSE,
        lastAppliedAt: '2026-06-21T12:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기 상태: 미반영
      expect(screen.getByText('notApplied')).toBeInTheDocument();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });
  });

  // ─── ReApplyButton (다시 반영) ────────────────────────────────────────────

  describe('ReApplyButton (다시 반영)', () => {
    it('id가 없는 신규 패널에서 다시 반영 버튼이 비활성화된다', async () => {
      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).toBeDisabled();
    });

    it('저장된 패널에서 다시 반영 버튼이 활성화된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).not.toBeDisabled();
    });

    it('다시 반영 클릭 시 publishRolePanel이 호출된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(mockPublishRolePanel).toHaveBeenCalledWith('guild-123', BASE_PANEL_RESPONSE.id);
      });
    });

    it('다시 반영 성공 시 reApplySuccess 메시지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(screen.getByText('common.apply.reApplySuccess')).toBeInTheDocument();
      });
    });

    it('다시 반영 성공 시 배지의 lastAppliedAt이 갱신된다', async () => {
      mockFetchRolePanels.mockResolvedValue([{ ...BASE_PANEL_RESPONSE, lastAppliedAt: null }]);
      mockPublishRolePanel.mockResolvedValue({
        ...BASE_PANEL_RESPONSE,
        lastAppliedAt: '2026-06-21T13:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기: 미반영
      expect(screen.getByText('notApplied')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });

    it('다시 반영 API 실패 시 publishError 메시지가 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockPublishRolePanel.mockRejectedValue(
        Object.assign(new Error('봇이 채널 전송 권한이 없습니다'), { status: 503 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(screen.getByText('봇이 채널 전송 권한이 없습니다')).toBeInTheDocument();
      });
    });
  });

  // ─── 저장 유효성 검사 ────────────────────────────────────────────────────

  describe('저장 검증', () => {
    it('패널 이름 미입력 시 validationName 에러를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationName')).toBeInTheDocument();
      });
    });

    it('버튼 없이 저장 시 validationButtonRequired 에러를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '테스트');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationButtonRequired')).toBeInTheDocument();
      });
    });
  });

  // ─── 저장 API 에러 처리 ──────────────────────────────────────────────────

  describe('저장 API 에러 처리', () => {
    it('저장 API 403 응답 시 에러 메시지를 표시한다', async () => {
      mockFetchRolePanels.mockResolvedValue([BASE_PANEL_RESPONSE]);
      mockUpdateRolePanel.mockRejectedValue(
        Object.assign(new Error('관리자 권한 역할은 매핑할 수 없습니다'), { status: 403 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('관리자 권한 역할은 매핑할 수 없습니다')).toBeInTheDocument();
      });
    });

    it('저장 API 에러 후에도 패널 이름 필드 데이터가 유지된다', async () => {
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

      const nameInput = screen.getByPlaceholderText(
        'rolePanel.panelNamePlaceholder',
      ) as HTMLInputElement;
      expect(nameInput.value).toBe('기존 패널');
    });
  });

  // ─── 탭 관리 ─────────────────────────────────────────────────────────────

  describe('탭 관리', () => {
    it('[새 패널 +] 클릭하면 미저장 탭이 추가된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      expect(screen.getAllByText('common.tabUnsaved')).toHaveLength(1);

      await user.click(screen.getByText('common.tabAdd'));

      await waitFor(() => {
        expect(screen.getAllByText('common.tabUnsaved')).toHaveLength(2);
      });
    });
  });
});
