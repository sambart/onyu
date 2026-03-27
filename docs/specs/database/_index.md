# Onyu Database Schema

## 개요

Onyu은 PostgreSQL을 영구 저장소로, Redis를 실시간 세션 캐싱 및 임시 데이터 저장소로 사용한다.

### 기술 스택

| 구성 요소 | 기술 | 비고 |
|-----------|------|------|
| RDBMS | PostgreSQL 15 | 영구 데이터 저장 |
| ORM | TypeORM 0.3 | `synchronize: false`, 마이그레이션 기반 |
| 캐시 | Redis 7 (ioredis) | 세션, 이름 캐싱 |
| 타임존 | Asia/Seoul | TypeORM 설정 |

### TypeORM 설정

- 엔티티 자동 로드: `autoLoadEntities: true`
- 마이그레이션 테이블: `migrations`
- 마이그레이션 경로: `apps/api/src/migrations/*.ts`
- 로깅: 비프로덕션 환경에서 `advanced-console`

---

## PostgreSQL 엔티티

### 엔티티 관계도 (ERD)

```
┌──────────────┐       ┌─────────────────────────┐       ┌──────────────┐
│   Member     │       │  VoiceChannelHistory     │       │   Channel    │
├──────────────┤       ├─────────────────────────┤       ├──────────────┤
│ PK id        │──1:N─►│ PK id                   │◄─N:1──│ PK id        │
│ discordMem…  │       │ FK member               │       │ discordCha…  │
│ nickname     │       │ FK channel              │       │ guildId ?    │
│ avatarUrl    │       │ joinedAt                │       │ channelName  │
│ createdAt    │       │ leftAt                  │       │ categoryId   │
│ updatedAt    │       │ createdAt               │       │ categoryName │
└──────────────┘       │ updatedAt               │       │ status       │
                       └─────────────────────────┘       │ createdAt    │
                         IDX(memberId, joinAt DESC)       │ updatedAt    │
                                                          └──────────────┘
                                                            IDX(guildId)

┌──────────────────────────────────────────────────────────────────────┐
│                MusicChannelConfig (music_channel_config)             │
├──────────────────────────────────────────────────────────────────────┤
│ PK id                                                                │
│ guildId (UNIQUE)                                                     │
│ channelId, messageId (nullable)                                      │
│ embedTitle, embedDescription, embedColor, embedThumbnailUrl          │
│ buttonConfig (JSONB NOT NULL)                                        │
│ enabled (DEFAULT true)                                               │
│ createdAt, updatedAt                                                 │
└──────────────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  UQ_music_channel_config_guild: UNIQUE(guildId)
  IDX_music_channel_config_channel: IDX(channelId)

┌────────────────────────────────────────────────────────────────────┐
│                  VoiceDailyEntity (voice_daily)                    │
├────────────────────────────────────────────────────────────────────┤
│ PK guildId + userId + date + channelId                             │
│ channelName, userName                                              │
│ categoryId (nullable), categoryName (nullable)                     │
│ channelDurationSec, micOnSec, micOffSec, aloneSec                  │
│ streamingSec (DEFAULT 0), videoOnSec (DEFAULT 0), deafSec (DEFAULT 0) │
│ channelType (DEFAULT 'permanent')                                  │
│ autoChannelConfigId (nullable), autoChannelConfigName (nullable)   │
└────────────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)

┌──────────────────────────────────────────────────────────────────────────┐
│                  voice_game_activity (게임 세션 단위 이력)                │
├──────────────────────────────────────────────────────────────────────────┤
│ PK id (AUTO_INCREMENT)                                                   │
│ guildId, userId, channelId, gameName                                     │
│ applicationId (nullable)                                                 │
│ startedAt, endedAt, durationMin                                          │
│ createdAt (DEFAULT now())                                                │
└──────────────────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, userId, startedAt)
  IDX(guildId, gameName, startedAt)
  IDX(guildId, startedAt)
  IDX(startedAt)  ← 자동 삭제 스케줄러용
  90일 보존 → 자동 삭제

┌──────────────────────────────────────────────────────────────────────────┐
│                  voice_game_daily (게임 일별 집계)                        │
├──────────────────────────────────────────────────────────────────────────┤
│ PK guildId + userId + gameName + date                                    │
│ totalMinutes (DEFAULT 0), sessionCount (DEFAULT 0)                       │
└──────────────────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, date)
  IDX(guildId, gameName, date)
  영구 보존

┌──────────────────────────┐       ┌────────────────────────┐       ┌──────────────────────────┐
│  AutoChannelConfig       │       │  AutoChannelButton      │       │  AutoChannelSubOption    │
├──────────────────────────┤       ├────────────────────────┤       ├──────────────────────────┤
│ PK id                    │──1:N─►│ PK id                  │──1:N─►│ PK id                    │
│ guildId                  │       │ FK configId            │       │ FK buttonId              │
│ name                     │       │ label                  │       │ label                    │
│ triggerChannelId         │       │ emoji                  │       │ emoji                    │
│ mode (select|instant)    │       │ targetCategoryId       │       │ channelNameTemplate      │
│ guideChannelId ?         │       │ channelNameTemplate ?  │       │ sortOrder                │
│ waitingRoomTemplate ?    │       │ sortOrder              │
│ guideMessage             │
│ embedTitle ?             │         ON DELETE CASCADE                ON DELETE CASCADE
│ embedColor ?             │         IDX(configId)                    IDX(buttonId)
│ guideMessageId ?         │
│ instantCategoryId ?      │
│ instantNameTemplate ?    │
│ createdAt                │
│ updatedAt                │
└──────────────────────────┘
  UNIQUE(guildId, triggerChannelId)

┌──────────────────────────────────────────────────────────────────────┐
│                      NewbieConfig (newbie_config)                    │
├──────────────────────────────────────────────────────────────────────┤
│ PK id                                                                │
│ guildId (UNIQUE)                                                     │
│ welcomeEnabled, welcomeChannelId, welcomeEmbedTitle                  │
│ welcomeEmbedDescription, welcomeEmbedColor, welcomeEmbedThumbnailUrl │
│ missionEnabled, missionDurationDays, missionTargetPlaytimeHours      │
│ playCountMinDurationMin, playCountIntervalMin                        │
│ missionNotifyChannelId, missionNotifyMessageId                       │
│ missionEmbedTitle, missionEmbedDescription                           │
│ missionEmbedColor, missionEmbedThumbnailUrl                          │
│ mocoEnabled, mocoNewbieDays, mocoAllowNewbieHunter                   │
│ mocoPlayCountMinDurationMin, mocoPlayCountIntervalMin                │
│ mocoMinCoPresenceMin, mocoScorePerSession                            │
│ mocoScorePerMinute, mocoScorePerUnique                               │
│ mocoResetPeriod, mocoResetIntervalDays, mocoCurrentPeriodStart       │
│ mocoRankChannelId, mocoRankMessageId, mocoAutoRefreshMinutes         │
│ mocoEmbedTitle, mocoEmbedDescription                                 │
│ mocoEmbedColor, mocoEmbedThumbnailUrl                                │
│ roleEnabled, roleDurationDays, newbieRoleId                          │
│ createdAt, updatedAt                                                 │
└──────────────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)

┌──────────────────────────────────────────────────────┐
│          StickyMessageConfig (sticky_message_config)  │
├──────────────────────────────────────────────────────┤
│ PK id                                                │
│ guildId                                              │
│ channelId                                            │
│ embedTitle, embedDescription, embedColor             │
│ messageId (Discord message ID)                       │
│ enabled, sortOrder                                   │
│ createdAt, updatedAt                                 │
└──────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId)
  IDX(guildId, channelId, sortOrder)

┌────────────────────────────┐       ┌──────────────────────────────┐
│  StatusPrefixConfig        │       │  StatusPrefixButton           │
│  (status_prefix_config)    │       │  (status_prefix_button)       │
├────────────────────────────┤       ├──────────────────────────────┤
│ PK id                      │──1:N─►│ PK id                        │
│ guildId (UNIQUE)           │       │ FK configId                  │
│ enabled                    │       │ label                        │
│ channelId                  │       │ emoji                        │
│ messageId                  │       │ prefix                       │
│ embedTitle                 │       │ type (PREFIX|RESET)          │
│ embedDescription           │       │ sortOrder                    │
│ embedColor                 │       │ createdAt                    │
│ prefixTemplate             │       │ updatedAt                    │
│ createdAt                  │       └──────────────────────────────┘
│ updatedAt                  │         ON DELETE CASCADE
└────────────────────────────┘         IDX(configId, sortOrder)
  UNIQUE(guildId)

┌──────────────────────────────────────────────┐
│  VoiceExcludedChannel (voice_excluded_channel) │
├──────────────────────────────────────────────┤
│ PK id                                        │
│ guildId                                      │
│ discordChannelId                             │
│ type (enum: CHANNEL | CATEGORY)              │
│ createdAt, updatedAt                         │
└──────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  UNIQUE(guildId, discordChannelId)

┌──────────────────────────────────┐       ┌──────────────────────────────────┐
│    NewbieMission (newbie_mission) │       │    NewbiePeriod (newbie_period)   │
├──────────────────────────────────┤       ├──────────────────────────────────┤
│ PK id                            │       │ PK id                            │
│ guildId                          │       │ guildId                          │
│ memberId                         │       │ memberId                         │
│ memberName (nullable)            │       │ startDate (YYYYMMDD)             │
│ startDate (YYYYMMDD)             │       │ expiresDate (YYYYMMDD)           │
│ endDate (YYYYMMDD)               │       │ isExpired                        │
│ targetPlaytimeSec                │       │ createdAt, updatedAt             │
│ status (enum, +LEFT)             │       └──────────────────────────────────┘
│ hiddenFromEmbed (default false)  │
│ createdAt, updatedAt             │         IDX(guildId, memberId)
└──────────────────────────────────┘         IDX(guildId, isExpired)
  IDX(guildId, memberId)                      IDX(expiresDate, isExpired)
  IDX(guildId, status)
  IDX(guildId, hiddenFromEmbed)
  IDX(status, endDate)

┌──────────────────────────────────────────┐       ┌──────────────────────────────────────────┐
│  NewbieMissionTemplate                   │       │  NewbieMocoTemplate                      │
│  (newbie_mission_template)               │       │  (newbie_moco_template)                  │
├──────────────────────────────────────────┤       ├──────────────────────────────────────────┤
│ PK id                                    │       │ PK id                                    │
│ guildId (UNIQUE)                         │       │ guildId (UNIQUE)                         │
│ titleTemplate                            │       │ titleTemplate                            │
│ headerTemplate                           │       │ scoringTemplate                          │
│ itemTemplate                             │       │ bodyTemplate                             │
│ footerTemplate                           │       │ itemTemplate                             │
│ statusMapping (json)                     │       │ footerTemplate                           │
│ createdAt, updatedAt                     │       │ createdAt, updatedAt                     │
└──────────────────────────────────────────┘       └──────────────────────────────────────────┘
  (독립 테이블 — FK 없음, 레코드 없으면 기본값 사용)   (독립 테이블 — FK 없음, 레코드 없으면 기본값 사용)
  UNIQUE(guildId)                                    UNIQUE(guildId)

┌────────────────────────────────────────────────────────┐
│          MocoHuntingSession (moco_hunting_session)      │
├────────────────────────────────────────────────────────┤
│ PK id                                                  │
│ guildId, hunterId, channelId                           │
│ startedAt, endedAt (nullable)                          │
│ durationMin (nullable), newbieMemberIds (json)         │
│ isValid (default false)                                │
│ createdAt                                              │
└────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, hunterId)
  IDX(guildId, startedAt)
  IDX(guildId, isValid)

┌────────────────────────────────────────────────────────┐
│          MocoHuntingDaily (moco_hunting_daily)          │
├────────────────────────────────────────────────────────┤
│ PK guildId + hunterId + date                           │
│ channelMinutes (default 0)                             │
│ sessionCount (default 0)                               │
│ uniqueNewbieCount (default 0)                          │
│ score (default 0)                                      │
└────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, date)

┌────────────────────────────────────────────────────────┐
│   VoiceCoPresenceSession (voice_co_presence_session)    │
├────────────────────────────────────────────────────────┤
│ PK id                                                  │
│ guildId, userId, channelId                             │
│ startedAt, endedAt                                     │
│ durationMin, peerIds (json), peerMinutes (json)        │
│ createdAt                                              │
└────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, userId)
  IDX(guildId, startedAt)
  IDX(endedAt)
  90일 보존 → 자동 삭제

┌────────────────────────────────────────────────────────┐
│   VoiceCoPresenceDaily (voice_co_presence_daily)        │
├────────────────────────────────────────────────────────┤
│ PK guildId + userId + date                             │
│ channelMinutes (default 0)                             │
│ sessionCount (default 0)                               │
└────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, date)

┌────────────────────────────────────────────────────────┐
│ VoiceCoPresencePairDaily (voice_co_presence_pair_daily) │
├────────────────────────────────────────────────────────┤
│ PK guildId + userId + peerId + date                    │
│ minutes (default 0)                                    │
│ sessionCount (default 0)                               │
└────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX(guildId, userId, date)
  IDX(guildId, date)

┌────────────────────────────────────────────────────────────┐
│      InactiveMemberConfig (inactive_member_config)          │
├────────────────────────────────────────────────────────────┤
│ PK id                                                       │
│ guildId (UNIQUE)                                            │
│ periodDays (default 30)                                     │
│ lowActiveThresholdMin (default 30)                          │
│ decliningPercent (default 50)                               │
│ autoActionEnabled (default false)                           │
│ autoRoleAdd (default false), autoDm (default false)         │
│ inactiveRoleId ?, removeRoleId ?                            │
│ excludedRoleIds (json, default '[]')                        │
│ dmEmbedTitle ?, dmEmbedBody ?, dmEmbedColor ?               │
│ createdAt, updatedAt                                        │
└────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  UQ_inactive_member_config_guild: UNIQUE(guildId)

┌────────────────────────────────────────────────────────────┐
│      InactiveMemberRecord (inactive_member_record)          │
├────────────────────────────────────────────────────────────┤
│ PK id                                                       │
│ guildId, userId                                             │
│ grade (enum, nullable): FULLY_INACTIVE | LOW_ACTIVE |       │
│         DECLINING                                           │
│ totalMinutes (default 0), prevTotalMinutes (default 0)      │
│ lastVoiceDate (date, nullable)                              │
│ gradeChangedAt (timestamp, nullable)                        │
│ classifiedAt (timestamp)                                    │
│ createdAt, updatedAt                                        │
└────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  UQ_inactive_member_record_guild_user: UNIQUE(guildId, userId)
  IDX_inactive_member_record_guild_grade: IDX(guildId, grade)
  IDX_inactive_member_record_guild_last_voice: IDX(guildId, lastVoiceDate)

┌────────────────────────────────────────────────────────────┐
│   InactiveMemberActionLog (inactive_member_action_log)      │
├────────────────────────────────────────────────────────────┤
│ PK id                                                       │
│ guildId                                                     │
│ actionType (enum): ACTION_DM | ACTION_ROLE_ADD |            │
│                    ACTION_ROLE_REMOVE                       │
│ targetUserIds (json)                                        │
│ executorUserId ? (NULL이면 시스템 자동 조치)                │
│ successCount (default 0), failCount (default 0)             │
│ note ?                                                      │
│ executedAt (timestamp, default now())                       │
└────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX_inactive_action_log_guild_executed: IDX(guildId, executedAt DESC)

┌────────────────────────────────────────────────────────────┐
│      WeeklyReportConfig (weekly_report_config)              │
├────────────────────────────────────────────────────────────┤
│ PK guildId                                                  │
│ isEnabled (default false)                                   │
│ channelId ? (발송 대상 텍스트 채널 ID)                      │
│ dayOfWeek (default 1, 0=일 ~ 6=토)                          │
│ hour (default 9, 0 ~ 23)                                    │
│ timezone (default 'Asia/Seoul', IANA 타임존)                │
│ updatedAt (timestamp)                                       │
└────────────────────────────────────────────────────────────┘
  (독립 테이블 — FK 없음, Discord ID 직접 저장)
  IDX_weekly_report_config_enabled: IDX(isEnabled)
```

---

### 1. Member

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `discordMemberId` | `varchar` | UNIQUE, NOT NULL | 디스코드 유저 ID |
| `nickname` | `varchar` | NOT NULL (컬럼명: `nickName`) | 디스코드 닉네임 |
| `avatarUrl` | `varchar` | NULLABLE | 디스코드 아바타 URL (Discord CDN). 음성 입퇴장 시 자동 갱신 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: `VoiceChannelHistory` (1:N)
- **파일**: `apps/api/src/member/member.entity.ts`

---

### 2. Channel

> F-VOICE-020 대응: `guildId` 컬럼 추가. `VoiceChannelHistory` 조회 시 서버 범위 필터링에 사용한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `discordChannelId` | `varchar` | UNIQUE, NOT NULL | 디스코드 채널 ID |
| `guildId` | `varchar` | NULLABLE | 디스코드 서버 ID. 기존 레코드 호환을 위해 nullable |
| `channelName` | `varchar` | NOT NULL | 채널명 |
| `categoryId` | `varchar` | NULLABLE | 디스코드 카테고리 채널 ID (Discord parentId). 카테고리 없는 채널은 null |
| `categoryName` | `varchar` | NULLABLE | 카테고리명 캐시. 카테고리 없는 채널은 null |
| `status` | `enum('ACTIVE','DELETED')` | NOT NULL, DEFAULT `'ACTIVE'` | 채널 상태 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: `VoiceChannelHistory` (1:N)
- **파일**: `apps/api/src/channel/channel.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_channel_guild` | `(guildId)` | F-VOICE-020에서 `JOIN channel ON channel.guildId = ?` 조건 처리 |

#### 인덱스 설계 근거

F-VOICE-020 쿼리는 `VoiceChannelHistory JOIN Channel ON channel.guildId = guildId AND member.discordMemberId = userId` 형태로 실행된다. `Channel`에 대한 `guildId` 단독 인덱스를 추가하여 조인 단계에서 풀스캔을 방지한다. `discordChannelId` UNIQUE 인덱스는 이미 존재하므로 채널 단건 조회는 별도 인덱스가 불필요하다.

---

### 3. VoiceChannelHistory

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `channelId` | `int` | FK → Channel.id | 채널 참조 |
| `memberId` | `int` | FK → Member.id | 멤버 참조 |
| `joinAt` | `timestamp` | NOT NULL | 입장 시각 |
| `leftAt` | `timestamp` | NULLABLE | 퇴장 시각 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: Channel (N:1), Member (N:1)
- **계산 속성**: `duration` — `leftAt - joinedAt` (초 단위, getter)
- **파일**: `apps/api/src/channel/voice/domain/voice-channel-history.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_voice_channel_history_member_join` | `(memberId, joinAt DESC)` | F-VOICE-020에서 특정 멤버의 이력을 최신순 페이지네이션 조회 |

#### 인덱스 설계 근거

F-VOICE-020 쿼리는 `WHERE member.discordMemberId = ? AND channel.guildId = ?` 조건으로 조회하고 `ORDER BY joinAt DESC`로 정렬 후 페이지네이션을 적용한다. `memberId`(FK)를 선두로 두고 `joinAt DESC`를 후위에 포함하여 필터링과 정렬을 인덱스 하나로 커버한다. `guildId` 조건은 `Channel` 테이블의 `IDX_channel_guild`를 통한 조인으로 처리되므로 `VoiceChannelHistory`에 별도 guildId 컬럼을 추가하지 않는다.

---

### 4. VoiceDailyEntity (`voice_daily`)

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `userId` | `varchar` | PK | 디스코드 유저 ID |
| `date` | `varchar` | PK | 날짜 (`YYYYMMDD` 형식) |
| `channelId` | `varchar` | PK | 채널 ID 또는 `'GLOBAL'` |
| `channelName` | `varchar` | DEFAULT `''` | 채널명 캐시 (비정규화) |
| `userName` | `varchar` | DEFAULT `''` | 유저명 캐시 (비정규화) |
| `categoryId` | `varchar` | NULLABLE | 카테고리 채널 ID 캐시 (비정규화). GLOBAL 레코드 또는 카테고리 없는 채널은 null |
| `categoryName` | `varchar` | NULLABLE | 카테고리명 캐시 (비정규화). GLOBAL 레코드 또는 카테고리 없는 채널은 null |
| `channelDurationSec` | `int` | NOT NULL, DEFAULT `0` | 채널 체류 시간 (초) |
| `micOnSec` | `int` | NOT NULL, DEFAULT `0` | 마이크 ON 시간 (초) |
| `micOffSec` | `int` | NOT NULL, DEFAULT `0` | 마이크 OFF 시간 (초) |
| `aloneSec` | `int` | NOT NULL, DEFAULT `0` | 혼자 있던 시간 (초) |
| `streamingSec` | `int` | NOT NULL, DEFAULT `0` | 화면 공유(스트리밍) 시간 (초). GLOBAL 및 개별 채널 레코드 모두에 기록 |
| `videoOnSec` | `int` | NOT NULL, DEFAULT `0` | 카메라 ON 시간 (초). GLOBAL 및 개별 채널 레코드 모두에 기록 |
| `deafSec` | `int` | NOT NULL, DEFAULT `0` | 스피커 음소거(selfDeaf) 시간 (초). GLOBAL 및 개별 채널 레코드 모두에 기록 |
| `channelType` | `varchar(20)` | NOT NULL, DEFAULT `'permanent'` | 채널 유형. `'permanent'`(일반 고정 채널) \| `'auto_select'`(자동방 선택 모드) \| `'auto_instant'`(자동방 즉시 모드) |
| `autoChannelConfigId` | `int` | NULLABLE | `auto_channel_config.id`에 대한 논리적 참조. FK 제약 없음 — config 삭제 후에도 통계 보존 |
| `autoChannelConfigName` | `varchar(255)` | NULLABLE | config.name 스냅샷. config 삭제 후에도 표시명 유지 |

- **복합 PK**: `(guildId, userId, date, channelId)`
- **테이블명**: `voice_daily` (커스텀 지정)
- **파일**: `apps/api/src/channel/voice/domain/voice-daily.entity.ts`

#### 마이그레이션 (Phase 1)

```sql
ALTER TABLE voice_daily
  ADD COLUMN "streamingSec" int NOT NULL DEFAULT 0,
  ADD COLUMN "videoOnSec"   int NOT NULL DEFAULT 0,
  ADD COLUMN "deafSec"      int NOT NULL DEFAULT 0;
```

기존 레코드의 세 컬럼은 기본값 0으로 유지된다.

#### 마이그레이션 (Phase 2 — F-VOICE-032~039)

```sql
ALTER TABLE voice_daily
  ADD COLUMN "channelType"           varchar(20)  NOT NULL DEFAULT 'permanent',
  ADD COLUMN "autoChannelConfigId"   int          NULL,
  ADD COLUMN "autoChannelConfigName" varchar(255) NULL;

-- 자동방 config 단위 그룹핑 조회 최적화 (partial index)
CREATE INDEX "IDX_voice_daily_auto_config"
  ON voice_daily ("guildId", "autoChannelConfigId", "date")
  WHERE "autoChannelConfigId" IS NOT NULL;

-- channelType 필터링 최적화 (partial index — permanent 제외)
CREATE INDEX "IDX_voice_daily_channel_type"
  ON voice_daily ("guildId", "date")
  WHERE "channelType" != 'permanent';
```

기존 레코드의 `channelType`은 기본값 `'permanent'`로 유지되어 하위 호환이 보장된다. `autoChannelConfigId` / `autoChannelConfigName`은 NULL로 유지된다.

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_voice_daily_guild_date` | `(guildId, date)` | 날짜별 전체 조회 (F-VOICE-017, F-VOICE-018) |
| `IDX_voice_daily_guild_channel_date` | `(guildId, channelId, date)` | 채널별 조회 |
| `IDX_voice_daily_guild_user_date` | `(guildId, userId, date)` | 유저별 조회 (F-VOICE-018 userId 필터) |
| `IDX_voice_daily_auto_config` | `(guildId, autoChannelConfigId, date)` WHERE `autoChannelConfigId IS NOT NULL` | 자동방 config 단위 그룹핑 조회 최적화 (F-VOICE-032~035) |
| `IDX_voice_daily_channel_type` | `(guildId, date)` WHERE `channelType != 'permanent'` | 자동방 채널 필터링 최적화 (F-VOICE-036~039). permanent가 다수이므로 partial index |

#### F-VOICE-019 멤버 검색 인덱스 검토

F-VOICE-019(`GET /members/search?q=`)는 `WHERE guildId = ? AND userName LIKE '%q%'` 형태로 실행된다. `LIKE '%q%'`는 선두 와일드카드이므로 B-tree 인덱스로 커버할 수 없다. 현재 스펙에서는 `guildId` 조건으로 먼저 서버 범위를 제한한 뒤 `userName` seq scan이 적용되며, 결과를 중복 제거 후 최대 20개만 반환한다. 서버당 `voice_daily` 레코드 규모가 크지 않은 현재 단계에서는 추가 인덱스 없이 운영한다. 향후 데이터가 대량 누적되면 pg_trgm GIN 인덱스(`CREATE INDEX ... USING GIN (userName gin_trgm_ops)`) 도입을 검토한다.

#### channelId 규칙

| 값 | 의미 |
|----|------|
| `'GLOBAL'` | 유저의 전체 집계 (마이크, 혼자시간 등) |
| 실제 채널 ID | 해당 채널에서의 체류 시간 |

---

### 5. AutoChannelConfig (`auto_channel_config`)

자동방 기능의 서버별 트리거 채널 설정을 저장한다. 서버(guildId)와 트리거 채널(triggerChannelId)의 조합이 유일하게 존재한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `name` | `varchar` | NOT NULL | 설정 이름 (웹 탭 라벨용, 예: `게임방`, `스터디방`) |
| `triggerChannelId` | `varchar` | NOT NULL | 트리거 음성 채널 ID |
| `mode` | `enum('select','instant')` | NOT NULL, DEFAULT `'select'` | 채널 생성 모드. `select`: 버튼 선택 후 확정방 생성, `instant`: 트리거 진입 즉시 채널 생성 |
| `guideChannelId` | `varchar` | NULLABLE | 안내 메시지를 표시할 텍스트 채널 ID (`select` 모드 전용) |
| `waitingRoomTemplate` | `varchar` | NULLABLE | 대기방 네이밍 템플릿 (예: `⌛ {username}의 대기방`) |
| `guideMessage` | `text` | NULLABLE | 안내 메시지 Embed 설명 본문 (`select` 모드 전용) |
| `embedTitle` | `varchar` | NULLABLE | 안내 Embed 제목 (`select` 모드 전용) |
| `embedColor` | `varchar` | NULLABLE | 안내 Embed 색상 (HEX, 예: `#5865F2`) (`select` 모드 전용) |
| `guideMessageId` | `varchar` | NULLABLE | 전송된 안내 메시지 ID (Discord message ID) (`select` 모드 전용) |
| `instantCategoryId` | `varchar` | NULLABLE | 즉시 생성 모드에서 채널이 생성될 카테고리 ID (`instant` 모드 전용) |
| `instantNameTemplate` | `varchar` | NULLABLE | 즉시 생성 모드에서 사용할 채널명 템플릿 (예: `{username}의 방`) (`instant` 모드 전용) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: `AutoChannelButton` (1:N)
- **파일**: `apps/api/src/channel/auto/domain/auto-channel-config.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_auto_channel_config_guild_trigger` | `(guildId, triggerChannelId)` UNIQUE | 서버+트리거 채널 단위 중복 방지 |

---

### 6. AutoChannelButton (`auto_channel_button`)

트리거 채널 안내 메시지에 표시되는 Discord Button Component 설정을 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `configId` | `int` | FK → AutoChannelConfig.id, NOT NULL, ON DELETE CASCADE | 소속 설정 |
| `label` | `varchar` | NOT NULL | 버튼 표시 라벨 |
| `emoji` | `varchar` | NULLABLE | 버튼 이모지 |
| `targetCategoryId` | `varchar` | NOT NULL | 확정방이 이동할 Discord 카테고리 ID |
| `channelNameTemplate` | `varchar` | NULLABLE | 확정방 채널명 템플릿 (하위 선택지 없을 때 사용) |
| `sortOrder` | `int` | NOT NULL, DEFAULT `0` | 버튼 표시 순서 |

- **스키마**: `public`
- **관계**: AutoChannelConfig (N:1), `AutoChannelSubOption` (1:N)
- **파일**: `apps/api/src/channel/auto/domain/auto-channel-button.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_auto_channel_button_config` | `(configId)` | 설정별 버튼 목록 조회 |

---

### 7. AutoChannelSubOption (`auto_channel_sub_option`)

버튼 클릭 시 Ephemeral 메시지로 표시되는 하위 선택지 설정을 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `buttonId` | `int` | FK → AutoChannelButton.id, NOT NULL, ON DELETE CASCADE | 소속 버튼 |
| `label` | `varchar` | NOT NULL | 하위 선택지 표시 라벨 |
| `emoji` | `varchar` | NULLABLE | 하위 선택지 이모지 |
| `channelNameTemplate` | `varchar` | NOT NULL | 확정방 채널명 템플릿 |
| `sortOrder` | `int` | NOT NULL, DEFAULT `0` | 선택지 표시 순서 |

- **스키마**: `public`
- **관계**: AutoChannelButton (N:1)
- **파일**: `apps/api/src/channel/auto/domain/auto-channel-sub-option.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_auto_channel_sub_option_button` | `(buttonId)` | 버튼별 하위 선택지 목록 조회 |

---

### 8. NewbieConfig (`newbie_config`)

길드별 신규사용자 관리 설정을 저장한다. 환영인사, 미션, 모코코 사냥, 신입기간 역할 관련 필드를 단일 테이블에 통합한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `welcomeEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 환영인사 기능 활성화 여부 |
| `welcomeChannelId` | `varchar` | NULLABLE | 환영 메시지 전송 채널 ID |
| `welcomeEmbedTitle` | `varchar` | NULLABLE | Embed 제목 (템플릿 변수 포함 가능) |
| `welcomeEmbedDescription` | `text` | NULLABLE | Embed 설명 (템플릿 변수 포함 가능) |
| `welcomeEmbedColor` | `varchar` | NULLABLE | Embed 색상 (HEX, 예: `#5865F2`) |
| `welcomeEmbedThumbnailUrl` | `varchar` | NULLABLE | Embed 썸네일 이미지 URL |
| `missionEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 미션 기능 활성화 여부 |
| `missionDurationDays` | `int` | NULLABLE | 미션 기간 (일수) |
| `missionTargetPlaytimeHours` | `int` | NULLABLE | 미션 목표 플레이타임 (시간) |
| `playCountMinDurationMin` | `int` | NULLABLE | 플레이횟수 카운팅 최소 참여시간 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1 |
| `playCountIntervalMin` | `int` | NULLABLE | 플레이횟수 카운팅 시간 간격 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1 |
| `missionNotifyChannelId` | `varchar` | NULLABLE | 미션 현황 알림 채널 ID |
| `missionNotifyMessageId` | `varchar` | NULLABLE | 미션 현황 Embed 메시지 ID (Discord message ID) |
| `missionEmbedTitle` | `varchar` | NULLABLE | 미션 현황 Embed 제목 |
| `missionEmbedDescription` | `text` | NULLABLE | 미션 현황 Embed 설명 |
| `missionEmbedColor` | `varchar` | NULLABLE | 미션 현황 Embed 색상 (HEX, 예: `#5865F2`) |
| `missionEmbedThumbnailUrl` | `varchar` | NULLABLE | 미션 현황 Embed 썸네일 이미지 URL |
| `mocoEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 모코코 사냥 기능 활성화 여부 |
| `mocoNewbieDays` | `int` | NOT NULL, DEFAULT `30` | 신규사용자 판별 기준 일수 (가입 후 N일 이내) |
| `mocoAllowNewbieHunter` | `boolean` | NOT NULL, DEFAULT `false` | 신규사용자도 사냥꾼이 될 수 있는지 여부 |
| `mocoPlayCountMinDurationMin` | `int` | NULLABLE | 모코코 사냥 플레이횟수 카운팅 최소 참여시간 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1 |
| `mocoPlayCountIntervalMin` | `int` | NULLABLE | 모코코 사냥 플레이횟수 카운팅 시간 간격 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1 |
| `mocoMinCoPresenceMin` | `int` | NOT NULL, DEFAULT `10` | 유효 세션 인정 최소 동시접속 시간(분) |
| `mocoScorePerSession` | `int` | NOT NULL, DEFAULT `10` | 유효 세션 1회당 점수 |
| `mocoScorePerMinute` | `int` | NOT NULL, DEFAULT `1` | 1분당 점수 |
| `mocoScorePerUnique` | `int` | NOT NULL, DEFAULT `5` | 고유 모코코당 점수 |
| `mocoResetPeriod` | `enum('NONE','MONTHLY','CUSTOM')` | NOT NULL, DEFAULT `'NONE'` | 리셋 주기 |
| `mocoResetIntervalDays` | `int` | NULLABLE | CUSTOM 리셋 간격 (일수) |
| `mocoCurrentPeriodStart` | `varchar` | NULLABLE | 현재 집계 기간 시작일 (`YYYYMMDD`) |
| `mocoRankChannelId` | `varchar` | NULLABLE | 모코코 사냥 순위 표시 채널 ID |
| `mocoRankMessageId` | `varchar` | NULLABLE | 모코코 사냥 순위 Embed 메시지 ID |
| `mocoAutoRefreshMinutes` | `int` | NULLABLE | 모코코 사냥 순위 자동 갱신 간격 (분) |
| `mocoEmbedTitle` | `varchar` | NULLABLE | 모코코 사냥 순위 Embed 제목 |
| `mocoEmbedDescription` | `text` | NULLABLE | 모코코 사냥 순위 Embed 설명 |
| `mocoEmbedColor` | `varchar` | NULLABLE | 모코코 사냥 순위 Embed 색상 (HEX, 예: `#5865F2`) |
| `mocoEmbedThumbnailUrl` | `varchar` | NULLABLE | 모코코 사냥 순위 Embed 썸네일 이미지 URL |
| `roleEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 신입기간 역할 자동관리 활성화 여부 |
| `roleDurationDays` | `int` | NULLABLE | 신입기간 (일수) |
| `newbieRoleId` | `varchar` | NULLABLE | 자동 부여할 Discord 역할 ID |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/newbie/domain/newbie-config.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_newbie_config_guild` | `(guildId)` UNIQUE | 길드당 하나의 설정 보장 |

---

### 9. NewbieMission (`newbie_mission`)

신규사용자별 미션 진행 상태를 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `memberId` | `varchar` | NOT NULL | 디스코드 유저 ID |
| `memberName` | `varchar` | NULLABLE | 디스코드 서버 닉네임. 미션 생성/상태변경 시 저장·갱신 |
| `startDate` | `varchar` | NOT NULL | 미션 시작일 (`YYYYMMDD`) |
| `endDate` | `varchar` | NOT NULL | 미션 마감일 (`YYYYMMDD`) |
| `targetPlaytimeSec` | `int` | NOT NULL | 목표 플레이타임 (초 단위로 변환 저장) |
| `status` | `enum('IN_PROGRESS','COMPLETED','FAILED','LEFT')` | NOT NULL, DEFAULT `'IN_PROGRESS'` | 미션 상태 |
| `hiddenFromEmbed` | `boolean` | NOT NULL, DEFAULT `false` | Embed 표시 제외 여부. `true`이면 Discord Embed에서 숨김 처리됨 (F-NEWBIE-005) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/newbie/domain/newbie-mission.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_newbie_mission_guild_member` | `(guildId, memberId)` | 멤버별 미션 조회 |
| `IDX_newbie_mission_guild_status` | `(guildId, status)` | 길드별 진행중 미션 조회 |
| `IDX_newbie_mission_guild_visible` | `(guildId, hiddenFromEmbed)` | Embed 표시 대상 미션 조회 (F-NEWBIE-005) |
| `IDX_newbie_mission_status_end_date` | `(status, endDate)` | 만료 예정 미션 스케줄러 조회 (`status='IN_PROGRESS' AND endDate < today`) |

#### 인덱스 설계 근거

만료 스케줄러 쿼리는 `status = 'IN_PROGRESS'` 등치 조건 이후 `endDate < today` 범위 조건을 사용한다. 등치 조건 컬럼을 선두에 두는 것이 범위 조건 컬럼을 선두에 두는 것보다 인덱스 선택도가 높아 효율적이다. 기존의 `(endDate, status)` 순서에서 `(status, endDate)` 순서로 변경한다.

`IDX_newbie_mission_guild_visible`은 Embed 갱신 시 `WHERE guildId = ? AND hiddenFromEmbed = false` 조건으로 표시 대상 미션을 조회하는 쿼리를 커버한다. 다만, `IDX_newbie_mission_guild_status`가 이미 길드별 활성 미션 조회에 사용되며 Embed 표시 대상은 `status` 조건과 함께 필터링되는 경우가 대부분이므로, 데이터 규모가 커지기 전까지는 이 인덱스의 효용이 제한적일 수 있다.

---

### 10. NewbiePeriod (`newbie_period`)

신입기간 역할 관리 이력을 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `memberId` | `varchar` | NOT NULL | 디스코드 유저 ID |
| `startDate` | `varchar` | NOT NULL | 신입기간 시작일 (`YYYYMMDD`) |
| `expiresDate` | `varchar` | NOT NULL | 신입기간 만료일 (`YYYYMMDD`) |
| `isExpired` | `boolean` | NOT NULL, DEFAULT `false` | 만료 처리 완료 여부 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/newbie/domain/newbie-period.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_newbie_period_guild_member` | `(guildId, memberId)` | 멤버별 이력 조회 |
| `IDX_newbie_period_guild_active` | `(guildId, isExpired)` | 길드 내 활성 신입기간 멤버 집합 조회 (모코코 사냥 캐시 워밍업) |
| `IDX_newbie_period_expires` | `(expiresDate, isExpired)` | 만료 스케줄러 조회 |

#### 인덱스 설계 근거

모코코 사냥 측정 시 `newbie:period:active:{guildId}` 캐시 미스가 발생하면 `WHERE guildId = ? AND isExpired = false` 조건으로 DB를 조회한다. 기존 `IDX_newbie_period_guild_member`는 `memberId`까지 조건이 있는 단건 조회에 최적화되어 있어 이 쿼리를 커버하지 못한다. `IDX_newbie_period_guild_active`를 추가하여 활성 멤버 전체 조회를 지원한다.

---

### 11. NewbieMissionTemplate (`newbie_mission_template`)

미션 Embed 표시 형식을 길드별로 커스터마이징하는 템플릿을 저장한다. `NewbieConfig`와 별도 테이블로 분리되어 있으며, 레코드가 없으면 F-NEWBIE-002에 정의된 기본값을 사용한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `titleTemplate` | `varchar` | NULLABLE | Embed 제목 템플릿. 허용 변수: `{totalCount}` |
| `headerTemplate` | `text` | NULLABLE | description 최상단 헤더 템플릿. 허용 변수: `{totalCount}`, `{inProgressCount}`, `{completedCount}`, `{failedCount}` |
| `itemTemplate` | `text` | NULLABLE | 멤버별 미션 현황 항목 템플릿 (반복 렌더링). 허용 변수: `{username}`, `{mention}`, `{startDate}`, `{endDate}`, `{statusEmoji}`, `{statusText}`, `{playtimeHour}`, `{playtimeMin}`, `{playtimeSec}`, `{playtime}`, `{playCount}`, `{targetPlaytime}`, `{daysLeft}` |
| `footerTemplate` | `varchar` | NULLABLE | Embed footer 템플릿. 허용 변수: `{updatedAt}` |
| `statusMapping` | `json` | NULLABLE | 상태별 이모지·텍스트 매핑. 형식: `{"IN_PROGRESS":{"emoji":"🟡","text":"진행중"},"COMPLETED":{"emoji":"✅","text":"완료"},"FAILED":{"emoji":"❌","text":"실패"}}` |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장). 레코드가 없으면 기본값 사용.
- **파일**: `apps/api/src/newbie/domain/newbie-mission-template.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_newbie_mission_template_guild` | `(guildId)` UNIQUE | 길드당 하나의 템플릿 보장 |

---

### 12. NewbieMocoTemplate (`newbie_moco_template`)

모코코 사냥 Embed 표시 형식을 길드별로 커스터마이징하는 템플릿을 저장한다. `NewbieConfig`와 별도 테이블로 분리되어 있으며, 레코드가 없으면 F-NEWBIE-003에 정의된 기본값을 사용한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `titleTemplate` | `varchar` | NULLABLE | Embed 제목 템플릿. 허용 변수: `{rank}`, `{hunterName}` |
| `scoringTemplate` | `text` | NULLABLE | 점수 산정 안내 템플릿. Embed 본문 하단에 표시. 빈 문자열이면 미표시. 허용 변수: `{scorePerSession}`, `{scorePerMinute}`, `{scorePerUnique}`, `{minCoPresence}` |
| `bodyTemplate` | `text` | NULLABLE | 사냥꾼 1명 페이지 전체 본문 템플릿. `{mocoList}` 위치에 항목 템플릿 반복 삽입. 허용 변수: `{score}`, `{totalMinutes}`, `{sessionCount}`, `{uniqueNewbieCount}`, `{mocoList}` |
| `itemTemplate` | `varchar` | NULLABLE | 도움받은 모코코 한 줄 항목 템플릿. 허용 변수: `{newbieName}`, `{minutes}`, `{sessions}` |
| `footerTemplate` | `varchar` | NULLABLE | Embed footer 템플릿. 허용 변수: `{currentPage}`, `{totalPages}`, `{interval}`, `{periodStart}`, `{periodEnd}` |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장). 레코드가 없으면 기본값 사용.
- **파일**: `apps/api/src/newbie/domain/newbie-moco-template.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_newbie_moco_template_guild` | `(guildId)` UNIQUE | 길드당 하나의 템플릿 보장 |

---

### 13. StatusPrefixConfig (`status_prefix_config`)

길드별 Status Prefix 기능 설정을 저장한다. 길드당 하나의 설정이 존재하며, 안내 Embed 메시지 구성과 접두사 형식 템플릿을 포함한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `enabled` | `boolean` | NOT NULL, DEFAULT `false` | 기능 활성화 여부 |
| `channelId` | `varchar` | NULLABLE | 안내 메시지를 표시할 텍스트 채널 ID |
| `messageId` | `varchar` | NULLABLE | 전송된 안내 Embed 메시지 ID (Discord message ID) |
| `embedTitle` | `varchar` | NULLABLE | Embed 제목 |
| `embedDescription` | `text` | NULLABLE | Embed 설명 |
| `embedColor` | `varchar` | NULLABLE | Embed 색상 (HEX, 예: `#5865F2`) |
| `prefixTemplate` | `varchar` | NOT NULL, DEFAULT `'[{prefix}] {nickname}'` | 닉네임 변환 템플릿 (`{prefix}`, `{nickname}` 변수 사용) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: `StatusPrefixButton` (1:N)
- **파일**: `apps/api/src/status-prefix/domain/status-prefix-config.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_status_prefix_config_guild` | `(guildId)` UNIQUE | 길드당 하나의 설정 보장 |

---

### 14. StickyMessageConfig (`sticky_message_config`)

길드별 채널 고정메세지 설정을 저장한다. 채널당 여러 개의 고정메세지를 등록할 수 있으며, `messageCreate` 이벤트 수신 시 Redis 캐시를 통해 고속으로 해당 채널의 설정을 조회한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `channelId` | `varchar` | NOT NULL | 고정메세지를 표시할 텍스트 채널 ID |
| `embedTitle` | `varchar` | NULLABLE | Embed 제목 |
| `embedDescription` | `text` | NULLABLE | Embed 설명 (멀티라인) |
| `embedColor` | `varchar` | NULLABLE | Embed 색상 (HEX, 예: `#5865F2`) |
| `messageId` | `varchar` | NULLABLE | 현재 전송된 Discord 고정메세지 ID |
| `enabled` | `boolean` | NOT NULL, DEFAULT `true` | 기능 활성화 여부 |
| `sortOrder` | `int` | NOT NULL, DEFAULT `0` | 채널 내 메시지 전송 순서 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/sticky-message/domain/sticky-message-config.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_sticky_message_guild` | `(guildId)` | 길드별 전체 설정 조회 (슬래시 커맨드 목록/삭제, 캐시 워밍업) |
| `IDX_sticky_message_guild_channel_sort` | `(guildId, channelId, sortOrder)` | 채널별 설정 조회 (`messageCreate` 캐시 미스 시 DB 조회) 및 디바운스 만료 후 sortOrder 순 재전송 모두 커버 |

#### 인덱스 설계 근거

`messageCreate` 캐시 미스 시 `WHERE guildId = ? AND channelId = ?` 조회와 디바운스 만료 후 `WHERE guildId = ? AND channelId = ? AND enabled = true ORDER BY sortOrder ASC` 조회가 모두 `(guildId, channelId)` 접두사를 공유한다. 별도의 `(channelId, sortOrder)` 인덱스는 `guildId` 조건을 커버하지 못하므로 제거하고, `IDX_sticky_message_guild_channel_sort (guildId, channelId, sortOrder)` 단일 인덱스로 통합한다.

---

### 15. VoiceExcludedChannel (`voice_excluded_channel`)

길드별로 음성 시간 추적에서 제외할 채널 또는 카테고리를 저장한다. `type = CATEGORY`인 경우 Discord API로 해당 채널의 `parentId`를 조회하여 카테고리 하위 전체 채널을 제외 처리한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `discordChannelId` | `varchar` | NOT NULL | 제외할 채널 또는 카테고리 ID |
| `type` | `enum('CHANNEL','CATEGORY')` | NOT NULL | 제외 단위. `CHANNEL`: 개별 음성 채널 직접 일치, `CATEGORY`: 해당 카테고리 하위 전체 채널 제외 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/channel/voice/domain/voice-excluded-channel.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_voice_excluded_channel_guild_channel` | `(guildId, discordChannelId)` UNIQUE | 서버+채널 단위 중복 방지 (F-VOICE-014의 409 응답 조건). `guildId` 선두 접두사로 F-VOICE-013, F-VOICE-016 캐시 미스 시 전체 목록 조회도 커버 |

#### 인덱스 설계 근거

`WHERE guildId = ?` 단순 조회(F-VOICE-013 목록 반환, F-VOICE-016 캐시 미스 시 DB 전체 조회)는 UNIQUE 복합 인덱스 `(guildId, discordChannelId)`의 선두 컬럼을 사용하므로 추가 단독 인덱스 없이 커버된다. `channelName`은 GET 응답에 포함되지 않으며(F-VOICE-013 응답: `id, channelId, type` 3개 필드) F-VOICE-016 필터링 로직에서도 참조하지 않으므로 저장하지 않는다.

---

### 16. StatusPrefixButton (`status_prefix_button`)

길드별 접두사 버튼 목록을 저장한다. Discord 안내 메시지의 ActionRow에 표시되는 버튼 각각에 대응하며, 접두사 적용(PREFIX)과 원래대로 복원(RESET) 두 가지 타입을 가진다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `configId` | `int` | FK → StatusPrefixConfig.id, NOT NULL, ON DELETE CASCADE | 소속 설정 |
| `label` | `varchar` | NOT NULL | Discord 버튼 표시 라벨 (예: `관전 적용`) |
| `emoji` | `varchar` | NULLABLE | Discord 버튼 이모지 (예: `👁`) |
| `prefix` | `varchar` | NULLABLE | 닉네임에 삽입될 접두사 텍스트 (type = `PREFIX` 시 필수, `RESET` 시 NULL) |
| `type` | `enum('PREFIX','RESET')` | NOT NULL | 버튼 동작 타입 |
| `sortOrder` | `int` | NOT NULL, DEFAULT `0` | 버튼 표시 순서 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: StatusPrefixConfig (N:1)
- **파일**: `apps/api/src/status-prefix/domain/status-prefix-button.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_status_prefix_button_config` | `(configId, sortOrder)` | 설정별 버튼 목록을 순서대로 조회 |

#### 버튼 타입 정의

| 타입 | customId 형식 | 동작 |
|------|---------------|------|
| `PREFIX` | `status_prefix:{buttonId}` | 닉네임에 접두사 적용 |
| `RESET` | `status_reset:{buttonId}` | 원래 닉네임으로 복원 |

---

### 17. MocoHuntingSession (`moco_hunting_session`)

사냥꾼과 모코코(신규사용자)의 동시접속 세션을 저장한다. 음성 채널에서 사냥꾼과 신규사용자가 동시에 접속한 구간을 추적하며, 유효 세션 여부를 판별한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `hunterId` | `varchar` | NOT NULL | 사냥꾼 디스코드 유저 ID |
| `channelId` | `varchar` | NOT NULL | 동시접속이 발생한 음성 채널 ID |
| `startedAt` | `timestamp` | NOT NULL | 동시접속 시작 시각 |
| `endedAt` | `timestamp` | NULLABLE | 동시접속 종료 시각 |
| `durationMin` | `int` | NULLABLE | 동시접속 시간(분) |
| `newbieMemberIds` | `json` | NOT NULL | 모코코 memberId 배열 |
| `isValid` | `boolean` | NOT NULL, DEFAULT `false` | 유효 세션 여부 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/newbie/domain/moco-hunting-session.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_moco_session_guild_hunter` | `(guildId, hunterId)` | 사냥꾼별 세션 조회 |
| `IDX_moco_session_guild_started` | `(guildId, startedAt)` | 길드별 세션 시간순 조회 |
| `IDX_moco_session_guild_valid` | `(guildId, isValid)` | 길드별 유효 세션 조회 |

#### 인덱스 설계 근거

사냥꾼별 세션 이력 조회(`WHERE guildId = ? AND hunterId = ?`)는 `IDX_moco_session_guild_hunter`로 커버한다. 길드 내 기간별 세션 조회(`WHERE guildId = ? AND startedAt BETWEEN ? AND ?`)는 `IDX_moco_session_guild_started`로 커버한다. 유효 세션 집계(`WHERE guildId = ? AND isValid = true`)는 `IDX_moco_session_guild_valid`로 커버한다.

---

### 18. MocoHuntingDaily (`moco_hunting_daily`)

사냥꾼의 일별 모코코 사냥 집계를 저장한다. 유효 세션 데이터를 기반으로 일별로 집계된 점수를 관리한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `hunterId` | `varchar` | PK | 사냥꾼 디스코드 유저 ID |
| `date` | `varchar(8)` | PK | 날짜 (`YYYYMMDD`) |
| `channelMinutes` | `int` | NOT NULL, DEFAULT `0` | 채널 기반 실제 사냥 시간(분) |
| `sessionCount` | `int` | NOT NULL, DEFAULT `0` | 유효 세션 횟수 |
| `uniqueNewbieCount` | `int` | NOT NULL, DEFAULT `0` | 고유 모코코 수 |
| `score` | `int` | NOT NULL, DEFAULT `0` | 당일 점수 |

- **복합 PK**: `(guildId, hunterId, date)`
- **테이블명**: `moco_hunting_daily` (커스텀 지정)
- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/newbie/domain/moco-hunting-daily.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_moco_daily_guild_date` | `(guildId, date)` | 길드별 날짜 기준 집계 조회 |

#### 인덱스 설계 근거

길드 내 날짜별 전체 사냥꾼 집계 조회(`WHERE guildId = ? AND date BETWEEN ? AND ?`)는 `IDX_moco_daily_guild_date`로 커버한다. 사냥꾼 개인 조회(`WHERE guildId = ? AND hunterId = ? AND date BETWEEN ? AND ?`)는 복합 PK `(guildId, hunterId, date)`의 선두 접두사로 커버되므로 추가 인덱스가 불필요하다.

---

### 20. VoiceCoPresenceSession (`voice_co_presence_session`)

> Voice Co-Presence 도메인: 사용자 단위의 동시접속 세션 이력. 90일 보존 후 자동 삭제.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `userId` | `varchar` | NOT NULL | 추적 대상 사용자 디스코드 ID |
| `channelId` | `varchar` | NOT NULL | 동시접속이 발생한 음성 채널 ID |
| `startedAt` | `timestamp` | NOT NULL | 동시접속 시작 시각 |
| `endedAt` | `timestamp` | NOT NULL | 동시접속 종료 시각 |
| `durationMin` | `int` | NOT NULL | 동시접속 시간(분) |
| `peerIds` | `json` | NOT NULL | 세션 중 함께 있었던 사용자 ID 배열 |
| `peerMinutes` | `json` | NOT NULL | 사용자별 동시접속 시간 (`{"userId1": 30, "userId2": 60}`) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/channel/voice/co-presence/domain/voice-co-presence-session.entity.ts`
- **보존 정책**: 90일 초과 데이터 자동 삭제 (매일 자정 KST 스케줄러)
- **설계 의도**: 진행 중인 세션은 인메모리에서만 관리되며, 종료 시점에만 DB에 persist된다. 따라서 `endedAt`은 항상 NOT NULL이다.

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_copresence_session_guild_user` | `(guildId, userId)` | 사용자별 세션 조회 |
| `IDX_copresence_session_guild_started` | `(guildId, startedAt)` | 기간별 세션 조회 |
| `IDX_copresence_session_ended` | `(endedAt)` | 90일 자동 삭제 스케줄러 (`DELETE WHERE endedAt < ?`) |

#### 인덱스 설계 근거

자동 삭제 스케줄러(`DELETE WHERE endedAt < ?`)가 guildId 무관하게 날짜 기준으로 삭제하므로 `endedAt` 단독 인덱스를 둔다. 사용자별 세션 조회(`WHERE guildId = ? AND userId = ?`)는 `IDX_copresence_session_guild_user`로 커버한다.

---

### 21. VoiceCoPresenceDaily (`voice_co_presence_daily`)

> Voice Co-Presence 도메인: 사용자별 일별 동시접속 집계. 영구 보존.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `userId` | `varchar` | PK | 사용자 디스코드 ID |
| `date` | `date` | PK | 날짜 |
| `channelMinutes` | `int` | NOT NULL, DEFAULT `0` | 당일 다른 사용자와 함께한 채널 체류 시간(분) |
| `sessionCount` | `int` | NOT NULL, DEFAULT `0` | 당일 세션 수 |

- **복합 PK**: `(guildId, userId, date)`
- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/channel/voice/co-presence/domain/voice-co-presence-daily.entity.ts`
- **보존 정책**: 영구 보존 (삭제 안 함)

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_copresence_daily_guild_date` | `(guildId, date)` | 서버 전체 기간별 조회 |

#### 인덱스 설계 근거

기간별 서버 전체 조회(`WHERE guildId = ? AND date BETWEEN ? AND ?`)를 커버한다. 특정 사용자 조회는 PK `(guildId, userId, date)`로 커버되므로 별도 인덱스 불필요.

#### Upsert 쿼리

```sql
INSERT INTO voice_co_presence_daily ("guildId", "userId", "date", "channelMinutes", "sessionCount")
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT ("guildId", "userId", "date")
DO UPDATE SET
  "channelMinutes" = voice_co_presence_daily."channelMinutes" + EXCLUDED."channelMinutes",
  "sessionCount" = voice_co_presence_daily."sessionCount" + EXCLUDED."sessionCount"
```

---

### 22. VoiceCoPresencePairDaily (`voice_co_presence_pair_daily`)

> Voice Co-Presence 도메인: 사용자 쌍 단위 일별 동시접속 집계. 관계 분석의 핵심 테이블. 영구 보존.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `userId` | `varchar` | PK | 사용자 A |
| `peerId` | `varchar` | PK | 사용자 B |
| `date` | `date` | PK | 날짜 |
| `minutes` | `int` | NOT NULL, DEFAULT `0` | 당일 동시접속 시간(분) |
| `sessionCount` | `int` | NOT NULL, DEFAULT `0` | 당일 세션 수 |

- **복합 PK**: `(guildId, userId, peerId, date)`
- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/channel/voice/co-presence/domain/voice-co-presence-pair-daily.entity.ts`
- **보존 정책**: 영구 보존 (삭제 안 함)
- **데이터 방향성**: A와 B가 함께 있으면 `(userId=A, peerId=B)`와 `(userId=B, peerId=A)` **양방향 모두 저장**

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_copresence_pair_guild_user_date` | `(guildId, userId, date)` | 특정 사용자의 기간별 관계 조회 |
| `IDX_copresence_pair_guild_date` | `(guildId, date)` | 서버 전체 기간별 관계 조회 |

#### 인덱스 설계 근거

특정 사용자의 친밀도 조회(`WHERE guildId = ? AND userId = ? AND date BETWEEN ? AND ? GROUP BY peerId`)는 `IDX_copresence_pair_guild_user_date`로 필터링+정렬을 커버한다. 서버 전체 관계 그래프 조회(`WHERE guildId = ? AND date BETWEEN ?`)는 `IDX_copresence_pair_guild_date`로 커버한다. 특정 쌍 조회(`WHERE guildId = ? AND userId = ? AND peerId = ?`)는 PK로 커버되므로 별도 인덱스 불필요.

#### 관계 분석 대시보드(F-COPRESENCE-007~013) 인덱스 검토 결과

> F-COPRESENCE-007~013은 기존 3개 테이블을 읽기 전용으로 조회한다. 새 테이블·컬럼·인덱스는 불필요하다.

| 기능 | 주요 쿼리 패턴 | 커버 인덱스 |
|------|--------------|------------|
| F-COPRESENCE-007 요약 카드 | `PairDaily WHERE guildId + date, COUNT(DISTINCT userId)` | `IDX_copresence_pair_guild_date` |
| F-COPRESENCE-007 요약 카드 | `Daily WHERE guildId + date, SUM(channelMinutes)` | `IDX_copresence_daily_guild_date` |
| F-COPRESENCE-008 네트워크 그래프 | `Daily WHERE guildId + date GROUP BY userId ORDER BY SUM LIMIT 50` | `IDX_copresence_daily_guild_date` |
| F-COPRESENCE-008 네트워크 그래프 | `PairDaily WHERE guildId + date AND userId IN (...50명...)` | `IDX_copresence_pair_guild_date` |
| F-COPRESENCE-009 친밀도 TOP N | `PairDaily WHERE guildId + date AND userId < peerId GROUP BY (userId,peerId) ORDER BY SUM LIMIT N` | `IDX_copresence_pair_guild_date` (guildId+date 필터 후 행 레벨 `userId < peerId` 필터) |
| F-COPRESENCE-010 고립 멤버 | `Daily WHERE guildId + date` + `NOT EXISTS (PairDaily WHERE guildId + date + userId)` | `IDX_copresence_daily_guild_date`, `IDX_copresence_pair_guild_user_date` |
| F-COPRESENCE-011 관계 테이블 + userName 검색 | `PairDaily WHERE guildId + date AND userId < peerId` 후 `voice_daily` JOIN으로 userName 조회 | `IDX_copresence_pair_guild_date`, `IDX_voice_daily_guild_user_date` |
| F-COPRESENCE-012 일별 추이 | `Daily WHERE guildId + date GROUP BY date, SUM(channelMinutes)` | `IDX_copresence_daily_guild_date` |
| F-COPRESENCE-013 쌍 상세 | `PairDaily WHERE guildId + userId IN (A,B) AND peerId IN (A,B) AND date BETWEEN` | PK `(guildId, userId, peerId, date)` |

**userName 검색(F-COPRESENCE-011) 설계 근거**: `voice_co_presence_pair_daily`에는 `userName` 컬럼이 없다. 유저명 검색 시 `voice_daily` 테이블(비정규화된 `userName` 컬럼 보유)과 JOIN하여 처리한다. `voice_daily`의 `IDX_voice_daily_guild_user_date (guildId, userId, date)`로 userId 기반 lookup이 가능하다. PairDaily에서 `guildId + date` 필터를 먼저 적용하여 후보 집합을 줄인 뒤 userName LIKE 필터를 적용하므로 추가 인덱스는 불필요하다.

#### 배치 Upsert 쿼리

세션 종료 시 모든 peer 레코드(양방향)를 한 번의 쿼리로 처리한다:

```sql
INSERT INTO voice_co_presence_pair_daily ("guildId", "userId", "peerId", "date", "minutes", "sessionCount")
VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12), ...
ON CONFLICT ("guildId", "userId", "peerId", "date")
DO UPDATE SET
  "minutes" = voice_co_presence_pair_daily."minutes" + EXCLUDED."minutes",
  "sessionCount" = voice_co_presence_pair_daily."sessionCount" + EXCLUDED."sessionCount"
```

10명 채널에서 세션 종료 시 양방향 18행(9쌍 × 2)을 단일 쿼리로 처리. PostgreSQL VALUES 리스트 방식으로 파라미터 상한(65,535개) 내에서 약 10,000행까지 단일 쿼리 처리 가능.

#### 관계 분석 쿼리 예시

```sql
-- 유저 A의 친밀도 TOP 5 (최근 30일)
SELECT "peerId", SUM(minutes) AS "totalMin"
FROM voice_co_presence_pair_daily
WHERE "guildId" = :guildId AND "userId" = :userId
  AND date BETWEEN :from AND :to
GROUP BY "peerId" ORDER BY "totalMin" DESC LIMIT 5;

-- 유저 A와 B의 총 동시접속 시간
SELECT SUM(minutes)
FROM voice_co_presence_pair_daily
WHERE "guildId" = :guildId AND "userId" = :userA AND "peerId" = :userB;
```

---

### 23. InactiveMemberConfig (`inactive_member_config`)

길드별 비활동 판정 기준 및 자동 조치 설정을 저장한다. 길드당 하나의 설정이 존재하며, 설정이 없으면 기본값으로 자동 생성된다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `periodDays` | `int` | NOT NULL, DEFAULT `30` | 비활동 판단 기간 (일). 허용값: 7/14/30 |
| `lowActiveThresholdMin` | `int` | NOT NULL, DEFAULT `30` | 저활동 임계값 (분). 이 값 미만이면 `LOW_ACTIVE` 판정 |
| `decliningPercent` | `int` | NOT NULL, DEFAULT `50` | 활동 감소 판정 비율 (%). 이전 동일 기간 대비 이 비율 이상 감소 시 `DECLINING` 판정. 허용 범위: 0~100 |
| `autoActionEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 자동 조치 전체 활성화 여부 |
| `autoRoleAdd` | `boolean` | NOT NULL, DEFAULT `false` | `FULLY_INACTIVE` 신규 판정 시 자동 역할 부여 여부 |
| `autoDm` | `boolean` | NOT NULL, DEFAULT `false` | `FULLY_INACTIVE` 신규 판정 시 자동 DM 발송 여부 |
| `inactiveRoleId` | `varchar` | NULLABLE | `ACTION_ROLE_ADD` 시 부여할 역할 Discord ID |
| `removeRoleId` | `varchar` | NULLABLE | `ACTION_ROLE_REMOVE` 시 제거할 역할 Discord ID |
| `excludedRoleIds` | `json` | NOT NULL, DEFAULT `'[]'` | 비활동 판정에서 제외할 역할 ID 배열 |
| `dmEmbedTitle` | `varchar` | NULLABLE | DM Embed 제목 |
| `dmEmbedBody` | `text` | NULLABLE | DM Embed 본문. 템플릿 변수: `{nickName}`, `{serverName}`, `{periodDays}`, `{totalMinutes}` |
| `dmEmbedColor` | `varchar` | NULLABLE | DM Embed 색상 (HEX, 예: `#FF0000`) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/inactive-member/entities/inactive-member-config.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_inactive_member_config_guild` | `(guildId)` UNIQUE | 길드당 하나의 설정 보장 |

#### 인덱스 설계 근거

설정 조회(`GET /api/guilds/{guildId}/inactive-member-config`)와 스케줄러의 설정 로드는 모두 `WHERE guildId = ?` 단건 조회다. UNIQUE 인덱스가 해당 조회를 커버하므로 추가 인덱스는 불필요하다.

---

### 24. InactiveMemberRecord (`inactive_member_record`)

비활동 분류 스케줄러가 매일 자정 갱신하는 길드+유저 단위 최신 분류 결과 스냅샷이다. 등급이 변경된 경우 `gradeChangedAt`을 갱신한다. `grade = NULL`은 현재 활동 상태를 의미한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `userId` | `varchar` | NOT NULL | 디스코드 유저 ID |
| `grade` | `enum('FULLY_INACTIVE','LOW_ACTIVE','DECLINING')` | NULLABLE | 분류 등급. NULL이면 활동 상태 |
| `totalMinutes` | `int` | NOT NULL, DEFAULT `0` | 판단 기간 내 총 음성 접속 시간 (분). `VoiceDailyEntity.channelDurationSec` 합산 후 분 환산 |
| `prevTotalMinutes` | `int` | NOT NULL, DEFAULT `0` | 직전 동일 길이 기간의 총 음성 접속 시간 (분). `DECLINING` 판정 기준값 |
| `lastVoiceDate` | `date` | NULLABLE | 마지막 음성 접속 날짜. `VoiceDailyEntity`의 최신 `date` 값 |
| `gradeChangedAt` | `timestamp` | NULLABLE | 이전 분류 결과와 등급이 달라진 시각. 등급 변경 없으면 갱신하지 않음 |
| `classifiedAt` | `timestamp` | NOT NULL | 마지막으로 스케줄러가 분류한 시각 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/inactive-member/entities/inactive-member-record.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_inactive_member_record_guild_user` | `(guildId, userId)` UNIQUE | 길드+유저 복합 유니크. upsert ON CONFLICT 키 |
| `IDX_inactive_member_record_guild_grade` | `(guildId, grade)` | 등급별 목록 조회 (`WHERE guildId = ? AND grade = ?`) |
| `IDX_inactive_member_record_guild_last_voice` | `(guildId, lastVoiceDate)` | 마지막 접속일 기준 정렬 조회 |

#### 인덱스 설계 근거

비활동 회원 목록 API(`GET /api/guilds/{guildId}/inactive-members`)는 두 가지 조회 패턴을 가진다.

- **등급 필터 조회** (`WHERE guildId = ? AND grade = ?`): `IDX_inactive_member_record_guild_grade (guildId, grade)`로 커버한다.
- **마지막 접속일 정렬** (`ORDER BY lastVoiceDate`): `IDX_inactive_member_record_guild_last_voice (guildId, lastVoiceDate)`로 커버한다.
- **총 접속 시간 정렬** (`ORDER BY totalMinutes`): `totalMinutes`는 서버당 비활동 레코드 수가 제한적(멤버 수 상한)이므로 `guildId` 필터 이후 정렬에 filesort를 허용한다. 별도 인덱스를 추가하지 않는다.

복합 유니크 인덱스 `UQ_inactive_member_record_guild_user (guildId, userId)`는 스케줄러 upsert의 `ON CONFLICT` 키로 사용된다.

#### Grade Enum 우선순위

동시에 두 조건을 충족하는 경우 `FULLY_INACTIVE` > `LOW_ACTIVE` > `DECLINING` 순으로 적용한다.

---

### 25. InactiveMemberActionLog (`inactive_member_action_log`)

비활동 회원에 대한 수동 조치(관리자) 및 자동 조치(스케줄러)를 모두 기록한다. `executorUserId = NULL`이면 시스템 자동 조치를 의미한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `actionType` | `enum('ACTION_DM','ACTION_ROLE_ADD','ACTION_ROLE_REMOVE')` | NOT NULL | 조치 유형 |
| `targetUserIds` | `json` | NOT NULL | 조치 대상 유저 Discord ID 배열. 최소 1명, 최대 100명 |
| `executorUserId` | `varchar` | NULLABLE | 조치를 실행한 관리자 Discord ID. NULL이면 시스템 자동 조치 |
| `successCount` | `int` | NOT NULL, DEFAULT `0` | 성공한 조치 수 |
| `failCount` | `int` | NOT NULL, DEFAULT `0` | 실패한 조치 수 (DM 수신 거부 등) |
| `note` | `text` | NULLABLE | 실패 사유 등 추가 메모 |
| `executedAt` | `timestamp` | NOT NULL, DEFAULT now() | 조치 실행 시각 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/inactive-member/entities/inactive-member-action-log.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_inactive_action_log_guild_executed` | `(guildId, executedAt DESC)` | 길드별 이력 최신순 조회 (`GET /inactive-members/action-logs`) |

#### 인덱스 설계 근거

조치 이력 조회(`WHERE guildId = ? ORDER BY executedAt DESC`)를 단일 복합 인덱스로 커버한다. `executedAt DESC` 방향을 인덱스에 명시하여 정렬 시 별도 filesort 없이 인덱스 스캔으로 처리한다.

---

### 26. VoiceGameActivity (`voice_game_activity`)

> Voice Extended Data Collection Phase 2 — 게임 세션 단위 이력. 90일 보존 후 자동 삭제.

음성 채널 참여 중 플레이한 게임 세션을 기록한다. 세션 종료 시점(퇴장 또는 게임 전환)에만 INSERT되며, `durationMin >= 1`인 세션만 저장한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `userId` | `varchar` | NOT NULL | 유저 디스코드 ID |
| `channelId` | `varchar` | NOT NULL | 게임 활동 중이던 음성 채널 ID |
| `gameName` | `varchar` | NOT NULL | 게임명 (Discord Activity 명칭) |
| `applicationId` | `varchar` | NULLABLE | Discord Application ID (게임 고유 식별자). 커스텀 상태 등은 null |
| `startedAt` | `timestamp` | NOT NULL | 게임 세션 시작 시각 |
| `endedAt` | `timestamp` | NOT NULL | 게임 세션 종료 시각 |
| `durationMin` | `int` | NOT NULL | 플레이 시간(분). 최소 1 이상만 저장 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 레코드 생성일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **보존 정책**: 90일 초과 데이터 자동 삭제 (매일 04:00 KST, 기존 보존 스케줄러에 추가)
- **파일**: `apps/api/src/channel/voice/domain/voice-game-activity.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_game_activity_guild_user` | `(guildId, userId, startedAt)` | 유저별 기간 조회 |
| `IDX_game_activity_guild_game` | `(guildId, gameName, startedAt)` | 게임별 기간 조회 |
| `IDX_game_activity_guild_started` | `(guildId, startedAt)` | 서버 전체 기간 조회 |
| `IDX_game_activity_started` | `(startedAt)` | 90일 자동 삭제 스케줄러 (`DELETE WHERE startedAt < ?`) |

#### 인덱스 설계 근거

자동 삭제 스케줄러(`DELETE WHERE startedAt < ?`)는 guildId 무관하게 날짜 기준으로 전체 삭제한다. `IDX_game_activity_guild_started (guildId, startedAt)`는 guildId가 선두라 guildId 조건 없이 `startedAt` 단독 범위 스캔을 할 때 효율적이지 않다. `voice_co_presence_session`의 `IDX_copresence_session_ended (endedAt)` 패턴과 동일하게, `IDX_game_activity_started (startedAt)` 단독 인덱스를 추가하여 삭제 스케줄러를 커버한다.

---

### 27. VoiceGameDaily (`voice_game_daily`)

> Voice Extended Data Collection Phase 2 — 게임 일별 집계. 영구 보존.

유저별·게임별·날짜별로 일별 집계된 게임 플레이 시간을 저장한다. 세션 종료 시 upsert로 누적된다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `userId` | `varchar` | PK | 유저 디스코드 ID |
| `gameName` | `varchar` | PK | 게임명 |
| `date` | `varchar(8)` | PK | 날짜 (`YYYYMMDD`) |
| `totalMinutes` | `int` | NOT NULL, DEFAULT `0` | 해당 날짜 총 플레이 시간(분) |
| `sessionCount` | `int` | NOT NULL, DEFAULT `0` | 해당 날짜 세션 수 |

- **복합 PK**: `(guildId, userId, gameName, date)`
- **테이블명**: `voice_game_daily` (커스텀 지정)
- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **보존 정책**: 영구 보존 (삭제 안 함)
- **파일**: `apps/api/src/channel/voice/domain/voice-game-daily.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_game_daily_guild_date` | `(guildId, date)` | 서버 전체 날짜별 게임 집계 조회 |
| `IDX_game_daily_guild_game_date` | `(guildId, gameName, date)` | 서버 내 게임별 날짜 집계 |

#### 인덱스 설계 근거

유저의 날짜별 게임 활동 조회(`WHERE guildId = ? AND userId = ? AND date BETWEEN ? AND ?`)는 복합 PK `(guildId, userId, gameName, date)`의 선두 접두사 `(guildId, userId)`로 커버되므로 별도 인덱스가 불필요하다. `IDX_game_daily_guild_date (guildId, date)`는 서버 내 특정 날짜의 전체 게임 활동 집계에 사용된다. `IDX_game_daily_guild_game_date (guildId, gameName, date)`는 특정 게임의 서버 내 인기도·추이 조회에 사용된다.

#### Upsert 쿼리

```sql
INSERT INTO voice_game_daily ("guildId", "userId", "gameName", "date", "totalMinutes", "sessionCount")
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT ("guildId", "userId", "gameName", "date")
DO UPDATE SET
  "totalMinutes" = voice_game_daily."totalMinutes" + EXCLUDED."totalMinutes",
  "sessionCount" = voice_game_daily."sessionCount" + EXCLUDED."sessionCount"
```

---

### 28. MusicChannelConfig (`music_channel_config`)

길드별 음악 전용 채널 임베드 시스템 설정을 저장한다. 길드당 하나의 설정이 존재하며, 버튼 구성은 JSONB 컬럼으로 관리한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `channelId` | `varchar` | NOT NULL | 음악 전용 텍스트 채널 ID |
| `messageId` | `varchar` | NULLABLE | 고정 임베드 메시지 ID (Discord message ID). 신규 전송 후 저장. 메시지 수정 실패 시 NULL로 초기화 |
| `embedTitle` | `varchar` | NULLABLE | 대기 상태 임베드 제목. NULL이면 기본값 `"음악 채널"` 사용 |
| `embedDescription` | `text` | NULLABLE | 대기 상태 임베드 설명. NULL이면 기본값 사용 |
| `embedColor` | `varchar` | NULLABLE | 대기 상태 임베드 색상 (HEX, 예: `#5865F2`). NULL이면 기본값 사용 |
| `embedThumbnailUrl` | `varchar` | NULLABLE | 대기 상태 임베드 썸네일 이미지 URL. 재생 중 트랙 썸네일이 없을 때도 fallback으로 사용 |
| `buttonConfig` | `jsonb` | NOT NULL | 버튼 구성. 표시할 버튼 목록, 순서, 활성화 여부를 포함하는 JSON 객체 |
| `enabled` | `boolean` | NOT NULL, DEFAULT `true` | 음악 전용 채널 기능 활성화 여부. `false`이면 임베드 전송 안 함 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/bot/src/music/infrastructure/music-channel-config.orm-entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `UQ_music_channel_config_guild` | `(guildId)` UNIQUE | 길드당 하나의 설정 보장. 설정 단건 조회 커버 |
| `IDX_music_channel_config_channel` | `(channelId)` | F-MUSIC-016: `messageCreate` 이벤트에서 수신 채널이 음악 전용 채널인지 확인하는 `WHERE channelId = ?` 조회 커버 |

#### buttonConfig JSONB 구조

`buttonConfig` 컬럼은 다음 구조의 JSON 객체를 저장한다.

```json
{
  "buttons": [
    { "type": "search",          "label": "음악 검색하기", "emoji": "🔍", "enabled": true, "row": 0 },
    { "type": "pause_resume",    "label": "일시정지/재개", "emoji": "⏯️", "enabled": true, "row": 1 },
    { "type": "skip",            "label": "스킵",          "emoji": "⏭️", "enabled": true, "row": 1 },
    { "type": "stop",            "label": "정지",          "emoji": "⏹️", "enabled": true, "row": 1 },
    { "type": "queue",           "label": "재생목록",      "emoji": "📋", "enabled": true, "row": 2 },
    { "type": "melon_chart",     "label": "멜론차트",      "emoji": "🎵", "enabled": true, "row": 2 },
    { "type": "billboard_chart", "label": "빌보드",        "emoji": "🎶", "enabled": true, "row": 2 }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `string` | 버튼 식별자. `search` / `pause_resume` / `skip` / `stop` / `queue` / `melon_chart` / `billboard_chart` 중 하나 |
| `label` | `string` | Discord 버튼 표시 라벨. 웹에서 수정 가능 |
| `emoji` | `string` | Discord 버튼 이모지 |
| `enabled` | `boolean` | `false`이면 해당 버튼을 임베드에서 렌더링하지 않음 |
| `row` | `number` | ActionRow 번호 (0~4). Discord 최대 5행 제한 |

#### 인덱스 설계 근거

길드 설정 조회(`WHERE guildId = ?`)는 단건 조회이므로 UNIQUE 인덱스 하나로 커버된다. 버튼 구성이 JSONB로 관리되므로 버튼별 별도 테이블이 불필요하다. `buttonConfig`에 대한 GIN 인덱스는 현재 스펙에서 JSONB 필드를 조건절에서 직접 조회하지 않으므로 추가하지 않는다.

F-MUSIC-016의 `messageCreate` 이벤트 처리는 수신된 채널 ID가 음악 전용 채널인지 확인하기 위해 `WHERE channelId = ?` 조회를 수행한다. `messageCreate`는 서버의 모든 텍스트 메시지마다 발생하는 고빈도 이벤트이므로, `UNIQUE(guildId)` 인덱스만으로는 이 조회를 커버할 수 없어 `IDX_music_channel_config_channel (channelId)` 단독 인덱스를 추가한다. `channelId`는 Discord 전역에서 고유하므로(Snowflake ID) 단독 인덱스로 충분히 선택도가 높다.

---

### 29. WeeklyReportConfig (`weekly_report_config`)

> F-GEMINI-006 대응: 길드별 주간 자동 리포트 발송 설정을 저장한다. 스케줄러가 매시간 정각에 이 테이블을 조회하여 조건에 맞는 길드에 리포트를 전송한다.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `guildId` | `varchar` | PK | 디스코드 서버 ID |
| `isEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 주간 리포트 발송 활성화 여부 |
| `channelId` | `varchar` | NULLABLE | 리포트를 전송할 텍스트 채널 ID. `isEnabled = true`일 때 필수 |
| `dayOfWeek` | `int` | NOT NULL, DEFAULT `1` | 발송 요일. `0`(일) ~ `6`(토) |
| `hour` | `int` | NOT NULL, DEFAULT `9` | 발송 시간 (시 단위). `0` ~ `23` |
| `timezone` | `varchar` | NOT NULL, DEFAULT `'Asia/Seoul'` | 발송 기준 타임존. IANA 타임존 문자열 (예: `Asia/Seoul`) |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 마지막 설정 변경 시각 (`@UpdateDateColumn`) |

- **스키마**: `public`
- **관계**: 독립 테이블 (FK 없음, Discord ID 직접 저장)
- **파일**: `apps/api/src/voice-analytics/weekly-report/weekly-report-config.entity.ts`

#### 인덱스

| 인덱스 | 컬럼 | 용도 |
|--------|------|------|
| `IDX_weekly_report_config_enabled` | `(isEnabled)` | 스케줄러가 매시간 `WHERE isEnabled = true` 조건으로 발송 대상 길드 전체를 조회할 때 사용 |

#### 인덱스 설계 근거

주간 리포트 스케줄러(`0 * * * *`)는 매시간 `WHERE isEnabled = true` 조건으로 발송 대상 길드 전체를 조회한다. `isEnabled`는 boolean이므로 선택도가 낮지만, 비활성화된 길드가 다수인 운영 환경에서는 `true` 레코드 비율이 낮아 인덱스 스캔이 풀스캔보다 효율적이다. 단건 설정 조회(`WHERE guildId = ?`)는 PK 인덱스로 커버된다.

#### SQL DDL

```sql
CREATE TABLE weekly_report_config (
  "guildId"    varchar        NOT NULL,
  "isEnabled"  boolean        NOT NULL DEFAULT false,
  "channelId"  varchar,
  "dayOfWeek"  int            NOT NULL DEFAULT 1,
  "hour"       int            NOT NULL DEFAULT 9,
  "timezone"   varchar        NOT NULL DEFAULT 'Asia/Seoul',
  "updatedAt"  timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT PK_weekly_report_config PRIMARY KEY ("guildId")
);

CREATE INDEX IDX_weekly_report_config_enabled ON weekly_report_config ("isEnabled");

COMMENT ON COLUMN weekly_report_config."guildId"   IS '디스코드 서버 ID (PK)';
COMMENT ON COLUMN weekly_report_config."isEnabled"  IS '주간 리포트 발송 활성화 여부';
COMMENT ON COLUMN weekly_report_config."channelId"  IS '리포트를 전송할 텍스트 채널 ID (nullable)';
COMMENT ON COLUMN weekly_report_config."dayOfWeek"  IS '발송 요일: 0(일) ~ 6(토)';
COMMENT ON COLUMN weekly_report_config."hour"       IS '발송 시간(시 단위): 0 ~ 23';
COMMENT ON COLUMN weekly_report_config."timezone"   IS 'IANA 타임존 문자열 (예: Asia/Seoul)';
COMMENT ON COLUMN weekly_report_config."updatedAt"  IS '마지막 설정 변경 시각';
```

---

## Redis 데이터 구조

### 키 네이밍 패턴

모든 키는 도메인 접두사를 사용하며, 계층적 구조를 따른다.

```
voice:{category}:{sub}:{guildId}:{...params}
auto_channel:{category}:{...params}
newbie:{category}:{...params}
status_prefix:{category}:{...params}
sticky_message:{category}:{...params}
music:{category}:{...params}
```

### voice 키 정의

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `voice:session:{guildId}:{userId}` | 12시간 | String (JSON) | 현재 음성 세션 정보 |
| `voice:duration:channel:{guildId}:{userId}:{date}:{channelId}` | — | String | 채널별 체류 시간 누적 |
| `voice:duration:mic:{guildId}:{userId}:{date}:{on\|off}` | — | String | 마이크 ON/OFF 시간 누적 |
| `voice:duration:alone:{guildId}:{userId}:{date}` | — | String | 혼자 있던 시간 누적 |
| `voice:duration:streaming:{guildId}:{userId}:{date}` | — | String | 화면 공유 누적 시간 (초). F-VOICE-025 |
| `voice:duration:video:{guildId}:{userId}:{date}` | — | String | 카메라 ON 누적 시간 (초). F-VOICE-026 |
| `voice:duration:deaf:{guildId}:{userId}:{date}` | — | String | 스피커 음소거 누적 시간 (초). F-VOICE-027 |
| `voice:game:session:{guildId}:{userId}` | 24시간 | String (JSON) | 유저별 현재 게임 세션 정보. F-VOICE-028~031 |
| `voice:channel:name:{guildId}:{channelId}` | 7일 | String | 채널명 캐시 |
| `voice:user:name:{guildId}:{userId}` | 7일 | String | 유저명 캐시 |
| `voice:excluded:{guildId}` | 1시간 | Set | 길드별 제외 채널 목록 캐시 (제외 대상 channelId/categoryId 집합) |

- **키 생성 함수**: `apps/api/src/channel/voice/infrastructure/voice-cache.keys.ts`
- **저장소**: `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts`

### VoiceSession 구조

```typescript
interface VoiceSession {
  channelId: string;      // 현재 접속 중인 채널 ID
  joinedAt: number;       // 입장 시각 (ms timestamp)
  mic: boolean;           // 마이크 상태
  alone: boolean;         // 혼자 여부
  lastUpdatedAt: number;  // 마지막 시간 계산 시점 (ms timestamp)
  date: string;           // 날짜 (YYYYMMDD)
}
```

#### VoiceGameSession 구조

`voice:game:session:{guildId}:{userId}` 키에 JSON 직렬화하여 저장된다. TTL 24시간. 세션 종료 시 명시적으로 삭제된다.

```typescript
interface VoiceGameSession {
  gameName: string;          // Discord Activity 명칭
  applicationId: string | null; // Discord Application ID. 커스텀 상태 등은 null
  startedAt: number;         // 세션 시작 시각 (ms timestamp)
  channelId: string;         // 음성 채널 ID (세션 종료 시 voice_game_activity.channelId에 저장)
}
```

#### voice:excluded 구조

Redis Set 자료구조로 저장된다. 멤버는 제외 대상 채널 ID이다. `type = CHANNEL`이면 해당 `discordChannelId`를 직접 저장하고, `type = CATEGORY`이면 DB 조회 후 Set을 구성할 때 카테고리 ID를 저장한다. `voiceStateUpdate` 이벤트 처리 시 `type = CATEGORY` 항목은 Discord API로 채널의 `parentId`를 확인하여 일치 여부를 판단한다.

```
SADD voice:excluded:{guildId} {discordChannelId}
EXPIRE voice:excluded:{guildId} 3600
```

- 설정 등록(`POST`) 또는 삭제(`DELETE`) 시 해당 키를 명시적으로 삭제하여 캐시를 무효화한다.
- 캐시 미스 시 `VoiceExcludedChannel`을 DB에서 전체 조회 후 Redis에 1시간 TTL로 재저장한다.

### auto_channel 키 정의

자동방의 런타임 상태를 저장한다. 채널 삭제 또는 확정방 전환 시 해당 키를 삭제한다.

| 키 패턴 | TTL | 설명 |
|---------|-----|------|
| `auto_channel:waiting:{channelId}` | 12시간 | 대기방 메타데이터 |
| `auto_channel:confirmed:{channelId}` | 12시간 | 확정방 메타데이터 |

#### AutoChannelWaitingState 구조

```typescript
interface AutoChannelWaitingState {
  guildId: string;          // 디스코드 서버 ID
  userId: string;           // 대기방 소유 유저 ID
  triggerChannelId: string; // 진입한 트리거 채널 ID
  configId: number;         // auto_channel_config PK
}
```

#### AutoChannelConfirmedState 구조

```typescript
interface AutoChannelConfirmedState {
  guildId: string;       // 디스코드 서버 ID
  userId: string;        // 확정방 소유 유저 ID
  configId: number;      // auto_channel_config PK
  buttonId?: number;     // auto_channel_button PK (select 모드 전용)
  subOptionId?: number;  // auto_channel_sub_option PK (하위 선택지 선택 시, select 모드 전용)
}
```

### newbie 키 정의

신규사용자 도메인의 설정 캐시, 미션 목록 캐시, 신입기간 활성 멤버 집합, 모코코 사냥 누적 데이터를 저장한다.

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `newbie:config:{guildId}` | 1시간 | String (JSON) | NewbieConfig 설정 캐시 |
| `newbie:mission:active:{guildId}` | 30분 | String (JSON) | 진행중 미션 목록 캐시 (NewbieMission[] JSON 직렬화) |
| `newbie:period:active:{guildId}` | 1시간 | Set | 신입기간 활성 멤버 집합 (`Set<memberId>`) |
| `newbie:moco:total:{guildId}:{hunterId}` | 없음 | Hash | 사냥꾼(기존 멤버)의 신규사용자별 사냥 시간 |
| `newbie:moco:rank:{guildId}` | 없음 | Sorted Set | 길드별 사냥꾼 총 사냥 시간 순위 (score = 총 사냥분) |

- **키 생성 함수**: `apps/api/src/newbie/infrastructure/newbie-cache.keys.ts`
- **저장소**: `apps/api/src/newbie/infrastructure/newbie-redis.repository.ts`

#### newbie:moco:total 구조

Redis Hash 자료구조로 저장된다. 필드는 신규사용자 memberId, 값은 동시 접속 시간(분)이다.

```
HSET newbie:moco:total:{guildId}:{hunterId} {newbieMemberId} {minutes}
```

#### newbie:moco:rank 구조

Redis Sorted Set 자료구조로 저장된다. score는 사냥꾼의 총 사냥 시간(분)이다.

```
ZADD newbie:moco:rank:{guildId} {totalMinutes} {hunterId}
```

### status_prefix 키 정의

멤버의 원래 닉네임(접두사 적용 전)과 설정 캐시를 저장한다.

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `status_prefix:original:{guildId}:{memberId}` | 없음 (퇴장 시 명시적 삭제) | String | 멤버의 원래 닉네임 (접두사 적용 전 닉네임) |
| `status_prefix:config:{guildId}` | 1시간 | String (JSON) | StatusPrefixConfig 설정 캐시 |

- **키 생성 함수**: `apps/api/src/status-prefix/infrastructure/status-prefix-cache.keys.ts`
- **저장소**: `apps/api/src/status-prefix/infrastructure/status-prefix-redis.repository.ts`

#### status_prefix:original 저장 규칙

최초 접두사 적용 시에만 저장하며, 이미 값이 존재하면 덮어쓰지 않는다. 이유: 접두사가 이미 적용된 상태에서 다른 접두사로 교체할 때 원래 닉네임(접두사 적용 전)을 보존해야 한다.

```
SET status_prefix:original:{guildId}:{memberId} {originalNickname} NX
```

#### status_prefix:config 구조

StatusPrefixConfig와 연관 StatusPrefixButton 목록을 JSON으로 직렬화하여 저장한다. 설정 저장(POST) 시 명시적으로 갱신된다.

```
SET status_prefix:config:{guildId} {configJson} EX 3600
```

### sticky_message 키 정의

고정메세지 설정 캐시와 디바운스 타이머를 저장한다.

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `sticky_message:config:{guildId}` | 1시간 | String (JSON) | 길드별 StickyMessageConfig 전체 목록 캐시 (channelId별 그룹 포함) |
| `sticky_message:debounce:{channelId}` | 3초 | String | 채널별 디바운스 타이머. 키 존재 여부로 타이머 상태 판별 |

- **키 생성 함수**: `apps/api/src/sticky-message/infrastructure/sticky-message-cache.keys.ts`
- **저장소**: `apps/api/src/sticky-message/infrastructure/sticky-message-redis.repository.ts`

#### sticky_message:config 구조

길드의 전체 `StickyMessageConfig` 배열을 JSON 직렬화하여 저장한다. `messageCreate` 핸들러에서 `channelId`로 필터링하여 사용한다. 설정 저장(POST) 또는 삭제(DELETE) 시 명시적으로 갱신 또는 무효화된다.

```
SET sticky_message:config:{guildId} {configArrayJson} EX 3600
```

#### sticky_message:debounce 구조

채널에 새 메시지가 수신될 때마다 TTL을 3초로 리셋한다. 키 존재 여부가 곧 타이머 상태이며, TTL 만료 시 `StickyMessageRefreshService`가 실행된다.

```
SET sticky_message:debounce:{channelId} 1 EX 3
```

### music 키 정의

멜론·빌보드 차트 크롤링 결과를 캐싱한다. 차트 버튼 클릭 시 캐시를 우선 조회하며, 캐시 미스 시 크롤링 후 저장한다.

| 키 패턴 | TTL | 자료구조 | 설명 |
|---------|-----|----------|------|
| `music:chart:melon` | 1시간 | String (JSON) | 멜론 인기차트 TOP 20 크롤링 결과 캐시 |
| `music:chart:billboard` | 1시간 | String (JSON) | 빌보드 HOT 100 TOP 20 크롤링 결과 캐시 |

#### music:chart 구조

차트 크롤링 결과를 JSON 배열로 직렬화하여 저장한다. 각 항목은 곡명과 아티스트 정보를 포함한다.

```json
[
  { "title": "곡명", "artist": "아티스트명" },
  ...
]
```

- **저장 시점**: `melon_chart` 또는 `billboard_chart` 버튼 클릭 시 캐시 미스인 경우
- **삭제 시점**: TTL 만료 (1시간) 후 자동 삭제
- **파일**: `apps/bot/src/music/application/chart-crawler.service.ts`

---

### TTL 정책

| 대상 | TTL | 사유 |
|------|-----|------|
| 제외 채널 목록 캐시 | 1시간 (3,600초) | 설정 변경 빈도 낮음. 등록/삭제 시 명시적 무효화 |
| 세션 데이터 | 12시간 (43,200초) | 서버 크래시 시 고아 세션 자동 정리 |
| 이름 캐시 | 7일 (604,800초) | Discord API 호출 최소화 |
| 시간 누적 데이터 (채널/마이크/혼자/화면공유/카메라/deaf) | 없음 | 일별 flush 시 삭제. `voice:duration:streaming:*`, `voice:duration:video:*`, `voice:duration:deaf:*` 포함 |
| 게임 세션 데이터 | 24시간 | 봇 크래시 시 고아 세션 자동 정리. 세션 종료 시 명시적 삭제 |
| 대기방 상태 | 12시간 (43,200초) | 봇 크래시 시 고아 대기방 자동 정리 |
| 확정방 상태 | 12시간 (43,200초) | voice session과 동일한 생명주기. 봇 크래시 시 고아 키 자동 정리 |
| 트리거 채널 집합 | 없음 | 설정 변경 시 명시적 갱신 |
| newbie 설정 캐시 | 1시간 (3,600초) | 설정 변경 빈도 낮음, 저장 시 명시적 갱신 |
| newbie 미션 목록 캐시 | 30분 (1,800초) | 갱신 버튼 클릭 시 명시적 갱신 |
| newbie 신입기간 활성 멤버 | 1시간 (3,600초) | 스케줄러 실행 시 갱신 |
| newbie 모코코 사냥 데이터 | 없음 | 영구 누적, 리셋 시 명시적 삭제 |
| status_prefix 원래 닉네임 | 없음 (명시적 삭제) | 퇴장(F-STATUS-PREFIX-005) 또는 RESET 버튼(F-STATUS-PREFIX-004) 시 삭제. 비정상 종료 대비 운영 환경에서 24시간 TTL 설정 검토 |
| status_prefix 설정 캐시 | 1시간 (3,600초) | 설정 변경 빈도 낮음, 저장 시 명시적 갱신 |
| sticky_message 설정 캐시 | 1시간 (3,600초) | 설정 변경 빈도 낮음. 저장/삭제 시 명시적 갱신 또는 무효화 |
| sticky_message 디바운스 타이머 | 3초 | 연속 메시지 수신 시 마지막 메시지 기준으로 3초 후 재전송. 수신마다 TTL 리셋 |
| music 차트 캐시 (멜론/빌보드) | 1시간 (3,600초) | 크롤링 부하 최소화. TTL 만료 시 다음 버튼 클릭에서 재크롤링 |

---

## 데이터 흐름

### 제외 채널 라이프사이클

```
[웹 대시보드 초기 로드 — GET /api/guilds/{guildId}/voice/excluded-channels]
  1. VoiceExcludedChannel → PostgreSQL select WHERE guildId = ? (UQ_voice_excluded_channel_guild_channel 인덱스 선두 접두사 활용)
  2. { id, channelId: discordChannelId, type }[] 반환

[제외 채널 등록 (단건) — POST /api/guilds/{guildId}/voice/excluded-channels (F-VOICE-014)]
  1. VoiceExcludedChannel → PostgreSQL select WHERE guildId = ? AND discordChannelId = ?
     - 존재하면 409 응답 후 종료
  2. VoiceExcludedChannel → PostgreSQL insert (guildId, discordChannelId, type)
  3. voice:excluded:{guildId} → Redis delete (캐시 무효화)

[제외 채널 전체 교체 — POST /api/guilds/{guildId}/voice/excluded-channels (F-WEB-006 저장)]
  ※ 웹 대시보드 저장은 선택된 채널 목록 전체를 교체한다 (F-VOICE-014 단건 등록과 동일 엔드포인트, 다른 동작)
  1. VoiceExcludedChannel → PostgreSQL delete WHERE guildId = ? (기존 전체 삭제)
  2. VoiceExcludedChannel → PostgreSQL insert (선택된 채널 수만큼 bulk insert)
  3. voice:excluded:{guildId} → Redis delete (캐시 무효화)

[제외 채널 삭제 — DELETE /api/guilds/{guildId}/voice/excluded-channels/{id}]
  1. VoiceExcludedChannel → PostgreSQL select WHERE id = ? AND guildId = ?
     - 존재하지 않으면 404 응답 후 종료
  2. VoiceExcludedChannel → PostgreSQL delete WHERE id = ?
  3. voice:excluded:{guildId} → Redis delete (캐시 무효화)

[음성 이벤트 처리 시 제외 채널 필터링 — voiceStateUpdate 이벤트 (F-VOICE-016)]
  1. voice:excluded:{guildId} → Redis SMEMBERS (캐시 조회)
     - 캐시 미스: VoiceExcludedChannel → PostgreSQL select WHERE guildId = ?
                 → Redis SADD voice:excluded:{guildId} {discordChannelId} ... EXPIRE 3600 (캐시 저장, TTL 1h)
  2. 대상 채널이 Set에 포함되는지 확인:
     - type = CHANNEL: Set에 해당 channelId가 있으면 제외 대상
     - type = CATEGORY: Discord API로 채널의 parentId 조회 → Set에 parentId가 있으면 제외 대상
  3. 제외 대상이면 이벤트 처리 중단 (VoiceChannelHistory 미생성, VoiceDailyEntity 미누적, Redis 세션 미생성)
  4. 제외 대상이 아니면 기존 플로우(F-VOICE-001 ~ F-VOICE-003) 정상 수행
  - 이동(move) 이벤트 세부 규칙:
    - 이전 채널(A)만 제외 채널: B 입장(F-VOICE-001)만 수행
    - 새 채널(B)만 제외 채널: A 퇴장(F-VOICE-002)만 수행
    - A, B 모두 제외 채널: 이벤트 전체 무시
```

### 음성 세션 라이프사이클

```
[입장]
  1. Member/Channel → PostgreSQL upsert
  2. VoiceChannelHistory → PostgreSQL insert (joinAt)
  3. VoiceSession → Redis set (TTL 12h)
  4. [Phase 2] member.presence.activities 조회 → ActivityType.Playing 감지 시
     voice:game:session:{guildId}:{userId} → Redis set (gameName, applicationId, startedAt, channelId, TTL 24h)

[마이크 토글]
  mic duration → Redis incrBy (voice:duration:mic:...)

[화면 공유 토글 — F-VOICE-025]
  voice:duration:streaming:{guildId}:{userId}:{date} → Redis incrBy

[카메라 토글 — F-VOICE-026]
  voice:duration:video:{guildId}:{userId}:{date} → Redis incrBy

[스피커 음소거 토글 — F-VOICE-027]
  voice:duration:deaf:{guildId}:{userId}:{date} → Redis incrBy

[퇴장]
  1. VoiceSession → Redis get & delete
  2. VoiceChannelHistory → PostgreSQL update (leftAt)
  3. 시간 계산 → Redis duration keys에 누적 (channel, mic, streaming, video, deaf)
  4. VoiceDailyEntity → PostgreSQL upsert (GLOBAL + 개별 채널, streamingSec/videoOnSec/deafSec 포함)
  5. [Phase 2] voice:game:session:{guildId}:{userId} → Redis get
     - 진행 중인 게임 세션 존재 시 → F-VOICE-031 게임 세션 종료 처리 수행
     - voice:game:session 키 → Redis delete
```

### 일별 집계 (Daily Flush)

```
Redis 누적 데이터 ──► VoiceDailyEntity (voice_daily)
                      ├── GLOBAL 레코드: 전체 마이크/혼자시간/화면공유/카메라/deaf
                      └── 채널별 레코드: 채널 체류 시간/화면공유/카메라/deaf
```

### 유저 상세 페이지 데이터 흐름 (F-WEB-007)

```
[멤버 검색 — GET /api/guilds/:guildId/members/search?q= (F-VOICE-019)]
  1. voice_daily → PostgreSQL
       SELECT DISTINCT userId, userName
       WHERE guildId = ? AND userName LIKE '%q%'
       ORDER BY userName ASC
       LIMIT 20
  ※ 기존 테이블 조회만으로 처리. 새 테이블 불필요.

[유저별 음성 일별 통계 — GET /api/guilds/:guildId/voice/daily?userId= (F-VOICE-018)]
  1. voice_daily → PostgreSQL
       SELECT * WHERE guildId = ? AND date BETWEEN ? AND ? AND userId = ?
       인덱스: IDX_voice_daily_guild_user_date (guildId, userId, date)
  ※ F-VOICE-017에서 userId 조건 추가만으로 처리. 스키마 변경 없음.

[유저 입퇴장 이력 — GET /api/guilds/:guildId/voice/history/:userId (F-VOICE-020)]
  1. Member → PostgreSQL select WHERE discordMemberId = ? → memberId(PK) 획득
  2. VoiceChannelHistory → PostgreSQL
       SELECT vch.id, ch.discordChannelId, ch.channelName, ch.categoryId, ch.categoryName, vch.joinAt, vch.leftAt
       FROM voice_channel_history vch
       JOIN channel ch ON ch.id = vch.channelId AND ch.guildId = ?
       WHERE vch.memberId = ?
         [AND vch.joinAt BETWEEN ? AND ?]
       ORDER BY vch.joinAt DESC
       LIMIT ? OFFSET ?
  3. COUNT(*) 쿼리로 total 건수 조회 (페이지네이션용)
  인덱스: IDX_voice_channel_history_member_join (memberId, joinAt DESC) — VoiceChannelHistory 필터+정렬 커버
          IDX_channel_guild (guildId) — Channel 조인 조건 커버
  ※ Channel 테이블에 guildId 컬럼 추가 필요 (마이그레이션 필요).
```

### Newbie 라이프사이클

```
[신규 멤버 가입 — guildMemberAdd 이벤트]
  1. newbie:config:{guildId} → Redis get (설정 캐시 조회, 미스 시 DB)
  2. NewbieConfig → PostgreSQL select (캐시 미스 시 조회 후 Redis set, TTL 1h)

  [환영인사 — welcomeEnabled = true]
  3. Discord API → 환영 채널에 Embed 메시지 전송

  [미션 생성 — missionEnabled = true]
  4. NewbieMission → PostgreSQL insert (guildId, memberId, memberName, startDate, endDate, targetPlaytimeSec, status='IN_PROGRESS')
  5. newbie:mission:active:{guildId} → Redis delete (캐시 무효화)

  [신입기간 역할 부여 — roleEnabled = true]
  6. Discord API → 신규 멤버에게 newbieRoleId 역할 부여
  7. NewbiePeriod → PostgreSQL insert (guildId, memberId, startDate, expiresDate, isExpired=false)
  8. newbie:period:active:{guildId} → Redis delete (캐시 무효화)

[모코코 사냥 측정 — voiceStateUpdate 이벤트]
  1. newbie:period:active:{guildId} → Redis get (신입기간 활성 멤버 집합 조회, 미스 시 DB)
  2. NewbiePeriod → PostgreSQL select WHERE guildId=? AND isExpired=false (IDX_newbie_period_guild_active 활용, Redis SADD, TTL 1h)
  3. 채널 내 신규사용자(IN_PROGRESS 미션 보유) 존재 여부 확인
  4. newbie:moco:total:{guildId}:{hunterId} → Redis HINCRBY (신규사용자별 사냥 시간 누적, 분 단위)
  5. newbie:moco:rank:{guildId} → Redis ZINCRBY (사냥꾼 총 사냥 시간 갱신)

[미션 만료 스케줄러 — 매일 자정]
  1. NewbieMission → PostgreSQL select WHERE status='IN_PROGRESS' AND endDate < today (IDX_newbie_mission_status_end_date 활용)
  2. VoiceDailyEntity → PostgreSQL select SUM(channelDurationSec) (startDate~endDate, channelId != 'GLOBAL')
  3. 목표 달성 여부 판별 → NewbieMission → PostgreSQL update (status='COMPLETED' 또는 'FAILED')
  4. newbie:mission:active:{guildId} → Redis delete (캐시 무효화)

[신입기간 만료 스케줄러 — 매일 자정]
  1. NewbiePeriod → PostgreSQL select WHERE isExpired=false AND expiresDate < today (IDX_newbie_period_expires 활용)
  2. Discord API → 해당 멤버의 신입 역할 제거
  3. NewbiePeriod → PostgreSQL update (isExpired=true)
  4. newbie:period:active:{guildId} → Redis delete (캐시 무효화)

[웹 대시보드 설정 저장 — NewbieConfig]
  1. NewbieConfig → PostgreSQL upsert (guildId 기준)
  2. newbie:config:{guildId} → Redis set (설정 캐시 갱신, TTL 1h)

[웹 대시보드 설정 저장 — NewbieMissionTemplate]
  1. 허용 변수 유효성 검사 (백엔드) → 실패 시 400 응답
  2. NewbieMissionTemplate → PostgreSQL upsert (guildId 기준)
     - 레코드 없음: INSERT (id, guildId, titleTemplate, headerTemplate, itemTemplate, footerTemplate, statusMapping, createdAt, updatedAt)
     - 레코드 있음: UPDATE (titleTemplate, headerTemplate, itemTemplate, footerTemplate, statusMapping, updatedAt)

[웹 대시보드 설정 저장 — NewbieMocoTemplate]
  1. 허용 변수 유효성 검사 (백엔드) → 실패 시 400 응답
  2. NewbieMocoTemplate → PostgreSQL upsert (guildId 기준)
     - 레코드 없음: INSERT (id, guildId, titleTemplate, bodyTemplate, itemTemplate, footerTemplate, createdAt, updatedAt)
     - 레코드 있음: UPDATE (titleTemplate, bodyTemplate, itemTemplate, footerTemplate, updatedAt)
```

### Status Prefix 라이프사이클

```
[웹 설정 저장 — POST /api/guilds/{guildId}/status-prefix/config]
  1. status_prefix_config → PostgreSQL upsert (guildId 기준)
  2. status_prefix_button → PostgreSQL delete WHERE configId = ? (기존 버튼 전체 삭제)
  3. status_prefix_button → PostgreSQL insert (요청 버튼 목록 일괄 삽입, sortOrder 순서 반영)
  4. status_prefix:config:{guildId} → Redis set (설정 캐시 갱신, TTL 1h)
  5. enabled = true 인 경우:
     - Discord API → channelId 채널 조회
     - messageId 존재 시 → Discord API 기존 메시지 edit (Embed + 버튼 ActionRow)
     - messageId 없을 시 → Discord API 신규 메시지 send
     - status_prefix_config.messageId → PostgreSQL update (Discord message ID 저장)

[버튼 클릭 — 접두사 적용 (customId: status_prefix:{buttonId})]
  1. status_prefix_button → PostgreSQL select WHERE id = {buttonId} (label, prefix, type 확인)
  2. status_prefix:original:{guildId}:{memberId} → Redis get (원래 닉네임 조회)
     - 값 없음: Discord API → 현재 멤버 닉네임 조회 후
               status_prefix:original:{guildId}:{memberId} → Redis SET NX (원래 닉네임 저장, 덮어쓰지 않음)
     - 값 있음: 기존 저장값 유지
  3. status_prefix:config:{guildId} → Redis get (캐시 조회, 미스 시 DB)
     - 캐시 미스: status_prefix_config → PostgreSQL select WHERE guildId = ? → Redis set (TTL 1h)
  4. prefixTemplate 적용 → 새 닉네임 생성 (예: `[관전] 동현`)
  5. Discord API → GuildMember.setNickname(newNickname)
  6. Discord API → Ephemeral 성공 응답

[버튼 클릭 — 원래대로 복원 (customId: status_reset:{buttonId})]
  1. status_prefix:original:{guildId}:{memberId} → Redis get (원래 닉네임 조회)
  2. 값 없음: Discord API → Ephemeral 응답 (`변경된 닉네임이 없습니다.`) 후 종료
  3. 값 있음:
     - Discord API → GuildMember.setNickname(originalNickname)
     - status_prefix:original:{guildId}:{memberId} → Redis delete
     - Discord API → Ephemeral 성공 응답

[음성 채널 퇴장 — voiceStateUpdate 이벤트 연계]
  1. status_prefix:config:{guildId} → Redis get (캐시 조회, 미스 시 DB)
     - 캐시 미스: status_prefix_config → PostgreSQL select WHERE guildId = ? → Redis set (TTL 1h)
  2. enabled = false 이면 처리 중단
  3. status_prefix:original:{guildId}:{memberId} → Redis get (원래 닉네임 조회)
  4. 값 없음: 처리 중단 (닉네임 변경 이력 없음)
  5. 값 있음:
     - Discord API → GuildMember.setNickname(originalNickname)
     - status_prefix:original:{guildId}:{memberId} → Redis delete
```

### Sticky Message 라이프사이클

```
[웹 설정 저장 — POST /api/guilds/{guildId}/sticky-message]
  1. sticky_message_config → PostgreSQL upsert (id 기준 — 신규 또는 수정)
  2. sticky_message:config:{guildId} → Redis set (설정 캐시 갱신, TTL 1h)
  3. enabled = true 이면:
     - 기존 messageId 존재 시 → Discord API: 채널에서 기존 고정메세지 삭제 시도 (실패 시 계속)
     - Discord API: 대상 channelId에 Embed 메시지 신규 전송
     - sticky_message_config.messageId → PostgreSQL update (새 Discord 메시지 ID 저장)

[웹 설정 삭제 — DELETE /api/guilds/{guildId}/sticky-message/{id}]
  1. sticky_message_config → PostgreSQL select (messageId, channelId 조회)
  2. messageId 존재 시 → Discord API: 채널에서 고정메세지 삭제 시도 (실패 시 계속)
  3. sticky_message_config → PostgreSQL delete WHERE id = ?
  4. sticky_message:config:{guildId} → Redis delete (캐시 무효화)

[messageCreate 이벤트 — 디바운스 재전송]
  1. message.author.bot = true → 처리 중단 (봇 메시지 무시)
  2. sticky_message:config:{guildId} → Redis get (캐시 조회)
     - 캐시 미스: sticky_message_config → PostgreSQL select WHERE guildId = ? → Redis set (TTL 1h)
  3. 해당 channelId에 enabled = true 설정 없음 → 처리 중단
  4. sticky_message:debounce:{channelId} → Redis set (키 존재 시 TTL 3초 리셋, 없으면 신규 설정)
  5. 3초 후 (TTL 만료 기반) StickyMessageRefreshService 실행:
     - sticky_message_config → PostgreSQL select WHERE guildId = ? AND channelId = ? AND enabled = true ORDER BY sortOrder ASC
     - 각 설정에 대해 (sortOrder 순):
       a. messageId 존재 시 → Discord API: 메시지 삭제 (실패 시 계속)
       b. Discord API: Embed 메시지 신규 전송
       c. sticky_message_config.messageId → PostgreSQL update (새 Discord 메시지 ID 저장)

[슬래시 커맨드 — /고정메세지목록]
  1. sticky_message_config → PostgreSQL select WHERE guildId = ? ORDER BY sortOrder ASC
  2. Discord API → Ephemeral Embed 목록 응답

[슬래시 커맨드 — /고정메세지삭제 (채널 선택)]
  1. sticky_message_config → PostgreSQL select WHERE guildId = ? AND channelId = ?
  2. 설정 없음 → Discord API: Ephemeral 응답 후 종료
  3. 설정 있음:
     - 각 설정의 messageId로 Discord API: 메시지 삭제 시도 (실패 시 계속)
     - sticky_message_config → PostgreSQL delete WHERE guildId = ? AND channelId = ?
     - sticky_message:config:{guildId} → Redis delete (캐시 무효화)
     - Discord API → Ephemeral 성공 응답
```

### 자동방 라이프사이클

```
[웹 설정 저장]
  1. auto_channel_config → PostgreSQL upsert (guildId, triggerChannelId, 템플릿, 안내 메시지)
  2. auto_channel_button → PostgreSQL insert/replace (configId, label, emoji, targetCategoryId, sortOrder)
  3. auto_channel_sub_option → PostgreSQL insert/replace (buttonId, label, emoji, channelSuffix, sortOrder)
  4. Discord API → 트리거 채널에 안내 메시지 전송 또는 수정
  5. auto_channel_config.guideMessageId → PostgreSQL update (Discord message ID 저장)

[트리거 채널 입장 — 대기방 생성]
  1. auto_channel_config → PostgreSQL 조회 (AutoChannelConfigRepository.findByTriggerChannel)
  2. Discord API → 대기방 음성 채널 생성 (waitingRoomTemplate 적용)
  3. Discord API → 사용자를 대기방으로 이동
  4. auto_channel:waiting:{channelId} → Redis set (guildId, userId, triggerChannelId, configId, TTL 12h)
  ※ VoiceChannelHistory 미생성 (세션 추적 제외)

[버튼 클릭 — 하위 선택지 없음 또는 하위 선택지 선택 완료 — 확정방 전환]
  1. auto_channel:waiting:{channelId} → Redis get (대기방 소유자 확인)
  2. Discord API → 대기방 채널명·카테고리 변경 (삭제+재생성 아님)
  3. auto_channel:waiting:{channelId} → Redis delete
  4. auto_channel:confirmed:{channelId} → Redis set (guildId, userId, configId, buttonId, subOptionId?, TTL 12h)
  5. Member/Channel → PostgreSQL upsert (F-VOICE-001과 동일)
  6. VoiceChannelHistory → PostgreSQL insert (joinAt, 확정방부터 세션 추적 시작)
  7. voice:session:{guildId}:{userId} → Redis set (TTL 12h)

[모든 사용자 퇴장 — 채널 삭제]
  대기방:
    1. auto_channel:waiting:{channelId} → Redis get & delete
    2. Discord API → 채널 즉시 삭제
  확정방:
    1. voice:session:{guildId}:{userId} → Redis get & delete
    2. VoiceChannelHistory → PostgreSQL update (leftAt)
    3. Redis duration keys에 시간 누적 → VoiceDailyEntity upsert (F-VOICE-002와 동일)
    4. auto_channel:confirmed:{channelId} → Redis delete
    5. Discord API → 채널 즉시 삭제
```

### Inactive Member 라이프사이클

```
[비활동 분류 스케줄러 — @Cron('0 0 * * *') KST 00:00]
  1. inactive_member_config → PostgreSQL select (전체 길드 설정 조회)
     - 설정이 없는 길드는 기본값으로 자동 생성 후 처리
  2. 각 길드별 처리:
     a. voice_daily → PostgreSQL
          SELECT userId, SUM(channelDurationSec) AS totalSec
          WHERE guildId = ? AND date BETWEEN [periodStart] AND [periodEnd]
            AND channelId != 'GLOBAL'
          GROUP BY userId
        → 현재 기간 총 음성 접속 시간(초) 집계
     b. voice_daily → PostgreSQL
          SELECT userId, SUM(channelDurationSec) AS prevTotalSec
          WHERE guildId = ? AND date BETWEEN [prevPeriodStart] AND [prevPeriodEnd]
            AND channelId != 'GLOBAL'
          GROUP BY userId
        → 직전 동일 길이 기간 집계 (DECLINING 판정용)
     c. voice_daily → PostgreSQL
          SELECT userId, MAX(date) AS lastVoiceDate
          WHERE guildId = ? AND date BETWEEN [periodStart] AND [periodEnd]
            AND channelId != 'GLOBAL'
          GROUP BY userId
        → 마지막 음성 접속 날짜 조회
     d. Discord API → guild.members.fetch() (excludedRoleIds 보유 회원 목록 조회 및 제외 처리)
     e. 등급 결정 (우선순위: FULLY_INACTIVE > LOW_ACTIVE > DECLINING):
        - totalMinutes = 0 → FULLY_INACTIVE
        - 0 < totalMinutes < lowActiveThresholdMin → LOW_ACTIVE
        - prevTotalMinutes > 0 AND (prevTotalMinutes - totalMinutes) / prevTotalMinutes >= decliningPercent / 100 → DECLINING
        - 위 조건 미충족 → NULL (활동 상태)
     f. inactive_member_record → PostgreSQL upsert (guildId, userId 복합 유니크 기준)
        ON CONFLICT (guildId, userId) DO UPDATE SET
          grade = EXCLUDED.grade,
          totalMinutes = EXCLUDED.totalMinutes,
          prevTotalMinutes = EXCLUDED.prevTotalMinutes,
          lastVoiceDate = EXCLUDED.lastVoiceDate,
          gradeChangedAt = CASE WHEN grade != EXCLUDED.grade THEN now() ELSE gradeChangedAt END,
          classifiedAt = now(),
          updatedAt = now()
  3. 자동 조치 실행 (autoActionEnabled = true인 길드에 한해):
     a. inactive_member_record → PostgreSQL select
          WHERE guildId = ? AND grade = 'FULLY_INACTIVE'
            AND gradeChangedAt >= [이번 스케줄러 실행 시각 - 여유 범위]
        → 이번 실행에서 새로 FULLY_INACTIVE 판정된 회원 조회
     b. autoRoleAdd = true 인 경우:
        - Discord API → guild.members.addRole(inactiveRoleId) 일괄 호출
        - inactive_member_action_log → PostgreSQL insert
            (guildId, actionType='ACTION_ROLE_ADD', targetUserIds, executorUserId=NULL,
             successCount, failCount, executedAt)
     c. autoDm = true 인 경우:
        - Discord API → user.send(dmEmbed) 일괄 호출 (DM 거부 시 failCount 증가, 계속 진행)
        - inactive_member_action_log → PostgreSQL insert
            (guildId, actionType='ACTION_DM', targetUserIds, executorUserId=NULL,
             successCount, failCount, executedAt)

[웹 대시보드 — 비활동 회원 목록 조회]
  GET /api/guilds/{guildId}/inactive-members
  1. inactive_member_config → PostgreSQL select WHERE guildId = ? (설정 조회, 없으면 기본값 생성)
  2. inactive_member_record → PostgreSQL
       SELECT r.userId, r.grade, r.totalMinutes, r.lastVoiceDate, r.gradeChangedAt, r.classifiedAt
       FROM inactive_member_record r
       [JOIN을 통한 닉네임 조회: voice_daily.userName 또는 Discord API 캐시]
       WHERE r.guildId = ?
         [AND r.grade = ?]       -- grade 필터
         [AND m.userName LIKE ?] -- 닉네임 검색
       ORDER BY r.lastVoiceDate [ASC|DESC] | r.totalMinutes [ASC|DESC]
       LIMIT ? OFFSET ?
     인덱스: IDX_inactive_member_record_guild_grade (grade 필터 시)
             IDX_inactive_member_record_guild_last_voice (lastVoiceDate 정렬 시)

[웹 대시보드 — 비활동 통계 조회]
  GET /api/guilds/{guildId}/inactive-members/stats
  1. inactive_member_record → PostgreSQL
       SELECT grade, COUNT(*) AS cnt
       FROM inactive_member_record
       WHERE guildId = ?
       GROUP BY grade
     → activeCount(NULL), fullyInactiveCount, lowActiveCount, decliningCount 집계
  2. inactive_member_record → PostgreSQL
       SELECT COUNT(*) AS returnedCount
       FROM inactive_member_record
       WHERE guildId = ? AND grade IS NULL
         AND gradeChangedAt >= [직전 스케줄러 실행 시각]
     → 직전 실행 대비 활동 복귀 회원 수
  3. inactive_member_record → PostgreSQL
       SELECT DATE(classifiedAt) AS date, grade, COUNT(*) AS cnt
       FROM inactive_member_record
       WHERE guildId = ?
         AND classifiedAt >= [추이 조회 시작일]
       GROUP BY DATE(classifiedAt), grade
       ORDER BY date ASC
     → 등급별 추이 데이터

[웹 대시보드 — 조치 실행]
  POST /api/guilds/{guildId}/inactive-members/actions
  1. inactive_member_config → PostgreSQL select WHERE guildId = ?
     - ACTION_ROLE_ADD 요청 시 inactiveRoleId 없으면 404 응답
     - ACTION_ROLE_REMOVE 요청 시 removeRoleId 없으면 404 응답
  2. 조치 유형에 따라 Discord API 일괄 호출:
     - ACTION_DM: user.send(dmEmbed) — DM 거부 시 failCount++, 계속 진행
     - ACTION_ROLE_ADD: guild.members.addRole(inactiveRoleId)
     - ACTION_ROLE_REMOVE: guild.members.removeRole(removeRoleId)
  3. inactive_member_action_log → PostgreSQL insert
       (guildId, actionType, targetUserIds, executorUserId, successCount, failCount, executedAt)
  4. logId 포함하여 응답 반환

[웹 대시보드 — 조치 이력 조회]
  GET /api/guilds/{guildId}/inactive-members/action-logs
  1. inactive_member_action_log → PostgreSQL
       SELECT * FROM inactive_member_action_log
       WHERE guildId = ?
       ORDER BY executedAt DESC
       LIMIT ? OFFSET ?
     인덱스: IDX_inactive_action_log_guild_executed (guildId, executedAt DESC)

[웹 설정 저장 — InactiveMemberConfig]
  PUT /api/guilds/{guildId}/inactive-member-config
  1. inactive_member_config → PostgreSQL upsert (guildId 기준)
       ON CONFLICT (guildId) DO UPDATE SET [변경 필드], updatedAt = now()
  2. 갱신된 InactiveMemberConfig 전체 필드 반환

[웹 설정 조회 — InactiveMemberConfig]
  GET /api/guilds/{guildId}/inactive-member-config
  1. inactive_member_config → PostgreSQL select WHERE guildId = ?
     - 레코드 없음: 기본값으로 INSERT 후 반환
     - 레코드 있음: 전체 필드 반환
```

### 게임 활동 라이프사이클 (Phase 2)

```
[음성 입장 시 게임 상태 수집 — F-VOICE-028]
  1. VoiceJoinHandler → member.presence.activities 조회
  2. ActivityType.Playing 필터로 gameName, applicationId 추출
  3. 게임 감지 시:
     voice:game:session:{guildId}:{userId} → Redis set (TTL 24h)
     값: { gameName, applicationId, startedAt: now, channelId }
  4. 게임 없으면 → 처리 없음

[CoPresenceScheduler 60초 틱에서 게임 상태 갱신 — F-VOICE-029]
  1. 음성 채널 순회 중 각 멤버 member.presence.activities 조회
  2. voice:game:session:{guildId}:{userId} → Redis get (현재 세션 조회)
  3. 상태 비교:
     - 새 게임 시작 (Redis 세션 없음 + 현재 게임 감지):
         voice:game:session:{guildId}:{userId} → Redis set (TTL 24h)
     - 게임 전환 (현재 게임 != Redis 세션 gameName):
         이전 세션 → F-VOICE-031 종료 처리
         voice:game:session:{guildId}:{userId} → Redis set (새 게임, TTL 24h)
     - 게임 종료 (현재 게임 없음 + Redis 세션 있음):
         F-VOICE-031 종료 처리
         voice:game:session:{guildId}:{userId} → Redis delete
     - 게임 계속 (현재 게임 == Redis 세션): 무처리

[음성 퇴장 시 게임 세션 종료 — F-VOICE-030]
  1. VoiceLeaveHandler → voice:game:session:{guildId}:{userId} → Redis get
  2. 세션 있으면 → F-VOICE-031 종료 처리
  3. voice:game:session:{guildId}:{userId} → Redis delete

[게임 세션 종료 처리 및 저장 — F-VOICE-031]
  1. voice:game:session:{guildId}:{userId} → Redis get
     (gameName, applicationId, startedAt, channelId 추출)
  2. durationMin = Math.floor((now - startedAt) / 60000) 계산
  3. durationMin < 1 이면 → DB 저장 없이 종료 (1분 미만 세션 무시)
  4. durationMin >= 1 이면:
     a. voice_game_activity → PostgreSQL INSERT
          (guildId, userId, channelId, gameName, applicationId,
           startedAt, endedAt=now, durationMin, createdAt=now)
     b. voice_game_daily → PostgreSQL UPSERT
          ON CONFLICT (guildId, userId, gameName, date)
          DO UPDATE SET totalMinutes += durationMin, sessionCount += 1

[게임 활동 90일 자동 삭제 — 매일 04:00 KST (기존 보존 스케줄러)]
  voice_game_activity → PostgreSQL DELETE WHERE startedAt < (now - 90일)
  ※ voice_game_daily는 영구 보존 (삭제 안 함)
```

### Voice Co-Presence 라이프사이클

```
[60초 폴링 — CoPresenceScheduler.tick()]
  1. Discord Client → client.guilds.cache 순회
  2. 각 길드의 음성 채널 순회
     - VoiceExcludedChannelService.isExcludedChannel() → 제외 채널 필터링
     - 채널당 2명 이상의 봇 아닌 사용자가 있는 경우만 처리
  3. 채널별 사용자 목록 스냅샷 생성
  4. CoPresenceService.reconcile(snapshots) → 세션 시작/계속/종료 판정
  5. EventEmitter2.emit('co-presence.tick', { snapshots }) — fire-and-forget
     - MocoEventHandler.handleTick() → 모코코 조건 판정 + Redis 실시간 누적

[세션 시작 — 사용자가 새로 채널에 합류]
  1. 인메모리 ActiveCoPresenceSession 생성

[세션 계속 — 이전 tick에도 같은 채널에 있던 사용자]
  1. 인메모리 accumulatedMinutes +1, peerMinutes 갱신

[세션 종료 — 사용자가 채널을 떠나거나, 채널에 1명만 남은 시점]
  1. voice_co_presence_session → PostgreSQL insert (peerIds, peerMinutes 포함)
  2. voice_co_presence_daily → PostgreSQL upsert (channelMinutes, sessionCount 누적)
  3. voice_co_presence_pair_daily → PostgreSQL 배치 upsert (양방향 N-1쌍을 단일 쿼리로)
  4. EventEmitter2.emitAsync('co-presence.session.ended', event) — 모든 핸들러 await 완료
     - MocoEventHandler.handleSessionEnded() → 모코코 조건 판정 + DB/Redis 처리

[모코코 리셋 — MocoResetScheduler.resetGuild()]
  1. CoPresenceScheduler.flushGuildSessions(guildId) → CoPresenceService.endAllGuildSessions()
     - 해당 길드의 모든 활성 세션 강제 종료 (위 [세션 종료] 플로우 수행)
     - emitAsync() 완료 대기 → MocoEventHandler 처리 완료 보장
  2. Redis moco:* 키 삭제 (정합성 보장됨)

[봇 종료 — onApplicationShutdown]
  1. 모든 활성 세션 강제 종료 (위 [세션 종료] 플로우 수행)

[봇 시작 — onApplicationBootstrap]
  1. 인메모리 세션 맵 초기화, Discord ready 후 첫 tick에서 자연스럽게 새 세션 시작

[90일 초과 세션 정리 — @Cron('0 0 15 * * *') UTC 15:00 = KST 00:00]
  1. voice_co_presence_session → PostgreSQL delete WHERE endedAt < (now - 90일)
  ※ voice_co_presence_daily, voice_co_presence_pair_daily는 영구 보존

[관계 분석 대시보드 — GET /api/guilds/:guildId/co-presence/* (F-COPRESENCE-007~013)]
  ※ 읽기 전용. DB 스키마 변경 없음. 기존 인덱스로 모든 쿼리 패턴 커버.

  /summary (F-COPRESENCE-007)
    1. voice_co_presence_pair_daily → COUNT(DISTINCT userId) WHERE guildId + date BETWEEN
       인덱스: IDX_copresence_pair_guild_date
    2. voice_co_presence_daily → SUM(channelMinutes) WHERE guildId + date BETWEEN
       인덱스: IDX_copresence_daily_guild_date

  /graph (F-COPRESENCE-008)
    1. voice_co_presence_daily → GROUP BY userId, SUM(channelMinutes) DESC LIMIT 50 WHERE guildId + date BETWEEN
       인덱스: IDX_copresence_daily_guild_date
    2. voice_co_presence_pair_daily → WHERE guildId + date BETWEEN AND userId IN (...상위50명...)
       인덱스: IDX_copresence_pair_guild_date

  /top-pairs (F-COPRESENCE-009)
    1. voice_co_presence_pair_daily → WHERE guildId + date BETWEEN AND userId < peerId
         GROUP BY (userId, peerId) ORDER BY SUM(minutes) DESC LIMIT N
       인덱스: IDX_copresence_pair_guild_date (guildId+date 필터 후 행 레벨 userId < peerId 필터)

  /isolated (F-COPRESENCE-010)
    1. voice_co_presence_daily → WHERE guildId + date BETWEEN AND channelMinutes > 0
       인덱스: IDX_copresence_daily_guild_date
    2. NOT EXISTS: voice_co_presence_pair_daily WHERE guildId + userId (= Daily의 userId) AND date BETWEEN
       인덱스: IDX_copresence_pair_guild_user_date

  /pairs (F-COPRESENCE-011)
    1. voice_co_presence_pair_daily → WHERE guildId + date BETWEEN AND userId < peerId
         ORDER BY SUM(minutes) DESC, LIMIT/OFFSET (페이지네이션)
       인덱스: IDX_copresence_pair_guild_date
    2. userName 검색 시: voice_daily JOIN → userName LIKE '%search%' WHERE guildId + userId
       인덱스: IDX_voice_daily_guild_user_date

  /daily-trend (F-COPRESENCE-012)
    1. voice_co_presence_daily → GROUP BY date, SUM(channelMinutes)/2 WHERE guildId + date BETWEEN
       인덱스: IDX_copresence_daily_guild_date

  /pair-detail (F-COPRESENCE-013)
    1. voice_co_presence_pair_daily → WHERE guildId + userId IN (A,B) AND peerId IN (A,B) AND date BETWEEN
         GROUP BY date ORDER BY date
       인덱스: PK (guildId, userId, peerId, date)
```

### 음악 채널 라이프사이클

```
[웹 설정 저장 — POST /api/guilds/:guildId/music-channel-config]
  1. music_channel_config → PostgreSQL insert (guildId, channelId, embedTitle, embedDescription,
       embedColor, embedThumbnailUrl, buttonConfig, enabled)
  2. enabled = true 인 경우:
     a. Bot API → MusicChannelService.upsertEmbed(guildId)
        - Discord API → channelId 채널 조회
        - messageId 없음: Discord API → 고정 임베드 메시지 신규 전송
        - messageId 있음: Discord API → 기존 메시지 edit
        - 전송/수정 성공: music_channel_config.messageId → PostgreSQL update (Discord message ID 저장)
        - 전송/수정 실패: messageId → NULL (채널/메시지 삭제 등)

[웹 설정 수정 — PATCH /api/guilds/:guildId/music-channel-config]
  1. music_channel_config → PostgreSQL update WHERE guildId = ? (변경 필드, updatedAt)
  2. enabled = true 인 경우: 위 POST 플로우의 2번과 동일 (messageId 유무에 따라 edit 또는 send)
  3. enabled = false 인 경우: 임베드 전송/수정 없음 (기존 메시지 삭제 안 함)

[웹 설정 조회 — GET /api/guilds/:guildId/music-channel-config]
  1. music_channel_config → PostgreSQL select WHERE guildId = ?
     인덱스: UQ_music_channel_config_guild (단건 조회)

[웹 설정 삭제 — DELETE /api/guilds/:guildId/music-channel-config]
  1. music_channel_config → PostgreSQL select WHERE guildId = ? (messageId, channelId 조회)
  2. messageId 존재 시 → Discord API: 메시지 삭제 시도 (실패 시 계속)
  3. music_channel_config → PostgreSQL delete WHERE guildId = ?

[Kazagumo 이벤트 — 임베드 실시간 갱신 (F-MUSIC-017)]
  playerStart 이벤트 (곡 시작):
    1. music_channel_config → PostgreSQL select WHERE guildId = ? AND enabled = true (messageId 조회)
       인덱스: UQ_music_channel_config_guild
    2. messageId 있음: Discord API → 재생 중 임베드로 메시지 edit
    3. Discord API 실패 (채널/메시지 삭제 등):
       music_channel_config.messageId → PostgreSQL update NULL WHERE guildId = ?

  playerEmpty 이벤트 (큐 소진):
    1. music_channel_config → PostgreSQL select WHERE guildId = ? AND enabled = true
    2. messageId 있음: Discord API → 대기 상태 임베드로 메시지 edit (커스텀 제목/설명/색상 적용)
    3. Discord API 실패: messageId → PostgreSQL update NULL

  playerPause / playerResume 이벤트:
    1. music_channel_config → PostgreSQL select WHERE guildId = ? AND enabled = true
    2. messageId 있음: Discord API → 상태 텍스트만 갱신 (메시지 edit)
    3. Discord API 실패: messageId → PostgreSQL update NULL

[버튼 클릭 — search (F-MUSIC-011)]
  1. Discord API → Modal 팝업 (검색어 입력)
  2. 모달 제출: Kazagumo → 트랙 검색 → MusicService.play()
  ※ DB 접근 없음 (인메모리 큐 조작)

[버튼 클릭 — melon_chart (F-MUSIC-014)]
  1. music:chart:melon → Redis get (캐시 조회)
  2. 캐시 미스: ChartCrawlerService → 멜론 인기차트 TOP 20 크롤링
              → music:chart:melon → Redis set (TTL 1시간)
  3. 곡명+아티스트 조합 → Kazagumo 검색 → MusicService.playBulk()
  ※ 성공 여부와 무관하게 music_channel_config DB 접근 없음

[버튼 클릭 — billboard_chart (F-MUSIC-015)]
  1. music:chart:billboard → Redis get (캐시 조회)
  2. 캐시 미스: ChartCrawlerService → 빌보드 HOT 100 TOP 20 크롤링
              → music:chart:billboard → Redis set (TTL 1시간)
  3. 곡명+아티스트 조합 → Kazagumo 검색 → MusicService.playBulk()

[텍스트 메시지 수신 — 음악 전용 채널 자동 검색 (F-MUSIC-016)]
  messageCreate 이벤트:
    1. music_channel_config → PostgreSQL select WHERE enabled = true
       (전체 조회 후 channelId 비교, 또는 캐시 활용)
    2. message.channelId 가 music_channel_config.channelId 와 일치 여부 확인
    3. 봇 메시지이면 처리 중단
    4. 일치: Discord API → 사용자 원본 메시지 삭제
             Kazagumo → 메시지 내용을 검색어로 트랙 검색 → MusicService.play()
```

---

## 자가진단 (Self-Diagnosis) 도메인

### voice_health_config

길드별 자가진단 정책 및 뱃지 임계값을 저장한다.

| 컬럼 | 타입 | 제약조건 | 기본값 | 설명 |
|------|------|----------|--------|------|
| `id` | `int` | PK, AUTO_INCREMENT | — | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | — | 디스코드 서버 ID |
| `isEnabled` | `boolean` | NOT NULL | `false` | 자가진단 기능 활성화 |
| `analysisDays` | `int` | NOT NULL | `30` | 분석 기간 (일) |
| `isCooldownEnabled` | `boolean` | NOT NULL | `true` | 쿨다운 활성화 여부 |
| `cooldownHours` | `int` | NOT NULL | `24` | 실행 쿨다운 (시간) |
| `isLlmSummaryEnabled` | `boolean` | NOT NULL | `false` | AI 종합 진단 포함 여부 |
| `minActivityMinutes` | `int` | NOT NULL | `600` | 정책: 최소 총 활동 시간(분) |
| `minActiveDaysRatio` | `decimal(3,2)` | NOT NULL | `0.50` | 정책: 최소 활동일 비율 |
| `hhiThreshold` | `decimal(3,2)` | NOT NULL | `0.30` | 정책: HHI 편중도 경고 임계값 |
| `minPeerCount` | `int` | NOT NULL | `3` | 정책: 최소 교류 인원 수 |
| `badgeActivityTopPercent` | `int` | NOT NULL | `10` | 뱃지: 활동왕 상위 N% |
| `badgeSocialHhiMax` | `decimal(3,2)` | NOT NULL | `0.25` | 뱃지: 사교왕 HHI 상한 |
| `badgeSocialMinPeers` | `int` | NOT NULL | `5` | 뱃지: 사교왕 최소 교류 인원 |
| `badgeHunterTopPercent` | `int` | NOT NULL | `10` | 뱃지: 헌터 상위 N% |
| `badgeConsistentMinRatio` | `decimal(3,2)` | NOT NULL | `0.80` | 뱃지: 꾸준러 최소 활동일 비율 |
| `badgeMicMinRate` | `decimal(3,2)` | NOT NULL | `0.70` | 뱃지: 소통러 최소 마이크 사용률 |
| `createdAt` | `timestamp` | NOT NULL | `now()` | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL | `now()` | 수정일 |

**인덱스**: `UQ_voice_health_config_guild` — `UNIQUE(guildId)`

### voice_health_badge

사용자별 보유 뱃지 및 지표 스냅샷을 저장한다. 매일 00:30 KST 배치 재계산.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `guildId` | `varchar` | PK 구성 | 디스코드 서버 ID |
| `userId` | `varchar` | PK 구성 | 멤버 디스코드 ID |
| `badges` | `json` | NOT NULL, DEFAULT `[]` | 보유 뱃지 코드 배열 |
| `activityRank` | `int` | NULLABLE | 활동량 순위 |
| `activityTopPercent` | `decimal(5,2)` | NULLABLE | 활동량 상위 % |
| `hhiScore` | `decimal(4,3)` | NULLABLE | HHI 지수 |
| `mocoRank` | `int` | NULLABLE | 모코코 순위 |
| `mocoTopPercent` | `decimal(5,2)` | NULLABLE | 모코코 상위 % |
| `micUsageRate` | `decimal(4,3)` | NULLABLE | 마이크 사용률 |
| `activeDaysRatio` | `decimal(3,2)` | NULLABLE | 활동일 비율 |
| `calculatedAt` | `timestamp` | NOT NULL | 마지막 계산 시각 |

**인덱스**: `UQ_voice_health_badge_guild_user` — `UNIQUE(guildId, userId)`

### Redis 키

| 키 | TTL | 설명 |
|----|-----|------|
| `voice-health:cooldown:{guildId}:{userId}` | `cooldownHours` (설정값) | 자가진단 쿨다운 |
| `voice-health:config:{guildId}` | 1시간 | VoiceHealthConfig 캐시 |
