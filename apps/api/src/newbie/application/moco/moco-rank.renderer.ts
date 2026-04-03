import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { Injectable, Logger } from '@nestjs/common';

// ── 랭킹 보드 레이아웃 상수 ──
const RANK_W = 800;
const RANK_HEADER_H = 80;
const RANK_TABLE_HEADER_H = 40;
const RANK_SCORE_RULE_H = 50;
const RANK_FOOTER_H = 36;
const RANK_PADDING_V = 24;

// ── 개인 상세 레이아웃 상수 ──
const DETAIL_W = 600;
const DETAIL_HEADER_H = 80;
const DETAIL_SUMMARY_H = 120;
const DETAIL_SCORE_RULE_H = 50;
const DETAIL_PADDING_V = 24;

// ── 공통 레이아웃 상수 ──
const ROW_HEIGHT = 44;
const PADDING = 28;
const CARD_RADIUS = 12;
/** PADDING 오른쪽/왼쪽 내부 여백 */
const INNER_MARGIN = 8;
/** 헤더 구분선 하단 여백 */
const HEADER_DIVIDER_MARGIN = 8;
/** 헤더 텍스트 Y좌표 오프셋 */
const HEADER_TITLE_Y = 32;

// ── 텍스트 baseline 오프셋 ──
const TEXT_BASELINE_OFFSET = 5;
const TEXT_BASELINE_SMALL = 4;

// ── 상세 카드 레이아웃 ──
const DETAIL_CARD_H = 50;
const DETAIL_CARD_GAP = 12;
const DETAIL_CARD_LABEL_Y = 18;
const DETAIL_CARD_VALUE_Y = 42;
const DETAIL_CARD_FONT_LARGE = 18;
const DETAIL_COL_GAP = 12;
/** 상세 카드 이름 오른쪽 여백 */
const DETAIL_NAME_MARGIN = 20;

// ── 점수 규칙 섹션 ──
const SCORE_RULE_MARGIN = 8;
const SCORE_RULE_RADIUS = 6;
const SCORE_RULE_TEXT_PADDING = 12;
const SCORE_RULE_TEXT_BASELINE = 4;

// ── 페이지 정보 ──
const PAGE_INFO_BOTTOM_MARGIN = 2;

// ── 테이블 내부 ──
const TABLE_CELL_PADDING = 8;
const TABLE_COL_NAME_PADDING = 16;
const TABLE_HEADER_RADIUS = 6;
const TABLE_ROW_EVEN_COLOR = '#fafafa';
const TABLE_LINE_WIDTH_THIN = 0.5;

// ── 섹션 최대 모코코 표시 수 ──
const MAX_NEWBIE_DISPLAY = 10;
/** 모코코 목록 섹션 레이블 높이 */
const NEWBIE_SECTION_LABEL_H = 32;
/** 모코코 목록 섹션 레이블 Y 오프셋 */
const NEWBIE_SECTION_LABEL_Y = 16;
/** 모코코 목록 섹션 테이블 헤더 Y 오프셋 */
const NEWBIE_SECTION_HEADER_Y = 24;

// ── 상세 요약 카드 강조 색상 ──
const ACCENT_CARD_BG = '#EEF2FF';
const ACCENT_CARD_BORDER = '#C7D7FE';
/** 상세 요약 카드 내부 좌측 여백 */
const DETAIL_CARD_LABEL_PADDING = 10;

// ── 색상 팔레트 (profile-card-renderer.ts 참조) ──
const BG = '#f0f0f0';
const CARD_BG = '#ffffff';
const ACCENT = '#f5f5f5';
const BLURPLE = '#5B8DEF';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const BORDER = '#e0e0e0';
const DIVIDER = '#e5e5e5';

// ── 순위별 강조 색상 ──
const RANK_GOLD = '#FFD700';
const RANK_SILVER = '#C0C0C0';
const RANK_BRONZE = '#CD7F32';
const RANK_NORMAL = '#d0d0d0';

// ── 테이블 컬럼 너비 비율 (합: 1.0) ──
const COL_RANK_W = 48;
const COL_NAME_W = 240;
const COL_SCORE_W = 88;
const COL_MIN_W = 88;
const COL_SESSION_W = 80;
const COL_UNIQUE_W = 80;

// ── Canvas 캐시 TTL ──
const CANVAS_CACHE_TTL_SEC = 30;

export { CANVAS_CACHE_TTL_SEC };

/** 랭킹 보드 Canvas 렌더링 입력 데이터 */
export interface MocoCanvasRankData {
  currentPage: number;
  totalPages: number;
  entries: Array<{
    rank: number;
    hunterId: string;
    hunterName: string;
    score: number;
    channelMinutes: number;
    sessionCount: number;
    uniqueNewbieCount: number;
  }>;
}

/** 랭킹 보드 Canvas 설정 */
export interface CanvasRankConfig {
  scorePerSession: number;
  scorePerMinute: number;
  scorePerUnique: number;
  minCoPresenceMin: number;
  periodStart: string | null;
  periodEnd: string | null;
  embedColor: string | null;
}

/** 개인 상세 Canvas 렌더링 입력 데이터 */
export interface MocoCanvasDetailData {
  hunterId: string;
  hunterName: string;
  rank: number;
  totalCount: number;
  score: number;
  channelMinutes: number;
  sessionCount: number;
  uniqueNewbieCount: number;
  newbieEntries: Array<{
    newbieName: string;
    minutes: number;
    sessions: number;
  }>;
  config: CanvasRankConfig;
}

@Injectable()
export class MocoRankRenderer {
  private readonly logger = new Logger(MocoRankRenderer.name);

  constructor() {
    this.registerFonts();
  }

  private registerFonts(): void {
    const cjkPaths = [
      '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    ];
    for (const path of cjkPaths) {
      try {
        GlobalFonts.registerFromPath(path, 'NotoSansCJK');
        this.logger.log(`CJK font registered: ${path}`);
        break;
      } catch (err) {
        // 해당 경로에 폰트가 없으면 다음 경로를 시도한다
        this.logger.warn(
          `CJK font not found at ${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const emojiPaths = [
      '/usr/share/fonts/noto/NotoColorEmoji.ttf',
      '/usr/share/fonts/noto-emoji/NotoColorEmoji.ttf',
    ];
    for (const path of emojiPaths) {
      try {
        GlobalFonts.registerFromPath(path, 'NotoColorEmoji');
        this.logger.log(`Emoji font registered: ${path}`);
        break;
      } catch (err) {
        // 해당 경로에 폰트가 없으면 다음 경로를 시도한다
        this.logger.warn(
          `Emoji font not found at ${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * 랭킹 테이블 이미지를 렌더링한다.
   * @param data 페이지 내 사냥꾼 목록 (최대 10명)
   * @param config 길드 설정 (점수 규칙, 기간 정보)
   * @returns PNG Buffer
   */

  async renderRankBoard(data: MocoCanvasRankData, config: CanvasRankConfig): Promise<Buffer> {
    const entryCount = data.entries.length;
    const tableH = RANK_TABLE_HEADER_H + entryCount * ROW_HEIGHT;
    const canvasH =
      RANK_PADDING_V + RANK_HEADER_H + tableH + RANK_SCORE_RULE_H + RANK_FOOTER_H + RANK_PADDING_V;

    const canvas = createCanvas(RANK_W, canvasH);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, RANK_W, canvasH);
    this.drawRankBoardTitle(ctx, data, config);
    this.drawRankTable(ctx, data, RANK_PADDING_V + RANK_HEADER_H);
    this.drawScoreRule(ctx, config, RANK_PADDING_V + RANK_HEADER_H + tableH);
    this.drawPageInfo(ctx, data, canvasH);

    return canvas.toBuffer('image/png');
  }

  /**
   * 개인 상세 이미지를 렌더링한다.
   * @param data 사냥꾼 개인 데이터
   * @returns PNG Buffer
   */

  async renderHunterDetail(data: MocoCanvasDetailData): Promise<Buffer> {
    const newbieRowCount = Math.min(data.newbieEntries.length, MAX_NEWBIE_DISPLAY);
    const newbieTableH = newbieRowCount > 0 ? RANK_TABLE_HEADER_H + newbieRowCount * ROW_HEIGHT : 0;
    const newbieSectionH = newbieRowCount > 0 ? newbieTableH + NEWBIE_SECTION_LABEL_H : 0;

    const canvasH =
      DETAIL_PADDING_V +
      DETAIL_HEADER_H +
      DETAIL_SUMMARY_H +
      newbieSectionH +
      DETAIL_SCORE_RULE_H +
      DETAIL_PADDING_V;

    const canvas = createCanvas(DETAIL_W, canvasH);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, DETAIL_W, canvasH);
    this.drawDetailHeader(ctx, data);
    this.drawDetailSummary(ctx, data, DETAIL_PADDING_V + DETAIL_HEADER_H);
    if (newbieRowCount > 0) {
      this.drawDetailNewbieTable(
        ctx,
        data.newbieEntries.slice(0, MAX_NEWBIE_DISPLAY),
        DETAIL_PADDING_V + DETAIL_HEADER_H + DETAIL_SUMMARY_H,
      );
    }
    this.drawScoreRule(
      ctx,
      data.config,
      DETAIL_PADDING_V + DETAIL_HEADER_H + DETAIL_SUMMARY_H + newbieSectionH,
      DETAIL_W,
    );

    return canvas.toBuffer('image/png');
  }

  private drawBackground(ctx: SKRSContext2D, w: number, h: number): void {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    this.roundRect(ctx, PADDING / 2, PADDING / 2, w - PADDING, h - PADDING, CARD_RADIUS);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawRankBoardTitle(
    ctx: SKRSContext2D,
    data: MocoCanvasRankData,
    config: CanvasRankConfig,
  ): void {
    const y = RANK_PADDING_V + HEADER_TITLE_Y;

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 24px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('모코코 사냥 순위', PADDING + INNER_MARGIN, y);

    let periodText = '';
    if (config.periodStart) {
      const start = this.formatPeriodDate(config.periodStart);
      const end = config.periodEnd ? this.formatPeriodDate(config.periodEnd) : '현재';
      periodText = `${start} ~ ${end}`;
    }

    if (periodText) {
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '13px "NotoSansCJK", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(periodText, RANK_W - PADDING - INNER_MARGIN, y);
      ctx.textAlign = 'left';
    }

    const dividerY = RANK_PADDING_V + RANK_HEADER_H - HEADER_DIVIDER_MARGIN;
    ctx.beginPath();
    ctx.moveTo(PADDING + INNER_MARGIN, dividerY);
    ctx.lineTo(RANK_W - PADDING - INNER_MARGIN, dividerY);
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // eslint-disable-next-line max-lines-per-function
  private drawRankTable(ctx: SKRSContext2D, data: MocoCanvasRankData, startY: number): void {
    const tableX = PADDING + INNER_MARGIN;
    const tableW = RANK_W - (PADDING + INNER_MARGIN) * 2;

    // 테이블 헤더 배경
    this.roundRect(ctx, tableX, startY, tableW, RANK_TABLE_HEADER_H, TABLE_HEADER_RADIUS);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 테이블 헤더 텍스트
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 12px "NotoSansCJK", sans-serif';
    this.drawTableRow(ctx, tableX, startY, RANK_TABLE_HEADER_H, [
      { text: '순위', w: COL_RANK_W, align: 'center' },
      { text: '사냥꾼', w: COL_NAME_W, align: 'left' },
      { text: '점수', w: COL_SCORE_W, align: 'right' },
      { text: '시간(분)', w: COL_MIN_W, align: 'right' },
      { text: '세션', w: COL_SESSION_W, align: 'right' },
      { text: '모코코', w: COL_UNIQUE_W, align: 'right' },
    ]);

    // 데이터 행
    for (let i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];
      const rowY = startY + RANK_TABLE_HEADER_H + i * ROW_HEIGHT;
      const isEven = i % 2 === 0;

      if (isEven) {
        ctx.fillStyle = TABLE_ROW_EVEN_COLOR;
        ctx.fillRect(tableX, rowY, tableW, ROW_HEIGHT);
      }

      // 구분선
      ctx.beginPath();
      ctx.moveTo(tableX, rowY);
      ctx.lineTo(tableX + tableW, rowY);
      ctx.strokeStyle = DIVIDER;
      ctx.lineWidth = TABLE_LINE_WIDTH_THIN;
      ctx.stroke();

      const rankColor = this.getRankColor(entry.rank);
      ctx.fillStyle = rankColor;
      ctx.font = 'bold 13px "NotoSansCJK", "NotoColorEmoji", sans-serif';

      const rankEmoji =
        entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
      const rankText = rankEmoji ?? `${entry.rank}`;

      ctx.textAlign = 'center';
      ctx.fillText(rankText, tableX + COL_RANK_W / 2, rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET);
      ctx.textAlign = 'left';

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      const truncatedName = this.truncateName(
        ctx,
        entry.hunterName,
        COL_NAME_W - TABLE_COL_NAME_PADDING,
      );
      ctx.fillText(
        truncatedName,
        tableX + COL_RANK_W + TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET,
      );

      ctx.fillStyle = BLURPLE;
      ctx.font = 'bold 13px "NotoSansCJK", sans-serif';
      ctx.textAlign = 'right';
      const colScoreX = tableX + COL_RANK_W + COL_NAME_W + COL_SCORE_W;
      ctx.fillText(
        String(entry.score),
        colScoreX - TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET,
      );

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = '12px "NotoSansCJK", sans-serif';
      const colMinX = colScoreX + COL_MIN_W;
      ctx.fillText(
        String(entry.channelMinutes),
        colMinX - TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET,
      );

      const colSessionX = colMinX + COL_SESSION_W;
      ctx.fillText(
        String(entry.sessionCount),
        colSessionX - TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET,
      );

      const colUniqueX = colSessionX + COL_UNIQUE_W;
      ctx.fillText(
        String(entry.uniqueNewbieCount),
        colUniqueX - TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET,
      );

      ctx.textAlign = 'left';
    }

    // 테이블 외곽선
    const totalTableH = RANK_TABLE_HEADER_H + data.entries.length * ROW_HEIGHT;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, startY, tableW, totalTableH);
  }

  // eslint-disable-next-line max-params
  private drawTableRow(
    ctx: SKRSContext2D,
    tableX: number,
    rowY: number,
    rowH: number,
    cols: Array<{ text: string; w: number; align: 'left' | 'center' | 'right' }>,
  ): void {
    let x = tableX;
    for (const col of cols) {
      ctx.textAlign = col.align;
      const textX =
        col.align === 'center'
          ? x + col.w / 2
          : col.align === 'right'
            ? x + col.w - TABLE_CELL_PADDING
            : x + TABLE_CELL_PADDING;
      ctx.fillText(col.text, textX, rowY + rowH / 2 + TEXT_BASELINE_OFFSET);
      x += col.w;
    }
    ctx.textAlign = 'left';
  }

  // eslint-disable-next-line max-params
  private drawScoreRule(
    ctx: SKRSContext2D,
    config: CanvasRankConfig,
    startY: number,
    w = RANK_W,
  ): void {
    const ruleX = PADDING + INNER_MARGIN;
    const ruleW = w - (PADDING + INNER_MARGIN) * 2;

    this.roundRect(
      ctx,
      ruleX,
      startY + SCORE_RULE_MARGIN,
      ruleW,
      RANK_SCORE_RULE_H - SCORE_RULE_MARGIN,
      SCORE_RULE_RADIUS,
    );
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '11px "NotoSansCJK", sans-serif';
    const ruleText =
      `점수 산정: 세션 +${config.scorePerSession}점 · 분당 +${config.scorePerMinute}점 · ` +
      `고유 모코코 +${config.scorePerUnique}점 · 최소 동시접속 ${config.minCoPresenceMin}분`;
    ctx.fillText(
      ruleText,
      ruleX + SCORE_RULE_TEXT_PADDING,
      startY +
        SCORE_RULE_MARGIN +
        (RANK_SCORE_RULE_H - SCORE_RULE_MARGIN) / 2 +
        SCORE_RULE_TEXT_BASELINE,
    );
  }

  private drawPageInfo(ctx: SKRSContext2D, data: MocoCanvasRankData, canvasH: number): void {
    const pageText = `${data.currentPage} / ${data.totalPages} 페이지`;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '12px "NotoSansCJK", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      pageText,
      RANK_W - PADDING - INNER_MARGIN,
      canvasH - RANK_PADDING_V / 2 - PAGE_INFO_BOTTOM_MARGIN,
    );
    ctx.textAlign = 'left';
  }

  private drawDetailHeader(ctx: SKRSContext2D, data: MocoCanvasDetailData): void {
    const y = DETAIL_PADDING_V + HEADER_TITLE_Y;

    const rankColor = this.getRankColor(data.rank);
    ctx.fillStyle = rankColor;
    ctx.font = `bold ${DETAIL_CARD_FONT_LARGE}px "NotoSansCJK", "NotoColorEmoji", sans-serif`;
    const rankEmoji =
      data.rank === 1 ? '🥇' : data.rank === 2 ? '🥈' : data.rank === 3 ? '🥉' : `${data.rank}위`;
    ctx.fillText(rankEmoji, PADDING + INNER_MARGIN, y);

    const rankTextW = ctx.measureText(rankEmoji).width;
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 20px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const truncatedName = this.truncateName(
      ctx,
      data.hunterName,
      DETAIL_W - PADDING * 2 - rankTextW - DETAIL_NAME_MARGIN,
    );
    ctx.fillText(truncatedName, PADDING + INNER_MARGIN + rankTextW + INNER_MARGIN, y);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '13px "NotoSansCJK", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`전체 ${data.totalCount}명 중`, DETAIL_W - PADDING - INNER_MARGIN, y);
    ctx.textAlign = 'left';

    const dividerY = DETAIL_PADDING_V + DETAIL_HEADER_H - HEADER_DIVIDER_MARGIN;
    ctx.beginPath();
    ctx.moveTo(PADDING + INNER_MARGIN, dividerY);
    ctx.lineTo(DETAIL_W - PADDING - INNER_MARGIN, dividerY);
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawDetailSummary(ctx: SKRSContext2D, data: MocoCanvasDetailData, startY: number): void {
    const cardInnerX = PADDING + INNER_MARGIN;
    const cardW = (DETAIL_W - cardInnerX * 2 - DETAIL_COL_GAP) / 2;
    const cardX = cardInnerX;

    const cards = [
      { label: '총 점수', value: `${data.score}점`, accent: true },
      { label: '사냥 시간', value: `${data.channelMinutes}분` },
      { label: '세션 횟수', value: `${data.sessionCount}회` },
      { label: '고유 모코코', value: `${data.uniqueNewbieCount}명` },
    ];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = cardX + col * (cardW + DETAIL_COL_GAP);
      const y = startY + row * (DETAIL_CARD_H + DETAIL_CARD_GAP) + DETAIL_CARD_GAP;

      this.roundRect(ctx, x, y, cardW, DETAIL_CARD_H, DETAIL_CARD_GAP);
      ctx.fillStyle = card.accent ? ACCENT_CARD_BG : ACCENT;
      ctx.fill();
      ctx.strokeStyle = card.accent ? ACCENT_CARD_BORDER : BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '11px "NotoSansCJK", sans-serif';
      ctx.fillText(card.label, x + DETAIL_CARD_LABEL_PADDING, y + DETAIL_CARD_LABEL_Y);

      ctx.fillStyle = card.accent ? BLURPLE : TEXT_PRIMARY;
      ctx.font = `bold ${DETAIL_CARD_FONT_LARGE}px "NotoSansCJK", sans-serif`;
      ctx.fillText(card.value, x + DETAIL_CARD_LABEL_PADDING, y + DETAIL_CARD_VALUE_Y);
    }
  }

  // eslint-disable-next-line max-lines-per-function
  private drawDetailNewbieTable(
    ctx: SKRSContext2D,
    entries: Array<{ newbieName: string; minutes: number; sessions: number }>,
    startY: number,
  ): void {
    const tableX = PADDING + INNER_MARGIN;
    const tableW = DETAIL_W - (PADDING + INNER_MARGIN) * 2;
    const colMinW = 100;
    const colSessionW = 80;
    const colNameW = tableW - colMinW - colSessionW;
    const sectionLabelY = NEWBIE_SECTION_LABEL_Y;
    const sectionHeaderY = NEWBIE_SECTION_HEADER_Y;

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 12px "NotoSansCJK", sans-serif';
    ctx.fillText('도움준 모코코', tableX, startY + sectionLabelY);

    const tHeaderY = startY + sectionHeaderY;

    this.roundRect(ctx, tableX, tHeaderY, tableW, RANK_TABLE_HEADER_H, TABLE_HEADER_RADIUS);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 11px "NotoSansCJK", sans-serif';
    ctx.fillText(
      '닉네임',
      tableX + TABLE_CELL_PADDING,
      tHeaderY + RANK_TABLE_HEADER_H / 2 + TEXT_BASELINE_SMALL,
    );
    ctx.textAlign = 'right';
    ctx.fillText(
      '시간(분)',
      tableX + colNameW + colMinW - TABLE_CELL_PADDING,
      tHeaderY + RANK_TABLE_HEADER_H / 2 + TEXT_BASELINE_SMALL,
    );
    ctx.fillText(
      '세션',
      tableX + colNameW + colMinW + colSessionW - TABLE_CELL_PADDING,
      tHeaderY + RANK_TABLE_HEADER_H / 2 + TEXT_BASELINE_SMALL,
    );
    ctx.textAlign = 'left';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rowY = tHeaderY + RANK_TABLE_HEADER_H + i * ROW_HEIGHT;

      if (i % 2 === 0) {
        ctx.fillStyle = TABLE_ROW_EVEN_COLOR;
        ctx.fillRect(tableX, rowY, tableW, ROW_HEIGHT);
      }

      ctx.beginPath();
      ctx.moveTo(tableX, rowY);
      ctx.lineTo(tableX + tableW, rowY);
      ctx.strokeStyle = DIVIDER;
      ctx.lineWidth = TABLE_LINE_WIDTH_THIN;
      ctx.stroke();

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = '12px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      const truncated = this.truncateName(ctx, entry.newbieName, colNameW - TABLE_COL_NAME_PADDING);
      ctx.fillText(
        truncated,
        tableX + TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_SMALL,
      );

      ctx.textAlign = 'right';
      ctx.font = '12px "NotoSansCJK", sans-serif';
      ctx.fillText(
        String(entry.minutes),
        tableX + colNameW + colMinW - TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_SMALL,
      );
      ctx.fillText(
        String(entry.sessions),
        tableX + colNameW + colMinW + colSessionW - TABLE_CELL_PADDING,
        rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_SMALL,
      );
      ctx.textAlign = 'left';
    }

    const totalTableH = RANK_TABLE_HEADER_H + entries.length * ROW_HEIGHT;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, tHeaderY, tableW, totalTableH);
  }

  private getRankColor(rank: number): string {
    if (rank === 1) return RANK_GOLD;
    if (rank === 2) return RANK_SILVER;
    if (rank === 3) return RANK_BRONZE;
    return RANK_NORMAL;
  }

  private formatPeriodDate(dateStr: string): string {
    if (dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`;
    }
    return dateStr;
  }

  private truncateName(ctx: SKRSContext2D, name: string, maxWidth: number): string {
    const normalized = name.normalize('NFKC');
    if (ctx.measureText(normalized).width <= maxWidth) return normalized;

    let truncated = normalized;
    while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  }

  // eslint-disable-next-line max-params
  private roundRect(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
