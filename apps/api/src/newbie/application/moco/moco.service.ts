import { Injectable, Logger } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';

import { RedisService } from '../../../redis/redis.service';
import { NewbieKeys } from '../../infrastructure/newbie-cache.keys';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import { getMocoPeriodBounds } from '../util/moco-period.util';
import type { MocoRankData } from './moco-discord.presenter';
import { MocoDiscordPresenter } from './moco-discord.presenter';
import type {
  CanvasRankConfig,
  MocoCanvasDetailData,
  MocoCanvasRankData,
} from './moco-rank.renderer';
import { CANVAS_CACHE_TTL_SEC, MocoRankRenderer } from './moco-rank.renderer';

/** Embed 모드 페이지당 사냥꾼 수 */
const EMBED_PAGE_SIZE = 1;

/** Canvas 모드 페이지당 사냥꾼 수 */
const CANVAS_PAGE_SIZE = 10;

/** Embed 모드 반환 타입 */
export interface EmbedRankPayload {
  mode: 'EMBED';
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

/** Canvas 모드 반환 타입 */
export interface CanvasRankPayload {
  mode: 'CANVAS';
  imageBuffer: Buffer;
  components: ActionRowBuilder<ButtonBuilder>[];
}

export type RankPayload = EmbedRankPayload | CanvasRankPayload;

/** 내 사냥 시간 반환 타입 */
export type MyHuntingResult =
  | { mode: 'EMBED'; content: string }
  | { mode: 'CANVAS'; imageBuffer: Buffer };

@Injectable()
export class MocoService {
  private readonly logger = new Logger(MocoService.name);

  // eslint-disable-next-line max-params
  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    private readonly presenter: MocoDiscordPresenter,
    private readonly renderer: MocoRankRenderer,
    private readonly redis: RedisService,
  ) {}

  /**
   * 순위 Embed/Canvas payload를 구성하여 반환한다.
   * mocoDisplayMode에 따라 분기한다.
   */
  async buildRankPayload(guildId: string, page: number): Promise<RankPayload> {
    const config = await this.configRepo.findByGuildId(guildId);

    if (config?.mocoDisplayMode === 'CANVAS') {
      return this.buildCanvasRankPayload(guildId, page, config);
    }

    const data = await this.buildRankData(guildId, page);
    const payload = await this.presenter.buildRankPayload(guildId, data, config);
    return { mode: 'EMBED', ...payload };
  }

  /**
   * 기존 모코코 순위 Embed 메시지를 삭제한다.
   */
  async deleteEmbed(channelId: string, messageId: string): Promise<void> {
    await this.presenter.deleteEmbed(channelId, messageId);
  }

  /**
   * 순위 Embed/Canvas를 생성하고 설정된 채널에 전송(최초) 또는 수정(이후)한다.
   */
  async sendOrUpdateRankEmbed(guildId: string, page: number): Promise<void> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.mocoRankChannelId) {
      this.logger.warn(`[MOCO] mocoRankChannelId not set: guild=${guildId}`);
      return;
    }

    if (config.mocoDisplayMode === 'CANVAS') {
      const payload = await this.buildCanvasRankPayload(guildId, page, config);
      await this.presenter.sendOrUpdateCanvasRank(config, guildId, payload);
      return;
    }

    // 기존 Embed 로직
    const data = await this.buildRankData(guildId, page);
    const payload = await this.presenter.buildRankPayload(guildId, data, config);
    await this.presenter.sendOrUpdateRankEmbed(config, guildId, payload);
  }

  /**
   * 특정 사용자의 모코코 사냥 Ephemeral 메시지 내용을 구성한다.
   * mocoDisplayMode에 따라 Canvas 이미지 또는 텍스트를 반환한다.
   */
  async buildMyHunting(guildId: string, userId: string): Promise<MyHuntingResult> {
    const config = await this.configRepo.findByGuildId(guildId);

    if (config?.mocoDisplayMode === 'CANVAS') {
      return this.buildCanvasHunterDetail(guildId, userId, config);
    }

    const content = await this.buildMyHuntingMessage(guildId, userId);
    return { mode: 'EMBED', content };
  }

  /**
   * 특정 사용자의 모코코 사냥 시간 Ephemeral 메시지 내용을 구성한다.
   * Embed 모드 전용 (하위 호환용).
   */
  async buildMyHuntingMessage(guildId: string, userId: string): Promise<string> {
    const [totalMinutes, rank, totalCount, details, meta, newbieSessions] = await Promise.all([
      this.newbieRedis.getMocoHunterScore(guildId, userId),
      this.newbieRedis.getMocoHunterRank(guildId, userId),
      this.newbieRedis.getMocoRankCount(guildId),
      this.newbieRedis.getMocoHunterDetail(guildId, userId),
      this.newbieRedis.getMocoHunterMeta(guildId, userId),
      this.newbieRedis.getMocoNewbieSessions(guildId, userId),
    ]);

    if (totalMinutes === null || rank === null) {
      return '아직 모코코 사냥 기록이 없습니다.';
    }

    const score = meta?.score ?? Math.round(totalMinutes);
    const sessionCount = meta?.sessionCount ?? 0;
    const uniqueNewbieCount = meta?.uniqueNewbieCount ?? 0;
    const channelMinutes = meta?.totalMinutes ?? Math.round(totalMinutes);

    const lines: string[] = [];
    lines.push(`🏆 **순위**: ${rank}위 / ${totalCount}명`);
    lines.push(`🏆 **총 점수**: ${score}점`);
    lines.push(
      `⏱️ **총 사냥 시간**: ${channelMinutes}분 | 🎮 **게임 횟수**: ${sessionCount}회 | 🌱 **모코코**: ${uniqueNewbieCount}명`,
    );

    const entries = Object.entries(details).sort(([, a], [, b]) => b - a);
    if (entries.length > 0) {
      lines.push('');
      lines.push('🌱 **도움을 받은 모코코들:**');

      const newbieIds = entries.map(([id]) => id);
      const nameMap = await this.presenter.fetchDisplayNames(guildId, newbieIds);

      for (const [newbieId, minutes] of entries) {
        const name = nameMap[newbieId] ?? newbieId;
        const sessions = newbieSessions[newbieId] ?? 0;
        lines.push(`– ${name}: ${minutes}분 (${sessions}회)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 특정 사냥꾼의 도움받은 모코코 상세 목록을 반환한다.
   */
  async getHunterDetail(
    guildId: string,
    hunterId: string,
  ): Promise<Array<{ newbieId: string; newbieName: string; minutes: number; sessions: number }>> {
    const [minutesMap, sessionsMap] = await Promise.all([
      this.newbieRedis.getMocoHunterDetail(guildId, hunterId),
      this.newbieRedis.getMocoNewbieSessions(guildId, hunterId),
    ]);

    const newbieIds = Object.keys(minutesMap);
    if (newbieIds.length === 0) return [];

    const nameMap = await this.presenter.fetchDisplayNames(guildId, newbieIds);

    return newbieIds
      .map((newbieId) => ({
        newbieId,
        newbieName: nameMap[newbieId] ?? newbieId,
        minutes: minutesMap[newbieId] ?? 0,
        sessions: sessionsMap[newbieId] ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }

  /**
   * 해당 길드의 Canvas 캐시를 전체 삭제한다.
   * 데이터 변경(세션 종료, 리셋) 시 호출한다.
   */
  async invalidateCanvasCache(guildId: string): Promise<void> {
    const pattern = NewbieKeys.mocoCanvasPattern(guildId);
    await this.redis.deleteByPattern(pattern);
  }

  // ── Private: Canvas 모드 ──

  private async buildCanvasRankPayload(
    guildId: string,
    page: number,
    config: NewbieConfig,
  ): Promise<CanvasRankPayload> {
    const cacheKey = NewbieKeys.mocoCanvasRank(guildId, page);
    const cached = await this.redis.getBuffer(cacheKey);

    if (cached) {
      const totalCount = await this.newbieRedis.getMocoRankCount(guildId);
      const totalPages = Math.max(1, Math.ceil(totalCount / CANVAS_PAGE_SIZE));
      const row = this.presenter.buildCanvasButtons(guildId, page, totalPages);
      return { mode: 'CANVAS', imageBuffer: cached, components: [row] };
    }

    const data = await this.buildCanvasRankData(guildId, page);
    const canvasConfig = this.toCanvasRankConfig(config);
    const imageBuffer = await this.renderer.renderRankBoard(data, canvasConfig);

    await this.redis.setBuffer(cacheKey, imageBuffer, CANVAS_CACHE_TTL_SEC);

    const row = this.presenter.buildCanvasButtons(guildId, data.currentPage, data.totalPages);
    return { mode: 'CANVAS', imageBuffer, components: [row] };
  }

  private async buildCanvasRankData(guildId: string, page: number): Promise<MocoCanvasRankData> {
    const totalCount = await this.newbieRedis.getMocoRankCount(guildId);
    const totalPages = Math.max(1, Math.ceil(totalCount / CANVAS_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const rankEntries = await this.newbieRedis.getMocoRankPage(guildId, safePage, CANVAS_PAGE_SIZE);

    if (rankEntries.length === 0) {
      return { currentPage: safePage, totalPages, entries: [] };
    }

    const hunterIds = rankEntries.map((e) => e.hunterId);
    const nameMap = await this.presenter.fetchDisplayNames(guildId, hunterIds);

    const entries = await Promise.all(
      rankEntries.map(async (entry, idx) => {
        const meta = await this.newbieRedis.getMocoHunterMeta(guildId, entry.hunterId);
        const rank = (safePage - 1) * CANVAS_PAGE_SIZE + idx + 1;
        return {
          rank,
          hunterId: entry.hunterId,
          hunterName: nameMap[entry.hunterId] ?? entry.hunterId,
          score: meta?.score ?? Math.round(entry.totalMinutes),
          channelMinutes: meta?.totalMinutes ?? Math.round(entry.totalMinutes),
          sessionCount: meta?.sessionCount ?? 0,
          uniqueNewbieCount: meta?.uniqueNewbieCount ?? 0,
        };
      }),
    );

    return { currentPage: safePage, totalPages, entries };
  }

  private async buildCanvasHunterDetail(
    guildId: string,
    userId: string,
    config: NewbieConfig,
  ): Promise<{ mode: 'CANVAS'; imageBuffer: Buffer }> {
    const cacheKey = NewbieKeys.mocoCanvasDetail(guildId, userId);
    const cached = await this.redis.getBuffer(cacheKey);
    if (cached) {
      return { mode: 'CANVAS', imageBuffer: cached };
    }

    const [totalMinutes, rank, totalCount, details, meta, newbieSessions] = await Promise.all([
      this.newbieRedis.getMocoHunterScore(guildId, userId),
      this.newbieRedis.getMocoHunterRank(guildId, userId),
      this.newbieRedis.getMocoRankCount(guildId),
      this.newbieRedis.getMocoHunterDetail(guildId, userId),
      this.newbieRedis.getMocoHunterMeta(guildId, userId),
      this.newbieRedis.getMocoNewbieSessions(guildId, userId),
    ]);

    const nameMap = await this.presenter.fetchDisplayNames(guildId, [userId]);
    const hunterName = nameMap[userId] ?? userId;

    const newbieIds = Object.keys(details);
    const newbieNameMap =
      newbieIds.length > 0 ? await this.presenter.fetchDisplayNames(guildId, newbieIds) : {};

    const newbieEntries = newbieIds
      .map((id) => ({
        newbieName: newbieNameMap[id] ?? id,
        minutes: details[id] ?? 0,
        sessions: newbieSessions[id] ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const detailData: MocoCanvasDetailData = {
      hunterId: userId,
      hunterName,
      rank: rank ?? 0,
      totalCount,
      score: meta?.score ?? Math.round(totalMinutes ?? 0),
      channelMinutes: meta?.totalMinutes ?? Math.round(totalMinutes ?? 0),
      sessionCount: meta?.sessionCount ?? 0,
      uniqueNewbieCount: meta?.uniqueNewbieCount ?? 0,
      newbieEntries,
      config: this.toCanvasRankConfig(config),
    };

    const imageBuffer = await this.renderer.renderHunterDetail(detailData);
    await this.redis.setBuffer(cacheKey, imageBuffer, CANVAS_CACHE_TTL_SEC);

    return { mode: 'CANVAS', imageBuffer };
  }

  private toCanvasRankConfig(config: NewbieConfig): CanvasRankConfig {
    const periodBounds = getMocoPeriodBounds(config);
    return {
      scorePerSession: config.mocoScorePerSession,
      scorePerMinute: config.mocoScorePerMinute,
      scorePerUnique: config.mocoScorePerUnique,
      minCoPresenceMin: config.mocoMinCoPresenceMin,
      periodStart: periodBounds?.periodStart ?? null,
      periodEnd: periodBounds?.periodEnd ?? null,
      embedColor: config.mocoEmbedColor,
    };
  }

  // ── Private: Embed 모드 (기존) ──

  /**
   * 순위 데이터를 구성한다 (순수 데이터 조회).
   */
  private async buildRankData(guildId: string, page: number): Promise<MocoRankData> {
    const totalCount = await this.newbieRedis.getMocoRankCount(guildId);
    // Embed 모드는 EMBED_PAGE_SIZE = 1이므로 총 페이지 수 = 총 사냥꾼 수
    const totalPages = Math.max(1, totalCount);
    const safePage = Math.min(Math.max(1, page), totalPages);

    const rankEntries = await this.newbieRedis.getMocoRankPage(guildId, safePage, EMBED_PAGE_SIZE);

    if (rankEntries.length === 0) {
      return {
        hasEntries: false,
        hunterId: '',
        hunterName: '',
        channelMinutes: 0,
        score: 0,
        sessionCount: 0,
        uniqueNewbieCount: 0,
        currentPage: safePage,
        totalPages,
        newbieEntries: [],
      };
    }

    const { hunterId, totalMinutes } = rankEntries[0];

    const [meta, newbieSessions, details] = await Promise.all([
      this.newbieRedis.getMocoHunterMeta(guildId, hunterId),
      this.newbieRedis.getMocoNewbieSessions(guildId, hunterId),
      this.newbieRedis.getMocoHunterDetail(guildId, hunterId),
    ]);
    const score = meta?.score ?? Math.round(totalMinutes);
    const sessionCount = meta?.sessionCount ?? 0;
    const uniqueNewbieCount = meta?.uniqueNewbieCount ?? 0;
    const channelMinutes = meta?.totalMinutes ?? Math.round(totalMinutes);

    // displayName 일괄 조회
    const allIds = [hunterId, ...Object.keys(details)];
    const nameMap = await this.presenter.fetchDisplayNames(guildId, allIds);

    const newbieEntries = Object.entries(details).map(([newbieId, minutes]) => ({
      id: newbieId,
      name: nameMap[newbieId] ?? newbieId,
      minutes,
      sessions: newbieSessions[newbieId] ?? 0,
    }));

    return {
      hasEntries: true,
      hunterId,
      hunterName: nameMap[hunterId] ?? hunterId,
      channelMinutes,
      score,
      sessionCount,
      uniqueNewbieCount,
      currentPage: safePage,
      totalPages,
      newbieEntries,
    };
  }
}
