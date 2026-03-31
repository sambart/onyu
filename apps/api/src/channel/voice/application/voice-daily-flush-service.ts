import { Injectable, Logger } from '@nestjs/common';
import { getKSTDateString } from '@onyu/shared';

import { getErrorStack } from '../../../common/util/error.util';
import { RedisService } from '../../../redis/redis.service';
import { VoiceDailyRepository } from '../infrastructure/voice-daily.repository';
import { VoiceRedisRepository } from '../infrastructure/voice-redis.repository';

@Injectable()
export class VoiceDailyFlushService {
  private readonly logger = new Logger(VoiceDailyFlushService.name);
  private flushing = false;

  constructor(
    private readonly redis: RedisService,
    private readonly voiceDailyRepository: VoiceDailyRepository,
    private readonly voiceRedisRepository: VoiceRedisRepository,
  ) {}

  async flushTodayAll() {
    const today = getKSTDateString();

    // voice:session:{guildId}:{userId} 패턴으로 활성 세션 탐색
    const sessionKeys = await this.redis.scanKeys('voice:session:*');

    for (const key of sessionKeys) {
      const parts = key.split(':');
      const guild = parts[2];
      const user = parts[3];
      try {
        await this.flushDate(guild, user, today);
      } catch (error) {
        this.logger.error(`flushTodayAll failed for key=${key}`, getErrorStack(error));
      }
    }
  }

  async flushDate(guild: string, user: string, date: string) {
    // 1. 채널별 체류 시간
    const userName = (await this.voiceRedisRepository.getUserName(guild, user)) ?? 'UNKNOWN';
    const channelKeys = await this.redis.scanKeys(
      `voice:duration:channel:${guild}:${user}:${date}:*`,
    );
    for (const key of channelKeys) {
      const duration = Number((await this.redis.get(key)) || 0);
      if (duration <= 0) continue;
      const channelId = key.split(':').at(-1) ?? '';
      if (!channelId) continue;
      const channelName =
        (await this.voiceRedisRepository.getChannelName(guild, channelId)) ?? 'UNKNOWN';
      const categoryInfo = await this.voiceRedisRepository.getCategoryInfo(guild, channelId);
      const autoChannelInfo = await this.voiceRedisRepository.getAutoChannelInfo(guild, channelId);

      await this.voiceDailyRepository.accumulateChannelDuration({
        guildId: guild,
        userId: user,
        userName,
        date,
        channelId,
        channelName,
        durationSec: duration,
        categoryId: categoryInfo?.categoryId ?? null,
        categoryName: categoryInfo?.categoryName ?? null,
        channelType: autoChannelInfo?.channelType ?? 'permanent',
        autoChannelConfigId: autoChannelInfo?.configId ?? null,
        autoChannelConfigName: autoChannelInfo?.configName ?? null,
      });

      await this.redis.del(key);
    }

    // 2. 마이크 ON / OFF 누적
    for (const state of ['on', 'off'] as const) {
      const key = `voice:duration:mic:${guild}:${user}:${date}:${state}`;
      const duration = Number((await this.redis.get(key)) || 0);
      if (duration <= 0) continue;

      await this.voiceDailyRepository.accumulateMicDuration(
        guild,
        user,
        date,
        state === 'on' ? duration : 0,
        state === 'off' ? duration : 0,
      );

      await this.redis.del(key);
    }

    // 3. 혼자 있었던 시간
    const aloneKey = `voice:duration:alone:${guild}:${user}:${date}`;
    const aloneSec = Number((await this.redis.get(aloneKey)) || 0);

    if (aloneSec > 0) {
      await this.voiceDailyRepository.accumulateAloneDuration(guild, user, date, aloneSec);
      await this.redis.del(aloneKey);
    }

    // 4. 화면 공유 시간
    const streamingKey = `voice:duration:streaming:${guild}:${user}:${date}`;
    const streamingSec = Number((await this.redis.get(streamingKey)) || 0);

    if (streamingSec > 0) {
      await this.voiceDailyRepository.accumulateStreamingDuration(guild, user, date, streamingSec);
      await this.redis.del(streamingKey);
    }

    // 5. 카메라 ON 시간
    const videoKey = `voice:duration:video:${guild}:${user}:${date}`;
    const videoOnSec = Number((await this.redis.get(videoKey)) || 0);

    if (videoOnSec > 0) {
      await this.voiceDailyRepository.accumulateVideoDuration(guild, user, date, videoOnSec);
      await this.redis.del(videoKey);
    }

    // 6. 스피커 음소거 시간
    const deafKey = `voice:duration:deaf:${guild}:${user}:${date}`;
    const deafSec = Number((await this.redis.get(deafKey)) || 0);

    if (deafSec > 0) {
      await this.voiceDailyRepository.accumulateDeafDuration(guild, user, date, deafSec);
      await this.redis.del(deafKey);
    }
  }

  /** 단일 세션 flush — 성공 시 true, 스킵 시 false */
  private async flushOneSession(key: string, now: number): Promise<boolean> {
    const parts = key.split(':');
    const guildId = parts[2];
    const userId = parts[3];

    const session = await this.voiceRedisRepository.getSession(guildId, userId);
    if (!session) return false;

    // 1. 현재 시점까지 미누적 구간 누적
    await this.voiceRedisRepository.accumulateDuration(guildId, userId, session, now);

    // 2. DB flush
    await this.flushDate(guildId, userId, session.date);

    // 3. 세션 lastUpdatedAt 갱신 (이중 카운팅 방지, 세션 유지)
    session.lastUpdatedAt = now;
    await this.voiceRedisRepository.setSession(guildId, userId, session);
    return true;
  }

  /** 활성 세션의 미누적 구간을 포함하여 안전하게 전체 flush */
  async safeFlushAll(): Promise<{ flushed: number; skipped: number }> {
    if (this.flushing) throw new Error('이미 집계가 진행 중입니다.');
    this.flushing = true;

    try {
      const sessionKeys = await this.redis.scanKeys('voice:session:*');
      const now = Date.now();
      let flushed = 0;
      let skipped = 0;

      for (const key of sessionKeys) {
        try {
          const isFlushed = await this.flushOneSession(key, now);
          flushed += isFlushed ? 1 : 0;
          skipped += isFlushed ? 0 : 1;
        } catch (error) {
          skipped++;
          this.logger.error(`Failed to flush session: ${key}`, getErrorStack(error));
        }
      }

      return { flushed, skipped };
    } finally {
      this.flushing = false;
    }
  }
}
