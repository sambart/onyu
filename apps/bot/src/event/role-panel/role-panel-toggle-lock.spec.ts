/**
 * role-panel-toggle-lock 단위 테스트
 *
 * 커버 케이스:
 * - acquireLock: 최초 획득 → true
 * - acquireLock: 동일 키 재획득 → false (LOCKED 시맨틱)
 * - acquireLock: 다른 키는 독립적으로 획득 가능
 * - releaseLock: 해제 후 재획득 가능
 * - releaseLock: 존재하지 않는 키 해제 → 오류 없음
 * - TTL 안전망: 3초 후 자동 해제 (fake timer)
 */

import { acquireLock, releaseLock } from './role-panel-toggle-lock';

describe('role-panel-toggle-lock', () => {
  beforeEach(() => {
    // 각 테스트 전 모든 락 상태 초기화 (releaseLock으로 정리)
    // 전역 Set을 직접 초기화할 수 없으므로 각 테스트에서 고유 키 사용
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquireLock', () => {
    it('최초 획득 → true 반환', () => {
      const key = `test-lock-${Date.now()}-1`;

      expect(acquireLock(key)).toBe(true);

      releaseLock(key);
    });

    it('이미 획득된 키 재획득 → false 반환 (SET-NX 시맨틱)', () => {
      const key = `test-lock-${Date.now()}-2`;
      acquireLock(key);

      const result = acquireLock(key);

      expect(result).toBe(false);

      releaseLock(key);
    });

    it('서로 다른 키는 독립적으로 획득 가능', () => {
      const keyA = `test-lock-${Date.now()}-3a`;
      const keyB = `test-lock-${Date.now()}-3b`;

      acquireLock(keyA);
      const result = acquireLock(keyB);

      expect(result).toBe(true);

      releaseLock(keyA);
      releaseLock(keyB);
    });

    it('해제 후 동일 키 재획득 → true', () => {
      const key = `test-lock-${Date.now()}-4`;
      acquireLock(key);
      releaseLock(key);

      const result = acquireLock(key);

      expect(result).toBe(true);

      releaseLock(key);
    });
  });

  describe('releaseLock', () => {
    it('획득한 락을 해제하면 이후 재획득 가능', () => {
      const key = `test-lock-${Date.now()}-5`;
      acquireLock(key);

      releaseLock(key);

      expect(acquireLock(key)).toBe(true);
      releaseLock(key);
    });

    it('존재하지 않는 키 해제 시 오류 없음', () => {
      const key = `nonexistent-key-${Date.now()}`;

      expect(() => releaseLock(key)).not.toThrow();
    });

    it('이미 해제된 키 중복 해제 → 오류 없음', () => {
      const key = `test-lock-${Date.now()}-6`;
      acquireLock(key);
      releaseLock(key);

      expect(() => releaseLock(key)).not.toThrow();
    });
  });

  describe('TTL 안전망 (3초 자동 해제)', () => {
    it('3000ms 후 TTL 안전망 — 락이 자동 해제됨', () => {
      const key = `test-lock-ttl-${Date.now()}`;
      acquireLock(key);

      // 2999ms 경과 — 아직 해제 안 됨
      vi.advanceTimersByTime(2999);
      expect(acquireLock(key)).toBe(false);

      // 2번 시도한 acquireLock을 정리
      // (false 반환이라 Set에 추가 안 됨)

      // 3000ms 경과 — TTL로 자동 해제
      vi.advanceTimersByTime(1);
      expect(acquireLock(key)).toBe(true);

      releaseLock(key);
    });
  });

  describe('EC-RP-16: TOGGLE 동시 클릭 시나리오', () => {
    it('사용자A의 동시 TOGGLE 클릭: 첫 번째만 통과, 두 번째 차단', () => {
      const lockKey = 'guild-1:user-1:buttonId-10';

      const first = acquireLock(lockKey);
      const second = acquireLock(lockKey);

      expect(first).toBe(true);
      expect(second).toBe(false);

      releaseLock(lockKey);
    });

    it('다른 사용자(userId 다름)의 TOGGLE은 서로 차단하지 않음', () => {
      const keyUser1 = 'guild-1:user-1:buttonId-10';
      const keyUser2 = 'guild-1:user-2:buttonId-10';

      acquireLock(keyUser1);
      const result = acquireLock(keyUser2);

      expect(result).toBe(true);

      releaseLock(keyUser1);
      releaseLock(keyUser2);
    });

    it('다른 버튼(buttonId 다름)의 TOGGLE은 서로 차단하지 않음', () => {
      const keyBtn10 = 'guild-1:user-1:buttonId-10';
      const keyBtn11 = 'guild-1:user-1:buttonId-11';

      acquireLock(keyBtn10);
      const result = acquireLock(keyBtn11);

      expect(result).toBe(true);

      releaseLock(keyBtn10);
      releaseLock(keyBtn11);
    });
  });
});
