// redis.service.ts
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { getErrorStack } from '../common/util/error.util';
import { REDIS_CLIENT } from './redis.constants';

/** Redis TTL 조회에서 "키 없음"을 의미하는 반환값. ttl() 장애 시 fallback으로도 사용한다. */
const TTL_KEY_NOT_EXIST = -2;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
  ) {}

  /**
   * Redis 명령을 try/catch로 감싸 장애 시 안전 기본값을 반환한다.
   * Redis 단일 장애점이 음성 추적 등 핵심 기능을 throw로 중단시키지 않도록 graceful degradation을 강제한다.
   * 장애 시 데이터는 유실되며(기록/증분 등), 에러는 로깅으로 추적한다.
   */
  private async safe<T>(operation: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.error(`Redis ${operation} 실패 — fallback 반환`, getErrorStack(error));
      return fallback;
    }
  }

  async get<T = string>(key: string): Promise<T | null> {
    return this.safe<T | null>(
      'get',
      async () => {
        const value = await this.client.get(key);
        return value ? (JSON.parse(value) as T) : null;
      },
      null,
    );
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.safe<void>(
      'set',
      async () => {
        const serialized = JSON.stringify(value);

        if (ttlSeconds) {
          await this.client.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, serialized);
        }
      },
      undefined,
    );
  }

  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    return this.safe<string[]>(
      'scanKeys',
      async () => {
        let cursor = '0';
        const keys: string[] = [];

        do {
          const [nextCursor, result] = await this.client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            count,
          );

          cursor = nextCursor;
          keys.push(...result);
        } while (cursor !== '0');

        return keys;
      },
      [],
    );
  }

  async sadd(key: string, member: string | string[]): Promise<number> {
    return this.safe<number>(
      'sadd',
      async () => {
        if (Array.isArray(member)) {
          return this.client.sadd(key, ...member);
        }
        return this.client.sadd(key, member);
      },
      0,
    );
  }

  async srem(key: string, member: string | string[]): Promise<number> {
    return this.safe<number>(
      'srem',
      async () => {
        if (Array.isArray(member)) {
          return this.client.srem(key, ...member);
        }
        return this.client.srem(key, member);
      },
      0,
    );
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return this.safe<boolean>(
      'sismember',
      async () => {
        const result = await this.client.sismember(key, member);
        return result === 1;
      },
      false,
    );
  }

  async smembers(key: string): Promise<string[]> {
    return this.safe<string[]>('smembers', async () => this.client.smembers(key), []);
  }

  async scard(key: string): Promise<number> {
    return this.safe<number>('scard', async () => this.client.scard(key), 0);
  }

  async incrBy(key: string, value: number): Promise<number> {
    return this.safe<number>('incrBy', async () => this.client.incrby(key, value), 0);
  }

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    return this.safe<number>('hIncrBy', async () => this.client.hincrby(key, field, value), 0);
  }

  async expireAt(key: string, timestamp: number): Promise<void> {
    await this.safe<void>(
      'expireAt',
      async () => {
        await this.client.expireat(key, timestamp);
      },
      undefined,
    );
  }

  async mget<T = string>(...keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    return this.safe<(T | null)[]>(
      'mget',
      async () => {
        const values = await this.client.mget(...keys);
        return values.map((v) => (v ? (JSON.parse(v) as T) : null));
      },
      keys.map(() => null),
    );
  }

  async del(key: string): Promise<void> {
    await this.safe<void>(
      'del',
      async () => {
        await this.client.del(key);
      },
      undefined,
    );
  }

  async exists(key: string): Promise<boolean> {
    return this.safe<boolean>('exists', async () => (await this.client.exists(key)) === 1, false);
  }

  /** 키의 남은 TTL(초)을 반환한다. 키가 없으면 -2, TTL 미설정이면 -1 반환. */
  async ttl(key: string): Promise<number> {
    return this.safe<number>('ttl', async () => this.client.ttl(key), TTL_KEY_NOT_EXIST);
  }

  /**
   * 기존 키의 TTL을 갱신한다. 키가 없으면 no-op.
   * Why: ioredis expire()는 키가 없을 때 0을 반환하며 오류를 던지지 않는다.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.safe<void>(
      'expire',
      async () => {
        await this.client.expire(key, ttlSeconds);
      },
      undefined,
    );
  }

  /**
   * Redis Pipeline — 여러 명령을 하나의 네트워크 왕복으로 일괄 실행
   * 콜백 내에서 pipeline 객체에 명령을 체이닝하면 된다.
   */
  async pipeline(
    build: (pipe: ReturnType<Redis['pipeline']>) => void,
  ): Promise<Array<[Error | null, unknown]>> {
    return this.safe<Array<[Error | null, unknown]>>(
      'pipeline',
      async () => {
        const pipe = this.client.pipeline();
        build(pipe);
        const results = await pipe.exec();
        // ioredis exec()는 [Error|null, unknown][]|null을 반환한다. null 가드 후 구조가 동일하므로 as 캐스트 허용.
        return (results ?? []) as Array<[Error | null, unknown]>;
      },
      [],
    );
  }

  /** Buffer 데이터를 Redis에 저장한다 (base64 인코딩). */
  async setBuffer(key: string, buffer: Buffer, ttlSec: number): Promise<void> {
    await this.safe<void>(
      'setBuffer',
      async () => {
        await this.client.set(key, buffer.toString('base64'), 'EX', ttlSec);
      },
      undefined,
    );
  }

  /** Redis에서 Buffer 데이터를 조회한다 (base64 디코딩). */
  async getBuffer(key: string): Promise<Buffer | null> {
    return this.safe<Buffer | null>(
      'getBuffer',
      async () => {
        const data = await this.client.get(key);
        if (!data) return null;
        return Buffer.from(data, 'base64');
      },
      null,
    );
  }

  /**
   * 분산 락 획득용 SET NX EX. safe() 래퍼를 우회한다 —
   * "이미 점유됨(false)"과 "Redis 에러(throw)"를 호출자가 구분해야 하기 때문.
   * @returns 획득 성공 시 true, 이미 점유 시 false
   * @throws Redis 연결/명령 에러를 그대로 전파 (호출자가 fail-open 판단)
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * 락 값이 token과 일치할 때만 DEL (Lua atomic). 타 홀더 락 오삭제 방지.
   * 해제 실패는 치명적이지 않음(TTL로 자연 만료) — 에러는 throw하되 호출자가 warn 후 무시 권장.
   * @returns 삭제됨 1, 미일치/미존재 0
   */
  async delIfMatch(key: string, token: string): Promise<number> {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    const result = await this.client.eval(script, 1, key, token);
    return Number(result);
  }

  /** 패턴에 매칭되는 키를 전부 삭제한다. */
  async deleteByPattern(pattern: string): Promise<void> {
    await this.safe<void>(
      'deleteByPattern',
      async () => {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      },
      undefined,
    );
  }

  async onModuleDestroy() {
    await this.safe<void>(
      'onModuleDestroy(quit)',
      async () => {
        await this.client.quit();
      },
      undefined,
    );
  }
}
