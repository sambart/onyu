# 공통 모듈 설계

> 이 문서는 다중 도메인 병렬 개발에 앞서, 2개 이상 도메인이 공유하는 로직을 공통 모듈로 추출한 설계이다.
> 단일 도메인에서만 사용되는 로직은 포함하지 않는다.

---

## Part D. 친밀도 그래프 + 베스트 프렌드 TOP 리포트 (voice-co-presence Phase 5)

> 입력 PRD: `docs/specs/prd/voice-co-presence.md` (F-COPRESENCE-014~018)
> 검토안: `docs/plans/best-friend-discord-feature.md`
> 영향 도메인: voice-co-presence(주), voice-analytics/weekly-report, gemini, bot, bot-api, user-privacy(신규), web

본 Part는 친밀도/베프 카드 기능을 위해 **2개 이상 도메인에서 공유**되어 코드 충돌 위험이 있는 모듈만을 다룬다. 단일 도메인 내부 로직(예: `BestFriendCardRenderer`의 카드 레이아웃 자체, `/best-friend` 슬래시 커맨드 핸들러 본문)은 본 문서에 포함하지 않는다.

---

### D-1. Canvas 헬퍼 + 폰트 등록 공통 추출 (`apps/api/src/common/canvas/`)

**관련 영역**: voice 도메인(`ProfileCardRenderer` — `/me`), voice-co-presence 도메인(`BestFriendCardRenderer`, `AffinityCardRenderer` — 신규)

#### 추출 근거

PRD F-COPRESENCE-014 카드 레이아웃과 F-COPRESENCE-015 카드 레이아웃은 모두 `/me`의 `ProfileCardRenderer`와 동일한 시각 톤(BLURPLE 팔레트, 800px 폭, 통계 카드, 막대 차트, 친밀도 바)을 따르도록 명시되어 있다. 검토안 §6.6은 "`ProfileCardRenderer` 헬퍼(`drawStatCardWithSub`, `roundRect` 등)를 공통 유틸로 추출하여 재사용"을 명시적 완화책으로 제시한다.

현재 `apps/api/src/channel/voice/application/profile-card-renderer.ts`에 다음 헬퍼가 `private` 메서드로 정의되어 있어 외부에서 재사용 불가능한 상태이다.

| 헬퍼 | 현재 위치 | 신규 카드 재사용성 |
|------|-----------|-------------------|
| `roundRect(ctx, x, y, w, h, r)` | private 메서드 | F-014 비공개 회색 원·바 차트, F-015 통계 카드 외곽선 — **재사용 필수** |
| `drawStatCardWithSub({label, value, subText})` | private 메서드 | F-015 "총 시간/세션 수/마지막 함께한 날" 3개 카드 — **재사용 필수** |
| `drawBarChart()` (일별 추이) | private 메서드 | F-015 미니 막대 차트 ("📊 일별 추이") — **재사용 필수** |
| `truncateName(ctx, name, maxWidth)` | private 메서드 | F-014 peer 닉네임 길이 제한 — **재사용 필수** |
| `normalizeDisplayName(name)` | 모듈 스코프 함수 | 모든 카드의 닉네임 정규화 — **재사용 필수** |
| `formatTime(sec)` (시간/분 포맷) | 모듈 스코프 함수 | F-014 친밀도 바 시간 라벨, F-015 총 동시접속 시간 — **재사용 필수** |
| `registerFonts()` (NotoSansCJK + NotoColorEmoji 다중 경로 등록) | private 메서드 (생성자에서 호출) | 신규 렌더러 2종도 동일 폰트 필요 — **중복 등록 회피 필요** |

#### 신규 디렉터리 구조

```
apps/api/src/common/canvas/
  canvas-fonts.ts        # GlobalFonts.registerFromPath 호출, 프로세스 1회만 실행
  canvas-helpers.ts      # roundRect, truncateName, drawStatCardWithSub, drawBarChart
  canvas-format.ts       # formatTime(sec), normalizeDisplayName(name)
  canvas-palette.ts      # BLURPLE, BLURPLE_DIM, TEXT_PRIMARY 등 색상 상수
  canvas.module.ts       # 폰트 등록 onModuleInit + helpers re-export (NestJS 모듈)
  index.ts               # 외부 노출 barrel
```

#### 분리 원칙

| 항목 | 공통 추출 | 추출 비대상 (도메인 잔류) |
|------|-----------|----------------------------|
| `roundRect`, `truncateName` | 공통 (순수 함수) | — |
| `formatTime`, `normalizeDisplayName` | 공통 (순수 함수) | — |
| `drawStatCardWithSub`, `drawBarChart` | 공통 (시그니처/기본 색상은 `canvas-palette.ts` 참조) | — |
| 폰트 등록 (`registerFonts`) | **공통** — 프로세스당 1회만 실행 (`onModuleInit`) | 각 렌더러 생성자에서 직접 호출 금지 |
| 색상 팔레트 (`BLURPLE`, `BG`, `CARD_BG`, `ACCENT`, `BORDER`, `DIVIDER`, `TEXT_*`, `BAR_EMPTY`) | 공통 | — |
| 카드 레이아웃 상수 (`W=800`, `H=650`, `PADDING=32`, `CARD_RADIUS=16`) | **공통** — 이름은 `LAYOUT.WIDTH` 등 네임스페이스 | — |
| `drawHeader`, `drawRankCard`, `drawMicCard`, `drawBadgePills`, `buildFooterText` | 추출 안 함 | `/me` 전용. `ProfileCardRenderer`에 잔류 |
| `BADGE_DISPLAY`, `BADGE_PRIORITY`, `MAX_BADGE_DISPLAY` | 추출 안 함 | self-diagnosis 도메인 자산 |
| `MIC_ON_COLOR`, `MIC_OFF_COLOR` | 추출 안 함 | `/me` 마이크 카드 전용 |

#### 폰트 등록 충돌 방지

기존 `ProfileCardRenderer.registerFonts()`는 생성자에서 호출되어 NestJS DI 시 1회 등록되지만, 신규 렌더러 2종이 같은 패턴을 따르면 **동일 프로세스에서 3회 등록**되어 로그가 중복 출력된다. 대신 다음 패턴을 강제한다.

```typescript
// canvas.module.ts
@Module({
  providers: [CanvasFontsService],
  exports: [CanvasFontsService],
})
export class CanvasModule implements OnModuleInit {
  constructor(private readonly fonts: CanvasFontsService) {}
  onModuleInit() { this.fonts.register(); }  // 모듈 1회 호출
}
```

`ProfileCardRenderer`, `BestFriendCardRenderer`, `AffinityCardRenderer`는 모두 `CanvasModule`을 import하고, 자체 폰트 등록 로직은 제거한다.

#### 충돌 방지 규칙

- **공통 모듈 추출은 단독 선행 작업**으로 진행한다. `ProfileCardRenderer` 리팩토링과 신규 렌더러 작성을 동시에 시작하면 import 경로 충돌이 발생한다.
- 추출 PR은 **`refactor: profile-card-renderer 헬퍼를 common/canvas로 추출`** 단일 커밋으로 머지한 뒤 voice-co-presence 도메인 작업이 분기한다.
- voice-co-presence 도메인 개발자는 `apps/api/src/channel/voice/application/profile-card-renderer.ts`를 **수정하지 않는다**. 색상 팔레트나 헬퍼 변경 필요 시 `apps/api/src/common/canvas/`만 수정한다.
- 단순 시그니처 변경(예: `drawStatCardWithSub` 옵션 추가)도 공통 모듈 측에서만 수행하고, `/me` 카드와 신규 카드 양쪽이 동시 동작함을 확인한다.

---

### D-2. UserPrivacyConfig 도메인 모듈 (`apps/api/src/user-privacy/`)

**관련 영역**: voice-co-presence(F-COPRESENCE-014/015 익명화 필터), voice-analytics/weekly-report(F-COPRESENCE-016 익명화 필터), web(사생활 설정 페이지), bot(`/privacy` 슬래시 커맨드)

#### 추출 근거

`UserPrivacyConfig`는 PRD에서 "친밀도·베프 노출"을 위한 opt-out 설정이지만, 다음 4개 도메인이 모두 `disableRelationshipShare` 플래그를 조회·반영해야 한다.

| 소비 위치 | 사용 메서드 | 사용 빈도 |
|-----------|-------------|----------|
| `BestFriendCardRenderer` 렌더 직전 (F-COPRESENCE-014) | `filterPeers(guildId, peerIds)` 배치 조회 | 카드 1회당 N개 |
| `AffinityCardRenderer` 분기 직전 (F-COPRESENCE-015) | `isPrivate(guildId, userId)` 단건 조회 (양측 검증) | 카드 1회당 2회 |
| `WeeklyReportService.collectReportData()` (F-COPRESENCE-016) | `filterPeers(guildId, allPairUserIds)` 배치 조회 | 주간 리포트 1회당 5쌍 × 2명 |
| `/privacy` 슬래시 커맨드 + 웹 PUT API (F-COPRESENCE-017) | `upsert(guildId, userId, dto)` | 사용자 액션 시 |

PRD §F-COPRESENCE-014 처리 단계는 `UserPrivacyConfigService.filterPeers(guildId, peers)`를 단일 인터페이스로 명시한다. 검토안 §6.5는 "`voice-co-presence` 확장으로 흡수, 별도 모듈 분리 없음"을 권장하지만, 이는 **`CoPresenceAnalyticsService`의 도메인 경계** 결정이며, opt-out 데이터 자체는 친밀도 외 잠재 확장 가능성(예: 음성 통계 전체 비공개, 프로필 카드 비공개)을 가진 사용자 단위 설정이므로 **별도 도메인 모듈로 분리**한다.

#### 모듈 구조

```
apps/api/src/user-privacy/
  user-privacy.module.ts
  application/
    user-privacy-config.service.ts        # filterPeers, isPrivate, upsert, getOne
    user-privacy-cache.ts                  # Redis 키 빌더 + TTL 상수
  infrastructure/
    user-privacy-config.orm-entity.ts     # 이미 존재 (변경 없음)
    user-privacy-config.repository.ts     # find, upsert, batch findByUserIds
  presentation/
    user-privacy.controller.ts             # GET/PUT /api/users/me/privacy
    dto/user-privacy.dto.ts
```

`UserPrivacyConfigOrm` 엔티티는 이미 `apps/api/src/user-privacy/infrastructure/user-privacy-config.orm-entity.ts`에 정의되어 있으므로 변경하지 않는다.

#### 공개 인터페이스 (다른 도메인이 의존)

```typescript
@Injectable()
export class UserPrivacyConfigService {
  /**
   * peer 목록을 받아 비공개 사용자를 익명화한다.
   * F-COPRESENCE-014/015/016에서 동일하게 사용.
   * @returns peerId → { isAnonymous: boolean } 맵. 호출자가 닉네임/아바타를 익명 처리한다.
   */
  async filterPeers(guildId: string, peerIds: string[]): Promise<Map<string, { isAnonymous: boolean }>>;

  /** 단일 사용자 비공개 여부. F-COPRESENCE-015 양측 검증에 사용. */
  async isPrivate(guildId: string, userId: string): Promise<boolean>;

  /** opt-out 토글. F-COPRESENCE-017 슬래시 커맨드 + 웹 API에서 사용. */
  async upsert(guildId: string, userId: string, disableRelationshipShare: boolean): Promise<void>;
}
```

#### Redis 캐시 키

PRD에서 명시한 캐시 패턴(`friend:privacy:{guildId}:{userId}`, TTL 30분)은 `UserPrivacyConfigService` 내부에 캡슐화한다. 외부 도메인은 캐시 존재를 알 필요가 없다.

```typescript
// user-privacy-cache.ts
export const USER_PRIVACY_CACHE_PREFIX = 'friend:privacy';
export const USER_PRIVACY_CACHE_TTL_SEC = 30 * 60;
export const buildPrivacyCacheKey = (guildId: string, userId: string) =>
  `${USER_PRIVACY_CACHE_PREFIX}:${guildId}:${userId}`;
```

`upsert()` 시 즉시 `DEL friend:privacy:{guildId}:{userId}`로 캐시 무효화한다 (PRD F-COPRESENCE-017 처리 단계 명시).

#### 모듈 노출 정책

`UserPrivacyModule.exports`는 **`UserPrivacyConfigService`만 노출**한다. Repository / Cache 키 빌더는 외부에서 참조하지 않는다. 의존하는 도메인(voice-co-presence, weekly-report)은 NestJS 모듈에서 `UserPrivacyModule`을 import하여 `UserPrivacyConfigService`만 주입받는다.

#### 충돌 방지 규칙

- `UserPrivacyConfigOrm` 엔티티는 이미 코드베이스에 존재한다 — **재정의 금지**.
- DB 마이그레이션은 별도 PR(엔티티 추가 시점)에서 처리되었음을 확인하고, 모듈 신설 작업에서는 마이그레이션을 추가하지 않는다.
- `user-privacy.controller.ts`의 라우트(`GET/PUT /api/users/me/privacy`)는 web 도메인 API 라우트와 충돌하지 않도록 `users/me/privacy` 경로를 본 모듈이 단독 점유한다.
- voice-co-presence / weekly-report 개발자는 `UserPrivacyConfigService`의 메서드 시그니처를 **호출만** 하며, 시그니처 변경은 user-privacy 도메인 개발자가 수행한다.

---

### D-3. GuildCoPresenceConfig: voice-co-presence 도메인 잔류 (공통 모듈 비대상)

**판단**: 공통화하지 않는다.

#### 근거

`GuildCoPresenceConfig` 엔티티(`apps/api/src/channel/voice/co-presence/infrastructure/guild-co-presence-config.orm-entity.ts`)는 이미 `voice-co-presence` 도메인에 위치한다. PRD에서 이 설정의 유일한 소비자는 F-COPRESENCE-015 `/affinity` 커맨드의 권한 검증(`allowPublicAffinityQuery`)뿐이며, 다른 도메인에서 참조하지 않는다.

웹 대시보드의 길드 토글 UI는 `voice-co-presence` 분석 페이지(F-COPRESENCE-007~013)와 같은 화면에 추가되므로, web 도메인에서는 **`apps/web/app/dashboard/guild/[guildId]/co-presence/` 페이지 내부**에 토글 컴포넌트를 두면 된다. 별도 공통 모듈 불필요.

→ voice-co-presence 도메인 개발자가 단독으로 처리한다.

---

### D-4. Bot ↔ API 캔버스 응답 타입 (`libs/bot-api-client/src/types.ts`)

**관련 영역**: bot-api 도메인(api 백엔드 응답 형식), bot 프로세스(응답 파싱), libs/bot-api-client(공유 타입)

#### 추출 근거

`/me` 커맨드는 다음 응답 구조를 사용한다 (`MeProfileResponse` in `libs/bot-api-client/src/types.ts`):

```typescript
export interface MeProfileResponse {
  ok: boolean;
  data: { imageBase64: string } | null;
  days: number;
}
```

PRD F-COPRESENCE-014/015의 신규 Bot API 응답도 동일한 구조(`{ ok, data: { imageBase64 } | null, days }`)를 사용하도록 검토안 §5에 명시되어 있다. 다음 3개 응답 타입이 동일 형태로 신규 정의된다.

| 신규 타입 | 엔드포인트 | data 본문 |
|-----------|------------|-----------|
| `BestFriendCardResponse` | `POST /bot-api/co-presence/best-friends` | `{ imageBase64: string } \| null` |
| `AffinityCardResponse` | `POST /bot-api/co-presence/affinity` | `{ imageBase64: string } \| null` |

#### 공통 베이스 타입 도입

`libs/bot-api-client/src/types.ts`에 다음 제네릭 타입을 추가하고, 신규 응답 2종 + 기존 `MeProfileResponse`를 통일한다.

```typescript
/**
 * Bot ↔ API 캔버스 PNG 응답 공통 형식.
 * /me, /best-friend, /affinity 모두 동일한 응답 셰이프를 사용한다.
 */
export interface CanvasCardResponse {
  ok: boolean;
  data: { imageBase64: string } | null;
  days: number;
}

// 기존 MeProfileResponse는 별칭으로 유지 (호환성)
export type MeProfileResponse = CanvasCardResponse;

export type BestFriendCardResponse = CanvasCardResponse;
export type AffinityCardResponse = CanvasCardResponse;
```

신규 카드는 `days` 필드 의미가 약간 다르지만 (조회 기간), 호출자의 분기 로직 (`if (!result.data) { ... }`)은 정확히 동일하므로 통일이 안전하다.

#### `BotApiClientService` 메서드 추가

`libs/bot-api-client/src/bot-api-client.service.ts`에 다음 메서드 2종을 추가한다.

```typescript
async getMyBestFriends(
  guildId: string,
  userId: string,
  displayName: string,
  avatarUrl: string,
  period: 7 | 30 | 90,
  limit: number,
): Promise<BestFriendCardResponse> {
  const params = new URLSearchParams({
    guildId, userId, displayName, avatarUrl,
    period: String(period), limit: String(limit),
  });
  return this.post(`/bot-api/co-presence/best-friends?${params.toString()}`, {});
}

async getAffinity(
  guildId: string,
  userAId: string,
  userBId: string,
  period: 7 | 30 | 90,
): Promise<AffinityCardResponse> {
  const params = new URLSearchParams({
    guildId, userAId, userBId, period: String(period),
  });
  return this.post(`/bot-api/co-presence/affinity?${params.toString()}`, {});
}
```

#### 충돌 방지 규칙

- `libs/bot-api-client`는 **bot 프로세스와 api 양쪽이 동시에 import**하는 가장 충돌 위험이 큰 파일이다. 신규 타입/메서드 추가는 **단독 PR로 선행** 머지한다.
- bot 도메인 개발자(`/best-friend`, `/affinity` 슬래시 커맨드)와 bot-api 개발자(`bot-co-presence.controller.ts`)는 양쪽 모두 본 PR이 머지된 develop 시점에서 분기한다.
- `MeProfileResponse`를 `CanvasCardResponse` 별칭으로 변경할 때 기존 `/me` 명령(`apps/bot/src/command/me.command.ts`)이 컴파일 깨지지 않음을 확인한다.

---

### D-5. AI 코멘트 LLM 한도 카운터 (인프라 차원에서 검토 — 단독 도메인 잔류 결론)

**판단**: 공통 모듈로 추출하지 않는다.

#### 근거

PRD F-COPRESENCE-018은 "길드별 일일 LLM 호출 한도: `Redis INCR friend:llm:quota:{guildId}:{YYYYMMDD}`"를 명시한다. 검토안 §3.4에서도 `friend:llm:quota:{guildId}:{YYYYMMDD}`로 키 네임스페이스가 `friend:` 접두사로 격리되어 있다.

기존 voice-analytics 도메인의 LLM 한도 로직(`voice-ai-analysis.service.ts`)은 별도 키 스킴을 사용하며, **친밀도 한도와 음성 분석 한도는 비즈니스 의미가 다르므로 통합 카운터가 부적절**하다. 따라서:

- `friend:llm:quota:*` 키는 voice-co-presence 도메인 내부 `VoiceAiAnalysisService.generateBestFriendComment()` 메서드(검토안 §F-FRIEND-005에서 명시) 내부에 캡슐화한다.
- `RedisService` 자체는 이미 공통 인프라 모듈이므로 추가 추출 불필요.

→ voice-co-presence 도메인 개발자가 단독으로 처리한다. 만약 미래에 다른 도메인이 동일 LLM 한도 패턴을 도입하면 그때 `apps/api/src/common/llm-quota/` 모듈로 추출을 재검토한다.

---

### D-6. Discord deferReply + AttachmentBuilder 패턴 (단독 도메인 잔류 결론)

**판단**: 공통 베이스 클래스/헬퍼로 추출하지 않는다.

#### 근거

PRD F-COPRESENCE-014/015 및 기존 `/me` 모두 다음 5단계 패턴을 사용한다.

```
deferReply() → apiClient 호출 → Buffer.from(base64) → new AttachmentBuilder() → editReply({ files, components })
```

이 패턴은 슬래시 커맨드당 약 5~10줄에 불과하며, 공통화 시 다음 비용이 발생한다.

| 비용 | 영향 |
|------|------|
| 베이스 클래스 도입 | discord-nestjs `@Command` 데코레이터 + `@Handler` 패턴과 상속 충돌 가능 |
| 추상화 누수 | `interaction` 객체의 메서드(예: `editReply`)에 호출자별 옵션(`components`, `ephemeral`)이 매번 다름 |
| 에러 처리 분기 | `/me`는 비활성 시 텍스트 응답, `/best-friend`는 비활성 카드 변형(F-014), `/affinity`는 ephemeral 텍스트(opt-out 시) — 분기 로직이 커맨드별로 상이 |

→ 각 슬래시 커맨드(`me.command.ts`, `best-friend.command.ts`, `affinity.command.ts`)는 동일 패턴을 **반복하되 공통 추상화는 도입하지 않는다**. 코드 중복이 발생해도 가독성·유지보수성이 더 높다 (오버엔지니어링 회피, CLAUDE.md 코드 스타일 가이드 부합).

---

### D-7. 웹 사이드바 메뉴 항목 추가 (`SettingsSidebar.tsx`)

**관련 영역**: web 도메인(사이드바 UI), user-privacy 도메인(F-COPRESENCE-017 사생활 설정 페이지)

#### 추가 메뉴

PRD F-COPRESENCE-017은 `apps/web/app/settings/me/privacy/page.tsx` 페이지를 신설한다. 기존 사이드바 패턴(Part A의 A-2 항목)에 따라 사이드바에도 메뉴 항목을 추가해야 한다.

| 사이드바 | 그룹 | 메뉴 항목 | 라우트 |
|----------|------|-----------|--------|
| SettingsSidebar (또는 사용자 메뉴) | 개인 설정 | 사생활 | `/settings/me/privacy` |

#### 충돌 방지 규칙

- 본 메뉴 추가는 web 도메인 개발자가 사이드바를 일괄 수정할 때 함께 반영한다 (Part A-2와 동일 정책).
- voice-co-presence / user-privacy 도메인 개발자는 사이드바 파일을 수정하지 않는다.

---

### D-8. 기존 공유 모듈: 변경 불필요 확인

아래 모듈은 본 Phase 5 작업에서 변경 없이 그대로 사용한다.

| 모듈 | 위치 | 사용 위치 | 변경 필요 여부 |
|------|------|-----------|---------------|
| `LlmProvider` 추상화 | `apps/api/src/common/llm/` | F-COPRESENCE-018 (`generateBestFriendComment`) | 변경 없음 |
| `RedisService` | `apps/api/src/redis/redis.service.ts` | `friend:privacy:*`, `friend:llm:quota:*` 키 저장 | 변경 없음 |
| `GuildMemberService.findByUserIds()` | `apps/api/src/guild-member/application/guild-member.service.ts` | F-014/015 peer 닉네임·아바타 일괄 조회 | 변경 없음 |
| `CoPresenceAnalyticsService.getPairDetail()` | `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` | F-COPRESENCE-015 일별 데이터 재사용 | 변경 없음 (`getMyTopPeers()` 신규 메서드만 추가) |
| `CoPresenceAnalyticsService.getTopPairs()` | 동일 파일 | F-COPRESENCE-016 주간 리포트 페어 수집 | 변경 없음 |
| `BotApiAuthGuard` | `apps/api/src/bot-api/bot-api-auth.guard.ts` | 신규 `bot-co-presence.controller.ts` 인증 | 변경 없음 |
| `JwtAuthGuard` | `apps/api/src/auth/infrastructure/jwt-auth.guard.ts` | F-COPRESENCE-017 웹 API 인증 | 변경 없음 |
| `apiClient<T>()` | `apps/web/app/lib/api-client.ts` | F-COPRESENCE-017 웹 사생활 API 호출 | 변경 없음 |
| `EventEmitter2` | `@nestjs/event-emitter` 기존 사용 | (변경 없음) | 변경 없음 |

---

### D-9. 구현 분담 명세

#### 영역 1: 공통 모듈 추출 (선행 작업)

| 항목 | 설명 |
|------|------|
| `apps/api/src/common/canvas/canvas-fonts.ts` | `ProfileCardRenderer.registerFonts()` 추출 |
| `apps/api/src/common/canvas/canvas-helpers.ts` | `roundRect`, `truncateName`, `drawStatCardWithSub`, `drawBarChart` 추출 |
| `apps/api/src/common/canvas/canvas-format.ts` | `formatTime`, `normalizeDisplayName` 추출 |
| `apps/api/src/common/canvas/canvas-palette.ts` | 색상 상수 추출 (`BLURPLE`, `BG`, `CARD_BG`, `ACCENT`, `BORDER`, `DIVIDER`, `TEXT_*`, `BAR_EMPTY`) |
| `apps/api/src/common/canvas/canvas.module.ts` | NestJS 모듈 + `onModuleInit` 폰트 등록 |
| `apps/api/src/common/canvas/index.ts` | barrel export |
| `apps/api/src/channel/voice/application/profile-card-renderer.ts` | private 헬퍼 → 공통 모듈 import 전환. `registerFonts()` 제거. `CanvasModule` import 추가 |
| 기존 `/me` 카드 시각 회귀 테스트 | 변경 후 동일 결과물 보장 (PNG 픽셀 일치 또는 수동 비교) |

#### 영역 2: 공유 라이브러리 (`libs/bot-api-client`) 선행 작업

| 항목 | 설명 |
|------|------|
| `libs/bot-api-client/src/types.ts` | `CanvasCardResponse` 베이스 타입 + `BestFriendCardResponse`, `AffinityCardResponse` 타입 별칭 추가. `MeProfileResponse`를 `CanvasCardResponse` 별칭으로 변경 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `getMyBestFriends()`, `getAffinity()` 메서드 추가 |

#### 영역 3: user-privacy 도메인 (신규)

| 항목 | 설명 |
|------|------|
| `apps/api/src/user-privacy/user-privacy.module.ts` | NestJS 모듈 (Service + Controller + Repository 등록) |
| `apps/api/src/user-privacy/application/user-privacy-config.service.ts` | `filterPeers`, `isPrivate`, `upsert` 메서드 |
| `apps/api/src/user-privacy/application/user-privacy-cache.ts` | Redis 키 빌더 + TTL 상수 |
| `apps/api/src/user-privacy/infrastructure/user-privacy-config.repository.ts` | `findByUserIds`, `upsert` |
| `apps/api/src/user-privacy/presentation/user-privacy.controller.ts` | `GET/PUT /api/users/me/privacy` |
| `apps/api/src/user-privacy/presentation/dto/user-privacy.dto.ts` | 요청/응답 DTO |

#### 영역 4: voice-co-presence 도메인 (확장)

| 항목 | 설명 |
|------|------|
| `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` | `getMyTopPeers(guildId, userId, days, limit)` 메서드 신규 추가 |
| `apps/api/src/channel/voice/co-presence/application/best-friend-card-renderer.ts` | 신규 — 공통 `canvas/` 헬퍼 사용 |
| `apps/api/src/channel/voice/co-presence/application/affinity-card-renderer.ts` | 신규 — 공통 `canvas/` 헬퍼 사용 |
| `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts` | `generateBestFriendComment()` 메서드 추가 + Redis 일일 한도 카운터 |
| `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` | `POST /bot-api/co-presence/best-friends`, `POST /bot-api/co-presence/affinity` 엔드포인트 추가 (기존 컨트롤러에 핸들러 추가) |
| `apps/api/src/channel/voice/co-presence/co-presence.module.ts` | `UserPrivacyModule` import 추가, `CanvasModule` import 추가, 신규 렌더러 2종 providers 등록 |

#### 영역 5: voice-analytics/weekly-report 도메인 (확장)

| 항목 | 설명 |
|------|------|
| `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts` | `collectReportData()`에 `CoPresenceAnalyticsService.getTopPairs()` 호출 추가, `UserPrivacyConfigService.filterPeers()` 호출하여 익명화. `buildPayload()`에 친밀도 섹션 삽입 |
| `apps/api/src/voice-analytics/voice-analytics.module.ts` | `CoPresenceModule`, `UserPrivacyModule` import 추가 |

#### 영역 6: bot 프로세스 (신규 슬래시 커맨드)

| 항목 | 설명 |
|------|------|
| `apps/bot/src/command/friend/best-friend.command.ts` | `/best-friend` (`친한친구`) — `me.command.ts` 패턴 답습 |
| `apps/bot/src/command/friend/affinity.command.ts` | `/affinity` (`친밀도`) |
| `apps/bot/src/command/privacy/privacy.command.ts` | `/privacy` ephemeral 텍스트 응답 |
| `apps/bot/src/command/bot-command.module.ts` | 신규 커맨드 3종 등록 |

#### 영역 7: web 프론트엔드

| 항목 | 설명 |
|------|------|
| `apps/web/app/settings/me/privacy/page.tsx` | 사생활 토글 페이지 (F-COPRESENCE-017) |
| `apps/web/app/lib/user-privacy-api.ts` | `apiClient` 기반 API 클라이언트 |
| `apps/web/app/components/SettingsSidebar.tsx` | "개인 설정 → 사생활" 메뉴 항목 추가 (사이드바 일괄 수정 정책) |
| `apps/web/app/dashboard/guild/[guildId]/co-presence/` 내부 | `GuildCoPresenceConfig` 토글 컴포넌트 추가 (D-3 결론에 따라 단일 도메인 처리) |

---

### D-10. 의존 순서 및 병렬화

```
Phase 0 (선행, 병렬 불가):
  [공통] apps/api/src/common/canvas/ 신규 디렉터리 생성 + ProfileCardRenderer 리팩토링
         (단독 PR, "refactor: profile-card-renderer 헬퍼를 common/canvas로 추출")
  [공유 lib] libs/bot-api-client types.ts + service.ts에 신규 타입/메서드 추가
         (단독 PR)
     |
     v
Phase 1 (병렬 가능):
  [user-privacy] 모듈 신설 (Service + Repository + Controller + Cache)
  [voice-co-presence] CoPresenceAnalyticsService.getMyTopPeers() 메서드 추가
     |
     v
Phase 2 (병렬 가능, Phase 1 완료 후):
  [voice-co-presence] BestFriendCardRenderer + AffinityCardRenderer 구현
                       (공통 canvas/ 헬퍼 + UserPrivacyConfigService.filterPeers 사용)
  [voice-co-presence] bot-co-presence.controller.ts에 신규 엔드포인트 2종 추가
  [gemini] VoiceAiAnalysisService.generateBestFriendComment() 추가
  [bot] /best-friend, /affinity, /privacy 슬래시 커맨드 구현
  [web] /settings/me/privacy 페이지 + API 클라이언트 + 사이드바 메뉴
     |
     v
Phase 3 (Phase 2 완료 후):
  [weekly-report] WeeklyReportService에 친밀도 섹션 통합
                   (CoPresenceAnalyticsService + UserPrivacyConfigService 둘 다 의존)
```

#### 병렬 실행 그룹 요약

| 그룹 | 영역 | 선행 조건 |
|------|------|-----------|
| Phase 0-A | `apps/api/src/common/canvas/` 추출 | 없음 |
| Phase 0-B | `libs/bot-api-client` 타입/메서드 추가 | 없음 |
| Phase 1-A | user-privacy 도메인 모듈 | Phase 0-A (canvas 모듈 이름 충돌 회피용 빈 의존) — 사실 독립 가능 |
| Phase 1-B | `getMyTopPeers()` 추가 | 없음 |
| Phase 2-A | voice-co-presence 카드 렌더러 + bot-api 엔드포인트 | Phase 0-A + Phase 0-B + Phase 1-A + Phase 1-B |
| Phase 2-B | bot 슬래시 커맨드 3종 | Phase 0-B (BotApiClientService 메서드) |
| Phase 2-C | gemini AI 코멘트 메서드 | 없음 (단독) |
| Phase 2-D | web 사생활 페이지 + 사이드바 | Phase 1-A (API 컨트롤러) |
| Phase 3 | weekly-report 친밀도 섹션 | Phase 2-A (`CoPresenceAnalyticsService.getTopPairs()` 기존 메서드 + `UserPrivacyConfigService.filterPeers()`) |

#### 파일 충돌 위험 매트릭스

| 파일 | 수정하는 영역 | 충돌 방지 방법 |
|------|--------------|---------------|
| `apps/api/src/channel/voice/application/profile-card-renderer.ts` | Phase 0-A (헬퍼 추출) | 단독 PR, Phase 0 완료 후 voice-co-presence 작업 시작 |
| `libs/bot-api-client/src/types.ts` | Phase 0-B (신규 타입) | bot + api 양측이 의존하므로 단독 PR로 선행 머지 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | Phase 0-B (신규 메서드) | bot + api 양측이 의존하므로 단독 PR로 선행 머지 |
| `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` | 기존 (Co-Presence 스냅샷 수신) + Phase 2-A (베프/친밀도 응답) | 단일 컨트롤러 파일에 신규 핸들러 추가 — voice-co-presence 도메인 단독 수정 |
| `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts` | Phase 2-C (gemini, 신규 메서드) | gemini 도메인 단독 수정. Phase 3에서 weekly-report가 메서드 호출만 함 |
| `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts` | Phase 3 (weekly-report 단독) | 충돌 없음 |
| `apps/web/app/components/SettingsSidebar.tsx` | Phase 2-D (web 사이드바 메뉴 추가) | web 도메인 개발자가 일괄 수정 (Part A-2 정책 동일) |
| `apps/api/src/channel/voice/co-presence/co-presence.module.ts` | Phase 2-A (UserPrivacyModule + CanvasModule import 추가, 렌더러 providers 등록) | voice-co-presence 도메인 단독 수정 |
| `apps/bot/src/command/bot-command.module.ts` | Phase 2-B (커맨드 3종 등록) | bot 도메인 단독 수정 |

---

## Part A. gemini + web 도메인 (기존)

### A-1. 공유 타입: `libs/shared/src/types/diagnosis.ts`, `libs/shared/src/types/weekly-report.ts`

**사용 도메인**: gemini(voice-analytics API 백엔드), web(진단 대시보드 + 주간 리포트 설정 페이지)

gemini PRD의 REST API 5종(F-WEB-016)과 주간 리포트 설정 API 2종(F-WEB-017)의 요청/응답 타입은 API 백엔드(컨트롤러 응답 타입)와 Web 프론트엔드(API 클라이언트 반환 타입)가 동일하게 참조한다. `libs/shared`에 공유 타입을 정의하여 양쪽의 타입 불일치를 방지한다.

#### A-1.1 서버 진단 대시보드 API 응답 타입

```typescript
// libs/shared/src/types/diagnosis.ts

/** GET /api/guilds/{guildId}/voice-analytics/summary?days=N */
export interface DiagnosisSummaryResponse {
  daily: DailyTrendItem[];
}

export interface DailyTrendItem {
  date: string;
  totalSec: number;
  activeUsers: number;
}

/** GET /api/guilds/{guildId}/voice-analytics/health-score?days=N */
export interface HealthScoreResponse {
  score: number;
  prevScore: number;
  delta: number;
  diagnosis: string;
}

/** GET /api/guilds/{guildId}/voice-analytics/leaderboard?days=N&page=P&limit=L */
export interface LeaderboardResponse {
  users: LeaderboardUser[];
  total: number;
}

export interface LeaderboardUser {
  rank: number;
  userId: string;
  nickName: string;
  avatarUrl: string | null;
  totalSec: number;
  micOnSec: number;
  activeDays: number;
}

/** GET /api/guilds/{guildId}/voice-analytics/channel-stats?days=N */
export interface ChannelStatsResponse {
  channels: ChannelStatItem[];
}

export interface ChannelStatItem {
  channelId: string;
  channelName: string;
  categoryId: string | null;
  categoryName: string | null;
  totalSec: number;
  uniqueUsers: number;
}

/** POST /api/guilds/{guildId}/voice-analytics/ai-insight?days=N */
export interface AiInsightResponse {
  insights: string;
  suggestions: string[];
  generatedAt: string;
}
```

#### A-1.2 주간 리포트 설정 API 타입

```typescript
// libs/shared/src/types/weekly-report.ts

/** GET/POST /api/guilds/{guildId}/weekly-report/config */
export interface WeeklyReportConfigDto {
  isEnabled: boolean;
  channelId: string | null;
  dayOfWeek: number;
  hour: number;
  timezone: string;
}
```

#### A-1.3 exports 등록

```typescript
// libs/shared/src/types/index.ts 에 추가
export type {
  DiagnosisSummaryResponse,
  DailyTrendItem,
  HealthScoreResponse,
  LeaderboardResponse,
  LeaderboardUser,
  ChannelStatsResponse,
  ChannelStatItem,
  AiInsightResponse,
} from './diagnosis';

export type { WeeklyReportConfigDto } from './weekly-report';
```

#### 참조 위치

| 소비자 | 파일 | 용도 |
|--------|------|------|
| API 백엔드 | `apps/api/src/voice-analytics/presentation/voice-analytics.controller.ts` | REST API 응답 타입으로 사용 |
| API 백엔드 | 주간 리포트 설정 컨트롤러 (신규) | 설정 조회/저장 응답 타입 |
| Web 프론트엔드 | `apps/web/app/lib/diagnosis-api.ts` (신규) | API 클라이언트 반환 타입 |
| Web 프론트엔드 | `apps/web/app/lib/weekly-report-api.ts` (신규) | API 클라이언트 반환 타입 |

---

### A-2. 사이드바 메뉴 항목: `DashboardSidebar.tsx`, `SettingsSidebar.tsx`

**사용 도메인**: gemini(서버 진단 대시보드 라우트), web(사이드바 UI 렌더링)

PRD F-WEB-015에 따라 사이드바는 그룹 기반 구조로 구성되며, F-WEB-016/F-WEB-017에 의해 아래 메뉴가 추가된다.

| 사이드바 | 그룹 | 메뉴 항목 | 라우트 |
|----------|------|-----------|--------|
| DashboardSidebar | 분석 | 서버 진단 | `/dashboard/guild/{guildId}/diagnosis` |
| SettingsSidebar | 분석 | 서버 진단 | `/settings/guild/{guildId}/diagnosis` |

#### 충돌 방지 규칙

- `refactor/sidebar-menu-grouping` 브랜치가 develop에 머지된 후에 gemini/web 작업 브랜치를 분기한다.
- **gemini 도메인 개발자는 사이드바 파일을 직접 수정하지 않는다.**
- **web 도메인 개발자가 사이드바에 "서버 진단" 메뉴 항목과 크로스링크(대시보드-설정 연결)를 일괄 반영한다.**

---

### A-3. Next.js API 프록시 라우트: `apps/web/app/api/guilds/[...path]/route.ts`

**사용 도메인**: gemini(voice-analytics API 경로 정의), web(프론트엔드에서 백엔드 프록시)

기존 `[...path]/route.ts`는 `/api/guilds/:guildId/*` 요청을 NestJS 백엔드로 프록시하며 JWT 토큰을 자동 주입한다. 와일드카드 패턴으로 모든 guild 하위 경로를 처리하므로 추가 수정이 불필요하다.

#### 충돌 방지 규칙

- 기존 `[...path]/route.ts`는 와일드카드 매칭이므로 gemini/web 어느 쪽에서도 이 파일을 수정할 필요가 없다.
- 특정 경로에 커스텀 프록시 로직이 필요해지는 경우 web 도메인에서만 수정한다.

---

### A-4. VoiceAnalyticsService 데이터 집계 메서드

**사용 도메인**: gemini(F-GEMINI-005 `/서버진단` 커맨드 + F-GEMINI-006 주간 리포트 + REST API 5종), web(F-WEB-016 대시보드에서 REST API 호출)

`VoiceAnalyticsService`는 기존에 `collectVoiceActivityData()` 메서드로 `VoiceDailyEntity` 데이터를 집계한다. 신규 REST API 5종과 `/서버진단` 커맨드, 주간 리포트 모두 이 서비스의 집계 로직을 기반으로 동작한다.

#### 신규 메서드 목록

| 메서드 | 반환 타입 | 호출자 |
|--------|----------|--------|
| `getDailySummary(guildId, days)` | `DailyTrendItem[]` | REST API summary 엔드포인트, `/서버진단` 커맨드, 주간 리포트 |
| `getHealthScore(guildId, days)` | `{ score, prevScore, delta }` | REST API health-score 엔드포인트, `/서버진단` 커맨드 |
| `getLeaderboard(guildId, days, page, limit)` | `{ users: LeaderboardUser[], total }` | REST API leaderboard 엔드포인트, `/서버진단` 커맨드(TOP 3), 주간 리포트(TOP 5) |
| `getChannelStats(guildId, days)` | `ChannelStatItem[]` | REST API channel-stats 엔드포인트, 주간 리포트(TOP 3 채널) |

#### 충돌 방지 규칙

- 위 메서드들은 **gemini 도메인 개발자가 `VoiceAnalyticsService`에 추가**한다.
- web 도메인 개발자는 이 서비스를 직접 수정하지 않으며 REST API를 통해서만 데이터를 소비한다.
- 기존 메서드(`collectVoiceActivityData`, `getDateRange` 등)의 시그니처는 변경하지 않는다.

---

### A-5. 기존 공유 모듈: 변경 불필요 확인

아래 모듈은 이미 존재하며 gemini/web 양쪽에서 참조하지만 이번 작업에서 변경이 불필요하다. 병렬 개발 시 충돌 위험이 없음을 확인한다.

| 모듈 | 위치 | 역할 | 변경 필요 여부 |
|------|------|------|---------------|
| LLM 추상화 레이어 | `apps/api/src/common/llm/` | `LlmProvider` 인터페이스 + `GeminiLlmProvider` 구현체 | 변경 없음. F-GEMINI-005, F-GEMINI-006 모두 기존 `LlmProvider.generateText()` 사용 |
| Resilience Policy | `apps/api/src/common/resilience/resilience.policy.ts` | Circuit Breaker + Retry + Timeout | 변경 없음. 기존 정책 그대로 사용 |
| 공통 API 클라이언트 | `apps/web/app/lib/api-client.ts` | `apiClient<T>()`, `apiGet<T>()` fetch 래퍼 | 변경 없음. 신규 `diagnosis-api.ts`, `weekly-report-api.ts`에서 import하여 사용 |
| JWT Auth Guard | `apps/api/src/auth/infrastructure/jwt-auth.guard.ts` | REST API 인증 | 변경 없음 |
| Guild Membership Guard | `apps/api/src/common/guards/guild-membership.guard.ts` | Guild 접근 제어 | 변경 없음 |
| VoiceActivityData 타입 | `libs/shared/src/types/index.ts` | 기존 voice-analytics 집계 데이터 타입 | 변경 없음 |
| PaginatedResponse 타입 | `libs/shared/src/types/index.ts` | 페이지네이션 공통 타입 | 변경 없음 |
| WeeklyReportConfigOrmEntity | `apps/api/src/voice-analytics/weekly-report/infrastructure/weekly-report-config.orm-entity.ts` | DB 엔티티 (이미 생성됨) | 변경 없음 |
| DB 마이그레이션 | `apps/api/src/migrations/1776200000000-AddWeeklyReportConfig.ts` | 테이블 생성 (이미 생성됨) | 변경 없음 |

---

### A-6. gemini + web 구현 분담 명세

#### gemini(voice-analytics) 도메인 담당

| 항목 | 설명 |
|------|------|
| `libs/shared/src/types/diagnosis.ts` | 공유 타입 파일 생성 |
| `libs/shared/src/types/weekly-report.ts` | 공유 타입 파일 생성 |
| `libs/shared/src/types/index.ts` | 신규 타입 re-export 추가 |
| `VoiceAnalyticsService` 신규 메서드 4종 | getDailySummary, getHealthScore, getLeaderboard, getChannelStats |
| `VoiceAnalyticsController` 신규 엔드포인트 5종 | summary, health-score, leaderboard, channel-stats, ai-insight |
| 주간 리포트 설정 컨트롤러 + 서비스 | `GET/POST /api/guilds/:guildId/weekly-report/config` |
| 주간 리포트 스케줄러 + 전송 서비스 | `WeeklyReportScheduler`, `WeeklyReportService` |
| `/서버진단` 슬래시 커맨드 | `server-diagnosis.command.ts` |
| 기존 4개 슬래시 커맨드 삭제 | `/voice-stats`, `/my-voice-stats`, `/community-health`, `/voice-leaderboard` |

#### web 도메인 담당

| 항목 | 설명 |
|------|------|
| `apps/web/app/lib/diagnosis-api.ts` | 서버 진단 API 클라이언트 (공유 타입 import) |
| `apps/web/app/lib/weekly-report-api.ts` | 주간 리포트 설정 API 클라이언트 (공유 타입 import) |
| `apps/web/app/dashboard/guild/[guildId]/diagnosis/` | 서버 진단 대시보드 페이지 + 컴포넌트 5종 |
| `apps/web/app/settings/guild/[guildId]/diagnosis/` | 주간 리포트 설정 페이지 |
| `DashboardSidebar.tsx` | "분석" 그룹에 "서버 진단" 메뉴 항목 추가 |
| `SettingsSidebar.tsx` | "분석" 그룹에 "서버 진단" 메뉴 항목 추가 |

#### 의존 순서

```
1. [gemini] libs/shared 공유 타입 생성 (diagnosis.ts, weekly-report.ts, index.ts re-export)
     |
     v
2. [gemini] VoiceAnalyticsService 신규 메서드 + VoiceAnalyticsController 엔드포인트 5종
   [gemini] 주간 리포트 설정 API + 스케줄러 + 전송 서비스
   [gemini] /서버진단 커맨드 구현 + 기존 커맨드 4종 삭제
     |                  (병렬)
   [web] diagnosis-api.ts, weekly-report-api.ts API 클라이언트 구현
   [web] 서버 진단 대시보드 페이지 + 컴포넌트 5종 구현
   [web] 주간 리포트 설정 페이지 구현
   [web] 사이드바 메뉴 항목 추가
```

단계 1(공유 타입 생성)이 완료되면 gemini와 web은 독립적으로 병렬 진행 가능하다.

---

## Part B. monitoring 전환 (신규)

> 5개 변경 영역: monitoring 도메인(API), bot 프로세스, web 프론트엔드, 인프라, 공유 라이브러리(libs/)

### B-1. 공유 라이브러리 정리: `libs/bot-api-client`

**관련 영역**: monitoring 도메인(API) + bot 프로세스

`libs/bot-api-client`는 Bot -> API 통신 모듈로, monitoring 관련 코드가 API측과 Bot측 양쪽에서 참조된다. 기존 모니터링 Push 방식 제거 시 양측이 동시에 의존하는 코드를 먼저 정리해야 한다.

#### 제거 대상

| 파일 | 제거 항목 | 참조하는 영역 |
|------|-----------|--------------|
| `libs/bot-api-client/src/types.ts` | `BotGuildMetric` 인터페이스 | bot(`BotMonitoringScheduler`), api(`BotMonitoringController`) |
| `libs/bot-api-client/src/types.ts` | `BotStatusPayload` 인터페이스 | bot(`BotMonitoringScheduler`), api(`BotMonitoringController`) |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `pushBotMetrics()` 메서드 | bot(`BotMonitoringScheduler`) |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `pushBotStatus()` 메서드 | bot(`BotMonitoringScheduler`) |

#### 충돌 방지 규칙

- 이 파일들은 bot 영역과 api 영역 양쪽에서 import하므로, **가장 먼저 제거**해야 한다.
- 제거 후 bot과 api의 컴파일이 깨지므로, 각 영역에서 해당 import를 함께 정리해야 한다.

---

### B-2. `DashboardSidebar.tsx`: "봇 모니터링" 메뉴 항목 제거

**관련 영역**: monitoring 도메인(API) + web 프론트엔드

`apps/web/app/components/DashboardSidebar.tsx`는 Part A의 gemini+web 작업에서 "서버 진단" 메뉴를 추가하는 파일과 동일하다. monitoring 전환에서는 "봇 모니터링" 메뉴 항목을 제거한다.

#### 변경 내용

| 사이드바 | 변경 | 설명 |
|----------|------|------|
| DashboardSidebar | "봇 모니터링" 항목 제거 | 시스템 그룹에서 `/dashboard/guild/{guildId}/monitoring` 라우트 삭제 |

#### 충돌 방지 규칙

- Part A의 web 도메인 작업과 동일 파일을 수정한다. **사이드바 변경은 한 영역(web)에서만 수행**한다.
- monitoring 전환 작업이 사이드바를 직접 수정하지 않고, web 도메인 개발자가 일괄 반영한다.

---

### B-3. `docker-compose.yml`: 인프라 서비스 추가

**관련 영역**: 인프라 + monitoring 도메인(API) + bot 프로세스

`docker-compose.yml`은 현재 api, bot, web, db, redis 서비스를 정의한다. monitoring 전환에서 Prometheus, Grafana, Alertmanager, Node Exporter, postgres-exporter, redis-exporter 6개 서비스를 추가한다. 동시에 api와 bot 서비스의 포트 노출 설정이 Prometheus scrape과 관련된다.

#### 추가 서비스

| 서비스 | 이미지 | 포트 | 역할 |
|--------|--------|------|------|
| `prometheus` | `prom/prometheus:latest` | 9090 | 메트릭 수집/저장 |
| `grafana` | `grafana/grafana:latest` | 3002 | 시각화 대시보드 |
| `alertmanager` | `prom/alertmanager:latest` | 9093 | 알림 라우팅 (Discord webhook) |
| `node-exporter` | `prom/node-exporter:latest` | 9100 | 호스트 시스템 메트릭 |
| `postgres-exporter` | `prometheuscommunity/postgres-exporter` | 9187 | PostgreSQL 메트릭 |
| `redis-exporter` | `oliver006/redis_exporter` | 9121 | Redis 메트릭 |

#### 추가 볼륨

| 볼륨 | 용도 |
|------|------|
| `prometheus_data` | Prometheus 시계열 데이터 영구 저장 |
| `grafana_data` | Grafana 설정/대시보드 영구 저장 |

#### 충돌 방지 규칙

- `docker-compose.yml`은 인프라 영역에서만 수정한다. api/bot 코드 변경과는 별개 파일이므로 충돌 위험이 낮다.
- 다만 다른 도메인 작업에서 `docker-compose.yml`에 서비스를 추가하는 경우 충돌할 수 있으므로, **인프라 변경은 단독 커밋**으로 진행한다.

---

### B-4. `prom-client` 의존성: api + bot 동시 설치

**관련 영역**: monitoring 도메인(API) + bot 프로세스

PRD F-MONITORING-010에 따라 API 서버와 Bot 서버 모두 `prom-client` 패키지를 사용하여 `GET /metrics` 엔드포인트를 노출한다. 현재 두 패키지 모두 `prom-client`를 의존성에 포함하지 않는다.

#### 설치 대상

| 패키지 | 설치 명령 |
|--------|-----------|
| `@onyu/api` | `pnpm --filter @onyu/api add prom-client` |
| `@onyu/bot` | `pnpm --filter @onyu/bot add prom-client` |

#### 충돌 방지 규칙

- `pnpm-lock.yaml`은 루트에서 관리되므로 두 패키지의 의존성 추가가 동시에 일어나면 lock 파일 충돌이 발생한다.
- **의존성 설치는 하나의 커밋에서 두 패키지 동시에 수행**한다.

---

### B-5. 기존 공유 모듈: 변경 불필요 확인

아래 모듈/파일은 monitoring 전환 영역 간 공유되지만, 이번 작업에서 수정이 불필요하거나 단일 영역에서만 수정하므로 공통 모듈에 해당하지 않는다.

| 항목 | 위치 | 이유 |
|------|------|------|
| `BotApiAuthGuard` | `apps/api/src/bot-api/bot-api-auth.guard.ts` | bot-api 모니터링 컨트롤러 제거 시 참조만 줄어들 뿐 guard 자체는 변경 없음 |
| `RedisService` | `apps/api/src/redis/redis.service.ts` | monitoring 키 제거는 코드 삭제에 해당하며 RedisService 자체 변경 없음 |
| `BotApiModule` | `apps/api/src/bot-api/bot-api.module.ts` | `BotMonitoringController` import 제거는 api 단일 영역 작업 |
| `AppModule (api)` | `apps/api/src/app.module.ts` | `MonitoringModule` import 변경은 api 단일 영역 작업 |
| `AppModule (bot)` | `apps/bot/src/app.module.ts` | 스케줄러 모듈 변경은 bot 단일 영역 작업 |
| `BotSchedulerModule` | `apps/bot/src/scheduler/bot-scheduler.module.ts` | `BotMonitoringScheduler` 제거는 bot 단일 영역 작업 |

---

### B-6. monitoring 전환 구현 분담 명세

5개 변경 영역을 역할별로 분류한다.

#### 영역 1: 공유 라이브러리 정리 (선행 작업)

| 항목 | 설명 |
|------|------|
| `libs/bot-api-client/src/types.ts` | `BotGuildMetric`, `BotStatusPayload` 인터페이스 제거 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | `pushBotMetrics()`, `pushBotStatus()` 메서드 제거 |

#### 영역 2: monitoring 도메인 - API (기존 제거 + 신규 추가)

| 항목 | 설명 |
|------|------|
| `apps/api/src/monitoring/` | 기존 디렉터리 전체 제거 (module, controller, service, scheduler, repository, orm-entity, types) |
| `apps/api/src/bot-api/monitoring/` | `BotMonitoringController` 제거 |
| `apps/api/src/bot-api/bot-api.module.ts` | `MonitoringModule` import 및 `BotMonitoringController` 등록 제거 |
| `apps/api/src/app.module.ts` | `MonitoringModule` import 제거 |
| `apps/api/src/monitoring/monitoring.module.ts` (신규) | prom-client 기반 모듈 신규 생성 |
| `apps/api/src/monitoring/prometheus.service.ts` (신규) | `prom-client` 레지스트리 + 커스텀 메트릭 정의 |
| `apps/api/src/monitoring/metrics.controller.ts` (신규) | `GET /metrics` 엔드포인트 |
| `apps/api/src/monitoring/http-metrics.interceptor.ts` (신규) | HTTP 요청 지연/카운트 자동 계측 인터셉터 |
| DB 마이그레이션 | `bot_metric` 테이블 드롭 마이그레이션 |

#### 영역 3: bot 프로세스 (기존 제거 + 신규 추가)

| 항목 | 설명 |
|------|------|
| `apps/bot/src/scheduler/bot-monitoring.scheduler.ts` | `BotMonitoringScheduler` 제거 |
| `apps/bot/src/scheduler/bot-scheduler.module.ts` | `BotMonitoringScheduler` 등록 제거 |
| `apps/bot/src/monitoring/bot-metrics.module.ts` (신규) | 봇 메트릭 모듈 |
| `apps/bot/src/monitoring/bot-metrics.controller.ts` (신규) | `GET /metrics` 엔드포인트 |
| `apps/bot/src/monitoring/bot-prometheus.service.ts` (신규) | 커스텀 봇 메트릭 정의 + 15초 갱신 스케줄러 |
| `apps/bot/src/app.module.ts` | `BotMetricsModule` import 추가 |

#### 영역 4: web 프론트엔드 (제거)

| 항목 | 설명 |
|------|------|
| `apps/web/app/lib/monitoring-api.ts` | 파일 전체 삭제 |
| `apps/web/app/dashboard/guild/[guildId]/monitoring/` | 디렉터리 전체 삭제 (page.tsx + 컴포넌트 5종) |
| `apps/web/app/components/DashboardSidebar.tsx` | "봇 모니터링" 메뉴 항목 제거 |

#### 영역 5: 인프라 (신규)

| 항목 | 설명 |
|------|------|
| `docker-compose.yml` | 6개 인프라 서비스 + 2개 볼륨 추가 |
| `infra/prometheus/prometheus.yml` | Prometheus 스크레이프 설정 |
| `infra/prometheus/alert.rules.yml` | Alertmanager 알림 규칙 5종 |
| `infra/grafana/provisioning/datasources/prometheus.yaml` | Grafana datasource 프로비저닝 |
| `infra/grafana/provisioning/dashboards/onyu-bot-status.json` | 봇 상태 대시보드 |
| `infra/grafana/provisioning/dashboards/onyu-infra.json` | 인프라 대시보드 |

---

### B-7. monitoring 전환 의존 순서 및 병렬화

```
Phase 0 (선행, 단독):
  [공유] libs/bot-api-client 모니터링 코드 제거 (types + service)
  [공유] prom-client 의존성 설치 (api + bot 동시)
     |
     v
Phase 1 (병렬 가능):
  [api]   기존 monitoring 디렉터리 전체 제거 + bot-api 모니터링 컨트롤러 제거
  [bot]   BotMonitoringScheduler 제거
  [web]   monitoring 페이지/API 클라이언트/사이드바 항목 제거
  [infra] infra/ 디렉터리 생성 + prometheus/grafana 설정 파일 작성
     |
     v
Phase 2 (병렬 가능, Phase 1 완료 후):
  [api]   prom-client 기반 신규 monitoring 모듈 구현
          (prometheus.service, metrics.controller, http-metrics.interceptor)
  [bot]   prom-client 기반 봇 메트릭 모듈 구현
          (bot-prometheus.service, bot-metrics.controller)
  [infra] docker-compose.yml 인프라 서비스 추가
     |
     v
Phase 3 (통합):
  [api]   bot_metric 테이블 드롭 마이그레이션 생성/실행
  [all]   통합 테스트 (Prometheus scrape 확인, Grafana 대시보드 로드 확인)
```

#### 병렬 실행 그룹 요약

| 그룹 | 영역 | 선행 조건 |
|------|------|-----------|
| Phase 0 | 공유 라이브러리(libs/) | 없음 |
| Phase 1-A | api 기존 코드 제거 | Phase 0 |
| Phase 1-B | bot 기존 코드 제거 | Phase 0 |
| Phase 1-C | web 코드 제거 | 없음 (libs/ 미참조) |
| Phase 1-D | infra 설정 파일 작성 | 없음 (독립) |
| Phase 2-A | api 신규 모듈 구현 | Phase 1-A |
| Phase 2-B | bot 신규 모듈 구현 | Phase 1-B |
| Phase 2-C | docker-compose.yml 서비스 추가 | Phase 1-D |
| Phase 3 | DB 마이그레이션 + 통합 테스트 | Phase 2 전체 |

#### 파일 충돌 위험 매트릭스

아래는 2개 이상 영역이 동일 파일을 수정하는 경우를 정리한 것이다. 이 파일들이 병렬 작업 시 git conflict가 발생할 수 있는 지점이다.

| 파일 | 수정하는 영역 | 충돌 방지 방법 |
|------|--------------|---------------|
| `libs/bot-api-client/src/types.ts` | Phase 0에서 단독 수정 | Phase 0 완료 후 Phase 1 시작 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | Phase 0에서 단독 수정 | Phase 0 완료 후 Phase 1 시작 |
| `pnpm-lock.yaml` | api 의존성 + bot 의존성 | 하나의 커밋에서 동시 설치 |
| `docker-compose.yml` | 인프라 영역 단독 | 단독 커밋으로 진행 |
| `DashboardSidebar.tsx` | web(monitoring 메뉴 제거) + web(gemini 메뉴 추가) | web 도메인 개발자가 일괄 처리 |

---

## Part C. Part A + Part B 교차 의존성

Part A(gemini+web)와 Part B(monitoring 전환) 간 공유 파일이 있는지 확인한다.

| 공유 파일 | Part A | Part B | 충돌 방지 |
|-----------|--------|--------|-----------|
| `DashboardSidebar.tsx` | "서버 진단" 메뉴 추가 | "봇 모니터링" 메뉴 제거 | web 도메인 개발자가 양쪽 변경을 하나의 커밋으로 일괄 반영 |
| `libs/shared/src/types/index.ts` | 신규 타입 re-export 추가 | 변경 없음 | 충돌 없음 |
| `apps/api/src/app.module.ts` | 변경 없음 | `MonitoringModule` import 변경 | 충돌 없음 |

유일한 교차 충돌 지점은 `DashboardSidebar.tsx`이며, 이는 web 도메인 개발자가 통합하여 처리한다.

---

## Part E. Part D + Part A/B 교차 의존성

Part D(친밀도/베프 Phase 5)와 기존 Part A/B 간 공유 파일을 확인한다.

| 공유 파일 | Part A/B | Part D | 충돌 방지 |
|-----------|----------|--------|-----------|
| `libs/bot-api-client/src/types.ts` | Part B에서 monitoring 타입 제거 | Part D에서 `CanvasCardResponse`, `BestFriendCardResponse`, `AffinityCardResponse` 신규 추가 | 단독 PR로 분리 머지. Part B 완료 후 Part D Phase 0-B 시작 |
| `libs/bot-api-client/src/bot-api-client.service.ts` | Part B에서 monitoring 메서드 제거 | Part D에서 `getMyBestFriends()`, `getAffinity()` 신규 추가 | 단독 PR로 분리 머지 |
| `apps/web/app/components/SettingsSidebar.tsx` | Part A에서 "서버 진단" 메뉴 추가 | Part D에서 "사생활" 개인 설정 메뉴 추가 | web 도메인 개발자가 양쪽 변경을 하나의 커밋으로 일괄 반영 |
| `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts` | Part A에서 신규 분석 메서드 4종 추가 | Part D Phase 2-C에서 `generateBestFriendComment()` 추가 | gemini 도메인 단독 수정 — Part A 완료 후 Part D 작업 시작 |
| `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts` | Part A에서 `WeeklyReportService` 신규 작성 | Part D Phase 3에서 친밀도 섹션 통합 | Part A 완료가 Part D Phase 3 선행 조건. weekly-report 도메인 개발자가 일괄 |
| `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` | (변경 없음) | Part D에서 `getMyTopPeers()` 신규 메서드 추가 | voice-co-presence 단독 수정 |
| `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` | (변경 없음) | Part D에서 신규 핸들러 2종 추가 | voice-co-presence 단독 수정 |
| `apps/api/src/channel/voice/application/profile-card-renderer.ts` | (변경 없음) | Part D Phase 0-A에서 헬퍼 추출 리팩토링 | 단독 PR로 선행 머지 |

본 Phase 5는 Part A/B와 직접 충돌하는 지점이 거의 없으나, `libs/bot-api-client`와 사이드바 파일이 공통 충돌 지점이므로 PR 머지 순서를 다음과 같이 강제한다.

```
Part A (gemini+web)        ──┐
Part B (monitoring 전환)   ──┤── 모두 develop 머지 완료
                              │
                              v
Part D Phase 0 (canvas 추출 + bot-api-client 신규 타입/메서드)
                              │
                              v
Part D Phase 1~3
```

---

## Part F. 설정 저장/반영 모델 통일 (settings-apply-model)

> 입력 PRD: `docs/specs/prd/settings-apply-model.md`
> 입력 Userflow: `docs/specs/userflow/settings-apply-model.md`
> DB 설계(진실 소스): `docs/specs/database/_index.md` §"엔티티 / 마이그레이션 변경 계획 — settings-apply-model (lastAppliedAt)"
> 영향 도메인: **status-prefix · sticky-message · role-panel · auto-channel** (4개 — 모두 병렬 개발)
> 후속 작업: 도메인별 plan-writer 4명이 각자 `docs/plans/` 에 상세 구현 계획 작성

본 Part는 **2개 이상 도메인이 공유**하여 병렬 작업 시 git conflict 가 발생할 수 있는 공통 계약만 다룬다. 도메인별 service 내부 구현(어느 메서드 어느 줄에서 stamp 하는지, 페이지 레이아웃 등)은 **plan-writer 가 채울 항목**으로 위임하며, 본 문서는 4개 plan 이 어긋나지 않도록 **경계와 규약**을 고정한다.

### F-0. 사전 확인된 코드베이스 사실 (plan-writer 공통 전제)

병렬 작업 전 모든 plan-writer 가 동일하게 알아야 할, 코드 조사로 확정된 사실:

| 사실 | 내용 | 출처 |
|------|------|------|
| **Discord 메시지는 API 측에서 전송** | 4개 도메인 모두 봇(`apps/bot`)이 아니라 **API 서버**의 도메인 `infrastructure/*-discord.adapter.ts`(또는 `*-discord.gateway.ts`)에서 Discord 메시지를 직접 post/edit 하고 `messageId`(auto-channel 은 `guideMessageId`)를 DB 에 저장한다. PRD/userflow 의 "🔒 봇에 반영 요청 전달" 표현은 개념적이며, **실제 stamp 지점은 API service** 다. | Explore 코드 조사 |
| **저장 후 동기화 구조 이미 존재** | 각 도메인 `Service.saveConfig()`(role-panel 은 `RolePanelPublishService.publish()`/`resyncOnUpdate()`)가 이미 `DB upsert → Redis 캐시 갱신 → Discord 전송/갱신 → messageId 저장` 흐름을 수행한다. 본 작업은 이 흐름의 **Discord 전송 성공 직후 stamp 1줄 + 응답 DTO 1필드** 추가가 핵심이다. | Explore 코드 조사 |
| **"현재 config 로 재게시" 메서드 이미 존재** | status-prefix `buildAndSendMessage()` · sticky-message `sendEmbed()` · role-panel `publish()`/`resyncOnUpdate()` · auto-channel `sendOrEditGuideMessage()` — 모두 현재 저장된 config 로 디스코드에 재게시 가능한 내부 경로를 이미 보유. "다시 반영" 엔드포인트는 이를 재활용한다(F-3 참조). | Explore 코드 조사 |
| **인가는 모두 동일** | 4개 도메인 설정 controller 의 모든 엔드포인트가 `@UseGuards(JwtAuthGuard, GuildMembershipGuard)` 를 사용한다. 신규 "다시 반영" 엔드포인트도 **반드시 동일 가드** 사용(`@Roles` / SuperAdminGuard 아님). | Explore 코드 조사 + PRD §사용자 확인 |
| **DB 컬럼/마이그레이션 이미 설계됨** | `lastAppliedAt`(status-prefix/sticky-message/role-panel) / `lastSavedAt`(auto-channel) 컬럼 추가 + 단일 마이그레이션(`1777600000000-SettingsApplyLastAppliedAtInit`)은 DB 설계 문서에 확정. plan-writer 는 **재설계하지 말고 DB 문서를 참조**한다. | `database/_index.md` |
| **기존 apply i18n 키 없음** | `libs/i18n/locales/{ko,en}/web/settings.json` 에 `apply*` / `lastApplied*` / `reApply*` 키가 전무 → 신규 키 충돌 없음. `settings.json` 은 도메인별 네임스페이스(`common`/`statusPrefix`/`stickyMessage`/`rolePanel`/`autoChannel`) 구조이며 공통 키는 `settings.common` 에 둔다. | i18n grep |

### F-1. 데이터/stamp 규약 (4개 도메인 공통)

**원칙: "반영 성공 직후 stamp"** — `lastAppliedAt`(또는 `lastSavedAt`)은 **봇이 실제 디스코드 메시지를 post/edit 한 시점(=messageId 갱신 지점)에만** `now()` 로 stamp 한다.

| 규약 | 내용 |
|------|------|
| 컬럼 | DB 설계 문서 §settings-apply-model 참조 (재정의 금지). `nullable timestamptz`, NULL=미반영. |
| stamp 트리거 | Discord 메시지 post/edit **성공 응답 수신 직후** (= `messageId`/`guideMessageId` 를 DB 에 쓰는 바로 그 지점). |
| stamp **안 함** | ① Discord API 호출 실패 ② sticky-message `enabled=false` (전송 건너뜀) ③ role-panel `channelId IS NULL` (유효성 오류로 저장 차단) ④ DB persist 만 하고 Discord 전송이 없는 경로. |
| auto-channel 예외 | Discord 메시지 게시가 없으므로 `lastSavedAt` 은 **DB persist 성공 직후** stamp(저장 시각 = 반영 시각). |
| 트랜잭션 | `messageId` 저장과 `lastAppliedAt` stamp 는 **동일 트랜잭션 또는 직후 연속** 처리 — 둘이 어긋나면 안 됨. |
| **plan-writer 가 채울 항목** | 각 도메인 service 의 정확한 stamp 코드 위치(파일/메서드/줄). 아래 표가 후보 진입점이며 plan-writer 가 최종 확정. |

#### stamp 진입점 후보 (plan-writer 확정 대상)

| 도메인 | 후보 stamp 위치 | messageId 저장 메서드(인접) |
|--------|----------------|---------------------------|
| status-prefix | `apps/api/src/status-prefix/application/status-prefix*.service.ts` — `buildAndSendMessage()` 성공 후 | `configRepo.updateMessageId()` |
| sticky-message | `apps/api/src/sticky-message/application/sticky-message*.service.ts` — `sendEmbed()` 성공 후 (레코드 `id` 단위) | `configRepo.updateMessageId()` |
| role-panel | `apps/api/src/role-panel/application/*publish*.service.ts` — `publish()`/`resyncOnUpdate()` 의 Discord 전송 성공 후 | `configRepo.updateMessageId(panelId, msgId, true)` |
| auto-channel | `apps/api/src/channel/auto/` — `save()` DB persist 성공 후 (`lastSavedAt`) | `configRepo.updateGuideMessageId()` |

> ⚠️ stamp 단위 주의: **sticky-message 와 role-panel 은 레코드(채널/패널) 단위**로 독립 stamp 한다(`WHERE id=?`). status-prefix 는 길드당 1행, auto-channel 은 config 단위.

### F-2. API 응답 계약 + 봇/공유타입 동기화 규칙

#### F-2.1 응답 DTO 에 stamp 필드 추가

각 도메인의 **GET 설정 응답 + 저장 응답 + 다시 반영 응답** DTO 에 stamp 필드를 포함한다(웹이 페이지 재로드 없이 배지 갱신 가능하도록).

| 도메인 | 추가 필드 | 직렬화 형식 |
|--------|----------|------------|
| status-prefix / sticky-message / role-panel | `lastAppliedAt: string \| null` | ISO 8601 문자열 또는 null |
| auto-channel | `lastSavedAt: string \| null` | ISO 8601 문자열 또는 null |

> sticky-message 는 응답이 **배열(채널별 항목)** 이므로 각 항목에 `lastAppliedAt` 포함. role-panel 응답 DTO 는 이미 `createdAt/updatedAt/published` 를 직렬화하므로 동일 위치에 `lastAppliedAt` 추가.

#### F-2.2 봇 SDK ↔ @onyu/shared 동기화 규칙 (충돌 위험 지점)

`libs/bot-api-client/src/types.ts` 는 **bot 프로세스와 api 양쪽이 동시 import** 하는 최고 충돌 위험 파일이다. 다음 규칙을 강제한다.

| 규칙 | 내용 |
|------|------|
| 봇 SDK 변경 필요 여부 | 본 작업의 stamp 필드는 **웹↔API 응답** 에만 쓰인다. 봇은 `lastAppliedAt` 을 소비하지 않으므로 `libs/bot-api-client/src/types.ts` 의 봇용 DTO(`StickyMessageConfigItem`, `BotRolePanelConfigDto` 등)에는 **stamp 필드를 추가하지 않는다** (불필요 변경 회피 → 충돌면 최소화). |
| 한쪽만 바꾸면 런타임 불일치 | 만약 어느 plan-writer 가 봇 SDK 응답 타입에 필드를 추가해야 한다고 판단하면, **API 컨트롤러 응답 형태 + libs/bot-api-client 타입 + 봇 파서**를 **반드시 동일 PR 에서** 갱신한다. 한쪽만 변경 시 봇 런타임 파싱 불일치 발생. |
| 웹↔API 타입 위치 | 웹 클라이언트 반환 타입은 각 도메인 web api-client(`apps/web/app/lib/*-api.ts`)의 인터페이스에 `lastAppliedAt`/`lastSavedAt` 필드를 추가한다. (현재 4개 도메인 모두 `libs/shared` 공유 타입을 쓰지 않고 web/api 각자 정의 — 이 작업도 신규 공유타입을 만들지 않음. 도메인별 plan-writer 가 각자 web 타입에 1필드 추가.) |

> 결론: **본 작업은 `libs/bot-api-client` 와 `libs/shared` 를 건드리지 않는 것을 기본값**으로 한다. 각 도메인 plan 은 자기 도메인의 API DTO + web api-client 타입만 수정 → **도메인 간 공유 파일 충돌 0** 을 목표. (이것이 4 plan 병렬화의 핵심 이점.)

### F-3. "다시 반영" 엔드포인트 계약 (status-prefix / sticky-message / role-panel)

설정 변경 없이 현재 저장된 config 로 디스코드에 재게시(force re-apply)하는 엔드포인트의 공통 형태.

| 항목 | 공통 규약 |
|------|----------|
| **인가** | `@UseGuards(JwtAuthGuard, GuildMembershipGuard)` — 기존 저장 엔드포인트와 동일. (PRD §사용자확인: 신규 스코프/봇 권한 없음) |
| **method/path 패턴** | `POST /api/guilds/{guildId}/{domain}/{재게시 대상 식별자}/re-apply` 권장. 단위가 다르므로(아래) 도메인별 식별자가 다름. |
| **응답** | 갱신된 `lastAppliedAt` 을 **반드시 포함**(웹 배지 즉시 갱신용). 실패 시 stamp 미갱신 + 구체 사유(채널 없음/권한 부족) 에러. |
| **멱등성** | 반복 호출 시 항상 "최신 config 로 재게시" 동일 동작(PRD §11). |
| **기존 경로 재활용 vs 신규** | **기존 재게시 메서드 재활용 권고**(F-0 표의 `buildAndSendMessage`/`sendEmbed`/`publish` 등). plan-writer 는 자기 도메인 service 에 "현재 config 로 재게시" 경로가 이미 있는지 확인하고, 있으면 thin 엔드포인트로 감싼다. |

#### 도메인별 재게시 단위 + 권고

| 도메인 | 재게시 단위 | path 예시 | 권고 |
|--------|------------|----------|------|
| status-prefix | 길드당 1개 | `POST .../status-prefix/re-apply` | 기존 `buildAndSendMessage()` 재활용 |
| sticky-message | **채널(레코드 id) 단위** | `POST .../sticky-message/{id}/re-apply` | 기존 `sendEmbed()` 재활용. `enabled=false` 면 거부(UF-010). PRD IA 는 `{id}/re-apply` 로 명시. |
| role-panel | **패널 단위** | `POST .../role-panel/{panelId}/re-apply` 또는 기존 `{panelId}/publish` 유지 | **기존 `POST .../{panelId}/publish` 엔드포인트 재활용 권고**(PRD §4-3 참고 — 별도 신설 불필요). plan 이 publish 유지/deprecated 최종 결정. |
| auto-channel | — | — | **다시 반영 엔드포인트 없음**(1차 제외, PRD §4-4). |

> **plan-writer 가 채울 항목**: 각 도메인이 신규 `re-apply` 엔드포인트를 신설할지, 기존(`publish`) 을 재활용할지의 최종 결정 + 정확한 service 메서드 연결.

### F-4. role-panel 모델 collapse 공통 영향 (방향성만)

role-panel 은 기존 "저장→게시" 2단계를 "저장" 단일 액션으로 통합한다. **공통 원칙만 명시하고 상세는 role-panel plan 에 위임**.

| 원칙 | 내용 |
|------|------|
| save 통합 | `PUT /api/guilds/{guildId}/role-panel/{panelId}`(저장)이 DB persist + 즉시 디스코드 게시/갱신을 모두 수행(기존 publish 로직을 save 흐름에 통합). |
| 기존 publish 엔드포인트 | 폐지하지 않고 **"다시 반영" 용도로 재활용** 권고(F-3). deprecated 여부는 role-panel plan 이 결정. |
| `published` 컬럼 | 유지(파괴적 변경 금지). `lastAppliedAt IS NOT NULL` 일 때 `published=true` 로 관리 권장(PRD §4-3). |
| 웹 | "게시" 버튼 제거, "저장" 버튼 단일화. 버튼 라벨/설명은 i18n 키 수정으로 처리(F-6). |

> 이 항목은 **role-panel plan-writer 단독** 영역. 다른 3개 도메인 plan 은 role-panel 의 publish/save 통합을 건드리지 않는다.

### F-5. 웹 공통 UI 패턴 — 소형 공통 컴포넌트 2개 (배지 + 버튼)

4개(다시반영은 3개) 설정 페이지가 일관된 "마지막 반영 배지" + "다시 반영 버튼" 을 쓰도록 **소형 공통 컴포넌트 2개만** 추출한다.

> 🚫 **범위 제한**: 본 1차는 **이 2개 컴포넌트만** 공통화한다. 11페이지 저장 UX 표준화(`SettingsSaveBar`/`useSettingsForm` 등)는 PRD §2-2 비목표 — **번지지 말 것.**

| 컴포넌트 | 위치(권장) | props 계약 | 사용 도메인 |
|----------|-----------|-----------|------------|
| `LastAppliedBadge` | `apps/web/app/components/settings/LastAppliedBadge.tsx` | `{ at: string \| null; variant?: 'applied' \| 'saved'; disabled?: boolean }` — `at=null` → "미반영"(saved 변형은 미저장), `at` 존재 → 상대시각. `variant='saved'` 면 auto-channel "마지막 저장" 카피. | 4개 전부 |
| `ReApplyButton` | `apps/web/app/components/settings/ReApplyButton.tsx` | `{ onReApply: () => Promise<void>; disabled?: boolean }` — 클릭 시 로딩 스피너(중복클릭 방지), 저장된 적 없으면 `disabled`. | status-prefix / sticky-message / role-panel |

| 규칙 | 내용 |
|------|------|
| 상대시각 포맷 | 기존 상대시각 유틸이 없으므로(조사 확인) `LastAppliedBadge` 내부 또는 `apps/web/app/lib/` 의 소형 유틸로 1회 구현. 도메인별 중복 구현 금지. |
| 카피/라벨 | 컴포넌트는 **i18n 키만 참조**(하드코딩 금지). 키는 F-6. |
| 인라인 vs 공통 | **공통 컴포넌트로 추출**(인라인 4벌 복제 금지) — 단 2개 소형 컴포넌트라 오버엔지니어링 아님. |
| 배치/렌더 위치 | 페이지 내 어디에 꽂는지(status-prefix 상단, sticky-message 카드별, role-panel 패널 상단, auto-channel 상단)는 **각 도메인 plan-writer** 가 결정. 컴포넌트 자체는 web 공통. |

#### 공통 컴포넌트 충돌 방지 (중요)

- `LastAppliedBadge` / `ReApplyButton` 2개 파일은 **단일 owner 가 선행 생성**한다. 4개 도메인 plan 이 각자 만들면 동일 파일 4중 생성 충돌.
- **권고 순서**: 공통 컴포넌트 2개 + 상대시각 유틸 + i18n 공통 키(F-6)를 **선행 단독 작업(Phase 0)** 으로 머지 → 이후 4개 도메인 페이지가 이를 **import 만** 하여 병렬 작업.
- 4개 도메인 plan-writer 는 이 2개 파일을 **수정하지 않고 import 만** 한다. props 변경 필요 시 공통 owner 가 처리.

### F-6. i18n 키 규약 (공통 + 충돌 확인 완료)

기존 `apply*` 키 없음(충돌 0). 공통 키는 `settings.common.apply.*` 네임스페이스에 신설하고 **ko/en 양쪽**(`libs/i18n/locales/{ko,en}/web/settings.json`)을 동시 갱신한다.

| 키 | ko 카피(예) | en 카피(예) | 용도 |
|----|------------|------------|------|
| `settings.common.apply.lastApplied` | "마지막 반영: {time}" | "Last applied: {time}" | 배지(applied 변형) |
| `settings.common.apply.lastSaved` | "마지막 저장: {time}" | "Last saved: {time}" | 배지(auto-channel saved 변형) |
| `settings.common.apply.notApplied` | "미반영" | "Not applied" | `lastAppliedAt=null` |
| `settings.common.apply.notSaved` | "저장 안 됨" | "Not saved" | auto-channel `lastSavedAt=null` |
| `settings.common.apply.reApply` | "다시 반영" | "Re-apply" | 버튼 라벨 |
| `settings.common.apply.reApplying` | "반영 중…" | "Applying…" | 버튼 로딩 |
| `settings.common.apply.reApplySuccess` | "디스코드에 다시 반영했습니다." | "Re-applied to Discord." | 성공 토스트 |
| `settings.common.apply.reApplyError` | "다시 반영에 실패했습니다." | "Failed to re-apply." | 실패 토스트(상세사유 추가 가능) |

| 규칙 | 내용 |
|------|------|
| 네임스페이스 | 4개 도메인 공통 카피는 `settings.common.apply.*`. 도메인 고유 문구(role-panel "게시"→"저장" 라벨 변경 등)는 각 도메인 네임스페이스(`settings.rolePanel.*`)에서 plan-writer 가 수정. |
| ko/en 동시 | 한쪽만 추가 시 런타임 키 누락 — **반드시 양쪽 동시**. |
| 충돌 방지 | `settings.common.apply.*` 공통 키 추가는 **F-5 선행 작업과 동일 Phase 0** 에서 일괄 추가(공통 컴포넌트가 이 키를 참조하므로). 4개 도메인 plan 은 공통 키를 **추가하지 않고 참조만**, 자기 도메인 네임스페이스만 수정. |
| **plan-writer 가 채울 항목** | 최종 카피 문안, 도메인별 고유 라벨 변경(특히 role-panel). |

### F-7. 도메인 간 충돌 매트릭스 + 병렬화

#### 공유 파일 / 선행 작업 (Phase 0 — 단독 선행 머지)

병렬 4 plan 이 동시 건드리면 충돌하는 자원. **선행 단독 작업으로 빼서 4 plan 의 공유 파일 충돌을 0 으로** 만든다.

| Phase 0 항목 | 파일 | 사유 |
|--------------|------|------|
| DB 마이그레이션 1개 | `apps/api/src/migrations/1777600000000-SettingsApplyLastAppliedAtInit.ts` + 4개 ORM 엔티티 컬럼 추가 | 단일 마이그레이션이 4테이블을 동시 변경(DB 설계 문서). 4 plan 이 각자 마이그레이션 만들면 파일/타임스탬프 충돌. **마이그레이션은 1개로 선행.** |
| 웹 공통 컴포넌트 2개 + 상대시각 유틸 | `apps/web/app/components/settings/LastAppliedBadge.tsx`, `ReApplyButton.tsx`, 상대시각 유틸 | F-5 — 4중 생성 충돌 방지 |
| i18n 공통 키 | `libs/i18n/locales/{ko,en}/web/settings.json` 의 `settings.common.apply.*` | F-6 — 공통 컴포넌트가 참조 |

> ⚠️ **마이그레이션 owner 결정 필요**: 4 plan 중 누가(또는 별도 ops 성격 선행 task) 마이그레이션+엔티티 컬럼을 추가할지 dispatch 단계에서 한 명에게 귀속. 컬럼 추가는 단일 마이그레이션이므로 **반드시 1 owner**. 나머지 도메인 plan 은 자기 ORM 엔티티에 컬럼이 이미 추가됐다는 전제로 service/응답 DTO 만 작업.

#### Phase 1 — 도메인별 병렬 (Phase 0 머지 후)

| 그룹 | 작업 영역(도메인 plan 단독) | 선행 |
|------|---------------------------|------|
| 1-A status-prefix | service stamp + 응답 DTO `lastAppliedAt` + `re-apply` 엔드포인트 + web 페이지(공통 컴포넌트 import) + web api-client 타입 + 도메인 i18n | Phase 0 |
| 1-B sticky-message | 동일(채널 단위 stamp, `{id}/re-apply`, `enabled=false` 거부) | Phase 0 |
| 1-C role-panel | save+publish 통합 + stamp + 응답 DTO + 재게시(publish 재활용/`re-apply`) + 웹 "게시"버튼 제거 + 도메인 i18n | Phase 0 |
| 1-D auto-channel | `lastSavedAt` stamp(DB persist 후) + 응답 DTO + web 배지(saved 변형, 다시반영 버튼 없음) + web api-client 타입 + 도메인 i18n | Phase 0 |

#### 도메인 간 파일 충돌 매트릭스

| 자원 | status-prefix | sticky-message | role-panel | auto-channel | 충돌? |
|------|:---:|:---:|:---:|:---:|------|
| 자기 도메인 API service/controller/DTO | ✏️ | ✏️ | ✏️ | ✏️ | 도메인별 분리 → **충돌 없음** |
| 자기 도메인 ORM 엔티티 | (Phase0 owner 가 컬럼 추가) | 〃 | 〃 | 〃 | Phase 0 단일 마이그레이션 owner → 충돌 없음 |
| 자기 도메인 web 페이지 + web api-client | ✏️ | ✏️ | ✏️ | ✏️ | 도메인별 분리 → **충돌 없음** |
| `migrations/1777600000000-*` | — | — | — | — | **Phase 0 단독 1개** → 충돌 없음 |
| `components/settings/LastAppliedBadge.tsx` `ReApplyButton.tsx` | import만 | import만 | import만 | import만 | **Phase 0 단독 생성** → 충돌 없음 |
| `settings.common.apply.*` (i18n 공통) | 참조만 | 참조만 | 참조만 | 참조만 | **Phase 0 단독 추가** → 충돌 없음 |
| `settings.{domain}.*` (i18n 도메인) | ✏️ | ✏️ | ✏️ | ✏️ | 같은 `settings.json` 파일이지만 **서로 다른 도메인 키** → JSON 머지 충돌 가능. plan 은 자기 도메인 키 블록만 수정 권장 |
| `libs/bot-api-client/*`, `libs/shared/*` | 미변경 | 미변경 | 미변경 | 미변경 | **건드리지 않음**(F-2.2) → 충돌 없음 |

> 잔여 충돌 주의 1건: `settings.json` 은 ko/en 각 1파일이라 4 plan 이 각자 도메인 키를 추가하면 같은 파일에 동시 편집이 발생할 수 있다. git merge 는 서로 다른 키 블록이면 대개 자동 병합되나, plan-writer 는 **자기 도메인 네임스페이스 블록만 최소 수정**하도록 안내한다.

### F-8. HITL 4분야 판정

PRD §사용자확인 표를 그대로 승계한다.

| 분야 | 판정 | 근거 |
|------|------|------|
| 법무 | 해당 없음 | 반영 시각은 설정 메타데이터, PII 아님. 신규 수집 없음. |
| 결제 | 해당 없음 | 결제 변경 없음. |
| 권한 | 해당 없음 | 신규 OAuth 스코프/봇 권한 없음. 기존 `JwtAuthGuard + GuildMembershipGuard` 동일 적용(re-apply 포함). |
| DB 파괴적 | 해당 없음 | nullable 컬럼 추가만. 기존 컬럼 삭제·타입 변경 없음. `published` 유지. |

→ **🔴 미결 HITL 결정 없음.** (구현 단계 확정 항목 — published deprecated 시점 / publish vs re-apply / enabled=false 배지 표기 — 은 PRD 게이트가 아니며 각 plan-writer 가 결정.)

---

## Part G. Part F ↔ 기존 Part 교차 의존성

Part F(settings-apply-model)와 기존 Part A/B/D 간 공유 파일 확인.

| 공유 파일 | 기존 Part | Part F | 충돌 방지 |
|-----------|----------|--------|-----------|
| `libs/bot-api-client/src/types.ts`, `*.service.ts` | A/B/D 에서 변경 | **Part F 는 미변경**(F-2.2) | 충돌 없음 |
| `apps/web/app/components/SettingsSidebar.tsx` / `DashboardSidebar.tsx` | A/B/D 에서 사이드바 메뉴 변경 | **Part F 는 사이드바 미변경**(기존 4개 설정 페이지 이미 사이드바 등재) | 충돌 없음 |
| `libs/i18n/locales/{ko,en}/web/settings.json` | (기존 Part 들은 dashboard/landing 등 다른 파일 위주) | Part F 가 `settings.json` 의 `common.apply.*` + 도메인 키 추가 | 충돌 없음(다른 파일/네임스페이스) |
| `apps/web/app/components/settings/` | (없음 — Part F 신설) | Part F 가 신규 디렉터리 생성 | 충돌 없음 |

Part F 는 기존 Part 들과 직접 충돌하는 공유 파일이 없다(봇 SDK·사이드바를 의도적으로 건드리지 않음). Part F 의 충돌 관리는 **F-7 의 4개 도메인 내부 병렬화**에 집중된다.
