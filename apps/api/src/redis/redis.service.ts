// redis.service.ts
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
  ) {}

  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (ttlSeconds) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, result] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);

      cursor = nextCursor;
      keys.push(...result);
    } while (cursor !== '0');

    return keys;
  }

  async sadd(key: string, member: string | string[]): Promise<number> {
    if (Array.isArray(member)) {
      return this.client.sadd(key, ...member);
    }
    return this.client.sadd(key, member);
  }

  async srem(key: string, member: string | string[]): Promise<number> {
    if (Array.isArray(member)) {
      return this.client.srem(key, ...member);
    }
    return this.client.srem(key, member);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async incrBy(key: string, value: number): Promise<number> {
    return this.client.incrby(key, value);
  }

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    return this.client.hincrby(key, field, value);
  }

  async expireAt(key: string, timestamp: number) {
    await this.client.expireat(key, timestamp);
  }

  async mget<T = string>(...keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const values = await this.client.mget(...keys);
    return values.map((v) => (v ? (JSON.parse(v) as T) : null));
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /** 키의 남은 TTL(초)을 반환한다. 키가 없으면 -2, TTL 미설정이면 -1 반환. */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Redis Pipeline — 여러 명령을 하나의 네트워크 왕복으로 일괄 실행
   * 콜백 내에서 pipeline 객체에 명령을 체이닝하면 된다.
   */
  async pipeline(
    build: (pipe: ReturnType<Redis['pipeline']>) => void,
  ): Promise<Array<[Error | null, unknown]>> {
    const pipe = this.client.pipeline();
    build(pipe);
    const results = await pipe.exec();
    return (results ?? []) as Array<[Error | null, unknown]>;
  }

  /** Buffer 데이터를 Redis에 저장한다 (base64 인코딩). */
  async setBuffer(key: string, buffer: Buffer, ttlSec: number): Promise<void> {
    await this.client.set(key, buffer.toString('base64'), 'EX', ttlSec);
  }

  /** Redis에서 Buffer 데이터를 조회한다 (base64 디코딩). */
  async getBuffer(key: string): Promise<Buffer | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    return Buffer.from(data, 'base64');
  }

  /** 패턴에 매칭되는 키를 전부 삭제한다. */
  async deleteByPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
