/**
 * MyVoicePage 통합 테스트
 *
 * 유저 관점 검증 항목:
 * 1. 페이지 상태 분기 — loading-guilds → empty-no-guilds | loading-profile → ready | empty-no-activity | error
 * 2. 상호작용 — 길드 변경 / 기간 변경 시 현재 선택 값 유지하며 profile 재조회
 * 3. 렌더 정확성(계약) — peakDayOfWeek 문자열 표시, excludedChannels .name 표시, micUsageRate 이중곱셈 버그 회귀 방지
 *
 * me-voice-api 모듈을 vi.mock으로 직접 처리하여 fetch 레이어 의존성을 제거한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── recharts 모킹 (jsdom에서 ResizeObserver 부재로 인한 오류 방지) ─────────
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

// ─── shadcn/ui chart 컴포넌트 모킹 (recharts context 의존) ──────────────────
vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));

// ─── next/image 모킹 ─────────────────────────────────────────────────────────
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 테스트 목적 stub
    <img src={src} alt={alt} width={width} height={height} className={className} />
  ),
}));

// ─── next-intl 모킹 ──────────────────────────────────────────────────────────
// 번역 키를 그대로 반환하여 실제 로케일 파일 의존성을 제거한다.
// 인터폴레이션이 있는 키(rankValue, activeDaysValue 등)는 파라미터를 포함한 문자열로 반환한다.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      let result = key;
      for (const [k, v] of Object.entries(params)) {
        result = result + `(${k}=${String(v)})`;
      }
      return result;
    }
    return key;
  },
}));

// ─── me-voice-api 모킹 ────────────────────────────────────────────────────────
import * as meVoiceApi from '@/app/lib/me-voice-api';

vi.mock('@/app/lib/me-voice-api', () => ({
  fetchMeGuilds: vi.fn(),
  fetchMeProfile: vi.fn(),
}));

// ─── 픽스처 ────────────────────────────────────────────────────────────────────

const GUILD_A = { guildId: 'guild-a', guildName: '서버 A', guildIcon: null };
const GUILD_B = { guildId: 'guild-b', guildName: '서버 B', guildIcon: null };

const PROFILE_FIXTURE = {
  rank: 3,
  totalUsers: 50,
  totalSec: 7200, // 2h
  activeDays: 10,
  avgDailySec: 720, // 12m
  micOnSec: 3600, // 1h
  micOffSec: 3600, // 1h
  micUsageRate: 75, // BE에서 이미 퍼센트값으로 전달 (0~100)
  aloneSec: 1800, // 30m
  dailyChart: [
    { date: '20250601', durationSec: 3600 },
    { date: '20250602', durationSec: 1800 },
  ],
  peakDayOfWeek: '화', // 문자열 요일명 (숫자 인덱스 아님)
  weeklyAvgSec: 3600,
  badges: ['early_bird', 'night_owl'],
  excludedChannels: [
    { name: 'AFK 채널', type: 'voice' },
    { name: '관리자 채널', type: 'voice' },
  ],
};

// ─── 테스트 ────────────────────────────────────────────────────────────────────

import MyVoicePage from '../page';

describe('MyVoicePage 통합 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 페이지 상태 분기
  // ══════════════════════════════════════════════════════════════════════════

  describe('페이지 상태 분기', () => {
    describe('S-1: 길드 0개 → 빈 상태', () => {
      it('길드 목록이 비어 있으면 "활동 기록 없음" 안내가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([]);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('me.noGuilds')).toBeInTheDocument();
        });
      });

      it('길드 0개 빈 상태에서는 GuildSelector와 PeriodSelector가 렌더링되지 않는다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([]);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('me.noGuilds')).toBeInTheDocument();
        });

        // GuildSelector의 label은 'me.guildSelector.label'
        expect(screen.queryByText('me.guildSelector.label')).not.toBeInTheDocument();
      });
    });

    describe('S-2: 길드 1개 → 드롭다운 대신 고정 라벨 + 첫 길드 자동선택 + profile 로드', () => {
      it('길드 1개이면 드롭다운(select)이 없고 길드명이 라벨로 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        render(<MyVoicePage />);

        await waitFor(() => {
          // 드롭다운 없이 서버명이 스팬으로 렌더링된다
          expect(screen.getByText('서버 A')).toBeInTheDocument();
        });

        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      });

      it('길드 1개 + 기본 period=15로 fetchMeProfile이 호출된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 15);
        });
      });

      it('profile 로드 성공 시 통계 컴포넌트들이 렌더링된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        render(<MyVoicePage />);

        // MeSummaryCards 렌더 확인: 총 음성 시간 카드 레이블
        await waitFor(() => {
          expect(screen.getByText('me.summary.totalSec')).toBeInTheDocument();
        });
      });
    });

    describe('S-3: 길드 2개+ → 드롭다운 렌더링', () => {
      it('길드가 2개 이상이면 드롭다운(select)이 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A, GUILD_B]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByRole('combobox')).toBeInTheDocument();
        });
      });

      it('드롭다운에 모든 길드 옵션이 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A, GUILD_B]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByRole('option', { name: '서버 A' })).toBeInTheDocument();
          expect(screen.getByRole('option', { name: '서버 B' })).toBeInTheDocument();
        });
      });
    });

    describe('S-4: profile 204(null) → 활동 없음 안내', () => {
      it('profile API가 null을 반환하면 "해당 기간 활동 없음" 안내가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(null);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('me.noActivity')).toBeInTheDocument();
        });
      });

      it('활동 없음 상태에서도 GuildSelector와 PeriodSelector는 유지된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(null);

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('me.noActivity')).toBeInTheDocument();
        });

        // GuildSelector label은 me.guildSelector.label
        expect(screen.getByText('me.guildSelector.label')).toBeInTheDocument();
      });
    });

    describe('S-5: profile fetch 에러 → 에러 상태', () => {
      it('profile API가 에러를 throw하면 에러 메시지가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockRejectedValue(new Error('서버 오류'));

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('error.loadFailed')).toBeInTheDocument();
        });
      });

      it('profile 에러 상태에서도 GuildSelector와 PeriodSelector는 유지된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockRejectedValue(new Error('서버 오류'));

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('error.loadFailed')).toBeInTheDocument();
        });

        expect(screen.getByText('me.guildSelector.label')).toBeInTheDocument();
      });
    });

    describe('S-6: 길드 목록 fetch 에러 → 에러 상태 + 재시도 버튼', () => {
      it('길드 목록 API 에러 시 에러 메시지와 재시도 버튼이 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockRejectedValue(new Error('길드 로드 실패'));

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('error.loadFailed')).toBeInTheDocument();
          expect(screen.getByRole('button', { name: 'common.refresh' })).toBeInTheDocument();
        });
      });

      it('재시도 버튼 클릭 시 fetchMeGuilds가 다시 호출된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockRejectedValue(new Error('길드 로드 실패'));

        const user = userEvent.setup();
        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'common.refresh' })).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'common.refresh' }));

        // 재시도 후 fetchMeGuilds가 총 2회 호출되어야 한다 (초기 1회 + 재시도 1회)
        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeGuilds)).toHaveBeenCalledTimes(2);
        });
      });

      it('재시도 성공 시 에러 화면이 사라지고 프로필 데이터가 표시된다', async () => {
        // 첫 번째 호출은 실패, 두 번째 호출은 성공
        vi.mocked(meVoiceApi.fetchMeGuilds)
          .mockRejectedValueOnce(new Error('길드 로드 실패'))
          .mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        const user = userEvent.setup();
        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'common.refresh' })).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'common.refresh' }));

        await waitFor(() => {
          expect(screen.getByText('me.summary.totalSec')).toBeInTheDocument();
        });

        expect(screen.queryByText('error.loadFailed')).not.toBeInTheDocument();
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 상호작용
  // ══════════════════════════════════════════════════════════════════════════

  describe('상호작용', () => {
    describe('I-1: 길드 변경 → 현재 기간 유지하며 재조회', () => {
      it('길드 변경 시 fetchMeProfile이 새 guildId와 현재 기간으로 재호출된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A, GUILD_B]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        const user = userEvent.setup();
        render(<MyVoicePage />);

        // 초기 로드 완료 대기
        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 15);
        });

        const select = screen.getByRole('combobox');
        await user.selectOptions(select, 'guild-b');

        await waitFor(() => {
          // 기간(15)은 유지되고 guildId만 변경된다
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-b', 15);
        });
      });
    });

    describe('I-2: 기간 변경 → 현재 길드 유지하며 재조회', () => {
      it('7일 버튼 클릭 시 fetchMeProfile이 현재 guildId와 days=7로 재호출된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        const user = userEvent.setup();
        render(<MyVoicePage />);

        // 초기 로드 완료 대기
        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 15);
        });

        // PeriodSelector의 7일 버튼 (i18n 키: me.period.7d)
        const btn7d = screen.getByRole('button', { name: 'me.period.7d' });
        await user.click(btn7d);

        await waitFor(() => {
          // guildId는 유지되고 days만 7로 변경된다
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 7);
        });
      });

      it('30일 버튼 클릭 시 fetchMeProfile이 현재 guildId와 days=30으로 재호출된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        const user = userEvent.setup();
        render(<MyVoicePage />);

        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 15);
        });

        const btn30d = screen.getByRole('button', { name: 'me.period.30d' });
        await user.click(btn30d);

        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 30);
        });
      });

      it('기간 변경 후 길드 변경 시 변경된 기간이 유지된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A, GUILD_B]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue(PROFILE_FIXTURE);

        const user = userEvent.setup();
        render(<MyVoicePage />);

        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 15);
        });

        // 기간을 7일로 변경
        await user.click(screen.getByRole('button', { name: 'me.period.7d' }));
        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 7);
        });

        // 길드를 B로 변경 → 기간(7)이 유지되어야 한다
        const select = screen.getByRole('combobox');
        await user.selectOptions(select, 'guild-b');

        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-b', 7);
        });
      });
    });

    describe('I-3: 활동 없음 상태에서 길드/기간 변경', () => {
      it('활동 없음 상태에서 기간 변경 시 profile을 재조회한다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        // 첫 번째 호출은 null(활동 없음), 두 번째 호출은 데이터 반환
        vi.mocked(meVoiceApi.fetchMeProfile)
          .mockResolvedValueOnce(null)
          .mockResolvedValue(PROFILE_FIXTURE);

        const user = userEvent.setup();
        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('me.noActivity')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'me.period.30d' }));

        await waitFor(() => {
          expect(vi.mocked(meVoiceApi.fetchMeProfile)).toHaveBeenCalledWith('guild-a', 30);
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 렌더 정확성(계약) 검증
  // ══════════════════════════════════════════════════════════════════════════

  describe('렌더 정확성(계약)', () => {
    describe('C-1: MePeakDayCard — peakDayOfWeek 문자열 요일명을 그대로 표시', () => {
      it('BE가 반환한 한글 요일명 "화"가 숫자 변환 없이 그대로 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          peakDayOfWeek: '화',
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          // "화"는 숫자 인덱스(2 등)로 변환하지 않고 문자열 그대로 렌더링되어야 한다
          expect(screen.getByText('화')).toBeInTheDocument();
        });
      });

      it('peakDayOfWeek가 null이면 "-"가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          peakDayOfWeek: null,
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('-')).toBeInTheDocument();
        });
      });

      it('요일명의 다른 값들(월, 수, 목, 금, 토, 일)도 그대로 표시된다', async () => {
        const dayNames = ['월', '수', '목', '금', '토', '일'];

        for (const day of dayNames) {
          vi.clearAllMocks();
          vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
          vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
            ...PROFILE_FIXTURE,
            peakDayOfWeek: day,
          });

          const { unmount } = render(<MyVoicePage />);

          await waitFor(() => {
            expect(screen.getByText(day)).toBeInTheDocument();
          });

          unmount();
        }
      });
    });

    describe('C-2: MeExcludedChannelBanner — 객체의 .name 표시', () => {
      it('제외 채널 배너에 객체의 .name 필드가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          excludedChannels: [
            { name: 'AFK 채널', type: 'voice' },
            { name: '관리자 채널', type: 'voice' },
          ],
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          // .name 값이 표시되어야 한다
          expect(screen.getByText('AFK 채널, 관리자 채널')).toBeInTheDocument();
        });
      });

      it('제외 채널이 없으면 배너가 렌더링되지 않는다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          excludedChannels: [],
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.queryByText('me.excluded.title')).not.toBeInTheDocument();
        });
      });

      it('단일 제외 채널의 .name이 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          excludedChannels: [{ name: '대기실', type: 'voice' }],
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('대기실')).toBeInTheDocument();
        });
      });
    });

    describe('C-3: MeSummaryCards — micUsageRate 이중곱셈 버그 회귀 방지', () => {
      it('BE가 75를 반환하면 "75%"가 표시된다 (*100 이중 곱셈 없이)', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          micUsageRate: 75,
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          // 75%여야 한다. 7500%가 표시되면 이중곱셈 버그
          expect(screen.getByText('75%')).toBeInTheDocument();
        });

        expect(screen.queryByText('7500%')).not.toBeInTheDocument();
      });

      it('BE가 0을 반환하면 "0%"가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          micUsageRate: 0,
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('0%')).toBeInTheDocument();
        });
      });

      it('BE가 100을 반환하면 "100%"가 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          micUsageRate: 100,
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('100%')).toBeInTheDocument();
        });
      });

      it('소수점 micUsageRate은 반올림되어 표시된다', async () => {
        vi.mocked(meVoiceApi.fetchMeGuilds).mockResolvedValue([GUILD_A]);
        vi.mocked(meVoiceApi.fetchMeProfile).mockResolvedValue({
          ...PROFILE_FIXTURE,
          micUsageRate: 66.7,
        });

        render(<MyVoicePage />);

        await waitFor(() => {
          expect(screen.getByText('67%')).toBeInTheDocument();
        });
      });
    });
  });
});
