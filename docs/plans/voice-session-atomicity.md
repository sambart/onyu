# 구현 계획 — voice 세션 원자성 (유저별 인프로세스 직렬화 큐)

> 서비스 평가 P1 마지막 항목. 같은 유저의 연속 음성 이벤트 동시 처리로 인한 read-modify-write(RMW) 경합 → duration 중복/유실을 제거한다.
> **DB 변경 없음. 마이그레이션 없음. 신규 도메인/path 없음.**

## 1. 배경 — 경합 메커니즘 (사전조사 확정)

같은 유저의 연속 음성 이벤트가 동시에 in-flight 되어 RMW 경합이 발생한다.

1. **봇** `apps/bot/src/event/voice/bot-voice-state.dispatcher.ts` `@On('voiceStateUpdate')` — discord.js 가 리스너 반환 Promise 를 await 하지 않으므로 같은 유저의 연속 이벤트가 동시에 `apiClient.sendVoiceStateUpdate` 로 흘러나간다.
2. **API 진입** `apps/api/src/bot-api/voice/bot-voice.controller.ts` `@Post('state-update')` → `emitAsync('bot-api.voice.state-update', dto)`. `emitAsync` 는 동시 도착 요청을 직렬화하지 않는다.
3. **리스너** `apps/api/src/bot-api/voice/bot-voice-event.listener.ts` `@OnEvent` `handle(dto)` — eventType 라우팅(join/leave/move/mic_toggle/streaming_toggle/video_toggle/deaf_toggle) → `voiceChannelService` → `voice-session.service.ts` RMW. **`handle()` 전체가 다수 await(`isExcludedChannel` / `findByTriggerChannel` / auto-channel)을 거쳐 경합 창이 넓다.**
4. **RMW 본체**: `voice-redis.repository.ts` `accumulateDuration`(`elapsed = now - session.lastUpdatedAt` → incrby → setSession), `voice-session.service.ts` `startOrUpdateSession` / `switchChannel` / `closeSession`. 두 이벤트가 같은 `lastUpdatedAt` 스냅샷을 읽고 각자 incrby → **duration 중복 가산 또는 유실**.
5. **기존 직렬화 장치 없음.**

## 2. 채택 방안 — 유저별 인프로세스 직렬화 큐

- 음성 이벤트는 **드롭 불가** → 분산락(점유 시 skip)은 부적합. 블로킹락은 hot path 과비용.
- 단일 인스턴스(Lightsail) + discord.js 샤드별 순서보장 → **유저별로 `handle()` 를 한 번에 하나씩 직렬 처리**하면 정확한 순차 복원. Redis 왕복 없음, 저비용.
- 같은 유저 이벤트만 직렬, **유저 간 완전 병렬** → 처리량 영향 미미.

> 참고: 기존 `SchedulerLockService.runExclusive(lockName, ttlSec, task)` 는 **Redis 분산락**(상호배타+skip)으로 성격이 다르다. 본 큐는 in-process FIFO 직렬화로 별도 유틸이며, 메서드명 `runExclusive` 만 어휘를 공유한다(드롭 없음·skip 없음).

---

## 3. 신설/변경 파일

| # | 파일 | 종류 | 내용 |
|---|---|---|---|
| 1 | `apps/api/src/common/concurrency/keyed-serializer.ts` | 신규 | `KeyedSerializer` @Injectable 서비스. `runExclusive<T>(key, task)` |
| 2 | `apps/api/src/common/concurrency/keyed-serializer.spec.ts` | 신규 | Vitest 단위 테스트 (직렬/병렬/FIFO/에러격리/정리) |
| 3 | `apps/api/src/common/common.module.ts` | 변경 | `KeyedSerializer` providers + exports 등록 |
| 4 | `apps/api/src/bot-api/voice/bot-voice-event.listener.ts` | 변경 | `handle()` 본문을 `serializer.runExclusive(key, …)` 로 래핑 |

> `common/` 하위 신규 서브디렉토리 `concurrency/` 를 둔다 — 기존 `common/scheduler/`, `common/resilience/`, `common/llm/` 등 **기능별 서브디렉토리 컨벤션**과 정합. `CommonModule` 은 `@Global()` 이므로 별도 import 없이 `BotApiModule` 의 리스너에 주입 가능.

---

## 4. KeyedSerializer 설계

### 4.1 시그니처

```ts
@Injectable()
export class KeyedSerializer {
  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T>;
}
```

- `key`: 직렬화 단위. 본 적용에서는 `${guildId}:${userId}`.
- 같은 `key` → FIFO 직렬. 다른 `key` → 병렬.
- 반환: 해당 task 의 결과/에러를 **정확히 호출자에게 전파**.

### 4.2 내부 상태

```ts
private readonly tails = new Map<string, Promise<unknown>>();
```

key 별 "마지막으로 체이닝된 task 의 tail promise" 를 유지한다.

### 4.3 의사코드 (체이닝 · 에러격리 · 정리)

```ts
runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  // 1) 이전 tail (없으면 즉시 resolve)
  const prev = this.tails.get(key) ?? Promise.resolve();

  // 2) 이전 tail 이후에 task 를 체이닝.
  //    핵심: prev 의 성공/실패와 무관하게 task 를 실행해야 한다 (에러격리).
  //    prev 의 결과는 버리고(.then(noop), .catch(noop) 모두 흡수) task 만 실행.
  const result: Promise<T> = prev.then(() => task(), () => task());
  //                                  ^^^^^^^^^^   ^^^^^^^^^^
  //                          prev 성공 시 task   prev 실패 시에도 task
  //   → prev 가 rejected 여도 chain 이 굳지 않고 다음 task 가 계속 실행됨.

  // 3) 새 tail = result 를 "에러 흡수한" promise 로 갱신.
  //    tails 에는 절대 rejected promise 를 넣지 않는다 (다음 task 가 막히지 않게).
  //    또한 이 task 가 이 key 의 마지막이면(= tail 이 여전히 나면) Map 에서 제거(누수 방지).
  const settled: Promise<unknown> = result.then(
    () => undefined,
    () => undefined,
  );
  const cleanup = settled.then(() => {
    if (this.tails.get(key) === cleanup) {
      this.tails.delete(key);
    }
  });
  this.tails.set(key, cleanup);

  // 4) 호출자에게는 원본 result(결과/에러 그대로) 반환.
  return result;
}
```

설계 포인트:

- **에러격리**: `tails` 에 저장하는 promise(`cleanup`)는 항상 fulfilled 로 수렴(`settled` 가 양쪽 흡수). 다음 `runExclusive` 가 `prev.then(task, task)` 로 체이닝하므로 **앞 task 가 throw 해도 뒤 task 는 계속 실행**된다. 동시에 호출자에게 반환하는 것은 흡수 전 `result` → **에러/결과 정확 전파**.
- **누수 방지**: chain 드레인 시 `this.tails.get(key) === cleanup` (= 내가 여전히 마지막 tail) 검사 후 `delete`. 그 사이 새 task 가 들어와 tail 이 교체됐으면 삭제하지 않는다 → 활성 chain 보존 + 유휴 key 제거. 동기 경로에서 tail 을 먼저 `set` 하고 cleanup 이 microtask 로 나중에 도는 순서라 race 없음.
- **FIFO**: `prev` 캡처 → 새 tail `set` 이 동기 실행이므로 도착 순서대로 chain 이 쌓인다(이벤트 도착 순서 = 처리 순서).
- **Redis/외부 의존 없음**: 순수 in-process. 생성자 무인자(또는 `Logger` 만).

### 4.4 과도 누적 방지 (검토 결과: 불요)

유저당 음성 이벤트 빈도가 낮아(분당 수 건 수준) 큐 깊이는 자연 제한된다. 별도 backpressure/상한은 도입하지 않는다. (향후 비정상 폭주 관측 시 key별 깊이 카운터 + warn 로그 추가 여지만 문서화.)

---

## 5. listener 적용 (diff 스케치)

`bot-voice-event.listener.ts`:

1. 생성자에 `private readonly serializer: KeyedSerializer` 주입.
2. `handle()` 의 **기존 try/catch 전체를 그대로 task 클로저로 이동**하고 `runExclusive` 로 감싼다.

```ts
// import 추가
import { KeyedSerializer } from '../../common/concurrency/keyed-serializer';

// constructor 파라미터 추가
private readonly serializer: KeyedSerializer,

@OnEvent('bot-api.voice.state-update')
async handle(dto: VoiceStateUpdateEventDto): Promise<void> {
  const key = `${dto.guildId}:${dto.userId}`;        // userId/guildId 는 dto 최상위 필드 (확인 완료)
  await this.serializer.runExclusive(key, async () => {
    try {
      switch (dto.eventType) {
        case 'join':  await this.handleJoin(dto);  break;
        // … 기존 라우팅 그대로 …
      }
    } catch (err) {
      this.logger.error(
        `[BOT-API VOICE] ${dto.eventType} failed: guild=${dto.guildId} user=${dto.userId}`,
        getErrorStack(err),
      );
    }
  });
}
```

> **userId 추출 위치 확인 완료**: `VoiceStateUpdateEventDto` 의 `guildId` / `userId` 는 최상위 필드(listener interface line 342–343, dispatcher payload line 57·60). 추가 추출 로직 불요.

설계 포인트:

- **try/catch·로깅 보존**: 기존 에러 처리는 task 클로저 *안*에 유지 → 실패해도 throw 가 큐 밖으로 새지 않고 다음 이벤트 처리에 영향 없음(에러격리는 KeyedSerializer 와 try/catch 이중 안전).
- **fire-and-forget 호출들**(`voiceGameService.onUserJoined`, `statusPrefixResetService.restoreOnLeave`, `autoChannelService.handleChannelEmpty`, `emitAloneChanged` 등)은 task 내부에서 `await` 되지 않으므로 **직렬화 경계 밖**에서 비동기로 흐른다 — 이는 **의도된 동작**. 이들은 RMW 세션 상태와 무관하거나 자체 멱등/락을 가지므로 직렬화 대상이 아니다. duration RMW 경로(`voiceChannelService.onUserJoined/onUserLeave/onUserMove/…` 의 awaited 호출)만 직렬화로 보호된다.
- `handle()` 진입점 시그니처(`@OnEvent`, async, void 반환)는 유지 — `emitAsync` 가 반환 Promise 를 await 하므로 큐 완료까지 컨트롤러가 대기(순서 보존에 유리).

---

## 6. 정확성 분석

| 속성 | 보장 근거 |
|---|---|
| **같은 key 직렬** | `prev` tail 뒤에 체이닝, RMW 가 겹치지 않음 → `accumulateDuration` 의 read→incrby→set 가 원자적으로 순차 실행 |
| **다른 key 병렬** | key별 독립 tail. 서로 다른 chain → 동시 실행 |
| **FIFO 순서** | `prev` 캡처 + tail `set` 동기 실행 → 도착순 = 처리순 |
| **에러 격리** | tail 에 흡수 promise 저장 + `prev.then(task, task)` → 앞 task 실패가 뒤 task 를 막지 않음 |
| **결과/에러 전파** | 호출자에 흡수 전 `result` 반환 |
| **메모리 누수 방지** | 드레인 시 `tails.get(key) === cleanup` 검사 후 `delete` |

---

## 7. 범위 한계 (단일 인스턴스 전제)

- 본 큐는 **인프로세스** 직렬화다. **API 가 멀티 인스턴스로 스케일아웃되면** 같은 유저 이벤트가 서로 다른 인스턴스로 분산될 때 인스턴스 간 경합이 잔존한다.
- **현재 전제 확인**: 봇 → API 는 단일 API 인스턴스(Lightsail 단일 호스트) 구성으로 추정. 본 워크트리/매니페스트 상 API 수평 확장 구성 흔적 없음. 운영 구성 변경 시 재검토 필요.
- **향후 항목(문서화만, 본 작업 범위 밖)**: 멀티 인스턴스 전환 시 → (a) 유저 키 기반 일관 라우팅(sticky), 또는 (b) Redis 기반 분산 직렬화(`accumulateDuration` 을 Lua 스크립트로 원자화하거나 유저 키 분산락) 도입.

---

## 8. 테스트 관점 (Vitest — `keyed-serializer.spec.ts`)

순수 in-process 유틸이므로 NestJS TestingModule 불요, `new KeyedSerializer()` 직접 인스턴스화.

1. **같은 key 직렬**: 같은 key 로 2개 task 동시 호출. task A 가 진행 중일 때 task B 가 시작되지 않음(공유 배열에 enter/exit 마커 push → `[A-in, A-out, B-in, B-out]` 순서 검증).
2. **다른 key 병렬**: 서로 다른 key 의 task 2개가 인터리브 실행됨(A-in, B-in 이 둘 다 A-out 전에 관측).
3. **FIFO 순서**: 같은 key 로 task 1,2,3 순차 호출 → 완료 순서가 1→2→3.
4. **에러 격리**: 같은 key 에서 첫 task 가 throw → 둘째 task 가 정상 실행되고 첫 task 의 reject 는 첫 호출자에게만 전파(`await expect(p1).rejects` / `await expect(p2).resolves`).
5. **결과 전파**: task 반환값이 `runExclusive` 반환 Promise 로 그대로 resolve.
6. **정리(누수 방지)**: 모든 task 드레인 후 내부 `tails` Map 이 비워짐(테스트용 getter 또는 `(serializer as any).tails.size === 0`). 진행 중에는 유지됨.
7. **동시 RMW 중복가산 회귀(통합)**: 같은 유저 join→mic_toggle 2 이벤트를 직렬화로 감쌌을 때 duration 이 정확히 1회 가산됨을 mock RMW(공유 카운터)로 검증 — 큐 미적용 시 중복/유실, 적용 시 정확. (리스너 레벨 또는 KeyedSerializer 단위로 RMW 시뮬레이션.)

> 기존 listener 동작 회귀 방지: `bot-voice-event.listener` 의 기존 테스트가 있으면 통과 유지(래핑이 라우팅/로깅 동작을 바꾸지 않음). 없으면 본 작업에서 추가 강제하지 않음(범위 최소화).

---

## 9. 회귀 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| **처리 지연(직렬화 대기)** | 같은 유저의 후속 이벤트가 앞 이벤트 완료까지 대기. `handle()` 내 외부 호출(excluded/config/auto-channel)이 느리면 큐 누적 | 유저당 빈도 낮음 + 유저 간 병렬 → 체감 미미. fire-and-forget 호출은 경계 밖이라 큐 점유 안 함 |
| **데드락 가능성** | task 내부에서 같은 key 로 재귀 `runExclusive` 호출 시 자기 tail 대기 → 영구 블록 | 현 listener 경로에 재귀 호출 없음. 코드리뷰에서 "task 내부 재진입 금지" 확인 |
| **Map 누수** | 정리 로직 버그 시 유휴 key 잔존 | 드레인 검사 + 단위 테스트(케이스 6)로 보증 |
| **에러 chain 굳음** | 흡수 누락 시 한 번 reject 후 key chain 영구 reject | `settled`(양쪽 흡수) 분리 + 에러격리 테스트(케이스 4)로 보증 |
| **fire-and-forget 순서** | 경계 밖 비동기는 기존과 동일 — 변화 없음(의도) | RMW 경로만 보호, 나머지 동작 불변 |
| **emitAsync 대기 증가** | 컨트롤러 응답이 큐 완료까지 대기 → 봇 HTTP 왕복 시간 소폭 증가 가능 | 봇 호출은 비동기 fire-and-forget(dispatcher 가 await 하나 discord 핸들러는 미await) → 사용자 체감 없음 |

---

## 10. 작업 순서 (implementer)

1. `apps/api/src/common/concurrency/keyed-serializer.ts` 작성(§4 의사코드).
2. `apps/api/src/common/concurrency/keyed-serializer.spec.ts` 작성(§8 케이스 1–6).
3. `common.module.ts` 에 `KeyedSerializer` providers+exports 등록.
4. `bot-voice-event.listener.ts` 생성자 주입 + `handle()` 래핑(§5).
5. `pnpm --filter @onyu/api test` (또는 프로젝트 vitest 명령) + `pnpm --filter @onyu/api lint` 통과 확인.
6. (있으면) listener 기존 테스트 통과 확인.

---

## § manifest 갱신 필요

- **변경 종류**: (d) 변경 없음.
- 본 작업은 `voice` 도메인 기존 코드(`code.api` 하위 `apps/api/src/bot-api/voice/`, `apps/api/src/common/`)에만 한정된다. 신규 도메인·신규 `code.*` 키·status 변경 없음(이미 `implemented`).
- 신규 파일 `apps/api/src/common/concurrency/keyed-serializer.ts` 는 기존 `code.api` 경로 트리(`apps/api/src/**`) 내부이며 매니페스트는 도메인 단위 디렉토리 경로를 기록하므로 개별 파일 등재 불요.
- **manifest 갱신 필요 — 없음.**

### 다른 도메인 영향

- 없음. `apps/bot` / `apps/web` / 타 도메인 코드 수정 없음. `CommonModule`(@Global) 에 provider 1개 추가는 공유 인프라 확장으로, 기존 주입/동작에 영향 없음(신규 export 만 추가).
