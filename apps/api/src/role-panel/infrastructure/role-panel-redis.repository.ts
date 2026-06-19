import { Injectable } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service';
import { RolePanelKeys } from './role-panel-cache.keys';
import type { RolePanelConfigOrm } from './role-panel-config.orm-entity';

/** Redis TTL 상수 (초 단위) */
const CACHE_TTL_SECONDS = 60 * 60; // 1시간

@Injectable()
export class RolePanelRedisRepository {
  constructor(private readonly redis: RedisService) {}

  /** 설정 캐시 조회 (GET → JSON 역직렬화) */
  async getConfig(guildId: string): Promise<RolePanelConfigOrm[] | null> {
    return this.redis.get<RolePanelConfigOrm[]>(RolePanelKeys.config(guildId));
  }

  /** 설정 캐시 저장 (SET EX 3600 — TTL 1시간) */
  async setConfig(guildId: string, configs: RolePanelConfigOrm[]): Promise<void> {
    await this.redis.set(RolePanelKeys.config(guildId), configs, CACHE_TTL_SECONDS);
  }

  /** 설정 캐시 삭제 (DEL) — 패널 생성/수정/삭제/게시 시 무효화 */
  async deleteConfig(guildId: string): Promise<void> {
    await this.redis.del(RolePanelKeys.config(guildId));
  }
}
