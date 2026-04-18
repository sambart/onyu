# Guild Member Bot 이벤트 핸들러 구현 계획

## 개요

Discord Gateway 이벤트를 Bot 앱에서 수신하여 API의 guild-member 엔드포인트로 HTTP 전달하는 핸들러 5개를 구현한다. 기존 Bot -> API 통신 패턴(`BotApiClientService` + `@On`/`@Once` 데코레이터)을 그대로 따른다.

관련 PRD: `/docs/specs/prd/guild-member.md` (F-GUILD-MEMBER-001 ~ 006)

---

## 사전 조건

- API 측 guild-member 엔드포인트(`/bot-api/guild-member/*`)가 구현 완료되어 있어야 한다.
- `GuildMembers` Privileged Gateway Intent는 이미 활성화됨 (`discord.config.ts`에 `GatewayIntentBits.GuildMembers` 포함).

---

## Step 1: BotApiClientService 및 DTO 확장

### 1-1. 타입 추가 (`libs/bot-api-client/src/types.ts`)

```typescript
// ── Guild Member ──

export interface GuildMemberUpsertDto {
  guildId: string;
  userId: string;
  displayName: string;
  username: string;
  nick: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  joinedAt: string | null; // ISO 8601
}

export interface GuildMemberBulkUpsertDto {
  guildId: string;
  members: GuildMemberUpsertDto[];
}

export interface GuildMemberDeactivateDto {
  guildId: string;
  userId: string;
}

export interface GuildMemberUserUpdateDto {
  userId: string;
  username: string;
  globalName: string | null;
}
```

### 1-2. 메서드 추가 (`libs/bot-api-client/src/bot-api-client.service.ts`)

```typescript
// ── Guild Member ──

async upsertGuildMember(dto: GuildMemberUpsertDto): Promise<void> {
  await this.post('/bot-api/guild-member/upsert', dto);
}

async bulkUpsertGuildMembers(dto: GuildMemberBulkUpsertDto): Promise<void> {
  await this.post('/bot-api/guild-member/bulk-upsert', dto);
}

async deactivateGuildMember(dto: GuildMemberDeactivateDto): Promise<void> {
  await this.post('/bot-api/guild-member/deactivate', dto);
}

async updateGuildMemberByUserUpdate(dto: GuildMemberUserUpdateDto): Promise<void> {
  await this.post('/bot-api/guild-member/user-update', dto);
}
```

### 1-3. index.ts re-export

신규 타입은 기존 `export * from './types'`로 자동 노출되므로 변경 불필요.

---

## Step 2: Bot 이벤트 핸들러 구현

모든 핸들러는 `apps/bot/src/event/guild-member/` 디렉터리에 신설한다.

### 2-1. `bot-guild-member-sync.handler.ts` (clientReady)

| 항목 | 내용 |
|------|------|
| 데코레이터 | `@Once('clientReady')` |
| PRD | F-GUILD-MEMBER-001 |
| 위치 | `apps/bot/src/event/guild-member/bot-guild-member-sync.handler.ts` |

기존 `BotVoiceSyncHandler`에 로직을 추가하지 않고, 별도 핸들러를 신설한다. discord-nestjs는 같은 이벤트에 대해 여러 핸들러를 허용하므로 충돌 없음.

**동작 흐름**:
1. `this.client.guilds.cache` 순회
2. 각 길드에 대해 `guild.members.fetch({ withPresences: false })`로 전체 멤버 조회
3. 멤버를 500건 단위 배치로 분할
4. 각 배치를 `apiClient.bulkUpsertGuildMembers({ guildId, members })` 호출
5. 개별 길드 fetch 실패 시 `logger.error` 후 다음 길드 계속 진행

**헬퍼 함수** (핸들러 내부 private 메서드):

```typescript
/** GuildMember discord.js 객체를 DTO로 변환 */
private toUpsertDto(guildId: string, member: GuildMember): GuildMemberUpsertDto {
  return {
    guildId,
    userId: member.id,
    displayName: member.displayName,
    username: member.user.username,
    nick: member.nickname,
    avatarUrl: member.displayAvatarURL({ size: 128 }),
    isBot: member.user.bot,
    joinedAt: member.joinedAt?.toISOString() ?? null,
  };
}
```

**배치 분할 유틸** (핸들러 내부 private 메서드):

```typescript
private chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

### 2-2. `bot-guild-create.handler.ts` (guildCreate)

| 항목 | 내용 |
|------|------|
| 데코레이터 | `@On('guildCreate')` |
| PRD | F-GUILD-MEMBER-002 |
| 위치 | `apps/bot/src/event/guild-member/bot-guild-create.handler.ts` |

**동작 흐름**:
1. `guild.members.fetch({ withPresences: false })`로 전체 멤버 조회
2. 500건 단위 배치로 `bulkUpsertGuildMembers` 호출
3. fetch 실패 시 `logger.warn` (이후 `guildMemberAdd`로 점진적 누적)

`toUpsertDto`, `chunk` 로직은 sync 핸들러와 동일하므로 공유가 필요하다. 두 가지 방안:

- **방안 A (채택)**: `bot-guild-member-sync.handler.ts`에 `syncGuild(guild)` public 메서드를 두고, `bot-guild-create.handler.ts`에서 DI로 주입하여 재사용.
- 방안 B: 별도 유틸 파일 추출 -- 핸들러가 2개뿐이라 과도.

### 2-3. `bot-member-update.handler.ts` (guildMemberUpdate)

| 항목 | 내용 |
|------|------|
| 데코레이터 | `@On('guildMemberUpdate')` |
| PRD | F-GUILD-MEMBER-004 |
| 위치 | `apps/bot/src/event/guild-member/bot-member-update.handler.ts` |

**동작 흐름**:
1. `oldMember.displayName !== newMember.displayName` 또는 `oldMember.displayAvatarURL() !== newMember.displayAvatarURL()` 체크
2. 변경이 없으면 즉시 return (불필요한 API 호출 방지)
3. 변경이 있으면 `apiClient.upsertGuildMember(toUpsertDto(guildId, newMember))` 호출

**주의사항**:
- `guildMemberUpdate` 이벤트는 역할 변경, 부스트 등 다양한 사유로 발생한다. displayName/avatarUrl 변경이 아닌 경우 반드시 스킵해야 한다.
- `newMember.user`가 null인 경우 처리 중단 및 경고 로그.

### 2-4. `bot-member-remove.handler.ts` (guildMemberRemove)

| 항목 | 내용 |
|------|------|
| 데코레이터 | `@On('guildMemberRemove')` |
| PRD | F-GUILD-MEMBER-006 |
| 위치 | `apps/bot/src/event/guild-member/bot-member-remove.handler.ts` |

**동작 흐름**:
1. `apiClient.deactivateGuildMember({ guildId, userId })` 호출
2. `member.user`가 null인 경우 `member.id`로 userId 사용 (Partial GuildMember일 수 있음)

**참고**: `guildMemberRemove` 이벤트의 인자는 `GuildMember | PartialGuildMember`이다. Partial인 경우 `member.user`가 없을 수 있으므로 `member.id`를 사용한다.

### 2-5. `bot-user-update.handler.ts` (userUpdate)

| 항목 | 내용 |
|------|------|
| 데코레이터 | `@On('userUpdate')` |
| PRD | F-GUILD-MEMBER-005 |
| 위치 | `apps/bot/src/event/guild-member/bot-user-update.handler.ts` |

**동작 흐름**:
1. `oldUser.username !== newUser.username || oldUser.globalName !== newUser.globalName` 체크
2. 변경이 없으면 즉시 return
3. 변경이 있으면 `apiClient.updateGuildMemberByUserUpdate({ userId, username, globalName })` 호출
4. API 측에서 `nick IS NULL`인 행만 displayName 갱신 처리

**주의사항**:
- `userUpdate` 이벤트의 인자는 `(oldUser: User | PartialUser, newUser: User)`이다. `oldUser`가 Partial인 경우 비교가 불가능하므로, Partial이면 무조건 API 호출한다.

---

## Step 3: 기존 `bot-newbie-member-add.handler.ts` 확장

| 항목 | 내용 |
|------|------|
| PRD | F-GUILD-MEMBER-003 |
| 위치 | `apps/bot/src/event/newbie/bot-newbie-member-add.handler.ts` (기존 파일) |

기존 `handleGuildMemberAdd` 메서드의 **맨 앞**에 guild-member upsert 호출을 추가한다. newbie 설정 존재 여부와 무관하게 항상 실행되어야 한다.

**변경 내용**:

```typescript
@On('guildMemberAdd')
async handleGuildMemberAdd(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;

  // guild-member upsert (newbie 설정과 무관하게 항상 실행)
  try {
    await this.apiClient.upsertGuildMember({
      guildId,
      userId: member.id,
      displayName: member.displayName,
      username: member.user.username,
      nick: member.nickname,
      avatarUrl: member.displayAvatarURL({ size: 128 }),
      isBot: member.user.bot,
      joinedAt: member.joinedAt?.toISOString() ?? null,
    });
  } catch (err) {
    this.logger.error(
      `[BOT] guild-member upsert failed: guild=${guildId} member=${member.id}`,
      err instanceof Error ? err.stack : err,
    );
  }

  // ... 이하 기존 newbie 로직 유지 ...
}
```

**대안 검토**: 별도 핸들러에서 `@On('guildMemberAdd')`를 사용하는 방안도 가능하지만, discord-nestjs에서 같은 `@On` 이벤트의 핸들러 실행 순서가 보장되지 않으므로, 기존 핸들러에 추가하는 것이 순서 제어 측면에서 안전하다.

---

## Step 4: BotEventModule 등록

### 수정 대상: `apps/bot/src/event/bot-event.module.ts`

신규 핸들러 4개를 providers에 추가한다.

```typescript
import { BotGuildMemberSyncHandler } from './guild-member/bot-guild-member-sync.handler';
import { BotGuildCreateHandler } from './guild-member/bot-guild-create.handler';
import { BotMemberUpdateHandler } from './guild-member/bot-member-update.handler';
import { BotMemberRemoveHandler } from './guild-member/bot-member-remove.handler';
import { BotUserUpdateHandler } from './guild-member/bot-user-update.handler';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [
    // ... 기존 providers ...
    BotGuildMemberSyncHandler,
    BotGuildCreateHandler,
    BotMemberUpdateHandler,
    BotMemberRemoveHandler,
    BotUserUpdateHandler,
  ],
})
export class BotEventModule {}
```

---

## Step 5: Discord Partials 설정 확인

`userUpdate` 이벤트의 `oldUser`가 Partial일 수 있으므로, `discord.config.ts`에 `Partials.User`가 필요한지 확인한다.

- discord.js v14에서 `userUpdate`는 기본적으로 캐시된 유저만 emit한다.
- Bot이 참여한 길드의 멤버는 `GuildMembers` intent로 캐시되므로, 별도 Partials 설정 없이 동작한다.
- `guildMemberRemove`도 캐시된 멤버는 Full 객체로 수신되며, 캐시에 없는 경우만 Partial이다. `Partials.GuildMember` 추가가 권장되나 필수는 아님.

**결론**: 현재 설정(`GatewayIntentBits.GuildMembers`)으로 충분하다. Partial 처리는 핸들러 코드에서 방어적으로 처리한다.

---

## 파일 목록 요약

| 구분 | 파일 경로 | 작업 |
|------|-----------|------|
| 신규 | `libs/bot-api-client/src/types.ts` | DTO 4종 추가 |
| 수정 | `libs/bot-api-client/src/bot-api-client.service.ts` | 메서드 4종 추가 |
| 신규 | `apps/bot/src/event/guild-member/bot-guild-member-sync.handler.ts` | clientReady 핸들러 |
| 신규 | `apps/bot/src/event/guild-member/bot-guild-create.handler.ts` | guildCreate 핸들러 |
| 신규 | `apps/bot/src/event/guild-member/bot-member-update.handler.ts` | guildMemberUpdate 핸들러 |
| 신규 | `apps/bot/src/event/guild-member/bot-member-remove.handler.ts` | guildMemberRemove 핸들러 |
| 신규 | `apps/bot/src/event/guild-member/bot-user-update.handler.ts` | userUpdate 핸들러 |
| 수정 | `apps/bot/src/event/newbie/bot-newbie-member-add.handler.ts` | guildMemberAdd에 upsert 추가 |
| 수정 | `apps/bot/src/event/bot-event.module.ts` | 신규 핸들러 5개 등록 |

---

## 기존 코드 충돌 분석

| 대상 | 충돌 여부 | 설명 |
|------|-----------|------|
| `BotVoiceSyncHandler` (`@Once('clientReady')`) | 없음 | 별도 핸들러로 분리, discord-nestjs는 동일 이벤트 다중 핸들러 지원 |
| `BotNewbieMemberAddHandler` (`@On('guildMemberAdd')`) | 수정 필요 | 기존 핸들러에 upsert 로직 추가 (Step 3) |
| `discord.config.ts` | 없음 | `GuildMembers` intent 이미 활성화 |
| `BotApiClientService` | 추가만 | 기존 메서드에 영향 없음, 새 메서드 4개만 추가 |

---

## 구현 순서 (권장)

1. **Step 1** -- BotApiClientService DTO/메서드 추가 (API 측 엔드포인트가 준비되어 있어야 테스트 가능)
2. **Step 2-1, 2-2** -- clientReady sync + guildCreate 핸들러 (초기 데이터 적재)
3. **Step 3** -- guildMemberAdd 확장 (기존 코드 수정)
4. **Step 2-3** -- guildMemberUpdate 핸들러
5. **Step 2-4** -- guildMemberRemove 핸들러
6. **Step 2-5** -- userUpdate 핸들러
7. **Step 4** -- 모듈 등록 및 통합 테스트
