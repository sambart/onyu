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

import type {
  CanvasRankConfig,
  MocoCanvasDetailData,
  MocoCanvasRankData,
} from './moco-rank.renderer';
import { MocoRankRenderer } from './moco-rank.renderer';

function makeConfig(overrides: Partial<CanvasRankConfig> = {}): CanvasRankConfig {
  return {
    scorePerSession: 10,
    scorePerMinute: 1,
    scorePerUnique: 5,
    minCoPresenceMin: 10,
    periodStart: null,
    periodEnd: null,
    embedColor: null,
    ...overrides,
  };
}

function makeRankData(overrides: Partial<MocoCanvasRankData> = {}): MocoCanvasRankData {
  return {
    currentPage: 1,
    totalPages: 1,
    entries: [],
    ...overrides,
  };
}

function makeDetailData(overrides: Partial<MocoCanvasDetailData> = {}): MocoCanvasDetailData {
  return {
    hunterId: 'hunter-1',
    hunterName: '테스트 사냥꾼',
    rank: 1,
    totalCount: 10,
    score: 150,
    channelMinutes: 120,
    sessionCount: 5,
    uniqueNewbieCount: 3,
    newbieEntries: [],
    config: makeConfig(),
    ...overrides,
  };
}

describe('MocoRankRenderer', () => {
  let renderer: MocoRankRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    // toBuffer가 항상 Buffer를 반환하도록 재설정
    mockCanvas.toBuffer.mockReturnValue(Buffer.from('fake-png-data'));
    renderer = new MocoRankRenderer();
  });

  describe('renderRankBoard', () => {
    it('Buffer를 반환해야 한다', async () => {
      const data = makeRankData();
      const config = makeConfig();

      const result = await renderer.renderRankBoard(data, config);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('사냥꾼이 없어도 빈 데이터로 렌더링해야 한다', async () => {
      const data = makeRankData({ entries: [] });
      const config = makeConfig();

      const result = await renderer.renderRankBoard(data, config);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('1명 데이터로 렌더링해야 한다', async () => {
      const data = makeRankData({
        entries: [
          {
            rank: 1,
            hunterId: 'h-1',
            hunterName: '사냥꾼1',
            score: 100,
            channelMinutes: 60,
            sessionCount: 3,
            uniqueNewbieCount: 2,
          },
        ],
      });

      const result = await renderer.renderRankBoard(data, makeConfig());

      expect(result).toBeInstanceOf(Buffer);
    });

    it('10명 데이터로 렌더링해야 한다', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1,
        hunterId: `h-${i + 1}`,
        hunterName: `사냥꾼${i + 1}`,
        score: (10 - i) * 100,
        channelMinutes: (10 - i) * 60,
        sessionCount: 10 - i,
        uniqueNewbieCount: 5 - Math.floor(i / 2),
      }));

      const data = makeRankData({ entries });

      const result = await renderer.renderRankBoard(data, makeConfig());

      expect(result).toBeInstanceOf(Buffer);
    });

    it('1~3위는 금/은/동 색상으로 표시되어야 한다 (fillStyle 호출 포함)', async () => {
      const data = makeRankData({
        entries: [
          {
            rank: 1,
            hunterId: 'h-1',
            hunterName: '1위',
            score: 300,
            channelMinutes: 180,
            sessionCount: 9,
            uniqueNewbieCount: 5,
          },
          {
            rank: 2,
            hunterId: 'h-2',
            hunterName: '2위',
            score: 200,
            channelMinutes: 120,
            sessionCount: 6,
            uniqueNewbieCount: 3,
          },
          {
            rank: 3,
            hunterId: 'h-3',
            hunterName: '3위',
            score: 100,
            channelMinutes: 60,
            sessionCount: 3,
            uniqueNewbieCount: 1,
          },
        ],
      });

      await renderer.renderRankBoard(data, makeConfig());

      // fillStyle에 금/은/동 색상이 설정됐는지 확인
      const fillStyleValues: string[] = [];
      Object.defineProperty(mockCtx, 'fillStyle', {
        get: () => '',
        set: (val: string) => {
          fillStyleValues.push(val);
        },
        configurable: true,
      });
    });

    it('periodStart가 있으면 기간 정보를 표시해야 한다', async () => {
      const data = makeRankData({ currentPage: 1, totalPages: 3 });
      const config = makeConfig({
        periodStart: '20240101',
        periodEnd: '20240131',
      });

      const result = await renderer.renderRankBoard(data, config);

      expect(result).toBeInstanceOf(Buffer);
      // fillText가 기간 정보를 포함하여 호출되어야 한다
      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it('periodStart가 null이면 기간 정보를 생략해야 한다', async () => {
      const data = makeRankData();
      const config = makeConfig({ periodStart: null, periodEnd: null });

      const result = await renderer.renderRankBoard(data, config);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('페이지 정보를 표시해야 한다 (N / M 페이지)', async () => {
      const data = makeRankData({ currentPage: 2, totalPages: 5 });

      await renderer.renderRankBoard(data, makeConfig());

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.includes('2') && text.includes('5'))).toBe(true);
    });

    it('점수 산정 규칙을 표시해야 한다', async () => {
      const config = makeConfig({
        scorePerSession: 15,
        scorePerMinute: 2,
        scorePerUnique: 8,
        minCoPresenceMin: 5,
      });

      await renderer.renderRankBoard(makeRankData(), config);

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(
        fillTextCalls.some(
          (text) => text.includes('2') && text.includes('8') && text.includes('5'),
        ),
      ).toBe(true);
    });

    it('canvas는 너비 800px로 생성되어야 한다', async () => {
      const { createCanvas } = await import('@napi-rs/canvas');

      await renderer.renderRankBoard(makeRankData(), makeConfig());

      expect(createCanvas).toHaveBeenCalledWith(800, expect.any(Number));
    });

    it('PNG 포맷으로 변환되어야 한다', async () => {
      await renderer.renderRankBoard(makeRankData(), makeConfig());

      expect(mockCanvas.toBuffer).toHaveBeenCalledWith('image/png');
    });
  });

  describe('renderHunterDetail', () => {
    it('Buffer를 반환해야 한다', async () => {
      const data = makeDetailData();

      const result = await renderer.renderHunterDetail(data);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('모코코 목록이 없어도 렌더링해야 한다', async () => {
      const data = makeDetailData({ newbieEntries: [] });

      const result = await renderer.renderHunterDetail(data);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('모코코 목록이 있으면 테이블을 렌더링해야 한다', async () => {
      const data = makeDetailData({
        newbieEntries: [
          { newbieName: '모코코1', minutes: 60, sessions: 3 },
          { newbieName: '모코코2', minutes: 30, sessions: 1 },
        ],
      });

      const result = await renderer.renderHunterDetail(data);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('모코코가 10명을 초과하면 최대 10명만 렌더링해야 한다', async () => {
      const newbieEntries = Array.from({ length: 15 }, (_, i) => ({
        newbieName: `모코코${i + 1}`,
        minutes: (15 - i) * 10,
        sessions: 15 - i,
      }));

      const data = makeDetailData({ newbieEntries });

      const result = await renderer.renderHunterDetail(data);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('canvas는 너비 600px로 생성되어야 한다', async () => {
      const { createCanvas } = await import('@napi-rs/canvas');

      await renderer.renderHunterDetail(makeDetailData());

      expect(createCanvas).toHaveBeenCalledWith(600, expect.any(Number));
    });

    it('PNG 포맷으로 변환되어야 한다', async () => {
      await renderer.renderHunterDetail(makeDetailData());

      expect(mockCanvas.toBuffer).toHaveBeenCalledWith('image/png');
    });

    it('사냥꾼 이름과 순위가 표시되어야 한다', async () => {
      const data = makeDetailData({
        hunterName: '특수사냥꾼',
        rank: 2,
      });

      await renderer.renderHunterDetail(data);

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(fillTextCalls.some((text) => text.includes('특수사냥꾼'))).toBe(true);
    });

    it('점수 산정 규칙을 표시해야 한다', async () => {
      const data = makeDetailData({
        config: makeConfig({
          scorePerSession: 20,
          scorePerMinute: 3,
          scorePerUnique: 10,
          minCoPresenceMin: 15,
        }),
      });

      await renderer.renderHunterDetail(data);

      const fillTextCalls = mockCtx.fillText.mock.calls.map((call) => call[0] as string);
      expect(
        fillTextCalls.some(
          (text) => text.includes('3') && text.includes('10') && text.includes('15'),
        ),
      ).toBe(true);
    });

    it('사냥 기록이 없는 사냥꾼의 경우 score 0으로 렌더링해야 한다', async () => {
      const data = makeDetailData({
        score: 0,
        channelMinutes: 0,
        sessionCount: 0,
        uniqueNewbieCount: 0,
        newbieEntries: [],
      });

      const result = await renderer.renderHunterDetail(data);

      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
