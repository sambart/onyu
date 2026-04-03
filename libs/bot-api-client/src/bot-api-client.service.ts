import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  AutoChannelButtonClickDto,
  AutoChannelButtonResult,
  AutoChannelSubOptionDto,
  BotApiResponse,
  CoPresenceSnapshot,
  GuildMemberBulkUpsertDto,
  GuildMemberDeactivateDto,
  GuildMemberUpsertDto,
  GuildMemberUserUpdateDto,
  GuildVoiceUserCount,
  KickMemberDto,
  LlmSummaryResponse,
  MemberDisplayNameResponse,
  MemberJoinDto,
  MeProfileResponse,
  MessageCreatedDto,
  MissionRefreshDto,
  MocoMyResponse,
  MocoRankResponse,
  MusicChannelConfigResponse,
  NewbieConfigDto,
  RoleAssignedDto,
  RoleModifyDto,
  SelfDiagnosisResponse,
  ServerDiagnosisResponse,
  StatusPrefixApplyDto,
  StatusPrefixApplyResult,
  StatusPrefixResetDto,
  StatusPrefixResetResult,
  StickyMessageConfigItem,
  VoiceStateUpdateDto,
  VoiceSyncDto,
} from './types';

/**
 * Bot → API HTTP 클라이언트.
 * API_BASE_URL과 BOT_API_KEY를 환경 변수에서 읽어 자동으로 인증 헤더를 추가한다.
 */
@Injectable()
export class BotApiClientService {
  private readonly logger = new Logger(BotApiClientService.name);

  constructor(private readonly http: HttpService) {}

  // ── Voice ──

  async sendVoiceStateUpdate(dto: VoiceStateUpdateDto): Promise<void> {
    await this.post('/bot-api/voice/state-update', dto);
  }

  async voiceFlush(): Promise<{ flushed: number; skipped: number }> {
    return this.post('/bot-api/voice/flush', {});
  }

  async pushVoiceSync(dto: VoiceSyncDto): Promise<void> {
    await this.post('/bot-api/voice/sync', dto);
  }

  // ── Newbie ──

  async sendMemberJoin(dto: MemberJoinDto): Promise<void> {
    await this.post('/bot-api/newbie/member-join', dto);
  }

  async refreshMissionEmbed(dto: MissionRefreshDto): Promise<void> {
    await this.post('/bot-api/newbie/mission-refresh', dto);
  }

  async getMocoRankData(guildId: string, page: number): Promise<MocoRankResponse> {
    return this.get(`/bot-api/newbie/moco-rank?guildId=${guildId}&page=${page}`);
  }

  async getMyHuntingData(guildId: string, userId: string): Promise<MocoMyResponse> {
    return this.get(`/bot-api/newbie/moco-my?guildId=${guildId}&userId=${userId}`);
  }

  async getNewbieConfig(guildId: string): Promise<NewbieConfigDto | null> {
    try {
      const response = await this.get<BotApiResponse<NewbieConfigDto>>(
        `/bot-api/newbie/config?guildId=${guildId}`,
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async notifyRoleAssigned(dto: RoleAssignedDto): Promise<void> {
    await this.post('/bot-api/newbie/role-assigned', dto);
  }

  // ── Status Prefix ──

  async applyStatusPrefix(dto: StatusPrefixApplyDto): Promise<StatusPrefixApplyResult> {
    return this.post('/bot-api/status-prefix/apply', dto);
  }

  async resetStatusPrefix(dto: StatusPrefixResetDto): Promise<StatusPrefixResetResult> {
    return this.post('/bot-api/status-prefix/reset', dto);
  }

  // ── Auto Channel ──

  async autoChannelButtonClick(dto: AutoChannelButtonClickDto): Promise<AutoChannelButtonResult> {
    return this.post('/bot-api/auto-channel/button-click', dto);
  }

  async autoChannelSubOption(dto: AutoChannelSubOptionDto): Promise<AutoChannelButtonResult> {
    return this.post('/bot-api/auto-channel/sub-option', dto);
  }

  // ── Sticky Message ──

  async sendMessageCreated(dto: MessageCreatedDto): Promise<void> {
    await this.post('/bot-api/sticky-message/message-created', dto);
  }

  async getStickyMessageConfigs(
    guildId: string,
  ): Promise<BotApiResponse<StickyMessageConfigItem[]>> {
    return this.get(`/bot-api/sticky-message/configs?guildId=${guildId}`);
  }

  async deleteStickyMessageByChannel(
    guildId: string,
    channelId: string,
  ): Promise<{ ok: boolean; deletedCount: number }> {
    return this.delete(
      `/bot-api/sticky-message/by-channel?guildId=${guildId}&channelId=${channelId}`,
    );
  }

  // ── Voice Analytics ──

  async runSelfDiagnosis(guildId: string, userId: string): Promise<SelfDiagnosisResponse> {
    return this.post(
      `/bot-api/voice-analytics/self-diagnosis?guildId=${guildId}&userId=${userId}`,
      {},
    );
  }

  async getSelfDiagnosisLlmSummary(guildId: string, userId: string): Promise<LlmSummaryResponse> {
    return this.post(
      `/bot-api/voice-analytics/self-diagnosis/llm-summary?guildId=${guildId}&userId=${userId}`,
      {},
      { timeout: 60_000 },
    );
  }

  async getServerDiagnosis(guildId: string, days: number): Promise<ServerDiagnosisResponse> {
    return this.post(
      `/bot-api/voice-analytics/server-diagnosis?guildId=${guildId}&days=${days}`,
      {},
    );
  }

  // ── Voice User Count ──

  async pushVoiceUserCounts(counts: GuildVoiceUserCount[]): Promise<void> {
    await this.post('/bot-api/voice/user-count', { counts });
  }

  // ── Co-Presence ──

  async pushCoPresenceSnapshots(snapshots: CoPresenceSnapshot[]): Promise<void> {
    await this.post('/bot-api/co-presence/snapshots', { snapshots });
  }

  async pushCoPresenceFlush(): Promise<void> {
    await this.post('/bot-api/co-presence/flush', {});
  }

  // ── Me ──

  async getMeProfile(
    guildId: string,
    userId: string,
    displayName: string,
    avatarUrl: string,
  ): Promise<MeProfileResponse> {
    const params = new URLSearchParams({ guildId, userId, displayName, avatarUrl });
    return this.post(`/bot-api/me/profile?${params.toString()}`, {});
  }

  // ── Guild ──

  async getMemberDisplayName(
    guildId: string,
    memberId: string,
  ): Promise<MemberDisplayNameResponse> {
    return this.get(`/bot-api/guilds/${guildId}/members/${memberId}/display-name`);
  }

  async addRole(dto: RoleModifyDto): Promise<BotApiResponse> {
    return this.post(`/bot-api/guilds/${dto.guildId}/members/${dto.memberId}/roles/add`, {
      roleId: dto.roleId,
    });
  }

  async removeRole(dto: RoleModifyDto): Promise<BotApiResponse> {
    return this.post(`/bot-api/guilds/${dto.guildId}/members/${dto.memberId}/roles/remove`, {
      roleId: dto.roleId,
    });
  }

  async kickMember(dto: KickMemberDto): Promise<BotApiResponse> {
    return this.post(`/bot-api/guilds/${dto.guildId}/members/${dto.memberId}/kick`, {
      reason: dto.reason,
    });
  }

  // ── Music ──

  async getMusicChannelConfig(guildId: string): Promise<MusicChannelConfigResponse | null> {
    try {
      const response = await this.get<{ ok: boolean; data: MusicChannelConfigResponse | null }>(
        `/bot-api/music/channel-config?guildId=${guildId}`,
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async getMusicChannelConfigByChannel(
    channelId: string,
  ): Promise<MusicChannelConfigResponse | null> {
    try {
      const response = await this.get<{ ok: boolean; data: MusicChannelConfigResponse | null }>(
        `/bot-api/music/channel-config/by-channel?channelId=${channelId}`,
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async updateMusicChannelMessageId(guildId: string, messageId: string | null): Promise<void> {
    await this.post('/bot-api/music/channel-config/update-message-id', { guildId, messageId });
  }

  // ── Guild Member ──

  async upsertGuildMember(dto: GuildMemberUpsertDto): Promise<void> {
    await this.post('/bot-api/guild-member/upsert', dto);
  }

  async bulkUpsertGuildMembers(dto: GuildMemberBulkUpsertDto): Promise<void> {
    await this.post('/bot-api/guild-member/sync', dto);
  }

  async deactivateGuildMember(dto: GuildMemberDeactivateDto): Promise<void> {
    await this.post('/bot-api/guild-member/deactivate', dto);
  }

  async updateGuildMemberByUserUpdate(dto: GuildMemberUserUpdateDto): Promise<void> {
    await this.post('/bot-api/guild-member/update-global-profile', dto);
  }

  // ── Health ──

  /** API 서버 연결 확인. 실패 시 예외를 throw한다. */
  async healthCheck(): Promise<void> {
    await firstValueFrom(this.http.get('/bot-api/health'));
  }

  // ── Internal ──

  private async post<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.post<T>(path, body, config));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] POST ${path} failed`, err);
      throw err;
    }
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.get<T>(path));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] GET ${path} failed`, err);
      throw err;
    }
  }

  private async delete<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.delete<T>(path));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] DELETE ${path} failed`, err);
      throw err;
    }
  }
}
