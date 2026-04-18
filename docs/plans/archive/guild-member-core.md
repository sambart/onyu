# Guild Member 핵심 모듈 구현 계획

> 작성일: 2026-04-04
> 범위: `apps/api/src/guild-member/` (API 앱 내 핵심 모듈만)
> 관련 PRD: `/docs/specs/prd/guild-member.md`

---

## 1. 개요

Discord 길드 멤버 정보를 DB에 중앙 저장하고, Bot Gateway 이벤트를 HTTP로 수신하여 실시간 동기화하는 `guild-member` 핵심 모듈을 구현한다. 기존 `member` 모듈(guild-scope 없는 단순 userId-nickname 매핑)을 대체한다.

### 이 계획에서 다루는 것

- GuildMemberRepository (infrastructure)
- GuildMemberService (application)
- GuildMemberModule (@Global)
- BotGuildMemberController (bot-api 엔드포인트)
- app.module.ts, bot-api.module.ts 등록

### 이 계획에서 다루지 않는 것

- Bot 측 Gateway 이벤트 핸들러 구현
- 소비자 도메인 전환 (inactive-member, newbie, status-prefix, voice)
- member 테이블 마이그레이션 및 DROP
- voice_channel_history FK 재지정

---

## 2. 파일 구조

```
apps/api/src/guild-member/
  guild-member.module.ts              # @Global() 모듈
  application/
    guild-member.service.ts           # 비즈니스 로직
    guild-member.service.spec.ts      # 단위 테스트
  infrastructure/
    guild-member.orm-entity.ts        # (이미 존재)
    guild-member.repository.ts        # DB 저장소

apps/api/src/bot-api/guild-member/
    bot-guild-member.controller.ts    # Bot -> API 엔드포인트
    dto/
      guild-member-sync.dto.ts        # sync 요청 DTO
      guild-member-upsert.dto.ts      # upsert 요청 DTO
      guild-member-deactivate.dto.ts  # deactivate 요청 DTO
      guild-member-update-display-name.dto.ts
      guild-member-update-global-profile.dto.ts
```

---

## 3. 단계별 구현 항목

### 3-1. GuildMemberRepository (`infrastructure/guild-member.repository.ts`)

TypeORM Repository 패턴을 사용한다. 기존 `InactiveMemberRepository`와 동일한 패턴을 따른다.

#### 메서드 목록

| 메서드 | 설명 | SQL 패턴 |
|--------|------|----------|
| `upsert(data)` | 단일 멤버 upsert | `INSERT ... ON CONFLICT (guildId, userId) DO UPDATE` |
| `bulkUpsert(guildId, members)` | 500건 단위 배치 upsert | raw SQL, 파라미터 바인딩 |
| `deactivate(guildId, userId)` | `isActive=false` 마킹 | `UPDATE ... SET isActive=false WHERE ...` |
| `updateDisplayName(guildId, userId, displayName, nick, avatarUrl)` | 닉네임/아바타 변경 | 조건부 UPDATE |
| `updateGlobalProfile(userId, displayName, username)` | nick=null인 행만 갱신 | `UPDATE ... WHERE userId=? AND nick IS NULL` |
| `findByGuildAndUser(guildId, userId)` | 단일 멤버 조회 | SELECT WHERE guildId AND userId |
| `findByGuildAndUsers(guildId, userIds)` | 복수 멤버 조회 | SELECT WHERE guildId AND userId IN (...) |
| `findActiveMembers(guildId)` | 활성 멤버 전체 | SELECT WHERE guildId AND isActive=true |
| `findActiveMembersExcludingBots(guildId)` | 활성 비봇 멤버 | SELECT WHERE guildId AND isActive=true AND isBot=false |
| `findByJoinedAfter(guildId, date)` | 가입일 기준 조회 | SELECT WHERE guildId AND joinedAt >= date |

#### bulkUpsert 상세

- `InactiveMemberRepository.batchUpsertRecords()`와 동일한 raw SQL 배치 패턴 사용
- 컬럼 수(10개): guildId, userId, displayName, username, nick, avatarUrl, isBot, joinedAt, isActive, updatedAt
- `CHUNK_SIZE = Math.floor(65535 / 10)` = 6553건이나, PRD 요구사항대로 500건 단위로 제한
- ON CONFLICT (guildId, userId) DO UPDATE SET displayName, username, nick, avatarUrl, isBot, joinedAt, isActive=true, updatedAt=NOW()

```sql
INSERT INTO guild_member
  ("guildId","userId","displayName","username","nick","avatarUrl","isBot","joinedAt","isActive","updatedAt")
VALUES ($1,$2,$3,$4,$5,$6,$7::boolean,$8::timestamp,true,NOW()), ...
ON CONFLICT ("guildId","userId")
DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "username" = EXCLUDED."username",
  "nick" = EXCLUDED."nick",
  "avatarUrl" = EXCLUDED."avatarUrl",
  "isBot" = EXCLUDED."isBot",
  "joinedAt" = EXCLUDED."joinedAt",
  "isActive" = true,
  "updatedAt" = NOW()
```

### 3-2. GuildMemberService (`application/guild-member.service.ts`)

Repository를 래핑하여 비즈니스 로직을 제공한다. 소비자 도메인이 직접 사용하는 public API 계층이다.

#### public 메서드

| 메서드 | PRD 기능 | 설명 |
|--------|----------|------|
| `upsertMember(data)` | F-003 | 단일 멤버 upsert (입장/재입장) |
| `bulkUpsertMembers(guildId, members)` | F-001, F-002 | 초기 동기화, 길드 추가 시 대량 upsert |
| `deactivateMember(guildId, userId)` | F-006 | 퇴장 처리 (isActive=false) |
| `updateDisplayName(guildId, userId, displayName, nick, avatarUrl)` | F-004 | 닉네임 변경 처리 |
| `updateGlobalProfile(userId, displayName, username)` | F-005 | 전역 프로필 변경 (nick=null 행만) |
| `findByUserId(guildId, userId)` | F-007 | 단일 멤버 조회, null 반환 가능 |
| `findByUserIds(guildId, userIds)` | F-007 | 복수 멤버 조회, `Map<userId, GuildMemberOrmEntity>` 반환 |
| `findActiveMembers(guildId)` | F-007 | 활성 멤버 전체 조회 |
| `findActiveMembersExcludingBots(guildId)` | F-007 | 활성 비봇 멤버 조회 |
| `findByJoinedAfter(guildId, date)` | F-007 | 가입일 이후 멤버 조회 |

#### 반환 타입

- 단일 조회: `GuildMemberOrmEntity | null`
- 복수 조회(`findByUserIds`): `Map<string, GuildMemberOrmEntity>` (userId 키)
- 목록 조회: `GuildMemberOrmEntity[]`
- 변경 작업: `void`

#### 로깅

- `bulkUpsertMembers`: 완료 시 `[GuildMemberService] bulk upsert: guild={guildId} count={n}` (log level)
- `deactivateMember`: `[GuildMemberService] deactivate: guild={guildId} user={userId}` (debug level)
- `updateDisplayName`: 변경 발생 시에만 debug 로그
- 오류: `getErrorStack(err)` 유틸 사용

### 3-3. GuildMemberModule (`guild-member.module.ts`)

```typescript
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GuildMemberOrmEntity])],
  providers: [GuildMemberService, GuildMemberRepository],
  exports: [GuildMemberService],
})
export class GuildMemberModule {}
```

- `@Global()` 데코레이터로 등록하여, 소비자 도메인(inactive-member, newbie, status-prefix, voice)에서 imports 없이 GuildMemberService를 주입받을 수 있다.
- 기존 `@Global()` 모듈 패턴: `RedisModule`, `DiscordRestModule`, `CommonModule`과 동일.

### 3-4. Bot API Controller (`bot-api/guild-member/bot-guild-member.controller.ts`)

기존 `BotVoiceController`, `BotNewbieController`와 동일한 패턴을 따른다.

```typescript
@Controller('bot-api/guild-member')
@UseGuards(BotApiAuthGuard)
export class BotGuildMemberController { ... }
```

#### 엔드포인트

| 엔드포인트 | HTTP | DTO | 서비스 호출 | 설명 |
|-----------|------|-----|------------|------|
| `/bot-api/guild-member/sync` | POST | `GuildMemberSyncDto` | `bulkUpsertMembers()` | 초기 동기화 / 길드 추가 (F-001, F-002) |
| `/bot-api/guild-member/upsert` | POST | `GuildMemberUpsertDto` | `upsertMember()` | 멤버 입장 (F-003) |
| `/bot-api/guild-member/deactivate` | POST | `GuildMemberDeactivateDto` | `deactivateMember()` | 멤버 퇴장 (F-006) |
| `/bot-api/guild-member/update-display-name` | POST | `GuildMemberUpdateDisplayNameDto` | `updateDisplayName()` | 닉네임 변경 (F-004) |
| `/bot-api/guild-member/update-global-profile` | POST | `GuildMemberUpdateGlobalProfileDto` | `updateGlobalProfile()` | 전역 프로필 변경 (F-005) |

모든 엔드포인트는 `{ ok: boolean }` 응답을 반환한다. sync 엔드포인트는 추가로 `{ ok: true, upserted: number }`를 반환한다.

#### DTO 정의

**GuildMemberSyncDto**
```typescript
class GuildMemberSyncDto {
  @IsString() guildId: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuildMemberSyncItemDto)
  members: GuildMemberSyncItemDto[];
}

class GuildMemberSyncItemDto {
  @IsString() userId: string;
  @IsString() displayName: string;
  @IsString() username: string;
  @IsOptional() @IsString() nick?: string | null;
  @IsOptional() @IsString() avatarUrl?: string | null;
  @IsBoolean() isBot: boolean;
  @IsOptional() joinedAt?: string | null;  // ISO 8601
}
```

**GuildMemberUpsertDto**
```typescript
class GuildMemberUpsertDto {
  @IsString() guildId: string;
  @IsString() userId: string;
  @IsString() displayName: string;
  @IsString() username: string;
  @IsOptional() @IsString() nick?: string | null;
  @IsOptional() @IsString() avatarUrl?: string | null;
  @IsBoolean() isBot: boolean;
  @IsOptional() joinedAt?: string | null;  // ISO 8601
}
```

**GuildMemberDeactivateDto**
```typescript
class GuildMemberDeactivateDto {
  @IsString() guildId: string;
  @IsString() userId: string;
}
```

**GuildMemberUpdateDisplayNameDto**
```typescript
class GuildMemberUpdateDisplayNameDto {
  @IsString() guildId: string;
  @IsString() userId: string;
  @IsString() displayName: string;
  @IsOptional() @IsString() nick?: string | null;
  @IsOptional() @IsString() avatarUrl?: string | null;
}
```

**GuildMemberUpdateGlobalProfileDto**
```typescript
class GuildMemberUpdateGlobalProfileDto {
  @IsString() userId: string;
  @IsString() displayName: string;
  @IsString() username: string;
}
```

### 3-5. 모듈 등록

#### app.module.ts

`GuildMemberModule`을 imports 배열에 추가한다. `@Global()` 모듈이므로 다른 모듈 앞에 위치시킨다.

```diff
+ import { GuildMemberModule } from './guild-member/guild-member.module';

  imports: [
    ...
    DiscordRestModule,
    TypeOrmModule.forRootAsync(TypeORMConfig),
+   GuildMemberModule,
    ChannelModule,
    ...
  ]
```

#### bot-api.module.ts

`BotGuildMemberController`를 controllers 배열에 추가한다. GuildMemberModule은 @Global()이므로 imports에 추가할 필요 없다.

```diff
+ import { BotGuildMemberController } from './guild-member/bot-guild-member.controller';

  controllers: [
    ...
+   BotGuildMemberController,
  ]
```

### 3-6. 단위 테스트 (`application/guild-member.service.spec.ts`)

- GuildMemberRepository를 mock하여 GuildMemberService의 각 메서드를 테스트
- 주요 테스트 케이스:
  - `upsertMember`: repository.upsert 호출 확인
  - `bulkUpsertMembers`: repository.bulkUpsert 호출 확인, 빈 배열 시 스킵
  - `deactivateMember`: repository.deactivate 호출 확인
  - `updateDisplayName`: repository.updateDisplayName 호출 확인
  - `updateGlobalProfile`: repository.updateGlobalProfile 호출 확인
  - `findByUserId`: null 반환 케이스 포함
  - `findByUserIds`: Map 변환 로직 검증

---

## 4. 기존 코드 충돌 분석

| 항목 | 충돌 여부 | 설명 |
|------|----------|------|
| GuildMemberOrmEntity | 충돌 없음 | 이미 생성 완료, 변경 불필요 |
| MemberModule / MemberService | 충돌 없음 | 병행 운영, 이 단계에서는 건드리지 않음 |
| bot-api.module.ts | 변경 필요 | controllers 배열에 추가만 하면 됨 |
| app.module.ts | 변경 필요 | imports 배열에 추가만 하면 됨 |
| TypeORM autoLoadEntities | 충돌 없음 | GuildMemberOrmEntity는 forFeature 등록 시 자동 감지 |

---

## 5. 구현 순서

1. **GuildMemberRepository** 생성 (infrastructure 계층)
2. **GuildMemberService** 생성 (application 계층)
3. **GuildMemberModule** 생성 (@Global)
4. **DTO 파일** 생성 (bot-api/guild-member/dto/)
5. **BotGuildMemberController** 생성 (bot-api 계층)
6. **app.module.ts** 등록
7. **bot-api.module.ts** 등록
8. **단위 테스트** 작성
9. **lint 및 빌드** 확인

---

## 6. 주의사항

- `bulkUpsert`의 raw SQL에서 파라미터 인덱스 계산 시 1-based 주의 (기존 `InactiveMemberRepository.batchUpsertRecords` 패턴 참조)
- `@Global()` 모듈은 app.module.ts에서 1회만 imports하면 전역 사용 가능. 소비자 모듈에서 중복 import하지 않도록 한다.
- `joinedAt`은 Bot에서 ISO 8601 문자열로 전달하고, Repository에서 `::timestamp` 캐스팅한다.
- `updateGlobalProfile`은 userId 단일 조건으로 여러 길드의 행을 동시에 업데이트한다. `IDX_guild_member_user` 인덱스가 이를 지원한다.
- Bot API 컨트롤러는 서비스를 직접 호출한다 (EventEmitter 패턴이 아님). voice 컨트롤러만 EventEmitter를 사용하며, newbie 등 다른 bot-api 컨트롤러는 서비스 직접 호출 패턴을 따른다.
