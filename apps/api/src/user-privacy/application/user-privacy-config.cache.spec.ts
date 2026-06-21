/**
 * UserPrivacyConfigCache 단위 테스트
 * 대상: getMany, setMany, invalidate, buildPrivacyCacheKey
 *
 * Redis는 ioredis 인스턴스를 직접 mock한다.
 */

import type { default as Redis } from 'ioredis';
import type { Mock } from 'vitest';

import {
  buildPrivacyCacheKey,
  USER_PRIVACY_CACHE_TTL_SEC,
  UserPrivacyConfigCache,
} from './user-privacy-config.cache';

// ─── ioredis mock ─────────────────────────────────────────────────────────────

function makeRedisMock() {
  const pipelineExec = vi.fn().mockResolvedValue([]);
  const pipelineMock = {
    set: vi.fn().mockReturnThis(),
    exec: pipelineExec,
  };

  return {
    mget: vi.fn(),
    pipeline: vi.fn().mockReturnValue(pipelineMock),
    del: vi.fn(),
    pipelineMock,
    pipelineExec,
  };
}

describe('UserPrivacyConfigCache', () => {
  let redisMock: ReturnType<typeof makeRedisMock>;
  let cache: UserPrivacyConfigCache;

  beforeEach(() => {
    redisMock = makeRedisMock();
    // REDIS_CLIENT 토큰 대신 직접 생성자에 주입
    cache = new UserPrivacyConfigCache(redisMock as unknown as Redis);
    vi.clearAllMocks();
  });

  // ─── buildPrivacyCacheKey ─────────────────────────────────────────────────

  describe('buildPrivacyCacheKey', () => {
    it('C-1: 포맷이 friend:privacy:{guildId}:{userId} 이다', () => {
      const key = buildPrivacyCacheKey('guild-1', 'user-1');
      expect(key).toBe('friend:privacy:guild-1:user-1');
    });
  });

  // ─── getMany ─────────────────────────────────────────────────────────────

  describe('getMany', () => {
    it('C-2: 빈 배열 입력 시 빈 Map 반환, MGET 호출 안 함', async () => {
      const result = await cache.getMany('guild-1', []);

      expect(result.size).toBe(0);
      expect(redisMock.mget).not.toHaveBeenCalled();
    });

    it('"0" → false, "1" → true, null → null 로 파싱한다', async () => {
      (redisMock.mget as Mock).mockResolvedValue(['0', '1', null]);

      const result = await cache.getMany('guild-1', ['u1', 'u2', 'u3']);

      expect(result.get('u1')).toBe(false);
      expect(result.get('u2')).toBe(true);
      expect(result.get('u3')).toBe(null);
    });

    it('MGET 키 순서가 userIds 순서와 일치한다', async () => {
      (redisMock.mget as Mock).mockResolvedValue(['0', '0']);

      await cache.getMany('guild-1', ['u1', 'u2']);

      expect(redisMock.mget).toHaveBeenCalledWith(
        'friend:privacy:guild-1:u1',
        'friend:privacy:guild-1:u2',
      );
    });
  });

  // ─── setMany ─────────────────────────────────────────────────────────────

  describe('setMany', () => {
    it('C-3: TTL 1800초(USER_PRIVACY_CACHE_TTL_SEC)로 SET한다', async () => {
      await cache.setMany('guild-1', new Map([['user-1', false]]));

      expect(redisMock.pipelineMock.set).toHaveBeenCalledWith(
        'friend:privacy:guild-1:user-1',
        '0',
        'EX',
        USER_PRIVACY_CACHE_TTL_SEC,
      );
      const EXPECTED_TTL_SEC = 1800; // 30분
      expect(USER_PRIVACY_CACHE_TTL_SEC).toBe(EXPECTED_TTL_SEC);
    });

    it('true 값은 "1"로 직렬화한다', async () => {
      await cache.setMany('guild-1', new Map([['user-1', true]]));

      expect(redisMock.pipelineMock.set).toHaveBeenCalledWith(
        'friend:privacy:guild-1:user-1',
        '1',
        'EX',
        USER_PRIVACY_CACHE_TTL_SEC,
      );
    });

    it('빈 Map 입력 시 pipeline을 호출하지 않는다', async () => {
      await cache.setMany('guild-1', new Map());

      expect(redisMock.pipeline).not.toHaveBeenCalled();
    });
  });

  // ─── invalidate ──────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('C-4: DEL 명령을 올바른 키로 호출한다', async () => {
      (redisMock.del as Mock).mockResolvedValue(1);

      await cache.invalidate('guild-1', 'user-1');

      expect(redisMock.del).toHaveBeenCalledWith('friend:privacy:guild-1:user-1');
    });
  });
});
