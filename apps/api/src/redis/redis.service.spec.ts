// redis.service.spec.ts
import { Logger } from '@nestjs/common';

const TTL_REMAINING_SEC = 120; // TTL 조회 테스트용 잔여 시간
const TTL_KEY_MISSING = -2; // Redis TTL -2: 키 없음
const LOCK_TTL_SEC = 900; // 스케줄러 락 TTL
const LARGE_TIMESTAMP = 1_000_000; // expireAt 에러 케이스용 타임스탬프
import { vi } from 'vitest';

import { RedisService } from './redis.service';

/** ioredis Client의 최소 mock 타입 */
interface MockRedisClient {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  srem: ReturnType<typeof vi.fn>;
  sismember: ReturnType<typeof vi.fn>;
  smembers: ReturnType<typeof vi.fn>;
  scard: ReturnType<typeof vi.fn>;
  incrby: ReturnType<typeof vi.fn>;
  hincrby: ReturnType<typeof vi.fn>;
  expireat: ReturnType<typeof vi.fn>;
  mget: ReturnType<typeof vi.fn>;
  scan: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  pipeline: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
}

function makeMockClient(): MockRedisClient {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    ttl: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    sismember: vi.fn(),
    smembers: vi.fn(),
    scard: vi.fn(),
    incrby: vi.fn(),
    hincrby: vi.fn(),
    expireat: vi.fn(),
    mget: vi.fn(),
    scan: vi.fn(),
    keys: vi.fn(),
    pipeline: vi.fn(),
    quit: vi.fn(),
    eval: vi.fn(),
  };
}

describe('RedisService', () => {
  let service: RedisService;
  let mockClient: MockRedisClient;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockClient = makeMockClient();

    // NestJS DI 없이 직접 생성 — REDIS_CLIENT 토큰은 생성자 파라미터로 주입
    service = new RedisService(mockClient as never);

    // Logger.prototype.error spy — 장애 경로 검증용
    loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // get
  // ──────────────────────────────────────────────────────────
  describe('get', () => {
    it('JSON 문자열을 파싱하여 객체로 반환한다', async () => {
      mockClient.get.mockResolvedValue('{"a":1}');

      const result = await service.get<{ a: number }>('key');

      expect(result).toEqual({ a: 1 });
    });

    it('값이 없으면 null을 반환한다', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await service.get('key');

      expect(result).toBeNull();
    });

    it('client가 throw하면 null을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.get.mockRejectedValue(new Error('connection lost'));

      const result = await service.get('key');

      expect(result).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // set
  // ──────────────────────────────────────────────────────────
  describe('set', () => {
    it('ttl이 있으면 EX 옵션과 함께 set을 호출한다', async () => {
      mockClient.set.mockResolvedValue('OK');

      await service.set('key', { val: 42 }, 60);

      expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify({ val: 42 }), 'EX', 60);
    });

    it('ttl이 없으면 EX 없이 set을 호출한다', async () => {
      mockClient.set.mockResolvedValue('OK');

      await service.set('key', 'hello');

      expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify('hello'));
    });

    it('client가 throw해도 reject되지 않으며 logger.error를 1회 호출한다', async () => {
      mockClient.set.mockRejectedValue(new Error('redis down'));

      await expect(service.set('key', 'val')).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // del
  // ──────────────────────────────────────────────────────────
  describe('del', () => {
    it('client.del을 호출한다', async () => {
      mockClient.del.mockResolvedValue(1);

      await service.del('key');

      expect(mockClient.del).toHaveBeenCalledWith('key');
    });

    it('client가 throw해도 reject되지 않으며 logger.error를 1회 호출한다', async () => {
      mockClient.del.mockRejectedValue(new Error('redis down'));

      await expect(service.del('key')).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // exists
  // ──────────────────────────────────────────────────────────
  describe('exists', () => {
    it('존재하면 true를 반환한다', async () => {
      mockClient.exists.mockResolvedValue(1);

      expect(await service.exists('key')).toBe(true);
    });

    it('존재하지 않으면 false를 반환한다', async () => {
      mockClient.exists.mockResolvedValue(0);

      expect(await service.exists('key')).toBe(false);
    });

    it('client가 throw하면 false를 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.exists.mockRejectedValue(new Error('redis down'));

      expect(await service.exists('key')).toBe(false);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // ttl
  // ──────────────────────────────────────────────────────────
  describe('ttl', () => {
    it('client.ttl 값을 그대로 반환한다', async () => {
      mockClient.ttl.mockResolvedValue(TTL_REMAINING_SEC);

      expect(await service.ttl('key')).toBe(TTL_REMAINING_SEC);
    });

    it('키가 없으면 -1을 반환한다 (TTL 미설정)', async () => {
      mockClient.ttl.mockResolvedValue(-1);

      expect(await service.ttl('key')).toBe(-1);
    });

    it('client가 throw하면 -2를 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.ttl.mockRejectedValue(new Error('redis down'));

      expect(await service.ttl('key')).toBe(TTL_KEY_MISSING);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // sadd
  // ──────────────────────────────────────────────────────────
  describe('sadd', () => {
    it('단일 member를 추가하고 추가된 수를 반환한다', async () => {
      mockClient.sadd.mockResolvedValue(1);

      expect(await service.sadd('key', 'member')).toBe(1);
      expect(mockClient.sadd).toHaveBeenCalledWith('key', 'member');
    });

    it('배열 member를 spread하여 추가한다', async () => {
      mockClient.sadd.mockResolvedValue(2);

      expect(await service.sadd('key', ['m1', 'm2'])).toBe(2);
      expect(mockClient.sadd).toHaveBeenCalledWith('key', 'm1', 'm2');
    });

    it('client가 throw하면 0을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.sadd.mockRejectedValue(new Error('redis down'));

      expect(await service.sadd('key', 'member')).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // srem
  // ──────────────────────────────────────────────────────────
  describe('srem', () => {
    it('단일 member를 제거하고 제거된 수를 반환한다', async () => {
      mockClient.srem.mockResolvedValue(1);

      expect(await service.srem('key', 'member')).toBe(1);
      expect(mockClient.srem).toHaveBeenCalledWith('key', 'member');
    });

    it('배열 member를 spread하여 제거한다', async () => {
      mockClient.srem.mockResolvedValue(2);

      expect(await service.srem('key', ['m1', 'm2'])).toBe(2);
      expect(mockClient.srem).toHaveBeenCalledWith('key', 'm1', 'm2');
    });

    it('client가 throw하면 0을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.srem.mockRejectedValue(new Error('redis down'));

      expect(await service.srem('key', 'member')).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // sismember
  // ──────────────────────────────────────────────────────────
  describe('sismember', () => {
    it('1을 반환하면 true', async () => {
      mockClient.sismember.mockResolvedValue(1);

      expect(await service.sismember('key', 'member')).toBe(true);
    });

    it('0을 반환하면 false', async () => {
      mockClient.sismember.mockResolvedValue(0);

      expect(await service.sismember('key', 'member')).toBe(false);
    });

    it('client가 throw하면 false를 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.sismember.mockRejectedValue(new Error('redis down'));

      expect(await service.sismember('key', 'member')).toBe(false);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // smembers
  // ──────────────────────────────────────────────────────────
  describe('smembers', () => {
    it('집합 멤버 배열을 반환한다', async () => {
      mockClient.smembers.mockResolvedValue(['a', 'b', 'c']);

      expect(await service.smembers('key')).toEqual(['a', 'b', 'c']);
    });

    it('client가 throw하면 빈 배열을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.smembers.mockRejectedValue(new Error('redis down'));

      expect(await service.smembers('key')).toEqual([]);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // scard
  // ──────────────────────────────────────────────────────────
  describe('scard', () => {
    it('집합 원소 수를 반환한다', async () => {
      mockClient.scard.mockResolvedValue(5);

      expect(await service.scard('key')).toBe(5);
    });

    it('client가 throw하면 0을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.scard.mockRejectedValue(new Error('redis down'));

      expect(await service.scard('key')).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // incrBy
  // ──────────────────────────────────────────────────────────
  describe('incrBy', () => {
    it('증분 후 결과 값을 반환한다', async () => {
      mockClient.incrby.mockResolvedValue(10);

      expect(await service.incrBy('key', 5)).toBe(10);
      expect(mockClient.incrby).toHaveBeenCalledWith('key', 5);
    });

    it('client가 throw하면 0을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.incrby.mockRejectedValue(new Error('redis down'));

      expect(await service.incrBy('key', 1)).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // hIncrBy
  // ──────────────────────────────────────────────────────────
  describe('hIncrBy', () => {
    it('해시 필드 증분 후 결과 값을 반환한다', async () => {
      mockClient.hincrby.mockResolvedValue(7);

      expect(await service.hIncrBy('hash', 'field', 3)).toBe(7);
      expect(mockClient.hincrby).toHaveBeenCalledWith('hash', 'field', 3);
    });

    it('client가 throw하면 0을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.hincrby.mockRejectedValue(new Error('redis down'));

      expect(await service.hIncrBy('hash', 'field', 1)).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // expireAt
  // ──────────────────────────────────────────────────────────
  describe('expireAt', () => {
    it('client.expireat을 올바른 인자로 호출한다', async () => {
      mockClient.expireat.mockResolvedValue(1);
      const ts = 1_700_000_000;

      await service.expireAt('key', ts);

      expect(mockClient.expireat).toHaveBeenCalledWith('key', ts);
    });

    it('client가 throw해도 reject되지 않으며 logger.error를 1회 호출한다', async () => {
      mockClient.expireat.mockRejectedValue(new Error('redis down'));

      await expect(service.expireAt('key', LARGE_TIMESTAMP)).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // mget
  // ──────────────────────────────────────────────────────────
  describe('mget', () => {
    it('키가 0개이면 client를 호출하지 않고 빈 배열을 반환한다', async () => {
      const result = await service.mget();

      expect(result).toEqual([]);
      expect(mockClient.mget).not.toHaveBeenCalled();
    });

    it('값 배열을 JSON 파싱하여 반환한다', async () => {
      mockClient.mget.mockResolvedValue(['{"x":1}', null, '"hello"']);

      const result = await service.mget<unknown>('k1', 'k2', 'k3');

      expect(result).toEqual([{ x: 1 }, null, 'hello']);
    });

    it('client가 throw하면 입력 키 수만큼 null 배열을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.mget.mockRejectedValue(new Error('redis down'));

      const result = await service.mget('k1', 'k2', 'k3');

      expect(result).toEqual([null, null, null]);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // scanKeys
  // ──────────────────────────────────────────────────────────
  describe('scanKeys', () => {
    it('패턴에 매칭되는 키 배열을 반환한다 (커서 순회)', async () => {
      // 첫 scan: cursor '5' + 2개 키, 두 번째 scan: cursor '0' + 1개 키
      mockClient.scan
        .mockResolvedValueOnce(['5', ['key:1', 'key:2']])
        .mockResolvedValueOnce(['0', ['key:3']]);

      const result = await service.scanKeys('key:*');

      expect(result).toEqual(['key:1', 'key:2', 'key:3']);
      expect(mockClient.scan).toHaveBeenCalledTimes(2);
    });

    it('매칭되는 키가 없으면 빈 배열을 반환한다', async () => {
      mockClient.scan.mockResolvedValue(['0', []]);

      const result = await service.scanKeys('nomatch:*');

      expect(result).toEqual([]);
    });

    it('client가 throw하면 빈 배열을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.scan.mockRejectedValue(new Error('redis down'));

      const result = await service.scanKeys('key:*');

      expect(result).toEqual([]);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // setBuffer / getBuffer (base64 왕복)
  // ──────────────────────────────────────────────────────────
  describe('setBuffer', () => {
    it('Buffer를 base64 인코딩하여 EX 옵션으로 저장한다', async () => {
      mockClient.set.mockResolvedValue('OK');
      const buf = Buffer.from('hello');

      await service.setBuffer('key', buf, 30);

      expect(mockClient.set).toHaveBeenCalledWith('key', buf.toString('base64'), 'EX', 30);
    });

    it('client가 throw해도 reject되지 않으며 logger.error를 1회 호출한다', async () => {
      mockClient.set.mockRejectedValue(new Error('redis down'));
      const buf = Buffer.from('data');

      await expect(service.setBuffer('key', buf, 60)).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBuffer', () => {
    it('base64 문자열을 Buffer로 디코딩하여 반환한다', async () => {
      const original = Buffer.from('binary data');
      mockClient.get.mockResolvedValue(original.toString('base64'));

      const result = await service.getBuffer('key');

      expect(result).toEqual(original);
    });

    it('키가 없으면 null을 반환한다', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await service.getBuffer('key');

      expect(result).toBeNull();
    });

    it('client가 throw하면 null을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.get.mockRejectedValue(new Error('redis down'));

      const result = await service.getBuffer('key');

      expect(result).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // deleteByPattern
  // ──────────────────────────────────────────────────────────
  describe('deleteByPattern', () => {
    it('패턴에 매칭되는 키가 있으면 del을 호출한다', async () => {
      mockClient.keys.mockResolvedValue(['key:1', 'key:2']);
      mockClient.del.mockResolvedValue(2);

      await service.deleteByPattern('key:*');

      expect(mockClient.del).toHaveBeenCalledWith('key:1', 'key:2');
    });

    it('매칭되는 키가 없으면 del을 호출하지 않는다', async () => {
      mockClient.keys.mockResolvedValue([]);

      await service.deleteByPattern('nomatch:*');

      expect(mockClient.del).not.toHaveBeenCalled();
    });

    it('client가 throw해도 reject되지 않으며 logger.error를 1회 호출한다', async () => {
      mockClient.keys.mockRejectedValue(new Error('redis down'));

      await expect(service.deleteByPattern('key:*')).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // pipeline
  // ──────────────────────────────────────────────────────────
  describe('pipeline', () => {
    it('exec 결과를 반환한다', async () => {
      const execResult: Array<[null, number]> = [
        [null, 1],
        [null, 2],
      ];
      const mockPipe = { exec: vi.fn().mockResolvedValue(execResult) };
      mockClient.pipeline.mockReturnValue(mockPipe);

      const result = await service.pipeline((pipe) => {
        // 콜백 — 실제 명령 없이 pipeline 객체 체이닝 테스트
        void pipe;
      });

      expect(result).toEqual(execResult);
    });

    it('exec이 null을 반환하면 빈 배열로 처리한다', async () => {
      const mockPipe = { exec: vi.fn().mockResolvedValue(null) };
      mockClient.pipeline.mockReturnValue(mockPipe);

      const result = await service.pipeline(() => undefined);

      expect(result).toEqual([]);
    });

    it('client가 throw하면 빈 배열을 반환하고 logger.error를 1회 호출한다', async () => {
      mockClient.pipeline.mockImplementation(() => {
        throw new Error('redis down');
      });

      const result = await service.pipeline(() => undefined);

      expect(result).toEqual([]);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // setNx
  // ──────────────────────────────────────────────────────────
  describe('setNx', () => {
    it("client.set이 'OK'를 반환하면 true를 반환한다 (락 획득)", async () => {
      mockClient.set.mockResolvedValue('OK');

      const result = await service.setNx('scheduler:lock:test', 'token-abc', LOCK_TTL_SEC);

      expect(result).toBe(true);
      expect(mockClient.set).toHaveBeenCalledWith(
        'scheduler:lock:test',
        'token-abc',
        'EX',
        LOCK_TTL_SEC,
        'NX',
      );
    });

    it('client.set이 null을 반환하면 false를 반환한다 (이미 점유)', async () => {
      mockClient.set.mockResolvedValue(null);

      const result = await service.setNx('scheduler:lock:test', 'token-abc', LOCK_TTL_SEC);

      expect(result).toBe(false);
    });

    it('client가 throw하면 safe() 우회 — setNx도 throw한다', async () => {
      mockClient.set.mockRejectedValue(new Error('connection lost'));

      await expect(service.setNx('scheduler:lock:test', 'token-abc', LOCK_TTL_SEC)).rejects.toThrow(
        'connection lost',
      );
      // safe() 래퍼 미적용이므로 logger.error 호출 없음
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // delIfMatch
  // ──────────────────────────────────────────────────────────
  describe('delIfMatch', () => {
    it('eval이 1을 반환하면 1을 반환한다 (토큰 일치 → 삭제됨)', async () => {
      mockClient.eval.mockResolvedValue(1);

      const result = await service.delIfMatch('scheduler:lock:test', 'token-abc');

      expect(result).toBe(1);
      expect(mockClient.eval).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('del'"),
        1,
        'scheduler:lock:test',
        'token-abc',
      );
    });

    it('eval이 0을 반환하면 0을 반환한다 (토큰 불일치/미존재)', async () => {
      mockClient.eval.mockResolvedValue(0);

      const result = await service.delIfMatch('scheduler:lock:test', 'other-token');

      expect(result).toBe(0);
    });

    it('client가 throw하면 delIfMatch도 throw한다', async () => {
      mockClient.eval.mockRejectedValue(new Error('eval failed'));

      await expect(service.delIfMatch('scheduler:lock:test', 'token-abc')).rejects.toThrow(
        'eval failed',
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // onModuleDestroy
  // ──────────────────────────────────────────────────────────
  describe('onModuleDestroy', () => {
    it('client.quit을 호출한다', async () => {
      mockClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockClient.quit).toHaveBeenCalledTimes(1);
    });

    it('client.quit이 throw해도 reject되지 않으며 logger.error를 1회 호출한다', async () => {
      mockClient.quit.mockRejectedValue(new Error('quit failed'));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
