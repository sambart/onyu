import { createCanvas, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { Injectable, Logger } from '@nestjs/common';

import {
  ACCENT,
  BG,
  BLURPLE,
  BORDER,
  CARD_BG,
  DIVIDER,
  drawBarChart,
  drawStatCardWithSub,
  formatTime,
  MIC_OFF_COLOR,
  MIC_ON_COLOR,
  normalizeDisplayName,
  RANK_BG,
  RANK_BORDER,
  roundRect,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  truncateName,
} from '../../../common/canvas';
import type { BadgeCode } from '../../../voice-analytics/self-diagnosis/application/badge.constants';
import {
  BADGE_DISPLAY,
  BADGE_PRIORITY,
  MAX_BADGE_DISPLAY,
} from '../../../voice-analytics/self-diagnosis/application/badge.constants';
import { VoiceExcludedChannelType } from '../domain/voice-excluded-channel.types';
import type { DailyChartEntry, ExcludedChannelEntry, MeProfileData } from './me-profile.service';

// ── 레이아웃 상수 (/me 전용 — common/canvas 추출 범위 외) ──
const W = 800;
const H = 650;
const PADDING = 32;
const CARD_RADIUS = 16;

// ── 뱃지 오프셋 및 차트 레이아웃 상수 ──
const BADGE_EXTRA_HEIGHT = 18;
const BAR_CHART_Y = 398;
const BAR_CHART_X_PAD = 16;
const BAR_CHART_W_PAD = 32;
const BAR_CHART_H = 170;

// ── 헤더 레이아웃 상수 ──
const AVATAR_SIZE = 64;
const AVATAR_X_OFFSET = 16;
const AVATAR_BORDER_EXTRA = 2;
const NAME_X_OFFSET = 96;
const NAME_Y_OFFSET = 30;
const NAME_X_RIGHT_PAD = 16;
const SUBTITLE_X_OFFSET = 96;
const SUBTITLE_Y_OFFSET = 56;
const BADGE_PILL_CENTER_Y_OFFSET = 80;
const DIVIDER_WITH_BADGE_Y_OFFSET = 96;
const DIVIDER_NO_BADGE_Y_OFFSET = 78;
const DIVIDER_X_OFFSET = 16;

// ── 랭크 카드 레이아웃 상수 ──
const RANK_CARD_Y_BASE = 130;
const RANK_CARD_X_OFFSET = 16;
const RANK_CARD_W_PAD = 32;
const RANK_CARD_H = 56;
const RANK_CARD_RADIUS = 10;
const RANK_TEXT_X_OFFSET = 16;
const RANK_TEXT_Y_OFFSET = 24;
const RANK_BAR_X_OFFSET = 16;
const RANK_BAR_Y_OFFSET = 36;
const RANK_BAR_W_PAD = 32;
const RANK_BAR_H = 8;
const RANK_BAR_RADIUS = 4;
const RANK_BAR_MIN_FILL = 10;
const RANK_THRESHOLD_TOP3 = 3;
const RANK_PERCENT_DIVISOR = 10;
const RANK_PERCENT_MULTIPLIER = 1000;

// ── 통계 카드 레이아웃 상수 ──
const STAT_CARD_START_Y = 202;
const STAT_CARD_W = 224;
const STAT_CARD_H = 72;
const STAT_CARD_GAP = 16;
const STAT_CARD_X_OFFSET = 16;
const STAT_CARD_RADIUS = 8;
const STAT_CARD_LABEL_X_OFFSET = 14;
const STAT_CARD_LABEL_Y_OFFSET = 24;
const STAT_CARD_VALUE_Y_OFFSET = 54;

// ── 마이크 카드 레이아웃 상수 ──
const MIC_LABEL_X_OFFSET = 14;
const MIC_LABEL_Y_OFFSET = 24;
const MIC_RATE_RIGHT_PAD = 10;
const MIC_USAGE_RATE_X_OFFSET = 14;
const MIC_USAGE_RATE_Y_OFFSET = 48;
const MIC_BAR_X_OFFSET = 80;
const MIC_BAR_Y_OFFSET = 36;
const MIC_BAR_W_PAD = 96;
const MIC_BAR_H = 14;
const MIC_BAR_RADIUS = 4;
const MIC_BAR_MIN_ON_W = 6;
const MIC_LABEL_Y_BELOW_BAR = 12;

// ── 뱃지 pill 레이아웃 상수 ──
const PILL_H = 22;
const PILL_PX = 8;
const PILL_GAP = 6;
const PILL_R = 11;
const PILL_FONT = 'bold 11px "NotoSansCJK", "NotoColorEmoji", sans-serif';

// ── Footer 제외 채널 표시 상수 ──
const MAX_EXCLUDED_DISPLAY = 5;

@Injectable()
export class ProfileCardRenderer {
  private readonly logger = new Logger(ProfileCardRenderer.name);

  // 폰트 등록은 CanvasModule.onModuleInit()에서 1회 수행하므로 생성자에서 별도 처리 불필요

  async render(profile: MeProfileData, displayName: string, avatarUrl: string): Promise<Buffer> {
    const normalizedName = normalizeDisplayName(displayName);

    // 뱃지 유무에 따라 캔버스 높이와 콘텐츠 오프셋 조정
    const hasBadges = profile.badges.length > 0;
    const badgeOffset = hasBadges ? BADGE_EXTRA_HEIGHT : 0;
    const canvasH = H + badgeOffset;

    const canvas = createCanvas(W, canvasH);
    const ctx = canvas.getContext('2d');

    this.drawBackground(ctx, canvasH);
    await this.drawHeader(ctx, { displayName: normalizedName, avatarUrl, badges: profile.badges });
    this.drawRankCard(ctx, profile, badgeOffset);
    this.drawStatCards(ctx, profile, badgeOffset);
    drawBarChart(ctx, {
      x: PADDING + BAR_CHART_X_PAD,
      y: BAR_CHART_Y + badgeOffset,
      w: W - PADDING * 2 - BAR_CHART_W_PAD,
      h: BAR_CHART_H,
      entries: profile.dailyChart.map((d: DailyChartEntry) => ({
        date: d.date,
        value: d.durationSec,
      })),
      title: '📅 최근 15일 활동',
    });
    this.drawFooter(ctx, canvasH, profile.excludedChannels);

    return canvas.toBuffer('image/png');
  }

  private drawBackground(ctx: SKRSContext2D, canvasH: number): void {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, canvasH);

    roundRect(ctx, PADDING / 2, PADDING / 2, W - PADDING, canvasH - PADDING, CARD_RADIUS);
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
      const avatarSize = AVATAR_SIZE;
      const ax = PADDING + AVATAR_X_OFFSET;
      const ay = headerY;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, ax, ay, avatarSize, avatarSize);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(
        ax + avatarSize / 2,
        ay + avatarSize / 2,
        avatarSize / 2 + AVATAR_BORDER_EXTRA,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = BLURPLE;
      ctx.lineWidth = AVATAR_BORDER_EXTRA;
      ctx.stroke();
    } catch {
      this.logger.warn('Failed to load avatar');
    }

    const nameX = PADDING + NAME_X_OFFSET;
    const nameY = headerY + NAME_Y_OFFSET;
    const maxRight = W - PADDING - NAME_X_RIGHT_PAD;

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 28px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const maxNameWidth = maxRight - nameX;
    const truncatedName = truncateName(ctx, displayName, maxNameWidth);
    ctx.fillText(truncatedName, nameX, nameY);

    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('최근 15일 음성 활동', PADDING + SUBTITLE_X_OFFSET, headerY + SUBTITLE_Y_OFFSET);

    // 뱃지 행 (디바이더 위)
    if (badges.length > 0) {
      this.drawBadgePills(ctx, {
        badges,
        startX: PADDING + DIVIDER_X_OFFSET,
        centerY: headerY + BADGE_PILL_CENTER_Y_OFFSET,
      });
    }

    const dividerY =
      badges.length > 0
        ? headerY + DIVIDER_WITH_BADGE_Y_OFFSET
        : headerY + DIVIDER_NO_BADGE_Y_OFFSET;
    ctx.beginPath();
    ctx.moveTo(PADDING + DIVIDER_X_OFFSET, dividerY);
    ctx.lineTo(W - PADDING - DIVIDER_X_OFFSET, dividerY);
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.stroke();
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

      roundRect(ctx, x, centerY - PILL_H / 2, pillW, PILL_H, PILL_R);
      ctx.fillStyle = display.bgColor;
      ctx.fill();

      ctx.fillStyle = display.textColor;
      ctx.fillText(text, x + PILL_PX, centerY + 4);

      x += pillW + PILL_GAP;
    }
  }

  private drawRankCard(ctx: SKRSContext2D, profile: MeProfileData, badgeOffset: number): void {
    const y = RANK_CARD_Y_BASE + badgeOffset;
    const cardX = PADDING + RANK_CARD_X_OFFSET;
    const cardW = W - PADDING * 2 - RANK_CARD_W_PAD;
    const cardH = RANK_CARD_H;

    roundRect(ctx, cardX, y, cardW, cardH, RANK_CARD_RADIUS);
    ctx.fillStyle = RANK_BG;
    ctx.fill();
    ctx.strokeStyle = RANK_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    const rankEmoji = profile.rank === 1 ? '👑' : profile.rank <= RANK_THRESHOLD_TOP3 ? '🏅' : '🏆';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 20px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(
      `${rankEmoji}  ${profile.rank}위 / ${profile.totalUsers}명`,
      cardX + RANK_TEXT_X_OFFSET,
      y + RANK_TEXT_Y_OFFSET,
    );

    const topPercent =
      profile.totalUsers > 0
        ? Math.round((profile.rank / profile.totalUsers) * RANK_PERCENT_MULTIPLIER) /
          RANK_PERCENT_DIVISOR
        : 0;
    ctx.fillStyle = BLURPLE;
    ctx.font = 'bold 16px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const percentText = `상위 ${topPercent}%`;
    const percentWidth = ctx.measureText(percentText).width;
    ctx.fillText(
      percentText,
      cardX + cardW - percentWidth - RANK_TEXT_X_OFFSET,
      y + RANK_TEXT_Y_OFFSET,
    );

    const barX = cardX + RANK_BAR_X_OFFSET;
    const barY = y + RANK_BAR_Y_OFFSET;
    const barW = cardW - RANK_BAR_W_PAD;
    const barH = RANK_BAR_H;

    roundRect(ctx, barX, barY, barW, barH, RANK_BAR_RADIUS);
    ctx.fillStyle = '#E0E7FF';
    ctx.fill();

    const fillRatio =
      profile.totalUsers > 0 ? (profile.totalUsers - profile.rank + 1) / profile.totalUsers : 0;
    if (fillRatio > 0) {
      const fillW = Math.max(barW * fillRatio, RANK_BAR_MIN_FILL);
      roundRect(ctx, barX, barY, fillW, barH, RANK_BAR_RADIUS);
      ctx.fillStyle = BLURPLE;
      ctx.fill();
    }
  }

  // eslint-disable-next-line max-lines-per-function
  private drawStatCards(ctx: SKRSContext2D, profile: MeProfileData, badgeOffset: number): void {
    const startY = STAT_CARD_START_Y + badgeOffset;
    const cardW = STAT_CARD_W;
    const cardH = STAT_CARD_H;
    const gap = STAT_CARD_GAP;
    const startX = PADDING + STAT_CARD_X_OFFSET;

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

      roundRect(ctx, x, y, cardW, cardH, STAT_CARD_RADIUS);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = TEXT_SECONDARY;
      ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      ctx.fillText(
        `${stat.icon} ${stat.label}`,
        x + STAT_CARD_LABEL_X_OFFSET,
        y + STAT_CARD_LABEL_Y_OFFSET,
      );

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = 'bold 22px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      ctx.fillText(stat.value, x + STAT_CARD_LABEL_X_OFFSET, y + STAT_CARD_VALUE_Y_OFFSET);
    }

    // ── Row 2: 통합 카드들 ──
    const row2Y = startY + cardH + gap;

    // 카드 1: 마이크 통합 (ON/OFF 비율 바 + 사용률 + 시간)
    this.drawMicCard(ctx, { x: startX, y: row2Y, w: cardW, h: cardH, profile });

    // 카드 2: 혼자 비율
    const alonePercent =
      profile.totalSec > 0 ? Math.round((profile.aloneSec / profile.totalSec) * 1000) / 10 : 0;
    drawStatCardWithSub(ctx, {
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
    drawStatCardWithSub(ctx, {
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
    roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 라벨
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText('🎤 마이크', x + MIC_LABEL_X_OFFSET, y + MIC_LABEL_Y_OFFSET);

    // ON/OFF 시간 (제목 오른쪽)
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '10px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `ON ${formatTime(profile.micOnSec)} · OFF ${formatTime(profile.micOffSec)}`,
      x + w - MIC_RATE_RIGHT_PAD,
      y + MIC_LABEL_Y_OFFSET,
    );
    ctx.textAlign = 'left';

    // 사용률 텍스트
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 18px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(
      `${profile.micUsageRate}%`,
      x + MIC_USAGE_RATE_X_OFFSET,
      y + MIC_USAGE_RATE_Y_OFFSET,
    );

    // ON/OFF 비율 바
    const barX = x + MIC_BAR_X_OFFSET;
    const barY = y + MIC_BAR_Y_OFFSET;
    const barW = w - MIC_BAR_W_PAD;
    const barH = MIC_BAR_H;
    const totalMic = profile.micOnSec + profile.micOffSec;

    roundRect(ctx, barX, barY, barW, barH, MIC_BAR_RADIUS);
    ctx.fillStyle = MIC_OFF_COLOR;
    ctx.fill();

    if (totalMic > 0) {
      const onRatio = profile.micOnSec / totalMic;
      const onW = Math.max(barW * onRatio, onRatio > 0 ? MIC_BAR_MIN_ON_W : 0);
      if (onW > 0) {
        roundRect(ctx, barX, barY, onW, barH, MIC_BAR_RADIUS);
        ctx.fillStyle = MIC_ON_COLOR;
        ctx.fill();
      }
    }

    // ON/OFF 라벨
    ctx.font = '10px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillStyle = MIC_ON_COLOR;
    ctx.fillText('ON', barX, barY + barH + MIC_LABEL_Y_BELOW_BAR);
    ctx.fillStyle = MIC_OFF_COLOR;
    ctx.textAlign = 'right';
    ctx.fillText('OFF', barX + barW, barY + barH + MIC_LABEL_Y_BELOW_BAR);
    ctx.textAlign = 'left';
  }

  private drawFooter(
    ctx: SKRSContext2D,
    canvasH: number,
    excludedChannels: ExcludedChannelEntry[],
  ): void {
    const footerText = this.buildFooterText(excludedChannels);
    if (!footerText) return;

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '12px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(footerText, PADDING + 16, canvasH - PADDING / 2 - 4);
  }

  private buildFooterText(excludedChannels: ExcludedChannelEntry[]): string {
    if (excludedChannels.length === 0) return '';

    const displayed = excludedChannels.slice(0, MAX_EXCLUDED_DISPLAY);
    const remaining = excludedChannels.length - displayed.length;

    const channelLabels = displayed.map((ch) => {
      const prefix = ch.type === VoiceExcludedChannelType.CATEGORY ? '[카테고리]' : '[채널]';
      return `${prefix} ${ch.name}`;
    });

    let text = `통계 제외 채널: ${channelLabels.join(', ')}`;
    if (remaining > 0) {
      text += ` ... 외 ${remaining}개`;
    }
    return text;
  }
}
