# 서버 개요 통합 API -- 백엔드 구현 계획

> PRD: [web.md](../specs/prd/web.md) (F-WEB-008 서버 개요 페이지)

## 목표

`GET /api/guilds/{guildId}/overview` 엔드포인트를 신규 생성하여, 서버 개요 페이지에서 필요한 모든 데이터를 한 번의 API 호출로 응답한다.

## 응답 스키마

```typescript
interface GuildOverviewResponse {
  totalMemberCount: number;
  todayVoiceTotalSec: number;
  currentVoiceUserCount: number;
  activeRate: number;
  inactiveByGrade: {
    fullyInactive: number;
    lowActive: number;
    declining: number;
  };
  missionSummary: {
    inProgress: number;
    completed: number;
    failed: number;
  } | null;
  weeklyVoice: Array<{
    date: string;
    totalSec: number;
  }>;
}
```

## 설계 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| 모듈 구조 | 독립 모듈 `OverviewModule` 신설 (`apps/api/src/overview/`) | 여러 도메인 데이터를 집계하는 횡단 관심사이므로 별도 모듈이 적합 |
| 데이터 접근 방식 | 기존 모듈이 export하는 Repository/Service를 주입. export되지 않는 것은 `TypeOrmModule.forFeature`로 직접 등록 | 기존 모듈 수정을 최소화 |
| totalMemberCount | `DiscordGateway.getGuild(guildId)` -> `guild.memberCount` | 이미 GatewayModule에서 export하는 DiscordGateway를 활용 |
| todayVoiceTotalSec | `VoiceDailyEntity` 직접 쿼리 (`channelId = 'GLOBAL'`, 오늘 날짜, `SUM(channelDurationSec)`) | GLOBAL 레코드의 channelDurationSec에는 값이 0이므로, 개별 채널 레코드를 합산해야 함 |
| currentVoiceUserCount | `BotMetric` 직접 쿼리 (최신 1건의 `voiceUserCount`) | MonitoringModule이 BotMetricRepository를 export하지 않으므로 TypeOrmModule.forFeature로 직접 등록 |
| activeRate | `InactiveMemberQueryRepository.countByGrade`의 로직 재활용 | InactiveMemberModule이 repository를 export하지 않으므로 TypeOrmModule.forFeature로 InactiveMemberRecord를 직접 등록하여 쿼리 |
| inactiveByGrade | InactiveMemberRecord에서 등급별 COUNT | 위와 동일 |
| missionSummary | `NewbieMissionRepository.countByStatusForGuild` 활용 | NewbieModule이 NewbieMissionRepository와 NewbieConfigRepository를 export하고 있음 |
| missionEnabled 판정 | `NewbieConfigRepository.findByGuildId` 활용 | NewbieModule이 export하고 있음 |
| weeklyVoice | VoiceDailyEntity 직접 쿼리 (최근 7일) | todayVoiceTotalSec와 동일한 접근 방식 |
| 인증 | `@UseGuards(JwtAuthGuard)` 컨트롤러 레벨 적용 | 기존 컨트롤러 패턴 동일 |
| 응답 타입 위치 | `libs/shared/src/types/overview.ts` | api-web 간 타입 공유 |

### VoiceDaily의 GLOBAL 레코드 주의사항

`InactiveMemberQueryRepository.sumVoiceDurationByUser` 주석에 따르면, GLOBAL 레코드의 `channelDurationSec`는 0이다. 따라서 todayVoiceTotalSec와 weeklyVoice 집계 시 `channelId != 'GLOBAL'` 조건으로 개별 채널 레코드를 합산해야 한다.

## 변경 파일 목록

### 신규 생성

| 파일 | 역할 |
|------|------|
| `apps/api/src/overview/overview.module.ts` | OverviewModule 정의 |
| `apps/api/src/overview/overview.controller.ts` | `GET /api/guilds/:guildId/overview` 엔드포인트 |
| `apps/api/src/overview/overview.service.ts` | 데이터 집계 비즈니스 로직 |
| `libs/shared/src/types/overview.ts` | `GuildOverviewResponse` 타입 정의 |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/app.module.ts` | `OverviewModule` import 추가 |
| `libs/shared/src/types/index.ts` | `overview.ts` re-export 추가 |

## 구현 단계

### Step 1: 응답 타입 정의

`libs/shared/src/types/overview.ts`에 `GuildOverviewResponse` 인터페이스를 정의한다.

```typescript
export interface GuildOverviewResponse {
  totalMemberCount: number;
  todayVoiceTotalSec: number;
  currentVoiceUserCount: number;
  activeRate: number;
  inactiveByGrade: {
    fullyInactive: number;
    lowActive: number;
    declining: number;
  };
  missionSummary: {
    inProgress: number;
    completed: number;
    failed: number;
  } | null;
  weeklyVoice: Array<{
    date: string;
    totalSec: number;
  }>;
}
```

`libs/shared/src/types/index.ts`에 re-export를 추가한다.

```diff
+export type { GuildOverviewResponse } from './overview';
```

### Step 2: OverviewService 구현

`apps/api/src/overview/overview.service.ts`

의존성 주입:
- `DiscordGateway` -- GatewayModule에서 export됨
- `NewbieConfigRepository` -- NewbieModule에서 export됨
- `NewbieMissionRepository` -- NewbieModule에서 export됨
- `@InjectRepository(VoiceDailyEntity)` -- TypeOrmModule.forFeature로 직접 등록
- `@InjectRepository(BotMetric)` -- TypeOrmModule.forFeature로 직접 등록
- `@InjectRepository(InactiveMemberRecord)` -- TypeOrmModule.forFeature로 직접 등록

```typescript
@Injectable()
export class OverviewService {
  constructor(
    private readonly discordGateway: DiscordGateway,
    private readonly newbieConfigRepo: NewbieConfigRepository,
    private readonly newbieMissionRepo: NewbieMissionRepository,
    @InjectRepository(VoiceDailyEntity)
    private readonly voiceDailyRepo: Repository<VoiceDailyEntity>,
    @InjectRepository(BotMetric)
    private readonly botMetricRepo: Repository<BotMetric>,
    @InjectRepository(InactiveMemberRecord)
    private readonly inactiveRecordRepo: Repository<InactiveMemberRecord>,
  ) {}
}
```

#### 2-1. getTotalMemberCount

```typescript
private async getTotalMemberCount(guildId: string): Promise<number> {
  const guild = await this.discordGateway.getGuild(guildId);
  return guild?.memberCount ?? 0;
}
```

#### 2-2. getTodayVoiceTotalSec

```typescript
private async getTodayVoiceTotalSec(guildId: string): Promise<number> {
  const today = this.getTodayDateString(); // YYYYMMDD
  const result = await this.voiceDailyRepo
    .createQueryBuilder('v')
    .select('COALESCE(SUM(v."channelDurationSec"), 0)', 'totalSec')
    .where('v.guildId = :guildId', { guildId })
    .andWhere('v.date = :today', { today })
    .andWhere('v.channelId != :globalId', { globalId: 'GLOBAL' })
    .getRawOne();
  return parseInt(result.totalSec, 10);
}
```

#### 2-3. getCurrentVoiceUserCount

```typescript
private async getCurrentVoiceUserCount(guildId: string): Promise<number> {
  const latest = await this.botMetricRepo
    .createQueryBuilder('m')
    .where('m.guildId = :guildId', { guildId })
    .orderBy('m.recordedAt', 'DESC')
    .limit(1)
    .getOne();
  return latest?.voiceUserCount ?? 0;
}
```

#### 2-4. getInactiveStats (activeRate + inactiveByGrade)

```typescript
private async getInactiveStats(guildId: string): Promise<{
  activeRate: number;
  inactiveByGrade: { fullyInactive: number; lowActive: number; declining: number };
}> {
  const raw: Array<{ grade: string | null; count: string }> = await this.inactiveRecordRepo
    .createQueryBuilder('r')
    .select('r.grade', 'grade')
    .addSelect('COUNT(*)', 'count')
    .where('r.guildId = :guildId', { guildId })
    .groupBy('r.grade')
    .getRawMany();

  const gradeMap = new Map(raw.map((r) => [r.grade, parseInt(r.count, 10)]));
  const totalClassified = raw.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

  const fullyInactive = gradeMap.get('FULLY_INACTIVE') ?? 0;
  const lowActive = gradeMap.get('LOW_ACTIVE') ?? 0;
  const declining = gradeMap.get('DECLINING') ?? 0;
  const activeCount = gradeMap.get(null) ?? 0; // grade=NULL은 활동 회원

  const activeRate = totalClassified > 0
    ? Math.round((activeCount / totalClassified) * 100)
    : 0;

  return {
    activeRate,
    inactiveByGrade: { fullyInactive, lowActive, declining },
  };
}
```

#### 2-5. getMissionSummary

```typescript
private async getMissionSummary(guildId: string): Promise<{
  inProgress: number;
  completed: number;
  failed: number;
} | null> {
  const config = await this.newbieConfigRepo.findByGuildId(guildId);
  if (!config?.missionEnabled) return null;

  const counts = await this.newbieMissionRepo.countByStatusForGuild(guildId);
  return {
    inProgress: counts.IN_PROGRESS,
    completed: counts.COMPLETED,
    failed: counts.FAILED,
  };
}
```

#### 2-6. getWeeklyVoice

```typescript
private async getWeeklyVoice(guildId: string): Promise<Array<{ date: string; totalSec: number }>> {
  const dates = this.getRecentDates(7); // YYYYMMDD 배열
  const fromDate = dates[0];
  const toDate = dates[dates.length - 1];

  const raw: Array<{ date: string; totalSec: string }> = await this.voiceDailyRepo
    .createQueryBuilder('v')
    .select('v.date', 'date')
    .addSelect('COALESCE(SUM(v."channelDurationSec"), 0)', 'totalSec')
    .where('v.guildId = :guildId', { guildId })
    .andWhere('v.date >= :fromDate', { fromDate })
    .andWhere('v.date <= :toDate', { toDate })
    .andWhere('v.channelId != :globalId', { globalId: 'GLOBAL' })
    .groupBy('v.date')
    .orderBy('v.date', 'ASC')
    .getRawMany();

  const dataMap = new Map(raw.map((r) => [r.date, parseInt(r.totalSec, 10)]));

  // 빈 날짜를 0으로 채워 7일 완전 배열 반환
  return dates.map((date) => ({
    date,
    totalSec: dataMap.get(date) ?? 0,
  }));
}
```

#### 2-7. getOverview (통합 메서드)

```typescript
async getOverview(guildId: string): Promise<GuildOverviewResponse> {
  // 독립적인 쿼리들을 병렬 실행
  const [
    totalMemberCount,
    todayVoiceTotalSec,
    currentVoiceUserCount,
    inactiveStats,
    missionSummary,
    weeklyVoice,
  ] = await Promise.all([
    this.getTotalMemberCount(guildId),
    this.getTodayVoiceTotalSec(guildId),
    this.getCurrentVoiceUserCount(guildId),
    this.getInactiveStats(guildId),
    this.getMissionSummary(guildId),
    this.getWeeklyVoice(guildId),
  ]);

  return {
    totalMemberCount,
    todayVoiceTotalSec,
    currentVoiceUserCount,
    activeRate: inactiveStats.activeRate,
    inactiveByGrade: inactiveStats.inactiveByGrade,
    missionSummary,
    weeklyVoice,
  };
}
```

#### 2-8. 유틸 메서드

```typescript
/** 오늘 날짜를 YYYYMMDD 형식으로 반환한다 */
private getTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** 최근 N일의 날짜를 YYYYMMDD 배열로 반환한다 (오늘 포함) */
private getRecentDates(days: number): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    result.push(`${yyyy}${mm}${dd}`);
  }
  return result;
}
```

### Step 3: OverviewController 구현

`apps/api/src/overview/overview.controller.ts`

```typescript
@Controller('api/guilds/:guildId')
@UseGuards(JwtAuthGuard)
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get('overview')
  async getOverview(
    @Param('guildId') guildId: string,
  ): Promise<GuildOverviewResponse> {
    return this.overviewService.getOverview(guildId);
  }
}
```

### Step 4: OverviewModule 구현

`apps/api/src/overview/overview.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([VoiceDailyEntity, BotMetric, InactiveMemberRecord]),
    GatewayModule,
    NewbieModule,
    AuthModule,
  ],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
```

모듈 의존성 해설:
- `TypeOrmModule.forFeature([VoiceDailyEntity, BotMetric, InactiveMemberRecord])` -- 해당 모듈이 repository를 export하지 않으므로 직접 등록
- `GatewayModule` -- `DiscordGateway` export됨
- `NewbieModule` -- `NewbieConfigRepository`, `NewbieMissionRepository` export됨
- `AuthModule` -- `JwtAuthGuard` 사용을 위해 필요

### Step 5: AppModule에 등록

`apps/api/src/app.module.ts`의 imports 배열에 `OverviewModule`을 추가한다.

```diff
 import { OverviewModule } from './overview/overview.module';
 ...
 @Module({
   imports: [
     ...
     VoiceAnalyticsModule,
     AuthModule,
     VersionModule,
+    OverviewModule,
   ],
 })
```

## 성능 고려사항

| 항목 | 잠재 이슈 | 대응 |
|------|-----------|------|
| 6개 쿼리 병렬 실행 | DB 커넥션 풀 소비 | `Promise.all`로 병렬화하되, 커넥션 풀 기본 설정(보통 10~20)으로 충분히 감내 가능 |
| VoiceDaily SUM 쿼리 | 대규모 서버에서 레코드 수 | `[guildId, date]` 복합 인덱스가 이미 존재하여 효율적 |
| BotMetric 최신 1건 조회 | ORDER BY recordedAt DESC LIMIT 1 | `IDX_bot_metric_guild_recorded` 인덱스 활용 |
| InactiveMemberRecord GROUP BY grade | 전체 레코드 스캔 | `IDX_inactive_member_record_guild_grade` 인덱스 활용 |
| Discord API (guild.memberCount) | API 호출 | DiscordGateway의 내부 캐시(discord.js 클라이언트 캐시)를 사용하므로 네트워크 호출 없음 |

## 테스트 체크리스트

- [ ] `JwtAuthGuard` 미인증 요청 시 401 반환
- [ ] `totalMemberCount`: Discord 봇이 해당 길드에 없을 때 0 반환
- [ ] `todayVoiceTotalSec`: 오늘 데이터가 없을 때 0 반환
- [ ] `todayVoiceTotalSec`: GLOBAL 레코드를 제외하고 개별 채널 레코드만 합산하는지 확인
- [ ] `currentVoiceUserCount`: BotMetric 레코드가 없을 때 0 반환
- [ ] `activeRate`: InactiveMemberRecord가 없을 때 0 반환
- [ ] `activeRate`: grade=NULL(활동) 회원 비율이 올바르게 계산되는지
- [ ] `inactiveByGrade`: 각 등급별 카운트가 정확한지
- [ ] `missionSummary`: `missionEnabled=false`일 때 null 반환
- [ ] `missionSummary`: NewbieConfig가 없을 때 null 반환
- [ ] `missionSummary`: 상태별 카운트가 정확한지
- [ ] `weeklyVoice`: 7일 배열이 항상 7개 항목을 반환하는지 (빈 날짜 0 채움)
- [ ] `weeklyVoice`: 날짜 순서가 오름차순인지
- [ ] 전체 응답이 `GuildOverviewResponse` 스키마와 일치하는지
