import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../../../../redis/redis.service';

/** 스냅샷 Redis 키 (단일). */
const SNAPSHOT_KEY = 'co-presence:snapshot';

/**
 * 부팅 시 이 나이(ms)를 초과한 스냅샷은 stale 로 간주하고 폐기한다.
 * FLUSH_THRESHOLD_MINUTES(15분)의 누적 의미가 깨지지 않는 선에서 보수적으로 설정.
 * 30분 = FLUSH_THRESHOLD 2배. 장기 다운 후 오집계 방지.
 */
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000;

/** JSON 안전 형태로 직렬화된 단일 세션.
 * WARNING: ActiveCoPresenceSession 에 필드 추가 시 serialize/deserialize 도 동기화할 것.
 */
interface SerializedSession {
  guildId: string;
  channelId: string;
  userId: string;
  startedAtEpoch: number; // Date → epoch ms
  accumulatedMinutes: number;
  peersSeen: string[]; // Set<string> → array
  peerMinutes: [string, number][]; // Map<string,number> → entries
}

/** Redis 에 저장되는 스냅샷 봉투. */
interface SnapshotEnvelope {
  version: 1;
  savedAt: number; // epoch ms — stale 검증용
  sessions: [string, SerializedSession][]; // Map<key, session> entries
}

/** 서비스 ↔ 리포지토리 간 도메인 형태 (CoPresenceService 의 ActiveCoPresenceSession 과 동일 shape). */
export interface RestorableSession {
  guildId: string;
  channelId: string;
  userId: string;
  startedAt: Date;
  accumulatedMinutes: number;
  peersSeen: Set<string>;
  peerMinutes: Map<string, number>;
}

@Injectable()
export class CoPresenceSnapshotRepository {
  private readonly logger = new Logger(CoPresenceSnapshotRepository.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * 활성 세션 Map 전체를 Redis 스냅샷으로 저장 (best-effort, fail-soft).
   * RedisService.set 은 내부적으로 safe() 래퍼가 감싸므로 throw 하지 않는다.
   */
  async save(sessions: Map<string, RestorableSession>): Promise<void> {
    const envelope: SnapshotEnvelope = {
      version: 1,
      savedAt: Date.now(),
      sessions: [...sessions].map(([key, s]) => [key, this.serialize(s)]),
    };
    await this.redis.set(SNAPSHOT_KEY, envelope); // 무 TTL — savedAt 으로 stale 검증
  }

  /**
   * Redis 스냅샷을 읽어 복원 가능한 Map 반환.
   * 키 없음 / 손상 / stale → 빈 Map (graceful, 크래시 없음).
   */
  async load(): Promise<Map<string, RestorableSession>> {
    const empty = new Map<string, RestorableSession>();
    const envelope = await this.redis.get<SnapshotEnvelope>(SNAPSHOT_KEY);

    if (!envelope) return empty;

    if (envelope.version !== 1 || !Array.isArray(envelope.sessions)) {
      this.logger.warn('[CO-PRESENCE] 스냅샷 손상/미지원 버전 — 빈 상태로 시작');
      return empty;
    }

    if (Date.now() - envelope.savedAt > SNAPSHOT_MAX_AGE_MS) {
      this.logger.warn('[CO-PRESENCE] 스냅샷 stale(30분 초과) — 폐기 후 빈 상태로 시작');
      return empty;
    }

    try {
      const restored = new Map<string, RestorableSession>();
      for (const [key, s] of envelope.sessions) {
        try {
          restored.set(key, this.deserialize(s));
        } catch {
          // 손상된 개별 세션 1개가 전체 복원을 중단시키지 않도록 skip
          this.logger.warn(`[CO-PRESENCE] 세션 역직렬화 실패 (key=${key}) — 해당 세션 skip`);
        }
      }
      return restored;
    } catch {
      this.logger.warn('[CO-PRESENCE] 스냅샷 역직렬화 실패 — 빈 상태로 시작');
      return empty;
    }
  }

  /**
   * 스냅샷 삭제 (정상 종료 flush 후 중복 복원 방지).
   * RedisService.del 은 safe() 래퍼로 감싸이므로 장애 시 no-op.
   */
  async clear(): Promise<void> {
    await this.redis.del(SNAPSHOT_KEY);
  }

  private serialize(s: RestorableSession): SerializedSession {
    return {
      guildId: s.guildId,
      channelId: s.channelId,
      userId: s.userId,
      startedAtEpoch: s.startedAt.getTime(),
      accumulatedMinutes: s.accumulatedMinutes,
      peersSeen: [...s.peersSeen],
      peerMinutes: [...s.peerMinutes],
    };
  }

  private deserialize(s: SerializedSession): RestorableSession {
    if (
      typeof s.guildId !== 'string' ||
      typeof s.channelId !== 'string' ||
      typeof s.userId !== 'string' ||
      typeof s.startedAtEpoch !== 'number' ||
      typeof s.accumulatedMinutes !== 'number' ||
      !Array.isArray(s.peersSeen) ||
      !Array.isArray(s.peerMinutes)
    ) {
      throw new Error(`세션 필드 손상: guildId=${String(s.guildId)} userId=${String(s.userId)}`);
    }

    return {
      guildId: s.guildId,
      channelId: s.channelId,
      userId: s.userId,
      startedAt: new Date(s.startedAtEpoch),
      accumulatedMinutes: s.accumulatedMinutes,
      peersSeen: new Set(s.peersSeen),
      peerMinutes: new Map(s.peerMinutes),
    };
  }
}
