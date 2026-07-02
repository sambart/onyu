/**
 * PrivacyPage 통합 테스트
 *
 * 사생활 설정 페이지의 전체 흐름을 검증한다.
 * - 길드 목록 로드 → 드롭다운 렌더링 → 길드별 privacy 설정 조회
 * - 토글 변경 → 저장 → 성공/실패 피드백
 * - 길드 0개 빈 상태 처리
 * - 미인증 사용자 리다이렉트
 *
 * API 모듈을 vi.mock으로 직접 처리하여 fetch 레이어 의존성을 제거한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as userPrivacyApi from '../../../../lib/user-privacy-api';
import PrivacyPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

const STABLE_T = (key: string) => key;

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

vi.mock('../../../../lib/user-privacy-api', () => ({
  fetchUserPrivacy: vi.fn(),
  saveUserPrivacy: vi.fn(),
}));

// 토스트 — Provider 없이 렌더링하므로 useToast를 스텁으로 대체한다
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError, info: vi.fn() }),
}));

// UnsavedChangesContext — Provider 없이 렌더링하므로 스텁으로 대체한다
vi.mock('../../../../components/settings/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscardIfDirty: () => true }),
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILDS_FIXTURE = [
  { id: 'guild-1', name: '테스트 서버', icon: null },
  { id: 'guild-2', name: '친구 서버', icon: null },
];

const PRIVACY_FIXTURE = {
  guildId: 'guild-1',
  userId: 'user-1',
  disableRelationshipShare: false,
};

const PRIVACY_PRIVATE_FIXTURE = {
  guildId: 'guild-1',
  userId: 'user-1',
  disableRelationshipShare: true,
};

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

function mockAuthMe(guilds: typeof GUILDS_FIXTURE | null) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: guilds !== null,
    json: () => Promise.resolve(guilds ? { user: { guilds } } : null),
  } as Response);
}

async function renderAndWaitForLoad() {
  const result = render(<PrivacyPage />);
  // 길드 로딩 완료 = select 요소 등장
  await waitFor(() => {
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('PrivacyPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    localStorage.clear();
    mockAuthMe(GUILDS_FIXTURE);
    vi.mocked(userPrivacyApi.fetchUserPrivacy).mockResolvedValue(PRIVACY_FIXTURE);
    vi.mocked(userPrivacyApi.saveUserPrivacy).mockResolvedValue(PRIVACY_FIXTURE);
  });

  // ── W-1: 초기 로딩 + 토글 렌더 ──────────────────────────────────────────

  describe('W-1: 초기 로딩', () => {
    it('페이지 제목이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('privacy.title')).toBeInTheDocument();
    });

    it('로딩 완료 후 토글이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('fetchUserPrivacy가 초기 길드 ID로 호출된다', async () => {
      await renderAndWaitForLoad();

      await waitFor(() => {
        expect(vi.mocked(userPrivacyApi.fetchUserPrivacy)).toHaveBeenCalledWith('guild-1');
      });
    });
  });

  // ── W-2: 길드 드롭다운 ───────────────────────────────────────────────────

  describe('W-2: 길드 드롭다운', () => {
    it('user.guilds 목록이 드롭다운에 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByRole('option', { name: '테스트 서버' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '친구 서버' })).toBeInTheDocument();
    });
  });

  // ── W-3: 길드 변경 시 fetchUserPrivacy 재호출 ────────────────────────────

  describe('W-3: 길드 변경', () => {
    it('길드 변경 시 fetchUserPrivacy가 새 guildId로 재호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'guild-2');

      await waitFor(() => {
        expect(vi.mocked(userPrivacyApi.fetchUserPrivacy)).toHaveBeenCalledWith('guild-2');
      });
    });
  });

  // ── W-4: 토글 클릭 상태 반전 ─────────────────────────────────────────────

  describe('W-4: 토글 클릭', () => {
    it('토글 클릭 시 aria-checked 상태가 반전된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const toggle = screen.getByRole('switch');
      // disableRelationshipShare=false → 공개(ON) 표시
      expect(toggle).toHaveAttribute('aria-checked', 'true');

      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-checked', 'false');
      });
    });

    it('disableRelationshipShare=true이면 토글이 OFF 상태로 렌더링된다', async () => {
      vi.mocked(userPrivacyApi.fetchUserPrivacy).mockResolvedValue(PRIVACY_PRIVATE_FIXTURE);

      await renderAndWaitForLoad();

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  // ── W-5: 저장 성공 ───────────────────────────────────────────────────────

  describe('W-5: 저장 성공', () => {
    it('저장 클릭 시 saveUserPrivacy가 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('privacy.saveButton'));

      await waitFor(() => {
        expect(vi.mocked(userPrivacyApi.saveUserPrivacy)).toHaveBeenCalledWith(
          'guild-1',
          expect.objectContaining({ guildId: 'guild-1' }),
        );
      });
    });

    it('저장 성공 시 toast.success가 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('privacy.saveButton'));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('common.saveSuccess');
      });
    });
  });

  // ── W-6: 저장 실패 ───────────────────────────────────────────────────────

  describe('W-6: 저장 실패', () => {
    it('저장 API 실패 시 toast.error가 호출된다', async () => {
      vi.mocked(userPrivacyApi.saveUserPrivacy).mockRejectedValue(
        new Error('저장에 실패했습니다.'),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('privacy.saveButton'));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('저장에 실패했습니다.');
      });
    });
  });

  // ── W-7: 길드 0개 빈 상태 ────────────────────────────────────────────────

  describe('W-7: 길드 없음 빈 상태', () => {
    it('가입된 길드가 없으면 noGuilds 메시지를 표시한다', async () => {
      mockAuthMe([]);

      render(<PrivacyPage />);

      await waitFor(() => {
        expect(screen.getByText('privacy.noGuilds')).toBeInTheDocument();
      });
    });
  });

  // ── W-8: 미인증 리다이렉트 ───────────────────────────────────────────────

  describe('W-8: 미인증 리다이렉트', () => {
    it('미인증 사용자는 로그인 페이지로 리다이렉트된다', async () => {
      // auth/me가 null을 반환 (미인증)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve(null),
      } as Response);

      // window.location.href 변경 감지 — jsdom에서 location 객체 재정의
      const locationSpy = vi.spyOn(window, 'location', 'get');
      let capturedHref = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsdom Location 타입 재정의 시 필요한 단언
      const mockLocation = { href: '' } as any;
      Object.defineProperty(mockLocation, 'href', {
        set: (val: string) => {
          capturedHref = val;
        },
        get: () => capturedHref,
      });
      locationSpy.mockReturnValue(mockLocation);

      render(<PrivacyPage />);

      await waitFor(() => {
        expect(capturedHref).toContain('/auth/discord');
      });

      locationSpy.mockRestore();
    });
  });
});
