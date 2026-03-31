import { Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';

import { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';

/** 환영 메시지에 필요한 멤버 데이터 */
export interface WelcomeMemberData {
  id: string;
  displayName: string;
  guildId: string;
  memberCount: number;
  serverName: string;
}

@Injectable()
export class WelcomeService {
  private readonly logger = new Logger(WelcomeService.name);

  constructor(private readonly discordRest: DiscordRestService) {}

  async sendWelcomeMessage(memberData: WelcomeMemberData, config: NewbieConfig): Promise<void> {
    if (!config.welcomeChannelId) {
      this.logger.debug(`[WELCOME] welcomeChannelId not set: guild=${memberData.guildId}`);
      return;
    }

    const vars: Record<string, string> = {
      username: memberData.displayName,
      mention: `<@${memberData.id}>`,
      memberCount: String(memberData.memberCount),
      serverName: memberData.serverName,
    };

    const embed = new EmbedBuilder();

    if (config.welcomeEmbedTitle) {
      embed.setTitle(this.applyTemplate(config.welcomeEmbedTitle, vars));
    }
    if (config.welcomeEmbedDescription) {
      embed.setDescription(this.applyTemplate(config.welcomeEmbedDescription, vars));
    }
    if (config.welcomeEmbedColor) {
      embed.setColor(config.welcomeEmbedColor as `#${string}`);
    }
    if (config.welcomeEmbedThumbnailUrl) {
      embed.setThumbnail(config.welcomeEmbedThumbnailUrl);
    }

    const content = config.welcomeContent
      ? this.applyTemplate(config.welcomeContent, vars)
      : undefined;

    try {
      await this.discordRest.sendMessage(config.welcomeChannelId, {
        content,
        embeds: [embed.toJSON()],
      });

      this.logger.log(
        `[WELCOME] Sent welcome message: guild=${memberData.guildId} member=${memberData.id} channel=${config.welcomeChannelId}`,
      );
    } catch (error) {
      this.logger.error(
        `[WELCOME] Failed to send welcome message: guild=${memberData.guildId} member=${memberData.id} channel=${config.welcomeChannelId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * 템플릿 변수 전역 치환.
   * {변수명} 패턴을 vars 객체의 값으로 치환한다.
   * 동일 변수가 여러 번 등장해도 모두 치환된다.
   */
  private applyTemplate(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      template,
    );
  }
}
