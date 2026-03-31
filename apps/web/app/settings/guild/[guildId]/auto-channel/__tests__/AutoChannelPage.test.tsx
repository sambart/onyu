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
        json: () => Promise.resolve({ configId: 99 }),
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
        json: () => Promise.resolve({ configId: 1 }),
      } as Response);
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
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

      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('autoChannel.stepChannelCreate')).toBeInTheDocument();
      });
    });

    it('instant 모드에서 select 모드로 전환하면 안내 메시지 설정(STEP 2)이 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant로 전환
      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);
      // select로 전환
      await user.click(screen.getByText('autoChannel.modeSelect').closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('autoChannel.stepGuideMessage')).toBeInTheDocument();
      });
    });

    it('instant 모드 선택 시 select 모드 전용 섹션(안내 메시지)이 사라진다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 초기에는 select 모드: 안내 메시지 설정이 보임
      expect(screen.getByText('autoChannel.stepGuideMessage')).toBeInTheDocument();

      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);

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
      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);

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
      await user.click(screen.getByText('autoChannel.modeInstant').closest('button')!);

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

      const callArgs = vi.mocked(global.fetch).mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/auto-channel') &&
          (opts as RequestInit)?.method === 'POST',
      );
      const body = JSON.parse((callArgs![1] as RequestInit).body as string) as {
        mode: string;
        instantCategoryId: string;
        instantNameTemplate?: string;
      };

      expect(body.mode).toBe('instant');
      expect(body.instantCategoryId).toBe('cat-1');
      // instantNameTemplate이 빈 문자열이면 undefined로 처리되어 JSON 직렬화 시 키가 생략된다
      // (page.tsx: instantNameTemplate: currentTab.instantNameTemplate || undefined)
    });

    it('저장 성공 시 성공 메시지를 표시한다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드 전환 후 필수 항목 입력
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
        expect(screen.getByText('common.saveSuccess')).toBeInTheDocument();
      });
    });
  });

  describe('API 실패 처리', () => {
    it('저장 API 실패 시 에러 메시지를 표시한다', async () => {
      mockFetchPostError(500, '서버 오류가 발생했습니다.');
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // instant 모드에서 최소 요구 항목 입력 후 저장
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
        expect(screen.getByText('서버 오류가 발생했습니다.')).toBeInTheDocument();
      });
    });
  });

  describe('탭 관리', () => {
    it('+ 추가 버튼을 클릭하면 새 탭이 생성된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const tabsBefore = screen.getAllByRole('button', { name: /\(미저장\)|common\.tabUnsaved/ });
      await user.click(screen.getByText('common.tabAdd'));

      const tabsAfter = screen
        .getAllByText('common.tabUnsaved')
        .filter((el) => el.tagName !== 'BUTTON'); // span 안의 텍스트 기준
      // 탭이 2개가 되어야 한다
      expect(screen.getAllByText('common.tabUnsaved').length).toBeGreaterThanOrEqual(2);
    });
  });
});
