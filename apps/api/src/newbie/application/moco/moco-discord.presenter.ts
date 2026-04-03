import { Injectable, Logger } from '@nestjs/common';
import type { RawFile } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { getErrorStack } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
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

/** Discord 기본 Blurple 색상 (embed color fallback) */
const DISCORD_BLURPLE = 0x5865f2;

/** Discord Embed/Button UI 렌더링 및 메시지 전송 전담. */
@Injectable()
export class MocoDiscordPresenter {
  private readonly logger = new Logger(MocoDiscordPresenter.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly mocoTmplRepo: NewbieMocoTemplateRepository,
    private readonly discordRest: DiscordRestService,
    private readonly guildMemberService: GuildMemberService,
  ) {}

  /**
   * DB에서 displayName을 일괄 조회한다.
   * @returns 미조회 시 userId를 그대로 반환
   */
  async fetchDisplayNames(guildId: string, userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};

    const memberMap = await this.guildMemberService.findByUserIds(guildId, userIds);
    const names: Record<string, string> = {};

    for (const userId of userIds) {
      const member = memberMap.get(userId);
      names[userId] = member?.nick ?? member?.displayName ?? userId;
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
        .setColor(
          // discord.js setColor은 `#${string}` 리터럴 타입 요구 — DB 값은 '#RRGGBB' 형식으로 저장되므로 단언 안전
          config?.mocoEmbedColor ? (config.mocoEmbedColor as `#${string}`) : DISCORD_BLURPLE,
        );
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
    const autoRefreshMinutes = config?.mocoAutoRefreshMinutes ?? null;

    const resolvedTitle = this.resolveEmbedTitle(tmpl, data);
    const resolvedBody = this.resolveEmbedBody(tmpl, data, config);
    const resolvedFooter = this.resolveEmbedFooter({ tmpl, autoRefreshMinutes, data, config });

    // discord.js setColor은 `#${string}` 리터럴 타입 요구 — DB 값은 '#RRGGBB' 형식으로 저장되므로 단언 안전
    const embed = new EmbedBuilder()
      .setTitle(resolvedTitle)
      .setDescription(resolvedBody)
      .setFooter({ text: resolvedFooter })
      .setColor(config?.mocoEmbedColor ? (config.mocoEmbedColor as `#${string}`) : DISCORD_BLURPLE);

    if (config?.mocoEmbedThumbnailUrl) {
      embed.setThumbnail(config.mocoEmbedThumbnailUrl);
    }

    return embed;
  }

  private resolveEmbedTitle(
    tmpl: Awaited<ReturnType<NewbieMocoTemplateRepository['findByGuildId']>>,
    data: MocoRankData,
  ): string {
    const titleTemplate = tmpl?.titleTemplate ?? DEFAULT_MOCO_TITLE_TEMPLATE;
    return applyTemplate(titleTemplate, {
      rank: String(data.currentPage),
      hunterName: data.hunterName,
      hunterMention: `<@${data.hunterId}>`,
    });
  }

  private resolveEmbedBody(
    tmpl: Awaited<ReturnType<NewbieMocoTemplateRepository['findByGuildId']>>,
    data: MocoRankData,
    config: NewbieConfig | null,
  ): string {
    const bodyTemplate = tmpl?.bodyTemplate ?? DEFAULT_MOCO_BODY_TEMPLATE;
    const itemTemplate = tmpl?.itemTemplate ?? DEFAULT_MOCO_ITEM_TEMPLATE;

    const mocoList =
      data.newbieEntries
        .sort((a, b) => b.minutes - a.minutes)
        .map((entry) =>
          applyTemplate(itemTemplate, {
            newbieName: entry.name,
            newbieMention: `<@${entry.id}>`,
            minutes: String(entry.minutes),
            sessions: String(entry.sessions),
          }),
        )
        .join('\n') || '없음';

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

    return resolvedBody;
  }

  private resolveEmbedFooter({
    tmpl,
    autoRefreshMinutes,
    data,
    config,
  }: {
    tmpl: Awaited<ReturnType<NewbieMocoTemplateRepository['findByGuildId']>>;
    autoRefreshMinutes: number | null;
    data: MocoRankData;
    config: NewbieConfig | null;
  }): string {
    const resolvedFooterTemplate =
      tmpl?.footerTemplate ??
      (autoRefreshMinutes === null
        ? DEFAULT_MOCO_FOOTER_TEMPLATE_NO_INTERVAL
        : DEFAULT_MOCO_FOOTER_TEMPLATE);

    const periodBounds = getMocoPeriodBounds(config ?? {});
    return applyTemplate(resolvedFooterTemplate, {
      currentPage: String(data.currentPage),
      totalPages: String(data.totalPages),
      interval: autoRefreshMinutes === null ? '' : String(autoRefreshMinutes),
      periodStart: periodBounds?.periodStart ?? '',
      periodEnd: periodBounds?.periodEnd ?? '',
    });
  }

  /**
   * Canvas 모드용 버튼을 구성한다.
   * 기존 buildButtons()와 동일한 구성이다.
   */
  buildCanvasButtons(
    guildId: string,
    currentPage: number,
    totalPages: number,
  ): ActionRowBuilder<ButtonBuilder> {
    return this.buildButtons(guildId, currentPage, totalPages);
  }

  /**
   * Canvas 모드: PNG 이미지 파일 첨부 메시지를 전송(최초) 또는 수정(이후)한다.
   */
  async sendOrUpdateCanvasRank(
    config: NewbieConfig,
    guildId: string,
    payload: { imageBuffer: Buffer; components: ActionRowBuilder<ButtonBuilder>[] },
  ): Promise<void> {
    if (!config.mocoRankChannelId) {
      this.logger.warn(`[MOCO] mocoRankChannelId not set: guild=${guildId}`);
      return;
    }

    const channelId = config.mocoRankChannelId;
    const files: RawFile[] = [{ name: 'moco-rank.png', data: payload.imageBuffer }];
    const restPayload = {
      content: '',
      embeds: [],
      components: payload.components.map((c) => c.toJSON()),
      attachments: [{ id: 0, filename: 'moco-rank.png' }],
    };

    if (config.mocoRankMessageId) {
      try {
        await this.discordRest.editMessageWithFiles(
          channelId,
          config.mocoRankMessageId,
          restPayload,
          files,
        );
        return;
      } catch {
        this.logger.warn(`[MOCO] Failed to edit canvas message, sending new`);
        await this.configRepo.updateMocoRankMessageId(guildId, null);
      }
    }

    try {
      const sent = await this.discordRest.sendMessageWithFiles(channelId, restPayload, files);
      await this.configRepo.updateMocoRankMessageId(guildId, sent.id);
    } catch (err) {
      this.logger.error(`[MOCO] Failed to send canvas rank: guild=${guildId}`, getErrorStack(err));
    }
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
