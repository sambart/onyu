import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service';
import { getErrorStack } from '../util/error.util';

const LOCK_KEY_PREFIX = 'scheduler:lock:';

@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * 분산 락으로 task를 상호배타 실행한다.
   * - 획득: task 실행 후 finally에서 자기 토큰일 때만 해제
   * - 이미 점유: skip + warn (overlap guard)
   * - Redis 에러: fail-open — 락 없이 task 실행 + warn
   *   (현 단일 인스턴스 + 일일 핵심작업 미실행 방지 우선.
   *    멀티 인스턴스 스케일아웃 시 "Redis 다운 + 멀티 인스턴스" 동시 상황에서
   *    중복 실행 위험 → 스케일아웃 시 fail-closed 전환 또는 Redis HA 전제 재검토.)
   */
  async runExclusive(lockName: string, ttlSec: number, task: () => Promise<void>): Promise<void> {
    const key = `${LOCK_KEY_PREFIX}${lockName}`;
    const token = randomBytes(16).toString('hex');
    let acquired = false;

    try {
      acquired = await this.redis.setNx(key, token, ttlSec);
    } catch (err) {
      this.logger.warn(
        `[LOCK] ${lockName} 획득 중 Redis 에러 — 락 없이 실행(fail-open)`,
        getErrorStack(err),
      );
      await task();
      return;
    }

    if (!acquired) {
      this.logger.warn(`[LOCK] ${lockName} 이미 점유됨 — skip (직전 실행/타 인스턴스 진행 중)`);
      return;
    }

    try {
      await task();
    } finally {
      try {
        await this.redis.delIfMatch(key, token);
      } catch (err) {
        this.logger.warn(`[LOCK] ${lockName} 해제 실패 — TTL로 자연 만료 예정`, getErrorStack(err));
      }
    }
  }
}
