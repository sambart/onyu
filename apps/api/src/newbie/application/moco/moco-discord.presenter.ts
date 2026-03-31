import { Injectable, Logger } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { getErrorStack } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { RedisService } from '../../../redis/redis.service';
import { NewbieKeys } from '../../infrastructure/newbie-cache.keys';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NEWBIE_CUSTOM_ID } from '../../infrastructure/newbie-custom-id.constants';
import { NewbieMocoTemplateRepository } from '../../infrastructure/newbie-moco-template.repository';
import {
  DEFAULT_MOCO_BODY_TEMPLATE,
  DEFAULT_MOCO_FOOTER_TEMPLATE,
  DEFAULT_MOCO_FOOTER_TEMPLATE_NO_INTERVAL,
  DEFAULT_MOCO_ITEM_TEMPLATE,
  DEFAULT_MOCO_SCORING_TEMPLATE,
  DEFAULT_MOCO_TITLE_TEMPLATE,
} from '../../infrastructure/newbie-template.constants';
import { getMocoPeriodBounds } from '../util/moco-period.util';
import { applyTemplate } from '../util/newbie-template.util';

/** 디스플레이 이름 캐시 TTL (초) */
const DISPLAY_NAME_TTL = 5 * 60;

/** Discord Embed/Button UI 렌더링 및 메시지 전송 전담. */
@Injectable()
export class MocoDiscordPresenter {
  private readonly logger = new Logger(MocoDiscordPresenter.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly mocoTmplRepo: NewbieMocoTemplateRepository,
    private readonly discordRest: DiscordRestService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Discord displayName을 일괄 조회한다.
   * @returns 조회 실패 시 ID를 그대로 반환
   */
  async fetchDisplayNames(guildId: string, userIds: string[]): Promise<Record<string, string>> {
    const cacheKey = NewbieKeys.displayNames(guildId);
    const names: Record<string, string> = {};

    // 1) Redis 캐시에서 일괄 조회
    const cached = await this.redis.get<Record<string, string>>(cacheKey);
    const missingIds: string[] = [];

    for (const userId of userIds) {
      if (cached?.[userId]) {
        names[userId] = cached[userId];
      } else {
        missingIds.push(userId);
      }
    }

    // 2) 캐시 미스된 유저만 Discord REST로 조회
    if (missingIds.length > 0) {
      const results = await Promise.allSettled(
        missingIds.map(async (userId) => {
          const member = await this.discordRest.fetchGuildMember(guildId, userId);
          return {
            userId,
            name: member ? this.discordRest.getMemberDisplayName(member) : userId,
          };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          names[result.value.userId] = result.value.name;
        } else {
          this.logger.warn(
            `[MOCO] Failed to fetch member in guild ${guildId}`,
            getErrorStack(result.reason),
          );
        }
      }

      // 조회 실패한 유저는 ID를 그대로 사용
      for (const userId of missingIds) {
        if (!names[userId]) {
          names[userId] = userId;
        }
      }

      // 3) 캐시 갱신 (기존 캐시 + 새로 조회한 이름)
      const updatedCache = { ...cached, ...names };
      await this.redis.set(cacheKey, updatedCache, DISPLAY_NAME_TTL);
    }

    return names;
  }

  /**
   * 순위 Embed + 페이지네이션 버튼을 구성하여 반환한다.
   */
  async buildRankPayload(
    guildId: string,
    data: MocoRankData,
    config: NewbieConfig | null,
  ): Promise<{
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
  }> {
    if (!data.hasEntries) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('모코코 사냥 순위')
        .setDescription('아직 기록된 사냥꾼이 없습니다.')
        .setColor(config?.mocoEmbedColor ? (config.mocoEmbedColor as `#${string}`) : 0x5865f2);
      return { embeds: [emptyEmbed], components: [] };
    }

    const embed = await this.buildHunterEmbed(guildId, data, config);
    const components = this.buildButtons(guildId, data.currentPage, data.totalPages);

    return { embeds: [embed], components: [components] };
  }

  /**
   * 기존 Embed 메시지를 삭제한다.
   */
  async deleteEmbed(channelId: string, messageId: string): Promise<void> {
    try {
      await this.discordRest.deleteMessage(channelId, messageId);
    } catch (err) {
      this.logger.warn(
        `[MOCO] Failed to delete old embed: channel=${channelId} message=${messageId}`,
        getErrorStack(err),
      );
    }
  }

  /**
   * 순위 Embed를 채널에 전송(최초) 또는 수정(이후)한다.
   */
  async sendOrUpdateRankEmbed(
    config: NewbieConfig,
    guildId: string,
    payload: { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] },
  ): Promise<void> {
    if (!config.mocoRankChannelId) {
      this.logger.warn(`[MOCO] mocoRankChannelId not set: guild=${guildId}`);
      return;
    }

    const channelId = config.mocoRankChannelId;

    // REST API로 전송할 payload로 변환 (EmbedBuilder -> JSON)
    const restPayload = {
      embeds: payload.embeds.map((e) => e.toJSON()),
      components: payload.components.map((c) => c.toJSON()),
    };

    if (config.mocoRankMessageId) {
      try {
        await this.discordRest.editMessage(channelId, config.mocoRankMessageId, restPayload);
        return;
      } catch {
        this.logger.warn(
          `[MOCO] Failed to edit message ${config.mocoRankMessageId}, sending new message`,
        );
        await this.configRepo.updateMocoRankMessageId(guildId, null);
      }
    }

    try {
      const sent = await this.discordRest.sendMessage(channelId, restPayload);
      await this.configRepo.updateMocoRankMessageId(guildId, sent.id);
    } catch (err) {
      this.logger.error(`[MOCO] Failed to send rank embed: guild=${guildId}`, getErrorStack(err));
    }
  }

  /**
   * 사냥꾼 1명에 대한 순위 Embed 구성.
   */
  private async buildHunterEmbed(
    guildId: string,
    data: MocoRankData,
    config: NewbieConfig | null,
  ): Promise<EmbedBuilder> {
    const tmpl = await this.mocoTmplRepo.findByGuildId(guildId);
    const titleTemplate = tmpl?.titleTemplate ?? DEFAULT_MOCO_TITLE_TEMPLATE;
    const bodyTemplate = tmpl?.bodyTemplate ?? DEFAULT_MOCO_BODY_TEMPLATE;
    const itemTemplate = tmpl?.itemTemplate ?? DEFAULT_MOCO_ITEM_TEMPLATE;

    const autoRefreshMinutes = config?.mocoAutoRefreshMinutes ?? null;
    const resolvedFooterTemplate =
      tmpl?.footerTemplate ??
      (autoRefreshMinutes !== null
        ? DEFAULT_MOCO_FOOTER_TEMPLATE
        : DEFAULT_MOCO_FOOTER_TEMPLATE_NO_INTERVAL);

    const renderedItems = data.newbieEntries
      .sort((a, b) => b.minutes - a.minutes)
      .map((entry) =>
        applyTemplate(itemTemplate, {
          newbieName: entry.name,
          newbieMention: `<@${entry.id}>`,
          minutes: String(entry.minutes),
          sessions: String(entry.sessions),
        }),
      );

    const mocoList = renderedItems.join('\n') || '없음';

    let resolvedBody = applyTemplate(bodyTemplate, {
      totalMinutes: String(data.channelMinutes),
      mocoList,
      score: String(data.score),
      sessionCount: String(data.sessionCount),
      uniqueNewbieCount: String(data.uniqueNewbieCount),
    });

    const scoringTmpl = tmpl?.scoringTemplate ?? undefined;
    if (scoringTmpl !== '') {
      const resolvedScoringTemplate = scoringTmpl ?? DEFAULT_MOCO_SCORING_TEMPLATE;
      const renderedScoring = applyTemplate(resolvedScoringTemplate, {
        scorePerSession: String(config?.mocoScorePerSession ?? 10),
        scorePerMinute: String(config?.mocoScorePerMinute ?? 1),
        scorePerUnique: String(config?.mocoScorePerUnique ?? 5),
        minCoPresence: String(config?.mocoMinCoPresenceMin ?? 10),
      });
      resolvedBody = resolvedBody + '\n\n' + renderedScoring;
    }

    const resolvedTitle = applyTemplate(titleTemplate, {
      rank: String(data.currentPage),
      hunterName: data.hunterName,
      hunterMention: `<@${data.hunterId}>`,
    });

    const periodBounds = getMocoPeriodBounds(config ?? {});
    const resolvedFooter = applyTemplate(resolvedFooterTemplate, {
      currentPage: String(data.currentPage),
      totalPages: String(data.totalPages),
      interval: autoRefreshMinutes !== null ? String(autoRefreshMinutes) : '',
      periodStart: periodBounds?.periodStart ?? '',
      periodEnd: periodBounds?.periodEnd ?? '',
    });

    const embed = new EmbedBuilder()
      .setTitle(resolvedTitle)
      .setDescription(resolvedBody)
      .setFooter({ text: resolvedFooter })
      .setColor(config?.mocoEmbedColor ? (config.mocoEmbedColor as `#${string}`) : 0x5865f2);

    if (config?.mocoEmbedThumbnailUrl) {
      embed.setThumbnail(config.mocoEmbedThumbnailUrl);
    }

    return embed;
  }

  private buildButtons(
    guildId: string,
    currentPage: number,
    totalPages: number,
  ): ActionRowBuilder<ButtonBuilder> {
    const prevButton = new ButtonBuilder()
      .setCustomId(`${NEWBIE_CUSTOM_ID.MOCO_PREV}${guildId}:${currentPage}`)
      .setLabel('◀ 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1);

    const nextButton = new ButtonBuilder()
      .setCustomId(`${NEWBIE_CUSTOM_ID.MOCO_NEXT}${guildId}:${currentPage}`)
      .setLabel('다음 ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages);

    const refreshButton = new ButtonBuilder()
      .setCustomId(`${NEWBIE_CUSTOM_ID.MOCO_REFRESH}${guildId}`)
      .setLabel('갱신')
      .setStyle(ButtonStyle.Primary);

    const myButton = new ButtonBuilder()
      .setCustomId(`${NEWBIE_CUSTOM_ID.MOCO_MY}${guildId}`)
      .setLabel('내 사냥 시간')
      .setStyle(ButtonStyle.Success);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      prevButton,
      nextButton,
      refreshButton,
      myButton,
    );
  }
}

/** Presenter에 전달할 순위 데이터 */
export interface MocoRankData {
  hasEntries: boolean;
  hunterId: string;
  hunterName: string;
  channelMinutes: number;
  score: number;
  sessionCount: number;
  uniqueNewbieCount: number;
  currentPage: number;
  totalPages: number;
  newbieEntries: Array<{ id: string; name: string; minutes: number; sessions: number }>;
}
