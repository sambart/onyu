/**
 * StickyMessageSettingsPage 통합 테스트
 *
 * 유저 시나리오:
 *  - 페이지 로드 → 탭 설정 + LastAppliedBadge 렌더
 *  - 저장 성공 → 해당 탭 배지 lastAppliedAt 갱신 (다른 탭 영향 없음)
 *  - 저장 채널 미선택 → validationChannel 에러
 *  - 저장 API 에러 → saveError 표시
 *  - 다시 반영(ReApplyButton) → 성공 시 클릭한 탭 배지만 갱신
 *  - ReApplyButton disabled 조건: tab.id=null || !tab.enabled
 *  - 탭 전환 → 각 탭 독립 배지
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StickyMessageSettingsPage from '../page';

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
  fetchGuildTextChannels: vi.fn().mockResolvedValue([
    { id: 'txt-1', name: '일반', type: 0 },
    { id: 'txt-2', name: '공지', type: 0 },
  ]),
  fetchGuildEmojis: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../components/GuildEmojiPicker', () => ({
  default: () => null,
}));

vi.mock('../../../../../lib/relative-time', () => ({
  formatRelativeTime: () => '방금 전',
}));

// ─── sticky-message-api 모킹 ────────────────────────────────────────────────

const mockFetchStickyMessages = vi.fn();
const mockSaveStickyMessage = vi.fn();
const mockReApplyStickyMessage = vi.fn();
const mockDeleteStickyMessage = vi.fn();

vi.mock('../../../../../lib/sticky-message-api', () => ({
  fetchStickyMessages: (...args: unknown[]) => mockFetchStickyMessages(...args),
  saveStickyMessage: (...args: unknown[]) => mockSaveStickyMessage(...args),
  reApplyStickyMessage: (...args: unknown[]) => mockReApplyStickyMessage(...args),
  deleteStickyMessage: (...args: unknown[]) => mockDeleteStickyMessage(...args),
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  id: 1,
  channelId: 'txt-1',
  embedTitle: '공지 안내',
  embedDescription: '내용입니다',
  embedColor: '#5865F2',
  enabled: true,
  sortOrder: 0,
  lastAppliedAt: null as string | null,
};

async function renderAndWaitForLoad() {
  const result = render(<StickyMessageSettingsPage />);
  // 로딩 스피너가 사라지거나 탭/컨텐츠 표시 대기
  await waitFor(() => {
    expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
    // 탭이나 페이지 기본 텍스트
    const title = screen.queryByText('stickyMessage.title');
    expect(title).not.toBeNull();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('StickyMessageSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchStickyMessages.mockResolvedValue([]);
    mockSaveStickyMessage.mockResolvedValue({
      ...BASE_CONFIG,
      lastAppliedAt: null,
    });
    mockReApplyStickyMessage.mockResolvedValue({
      ...BASE_CONFIG,
      lastAppliedAt: '2026-06-21T12:00:00.000Z',
    });
    mockDeleteStickyMessage.mockResolvedValue(undefined);
  });

  // ─── 초기 로딩 ────────────────────────────────────────────────────────────

  describe('초기 로딩', () => {
    it('설정이 없으면 빈 탭 1개가 생성되고 stickyMessage.title이 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('stickyMessage.title')).toBeInTheDocument();
    });

    it('설정이 없으면 신규 탭에 notApplied 배지가 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('notApplied')).toBeInTheDocument();
    });

    it('서버에서 lastAppliedAt이 있는 설정을 로드하면 lastApplied 배지가 표시된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([
        { ...BASE_CONFIG, lastAppliedAt: '2026-06-21T10:00:00.000Z' },
      ]);

      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });

    it('서버에서 설정 로드 시 lastAppliedAt=null이면 notApplied 배지가 표시된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, lastAppliedAt: null }]);

      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('notApplied')).toBeInTheDocument();
      });
    });
  });

  // ─── ReApplyButton disabled 조건 ─────────────────────────────────────────

  describe('ReApplyButton disabled 조건', () => {
    it('신규 탭(id=null)에서는 다시 반영 버튼이 비활성화된다', async () => {
      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).toBeDisabled();
    });

    it('저장된 탭(id있음)이고 enabled=true이면 다시 반영 버튼이 활성화된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, enabled: true }]);

      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
        expect(reApplyBtn).not.toBeDisabled();
      });
    });

    it('저장된 탭(id있음)이지만 enabled=false이면 다시 반영 버튼이 비활성화된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, enabled: false }]);

      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
        expect(reApplyBtn).toBeDisabled();
      });
    });
  });

  // ─── 저장 유효성 검사 ────────────────────────────────────────────────────

  describe('저장 유효성 검사', () => {
    it('채널 미선택 상태에서 저장하면 validationChannel 에러가 표시된다', async () => {
      // 빈 탭(channelId='') 상태에서 저장
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('stickyMessage.validationChannel')).toBeInTheDocument();
      });
      expect(mockSaveStickyMessage).not.toHaveBeenCalled();
    });
  });

  // ─── 저장 성공 → 배지 갱신 ──────────────────────────────────────────────

  describe('저장 성공 → 배지 갱신', () => {
    it('저장 성공 시 saveSuccess 메시지가 표시된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG }]);
      mockSaveStickyMessage.mockResolvedValue({
        ...BASE_CONFIG,
        lastAppliedAt: '2026-06-21T13:00:00.000Z',
      });

      const user = userEvent.setup();
      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('common.save')).toBeInTheDocument();
      });

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('common.saveSuccess')).toBeInTheDocument();
      });
    });

    it('저장 성공 시 응답 lastAppliedAt으로 배지가 갱신된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, lastAppliedAt: null }]);
      mockSaveStickyMessage.mockResolvedValue({
        ...BASE_CONFIG,
        lastAppliedAt: '2026-06-21T13:00:00.000Z',
      });

      const user = userEvent.setup();
      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('notApplied')).toBeInTheDocument();
      });

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });
  });

  // ─── 저장 API 에러 처리 ──────────────────────────────────────────────────

  describe('저장 API 에러 처리', () => {
    it('저장 API 실패 시 에러 메시지가 표시된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG }]);
      mockSaveStickyMessage.mockRejectedValue(new Error('서버 오류가 발생했습니다'));

      const user = userEvent.setup();
      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('common.save')).toBeInTheDocument();
      });

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('서버 오류가 발생했습니다')).toBeInTheDocument();
      });
    });
  });

  // ─── 다시 반영 ───────────────────────────────────────────────────────────

  describe('다시 반영 (ReApplyButton)', () => {
    it('다시 반영 성공 시 해당 탭의 배지 lastAppliedAt이 갱신된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, lastAppliedAt: null }]);
      mockReApplyStickyMessage.mockResolvedValue({
        ...BASE_CONFIG,
        lastAppliedAt: '2026-06-21T12:00:00.000Z',
      });

      const user = userEvent.setup();
      render(<StickyMessageSettingsPage />);

      // 초기: notApplied
      await waitFor(() => {
        expect(screen.getByText('notApplied')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(mockReApplyStickyMessage).toHaveBeenCalledWith('guild-123', 1);
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });

    it('다시 반영 성공 시 saveSuccess 메시지가 표시된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, enabled: true }]);
      mockReApplyStickyMessage.mockResolvedValue({
        ...BASE_CONFIG,
        lastAppliedAt: '2026-06-21T12:00:00.000Z',
      });

      const user = userEvent.setup();
      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reApply/ })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(screen.getByText('common.saveSuccess')).toBeInTheDocument();
      });
    });

    it('다시 반영 API 실패 시 에러 메시지가 표시된다', async () => {
      mockFetchStickyMessages.mockResolvedValue([{ ...BASE_CONFIG, enabled: true }]);
      mockReApplyStickyMessage.mockRejectedValue(new Error('디스코드 연결 오류'));

      const user = userEvent.setup();
      render(<StickyMessageSettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reApply/ })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(screen.getByText('디스코드 연결 오류')).toBeInTheDocument();
      });
    });
  });
});
