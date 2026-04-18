# 코드 스타일 가이드 위반 수정 계획

> 작성일: 2026-03-15
> 상태: 계획 수립 완료 (미적용)
> 참조: `docs/guides/code-style-guide.md`

## 현황 요약

| 위반 항목 | 건수 | 심각도 |
|-----------|------|--------|
| `as` 단언 주석 누락 / 타입 가드 미사용 | ~158건 | 중 |
| catch `(err as Error)` instanceof 미확인 | ~116건 | 중 |
| 공용 함수 JSDoc 누락 | ~20건 | 저 |

---

## Phase 1: catch 블록 에러 처리 개선 (116건)

가장 건수가 많고, 공통 유틸 함수 하나로 전체 해결 가능.

### 1-1. 에러 유틸 함수 생성

```typescript
// apps/api/src/common/util/error.util.ts

/** unknown 타입의 에러에서 안전하게 message를 추출한다 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** unknown 타입의 에러에서 안전하게 stack trace를 추출한다 */
export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
```

### 1-2. 일괄 치환

**패턴 A — `.stack` 접근 (대다수)**

```typescript
// Before
catch (err) {
  this.logger.error('...', (err as Error).stack);
}

// After
catch (err) {
  this.logger.error('...', getErrorStack(err));
}
```

**패턴 B — `.message` 접근**

```typescript
// Before
catch (err) {
  this.logger.warn(`... ${(err as Error).message}`);
}

// After
catch (err) {
  this.logger.warn(`... ${getErrorMessage(err)}`);
}
```

### 대상 파일 (36개)

| 모듈 | 파일 | 건수 |
|------|------|------|
| gateway | `discord.gateway.ts` | 3 |
| event | `channel-state.handler.ts`, `voice-state.dispatcher.ts`, `voice-leave.handler.ts` | 4 |
| event | `newbie-interaction.handler.ts`, `auto-channel-interaction.handler.ts`, `sticky-message.handler.ts` | 4 |
| monitoring | `monitoring.scheduler.ts`, `monitoring.service.ts` | 3 |
| inactive-member | `inactive-member.scheduler.ts`, `inactive-member-action.service.ts` | 7 |
| newbie | `mission.scheduler.ts`, `mission.service.ts` | 13 |
| newbie | `moco.service.ts`, `moco-reset.scheduler.ts`, `moco-event.handler.ts`, `moco-bootstrap.service.ts` | 8 |
| newbie | `newbie-role.scheduler.ts`, `newbie.gateway.ts`, `newbie.controller.ts` | 8 |
| voice-analytics | `badge.scheduler.ts`, `voice-analytics.service.ts`, `voice-ai-analysis.service.ts` | 5 |
| channel/auto | `auto-channel.service.ts`, `auto-channel-discord.gateway.ts` | 3 |
| channel/voice | `voice-daily-flush-service.ts`, `voice-data-retention.scheduler.ts`, `voice-recovery.service.ts` | 4 |
| channel/voice | `co-presence.scheduler.ts`, `co-presence.service.ts` | 2 |
| status-prefix | `status-prefix-apply.service.ts`, `status-prefix-config.service.ts`, `status-prefix-reset.service.ts`, `status-prefix-interaction.handler.ts` | 5 |
| sticky-message | `sticky-message-config.service.ts`, `sticky-message-refresh.service.ts` | 4 |
| web | `MissionManageTab.tsx` | 2 |

### 작업 순서

1. `common/util/error.util.ts` 생성 + JSDoc 작성
2. `(err as Error).stack` → `getErrorStack(err)` 일괄 치환
3. `(err as Error).message` → `getErrorMessage(err)` 일괄 치환
4. web 컴포넌트의 `(err as Error).message` → 동일 패턴 적용 (별도 유틸 또는 인라인)
5. 빌드 검증

---

## Phase 2: `as` 단언 제거 — 타입 가드 도입 (28건)

타입 가드로 `as` 단언을 완전히 제거할 수 있는 경우.

### 2-1. TextChannel 타입 가드 (20건)

```typescript
// Before
const message = await (channel as TextChannel).send({...});

// After
if (!channel?.isTextBased()) return;
await channel.send({...});
```

**대상 파일:**

| 파일 | 줄번호 |
|------|--------|
| `auto-channel-discord.gateway.ts` | 46, 72, 99 |
| `mission.service.ts` | 284, 312 |
| `moco.service.ts` | 149, 180 |
| `welcome.service.ts` | 53 |
| `status-prefix-config.service.ts` | 162, 173 |
| `sticky-message-config.service.ts` | 125, 128 |
| `sticky-message-refresh.service.ts` | 여러 줄 |

### 2-2. GuildMember 타입 가드 (7건)

```typescript
// Before
const member = interaction.member as GuildMember;

// After
if (!interaction.inGuild()) return;
const member = interaction.member;
```

**대상 파일:**

| 파일 | 줄번호 |
|------|--------|
| `auto-channel.service.ts` | 138, 200 |
| `me.command.ts` | 49 |
| `music.service.ts` | 53 |
| `music-play.command.ts` | 41 |
| `status-prefix-apply.service.ts` | 73 |
| `status-prefix-reset.service.ts` | 51 |

### 2-3. Guild fetch 널 체크 (1건)

```typescript
// Before (inactive-member-action.service.ts:35)
const guild = (await this.discord.guilds.fetch(guildId)) as Guild;

// After
const guild = await this.discord.guilds.fetch(guildId);
if (!guild) throw new DomainException('길드를 찾을 수 없습니다.', 'GUILD_NOT_FOUND');
```

---

## Phase 3: `as` 단언 제거 — 구조 개선 (12건)

### 3-1. Next.js params await 처리 (10건)

Next.js 15+에서 `params`는 `Promise` 타입이므로 `await` 필요.

```typescript
// Before
const guildId = params.guildId as string;

// After
const { guildId } = await params;
```

**대상 파일:**

| 파일 |
|------|
| `dashboard/guild/[guildId]/co-presence/page.tsx` |
| `dashboard/guild/[guildId]/inactive-member/page.tsx` |
| `dashboard/guild/[guildId]/layout.tsx` |
| `dashboard/guild/[guildId]/monitoring/page.tsx` |
| `dashboard/guild/[guildId]/newbie/page.tsx` |
| `dashboard/guild/[guildId]/overview/page.tsx` |
| `dashboard/guild/[guildId]/voice/page.tsx` |
| `dashboard/guild/[guildId]/help/page.tsx` |
| `settings/guild/[guildId]/layout.tsx` |
| `settings/guild/[guildId]/getting-started/page.tsx` |

### 3-2. api-client 제네릭 개선 (2건)

```typescript
// Before (api-client.ts:65, 67)
return undefined as T;
return res.json() as Promise<T>;

// After — 함수 시그니처에서 오버로드 처리
// 65: return undefined as unknown as T; // fallback 반환 시 불가피 — 주석 추가
// 67: return (await res.json()) as T;   // Response.json()은 Promise<any> — 주석 추가
```

---

## Phase 4: `as` 단언 — 주석 추가 (나머지 ~20건)

타입 가드나 구조 개선으로 제거할 수 없는 불가피한 단언에 주석을 추가한다.

### 대상 패턴

| 패턴 | 건수 | 주석 예시 |
|------|------|----------|
| `e.target as Node` | 5 | `// DOM EventTarget → Node (contains() 사용에 필요)` |
| `value as number` (recharts) | 2 | `// recharts formatter: value는 런타임에 number (타입 정의 부정확)` |
| `color as \`#${string}\`` | 2 | `// DB 저장 값은 #RRGGBB 형식으로 검증됨` |
| `v as Period / as Grade` (UI 이벤트) | ~8 | `// select onChange의 value는 런타임에 항상 해당 유니온 멤버` |
| `channel as TextChannel \| null` (catch → null) | 2 | `// fetch 실패 시 null, 성공 시 TextChannel (guild text channel만 조회)` |
| `JSON.parse() as string[]` | 1 | `// DB JSON 컬럼: string[] 형식으로 저장됨` |

---

## Phase 5: 공용 함수 JSDoc 추가 (20건)

### 5-1. libs/shared/src/helpers/index.ts (5건)

```typescript
/** 오늘 날짜를 YYYYMMDD 형식 문자열로 반환한다 (로컬 시간 기준) */
export function todayYYYYMMDD(): string

/** 오늘 날짜를 YYYYMMDD 형식 문자열로 반환한다 (KST 기준) */
export function getKSTDateString(): string

/** 오늘 날짜를 YYYYMMDD 형식 문자열로 반환한다 (UTC 기준) */
export function getUTCDateString(): string

/** 문자열을 최대 길이로 자르고 말줄임표를 추가한다 */
export function truncate(text: string, max: number): string

/** 문자열을 최대 길이 단위로 분할한다 */
export function splitMessage(text: string, max: number): string[]
```

### 5-2. apps/web/app/lib/discord-api.ts (7건)

```typescript
/** 길드의 전체 채널 목록을 조회한다 */
export function fetchGuildChannels(...)

/** 길드의 텍스트 채널 목록만 필터링하여 조회한다 */
export function fetchGuildTextChannels(...)

/** 길드의 역할 목록을 조회한다 */
export function fetchGuildRoles(...)

/** 길드의 커스텀 이모지 목록을 조회한다 */
export function fetchGuildEmojis(...)

/** 디스코드 이모지 CDN URL을 생성한다 */
export function getEmojiCdnUrl(...)

/** 디스코드 이모지를 문자열 포맷으로 변환한다 */
export function formatEmojiString(...)

/** 길드에 등록된 슬래시 커맨드 목록을 조회한다 */
export function fetchGuildCommands(...)
```

### 5-3. apps/web/app/lib/voice-dashboard-api.ts (5건)

```typescript
/** 음성 활동 레코드를 기반으로 전체 통계 요약을 계산한다 */
export function computeSummary(...)

/** 음성 활동 레코드를 일별 트렌드로 집계한다 */
export function computeDailyTrends(...)

/** 음성 활동 레코드를 채널별 통계로 집계한다 */
export function computeChannelStats(...)

/** 음성 활동 레코드를 카테고리별 통계로 집계한다 */
export function computeCategoryStats(...)

/** 음성 활동 레코드를 사용자별 통계로 집계한다 */
export function computeUserStats(...)
```

### 5-4. apps/web/app/lib/monitoring-api.ts (3건)

```typescript
/** 봇 상태 정보를 조회한다 */
export function fetchBotStatus(...)

/** 봇 메트릭 시계열 데이터를 조회한다 */
export function fetchBotMetrics(...)

/** 밀리초를 사람이 읽기 쉬운 가동 시간 문자열로 변환한다 */
export function formatUptime(...)
```

---

## 실행 순서 및 커밋 전략

```
Phase 1 (catch 에러 처리) ── 유틸 1개 생성 + 36개 파일 수정 ── 1커밋
  │
Phase 2 (타입 가드 도입)  ── 20+7+1 = 28건 ──────────────── 1커밋
  │
Phase 3 (구조 개선)       ── 10+2 = 12건 ─────────────────── 1커밋
  │
Phase 4 (주석 추가)       ── ~20건 ────────────────────────── 1커밋
  │
Phase 5 (JSDoc 추가)      ── 20건 ─────────────────────────── 1커밋
```

모듈당이 아닌 **패턴별 커밋**으로 구성한다. 동일 패턴을 일괄 적용하면 리뷰와 롤백이 용이하다.

---

## 검증 기준

| 검증 | 방법 |
|------|------|
| `as` 단언에 주석 존재 | `grep -n ' as [A-Z]' \| grep -v '//' \| grep -v 'as const'` — 0건 |
| `(err as Error)` 패턴 제거 | `grep -n '(err as Error)\|(error as Error)'` — 0건 |
| JSDoc 보유율 | export 함수 중 JSDoc 없음 — 0건 |
| 빌드 성공 | `tsc --noEmit` 에러 0건 |
| 컨테이너 정상 기동 | `docker compose up -d && logs --tail 10` |

---

## 예상 변경 규모

| Phase | 파일 수 | 변경 라인 |
|-------|---------|-----------|
| 1 | 37 | ~250 |
| 2 | 15 | ~80 |
| 3 | 12 | ~30 |
| 4 | 15 | ~40 |
| 5 | 4 | ~60 |
| **합계** | **~50** (중복 제외) | **~460** |
