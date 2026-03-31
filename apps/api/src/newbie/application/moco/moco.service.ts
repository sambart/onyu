import { Injectable, Logger } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from 'discord.js';

import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import type { MocoRankData } from './moco-discord.presenter';
import { MocoDiscordPresenter } from './moco-discord.presenter';

/** 페이지당 사냥꾼 수 */
const PAGE_SIZE = 1;

@Injectable()
export class MocoService {
  private readonly logger = new Logger(MocoService.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    private readonly presenter: MocoDiscordPresenter,
  ) {}

  /**
   * 순위 Embed + 페이지네이션 버튼을 구성하여 반환한다.
   */
  async buildRankPayload(
    guildId: string,
    page: number,
  ): Promise<{
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
  }> {
    const config = await this.configRepo.findByGuildId(guildId);
    const data = await this.buildRankData(guildId, page);
    return this.presenter.buildRankPayload(guildId, data, config);
  }

  /**
   * 기존 모코코 순위 Embed 메시지를 삭제한다.
   */
  async deleteEmbed(channelId: string, messageId: string): Promise<void> {
    await this.presenter.deleteEmbed(channelId, messageId);
  }

  /**
   * 순위 Embed를 생성하고 설정된 채널에 전송(최초) 또는 수정(이후)한다.
   */
  async sendOrUpdateRankEmbed(guildId: string, page: number): Promise<void> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.mocoRankChannelId) {
      this.logger.warn(`[MOCO] mocoRankChannelId not set: guild=${guildId}`);
      return;
    }

    const data = await this.buildRankData(guildId, page);
    const payload = await this.presenter.buildRankPayload(guildId, data, config);
    await this.presenter.sendOrUpdateRankEmbed(config, guildId, payload);
  }

  /**
   * 특정 사용자의 모코코 사냥 시간 Ephemeral 메시지 내용을 구성한다.
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
   * 순위 데이터를 구성한다 (순수 데이터 조회).
   */
  private async buildRankData(guildId: string, page: number): Promise<MocoRankData> {
    const totalCount = await this.newbieRedis.getMocoRankCount(guildId);
    const totalPages = Math.max(1, totalCount);
    const safePage = Math.min(Math.max(1, page), totalPages);

    const rankEntries = await this.newbieRedis.getMocoRankPage(guildId, safePage, PAGE_SIZE);

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
