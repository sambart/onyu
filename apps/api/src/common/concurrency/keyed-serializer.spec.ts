import { KeyedSerializer } from './keyed-serializer';

/** 외부에서 resolve/reject 를 제어할 수 있는 deferred promise */
function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * microtask 큐를 여러 번 비운다.
 * KeyedSerializer 의 체이닝 구조(result→settled→cleanup→next task)가
 * 여러 microtask 단계를 거치므로 충분한 flush 필요.
 */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('KeyedSerializer', () => {
  let serializer: KeyedSerializer;

  beforeEach(() => {
    serializer = new KeyedSerializer();
  });

  // ──────────────────────────────────────────────
  // 1. 같은 key 상호배타 + FIFO
  // ──────────────────────────────────────────────
  describe('같은 key 상호배타 + FIFO', () => {
    it('같은 key A,B,C 세 task 가 A→B→C 순서로 실행된다', async () => {
      const timeline: string[] = [];

      const dA = deferred<string>();
      const dB = deferred<string>();
      const dC = deferred<string>();

      const pA = serializer.runExclusive('k', () => {
        timeline.push('A:start');
        return dA.promise.then((v) => {
          timeline.push('A:end');
          return v;
        });
      });
      const pB = serializer.runExclusive('k', () => {
        timeline.push('B:start');
        return dB.promise.then((v) => {
          timeline.push('B:end');
          return v;
        });
      });
      const pC = serializer.runExclusive('k', () => {
        timeline.push('C:start');
        return dC.promise.then((v) => {
          timeline.push('C:end');
          return v;
        });
      });

      // A 가 아직 실행 중 — B,C 는 시작 안 됨
      await flushMicrotasks();
      expect(timeline).toEqual(['A:start']);

      dA.resolve('a');
      await pA;
      // result→settled→cleanup→prev.then(task) 여러 microtask 단계 필요
      await flushMicrotasks();
      expect(timeline).toContain('B:start');
      expect(timeline).not.toContain('C:start');

      dB.resolve('b');
      await pB;
      await flushMicrotasks();
      expect(timeline).toContain('C:start');

      dC.resolve('c');
      await pC;

      expect(timeline).toEqual(['A:start', 'A:end', 'B:start', 'B:end', 'C:start', 'C:end']);
    });

    it('앞 task 가 끝나기 전 뒤 task 가 시작되지 않는다 (동시 실행 0)', async () => {
      let concurrency = 0;
      let maxConcurrency = 0;

      const tasks = Array.from({ length: 5 }, () =>
        serializer.runExclusive('key', async () => {
          concurrency++;
          maxConcurrency = Math.max(maxConcurrency, concurrency);
          // 비동기 작업 시뮬레이션 — 실제 I/O 없이 microtask yield
          await Promise.resolve();
          concurrency--;
        }),
      );

      await Promise.all(tasks);
      expect(maxConcurrency).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // 2. 다른 key 병렬 실행
  // ──────────────────────────────────────────────
  describe('다른 key 병렬 실행', () => {
    it('서로 다른 key 의 task 가 동시에 실행된다', async () => {
      const started: string[] = [];

      const dX = deferred<void>();
      const dY = deferred<void>();

      const pX = serializer.runExclusive('key-X', async () => {
        started.push('X');
        await dX.promise;
      });
      const pY = serializer.runExclusive('key-Y', async () => {
        started.push('Y');
        await dY.promise;
      });

      // 양쪽이 동시에 시작돼야 한다
      await flushMicrotasks();
      expect(started).toContain('X');
      expect(started).toContain('Y');

      dX.resolve();
      dY.resolve();
      await Promise.all([pX, pY]);
    });
  });

  // ──────────────────────────────────────────────
  // 3. 에러 격리
  // ──────────────────────────────────────────────
  describe('에러 격리', () => {
    it('첫 task 가 throw 해도 두 번째 task 가 정상 실행된다', async () => {
      const executed: string[] = [];

      const pFirst = serializer.runExclusive('k', async () => {
        executed.push('first');
        throw new Error('task-A-error');
      });

      const pSecond = serializer.runExclusive('k', async () => {
        executed.push('second');
        return 'second-result';
      });

      await expect(pFirst).rejects.toThrow('task-A-error');
      await expect(pSecond).resolves.toBe('second-result');
      expect(executed).toEqual(['first', 'second']);
    });

    it('연속 실패 후에도 다음 task 가 계속 실행된다', async () => {
      const pFail1 = serializer.runExclusive('k', async () => {
        throw new Error('fail1');
      });
      const pFail2 = serializer.runExclusive('k', async () => {
        throw new Error('fail2');
      });
      const pOk = serializer.runExclusive('k', async () => 'ok');

      await expect(pFail1).rejects.toThrow('fail1');
      await expect(pFail2).rejects.toThrow('fail2');
      await expect(pOk).resolves.toBe('ok');
    });
  });

  // ──────────────────────────────────────────────
  // 4. 반환값 / 에러 전파
  // ──────────────────────────────────────────────
  describe('반환값 및 에러 전파', () => {
    it('task 의 resolve 값이 runExclusive 반환값으로 그대로 전달된다', async () => {
      const result = await serializer.runExclusive('k', async () => ({ data: 42 }));
      expect(result).toEqual({ data: 42 });
    });

    it('task 가 throw 하면 그 에러 인스턴스가 그대로 전파된다', async () => {
      const error = new Error('exact-error');
      await expect(
        serializer.runExclusive('k', async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    });

    it('task 가 undefined 를 반환하면 runExclusive 도 undefined 를 반환한다', async () => {
      const result = await serializer.runExclusive('k', async () => undefined);
      expect(result).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────
  // 5. 누수 정리 — tails Map 정리
  // ──────────────────────────────────────────────
  describe('메모리 누수 정리', () => {
    it('모든 task 완료 후 tails Map 이 비어있다', async () => {
      await serializer.runExclusive('k1', async () => 'a');
      await serializer.runExclusive('k2', async () => 'b');

      // cleanup 은 settled.then() 에서 일어나므로 microtask 한 번 더 flush
      await Promise.resolve();

      const tails = (serializer as unknown as { tails: Map<string, unknown> }).tails;
      expect(tails.size).toBe(0);
    });

    it('새 task 가 추가된 key 는 Map 에서 제거되지 않는다', async () => {
      const dLong = deferred<void>();

      // long task 가 진행 중인 상태에서 tails Map 에 key 가 유지돼야 한다
      const pLong = serializer.runExclusive('k', async () => {
        await dLong.promise;
      });

      await Promise.resolve();
      const tails = (serializer as unknown as { tails: Map<string, unknown> }).tails;
      expect(tails.has('k')).toBe(true);

      dLong.resolve();
      await pLong;
      await Promise.resolve();
      expect(tails.size).toBe(0);
    });

    it('같은 key 로 1000회 순차 호출 후에도 누적 없이 정상 동작한다', async () => {
      let count = 0;
      const tasks = Array.from({ length: 1000 }, () =>
        serializer.runExclusive('stress', async () => {
          count++;
        }),
      );
      await Promise.all(tasks);
      await Promise.resolve();

      expect(count).toBe(1000);
      const tails = (serializer as unknown as { tails: Map<string, unknown> }).tails;
      expect(tails.size).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // 6. 동시 RMW 시나리오 — lost-update 방지
  // ──────────────────────────────────────────────
  describe('동시 RMW 시나리오 — lost-update 방지', () => {
    it('같은 key 로 공유 카운터 RMW 를 2번 실행하면 최종 값이 정확히 2 다', async () => {
      let counter = 0;

      // 경합 없이 직렬화되어야 한다: read → await → write
      const tasks = [
        serializer.runExclusive('counter', async () => {
          const current = counter;
          await Promise.resolve(); // yield — 경합 허용 지점
          counter = current + 1;
        }),
        serializer.runExclusive('counter', async () => {
          const current = counter;
          await Promise.resolve();
          counter = current + 1;
        }),
      ];

      await Promise.all(tasks);
      // 직렬화 덕분에 lost-update 없이 정확히 2
      expect(counter).toBe(2);
    });

    it('같은 key 로 공유 카운터 RMW 를 10번 실행하면 최종 값이 정확히 10 이다', async () => {
      let counter = 0;
      const N = 10;

      const tasks = Array.from({ length: N }, () =>
        serializer.runExclusive('counter', async () => {
          const current = counter;
          await Promise.resolve();
          counter = current + 1;
        }),
      );

      await Promise.all(tasks);
      expect(counter).toBe(N);
    });

    it('다른 key 로 공유 카운터를 동시 업데이트하면 경합이 발생할 수 있다 (직렬화 없음 확인)', async () => {
      // 이 테스트는 다른 key 가 직렬화되지 않음을 확인하는 것이 목적.
      // 두 task 가 실제로 병렬 실행됨을 증명.
      const started: string[] = [];
      const dA = deferred<void>();
      const dB = deferred<void>();

      const pA = serializer.runExclusive('key-A', async () => {
        started.push('A');
        await dA.promise;
      });
      const pB = serializer.runExclusive('key-B', async () => {
        started.push('B');
        await dB.promise;
      });

      await flushMicrotasks();
      // 다른 key → 양쪽 모두 started 상태 (병렬)
      expect(started).toContain('A');
      expect(started).toContain('B');

      dA.resolve();
      dB.resolve();
      await Promise.all([pA, pB]);
    });
  });

  // ──────────────────────────────────────────────
  // 7. 엣지 케이스
  // ──────────────────────────────────────────────
  describe('엣지 케이스', () => {
    it('task 가 즉시 resolve 되는 경우 정상 처리된다', async () => {
      const result = await serializer.runExclusive('k', () => Promise.resolve('instant'));
      expect(result).toBe('instant');
    });

    it('빈 문자열 key 도 정상 동작한다', async () => {
      const result = await serializer.runExclusive('', async () => 'empty-key');
      expect(result).toBe('empty-key');
    });

    it('서로 다른 key 가 독립적인 큐를 유지한다', async () => {
      const order: string[] = [];

      const dA1 = deferred<void>();
      const dB1 = deferred<void>();

      const pA1 = serializer.runExclusive('A', async () => {
        order.push('A1:start');
        await dA1.promise;
        order.push('A1:end');
      });
      const pA2 = serializer.runExclusive('A', async () => {
        order.push('A2');
      });
      const pB1 = serializer.runExclusive('B', async () => {
        order.push('B1:start');
        await dB1.promise;
        order.push('B1:end');
      });
      const pB2 = serializer.runExclusive('B', async () => {
        order.push('B2');
      });

      await flushMicrotasks();
      // A1, B1 이 동시에 실행 중
      expect(order).toContain('A1:start');
      expect(order).toContain('B1:start');
      // A2, B2 는 아직 대기 중
      expect(order).not.toContain('A2');
      expect(order).not.toContain('B2');

      dA1.resolve();
      await pA1;
      await pA2;

      dB1.resolve();
      await pB1;
      await pB2;

      // A 큐: A1→A2, B 큐: B1→B2 (독립)
      expect(order.indexOf('A1:end')).toBeLessThan(order.indexOf('A2'));
      expect(order.indexOf('B1:end')).toBeLessThan(order.indexOf('B2'));
    });
  });
});
