# 비활동 회원 추이 버그 수정 — `inactive_member_trend_daily` 스냅샷 테이블 도입

## 개요

비활동 회원 추이(trend) 차트가 항상 1일치 데이터만 표시되는 버그를 수정한다.

**원인**: `inactive_member_record.classifiedAt`은 매일 크론잡 실행 시 모든 레코드가 오늘 날짜로 UPSERT 되므로, `GROUP BY DATE(classifiedAt)` 방식으로는 과거 데이터가 존재하지 않는다.

**해결**: 별도 스냅샷 테이블(`inactive_member_trend_daily`)에 날짜별 등급 인원수를 누적 저장하고, `findTrend()`를 해당 테이블에서 조회하도록 변경한다.

---

## 1. 신규 ORM 엔티티 생성

**파일**: `apps/api/src/inactive-member/infrastructure/inactive-member-trend-daily.orm-entity.ts`

기존 `InactiveMemberActionLogOrm` 패턴을 따른다.

```typescript
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'inactive_member_trend_daily', schema: 'public' })
@Index('UQ_inactive_trend_daily_guild_date', ['guildId', 'date'], { unique: true })
@Index('IDX_inactive_trend_daily_guild_date', ['guildId', 'date'])
export class InactiveMemberTrendDailyOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  fullyInactiveCount: number;

  @Column({ type: 'int', default: 0 })
  lowActiveCount: number;

  @Column({ type: 'int', default: 0 })
  decliningCount: number;

  @Column({ type: 'int', default: 0 })
  totalClassified: number;

  @CreateDateColumn()
  createdAt: Date;
}
```

**컬럼 스펙**: PRD `inactive-member.md` 285~304행에 정의된 스키마를 정확히 반영한다.

---

## 2. 마이그레이션 파일 생성

**파일**: `apps/api/src/migrations/1776900000000-AddInactiveMemberTrendDaily.ts`

`inactive_member_trend_daily` 테이블과 인덱스를 생성하는 마이그레이션을 작성한다. DB 스키마 문서에 `synchronize: false`, 마이그레이션 기반이라고 명시되어 있으므로 마이그레이션이 필요하다.

### 마이그레이션 내용

- `CREATE TABLE inactive_member_trend_daily` (id, guildId, date, fullyInactiveCount, lowActiveCount, decliningCount, totalClassified, createdAt)
- UNIQUE 인덱스: `(guildId, date)`
- 일반 인덱스: `(guildId, date DESC)`

---

## 3. 모듈에 엔티티 등록

**파일**: `apps/api/src/inactive-member/inactive-member.module.ts`

### 변경 전

```typescript
TypeOrmModule.forFeature([
  InactiveMemberConfigOrm,
  InactiveMemberRecordOrm,
  InactiveMemberActionLogOrm,
  VoiceDailyOrm,
]),
```

### 변경 후

```typescript
TypeOrmModule.forFeature([
  InactiveMemberConfigOrm,
  InactiveMemberRecordOrm,
  InactiveMemberActionLogOrm,
  InactiveMemberTrendDailyOrm,
  VoiceDailyOrm,
]),
```

---

## 4. Repository에 스냅샷 저장 메서드 추가

**파일**: `apps/api/src/inactive-member/infrastructure/inactive-member.repository.ts`

### 추가 내용

1. `InactiveMemberTrendDailyOrm`을 `@InjectRepository()`로 주입한다.
2. `saveTrendSnapshot()` 메서드를 추가한다.

```typescript
async saveTrendSnapshot(
  guildId: string,
  date: string,
  counts: {
    fullyInactiveCount: number;
    lowActiveCount: number;
    decliningCount: number;
    totalClassified: number;
  },
): Promise<void> {
  await this.trendDailyRepo.query(
    `INSERT INTO inactive_member_trend_daily
      ("guildId", "date", "fullyInactiveCount", "lowActiveCount", "decliningCount", "totalClassified", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT ("guildId", "date")
    DO UPDATE SET
      "fullyInactiveCount" = EXCLUDED."fullyInactiveCount",
      "lowActiveCount" = EXCLUDED."lowActiveCount",
      "decliningCount" = EXCLUDED."decliningCount",
      "totalClassified" = EXCLUDED."totalClassified"`,
    [guildId, date, counts.fullyInactiveCount, counts.lowActiveCount, counts.decliningCount, counts.totalClassified],
  );
}
```

**UPSERT 전략**: 같은 길드+날짜 조합이 이미 존재하면 카운트만 갱신한다 (하루 중 재실행 대응).

---

## 5. Query Repository의 findTrend() 변경

**파일**: `apps/api/src/inactive-member/infrastructure/inactive-member-query.repository.ts`

### 추가 의존성

`InactiveMemberTrendDailyOrm`을 `@InjectRepository()`로 주입한다.

### 변경 전 (121~159행)

`inactive_member_record` 테이블에서 `GROUP BY DATE(classifiedAt)`으로 조회하는 기존 쿼리.

### 변경 후

```typescript
async findTrend(guildId: string): Promise<TrendEntry[]> {
  const rows = await this.trendDailyRepo
    .createQueryBuilder('t')
    .select('t.date', 'date')
    .addSelect('t.fullyInactiveCount', 'fullyInactive')
    .addSelect('t.lowActiveCount', 'lowActive')
    .addSelect('t.decliningCount', 'declining')
    .where('t.guildId = :guildId', { guildId })
    .andWhere(`t.date >= NOW() - INTERVAL '30 days'`)
    .orderBy('t.date', 'ASC')
    .getRawMany();

  return rows.map((r) => ({
    date: String(r.date).slice(0, 10),
    fullyInactive: parseInt(r.fullyInactive, 10),
    lowActive: parseInt(r.lowActive, 10),
    declining: parseInt(r.declining, 10),
  }));
}
```

**응답 형식 동일**: `TrendEntry` 인터페이스 (`{ date, fullyInactive, lowActive, declining }`)를 그대로 유지하므로 프론트엔드 변경 불필요.

---

## 6. 스케줄러에서 스냅샷 저장 호출

**파일**: `apps/api/src/inactive-member/application/inactive-member.scheduler.ts`

### 변경 위치

`processAllGuilds()` 메서드의 `classifyGuild()` 호출 직후, 자동 조치 실행 직전.

### 변경 내용

분류 결과 `records`에서 등급별 인원수를 집계한 뒤 `saveTrendSnapshot()`을 호출한다.

```typescript
const records = await this.inactiveMemberService.classifyGuild(guildId);

// 등급별 인원수 집계 후 스냅샷 저장
const counts = this.aggregateGradeCounts(records);
await this.repo.saveTrendSnapshot(guildId, this.getTodayDateString(), counts);
```

### 추가 private 메서드

```typescript
private aggregateGradeCounts(records: InactiveMemberRecord[]): {
  fullyInactiveCount: number;
  lowActiveCount: number;
  decliningCount: number;
  totalClassified: number;
} {
  let fullyInactiveCount = 0;
  let lowActiveCount = 0;
  let decliningCount = 0;

  for (const r of records) {
    if (r.grade === InactiveMemberGrade.FULLY_INACTIVE) fullyInactiveCount++;
    else if (r.grade === InactiveMemberGrade.LOW_ACTIVE) lowActiveCount++;
    else if (r.grade === InactiveMemberGrade.DECLINING) decliningCount++;
  }

  return {
    fullyInactiveCount,
    lowActiveCount,
    decliningCount,
    totalClassified: records.length,
  };
}

private getTodayDateString(): string {
  return getKSTDateString(); // YYYYMMDD -> YYYY-MM-DD 변환 필요 시 처리
}
```

**주의**: `getKSTDateString()`은 `YYYYMMDD` 형식을 반환한다. `date` 컬럼이 PostgreSQL `date` 타입이므로, `YYYY-MM-DD` 형식으로 변환하여 전달해야 한다. `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` 변환을 적용한다.

---

## 7. 데이터 보존 정책 — 90일 삭제 추가

**파일**: `apps/api/src/channel/voice/application/voice-data-retention.scheduler.ts`

### 변경 내용

`purgeExpiredData()` 메서드에 `inactive_member_trend_daily` 테이블의 90일 초과 레코드 삭제를 추가한다.

### 방법

1. `InactiveMemberTrendDailyOrm`을 `@InjectRepository()`로 주입한다.
2. 기존 `Promise.all()` 배열에 삭제 쿼리를 추가한다.

```typescript
this.trendDailyRepo
  .createQueryBuilder()
  .delete()
  .where('date < :cutoff', { cutoff: cutoffDateFormatted }) // YYYY-MM-DD 형식
  .execute(),
```

3. 로그 메시지에 삭제 건수를 추가한다.

### 모듈 변경

`VoiceChannelModule`에서 `VoiceDataRetentionScheduler`가 사용하므로, 해당 모듈의 `TypeOrmModule.forFeature()`에도 `InactiveMemberTrendDailyOrm`을 추가하거나, 보존 정책 로직을 `InactiveMemberModule`로 이동할 수 있다.

**권장 방안**: `VoiceChannelModule`에 `InactiveMemberTrendDailyOrm`을 직접 추가하는 것은 도메인 경계를 넘는다. 대신 `InactiveMemberScheduler`에 별도 보존 크론을 추가한다.

### 대안 (권장): InactiveMemberScheduler에 보존 크론 추가

**파일**: `apps/api/src/inactive-member/application/inactive-member.scheduler.ts`

```typescript
@Cron('30 19 * * *', { name: 'inactive-trend-retention' })
async purgeTrendData(): Promise<void> {
  const retentionDays = 90;
  try {
    const result = await this.repo.deleteTrendBefore(retentionDays);
    this.logger.log(`[INACTIVE] Trend retention: deleted ${result} records older than ${retentionDays} days`);
  } catch (err) {
    this.logger.error('[INACTIVE] Trend retention failed', getErrorStack(err));
  }
}
```

이 경우 `InactiveMemberRepository`에 `deleteTrendBefore()` 메서드를 추가한다.

---

## 작업 순서 요약

| 단계 | 파일 | 작업 내용 |
|------|------|----------|
| 1 | `inactive-member-trend-daily.orm-entity.ts` (신규) | ORM 엔티티 정의 |
| 2 | `1776900000000-AddInactiveMemberTrendDaily.ts` (신규) | 마이그레이션 |
| 3 | `inactive-member.module.ts` | 엔티티 등록 |
| 4 | `inactive-member.repository.ts` | `saveTrendSnapshot()`, `deleteTrendBefore()` 추가 |
| 5 | `inactive-member-query.repository.ts` | `findTrend()` 변경, 엔티티 주입 |
| 6 | `inactive-member.scheduler.ts` | 분류 후 스냅샷 저장, 보존 크론 추가 |

## 영향 범위

- **프론트엔드**: 변경 없음 (`TrendEntry` 응답 형식 동일)
- **API 컨트롤러**: 변경 없음 (`getStats()` -> `findTrend()` 호출 체인 동일)
- **기존 테이블**: `inactive_member_record` 변경 없음 (classifiedAt 동작도 그대로)
- **기존 데이터**: 스냅샷 테이블이 신규이므로 배포 이후부터 데이터가 누적되기 시작함. 과거 추이 데이터는 복구 불가 (예상 동작)
