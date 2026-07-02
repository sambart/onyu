# co-presence 인메모리 상태 Redis 영속화 구현 계획

> 목적: 동시접속(co-presence) 집계 상태가 **프로세스 인메모리 Map** 에만 존재해, API 재시작/크래시/배포 시 마지막 flush 이후 누적분이 유실되는 문제(서비스 평가 P1 복원력)를 해소한다.
> **DB 스키마 변경 없음.** Redis 스냅샷만 추가한다.
> Status: `implemented` (수정 모드). DB 마이그레이션 없음.

---

## 1. 배경 / 현황 분석

### 1.1 현재 상태 (코드 정독 결과)

- `co-presence.service.ts`
  - `private readonly activeSessions = new Map<string, ActiveCoPresenceSession>()` (key=`${guildId}:${userId}`).
  - `ActiveCoPresenceSession`:
    ```ts
    interface ActiveCoPresenceSession {
      guildId: string;
      channelId: string;
      userId: string;
      startedAt: Date;
      accumulatedMinutes: number;
      peersSeen: Set<string>;       // ← 직렬화 비안전
      peerMinutes: Map<string, number>; // ← 직렬화 비안전
    }
    ```
  - `reconcile(snapshots, processedGuildIds)` — 매 tick 호출. `startSession`/`continueSession`/`endSession`/`endSessionsBatch` 로 Map 누적. 15분 임계치(`FLUSH_THRESHOLD_MINUTES`) 또는 세션 종료(스냅샷에서 사라짐 / 채널 이동) 시 DB flush.
  - `endAllSessions()` — 봇/API 종료 시(`CoPresenceScheduler.onApplicationShutdown`) 전체 flush 후 `activeSessions.clear()`.
  - `endAllGuildSessions(guildId)` — 특정 길드 flush(모코 리셋 등).

- **tick 호출 경로**: `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` → `coPresenceService.reconcile(filtered, processedGuildIds)`. 봇 프로세스의 스케줄러가 HTTP 로 이 컨트롤러를 매 tick(약 1분 간격) 호출한다. **reconcile 은 API 프로세스 안에서 직렬로 실행**된다(동시 호출 없음 — tick 단위).
  - `continueSession` 은 1틱당 `accumulatedMinutes += 1`, `peerMinutes` += 1 → **tick = 1분** 모델임을 확인.

- `co-presence-db.repository.ts` 존재(TypeORM). `RedisService`(`apps/api/src/redis/redis.service.ts`)는 `@Global` + graceful wrapper(`safe()`) — 장애 시 throw 없이 fallback 반환(`get`→null, `set`/`del`→void).
- 기존 Redis repo 패턴: `infrastructure/voice-game-redis.repository.ts` — `RedisService` 주입, key 헬퍼(`voice-game.keys.ts`), `get<T>`/`set(key, value, ttl)`/`del` 사용. 이 패턴을 그대로 따른다.
- 라이프사이클 훅: co-presence 디렉토리에 `OnModuleInit`/`OnApplicationBootstrap` 사용처 없음. `CoPresenceScheduler` 가 `OnApplicationShutdown` 사용 중.

### 1.2 문제 정의

`activeSessions` Map 은 프로세스 메모리에만 존재한다. flush 는 15분 임계치 또는 세션 종료 시에만 발생하므로, **최대 ~15분(FLUSH_THRESHOLD_MINUTES) 분량의 누적분이 미저장 상태로 메모리에 머문다.** API 가 그 사이 크래시/강제 종료/배포되면 해당 누적분이 영구 유실된다. (`onApplicationShutdown` 의 정상 종료 flush 는 SIGKILL/크래시에서는 동작하지 않음.)

---

## 2. 설계 결정 (요약)

| 항목 | 결정 | 근거 |
|---|---|---|
| **방식** | **전체 스냅샷**(Map 전체를 Redis 키 1개에 통째 저장) | per-세션 해시는 tick마다 RMW 원자성 문제 재발. 스냅샷은 "현재 메모리 상태" 1회 덤프라 단순·원자적. |
| **저장 시점** | `reconcile()` 완료 직후 **매 tick** (best-effort, await 하되 fail-soft) | Map 크기 작음(동접 인원수 수준), tick 간격 ~1분 → 쓰기 비용 저렴. 손실창 ≈ 0(직전 tick 상태까지 복원). |
| **Redis 키** | 단일 키 `co-presence:snapshot` | Map 전체가 한 객체. SCAN 불필요. |
| **TTL** | **무 TTL + 부팅 시 stale 검증**(`savedAt` 메타 포함, 임계 초과 시 폐기) | 스냅샷은 "마지막 살아있던 상태"라 만료되면 안 됨. 단, 장기 다운 후 부팅 시 오래된 상태 복원 방지를 위해 부팅 시점에 나이 검증. |
| **복원 시점** | `OnApplicationBootstrap`(또는 `OnModuleInit`) 에서 Redis 읽어 `activeSessions` 복원 | 모든 의존성 주입 완료 후 1회. |
| **fail-soft** | 저장 실패(=RedisService fallback) → reconcile 본 동작 계속. 복원 실패/없음/손상 → 빈 Map graceful 시작 | Redis 단일 장애점이 음성 추적 중단시키지 않음(기존 `safe()` 철학 일치). |
| **레이어링** | 신규 `infrastructure/co-presence-snapshot.repository.ts` 로 분리 | 기존 `voice-game-redis.repository.ts` / `co-presence-db.repository.ts` 분리 패턴과 정합. 직렬화/역직렬화 캡슐화. |

---

## 3. 신설/변경 파일

### 3.1 신설 — `apps/api/src/channel/voice/co-presence/infrastructure/co-presence-snapshot.repository.ts`

스냅샷 직렬화/역직렬화 + Redis I/O 캡슐화. (워크트리 신규 파일, `code.api` 하위.)

```ts
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../redis/redis.service';

/** 스냅샷 Redis 키 (단일). */
const SNAPSHOT_KEY = 'co-presence:snapshot';

/**
 * 부팅 시 이 나이(ms)를 초과한 스냅샷은 stale 로 간주하고 폐기한다.
 * FLUSH_THRESHOLD_MINUTES(15분) 의 누적 의미가 깨지지 않는 선에서 보수적으로 설정.
 * 권고: 30분. (장기 다운 후 부팅 시 오래된 누적 세션 이어붙임 방지)
 */
const SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;

/** JSON 안전 형태로 직렬화된 단일 세션. */
interface SerializedSession {
  guildId: string;
  channelId: string;
  userId: string;
  startedAtEpoch: number;          // Date → epoch ms
  accumulatedMinutes: number;
  peersSeen: string[];             // Set → array
  peerMinutes: [string, number][]; // Map → entries
}

/** Redis 에 저장되는 스냅샷 봉투. */
interface SnapshotEnvelope {
  version: 1;
  savedAt: number;                 // epoch ms — stale 검증용
  sessions: [string, SerializedSession][]; // Map<key, session> entries
}

/** 서비스 ↔ 리포지토리 간 도메인 형태(서비스의 ActiveCoPresenceSession 과 동일 shape). */
export interface RestorableSession {
  guildId: string;
  channelId: string;
  userId: string;
  startedAt: Date;
  accumulatedMinutes: number;
  peersSeen: Set<string>;
  peerMinutes: Map<string, number>;
}

@Injectable()
export class CoPresenceSnapshotRepository {
  private readonly logger = new Logger(CoPresenceSnapshotRepository.name);

  constructor(private readonly redis: RedisService) {}

  /** 활성 세션 Map 전체를 Redis 스냅샷으로 저장 (best-effort, fail-soft). */
  async save(sessions: Map<string, RestorableSession>): Promise<void> {
    const envelope: SnapshotEnvelope = {
      version: 1,
      savedAt: Date.now(),
      sessions: [...sessions].map(([key, s]) => [key, this.serialize(s)]),
    };
    await this.redis.set(SNAPSHOT_KEY, envelope); // 무 TTL. RedisService.safe() 가 장애 흡수.
  }

  /**
   * Redis 스냅샷을 읽어 복원 가능한 Map 반환.
   * 없음/손상/stale → 빈 Map (graceful).
   */
  async load(): Promise<Map<string, RestorableSession>> {
    const empty = new Map<string, RestorableSession>();
    const envelope = await this.redis.get<SnapshotEnvelope>(SNAPSHOT_KEY);
    if (!envelope) return empty;

    if (envelope.version !== 1 || !Array.isArray(envelope.sessions)) {
      this.logger.warn('[CO-PRESENCE] 스냅샷 손상/미지원 버전 — 빈 상태로 시작');
      return empty;
    }
    if (Date.now() - envelope.savedAt > SNAPSHOT_MAX_AGE_MS) {
      this.logger.warn('[CO-PRESENCE] 스냅샷 stale — 폐기 후 빈 상태로 시작');
      return empty;
    }

    try {
      const restored = new Map<string, RestorableSession>();
      for (const [key, s] of envelope.sessions) {
        restored.set(key, this.deserialize(s));
      }
      return restored;
    } catch (err) {
      this.logger.warn('[CO-PRESENCE] 스냅샷 역직렬화 실패 — 빈 상태로 시작');
      return empty;
    }
  }

  /** 스냅샷 삭제 (정상 종료 flush 후 중복 복원 방지). */
  async clear(): Promise<void> {
    await this.redis.del(SNAPSHOT_KEY);
  }

  private serialize(s: RestorableSession): SerializedSession {
    return {
      guildId: s.guildId,
      channelId: s.channelId,
      userId: s.userId,
      startedAtEpoch: s.startedAt.getTime(),
      accumulatedMinutes: s.accumulatedMinutes,
      peersSeen: [...s.peersSeen],
      peerMinutes: [...s.peerMinutes],
    };
  }

  private deserialize(s: SerializedSession): RestorableSession {
    return {
      guildId: s.guildId,
      channelId: s.channelId,
      userId: s.userId,
      startedAt: new Date(s.startedAtEpoch),
      accumulatedMinutes: s.accumulatedMinutes,
      peersSeen: new Set(s.peersSeen),
      peerMinutes: new Map(s.peerMinutes),
    };
  }
}
```

> 참고: 역직렬화 시 `s.peersSeen`/`s.peerMinutes` 가 배열이 아닐 경우 `new Set(...)`/`new Map(...)` 에서 throw → `catch` 가 빈 Map 으로 graceful. 추가로 per-session 가드(필수 필드 누락 skip)를 넣을지는 구현자 재량(권고: 손상 세션 1개가 전체를 버리지 않도록 per-session try/continue 도 고려).

### 3.2 변경 — `co-presence.service.ts`

`ActiveCoPresenceSession` 의 shape 은 `RestorableSession` 과 동일하다. **두 타입을 통합**한다(서비스가 `RestorableSession` 을 import 하여 `ActiveCoPresenceSession = RestorableSession` 으로 정의하거나, repo 가 서비스 인터페이스를 import). 권고: repo 에 `RestorableSession` 을 두고 서비스가 이를 사용(직렬화 책임을 repo 로 응집).

변경 포인트:

1. **생성자 주입 추가**: `private readonly snapshotRepo: CoPresenceSnapshotRepository`.

2. **`OnApplicationBootstrap` 구현** (신규 메서드):
   ```ts
   async onApplicationBootstrap(): Promise<void> {
     const restored = await this.snapshotRepo.load();
     for (const [key, session] of restored) {
       this.activeSessions.set(key, session);
     }
     if (restored.size > 0) {
       this.logger.log(`[CO-PRESENCE] 스냅샷 복원: ${restored.size} 세션`);
     }
   }
   ```
   - `OnApplicationBootstrap` 선택 근거: 모든 모듈 의존성 주입 완료 후 1회. `OnModuleInit` 도 가능하나, RedisService(`@Global`)는 둘 다에서 사용 가능하므로 onyu 컨벤션 상 `OnApplicationBootstrap` 권고(`OnApplicationShutdown` 과 대칭).

3. **`reconcile()` 말미에 스냅샷 저장 추가**:
   ```ts
   // 기존 길드별 배치 DB 저장 블록 이후, 메서드 끝에:
   await this.snapshotRepo.save(this.activeSessions);
   ```
   - `save()` 내부는 `RedisService.safe()` 로 감싸져 throw 하지 않음 → reconcile 본 동작에 영향 없음(fail-soft 확보). 그래도 방어적으로 try/catch + warn 로깅 추가 권고(`floating promise`/ESLint `return await` 룰 준수: `await` 하되 에러는 삼킴).

4. **`endAllSessions()` 말미에 스냅샷 삭제**:
   ```ts
   // 전체 flush + clear() 이후:
   await this.snapshotRepo.clear();
   ```
   - 정상 종료 시 모든 세션이 DB 로 flush 되었으므로 스냅샷은 무효 → 삭제하여 재시작 시 중복 복원 방지.
   - `sessions.length === 0` early return 케이스에서도 `clear()` 가 호출되도록 early return **앞**에 배치(또는 메서드 끝 단일 지점으로 재배치). **중요**: 현재 `endAllSessions` 는 `if (sessions.length === 0) return;` 가 `clear()` 전에 있으므로, `clear()` 를 그 return 보다 위로 올리거나 early return 제거 필요.

5. **`endAllGuildSessions()` 처리**: 특정 길드만 flush 하고 나머지 길드 세션은 메모리에 남는다 → **다음 tick 의 `reconcile()` 끝 `save()` 가 자연 갱신**하므로 별도 스냅샷 갱신 불필요. (단, 모코 리셋 직후 크래시 시 해당 길드가 이미 flush 됐는데 직전 스냅샷엔 남아있는 미세 창 존재 — §5.3 에서 분석.) 보수적으로 `endAllGuildSessions` 말미에도 `save(this.activeSessions)` 호출 권고(저렴, 정합성 ↑).

### 3.3 변경 — `co-presence.module.ts`

`CoPresenceSnapshotRepository` 를 `providers` 에 추가. (RedisModule 은 `@Global` 이므로 import 불필요.) export 불필요(서비스 내부 사용).

---

## 4. 직렬화/역직렬화 (의사코드 요약)

| 필드 | 메모리 타입 | 직렬화 | 역직렬화 |
|---|---|---|---|
| `startedAt` | `Date` | `.getTime()` → epoch ms (number) | `new Date(epoch)` |
| `peersSeen` | `Set<string>` | `[...set]` → string[] | `new Set(array)` |
| `peerMinutes` | `Map<string,number>` | `[...map]` → `[string,number][]` | `new Map(entries)` |
| `accumulatedMinutes` / id 필드 | primitive | 그대로 | 그대로 |
| Map<key,session> 전체 | `Map` | `[...map]` → `[key, serialized][]` | 루프 `set` |

봉투(`SnapshotEnvelope`)에 `version`(스키마 진화 대비) + `savedAt`(stale 검증) 포함.

---

## 5. 흐름도 & 정합성 분석

### 5.1 저장 흐름 (매 tick)
```
봇 스케줄러 → bot-co-presence.controller → coPresenceService.reconcile()
  ├─ start/continue/end (Map 누적)
  ├─ 임계치/종료 세션 → endSessionsBatch → DB flush
  └─ snapshotRepo.save(activeSessions)   ← 신규 (best-effort)
        └─ RedisService.set('co-presence:snapshot', envelope)  [safe(): 장애 시 no-op]
```

### 5.2 복원 흐름 (부팅)
```
API 부팅 → CoPresenceService.onApplicationBootstrap()
  └─ snapshotRepo.load()
        ├─ 키 없음 → 빈 Map (정상 — 첫 기동/정상종료 후)
        ├─ 손상/버전불일치 → warn + 빈 Map
        ├─ stale(>30분) → warn + 빈 Map
        └─ 정상 → deserialize → activeSessions 복원
  → 다음 tick reconcile 이 복원된 세션을 continue/end 로 정상 처리
```

### 5.3 중복 집계 / 손실창 분석 (핵심)

**스냅샷은 flush 와 독립적인 "현재 메모리 상태"다.** flush 는 DB 에 누적분을 쓰고 메모리 세션을 (회전/종료) 갱신한다. 스냅샷은 그 갱신 **이후** 메모리 상태를 덤프한다. 따라서:

- **정상 케이스 (이중 가산 없음)**: tick N 에서 임계치 세션이 flush(DB 기록) → `startSession` 으로 메모리 세션 리셋(`accumulatedMinutes=1`) → `save()` 는 리셋된 세션을 저장. 재시작 복원 시 리셋된 세션부터 이어감 → DB 에 이미 쓴 누적분과 겹치지 않음. **OK.**

- **손실창 ≈ 0**: 매 tick 저장이므로, 크래시 시 최대 손실은 "마지막 tick 의 reconcile 이 끝난 뒤 ~ 다음 save 완료 전" 사이 = 사실상 0~1 tick(1분) 미만. 기존 최대 15분 손실 대비 대폭 개선.

- **잠재 이중 가산 창 (경계)**: tick N 에서 `endSessionsBatch` 의 DB write 가 성공했으나 그 직후(같은 reconcile 내 `save()` 호출 전) 크래시한 경우 → 스냅샷은 **이전 tick(N-1)** 상태(아직 flush 전, `accumulatedMinutes` 큰 값)로 남아있음 → 복원 시 그 세션을 이어 누적 → **다음 종료 때 N-1 누적분을 다시 DB 에 가산**.
  - 영향 범위: `save()` 는 reconcile **맨 끝**에 위치하므로, DB flush 와 save 사이 창은 단일 tick 내 매우 짧다(수 ms~수십 ms). 그리고 flush 대상은 "임계치 도달(15분) 또는 종료" 세션에 한정 → 대부분 tick 에서 flush 없음 → 이 창에 걸릴 확률 낮음.
  - **수용 결정**: 본 작업은 P1 "전량 유실" → "드물게 최대 15분 이중 가산 가능"으로 리스크 성격을 바꾼다(유실 < 소량 중복). co-presence 는 통계/리포트 용도라 소량 중복이 유실보다 허용 가능. **완전 방지는 범위 외**(트랜잭션+스냅샷 원자화 필요 → Redis/PG 2PC 부재로 불가). 계획에 명시하고 수용.
  - 완화 옵션(선택, 구현자 판단): `endSessionsBatch` DB write **직후** 즉시 `save()` 1회 추가 호출(창을 DB write 완료 직후로 좁힘). 단 중복 save 비용 발생 → 권고는 "기본은 reconcile 끝 1회, 필요 시 endSessionsBatch 후 추가". **기본안 채택**(단일 지점).

- **`endAllSessions` 후 stale 복원 방지**: 정상 종료 시 flush + `clear()` → 키 삭제 → 재시작 시 빈 Map. **OK.** (SIGKILL 등 비정상 종료 시엔 `clear()` 미실행 → 마지막 tick 스냅샷 복원 = 의도된 동작.)

- **stale 검증의 역할**: API 가 장기간(>30분) 다운 후 부팅하면, 그 사이 사람들은 음성채널을 떠났을 가능성이 큰데 스냅샷의 `startedAt`/누적은 멈춘 시점 기준 → 부팅 직후 그 세션들은 다음 tick 스냅샷에서 사라져 `endSessionsBatch` 로 flush 되며 **다운타임을 활동시간으로 오집계**할 수 있음. `SNAPSHOT_MAX_AGE_MS`(30분) 초과 시 폐기로 이 오집계를 차단. (30분은 권고값 — `FLUSH_THRESHOLD_MINUTES`=15분의 2배. 운영 중 조정 가능.)

### 5.4 Redis 키/TTL 결정
- 키: `co-presence:snapshot` (단일, 콜론 네임스페이스 — 기존 `VoiceGameKeys` 컨벤션과 일치하는 prefix 스타일).
- TTL: **없음**(스냅샷은 "최신 살아있던 상태"라 만료되면 안 됨). 대신 봉투 `savedAt` + 부팅 시 `SNAPSHOT_MAX_AGE_MS` 검증으로 stale 차단.

---

## 6. fail-soft 처리 정리

| 지점 | 장애 | 동작 |
|---|---|---|
| `save()` | Redis set 실패 | `RedisService.safe()` 가 no-op 반환 → reconcile 정상 완료. 메모리 상태는 살아있음. |
| `load()` | Redis get 실패/null | `safe()` → null → 빈 Map → graceful 빈 시작. |
| `load()` | 손상/버전불일치/stale | warn 로깅 + 빈 Map. **크래시 금지.** |
| `clear()` | Redis del 실패 | `safe()` no-op. 다음 부팅 시 stale 검증/다음 tick save 가 자가 치유. |

모든 경로에서 Redis 장애가 co-presence 본 집계를 throw 로 중단시키지 않는다(기존 `safe()` 철학 유지).

---

## 7. 테스트 관점 (`*.spec.ts`, 동일 디렉토리)

신설: `infrastructure/co-presence-snapshot.repository.spec.ts` (단위) + `co-presence.service.spec.ts` 또는 기존 spec 확장.

| # | 테스트 | 검증 |
|---|---|---|
| T1 | **직렬화 라운드트립** | `save()` 한 Map ↔ `load()` 결과가 deep-equal(Date/Set/Map 타입 보존, peerMinutes 값 일치). RedisService mock(in-memory). |
| T2 | **복원 정상** | 복원된 세션이 `activeSessions` 에 들어가고, 이어지는 `continueSession` 이 `accumulatedMinutes += 1`/`peerMinutes` 정상 증가. |
| T3 | **빈 스냅샷** | 키 없음(`get`→null) → `load()` = 빈 Map, `onApplicationBootstrap` 크래시 없음. |
| T4 | **손상 스냅샷** | `get` 이 `{version:99}` / `sessions: 'bad'` / 비정상 JSON shape 반환 → 빈 Map + warn, no throw. |
| T5 | **stale 스냅샷** | `savedAt` 가 31분 전 → `load()` 빈 Map(폐기). 29분 전 → 정상 복원. |
| T6 | **Redis 장애 fail-soft (save)** | RedisService.set 이 reject(실제론 safe 가 흡수) mock → `reconcile()` 가 throw 없이 완료, DB flush 정상. |
| T7 | **Redis 장애 fail-soft (load)** | `get` reject/null → `onApplicationBootstrap` 빈 시작. |
| T8 | **중복방지 — 정상 회전** | 임계치 flush 직후 save → 리셋 세션(`accumulatedMinutes=1`) 저장 확인 → 복원 시 누적이 0/1부터 시작(이미 flush 된 분량 미포함). |
| T9 | **endAllSessions 후 clear** | 정상 종료 → DB flush + `clear()` 호출(`del` 호출) 확인. `sessions.length===0` 케이스에서도 `clear()` 호출되는지(early return 재배치 회귀 방지). |
| T10 | **save 호출 시점** | `reconcile()` 1회당 `snapshotRepo.save` 정확히 1회 호출(스파이). |

기존 회귀: `co-presence-analytics-new-methods.spec.ts`, `co-presence-db.repository.integration-spec.ts` 영향 없어야 함(서비스 시그니처 변경 없음 — `reconcile`/`endAllSessions` public 시그니처 불변).

---

## 8. 회귀 리스크

1. **`endAllSessions` early return 재배치**: 현재 `if (sessions.length === 0) return;` 가 `clear()` 보다 위 → `clear()` 를 return 위로 올리거나 제거 필요. 잘못 두면 빈 세션 종료 시 스냅샷이 안 지워져 재시작 시 stale 복원(중복 집계) 가능. **T9 로 가드.**
2. **`OnApplicationBootstrap` 도입**: `CoPresenceService` 가 새 라이프사이클 훅 구현 → 테스트 모듈 부트스트랩 시 `snapshotRepo` mock 필요. 기존 서비스 단위 테스트가 있다면 provider 추가 필요.
3. **타입 통합**: `ActiveCoPresenceSession` ↔ `RestorableSession` shape 일치 강제. 향후 `ActiveCoPresenceSession` 에 필드 추가 시 직렬화/역직렬화 동기화 누락 위험 → serialize/deserialize 에 모든 필드 명시(주석으로 "필드 추가 시 동기화" 경고).
4. **`save()` 비용**: 매 tick Redis set 1회 추가(네트워크 왕복 1). Map 크기 = 동시 음성접속 인원 수준(수십~수백) → JSON 직렬화/전송 저렴. 부하 무시 가능. (대규모 길드 다수 시 모니터링 권고이나 현 규모에선 비이슈.)
5. **이중 가산(§5.3 경계 창)**: 드문 타이밍에 최대 ~15분 이중 가산 가능 — **수용된 트레이드오프**(전량 유실 제거가 우선). 통계 용도라 허용.
6. **`endAllGuildSessions` 후 미저장 창**: 권고대로 말미 `save()` 추가 시 완화. 미추가해도 다음 tick save 가 자연 치유.

---

## 9. manifest 갱신 필요

- **변경 종류**: (d) 변경 없음.
- **상세**:
  - `voice-co-presence` 도메인은 이미 `implemented`. 신설 파일(`infrastructure/co-presence-snapshot.repository.ts` + spec)은 기존 `code.api` glob(`apps/api/src/channel/voice/co-presence/**`) 범위 안 → `code.*` 신규 키 불필요.
  - status 변경 없음(`implemented` 유지). 신규 도메인 없음. DB 마이그레이션 없음 → `code.migrations` 무관.
- **manifest 갱신 필요 — 없음.**

> (참고: feature-manifest.json 의 `voice-co-presence` `code.api`/`code.tests` 가 정확히 어떤 glob 인지는 구현자가 Phase 7 에서 확인. 본 신설 파일이 그 glob 에 포함되지 않는 경우에 한해서만 `code.tests`/`code.api` 경로 보강 검토 — 현재로선 동일 디렉토리이므로 불필요로 판단.)
