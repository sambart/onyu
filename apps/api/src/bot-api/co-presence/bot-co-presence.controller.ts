import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SkipThrottle } from '@nestjs/throttler';

import { VoiceExcludedChannelService } from '../../channel/voice/application/voice-excluded-channel.service';
import { VoiceGameService } from '../../channel/voice/application/voice-game.service';
import { BestFriendCardCacheService } from '../../channel/voice/co-presence/application/best-friend-card.cache';
import type { BestFriendCardData } from '../../channel/voice/co-presence/application/best-friend-card.types';
import { BestFriendCardRenderer } from '../../channel/voice/co-presence/application/best-friend-card-renderer';
import {
  CO_PRESENCE_TICK,
  CoPresenceTickEvent,
  CoPresenceTickSnapshot,
} from '../../channel/voice/co-presence/co-presence.events';
import { CoPresenceService } from '../../channel/voice/co-presence/co-presence.service';
import { CoPresenceAnalyticsService } from '../../channel/voice/co-presence/co-presence-analytics.service';
import type { BestFriendAiContext } from '../../voice-analytics/application/voice-ai-analysis.service';
import { VoiceAiAnalysisService } from '../../voice-analytics/application/voice-ai-analysis.service';
import { BotApiAuthGuard } from '../bot-api-auth.guard';

// ── LRU 캐시 키 헬퍼 ──
function buildCardCacheKey(
  guildId: string,
  userId: string,
  period: number,
  limit: number,
  hasComment: boolean,
): string {
  const commentFlag = hasComment ? '1' : '0';
  return `friend:card:${guildId}:${userId}:${period}:${limit}:${commentFlag}`;
}

// ── period 파싱 ──
// eslint-disable-next-line no-magic-numbers -- 도메인 허용 기간(일) 상수
const VALID_PERIODS = [7, 30, 90] as const;
type ValidPeriod = (typeof VALID_PERIODS)[number];
const DEFAULT_PERIOD: ValidPeriod = 30;

function parsePeriod(raw: string | undefined): ValidPeriod {
  const n = Number(raw);
  // VALID_PERIODS.includes의 타입은 readonly tuple이라 일반 number를 받지 않으므로 캐스팅이 필요하다
  const found = VALID_PERIODS.find((p) => p === n);
  return found ?? DEFAULT_PERIOD;
}

const MIN_LIMIT = 3;
const MAX_LIMIT = 5;

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? MAX_LIMIT);
  return Math.min(Math.max(n, MIN_LIMIT), MAX_LIMIT);
}

// ── 응답 타입 ──
interface CanvasCardResponse {
  ok: boolean;
  data: { imageBase64: string } | null;
  days: number;
}

/**
 * Bot → API 동시접속 스냅샷 수신 엔드포인트.
 * Bot이 60초마다 수집한 음성 채널 멤버 스냅샷을 수신하여 CoPresenceService로 처리한다.
 */
@SkipThrottle()
@Controller('bot-api/co-presence')
@UseGuards(BotApiAuthGuard)
export class BotCoPresenceController {
  private readonly logger = new Logger(BotCoPresenceController.name);

  constructor(
    private readonly coPresenceService: CoPresenceService,
    private readonly excludedChannelService: VoiceExcludedChannelService,
    private readonly eventEmitter: EventEmitter2,
    private readonly voiceGameService: VoiceGameService,
    private readonly coPresenceAnalyticsService: CoPresenceAnalyticsService,
    private readonly bestFriendCardRenderer: BestFriendCardRenderer,
    private readonly bestFriendCardCacheService: BestFriendCardCacheService,
    private readonly voiceAiAnalysisService: VoiceAiAnalysisService,
  ) {}

  @Post('snapshots')
  @HttpCode(HttpStatus.OK)
  async receiveSnapshots(
    @Body() body: { snapshots: CoPresenceTickSnapshot[] },
  ): Promise<{ ok: boolean }> {
    // 제외 채널 필터링
    const filtered: CoPresenceTickSnapshot[] = [];
    for (const snapshot of body.snapshots) {
      const isExcluded = await this.excludedChannelService.isExcludedChannel(
        snapshot.guildId,
        snapshot.channelId,
        null,
      );
      if (!isExcluded) {
        filtered.push(snapshot);
      }
    }

    // 처리된 길드 ID 수집 (스냅샷 유무 무관, 모든 길드 대상)
    const processedGuildIds = [...new Set(body.snapshots.map((s) => s.guildId))];

    // Phase 2: 게임 세션 갱신 (제외 채널 필터링 후)
    for (const snapshot of filtered) {
      if (snapshot.memberActivities && snapshot.memberActivities.length > 0) {
        await this.voiceGameService.reconcileForChannel(
          snapshot.guildId,
          snapshot.channelId,
          snapshot.memberActivities,
        );
      }
    }

    // 기존 CoPresenceService로 세션 조정
    await this.coPresenceService.reconcile(filtered, processedGuildIds);

    // tick 이벤트 발행
    if (filtered.length > 0) {
      const tickEvent: CoPresenceTickEvent = { snapshots: filtered };
      this.eventEmitter.emit(CO_PRESENCE_TICK, tickEvent);
    }

    this.logger.debug(
      `[BOT-API] co-presence snapshots: total=${body.snapshots.length} filtered=${filtered.length} guilds=${processedGuildIds.length}`,
    );

    return { ok: true };
  }

  @Post('flush')
  @HttpCode(HttpStatus.OK)
  async flush(): Promise<{ ok: boolean }> {
    await this.coPresenceService.endAllSessions();
    this.logger.log('[BOT-API] co-presence flush completed');
    return { ok: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-014: 베스트 프렌드 카드
  // ──────────────────────────────────────────────────────────────────────────

  @Post('best-friends')
  @HttpCode(HttpStatus.OK)
  async getBestFriends(
    @Query('guildId') guildId: string,
    @Query('userId') userId: string,
    @Query('displayName') displayName: string,
    @Query('avatarUrl') avatarUrl: string,
    @Query('period') periodRaw: string,
    @Query('limit') limitRaw: string,
    @Query('includeComment') includeCommentRaw?: string,
  ): Promise<CanvasCardResponse> {
    const period = parsePeriod(periodRaw);
    const limit = parseLimit(limitRaw);
    const hasComment = includeCommentRaw !== '0';

    const cacheKey = buildCardCacheKey(guildId, userId, period, limit, hasComment);
    const cached = this.bestFriendCardCacheService.get(cacheKey);
    if (cached !== undefined) {
      return { ok: true, data: { imageBase64: cached }, days: period };
    }

    return this.renderBestFriendCard({
      guildId,
      userId,
      displayName,
      avatarUrl,
      period,
      limit,
      hasComment,
      cacheKey,
    });
  }

  private async renderBestFriendCard(opts: {
    guildId: string;
    userId: string;
    displayName: string;
    avatarUrl: string;
    period: ValidPeriod;
    limit: number;
    hasComment: boolean;
    cacheKey: string;
  }): Promise<CanvasCardResponse> {
    const { guildId, userId, displayName, avatarUrl, period, limit, hasComment, cacheKey } = opts;

    try {
      const peers = await this.coPresenceAnalyticsService.getMyTopPeers(
        guildId,
        userId,
        period,
        limit,
      );

      const aiComment = await this.resolveAiComment({
        guildId,
        hasComment,
        peers,
        selfDisplayName: displayName,
        period,
      });

      const cardData: BestFriendCardData = {
        selfDisplayName: displayName,
        selfAvatarUrl: avatarUrl,
        period,
        peers,
        aiComment,
      };

      const buffer = await this.bestFriendCardRenderer.render(cardData);
      const imageBase64 = buffer.toString('base64');

      this.bestFriendCardCacheService.set(cacheKey, imageBase64);
      return { ok: true, data: { imageBase64 }, days: period };
    } catch (error) {
      this.logger.error(
        '[BestFriend] 카드 렌더 실패',
        error instanceof Error ? error.stack : String(error),
      );
      return { ok: true, data: null, days: period };
    }
  }

  private async resolveAiComment(params: {
    guildId: string;
    hasComment: boolean;
    peers: Awaited<ReturnType<CoPresenceAnalyticsService['getMyTopPeers']>>;
    selfDisplayName: string;
    period: ValidPeriod;
  }): Promise<string | null> {
    const { guildId, hasComment, peers, selfDisplayName, period } = params;
    const MIN_PEERS_FOR_COMMENT = 3;
    if (!hasComment || peers.length < MIN_PEERS_FOR_COMMENT) return null;

    const context: BestFriendAiContext = {
      guildId,
      selfDisplayName,
      period,
      topPeers: peers.slice(0, MIN_PEERS_FOR_COMMENT).map((p) => ({
        displayName: p.displayName,
        totalMinutes: p.totalMinutes,
        sessionCount: p.sessionCount,
      })),
    };
    return this.voiceAiAnalysisService.generateBestFriendComment(context);
  }
}
