import { Injectable, Logger } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { getErrorStack } from '../../../common/util/error.util';
import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieMissionOrmEntity as NewbieMission } from '../../infrastructure/newbie-mission.orm-entity';
import { NewbieMissionTemplateRepository } from '../../infrastructure/newbie-mission-template.repository';
import {
  DEFAULT_MISSION_FOOTER_TEMPLATE,
  DEFAULT_MISSION_HEADER_TEMPLATE,
  DEFAULT_MISSION_ITEM_TEMPLATE,
  DEFAULT_MISSION_TITLE_TEMPLATE,
  DEFAULT_STATUS_MAPPING,
} from '../../infrastructure/newbie-template.constants';
import { applyTemplate } from '../util/newbie-template.util';

/** memberId 앞 6자리를 이용한 fallback 표시 이름 접두사 */
const DISPLAY_NAME_FALLBACK_PREFIX = 'User-';
/** fallback용 userId 접두사 길이 */
const DISPLAY_NAME_FALLBACK_ID_LENGTH = 6;

/** Discord Embed/Button UI 렌더링 전담. 순수 비즈니스 로직은 MissionService에 위치. */
@Injectable()
export class MissionDiscordPresenter {
  private readonly logger = new Logger(MissionDiscordPresenter.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly missionTmplRepo: NewbieMissionTemplateRepository,
    private readonly discordRest: DiscordRestService,
    private readonly guildMemberService: GuildMemberService,
  ) {}

  /**
   * 미션 현황 Embed를 알림 채널에 전송하거나 기존 메시지를 수정한다.
   * @param missions Embed에 표시할 미션 목록 (이미 필터링된 상태)
   * @param statusCounts 상태별 카운트 맵
   * @param missionItems 미션별 렌더링에 필요한 데이터 (playtime, playCount 등)
   */
  async refreshMissionEmbed(
    guildId: string,
    config: NewbieConfig,
    missions: NewbieMission[],
    statusCounts: Record<string, number>,
    missionItems: MissionEmbedItem[],
  ): Promise<void> {
    if (!config.missionEnabled || !config.missionNotifyChannelId) return;

    const embed = await this.buildMissionEmbed(
      guildId,
      missions,
      config,
      statusCounts,
      missionItems,
    );
    const row = this.buildRefreshButton(guildId);

    const channelId = config.missionNotifyChannelId;
    const restPayload = {
      embeds: [embed.toJSON()],
      components: [row.toJSON()],
    };

    if (config.missionNotifyMessageId) {
      try {
        await this.discordRest.editMessage(channelId, config.missionNotifyMessageId, restPayload);
        return;
      } catch {
        // 수정 실패 시 신규 전송
      }
    }

    try {
      const sent = await this.discordRest.sendMessage(channelId, restPayload);
      await this.configRepo.updateMissionNotifyMessageId(guildId, sent.id);
    } catch (err) {
      this.logger.warn(
        `[MISSION] Failed to send mission embed: guild=${guildId}`,
        getErrorStack(err),
      );
    }
  }

  /**
   * 기존 미션 Embed 메시지를 삭제한다.
   */
  async deleteEmbed(channelId: string, messageId: string): Promise<void> {
    try {
      await this.discordRest.deleteMessage(channelId, messageId);
    } catch (err) {
      this.logger.warn(
        `[MISSION] Failed to delete old embed: channel=${channelId} message=${messageId}`,
        getErrorStack(err),
      );
    }
  }

  /**
   * DB에서 멤버 표시 이름 조회.
   * 미조회 시 `User-{memberId 앞 6자리}` 반환.
   */
  async fetchMemberDisplayName(guildId: string, memberId: string): Promise<string> {
    const member = await this.guildMemberService.findByUserId(guildId, memberId);
    return (
      member?.displayName ??
      `${DISPLAY_NAME_FALLBACK_PREFIX}${memberId.slice(0, DISPLAY_NAME_FALLBACK_ID_LENGTH)}`
    );
  }

  /**
   * 서버 닉네임을 DB에서 조회한다.
   * isActive=false(탈퇴)이거나 미조회 시 null을 반환한다.
   */
  async fetchMemberNickname(guildId: string, memberId: string): Promise<string | null> {
    const member = await this.guildMemberService.findByUserId(guildId, memberId);
    if (!member || member.isActive === false) return null;
    return member.displayName;
  }

  /**
   * PRD F-NEWBIE-002-TMPL 명세에 따라 미션 현황 EmbedBuilder 생성.
   */
  private async buildMissionEmbed(
    guildId: string,
    missions: NewbieMission[],
    config: NewbieConfig,
    statusCounts: Record<string, number>,
    missionItems: MissionEmbedItem[],
  ): Promise<EmbedBuilder> {
    const tmpl = await this.missionTmplRepo.findByGuildId(guildId);
    const titleTemplate = tmpl?.titleTemplate ?? DEFAULT_MISSION_TITLE_TEMPLATE;
    const headerTemplate = tmpl?.headerTemplate ?? DEFAULT_MISSION_HEADER_TEMPLATE;
    const itemTemplate = tmpl?.itemTemplate ?? DEFAULT_MISSION_ITEM_TEMPLATE;
    const footerTemplate = tmpl?.footerTemplate ?? DEFAULT_MISSION_FOOTER_TEMPLATE;
    const statusMapping = tmpl?.statusMapping ?? DEFAULT_STATUS_MAPPING;

    const totalCount = missions.length;
    const inProgressCount = statusCounts.IN_PROGRESS ?? 0;
    const completedCount = statusCounts.COMPLETED ?? 0;
    const failedCount = statusCounts.FAILED ?? 0;
    const leftCount = statusCounts.LEFT ?? 0;

    const resolvedHeader = applyTemplate(headerTemplate, {
      totalCount: String(totalCount),
      inProgressCount: String(inProgressCount),
      completedCount: String(completedCount),
      failedCount: String(failedCount),
      leftCount: String(leftCount),
    });

    const resolvedTitle = applyTemplate(titleTemplate, {
      totalCount: String(totalCount),
    });

    const itemLines: string[] = [];
    for (const item of missionItems) {
      const statusEntry = statusMapping[item.status];
      const statusEmoji = statusEntry.emoji;
      const statusText = statusEntry.text;

      const playtimeHour = Math.floor(item.playtimeSec / 3600);
      const playtimeMin = Math.floor((item.playtimeSec % 3600) / 60);
      const playtimeSecs = item.playtimeSec % 60;
      const playtime = `${playtimeHour}시간 ${playtimeMin}분 ${playtimeSecs}초`;

      const renderedItem = applyTemplate(itemTemplate, {
        username: item.username,
        mention: item.mention,
        startDate: item.startDate,
        endDate: item.endDate,
        statusEmoji,
        statusText,
        playtimeHour: String(playtimeHour),
        playtimeMin: String(playtimeMin),
        playtimeSec: String(playtimeSecs),
        playtime,
        playCount: String(item.playCount),
        targetPlaytime: item.targetPlaytime,
        targetPlayCount: item.targetPlayCount !== null ? String(item.targetPlayCount) : '',
        daysLeft: String(item.daysLeft),
      });

      itemLines.push(renderedItem);
    }

    const MAX_DESCRIPTION_LENGTH = 4096;
    let description: string;
    if (missions.length > 0) {
      const parts: string[] = [resolvedHeader];
      for (const line of itemLines) {
        const candidate = parts.join('\n\n') + '\n\n' + line;
        if (candidate.length > MAX_DESCRIPTION_LENGTH) {
          parts.push('...외 추가 멤버 생략');
          break;
        }
        parts.push(line);
      }
      description = parts.join('\n\n');
    } else {
      description = resolvedHeader;
    }

    const updatedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const resolvedFooter = applyTemplate(footerTemplate, { updatedAt });

    const embed = new EmbedBuilder()
      .setTitle(resolvedTitle)
      .setDescription(description)
      .setColor(this.resolveEmbedColor(config.missionEmbedColor))
      .setFooter({ text: resolvedFooter });

    if (config.missionEmbedThumbnailUrl) {
      embed.setThumbnail(config.missionEmbedThumbnailUrl);
    }

    return embed;
  }

  private buildRefreshButton(guildId: string): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
      .setCustomId(`newbie_mission:refresh:${guildId}`)
      .setLabel('갱신')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private resolveEmbedColor(color: string | null | undefined): number {
    const DEFAULT_COLOR = 0x57f287;
    if (!color) return DEFAULT_COLOR;
    const hex = color.startsWith('#') ? color : `#${color}`;
    const parsed = parseInt(hex.slice(1), 16);
    if (isNaN(parsed) || hex.slice(1).length !== 6) return DEFAULT_COLOR;
    return parsed;
  }
}

/** Embed 렌더링에 필요한 미션별 데이터 */
export interface MissionEmbedItem {
  username: string;
  mention: string;
  status: string;
  startDate: string;
  endDate: string;
  playtimeSec: number;
  playCount: number;
  targetPlaytime: string;
  targetPlayCount: number | null;
  daysLeft: number;
}
