# 크론 분산락 + 시간분산 구현 계획

> 출처: 서비스 평가 리포트 P1 / 복원력. 자정 크론 3종 동시폭주 + overlap guard 부재 해소.
> **DB 변경 없음 · 신규 엔드포인트 없음 · 신규 도메인 없음.** 공통 모듈(`common/scheduler`) 신설 + RedisService 락 프리미티브 추가 + 3 스케줄러에 락 적용 + cron stagger.

---

## 1. 현황 (워크트리 실측)

### 일일 스케줄러 3종 — 전부 `00:00 KST` 확정 동시 실행

| 스케줄러 파일 | cron / name / timeZone | 진입 메서드 | 작업 메서드 |
|---|---|---|---|
| `apps/api/src/inactive-member/application/inactive-member.scheduler.ts` | `'0 0 * * *'` / `inactive-member-classify` / `Asia/Seoul` | `runDailyClassify` | `processAllGuilds()` |
| `apps/api/src/newbie/application/mission/mission.scheduler.ts` | `'0 0 * * *'` / `mission-daily-expiry` / `Asia/Seoul` | `runDailyExpiry` | `processExpiredMissions()` |
| `apps/api/src/newbie/application/moco/moco-reset.scheduler.ts` | `'0 0 * * *'` / `moco-period-reset` / `Asia/Seoul` | `runDailyReset` | `processAllGuilds()` |

> **브리핑 정정**: 브리핑은 inactive 가 `timeZone` 미지정이라 했으나, 워크트리 실측 결과 **이미 `timeZone: 'Asia/Seoul'` 지정됨**. 따라서 3종 모두 **00:00 KST 결정적 동시 실행**이다 (TZ 추정 불필요). docker-compose / `.env` / Dockerfile 어디에도 `TZ=` 설정은 없음 — 그러나 세 스케줄러 모두 `timeZone` 옵션으로 KST 고정이므로 process TZ 와 무관.
> inactive 에는 별도로 `'30 19 * * *'` `inactive-trend-retention`(`purgeTrendData`)도 있으나 자정 폭주와 무관 → **본 계획 범위 외**(락 미적용, stagger 미적용).

각 진입 메서드는 동일 패턴: `logger.log` → `try { await this.processX() } catch { logger.error(...) }`. **overlap guard(직전 실행 미완료 시 skip) 전무** — 처리 지연 시 다음 실행이 중첩 가능. 멀티 인스턴스 스케일아웃 시 모든 인스턴스가 동시 실행.

### 기존 자산

- `RedisService`(`apps/api/src/redis/redis.service.ts`) — 모든 명령이 `safe<T>(op, run, fallback)` 래퍼로 감싸짐: **Redis 에러 시 throw 하지 않고 fallback 반환**(graceful degradation). `set(key, value, ttlSeconds?)` 는 `SET ... EX` 만 사용, **NX 없음**.
- `RedisModule`(`apps/api/src/redis/redis.module.ts`) — `@Global()`, `RedisService` + `REDIS_CLIENT`(ioredis 인스턴스) 둘 다 export. 전역이므로 추가 import 없이 어디서나 `RedisService` 주입 가능.
- NX 전례: `apps/api/src/status-prefix/infrastructure/status-prefix-redis.repository.ts:39` 에서 raw client 로 `await this.client.set(key, JSON.stringify(nickname), 'NX')` → `result === 'OK'` 패턴 사용 중. (단 이건 `EX` 없는 NX. 본 계획은 `EX`+`NX` 동시 필요.)
- 랜덤 토큰: `node:crypto` 의 `randomBytes` 가 `apps/api/src/auth/application/auth.service.ts:1` 에서 사용 중(`randomBytes(n).toString('base64url')`). 프로젝트 컨벤션상 `node:crypto` import. **`randomUUID` 는 api/src 에서 미사용** → 기존 컨벤션 따라 `randomBytes(16).toString('hex')` 사용 권장.
- 테스트: **vitest** (`vi.fn`, `vi.mock`). Jest 아님. 기존 `redis.service.spec.ts`, `inactive-member.scheduler.spec.ts` 가 vitest mock 패턴.

---

## 2. 설계 결정 (핵심)

### 결정 A — setNx 는 safe() 래퍼를 우회한다 (에러 vs 점유 구분)

락은 **"이미 점유됨(false)"** 과 **"Redis 에러"** 를 구분해야 한다. 기존 `safe()`를 그대로 쓰면 에러도 `false`(점유됨)로 합쳐져 구분 불가 → fail-open 판단을 못 한다.

→ `setNx` / `delIfMatch` 는 `safe()` **미적용**. 내부에서 try/catch 후 **에러 시 throw**(또는 명시적 에러 시그널)하여, 상위 `SchedulerLockService` 가 점유(false)와 에러(throw)를 구분하게 한다.

| 케이스 | ioredis 반환 | `setNx` 반환 |
|---|---|---|
| 락 획득 성공 | `'OK'` | `true` |
| 이미 점유 | `null` | `false` |
| Redis 에러 | throw | **throw 그대로 전파** (catch 안 함) |

### 결정 B — Redis 에러 시 **fail-open** (락 없이 실행 + warn)

미션 만료·moco 리셋·inactive 분류는 **일일 핵심 작업**이다. Redis 장애로 skip 하면 **그날 미실행**(미션이 만료 처리 안 됨, moco 리셋 누락 등) → 사용자 영향 큼.

- **현재 onyu 는 단일 인스턴스 운영**(스케일아웃 미구성) → 동시 중복 실행 위험이 현실적으로 없음.
- 반면 Redis 장애는 실제로 발생 가능(graceful degradation 정책이 그 전제).

→ **fail-open 채택**: `setNx` 가 throw(Redis 에러)하면 락 없이 task 실행 + `logger.warn('lock acquire failed, running without lock')`.

> ⚠️ **멀티 인스턴스 스케일아웃 시 트레이드오프**: fail-open 은 "Redis 다운 + 멀티 인스턴스" 동시 상황에서 중복 실행 가능. 이 위험을 `SchedulerLockService` 주석으로 명시하고, 향후 스케일아웃 시 fail-closed 전환 또는 Redis HA 전제 검토 항목으로 남긴다. 현 단일 인스턴스 + 핵심성 우선이면 fail-open 이 합리적.

정상 케이스(Redis 살아있고 이미 점유) 는 **skip + warn** — 이게 overlap guard 의 본래 목적.

### 결정 C — 토큰 기반 안전 해제

TTL 만료 후 다른 홀더가 같은 락을 잡았는데 이전 홀더가 뒤늦게 DEL 하면 **타 홀더 락 오삭제** 발생. 방지책: 락 값에 랜덤 토큰 저장 → 해제 시 **자기 토큰일 때만 DEL**.

- 구현: ioredis `eval` 로 Lua 스크립트 atomic 처리.
  ```
  if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end
  ```
- get-check-del(비원자적) 대신 **Lua 채택** — check 와 del 사이 TTL 만료/타 홀더 획득 race 차단. (단일 인스턴스라도 코드 정합성/미래 대비.)

### 결정 D — TTL 권고: 작업별 차등, 보수적

| 락 이름 | 작업 부하 | TTL 권고 | 근거 |
|---|---|---|---|
| `mission-daily-expiry` | `findExpired` → 길드·미션별 playtime 조회 + status update + 캐시무효화 + embed 갱신. 만료 미션 수에 비례, embed/Discord API 호출 포함 | **900s (15분)** | Discord API + 다길드 루프. 보수적 상한. |
| `moco-period-reset` | moco-enabled 길드별 SCAN+DEL + flushGuildSessions + embed | **900s (15분)** | SCAN 다회 + Discord embed. |
| `inactive-member-classify` | 설정 길드별 `classifyGuild` + trend snapshot + auto action(Discord) | **900s (15분)** | 길드 수·멤버 수 비례, auto action Discord 호출. |

- 공통 **900s** 로 통일 제안(개별 튜닝 불필요, 보수적). TTL 은 "최악 실행시간 상한"이지 정상 실행시간이 아님 — task 정상 종료 시 finally 에서 즉시 해제하므로 TTL 길어도 부작용 없음(다음날 실행까지 24h 간격이라 잔존 락 충돌 없음).
- TTL 너무 짧으면 실행 중 만료 → 다른 인스턴스가 중복 획득 위험. 24h 주기라 900s 는 충분히 안전한 상한.

---

## 3. 신설/변경 파일

### 3.1 변경 — `apps/api/src/redis/redis.service.ts` (Persistence / 락 프리미티브 추가)

`safe()` 우회 메서드 2종 추가:

```ts
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
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  const result = await this.client.eval(script, 1, key, token);
  return Number(result);
}
```

- **시그니처 확인**: ioredis `set(key, value, 'EX', ttl, 'NX')` 오버로드 존재(string return `'OK'|null`). `eval(script, numKeys, ...args)` 표준. spec 의 `MockRedisClient` 인터페이스에 `eval` 필드 추가 필요(현재 없음).
- `value` 는 직렬화하지 않음(토큰은 이미 문자열) — 기존 `set`은 `JSON.stringify` 하지만 락 토큰은 plain string 으로 저장(delIfMatch 비교 일치 위해).

### 3.2 신설 — `apps/api/src/common/scheduler/scheduler-lock.service.ts` (공통 모듈)

```ts
@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);
  constructor(private readonly redis: RedisService) {}

  /**
   * 분산 락으로 task를 상호배타 실행한다.
   * - 획득: task 실행 후 finally에서 자기 토큰일 때만 해제
   * - 이미 점유: skip + warn (overlap guard)
   * - Redis 에러: fail-open — 락 없이 task 실행 + warn
   *   (현 단일 인스턴스 + 일일 핵심작업 미실행 방지 우선. 멀티 인스턴스 스케일아웃 시 중복실행 위험 → 재검토.)
   */
  async runExclusive(lockName: string, ttlSec: number, task: () => Promise<void>): Promise<void> {
    const key = `scheduler:lock:${lockName}`;
    const token = randomBytes(16).toString('hex');
    let acquired = false;
    try {
      acquired = await this.redis.setNx(key, token, ttlSec);
    } catch (err) {
      this.logger.warn(`[LOCK] ${lockName} 획득 중 Redis 에러 — 락 없이 실행(fail-open)`, getErrorStack(err));
      await task(); // fail-open
      return;
    }
    if (!acquired) {
      this.logger.warn(`[LOCK] ${lockName} 이미 점유됨 — skip (직전 실행/타 인스턴스 진행 중)`);
      return;
    }
    try {
      await task();
    } finally {
      try {
        await this.redis.delIfMatch(key, token);
      } catch (err) {
        this.logger.warn(`[LOCK] ${lockName} 해제 실패 — TTL로 자연 만료 예정`, getErrorStack(err));
      }
    }
  }
}
```

- import: `randomBytes` from `node:crypto`(기존 컨벤션), `getErrorStack` from `../util/error.util`.
- **함수 50줄 ESLint warn 주의** — 위 메서드는 ~30줄 OK. 헬퍼 분리 불필요.

### 3.3 신설 — `apps/api/src/common/scheduler/scheduler.module.ts`

```ts
@Module({
  imports: [RedisModule],            // RedisService 주입 (RedisModule이 @Global이라 생략 가능하나 명시 권장)
  providers: [SchedulerLockService],
  exports: [SchedulerLockService],
})
export class SchedulerLockModule {}
```

- **모듈 등록 전략**: `SchedulerLockModule` 을 신설하고, 이를 import 하는 모듈(`InactiveMemberModule`, `NewbieModule`)에 추가. 단, `CommonModule` 이 `@Global()` 이므로 **대안**으로 `SchedulerLockService` 를 `CommonModule` 의 providers/exports 에 직접 추가하면 전 모듈에서 주입 가능(별도 import 불필요). → **권고: CommonModule 에 등록**(전역 노출, import 보일러플레이트 제거). 이 경우 `scheduler.module.ts` 미생성, `CommonModule` providers/exports 에 `SchedulerLockService` 추가.
  - 단 `CommonModule` 의 `imports` 에 `RedisModule` 이미 존재 → 추가 import 불요.
  - **이 결정은 구현 시 확정**: (1) 독립 `SchedulerLockModule` + 2개 모듈 import, vs (2) `CommonModule` 전역 등록. 본 계획은 **(2) CommonModule 전역 등록** 을 1순위 권고(보일러플레이트 최소, 이미 @Global).

### 3.4 변경 — 3 스케줄러에 락 적용

각 진입 메서드의 `try { await this.processX() }` 를 `runExclusive` 로 감싼다. 기존 try/catch·로깅 보존. lockName = cron name 재사용. 생성자에 `SchedulerLockService` 주입 추가.

**mission.scheduler.ts**
```ts
constructor(... , private readonly schedulerLock: SchedulerLockService) {}

@Cron('0 0 * * *', { name: 'mission-daily-expiry', timeZone: 'Asia/Seoul' })
async runDailyExpiry(): Promise<void> {
  this.logger.log('[MISSION SCHEDULER] Starting daily expiry check...');
  try {
    await this.schedulerLock.runExclusive('mission-daily-expiry', 900, () => this.processExpiredMissions());
  } catch (err) {
    this.logger.error('[MISSION SCHEDULER] Unhandled error during expiry check', getErrorStack(err));
  }
}
```
동일 패턴을 `moco-reset.scheduler.ts`(`runDailyReset` → `'moco-period-reset'`, 900) / `inactive-member.scheduler.ts`(`runDailyClassify` → `'inactive-member-classify'`, 900) 에 적용. inactive 의 `purgeTrendData`(19:30)는 **건드리지 않음**.

> CommonModule 전역 등록 채택 시 두 도메인 모듈 변경 불필요(주입만 추가). 독립 모듈 채택 시 `NewbieModule`/`InactiveMemberModule` imports 에 `SchedulerLockModule` 추가.

### 3.5 시간분산 (cron stagger)

자정 폭주 완화 위해 분(minute) 어긋나게 분산. **동작 영향 없음 근거**: 세 작업 모두 **날짜 경계(YYYYMMDD / endDate < today) 기반** — 자정 직후 수 분 시프트는 "오늘" 날짜 문자열을 바꾸지 않음(`toDateString` 은 KST 00:00~23:59 동일 결과). moco MONTHLY 는 `day===1` 체크, mission 은 `endDate < today` 비교, inactive 는 당일 snapshot — 전부 분 단위 무관.

| 스케줄러 | 변경 전 | 변경 후 | 비고 |
|---|---|---|---|
| mission-daily-expiry | `0 0 * * *` (00:00) | `0 0 * * *` (00:00) | 유지 |
| moco-period-reset | `0 0 * * *` (00:00) | `5 0 * * *` (00:05) | +5분 |
| inactive-member-classify | `0 0 * * *` (00:00) | `10 0 * * *` (00:10) | +10분 |

- 셋 다 `timeZone: 'Asia/Seoul'` **유지**. inactive 도 이미 KST 지정돼 있으므로 현행 유지(추가 변경 불요). TZ 명시 누락 없음.
- **락 + stagger 는 상호 보완**: stagger 가 정상 시 동시 부하를 줄이고, 락이 (지연으로 인한) 중첩·멀티 인스턴스를 방어.

---

## 4. 락 흐름도

```
runDailyX (Cron, 00:0N KST)
  └─ try
       └─ schedulerLock.runExclusive(name, 900, () => processX())
            ├─ token = randomBytes(16).hex
            ├─ setNx(scheduler:lock:name, token, 900)
            │     ├─ throw(Redis 에러) ──▶ warn + processX() 실행(fail-open) ──▶ return
            │     ├─ false(이미 점유)  ──▶ warn(skip) ──▶ return
            │     └─ true(획득)
            │           └─ try processX()
            │              finally delIfMatch(key, token)  // 자기 토큰만 DEL
            │                       └─ throw ──▶ warn(TTL 자연만료)
       catch(err) ──▶ logger.error  // processX 내부 throw 포착(기존 동작 보존)
```

---

## 5. 코드 표면적

| 영역 | 경로 | 변경 종류 |
|---|---|---|
| common (신설) | `apps/api/src/common/scheduler/scheduler-lock.service.ts` | 신규 (기존 `common/` 패턴 내) |
| common (신설, 조건부) | `apps/api/src/common/scheduler/scheduler.module.ts` | 독립 모듈 채택 시만. CommonModule 전역 등록 채택 시 미생성 |
| common (변경) | `apps/api/src/common/common.module.ts` | CommonModule 전역 등록 채택 시 providers/exports 에 `SchedulerLockService` 추가 |
| redis (변경) | `apps/api/src/redis/redis.service.ts` | `setNx` / `delIfMatch` 추가 |
| inactive-member (변경) | `apps/api/src/inactive-member/application/inactive-member.scheduler.ts` | 락 적용 + cron `10 0` |
| newbie (변경) | `apps/api/src/newbie/application/mission/mission.scheduler.ts` | 락 적용 (cron 유지) |
| newbie (변경) | `apps/api/src/newbie/application/moco/moco-reset.scheduler.ts` | 락 적용 + cron `5 0` |
| newbie (변경, 조건부) | `apps/api/src/newbie/newbie.module.ts` | 독립 모듈 채택 시 `SchedulerLockModule` import |
| inactive (변경, 조건부) | `apps/api/src/inactive-member/inactive-member.module.ts` | 독립 모듈 채택 시 `SchedulerLockModule` import |

> 모든 경로는 매니페스트 `code.api`(inactive-member / newbie) 와 `common/`(redis 포함 공통) 하위. **다른 도메인 영향 없음**(redis/common 은 공유 인프라). 신규 도메인/path 신설 없음 — common 하위 신규 파일은 기존 패턴(`common/canvas`, `common/resilience`, `common/llm` 등 하위 디렉토리 + service + module) 내.

---

## 6. 테스트 관점 (vitest)

### 6.1 `redis.service.spec.ts` 보강
- `MockRedisClient` 에 `eval: vi.fn()`, `set` 의 NX 오버로드 케이스 추가.
- `setNx`: `set` 이 `'OK'` 반환 → true / `null` 반환 → false / **에러 throw 시 setNx 도 throw**(safe 우회 검증, fallback 안 함).
- `delIfMatch`: `eval` 1 반환 → 1 / 0 반환 → 0.

### 6.2 신설 `apps/api/src/common/scheduler/scheduler-lock.service.spec.ts`
- **획득 성공**: setNx→true → task 1회 호출 → finally delIfMatch(key, token) 호출(인자 일치).
- **이미 점유**: setNx→false → task **미호출** + `logger.warn`.
- **Redis 에러(fail-open)**: setNx reject → task **호출됨**(락 없이) + warn. (핵심 결정 B 검증)
- **토큰 해제**: delIfMatch 가 setNx 에 넘긴 동일 token 으로 호출되는지.
- **해제 실패 무시**: delIfMatch reject 여도 runExclusive 가 throw 하지 않음(task 결과 보존).
- **task throw 전파**: task 가 throw 하면 finally 해제 후 호출자에게 전파(기존 스케줄러 catch 가 받음).

### 6.3 3 스케줄러 spec 보강
- `SchedulerLockService` mock 주입. `runExclusive` 가 `(name, 900, fn)` 으로 호출되는지 + fn 실행 시 기존 `processX` 동작이 그대로 수행되는지(기존 spec 의 processX 검증을 runExclusive 가 콜백 즉시 호출하도록 mock: `runExclusive: vi.fn((_n,_t,fn)=>fn())`).
- **cron 시간분산 검증**: `@Cron` 데코레이터 메타데이터 또는 Reflect 로 moco=`5 0 * * *`, inactive=`10 0 * * *`, mission=`0 0 * * *` 확인(데코레이터 인자 단위 테스트가 어려우면 코드리뷰/수동 확인으로 대체 명시).

---

## 7. 회귀 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| **fail-open 으로 멀티 인스턴스 + Redis 다운 시 중복 실행** | 미션 만료/moco 리셋 2회 처리(대부분 idempotent 하나 embed 중복 갱신·Discord 호출 중복 가능) | 현 단일 인스턴스라 비현실적. 스케줄러 코드 주석 + 본 plan 에 스케일아웃 시 재검토 명시. 작업 대부분 idempotent(status update, SCAN+DEL, snapshot upsert). |
| **TTL(900s) 내 작업 미완료** | 락 만료 후 다음 실행(24h 후)이라 충돌 없음. 동일일 재실행 없음 | 24h 주기라 잔존 락 자연 만료. TTL 보수적 설정. |
| **setNx 가 plain string 저장 → 기존 set(JSON.stringify) 과 직렬화 불일치** | 락 키 전용(`scheduler:lock:*`)이라 타 코드와 키 충돌 없음 | 락 키 네임스페이스 분리. JSON 비직렬화 의도적(토큰 raw 비교). |
| **`delIfMatch` eval 미지원 환경/권한** | Redis EVAL 차단 환경이면 해제 실패 | 해제 실패는 warn 후 TTL 자연 만료로 흡수(치명 아님). 표준 Redis 는 EVAL 지원. |
| **CommonModule 전역 등록 시 순환 의존** | `CommonModule`→`RedisModule`(이미 import 중) 단방향 → 순환 없음 | 기존 imports 에 RedisModule 존재 확인됨. |
| **stagger 로 inactive 가 00:10 실행 → 자정 직후 데이터 의존 작업 영향** | 날짜경계 기반이라 무영향(§3.5 근거) | 분 단위 시프트가 YYYYMMDD/endDate 비교 결과 불변. |
| **discord-nestjs/@nestjs/schedule cron name 중복 등록 충돌** | name 은 기존값 재사용(변경 없음) → 충돌 없음 | lockName 만 cron name 문자열 재사용, 데코레이터 name 미변경. |

---

## 8. 구현 순서 (implementer 용)

1. `redis.service.ts` — `setNx` / `delIfMatch` 추가 (+ spec 보강).
2. `common/scheduler/scheduler-lock.service.ts` 신설 (+ spec).
3. **모듈 등록 확정**: CommonModule 전역 등록(권고) — `common.module.ts` providers/exports 에 추가. (또는 독립 SchedulerLockModule + 2모듈 import.)
4. 3 스케줄러 — `SchedulerLockService` 주입 + `runExclusive` 래핑 + cron stagger(moco `5 0`, inactive `10 0`) (+ spec 보강).
5. `pnpm --filter @onyu/api lint && pnpm --filter @onyu/api test` 통과 확인.

---

## manifest 갱신 필요

- **변경 종류**: (d) 변경 없음.
- 사유: 영향 도메인(`inactive-member`, `newbie`)은 모두 `status: implemented` 이며 코드가 기존 `code.api`(`apps/api/src/inactive-member/`, `apps/api/src/newbie/`) **하위**에서만 수정된다. 신설 파일(`apps/api/src/common/scheduler/*`, `redis.service.ts` 변경)은 공통 인프라로 매니페스트의 도메인별 `code.*` 키 대상이 아니다(common/redis 는 도메인 매핑 외 공유 영역). 신규 도메인·신규 `code.*` 키·status 변경 모두 없음.
- 테스트 경로: 신설 `scheduler-lock.service.spec.ts` 는 `common/` 하위 — 매니페스트 도메인 `tests` glob(`apps/api/src/{inactive-member,newbie}/**/*.spec.ts`) 범위 밖이나, common 테스트는 별도 도메인 키 없이 루트 vitest 설정이 수집하므로 매니페스트 갱신 불필요.

**manifest 갱신 필요 — 없음** (위 (d) 명시).
