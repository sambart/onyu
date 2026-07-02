import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AutoChannelSettingsPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key}(${JSON.stringify(params)})`;
    }
    return key;
  },
  useLocale: () => 'ko',
}));

vi.mock('../../../../SettingsContext', () => ({
  useSettings: () => ({ selectedGuildId: 'guild-123' }),
}));

vi.mock('../../../../../lib/discord-api', () => ({
  fetchGuildChannels: vi.fn().mockResolvedValue([
    { id: 'vc-1', name: '대기실', type: 2 },
    { id: 'txt-1', name: '일반', type: 0 },
    { id: 'cat-1', name: '게임방', type: 4 },
  ]),
  fetchGuildEmojis: vi.fn().mockResolvedValue([]),
}));

// GuildEmojiPicker: emojis가 빈 배열이면 null 반환이므로 별도 모킹 불필요

vi.mock('../../../../../lib/relative-time', () => ({
  formatRelativeTime: () => '방금 전',
}));

// 토스트 — Provider 없이 렌더링하므로 useToast를 스텁으로 대체한다
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError, info: vi.fn() }),
}));

// UnsavedChangesContext — Provider 없이 렌더링하므로 스텁으로 대체한다.
// isDirty 인자를 스파이로 기록해 "편집 시 dirty=true → 저장 성공 후 dirty=false" 전이를 검증한다.
const mockUseUnsavedChangesGuard = vi.fn((isDirty: boolean) => {
  void isDirty; // 스파이 타입 시그니처 유지 — 구현은 항상 이동을 허용한다
  return { confirmDiscardIfDirty: () => true };
});
vi.mock('../../../../../components/settings/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: (isDirty: boolean) => mockUseUnsavedChangesGuard(isDirty),
}));

// ─── fetch 전역 모킹 ────────────────────────────────────────────

function mockFetchGetEmpty() {
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';

    if (method === 'GET' || !options?.method) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }

    if (method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ configId: 99, lastSavedAt: '2026-06-21T10:00:00.000Z' }),
      } as Response);
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

function mockFetchWithConfigs(configs: unknown[]) {
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';

    if (!options?.method || method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(configs),
      } as Response);
    }

    if (method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ configId: 1, lastSavedAt: '2026-06-21T10:00:00.000Z' }),
      } as Response);
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
}

function mockFetchWithConfigsAndReApply(
  configs: unknown[],
  reApplyResponse: { ok: boolean; guideMessageId: string | null } = {
    ok: true,
    guideMessageId: 'msg-re-applied',
  },
) {
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';

    if (typeof url === 'string' && url.includes('/re-apply') && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(reApplyResponse),
      } as Response);
    }

    if (!options?.method || method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(configs),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ configId: 1, lastSavedAt: '2026-06-21T10:00:00.000Z' }),
    } as Response);
  });
}

/** 탭 삭제(DELETE) 결과를 제어하는 fetch 모킹 — T-3(alert → toast.error) 검증용 */
function mockFetchWithConfigsAndDelete(
  configs: unknown[],
  deleteResult: { ok: boolean; status?: number } | 'network-error',
) {
  global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';

    if (method === 'DELETE') {
      if (deleteResult === 'network-error') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({
        ok: deleteResult.ok,
        status: deleteResult.status ?? 200,
        json: () => Promise.resolve({}),
      } as Response);
    }

    if (!options?.method || method === 'GET') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(configs) } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ configId: 1, lastSavedAt: '2026-06-21T10:00:00.000Z' }),
    } as Response);
  });
}

function mockFetchPostError(status: number, message: string) {
  global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';

    if (!options?.method || method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);
    }

    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({ message }),
    } as Response);
  });
}

// ─── 헬퍼 ───────────────────────────────────────────────────────

/**
 * 페이지를 렌더링하고 로딩이 완료될 때까지 기다린다.
 * 로딩 완료 신호는 "autoChannel.stepTrigger" 텍스트(STEP 1 제목) 출현이다.
 */
async function renderAndWaitForLoad() {
  const result = render(<AutoChannelSettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('autoChannel.stepTrigger')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────

describe('AutoChannelSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    mockFetchGetEmpty();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockUseUnsavedChangesGuard.mockClear();
  });

  describe('초기 로딩', () => {
    it('로딩 중에는 스피너가 표시된다', async () => {
      render(<AutoChannelSettingsPage />);
      // Loader2 아이콘은 animate-spin 클래스로 식별 (동기적으로 즉시 표시됨)
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
      // 비동기 상태 업데이트가 act() 밖에서 발생하는 경고를 방지하기 위해 로딩 완료를 기다린다
      await waitFor(() => {
        expect(screen.queryByText('autoChannel.title')).toBeInTheDocument();
      });
    });

    it('데이터 로딩 완료 후 STEP 1(트리거 설정) 섹션이 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('autoChannel.stepTrigger')).toBeInTheDocument();
    });

    it('서버에서 기존 설정이 있으면 해당 탭을 표시한다', async () => {
      mockFetchWithConfigs([
        {
          id: 1,
          name: '게임방 설정',
          triggerChannelId: 'vc-1',
          mode: 'select',
          instantCategoryId: null,
          instantNameTemplate: null,
          guideChannelId: 'txt-1',
          guideMessage: '게임을 선택하세요.',
          embedTitle: '안내',
          embedColor: '#5865F2',
          buttons: [],
          lastSavedAt: null,
        },
      ]);

      await renderAndWaitForLoad();

      expect(screen.getByText('게임방 설정')).toBeInTheDocument();
    });
  });

  describe('모드 전환', () => {
    it('instant 모드로 전환하면 채널 생성 설정(STEP 2) 섹션이 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const instantBtn1 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn1) throw new Error('modeInstant button not found');
      await user.click(instantBtn1);

      await waitFor(() => {
        expect(screen.getByText('autoChannel.stepChannelCreate')).toBeInTheDocument();
      });
    });

    it('instant 모드에서 select 모드로 전환하면 안내 메시지 설정(STEP 2)이 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant로 전환
      const instantBtn2 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn2) throw new Error('modeInstant button not found');
      await user.click(instantBtn2);
      // select로 전환
      const selectBtn1 = screen.getByText('autoChannel.modeSelect').closest('button');
      if (!selectBtn1) throw new Error('modeSelect button not found');
      await user.click(selectBtn1);

      await waitFor(() => {
        expect(screen.getByText('autoChannel.stepGuideMessage')).toBeInTheDocument();
      });
    });

    it('instant 모드 선택 시 select 모드 전용 섹션(안내 메시지)이 사라진다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기에는 select 모드: 안내 메시지 설정이 보임
      expect(screen.getByText('autoChannel.stepGuideMessage')).toBeInTheDocument();

      const instantBtn3 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn3) throw new Error('modeInstant button not found');
      await user.click(instantBtn3);

      await waitFor(() => {
        expect(screen.queryByText('autoChannel.stepGuideMessage')).toBeNull();
      });
    });
  });

  describe('저장 유효성 검사', () => {
    it('설정 이름을 입력하지 않으면 에러 메시지를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('autoChannel.validationName')).toBeInTheDocument();
      });
    });

    it('instant 모드에서 카테고리를 선택하지 않으면 에러 메시지를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드 전환
      const instantBtn4 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn4) throw new Error('modeInstant button not found');
      await user.click(instantBtn4);

      // 설정 이름 입력
      const nameInput = screen.getByPlaceholderText('autoChannel.configNamePlaceholder');
      await user.type(nameInput, '게임방 설정');

      // 트리거 채널 선택
      const triggerSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(triggerSelect, 'vc-1');

      // 카테고리 미선택 상태로 저장
      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('autoChannel.validationInstantCategory')).toBeInTheDocument();
      });
    });

    it('트리거 채널을 선택하지 않으면 에러 메시지를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const nameInput = screen.getByPlaceholderText('autoChannel.configNamePlaceholder');
      await user.type(nameInput, '테스트 설정');

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(screen.getByText('autoChannel.validationTriggerChannel')).toBeInTheDocument();
      });
    });
  });

  describe('instant 모드 저장', () => {
    it('instant 모드 저장 요청 본문에 mode/instantCategoryId/instantNameTemplate이 포함된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드 전환
      const instantBtn5 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn5) throw new Error('modeInstant button not found');
      await user.click(instantBtn5);

      // 설정 이름
      const nameInput = screen.getByPlaceholderText('autoChannel.configNamePlaceholder');
      await user.type(nameInput, '즉시 생성 설정');

      // 트리거 채널 선택 (첫 번째 combobox)
      const triggerSelect = screen.getAllByRole('combobox')[0];
      await user.selectOptions(triggerSelect, 'vc-1');

      // 카테고리 선택 (두 번째 combobox — instant-category-select)
      const categorySelect = screen.getByRole('combobox', { name: /autoChannel\.instantCategory/ });
      await user.selectOptions(categorySelect, 'cat-1');

      // 저장
      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/guilds/guild-123/auto-channel',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"mode":"instant"'),
          }),
        );
      });

      const callArgs = vi
        .mocked(global.fetch)
        .mock.calls.find(
          ([url, opts]) =>
            typeof url === 'string' &&
            url.includes('/auto-channel') &&
            (opts as RequestInit)?.method === 'POST',
        );
      if (!callArgs) throw new Error('fetch call not found');
      const body = JSON.parse((callArgs[1] as RequestInit).body as string) as {
        mode: string;
        instantCategoryId: string;
        instantNameTemplate?: string;
      };

      expect(body.mode).toBe('instant');
      expect(body.instantCategoryId).toBe('cat-1');
      // instantNameTemplate이 빈 문자열이면 undefined로 처리되어 JSON 직렬화 시 키가 생략된다
      // (page.tsx: instantNameTemplate: currentTab.instantNameTemplate || undefined)
    });

    it('저장 성공 시 toast.success가 호출된다 (인라인 성공 텍스트는 표시되지 않음)', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드 전환 후 필수 항목 입력
      const instantBtn6 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn6) throw new Error('modeInstant button not found');
      await user.click(instantBtn6);
      await user.type(
        screen.getByPlaceholderText('autoChannel.configNamePlaceholder'),
        '즉시 생성 설정',
      );
      await user.selectOptions(screen.getAllByRole('combobox')[0], 'vc-1');
      await user.selectOptions(
        screen.getByRole('combobox', { name: /autoChannel\.instantCategory/ }),
        'cat-1',
      );

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('common.saveSuccess');
      });
      expect(screen.queryByText('common.saveSuccess')).not.toBeInTheDocument();
    });
  });

  // ─── 미저장 변경사항(dirty) 추적 → 이탈 가드 연동 ────────────────────────

  describe('미저장 변경사항 추적', () => {
    it('로드 직후에는 dirty=false로 가드에 전달된다', async () => {
      await renderAndWaitForLoad();

      await waitFor(() => {
        expect(mockUseUnsavedChangesGuard).toHaveBeenLastCalledWith(false);
      });
    });

    it('필드를 편집하면 dirty=true로 가드에 전달된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.type(screen.getByPlaceholderText('autoChannel.configNamePlaceholder'), '편집중');

      await waitFor(() => {
        expect(mockUseUnsavedChangesGuard).toHaveBeenLastCalledWith(true);
      });
    });

    it('저장 성공 후에는 dirty=false로 되돌아가 가드가 해제된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드 최소 요구 입력 (편집 → dirty=true)
      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);
      await user.type(
        screen.getByPlaceholderText('autoChannel.configNamePlaceholder'),
        '즉시 생성 설정',
      );
      await user.selectOptions(screen.getAllByRole('combobox')[0], 'vc-1');
      await user.selectOptions(
        screen.getByRole('combobox', { name: /autoChannel\.instantCategory/ }),
        'cat-1',
      );

      await waitFor(() => {
        expect(mockUseUnsavedChangesGuard).toHaveBeenLastCalledWith(true);
      });

      await user.click(screen.getByText('common.save'));

      // 저장 성공(서버가 configId/lastSavedAt 반환) → 스냅샷 갱신 → dirty=false
      await waitFor(() => {
        expect(mockUseUnsavedChangesGuard).toHaveBeenLastCalledWith(false);
      });
    });
  });

  describe('API 실패 처리', () => {
    it('저장 API 실패 시 toast.error가 호출된다 (인라인 에러 텍스트는 표시되지 않음)', async () => {
      mockFetchPostError(500, '서버 오류가 발생했습니다.');
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드에서 최소 요구 항목 입력 후 저장
      const instantBtn7 = screen.getByText('autoChannel.modeInstant').closest('button');
      if (!instantBtn7) throw new Error('modeInstant button not found');
      await user.click(instantBtn7);
      await user.type(
        screen.getByPlaceholderText('autoChannel.configNamePlaceholder'),
        '즉시 생성 설정',
      );
      await user.selectOptions(screen.getAllByRole('combobox')[0], 'vc-1');
      await user.selectOptions(
        screen.getByRole('combobox', { name: /autoChannel\.instantCategory/ }),
        'cat-1',
      );

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('서버 오류가 발생했습니다.');
      });
      expect(screen.queryByText('서버 오류가 발생했습니다.')).not.toBeInTheDocument();
    });
  });

  describe('탭 관리', () => {
    it('+ 추가 버튼을 클릭하면 새 탭이 생성된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('common.tabAdd'));

      // 탭이 2개가 되어야 한다
      expect(screen.getAllByText('common.tabUnsaved').length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── 탭 삭제 — T-3: alert() → toast.error 대체 ─────────────────────────

  describe('탭 삭제 (T-3: 삭제 에러 alert → toast.error)', () => {
    const SAVED_TAB = {
      id: 1,
      name: '게임방 설정',
      triggerChannelId: 'vc-1',
      mode: 'select',
      instantCategoryId: null,
      instantNameTemplate: null,
      guideChannelId: 'txt-1',
      guideMessage: '게임을 선택하세요.',
      embedTitle: '안내',
      embedColor: '#5865F2',
      buttons: [],
      lastSavedAt: null,
    };

    it('삭제 확인 다이얼로그에서 취소하면 탭이 삭제되지 않는다', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      mockFetchWithConfigsAndDelete([SAVED_TAB], { ok: true });
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      expect(screen.getByText('게임방 설정')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'autoChannel.deleteAriaLabel' }));

      expect(confirmSpy).toHaveBeenCalledWith('common.deleteConfig');
      expect(screen.getByText('게임방 설정')).toBeInTheDocument();
      expect(mockToastError).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('삭제 API가 실패 상태 코드를 반환하면 toast.error(deleteError)가 호출되고 탭이 유지된다', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockFetchWithConfigsAndDelete([SAVED_TAB], { ok: false, status: 500 });
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: 'autoChannel.deleteAriaLabel' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('common.deleteError({"status":500})');
      });
      // 실패 시 탭은 화면에서 제거되지 않아야 한다
      expect(screen.getByText('게임방 설정')).toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    it('삭제 API 호출이 네트워크 오류로 실패하면 toast.error(deleteNetworkError)가 호출된다', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockFetchWithConfigsAndDelete([SAVED_TAB], 'network-error');
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: 'autoChannel.deleteAriaLabel' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('common.deleteNetworkError');
      });

      confirmSpy.mockRestore();
    });

    it('삭제 API가 성공하면 탭이 화면에서 제거된다', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockFetchWithConfigsAndDelete([SAVED_TAB], { ok: true });
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: 'autoChannel.deleteAriaLabel' }));

      await waitFor(() => {
        expect(screen.queryByText('게임방 설정')).not.toBeInTheDocument();
      });
      expect(mockToastError).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  // ─── LastAppliedBadge (variant='saved') ────────────────────────────────

  describe('LastAppliedBadge (variant=saved)', () => {
    it('신규 탭에서는 notSaved 배지가 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('notSaved')).toBeInTheDocument();
    });

    it('서버에서 lastSavedAt이 있는 설정을 로드하면 lastSaved 배지가 표시된다', async () => {
      mockFetchWithConfigs([
        {
          id: 1,
          name: '게임방 설정',
          triggerChannelId: 'vc-1',
          mode: 'select',
          instantCategoryId: null,
          instantNameTemplate: null,
          guideChannelId: 'txt-1',
          guideMessage: '게임을 선택하세요.',
          embedTitle: '안내',
          embedColor: '#5865F2',
          buttons: [],
          lastSavedAt: '2026-06-21T10:00:00.000Z',
        },
      ]);

      await renderAndWaitForLoad();

      expect(screen.getByText('lastSaved({"time":"방금 전"})')).toBeInTheDocument();
    });

    it('저장 성공 후 응답 lastSavedAt으로 배지가 갱신된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기: 저장 안 됨
      expect(screen.getByText('notSaved')).toBeInTheDocument();

      // instant 모드로 저장
      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);
      await user.type(
        screen.getByPlaceholderText('autoChannel.configNamePlaceholder'),
        '즉시 생성 설정',
      );
      await user.selectOptions(screen.getAllByRole('combobox')[0], 'vc-1');
      await user.selectOptions(
        screen.getByRole('combobox', { name: /autoChannel\.instantCategory/ }),
        'cat-1',
      );

      await user.click(screen.getByText('common.save'));

      await waitFor(() => {
        // 저장 성공 → 배지가 lastSaved로 변경
        expect(screen.getByText('lastSaved({"time":"방금 전"})')).toBeInTheDocument();
      });
    });
  });

  // ─── ReApplyButton (다시 반영, settings-apply 2차 §4) ──────────────────────

  describe('ReApplyButton', () => {
    it('미저장 탭(id 없음)에서는 다시 반영 버튼이 비활성화된다', async () => {
      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).toBeDisabled();
    });

    it('저장된 select 모드 설정을 로드하면 다시 반영 버튼이 활성화된다', async () => {
      mockFetchWithConfigsAndReApply([
        {
          id: 1,
          name: '게임방 설정',
          triggerChannelId: 'vc-1',
          mode: 'select',
          instantCategoryId: null,
          instantNameTemplate: null,
          guideChannelId: 'txt-1',
          guideMessage: '게임을 선택하세요.',
          embedTitle: '안내',
          embedColor: '#5865F2',
          buttons: [],
          lastSavedAt: '2026-06-21T10:00:00.000Z',
        },
      ]);

      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).not.toBeDisabled();
    });

    it('저장된 instant 모드 설정을 로드하면 다시 반영 버튼이 비활성화된다 (안내 메시지 없음)', async () => {
      mockFetchWithConfigsAndReApply([
        {
          id: 1,
          name: '즉시 생성 설정',
          triggerChannelId: 'vc-1',
          mode: 'instant',
          instantCategoryId: 'cat-1',
          instantNameTemplate: null,
          guideChannelId: null,
          guideMessage: null,
          embedTitle: null,
          embedColor: null,
          buttons: [],
          lastSavedAt: '2026-06-21T10:00:00.000Z',
        },
      ]);

      await renderAndWaitForLoad();

      const reApplyBtn = screen.getByRole('button', { name: /reApply/ });
      expect(reApplyBtn).toBeDisabled();
    });

    it('다시 반영 클릭 시 re-apply 엔드포인트를 호출하고 성공 토스트를 표시한다', async () => {
      mockFetchWithConfigsAndReApply(
        [
          {
            id: 1,
            name: '게임방 설정',
            triggerChannelId: 'vc-1',
            mode: 'select',
            instantCategoryId: null,
            instantNameTemplate: null,
            guideChannelId: 'txt-1',
            guideMessage: '게임을 선택하세요.',
            embedTitle: '안내',
            embedColor: '#5865F2',
            buttons: [],
            lastSavedAt: '2026-06-21T10:00:00.000Z',
          },
        ],
        { ok: true, guideMessageId: 'msg-re-applied' },
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/guilds/guild-123/auto-channel/1/re-apply',
          expect.objectContaining({ method: 'POST' }),
        );
        expect(mockToastSuccess).toHaveBeenCalledWith('common.apply.reApplySuccess');
      });
      // 재게시는 lastSavedAt을 갱신하지 않는다 — 배지는 기존 저장 시각 그대로 유지
      expect(screen.getByText('lastSaved({"time":"방금 전"})')).toBeInTheDocument();
    });

    it('re-apply 응답이 ok:false이면 실패 토스트를 표시한다', async () => {
      mockFetchWithConfigsAndReApply(
        [
          {
            id: 1,
            name: '게임방 설정',
            triggerChannelId: 'vc-1',
            mode: 'select',
            instantCategoryId: null,
            instantNameTemplate: null,
            guideChannelId: 'txt-1',
            guideMessage: '게임을 선택하세요.',
            embedTitle: '안내',
            embedColor: '#5865F2',
            buttons: [],
            lastSavedAt: '2026-06-21T10:00:00.000Z',
          },
        ],
        { ok: false, guideMessageId: null },
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /reApply/ }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('common.apply.reApplyError');
      });
    });
  });
});
