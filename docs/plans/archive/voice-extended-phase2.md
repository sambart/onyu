# Voice Extended Phase 2 - 게임 활동 수집 구현 계획

## 개요
//CoPresenceScheduler의 스케쥴러 이름을 변경하는걸 고려해라
음성 채널에 참여 중인 유저의 게임 활동(Presence)을 수집하여 `voice_game_activity`(세션 단위)와 `voice_game_daily`(일별 집계) 테이블에 저장한다. `presenceUpdate` 이벤트를 별도로 리스닝하지 않고, 기존 음성 이벤트와 CoPresenceScheduler 틱 시점에 `member.presence`를 읽는 pull 방식을 사용한다.

**관련 PRD**: F-VOICE-028, F-VOICE-029, F-VOICE-030, F-VOICE-031

---

## Step 1: Discord 인텐트 추가

### 수정 대상: `apps/api/src/config/discord.config.ts`

- **현재 상태**: `GatewayIntentBits.GuildPresences`가 인텐트 목록에 없어 `member.presence`가 항상 null
- **변경 내용**: `intents` 배열에 `GatewayIntentBits.GuildPresences` 추가
- **변경 이유**: `member.presence.activities`에 접근하여 게임 활동 데이터를 읽기 위해 필수

```typescript
intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildPresences, // Phase 2 추가
],
```

> **주의**: Discord Developer Portal에서 PRESENCE INTENT 토글을 ON으로 설정해야 한다 (Privileged Intent).

---

## Step 2: Redis 키 및 게임 세션 타입 정의

### 신규 파일: `apps/api/src/channel/voice/infrastructure/voice-game.keys.ts`

- **책임**: 게임 세션 Redis 키 패턴 정의
- **내용**:

```typescript
export const VoiceGameKeys = {
  /** 유저별 현재 게임 세션: voice:game:session:{guildId}:{userId} — TTL 24시간 */
  gameSession: (guildId: string, userId: string) =>
    `voice:game:session:${guildId}:${userId}`,
};
```

### 신규 파일: `apps/api/src/channel/voice/infrastructure/voice-game-session.ts`

- **책임**: Redis에 저장되는 게임 세션 인터페이스 정의
- **내용**:

```typescript
export interface VoiceGameSession {
  gameName: string;
  applicationId: string | null;
  startedAt: number; // timestamp (ms)
  channelId: string; // 게임 활동 중이던 음성 채널 ID
}
```

---

## Step 3: VoiceGameRedisRepository 신설

### 신규 파일: `apps/api/src/channel/voice/infrastructure/voice-game-redis.repository.ts`

- **책임**: 게임 세션 Redis CRUD
- **의존성**: `RedisService`
- **메서드**:
  - `getGameSession(guildId, userId): Promise<VoiceGameSession | null>` -- Redis에서 게임 세션 조회
  - `setGameSession(guildId, userId, session: VoiceGameSession): Promise<void>` -- Redis에 게임 세션 저장 (TTL 24시간)
  - `deleteGameSession(guildId, userId): Promise<void>` -- Redis 게임 세션 삭제
- **패턴 참조**: `VoiceRedisRepository`와 동일한 패턴 (JSON 직렬화, TTL 상수)

---

## Step 4: VoiceGameDbRepository 신설

### 신규 파일: `apps/api/src/channel/voice/infrastructure/voice-game-db.repository.ts`

- **책임**: `voice_game_activity` INSERT 및 `voice_game_daily` UPSERT
- **의존성**: `@InjectRepository(VoiceGameActivityOrm)`, `@InjectRepository(VoiceGameDailyOrm)`
- **메서드**:
  - `saveActivity(data): Promise<void>` -- `voice_game_activity` 테이블에 세션 레코드 INSERT
  - `upsertDaily(guildId, userId, gameName, date, durationMin): Promise<void>` -- `voice_game_daily` 테이블에 일별 집계 UPSERT (`totalMinutes += durationMin`, `sessionCount += 1`, `recordedAt = NOW()`)
  - `deleteExpiredActivities(cutoffDate: Date): Promise<number>` -- 90일 초과 `voice_game_activity` 레코드 삭제
- **upsert 패턴 참조**: `CoPresenceDbRepository.upsertDaily()` 패턴 (INSERT ON CONFLICT UPDATE)

---

## Step 5: VoiceGameService 신설

### 신규 파일: `apps/api/src/channel/voice/application/voice-game.service.ts`

- **책임**: 게임 세션 라이프사이클 관리 (시작/갱신/종료)
- **의존성**: `VoiceGameRedisRepository`, `VoiceGameDbRepository`, `Logger`
- **메서드**:

#### `onUserJoined(guildId, userId, channelId, member): Promise<void>` (F-VOICE-028)

1. `member.presence?.activities`에서 `ActivityType.Playing` 타입 필터링
2. Playing 활동이 없으면 아무 작업도 하지 않고 리턴
3. Playing 활동이 있으면:
   - `gameName = activity.name`
   - `applicationId = activity.applicationId ?? null`
   - `startedAt = Date.now()`
   - `channelId` = 현재 음성 채널 ID
4. Redis에 게임 세션 저장 (`VoiceGameRedisRepository.setGameSession`)

#### `reconcileForChannel(guildId, channelId, members): Promise<void>` (F-VOICE-029)

CoPresenceScheduler 틱에서 호출. 음성 채널의 멤버 목록을 받아 각 멤버에 대해 게임 상태를 확인한다.

각 멤버에 대해:
1. `member.presence?.activities`에서 `ActivityType.Playing` 추출
2. Redis에서 현재 게임 세션 조회
3. 4가지 케이스 판정:
   - **게임 없음 + 세션 없음**: 스킵 (상태 유지)
   - **게임 있음 + 세션 없음** (새 게임 시작): Redis에 새 게임 세션 생성
   - **게임 있음 + 세션 있음 + 같은 게임** (게임 계속): 스킵
   - **게임 있음 + 세션 있음 + 다른 게임** (게임 전환): 이전 세션 종료 (`endSession`) + 새 세션 시작
   - **게임 없음 + 세션 있음** (게임 종료): 세션 종료 (`endSession`)

**게임 동일성 판정**: `applicationId`가 둘 다 존재하면 `applicationId` 비교. 하나라도 null이면 `gameName` 비교.

#### `onUserLeft(guildId, userId): Promise<void>` (F-VOICE-030)

1. Redis에서 게임 세션 조회
2. 세션이 있으면 `endSession` 호출
3. Redis 게임 세션 삭제

#### `endSession(guildId, userId, session: VoiceGameSession): Promise<void>` (F-VOICE-031)

1. `durationMin = Math.floor((Date.now() - session.startedAt) / 60_000)`
2. `durationMin < 1`이면 스킵 (1분 미만 무시, Redis 키만 삭제)
3. `durationMin >= 1`이면:
   - `voice_game_activity` INSERT (`VoiceGameDbRepository.saveActivity`)
   - `voice_game_daily` UPSERT (`VoiceGameDbRepository.upsertDaily`)
   - KST 날짜 기준으로 date 계산 (`getKSTDateString()` 사용, YYYY-MM-DD 형식으로 변환)
4. Redis 게임 세션 삭제

#### `endAllSessions(): Promise<void>`

봇 종료 시 모든 게임 세션 일괄 종료. Redis SCAN으로 `voice:game:session:*` 패턴의 모든 키를 순회하여 `endSession` 호출.

#### 헬퍼: `extractPlayingActivity(member): { gameName, applicationId } | null`

- `member.presence?.activities`가 null/undefined이면 null 반환
- `ActivityType.Playing` 타입 활동 중 첫 번째 항목 반환
- 없으면 null 반환

---

## Step 6: CoPresenceScheduler 수정 (틱에서 게임 상태 갱신)

### 수정 대상: `apps/api/src/channel/voice/co-presence/co-presence.scheduler.ts`

- **현재 상태**: 음성 채널 순회 시 `humanMembers`의 ID만 추출하여 스냅샷 생성. 게임 활동은 확인하지 않음.
- **변경 내용**:
  1. `VoiceGameService`를 DI로 주입
  2. `processGuild()` 메서드에서 각 음성 채널의 `humanMembers`를 순회할 때, `VoiceGameService.reconcileForChannel()` 호출을 추가
  3. `onApplicationShutdown()`에서 `VoiceGameService.endAllSessions()` 호출 추가
- **변경 이유**: 60초 틱마다 음성 채널의 멤버 presence를 읽어 게임 세션을 갱신하기 위함

```typescript
// processGuild() 내에서, snapshots.push() 이전에:
await this.voiceGameService.reconcileForChannel(
  guildId,
  voiceChannel.id,
  humanMembers, // GuildMember[] — presence 접근 가능
);
```

**중요**: `reconcileForChannel`은 제외 채널 필터링 이후에 호출한다. 제외 채널에서는 게임 활동도 수집하지 않는다. 단, `humanMembers.length < 2`인 채널(1명만 있는 채널)에서도 게임 활동은 수집해야 하므로, 게임 활동 수집 호출은 `humanMembers.length < 2` 체크 이전에 배치하되, 제외 채널 체크 이후에 배치한다.

**수정된 processGuild 흐름**:
```
1. 음성 채널 순회
2. 봇 제외
3. 제외 채널 확인 → 제외면 continue
4. VoiceGameService.reconcileForChannel() 호출 (1명 이상이면 실행)
5. humanMembers.length < 2이면 continue (CoPresence 스냅샷은 2명 이상만)
6. snapshots.push()
```

---

## Step 7: VoiceJoinHandler 수정 (입장 시 게임 세션 시작)

### 수정 대상: `apps/api/src/event/voice/voice-join.handler.ts`

- **현재 상태**: `VoiceChannelService.onUserJoined(event.state)` 호출만 수행
- **변경 내용**: `VoiceGameService.onUserJoined()` 호출 추가
- **변경 이유**: 음성 입장 시점에 이미 게임 중이면 즉시 세션 시작

**문제점**: 현재 `VoiceJoinHandler`는 `VoiceStateDto`를 받는데, `VoiceStateDto`에는 `member.presence` 정보가 없다. `VoiceStateDto.fromVoiceState()`에서 Discord.js `VoiceState` 객체를 변환할 때 presence 정보를 포함하지 않는다.

**해결 방안**: `VoiceJoinEvent`에 `GuildMember` 참조를 추가하거나, presence 관련 필드를 전달하는 방식이 필요하다.

**선택한 접근법**: `VoiceJoinEvent`와 `VoiceLeaveEvent`에 optional `member` 필드(Discord.js `GuildMember`)를 추가한다. Dispatcher에서 `newState.member`를 이벤트에 전달하고, Handler에서 이를 `VoiceGameService`에 넘긴다.

### 수정 대상: `apps/api/src/event/voice/voice-events.ts`

- **변경 내용**: `VoiceJoinEvent`와 `VoiceLeaveEvent`에 `member` 프로퍼티 추가

```typescript
import { type GuildMember } from 'discord.js';

export class VoiceJoinEvent {
  constructor(
    public readonly state: VoiceStateDto,
    public readonly member: GuildMember | null = null,
  ) {}
}

export class VoiceLeaveEvent {
  constructor(
    public readonly state: VoiceStateDto,
    public readonly member: GuildMember | null = null,
  ) {}
}
```

### 수정 대상: `apps/api/src/event/voice/voice-state.dispatcher.ts`

- **변경 내용**: `VoiceJoinEvent`와 `VoiceLeaveEvent` 생성 시 `newState.member` / `oldState.member`를 함께 전달

```typescript
// JOIN 이벤트 발행 시:
new VoiceJoinEvent(dto, newState.member ?? null)

// LEAVE 이벤트 발행 시:
new VoiceLeaveEvent(dto, oldState.member ?? null)
```

MOVE 이벤트에서 분리 발행되는 JOIN/LEAVE도 동일하게 member를 전달한다.

### 수정 대상: `apps/api/src/event/voice/voice-join.handler.ts`

- **변경 내용**:

```typescript
@Injectable()
export class VoiceJoinHandler {
  constructor(
    private readonly voiceChannelService: VoiceChannelService,
    private readonly voiceGameService: VoiceGameService,
  ) {}

  @OnEvent(VOICE_EVENTS.JOIN)
  async handle(event: VoiceJoinEvent) {
    await this.voiceChannelService.onUserJoined(event.state);

    // 게임 활동 수집 (fire-and-forget 스타일, 오류 시 로그만)
    if (event.member) {
      await this.voiceGameService.onUserJoined(
        event.state.guildId,
        event.state.userId,
        event.state.channelId,
        event.member,
      );
    }
  }
}
```

---

## Step 8: VoiceLeaveHandler 수정 (퇴장 시 게임 세션 종료)

### 수정 대상: `apps/api/src/event/voice/voice-leave.handler.ts`

- **현재 상태**: `VoiceChannelService.onUserLeave()` + Status Prefix 복원만 수행
- **변경 내용**: `VoiceGameService.onUserLeft()` 호출 추가

```typescript
@OnEvent(VOICE_EVENTS.LEAVE)
async handle(event: VoiceLeaveEvent) {
  await this.voiceChannelService.onUserLeave(event.state);

  // 게임 세션 종료 (fire-and-forget 스타일)
  await this.voiceGameService.onUserLeft(
    event.state.guildId,
    event.state.userId,
  );

  // Status Prefix 닉네임 자동 복원 (기존)
  this.statusPrefixResetService
    .restoreOnLeave(event.state.guildId, event.state.userId)
    .catch((err) =>
      this.logger.error('[STATUS_PREFIX] restoreOnLeave failed', getErrorStack(err)),
    );
}
```

---

## Step 9: VoiceChannelModule 수정 (서비스/리포지토리 등록)

### 수정 대상: `apps/api/src/channel/voice/voice-channel.module.ts`

- **현재 상태**: `VoiceGameActivityOrm`, `VoiceGameDailyOrm`은 이미 `TypeOrmModule.forFeature()`에 등록됨
- **변경 내용**:
  1. `providers`에 추가: `VoiceGameService`, `VoiceGameRedisRepository`, `VoiceGameDbRepository`
  2. `exports`에 추가: `VoiceGameService` (DiscordEventsModule에서 접근 필요)

---

## Step 10: DiscordEventsModule 수정

### 수정 대상: `apps/api/src/event/discord-events.module.ts`

- **현재 상태**: `VoiceJoinHandler`, `VoiceLeaveHandler` 등록됨
- **변경 내용**: 없음 (`VoiceGameService`는 `VoiceChannelModule`에서 export하므로, 기존 import로 접근 가능)

---

## Step 11: CoPresenceModule 수정

### 수정 대상: `apps/api/src/channel/voice/co-presence/co-presence.module.ts`

- **현재 상태**: `VoiceChannelModule`을 import하고 있음
- **변경 내용**: 없음 (`VoiceGameService`는 `VoiceChannelModule`에서 export되므로, `CoPresenceScheduler`에서 DI로 주입 가능)

---

## Step 12: 데이터 보존 스케줄러 수정

### 수정 대상: `apps/api/src/channel/voice/application/voice-data-retention.scheduler.ts`

- **현재 상태**: `VoiceDailyOrm`, `VoiceChannelHistoryOrm`, `VoiceCoPresencePairDailyOrm` 3개 테이블 삭제
- **변경 내용**:
  1. `@InjectRepository(VoiceGameActivityOrm)` 추가
  2. `purgeExpiredData()`에 `voice_game_activity` 삭제 로직 추가: `startedAt < cutoffDateObj` 기준 삭제
  3. 삭제 로그에 `VoiceGameActivity` 건수 추가
- **변경 이유**: PRD에서 `voice_game_activity`는 90일 보존으로 명시. `voice_game_daily`는 영구 보존이므로 삭제 대상 아님.

```typescript
// Promise.all에 추가:
this.voiceGameActivityRepo
  .createQueryBuilder()
  .delete()
  .where('"startedAt" < :cutoff', { cutoff: cutoffDateObj })
  .execute(),
```

---

## Step 13: VoiceGameActivityOrm 엔티티 수정

### 수정 대상: `apps/api/src/channel/voice/infrastructure/voice-game-activity.orm-entity.ts`

- **현재 상태**: `endedAt`과 `durationMin`이 nullable로 정의됨
- **변경 내용**: PRD에서는 NOT NULL로 명시되어 있으나, 현재 엔티티가 nullable로 정의된 것은 의도적일 수 있음 (세션 진행 중 상태 표현). 현재 구현에서는 DB에 저장할 때만 endSession을 호출하고, 그 시점에는 항상 값이 채워지므로 nullable 유지해도 무방. **변경하지 않음**.

---

## Step 14: VoiceGameDailyOrm 엔티티 확인

### 확인 대상: `apps/api/src/channel/voice/infrastructure/voice-game-daily.orm-entity.ts`

- **현재 상태**: PK는 `(guildId, userId, gameName, date)`. `totalMinutes`, `sessionCount` 필드 존재. `recordedAt` 필드 존재.
- **변경 내용**: 없음. 이미 필요한 구조가 갖추어져 있음.

---

## 게임 세션 라이프사이클 정리

```
[유저 A가 게임 X를 플레이하며 음성 입장]
  └─ VoiceJoinHandler → VoiceGameService.onUserJoined()
       └─ Redis SET voice:game:session:{guildId}:{userId}
          { gameName: "X", applicationId: "...", startedAt: now, channelId: "..." }

[60초 틱 #1 — 게임 X 계속]
  └─ CoPresenceScheduler → VoiceGameService.reconcileForChannel()
       └─ 현재 게임 X = Redis 세션 X → 스킵

[60초 틱 #2 — 게임 Y로 전환]
  └─ CoPresenceScheduler → VoiceGameService.reconcileForChannel()
       └─ 현재 게임 Y != Redis 세션 X
            └─ endSession(X) → DB INSERT (activity) + UPSERT (daily)
            └─ Redis SET 새 세션 Y

[60초 틱 #3 — 게임 종료]
  └─ CoPresenceScheduler → VoiceGameService.reconcileForChannel()
       └─ 현재 게임 없음 + Redis 세션 Y 있음
            └─ endSession(Y) → DB INSERT + UPSERT
            └─ Redis DEL

[유저 A 퇴장]
  └─ VoiceLeaveHandler → VoiceGameService.onUserLeft()
       └─ Redis 세션 있으면 → endSession() → DB INSERT + UPSERT
       └─ Redis DEL
```

---

## 신규 파일 목록

| 파일 경로 | 책임 |
|-----------|------|
| `apps/api/src/channel/voice/infrastructure/voice-game.keys.ts` | Redis 키 패턴 |
| `apps/api/src/channel/voice/infrastructure/voice-game-session.ts` | 게임 세션 인터페이스 |
| `apps/api/src/channel/voice/infrastructure/voice-game-redis.repository.ts` | 게임 세션 Redis CRUD |
| `apps/api/src/channel/voice/infrastructure/voice-game-db.repository.ts` | 게임 활동 DB 저장 |
| `apps/api/src/channel/voice/application/voice-game.service.ts` | 게임 세션 비즈니스 로직 |

## 수정 파일 목록

| 파일 경로 | 변경 요약 |
|-----------|-----------|
| `apps/api/src/config/discord.config.ts` | `GuildPresences` 인텐트 추가 |
| `apps/api/src/event/voice/voice-events.ts` | `VoiceJoinEvent`, `VoiceLeaveEvent`에 `member` 필드 추가 |
| `apps/api/src/event/voice/voice-state.dispatcher.ts` | 이벤트 발행 시 `member` 전달 |
| `apps/api/src/event/voice/voice-join.handler.ts` | `VoiceGameService.onUserJoined()` 호출 추가 |
| `apps/api/src/event/voice/voice-leave.handler.ts` | `VoiceGameService.onUserLeft()` 호출 추가 |
| `apps/api/src/channel/voice/co-presence/co-presence.scheduler.ts` | 틱에서 `VoiceGameService.reconcileForChannel()` 호출, shutdown 시 `endAllSessions()` |
| `apps/api/src/channel/voice/voice-channel.module.ts` | 신규 서비스/리포지토리 등록 및 export |
| `apps/api/src/channel/voice/application/voice-data-retention.scheduler.ts` | `voice_game_activity` 90일 삭제 로직 추가 |

---

## 구현 순서 (의존성 기반)

1. **Step 1**: 인텐트 추가 (`discord.config.ts`)
2. **Step 2**: Redis 키 + 게임 세션 타입 정의 (신규 파일 2개)
3. **Step 3**: `VoiceGameRedisRepository` 신설
4. **Step 4**: `VoiceGameDbRepository` 신설
5. **Step 5**: `VoiceGameService` 신설
6. **Step 9**: `VoiceChannelModule` 수정 (서비스 등록)
7. **Step 7**: `voice-events.ts` + `VoiceStateDispatcher` + `VoiceJoinHandler` 수정
8. **Step 8**: `VoiceLeaveHandler` 수정
9. **Step 6**: `CoPresenceScheduler` 수정
10. **Step 12**: 데이터 보존 스케줄러 수정

---

## 에러 처리 및 제약사항

- `member.presence`가 null인 경우 (인텐트 미활성 등): 게임 없음으로 처리, 에러 발생 안 함
- `member.presence.activities`가 빈 배열인 경우: 게임 없음으로 처리
- 게임 세션 1분 미만: DB에 저장하지 않고 Redis에서만 삭제
- Redis 게임 세션 TTL 24시간: 비정상 종료 시 자연 만료로 orphan 키 방지
- `VoiceGameService`의 모든 메서드는 내부에서 try-catch로 감싸 에러 발생 시 로그만 기록하고, 기존 음성 추적 로직에 영향을 주지 않음
- 게임 감지 지연: 음성 입장 후 게임 시작 시 최대 60초까지 감지 지연 가능 (틱 주기)
