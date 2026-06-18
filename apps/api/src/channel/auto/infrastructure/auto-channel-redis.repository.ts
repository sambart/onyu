import { Injectable } from '@nestjs/common';

import { RedisService } from '../../../redis/redis.service';
import { AutoChannelKeys } from './auto-channel.keys';
import { AutoChannelConfirmedState } from './auto-channel-state';

/** Redis TTL 상수 (초 단위) */
const TTL = {
  /**
   * 확정방 상태 TTL — 7일.
   * Why: sweep이 5분 주기로 TTL을 갱신(heartbeat)하므로 점유 기간과 무관하게 만료되지 않는다.
   * 서버 장애 등으로 sweep이 7일 이상 멈추는 경우에만 만료된다 (안전 마진).
   */
  CONFIRMED: 60 * 60 * 24 * 7,
} as const;

@Injectable()
export class AutoChannelRedisRepository {
  constructor(private readonly redis: RedisService) {}

  // --- 확정방 ---

  /** 확정방 상태 저장 */
  async setConfirmedState(channelId: string, state: AutoChannelConfirmedState): Promise<void> {
    await this.redis.set(AutoChannelKeys.confirmed(channelId), state, TTL.CONFIRMED);
  }

  /** 확정방 상태 조회 */
  async getConfirmedState(channelId: string): Promise<AutoChannelConfirmedState | null> {
    return this.redis.get<AutoChannelConfirmedState>(AutoChannelKeys.confirmed(channelId));
  }

  /** 확정방 상태 삭제 */
  async deleteConfirmedState(channelId: string): Promise<void> {
    await this.redis.del(AutoChannelKeys.confirmed(channelId));
  }

  /** 확정방 상태 키 전체 스캔 (sweep용) */
  async scanConfirmedChannelIds(): Promise<string[]> {
    const keys = await this.redis.scanKeys(AutoChannelKeys.confirmedPattern());
    const prefix = AutoChannelKeys.confirmed('');
    return keys.map((k) => k.slice(prefix.length));
  }

  /**
   * 확정방 상태 TTL 갱신 (sweep heartbeat).
   * sweep이 주기적으로 호출해 살아있는 채널의 키가 만료되지 않도록 한다.
   */
  async refreshConfirmedTtl(channelId: string): Promise<void> {
    await this.redis.expire(AutoChannelKeys.confirmed(channelId), TTL.CONFIRMED);
  }

  // --- 삭제 재시도 큐 (Phase 3 sweep 백스톱) ---

  /** 삭제 실패한 채널 ID를 재시도 큐에 등록한다 */
  async markPendingDelete(channelId: string): Promise<void> {
    await this.redis.sadd(AutoChannelKeys.pendingDelete(), channelId);
  }

  /** 재시도 큐에서 채널 ID를 제거한다 (성공 또는 join 시 호출) */
  async unmarkPendingDelete(channelId: string): Promise<void> {
    await this.redis.srem(AutoChannelKeys.pendingDelete(), channelId);
  }

  /** 재시도 큐에 등록된 채널 ID 집합을 조회한다 */
  async listPendingDeletes(): Promise<string[]> {
    return this.redis.smembers(AutoChannelKeys.pendingDelete());
  }
}
