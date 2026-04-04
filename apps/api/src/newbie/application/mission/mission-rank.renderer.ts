import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { Injectable, Logger } from '@nestjs/common';

import { MissionStatus } from '../../domain/newbie-mission.types';

// ── 레이아웃 상수 ──
const CANVAS_W = 800;
const ROW_HEIGHT = 48;
const HEADER_H = 100;
const TABLE_HEADER_H = 36;
const FOOTER_H = 36;
const PADDING_V = 20;
const PADDING = 28;
const INNER_MARGIN = 8;
const CARD_RADIUS = 12;
const MAX_ENTRIES_PER_PAGE = 10;

// ── 프로그레스 바 ──
const PROGRESS_BAR_W = 180;
const PROGRESS_BAR_H = 14;
const PROGRESS_BAR_RADIUS = 7;
const PROGRESS_BAR_BG = '#E5E7EB';

// ── 테이블 컬럼 너비 ──
const COL_NAME_W = 140;
const COL_PERIOD_W = 130;
const COL_STATUS_W = 70;
const COL_PLAYTIME_W = 280;
const COL_COUNT_W = 70;
const COL_DDAY_W = 80;

// ── 텍스트 baseline 오프셋 ──
const TEXT_BASELINE_OFFSET = 5;
const TEXT_BASELINE_SMALL = 4;

// ── 테이블 내부 ──
const TABLE_CELL_PADDING = 8;
const TABLE_HEADER_RADIUS = 6;
const TABLE_ROW_EVEN_COLOR = '#fafafa';
const TABLE_LINE_WIDTH_THIN = 0.5;

// ── 헤더 ──
const HEADER_TITLE_Y = 32;
const HEADER_DIVIDER_MARGIN = 8;
/** 헤더 요약 텍스트 Y 오프셋 (제목 아래) */
const HEADER_SUMMARY_Y_OFFSET = 22;
/** 헤더 목표 텍스트 Y 오프셋 (제목 아래) */
const HEADER_GOAL_Y_OFFSET = 42;

// ── 프로그레스 바 색상 ──
const PROGRESS_AMBER = '#F59E0B';
const PROGRESS_BLUE = '#3B82F6';
const PROGRESS_EMERALD = '#10B981';
const PROGRESS_GREEN = '#22C55E';
const PROGRESS_RED = '#EF4444';
const PROGRESS_GRAY = '#9CA3AF';

// ── D-day 경고 색상 ──
const DDAY_DANGER = '#EF4444';
const DDAY_WARNING = '#F59E0B';

// ── 색상 팔레트 ──
const BG = '#f0f0f0';
const CARD_BG = '#ffffff';
const ACCENT = '#f5f5f5';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const BORDER = '#e0e0e0';
const DIVIDER = '#e5e5e5';

// ── 진행률 임계값 ──
const RATIO_HALF = 0.5;
const RATIO_EIGHTY = 0.8;

// ── D-day 임계값 ──
const DDAY_DANGER_MAX = 2;
const DDAY_WARNING_MAX = 6;

export const MISSION_CANVAS_CACHE_TTL_SEC = 30;
export const MISSION_CANVAS_PAGE_SIZE = MAX_ENTRIES_PER_PAGE;

/** 전체 미션을 한 장으로 렌더링할 때 사용하는 입력 데이터 */
export interface MissionCanvasData {
  entries: MissionCanvasEntry[];
}

export interface MissionCanvasPageData {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  entries: MissionCanvasEntry[];
}

export interface MissionCanvasEntry {
  nickname: string;
  /** MM-DD~MM-DD 형식 */
  period: string;
  status: MissionStatus;
  statusEmoji: string;
  statusText: string;
  playtimeSec: number;
  targetPlaytimeSec: number;
  playCount: number;
  targetPlayCount: number | null;
  daysLeft: number;
}

export interface MissionCanvasConfig {
  totalCount: number;
  statusCounts: Record<string, number>;
  targetPlaytimeText: string;
  targetPlayCountText: string | null;
  updatedAt: string;
}

@Injectable()
export class MissionRankRenderer {
  private readonly logger = new Logger(MissionRankRenderer.name);

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
   * 전체 미션 현황을 한 장의 이미지로 렌더링한다.
   * @param data 전체 미션 목록
   * @param config 헤더/푸터에 표시할 설정 정보
   * @returns PNG Buffer
   */
  async renderAll(data: MissionCanvasData, config: MissionCanvasConfig): Promise<Buffer> {
    const tableH = TABLE_HEADER_H + data.entries.length * ROW_HEIGHT;
    const canvasH = PADDING_V + HEADER_H + tableH + FOOTER_H + PADDING_V;

    const canvas = createCanvas(CANVAS_W, canvasH);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, CANVAS_W, canvasH);

    let currentY = PADDING_V;
    this.drawHeader(ctx, config);
    currentY += HEADER_H;

    this.drawTableHeader(ctx, currentY);
    currentY += TABLE_HEADER_H;

    this.drawDataRows(ctx, data.entries, currentY);

    this.drawFooterSimple(ctx, config, canvasH);

    return canvas.toBuffer('image/png');
  }

  /**
   * 한 페이지(최대 10명)의 미션 현황 이미지를 렌더링한다.
   * @param data 페이지 내 미션 목록
   * @param config 헤더/푸터에 표시할 설정 정보
   * @returns PNG Buffer
   */
  async renderPage(data: MissionCanvasPageData, config: MissionCanvasConfig): Promise<Buffer> {
    const canvasH = this.calcCanvasHeight(data);
    const canvas = createCanvas(CANVAS_W, canvasH);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, CANVAS_W, canvasH);

    let currentY = PADDING_V;

    if (data.isFirstPage) {
      this.drawHeader(ctx, config);
      currentY += HEADER_H;
    }

    this.drawTableHeader(ctx, currentY);
    currentY += TABLE_HEADER_H;

    this.drawDataRows(ctx, data.entries, currentY);

    this.drawFooter(ctx, config, canvasH, data);

    return canvas.toBuffer('image/png');
  }

  private calcCanvasHeight(data: MissionCanvasPageData): number {
    const headerH = data.isFirstPage ? HEADER_H : 0;
    const tableH = TABLE_HEADER_H + data.entries.length * ROW_HEIGHT;
    return PADDING_V + headerH + tableH + FOOTER_H + PADDING_V;
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

  private drawHeader(ctx: SKRSContext2D, config: MissionCanvasConfig): void {
    const baseY = PADDING_V;

    // 제목
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 22px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('🧑‍🌾 신입 미션 현황', PADDING + INNER_MARGIN, baseY + HEADER_TITLE_Y);

    // 요약
    const summaryText = `총 ${config.totalCount}명`;

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '13px "NotoSansCJK", sans-serif';
    ctx.fillText(
      summaryText,
      PADDING + INNER_MARGIN,
      baseY + HEADER_TITLE_Y + HEADER_SUMMARY_Y_OFFSET,
    );

    // 목표
    let goalText = `목표: ${config.targetPlaytimeText}`;
    if (config.targetPlayCountText !== null) {
      goalText += ` / ${config.targetPlayCountText}`;
    }
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '12px "NotoSansCJK", sans-serif';
    ctx.fillText(goalText, PADDING + INNER_MARGIN, baseY + HEADER_TITLE_Y + HEADER_GOAL_Y_OFFSET);

    // 구분선
    const dividerY = PADDING_V + HEADER_H - HEADER_DIVIDER_MARGIN;
    ctx.beginPath();
    ctx.moveTo(PADDING + INNER_MARGIN, dividerY);
    ctx.lineTo(CANVAS_W - PADDING - INNER_MARGIN, dividerY);
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawTableHeader(ctx: SKRSContext2D, startY: number): void {
    const tableX = PADDING + INNER_MARGIN;
    const tableW = CANVAS_W - (PADDING + INNER_MARGIN) * 2;

    this.roundRect(ctx, tableX, startY, tableW, TABLE_HEADER_H, TABLE_HEADER_RADIUS);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 11px "NotoSansCJK", sans-serif';

    const midY = startY + TABLE_HEADER_H / 2 + TEXT_BASELINE_SMALL;
    let x = tableX;

    ctx.textAlign = 'left';
    ctx.fillText('닉네임', x + TABLE_CELL_PADDING, midY);
    x += COL_NAME_W;

    ctx.fillText('기간', x + TABLE_CELL_PADDING, midY);
    x += COL_PERIOD_W;

    ctx.fillText('상태', x + TABLE_CELL_PADDING, midY);
    x += COL_STATUS_W;

    ctx.fillText('플레이타임', x + TABLE_CELL_PADDING, midY);
    x += COL_PLAYTIME_W;

    ctx.fillText('횟수', x + TABLE_CELL_PADDING, midY);
    x += COL_COUNT_W;

    ctx.fillText('D-day', x + TABLE_CELL_PADDING, midY);
    x += COL_DDAY_W;
    ctx.textAlign = 'left';
    void x;
  }

  private drawDataRows(ctx: SKRSContext2D, entries: MissionCanvasEntry[], startY: number): void {
    const tableX = PADDING + INNER_MARGIN;
    const tableW = CANVAS_W - (PADDING + INNER_MARGIN) * 2;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rowY = startY + i * ROW_HEIGHT;
      const isEven = i % 2 === 0;

      if (isEven) {
        ctx.fillStyle = TABLE_ROW_EVEN_COLOR;
        ctx.fillRect(tableX, rowY, tableW, ROW_HEIGHT);
      }

      ctx.beginPath();
      ctx.moveTo(tableX, rowY);
      ctx.lineTo(tableX + tableW, rowY);
      ctx.strokeStyle = DIVIDER;
      ctx.lineWidth = TABLE_LINE_WIDTH_THIN;
      ctx.stroke();

      this.drawDataRow(ctx, entry, rowY, tableX);
    }

    // 테이블 외곽선
    const totalTableH = TABLE_HEADER_H + entries.length * ROW_HEIGHT;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, startY - TABLE_HEADER_H, tableW, totalTableH);
  }

  // eslint-disable-next-line max-params
  private drawDataRow(
    ctx: SKRSContext2D,
    entry: MissionCanvasEntry,
    rowY: number,
    tableX: number,
  ): void {
    const textY = rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_OFFSET;
    let x = tableX;

    // 닉네임
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '12px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.textAlign = 'left';
    const truncated = this.truncateName(ctx, entry.nickname, COL_NAME_W - TABLE_CELL_PADDING * 2);
    ctx.fillText(truncated, x + TABLE_CELL_PADDING, textY);
    x += COL_NAME_W;

    // 기간
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '11px "NotoSansCJK", sans-serif';
    const truncatedPeriod = this.truncateName(
      ctx,
      entry.period,
      COL_PERIOD_W - TABLE_CELL_PADDING * 2,
    );
    ctx.fillText(truncatedPeriod, x + TABLE_CELL_PADDING, textY);
    x += COL_PERIOD_W;

    // 상태 (이모지 + 텍스트)
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '12px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const statusLabel = `${entry.statusEmoji}${entry.statusText}`;
    ctx.fillText(statusLabel, x + TABLE_CELL_PADDING, textY);
    x += COL_STATUS_W;

    // 플레이타임 (프로그레스 바 + 텍스트)
    this.drawPlaytimeColumn(ctx, x, rowY, entry);
    x += COL_PLAYTIME_W;

    // 횟수
    this.drawCountText(ctx, x, textY, entry);
    x += COL_COUNT_W;

    // D-day
    this.drawDday(ctx, x, textY, entry);
    ctx.textAlign = 'left';
  }

  // eslint-disable-next-line max-params
  private drawPlaytimeColumn(
    ctx: SKRSContext2D,
    colX: number,
    rowY: number,
    entry: MissionCanvasEntry,
  ): void {
    const ratio =
      entry.targetPlaytimeSec > 0 ? Math.min(entry.playtimeSec / entry.targetPlaytimeSec, 1.0) : 0;

    const barX = colX + TABLE_CELL_PADDING;
    const barY = rowY + (ROW_HEIGHT - PROGRESS_BAR_H) / 2;

    this.drawProgressBar(ctx, barX, barY, ratio, entry.status);

    const playtimeText = `${this.formatPlaytime(entry.playtimeSec)}/${this.formatPlaytime(entry.targetPlaytimeSec)}`;
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '11px "NotoSansCJK", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      playtimeText,
      barX + PROGRESS_BAR_W + TABLE_CELL_PADDING,
      rowY + ROW_HEIGHT / 2 + TEXT_BASELINE_SMALL,
    );
  }

  // eslint-disable-next-line max-params
  private drawProgressBar(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    ratio: number,
    status: MissionStatus,
  ): void {
    // 배경
    this.roundRect(ctx, x, y, PROGRESS_BAR_W, PROGRESS_BAR_H, PROGRESS_BAR_RADIUS);
    ctx.fillStyle = PROGRESS_BAR_BG;
    ctx.fill();

    // 진행 바
    const fillW = Math.max(0, Math.floor(PROGRESS_BAR_W * ratio));
    if (fillW > 0) {
      const fillColor = this.getProgressColor(status, ratio);
      // 진행 바가 전체 너비보다 작으면 왼쪽만 라운딩, 전체면 pill 유지
      if (fillW >= PROGRESS_BAR_W) {
        this.roundRect(ctx, x, y, PROGRESS_BAR_W, PROGRESS_BAR_H, PROGRESS_BAR_RADIUS);
      } else {
        this.roundRectLeft(ctx, x, y, fillW, PROGRESS_BAR_H, PROGRESS_BAR_RADIUS);
      }
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
  }

  // eslint-disable-next-line max-params
  private drawCountText(
    ctx: SKRSContext2D,
    x: number,
    textY: number,
    entry: MissionCanvasEntry,
  ): void {
    const countText =
      entry.targetPlayCount === null
        ? String(entry.playCount)
        : `${entry.playCount}/${entry.targetPlayCount}`;

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '12px "NotoSansCJK", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(countText, x + TABLE_CELL_PADDING, textY);
  }

  // eslint-disable-next-line max-params
  private drawDday(ctx: SKRSContext2D, x: number, textY: number, entry: MissionCanvasEntry): void {
    const ddayText = this.formatDday(entry.daysLeft, entry.status);
    const { color, isBold } = this.getDdayColor(entry.daysLeft, entry.status);

    ctx.fillStyle = color;
    ctx.font = `${isBold ? 'bold ' : ''}12px "NotoSansCJK", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(ddayText, x + TABLE_CELL_PADDING, textY);
  }

  // eslint-disable-next-line max-params
  private drawFooter(
    ctx: SKRSContext2D,
    config: MissionCanvasConfig,
    canvasH: number,
    data: MissionCanvasPageData,
  ): void {
    const footerY = canvasH - PADDING_V / 2 - TEXT_BASELINE_SMALL;

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '11px "NotoSansCJK", sans-serif';

    ctx.textAlign = 'left';
    ctx.fillText(`마지막 갱신: ${config.updatedAt}`, PADDING + INNER_MARGIN, footerY);

    ctx.textAlign = 'right';
    ctx.fillText(
      `${data.pageNumber} / ${data.totalPages}장`,
      CANVAS_W - PADDING - INNER_MARGIN,
      footerY,
    );

    ctx.textAlign = 'left';
  }

  /** 단일 이미지용 푸터 (페이지 번호 없음) */
  private drawFooterSimple(ctx: SKRSContext2D, config: MissionCanvasConfig, canvasH: number): void {
    const footerY = canvasH - PADDING_V / 2 - TEXT_BASELINE_SMALL;

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '11px "NotoSansCJK", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`마지막 갱신: ${config.updatedAt}`, PADDING + INNER_MARGIN, footerY);
    ctx.textAlign = 'left';
  }

  private getProgressColor(status: MissionStatus, ratio: number): string {
    if (status === MissionStatus.COMPLETED) return PROGRESS_GREEN;
    if (status === MissionStatus.FAILED) return PROGRESS_RED;
    if (status === MissionStatus.LEFT) return PROGRESS_GRAY;
    // IN_PROGRESS: 진행률에 따른 색상
    if (ratio < RATIO_HALF) return PROGRESS_AMBER;
    if (ratio < RATIO_EIGHTY) return PROGRESS_BLUE;
    return PROGRESS_EMERALD;
  }

  private getDdayColor(
    daysLeft: number,
    status: MissionStatus,
  ): { color: string; isBold: boolean } {
    if (status === MissionStatus.COMPLETED) return { color: TEXT_MUTED, isBold: false };
    if (status === MissionStatus.LEFT) return { color: TEXT_MUTED, isBold: false };
    if (daysLeft < 0) return { color: DDAY_DANGER, isBold: false };
    if (daysLeft === 0) return { color: DDAY_DANGER, isBold: true };
    if (daysLeft <= DDAY_DANGER_MAX) return { color: DDAY_DANGER, isBold: false };
    if (daysLeft <= DDAY_WARNING_MAX) return { color: DDAY_WARNING, isBold: false };
    return { color: TEXT_PRIMARY, isBold: false };
  }

  private formatDday(daysLeft: number, status: MissionStatus): string {
    if (status === MissionStatus.COMPLETED || status === MissionStatus.LEFT) return '-';
    if (daysLeft < 0) return '만료';
    if (daysLeft === 0) return 'D-DAY';
    return `D-${daysLeft}`;
  }

  private formatPlaytime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h${m}m`;
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

  /** 왼쪽만 라운딩된 사각형 (프로그레스 바 부분 채움용) */
  // eslint-disable-next-line max-params
  private roundRectLeft(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
