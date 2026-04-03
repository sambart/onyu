import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type NewbieConfigDto } from '@onyu/bot-api-client';
import { Client, EmbedBuilder, type GuildMember } from 'discord.js';

/**
 * Discord guildMemberAdd 이벤트를 수신하여 신입 온보딩을 처리한다.
 * - 환영인사: Bot에서 직접 Discord 메시지 전송 (GuildMember 필요)
 * - 미션 생성: API에 위임
 * - 역할 부여: Bot에서 직접 Discord API 호출 후 API에 통보
 */
@Injectable()
export class BotNewbieMemberAddHandler {
  private readonly logger = new Logger(BotNewbieMemberAddHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    @InjectDiscordClient() private readonly discord: Client,
  ) {}

  @On('guildMemberAdd')
  async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;

    // guild-member upsert (newbie 설정과 무관하게 항상 실행)
    try {
      await this.apiClient.upsertGuildMember({
        guildId,
        userId: member.id,
        displayName: member.displayName,
        username: member.user.username,
        nick: member.nickname,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        isBot: member.user.bot,
        joinedAt: member.joinedAt?.toISOString() ?? null,
      });
    } catch (err) {
      this.logger.error(
        `[BOT] guild-member upsert failed: guild=${guildId} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
    }

    try {
      // 1. API에서 설정 조회
      const config = await this.apiClient.getNewbieConfig(guildId);
      if (!config) return;

      // 2. 환영인사 (Bot에서 직접 Discord 메시지 전송)
      if (config.welcomeEnabled && config.welcomeChannelId) {
        await this.sendWelcomeMessage(member, config);
      }

      // 3. 미션 생성 (API 호출)
      if (config.missionEnabled) {
        await this.apiClient.sendMemberJoin({
          guildId,
          memberId: member.id,
          displayName: member.displayName,
        });
      }

      // 4. 역할 부여 (Bot에서 직접 Discord API 호출)
      if (config.roleEnabled && config.newbieRoleId) {
        await this.assignRole(member, config.newbieRoleId, guildId);
      }
    } catch (err) {
      this.logger.error(
        `[BOT] guildMemberAdd failed: guild=${guildId} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private async sendWelcomeMessage(member: GuildMember, config: NewbieConfigDto): Promise<void> {
    if (!config.welcomeChannelId) return;
    try {
      const channel = await this.discord.channels.fetch(config.welcomeChannelId).catch(() => null);
      if (!channel?.isTextBased()) return;

      const vars: Record<string, string> = {
        username: member.displayName,
        mention: `<@${member.id}>`,
        memberCount: String(member.guild.memberCount),
        serverName: member.guild.name,
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
      } else {
        embed.setThumbnail(member.displayAvatarURL({ size: 128 }));
      }

      const content = config.welcomeContent
        ? this.applyTemplate(config.welcomeContent, vars)
        : undefined;

      await channel.send({ content, embeds: [embed.toJSON()] });
    } catch (err) {
      this.logger.error(
        `[BOT] Welcome message failed: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private applyTemplate(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      template,
    );
  }

  private async assignRole(member: GuildMember, roleId: string, guildId: string): Promise<void> {
    try {
      await member.roles.add(roleId);
      this.logger.log(`[BOT] Role assigned: guild=${guildId} member=${member.id} role=${roleId}`);

      // API에 역할 부여 사실 통보 (NewbiePeriod 레코드 생성)
      await this.apiClient.notifyRoleAssigned({ guildId, memberId: member.id });
    } catch (err) {
      this.logger.error(
        `[BOT] Role assign failed: guild=${guildId} member=${member.id} role=${roleId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
