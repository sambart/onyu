import { Injectable, Logger } from '@nestjs/common';

import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import { ChannelService } from '../../channel.service';
import { VoiceStateDto } from '../infrastructure/voice-state.dto';
import { VoiceChannelHistoryService } from './voice-channel-history.service';
import { VoiceSessionService } from './voice-session.service';
import { VoiceTempChannelService } from './voice-temp-channel.service';

@Injectable()
export class VoiceChannelService {
  private readonly logger = new Logger(VoiceChannelService.name);

  constructor(
    private readonly sessionService: VoiceSessionService,
    private readonly tempChannelService: VoiceTempChannelService,
    private readonly historyService: VoiceChannelHistoryService,
    private readonly guildMemberService: GuildMemberService,
    private readonly channelService: ChannelService,
  ) {}

  async onUserJoined(cmd: VoiceStateDto) {
    const [guildMember, channel] = await Promise.all([
      this.guildMemberService.findByUserId(cmd.guildId, cmd.userId),
      this.channelService.findOrCreateChannel(
        cmd.channelId,
        cmd.channelName,
        cmd.guildId,
        cmd.parentCategoryId,
        cmd.categoryName,
      ),
    ]);

    if (!guildMember) {
      this.logger.warn(
        `[VOICE ENTER] GuildMember not found: guild=${cmd.guildId} user=${cmd.userId}`,
      );
      return;
    }

    await Promise.all([
      this.historyService.logJoin(guildMember, channel),
      this.sessionService.startOrUpdateSession(cmd),
      this.tempChannelService.handleJoin(cmd),
    ]);

    this.logger.log(`[VOICE ENTER] ${cmd.userId} ${cmd.channelName}`);
  }

  async onUserLeave(cmd: VoiceStateDto) {
    const [guildMember, channel] = await Promise.all([
      this.guildMemberService.findByUserId(cmd.guildId, cmd.userId),
      this.channelService.findOrCreateChannel(cmd.channelId, cmd.channelName, cmd.guildId),
    ]);

    if (!guildMember) {
      this.logger.warn(
        `[VOICE LEAVE] GuildMember not found: guild=${cmd.guildId} user=${cmd.userId}`,
      );
    } else {
      await this.historyService.logLeave(guildMember, channel);
    }

    await this.sessionService.closeSession(cmd);
    await this.tempChannelService.handleLeave(cmd);

    this.logger.log(`[VOICE LEAVE] ${cmd.userId} ${cmd.channelName}`);
  }

  async onUserMove(oldCmd: VoiceStateDto, newCmd: VoiceStateDto) {
    const [guildMember, oldChannel, newChannel] = await Promise.all([
      this.guildMemberService.findByUserId(newCmd.guildId, newCmd.userId),
      this.channelService.findOrCreateChannel(oldCmd.channelId, oldCmd.channelName, oldCmd.guildId),
      this.channelService.findOrCreateChannel(
        newCmd.channelId,
        newCmd.channelName,
        newCmd.guildId,
        newCmd.parentCategoryId,
        newCmd.categoryName,
      ),
    ]);

    if (!guildMember) {
      this.logger.warn(
        `[VOICE MOVE] GuildMember not found: guild=${newCmd.guildId} user=${newCmd.userId}`,
      );
    } else {
      await this.historyService.logLeave(guildMember, oldChannel);
      await this.historyService.logJoin(guildMember, newChannel);
    }

    await this.sessionService.switchChannel(oldCmd, newCmd);
  }

  async onUserMicToggle(cmd: VoiceStateDto) {
    await this.sessionService.startOrUpdateSession(cmd);
  }

  async onUserStreamingToggle(cmd: VoiceStateDto) {
    await this.sessionService.startOrUpdateSession(cmd);
  }

  async onUserVideoToggle(cmd: VoiceStateDto) {
    await this.sessionService.startOrUpdateSession(cmd);
  }

  async onUserDeafToggle(cmd: VoiceStateDto) {
    await this.sessionService.startOrUpdateSession(cmd);
  }
}
