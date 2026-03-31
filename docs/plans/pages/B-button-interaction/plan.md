# 단위 B: 버튼 인터랙션 + 확정방 전환 — 구현 계획

## 범위

PRD 기능: F-VOICE-009 (안내 메시지/버튼 전송·갱신), F-VOICE-010 (하위 선택지 Ephemeral 처리), F-VOICE-011 (확정방 전환)

이 단위에서 새로 생성하거나 수정하는 파일은 공통 모듈 판단 문서(`/docs/specs/auto-channel-common-modules.md`) 5절의 파일 경로 목록과 일치한다.
단위 A(트리거-대기방), 단위 C(채널 삭제), 단위 D(웹 설정 API)와 수정 파일 충돌이 없음을 공통 모듈 문서 3차 검증에서 이미 확인하였다.

---

## 전제 조건 (공통 모듈 단계에서 선행 완료)

다음 파일들이 공통 모듈 단계에서 이미 생성·수정되어 있어야 한다.

| 파일 | 상태 | 이유 |
|------|------|------|
| `apps/api/src/channel/auto/infrastructure/auto-channel.keys.ts` | 신규 | Redis 키 중앙화 |
| `apps/api/src/channel/auto/infrastructure/auto-channel-state.ts` | 신규 | 공유 타입 정의 |
| `apps/api/src/channel/auto/infrastructure/auto-channel-redis.repository.ts` | 신규 | Redis CRUD |
| `apps/api/src/event/auto-channel/auto-channel-events.ts` | 신규 | 이벤트 상수 |
| `apps/api/src/channel/auto/auto-channel.module.ts` | 신규 | 모듈 등록 |
| `apps/api/src/event/discord-events.module.ts` | 수정 | AutoChannelModule import |
| `apps/api/src/app.module.ts` | 수정 | AutoChannelModule import |

---

## 생성/수정 파일 목록

### 신규 생성 (이 단위 B 전용)

```
apps/api/src/channel/auto/infrastructure/auto-channel-discord.gateway.ts  (2-13)
apps/api/src/event/auto-channel/auto-channel-interaction.handler.ts        (2-7)
apps/api/src/channel/auto/application/auto-channel.service.ts              (2-8, 일부 메서드)
```

`auto-channel.service.ts`는 단위 A/C/D도 사용하는 공통 서비스이지만, 파일 자체는 공통 모듈 단계 또는 이 단위에서 먼저 생성하고 각 단위가 메서드를 추가한다. 이 단위에서 담당하는 메서드는 `handleButtonClick`, `handleSubOptionClick`, `convertToConfirmed`, `resolveChannelName`, `sendOrUpdateGuideMessage`이다.

### 기존 수정 없음

이 단위에서 기존 파일을 직접 수정하지 않는다. `DiscordEventsModule`에 `AutoChannelInteractionHandler` 추가는 공통 모듈 단계 수정(3-2)에 포함된다.

---

## 구현 상세

### 1. `auto-channel-discord.gateway.ts`

**경로**: `apps/api/src/channel/auto/infrastructure/auto-channel-discord.gateway.ts`

`DiscordVoiceGateway`와 동일한 패턴으로 설계한다. `@InjectDiscordClient()`로 `Client`를 주입받는다.

#### 메서드 시그니처

```typescript
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  TextChannel,
} from 'discord.js';

import { AutoChannelButton } from '../domain/auto-channel-button.entity';

@Injectable()
export class AutoChannelDiscordGateway {
  private readonly logger = new Logger(AutoChannelDiscordGateway.name);

  constructor(@InjectDiscordClient() private readonly client: Client) {}

  /**
   * 트리거 채널 텍스트에 안내 메시지 + 버튼을 신규 전송한다.
   * 반환값: Discord message ID (guideMessageId로 저장)
   */
  async sendGuideMessage(
    triggerChannelId: string,
    guideMessage: string,
    buttons: AutoChannelButton[],
  ): Promise<string>

  /**
   * 기존 안내 메시지를 수정한다.
   * 메시지를 찾지 못하면 (삭제된 경우) sendGuideMessage를 호출하여 새로 전송한다.
   * 반환값: 최종 message ID
   */
  async editGuideMessage(
    triggerChannelId: string,
    messageId: string,
    guideMessage: string,
    buttons: AutoChannelButton[],
  ): Promise<string>

  /**
   * 대기방 채널명과 카테고리를 동시에 변경한다. (삭제+재생성 아님)
   * Discord API: channel.edit({ name, parent })
   */
  async editVoiceChannel(
    channelId: string,
    name: string,
    parentCategoryId: string,
  ): Promise<void>

  /**
   * 서버 내 음성 채널 목록을 조회한다.
   * 중복 채널명 순번 처리에 사용한다.
   * 반환값: 채널명 Set
   */
  async fetchGuildVoiceChannelNames(guildId: string): Promise<Set<string>>

  /** ActionRow 배열 빌드 (sendGuideMessage, editGuideMessage 공통 사용) */
  private buildActionRows(buttons: AutoChannelButton[]): ActionRowBuilder<ButtonBuilder>[]
}
```

#### 구현 로직 상세

**`buildActionRows` 내부 로직**:
- `buttons`를 `sortOrder` 오름차순 정렬
- `customId` 패턴: `auto_btn:{button.id}` (공통 모듈 문서 6절 규칙)
- `ButtonStyle.Primary` 고정
- `emoji`가 null이 아닐 때만 emoji 프로퍼티 추가 (`{ name: button.emoji }`)
- Discord 제약: ActionRow당 버튼 최대 5개, 최대 5행 → `chunk(buttons, 5)`로 ActionRow 분리

**`sendGuideMessage` 내부 로직**:
```
1. client.channels.fetch(triggerChannelId) → TextChannel 확인
2. channel.send({ content: guideMessage, components: buildActionRows(buttons) })
3. return message.id
```

**`editGuideMessage` 내부 로직**:
```
1. client.channels.fetch(triggerChannelId) → TextChannel 확인
2. channel.messages.fetch(messageId) 시도
3. 성공: message.edit({ content: guideMessage, components: buildActionRows(buttons) }) → return messageId
4. 실패(DiscordAPIError: Unknown Message 등): sendGuideMessage 호출 → return 새 message.id
```

**`editVoiceChannel` 내부 로직**:
```
1. client.channels.fetch(channelId) → VoiceChannel 확인
2. channel.edit({ name, parent: parentCategoryId })
```

**`fetchGuildVoiceChannelNames` 내부 로직**:
```
1. client.guilds.fetch(guildId)
2. guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice)
3. 채널명 Set으로 변환하여 반환
```

---

### 2. `auto-channel-interaction.handler.ts`

**경로**: `apps/api/src/event/auto-channel/auto-channel-interaction.handler.ts`

`@On('interactionCreate')` 데코레이터를 사용하여 Discord.js `interactionCreate` 이벤트를 수신한다. 이는 기존 `VoiceStateDispatcher`가 `@On('voiceStateUpdate')`를 사용하는 것과 동일한 패턴이다.

```typescript
import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { Interaction } from 'discord.js';

import { AutoChannelService } from '../../channel/auto/application/auto-channel.service';

@Injectable()
export class AutoChannelInteractionHandler {
  private readonly logger = new Logger(AutoChannelInteractionHandler.name);

  constructor(private readonly autoChannelService: AutoChannelService) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void>
}
```

#### `handle` 내부 로직

```
1. interaction.isButton() 확인 → 아니면 즉시 return
2. customId = interaction.customId
3. customId.startsWith('auto_btn:') → autoChannelService.handleButtonClick(interaction) 호출
4. customId.startsWith('auto_sub:') → autoChannelService.handleSubOptionClick(interaction) 호출
5. 그 외 → return (다른 모듈의 버튼 인터랙션이므로 무시)
6. try-catch: 에러 로깅 (interaction.replied/deferred 상태 확인 후 에러 ephemeral 응답)
```

---

### 3. `auto-channel.service.ts` (이 단위 담당 메서드)

**경로**: `apps/api/src/channel/auto/application/auto-channel.service.ts`

#### 의존성 (생성자 주입)

```typescript
constructor(
  private readonly autoChannelRedisRepository: AutoChannelRedisRepository,
  private readonly autoChannelConfigRepository: AutoChannelConfigRepository,
  private readonly autoChannelDiscordGateway: AutoChannelDiscordGateway,
  private readonly voiceChannelService: VoiceChannelService,
)
```

`VoiceChannelService`는 `VoiceChannelModule`이 export하고 있으므로 `AutoChannelModule`이 `VoiceChannelModule`을 import하면 주입 가능하다.

#### 메서드 시그니처

```typescript
/**
 * F-VOICE-009: 안내 메시지 전송 또는 갱신
 * 웹 설정 API 컨트롤러(단위 D)에서 호출하거나,
 * 봇 기동 시 안내 메시지가 없는 설정에 대해 호출된다.
 */
async sendOrUpdateGuideMessage(configId: number): Promise<void>

/**
 * F-VOICE-010 / F-VOICE-011: 1단계 버튼 클릭 처리
 * - 하위 선택지 없음 → convertToConfirmed 직접 호출 (F-VOICE-011)
 * - 하위 선택지 있음 → Ephemeral 메시지로 하위 버튼 표시 (F-VOICE-010)
 */
async handleButtonClick(interaction: ButtonInteraction): Promise<void>

/**
 * F-VOICE-011: 2단계 하위 선택지 클릭 처리 → 확정방 전환
 */
async handleSubOptionClick(interaction: ButtonInteraction): Promise<void>

/**
 * F-VOICE-011: 대기방 → 확정방 전환 핵심 로직
 */
private async convertToConfirmed(
  interaction: ButtonInteraction,
  waitingChannelId: string,
  waitingState: AutoChannelWaitingState,
  button: AutoChannelButton,
  subOption?: AutoChannelSubOption,
): Promise<void>

/**
 * 확정방 채널명 중복 시 순번 부여
 * 예: "Onyu의 오버워치" → "Onyu의 오버워치 2"
 */
private async resolveChannelName(
  guildId: string,
  baseName: string,
): Promise<string>
```

#### `sendOrUpdateGuideMessage` 로직

```
1. autoChannelConfigRepository.findById(configId, { relations: ['buttons', 'buttons.subOptions'] })
2. config.guideMessageId가 null
   → autoChannelDiscordGateway.sendGuideMessage(config.triggerChannelId, config.guideMessage, config.buttons)
   → messageId 반환
3. config.guideMessageId가 존재
   → autoChannelDiscordGateway.editGuideMessage(config.triggerChannelId, config.guideMessageId, config.guideMessage, config.buttons)
   → messageId 반환 (기존 또는 새로 생성된 메시지 ID)
4. autoChannelConfigRepository.updateGuideMessageId(configId, messageId)
```

#### `handleButtonClick` 로직

```
1. customId에서 buttonId 파싱: parseInt(interaction.customId.split(':')[1])
2. userId = interaction.user.id, guildId = interaction.guildId
3. guildId가 null → 에러 응답 (DM에서는 동작 안 함)
4. 유저의 음성 채널 상태 확인:
   voiceChannelId = interaction.member.voice.channelId  (GuildMember 타입 캐스팅)
5. voiceChannelId가 null → ephemeral 에러: "음성 채널에 입장하지 않았습니다."
6. autoChannelRedisRepository.getWaitingState(voiceChannelId) 조회
7. waitingState가 null → ephemeral 에러: "대기방에 있지 않습니다."
8. waitingState.userId !== userId → ephemeral 에러: "본인의 대기방에서만 선택할 수 있습니다."
9. button = autoChannelConfigRepository.findButtonById(buttonId, { relations: ['subOptions'] })
10. button이 null → ephemeral 에러: "버튼 설정을 찾을 수 없습니다."
11. button.subOptions.length === 0
    → convertToConfirmed(interaction, voiceChannelId, waitingState, button) 호출
12. button.subOptions.length > 0
    → interaction.reply({ ephemeral: true, content: '선택지를 고르세요.', components: [하위 버튼 ActionRow] })
    → 하위 버튼 customId 패턴: auto_sub:{subOption.id}
```

#### `handleSubOptionClick` 로직

```
1. customId에서 subOptionId 파싱: parseInt(interaction.customId.split(':')[1])
2. userId = interaction.user.id, guildId = interaction.guildId
3. voiceChannelId = interaction.member.voice.channelId
4. voiceChannelId가 null → ephemeral 에러: "음성 채널에 입장하지 않았습니다."
5. waitingState = autoChannelRedisRepository.getWaitingState(voiceChannelId)
6. waitingState가 null → ephemeral 에러: "대기방에 있지 않습니다."
7. waitingState.userId !== userId → ephemeral 에러: "본인의 대기방에서만 선택할 수 있습니다."
8. subOption = autoChannelConfigRepository.findSubOptionById(subOptionId, { relations: ['button'] })
9. subOption이 null → ephemeral 에러: "선택지 설정을 찾을 수 없습니다."
10. convertToConfirmed(interaction, voiceChannelId, waitingState, subOption.button, subOption) 호출
```

#### `convertToConfirmed` 로직

```
1. 확정방 채널명 결정:
   - baseName = subOption
     ? `${userName}의 ${button.label} ${subOption.channelSuffix}`
     : `${userName}의 ${button.label}`
   - userName: interaction.member.displayName (GuildMember 캐스팅)
   - finalName = await resolveChannelName(guildId, baseName)

2. Discord 채널 수정 (대기방 → 확정방 변환):
   await autoChannelDiscordGateway.editVoiceChannel(
     waitingChannelId,
     finalName,
     button.targetCategoryId,
   )

3. Redis 상태 전환:
   await autoChannelRedisRepository.deleteWaitingState(waitingChannelId)
   await autoChannelRedisRepository.setConfirmedState(waitingChannelId, {
     guildId: waitingState.guildId,
     userId: waitingState.userId,
     buttonId: button.id,
     subOptionId: subOption?.id,
   })

4. 세션 추적 시작 (F-VOICE-001과 동일):
   voiceStateDto = new VoiceStateDto(
     waitingState.guildId,
     waitingState.userId,
     waitingChannelId,
     userName,
     finalName,
     button.targetCategoryId,
     micOn,        // interaction.member.voice.selfMute 역전값
     alone,        // 채널 멤버 수 === 1 여부
     memberCount,  // 채널 멤버 수
   )
   await voiceChannelService.onUserJoined(voiceStateDto)

5. 인터랙션 응답:
   interaction.replied 또는 interaction.deferred 상태 확인
   → interaction.reply({ ephemeral: true, content: `${finalName} 방이 생성되었습니다!` })
     또는 interaction.editReply(...)
```

**VoiceStateDto 생성 시 채널 정보 획득 방법**:
`interaction.member.voice` (`VoiceState` 타입)에서 직접 접근 가능하다.
- `interaction.member.voice.selfMute` → micOn = `!selfMute`
- `interaction.member.voice.channel.members.size` → memberCount, alone

#### `resolveChannelName` 로직

```
1. existingNames = await autoChannelDiscordGateway.fetchGuildVoiceChannelNames(guildId)
2. existingNames에 baseName이 없으면 → return baseName
3. index = 2부터 시작
4. while (`${baseName} ${index}` in existingNames) → index++
5. return `${baseName} ${index}`
```

---

### 4. `auto-channel.module.ts` 수정 사항

이 단위의 신규 파일들이 모듈에 등록되어야 한다.

```typescript
// providers에 추가
AutoChannelDiscordGateway,
AutoChannelInteractionHandler,

// imports에 추가 (이미 있어야 하는 것)
VoiceChannelModule,   // VoiceChannelService export 포함
DiscordModule.forFeature(),
TypeOrmModule.forFeature([AutoChannelConfig, AutoChannelButton, AutoChannelSubOption]),
```

---

### 5. `discord-events.module.ts` 수정

공통 모듈 문서 3-2절에 명시된 수정: `AutoChannelInteractionHandler`를 providers에 추가한다.

```typescript
// 추가할 import
import { AutoChannelInteractionHandler } from './auto-channel/auto-channel-interaction.handler';

// providers 배열에 추가
AutoChannelInteractionHandler,
```

단, `AutoChannelInteractionHandler`는 `AutoChannelService`에 의존하므로, `AutoChannelModule`을 import하거나 `AutoChannelService`가 export되어야 한다. `DiscordEventsModule`에서 `AutoChannelModule`을 import하는 것이 더 명확하다.

```typescript
// imports에 추가
AutoChannelModule,
```

---

## customId 네이밍 규칙

공통 모듈 문서 6절을 그대로 따른다.

| 버튼 종류 | customId 패턴 | 예시 |
|-----------|---------------|------|
| 1단계 버튼 (하위 선택지 없음/있음 모두) | `auto_btn:{buttonId}` | `auto_btn:3` |
| 2단계 하위 선택지 버튼 | `auto_sub:{subOptionId}` | `auto_sub:12` |

- `interaction.customId.startsWith('auto_btn:')` → `handleButtonClick`
- `interaction.customId.startsWith('auto_sub:')` → `handleSubOptionClick`
- 파싱: `parseInt(interaction.customId.split(':')[1], 10)`

---

## interactionCreate 핸들링 방법

`@discord-nestjs/core`의 `@On('interactionCreate')` 데코레이터를 사용한다.
이는 기존 `VoiceStateDispatcher`가 `@On('voiceStateUpdate')`를 사용하는 것과 동일한 discord-nestjs 패턴이다.

```typescript
// voice-state.dispatcher.ts 기존 패턴
@On('voiceStateUpdate')
async dispatch(oldState: VoiceState, newState: VoiceState) { ... }

// auto-channel-interaction.handler.ts 동일 패턴
@On('interactionCreate')
async handle(interaction: Interaction): Promise<void> { ... }
```

`interaction.isButton()` 타입 가드로 `ButtonInteraction`으로 좁힌 뒤 `interaction.member`를 `GuildMember`로 타입 캐스팅하여 voice 정보에 접근한다.

---

## 에러 처리 전략

| 상황 | 처리 방식 |
|------|-----------|
| 음성 채널 미입장 | `interaction.reply({ ephemeral: true, content: '음성 채널에 입장한 후 클릭하세요.' })` |
| 대기방 아닌 채널에서 클릭 | `interaction.reply({ ephemeral: true, content: '대기방에서만 선택할 수 있습니다.' })` |
| 타인의 대기방에서 클릭 | `interaction.reply({ ephemeral: true, content: '본인의 대기방에서만 선택할 수 있습니다.' })` |
| button/subOption DB 미존재 | `interaction.reply({ ephemeral: true, content: '설정을 찾을 수 없습니다. 관리자에게 문의하세요.' })` |
| Discord API 오류 (채널 수정 실패) | Logger.error 기록 + `interaction.reply/followUp({ ephemeral: true, content: '오류가 발생했습니다. 잠시 후 다시 시도하세요.' })` |
| handler 최상위 try-catch | `interaction.replied || interaction.deferred` 여부 확인 후 `followUp` 또는 `reply`로 오류 안내 |

인터랙션 응답은 반드시 3초 이내에 이루어져야 한다(Discord 제약). `convertToConfirmed`는 DB 조회와 Discord API 호출이 포함되므로, 핸들러 진입 직후 `interaction.deferReply({ ephemeral: true })`를 고려한다.

**defer 전략**:
- `handleButtonClick`: 하위 선택지 없는 경우 처리가 길어질 수 있으므로 `deferReply({ ephemeral: true })` 사용 후 `editReply`
- `handleButtonClick`: 하위 선택지 있는 경우 Ephemeral 즉시 `reply` (defer 불필요)
- `handleSubOptionClick`: `deferReply({ ephemeral: true })` 사용 후 `editReply`

실제 구현 시 선택지 유무를 판단하기 전에는 defer할 수 없으므로, 다음 방식을 사용한다:

```
handleButtonClick:
  1. buttonId 파싱, 유저/채널 확인 (동기적, 빠름) → 유효성 실패 시 즉시 reply
  2. button 로드 (DB 조회)
  3. subOptions.length === 0 → deferReply → convertToConfirmed → editReply
  4. subOptions.length > 0 → reply(Ephemeral, 하위 버튼)

handleSubOptionClick:
  1. 유효성 검증 → 실패 시 즉시 reply
  2. deferReply({ ephemeral: true })
  3. convertToConfirmed
  4. editReply
```

---

## 기존 코드 충돌 검토

### `VoiceChannelService.onUserJoined` 재사용

`convertToConfirmed`에서 `voiceChannelService.onUserJoined(dto)`를 직접 호출한다. 이 메서드는 `MemberService.findOrCreateMember`, `ChannelService.findOrCreateChannel`, `VoiceChannelHistoryService.logJoin`, `VoiceSessionService.startOrUpdateSession`, `VoiceTempChannelService.handleJoin`을 순차 실행한다.

**주의**: `VoiceTempChannelService.handleJoin`은 임시 채널 생성 정책(`VoiceChannelPolicy.shouldCreateTempChannel`)을 확인하고, 해당 채널이 임시 채널 트리거이면 새 채널을 생성하고 이동시킨다. 확정방 전환 시에는 이 정책이 활성화되어 있으면 의도치 않은 임시 채널이 생성될 수 있다.

**해결**: `VoiceChannelPolicy.shouldCreateTempChannel`의 로직을 확인하여, 확정방 채널 ID가 임시 채널 트리거로 등록되어 있지 않은 구조임을 확인해야 한다. 현재 임시 채널 기능과 자동방 기능은 별도 채널을 사용하므로 충돌하지 않는다. 단, 만약 향후 충돌 가능성이 있다면 `onUserJoined`를 직접 호출하는 대신 세부 서비스(`historyService`, `sessionService`)를 개별 호출하는 방식을 사용한다.

### `VoiceStateDispatcher` — `isJoin` 이벤트 분기

공통 모듈 단계에서 `isJoin` 분기에 트리거 채널 판별 로직이 추가된다. 확정방 전환 시 `voiceChannelService.onUserJoined`를 직접 호출하므로 Discord 이벤트 경로(`voiceStateUpdate`)와는 독립적이다. 확정방 채널로 유저가 이미 이동된 상태(대기방에서 채널명·카테고리만 변경)이므로 `voiceStateUpdate` 이벤트가 새로 발생하지 않는다. 이중 세션 등록 위험 없음.

### `interactionCreate` 이벤트 중복 처리

다른 모듈에서 `@On('interactionCreate')`를 등록한 핸들러가 있어도 discord-nestjs는 이벤트를 모든 등록된 핸들러에 전달한다. `customId.startsWith('auto_btn:')` 또는 `'auto_sub:'` 필터로 자동방 버튼만 처리하고 나머지는 즉시 return하므로 충돌하지 않는다.

---

## 파일별 최종 의존성 그래프

```
AutoChannelInteractionHandler
  └── AutoChannelService
        ├── AutoChannelRedisRepository (공통 모듈)
        │     └── RedisService (기존 재사용)
        ├── AutoChannelConfigRepository (공통 모듈, 단위 D 완성)
        │     └── TypeORM Repository
        ├── AutoChannelDiscordGateway (이 단위 신규)
        │     └── Client (discord.js)
        └── VoiceChannelService (기존 재사용)
              ├── VoiceSessionService
              ├── VoiceChannelHistoryService
              ├── MemberService
              ├── ChannelService
              └── VoiceTempChannelService

AutoChannelDiscordGateway
  └── Client (discord.js, @InjectDiscordClient)
```

---

## 단계별 구현 순서

1. `auto-channel-discord.gateway.ts` 생성
   - `buildActionRows` private 메서드
   - `sendGuideMessage`
   - `editGuideMessage`
   - `editVoiceChannel`
   - `fetchGuildVoiceChannelNames`

2. `auto-channel.service.ts` 이 단위 담당 메서드 추가
   - `resolveChannelName`
   - `convertToConfirmed`
   - `handleButtonClick`
   - `handleSubOptionClick`
   - `sendOrUpdateGuideMessage`

3. `auto-channel-interaction.handler.ts` 생성
   - `@On('interactionCreate')` handle 메서드

4. `auto-channel.module.ts` providers에 신규 클래스 등록 확인

5. `discord-events.module.ts` `AutoChannelInteractionHandler` providers 추가 및 `AutoChannelModule` import 확인
