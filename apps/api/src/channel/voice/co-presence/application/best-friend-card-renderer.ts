import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { Injectable, Logger } from '@nestjs/common';

import {
  BAR_EMPTY,
  BG,
  BLURPLE,
  BORDER,
  CanvasFontsService,
  CARD_BG,
  DIVIDER,
  normalizeDisplayName,
  roundRect,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  truncateName,
} from '../../../../common/canvas';
import type { BestFriendCardData, TopPeerItem } from './best-friend-card.types';

// ── 레이아웃 상수 ──
const CARD_W = 800;
const PADDING = 32;
const CARD_RADIUS = 16;
const HEADER_H = 100;
const DIVIDER_Y = HEADER_H + 8;
const PEER_START_Y = DIVIDER_Y + 16;
const PEER_ROW_H = 68;
const COMMENT_H = 50;
const FOOTER_H = 28;
const INACTIVE_CARD_H = 220;
const AVATAR_SIZE = 44;
const SELF_AVATAR_SIZE = 60;
const BAR_MAX_W = 280;
const BAR_H = 12;
const PEER_RANK_AREA_W = 28;
const PEER_RANK_X = PADDING + 16;
const PEER_AVATAR_X = PEER_RANK_X + PEER_RANK_AREA_W;
const PEER_NAME_X = PEER_AVATAR_X + AVATAR_SIZE + 12;
const PEER_BAR_X = 420;
const PEER_TIME_X = PEER_BAR_X + BAR_MAX_W + 12;
const GRAY_CIRCLE_COLOR = '#cccccc';
const ANONYMOUS_LABEL_COLOR = '#9a9a9a';
const HEADER_NAME_RIGHT_PAD = 16;
const HEADER_SUBTITLE_Y_OFFSET = 56;
const ANONYMOUS_SUBLABEL_Y_OFFSET = 18;
const INACTIVE_SECONDARY_LINE_OFFSET = 28;

/**
 * 베스트 프렌드 카드 PNG 렌더러.
 * 800×~580px 캔버스에 본인 헤더, peer 목록, AI 코멘트를 그린다.
 */
@Injectable()
export class BestFriendCardRenderer {
  private readonly logger = new Logger(BestFriendCardRenderer.name);

  // CanvasFontsService는 CanvasModule.onModuleInit()에서 이미 register()를 호출하므로
  // 생성자 주입으로 의존성만 선언한다
  constructor(private readonly canvasFonts: CanvasFontsService) {}

  /**
   * BestFriendCardData를 받아 PNG Buffer를 반환한다.
   * peers가 빈 배열이면 "비활성" 카드 변형을 렌더한다.
   */
  async render(data: BestFriendCardData): Promise<Buffer> {
    if (data.peers.length === 0) {
      return this.renderInactiveCard(data);
    }
    return this.renderActiveCard(data);
  }

  // ── 활성 카드 렌더 ──────────────────────────────────────────────────────────

  private async renderActiveCard(data: BestFriendCardData): Promise<Buffer> {
    const { peers, aiComment } = data;
    const hasComment = aiComment !== null && aiComment.length > 0;
    const canvasH = calcActiveCardHeight(peers.length, hasComment);

    const canvas = createCanvas(CARD_W, canvasH);
    const ctx = canvas.getContext('2d');

    drawCardBackground(ctx, CARD_W, canvasH);
    await this.drawHeader(ctx, data);
    this.drawHorizontalDivider(ctx, DIVIDER_Y + PADDING / 2);

    // peer 아바타를 병렬 로딩
    const avatarImages = await loadPeerAvatars(peers);

    for (let i = 0; i < peers.length; i++) {
      const peer = peers[i];
      const rowY = PEER_START_Y + i * PEER_ROW_H + PADDING / 2;
      const maxMinutes = peers[0].totalMinutes;
      this.drawPeerRow(ctx, peer, i + 1, rowY, maxMinutes, avatarImages[i]);
    }

    if (hasComment && aiComment) {
      const commentY = PEER_START_Y + peers.length * PEER_ROW_H + PADDING / 2 + 8;
      this.drawHorizontalDivider(ctx, commentY - 8);
      this.drawAiComment(ctx, aiComment, commentY);
    }

    return canvas.toBuffer('image/png');
  }

  // ── 비활성 카드 렌더 ─────────────────────────────────────────────────────────

  private async renderInactiveCard(data: BestFriendCardData): Promise<Buffer> {
    const canvas = createCanvas(CARD_W, INACTIVE_CARD_H);
    const ctx = canvas.getContext('2d');

    drawCardBackground(ctx, CARD_W, INACTIVE_CARD_H);
    await this.drawHeader(ctx, data);
    this.drawHorizontalDivider(ctx, DIVIDER_Y + PADDING / 2);

    const msgY = DIVIDER_Y + PADDING / 2 + 40;
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '16px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`최근 ${data.period}일간 함께한 친구 기록이 없어요.`, CARD_W / 2, msgY);
    ctx.fillText(
      '음성방에 들어가 친구를 만들어보세요!',
      CARD_W / 2,
      msgY + INACTIVE_SECONDARY_LINE_OFFSET,
    );
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
  }

  // ── 헤더 (본인 아바타 + 닉네임 + 부제목) ────────────────────────────────────

  private async drawHeader(ctx: SKRSContext2D, data: BestFriendCardData): Promise<void> {
    const { selfDisplayName, selfAvatarUrl, period, peers } = data;
    const normalizedName = normalizeDisplayName(selfDisplayName);
    const avatarX = PADDING + 16;
    const avatarY = PADDING + 4;
    const centerY = avatarY + SELF_AVATAR_SIZE / 2;

    // 본인 아바타
    try {
      const img = await loadImage(selfAvatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + SELF_AVATAR_SIZE / 2, centerY, SELF_AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, avatarX, avatarY, SELF_AVATAR_SIZE, SELF_AVATAR_SIZE);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(avatarX + SELF_AVATAR_SIZE / 2, centerY, SELF_AVATAR_SIZE / 2 + 2, 0, Math.PI * 2);
      ctx.strokeStyle = BLURPLE;
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch {
      this.logger.warn('베스트프렌드 카드: 본인 아바타 로딩 실패');
      drawGrayCircle(ctx, avatarX + SELF_AVATAR_SIZE / 2, centerY, SELF_AVATAR_SIZE / 2);
    }

    const nameX = avatarX + SELF_AVATAR_SIZE + 16;
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = 'bold 26px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const truncated = truncateName(
      ctx,
      normalizedName,
      CARD_W - nameX - PADDING - HEADER_NAME_RIGHT_PAD,
    );
    ctx.fillText(truncated, nameX, avatarY + 30);

    const topN = peers.length > 0 ? peers.length : 5;
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(
      `🤝 베스트 프렌드 TOP ${topN} · 최근 ${period}일`,
      nameX,
      avatarY + HEADER_SUBTITLE_Y_OFFSET,
    );
  }

  // ── peer 행 ─────────────────────────────────────────────────────────────────

  private drawPeerRow(
    ctx: SKRSContext2D,
    peer: TopPeerItem,
    rank: number,
    rowY: number,
    maxMinutes: number,
    avatarImage: Awaited<ReturnType<typeof loadImage>> | null,
  ): void {
    const avatarCX = PEER_AVATAR_X + AVATAR_SIZE / 2;
    const avatarCY = rowY + PEER_ROW_H / 2;

    // 순위
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = 'bold 14px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(`${rank}`, PEER_RANK_X, avatarCY + 5);

    // 아바타
    if (peer.isAnonymous || !avatarImage) {
      drawGrayCircle(ctx, avatarCX, avatarCY, AVATAR_SIZE / 2);
    } else {
      drawCircleAvatar(ctx, avatarImage, avatarCX, avatarCY, AVATAR_SIZE / 2);
    }

    // 닉네임
    const nameY = avatarCY - 6;
    ctx.fillStyle = peer.isAnonymous ? ANONYMOUS_LABEL_COLOR : TEXT_PRIMARY;
    ctx.font = 'bold 15px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const maxNameW = PEER_BAR_X - PEER_NAME_X - 16;
    const displayName = normalizeDisplayName(peer.displayName);
    ctx.fillText(truncateName(ctx, displayName, maxNameW), PEER_NAME_X, nameY);

    if (peer.isAnonymous) {
      ctx.fillStyle = ANONYMOUS_LABEL_COLOR;
      ctx.font = '12px "NotoSansCJK", "NotoColorEmoji", sans-serif';
      ctx.fillText('(비공개)', PEER_NAME_X, nameY + ANONYMOUS_SUBLABEL_Y_OFFSET);
    }

    // 친밀도 바
    const barY = avatarCY - BAR_H / 2;
    const barRatio = maxMinutes > 0 ? peer.totalMinutes / maxMinutes : 0;
    this.drawAffinityBar(ctx, PEER_BAR_X, barY, barRatio);

    // 시간 텍스트
    const timeText = formatMinutes(peer.totalMinutes);
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '13px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    ctx.fillText(timeText, PEER_TIME_X, avatarCY + 5);
  }

  private drawAffinityBar(ctx: SKRSContext2D, x: number, y: number, ratio: number): void {
    // 빈 바 배경
    roundRect(ctx, x, y, BAR_MAX_W, BAR_H, 4);
    ctx.fillStyle = BAR_EMPTY;
    ctx.fill();

    // 채움 바
    const fillW = Math.max(BAR_MAX_W * ratio, ratio > 0 ? 6 : 0);
    if (fillW > 0) {
      roundRect(ctx, x, y, fillW, BAR_H, 4);
      ctx.fillStyle = BLURPLE;
      ctx.fill();
    }
  }

  // ── AI 코멘트 ────────────────────────────────────────────────────────────────

  private drawAiComment(ctx: SKRSContext2D, comment: string, y: number): void {
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.font = '14px "NotoSansCJK", "NotoColorEmoji", sans-serif';
    const normalizedComment = normalizeDisplayName(comment);
    const maxW = CARD_W - PADDING * 2 - 32;
    ctx.fillText(
      `💬 ${truncateName(ctx, normalizedComment, maxW)}`,
      PADDING + 16,
      y + COMMENT_H / 2 + 6,
    );
  }

  // ── 공통 ─────────────────────────────────────────────────────────────────────

  private drawHorizontalDivider(ctx: SKRSContext2D, y: number): void {
    ctx.beginPath();
    ctx.moveTo(PADDING + 16, y);
    ctx.lineTo(CARD_W - PADDING - 16, y);
    ctx.strokeStyle = DIVIDER;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ── 모듈 내부 헬퍼 함수들 ────────────────────────────────────────────────────

function calcActiveCardHeight(peerCount: number, hasComment: boolean): number {
  const base = PEER_START_Y + PADDING / 2 + peerCount * PEER_ROW_H;
  const commentSection = hasComment ? 8 + COMMENT_H : 0;
  return base + commentSection + FOOTER_H;
}

function drawCardBackground(ctx: SKRSContext2D, w: number, h: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  roundRect(ctx, PADDING / 2, PADDING / 2, w - PADDING, h - PADDING, CARD_RADIUS);
  ctx.fillStyle = CARD_BG;
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGrayCircle(ctx: SKRSContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = GRAY_CIRCLE_COLOR;
  ctx.fill();
}

function drawCircleAvatar(
  ctx: SKRSContext2D,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- napi-rs Image 타입은 런타임 타입이며 공식 타입 정의가 없어 any 불가피
  img: any,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

async function loadPeerAvatars(
  peers: TopPeerItem[],
): Promise<(Awaited<ReturnType<typeof loadImage>> | null)[]> {
  return Promise.all(
    peers.map(async (peer) => {
      if (peer.isAnonymous || !peer.avatarUrl) return null;
      try {
        return await loadImage(peer.avatarUrl);
      } catch {
        return null;
      }
    }),
  );
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '0분';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}시간 ${mins}분`;
  return `${mins}분`;
}
