import { vi } from 'vitest';

// vi.hoisted를 사용해 hoisting 문제를 해결한다
const { mockCtx, mockCanvas } = vi.hoisted(() => {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 50 }),
  };
  const canvas = {
    getContext: vi.fn().mockReturnValue(ctx),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('fake-png-data')),
  };
  return { mockCtx: ctx, mockCanvas: canvas };
});

// @napi-rs/canvas는 네이티브 모듈이므로 전체 mock 처리
vi.mock('@napi-rs/canvas', () => ({
  createCanvas: vi.fn().mockReturnValue(mockCanvas),
  GlobalFonts: {
    registerFromPath: vi.fn(),
  },
}));

import { MissionStatus } from '../../domain/newbie-mission.types';
import type {
  MissionCanvasConfig,
  MissionCanvasEntry,
  MissionCanvasPageData,
} from './mission-rank.renderer';
import { MissionRankRenderer } from './mission-rank.renderer';

function makeConfig(overrides: Partial<MissionCanvasConfig> = {}): MissionCanvasConfig {
  return {
    totalCount: 5,
    statusCounts: {
      IN_PROGRESS: 3,
      COMPLETED: 1,
      FAILED: 1,
      LEFT: 0,
    },
    targetPlaytimeText: '20시간',
    targetPlayCountText: null,
    updatedAt: '2026-04-04 19:00:00',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<MissionCanvasEntry> = {}): MissionCanvasEntry {
  return {
    nickname: '테스트유저',
    period: '03-01~03-08',
    status: MissionStatus.IN_PROGRESS,
    statusEmoji: '🟡',
    statusText: '진행',
    playtimeSec: 3600,
    targetPlaytimeSec: 72000,
    playCount: 3,
    targetPlayCount: null,
    daysLeft: 10,
    ...overrides,
  };
}

function makePageData(overrides: Partial<MissionCanvasPageData> = {}): MissionCanvasPageData {
  return {
    pageNumber: 1,
    totalPages: 1,
    isFirstPage: true,
    entries: [],
    ...overrides,
  };
}

describe('MissionRankRenderer', () => {
  let renderer: MissionRankRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanvas.toBuffer.mockReturnValue(Buffer.from('fake-png-data'));
    renderer = new MissionRankRenderer();
  });

  describe('renderPage', () => {
    it('Buffer를 반환해야 한다', async () => {
      const data = makePageData();
      const config = makeConfig();

      const result = await renderer.renderPage(data, config);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('빈 entries로도 렌더링이 성공해야 한다', async () => {
      const data = makePageData({ entries: [] });
      const config = makeConfig({ totalCount: 0, statusCounts: {} });

      const result = await renderer.renderPage(data, config);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('10명 데이터로 렌더링해야 한다', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => makeEntry({ nickname: `유저${i + 1}` }));
      const data = makePageData({ entries });

      const result = await renderer.renderPage(data, makeConfig());

      expect(result).toBeInstanceOf(Buffer);
    });

    it('isFirstPage=true일 때 캔버스 높이에 HEADER_H(100)가 포함되어야 한다', async () => {
      const { createCanvas } = await import('@napi-rs/canvas');

      const dataWithHeader = makePageData({ isFirstPage: true, entries: [] });
      const dataWithoutHeader = makePageData({ isFirstPage: false, entries: [] });

      await renderer.renderPage(dataWithHeader, makeConfig());
      const callsWithHeader = (createCanvas as ReturnType<typeof vi.fn>).mock.calls;
      const heightWithHeader = callsWithHeader[callsWithHeader.length - 1][1] as number;

      vi.clearAllMocks();
      mockCanvas.toBuffer.mockReturnValue(Buffer.from('fake-png-data'));

      await renderer.renderPage(dataWithoutHeader, makeConfig());
      const callsWithoutHeader = (createCanvas as ReturnType<typeof vi.fn>).mock.calls;
      const heightWithoutHeader = callsWithoutHeader[callsWithoutHeader.length - 1][1] as number;

      // isFirstPage=true가 false보다 100px 높아야 한다
      expect(heightWithHeader - heightWithoutHeader).toBe(100);
    });

    it('canvas 너비는 800px로 생성되어야 한다', async () => {
      const { createCanvas } = await import('@napi-rs/canvas');

      await renderer.renderPage(makePageData(), makeConfig());

      expect(createCanvas).toHaveBeenCalledWith(800, expect.any(Number));
    });

    it('PNG 포맷으로 변환되어야 한다', async () => {
      await renderer.renderPage(makePageData(), makeConfig());

      expect(mockCanvas.toBuffer).toHaveBeenCalledWith('image/png');
    });

    it('isFirstPage=true이면 헤더 텍스트(신입 미션 현황)를 표시해야 한다', async () => {
      const data = makePageData({ isFirstPage: true, entries: [] });

      await renderer.renderPage(data, makeConfig());

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.includes('신입 미션 현황'))).toBe(true);
    });

    it('isFirstPage=false이면 헤더 텍스트(신입 미션 현황)를 표시하지 않아야 한다', async () => {
      const data = makePageData({ isFirstPage: false, entries: [] });

      await renderer.renderPage(data, makeConfig());

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.includes('신입 미션 현황'))).toBe(false);
    });

    it('푸터에 페이지 정보(N / M장)를 표시해야 한다', async () => {
      const data = makePageData({ pageNumber: 2, totalPages: 5, isFirstPage: false });

      await renderer.renderPage(data, makeConfig());

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.includes('2') && text.includes('5'))).toBe(true);
    });

    it('targetPlayCountText가 있으면 목표 텍스트에 포함시켜야 한다', async () => {
      const config = makeConfig({ targetPlayCountText: '10회' });
      const data = makePageData({ isFirstPage: true });

      await renderer.renderPage(data, config);

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.includes('10회'))).toBe(true);
    });

    it('targetPlayCountText가 null이면 횟수 목표를 표시하지 않아야 한다', async () => {
      const config = makeConfig({ targetPlayCountText: null });
      const data = makePageData({ isFirstPage: true });

      await renderer.renderPage(data, config);

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      // "회" 가 포함된 텍스트가 없어야 한다 (단, "목표" 텍스트 자체는 있을 수 있음)
      expect(fillTextCalls.some((text) => text.includes('회') && text.includes('목표'))).toBe(
        false,
      );
    });
  });

  describe('getProgressColor (간접 검증 — drawProgressBar를 통해)', () => {
    it('COMPLETED 상태이면 green(#22C55E) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      const entry = makeEntry({
        status: MissionStatus.COMPLETED,
        playtimeSec: 72000,
        targetPlaytimeSec: 72000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#22C55E');
    });

    it('FAILED 상태이면 red(#EF4444) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      const entry = makeEntry({
        status: MissionStatus.FAILED,
        playtimeSec: 3600,
        targetPlaytimeSec: 72000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#EF4444');
    });

    it('LEFT 상태이면 gray(#9CA3AF) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      // playtimeSec > 0이어야 진행 바가 실제로 그려져 색상이 적용된다
      const entry = makeEntry({
        status: MissionStatus.LEFT,
        playtimeSec: 3600,
        targetPlaytimeSec: 72000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#9CA3AF');
    });

    it('IN_PROGRESS 0~49% 진행률이면 amber(#F59E0B) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      // 30% 진행률
      const entry = makeEntry({
        status: MissionStatus.IN_PROGRESS,
        playtimeSec: 3600, // 30% of 12000
        targetPlaytimeSec: 12000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#F59E0B');
    });

    it('IN_PROGRESS 50~79% 진행률이면 blue(#3B82F6) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      // 60% 진행률
      const entry = makeEntry({
        status: MissionStatus.IN_PROGRESS,
        playtimeSec: 6000,
        targetPlaytimeSec: 10000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#3B82F6');
    });

    it('IN_PROGRESS 80~99% 진행률이면 emerald(#10B981) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      // 90% 진행률
      const entry = makeEntry({
        status: MissionStatus.IN_PROGRESS,
        playtimeSec: 9000,
        targetPlaytimeSec: 10000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#10B981');
    });
  });

  describe('formatDday (간접 검증 — drawDday를 통해)', () => {
    it('COMPLETED 상태이면 D-day를 "-"로 표시해야 한다', async () => {
      const entry = makeEntry({ status: MissionStatus.COMPLETED, daysLeft: 5 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('-');
    });

    it('LEFT 상태이면 D-day를 "-"로 표시해야 한다', async () => {
      const entry = makeEntry({ status: MissionStatus.LEFT, daysLeft: 3 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('-');
    });

    it('daysLeft < 0이면 "만료"를 표시해야 한다', async () => {
      const entry = makeEntry({ status: MissionStatus.FAILED, daysLeft: -1 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('만료');
    });

    it('daysLeft === 0이면 "D-DAY"를 표시해야 한다', async () => {
      const entry = makeEntry({ status: MissionStatus.IN_PROGRESS, daysLeft: 0 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('D-DAY');
    });

    it('daysLeft > 0이면 "D-N" 형식으로 표시해야 한다', async () => {
      const entry = makeEntry({ status: MissionStatus.IN_PROGRESS, daysLeft: 7 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('D-7');
    });
  });

  describe('getDdayColor (간접 검증)', () => {
    it('daysLeft >= 7이면 TEXT_PRIMARY 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      const entry = makeEntry({ status: MissionStatus.IN_PROGRESS, daysLeft: 10 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      // TEXT_PRIMARY = '#1a1a1a'
      expect(fillStyleValues).toContain('#1a1a1a');
    });

    it('daysLeft 3~6이면 amber(#F59E0B) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      const entry = makeEntry({ status: MissionStatus.IN_PROGRESS, daysLeft: 4 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#F59E0B');
    });

    it('daysLeft 1~2이면 red(#EF4444) 색상을 사용해야 한다', async () => {
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });

      const entry = makeEntry({ status: MissionStatus.IN_PROGRESS, daysLeft: 2 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      expect(fillStyleValues).toContain('#EF4444');
    });
  });

  describe('formatPlaytime (간접 검증 — 플레이타임 텍스트)', () => {
    it('시간만 있으면 "Xh" 형식으로 표시해야 한다', async () => {
      const entry = makeEntry({
        playtimeSec: 7200, // 2h 0m
        targetPlaytimeSec: 72000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.startsWith('2h/'))).toBe(true);
    });

    it('분만 있으면 "Xm" 형식으로 표시해야 한다', async () => {
      const entry = makeEntry({
        playtimeSec: 1800, // 0h 30m
        targetPlaytimeSec: 72000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.startsWith('30m/'))).toBe(true);
    });

    it('시간+분이면 "XhYm" 형식으로 표시해야 한다', async () => {
      const entry = makeEntry({
        playtimeSec: 4500, // 1h 15m
        targetPlaytimeSec: 72000,
      });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.startsWith('1h15m/'))).toBe(true);
    });
  });

  describe('횟수 텍스트 (drawCountText)', () => {
    it('targetPlayCount가 null이면 playCount만 표시해야 한다', async () => {
      const entry = makeEntry({ playCount: 7, targetPlayCount: null });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('7');
      expect(fillTextCalls.some((text) => text === '7/10')).toBe(false);
    });

    it('targetPlayCount가 설정되면 "playCount/targetPlayCount" 형식으로 표시해야 한다', async () => {
      const entry = makeEntry({ playCount: 7, targetPlayCount: 10 });
      await renderer.renderPage(
        makePageData({ entries: [entry], isFirstPage: false }),
        makeConfig(),
      );

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls).toContain('7/10');
    });
  });
});
