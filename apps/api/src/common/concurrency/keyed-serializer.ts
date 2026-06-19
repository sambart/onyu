import { Injectable } from '@nestjs/common';

/**
 * 키별 인프로세스 FIFO 직렬화 큐.
 *
 * - 같은 key 로 전달된 task 는 FIFO 순서로 한 번에 하나씩 순차 실행된다.
 * - 서로 다른 key 의 task 는 병렬로 실행된다.
 * - 앞선 task 가 throw 해도 뒤따르는 task 는 계속 실행된다 (에러 격리).
 * - 호출자에게는 자신의 task 결과/에러가 그대로 전파된다.
 * - 모든 task 가 드레인되면 해당 key 의 내부 상태가 자동 정리된다 (메모리 누수 방지).
 */
@Injectable()
export class KeyedSerializer {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * 주어진 key 에 대해 task 를 직렬화하여 실행한다.
   *
   * @param key   직렬화 단위 식별자 (예: `${guildId}:${userId}`)
   * @param task  실행할 비동기 작업
   * @returns     task 의 결과값 또는 에러를 그대로 전파하는 Promise
   */
  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    // 1) 이전 tail 캡처 (없으면 즉시 resolve 된 promise 로 시작)
    const prev = this.tails.get(key) ?? Promise.resolve();

    // 2) 이전 tail 이후에 task 를 체이닝.
    //    prev 성공/실패 모두 task 를 실행한다 — 에러 격리를 위해 양쪽에서 task 호출.
    const result: Promise<T> = prev.then(
      () => task(),
      () => task(),
    );

    // 3) tails 에 저장할 tail 은 항상 fulfilled 로 수렴하는 promise 여야 한다.
    //    result 의 settled 버전(양쪽 흡수)을 만들고, 드레인 시 Map 에서 정리한다.
    const settled: Promise<unknown> = result.then(
      () => undefined,
      () => undefined,
    );
    const cleanup: Promise<unknown> = settled.then(() => {
      // 내가 여전히 마지막 tail 일 때만 삭제 — 그 사이 새 task 가 끼어들었으면 보존
      if (this.tails.get(key) === cleanup) {
        this.tails.delete(key);
      }
    });
    this.tails.set(key, cleanup);

    // 4) 호출자에게는 흡수 전 원본 result 반환 — 결과/에러 정확 전파
    return result;
  }
}
