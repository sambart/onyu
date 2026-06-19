import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { getErrorStack } from '../../../common/util/error.util';
import {
  CO_PRESENCE_SESSION_ENDED,
  CoPresenceSessionEndedEvent,
  CoPresenceTickSnapshot,
} from './co-presence.events';
import {
  CoPresenceDbRepository,
  type SaveSessionDto,
  type UpsertPairDailyRow,
} from './co-presence-db.repository';
import {
  CoPresenceSnapshotRepository,
  type RestorableSession,
} from './infrastructure/co-presence-snapshot.repository';

/** 주기적 세션 회전 임계값 (분). 이 값 이상 누적되면 세션을 종료 후 재시작하여 DB에 중간 데이터를 저장한다. */
const FLUSH_THRESHOLD_MINUTES = 15;

/** 활성 세션 타입 — RestorableSession 과 동일 shape 으로 통합 (직렬화 책임을 snapshot repo 로 응집). */
type ActiveCoPresenceSession = RestorableSession;

@Injectable()
export class CoPresenceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CoPresenceService.name);

  /** key: `${guildId}:${userId}` */
  private readonly activeSessions = new Map<string, ActiveCoPresenceSession>();

  constructor(
    private readonly dbRepo: CoPresenceDbRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly snapshotRepo: CoPresenceSnapshotRepository,
  ) {}

  /**
   * 부팅 시 Redis 스냅샷을 읽어 activeSessions 를 복원한다.
   * 스냅샷 없음/손상/stale → 빈 상태로 graceful 시작.
   */
  async onApplicationBootstrap(): Promise<void> {
    const restored = await this.snapshotRepo.load();
    for (const [key, session] of restored) {
      this.activeSessions.set(key, session);
    }
    if (restored.size > 0) {
      this.logger.log(`[CO-PRESENCE] 스냅샷 복원: ${restored.size} 세션`);
    }
  }

  /**
   * 스냅샷을 기반으로 세션을 시작/계속/종료한다.
   * Scheduler가 매 tick마다 호출한다.
   *
   * @param snapshots - 현재 음성 채널 스냅샷 (2명 이상 채널만)
   * @param processedGuildIds - 이번 tick에서 처리된 모든 길드 ID (스냅샷 유무 무관)
   */
  async reconcile(
    snapshots: CoPresenceTickSnapshot[],
    processedGuildIds: string[] = [],
  ): Promise<void> {
    // 스냅샷에서 현재 활성 사용자를 guildId:userId → snapshot info로 매핑
    const currentUsers = new Map<string, { channelId: string; peerIds: string[] }>();

    for (const snapshot of snapshots) {
      for (const userId of snapshot.userIds) {
        const key = `${snapshot.guildId}:${userId}`;
        const peerIds = snapshot.userIds.filter((id) => id !== userId);
        currentUsers.set(key, { channelId: snapshot.channelId, peerIds });
      }
    }

    // 현재 활성 사용자 처리: 시작 또는 계속
    for (const [key, { channelId, peerIds }] of currentUsers) {
      const existing = this.activeSessions.get(key);

      if (existing) {
        if (existing.channelId === channelId) {
          this.continueSession(existing, peerIds);
        } else {
          // 다른 채널로 이동 → 기존 종료 후 새로 시작
          await this.endSession(existing);
          this.activeSessions.delete(key);
          this.startSession(key, channelId, peerIds);
        }
      } else {
        this.startSession(key, channelId, peerIds);
      }
    }

    // 종료 대상 세션 수집 (DB 쓰기는 배치로 후처리)
    const sessionsToEnd: ActiveCoPresenceSession[] = [];
    const allProcessedGuildIds = new Set(processedGuildIds);

    // 처리된 길드 중 스냅샷에서 사라진 사용자
    for (const [key, session] of this.activeSessions) {
      if (allProcessedGuildIds.has(session.guildId) && !currentUsers.has(key)) {
        sessionsToEnd.push(session);
        this.activeSessions.delete(key);
      }
    }

    // 주기적 세션 회전: 임계값 이상 누적된 활성 세션
    for (const [key, session] of this.activeSessions) {
      if (session.accumulatedMinutes < FLUSH_THRESHOLD_MINUTES) continue;
      const current = currentUsers.get(key);
      if (!current) continue;
      sessionsToEnd.push(session);
      this.startSession(key, current.channelId, current.peerIds);
    }

    // 길드별 배치 DB 저장
    if (sessionsToEnd.length > 0) {
      const byGuild = new Map<string, ActiveCoPresenceSession[]>();
      for (const session of sessionsToEnd) {
        const list = byGuild.get(session.guildId) ?? [];
        list.push(session);
        byGuild.set(session.guildId, list);
      }
      for (const [, guildSessions] of byGuild) {
        await this.endSessionsBatch(guildSessions);
      }
    }

    // 인메모리 상태를 Redis 에 스냅샷 저장 (best-effort — 실패해도 reconcile 정상 완료)
    await this.snapshotRepo.save(this.activeSessions).catch((err) => {
      this.logger.warn('[CO-PRESENCE] 스냅샷 저장 실패 — 무시(best-effort)', getErrorStack(err));
    });
  }

  /**
   * 특정 길드의 모든 활성 세션을 강제 종료한다.
   */
  async endAllGuildSessions(guildId: string): Promise<void> {
    const sessions: ActiveCoPresenceSession[] = [];

    for (const [key, session] of this.activeSessions) {
      if (session.guildId === guildId) {
        sessions.push(session);
        this.activeSessions.delete(key);
      }
    }

    if (sessions.length > 0) {
      await this.endSessionsBatch(sessions);
    }

    // 길드 세션 flush 후 스냅샷 갱신 — 다음 tick 전 크래시 시 이중 집계 방지
    await this.snapshotRepo.save(this.activeSessions).catch((err) => {
      this.logger.warn('[CO-PRESENCE] 스냅샷 저장 실패 — 무시(best-effort)', getErrorStack(err));
    });
  }

  /**
   * 모든 활성 세션을 강제 종료한다. (봇 종료 시)
   */
  async endAllSessions(): Promise<void> {
    const sessions = [...this.activeSessions.values()];
    this.activeSessions.clear();

    // 정상 종료: 모든 세션을 DB 로 flush 했으므로 스냅샷은 무효 → 삭제하여 재시작 시 중복 복원 방지.
    // NOTE: sessions.length === 0 early return 보다 위에 위치해야 한다 —
    // 빈 종료(이미 모두 flush 된 상태) 에서도 이전 스냅샷을 반드시 삭제해야 함.
    await this.snapshotRepo.clear();

    if (sessions.length === 0) return;

    // 길드별로 배치 처리
    const byGuild = new Map<string, ActiveCoPresenceSession[]>();
    for (const session of sessions) {
      const list = byGuild.get(session.guildId) ?? [];
      list.push(session);
      byGuild.set(session.guildId, list);
    }
    for (const [, guildSessions] of byGuild) {
      await this.endSessionsBatch(guildSessions);
    }
  }

  private startSession(key: string, channelId: string, peerIds: string[]): void {
    const [guildId, userId] = key.split(':');

    const session: ActiveCoPresenceSession = {
      guildId,
      channelId,
      userId,
      startedAt: new Date(),
      accumulatedMinutes: 1,
      peersSeen: new Set(peerIds),
      peerMinutes: new Map(peerIds.map((id) => [id, 1])),
    };

    this.activeSessions.set(key, session);
    this.logger.debug(
      `[CO-PRESENCE] Session started: guild=${guildId} user=${userId} channel=${channelId} peers=${peerIds.length}`,
    );
  }

  private continueSession(session: ActiveCoPresenceSession, peerIds: string[]): void {
    session.accumulatedMinutes += 1;

    for (const peerId of peerIds) {
      session.peersSeen.add(peerId);
      session.peerMinutes.set(peerId, (session.peerMinutes.get(peerId) ?? 0) + 1);
    }
  }

  private async endSessionsBatch(sessions: ActiveCoPresenceSession[]): Promise<void> {
    const sessionInserts: SaveSessionDto[] = [];
    // 같은 배치 안의 동일 키 row가 ON CONFLICT DO UPDATE를 두 번 트리거해 PG 에러를
    // 일으키므로, SQL로 보내기 전에 키별로 합산한다.
    const dailyMap = new Map<
      string,
      { guildId: string; userId: string; date: string; minutes: number; sessionCount: number }
    >();
    const pairMap = new Map<string, UpsertPairDailyRow>();
    const events: CoPresenceSessionEndedEvent[] = [];

    for (const session of sessions) {
      const endedAt = new Date();
      const date = this.toDateString(endedAt);
      const peerIds = [...session.peersSeen];
      const peerMinutesRecord: Record<string, number> = {};
      for (const [peerId, minutes] of session.peerMinutes) {
        peerMinutesRecord[peerId] = minutes;
      }

      sessionInserts.push({
        guildId: session.guildId,
        userId: session.userId,
        channelId: session.channelId,
        startedAt: session.startedAt,
        endedAt,
        durationMin: session.accumulatedMinutes,
        peerIds,
        peerMinutes: peerMinutesRecord,
      });

      const dailyKey = `${session.guildId}:${session.userId}:${date}`;
      const existingDaily = dailyMap.get(dailyKey);
      if (existingDaily) {
        existingDaily.minutes += session.accumulatedMinutes;
        existingDaily.sessionCount += 1;
      } else {
        dailyMap.set(dailyKey, {
          guildId: session.guildId,
          userId: session.userId,
          date,
          minutes: session.accumulatedMinutes,
          sessionCount: 1,
        });
      }

      for (const [peerId, minutes] of session.peerMinutes) {
        const [smallId, bigId] =
          session.userId < peerId ? [session.userId, peerId] : [peerId, session.userId];
        const pairKey = `${session.guildId}:${smallId}:${bigId}:${date}`;
        const existingPair = pairMap.get(pairKey);
        if (existingPair) {
          existingPair.minutes += minutes;
          existingPair.sessionCount += 1;
        } else {
          pairMap.set(pairKey, {
            guildId: session.guildId,
            userId: smallId,
            peerId: bigId,
            date,
            minutes,
            sessionCount: 1,
          });
        }
      }

      events.push({
        guildId: session.guildId,
        channelId: session.channelId,
        userId: session.userId,
        startedAt: session.startedAt,
        endedAt,
        durationMin: session.accumulatedMinutes,
        peerIds,
        peerMinutes: peerMinutesRecord,
      });
    }

    try {
      await Promise.all([
        this.dbRepo.saveSessionBatch(sessionInserts),
        this.dbRepo.upsertDailyBatch([...dailyMap.values()]),
        this.dbRepo.upsertPairDailyBatch([...pairMap.values()]),
      ]);

      for (const event of events) {
        await this.eventEmitter.emitAsync(CO_PRESENCE_SESSION_ENDED, event);
      }
    } catch (err) {
      this.logger.error('[CO-PRESENCE] Batch endSessions failed', getErrorStack(err));
    }
  }

  private async endSession(session: ActiveCoPresenceSession): Promise<void> {
    const { guildId, channelId, userId, startedAt, accumulatedMinutes, peersSeen, peerMinutes } =
      session;
    const endedAt = new Date();
    const peerIds = [...peersSeen];
    const peerMinutesRecord: Record<string, number> = {};
    for (const [peerId, minutes] of peerMinutes) {
      peerMinutesRecord[peerId] = minutes;
    }

    const date = this.toDateString(endedAt);

    this.logger.debug(
      `[CO-PRESENCE] Session ending: guild=${guildId} user=${userId} duration=${accumulatedMinutes}min peers=${peerIds.length}`,
    );

    try {
      // DB 저장: 세션
      await this.dbRepo.saveSession({
        guildId,
        userId,
        channelId,
        startedAt,
        endedAt,
        durationMin: accumulatedMinutes,
        peerIds,
        peerMinutes: peerMinutesRecord,
      });

      // DB 저장: 일별 집계
      await this.dbRepo.upsertDaily(guildId, userId, date, accumulatedMinutes, 1);

      // DB 저장: 쌍 일별 집계 (단방향 — userId < peerId)
      const pairRows: UpsertPairDailyRow[] = [];
      for (const [peerId, minutes] of peerMinutes) {
        const [smallId, bigId] = userId < peerId ? [userId, peerId] : [peerId, userId];
        pairRows.push({ guildId, userId: smallId, peerId: bigId, date, minutes, sessionCount: 1 });
      }
      await this.dbRepo.upsertPairDailyBatch(pairRows);

      // 이벤트 발행: emitAsync로 모든 핸들러 완료 대기
      const event: CoPresenceSessionEndedEvent = {
        guildId,
        channelId,
        userId,
        startedAt,
        endedAt,
        durationMin: accumulatedMinutes,
        peerIds,
        peerMinutes: peerMinutesRecord,
      };
      await this.eventEmitter.emitAsync(CO_PRESENCE_SESSION_ENDED, event);
    } catch (err) {
      this.logger.error(
        `[CO-PRESENCE] Failed to end session guild=${guildId} user=${userId}`,
        getErrorStack(err),
      );
    }
  }

  /**
   * 현재 시각을 KST 날짜 문자열(YYYY-MM-DD)로 변환한다.
   * date 타입 컬럼에 맞게 ISO 형식 사용.
   */
  private toDateString(date: Date = new Date()): string {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }
}
