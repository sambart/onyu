# 친밀도/베프 단순화 — apps/api 삭제·수정 + DROP 마이그레이션 구현 계획

> 대상: `apps/api` 영역만. `/affinity` 백엔드 제거 · `GuildCoPresenceConfig` 전체 삭제 · `/privacy` 봇 API 제거 · `guild_co_presence_config` DROP 마이그레이션.
> 근거 PRD: `docs/specs/prd/voice-co-presence.md` (P-2/P-6 단순화, F-COPRESENCE-017 봇 API 제거, "guild_co_presence_config 테이블 삭제 예정")
> 근거 DB: `docs/specs/database/_index.md` § "마이그레이션 변경 계획 → 🔴 1777200000000-DropGuildCoPresenceConfig"

## 작업 브랜치

- 현재 `develop` 브랜치에서 작업. **브랜치 전환·생성 금지** (다른 컨텍스트 동시 작업 중).

## 유지/삭제 경계 (중요)

| 항목 | 처리 | 비고 |
|------|------|------|
| `/affinity` Bot API (`POST /bot-api/co-presence/affinity`) | **삭제** | F-COPRESENCE-015 제거 |
| `/best-friends` Bot API (`POST /bot-api/co-presence/best-friends`) | **유지** | F-COPRESENCE-014 |
| `getAffinity()` + 헬퍼 + `AffinityResponse` | **삭제** | analytics service |
| `getMyTopPeers()` / `getTopPairs()` / 그 외 분석 메서드 | **유지** | F-COPRESENCE-007~014/016 |
| `GuildCoPresenceConfig` 도메인 전체 (entity/repo/service/dto/web controller) | **삭제** | 유일 용도였던 `allowPublicAffinityQuery` 소멸 |
| `guild_co_presence_config` 테이블 | **DROP** | 신규 마이그레이션 |
| `/privacy` Bot API (`POST /bot-api/user-privacy/upsert`) | **삭제** | F-COPRESENCE-017 봇 API 제거 |
| `UserPrivacyConfig` 도메인 (service/repo/cache/entity/dto/web controller) | **유지** | 웹 `GET/PUT /api/users/me/privacy` + `filterPeers` 익명화 정상 동작 |
| `user_privacy_config` 테이블 | **유지** | 영향 없음 |

---

## 1. 삭제 파일 목록 (8개)

| # | 파일 | 사유 |
|---|------|------|
| 1 | `apps/api/src/channel/voice/co-presence/application/affinity-card-renderer.ts` | `/affinity` 전용 카드 렌더러 |
| 2 | `apps/api/src/channel/voice/co-presence/application/guild-co-presence-config.service.ts` | `GuildCoPresenceConfig` 서비스 |
| 3 | `apps/api/src/channel/voice/co-presence/application/guild-co-presence-config.service.spec.ts` | 위 서비스 단위 테스트 |
| 4 | `apps/api/src/channel/voice/co-presence/infrastructure/guild-co-presence-config.repository.ts` | Repository |
| 5 | `apps/api/src/channel/voice/co-presence/infrastructure/guild-co-presence-config.orm-entity.ts` | TypeORM 엔티티 |
| 6 | `apps/api/src/channel/voice/co-presence/dto/guild-co-presence-config.dto.ts` | 웹 API DTO |
| 7 | `apps/api/src/channel/voice/co-presence/presentation/guild-co-presence-config.controller.ts` | 웹 컨트롤러 (`/api/guilds/:guildId/co-presence-config`) |
| 8 | `apps/api/src/bot-api/user-privacy/bot-user-privacy.controller.ts` | `/privacy` 봇 API 컨트롤러 |

추가 spec 삭제 (테스트 영향 §5와 동일):

| # | 파일 | 사유 |
|---|------|------|
| 9 | `apps/api/src/bot-api/user-privacy/bot-user-privacy.controller.spec.ts` | 삭제 대상 컨트롤러 테스트 |

> `apps/api/src/bot-api/user-privacy/` 디렉토리는 파일 2개 삭제 후 비게 되므로 디렉토리도 함께 제거한다.

---

## 2. 수정 파일 목록 (변경 위치별, 5개)

### 2-1. `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts`

`/affinity` 핸들러 + 관련 헬퍼·import·DI를 제거하고, `snapshots`/`flush`/`best-friends` 핸들러는 유지한다.

- **import 제거**:
  - `AffinityCardRenderer`
  - `AffinityCardData` (type import — `best-friend-card.types` 에서 `AffinityCardData` 만 제거, `BestFriendCardData` 는 유지)
  - `GuildCoPresenceConfigService`
  - `UserPrivacyConfigService` (affinity privacy 검사 전용으로만 쓰였음 — 제거)
- **생성자 DI 제거** (`@Post('best-friends')` 경로에서 미사용인 3종):
  - `guildCoPresenceConfigService`
  - `userPrivacyConfigService`
  - `affinityCardRenderer`
  - → 잔존 DI: `coPresenceService`, `excludedChannelService`, `eventEmitter`, `voiceGameService`, `coPresenceAnalyticsService`, `bestFriendCardRenderer`, `bestFriendCardCacheService`, `voiceAiAnalysisService` (8종)
- **메서드 제거** (라인 265~384):
  - `@Post('affinity') getAffinity(...)`
  - `private checkAffinityPermission(...)`
  - `private checkAffinityPrivacy(...)`
  - `private renderAffinityCard(...)`
- **타입 정리**:
  - `CanvasCardResponse.errorCode?: 'PRIVATE' | 'FORBIDDEN'` 필드는 `best-friends` 응답에서 사용하지 않으므로 제거 가능. 단, `CanvasCardResponse` 자체는 `best-friends`가 사용하므로 인터페이스는 유지하고 `errorCode` 필드만 삭제.
- **유지**: `buildCardCacheKey`, `parsePeriod`, `parseLimit`, `MIN_LIMIT`, `MAX_LIMIT`, `VALID_PERIODS`, `getBestFriends`, `renderBestFriendCard`, `resolveAiComment`, `receiveSnapshots`, `flush`.

### 2-2. `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts`

`getAffinity` 일가만 제거하고 나머지(F-007~014) 메서드·타입은 유지한다.

- **타입 제거**:
  - `AffinityResponse` interface (라인 66~74)
  - `RawAffinityAggRow` interface (라인 151~154)
- **메서드 제거**:
  - `async getAffinity(...)` (라인 649~682)
  - `private fetchAffinityDailyData(...)` (라인 684~701)
  - `private fetchAffinityAgg(...)` (라인 703~720)
- **유지**: `RawPairDetailRow`(getPairDetail이 사용), `getMyTopPeers`, `buildTopPeerItem`, `getSummary/getGraph/getTopPairs/getIsolated/getPairs/getDailyTrend/getPairDetail`, 생성자 DI 4종 (`pairDailyRepo`, `dailyRepo`, `guildMemberService`, `userPrivacyConfigService`) 모두 유지.
  - ※ `userPrivacyConfigService` 는 `getMyTopPeers` → `filterPeers` 가 계속 쓰므로 **유지**.

### 2-3. `apps/api/src/channel/voice/co-presence/co-presence.module.ts`

- **import 제거**: `AffinityCardRenderer`, `GuildCoPresenceConfigService`, `GuildCoPresenceConfigOrm`, `GuildCoPresenceConfigRepository`, `GuildCoPresenceConfigController`
- **`TypeOrmModule.forFeature` 배열에서 `GuildCoPresenceConfigOrm` 제거** → 잔존: `VoiceCoPresenceSessionOrm`, `VoiceCoPresenceDailyOrm`, `VoiceCoPresencePairDailyOrm`
- **`controllers` 에서 `GuildCoPresenceConfigController` 제거** → 잔존: `CoPresenceAnalyticsController`
- **`providers` 에서 제거**: `GuildCoPresenceConfigRepository`, `GuildCoPresenceConfigService`, `AffinityCardRenderer`
- **`exports` 에서 제거**: `GuildCoPresenceConfigService`, `AffinityCardRenderer`
- **유지**: `forwardRef(() => VoiceChannelModule)`, `UserPrivacyModule`, `CanvasModule`, `GuildMemberModule`, `forwardRef(() => VoiceAnalyticsModule)` — **forwardRef 순환 구조 변경 없음**. `UserPrivacyModule` 은 `CoPresenceAnalyticsService` (getMyTopPeers→filterPeers) 가 계속 의존하므로 **이 모듈에서는 유지**.

수정 후 구조 (스케치):

```ts
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VoiceCoPresenceSessionOrm,
      VoiceCoPresenceDailyOrm,
      VoiceCoPresencePairDailyOrm,
    ]),
    forwardRef(() => VoiceChannelModule),
    UserPrivacyModule,            // getMyTopPeers → filterPeers 의존 (유지)
    CanvasModule,
    GuildMemberModule,
    forwardRef(() => VoiceAnalyticsModule),
  ],
  controllers: [CoPresenceAnalyticsController],
  providers: [
    CoPresenceScheduler,
    CoPresenceService,
    CoPresenceDbRepository,
    CoPresenceCleanupScheduler,
    CoPresenceAnalyticsService,
    BestFriendCardRenderer,
    BestFriendCardCacheService,
  ],
  exports: [
    CoPresenceScheduler,
    CoPresenceService,
    CoPresenceAnalyticsService,
    BestFriendCardRenderer,
    BestFriendCardCacheService,
  ],
})
export class CoPresenceModule {}
```

### 2-4. `apps/api/src/bot-api/bot-api.module.ts`

- **import 제거**: `BotUserPrivacyController`, `UserPrivacyModule`
- **`imports` 에서 `UserPrivacyModule` 제거** — 판단 근거는 §4 참조
- **`controllers` 에서 `BotUserPrivacyController` 제거** → 잔존 10개 그대로

### 2-5. `apps/api/src/channel/voice/co-presence/application/best-friend-card.types.ts`

- **`AffinityCardData` interface 제거** (라인 38~55). `affinity-card-renderer.ts`(삭제) 와 `bot-co-presence.controller`(affinity 핸들러 삭제) 외 사용처 없음.
- **유지**: `TopPeerItem`, `BestFriendCardData`.

> 검색 확인 결과 `AffinityCardData` 참조처는 `affinity-card-renderer.ts`(삭제), `bot-co-presence.controller.ts`(affinity 핸들러 삭제) 2곳뿐. 안전하게 제거 가능.

---

## 3. DROP 마이그레이션 작성 (신규 1개)

**경로**: `apps/api/src/migrations/1777200000000-DropGuildCoPresenceConfig.ts`

DB 스펙(`docs/specs/database/_index.md`)과 `1777100000000-AddBestFriendCanvasConfig.ts` 의 `guild_co_presence_config` 생성 DDL을 그대로 원복 DDL로 사용한다.

```ts
import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class DropGuildCoPresenceConfig1777200000000 implements MigrationInterface {
  name = 'DropGuildCoPresenceConfig1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "guild_co_presence_config"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "guild_co_presence_config" (
        "guildId" character varying NOT NULL,
        "allowPublicAffinityQuery" boolean NOT NULL DEFAULT false,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_guild_co_presence_config" PRIMARY KEY ("guildId")
      )`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "guild_co_presence_config" IS '길드 단위 Co-Presence 공개 설정 — 타인↔타인 /affinity 조회 허용 여부 (Phase 5)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "guild_co_presence_config"."guildId" IS '디스코드 서버 ID (PK)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "guild_co_presence_config"."allowPublicAffinityQuery" IS 'true = 일반 사용자도 본인 미포함 타인↔타인 /affinity 조회 허용. false(기본) = ManageGuild 권한 보유자만 허용'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "guild_co_presence_config"."updatedAt" IS '마지막 설정 변경 시각'`,
    );
  }
}
```

**주의사항**:
- 기존 `1777100000000-AddBestFriendCanvasConfig.ts` 는 **절대 수정하지 않는다** (이미 머지·적용됨). 신규 DROP 마이그레이션으로 분리 처리.
- `user_privacy_config` 테이블은 본 마이그레이션의 영향을 받지 않는다.
- 🔴 **DB 파괴적 변경** — Phase 3.5(승인) 후 Phase 4에서 implementer가 `migration:run` 실행. plan-writer/implementer 단계 전 임의 실행 금지.
- TypeORM 엔티티(`GuildCoPresenceConfigOrm`) 삭제와 `forFeature` 제거가 **선행**되어야 `migration:run` 후 스키마-엔티티 불일치 오류가 발생하지 않는다. (코드 삭제 → build 통과 → migration:run 순서)

---

## 4. `UserPrivacyModule` import 유지 여부 판단

| 모듈 | 판단 | 근거 |
|------|------|------|
| `co-presence.module.ts` 의 `UserPrivacyModule` | **유지** | `CoPresenceAnalyticsService.getMyTopPeers()` 가 `UserPrivacyConfigService.filterPeers()` 를 호출한다. 이 모듈에서 import 제거 시 DI 해소 불가. |
| `bot-api.module.ts` 의 `UserPrivacyModule` | **제거** | grep 결과, bot-api 내 `UserPrivacyConfigService` 직접 주입처는 ① `BotUserPrivacyController`(삭제) ② `BotCoPresenceController` 의 affinity privacy 검사(삭제) 둘뿐. 두 사용처가 모두 사라지면 `bot-api.module` 에서 `UserPrivacyModule` 을 import 할 이유가 없다. `BotCoPresenceController` 의 best-friends 경로는 `CoPresenceAnalyticsService` 내부에서 privacy 를 처리하므로 bot-api 레벨 import 불필요. |

> 결론: **`UserPrivacyModule` 은 `co-presence.module` 에서만 유지, `bot-api.module` 에서는 제거**. `user-privacy` 도메인 자체(entity/service/repo/cache/web controller)는 전부 보존되며 웹 API `GET/PUT /api/users/me/privacy` 회귀 없음.

---

## 5. 테스트 영향

| 파일 | 처리 | 상세 |
|------|------|------|
| `apps/api/src/bot-api/co-presence/bot-co-presence-new-handlers.spec.ts` | **수정** | `describe('BotCoPresenceController.getAffinity')` 블록 전체(라인 250~426, T-CTL-05~11) 제거. `getBestFriends` describe(T-CTL-01~04) 유지. mock 헬퍼에서 `getAffinity`/`guildConfigService`/`userPrivacyService`/`affinityCardRenderer` 제거하고, `buildController()` 의 생성자 인자를 §2-1 의 잔존 8 DI 순서에 맞춰 수정. `makeGuildConfig` 헬퍼 + `GuildCoPresenceConfigOrm` import 제거. |
| `apps/api/src/channel/voice/co-presence/co-presence-analytics-new-methods.spec.ts` | **수정** | `describe('CoPresenceAnalyticsService.getAffinity')` 블록 전체(라인 226~330, T-AFF-01~04) 제거. T-MYP 블록 유지. 상단 헬퍼/import 는 `getMyTopPeers` 가 그대로 사용하므로 유지. |
| `apps/api/src/channel/voice/co-presence/application/guild-co-presence-config.service.spec.ts` | **삭제** | 대상 서비스 삭제 |
| `apps/api/src/bot-api/user-privacy/bot-user-privacy.controller.spec.ts` | **삭제** | 대상 컨트롤러 삭제 |

> 주의: `bot-co-presence-new-handlers.spec.ts` 의 `buildController()` 는 생성자 인자 위치 의존이 강하므로, 컨트롤러 DI 순서 변경과 spec 인자 순서를 **반드시 일치**시킬 것.

---

## 6. 작업 순서 (의존성 고려)

1. `best-friend-card.types.ts` 에서 `AffinityCardData` 제거 (§2-5)
2. `affinity-card-renderer.ts` 삭제 (§1-1)
3. `bot-co-presence.controller.ts` affinity 핸들러·DI·import 정리 (§2-1)
4. `co-presence-analytics.service.ts` getAffinity 일가 제거 (§2-2)
5. `GuildCoPresenceConfig` 6파일 삭제 (§1: service/spec/repository/orm-entity/dto/web controller)
6. `co-presence.module.ts` 등록 정리 (§2-3)
7. `bot-user-privacy.controller.ts` + spec 삭제, 빈 디렉토리 제거 (§1)
8. `bot-api.module.ts` 정리 (§2-4)
9. 두 spec 파일 affinity 케이스 제거 (§5)
10. DROP 마이그레이션 신규 작성 (§3) — 코드 삭제 완료 후
11. `migration:run` 은 **Phase 4 implementer** 가 승인 후 실행

---

## 7. 검증 체크리스트

- [ ] `pnpm --filter @onyu/api lint` 통과 (미사용 import/변수 0)
- [ ] `pnpm --filter @onyu/api build` 통과 (타입 해소)
- [ ] `pnpm --filter @onyu/api test` — affinity 케이스 제거 후 getBestFriends/getMyTopPeers 케이스 정상
- [ ] `CoPresenceModule` DI 그래프 정상 — `forwardRef(VoiceChannelModule)` / `forwardRef(VoiceAnalyticsModule)` 순환 유지, 본 작업으로 깨지지 않음
- [ ] `bot-api.module` 부팅 정상 (`UserPrivacyModule`/`BotUserPrivacyController` 제거 후 DI 누락 없음)
- [ ] 마이그레이션 `migration:run` / `migration:revert` 검증 (implementer 단계, DB 파괴적이므로 승인 후)
- [ ] **회귀 없음 확인**:
  - `POST /bot-api/co-presence/best-friends` (F-COPRESENCE-014) 정상
  - `getMyTopPeers` / `getTopPairs` / `getSummary` 등 분석 메서드 정상 (F-COPRESENCE-007~013, 016)
  - 주간 리포트 `filterPeers` 익명화 정상 (F-COPRESENCE-016)
  - 웹 `GET/PUT /api/users/me/privacy` 정상 (F-COPRESENCE-017 유지분)

---

## 8. 미해결/주의 (있다면 추가 확인)

- 본 계획은 `apps/api` 영역만 다룬다. `apps/bot` 의 `/affinity`·`/privacy` 슬래시 커맨드 제거, `apps/web` 의 `co-presence-config` 설정 UI 제거, `bot-api-client` SDK 메서드 제거는 **별도 컨텍스트 작업** 범위로 본다. (동일 변경의 일부이므로 통합 PR 시 함께 처리 권장)
- 웹 컨트롤러 `guild-co-presence-config.controller.ts`(`/api/guilds/:guildId/co-presence-config`) 삭제로 해당 엔드포인트가 사라진다. 이를 호출하는 `apps/web` 코드가 남아 있으면 web 빌드/런타임 오류가 발생하므로, web 측 정리가 동일 PR에 포함되는지 확인 필요.
