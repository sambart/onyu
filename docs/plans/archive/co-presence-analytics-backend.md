# Co-Presence 관계 분석 대시보드 — 백엔드 구현 계획

> PRD: [voice-co-presence.md](../specs/prd/voice-co-presence.md) (F-COPRESENCE-007 ~ F-COPRESENCE-013)
> 선행 계획: [voice-co-presence-refactoring.md](./voice-co-presence-refactoring.md) (Phase 1~3 완료 전제)

## 목표

기존 `CoPresenceModule`에 읽기 전용 분석 API 7개를 추가한다. 컨트롤러 1개 + 서비스 1개를 신설하고, 모듈에 등록한다. DB 스키마 변경 없음.

## 설계 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| 분석 쿼리 위치 | `CoPresenceAnalyticsService`에서 TypeORM `Repository` + `QueryBuilder` 직접 사용 | 기존 `CoPresenceDbRepository`는 쓰기(세션/집계 저장) 전용. 읽기 분석 쿼리와 혼합하면 역할이 불명확해짐 |
| userName 조회 | `Member` 엔티티 LEFT JOIN 또는 별도 조회 후 in-memory 매핑 | `Member.discordMemberId`로 조인. `nickname` 컬럼 사용 |
| avatarUrl 조회 | `Member.avatarUrl` 컬럼 참조 | F-COPRESENCE-009 top-pairs에서 아바타 표시 필요 |
| 기존 repository 수정 | 없음 | `co-presence-db.repository.ts`는 그대로 유지 |
| 인증 | `@UseGuards(JwtAuthGuard)` 컨트롤러 레벨 적용 | 기존 컨트롤러 패턴 동일 (`MonitoringController`, `InactiveMemberController`) |

## 변경 파일 목록

### 신규 생성

| 파일 | 역할 |
|------|------|
| `apps/api/src/channel/voice/co-presence/co-presence-analytics.controller.ts` | 7개 GET 엔드포인트 |
| `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` | 분석 쿼리 비즈니스 로직 |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/channel/voice/co-presence/co-presence.module.ts` | `CoPresenceAnalyticsController`, `CoPresenceAnalyticsService` 등록 + `MemberModule` import 추가 |

## 구현 단계

### Step 1: CoPresenceAnalyticsService 구현

서비스에서 `@InjectRepository`로 `VoiceCoPresencePairDaily`, `VoiceCoPresenceDaily`, `Member` 리포지토리를 주입받는다.

```typescript
@Injectable()
export class CoPresenceAnalyticsService {
  constructor(
    @InjectRepository(VoiceCoPresencePairDaily)
    private readonly pairDailyRepo: Repository<VoiceCoPresencePairDaily>,
    @InjectRepository(VoiceCoPresenceDaily)
    private readonly dailyRepo: Repository<VoiceCoPresenceDaily>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
  ) {}
}
```

#### 1-1. 공통 유틸: 기간 계산 + userName 매핑

```typescript
/** days 파라미터로부터 조회 시작일(YYYY-MM-DD)을 계산한다 */
private getStartDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** userId 배열 → { userId: { userName, avatarUrl } } 매핑을 반환한다 */
private async getUserMap(
  userIds: string[],
): Promise<Map<string, { userName: string; avatarUrl: string | null }>> {
  if (userIds.length === 0) return new Map();
  const members = await this.memberRepo
    .createQueryBuilder('m')
    .where('m.discordMemberId IN (:...ids)', { ids: userIds })
    .getMany();
  const map = new Map<string, { userName: string; avatarUrl: string | null }>();
  for (const m of members) {
    map.set(m.discordMemberId, { userName: m.nickname, avatarUrl: m.avatarUrl });
  }
  return map;
}
```

#### 1-2. getSummary (F-COPRESENCE-007)

```typescript
async getSummary(guildId: string, days: number): Promise<SummaryResponse> {
  const startDate = this.getStartDate(days);

  // 활성 멤버 수: PairDaily에서 기간 내 DISTINCT userId
  const activeMemberCount = await this.pairDailyRepo
    .createQueryBuilder('p')
    .select('COUNT(DISTINCT p.userId)', 'cnt')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.date >= :startDate', { startDate })
    .getRawOne()
    .then(r => Number(r.cnt));

  // 총 관계 수: userId < peerId로 중복 제거한 쌍 수
  const totalPairCount = await this.pairDailyRepo
    .createQueryBuilder('p')
    .select('COUNT(DISTINCT (p.userId || \':\' || p.peerId))', 'cnt')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.date >= :startDate', { startDate })
    .andWhere('p.userId < p.peerId')
    .getRawOne()
    .then(r => Number(r.cnt));

  // 총 동시접속 시간: Daily에서 SUM / 2 (양방향 보정)
  const totalCoPresenceMinutes = await this.dailyRepo
    .createQueryBuilder('d')
    .select('COALESCE(SUM(d.channelMinutes), 0)', 'total')
    .where('d.guildId = :guildId', { guildId })
    .andWhere('d.date >= :startDate', { startDate })
    .getRawOne()
    .then(r => Math.floor(Number(r.total) / 2));

  // 평균 관계 수/인
  const avgPairsPerMember = activeMemberCount > 0
    ? Math.round((totalPairCount * 2 / activeMemberCount) * 100) / 100
    : 0;

  return { activeMemberCount, totalPairCount, totalCoPresenceMinutes, avgPairsPerMember };
}
```

#### 1-3. getGraph (F-COPRESENCE-008)

```typescript
async getGraph(guildId: string, days: number, minMinutes: number): Promise<GraphResponse> {
  const startDate = this.getStartDate(days);

  // 1. 동시접속 시간 기준 상위 50명 userId 조회 (Daily 기준)
  const topUsers: { userId: string; totalMinutes: number }[] = await this.dailyRepo
    .createQueryBuilder('d')
    .select('d.userId', 'userId')
    .addSelect('SUM(d.channelMinutes)', 'totalMinutes')
    .where('d.guildId = :guildId', { guildId })
    .andWhere('d.date >= :startDate', { startDate })
    .groupBy('d.userId')
    .orderBy('"totalMinutes"', 'DESC')
    .limit(50)
    .getRawMany();

  const topUserIds = topUsers.map(u => u.userId);
  if (topUserIds.length === 0) return { nodes: [], edges: [] };

  // 2. 상위 50명 간 엣지 조회 (userId < peerId로 중복 제거, minMinutes 필터)
  const edges: { userA: string; userB: string; totalMinutes: number; sessionCount: number }[] =
    await this.pairDailyRepo
      .createQueryBuilder('p')
      .select('p.userId', 'userA')
      .addSelect('p.peerId', 'userB')
      .addSelect('SUM(p.minutes)', 'totalMinutes')
      .addSelect('SUM(p.sessionCount)', 'sessionCount')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.date >= :startDate', { startDate })
      .andWhere('p.userId < p.peerId')
      .andWhere('p.userId IN (:...ids)', { ids: topUserIds })
      .andWhere('p.peerId IN (:...ids)', { ids: topUserIds })
      .groupBy('p.userId')
      .addGroupBy('p.peerId')
      .having('SUM(p.minutes) >= :minMinutes', { minMinutes })
      .getRawMany();

  // 3. userName 매핑
  const userMap = await this.getUserMap(topUserIds);

  const nodes = topUsers.map(u => ({
    userId: u.userId,
    userName: userMap.get(u.userId)?.userName ?? u.userId,
    totalMinutes: Number(u.totalMinutes),
  }));

  return { nodes, edges: edges.map(e => ({ ...e, totalMinutes: Number(e.totalMinutes), sessionCount: Number(e.sessionCount) })) };
}
```

#### 1-4. getTopPairs (F-COPRESENCE-009)

```typescript
async getTopPairs(guildId: string, days: number, limit: number): Promise<TopPairItem[]> {
  const startDate = this.getStartDate(days);

  const pairs = await this.pairDailyRepo
    .createQueryBuilder('p')
    .select('p.userId', 'userAId')
    .addSelect('p.peerId', 'userBId')
    .addSelect('SUM(p.minutes)', 'totalMinutes')
    .addSelect('SUM(p.sessionCount)', 'sessionCount')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.date >= :startDate', { startDate })
    .andWhere('p.userId < p.peerId')
    .groupBy('p.userId')
    .addGroupBy('p.peerId')
    .orderBy('"totalMinutes"', 'DESC')
    .limit(limit)
    .getRawMany();

  // userName + avatarUrl 매핑
  const allUserIds = [...new Set(pairs.flatMap(p => [p.userAId, p.userBId]))];
  const userMap = await this.getUserMap(allUserIds);

  return pairs.map(p => ({
    userA: {
      userId: p.userAId,
      userName: userMap.get(p.userAId)?.userName ?? p.userAId,
      avatarUrl: userMap.get(p.userAId)?.avatarUrl ?? null,
    },
    userB: {
      userId: p.userBId,
      userName: userMap.get(p.userBId)?.userName ?? p.userBId,
      avatarUrl: userMap.get(p.userBId)?.avatarUrl ?? null,
    },
    totalMinutes: Number(p.totalMinutes),
    sessionCount: Number(p.sessionCount),
  }));
}
```

#### 1-5. getIsolated (F-COPRESENCE-010)

```typescript
async getIsolated(guildId: string, days: number): Promise<IsolatedMember[]> {
  const startDate = this.getStartDate(days);

  // Daily에는 있지만 PairDaily에는 없는 사용자
  const result = await this.dailyRepo
    .createQueryBuilder('d')
    .select('d.userId', 'userId')
    .addSelect('SUM(d.channelMinutes)', 'totalVoiceMinutes')
    .addSelect('MAX(d.date)', 'lastVoiceDate')
    .where('d.guildId = :guildId', { guildId })
    .andWhere('d.date >= :startDate', { startDate })
    .andWhere(qb => {
      const subQuery = qb.subQuery()
        .select('1')
        .from(VoiceCoPresencePairDaily, 'p')
        .where('p.guildId = d.guildId')
        .andWhere('p.userId = d.userId')
        .andWhere('p.date >= :startDate')
        .getQuery();
      return `NOT EXISTS (${subQuery})`;
    })
    .groupBy('d.userId')
    .getRawMany();

  const userIds = result.map(r => r.userId);
  const userMap = await this.getUserMap(userIds);

  return result.map(r => ({
    userId: r.userId,
    userName: userMap.get(r.userId)?.userName ?? r.userId,
    totalVoiceMinutes: Number(r.totalVoiceMinutes),
    lastVoiceDate: r.lastVoiceDate,
  }));
}
```

**주의**: `VoiceCoPresenceDaily`의 `channelMinutes`는 "다른 사용자와 함께한 시간"이므로, 혼자 있었던 사용자는 이 테이블에 레코드가 없을 수 있다. 이 경우 F-COPRESENCE-010의 "고립 멤버"는 이 API로는 감지할 수 없으며, Voice 도메인의 `VoiceDailyEntity`를 기준으로 해야 할 수 있다. PRD에서는 `VoiceCoPresenceDaily` 레코드가 존재하되 `PairDaily`가 없는 경우로 정의하고 있으므로, 그대로 구현한다.

#### 1-6. getPairs (F-COPRESENCE-011)

```typescript
async getPairs(
  guildId: string, days: number, search: string | undefined,
  page: number, limit: number,
): Promise<PairsResponse> {
  const startDate = this.getStartDate(days);
  const offset = (page - 1) * limit;

  // 기본 쿼리: PairDaily 집계 + Member JOIN
  let qb = this.pairDailyRepo
    .createQueryBuilder('p')
    .select('p.userId', 'userAId')
    .addSelect('p.peerId', 'userBId')
    .addSelect('SUM(p.minutes)', 'totalMinutes')
    .addSelect('SUM(p.sessionCount)', 'sessionCount')
    .addSelect('MAX(p.date)', 'lastDate')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.date >= :startDate', { startDate })
    .andWhere('p.userId < p.peerId')
    .groupBy('p.userId')
    .addGroupBy('p.peerId');

  // search가 있으면: 집계 후 in-memory 필터 (Member JOIN을 서브쿼리로 하면 복잡해지므로)
  // 대안: 전체 집계 결과를 가져온 뒤 userName 매핑 후 필터
  // 성능 고려: search가 없으면 DB 페이지네이션, 있으면 상한 1000건 조회 후 in-memory 필터
  if (search) {
    qb = qb.limit(1000);
  }

  const rawPairs = await qb
    .orderBy('"totalMinutes"', 'DESC')
    .getRawMany();

  // userName 매핑
  const allUserIds = [...new Set(rawPairs.flatMap(p => [p.userAId, p.userBId]))];
  const userMap = await this.getUserMap(allUserIds);

  let items = rawPairs.map(p => ({
    userA: { userId: p.userAId, userName: userMap.get(p.userAId)?.userName ?? p.userAId },
    userB: { userId: p.userBId, userName: userMap.get(p.userBId)?.userName ?? p.userBId },
    totalMinutes: Number(p.totalMinutes),
    sessionCount: Number(p.sessionCount),
    lastDate: p.lastDate,
  }));

  if (search) {
    const keyword = search.toLowerCase();
    items = items.filter(
      item => item.userA.userName.toLowerCase().includes(keyword)
        || item.userB.userName.toLowerCase().includes(keyword),
    );
    const total = items.length;
    return { total, page, limit, items: items.slice(offset, offset + limit) };
  }

  // search 없는 경우: 별도 카운트 쿼리 + offset/limit 적용
  const totalQb = this.pairDailyRepo
    .createQueryBuilder('p')
    .select('COUNT(DISTINCT (p.userId || \':\' || p.peerId))', 'cnt')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.date >= :startDate', { startDate })
    .andWhere('p.userId < p.peerId');
  const total = await totalQb.getRawOne().then(r => Number(r.cnt));

  // 실제 페이지네이션은 rawPairs를 다시 쿼리하거나 slice
  // 효율적 방법: search 없을 때만 DB offset/limit 적용
  const pagedQb = this.pairDailyRepo
    .createQueryBuilder('p')
    .select('p.userId', 'userAId')
    .addSelect('p.peerId', 'userBId')
    .addSelect('SUM(p.minutes)', 'totalMinutes')
    .addSelect('SUM(p.sessionCount)', 'sessionCount')
    .addSelect('MAX(p.date)', 'lastDate')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.date >= :startDate', { startDate })
    .andWhere('p.userId < p.peerId')
    .groupBy('p.userId')
    .addGroupBy('p.peerId')
    .orderBy('"totalMinutes"', 'DESC')
    .offset(offset)
    .limit(limit);

  const pagedRaw = await pagedQb.getRawMany();
  const pagedUserIds = [...new Set(pagedRaw.flatMap(p => [p.userAId, p.userBId]))];
  const pagedUserMap = await this.getUserMap(pagedUserIds);

  const pagedItems = pagedRaw.map(p => ({
    userA: { userId: p.userAId, userName: pagedUserMap.get(p.userAId)?.userName ?? p.userAId },
    userB: { userId: p.userBId, userName: pagedUserMap.get(p.userBId)?.userName ?? p.userBId },
    totalMinutes: Number(p.totalMinutes),
    sessionCount: Number(p.sessionCount),
    lastDate: p.lastDate,
  }));

  return { total, page, limit, items: pagedItems };
}
```

**구현 참고**: search 없는 경우의 중복 쿼리를 제거하기 위해, search 유무에 따라 분기를 깔끔하게 나눈다. 위 의사코드를 실제 구현 시에는 search 있는 경로와 없는 경로를 별도 private 메서드로 분리하는 것이 좋다.

#### 1-7. getDailyTrend (F-COPRESENCE-012)

```typescript
async getDailyTrend(guildId: string, days: number): Promise<DailyTrendItem[]> {
  const startDate = this.getStartDate(days);

  const raw = await this.dailyRepo
    .createQueryBuilder('d')
    .select('d.date', 'date')
    .addSelect('SUM(d.channelMinutes) / 2', 'totalMinutes')  // 양방향 보정
    .where('d.guildId = :guildId', { guildId })
    .andWhere('d.date >= :startDate', { startDate })
    .groupBy('d.date')
    .orderBy('d.date', 'ASC')
    .getRawMany();

  // 빈 날짜 0으로 채우기
  const dataMap = new Map(raw.map(r => [r.date, Math.floor(Number(r.totalMinutes))]));
  const result: DailyTrendItem[] = [];
  const cursor = new Date(startDate);
  const today = new Date();
  while (cursor <= today) {
    const dateStr = cursor.toISOString().slice(0, 10);
    result.push({ date: dateStr, totalMinutes: dataMap.get(dateStr) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}
```

#### 1-8. getPairDetail (F-COPRESENCE-013)

```typescript
async getPairDetail(
  guildId: string, userA: string, userB: string, days: number,
): Promise<PairDetailResponse> {
  const startDate = this.getStartDate(days);

  // 단방향 조회: userId=min(A,B), peerId=max(A,B) 또는 양방향 합산
  // PRD: "userId IN (userA, userB) AND peerId IN (userA, userB)"로 단방향 집계
  // 실제로는 userId < peerId 쪽 한 방향만 조회하면 됨
  const [sortedA, sortedB] = userA < userB ? [userA, userB] : [userB, userA];

  const dailyData = await this.pairDailyRepo
    .createQueryBuilder('p')
    .select('p.date', 'date')
    .addSelect('SUM(p.minutes)', 'minutes')
    .where('p.guildId = :guildId', { guildId })
    .andWhere('p.userId = :sortedA', { sortedA })
    .andWhere('p.peerId = :sortedB', { sortedB })
    .andWhere('p.date >= :startDate', { startDate })
    .groupBy('p.date')
    .orderBy('p.date', 'ASC')
    .getRawMany();

  const totalMinutes = dailyData.reduce((sum, d) => sum + Number(d.minutes), 0);

  // userName 매핑
  const userMap = await this.getUserMap([userA, userB]);

  return {
    userA: { userId: userA, userName: userMap.get(userA)?.userName ?? userA },
    userB: { userId: userB, userName: userMap.get(userB)?.userName ?? userB },
    totalMinutes,
    dailyData: dailyData.map(d => ({ date: d.date, minutes: Number(d.minutes) })),
  };
}
```

### Step 2: CoPresenceAnalyticsController 구현

```typescript
@Controller('api/guilds/:guildId/co-presence')
@UseGuards(JwtAuthGuard)
export class CoPresenceAnalyticsController {
  constructor(
    private readonly analyticsService: CoPresenceAnalyticsService,
  ) {}

  @Get('summary')
  async getSummary(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    return this.analyticsService.getSummary(guildId, days);
  }

  @Get('graph')
  async getGraph(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
    @Query('minMinutes') minMinutesRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    const minMinutes = minMinutesRaw ? Math.max(0, parseInt(minMinutesRaw, 10)) : 10;
    return this.analyticsService.getGraph(guildId, days, minMinutes);
  }

  @Get('top-pairs')
  async getTopPairs(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    const limit = limitRaw ? Math.min(50, Math.max(1, parseInt(limitRaw, 10))) : 10;
    return this.analyticsService.getTopPairs(guildId, days, limit);
  }

  @Get('isolated')
  async getIsolated(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    return this.analyticsService.getIsolated(guildId, days);
  }

  @Get('pairs')
  async getPairs(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
    @Query('search') search?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10)) : 1;
    const limit = limitRaw ? Math.min(100, Math.max(1, parseInt(limitRaw, 10))) : 20;
    return this.analyticsService.getPairs(guildId, days, search, page, limit);
  }

  @Get('daily-trend')
  async getDailyTrend(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    return this.analyticsService.getDailyTrend(guildId, days);
  }

  @Get('pair-detail')
  async getPairDetail(
    @Param('guildId') guildId: string,
    @Query('userA') userA: string,
    @Query('userB') userB: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, 30);
    return this.analyticsService.getPairDetail(guildId, userA, userB, days);
  }

  /** days 파라미터를 파싱한다. 7/30/90 프리셋 외의 값도 허용하되 상한 365일 */
  private parseDays(raw: string | undefined, defaultValue: number): number {
    if (!raw) return defaultValue;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < 1) return defaultValue;
    return Math.min(parsed, 365);
  }
}
```

### Step 3: 모듈 수정

`co-presence.module.ts`에 다음 변경을 적용한다:

```diff
 import { DiscordModule } from '@discord-nestjs/core';
 import { Module } from '@nestjs/common';
 import { TypeOrmModule } from '@nestjs/typeorm';

+import { Member } from '../../../member/member.entity';
 import { VoiceChannelModule } from '../voice-channel.module';
+import { CoPresenceAnalyticsController } from './co-presence-analytics.controller';
+import { CoPresenceAnalyticsService } from './co-presence-analytics.service';
 import { CoPresenceScheduler } from './co-presence.scheduler';
 import { CoPresenceService } from './co-presence.service';
 import { CoPresenceCleanupScheduler } from './co-presence-cleanup.scheduler';
 import { CoPresenceDbRepository } from './co-presence-db.repository';
 import { VoiceCoPresenceDaily } from './domain/voice-co-presence-daily.entity';
 import { VoiceCoPresencePairDaily } from './domain/voice-co-presence-pair-daily.entity';
 import { VoiceCoPresenceSession } from './domain/voice-co-presence-session.entity';

 @Module({
   imports: [
     DiscordModule.forFeature(),
     TypeOrmModule.forFeature([
       VoiceCoPresenceSession,
       VoiceCoPresenceDaily,
       VoiceCoPresencePairDaily,
+      Member,
     ]),
     VoiceChannelModule,
   ],
+  controllers: [CoPresenceAnalyticsController],
   providers: [
     CoPresenceScheduler,
     CoPresenceService,
     CoPresenceDbRepository,
     CoPresenceCleanupScheduler,
+    CoPresenceAnalyticsService,
   ],
   exports: [CoPresenceScheduler],
 })
 export class CoPresenceModule {}
```

**`MemberModule` import 대신 `TypeOrmModule.forFeature([Member])` 직접 등록**: `MemberModule`이 `TypeOrmModule`을 export하므로 `MemberModule` import도 가능하지만, 분석 서비스는 `MemberService`의 비즈니스 로직이 불필요하고 `Repository<Member>`만 필요하므로, `TypeOrmModule.forFeature([Member])`에 직접 추가하는 것이 더 가벼운 의존성이다.

## 응답 타입 정의

서비스 파일 상단 또는 별도 DTO 파일에 인터페이스를 정의한다. 기존 패턴에서는 서비스 파일에 인라인으로 정의하는 경우가 많으므로(`MonitoringService`의 `BotStatusResponse` 등), 동일한 방식을 따른다.

```typescript
export interface SummaryResponse {
  activeMemberCount: number;
  totalPairCount: number;
  totalCoPresenceMinutes: number;
  avgPairsPerMember: number;
}

export interface GraphResponse {
  nodes: { userId: string; userName: string; totalMinutes: number }[];
  edges: { userA: string; userB: string; totalMinutes: number; sessionCount: number }[];
}

export interface TopPairItem {
  userA: { userId: string; userName: string; avatarUrl: string | null };
  userB: { userId: string; userName: string; avatarUrl: string | null };
  totalMinutes: number;
  sessionCount: number;
}

export interface IsolatedMember {
  userId: string;
  userName: string;
  totalVoiceMinutes: number;
  lastVoiceDate: string;
}

export interface PairsResponse {
  total: number;
  page: number;
  limit: number;
  items: {
    userA: { userId: string; userName: string };
    userB: { userId: string; userName: string };
    totalMinutes: number;
    sessionCount: number;
    lastDate: string;
  }[];
}

export interface DailyTrendItem {
  date: string;
  totalMinutes: number;
}

export interface PairDetailResponse {
  userA: { userId: string; userName: string };
  userB: { userId: string; userName: string };
  totalMinutes: number;
  dailyData: { date: string; minutes: number }[];
}
```

## 성능 고려사항

| 엔드포인트 | 잠재 이슈 | 대응 |
|-----------|-----------|------|
| `/graph` | 상위 50명 간 엣지 = 최대 1,225쌍 집계 | IN 절 50개 + GROUP BY로 충분히 빠름. 인덱스 `IDX_copresence_pair_guild_date` 활용 |
| `/pairs` (search) | 전체 쌍 집계 후 in-memory 필터 | 상한 1,000건으로 제한. 대규모 서버에서도 감내 가능 |
| `/pairs` (no search) | DB 페이지네이션 | GROUP BY + OFFSET/LIMIT. 인덱스 활용 |
| `/isolated` | NOT EXISTS 서브쿼리 | `PairDaily`의 `IDX_copresence_pair_guild_user_date` 인덱스가 서브쿼리 성능 보장 |
| `/daily-trend` | 최대 365일 × 날짜 집계 | 단순 GROUP BY date, 인덱스 활용 |

## 테스트 체크리스트

- [ ] 모든 엔드포인트에 `JwtAuthGuard`가 적용되어 미인증 요청이 401을 반환하는지
- [ ] `days` 파라미터 기본값이 정상 적용되는지 (미전달 시 30)
- [ ] `days` 상한 365일이 적용되는지
- [ ] `/summary` 양방향 보정(/ 2)이 정확한지
- [ ] `/graph` 상위 50명 제한이 동작하는지
- [ ] `/graph` minMinutes 필터가 엣지를 올바르게 필터링하는지
- [ ] `/top-pairs` `userId < peerId` 중복 제거가 정상 동작하는지
- [ ] `/isolated` NOT EXISTS 서브쿼리가 올바른 결과를 반환하는지
- [ ] `/pairs` 검색 모드에서 userA/userB 양쪽 이름 매칭이 동작하는지
- [ ] `/pairs` 페이지네이션이 정상 동작하는지 (total, page, limit 정합)
- [ ] `/daily-trend` 데이터 없는 날짜가 0으로 채워지는지
- [ ] `/pair-detail` 양쪽 userId 순서에 무관하게 동일한 결과를 반환하는지
- [ ] `Member` 테이블에 없는 userId가 있을 때 userId 자체가 userName으로 대체되는지
