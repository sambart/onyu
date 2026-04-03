import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type APIChannel,
  type APIEmoji,
  type APIGuild,
  type APIGuildMember,
  type APIMessage,
  type APIRole,
  type APIUser,
  ChannelType,
  type RawFile,
  REST,
  type RESTGetAPIGuildMembersQuery,
  type RESTPatchAPIChannelMessageJSONBody,
  type RESTPatchAPIGuildMemberJSONBody,
  type RESTPostAPIChannelMessageJSONBody,
  type RESTPostAPIGuildChannelJSONBody,
  Routes,
} from 'discord.js';

/** Discord API 초기화 재시도 기본 딜레이 (ms) */
const RETRY_BASE_DELAY_MS = 3_000;

/**
 * Gateway 연결 없이 Discord REST API만 사용하는 서비스.
 * API 앱에서 @InjectDiscordClient()를 대체한다.
 */
@Injectable()
export class DiscordRestService implements OnModuleInit {
  private readonly logger = new Logger(DiscordRestService.name);
  private rest!: REST;
  private botUserId!: string;
  private applicationId!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const token = this.config.get<string>('DISCORD_API_TOKEN');
    if (!token) {
      throw new Error('DISCORD_API_TOKEN is not configured');
    }

    this.rest = new REST({ version: '10' }).setToken(token);

    // 봇 유저 정보 조회 (최대 3회 재시도)
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const me = (await this.rest.get(Routes.user())) as APIUser;
        this.botUserId = me.id;
        this.applicationId = me.id;
        this.logger.log(`DiscordRestService initialized (botUserId=${this.botUserId})`);
        return;
      } catch (error) {
        this.logger.warn(
          `Discord API 연결 실패 (${attempt}/${maxRetries})`,
          error instanceof Error ? error.message : error,
        );
        if (attempt === maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
      }
    }
  }

  getBotUserId(): string {
    return this.botUserId;
  }

  // ── Guild 조회 ──

  async fetchGuild(guildId: string): Promise<APIGuild | null> {
    try {
      return (await this.rest.get(Routes.guild(guildId))) as APIGuild;
    } catch (error) {
      this.logger.warn(`fetchGuild failed: guild=${guildId}`, this.extractMessage(error));
      return null;
    }
  }

  async fetchGuildChannels(guildId: string): Promise<APIChannel[]> {
    try {
      return (await this.rest.get(Routes.guildChannels(guildId))) as APIChannel[];
    } catch (error) {
      this.logger.warn(`fetchGuildChannels failed: guild=${guildId}`, this.extractMessage(error));
      return [];
    }
  }

  async fetchGuildRoles(guildId: string): Promise<APIRole[]> {
    try {
      return (await this.rest.get(Routes.guildRoles(guildId))) as APIRole[];
    } catch (error) {
      this.logger.warn(`fetchGuildRoles failed: guild=${guildId}`, this.extractMessage(error));
      return [];
    }
  }

  async fetchGuildEmojis(guildId: string): Promise<APIEmoji[]> {
    try {
      return (await this.rest.get(Routes.guildEmojis(guildId))) as APIEmoji[];
    } catch (error) {
      this.logger.warn(`fetchGuildEmojis failed: guild=${guildId}`, this.extractMessage(error));
      return [];
    }
  }

  async fetchGuildMember(guildId: string, userId: string): Promise<APIGuildMember | null> {
    try {
      return (await this.rest.get(Routes.guildMember(guildId, userId))) as APIGuildMember;
    } catch (error) {
      this.logger.warn(
        `fetchGuildMember failed: guild=${guildId} user=${userId}`,
        this.extractMessage(error),
      );
      return null;
    }
  }

  async fetchGuildMembers(
    guildId: string,
    options?: RESTGetAPIGuildMembersQuery,
  ): Promise<APIGuildMember[]> {
    try {
      return (await this.rest.get(Routes.guildMembers(guildId), {
        query: options as URLSearchParams | undefined,
      })) as APIGuildMember[];
    } catch (error) {
      this.logger.warn(`fetchGuildMembers failed: guild=${guildId}`, this.extractMessage(error));
      return [];
    }
  }

  /**
   * 길드 전체 멤버를 페이지네이션으로 가져온다.
   * REST API는 최대 1000명씩 조회 가능.
   */
  async fetchAllGuildMembers(guildId: string): Promise<APIGuildMember[]> {
    const allMembers: APIGuildMember[] = [];
    let after = '0';
    const limit = 1000;

    while (true) {
      try {
        const batch = (await this.rest.get(Routes.guildMembers(guildId), {
          query: new URLSearchParams({ limit: String(limit), after }),
        })) as APIGuildMember[];

        allMembers.push(...batch);

        if (batch.length < limit) break;
        // user 필드에서 마지막 유저 ID를 가져온다
        const lastMember = batch[batch.length - 1];
        if (!lastMember.user) break;
        after = lastMember.user.id;
      } catch (error) {
        this.logger.warn(
          `fetchAllGuildMembers failed mid-page: guild=${guildId}`,
          this.extractMessage(error),
        );
        break;
      }
    }

    return allMembers;
  }

  // ── Channel 조회/생성/삭제 ──

  async fetchChannel(channelId: string): Promise<APIChannel | null> {
    try {
      return (await this.rest.get(Routes.channel(channelId))) as APIChannel;
    } catch (error) {
      this.logger.warn(`fetchChannel failed: channel=${channelId}`, this.extractMessage(error));
      return null;
    }
  }

  async createGuildChannel(
    guildId: string,
    options: RESTPostAPIGuildChannelJSONBody,
  ): Promise<APIChannel> {
    return (await this.rest.post(Routes.guildChannels(guildId), {
      body: options,
    })) as APIChannel;
  }

  async deleteChannel(channelId: string): Promise<void> {
    try {
      await this.rest.delete(Routes.channel(channelId));
    } catch (error) {
      this.logger.debug(`deleteChannel ignored: channel=${channelId}`, this.extractMessage(error));
    }
  }

  // ── Message 조회/전송/수정/삭제 ──

  async sendMessage(
    channelId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
  ): Promise<APIMessage> {
    return (await this.rest.post(Routes.channelMessages(channelId), {
      body: payload,
    })) as APIMessage;
  }

  async editMessage(
    channelId: string,
    messageId: string,
    payload: RESTPatchAPIChannelMessageJSONBody,
  ): Promise<APIMessage> {
    return (await this.rest.patch(Routes.channelMessage(channelId, messageId), {
      body: payload,
    })) as APIMessage;
  }

  /**
   * 파일 첨부와 함께 메시지를 전송한다.
   * Canvas 이미지 등 바이너리 데이터를 Discord 채널에 전송할 때 사용한다.
   */
  async sendMessageWithFiles(
    channelId: string,
    payload: RESTPostAPIChannelMessageJSONBody,
    files: RawFile[],
  ): Promise<APIMessage> {
    return (await this.rest.post(Routes.channelMessages(channelId), {
      body: payload,
      files,
    })) as APIMessage;
  }

  /**
   * 파일 첨부와 함께 기존 메시지를 수정한다.
   * Canvas 이미지 갱신 시 사용한다.
   */
  // eslint-disable-next-line max-params
  async editMessageWithFiles(
    channelId: string,
    messageId: string,
    payload: RESTPatchAPIChannelMessageJSONBody,
    files: RawFile[],
  ): Promise<APIMessage> {
    return (await this.rest.patch(Routes.channelMessage(channelId, messageId), {
      body: payload,
      files,
    })) as APIMessage;
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    try {
      await this.rest.delete(Routes.channelMessage(channelId, messageId));
    } catch (error) {
      this.logger.debug(
        `deleteMessage ignored: channel=${channelId} message=${messageId}`,
        this.extractMessage(error),
      );
    }
  }

  async fetchMessages(channelId: string, options?: { limit?: number }): Promise<APIMessage[]> {
    try {
      const query = new URLSearchParams();
      if (options?.limit) query.set('limit', String(options.limit));

      return (await this.rest.get(Routes.channelMessages(channelId), {
        query,
      })) as APIMessage[];
    } catch (error) {
      this.logger.warn(`fetchMessages failed: channel=${channelId}`, this.extractMessage(error));
      return [];
    }
  }

  // ── Member 역할/닉네임/강퇴/DM/이동 ──

  async addMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    await this.rest.put(Routes.guildMemberRole(guildId, userId, roleId));
  }

  async removeMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    await this.rest.delete(Routes.guildMemberRole(guildId, userId, roleId));
  }

  async setMemberNickname(guildId: string, userId: string, nickname: string): Promise<void> {
    await this.rest.patch(Routes.guildMember(guildId, userId), {
      body: { nick: nickname } satisfies RESTPatchAPIGuildMemberJSONBody,
    });
  }

  async kickMember(guildId: string, userId: string, reason?: string): Promise<void> {
    await this.rest.delete(Routes.guildMember(guildId, userId), {
      reason,
    });
  }

  async sendDM(userId: string, content: string): Promise<APIMessage | null> {
    try {
      // DM 채널 생성
      const dmChannel = (await this.rest.post(Routes.userChannels(), {
        body: { recipient_id: userId },
      })) as APIChannel;

      if (!('id' in dmChannel)) return null;

      return (await this.rest.post(Routes.channelMessages(dmChannel.id), {
        body: { content },
      })) as APIMessage;
    } catch (error) {
      this.logger.warn(`sendDM failed: user=${userId}`, this.extractMessage(error));
      return null;
    }
  }

  async sendDMEmbed(userId: string, payload: RESTPostAPIChannelMessageJSONBody): Promise<boolean> {
    try {
      const dmChannel = (await this.rest.post(Routes.userChannels(), {
        body: { recipient_id: userId },
      })) as APIChannel;

      if (!('id' in dmChannel)) return false;

      await this.rest.post(Routes.channelMessages(dmChannel.id), {
        body: payload,
      });
      return true;
    } catch (error) {
      this.logger.warn(`sendDMEmbed failed: user=${userId}`, this.extractMessage(error));
      return false;
    }
  }

  async moveMemberVoiceChannel(
    guildId: string,
    userId: string,
    channelId: string | null,
  ): Promise<void> {
    await this.rest.patch(Routes.guildMember(guildId, userId), {
      body: { channel_id: channelId } satisfies RESTPatchAPIGuildMemberJSONBody,
    });
  }

  // ── Application commands ──

  async fetchApplicationCommands(guildId?: string): Promise<unknown[]> {
    try {
      if (guildId) {
        return (await this.rest.get(
          Routes.applicationGuildCommands(this.applicationId, guildId),
        )) as unknown[];
      }
      return (await this.rest.get(Routes.applicationCommands(this.applicationId))) as unknown[];
    } catch (error) {
      this.logger.warn(
        `fetchApplicationCommands failed: guild=${guildId ?? 'global'}`,
        this.extractMessage(error),
      );
      return [];
    }
  }

  // ── User 조회 ──

  async fetchUser(userId: string): Promise<APIUser | null> {
    try {
      return (await this.rest.get(Routes.user(userId))) as APIUser;
    } catch (error) {
      this.logger.warn(`fetchUser failed: user=${userId}`, this.extractMessage(error));
      return null;
    }
  }

  // ── 유틸리티 ──

  /**
   * 멤버의 displayName을 반환한다.
   * nick > global_name > username 순서.
   */
  getMemberDisplayName(member: APIGuildMember): string {
    return member.nick ?? member.user?.global_name ?? member.user?.username ?? 'Unknown';
  }

  /**
   * 채널이 텍스트 기반인지 확인한다.
   */
  isTextBasedChannel(channel: APIChannel): boolean {
    if (!('type' in channel)) return false;
    return [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
      ChannelType.DM,
    ].includes(channel.type);
  }

  /**
   * 채널이 음성 기반인지 확인한다.
   */
  isVoiceBasedChannel(channel: APIChannel): boolean {
    if (!('type' in channel)) return false;
    return [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type);
  }

  private extractMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
