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

// ─── 헬퍼 ───────────────────────────────────────────────────────

const EMPTY_PANEL_RESPONSE = {
  id: 99,
  name: '테스트 패널',
  channelId: 'txt-1',
  embedTitle: null,
  embedDescription: null,
  embedColor: null,
  published: false,
  messageId: null,
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

// ─── 테스트 ─────────────────────────────────────────────────────

describe('RolePanelSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRolePanels.mockResolvedValue([]);
    mockFetchAssignableRoles.mockResolvedValue([
      { id: 'r1', name: '게이머', color: 0, position: 1, assignable: true, disabledReason: null },
    ]);
    mockCreateRolePanel.mockResolvedValue(EMPTY_PANEL_RESPONSE);
    mockUpdateRolePanel.mockResolvedValue(EMPTY_PANEL_RESPONSE);
    mockDeleteRolePanel.mockResolvedValue({ ok: true });
    mockPublishRolePanel.mockResolvedValue({
      ...EMPTY_PANEL_RESPONSE,
      published: true,
      messageId: 'msg-001',
    });
  });

  describe('초기 로딩', () => {
    it('빈 상태이면 미저장 탭 1개로 시작한다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('common.tabUnsaved')).toBeInTheDocument();
      expect(screen.getByText('rolePanel.stepBasic')).toBeInTheDocument();
    });

    it('기존 패널이 있으면 탭 이름이 표시된다', async () => {
      mockFetchRolePanels.mockResolvedValue([
        {
          ...EMPTY_PANEL_RESPONSE,
          id: 1,
          name: '게임 역할 패널',
          buttons: [],
        },
      ]);
      await renderAndWaitForLoad();

      expect(screen.getByText('게임 역할 패널')).toBeInTheDocument();
    });
  });

  describe('저장 (POST — 신규)', () => {
    it('저장 성공 시 saveSuccess 메시지를 표시하고 id가 탭에 주입된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 패널 이름 입력
      const nameInput = screen.getByPlaceholderText('rolePanel.panelNamePlaceholder');
      await user.type(nameInput, '신규 패널');

      // 버튼 없이는 저장 안 됨 — 검증 오류 먼저 보여야 함
      await user.click(screen.getByText('common.save'));

      // 버튼 0개 검증 에러
      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationButtonRequired')).toBeInTheDocument();
      });
    });

    it('버튼 없이 저장 시도하면 validationButtonRequired 에러를 표시한다', async () => {
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

  describe('저장 검증 — 패널 이름 필수', () => {
    it('패널 이름을 입력하지 않으면 validationName 에러를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('rolePanel.validationName')).toBeInTheDocument();
      });
    });
  });

  describe('게시 — 채널 미선택 차단', () => {
    it('채널이 선택되지 않으면 게시 클릭 시 validationChannelRequiredToPublish 에러를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('rolePanel.publish'));

      await waitFor(() => {
        expect(
          screen.getByText('rolePanel.validationChannelRequiredToPublish'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('403 처리', () => {
    it('저장 API가 403 응답하면 saveError에 403 에러 메시지를 표시한다', async () => {
      mockFetchRolePanels.mockResolvedValue([
        {
          ...EMPTY_PANEL_RESPONSE,
          id: 1,
          name: '기존 패널',
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
        },
      ]);
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
  });

  describe('게시 성공', () => {
    it('게시 성공 시 publishSuccess 메시지를 표시한다', async () => {
      mockFetchRolePanels.mockResolvedValue([
        {
          ...EMPTY_PANEL_RESPONSE,
          id: 1,
          name: '기존 패널',
          channelId: 'txt-1',
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
        },
      ]);
      mockPublishRolePanel.mockResolvedValue({
        ...EMPTY_PANEL_RESPONSE,
        id: 1,
        published: true,
        messageId: 'msg-001',
        channelId: 'txt-1',
      });

      await renderAndWaitForLoad();

      // 채널이 이미 선택된 기존 패널이므로 바로 게시 가능
      const publishBtn = screen.getByText('rolePanel.publish');
      await userEvent.click(publishBtn);

      await waitFor(() => {
        expect(screen.getByText('rolePanel.publishSuccess')).toBeInTheDocument();
      });
    });
  });
});
