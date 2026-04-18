# 자가진단 핵심 로직 구현 계획

> 대상 티켓: T-SD-003, T-SD-004, T-SD-005, T-SD-006
> 선행 조건: T-SD-001 (LLM 추상화), T-SD-002 (디렉토리 이동) 완료 가정
> 최종 경로 기준: `apps/api/src/voice-analytics/self-diagnosis/`
> (현재 엔티티는 `apps/api/src/gemini/self-diagnosis/domain/`에 위치하나, T-SD-002 완료 후 이동됨)

---

## 파일 구조 (최종)

```
apps/api/src/voice-analytics/self-diagnosis/
├── domain/
│   ├── voice-health-config.entity.ts        # 이미 존재
│   └── voice-health-badge.entity.ts         # 이미 존재
├── dto/
│   └── voice-health-config-save.dto.ts      # T-SD-003
├── self-diagnosis.types.ts                  # T-SD-004
├── hhi-calculator.ts                        # T-SD-004
├── voice-health-config.repository.ts        # T-SD-003
├── voice-health-cache.keys.ts               # T-SD-003
├── self-diagnosis.service.ts                # T-SD-004
├── self-diagnosis.controller.ts             # T-SD-003
├── self-diagnosis.command.ts                # T-SD-005
├── badge.constants.ts                       # T-SD-006 (공통 모듈에서 정의됨)
├── badge.service.ts                         # T-SD-006
├── badge.scheduler.ts                       # T-SD-006
└── badge-query.service.ts                   # T-SD-006 (공통 모듈에서 정의됨)
```

---

## T-SD-003: VoiceHealthConfig Repository + Controller

### 단계 3-1: Redis 캐시 키 정의

**파일**: `voice-health-cache.keys.ts`

```typescript
export const VoiceHealthKeys = {
  config: (guildId: string) => `voice-health:config:${guildId}`,
  cooldown: (guildId: string, userId: string) =>
    `voice-health:cooldown:${guildId}:${userId}`,
} as const;
```

패턴 참조: `apps/api/src/newbie/infrastructure/newbie-cache.keys.ts`

---

### 단계 3-2: VoiceHealthConfigRepository (Redis 캐시 + DB)

**파일**: `voice-health-config.repository.ts`

패턴 참조: `apps/api/src/newbie/infrastructure/newbie-config.repository.ts` + `newbie-redis.repository.ts`

```typescript
@Injectable()
export class VoiceHealthConfigRepository {
  constructor(
    @InjectRepository(VoiceHealthConfig)
    private readonly repo: Repository<VoiceHealthConfig>,
    private readonly redis: RedisService,
  ) {}

  /** Redis 캐시 조회 -> 미스 시 DB 조회 -> 캐시 저장 */
  async findByGuildId(guildId: string): Promise<VoiceHealthConfig | null>;

  /** DB upsert + Redis 캐시 갱신 */
  async upsert(guildId: string, dto: VoiceHealthConfigSaveDto): Promise<VoiceHealthConfig>;

  /** isEnabled=true인 모든 길드 조회 (배치 스케줄러용, 캐시 미사용) */
  async findAllEnabled(): Promise<VoiceHealthConfig[]>;

  /** Redis 캐시 삭제 */
  async deleteCache(guildId: string): Promise<void>;
}
```

핵심 구현 사항:
- `findByGuildId`: Redis 키 `voice-health:config:{guildId}` 조회 (TTL 1시간). 캐시 미스 시 DB 조회 후 캐시 저장.
- `upsert`: 기존 레코드 있으면 필드 갱신, 없으면 `repo.create()`. 저장 후 캐시 갱신.
- `findAllEnabled`: `this.repo.find({ where: { isEnabled: true } })`. 스케줄러 전용이므로 캐시 불필요.
- TTL 상수: `CONFIG_TTL = 3600` (1시간)

---

### 단계 3-3: DTO

**파일**: `dto/voice-health-config-save.dto.ts`

패턴 참조: `apps/api/src/newbie/dto/newbie-config-save.dto.ts`

```typescript
export class VoiceHealthConfigSaveDto {
  @IsBoolean()
  isEnabled: boolean;

  @IsInt() @Min(7) @Max(90)
  analysisDays: number;

  @IsInt() @Min(1) @Max(168)
  cooldownHours: number;

  @IsBoolean()
  isLlmSummaryEnabled: boolean;

  @IsInt() @Min(0)
  minActivityMinutes: number;

  @IsNumber() @Min(0) @Max(1)
  minActiveDaysRatio: number;

  @IsNumber() @Min(0) @Max(1)
  hhiThreshold: number;

  @IsInt() @Min(1)
  minPeerCount: number;

  @IsInt() @Min(1) @Max(100)
  badgeActivityTopPercent: number;

  @IsNumber() @Min(0) @Max(1)
  badgeSocialHhiMax: number;

  @IsInt() @Min(1)
  badgeSocialMinPeers: number;

  @IsInt() @Min(1) @Max(100)
  badgeHunterTopPercent: number;

  @IsNumber() @Min(0) @Max(1)
  badgeConsistentMinRatio: number;

  @IsNumber() @Min(0) @Max(1)
  badgeMicMinRate: number;
}
```

모든 필드 required (프론트에서 전체 폼을 전송하는 기존 패턴 준수).

---

### 단계 3-4: Controller

**파일**: `self-diagnosis.controller.ts`

패턴 참조: `apps/api/src/newbie/newbie.controller.ts` (config GET/POST 부분)

```typescript
@Controller('api/guilds/:guildId/voice-health')
@UseGuards(JwtAuthGuard)
export class SelfDiagnosisController {
  constructor(
    private readonly configRepo: VoiceHealthConfigRepository,
  ) {}

  /** GET /api/guilds/:guildId/voice-health/config */
  @Get('config')
  async getConfig(@Param('guildId') guildId: string): Promise<VoiceHealthConfig | null>;

  /** POST /api/guilds/:guildId/voice-health/config */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: VoiceHealthConfigSaveDto,
  ): Promise<{ ok: boolean }>;
}
```

구현 사항:
- `getConfig`: `configRepo.findByGuildId(guildId)` 호출. Redis 캐시 로직은 repository 내부에서 처리.
- `saveConfig`: `configRepo.upsert(guildId, dto)` 호출 후 `{ ok: true }` 반환.

---

### 단계 3-5: VoiceAnalyticsModule 수정

`voice-analytics.module.ts`에 다음을 추가:

```diff
 imports: [
   ...
   TypeOrmModule.forFeature([
     VoiceDailyEntity,
+    VoiceCoPresencePairDaily,
+    MocoHuntingDaily,
+    VoiceHealthConfig,
+    VoiceHealthBadge,
   ]),
+  // RedisModule은 @Global()이므로 import 불필요
 ],
 controllers: [
   VoiceAnalyticsController,
+  SelfDiagnosisController,
 ],
 providers: [
   ...
+  VoiceHealthConfigRepository,
 ],
```

---

## T-SD-004: 자가진단 데이터 수집 및 진단 로직

### 단계 4-1: 타입 정의

**파일**: `self-diagnosis.types.ts`

PRD의 `SelfDiagnosisResult` 인터페이스를 그대로 정의한다.

```typescript
export interface SelfDiagnosisResult {
  // 활동량
  totalMinutes: number;
  activeDays: number;
  totalDays: number;
  activeDaysRatio: number;
  avgDailyMinutes: number;
  activityRank: number;
  activityTotalUsers: number;
  activityTopPercent: number;

  // 관계 다양성
  peerCount: number;
  hhiScore: number;
  topPeers: PeerInfo[];

  // 모코코 기여
  mocoScore: number;
  mocoRank: number;
  mocoTotalUsers: number;
  mocoTopPercent: number;
  mocoHelpedNewbies: number;

  // 참여 패턴
  micUsageRate: number;
  aloneRatio: number;

  // 정책 판정
  verdicts: Verdict[];

  // 뱃지
  badges: BadgeCode[];

  // LLM 요약
  llmSummary?: string;
}

export interface PeerInfo {
  userId: string;
  userName: string;
  minutes: number;
  ratio: number;
}

export interface Verdict {
  category: string;
  isPassed: boolean;
  criterion: string;
  actual: string;
}
```

---

### 단계 4-2: HHI 계산 유틸

**파일**: `hhi-calculator.ts`

순수 함수로 구현. 테스트 용이성 확보.

```typescript
export interface PeerTime {
  peerId: string;
  minutes: number;
}

/**
 * HHI (Herfindahl-Hirschman Index)를 계산한다.
 * HHI = SUM(si^2), si = 특정 peer와의 시간 / 전체 시간
 *
 * @returns HHI 값 (0~1). 데이터가 없으면 1 반환 (완전 편중)
 */
export function calculateHhi(peerTimes: PeerTime[]): number;

/**
 * peer별 비율을 계산하고 상위 N명을 반환한다.
 */
export function getTopPeers(
  peerTimes: PeerTime[],
  topN: number,
): Array<{ peerId: string; minutes: number; ratio: number }>;
```

구현 사항:
- 전체 시간 합계 `total = SUM(minutes)`.
- 각 peer의 비율 `si = minutes / total`.
- `HHI = SUM(si^2)`.
- 데이터가 빈 배열이면 `1` 반환 (편중 상태로 간주).
- `getTopPeers`: minutes 기준 내림차순 정렬 후 상위 N개 반환.

---

### 단계 4-3: SelfDiagnosisService

**파일**: `self-diagnosis.service.ts`

```typescript
@Injectable()
export class SelfDiagnosisService {
  constructor(
    @InjectRepository(VoiceDailyEntity)
    private readonly voiceDailyRepo: Repository<VoiceDailyEntity>,
    @InjectRepository(VoiceCoPresencePairDaily)
    private readonly pairDailyRepo: Repository<VoiceCoPresencePairDaily>,
    @InjectRepository(MocoHuntingDaily)
    private readonly mocoRepo: Repository<MocoHuntingDaily>,
    private readonly configRepo: VoiceHealthConfigRepository,
    private readonly redis: RedisService,
    private readonly badgeQueryService: BadgeQueryService,
    // LLM은 선택적 (isLlmSummaryEnabled 플래그에 따라)
    @Inject(LLM_PROVIDER) @Optional()
    private readonly llmProvider?: LlmProvider,
  ) {}

  /** 메인 진단 메서드 */
  async diagnose(
    guildId: string,
    userId: string,
  ): Promise<SelfDiagnosisResult>;
}
```

#### diagnose() 내부 처리 순서:

1. **설정 조회**: `configRepo.findByGuildId(guildId)` -> 없거나 `isEnabled=false`이면 예외
2. **쿨다운 체크**: Redis 키 `voice-health:cooldown:{guildId}:{userId}` 존재 여부 확인
3. **날짜 범위 계산**: `analysisDays` 기준으로 KST 시작/종료 날짜 계산 (YYYYMMDD 형식)
4. **활동량 수집** (`collectActivity`):
   - `VoiceDaily`에서 `channelId = 'GLOBAL'` 조건으로 해당 유저의 기간 내 데이터 조회
   - `SUM(channelDurationSec)` -> `totalMinutes` (초를 분으로 변환)
   - `COUNT(DISTINCT date)` -> `activeDays`
   - 서버 전체 순위: 기간 내 모든 유저의 `SUM(channelDurationSec)` 내림차순 순위
   - `activityTopPercent = (rank / totalUsers) * 100`

5. **관계 다양성 수집** (`collectRelationship`):
   - `VoiceCoPresencePairDaily`에서 `(guildId, userId)` 기준 기간 내 peer별 `SUM(minutes)` 조회
   - `calculateHhi()`, `getTopPeers(3)` 호출
   - peer 이름은 `VoiceDaily`의 `userName` 또는 Discord API로 해결 (가능한 경우 DB에서)

6. **모코코 기여 수집** (`collectMoco`):
   - `MocoHuntingDaily`에서 `(guildId, hunterId=userId)` 기준 기간 내 `SUM(score)` 조회
   - `uniqueNewbieCount`는 기간 내 `SUM(uniqueNewbieCount)` 또는 고유 카운트 (날짜별 중복 가능하므로 주의)
   - 서버 전체 순위: 전체 hunter의 `SUM(score)` 기준

7. **참여 패턴 수집** (`collectPattern`):
   - `VoiceDaily`에서 `channelId = 'GLOBAL'` 조건으로:
     - `micUsageRate = SUM(micOnSec) / SUM(channelDurationSec)`
     - `aloneRatio = SUM(aloneSec) / SUM(channelDurationSec)`

8. **정책 판정** (`buildVerdicts`):
   - 활동량 판정: `totalMinutes >= minActivityMinutes`, `activeDaysRatio >= minActiveDaysRatio`
   - 관계 다양성 판정: `hhiScore <= hhiThreshold`, `peerCount >= minPeerCount`

9. **뱃지 조회**: `badgeQueryService.findBadgeCodes(guildId, userId)`

10. **LLM 요약** (선택적):
    - `config.isLlmSummaryEnabled`이고 `llmProvider`가 존재하면
    - 수집 데이터를 프롬프트로 구성 -> `llmProvider.generateText()` 호출
    - 실패 시 `llmSummary = undefined` (무시)

11. **쿨다운 설정**: Redis 키 SET, TTL = `cooldownHours * 3600`

---

#### 쿼리 상세

**활동량 전체 순위 쿼리** (TypeORM QueryBuilder):

```typescript
// 서버 전체 사용자별 활동 시간 순위
const rankings = await this.voiceDailyRepo
  .createQueryBuilder('vd')
  .select('vd.userId', 'userId')
  .addSelect('SUM(vd.channelDurationSec)', 'totalSec')
  .where('vd.guildId = :guildId', { guildId })
  .andWhere('vd.channelId = :channelId', { channelId: 'GLOBAL' })
  .andWhere('vd.date >= :startDate', { startDate })
  .andWhere('vd.date <= :endDate', { endDate })
  .groupBy('vd.userId')
  .orderBy('totalSec', 'DESC')
  .getRawMany();
```

**HHI용 peer별 시간 쿼리**:

```typescript
const peerTimes = await this.pairDailyRepo
  .createQueryBuilder('pd')
  .select('pd.peerId', 'peerId')
  .addSelect('SUM(pd.minutes)', 'totalMinutes')
  .where('pd.guildId = :guildId', { guildId })
  .andWhere('pd.userId = :userId', { userId })
  .andWhere('pd.date >= :startDate', { startDate })
  .andWhere('pd.date <= :endDate', { endDate })
  .groupBy('pd.peerId')
  .getRawMany();
```

**모코코 전체 순위 쿼리**:

```typescript
const mocoRankings = await this.mocoRepo
  .createQueryBuilder('mh')
  .select('mh.hunterId', 'hunterId')
  .addSelect('SUM(mh.score)', 'totalScore')
  .where('mh.guildId = :guildId', { guildId })
  .andWhere('mh.date >= :startDate', { startDate })
  .andWhere('mh.date <= :endDate', { endDate })
  .groupBy('mh.hunterId')
  .orderBy('totalScore', 'DESC')
  .getRawMany();
```

> 주의: VoiceDaily의 date는 `YYYYMMDD` 문자열, PairDaily의 date는 `date` 타입, MocoHuntingDaily의 date는 `YYYYMMDD` (varchar(8)). 쿼리 시 각 형식에 맞는 비교를 사용해야 한다. PairDaily는 `'2026-03-01'` 형식, 나머지는 `'20260301'` 형식.

---

### 단계 4-4: VoiceAnalyticsModule 수정 (추가)

```diff
 providers: [
   ...
+  SelfDiagnosisService,
 ],
```

---

## T-SD-005: /자가진단 슬래시 커맨드

### 단계 5-1: SelfDiagnosisCommand

**파일**: `self-diagnosis.command.ts`

패턴 참조: `apps/api/src/gemini/commands/community-health.command.ts`

```typescript
@Command({
  name: 'self-diagnosis',
  nameLocalizations: { ko: '자가진단' },
  description: '내 음성 활동을 진단합니다',
})
@Injectable()
export class SelfDiagnosisCommand {
  private readonly logger = new Logger(SelfDiagnosisCommand.name);

  constructor(
    private readonly diagnosisService: SelfDiagnosisService,
    private readonly configRepo: VoiceHealthConfigRepository,
    private readonly redis: RedisService,
  ) {}

  @Handler()
  async onSelfDiagnosis(
    @InteractionEvent() interaction: CommandInteraction,
  ): Promise<void>;
}
```

#### onSelfDiagnosis() 처리 순서:

1. `interaction.deferReply({ ephemeral: true })` -- Ephemeral 응답
2. 기본 검증:
   - `interaction.guildId` 없으면 "서버에서만 사용 가능" 반환
   - 설정 조회 -> `isEnabled=false`이면 "자가진단 기능이 활성화되지 않았습니다" 반환
3. 쿨다운 체크:
   - Redis 키 존재 -> TTL 조회 -> "다음 진단은 {남은시간} 후에 가능합니다." 반환
4. `diagnosisService.diagnose(guildId, userId)` 호출
5. 결과 없음 처리: `totalMinutes === 0` -> "최근 {N}일간 음성 활동 기록이 없습니다."
6. Embed 빌드 (private `buildEmbed(result, config)` 메서드)
7. `interaction.editReply({ embeds: [embed] })`

#### buildEmbed() 구현:

```typescript
private buildEmbed(result: SelfDiagnosisResult, config: VoiceHealthConfig): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('\uD83E\uDE7A 음성 활동 자가진단')
    .setColor(0x5B8DEF);

  const sections: string[] = [];

  // 1. 활동량 섹션
  sections.push(this.buildActivitySection(result));

  // 2. 관계 다양성 섹션
  sections.push(this.buildRelationshipSection(result));

  // 3. 모코코 기여 섹션
  sections.push(this.buildMocoSection(result));

  // 4. 참여 패턴 섹션
  sections.push(this.buildPatternSection(result));

  // 5. 보유 뱃지 섹션
  sections.push(this.buildBadgeSection(result));

  // 6. AI 종합 진단 (선택)
  if (result.llmSummary) {
    sections.push(`\uD83D\uDCAC **AI 종합 진단**\n${result.llmSummary}`);
  }

  embed.setDescription(sections.join('\n\n'));

  // Footer
  const nextAvailable = this.formatNextAvailableTime(config.cooldownHours);
  embed.setFooter({
    text: `\uD83D\uDCC5 분석 기간: 최근 ${config.analysisDays}일 \u00B7 다음 진단 가능: ${nextAvailable}`,
  });

  return embed;
}
```

각 섹션 빌더는 PRD의 Embed 구조를 그대로 구현한다.

#### 포매팅 헬퍼:

```typescript
/** 분(minutes)을 "N시간 M분" 형식으로 포매팅 */
private formatMinutes(minutes: number): string;

/** 비율(0~1)을 "N.N%" 형식으로 포매팅 */
private formatPercent(ratio: number): string;

/** 다음 진단 가능 시간 포매팅 */
private formatNextAvailableTime(cooldownHours: number): string;

/** 판정 결과 이모지 (통과: check, 미통과: warning) */
private verdictEmoji(isPassed: boolean): string;
```

---

### 단계 5-2: VoiceAnalyticsModule 수정 (추가)

```diff
 providers: [
   ...
+  SelfDiagnosisCommand,
 ],
```

---

## T-SD-006: 뱃지 시스템

### 단계 6-1: badge.constants.ts (공통 모듈에서 이미 정의됨)

**파일**: `badge.constants.ts`

공통 모듈 계획(common-modules.md)에 정의된 대로 구현:
- `BADGE_CODE` 상수 객체
- `BadgeCode` 타입
- `BADGE_PRIORITY` 배열
- `BADGE_DISPLAY` 표시 정보 맵
- `MAX_BADGE_DISPLAY` 상수 (4)

---

### 단계 6-2: BadgeService

**파일**: `badge.service.ts`

```typescript
@Injectable()
export class BadgeService {
  constructor(
    @InjectRepository(VoiceDailyEntity)
    private readonly voiceDailyRepo: Repository<VoiceDailyEntity>,
    @InjectRepository(VoiceCoPresencePairDaily)
    private readonly pairDailyRepo: Repository<VoiceCoPresencePairDaily>,
    @InjectRepository(MocoHuntingDaily)
    private readonly mocoRepo: Repository<MocoHuntingDaily>,
    @InjectRepository(VoiceHealthBadge)
    private readonly badgeRepo: Repository<VoiceHealthBadge>,
  ) {}

  /**
   * 길드 내 전체 멤버의 뱃지 자격을 판정하고 일괄 upsert한다.
   * BadgeScheduler에서 호출된다.
   */
  async judgeAll(config: VoiceHealthConfig): Promise<number>;
}
```

#### judgeAll() 내부 처리 순서:

1. **날짜 범위 계산**: KST 기준 `config.analysisDays`일 전 ~ 어제
2. **활동량 순위 산출**:
   - `VoiceDaily` (GLOBAL) 기간 내 사용자별 `SUM(channelDurationSec)` 내림차순
   - 각 사용자의 순위, 상위 % 계산
3. **HHI 산출**:
   - `VoiceCoPresencePairDaily` 기간 내 사용자별 peer 시간 조회
   - 사용자별 `calculateHhi()` 호출
   - peer 수 카운트
4. **모코코 순위 산출**:
   - `MocoHuntingDaily` 기간 내 hunter별 `SUM(score)` 내림차순
5. **참여 패턴 산출**:
   - `VoiceDaily` (GLOBAL) 기간 내 사용자별 `SUM(micOnSec)/SUM(channelDurationSec)`, `SUM(aloneSec)/SUM(channelDurationSec)`
   - 활동일 비율: `COUNT(DISTINCT date) / analysisDays`
6. **뱃지 판정** (사용자별):
   - `ACTIVITY`: `activityTopPercent <= config.badgeActivityTopPercent`
   - `SOCIAL`: `hhiScore <= config.badgeSocialHhiMax AND peerCount >= config.badgeSocialMinPeers`
   - `HUNTER`: `mocoTopPercent <= config.badgeHunterTopPercent`
   - `CONSISTENT`: `activeDaysRatio >= config.badgeConsistentMinRatio`
   - `MIC`: `micUsageRate >= config.badgeMicMinRate`
7. **일괄 upsert**:
   - 활동 데이터가 있는 모든 사용자에 대해 `voice_health_badge` upsert
   - TypeORM의 `repo.upsert()` 사용 (conflict: `['guildId', 'userId']`)
   - 배치 크기: 100건씩 분할 처리 (대규모 서버 대응)

```typescript
// upsert 예시
await this.badgeRepo.upsert(
  {
    guildId,
    userId,
    badges: earnedBadges,
    activityRank,
    activityTopPercent,
    hhiScore,
    mocoRank,
    mocoTopPercent,
    micUsageRate,
    activeDaysRatio,
    calculatedAt: new Date(),
  },
  ['guildId', 'userId'],
);
```

---

### 단계 6-3: BadgeScheduler

**파일**: `badge.scheduler.ts`

패턴 참조: `apps/api/src/newbie/moco/moco-reset.scheduler.ts`

```typescript
@Injectable()
export class BadgeScheduler {
  private readonly logger = new Logger(BadgeScheduler.name);

  constructor(
    private readonly configRepo: VoiceHealthConfigRepository,
    private readonly badgeService: BadgeService,
  ) {}

  /**
   * 매일 00:30 KST 실행.
   * Co-Presence 세션 정리(00:00 KST) 이후 뱃지 배치 계산.
   */
  @Cron('30 0 * * *', { name: 'badge-daily-calc', timeZone: 'Asia/Seoul' })
  async runDailyBadgeCalc(): Promise<void> {
    this.logger.log('[BADGE] Starting daily badge calculation...');
    try {
      const configs = await this.configRepo.findAllEnabled();
      let totalProcessed = 0;

      for (const config of configs) {
        try {
          const count = await this.badgeService.judgeAll(config);
          totalProcessed += count;
          this.logger.log(`[BADGE] guild=${config.guildId} processed=${count}`);
        } catch (err) {
          this.logger.error(
            `[BADGE] Failed guild=${config.guildId}`,
            (err as Error).stack,
          );
        }
      }

      this.logger.log(`[BADGE] Completed. Total processed=${totalProcessed}`);
    } catch (err) {
      this.logger.error('[BADGE] Unhandled error', (err as Error).stack);
    }
  }
}
```

---

### 단계 6-4: BadgeQueryService (공통 모듈에서 이미 정의됨)

**파일**: `badge-query.service.ts`

공통 모듈 계획(common-modules.md)에 정의된 대로 구현:

```typescript
@Injectable()
export class BadgeQueryService {
  constructor(
    @InjectRepository(VoiceHealthBadge)
    private readonly badgeRepo: Repository<VoiceHealthBadge>,
  ) {}

  async findBadgeCodes(guildId: string, userId: string): Promise<string[]>;
}
```

---

### 단계 6-5: VoiceAnalyticsModule 수정 (최종)

```diff
 providers: [
   ...
+  BadgeService,
+  BadgeScheduler,
+  BadgeQueryService,
 ],
 exports: [
   ...
+  BadgeQueryService,
 ],
```

---

## 기존 코드와의 충돌 분석

| 항목 | 충돌 여부 | 설명 |
|------|-----------|------|
| VoiceAnalyticsModule | 수정 필요 | providers, imports, exports 추가. T-SD-001/002와 순차적이므로 충돌 없음 |
| VoiceDailyEntity | 충돌 없음 | 읽기 전용 소비. 이미 TypeOrmModule.forFeature로 등록 패턴 존재 |
| VoiceCoPresencePairDaily | 충돌 없음 | TypeORM 직접 주입 (co-presence 모듈 코드 수정 없음) |
| MocoHuntingDaily | 충돌 없음 | TypeORM 직접 주입 (newbie 모듈 코드 수정 없음) |
| RedisService | 충돌 없음 | @Global() 모듈, 새 키 패턴만 추가 |
| ScheduleModule | 확인 필요 | AppModule에서 `ScheduleModule.forRoot()` 등록 여부 확인. 미등록이면 추가 필요 |
| 기존 슬래시 커맨드 | 충돌 없음 | 새 커맨드 파일 추가만 (기존 커맨드 수정 없음) |

---

## 구현 순서

```
단계 1 (T-SD-003):
  3-1. voice-health-cache.keys.ts
  3-2. voice-health-config.repository.ts
  3-3. dto/voice-health-config-save.dto.ts
  3-4. self-diagnosis.controller.ts
  3-5. VoiceAnalyticsModule 수정 (엔티티 + Controller + Repository 등록)

단계 2 (T-SD-004, T-SD-006 병렬 가능):
  4-1. self-diagnosis.types.ts
  4-2. hhi-calculator.ts
  4-3. self-diagnosis.service.ts
  6-1. badge.constants.ts
  6-2. badge.service.ts
  6-3. badge.scheduler.ts
  6-4. badge-query.service.ts
  6-5. VoiceAnalyticsModule 수정 (Service + Scheduler 등록)

단계 3 (T-SD-005):
  5-1. self-diagnosis.command.ts
  5-2. VoiceAnalyticsModule 수정 (Command 등록)
```

---

## 확인 필요 사항

1. **ScheduleModule 등록 여부**: `@nestjs/schedule`의 `ScheduleModule.forRoot()`가 AppModule에 등록되어 있는지 확인. BadgeScheduler의 `@Cron` 데코레이터가 동작하려면 필요.
2. **LLM Provider 주입**: T-SD-001 완료 후 `LLM_PROVIDER` 토큰이 존재해야 SelfDiagnosisService에서 선택적 주입 가능. `@Optional()` 데코레이터를 사용하므로 미등록 시에도 동작에는 문제 없음.
3. **VoiceCoPresencePairDaily의 date 형식**: `date` 컬럼이 PostgreSQL `date` 타입이므로, 쿼리 시 `'YYYY-MM-DD'` 형식 문자열로 비교해야 한다. VoiceDaily와 MocoHuntingDaily는 `YYYYMMDD` varchar 형식.
4. **MocoHuntingDaily의 mocoHelpedNewbies**: `uniqueNewbieCount` 컬럼은 일별 값이므로, 기간 합산 시 동일 newbie가 여러 날에 걸쳐 카운트될 수 있다. 정확한 고유 수를 구하려면 별도 쿼리가 필요하나, PRD에서 정확도를 명시하지 않았으므로 `SUM(uniqueNewbieCount)`을 사용하고 "도움준 신입 (연인원)" 형태로 표시한다.
