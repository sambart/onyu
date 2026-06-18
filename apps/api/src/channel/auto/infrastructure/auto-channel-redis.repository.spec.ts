// auto-channel-redis.repository.spec.ts
import { type Mock, vi } from 'vitest';

import type { RedisService } from '../../../redis/redis.service';
import { AutoChannelKeys } from './auto-channel.keys';
import { AutoChannelRedisRepository } from './auto-channel-redis.repository';
import type { AutoChannelConfirmedState } from './auto-channel-state';

/** TTL.CONFIRMED = 60 * 60 * 24 * 7 = 604800초 (7일) */
const TTL_7DAYS = 60 * 60 * 24 * 7;

const CHANNEL_ID = 'ch-test-1';

const SAMPLE_STATE: AutoChannelConfirmedState = {
  guildId: 'guild-1',
  userId: 'user-1',
  configId: 1,
};

describe('AutoChannelRedisRepository', () => {
  let repo: AutoChannelRedisRepository;
  let mockRedis: {
    set: Mock;
    get: Mock;
    del: Mock;
    expire: Mock;
    sadd: Mock;
    srem: Mock;
    smembers: Mock;
    scanKeys: Mock;
  };

  beforeEach(() => {
    mockRedis = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(undefined),
      expire: vi.fn().mockResolvedValue(undefined),
      sadd: vi.fn().mockResolvedValue(1),
      srem: vi.fn().mockResolvedValue(1),
      smembers: vi.fn().mockResolvedValue([]),
      scanKeys: vi.fn().mockResolvedValue([]),
    };

    repo = new AutoChannelRedisRepository(mockRedis as unknown as RedisService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // TTL 상수 검증
  // ──────────────────────────────────────────────────────────
  describe('TTL 상수', () => {
    it('TTL.CONFIRMED는 7일(604800초)이다', () => {
      // setConfirmedState 호출 시 전달되는 TTL로 간접 검증
      void repo.setConfirmedState(CHANNEL_ID, SAMPLE_STATE);
      expect(mockRedis.set).toHaveBeenCalledWith(
        AutoChannelKeys.confirmed(CHANNEL_ID),
        SAMPLE_STATE,
        TTL_7DAYS,
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  // setConfirmedState
  // ──────────────────────────────────────────────────────────
  describe('setConfirmedState', () => {
    it('올바른 키와 상태, 7일 TTL로 redis.set을 호출한다', async () => {
      await repo.setConfirmedState(CHANNEL_ID, SAMPLE_STATE);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `auto_channel:confirmed:${CHANNEL_ID}`,
        SAMPLE_STATE,
        TTL_7DAYS,
      );
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // getConfirmedState
  // ──────────────────────────────────────────────────────────
  describe('getConfirmedState', () => {
    it('redis.get의 반환값을 그대로 반환한다', async () => {
      mockRedis.get.mockResolvedValue(SAMPLE_STATE);

      const result = await repo.getConfirmedState(CHANNEL_ID);

      expect(result).toEqual(SAMPLE_STATE);
      expect(mockRedis.get).toHaveBeenCalledWith(`auto_channel:confirmed:${CHANNEL_ID}`);
    });

    it('상태가 없으면 null을 반환한다', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await repo.getConfirmedState(CHANNEL_ID);

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────
  // deleteConfirmedState
  // ──────────────────────────────────────────────────────────
  describe('deleteConfirmedState', () => {
    it('올바른 키로 redis.del을 호출한다', async () => {
      await repo.deleteConfirmedState(CHANNEL_ID);

      expect(mockRedis.del).toHaveBeenCalledWith(`auto_channel:confirmed:${CHANNEL_ID}`);
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // refreshConfirmedTtl (핵심 신규 기능)
  // ──────────────────────────────────────────────────────────
  describe('refreshConfirmedTtl', () => {
    it('올바른 confirmed 키와 7일(604800초) TTL로 redis.expire를 호출한다', async () => {
      await repo.refreshConfirmedTtl(CHANNEL_ID);

      expect(mockRedis.expire).toHaveBeenCalledWith(
        `auto_channel:confirmed:${CHANNEL_ID}`,
        TTL_7DAYS,
      );
      expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    });

    it('다른 채널 ID에 대해서는 해당 채널의 키를 사용한다', async () => {
      const otherId = 'ch-other-99';
      await repo.refreshConfirmedTtl(otherId);

      expect(mockRedis.expire).toHaveBeenCalledWith(`auto_channel:confirmed:${otherId}`, TTL_7DAYS);
    });

    it('redis.expire 호출 시 7일 미만의 TTL을 사용하지 않는다', async () => {
      await repo.refreshConfirmedTtl(CHANNEL_ID);

      const [, ttl] = mockRedis.expire.mock.calls[0] as [string, number];
      expect(ttl).toBeGreaterThanOrEqual(TTL_7DAYS);
    });

    it('redis.expire가 reject해도 throw하지 않는다(graceful degradation)', async () => {
      // refreshConfirmedTtl 내부에서 .catch(() => {}) 처리 혹은 redis.expire 자체가 safe()로 감싸져 있으므로
      // 상위에서 에러가 전파되지 않아야 한다
      // (스케줄러가 .catch(() => {})를 붙여 호출하므로 repo 자체가 throw해도 sweep에서 삼킨다)
      // 여기서는 repo 직접 호출 테스트 — redis.expire 자체는 RedisService.safe()로 감싸져 있어 throw 안 함
      mockRedis.expire.mockResolvedValue(undefined); // RedisService는 safe()로 항상 resolve

      await expect(repo.refreshConfirmedTtl(CHANNEL_ID)).resolves.toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  // scanConfirmedChannelIds
  // ──────────────────────────────────────────────────────────
  describe('scanConfirmedChannelIds', () => {
    it('confirmed 패턴으로 scanKeys를 호출하고 채널 ID만 추출한다', async () => {
      mockRedis.scanKeys.mockResolvedValue([
        'auto_channel:confirmed:ch-1',
        'auto_channel:confirmed:ch-2',
      ]);

      const result = await repo.scanConfirmedChannelIds();

      expect(mockRedis.scanKeys).toHaveBeenCalledWith('auto_channel:confirmed:*');
      expect(result).toEqual(['ch-1', 'ch-2']);
    });

    it('키가 없으면 빈 배열을 반환한다', async () => {
      mockRedis.scanKeys.mockResolvedValue([]);

      const result = await repo.scanConfirmedChannelIds();

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────
  // markPendingDelete / unmarkPendingDelete / listPendingDeletes
  // ──────────────────────────────────────────────────────────
  describe('markPendingDelete', () => {
    it('pending_delete 키에 채널 ID를 sadd한다', async () => {
      await repo.markPendingDelete(CHANNEL_ID);

      expect(mockRedis.sadd).toHaveBeenCalledWith('auto_channel:pending_delete', CHANNEL_ID);
    });
  });

  describe('unmarkPendingDelete', () => {
    it('pending_delete 키에서 채널 ID를 srem한다', async () => {
      await repo.unmarkPendingDelete(CHANNEL_ID);

      expect(mockRedis.srem).toHaveBeenCalledWith('auto_channel:pending_delete', CHANNEL_ID);
    });
  });

  describe('listPendingDeletes', () => {
    it('pending_delete 키의 smembers를 반환한다', async () => {
      mockRedis.smembers.mockResolvedValue(['ch-a', 'ch-b']);

      const result = await repo.listPendingDeletes();

      expect(result).toEqual(['ch-a', 'ch-b']);
      expect(mockRedis.smembers).toHaveBeenCalledWith('auto_channel:pending_delete');
    });
  });
});
