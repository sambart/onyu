import { Injectable, Logger } from '@nestjs/common';
import { getKSTDateString } from '@onyu/shared';

import { RedisService } from '../../../redis/redis.service';
import { VoiceRedisRepository } from '../infrastructure/voice-redis.repository';
import { VoiceStateDto } from '../infrastructure/voice-state.dto';
import { VoiceDailyFlushService } from './voice-daily-flush-service';

@Injectable()
export class VoiceSessionService {
  private readonly logger = new Logger(VoiceSessionService.name);

  constructor(
    private readonly voiceRedisRepository: VoiceRedisRepository,
    private readonly voiceDailyFlushService: VoiceDailyFlushService,
    private readonly redis: RedisService,
  ) {}

  async startOrUpdateSession(cmd: VoiceStateDto): Promise<void> {
    const { guildId, userId } = cmd;
    const now = Date.now();
    const today = getKSTDateString();

    await this.voiceRedisRepository.setChannelName(guildId, cmd.channelId, cmd.channelName);
    await this.voiceRedisRepository.setCategoryInfo(
      guildId,
      cmd.channelId,
      cmd.parentCategoryId,
      cmd.categoryName,
    );
    await this.voiceRedisRepository.setUserName(guildId, cmd.userId, cmd.userName);

    let session = await this.voiceRedisRepository.getSession(guildId, userId);

    if (!session) {
      await this.voiceRedisRepository.setSession(guildId, userId, {
        channelId: cmd.channelId,
        joinedAt: now,
        lastUpdatedAt: now,
        mic: cmd.micOn,
        alone: cmd.alone,
        date: today,
        streaming: cmd.streaming,
        videoOn: cmd.videoOn,
        selfDeaf: cmd.selfDeaf,
      });
      return;
    }

    // 날짜 변경
    if (session.date !== today) {
      await this.voiceRedisRepository.accumulateDuration(guildId, userId, session, now);
      await this.voiceDailyFlushService.flushDate(guildId, userId, session.date);

      session = {
        ...session,
        joinedAt: now,
        lastUpdatedAt: now,
        date: today,
      };
    }

    // UPDATE (mic / alone / move)
    await this.voiceRedisRepository.accumulateDuration(guildId, userId, session, now);

    session.channelId = cmd.channelId ?? session.channelId;
    session.mic = cmd.micOn;
    session.alone = cmd.alone;
    session.streaming = cmd.streaming;
    session.videoOn = cmd.videoOn;
    session.selfDeaf = cmd.selfDeaf;
    session.lastUpdatedAt = now;

    await this.voiceRedisRepository.setSession(guildId, userId, session);
  }

  async switchChannel(oldCmd: VoiceStateDto, newCmd: VoiceStateDto): Promise<void> {
    const { guildId, userId } = newCmd;
    const now = Date.now();

    await this.voiceRedisRepository.setChannelName(guildId, newCmd.channelId, newCmd.channelName);
    await this.voiceRedisRepository.setCategoryInfo(
      guildId,
      newCmd.channelId,
      newCmd.parentCategoryId,
      newCmd.categoryName,
    );
    await this.voiceRedisRepository.setUserName(guildId, newCmd.userId, newCmd.userName);

    const session = await this.voiceRedisRepository.getSession(guildId, userId);
    if (!session) {
      await this.voiceRedisRepository.setSession(guildId, userId, {
        channelId: newCmd.channelId,
        joinedAt: now,
        lastUpdatedAt: now,
        mic: newCmd.micOn,
        alone: newCmd.alone,
        date: getKSTDateString(),
        streaming: newCmd.streaming,
        videoOn: newCmd.videoOn,
        selfDeaf: newCmd.selfDeaf,
      });
      return;
    }

    // 1. 이전 채널 정보 고정
    const prevSession = {
      ...session,
      channelId: oldCmd.channelId,
      channelName: oldCmd.channelName,
    };

    // 2. 이전 채널 체류 시간 마감
    await this.voiceRedisRepository.accumulateDuration(guildId, userId, prevSession, now);

    // 3. 새 채널 세션 시작
    const newSession = {
      ...session,
      channelId: newCmd.channelId,
      channelName: newCmd.channelName,
      userName: newCmd.userName,
      joinedAt: now,
      lastUpdatedAt: now,
      mic: newCmd.micOn,
      alone: newCmd.alone,
      streaming: newCmd.streaming,
      videoOn: newCmd.videoOn,
      selfDeaf: newCmd.selfDeaf,
    };

    await this.voiceRedisRepository.setSession(guildId, userId, newSession);

    this.logger.log(`[VOICE MOVE] ${userId} ${oldCmd.channelName} → ${newCmd.channelName}`);
  }

  async closeSession(cmd: VoiceStateDto): Promise<void> {
    const { guildId, userId } = cmd;
    const now = Date.now();

    const session = await this.voiceRedisRepository.getSession(guildId, userId);
    if (!session) return;

    // 1. 마지막 상태 기준 누적
    await this.voiceRedisRepository.accumulateDuration(guildId, userId, session, now);

    // 2. 세션 살아 있을 때 flush (이름 확보)
    await this.voiceDailyFlushService.flushDate(guildId, userId, session.date);

    // 3. 세션 완전 종료
    await this.voiceRedisRepository.deleteSession(guildId, userId);

    this.logger.log(`[VOICE LEAVE] ${userId} ${cmd.channelName}`);
  }

  /**
   * 채널 내 남은 유저들의 alone 상태를 갱신한다.
   * leave/join/move 이벤트 발생 후 호출하여 정확도를 높인다.
   */
  async updateAloneForChannel(
    guildId: string,
    channelMemberIds: string[],
    isAlone: boolean,
  ): Promise<void> {
    const now = Date.now();

    for (const memberId of channelMemberIds) {
      const session = await this.voiceRedisRepository.getSession(guildId, memberId);
      if (!session) continue;
      if (session.alone === isAlone) continue;

      // 기존 상태 기준으로 누적 마감 후 alone 전환
      await this.voiceRedisRepository.accumulateDuration(guildId, memberId, session, now);
      session.alone = isAlone;
      session.lastUpdatedAt = now;
      await this.voiceRedisRepository.setSession(guildId, memberId, session);
    }
  }
}
