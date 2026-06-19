# Co-Presence 베스트 프렌드/친밀도 백엔드 — 구현 계획

> 작성일: 2026-05-04
> 입력 PRD: `docs/specs/prd/voice-co-presence.md` (F-COPRESENCE-014, F-COPRESENCE-015, F-COPRESENCE-018)
> 공통 모듈 명세: `docs/specs/common-modules.md` Part D (D-1, D-2, D-4, D-5)
> 검토안: `docs/plans/best-friend-discord-feature.md` §2A, §5
> 선행 계획: `docs/plans/canvas-common-module.md` (Phase 0-A — `apps/api/src/common/canvas/` 추출)

---

## 1. 작업 목적

PRD F-COPRESENCE-014/015/018에 대응하는 **API 백엔드 구현**을 진행한다. 본 계획의 산출물은 다음과 같다.

1. `CoPresenceAnalyticsService`에 본인 시점 베스트 프렌드 조회(`getMyTopPeers`)와 두 사람 친밀도 조회(`getAffinity`) 메서드 추가
2. `BestFriendCardRenderer` / `AffinityCardRenderer` 신규 캔버스 렌더러
3. `bot-co-presence.controller.ts`에 베스트 프렌드 / 친밀도 PNG 응답 핸들러 2종 추가
4. `GuildCoPresenceConfigService` — 길드 단위 `allowPublicAffinityQuery` CRUD
5. `VoiceAiAnalysisService.generateBestFriendComment()` — Gemini 한 줄 코멘트 + 길드 일일 한도

본 계획은 **백엔드만** 다룬다. Bot 슬래시 커맨드 (`/best-friend`, `/affinity`), `libs/bot-api-client` 메서드 추가, 웹 사생활 페이지는 별도 계획에서 다룬다.

---

## 2. 작업 범위 (의존성 순서)

```
Phase 0 (선행) ──────────────────────────────────────────────
  [Phase 0-A]  apps/api/src/common/canvas/  ← canvas-common-module.md
  [Phase 0-B]  apps/api/src/user-privacy/   ← UserPrivacyConfigService 별도 PR (D-2)
  [Phase 0-C]  lru-cache 의존성 추가         ← apps/api/package.json

Phase 1 — 데이터 레이어 ─────────────────────────────────────
  1) CoPresenceAnalyticsService.getMyTopPeers()         (신규 메서드)
  2) CoPresenceAnalyticsService.getAffinity()           (신규 메서드, 기존 getPairDetail 위임)
  3) GuildCoPresenceConfigRepository / Service          (신규)
  4) CoPresenceModule providers/exports 확장

Phase 2 — 캔버스 렌더러 ─────────────────────────────────────
  5) BestFriendCardRenderer (application/)              (신규)
  6) AffinityCardRenderer  (application/)               (신규)

Phase 3 — AI 코멘트 ─────────────────────────────────────────
  7) VoiceAiAnalysisService.generateBestFriendComment() (신규 메서드)
     · Redis INCR friend:llm:quota:{guildId}:{YYYYMMDD}
     · Gemini 한 줄 코멘트, 실패 시 null

Phase 4 — bot-api 컨트롤러 ──────────────────────────────────
  8) bot-co-presence.controller.ts에 핸들러 2종 추가     (기존 파일 확장)
     POST /bot-api/co-presence/best-friends
     POST /bot-api/co-presence/affinity
  9) BotApiModule imports 갱신 (UserPrivacyModule 추가)
 10) 인메모리 LRU 캐시 (friend:card:{guildId}:{userId}:{period}, 5분)
```

> Phase 0-A / 0-B는 본 계획의 선행 PR이며, 본 계획에서는 그 결과물을 사용한다. Phase 0-C는 본 계획 범위 내(package.json 한 줄 추가)이다.

---

## 3. 변경 대상 파일

### 3.1. 신규 생성

| # | 파일 | 역할 |
|---|------|------|
| 1 | `apps/api/src/channel/voice/co-presence/application/best-friend-card-renderer.ts` | 베스트 프렌드 PNG 카드 렌더러 (800×~580) |
| 2 | `apps/api/src/channel/voice/co-presence/application/affinity-card-renderer.ts` | 친밀도 PNG 카드 렌더러 (800×~360) |
| 3 | `apps/api/src/channel/voice/co-presence/application/guild-co-presence-config.service.ts` | 길드 설정 조회/upsert |
| 4 | `apps/api/src/channel/voice/co-presence/infrastructure/guild-co-presence-config.repository.ts` | TypeORM Repository 래퍼 |
| 5 | `apps/api/src/channel/voice/co-presence/application/best-friend-card.types.ts` | `BestFriendCardData`, `TopPeerItem`, `AffinityCardData` 등 카드 입력 타입 |
| 6 | `apps/api/src/channel/voice/co-presence/application/best-friend-card.cache.ts` | 인메모리 LRU 캐시(5분) — `lru-cache` 래퍼 |
| 7 | `apps/api/src/channel/voice/co-presence/application/best-friend-llm-quota.ts` | LLM 일일 한도 카운터 (Redis 헬퍼) |

### 3.2. 수정

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` | `getMyTopPeers()`, `getAffinity()` 메서드 추가. 기존 메서드는 변경 금지 |
| 2 | `apps/api/src/channel/voice/co-presence/co-presence.module.ts` | TypeORM `GuildCoPresenceConfigOrm` 등록, 신규 provider/export 추가, `UserPrivacyModule`·`CommonCanvasModule`·`GuildMemberModule`·`VoiceAnalyticsModule` import |
| 3 | `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` | `@Post('best-friends')`, `@Post('affinity')` 핸들러 2종 추가. 기존 `snapshots` / `flush` 핸들러는 변경 금지 |
| 4 | `apps/api/src/bot-api/bot-api.module.ts` | `imports`에 `UserPrivacyModule` 추가 (이미 `CoPresenceModule` 포함). `BotCoPresenceController`는 이미 등록되어 있음 — 변경 없음 |
| 5 | `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts` | `generateBestFriendComment()` 메서드 추가 + `RedisService` 의존성 주입 |
| 6 | `apps/api/src/voice-analytics/voice-analytics.module.ts` | `RedisModule` import 확인/추가 (한도 카운터용) |
| 7 | `apps/api/package.json` | `lru-cache` ^11 의존성 추가 |

### 3.3. 변경 금지 (기존 파일/메서드 보존)

- `co-presence-analytics.service.ts`의 기존 메서드 7종 (`getSummary`, `getGraph`, `getTopPairs`, `getIsolated`, `getPairs`, `getDailyTrend`, `getPairDetail`) — 시그니처/구현 변경 금지
- `co-presence-analytics.controller.ts` — 본 계획 범위 외
- `bot-co-presence.controller.ts`의 기존 `snapshots` / `flush` 핸들러
- `UserPrivacyConfigOrm` 엔티티 (이미 마이그레이션 적용됨) — 정의 재선언 금지
- `GuildCoPresenceConfigOrm` 엔티티 (이미 마이그레이션 적용됨) — 정의 재선언 금지

---

## 4. 디렉터리 구조 (변경 후)

```
apps/api/src/
├─ channel/voice/co-presence/
│  ├─ co-presence-analytics.service.ts            (수정)
│  ├─ co-presence.module.ts                       (수정)
│  ├─ application/                                 (신규 디렉터리 ─ 본 계획에서 신설)
│  │  ├─ best-friend-card-renderer.ts             (신규)
│  │  ├─ affinity-card-renderer.ts                (신규)
│  │  ├─ guild-co-presence-config.service.ts      (신규)
│  │  ├─ best-friend-card.types.ts                (신규)
│  │  ├─ best-friend-card.cache.ts                (신규)
│  │  └─ best-friend-llm-quota.ts                 (신규)
│  └─ infrastructure/
│     ├─ guild-co-presence-config.orm-entity.ts   (기존, 변경 없음)
│     └─ guild-co-presence-config.repository.ts   (신규)
├─ bot-api/co-presence/
│  └─ bot-co-presence.controller.ts               (수정 ─ 핸들러 2종 추가)
├─ user-privacy/                                   (Phase 0-B 선행 PR 산출물)
│  └─ application/user-privacy-config.service.ts
├─ common/canvas/                                  (Phase 0-A 선행 PR 산출물)
│  ├─ canvas.module.ts
│  ├─ canvas-helpers.ts
│  ├─ canvas-format.ts
│  └─ canvas-palette.ts
└─ voice-analytics/
   └─ application/voice-ai-analysis.service.ts    (수정 ─ generateBestFriendComment 추가)
```

> 참고: 기존 `apps/api/src/channel/voice/co-presence/` 디렉터리에는 `application/` 하위가 아직 없다. `co-presence-analytics.service.ts`도 도메인 루트에 위치한다. 본 계획에서는 **신규 캔버스 렌더러·서비스만** `application/`으로 분리한다 (기존 파일 위치 변경 금지).

---

## 5. 메서드 시그니처 + 핵심 SQL

### 5.1. `CoPresenceAnalyticsService.getMyTopPeers()` — F-COPRESENCE-014

```typescript
export interface TopPeerItem {
  userId: string;            // peer의 userId (익명 시에도 내부적으로 보존하지 않고 호출자가 익명화)
  displayName: string;       // GuildMember.displayName (익명화 시 '???')
  avatarUrl: string | null;  // 익명화 시 null
  totalMinutes: number;
  sessionCount: number;
  isAnonymous: boolean;      // UserPrivacyConfig.disableRelationshipShare = true
}

async getMyTopPeers(
  guildId: string,
  userId: string,
  days: number,
  limit: number,
): Promise<TopPeerItem[]>;
```

핵심 SQL (TypeORM QueryBuilder):

```sql
SELECT p."peerId" AS "peerId",
       SUM(p.minutes) AS "totalMinutes",
       SUM(p."sessionCount") AS "sessionCount"
FROM voice_co_presence_pair_daily p
WHERE p."guildId" = :guildId
  AND p."userId" = :userId
  AND p.date >= :startDate
GROUP BY p."peerId"
ORDER BY SUM(p.minutes) DESC
LIMIT :limit;
```

후처리 절차:

1. `UserPrivacyConfigService.filterPeers(guildId, peerIds)` 호출 → `Map<peerId, { isAnonymous }>`
2. `GuildMemberService.findByUserIds(guildId, peerIds)` 일괄 조회 → 닉네임/아바타
3. `isAnonymous = true`이면 `displayName = '???'`, `avatarUrl = null`로 치환
4. 조회 실패한 peer는 `Member-{peerId.slice(0, 6)}` 폴백 (PRD F-COPRESENCE-014 장애 대응)

> `userId < peerId` 조건을 **사용하지 않는다**. PairDaily는 양방향 저장이므로 `userId = :me` 단일 방향만 조회하면 정확하다.

### 5.2. `CoPresenceAnalyticsService.getAffinity()` — F-COPRESENCE-015

```typescript
export interface AffinityResponse {
  userA: { userId: string; displayName: string; avatarUrl: string | null };
  userB: { userId: string; displayName: string; avatarUrl: string | null };
  totalMinutes: number;
  sessionCount: number;
  lastDate: string | null;
  dailyData: { date: string; minutes: number }[];
}

async getAffinity(
  guildId: string,
  userA: string,
  userB: string,
  days: number,
): Promise<AffinityResponse>;
```

구현은 기존 `getPairDetail()`을 호출하여 `dailyData`를 얻고, 다음 두 항목을 추가 집계한다.

```sql
SELECT SUM(p."sessionCount") AS "sessionCount",
       MAX(p.date) AS "lastDate"
FROM voice_co_presence_pair_daily p
WHERE p."guildId" = :guildId
  AND p."userId" = :sortedA
  AND p."peerId" = :sortedB
  AND p.date >= :startDate;
```

`sortedA / sortedB`는 `userId < peerId` 정렬 (PRD §F-COPRESENCE-015 처리 c 단계).

> **권한 검사 미수행**. Controller 레이어에서 검증한다.

### 5.3. `GuildCoPresenceConfigService`

```typescript
@Injectable()
export class GuildCoPresenceConfigService {
  /** 레코드 없으면 기본값 { allowPublicAffinityQuery: false } 반환 */
  async getConfig(guildId: string): Promise<GuildCoPresenceConfigOrm>;

  /** upsert. updatedAt 자동 갱신 */
  async upsert(
    guildId: string,
    dto: { allowPublicAffinityQuery: boolean },
  ): Promise<GuildCoPresenceConfigOrm>;
}
```

### 5.4. `VoiceAiAnalysisService.generateBestFriendComment()` — F-COPRESENCE-018

```typescript
export interface BestFriendAiContext {
  guildId: string;
  selfDisplayName: string;
  period: 7 | 30 | 90;
  topPeers: { displayName: string; totalMinutes: number; sessionCount: number }[];
}

/** 길드 일일 한도 미초과 시 LlmProvider 호출, 실패/한도 초과 시 null */
async generateBestFriendComment(
  context: BestFriendAiContext,
): Promise<string | null>;
```

내부 호출 순서:

1. `incrLlmQuota(guildId)` — `Redis INCR friend:llm:quota:{guildId}:{YYYYMMDD}`
2. 첫 호출이면 `EXPIRE` 24h 설정
3. 한도(`FRIEND_LLM_DAILY_QUOTA = 50`) 초과 시 `null` 반환
4. `LlmProvider.generateText(prompt, { maxOutputTokens: 256, thinkingBudget: 0 })` 호출
5. 예외 시 `null` 반환 (코멘트 영역 카드에서 생략)

프롬프트 (PRD §F-COPRESENCE-018 명시):

```
사용자 X의 최근 30일 베스트 프렌드 TOP 3는 다음과 같다:
1. 동현 — 12시간 (24세션)
2. 민수 — 8시간 (15세션)
3. 지수 — 6시간 (10세션)
이 데이터를 1~2문장의 친근한 한국어로 묘사하라. 인용/추측 금지.
```

### 5.5. `BestFriendCardRenderer.render()` — Phase 4 implementer가 본문 구현

본 계획에서는 **인터페이스만 확정**한다. 캔버스 본문은 별도 implementer가 `docs/plans/best-friend-discord-feature.md` §2A·F-FRIEND-001 카드 레이아웃 + 본 계획 §6.1을 따라 구현한다.

```typescript
export interface BestFriendCardData {
  selfDisplayName: string;
  selfAvatarUrl: string;
  period: 7 | 30 | 90;
  peers: TopPeerItem[];
  aiComment: string | null;
  excludedChannels?: ExcludedChannelEntry[]; // 선택 — 푸터 표기
}

@Injectable()
export class BestFriendCardRenderer {
  constructor(private readonly canvasFonts: CanvasFontsService) {}
  async render(data: BestFriendCardData): Promise<Buffer>;
}
```

레이아웃 800×약 580px (peer 1명당 ~70px, AI 코멘트 영역 ~50px, 비활성 시 자동 축소). `apps/api/src/common/canvas/`의 `roundRect`, `truncateName`, `drawStatCardWithSub`(미사용), `formatTime`, `BLURPLE`, `BAR_EMPTY` 등을 그대로 import한다.

### 5.6. `AffinityCardRenderer.render()` — Phase 4 implementer가 본문 구현

```typescript
export interface AffinityCardData {
  userA: { displayName: string; avatarUrl: string | null };
  userB: { displayName: string; avatarUrl: string | null };
  period: 7 | 30 | 90;
  totalMinutes: number;
  sessionCount: number;
  lastDate: string | null;
  dailyData: { date: string; minutes: number }[];
}

@Injectable()
export class AffinityCardRenderer {
  constructor(private readonly canvasFonts: CanvasFontsService) {}
  async render(data: AffinityCardData): Promise<Buffer>;
}
```

레이아웃 800×약 360px. 좌측 A 아바타 / `⇆` 아이콘 / 우측 B 아바타 → 통계 카드 3개(`drawStatCardWithSub` 재사용) → 일별 막대 차트(`drawBarChart` 재사용).

---

## 6. bot-api 컨트롤러 — 핸들러 명세

기존 `BotCoPresenceController`(`bot-co-presence.controller.ts`)가 이미 존재한다. **신규 모듈을 만들지 않고** 동일 컨트롤러에 핸들러 2종을 추가한다 (사용자 요구의 `bot-co-presence.module.ts` 신설은 부적절 — 이미 `BotApiModule`에 직접 등록 + 기존 Phase 1 핸들러와 도메인이 동일).

### 6.1. `POST /bot-api/co-presence/best-friends`

```typescript
@Post('best-friends')
@HttpCode(HttpStatus.OK)
async getBestFriends(
  @Query('guildId') guildId: string,
  @Query('userId') userId: string,
  @Query('displayName') displayName: string,
  @Query('avatarUrl') avatarUrl: string,
  @Query('period') periodRaw: string,        // '7' | '30' | '90'
  @Query('limit') limitRaw: string,          // '3'~'5'
  @Query('includeComment') includeCommentRaw?: string, // '1' | '0' — 기본 '1'
): Promise<CanvasCardResponse>;
```

처리 흐름:

1. `period` 정수 파싱 + 유효성 (`[7, 30, 90]`만 허용, 그 외 → 30)
2. `limit` 정수 파싱 + 클램프 `[3, 5]`
3. **인메모리 LRU 캐시 조회** (`friend:card:{guildId}:{userId}:{period}:{limit}:{commentFlag}`)
   - hit이면 즉시 `{ ok: true, data: { imageBase64 }, days: period }` 반환
4. `analyticsService.getMyTopPeers(guildId, userId, period, limit)` 호출
5. peers 비어 있으면 "비활성" 카드 변형 렌더 (PRD F-COPRESENCE-014: "최근 N일간 …") — 빈 데이터도 렌더 후 base64 반환
6. `includeComment !== '0'`이면 `voiceAiAnalysisService.generateBestFriendComment(...)` 호출. null이면 코멘트 영역 생략
7. `bestFriendCardRenderer.render({ selfDisplayName, selfAvatarUrl, period, peers, aiComment })` 호출
8. PNG `Buffer` → `toString('base64')`
9. LRU 캐시에 저장 (TTL 5분)
10. `{ ok: true, data: { imageBase64 }, days: period }` 응답
11. 렌더 실패 시 `{ ok: true, data: null, days: period }` (Bot이 Embed 폴백 분기)

### 6.2. `POST /bot-api/co-presence/affinity`

```typescript
@Post('affinity')
@HttpCode(HttpStatus.OK)
async getAffinity(
  @Query('guildId') guildId: string,
  @Query('userAId') userAId: string,
  @Query('userBId') userBId: string,
  @Query('period') periodRaw: string,
  @Query('requestUserId') requestUserId: string,
  @Query('hasManageGuild') hasManageGuildRaw: string, // '1' | '0' — Bot에서 전달
): Promise<CanvasCardResponse & { errorCode?: 'PRIVATE' | 'FORBIDDEN' }>;
```

처리 흐름:

1. `period` 파싱 (5.1과 동일)
2. **권한 검사** (§7 흐름도 참조)
   - `requestUserId === userAId || requestUserId === userBId` → 통과 (자기 자신 포함 페어)
   - 그 외:
     - `hasManageGuild === '1'` → 통과
     - `guildCoPresenceConfigService.getConfig(guildId).allowPublicAffinityQuery` → `true`이면 통과
     - 둘 다 false → `{ ok: true, data: null, errorCode: 'FORBIDDEN', days: period }`
3. **opt-out 검사**
   - `userPrivacyConfigService.isPrivate(guildId, userAId)`, 동일하게 userBId
   - 한쪽이라도 비공개이고 `requestUserId`가 그 사용자 본인이 아니면 → `{ ok: true, data: null, errorCode: 'PRIVATE', days: period }`
4. `analyticsService.getAffinity(guildId, userAId, userBId, period)` 호출
5. `affinityCardRenderer.render({...})` → base64
6. `{ ok: true, data: { imageBase64 }, days: period }`

> `errorCode`는 `CanvasCardResponse` 스키마와 호환되는 선택 필드. Bot은 `data === null`이고 `errorCode`가 있으면 ephemeral 텍스트 응답(권한/사생활 안내)으로 분기한다.

---

## 7. 권한 검사 흐름도 (`/affinity`)

```
                 ┌──────────────────────────────┐
                 │ POST /bot-api/co-presence/   │
                 │ affinity                     │
                 │ (requestUserId, userAId,     │
                 │  userBId, hasManageGuild)    │
                 └──────────────┬───────────────┘
                                │
                ┌───────────────▼────────────────┐
                │ requestUserId === userAId      │
                │   || requestUserId === userBId │
                └───┬─────────────────────────┬──┘
              YES  │                         │  NO
                   │                         │
                   │              ┌──────────▼──────────────┐
                   │              │ hasManageGuild === '1'  │
                   │              └──┬──────────────────┬───┘
                   │            YES  │                  │  NO
                   │                 │                  │
                   │                 │      ┌───────────▼──────────────┐
                   │                 │      │ GuildCoPresenceConfig.   │
                   │                 │      │ allowPublicAffinityQuery │
                   │                 │      │ === true                 │
                   │                 │      └─┬──────────────────┬─────┘
                   │                 │   YES │                  │ NO
                   │                 │       │                  │
                   ▼                 ▼       ▼                  ▼
                ┌─────────────────────────────────┐    ┌───────────────────┐
                │  opt-out 검사                    │    │ data: null,       │
                │  isPrivate(A) && req !== A  → ❌  │    │ errorCode:        │
                │  isPrivate(B) && req !== B  → ❌  │    │ 'FORBIDDEN'       │
                └────────────┬────────────────────┘    └───────────────────┘
                  PASS       │       FAIL
                             │       │
                  ┌──────────▼──┐    ▼
                  │ getAffinity │  data: null,
                  │ → render    │  errorCode: 'PRIVATE'
                  │ → base64    │
                  └─────────────┘
```

---

## 8. AI 코멘트 흐름 + 한도 정책

```
[Controller]
  ├─ getMyTopPeers() → peers[]
  │
  ├─ if (peers.length === 0) → 비활성 카드 변형 (코멘트 호출 X)
  │
  └─ if (includeComment !== '0' && peers.length >= 3)
       │
       └─► VoiceAiAnalysisService.generateBestFriendComment({
             guildId, selfDisplayName, period, topPeers: peers.slice(0, 3),
           })
             │
             ├─ INCR friend:llm:quota:{guildId}:{YYYYMMDD}
             │   첫 호출이면 EXPIRE 24h
             │
             ├─ if (count > FRIEND_LLM_DAILY_QUOTA) → return null
             │
             ├─ try LlmProvider.generateText(prompt, { maxOutputTokens: 256 })
             │
             └─ catch → return null  (코멘트 영역 카드에서 생략)
```

**상수**: `FRIEND_LLM_DAILY_QUOTA = 50` (PRD에서 명시한 "길드별 일일 한도" 정량값을 잠정 채택. 운영 데이터 보고 후 조정 가능하도록 환경 변수 `FRIEND_LLM_DAILY_QUOTA` 옵션 도입 권장).

**LRU 카드 캐시 키**: `friend:card:{guildId}:{userId}:{period}:{limit}:{commentFlag}`
**LRU TTL**: 5분
**LRU 라이브러리**: `lru-cache` ^11 (현재 `apps/api/package.json`에 없음 — 본 계획에서 신규 추가)
**LRU 인스턴스 스코프**: `BestFriendCardCacheService` (`@Injectable()`, 모듈 라이프사이클에 1개)

```typescript
// best-friend-card.cache.ts
import { LRUCache } from 'lru-cache';

@Injectable()
export class BestFriendCardCacheService {
  private readonly cache = new LRUCache<string, string>({
    max: 500,
    ttl: 5 * 60 * 1000,
  });
  get(key: string): string | undefined { return this.cache.get(key); }
  set(key: string, value: string): void { this.cache.set(key, value); }
}
```

> `Redis` 미사용 사유: PRD §3.4의 캐시 전략 명시. PNG base64 30~80KB가 다수 캐싱되면 Redis 메모리 압박. 인메모리 LRU가 적절. 단, 멀티 인스턴스 배포 시 캐시 일관성 손실은 트레이드오프로 수용 (PRD에서 명시적으로 받아들임).

---

## 9. 의존 모듈

### 9.1. `CoPresenceModule.imports` 추가

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VoiceCoPresenceSessionOrm,
      VoiceCoPresenceDailyOrm,
      VoiceCoPresencePairDailyOrm,
      GuildCoPresenceConfigOrm,        // 신규
    ]),
    VoiceChannelModule,
    UserPrivacyModule,                  // Phase 0-B 산출물
    CommonCanvasModule,                 // Phase 0-A 산출물
    GuildMemberModule,                  // 이미 transitive로 보일 수 있으나 명시적 import
    VoiceAnalyticsModule,               // generateBestFriendComment 사용
    RedisModule,                        // 한도 카운터
  ],
  // ...
})
```

### 9.2. `CoPresenceModule.providers` 추가

```typescript
providers: [
  // 기존
  CoPresenceScheduler,
  CoPresenceService,
  CoPresenceDbRepository,
  CoPresenceCleanupScheduler,
  CoPresenceAnalyticsService,
  // 신규
  GuildCoPresenceConfigRepository,
  GuildCoPresenceConfigService,
  BestFriendCardRenderer,
  AffinityCardRenderer,
  BestFriendCardCacheService,
  BestFriendLlmQuotaService,
],

exports: [
  CoPresenceScheduler,
  CoPresenceService,
  // 신규
  CoPresenceAnalyticsService,
  GuildCoPresenceConfigService,
  BestFriendCardRenderer,
  AffinityCardRenderer,
  BestFriendCardCacheService,
],
```

### 9.3. `BotApiModule.imports` 갱신

`UserPrivacyModule` 추가 (이미 `CoPresenceModule`은 등록되어 있음).

### 9.4. 패키지 추가

`apps/api/package.json`:

```jsonc
"dependencies": {
  "lru-cache": "^11.0.0",   // 신규
  // ...
}
```

---

## 10. 테스트 케이스

### 10.1. `CoPresenceAnalyticsService.getMyTopPeers()` (단위)

| ID | 시나리오 | 기대 |
|----|---------|------|
| T-MYP-01 | 정상 — peer 5명, days=30 | peerId별 totalMinutes 내림차순 5건 |
| T-MYP-02 | peer 0명 | 빈 배열 |
| T-MYP-03 | limit=3 | 3건만 반환 (4번째 이하 제외) |
| T-MYP-04 | days=7 — 8일 전 데이터 제외 | startDate cutoff 검증 |
| T-MYP-05 | 익명화 — peer 1명이 disableRelationshipShare=true | `displayName='???'`, `avatarUrl=null`, `isAnonymous=true` |
| T-MYP-06 | GuildMember 조회 실패 — `findByUserIds` 1명 누락 | `Member-XXXXXX` 폴백 |
| T-MYP-07 | 동일 시간 peer 2명 — 정렬 안정성 | `peerId` ASC 보조 정렬 (또는 명시적 동등 처리 검증) |

### 10.2. `CoPresenceAnalyticsService.getAffinity()` (단위)

| ID | 시나리오 | 기대 |
|----|---------|------|
| T-AFF-01 | 정상 — 30일 데이터 존재 | totalMinutes/sessionCount/lastDate/dailyData 모두 포함 |
| T-AFF-02 | 데이터 0건 | `totalMinutes=0, sessionCount=0, lastDate=null, dailyData=[]` |
| T-AFF-03 | userA > userB 입력 | `sortedA < sortedB` 보장으로 단방향 키 정확 조회 |
| T-AFF-04 | 같은 사용자 (userA == userB) | dailyData 빈 배열 (PairDaily에는 자기 자신 페어 미저장) |

### 10.3. `GuildCoPresenceConfigService` (단위)

| ID | 시나리오 | 기대 |
|----|---------|------|
| T-GCC-01 | `getConfig` — 레코드 없음 | 기본값 `{ allowPublicAffinityQuery: false }` 반환 |
| T-GCC-02 | `upsert` — 신규 | INSERT 실행 |
| T-GCC-03 | `upsert` — 기존 | UPDATE 실행, `updatedAt` 갱신 |

### 10.4. `VoiceAiAnalysisService.generateBestFriendComment()` (단위, mock LLM)

| ID | 시나리오 | 기대 |
|----|---------|------|
| T-LLM-01 | 정상 호출 | 문자열 반환, Redis INCR 1회 |
| T-LLM-02 | 한도 초과 (51회째) | `null` 반환, LLM 호출 없음 |
| T-LLM-03 | LLM throw | `null` 반환 + 카운터는 이미 INCR된 상태 (롤백 불필요 — 비용 회피 차원) |
| T-LLM-04 | 첫 호출 — EXPIRE 24h 설정 | `INCR` + `EXPIRE` 호출 검증 |

### 10.5. `BotCoPresenceController` (e2e — `BotApiAuthGuard` 통과 후)

| ID | 엔드포인트 | 시나리오 | 기대 |
|----|-----------|---------|------|
| T-CTL-01 | `POST best-friends` | 정상 | `data.imageBase64` 비어있지 않음, `days` 일치 |
| T-CTL-02 | `POST best-friends` | peers 0건 | `data.imageBase64` 존재 (비활성 변형) |
| T-CTL-03 | `POST best-friends` | LRU 히트 | DB 쿼리 0회 호출 |
| T-CTL-04 | `POST best-friends` | period='5'(잘못된 값) | 30으로 폴백 |
| T-CTL-05 | `POST affinity` | 본인 포함 페어 | 정상 응답 |
| T-CTL-06 | `POST affinity` | 타인↔타인 + ManageGuild=1 | 정상 응답 |
| T-CTL-07 | `POST affinity` | 타인↔타인 + ManageGuild=0 + allowPublic=false | `errorCode='FORBIDDEN'` |
| T-CTL-08 | `POST affinity` | 타인↔타인 + allowPublic=true | 정상 응답 |
| T-CTL-09 | `POST affinity` | 본인 포함 + 상대 비공개 | `errorCode='PRIVATE'` (요청자가 비공개 사용자 본인이 아닌 경우) |
| T-CTL-10 | `POST affinity` | 비공개 사용자 본인이 자기 데이터 조회 | 정상 응답 |
| T-CTL-11 | 두 엔드포인트 | `Authorization` 누락 | 401 |

### 10.6. 통합 (선택)

기존 `co-presence-db.repository.integration-spec.ts` 스타일로 testcontainers PostgreSQL을 사용하여 `getMyTopPeers`/`getAffinity`의 SQL 정확성을 검증한다.

---

## 11. 코드 스타일 / 제약 (CLAUDE.md, code-style-guide.md 준수)

- ESLint 자동 검증 항목은 그대로 강제 (any 금지, optional chaining, return await 등)
- Boolean 변수: `isAnonymous`, `hasManageGuild`, `includeComment` 접두사 준수
- 함수명: `getMyTopPeers`, `getAffinity`, `generateBestFriendComment` (동사 시작)
- 매직 넘버 회피:
  - `FRIEND_LLM_DAILY_QUOTA = 50`
  - `FRIEND_CARD_LRU_MAX = 500`
  - `FRIEND_CARD_LRU_TTL_MS = 5 * 60 * 1000`
  - `FRIEND_LLM_QUOTA_TTL_SEC = 24 * 60 * 60`
- 함수 50줄 초과 시 분리: 컨트롤러 핸들러 본문은 보조 메서드로 추출
- `as` 단언은 사용 금지 (필요 시 사유 주석 명시)
- catch 블록: `error instanceof Error` 가드 후 `getErrorStack(error)` 사용 (기존 voice-ai-analysis 서비스 패턴 답습)
- JSDoc: `getMyTopPeers`, `getAffinity`, `generateBestFriendComment`에 작성
- 신규 ESLint 위반 0건 — `pnpm --filter @nexus/api lint` 통과 확인

---

## 12. 의존 순서 / 병렬화

1. **선행 (단독 PR로 머지)**:
   - Phase 0-A: `apps/api/src/common/canvas/` 추출 (`canvas-common-module.md`)
   - Phase 0-B: `apps/api/src/user-privacy/` 모듈 신설 (`UserPrivacyConfigService`)
   - Phase 0-C: `lru-cache` 추가
2. **본 계획 PR (Phase 1~4 일괄)** — 위 3건이 develop에 머지된 시점에서 분기:
   - Phase 1, Phase 3, Phase 4의 Repository/Service 작성은 병렬 가능
   - Phase 2 (캔버스 렌더러)는 Phase 0-A 산출물이 필요
   - Phase 4 (컨트롤러)는 Phase 1·2·3 모두 완료 후

---

## 13. 트레이드오프 / 미해결 항목

| 항목 | 결정 | 근거 |
|------|------|------|
| `bot-co-presence.module.ts` 신설 vs 기존 컨트롤러 확장 | **기존 컨트롤러 확장** | `BotCoPresenceController`가 이미 `BotApiModule`에 등록되어 있고 도메인이 동일. 별도 모듈 분리 시 모듈 그래프만 복잡해짐 |
| LRU 캐시 라이브러리 | `lru-cache` ^11 신규 도입 | 표준 LRU 구현, 타입 정의 완비. `node-cache`는 LRU 아님. 자체 구현은 비용 증가 |
| `isAnonymous` peer의 `userId` 노출 | **노출하지 않음 (단, `peers[].userId`는 `peerId`로 보존)** | 카드 렌더 단계에서만 사용. Bot/외부에 익명화된 행은 `userId: ''` 또는 `displayName='???'`로만 식별 |
| AI 코멘트 결과 캐시 | **본 계획에서는 PNG LRU 5분만 적용** | PRD §3.4의 "LLM 결과 캐시 1시간"은 별도 후속 PR에서 검토. PNG LRU가 결국 동일 효과 |
| `FRIEND_LLM_DAILY_QUOTA` 정량값 | **50 잠정** | PRD에 정량값 명시 없음. ENV 오버라이드 가능하도록 설계 |
| 동시성 — 동일 키에 대한 동시 렌더 요청 | **별도 처리 없음** | 캔버스 렌더 50~150ms. 동시 호출 시 양쪽이 모두 렌더하더라도 LRU에는 마지막 결과만 남음. 비즈니스적 영향 미미 |

---

## 14. 산출물 검증 체크리스트

- [ ] `pnpm --filter @nexus/api lint` 통과 (신규 위반 0건)
- [ ] `pnpm --filter @nexus/api test` 통과 (테스트 §10 추가)
- [ ] `pnpm --filter @nexus/api build` 통과
- [ ] 기존 `co-presence-analytics.service.ts` 메서드 7종의 시그니처 변경 없음 (diff 검증)
- [ ] 기존 `bot-co-presence.controller.ts`의 `snapshots` / `flush` 핸들러 변경 없음
- [ ] `UserPrivacyConfigOrm` / `GuildCoPresenceConfigOrm` 엔티티 재선언 없음 (이미 존재)
- [ ] 마이그레이션 추가 없음 (`AddBestFriendCanvasConfig1777100000000`이 두 테이블 모두 생성 완료)
- [ ] `apps/api/package.json`의 `lru-cache` 추가가 `pnpm install` 후 lockfile에 반영됨
- [ ] 본 계획의 §3.3 "변경 금지" 항목이 모두 보존됨

---

## 15. 후속 작업 (본 계획 범위 외)

| 작업 | 대상 plan |
|------|----------|
| Bot 슬래시 커맨드 `/best-friend`, `/affinity` | (별도 plan) |
| `libs/bot-api-client`에 `getMyBestFriends()`, `getAffinity()` 추가 | (Part D-4 단독 PR) |
| `/privacy` 슬래시 커맨드 + 웹 사생활 페이지 | (Part D-2 후속) |
| `WeeklyReportService`에 친밀도 섹션 통합 (F-COPRESENCE-016) | (별도 plan) |
| `GuildCoPresenceConfig` 웹 토글 UI | (web 도메인 plan) |
