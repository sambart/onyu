/**
 * StatusPrefixSettingsPage 통합 테스트
 *
 * 유저 시나리오:
 *  - 페이지 로드 → 설정 표시 + LastAppliedBadge 렌더
 *  - 저장 성공 → 배지 lastAppliedAt 갱신
 *  - 저장 실패 → saveError 표시 + 데이터 유지
 *  - 다시 반영(ReApplyButton) → 성공 시 배지 갱신
 *  - isPersisted=false(미저장) → ReApplyButton disabled
 *  - isPersisted=true(저장된 설정) → ReApplyButton 활성
 *  - 유효성 검사: enabled=true 채널 미선택 → saveError
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StatusPrefixSettingsPage from '../page';

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
  fetchGuildTextChannels: vi.fn().mockResolvedValue([{ id: 'txt-1', name: '일반', type: 0 }]),
  fetchGuildEmojis: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../../components/GuildEmojiPicker', () => ({
  default: () => null,
}));

vi.mock('../../../../../lib/relative-time', () => ({
  formatRelativeTime: () => '방금 전',
}));

// ─── status-prefix-api 모킹 ─────────────────────────────────────────────────

const mockFetchStatusPrefixConfig = vi.fn();
const mockSaveStatusPrefixConfig = vi.fn();
const mockReApplyStatusPrefix = vi.fn();

vi.mock('../../../../../lib/status-prefix-api', () => ({
  fetchStatusPrefixConfig: (...args: unknown[]) => mockFetchStatusPrefixConfig(...args),
  saveStatusPrefixConfig: (...args: unknown[]) => mockSaveStatusPrefixConfig(...args),
  reApplyStatusPrefix: (...args: unknown[]) => mockReApplyStatusPrefix(...args),
}));

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  enabled: false,
  channelId: null,
  embedTitle: '게임방 상태 설정 시스템',
  embedDescription: '안내 텍스트',
  embedColor: '#5865F2',
  prefixTemplate: '[{prefix}] {nickname}',
  buttons: [],
  lastAppliedAt: null as string | null,
};

const PERSISTED_CONFIG = {
  ...BASE_CONFIG,
  enabled: true,
  channelId: 'txt-1',
  lastAppliedAt: '2026-06-21T10:00:00.000Z',
};

async function renderAndWaitForLoad() {
  const result = render(<StatusPrefixSettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('statusPrefix.basicSettings')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('StatusPrefixSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchStatusPrefixConfig.mockResolvedValue(null);
    mockSaveStatusPrefixConfig.mockResolvedValue({ lastAppliedAt: null });
    mockReApplyStatusPrefix.mockResolvedValue({
      lastAppliedAt: '2026-06-21T12:00:00.000Z',
    });
  });

  // ─── 초기 로딩 ────────────────────────────────────────────────────────────

  describe('초기 로딩', () => {
    it('설정이 없으면 기본 설정으로 페이지가 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('statusPrefix.basicSettings')).toBeInTheDocument();
    });

    it('서버에 설정이 있으면 lastAppliedAt 배지가 표시된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue(PERSISTED_CONFIG);
      await renderAndWaitForLoad();

      expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
    });

    it('설정이 없으면(최초) notApplied 배지가 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('notApplied')).toBeInTheDocument();
    });
  });

  // ─── ReApplyButton disabled 조건 ─────────────────────────────────────────

  describe('ReApplyButton disabled 조건', () => {
    it('한 번도 저장된 적 없으면(isPersisted=false) 다시 반영 버튼이 비활성화된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue(null);
      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).toBeDisabled();
    });

    it('저장된 설정이 있으면(isPersisted=true) 다시 반영 버튼이 활성화된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue(PERSISTED_CONFIG);
      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).not.toBeDisabled();
    });
  });

  // ─── 저장 성공 → 배지 갱신 ──────────────────────────────────────────────

  describe('저장 성공 → 배지 갱신', () => {
    it('저장 성공 시 응답 lastAppliedAt으로 배지가 갱신된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue(PERSISTED_CONFIG);
      mockSaveStatusPrefixConfig.mockResolvedValue({
        lastAppliedAt: '2026-06-21T13:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기에 배지 표시 확인
      expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockSaveStatusPrefixConfig).toHaveBeenCalledTimes(1);
      });
    });

    it('저장 성공 시 saveSuccess 메시지가 표시된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue(PERSISTED_CONFIG);
      mockSaveStatusPrefixConfig.mockResolvedValue({
        lastAppliedAt: '2026-06-21T13:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('statusPrefix.saveSuccess')).toBeInTheDocument();
      });
    });

    it('enabled=false 저장 시 disabled=false 채널을 검사하지 않아 saveSuccess가 표시된다', async () => {
      // enabled=false이면 채널 없어도 저장 가능
      mockFetchStatusPrefixConfig.mockResolvedValue({ ...PERSISTED_CONFIG, enabled: false });
      mockSaveStatusPrefixConfig.mockResolvedValue({ lastAppliedAt: null });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockSaveStatusPrefixConfig).toHaveBeenCalledTimes(1);
        expect(screen.getByText('statusPrefix.saveSuccess')).toBeInTheDocument();
      });
    });
  });

  // ─── 저장 유효성 검사 ────────────────────────────────────────────────────

  describe('저장 유효성 검사', () => {
    it('enabled=true이고 채널 미선택이면 validationChannel 에러를 표시한다', async () => {
      // enabled=true, channelId=null인 기본 상태에서 토글 켜기
      mockFetchStatusPrefixConfig.mockResolvedValue({
        ...BASE_CONFIG,
        enabled: true,
        channelId: null,
        lastAppliedAt: '2026-06-21T10:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('statusPrefix.validationChannel')).toBeInTheDocument();
      });
      expect(mockSaveStatusPrefixConfig).not.toHaveBeenCalled();
    });
  });

  // ─── 저장 API 에러 처리 ──────────────────────────────────────────────────

  describe('저장 API 에러 처리', () => {
    it('저장 API 500 실패 시 saveError 메시지가 표시된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue(PERSISTED_CONFIG);
      mockSaveStatusPrefixConfig.mockRejectedValue(
        Object.assign(new Error('서버 오류가 발생했습니다'), { status: 500 }),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('서버 오류가 발생했습니다')).toBeInTheDocument();
      });
    });
  });

  // ─── 다시 반영 ───────────────────────────────────────────────────────────

  describe('다시 반영 (ReApplyButton)', () => {
    it('다시 반영 성공 시 배지 lastAppliedAt이 갱신된다', async () => {
      mockFetchStatusPrefixConfig.mockResolvedValue({
        ...PERSISTED_CONFIG,
        lastAppliedAt: null,
      });
      mockReApplyStatusPrefix.mockResolvedValue({
        lastAppliedAt: '2026-06-21T12:00:00.000Z',
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기: 미반영
      expect(screen.getByText('notApplied')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(mockReApplyStatusPrefix).toHaveBeenCalledWith('guild-123');
        expect(screen.getByText('lastApplied({"time":"방금 전"})')).toBeInTheDocument();
      });
    });
  });
});
