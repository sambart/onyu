import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { Injectable, Logger } from '@nestjs/common';

import type { BadgeCode } from '../../../voice-analytics/self-diagnosis/application/badge.constants';
import {
  BADGE_DISPLAY,
  BADGE_PRIORITY,
  MAX_BADGE_DISPLAY,
} from '../../../voice-analytics/self-diagnosis/application/badge.constants';
import { DailyChartEntry, MeProfileData } from './me-profile.service';

// ── 레이아웃 상수 ──
const W = 800;
const H = 650;
const PADDING = 32;
const CARD_RADIUS = 16;

// ── 색상 팔레트 ──
const BG = '#f0f0f0';
const CARD_BG = '#ffffff';
const ACCENT = '#f5f5f5';
const BLURPLE = '#5B8DEF';
const BLURPLE_DIM = '#c4d7f7';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const BAR_EMPTY = '#e8e8e8';
const DIVIDER = '#e5e5e5';
const BORDER = '#e0e0e0';
const RANK_BG = '#EEF2FF';
const RANK_BORDER = '#C7D7FE';
const MIC_ON_COLOR = '#34D399';
const MIC_OFF_COLOR = '#F87171';

// ── 뱃지 pill 레이아웃 상수 ──
const PILL_H = 22;
const PILL_PX = 8;
const PILL_GAP = 6;
const PILL_R = 11;
const PILL_FONT = 'bold 11px "NotoSansCJK", "NotoColorEmoji", sans-serif';

@Injectable()
export class ProfileCardRenderer {
  private readonly logger = new Logger(ProfileCardRenderer.name);

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
      } catch {
        // try next path
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
      } catch {
        // try next path
      }
    }
  }

  async render(profile: MeProfileData, displayName: string, avatarUrl: string): Promise<Buffer> {
    // 뱃지 유무에 따라 캔버스 높이와 콘텐츠 오프셋 조정
    const hasBadges = profile.badges.length > 0;
    const badgeOffset = hasBadges ? 18 : 0;
    const canvasH = H + badgeOffset;

    const canvas = createCanvas(W, canvasH);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, canvasH);
    await this.drawHeader(ctx, { displayName, avatarUrl, badges: profile.badges });
    this.drawRankCard(ctx, profile, badgeOffset);
    this.drawStatCards(ctx, profile, badgeOffset);
    this.drawBarChart(ctx, profile.dailyChart, badgeOffset);
    this.drawFooter(ctx, canvasH);

    return canvas.toBuffer('image/png');
  }

  private drawBackground(ctx: SKRSContext2D, canvasH: number): void {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, canvasH);

    this.roundRect(ctx, PADDING / 2, PADDING / 2, W - PADDING, canvasH - PADDING, CARD_RADIUS);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private async drawHeader(
    ctx: SKRSContext2D,
    params: { displayName: string; avatarUrl: string; badges: string[] },
  ): Promise<void> {
    const { displayName, avatarUrl, badges } = params;
    const headerY = 40;

    try {
      const avatar = await loadImage(avatarUrl);
      const avatarSize = 64;
      const ax = PADDING + 16;
      const ay = headerY;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, ax, ay, avatarSize, avatarSize);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
      ctx.strokeStyle = BLURPLE;
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch {
      this.logger.warn('Failed to load avatar');
    }

    const nameX = PADDING + 96;
    const nameY = headerY + 30;
    const maxRight = W - PADDING - 16;

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const maxNameWidth = maxRight - nameX;
    const truncatedName = this.truncateName(ctx, displayName, maxNameWidth);
    ctx.fillText(truncatedName, nameX, nameY);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('최근 15일 음성 활동', PADDING + 96, headerY + 56);

    // 뱃지 행 (디바이더 위)
    if (badges.length > 0) {
      this.drawBadgePills(ctx, { badges, startX: PADDING + 16, centerY: headerY + 80 });
    }

    const dividerY = badges.length > 0 ? headerY + 96 : headerY + 78;
    ctx.beginPath();
    ctx.moveTo(PADDING + 16, dividerY);
    ctx.lineTo(W - PADDING - 16, dividerY);
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private truncateName(ctx: SKRSContext2D, name: string, maxWidth: number): string {
    if (ctx.measureText(name).width <= maxWidth) return name;

    let truncated = name;
    while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  }

  private drawBadgePills(
    ctx: SKRSContext2D,
    params: { badges: string[]; startX: number; centerY: number },
  ): void {
    const { badges, startX, centerY } = params;
    const sorted = BADGE_PRIORITY.filter((code) => badges.includes(code)).slice(
      0,
      MAX_BADGE_DISPLAY,
    );

    if (sorted.length === 0) return;

    ctx.font = PILL_FONT;

    let x = startX;
    for (const code of sorted) {
      const display = BADGE_DISPLAY[code as BadgeCode];
      const text = `${display.icon}${display.name}`;
      const textWidth = ctx.measureText(text).width;
      const pillW = textWidth + PILL_PX * 2;

      this.roundRect(ctx, x, centerY - PILL_H / 2, pillW, PILL_H, PILL_R);
      ctx.fillStyle = display.bgColor;
      ctx.fill();

      ctx.fillStyle = display.textColor;
      ctx.fillText(text, x + PILL_PX, centerY + 4);

      x += pillW + PILL_GAP;
    }
  }

  private drawRankCard(ctx: SKRSContext2D, profile: MeProfileData, badgeOffset: number): void {
    const y = 130 + badgeOffset;
    const cardX = PADDING + 16;
    const cardW = W - PADDING * 2 - 32;
    const cardH = 56;

    this.roundRect(ctx, cardX, y, cardW, cardH, 10);
    ctx.fillStyle = RANK_BG;
    ctx.fill();
    ctx.strokeStyle = RANK_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    const rankEmoji = profile.rank === 1 ? '👑' : profile.rank <= 3 ? '🏅' : '🏆';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 20px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(`${rankEmoji}  ${profile.rank}위 / ${profile.totalUsers}명`, cardX + 16, y + 24);

    const topPercent =
      profile.totalUsers > 0 ? Math.round((profile.rank / profile.totalUsers) * 1000) / 10 : 0;
    ctx.fillStyle = BLURPLE;
    ctx.font = 'bold 16px "NotoSansCJK", sans-serif';
    const percentText = `상위 ${topPercent}%`;
    const percentWidth = ctx.measureText(percentText).width;
    ctx.fillText(percentText, cardX + cardW - percentWidth - 16, y + 24);

    const barX = cardX + 16;
    const barY = y + 36;
    const barW = cardW - 32;
    const barH = 8;

    this.roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fillStyle = '#E0E7FF';
    ctx.fill();

    const fillRatio =
      profile.totalUsers > 0 ? (profile.totalUsers - profile.rank + 1) / profile.totalUsers : 0;
    if (fillRatio > 0) {
      const fillW = Math.max(barW * fillRatio, 10);
      this.roundRect(ctx, barX, barY, fillW, barH, 4);
      ctx.fillStyle = BLURPLE;
      ctx.fill();
    }
  }

  // eslint-disable-next-line max-lines-per-function
  private drawStatCards(ctx: SKRSContext2D, profile: MeProfileData, badgeOffset: number): void {
    const startY = 202 + badgeOffset;
    const cardW = 224;
    const cardH = 72;
    const gap = 16;
    const startX = PADDING + 16;

    // ── Row 1: 기본 통계 ──
    const row1Stats = [
      { label: '총 음성 시간', value: formatTime(profile.totalSec), icon: '🎙️' },
      { label: '활동일 수', value: `${profile.activeDays}일`, icon: '📆' },
      { label: '일평균', value: formatTime(profile.avgDailySec), icon: '⏱️' },
    ];

    for (let i = 0; i < row1Stats.length; i++) {
      const stat = row1Stats[i];
      const x = startX + i * (cardW + gap);
      const y = startY;

      this.roundRect(ctx, x, y, cardW, cardH, 8);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      ctx.fillText(`${stat.icon} ${stat.label}`, x + 14, y + 24);

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = 'bold 22px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      ctx.fillText(stat.value, x + 14, y + 54);
    }

    // ── Row 2: 통합 카드들 ──
    const row2Y = startY + cardH + gap;

    // 카드 1: 마이크 통합 (ON/OFF 비율 바 + 사용률 + 시간)
    this.drawMicCard(ctx, { x: startX, y: row2Y, w: cardW, h: cardH, profile });

    // 카드 2: 혼자 비율
    const alonePercent =
      profile.totalSec > 0 ? Math.round((profile.aloneSec / profile.totalSec) * 1000) / 10 : 0;
    this.drawStatCardWithSub(ctx, {
      x: startX + cardW + gap,
      y: row2Y,
      w: cardW,
      h: cardH,
      label: '👤 혼자 있던 시간',
      value: formatTime(profile.aloneSec),
      subText: `전체의 ${alonePercent}%`,
    });

    // 카드 3: 주평균 + 피크요일 통합
    const peakText = profile.peakDayOfWeek ? `피크: ${profile.peakDayOfWeek}요일` : '';
    this.drawStatCardWithSub(ctx, {
      x: startX + (cardW + gap) * 2,
      y: row2Y,
      w: cardW,
      h: cardH,
      label: '📊 주 평균',
      value: formatTime(profile.weeklyAvgSec),
      subText: peakText,
    });
  }

  // eslint-disable-next-line max-lines-per-function
  private drawMicCard(
    ctx: SKRSContext2D,
    params: { x: number; y: number; w: number; h: number; profile: MeProfileData },
  ): void {
    const { x, y, w, h, profile } = params;
    this.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 라벨
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('🎤 마이크', x + 14, y + 24);

    // ON/OFF 시간 (제목 오른쪽)
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '10px "NotoSansCJK", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `ON ${formatTime(profile.micOnSec)} · OFF ${formatTime(profile.micOffSec)}`,
      x + w - 10,
      y + 24,
    );
    ctx.textAlign = 'left';

    // 사용률 텍스트
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 18px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(`${profile.micUsageRate}%`, x + 14, y + 48);

    // ON/OFF 비율 바
    const barX = x + 80;
    const barY = y + 36;
    const barW = w - 96;
    const barH = 14;
    const totalMic = profile.micOnSec + profile.micOffSec;

    this.roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fillStyle = MIC_OFF_COLOR;
    ctx.fill();

    if (totalMic > 0) {
      const onRatio = profile.micOnSec / totalMic;
      const onW = Math.max(barW * onRatio, onRatio > 0 ? 6 : 0);
      if (onW > 0) {
        this.roundRect(ctx, barX, barY, onW, barH, 4);
        ctx.fillStyle = MIC_ON_COLOR;
        ctx.fill();
      }
    }

    // ON/OFF 라벨
    ctx.font = '10px "NotoSansCJK", sans-serif';
    ctx.fillStyle = MIC_ON_COLOR;
    ctx.fillText('ON', barX, barY + barH + 12);
    ctx.fillStyle = MIC_OFF_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText('OFF', barX + barW, barY + barH + 12);
    ctx.textAlign = 'left';
  }

  private drawStatCardWithSub(
    ctx: SKRSContext2D,
    params: {
      x: number;
      y: number;
      w: number;
      h: number;
      label: string;
      value: string;
      subText: string;
    },
  ): void {
    const { x, y, w, h, label, value, subText } = params;
    this.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(label, x + 14, y + 24);

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 22px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(value, x + 14, y + 54);

    if (subText) {
      const valueWidth = ctx.measureText(value).width;
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = '12px "NotoSansCJK", sans-serif';
      ctx.fillText(subText, x + 14 + valueWidth + 8, y + 54);
    }
  }

  private drawBarChart(
    ctx: SKRSContext2D,
    dailyChart: DailyChartEntry[],
    badgeOffset: number,
  ): void {
    const chartX = PADDING + 16;
    const chartY = 398 + badgeOffset;
    const chartW = W - PADDING * 2 - 32;
    const chartH = 170;

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = 'bold 14px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('📅 최근 15일 활동', chartX, chartY - 8);

    this.roundRect(ctx, chartX, chartY, chartW, chartH, 8);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    const maxSec = Math.max(...dailyChart.map((d) => d.durationSec), 1);
    const barCount = dailyChart.length;
    const barGap = 6;
    const barAreaW = chartW - 40;
    const barW = (barAreaW - barGap * (barCount - 1)) / barCount;
    const barMaxH = chartH - 50;
    const baseY = chartY + chartH - 16;

    dailyChart.forEach((entry, idx) => {
      const x = chartX + 20 + idx * (barW + barGap);
      const barH = entry.durationSec > 0 ? Math.max((entry.durationSec / maxSec) * barMaxH, 4) : 4;

      this.roundRect(ctx, x, baseY - barMaxH, barW, barMaxH, 3);
      ctx.fillStyle = BAR_EMPTY;
      ctx.fill();

      if (entry.durationSec > 0) {
        this.roundRect(ctx, x, baseY - barH, barW, barH, 3);
        ctx.fillStyle = BLURPLE;
        ctx.fill();
      } else {
        this.roundRect(ctx, x, baseY - 4, barW, 4, 3);
        ctx.fillStyle = BLURPLE_DIM;
        ctx.fill();
      }

      if (idx % 2 === 0) {
        const dd = entry.date.slice(6, 8);
        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '10px "NotoSansCJK", "NotoColorEmoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dd, x + barW / 2, baseY + 12);
        ctx.textAlign = 'left';
      }
    });
  }

  private drawFooter(ctx: SKRSContext2D, canvasH: number): void {
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '12px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('onyu', W - PADDING - 16, canvasH - PADDING / 2 - 4);
    ctx.textAlign = 'left';
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

function formatTime(sec: number): string {
  if (sec === 0) return '0분';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
