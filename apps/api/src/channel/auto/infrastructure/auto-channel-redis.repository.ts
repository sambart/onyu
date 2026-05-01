import { Injectable } from '@nestjs/common';

import { RedisService } from '../../../redis/redis.service';
import { AutoChannelKeys } from './auto-channel.keys';
import { AutoChannelConfirmedState } from './auto-channel-state';

/** Redis TTL 상수 (초 단위) */
const TTL = {
  /** 확정방 상태 TTL — 12시간 */
  CONFIRMED: 60 * 60 * 12,
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
