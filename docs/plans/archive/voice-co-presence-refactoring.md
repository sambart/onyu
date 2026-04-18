# Voice Co-Presence 리팩토링 계획

> PRD: [voice-co-presence.md](../specs/prd/voice-co-presence.md)
> 관련 PRD: [newbie.md](../specs/prd/newbie.md) (F-NEWBIE-003)

## 목표

`MocoScheduler`의 폴링 + 세션 추적 로직을 범용 `CoPresenceScheduler`로 추출하고, 모코코 사냥을 이벤트 소비자로 전환한다. 쌍 단위 일별 집계(`PairDaily`)를 통해 사용자 관계 분석의 데이터 기반을 마련한다.

## 변경 파일 목록

### 신규 생성

| 파일 | 역할 |
|------|------|
| `apps/api/src/channel/voice/co-presence/co-presence.module.ts` | 모듈 정의 |
| `apps/api/src/channel/voice/co-presence/co-presence.scheduler.ts` | 60초 폴링, 스냅샷 수집, tick 이벤트 발행 |
| `apps/api/src/channel/voice/co-presence/co-presence.service.ts` | 세션 상태 관리(시작/계속/종료), DB 저장, 세션 종료 이벤트 발행 |
| `apps/api/src/channel/voice/co-presence/co-presence-db.repository.ts` | PostgreSQL 세션/일별집계/쌍일별집계 CRUD |
| `apps/api/src/channel/voice/co-presence/co-presence.events.ts` | 이벤트 상수 + 이벤트 페이로드 인터페이스 정의 |
| `apps/api/src/channel/voice/co-presence/co-presence-cleanup.scheduler.ts` | 90일 초과 세션 자동 삭제 |
| `apps/api/src/channel/voice/co-presence/domain/voice-co-presence-session.entity.ts` | 세션 엔티티 |
| `apps/api/src/channel/voice/co-presence/domain/voice-co-presence-daily.entity.ts` | 일별 집계 엔티티 |
| `apps/api/src/channel/voice/co-presence/domain/voice-co-presence-pair-daily.entity.ts` | 쌍 일별 집계 엔티티 |
| `apps/api/src/newbie/moco/moco-event.handler.ts` | `@OnEvent`로 co-presence 이벤트 수신, 모코코 조건 판정 |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/newbie/moco/moco-reset.scheduler.ts` | `MocoScheduler.flushGuildSessions()` → `CoPresenceScheduler.flushGuildSessions()` 호출 변경 |
| `apps/api/src/newbie/newbie.module.ts` | `MocoScheduler` provider 제거, `MocoEventHandler` provider 추가 |
| `apps/api/src/channel/voice/voice.module.ts` | `CoPresenceModule` export 추가 |

### 삭제 (Phase 3)

| 파일 | 사유 |
|------|------|
| `apps/api/src/newbie/moco/moco.scheduler.ts` | `CoPresenceScheduler`로 역할 이전 완료 |

## 구현 단계

### Phase 1: 범용 Co-Presence 인프라 구축

#### Step 1-1: 엔티티 생성

**VoiceCoPresenceSession 엔티티**:
```typescript
@Entity('voice_co_presence_session')
@Index('IDX_copresence_session_guild_user', ['guildId', 'userId'])
@Index('IDX_copresence_session_guild_started', ['guildId', 'startedAt'])
@Index('IDX_copresence_session_ended', ['endedAt'])
export class VoiceCoPresenceSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column()
  userId: string;

  @Column()
  channelId: string;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp' })
  endedAt: Date;

  @Column({ type: 'int' })
  durationMin: number;

  @Column({ type: 'json' })
  peerIds: string[];

  @Column({ type: 'json' })
  peerMinutes: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;
}
```

**VoiceCoPresenceDaily 엔티티**:
```typescript
@Entity('voice_co_presence_daily')
@Index('IDX_copresence_daily_guild_date', ['guildId', 'date'])
export class VoiceCoPresenceDaily {
  @PrimaryColumn()
  guildId: string;

  @PrimaryColumn()
  userId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  channelMinutes: number;

  @Column({ type: 'int', default: 0 })
  sessionCount: number;
}
```

**VoiceCoPresencePairDaily 엔티티**:
```typescript
@Entity('voice_co_presence_pair_daily')
@Index('IDX_copresence_pair_guild_user_date', ['guildId', 'userId', 'date'])
@Index('IDX_copresence_pair_guild_date', ['guildId', 'date'])
export class VoiceCoPresencePairDaily {
  @PrimaryColumn()
  guildId: string;

  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  peerId: string;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  minutes: number;

  @Column({ type: 'int', default: 0 })
  sessionCount: number;
}
```

#### Step 1-2: 이벤트 상수 + 페이로드 인터페이스 정의

```typescript
// co-presence.events.ts
export const CO_PRESENCE_SESSION_ENDED = 'co-presence.session.ended';
export const CO_PRESENCE_TICK = 'co-presence.tick';

export interface CoPresenceSessionEndedEvent {
  guildId: string;
  channelId: string;
  userId: string;
  startedAt: Date;
  endedAt: Date;
  durationMin: number;
  peerIds: string[];
  peerMinutes: Record<string, number>;
}

/** 매 tick마다 발행되는 이벤트. 소비자가 @OnEvent('co-presence.tick')으로 수신한다. */
export interface CoPresenceTickEvent {
  snapshots: CoPresenceTickSnapshot[];
}

export interface CoPresenceTickSnapshot {
  guildId: string;
  channelId: string;
  userIds: string[];  // 현재 채널에 있는 모든 사용자 ID
}
```

#### Step 1-3: CoPresenceScheduler + CoPresenceService 구현

**CoPresenceScheduler** — 폴링 + 스냅샷 수집 전담:

- `tick()`: 모든 길드 순회 → 스냅샷 수집 → `CoPresenceService.reconcile()` 호출 → **tick 이벤트 발행**
- `processGuild()`: 음성 채널 순회, 제외 채널 필터링, **모든 사용자** 스냅샷 수집
- `flushGuildSessions()`: 리셋 시 `CoPresenceService.endAllGuildSessions()` 호출
- tick 이벤트: `eventEmitter.emit(CO_PRESENCE_TICK, { snapshots })` — tick은 fire-and-forget이므로 `emit()` 사용

**CoPresenceService** — 세션 상태 관리 + DB 저장 + 이벤트 발행 전담:

- `reconcile(snapshots)`: 세션 시작/계속/종료 판정
- `startSession()`: 인메모리 세션 생성
- `continueSession()`: `accumulatedMinutes` +1, `peerMinutes` 갱신
- `endSession()`: DB 저장 + `eventEmitter.emitAsync(CO_PRESENCE_SESSION_ENDED, event)` — **emitAsync로 핸들러 완료 대기**
- `endAllGuildSessions(guildId)`: 해당 길드의 모든 활성 세션 강제 종료

**핵심 차이점 (vs MocoScheduler)**:
1. 모코코/사냥꾼 분류 없음 → 채널 내 **모든** 봇 아닌 사용자를 추적
2. 최소 시간 조건 없음 → 1분이라도 세션 저장
3. Redis 랭크/점수 계산 없음 → DB 저장 + 이벤트 발행만
4. 세션 키: `${guildId}:${userId}` (hunterId 대신 userId)
5. `peerMinutes` 저장 → 세션 엔티티와 이벤트 페이로드에 포함
6. `@OnEvent` 기반 이벤트 통신 → tick/세션종료 모두 EventEmitter2로 통일

#### Step 1-4: DB Repository 구현

```typescript
@Injectable()
export class CoPresenceDbRepository {
  constructor(private readonly dataSource: DataSource) {}

  async saveSession(data: SaveSessionDto): Promise<void> { ... }

  async upsertDaily(
    guildId: string, userId: string, date: string,
    channelMinutes: number, sessionCount: number,
  ): Promise<void> { ... }

  /**
   * PairDaily 배치 upsert.
   * 세션 종료 시 모든 peer 레코드(양방향)를 한 번의 쿼리로 처리한다.
   *
   * INSERT INTO voice_co_presence_pair_daily (...) VALUES (...), (...), ...
   * ON CONFLICT ("guildId", "userId", "peerId", "date")
   * DO UPDATE SET minutes = ... + EXCLUDED.minutes,
   *              "sessionCount" = ... + EXCLUDED."sessionCount"
   */
  async upsertPairDailyBatch(
    rows: { guildId: string; userId: string; peerId: string; date: string; minutes: number; sessionCount: number }[],
  ): Promise<void> { ... }

  /** 90일 초과 세션 삭제 */
  async deleteExpiredSessions(cutoffDate: Date): Promise<number> { ... }
}
```

**배치 upsert 효과**: 10명 채널에서 세션 종료 시 기존 18회(양방향 9쌍 × 2) → 1회 쿼리로 감소. PostgreSQL VALUES 리스트 방식으로 파라미터 상한(65,535개) 내에서 약 10,000행까지 단일 쿼리 처리 가능.

#### Step 1-5: 세션 자동 삭제 스케줄러

```typescript
@Injectable()
export class CoPresenceCleanupScheduler {
  // 매일 자정 KST 실행
  @Cron('0 0 15 * * *') // UTC 15:00 = KST 00:00
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 86_400_000);
    const deleted = await this.dbRepo.deleteExpiredSessions(cutoff);
    this.logger.log(`[CO-PRESENCE CLEANUP] Deleted ${deleted} expired sessions`);
  }
}
```

#### Step 1-6: 모듈 등록

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VoiceCoPresenceSession,
      VoiceCoPresenceDaily,
      VoiceCoPresencePairDaily,
    ]),
    VoiceChannelModule, // VoiceExcludedChannelService 의존
  ],
  providers: [
    CoPresenceScheduler,
    CoPresenceService,
    CoPresenceDbRepository,
    CoPresenceCleanupScheduler,
  ],
  exports: [CoPresenceScheduler],
})
export class CoPresenceModule {}
```

### Phase 2: 모코코 사냥 이벤트 소비자 전환

#### Step 2-1: MocoEventHandler 생성

```typescript
@Injectable()
export class MocoEventHandler {
  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly mocoDbRepo: MocoDbRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    @InjectDiscordClient() private readonly discord: Client,
  ) {}

  // ── tick 이벤트: 실시간 Redis 누적 ──
  @OnEvent(CO_PRESENCE_TICK)
  async handleTick(event: CoPresenceTickEvent): Promise<void> {
    // 각 스냅샷에서 모코코 조건 판정 후 Redis에 1분 누적
    // 기존 MocoScheduler.startSession/continueSession의 Redis 로직 이전
  }

  // ── 세션 종료 이벤트: 유효성 판정 + DB 저장 + 랭크 갱신 ──
  @OnEvent(CO_PRESENCE_SESSION_ENDED)
  async handleSessionEnded(event: CoPresenceSessionEndedEvent): Promise<void> {
    // 1. mocoEnabled 확인
    // 2. 사냥꾼/모코코 조건 판정
    // 3. MocoHuntingSession DB 저장
    // 4. mocoMinCoPresenceMin 유효성 → 무효 시 Redis 롤백, DB는 isValid=false
    // 5. 유효 시 플레이횟수 카운팅 + 점수 재계산
  }
}
```

**`CoPresenceScheduler` 의존성 제거**: 기존 tick 콜백 방식에서는 `CoPresenceScheduler`를 주입받아 `registerTickCallback()`을 호출해야 했지만, `@OnEvent` 방식에서는 이벤트만 수신하므로 **순환 의존성 없이** 소비자를 추가/제거할 수 있다.

**Redis 누적 방식 (tick 이벤트 + 세션 종료 이벤트 조합)**:

| 시점 | 동작 | Redis 처리 |
|------|------|------------|
| `co-presence.tick` (매 60초) | 모코코 조건 판정 | `incrMocoChannelMinutes` +1, `incrMocoMinutes` +1 (per newbie) |
| `co-presence.session.ended` (유효) | DB 저장 + 랭크 갱신 | `incrMocoSessionCount`, `setMocoRankScore`, `setMocoHunterMeta` |
| `co-presence.session.ended` (무효) | DB 저장 + 롤백 | `incrMocoChannelMinutes` -(누적분), `incrMocoMinutes` -(per newbie 누적분) |

이 방식은 기존 MocoScheduler의 동작과 **동일한 실시간 UX**를 유지하면서, 폴링 책임만 CoPresenceScheduler로 이전한다.

#### Step 2-2: MocoResetScheduler 수정

```diff
- constructor(private readonly mocoScheduler: MocoScheduler, ...)
+ constructor(private readonly coPresenceScheduler: CoPresenceScheduler, ...)

  async resetGuild(guildId: string): Promise<void> {
-   await this.mocoScheduler.flushGuildSessions(guildId);
+   await this.coPresenceScheduler.flushGuildSessions(guildId);
    // 이후 Redis 키 삭제 (기존 동일)
  }
```

`CoPresenceService.endSession()` 내부에서 `eventEmitter.emitAsync(CO_PRESENCE_SESSION_ENDED, event)`를 사용하므로, 모든 `@OnEvent` 핸들러의 비동기 처리가 완료될 때까지 await한다. `flushGuildSessions()` → `endAllGuildSessions()` → 각 `endSession()` 순서로 모든 세션이 처리 완료된 후 리턴되므로, Redis 키 삭제 시점에 모코코 데이터 정합성이 보장된다.

> **주의**: `emit()`은 async 핸들러의 Promise 완료를 기다리지 않으므로, 세션 종료 시에는 반드시 `emitAsync()`를 사용해야 한다. tick 이벤트는 fire-and-forget이므로 `emit()`을 사용한다.

### Phase 3: 기존 MocoScheduler 삭제

1. `moco.scheduler.ts` 파일 삭제
2. `newbie.module.ts`에서 `MocoScheduler` provider 제거
3. 관련 import 정리

## 주의사항

### 데이터 마이그레이션

- 기존 `MocoHuntingSession`, `MocoHuntingDaily` 데이터는 **그대로 유지**
- 새로운 `VoiceCoPresenceSession`, `VoiceCoPresenceDaily`, `VoiceCoPresencePairDaily`는 리팩토링 배포 시점부터 새로 쌓임
- 기존 모코코 Redis 데이터도 그대로 유지 (리셋 주기에 따라 자연 갱신)

### 테스트 체크리스트

- [ ] CoPresenceScheduler가 모든 사용자의 세션을 정상 추적하는지
- [ ] 제외 채널 필터링이 정상 동작하는지
- [ ] 세션 종료 시 `co-presence.session.ended` 이벤트가 발행되는지
- [ ] 세션 엔티티에 `peerMinutes`가 정상 저장되는지
- [ ] `VoiceCoPresencePairDaily`에 양방향 레코드가 정상 upsert되는지
- [ ] `co-presence.tick` 이벤트가 `@OnEvent` 소비자에게 정상 전달되는지
- [ ] MocoEventHandler의 tick 이벤트 핸들러가 모코코 조건을 올바르게 판정하는지
- [ ] MocoEventHandler의 세션 종료 이벤트가 유효/무효 세션을 올바르게 처리하는지
- [ ] 무효 세션의 Redis 롤백이 정상 동작하는지
- [ ] MocoResetScheduler가 CoPresenceScheduler.flushGuildSessions()를 올바르게 호출하는지
- [ ] `emitAsync()`로 flush 후 Redis 키 삭제 시점에 MocoEventHandler 처리가 완료되어 있는지
- [ ] `VoiceCoPresencePairDaily` 배치 upsert가 양방향 레코드를 한 번의 쿼리로 처리하는지
- [ ] 봇 종료/재시작 시 세션이 정상 정리되는지
- [ ] 기존 모코코 순위 Embed 표시가 정상 동작하는지
- [ ] 90일 초과 세션 자동 삭제가 정상 동작하는지

### 성능 고려

- CoPresenceScheduler는 **모든 사용자**를 추적하므로, 대규모 서버에서 인메모리 세션 수가 증가할 수 있다
- `PairDaily` 배치 upsert로 세션 종료 시 peer 수에 무관하게 **1회 쿼리**로 처리 (N명 채널의 양방향 2*(N-1)행을 단일 INSERT...ON CONFLICT로)
- `VoiceCoPresenceSession` 90일 자동 삭제로 테이블 비대화 방지
- `VoiceCoPresencePairDaily`는 영구 보존이므로 장기적으로 행 수 모니터링 필요
