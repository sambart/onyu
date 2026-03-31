import { Injectable, Logger } from '@nestjs/common';
import { getKSTDateString } from '@onyu/shared';

import { getErrorStack } from '../../../common/util/error.util';
import { VoiceGameDbRepository } from '../infrastructure/voice-game-db.repository';
import { VoiceGameRedisRepository } from '../infrastructure/voice-game-redis.repository';
import { type VoiceGameSession } from '../infrastructure/voice-game-session';

/** Bot에서 직렬화하여 전달하는 멤버별 게임 활동 DTO */
export interface MemberGameActivity {
  userId: string;
  gameName: string | null;
  applicationId: string | null;
}

@Injectable()
export class VoiceGameService {
  private readonly logger = new Logger(VoiceGameService.name);

  constructor(
    private readonly redisRepo: VoiceGameRedisRepository,
    private readonly dbRepo: VoiceGameDbRepository,
  ) {}

  /**
   * 음성 입장 시 게임 세션 시작 (F-VOICE-028).
   * Bot에서 추출한 게임 활동 정보를 받아 Redis에 세션 저장.
   */
  async onUserJoined(
    guildId: string,
    userId: string,
    channelId: string,
    activity: { gameName: string; applicationId: string | null },
  ): Promise<void> {
    try {
      const session: VoiceGameSession = {
        gameName: activity.gameName,
        applicationId: activity.applicationId,
        startedAt: Date.now(),
        channelId,
      };

      await this.redisRepo.setGameSession(guildId, userId, session);
    } catch (error) {
      this.logger.error(
        `[VOICE GAME] onUserJoined 오류 guild=${guildId} user=${userId}`,
        getErrorStack(error),
      );
    }
  }

  /**
   * CoPresence 틱에서 호출. Bot에서 전달된 멤버별 게임 상태로 세션을 갱신한다 (F-VOICE-029).
   */
  async reconcileForChannel(
    guildId: string,
    channelId: string,
    memberActivities: MemberGameActivity[],
  ): Promise<void> {
    for (const activity of memberActivities) {
      try {
        await this.reconcileMember(guildId, channelId, activity);
      } catch (error) {
        this.logger.error(
          `[VOICE GAME] reconcileForChannel 오류 guild=${guildId} channel=${channelId} user=${activity.userId}`,
          getErrorStack(error),
        );
      }
    }
  }

  /**
   * 음성 퇴장 시 게임 세션 종료 (F-VOICE-030).
   */
  async onUserLeft(guildId: string, userId: string): Promise<void> {
    try {
      const session = await this.redisRepo.getGameSession(guildId, userId);
      if (session) {
        await this.endSession(guildId, userId, session);
      }
    } catch (error) {
      this.logger.error(
        `[VOICE GAME] onUserLeft 오류 guild=${guildId} user=${userId}`,
        getErrorStack(error),
      );
    }
  }

  /**
   * 봇 종료 시 모든 게임 세션 일괄 종료.
   * Redis SCAN으로 voice:game:session:* 패턴의 모든 키를 순회하여 endSession 호출.
   */
  async endAllSessions(): Promise<void> {
    try {
      const keys = await this.redisRepo.scanAllSessionKeys();
      await Promise.all(keys.map((key) => this.endSessionByKey(key)));
    } catch (error) {
      this.logger.error('[VOICE GAME] endAllSessions 오류', getErrorStack(error));
    }
  }

  /**
   * Redis 키 하나에 해당하는 게임 세션을 종료한다.
   * endAllSessions의 각 키 처리를 위임받아 중첩 깊이를 줄인다.
   */
  private async endSessionByKey(key: string): Promise<void> {
    try {
      const parsed = this.parseSessionKey(key);
      if (!parsed) return;

      const session = await this.redisRepo.getGameSession(parsed.guildId, parsed.userId);
      if (session) {
        await this.endSession(parsed.guildId, parsed.userId, session);
      }
    } catch (error) {
      this.logger.error(
        `[VOICE GAME] endAllSessions 개별 키 처리 오류 key=${key}`,
        getErrorStack(error),
      );
    }
  }

  /**
   * 게임 세션 종료: DB에 activity INSERT + daily UPSERT 후 Redis 키 삭제 (F-VOICE-031).
   * durationMin < 1이면 DB 저장 없이 Redis 키만 삭제.
   */
  async endSession(guildId: string, userId: string, session: VoiceGameSession): Promise<void> {
    const now = Date.now();
    const durationMin = Math.floor((now - session.startedAt) / 60_000);

    if (durationMin >= 1) {
      const startedAt = new Date(session.startedAt);
      const endedAt = new Date(now);

      // KST 기준 날짜 YYYY-MM-DD
      const kstYYYYMMDD = getKSTDateString();
      const date = `${kstYYYYMMDD.slice(0, 4)}-${kstYYYYMMDD.slice(4, 6)}-${kstYYYYMMDD.slice(6, 8)}`;

      await this.dbRepo.saveActivity({
        guildId,
        userId,
        channelId: session.channelId,
        gameName: session.gameName,
        applicationId: session.applicationId,
        startedAt,
        endedAt,
        durationMin,
      });

      await this.dbRepo.upsertDaily(guildId, userId, session.gameName, date, durationMin);
    }

    await this.redisRepo.deleteGameSession(guildId, userId);
  }

  /**
   * 단일 멤버에 대해 게임 상태를 확인하고 세션을 갱신한다.
   */
  private async reconcileMember(
    guildId: string,
    channelId: string,
    memberActivity: MemberGameActivity,
  ): Promise<void> {
    const currentActivity = memberActivity.gameName
      ? { gameName: memberActivity.gameName, applicationId: memberActivity.applicationId }
      : null;
    const currentSession = await this.redisRepo.getGameSession(guildId, memberActivity.userId);

    const hasCurrentGame = currentActivity !== null;
    const hasActiveSession = currentSession !== null;

    if (!hasCurrentGame && !hasActiveSession) {
      return;
    }

    if (hasCurrentGame && !hasActiveSession) {
      const newSession: VoiceGameSession = {
        gameName: currentActivity.gameName,
        applicationId: currentActivity.applicationId,
        startedAt: Date.now(),
        channelId,
      };
      await this.redisRepo.setGameSession(guildId, memberActivity.userId, newSession);
      return;
    }

    if (!hasCurrentGame && hasActiveSession) {
      await this.endSession(guildId, memberActivity.userId, currentSession);
      return;
    }

    if (hasCurrentGame && hasActiveSession) {
      const isSameGame = this.isSameGame(currentActivity, currentSession);

      if (isSameGame) {
        return;
      }

      await this.endSession(guildId, memberActivity.userId, currentSession);

      const newSession: VoiceGameSession = {
        gameName: currentActivity.gameName,
        applicationId: currentActivity.applicationId,
        startedAt: Date.now(),
        channelId,
      };
      await this.redisRepo.setGameSession(guildId, memberActivity.userId, newSession);
    }
  }

  /**
   * 게임 동일성 판정.
   * applicationId가 둘 다 존재하면 applicationId 비교, 하나라도 null이면 gameName 비교.
   */
  private isSameGame(
    current: { gameName: string; applicationId: string | null },
    session: VoiceGameSession,
  ): boolean {
    if (current.applicationId !== null && session.applicationId !== null) {
      return current.applicationId === session.applicationId;
    }
    return current.gameName === session.gameName;
  }

  /**
   * Redis 키에서 guildId, userId를 파싱한다.
   * 키 형식: voice:game:session:{guildId}:{userId}
   */
  private parseSessionKey(key: string): { guildId: string; userId: string } | null {
    // VoiceGameKeys.gameSession 패턴: voice:game:session:{guildId}:{userId}
    const prefix = 'voice:game:session:';
    if (!key.startsWith(prefix)) return null;

    const remainder = key.slice(prefix.length);
    const colonIndex = remainder.indexOf(':');
    if (colonIndex === -1) return null;

    const guildId = remainder.slice(0, colonIndex);
    const userId = remainder.slice(colonIndex + 1);

    if (!guildId || !userId) return null;

    return { guildId, userId };
  }
}
