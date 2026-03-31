# 단위 A: 트리거 채널 감지 + 대기방 생성 — 구현 계획

## 범위

PRD F-VOICE-007, F-VOICE-008 구현.
유저가 트리거 채널에 입장하면 Redis에서 트리거 여부를 확인하고, 대기방을 생성해 유저를 이동시킨다.
세션 추적(VoiceChannelHistory, VoiceSession)은 이 단위에서 시작하지 않는다.

---

## 전제 조건 (공통 모듈 완성 상태 가정)

이 단위는 아래 공통 모듈이 이미 존재한다고 가정하고 작성된다.
공통 모듈은 `docs/specs/auto-channel-common-modules.md` 2절에 정의된 파일들이다.

| 파일 | 설명 |
|------|------|
| `apps/api/src/channel/auto/infrastructure/auto-channel.keys.ts` | Redis 키 팩토리 |
| `apps/api/src/channel/auto/infrastructure/auto-channel-state.ts` | 상태 인터페이스 |
| `apps/api/src/channel/auto/infrastructure/auto-channel-redis.repository.ts` | Redis CRUD |
| `apps/api/src/event/auto-channel/auto-channel-events.ts` | 이벤트 상수 + 이벤트 클래스 |
| `apps/api/src/channel/auto/auto-channel.module.ts` | NestJS 모듈 (provider 등록) |

이 단위가 새로 생성하는 파일과 수정하는 파일만 아래에 기술한다.

---

## 생성할 파일

### 1. `apps/api/src/channel/auto/infrastructure/auto-channel.keys.ts`

공통 모듈 정의에 따라 그대로 구현한다.

```typescript
export const AutoChannelKeys = {
  waiting: (channelId: string) => `auto_channel:waiting:${channelId}`,
  confirmed: (channelId: string) => `auto_channel:confirmed:${channelId}`,
  triggerSet: (guildId: string) => `auto_channel:trigger:${guildId}`,
};
```

---

### 2. `apps/api/src/channel/auto/infrastructure/auto-channel-state.ts`

공통 모듈 정의에 따라 그대로 구현한다.

```typescript
export interface AutoChannelWaitingState {
  guildId: string;
  userId: string;
  triggerChannelId: string;
  configId: number;
}

export interface AutoChannelConfirmedState {
  guildId: string;
  userId: string;
  buttonId: number;
  subOptionId?: number;
}
```

---

### 3. `apps/api/src/channel/auto/infrastructure/auto-channel-redis.repository.ts`

`VoiceRedisRepository`와 동일한 패턴(생성자에 `RedisService` 주입, 메서드별 키 팩토리 사용)으로 구현한다.

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { AutoChannelKeys } from './auto-channel.keys';
import { AutoChannelConfirmedState, AutoChannelWaitingState } from './auto-channel-state';

const TTL = {
  WAITING: 60 * 60 * 12,    // 12시간
  CONFIRMED: 60 * 60 * 12,  // 12시간
} as const;

@Injectable()
export class AutoChannelRedisRepository {
  constructor(private readonly redis: RedisService) {}

  // 대기방 상태
  async setWaitingState(channelId: string, state: AutoChannelWaitingState): Promise<void>
  async getWaitingState(channelId: string): Promise<AutoChannelWaitingState | null>
  async deleteWaitingState(channelId: string): Promise<void>

  // 확정방 상태 (단위 B, C에서 사용 — 이 단위에서는 인터페이스만 확보)
  async setConfirmedState(channelId: string, state: AutoChannelConfirmedState): Promise<void>
  async getConfirmedState(channelId: string): Promise<AutoChannelConfirmedState | null>
  async deleteConfirmedState(channelId: string): Promise<void>

  // 트리거 채널 집합 (Redis Set)
  async isTriggerChannel(guildId: string, channelId: string): Promise<boolean>
  async addTriggerChannel(guildId: string, triggerChannelId: string): Promise<void>
  async removeTriggerChannel(guildId: string, triggerChannelId: string): Promise<void>
  async initTriggerSet(guildId: string, triggerChannelIds: string[]): Promise<void>
}
```

구현 세부 사항:

- `setWaitingState`: `redis.set(AutoChannelKeys.waiting(channelId), state, TTL.WAITING)`
- `getWaitingState`: `redis.get<AutoChannelWaitingState>(AutoChannelKeys.waiting(channelId))`
- `deleteWaitingState`: `redis.del(AutoChannelKeys.waiting(channelId))`
- `isTriggerChannel`: `redis.sismember(AutoChannelKeys.triggerSet(guildId), channelId)` — 반환값 `boolean`
- `addTriggerChannel`: `redis.sadd(AutoChannelKeys.triggerSet(guildId), triggerChannelId)`
- `removeTriggerChannel`: `redis.srem(AutoChannelKeys.triggerSet(guildId), triggerChannelId)`
- `initTriggerSet`: 기존 키를 DEL 후 SADD로 전체 교체. 빈 배열이면 DEL만 수행.
  구현: `redis.pipeline`으로 DEL + SADD를 1회 왕복.
  `triggerChannelIds`가 비어있으면 DEL만 실행(SADD 인수 없음 에러 방지).

---

### 4. `apps/api/src/event/auto-channel/auto-channel-events.ts`

`voice-events.ts`와 동일한 패턴으로 정의한다.

```typescript
import { VoiceStateDto } from '../../channel/voice/infrastructure/voice-state.dto';

export const AUTO_CHANNEL_EVENTS = {
  TRIGGER_JOIN: 'auto-channel.trigger-join',
  CHANNEL_EMPTY: 'auto-channel.channel-empty',
} as const;

export class AutoChannelTriggerJoinEvent {
  constructor(public readonly state: VoiceStateDto) {}
}

export class AutoChannelChannelEmptyEvent {
  constructor(
    public readonly guildId: string,
    public readonly channelId: string,
  ) {}
}
```

---

### 5. `apps/api/src/channel/auto/application/auto-channel-bootstrap.service.ts`

봇 기동 시 DB의 모든 `AutoChannelConfig`를 읽어 Redis `auto_channel:trigger:{guildId}` Set을 초기화한다.
`VoiceRecoveryService`가 `OnApplicationBootstrap`을 구현하는 것과 동일한 패턴.

```typescript
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoChannelConfig } from '../domain/auto-channel-config.entity';
import { AutoChannelRedisRepository } from '../infrastructure/auto-channel-redis.repository';

@Injectable()
export class AutoChannelBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutoChannelBootstrapService.name);

  constructor(
    @InjectRepository(AutoChannelConfig)
    private readonly configRepo: Repository<AutoChannelConfig>,
    private readonly autoChannelRedis: AutoChannelRedisRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.initTriggerSets();
  }

  private async initTriggerSets(): Promise<void> {
    // 모든 설정 조회 (select 최소화)
    const configs = await this.configRepo.find({
      select: ['guildId', 'triggerChannelId'],
    });

    if (configs.length === 0) {
      this.logger.log('No AutoChannelConfig found — trigger sets not initialized.');
      return;
    }

    // guildId별로 그룹핑
    const byGuild = new Map<string, string[]>();
    for (const config of configs) {
      const list = byGuild.get(config.guildId) ?? [];
      list.push(config.triggerChannelId);
      byGuild.set(config.guildId, list);
    }

    // 서버별 triggerSet 초기화
    for (const [guildId, triggerIds] of byGuild) {
      await this.autoChannelRedis.initTriggerSet(guildId, triggerIds);
      this.logger.log(
        `Initialized trigger set: guild=${guildId} triggers=[${triggerIds.join(', ')}]`,
      );
    }
  }
}
```

충돌 분석:
- `VoiceRecoveryService`(기존)도 `OnApplicationBootstrap`을 구현하지만, 두 서비스는 독립적인 키를 다루므로 충돌 없음.
- `AutoChannelConfig` 엔티티는 이미 `apps/api/src/channel/auto/domain/auto-channel-config.entity.ts`에 존재함. `@InjectRepository`로 직접 사용 — 별도 Repository 래퍼 불필요(단위 A 범위 내).

---

### 6. `apps/api/src/channel/auto/application/auto-channel.service.ts`

이 단위에서는 `handleTriggerJoin` 메서드만 구현한다. 다른 메서드(B, C, D 단위)는 stub으로 남긴다.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoChannelConfig } from '../domain/auto-channel-config.entity';
import { AutoChannelRedisRepository } from '../infrastructure/auto-channel-redis.repository';
import { DiscordVoiceGateway } from '../../voice/infrastructure/discord-voice.gateway';
import { VoiceStateDto } from '../../voice/infrastructure/voice-state.dto';

@Injectable()
export class AutoChannelService {
  private readonly logger = new Logger(AutoChannelService.name);

  constructor(
    @InjectRepository(AutoChannelConfig)
    private readonly configRepo: Repository<AutoChannelConfig>,
    private readonly autoChannelRedis: AutoChannelRedisRepository,
    private readonly discordVoiceGateway: DiscordVoiceGateway,
  ) {}

  /**
   * F-VOICE-007 + F-VOICE-008
   * 트리거 채널 입장 이벤트 수신 시 대기방을 생성하고 유저를 이동시킨다.
   */
  async handleTriggerJoin(state: VoiceStateDto): Promise<void> {
    const config = await this.findConfig(state.guildId, state.channelId);
    if (!config) {
      // 설정이 없는 경우 — Redis 트리거 Set이 stale할 수 있음. 무시.
      this.logger.warn(
        `[AUTO CHANNEL] Config not found: guild=${state.guildId} trigger=${state.channelId}`,
      );
      return;
    }

    const channelName = this.applyTemplate(config.waitingRoomTemplate, state.userName);

    // 1. Discord API로 대기방 음성 채널 생성
    const waitingChannelId = await this.discordVoiceGateway.createVoiceChannel({
      guildId: state.guildId,
      name: channelName,
      parentCategoryId: state.parentCategoryId ?? undefined,
    });

    // 2. Redis에 대기방 상태 저장 (TTL 12h)
    await this.autoChannelRedis.setWaitingState(waitingChannelId, {
      guildId: state.guildId,
      userId: state.userId,
      triggerChannelId: state.channelId,
      configId: config.id,
    });

    // 3. 유저를 대기방으로 이동
    await this.discordVoiceGateway.moveUserToChannel(
      state.guildId,
      state.userId,
      waitingChannelId,
    );

    this.logger.log(
      `[AUTO CHANNEL] Waiting room created: guild=${state.guildId} user=${state.userId} channel=${waitingChannelId}`,
    );
  }

  /** waitingRoomTemplate의 {username} 변수 치환 */
  private applyTemplate(template: string, username: string): string {
    return template.replace('{username}', username);
  }

  /** 트리거 채널 설정 조회 (DB) */
  private async findConfig(
    guildId: string,
    triggerChannelId: string,
  ): Promise<AutoChannelConfig | null> {
    return this.configRepo.findOne({
      where: { guildId, triggerChannelId },
    });
  }
}
```

충돌 분석:
- `DiscordVoiceGateway`는 `VoiceChannelModule`이 이미 provider로 등록하고 export하지 않는다.
  `DiscordVoiceGateway`는 `VoiceChannelModule`의 providers에 있으나 exports에 없다.
  따라서 `AutoChannelModule`에서 `DiscordModule.forFeature()`를 import하고 `DiscordVoiceGateway`를 독자적으로 provider에 등록한다(아래 모듈 참조). 이는 NestJS의 모듈 스코프 격리이므로 충돌 없음.

---

### 7. `apps/api/src/event/auto-channel/auto-channel-trigger-join.handler.ts`

`VoiceJoinHandler`와 동일한 패턴.

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AutoChannelService } from '../../channel/auto/application/auto-channel.service';
import {
  AUTO_CHANNEL_EVENTS,
  AutoChannelTriggerJoinEvent,
} from './auto-channel-events';

@Injectable()
export class AutoChannelTriggerJoinHandler {
  constructor(private readonly autoChannelService: AutoChannelService) {}

  @OnEvent(AUTO_CHANNEL_EVENTS.TRIGGER_JOIN)
  async handle(event: AutoChannelTriggerJoinEvent): Promise<void> {
    await this.autoChannelService.handleTriggerJoin(event.state);
  }
}
```

---

### 8. `apps/api/src/channel/auto/auto-channel.module.ts`

이 단위(A)에서 필요한 provider만 등록한다. 단위 B, C, D에서 provider가 추가될 것이므로 모듈 구조를 확장 가능하게 설계한다.

```typescript
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AutoChannelConfig } from './domain/auto-channel-config.entity';
import { AutoChannelButton } from './domain/auto-channel-button.entity';
import { AutoChannelSubOption } from './domain/auto-channel-sub-option.entity';
import { AutoChannelRedisRepository } from './infrastructure/auto-channel-redis.repository';
import { AutoChannelService } from './application/auto-channel.service';
import { AutoChannelBootstrapService } from './application/auto-channel-bootstrap.service';
import { AutoChannelTriggerJoinHandler } from '../../../event/auto-channel/auto-channel-trigger-join.handler';
import { RedisModule } from '../../redis/redis.module';
import { DiscordVoiceGateway } from '../voice/infrastructure/discord-voice.gateway';

@Module({
  imports: [
    DiscordModule.forFeature(),
    TypeOrmModule.forFeature([AutoChannelConfig, AutoChannelButton, AutoChannelSubOption]),
    RedisModule,
  ],
  providers: [
    AutoChannelRedisRepository,
    AutoChannelService,
    AutoChannelBootstrapService,
    AutoChannelTriggerJoinHandler,
    DiscordVoiceGateway,   // VoiceChannelModule exports에 없으므로 독자 등록
  ],
  exports: [AutoChannelRedisRepository, AutoChannelService],
})
export class AutoChannelModule {}
```

`AutoChannelTriggerJoinHandler`는 `@OnEvent` 데코레이터를 통해 이벤트를 수신하므로, `DiscordEventsModule`이 아닌 `AutoChannelModule` 내부에 등록해도 정상 동작한다. NestJS EventEmitter는 글로벌 버스이므로 모듈 경계를 넘는다.

---

## 수정할 파일

### 9. `apps/api/src/event/voice/voice-state.dispatcher.ts`

**변경 목적**: `isJoin` 분기에서 트리거 채널 여부를 확인하고, 트리거이면 `AUTO_CHANNEL_EVENTS.TRIGGER_JOIN`을 발행하며 일반 입장 처리를 건너뛴다.

**변경 전 `isJoin` 블록:**
```typescript
if (isJoin) {
  const dto = VoiceStateDto.fromVoiceState(newState);
  await this.eventEmitter.emitAsync(VOICE_EVENTS.JOIN, new VoiceJoinEvent(dto));
  this.emitAloneChanged(newState);
}
```

**변경 후 `isJoin` 블록:**
```typescript
if (isJoin) {
  const isTrigger = await this.autoChannelRedis.isTriggerChannel(
    newState.guild.id,
    newState.channelId!,
  );

  if (isTrigger) {
    const dto = VoiceStateDto.fromVoiceState(newState);
    await this.eventEmitter.emitAsync(
      AUTO_CHANNEL_EVENTS.TRIGGER_JOIN,
      new AutoChannelTriggerJoinEvent(dto),
    );
    // 트리거 채널은 세션 추적 제외 — emitAloneChanged 생략
  } else {
    const dto = VoiceStateDto.fromVoiceState(newState);
    await this.eventEmitter.emitAsync(VOICE_EVENTS.JOIN, new VoiceJoinEvent(dto));
    this.emitAloneChanged(newState);
  }
}
```

**생성자 변경:**
```typescript
// 변경 전
constructor(private readonly eventEmitter: EventEmitter2) {}

// 변경 후
constructor(
  private readonly eventEmitter: EventEmitter2,
  private readonly autoChannelRedis: AutoChannelRedisRepository,
) {}
```

**추가 import:**
```typescript
import { AutoChannelRedisRepository } from '../../channel/auto/infrastructure/auto-channel-redis.repository';
import {
  AUTO_CHANNEL_EVENTS,
  AutoChannelTriggerJoinEvent,
} from './auto-channel/auto-channel-events'; // 경로 주의: voice-events.ts와 같은 event/ 하위
```

실제 import 경로:
- `AutoChannelRedisRepository`: `../../channel/auto/infrastructure/auto-channel-redis.repository`
- `auto-channel-events`: `../auto-channel/auto-channel-events`

충돌 분석:
- `VoiceStateDispatcher`는 현재 `DiscordEventsModule`의 provider다.
- `AutoChannelRedisRepository`는 `AutoChannelModule`에서 export된다.
- `DiscordEventsModule`이 `AutoChannelModule`을 import하면 `AutoChannelRedisRepository`를 주입받을 수 있다.
- `isMove` 분기의 `emitAloneChanged(newState)`: 이동 후 채널이 트리거 채널일 가능성은 거의 없지만, 이동은 `isJoin`이 아닌 `isMove`로 처리되므로 별도 분기 불필요. 트리거 채널로 이동하는 경우(`isMove`)는 F-VOICE-007 범위에 포함되지 않는다(PRD: 트리거 채널 입장 시에만 대기방 생성).

---

### 10. `apps/api/src/event/discord-events.module.ts`

**변경 목적**: `AutoChannelModule`을 import하여 `AutoChannelRedisRepository`를 `VoiceStateDispatcher`에 주입 가능하게 만든다.

```typescript
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { AutoChannelModule } from '../channel/auto/auto-channel.module';  // 추가
import { ChannelModule } from '../channel/channel.module';
import { VoiceChannelModule } from '../channel/voice/voice-channel.module';
import { ChannelStateHandler } from './channel/channel-state.handler';
import { VoiceAloneHandler } from './voice/voice-alone.handler';
import { VoiceJoinHandler } from './voice/voice-join.handler';
import { VoiceLeaveHandler } from './voice/voice-leave.handler';
import { MicToggleHandler } from './voice/voice-mic-toggle.handler';
import { VoiceMoveHandler } from './voice/voice-move.handler';
import { VoiceStateDispatcher } from './voice/voice-state.dispatcher';

@Module({
  imports: [
    AutoChannelModule,      // 추가 — AutoChannelRedisRepository export 포함
    ChannelModule,
    VoiceChannelModule,
    DiscordModule.forFeature(),
  ],
  providers: [
    ChannelStateHandler,
    VoiceStateDispatcher,
    VoiceJoinHandler,
    VoiceLeaveHandler,
    VoiceMoveHandler,
    MicToggleHandler,
    VoiceAloneHandler,
  ],
})
export class DiscordEventsModule {}
```

---

### 11. `apps/api/src/app.module.ts`

**변경 목적**: `AutoChannelModule`을 루트 모듈에 등록하여 `AutoChannelBootstrapService`의 `onApplicationBootstrap` 생명주기 훅이 실행되게 한다.

```typescript
// 기존 imports 배열에 AutoChannelModule 추가
import { AutoChannelModule } from './channel/auto/auto-channel.module';

@Module({
  imports: [
    ConfigModule.forRoot(BaseConfig),
    EventEmitterModule.forRoot(),
    DiscordModule.forRootAsync(DiscordConfig),
    TypeOrmModule.forRootAsync(TypeORMConfig),
    AutoChannelModule,       // 추가
    ChannelModule,
    VoiceChannelModule,
    MusicModule,
    DiscordEventsModule,
    RedisModule,
    VoiceAnalyticsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

충돌 분석:
- `AutoChannelModule`은 `DiscordEventsModule`에서도 import된다. NestJS는 모듈 중복 import를 자동으로 싱글턴으로 처리하므로 문제없음.
- `TypeOrmModule.forFeature([AutoChannelConfig, AutoChannelButton, AutoChannelSubOption])`가 `AutoChannelModule`에서 등록되므로, `AppModule`의 TypeORM root 설정에 엔티티를 별도 추가할 필요 없다(`autoLoadEntities: true`로 설정되어 있음).

---

## 파일 변경 요약

| 파일 | 신규/수정 | 단위 A 담당 내용 |
|------|-----------|-----------------|
| `channel/auto/infrastructure/auto-channel.keys.ts` | 신규 생성 | Redis 키 팩토리 전체 |
| `channel/auto/infrastructure/auto-channel-state.ts` | 신규 생성 | 상태 인터페이스 전체 |
| `channel/auto/infrastructure/auto-channel-redis.repository.ts` | 신규 생성 | 대기방 CRUD + 트리거 Set CRUD 전체 |
| `event/auto-channel/auto-channel-events.ts` | 신규 생성 | 이벤트 상수 + 클래스 전체 |
| `channel/auto/application/auto-channel-bootstrap.service.ts` | 신규 생성 | 트리거 Set 초기화 전체 |
| `channel/auto/application/auto-channel.service.ts` | 신규 생성 | `handleTriggerJoin` 구현 (나머지 메서드는 단위 B/C/D에서 추가) |
| `event/auto-channel/auto-channel-trigger-join.handler.ts` | 신규 생성 | 이벤트 핸들러 전체 |
| `channel/auto/auto-channel.module.ts` | 신규 생성 | 단위 A용 provider 등록 (단위 B/C/D에서 확장) |
| `event/voice/voice-state.dispatcher.ts` | 수정 | 생성자에 `AutoChannelRedisRepository` 추가, `isJoin` 분기에 트리거 감지 로직 추가 |
| `event/discord-events.module.ts` | 수정 | `AutoChannelModule` import 추가 |
| `app.module.ts` | 수정 | `AutoChannelModule` import 추가 |

---

## 핵심 로직 흐름

```
Discord voiceStateUpdate 이벤트
    │
    ▼
VoiceStateDispatcher.dispatch(oldState, newState)
    │
    ├─ isJoin 분기 진입
    │      │
    │      ▼
    │  autoChannelRedis.isTriggerChannel(guildId, channelId)
    │  → Redis SISMEMBER auto_channel:trigger:{guildId} {channelId}
    │      │
    │      ├─ true → eventEmitter.emitAsync(TRIGGER_JOIN, AutoChannelTriggerJoinEvent)
    │      │             → VoiceChannelHistory 미생성, VoiceSession 미생성
    │      │
    │      └─ false → eventEmitter.emitAsync(VOICE_EVENTS.JOIN, VoiceJoinEvent)  [기존 경로]
    │
    ▼
AutoChannelTriggerJoinHandler.handle(event)
    │
    ▼
AutoChannelService.handleTriggerJoin(state)
    │
    ├─ 1. configRepo.findOne({ guildId, triggerChannelId })
    │      → null이면 warn 로그 후 return (Redis stale 상황 방어)
    │
    ├─ 2. applyTemplate(config.waitingRoomTemplate, state.userName)
    │      → '⌛ {username}의 대기방' → '⌛ Onyu의 대기방'
    │
    ├─ 3. discordVoiceGateway.createVoiceChannel({ guildId, name, parentCategoryId })
    │      → ChannelType.GuildVoice, 트리거 채널과 동일한 카테고리(parentCategoryId)
    │      → 생성된 채널 ID 반환
    │
    ├─ 4. autoChannelRedis.setWaitingState(waitingChannelId, { guildId, userId, triggerChannelId, configId })
    │      → Redis SET auto_channel:waiting:{channelId} {JSON} EX 43200
    │
    └─ 5. discordVoiceGateway.moveUserToChannel(guildId, userId, waitingChannelId)
           → guild.members.fetch(userId) → member.voice.setChannel(channelId)
```

---

## Redis 키 패턴 및 저장 구조

### 트리거 채널 집합

```
키:  auto_channel:trigger:{guildId}
타입: Redis Set
TTL:  없음 (명시적 갱신)
작업: SISMEMBER (읽기), SADD / SREM / DEL (쓰기)

예시:
  SADD auto_channel:trigger:123456789 987654321
  SISMEMBER auto_channel:trigger:123456789 987654321  → 1 (true)
```

초기화 시점: `AutoChannelBootstrapService.onApplicationBootstrap` — 봇 기동 시 1회

### 대기방 메타데이터

```
키:  auto_channel:waiting:{waitingChannelId}
타입: Redis String (JSON)
TTL:  43,200초 (12시간)
값:  AutoChannelWaitingState {
       guildId: "123456789",
       userId: "111222333",
       triggerChannelId: "987654321",
       configId: 1
     }

예시:
  SET auto_channel:waiting:444555666 '{"guildId":"...","userId":"...","triggerChannelId":"...","configId":1}' EX 43200
```

소멸 시점:
- TTL 만료 (봇 크래시 시 자동 정리)
- 확정방 전환 시 명시적 삭제 (단위 B에서 처리)
- 채널 비어있을 때 삭제 (단위 C에서 처리)

---

## 에러 처리 전략

### Discord API 오류 (채널 생성 실패)

`discordVoiceGateway.createVoiceChannel`이 예외를 던지면:
- `handleTriggerJoin` 밖으로 예외가 전파된다.
- `AutoChannelTriggerJoinHandler.handle`에서 별도 try-catch를 두지 않는다.
- 최상위 `VoiceStateDispatcher.dispatch`의 try-catch 블록이 `logger.error`로 기록한다.
- 유저는 트리거 채널에 그대로 머무른다(이동 없음). 재입장 시 다시 시도 가능.

### Discord API 오류 (유저 이동 실패)

`moveUserToChannel`이 실패하면:
- 대기방 채널은 이미 생성됨 — 고아 채널이 남는다.
- TTL 12시간 후 Redis 키 자동 만료. Discord 채널 자체는 남지만, 단위 C의 채널 삭제 로직이 아무도 없는 채널로 처리한다.
- 현재 단위에서 rollback(채널 삭제) 로직을 추가하면 복잡도가 올라간다. 이동 실패는 드문 케이스(유저가 이미 퇴장 등)이므로 단위 A에서는 로그만 남기고 단위 C에 위임한다.
- `handleTriggerJoin` 내에서 `moveUserToChannel` 실패 시 최소한 warn 로그를 남기기 위해, 이동 단계만 try-catch로 감싼다:

```typescript
try {
  await this.discordVoiceGateway.moveUserToChannel(state.guildId, state.userId, waitingChannelId);
} catch (err) {
  this.logger.warn(
    `[AUTO CHANNEL] Failed to move user to waiting room: guild=${state.guildId} user=${state.userId} waitingChannel=${waitingChannelId}`,
    (err as Error).stack,
  );
  // 채널은 이미 생성됨 — TTL 만료 또는 단위 C의 빈 채널 삭제로 정리됨
}
```

### DB 설정 없음 (Redis 트리거 Set stale)

`findConfig`가 null을 반환하면 warn 로그 후 조용히 종료.
이 상황은 설정 삭제 후 Redis Set이 갱신되지 않은 경우에 발생할 수 있다. 단위 D(웹 설정 API)에서 설정 삭제 시 `SREM`을 호출하면 이 케이스가 실질적으로 없어진다.

### VoiceStateDto 생성 오류

`VoiceStateDto.fromVoiceState`는 `InvalidVoiceStateError`를 던질 수 있다.
`VoiceStateDispatcher.dispatch`의 최상위 try-catch에서 처리된다 — 별도 처리 불필요.

---

## 기존 코드와의 충돌 분석

| 항목 | 검토 결과 |
|------|-----------|
| `VoiceChannelModule`의 `DiscordVoiceGateway` | exports에 없음. `AutoChannelModule`에서 `DiscordModule.forFeature()`와 함께 독자적으로 provider 등록. 문제없음. |
| `VoiceStateDispatcher`의 `isMove` 분기 | 수정 없음. 이동 중 트리거 채널로의 isMove는 F-VOICE-007 범위 외. |
| `VoiceStateDispatcher`의 `isLeave` 분기 | 단위 A에서는 수정 없음. `CHANNEL_EMPTY` 이벤트 발행은 단위 C에서 추가. |
| `VoiceRecoveryService.onApplicationBootstrap` | 독립적 동작(voice:session:* 키 처리). 실행 순서 의존 없음. 충돌 없음. |
| `TypeOrmModule.forFeature` 중복 등록 | `AutoChannelModule`에서 AutoChannel 엔티티 등록. `VoiceChannelModule`은 다른 엔티티 등록. 중복 없음. |
| `DiscordEventsModule`에 `AutoChannelModule` import | `AutoChannelModule`이 `DiscordModule.forFeature()`를 내부 import. `DiscordEventsModule`도 `DiscordModule.forFeature()`를 import. NestJS 모듈 스코프상 각 모듈이 독립적으로 Discord Client를 주입받으므로 충돌 없음. |
| `AppModule`에 `AutoChannelModule` 이미 import하면 `DiscordEventsModule` 내 import는 중복 | NestJS는 같은 모듈 클래스를 싱글턴으로 관리(모듈 캐싱). provider 중복 인스턴스화 없음. |

---

## 구현 순서

1. `auto-channel.keys.ts` — 키 팩토리 (의존성 없음)
2. `auto-channel-state.ts` — 인터페이스 (의존성 없음)
3. `auto-channel-redis.repository.ts` — RedisService 의존
4. `auto-channel-events.ts` — VoiceStateDto 의존
5. `auto-channel.module.ts` — 위 파일들 의존
6. `auto-channel-bootstrap.service.ts` — configRepo + AutoChannelRedisRepository 의존
7. `auto-channel.service.ts` — configRepo + AutoChannelRedisRepository + DiscordVoiceGateway 의존
8. `auto-channel-trigger-join.handler.ts` — AutoChannelService + auto-channel-events 의존
9. `voice-state.dispatcher.ts` 수정 — AutoChannelRedisRepository + auto-channel-events 의존
10. `discord-events.module.ts` 수정 — AutoChannelModule 의존
11. `app.module.ts` 수정 — AutoChannelModule 의존
