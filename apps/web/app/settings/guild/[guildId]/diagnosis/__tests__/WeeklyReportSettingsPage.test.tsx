/**
 * WeeklyReportSettingsPage 통합 테스트 (F-WEB-017)
 *
 * 유저 행동 관점에서 주간 리포트 설정 페이지의 전체 흐름을 검증한다.
 * - 초기 로딩 → 설정 렌더링 → 토글/드롭다운 상호작용 → 저장/실패 피드백
 * - 활성화 토글 on/off 시 폼 비활성화 동작
 * - 채널 미선택 상태에서 저장 시 유효성 에러 표시
 *
 * API 모듈을 vi.mock으로 직접 처리하여 fetch 레이어 의존성을 제거한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as discordApi from '../../../../../lib/discord-api';
import * as weeklyReportApi from '../../../../../lib/weekly-report-api';
import WeeklyReportSettingsPage from '../page';

// ─── 전역 모킹 ──────────────────────────────────────────────────────────────

const STABLE_T = (key: string, params?: Record<string, unknown>) => {
  if (params) return `${key}(${JSON.stringify(params)})`;
  return key;
};

vi.mock('next-intl', () => ({
  useTranslations: () => STABLE_T,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('../../../../SettingsContext', () => ({
  useSettings: () => ({ selectedGuildId: 'guild-123' }),
}));

vi.mock('../../../../../lib/discord-api', () => ({
  fetchGuildTextChannels: vi.fn(),
}));

vi.mock('../../../../../lib/weekly-report-api', () => ({
  fetchWeeklyReportConfig: vi.fn(),
  saveWeeklyReportConfig: vi.fn(),
  DEFAULT_WEEKLY_REPORT_CONFIG: {
    isEnabled: false,
    channelId: null,
    dayOfWeek: 1,
    hour: 9,
    timezone: 'Asia/Seoul',
  },
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const CHANNELS_FIXTURE = [
  { id: 'ch-001', name: '일반', type: 0 },
  { id: 'ch-002', name: '공지', type: 0 },
];

const CONFIG_FIXTURE = {
  isEnabled: true,
  channelId: 'ch-001',
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
};

const CONFIG_DISABLED_FIXTURE = {
  isEnabled: false,
  channelId: null,
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
};

// ─── 헬퍼 ───────────────────────────────────────────────────────────────────

async function renderAndWaitForLoad() {
  const result = render(<WeeklyReportSettingsPage />);
  await waitFor(() => {
    expect(screen.getByText('weeklyReport.title')).toBeInTheDocument();
    // 로딩 스피너가 사라질 때까지 대기
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
  });
  // 로딩 완료는 폼 요소 등장으로 판단한다
  await waitFor(() => {
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
  return result;
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('WeeklyReportSettingsPage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discordApi.fetchGuildTextChannels).mockResolvedValue(CHANNELS_FIXTURE);
    vi.mocked(weeklyReportApi.fetchWeeklyReportConfig).mockResolvedValue(CONFIG_FIXTURE);
    vi.mocked(weeklyReportApi.saveWeeklyReportConfig).mockResolvedValue(CONFIG_FIXTURE);
  });

  // ── 초기 로딩 및 렌더링 ──────────────────────────────────────────────────

  describe('초기 로딩', () => {
    it('페이지 제목이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByText('weeklyReport.title')).toBeInTheDocument();
    });

    it('기존 설정이 있으면 활성화 토글이 on 상태로 렌더링된다', async () => {
      await renderAndWaitForLoad();

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('기존 설정에서 저장된 채널이 드롭다운에 선택된다', async () => {
      await renderAndWaitForLoad();

      // 채널 select는 label이 없으므로 placeholder option으로 식별한다
      const channelSelect = screen
        .getAllByRole('combobox')
        .find(
          (el) => (el as HTMLSelectElement).querySelector('option[value="ch-001"]') !== null,
        ) as HTMLSelectElement;
      expect(channelSelect).toBeDefined();
      expect(channelSelect).toHaveValue('ch-001');
    });

    it('채널 목록이 드롭다운 옵션으로 표시된다', async () => {
      await renderAndWaitForLoad();

      expect(screen.getByRole('option', { name: '# 일반' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '# 공지' })).toBeInTheDocument();
    });

    it('비활성화 설정이면 활성화 토글이 off 상태로 렌더링된다', async () => {
      vi.mocked(weeklyReportApi.fetchWeeklyReportConfig).mockResolvedValue(CONFIG_DISABLED_FIXTURE);

      await renderAndWaitForLoad();

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('초기 로드 시 fetchWeeklyReportConfig와 fetchGuildTextChannels가 guildId로 호출된다', async () => {
      await renderAndWaitForLoad();

      expect(vi.mocked(weeklyReportApi.fetchWeeklyReportConfig)).toHaveBeenCalledWith('guild-123');
      expect(vi.mocked(discordApi.fetchGuildTextChannels)).toHaveBeenCalledWith('guild-123');
    });

    it('대시보드 진단 페이지 크로스링크가 렌더링된다', async () => {
      await renderAndWaitForLoad();

      const dashboardLink = screen
        .getAllByRole('link')
        .find((el) => el.getAttribute('href') === '/dashboard/guild/guild-123/diagnosis');

      expect(dashboardLink).toBeDefined();
    });
  });

  // ── 활성화 토글 ──────────────────────────────────────────────────────────

  describe('활성화/비활성화 토글', () => {
    it('활성화 토글을 끄면 폼이 비활성화(opacity-50, pointer-events-none)된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-checked', 'false');
      });

      // 폼 컨테이너가 pointer-events-none 클래스를 가진다
      const formContainer = document.querySelector('.pointer-events-none');
      expect(formContainer).toBeInTheDocument();
    });

    it('비활성화 상태에서 토글을 켜면 폼이 활성화된다', async () => {
      vi.mocked(weeklyReportApi.fetchWeeklyReportConfig).mockResolvedValue(CONFIG_DISABLED_FIXTURE);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-checked', 'true');
      });

      // pointer-events-none이 사라진다
      expect(document.querySelector('.pointer-events-none')).not.toBeInTheDocument();
    });
  });

  // ── 채널 선택 ────────────────────────────────────────────────────────────

  describe('채널 선택', () => {
    it('드롭다운에서 다른 채널을 선택하면 해당 채널이 선택 상태로 변경된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const channelSelect = screen
        .getAllByRole('combobox')
        .find(
          (el) => (el as HTMLSelectElement).querySelector('option[value="ch-001"]') !== null,
        ) as HTMLSelectElement;
      await user.selectOptions(channelSelect, 'ch-002');

      expect(channelSelect).toHaveValue('ch-002');
    });

    it('채널 새로고침 버튼 클릭 시 fetchGuildTextChannels가 재호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const initialCallCount = vi.mocked(discordApi.fetchGuildTextChannels).mock.calls.length;

      // 새로고침 버튼은 weeklyReport.refreshChannels 텍스트를 가진다
      const refreshButton = screen.getByText('weeklyReport.refreshChannels');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(vi.mocked(discordApi.fetchGuildTextChannels).mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      });
    });
  });

  // ── 발송 요일 선택 ───────────────────────────────────────────────────────

  describe('발송 요일 선택', () => {
    it('요일 버튼들이 렌더링된다', async () => {
      await renderAndWaitForLoad();

      // DAY_KEYS의 0~6 키에 해당하는 번역 키가 표시된다
      expect(screen.getByText('weeklyReport.days.0')).toBeInTheDocument();
      expect(screen.getByText('weeklyReport.days.1')).toBeInTheDocument();
      expect(screen.getByText('weeklyReport.days.6')).toBeInTheDocument();
    });

    it('요일 버튼을 클릭하면 해당 요일이 선택된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      // 현재 선택된 요일: 1(월요일) → 3(수요일)으로 변경
      const wedButton = screen.getByText('weeklyReport.days.3');
      await user.click(wedButton);

      // 클릭 후 해당 버튼에 bg-indigo-600 클래스가 적용된다
      await waitFor(() => {
        expect(wedButton.className).toContain('bg-indigo-600');
      });
    });
  });

  // ── 발송 시각 선택 ───────────────────────────────────────────────────────

  describe('발송 시각 선택', () => {
    it('시각 드롭다운이 현재 설정값(9시)으로 초기화된다', async () => {
      await renderAndWaitForLoad();

      // hour select는 value가 숫자('9')인 select다 (채널 select는 'ch-001')
      const hourSelect = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === '9');

      expect(hourSelect).toBeDefined();
      expect(hourSelect).toHaveValue('9');
    });

    it('시각 드롭다운에서 다른 시각을 선택하면 값이 변경된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      const hourSelect = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === '9') as HTMLSelectElement;

      expect(hourSelect).toBeDefined();
      await user.selectOptions(hourSelect, '18');
      expect(hourSelect).toHaveValue('18');
    });
  });

  // ── 저장 동작 ────────────────────────────────────────────────────────────

  describe('저장 동작', () => {
    it('활성화 상태에서 채널 미선택 시 저장하면 유효성 에러가 표시된다', async () => {
      vi.mocked(weeklyReportApi.fetchWeeklyReportConfig).mockResolvedValue({
        ...CONFIG_FIXTURE,
        channelId: null,
      });

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        expect(screen.getByText('weeklyReport.validationChannelRequired')).toBeInTheDocument();
      });

      // saveWeeklyReportConfig API가 호출되지 않아야 한다
      expect(vi.mocked(weeklyReportApi.saveWeeklyReportConfig)).not.toHaveBeenCalled();
    });

    it('채널이 선택된 상태에서 저장하면 saveWeeklyReportConfig API가 호출된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        expect(vi.mocked(weeklyReportApi.saveWeeklyReportConfig)).toHaveBeenCalledWith(
          'guild-123',
          expect.objectContaining({ channelId: 'ch-001' }),
        );
      });
    });

    it('저장 성공 시 성공 메시지가 표시된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        expect(screen.getByText('weeklyReport.saveSuccess')).toBeInTheDocument();
      });
    });

    it('저장 API 실패 시 에러 메시지가 표시된다', async () => {
      vi.mocked(weeklyReportApi.saveWeeklyReportConfig).mockRejectedValue(
        new Error('채널을 찾을 수 없습니다.'),
      );

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        expect(screen.getByText('채널을 찾을 수 없습니다.')).toBeInTheDocument();
      });
    });

    it('비활성화 상태에서는 채널 미선택이어도 유효성 통과 후 API가 호출된다', async () => {
      vi.mocked(weeklyReportApi.fetchWeeklyReportConfig).mockResolvedValue(CONFIG_DISABLED_FIXTURE);
      vi.mocked(weeklyReportApi.saveWeeklyReportConfig).mockResolvedValue(CONFIG_DISABLED_FIXTURE);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        expect(vi.mocked(weeklyReportApi.saveWeeklyReportConfig)).toHaveBeenCalledWith(
          'guild-123',
          expect.objectContaining({ isEnabled: false }),
        );
      });

      expect(screen.queryByText('weeklyReport.validationChannelRequired')).not.toBeInTheDocument();
    });

    it('저장 성공 후 서버 응답값으로 설정이 업데이트된다', async () => {
      const savedConfig = { ...CONFIG_FIXTURE, channelId: 'ch-002', hour: 18 };
      vi.mocked(weeklyReportApi.saveWeeklyReportConfig).mockResolvedValue(savedConfig);

      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        const channelSelect = screen
          .getAllByRole('combobox')
          .find(
            (el) => (el as HTMLSelectElement).querySelector('option[value="ch-002"]') !== null,
          ) as HTMLSelectElement;
        expect(channelSelect).toBeDefined();
        expect(channelSelect).toHaveValue('ch-002');
      });
    });

    it('저장 버튼 클릭 시 API 요청에 isEnabled, channelId, dayOfWeek, hour가 포함된다', async () => {
      const user = userEvent.setup();
      await renderAndWaitForLoad();

      await user.click(screen.getByText('save'));

      await waitFor(() => {
        const callArgs = vi.mocked(weeklyReportApi.saveWeeklyReportConfig).mock.calls[0];
        expect(callArgs[0]).toBe('guild-123');
        expect(callArgs[1]).toMatchObject({
          isEnabled: true,
          channelId: 'ch-001',
          dayOfWeek: 1,
          hour: 9,
        });
      });
    });
  });
});
