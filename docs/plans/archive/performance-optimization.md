# 스케일 대응 성능 최적화 계획 — 비활동 회원 스케줄러 & Co-Presence 폴링

## 개요

사용자·길드 수 증가 시 가장 부하가 큰 **비활동 회원 스케줄러**와 **Co-Presence 60초 폴링**의 DB/API 병목을 개선한다.
메모리 영향을 최소화하면서 쿼리 횟수와 Discord API 호출을 대폭 줄이는 것이 목표이다.

### 개선 대상 요약

| # | 대상 | 현재 병목 | 개선 방향 |
|---|------|----------|----------|
| A | 비활동 batchUpsert | N건 순차 INSERT | 다중행 VALUES 배치 |
| B | 비활동 자동조치 | 개별 members.fetch + 순차 실행 | 일괄 fetch + 동시성 제한 병렬 |
| C | Co-Presence 세션 종료 | 세션당 3회 DB 쿼리 | 길드 단위 배치 저장 |
| D | Co-Presence 회전주기 | 5분마다 flush | 15분으로 변경 |
| E | PairDaily 양방향 저장 | 쌍당 2건 INSERT | 단방향 1건으로 감축 |

### 기각된 제안

| 제안 | 기각 사유 |
|------|----------|
| `guild.members.fetch()` 결과 24시간 메모리 캐시 | GuildMember 객체 2~5KB/건 → 50길드×10,000명 = 1~2.5GB 메모리, Node.js 힙 초과 위험. 하루 1회 실행에 캐시 실익 없음 |

---

## A. 비활동 batchUpsert 다중행 배치

### 대상 파일

`apps/api/src/inactive-member/infrastructure/inactive-member.repository.ts`

### 현재 상태

```typescript
// batchUpsertRecords: 5,000명이면 5,000번 개별 쿼리
for (const record of records) {
  await this.recordRepo.query(`INSERT ... ON CONFLICT ...`, [7개 파라미터]);
}
```

### 변경 내용

`batchUpsertRecords` 메서드를 **다중행 VALUES + 청크 분할** 방식으로 교체한다.

```typescript
async batchUpsertRecords(records: UpsertRecordData[]): Promise<void> {
  if (records.length === 0) return;

  const COLS = 7;
  const CHUNK_SIZE = Math.floor(65535 / COLS); // ~9,362건씩 (PostgreSQL 파라미터 상한)

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const params: (string | number | null | Date)[] = [];
    const valueClauses: string[] = [];

    for (let j = 0; j < chunk.length; j++) {
      const o = j * COLS;
      valueClauses.push(
        `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}::int, $${o + 5}::int, $${o + 6}, $${o + 7}::timestamp, NOW(), NOW(), NOW())`,
      );
      params.push(
        chunk[j].guildId,
        chunk[j].userId,
        chunk[j].grade,
        chunk[j].totalMinutes,
        chunk[j].prevTotalMinutes,
        chunk[j].lastVoiceDate,
        chunk[j].classifiedAt,
      );
    }

    await this.recordRepo.query(
      `INSERT INTO inactive_member_record
        ("guildId","userId","grade","totalMinutes","prevTotalMinutes",
         "lastVoiceDate","gradeChangedAt","classifiedAt","createdAt","updatedAt")
      VALUES ${valueClauses.join(', ')}
      ON CONFLICT ("guildId","userId") DO UPDATE SET
        "grade" = EXCLUDED."grade",
        "totalMinutes" = EXCLUDED."totalMinutes",
        "prevTotalMinutes" = EXCLUDED."prevTotalMinutes",
        "lastVoiceDate" = EXCLUDED."lastVoiceDate",
        "gradeChangedAt" = CASE
          WHEN inactive_member_record."grade" IS DISTINCT FROM EXCLUDED."grade"
          THEN NOW() ELSE inactive_member_record."gradeChangedAt" END,
        "classifiedAt" = EXCLUDED."classifiedAt",
        "updatedAt" = NOW()`,
      params,
    );
  }
}
```

### 메모리 영향

- 추가 메모리: ~800KB/청크 (파라미터 배열 + SQL 문자열, 일시적)
- `records` 배열은 현재도 이미 메모리에 전체 보유 중이므로 실질 증가분 미미

### 효과

- 5,000명 기준 **5,000회 → 1회** 쿼리
- DB 왕복 대기 시간 대폭 감소

---

## B. 비활동 자동조치 일괄 fetch + 동시성 제한 병렬

### 대상 파일

`apps/api/src/inactive-member/application/inactive-member-action.service.ts`

### 현재 상태

```typescript
// executeRoleAction, executeDmAction, executeKickAction 모두 동일 패턴
for (const userId of targetUserIds) {
  const member = await guild.members.fetch(userId).catch(() => null); // 1명씩 API 호출
  // ... 개별 처리
}
```

### 변경 내용

#### B-1. 일괄 멤버 fetch 유틸 추가

3개 액션 메서드(Role/DM/Kick) 공통으로 사용할 일괄 fetch를 적용한다.

```typescript
// guild.members.fetch({ user: [...] })로 1회 API 호출
private async fetchMembers(
  guild: Guild,
  targetUserIds: string[],
): Promise<Collection<string, GuildMember>> {
  return guild.members.fetch({ user: targetUserIds }).catch(() => new Collection());
}
```

#### B-2. 동시성 제한 병렬 처리

Discord API Rate Limit을 고려하여 5개씩 병렬 처리한다.

```typescript
private async executeRoleAction(
  guild: Guild,
  targetUserIds: string[],
  roleId: string,
  action: 'add' | 'remove',
): Promise<{ successCount: number; failCount: number }> {
  let successCount = 0;
  let failCount = 0;

  const members = await this.fetchMembers(guild, targetUserIds);

  const CONCURRENCY = 5;
  for (let i = 0; i < targetUserIds.length; i += CONCURRENCY) {
    const batch = targetUserIds.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (userId) => {
        const member = members.get(userId);
        if (!member) throw new Error('not found');
        if (action === 'add') await member.roles.add(roleId);
        else await member.roles.remove(roleId);
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') successCount++;
      else failCount++;
    }
  }

  return { successCount, failCount };
}
```

DM, Kick 액션도 동일 패턴으로 변경한다:
- `executeDmAction`: 일괄 fetch 후 5개씩 병렬 DM 전송
- `executeKickAction`: 일괄 fetch 후 5개씩 병렬 kick (kickable 체크 포함)

### 메모리 영향

- FULLY_INACTIVE 500명 기준: 500 × 5KB = **~2.5MB** (일시적, 처리 완료 후 GC)
- 현재도 순차 실행 중 GC가 매 루프마다 발생하지 않아 비슷한 수준

### 효과

- `guild.members.fetch` **N회 → 1회** API 호출
- 역할/DM/킥 처리 속도 **~5배** 개선

---

## C. Co-Presence 세션 종료 길드 단위 배치 저장

### 대상 파일

| 파일 | 변경 |
|------|------|
| `apps/api/src/channel/voice/co-presence/co-presence.service.ts` | 배치 수집 + 길드별 일괄 처리 |
| `apps/api/src/channel/voice/co-presence/co-presence-db.repository.ts` | `saveSessionBatch`, `upsertDailyBatch` 메서드 추가 |

### 현재 상태

```typescript
// reconcile에서 세션 종료 시 1건씩 처리
for (const key of keysToEnd) {
  await this.endSession(session); // 내부에서 3회 DB 쿼리 실행
}
```

`endSession` 내부:
1. `dbRepo.saveSession(...)` — INSERT 1건
2. `dbRepo.upsertDaily(...)` — UPSERT 1건
3. `dbRepo.upsertPairDailyBatch(...)` — 배치 UPSERT (이미 배치화됨)

### 변경 내용

#### C-1. `co-presence-db.repository.ts` — 배치 메서드 추가

```typescript
/** 세션 다건 일괄 INSERT */
async saveSessionBatch(sessions: SaveSessionDto[]): Promise<void> {
  if (sessions.length === 0) return;
  await this.sessionRepo.save(sessions.map((s) => this.sessionRepo.create(s)));
}

/** Daily 다건 배치 UPSERT */
async upsertDailyBatch(
  rows: { guildId: string; userId: string; date: string; minutes: number; sessionCount: number }[],
): Promise<void> {
  if (rows.length === 0) return;

  const tableName = this.dailyRepo.metadata.tableName;
  const schemaPrefix = this.dailyRepo.metadata.schema
    ? `"${this.dailyRepo.metadata.schema}".`
    : '';
  const params: (string | number)[] = [];
  const valueClauses: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const o = i * 5;
    valueClauses.push(
      `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}::int, $${o + 5}::int)`,
    );
    params.push(
      rows[i].guildId, rows[i].userId, rows[i].date,
      rows[i].minutes, rows[i].sessionCount,
    );
  }

  await this.dailyRepo.query(
    `INSERT INTO ${schemaPrefix}"${tableName}"
      ("guildId", "userId", "date", "channelMinutes", "sessionCount")
    VALUES ${valueClauses.join(', ')}
    ON CONFLICT ("guildId", "userId", "date") DO UPDATE SET
      "channelMinutes" = "${tableName}"."channelMinutes" + EXCLUDED."channelMinutes",
      "sessionCount"   = "${tableName}"."sessionCount"   + EXCLUDED."sessionCount"`,
    params,
  );
}
```

#### C-2. `co-presence.service.ts` — 길드별 배치 종료

`reconcile` 메서드에서 종료/회전 대상 세션을 **수집만** 하고, 길드 단위로 `endSessionsBatch`를 호출한다.

```typescript
async reconcile(
  snapshots: CoPresenceTickSnapshot[],
  processedGuildIds: string[] = [],
): Promise<void> {
  // ... 기존 currentUsers 매핑 + 세션 시작/계속 로직 유지 ...

  // 종료 대상 수집 (DB 쓰기는 아직 안 함)
  const sessionsToEnd: ActiveCoPresenceSession[] = [];

  // 1) 스냅샷에서 사라진 사용자
  for (const [key, session] of this.activeSessions) {
    if (allProcessedGuildIds.has(session.guildId) && !currentUsers.has(key)) {
      sessionsToEnd.push(session);
      this.activeSessions.delete(key);
    }
  }

  // 2) 회전 대상 (임계값 초과)
  for (const [key, session] of this.activeSessions) {
    if (session.accumulatedMinutes >= FLUSH_THRESHOLD_MINUTES && currentUsers.has(key)) {
      sessionsToEnd.push(session);
      const current = currentUsers.get(key)!;
      this.startSession(key, current.channelId, current.peerIds);
    }
  }

  // 길드별로 배치 처리 (메모리 제한)
  if (sessionsToEnd.length > 0) {
    const byGuild = new Map<string, ActiveCoPresenceSession[]>();
    for (const session of sessionsToEnd) {
      const list = byGuild.get(session.guildId) ?? [];
      list.push(session);
      byGuild.set(session.guildId, list);
    }
    for (const [, guildSessions] of byGuild) {
      await this.endSessionsBatch(guildSessions);
    }
  }
}

private async endSessionsBatch(sessions: ActiveCoPresenceSession[]): Promise<void> {
  const sessionInserts: SaveSessionDto[] = [];
  const dailyRows: { guildId: string; userId: string; date: string; minutes: number; sessionCount: number }[] = [];
  const pairRows: UpsertPairDailyRow[] = [];
  const events: CoPresenceSessionEndedEvent[] = [];

  for (const session of sessions) {
    const endedAt = new Date();
    const date = this.toDateString(endedAt);
    const peerIds = [...session.peersSeen];
    const peerMinutesRecord: Record<string, number> = {};
    for (const [peerId, minutes] of session.peerMinutes) {
      peerMinutesRecord[peerId] = minutes;
    }

    sessionInserts.push({
      guildId: session.guildId, userId: session.userId, channelId: session.channelId,
      startedAt: session.startedAt, endedAt, durationMin: session.accumulatedMinutes,
      peerIds, peerMinutes: peerMinutesRecord,
    });
    dailyRows.push({
      guildId: session.guildId, userId: session.userId, date,
      minutes: session.accumulatedMinutes, sessionCount: 1,
    });
    for (const [peerId, minutes] of session.peerMinutes) {
      pairRows.push({ guildId: session.guildId, userId: session.userId, peerId, date, minutes, sessionCount: 1 });
      pairRows.push({ guildId: session.guildId, userId: peerId, peerId: session.userId, date, minutes, sessionCount: 1 });
    }
    events.push({
      guildId: session.guildId, channelId: session.channelId, userId: session.userId,
      startedAt: session.startedAt, endedAt, durationMin: session.accumulatedMinutes,
      peerIds, peerMinutes: peerMinutesRecord,
    });
  }

  try {
    // 3종 DB 작업을 병렬로 각 1회 배치 쿼리 실행
    await Promise.all([
      this.dbRepo.saveSessionBatch(sessionInserts),
      this.dbRepo.upsertDailyBatch(dailyRows),
      this.dbRepo.upsertPairDailyBatch(pairRows),
    ]);

    // 이벤트 순차 발행
    for (const event of events) {
      await this.eventEmitter.emitAsync(CO_PRESENCE_SESSION_ENDED, event);
    }
  } catch (err) {
    this.logger.error('[CO-PRESENCE] Batch endSessions failed', getErrorStack(err));
  }
}
```

### 메모리 영향

- 길드 단위 처리로 최대 메모리 = **단일 길드 내 세션**으로 제한
- 20채널 × 10명 = 200세션/길드: ~100KB (미미)
- 극단적 50명 채널이라도 길드 단위 분할로 24MB → ~2MB 수준

### 효과

- 500세션 회전 시 **1,500회 → 3회** DB 쿼리
- DB 연결 점유 시간 대폭 감소

---

## D. Co-Presence 회전주기 5분 → 15분

### 대상 파일

`apps/api/src/channel/voice/co-presence/co-presence.service.ts`

### 변경 내용

```typescript
// 변경 전
const FLUSH_THRESHOLD_MINUTES = 5;

// 변경 후
const FLUSH_THRESHOLD_MINUTES = 15;
```

### 트레이드오프

| 항목 | 5분 | 15분 |
|------|-----|------|
| DB 쓰기 빈도 | 높음 | **3배 감소** |
| 크래시 시 최대 손실 | 5분 | 15분 |
| 메모리 (peerMinutes 누적) | 적음 | 약간 증가 (peer당 +8bytes × 10분) |

관계 분석 용도에서 15분 데이터 손실은 허용 가능. Co-Presence 세션 자체가 "시간 함께한 관계"를 측정하므로 분 단위 정밀도가 필요 없음.

### 효과

- DB 쓰기 빈도 **3배 감소**
- 메모리는 미미하게 증가 (+10bytes × peer수 × 추가 10분, 무시 가능)

---

## E. PairDaily 단방향 저장

### 대상 파일

| 파일 | 변경 |
|------|------|
| `apps/api/src/channel/voice/co-presence/co-presence.service.ts` | pair 생성 시 단방향으로 변경 |
| `apps/api/src/channel/voice/co-presence/co-presence-db.repository.ts` | UPSERT 쿼리 유지 (변경 없음) |
| 조회 쿼리 사용처 전체 | 양방향 조회 → 단방향 조회로 변경 |
| 마이그레이션 | 기존 양방향 데이터를 단방향으로 병합 |

### 현재 상태

```typescript
// co-presence.service.ts endSession 내부
for (const [peerId, minutes] of peerMinutes) {
  pairRows.push({ userId, peerId, ... });       // A → B
  pairRows.push({ userId: peerId, peerId: userId, ... }); // B → A (중복)
}
```

### 변경 내용

#### E-1. pair 생성 로직

```typescript
// 단방향: 항상 작은 ID를 userId, 큰 ID를 peerId로
for (const [peerId, minutes] of peerMinutes) {
  const [smallId, bigId] = userId < peerId ? [userId, peerId] : [peerId, userId];
  // 중복 방지 (같은 쌍이 이미 추가됐는지 확인)
  const pairKey = `${smallId}:${bigId}`;
  if (!addedPairs.has(pairKey)) {
    pairRows.push({ guildId, userId: smallId, peerId: bigId, date, minutes, sessionCount: 1 });
    addedPairs.add(pairKey);
  }
}
```

#### E-2. 조회 쿼리 변경

기존 양방향 조회:
```sql
WHERE ("userId" = :a AND "peerId" = :b) OR ("userId" = :b AND "peerId" = :a)
```

단방향 조회:
```sql
WHERE "userId" = :smallId AND "peerId" = :bigId
-- 또는 특정 사용자의 모든 관계:
WHERE "userId" = :id OR "peerId" = :id
```

#### E-3. 마이그레이션

```sql
-- 양방향 데이터를 단방향으로 병합 (userId < peerId 기준으로 합산)
INSERT INTO voice_co_presence_pair_daily ("guildId", "userId", "peerId", "date", "minutes", "sessionCount")
SELECT
  "guildId",
  LEAST("userId", "peerId") AS "userId",
  GREATEST("userId", "peerId") AS "peerId",
  "date",
  SUM("minutes") / 2 AS "minutes",        -- 양방향이므로 2로 나눔
  SUM("sessionCount") / 2 AS "sessionCount"
FROM voice_co_presence_pair_daily
GROUP BY "guildId", LEAST("userId", "peerId"), GREATEST("userId", "peerId"), "date"
ON CONFLICT ("guildId", "userId", "peerId", "date") DO NOTHING;

-- 역방향 레코드 삭제
DELETE FROM voice_co_presence_pair_daily WHERE "userId" > "peerId";
```

### 조회 변경 영향 범위 조사 필요

구현 전 `voice_co_presence_pair_daily`를 조회하는 모든 코드를 탐색하여 변경 범위를 확정해야 한다.

### 메모리 영향

- 변화 없음 (DB 저장량만 감소)

### 효과

- pair 레코드 **50% 감소**
- INSERT/UPSERT 쿼리 파라미터 수 50% 감소
- 인덱스 크기 50% 감소 → 조회 성능도 간접 개선

---

## 변경 파일 요약

| # | 파일 경로 | 변경 유형 |
|---|----------|----------|
| 1 | `apps/api/src/inactive-member/infrastructure/inactive-member.repository.ts` | 수정 (A) |
| 2 | `apps/api/src/inactive-member/application/inactive-member-action.service.ts` | 수정 (B) |
| 3 | `apps/api/src/channel/voice/co-presence/co-presence-db.repository.ts` | 수정 (C) |
| 4 | `apps/api/src/channel/voice/co-presence/co-presence.service.ts` | 수정 (C, D, E) |
| 5 | Co-Presence 조회 쿼리 사용처 (탐색 필요) | 수정 (E) |
| 6 | 마이그레이션 파일 (신규) | 추가 (E) |

---

## 구현 순서

```
Phase 1: 독립 개선 (상호 의존성 없음, 병렬 가능)
├── A. batchUpsert 다중행 배치 (inactive-member.repository.ts)
├── B. 자동조치 일괄 fetch + 병렬 (inactive-member-action.service.ts)
└── D. 회전주기 5→15분 (co-presence.service.ts 상수 변경)

Phase 2: Co-Presence 배치 저장 (C)
├── C-1. DB Repository 배치 메서드 추가
└── C-2. Service reconcile 배치 로직 변경

Phase 3: PairDaily 단방향 (E) — 조회 영향 범위 확정 후
├── E-1. 조회 쿼리 사용처 전수 조사
├── E-2. 마이그레이션 작성
├── E-3. pair 생성 로직 변경
└── E-4. 조회 쿼리 변경
```

Phase 1은 각각 독립적이므로 동시 작업 가능.
Phase 3(E)은 조회 쿼리 변경 범위가 넓을 수 있어 마지막에 진행한다.

---

## 예상 효과 종합

| 지표 | 현재 (50길드 × 10,000명) | 개선 후 |
|------|--------------------------|---------|
| 비활동 분류 DB 쿼리 | 500,000회/실행 | **50회** (길드당 1배치) |
| 자동조치 API 호출 | N회 fetch + N회 액션 | **50회 fetch** + N/5 병렬 |
| Co-Presence DB 쿼리/틱 | 세션수 × 3회 | **길드수 × 3회** |
| Co-Presence flush 빈도 | 12회/시간 | **4회/시간** |
| PairDaily 레코드 수 | 2N건/쌍 | **N건/쌍** |
| 추가 메모리 | — | **< 5MB** (일시적) |
