/**
 * TOGGLE 버튼 동시 클릭 방지를 위한 인메모리 락 유틸.
 *
 * 봇은 Redis 미주입이므로(UC-05 분산 락 대신) 봇 프로세스 내 SET-NX 시맨틱으로 구현한다.
 * 단일 프로세스(샤딩 없음) 전제 — 다중 인스턴스 운영 시 분산 락 도입 필요.
 *
 * TTL 안전망(3s): 비정상 흐름에서 finally 락 해제가 누락되더라도 3초 후 자동 해제된다.
 * 정상 경로는 finally 블록에서 즉시 해제한다.
 */

/** 락 TTL 안전망 (밀리초) — UC-05 3s 기준과 동일 */
const LOCK_TTL_MS = 3_000;

const activeLocks = new Set<string>();

/**
 * 락 키를 획득한다 (SET-NX 시맨틱).
 * @returns 획득 성공 시 true, 이미 점유 중이면 false
 */
export function acquireLock(key: string): boolean {
  if (activeLocks.has(key)) {
    return false;
  }

  activeLocks.add(key);

  // TTL 안전망: finally 해제 누락 시 3초 후 자동 해제
  setTimeout(() => {
    activeLocks.delete(key);
  }, LOCK_TTL_MS);

  return true;
}

/**
 * 락 키를 해제한다.
 * 존재하지 않는 키 해제 시 무시한다.
 */
export function releaseLock(key: string): void {
  activeLocks.delete(key);
}
