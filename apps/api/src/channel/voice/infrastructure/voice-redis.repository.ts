import { Injectable } from '@nestjs/common';

import { RedisService } from '../../../redis/redis.service';
import { VoiceKeys } from './voice-cache.keys';
import { VoiceSession } from './voice-session.keys';

/** 자동방 메타데이터 (voice:channel:auto 키에 저장) */
export interface AutoChannelInfo {
  configId: number;
  configName: string;
  channelType: 'auto_select' | 'auto_instant';
  buttonId: number | null;
  buttonLabel: string | null;
}

/** Redis TTL 상수 (초 단위) */
const TTL = {
  /** 음성 세션 TTL — 12시간 */
  SESSION: 60 * 60 * 12,
  /** 채널명·유저명 캐시 TTL — 7일 */
  NAME_CACHE: 60 * 60 * 24 * 7,
} as const;

@Injectable()
export class VoiceRedisRepository {
  constructor(private readonly redis: RedisService) {}

  /** 세션 기반으로 duration 누적 (Pipeline으로 1회 왕복) */
  async accumulateDuration(
    guild: string,
    user: string,
    session: VoiceSession,
    now: number = Date.now(),
  ) {
    if (!session.lastUpdatedAt) {
      session.lastUpdatedAt = now;
      return;
    }

    const elapsedSeconds = Math.floor((now - session.lastUpdatedAt) / 1000);
    if (elapsedSeconds <= 0) return;

    const date = session.date;
    session.lastUpdatedAt = now;

    await this.redis.pipeline((pipe) => {
      // 채널별 체류 시간
      if (session.channelId) {
        pipe.incrby(
          VoiceKeys.channelDuration(guild, user, date, session.channelId),
          elapsedSeconds,
        );
      }
      // 마이크 상태별 시간
      if (session.channelId) {
        pipe.incrby(
          VoiceKeys.micDuration(guild, user, date, session.mic ? 'on' : 'off'),
          elapsedSeconds,
        );
      }
      // 혼자 있었던 시간
      if (session.alone && session.channelId) {
        pipe.incrby(VoiceKeys.aloneDuration(guild, user, date), elapsedSeconds);
      }
      // 화면 공유 시간
      if (session.streaming && session.channelId) {
        pipe.incrby(VoiceKeys.streamingDuration(guild, user, date), elapsedSeconds);
      }
      // 카메라 ON 시간
      if (session.videoOn && session.channelId) {
        pipe.incrby(VoiceKeys.videoDuration(guild, user, date), elapsedSeconds);
      }
      // 스피커 음소거 시간
      if (session.selfDeaf && session.channelId) {
        pipe.incrby(VoiceKeys.deafDuration(guild, user, date), elapsedSeconds);
      }
      // 세션 저장 (TTL 12시간)
      pipe.set(VoiceKeys.session(guild, user), JSON.stringify(session), 'EX', TTL.SESSION);
    });
  }

  /** 세션 조회 */
  async getSession(guild: string, user: string): Promise<VoiceSession | null> {
    const key = VoiceKeys.session(guild, user);
    return this.redis.get<VoiceSession>(key);
  }

  /** 세션 저장 */
  async setSession(guild: string, user: string, session: VoiceSession) {
    const key = VoiceKeys.session(guild, user);
    await this.redis.set(key, session, TTL.SESSION);
  }
  async deleteSession(guild: string, user: string): Promise<void> {
    const key = VoiceKeys.session(guild, user);
    await this.redis.del(key);
  }

  /** 채널명 캐시 */
  async setChannelName(guild: string, channelId: string, channelName: string) {
    const key = VoiceKeys.channelName(guild, channelId);
    await this.redis.set(key, channelName, TTL.NAME_CACHE);
  }

  async getChannelName(guild: string, channelId: string): Promise<string | null> {
    const key = VoiceKeys.channelName(guild, channelId);
    return this.redis.get<string>(key);
  }

  /** 카테고리 정보 캐시 */
  async setCategoryInfo(
    guild: string,
    channelId: string,
    categoryId: string | null,
    categoryName: string | null,
  ): Promise<void> {
    const key = VoiceKeys.categoryInfo(guild, channelId);
    await this.redis.set(key, { categoryId, categoryName }, TTL.NAME_CACHE);
  }

  async getCategoryInfo(
    guild: string,
    channelId: string,
  ): Promise<{ categoryId: string | null; categoryName: string | null } | null> {
    const key = VoiceKeys.categoryInfo(guild, channelId);
    return this.redis.get<{ categoryId: string | null; categoryName: string | null }>(key);
  }

  /** 자동방 메타데이터 캐시 저장 (TTL 7일) */
  async setAutoChannelInfo(guild: string, channelId: string, info: AutoChannelInfo): Promise<void> {
    const key = VoiceKeys.autoChannelInfo(guild, channelId);
    await this.redis.set(key, info, TTL.NAME_CACHE);
  }

  /** 자동방 메타데이터 캐시 조회 */
  async getAutoChannelInfo(guild: string, channelId: string): Promise<AutoChannelInfo | null> {
    const key = VoiceKeys.autoChannelInfo(guild, channelId);
    return this.redis.get<AutoChannelInfo>(key);
  }

  /** 사용자명 캐시 */
  async setUserName(guild: string, userId: string, userName: string) {
    const key = VoiceKeys.userName(guild, userId);
    await this.redis.set(key, userName, TTL.NAME_CACHE);
  }

  async getUserName(guild: string, userId: string): Promise<string | null> {
    const key = VoiceKeys.userName(guild, userId);
    return this.redis.get<string>(key);
  }

  /** 유저명 일괄 조회 (MGET) */
  async getUserNames(guild: string, userIds: string[]): Promise<Map<string, string | null>> {
    if (userIds.length === 0) return new Map();
    const keys = userIds.map((id) => VoiceKeys.userName(guild, id));
    const values = await this.redis.mget<string>(...keys);
    const result = new Map<string, string | null>();
    userIds.forEach((id, i) => result.set(id, values[i]));
    return result;
  }

  /** 채널명 일괄 조회 (MGET) */
  async getChannelNames(guild: string, channelIds: string[]): Promise<Map<string, string | null>> {
    if (channelIds.length === 0) return new Map();
    const keys = channelIds.map((id) => VoiceKeys.channelName(guild, id));
    const values = await this.redis.mget<string>(...keys);
    const result = new Map<string, string | null>();
    channelIds.forEach((id, i) => result.set(id, values[i]));
    return result;
  }
}
