import { Injectable } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service';
import { StickyMessageKeys } from './sticky-message-cache.keys';
import { StickyMessageConfigOrm } from './sticky-message-config.orm-entity';

/** Redis TTL 상수 (초 단위) */
const TTL = {
  /** 설정 캐시: 1시간 */
  CONFIG: 60 * 60,
  /** 디바운스 타이머: 3초 (setTimeout 대기 시간보다 충분히 길어야 함) */
  DEBOUNCE: 3,
} as const;

@Injectable()
export class StickyMessageRedisRepository {
  constructor(private readonly redis: RedisService) {}

  /** 설정 캐시 조회 (GET → JSON 역직렬화) */
  async getConfig(guildId: string): Promise<StickyMessageConfigOrm[] | null> {
    return this.redis.get<StickyMessageConfigOrm[]>(StickyMessageKeys.config(guildId));
  }

  /** 설정 캐시 저장 (SET EX 3600 — TTL 1시간) */
  async setConfig(guildId: string, configs: StickyMessageConfigOrm[]): Promise<void> {
    await this.redis.set(StickyMessageKeys.config(guildId), configs, TTL.CONFIG);
  }

  /** 설정 캐시 삭제 (DEL) — 설정 삭제 시 무효화 */
  async deleteConfig(guildId: string): Promise<void> {
    await this.redis.del(StickyMessageKeys.config(guildId));
  }

  /** 디바운스 타이머 설정 또는 TTL 리셋 (SET EX 3) */
  async setDebounce(channelId: string): Promise<void> {
    await this.redis.set(StickyMessageKeys.debounce(channelId), 1, TTL.DEBOUNCE);
  }

  /** 디바운스 타이머 삭제 (DEL) — 재전송 완료 후 */
  async deleteDebounce(channelId: string): Promise<void> {
    await this.redis.del(StickyMessageKeys.debounce(channelId));
  }
}
