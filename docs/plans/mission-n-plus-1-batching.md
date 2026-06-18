# 구현 계획 — mission.service.ts N+1 쿼리 배치화

> **유형**: 동작 보존(behavior-preserving) 성능 리팩터
> **도메인**: newbie (mission)
> **대상 파일**: `apps/api/src/newbie/application/mission/mission.service.ts` (889줄)
> **테스트**: `apps/api/src/newbie/application/mission/mission.service.spec.ts` (Vitest)
> **DB 스키마/마이그레이션 변경**: 없음 (쿼리 발생 방식만 변경)
> **status**: implemented (수정 모드)

---

## 0. 목표와 불변식 (Invariant)

미션 N개를 순회하며 미션마다 쿼리를 발생시키는 현재 구조를 **미션 배열 1회 배치 처리**로 바꾼다. **결과값(playtimeSec, playCount)은 100% 동일**하고 쿼리 수만 N배 → 상수배로 줄인다.

| 항목 | 현재 (미션 N개) | 목표 |
|---|---|---|
| `getPlaytimeSec` | N 쿼리 | 1 쿼리 |
| `getPlayCount` | 2N 쿼리 (distinct channels + sessions) | 2 쿼리 |
| 합계 (playCount 포함 경로) | 3N | 3 |

**불변식 — 절대 깨면 안 되는 것**:
1. 각 미션은 **서로 다른 `startDate`/`endDate`**(멤버별 가입일 기준)를 가진다. 배치 쿼리는 `[min(startDate)..max(endDate)]` 범위로 넓게 가져오되, **JS 후처리에서 미션별 정확한 범위로 재필터**해야 한다. 단순 `IN(memberIds)` 만으로는 결과가 달라진다.
2. 같은 `memberId`로 **여러 미션**이 동시에 존재할 수 있다(이론상). 따라서 배치 결과 맵의 키는 `memberId`가 아니라 **미션 식별 단위**(아래 §1.2)여야 한다.
3. `getPlaytimeSec`/`getPlayCount` 의 **단일 호출 시그니처는 보존**한다(다른 호출처/테스트 영향 최소화). 내부적으로 배치 1건을 호출하도록 위임한다.

---

## 1. 설계 핵심 결정

### 1.1 배치 메서드 신설 — 기존 단일 메서드는 위임으로 보존

신규 `private` 배치 메서드 2개를 추가하고, 기존 `public` 단일 메서드는 **내부에서 배치를 1건 호출**하도록 리팩터한다. 이로써:
- 단일 호출 경로(테스트, 타 호출처)의 시그니처/동작이 그대로 유지된다.
- "단일 = 배치(1건)" 이 코드 레벨에서 보장되어 동작 보존 검증이 쉬워진다.

```
getPlaytimeSec(guildId, memberId, start, end, useMicTime)
  └→ batchGetPlaytimeSec(guildId, [{key, memberId, start, end}], useMicTime).get(key)

getPlayCount(guildId, memberId, start, end, config)
  └→ batchGetPlayCount(guildId, [{key, memberId, start, end}], config).get(key)
```

### 1.2 배치 입력/출력 타입

배치 메서드는 **미션 단위 디스크립터 배열**을 받고 **`Map<key, number>`** 를 반환한다. `key`는 호출처가 미션과 결과를 매칭할 수 있는 고유값 — **`mission.id`(number)** 사용을 권장(전 호출처가 `NewbieMission` 객체를 보유하므로 안정적이고 중복 memberId 문제도 회피).

```ts
/** 배치 플레이타임/플레이횟수 산정 입력 단위 */
interface MissionRange {
  key: number;        // mission.id — 결과 매칭 키
  memberId: string;
  startDate: string;  // YYYYMMDD
  endDate: string;    // YYYYMMDD
}
```

> 단일 메서드 위임 시에는 임의 key(예: `0`)를 가진 1건 배열로 호출하고 `.get(0)` 으로 꺼낸다.

---

## 2. A. getPlaytimeSec 배치화

### 2.1 신규 시그니처

```ts
private async batchGetPlaytimeSec(
  guildId: string,
  ranges: MissionRange[],
  useMicTime = false,
): Promise<Map<number, number>>
```

### 2.2 배치 쿼리 SQL 스케치

빈 입력 가드 후, 전체 memberIds(중복 제거) + 전 범위 `[minStart..maxEnd]` 로 **userId·date 별 일별 합계**를 1쿼리로 가져온다. 미션별 범위 재집계를 위해 `date` 를 GROUP BY 에 포함해야 한다(단일 SUM 으로 뭉치면 미션별 분리 불가).

```sql
SELECT vd.userId AS "userId",
       vd.date   AS "date",
       SUM(vd.channelDurationSec) AS "cd",   -- useMicTime=false
       SUM(vd.micOnSec)           AS "mic"   -- useMicTime=true (둘 다 SELECT)
FROM voice_daily vd
WHERE vd.guildId = :guildId
  AND vd.userId IN (:...memberIds)
  AND vd.date BETWEEN :minStart AND :maxEnd
  AND vd.channelId != 'GLOBAL'
GROUP BY vd.userId, vd.date
```

QueryBuilder 형태(기존 패턴 준수, `column` 화이트리스트 주석 유지):

```ts
const column = useMicTime ? 'micOnSec' : 'channelDurationSec';
const rows = await this.voiceDailyRepo
  .createQueryBuilder('vd')
  .select('vd.userId', 'userId')
  .addSelect('vd.date', 'date')
  .addSelect(`COALESCE(SUM(vd.${column}), 0)`, 'total')
  .where('vd.guildId = :guildId', { guildId })
  .andWhere('vd.userId IN (:...memberIds)', { memberIds })
  .andWhere('vd.date BETWEEN :minStart AND :maxEnd', { minStart, maxEnd })
  .andWhere("vd.channelId != 'GLOBAL'")
  .groupBy('vd.userId')
  .addGroupBy('vd.date')
  .getRawMany<{ userId: string; date: string; total: string }>();
```

> `useMicTime` 분기는 **현재 단일 메서드와 동일하게 컬럼을 택일**한다(둘 다 SELECT 하지 않아도 됨 — 단일 호출이 1회 = 배치 1건이므로 useMicTime 은 호출 단위로 고정). 호출처들이 useMicTime 을 config 1개로 통일해 넘기므로 분기 동일성 유지.

### 2.3 JS 집계 의사코드

```
result = new Map<number, number>()
// userId -> (date -> total)  인덱스 구성
byUserDate = Map<string, Map<string, number>>
for row in rows:
    byUserDate[row.userId][row.date] = parseInt(row.total, 10)

for r in ranges:
    sum = 0
    dateMap = byUserDate[r.memberId] ?? empty
    for [date, total] in dateMap:
        if r.startDate <= date <= r.endDate:   // 문자열 비교 — YYYYMMDD 사전식 = 날짜순
            sum += total
    result.set(r.key, sum)
return result
```

**동작 보존 근거**:
- 단일 메서드의 `vd.date BETWEEN :startDate AND :endDate` 는 **문자열 BETWEEN(경계 포함)**. YYYYMMDD 는 zero-padded 8자리이므로 사전식 비교 `start <= date <= end` 가 날짜 대소와 100% 일치 → JS 의 `r.startDate <= date && date <= r.endDate` 로 동일 재현.
- `COALESCE(SUM, 0)` → 미션 범위에 매칭 date 가 없으면 `sum=0` → 단일 메서드의 빈 결과 0 과 동일.
- `channelId != 'GLOBAL'`, `guildId`, `userId` 필터는 쿼리에 그대로 유지.

> **주의**: `minStart`/`maxEnd` 는 `ranges` 의 문자열 min/max 로 계산(`ranges.reduce`). DB 가 가져오는 범위는 넓어지지만 JS 재필터가 미션별 정확 범위를 보장하므로 결과 동일.

### 2.4 단일 메서드 위임

```ts
async getPlaytimeSec(guildId, memberId, startDate, endDate, useMicTime = false): Promise<number> {
  const map = await this.batchGetPlaytimeSec(
    guildId,
    [{ key: 0, memberId, startDate, endDate }],
    useMicTime,
  );
  return map.get(0) ?? 0;
}
```

---

## 3. B. getPlayCount 배치화

`getPlayCount` 는 단일 메서드에서 **① distinct channels(voice_daily) → ② sessions(voice_history) → ③ JS 필터/그룹핑** 3단계. 배치는 ①②를 각각 1쿼리로 묶고 ③ JS 로직은 **미션별로 기존과 100% 동일하게** 적용한다.

### 3.1 신규 시그니처

```ts
private async batchGetPlayCount(
  guildId: string,
  ranges: MissionRange[],
  config: NewbieConfig,
): Promise<Map<number, number>>
```

### 3.2 ① distinct channels 배치 (voice_daily)

memberIds 전체 + 전 범위로 `userId, channelId` distinct 1쿼리 → memberId별 channelId 집합 맵.

```sql
SELECT DISTINCT vd.userId AS "userId", vd.channelId AS "channelId"
FROM voice_daily vd
WHERE vd.guildId = :guildId
  AND vd.userId IN (:...memberIds)
  AND vd.date BETWEEN :minStart AND :maxEnd
  AND vd.channelId != 'GLOBAL'
```

```ts
const channelRows = await this.voiceDailyRepo
  .createQueryBuilder('vd')
  .select('vd.userId', 'userId')
  .addSelect('vd.channelId', 'channelId')
  .distinct(true)
  .where('vd.guildId = :guildId', { guildId })
  .andWhere('vd.userId IN (:...memberIds)', { memberIds })
  .andWhere('vd.date BETWEEN :minStart AND :maxEnd', { minStart, maxEnd })
  .andWhere("vd.channelId != 'GLOBAL'")
  .getRawMany<{ userId: string; channelId: string }>();

// userId -> Set<channelId>
const channelsByMember = new Map<string, Set<string>>();
```

> **주의 — 미션별 channel 집합 정확성**: 단일 메서드는 `date BETWEEN [그 미션의 start..end]` 로 distinct channel 을 구한다. 배치는 `[minStart..maxEnd]` 로 가져오므로 **다른 미션 기간에만 등장한 채널이 섞일 수 있다**. 그러나 channel 집합은 ②의 `c.discordChannelId IN (...)` 필터로만 쓰이고, **②에서 다시 `joinedAt BETWEEN [미션 start..end]` 로 시간 필터**되므로 최종 세션 결과는 동일하다(채널 후보가 넓어져도 해당 미션 기간 밖 세션은 ②에서 제거됨). → **동작 보존됨** (단, 이 추론을 §6 체크리스트에서 명시적으로 테스트).
>
> 더 안전하게 하려면 channel 집합도 미션별로 재계산할 수 있으나(채널의 date 도 함께 SELECT), 위 근거로 불필요. 보수적 옵션은 §7 참조.

### 3.3 ② sessions 배치 (voice_history)

전체 memberIds × (해당 멤버 채널) × `[minStartDatetime..maxEndDatetime]` 로 1쿼리. 단일 메서드와 달리 **어느 멤버의 세션인지** 구분해야 하므로 `gm.userId` 를 SELECT 에 추가하고, 채널 매칭을 위해 `c.discordChannelId` 도 SELECT 한다.

```sql
SELECT gm.userId AS "userId",
       c.discordChannelId AS "channelId",
       vch.joinedAt AS "joinedAt",
       vch.leftAt   AS "leftAt"
FROM voice_channel_history vch
INNER JOIN guild_member gm ON gm.id = vch.guildMemberId
INNER JOIN channel c      ON c.id = vch.channelId
WHERE gm.userId IN (:...memberIds)
  AND c.discordChannelId IN (:...allChannelIds)
  AND vch.joinedAt BETWEEN :minStartDatetime AND :maxEndDatetime
ORDER BY vch.joinedAt ASC
```

```ts
const allChannelIds = [...new Set(채널 맵의 모든 channelId)];
const sessionRows = await this.voiceHistoryRepo
  .createQueryBuilder('vch')
  .select('gm.userId', 'userId')
  .addSelect('c.discordChannelId', 'channelId')
  .addSelect('vch.joinedAt', 'joinedAt')
  .addSelect('vch.leftAt', 'leftAt')
  .innerJoin('vch.guildMember', 'gm')
  .innerJoin('vch.channel', 'c')
  .where('gm.userId IN (:...memberIds)', { memberIds })
  .andWhere('c.discordChannelId IN (:...allChannelIds)', { allChannelIds })
  .andWhere('vch.joinedAt BETWEEN :minStartDatetime AND :maxEndDatetime', {
    minStartDatetime, maxEndDatetime,
  })
  .orderBy('vch.joinedAt', 'ASC')
  .getRawMany<{ userId: string; channelId: string; joinedAt: Date; leftAt: Date | null }>();
```

> **주의 — datetime 변환**: `minStartDatetime = yyyymmddToKSTDate(minStart, 'start')`, `maxEndDatetime = yyyymmddToKSTDate(maxEnd, 'end')`. **단일 메서드와 동일한 KST 변환 함수**를 그대로 사용한다.
>
> **주의 — getRawMany vs getMany**: 단일 메서드는 `getMany()`(엔티티 매핑, `joinedAt`/`leftAt` 이 `Date` 객체)를 쓴다. 배치는 `gm.userId`/`c.discordChannelId` 를 함께 뽑아야 해서 `getRawMany()` 로 전환한다. **이때 `joinedAt`/`leftAt` 이 raw 에서 어떤 타입으로 오는지(Date vs string) 반드시 검증**하고, 필요 시 `new Date(row.joinedAt)` 로 정규화하여 단일 메서드의 `Date` 동작과 일치시킨다. → §6 체크리스트 필수 항목.
>   - 정규화 헬퍼: `toDate(v) = v instanceof Date ? v : new Date(v)`. leftAt 은 null 가능.

### 3.4 ③ JS 집계 — 미션별로 기존 로직 100% 재사용

세션을 (userId, channelId) 로 인덱싱한 뒤, **미션별로** ⓐ 해당 멤버 채널 집합으로 세션 필터 → ⓑ joinedAt 미션 범위 필터 → ⓒ **기존 minDuration/interval 로직 그대로 적용**.

```
sessionsByMember = Map<string, Array<{channelId, joinedAt:Date, leftAt:Date|null}>>
  // memberIds 순회로 channelsByMember 의 채널만 포함하도록 인덱싱 (정규화: joinedAt/leftAt → Date)

result = new Map<number, number>()
for r in ranges:
    memberChannels = channelsByMember[r.memberId] ?? empty Set
    if memberChannels.size == 0:
        result.set(r.key, 0); continue        // 단일 메서드의 guildChannelIds.length===0 → 0 동치

    startDt = yyyymmddToKSTDate(r.startDate, 'start')
    endDt   = yyyymmddToKSTDate(r.endDate, 'end')

    // 미션 범위 + 채널 필터 (ORDER BY joinedAt ASC 보존 — 전체 정렬됨 → 부분집합도 정렬 유지)
    rows = (sessionsByMember[r.memberId] ?? [])
             .filter(s => memberChannels.has(s.channelId)
                          && s.joinedAt >= startDt && s.joinedAt <= endDt)

    result.set(r.key, countSessions(rows, config))   // ← 아래 추출 헬퍼
```

기존 ③ 로직을 **무손실로 헬퍼 추출**(단일·배치 공용):

```ts
/** 기존 getPlayCount 의 ③ JS 집계 로직 — 동작 보존 위해 그대로 추출 */
private countSessions(
  rows: { joinedAt: Date; leftAt: Date | null }[],
  config: NewbieConfig,
): number {
  if (config.playCountMinDurationMin === null && config.playCountIntervalMin === null) {
    return rows.length;
  }
  let sessions = rows;
  if (config.playCountMinDurationMin !== null) {
    const minMs = config.playCountMinDurationMin * 60 * 1000;
    sessions = sessions.filter((row) => {
      if (!row.leftAt) return false;
      return row.leftAt.getTime() - row.joinedAt.getTime() >= minMs;
    });
  }
  if (sessions.length === 0) return 0;
  if (config.playCountIntervalMin === null) return sessions.length;

  const intervalMs = config.playCountIntervalMin * 60 * 1000;
  let count = 1;
  let baseJoinedAt = sessions[0].joinedAt.getTime();
  for (let i = 1; i < sessions.length; i++) {
    const currentJoinedAt = sessions[i].joinedAt.getTime();
    if (currentJoinedAt - baseJoinedAt >= intervalMs) {
      count++;
      baseJoinedAt = currentJoinedAt;
    }
  }
  return count;
}
```

> **정렬 보존**: 단일 메서드는 SQL `ORDER BY vch.joinedAt ASC` 에 의존한 interval 카운팅을 한다. 배치 쿼리도 `ORDER BY vch.joinedAt ASC` 를 유지하고, **JS filter 는 순서를 보존**하므로 미션별 부분집합도 ASC 정렬이 유지된다. → interval 카운팅 결과 동일.
>
> **동률 joinedAt 타이브레이크 주의**: 단일 메서드 SQL 은 `joinedAt` 단일 키 정렬이라 동일 joinedAt 세션 간 순서가 불안정하지만, interval/minDuration 로직은 순서 무관(minDuration 은 개별 세션, interval 은 joinedAt 값만 사용)하므로 결과에 영향 없음. 배치도 동일 단일 키 정렬 유지로 동치.

### 3.5 단일 메서드 위임

```ts
async getPlayCount(guildId, memberId, startDate, endDate, config): Promise<number> {
  const map = await this.batchGetPlayCount(
    guildId,
    [{ key: 0, memberId, startDate, endDate }],
    config,
  );
  return map.get(0) ?? 0;
}
```

> **빈 입력 가드**: `batchGetPlayCount`/`batchGetPlaytimeSec` 은 `ranges.length === 0` 이면 빈 Map 즉시 반환(쿼리 미발생).

---

## 4. C. 호출처 수정 (5곳)

배치 메서드를 **미션 루프 진입 전 1회 호출**하고, 루프 안에서는 맵 조회로 대체한다. `enrich*` 의 memberName fetch(Discord)는 배치 대상이 **아니다** — 그대로 유지(`Promise.all` 의 닉네임 조회 가지, fire-and-forget `updateMemberName` 보존).

### 4.1 `enrichMissions` (164~191)

```ts
const useMicTime = config?.missionUseMicTime ?? false;
const playtimeMap = await this.batchGetPlaytimeSec(
  guildId,
  missions.map((m) => ({ key: m.id, memberId: m.memberId, startDate: m.startDate, endDate: m.endDate })),
  useMicTime,
);
return Promise.all(missions.map(async (mission) => {
  const memberName = await this.presenter.fetchMemberDisplayName(guildId, mission.memberId);
  if (memberName !== mission.memberName) void this.missionRepo.updateMemberName(mission.id, memberName);
  return { ...mission, memberName, currentPlaytimeSec: playtimeMap.get(mission.id) ?? 0 };
}));
```

> memberName 조회는 멤버별 Discord 호출이라 배치 불가 — **현행 유지**(이 plan 범위 밖). `Promise.all` 의 playtime 가지만 맵 조회로 치환.

### 4.2 `enrichHistoryMissions` (198~227)

동일 패턴. `getPlaytimeSec` 가지를 `playtimeMap.get(mission.id) ?? 0` 로 치환. memberName(있으면 DB값, 없으면 `fetchMemberNickname` + `updateMemberName`) 로직은 그대로.

### 4.3 `enrichMissionItems` (233~255)

동일 패턴. `getPlaytimeSec` 가지를 맵 조회로 치환. `resolveMemberName`(guildMemberService) 가지는 그대로.

### 4.4 `invalidateAndRefresh` 스케줄러 루프 (398~446)

playtime + playCount 둘 다 배치화. **루프 전에 2개 배치 맵 생성** 후 루프 내 조회.

```ts
const ranges = activeMissions.map((m) => ({ key: m.id, memberId: m.memberId, startDate: m.startDate, endDate: m.endDate }));
const playtimeMap = await this.batchGetPlaytimeSec(guildId, ranges, useMicTime);
// playCount 는 config && targetPlayCount!==null 인 미션만 필요 — 그 부분집합으로 배치
const countRanges = config ? ranges.filter((_, i) => activeMissions[i].targetPlayCount !== null) : [];
const playCountMap = countRanges.length ? await this.batchGetPlayCount(guildId, countRanges, config) : new Map<number, number>();

for (const mission of activeMissions) {
  const playtimeSec = playtimeMap.get(mission.id) ?? 0;
  const playCount = (mission.targetPlayCount !== null && config) ? (playCountMap.get(mission.id) ?? 0) : 0;
  // isMissionCompleted / updateStatus 로직은 그대로
}
```

> **동작 보존 주의**: 현재 코드는 `targetPlayCount === null || !config` 면 `playCount = 0` 으로 두고 `getPlayCount` 를 **호출하지 않는다**. 배치도 **그 부분집합만 countRanges 에 포함**시켜 동일하게 불필요 쿼리/계산을 피한다. `config` 가 falsy 면 playCount 배치 자체를 건너뜀(빈 Map).

### 4.5 `buildMissionEmbedItems` (666~702)

playtime + playCount 둘 다 배치화(이 메서드는 항상 둘 다 계산). 루프 전 2개 맵 생성 후 조회. `resolveMemberName`(멤버별) 은 루프 내 유지.

```ts
const ranges = missions.map((m) => ({ key: m.id, memberId: m.memberId, startDate: m.startDate, endDate: m.endDate }));
const [playtimeMap, playCountMap] = await Promise.all([
  this.batchGetPlaytimeSec(guildId, ranges, useMicTime),
  this.batchGetPlayCount(guildId, ranges, config),
]);
for (const mission of missions) {
  const playtimeSec = playtimeMap.get(mission.id) ?? 0;
  const playCount = playCountMap.get(mission.id) ?? 0;
  const username = await this.resolveMemberName(guildId, mission.memberId, mission.memberName);
  // items.push(...) 동일
}
```

> `buildMissionEmbedItems` 는 `refreshMissionEmbed`(EMBED) 와 `refreshMissionCanvas` 양쪽에서 호출됨 — 두 경로 모두 자동 수혜.

---

## 5. 신설/변경 메서드 요약

| 메서드 | 종류 | 시그니처 |
|---|---|---|
| `batchGetPlaytimeSec` | 신설 (private) | `(guildId, ranges: MissionRange[], useMicTime?) → Promise<Map<number, number>>` |
| `batchGetPlayCount` | 신설 (private) | `(guildId, ranges: MissionRange[], config) → Promise<Map<number, number>>` |
| `countSessions` | 신설 (private, 추출) | `(rows, config) → number` — 기존 ③ 로직 무손실 추출 |
| `getPlaytimeSec` | 변경 (위임) | 시그니처 동일, 내부에서 배치 1건 호출 |
| `getPlayCount` | 변경 (위임) | 시그니처 동일, 내부에서 배치 1건 호출 |
| `enrichMissions` / `enrichHistoryMissions` / `enrichMissionItems` / `invalidateAndRefresh` / `buildMissionEmbedItems` | 변경 (호출처) | 배치 1회 호출 후 맵 조회 |
| `MissionRange` | 신설 (interface) | 파일 상단 `DiscordGuildMemberLike` 옆 |

> `yyyymmddToKSTDate` 는 변경 없이 배치에서 재사용. `lint` 룰: `max-params 3개` — 배치 메서드는 `ranges` 배열로 묶어 파라미터 수 위반 회피(기존 `eslint-disable max-params` 주석 패턴은 단일 메서드에만 유지).

---

## 6. 동작 보존 검증 체크리스트 (필수)

리팩터 후 **단일 결과 = 배치 결과** 를 보장하는 회귀 관점. 기존 spec(Vitest, `makeQb` mock 패턴)을 확장한다.

### 6.1 등가성 (단일 = 배치 1건)
- [ ] `getPlaytimeSec` 위임 후 기존 `getPlaytimeSec` 6개 테스트 전부 그린(컬럼 분기, null→0, useMicTime true/false/미전달).
- [ ] `getPlayCount` 위임 후 기존 `getPlayCount` 4개 테스트 전부 그린(min/interval null, 빈 채널→0, minDuration 필터, interval 묶음).
- [ ] `invalidateAndRefresh` isMissionCompleted 5개 테스트 그린(targetPlayCount null/값, 달성/미달).

> **mock 영향 주의**: 위임으로 인해 `voiceDailyRepo.createQueryBuilder` 호출 시 `select`/`addSelect`/`groupBy`/`getRawMany` 체인으로 바뀐다. `makeQb` 에 `addSelect`/`groupBy`/`addGroupBy`/`distinct` mock 메서드 추가 필요. 기존 `getPlaytimeSec` 테스트가 `getRawOne`/`select` 호출을 검증하므로(`makeQb({ total })`, `qb.select.mock.calls[0][0]`), 위임 경로가 `getRawMany`/`groupBy` 를 쓰면 **기존 단언이 깨진다** → 해당 테스트들을 배치 쿼리 형태(`getRawMany` 반환 `[{userId, date, total}]`)에 맞게 갱신해야 함. **이것은 동작(반환값) 변경이 아니라 mock 형태 변경**임을 PR 에 명시.

### 6.2 다중 미션 배치 정확성 (신규 테스트)
- [ ] **서로 다른 날짜범위 2미션**: memberA(20260301~20260308), memberB(20260305~20260312) → 각자 자기 범위 합만 집계되는지(겹치는 maxEnd 범위 데이터가 섞이지 않는지).
- [ ] **같은 memberId·다른 미션 2건**(key=mission.id 로 분리되는지) — 이론적 케이스지만 키 설계 검증.
- [ ] **빈 미션 배열** → 빈 Map, 쿼리 0회(`createQueryBuilder` 미호출).
- [ ] **일부 멤버만 데이터 존재** → 데이터 없는 미션은 0.

### 6.3 경계/엣지
- [ ] **경계 날짜**: date == startDate, date == endDate 가 포함(BETWEEN inclusive) — 문자열 비교 `start <= date <= end`.
- [ ] **`channelId != 'GLOBAL'`** 제외 유지(배치 쿼리 andWhere 포함 단언).
- [ ] **useMicTime true/false** 분기 컬럼 선택 동일.
- [ ] **playCount config 3분기**: (min·interval 둘다 null) / (min만) / (interval만) / (둘다) — `countSessions` 추출 후에도 동일.
- [ ] **빈 채널 집합 미션 → 0** (단일의 `guildChannelIds.length===0` 동치).
- [ ] **voice_history raw 타입**: `getRawMany` 의 `joinedAt`/`leftAt` 이 `Date` 로 정규화되는지(`countSessions` 의 `.getTime()` 가 string 에서 깨지지 않도록). mock 은 `Date` 주입하되, **실 DB 동작 확인을 위해 raw 반환 타입을 PR 에서 1회 실측** 권장.

### 6.4 채널 후보 확장 무해성 (B 설계 핵심 리스크)
- [ ] **다른 미션 기간에만 등장한 채널이 ②에서 시간필터로 제거되는지**: memberA 미션범위 밖에서만 쓰인 채널 X 가 batch distinct 에 섞여도, memberA 의 joinedAt 미션범위 필터로 X 세션이 빠져 결과 불변임을 검증하는 테스트.

### 6.5 회귀 — 전체 spec
- [ ] `pnpm --filter @onyu/api test -- mission.service` 그린.
- [ ] `pnpm --filter @onyu/api lint` 그린(max-params, no-magic-numbers, max-lines-per-function warn 확인).

---

## 7. 동작 보존 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| **getRawMany 의 joinedAt/leftAt 타입**(string일 수 있음) | `countSessions` 의 `.getTime()` 런타임 오류 또는 NaN 비교 | 인덱싱 시 `Date` 정규화 헬퍼 적용 + §6.3 테스트 + 실 DB 1회 실측 |
| **채널 후보 확장**(배치 distinct 가 미션 범위 밖 채널 포함) | 이론상 playCount 오집계 | ②의 joinedAt 미션범위 필터가 제거 보장(§3.2 근거) + §6.4 테스트. 불안 시 **보수안**: distinct 에 `date` 도 SELECT 해 미션별 채널 집합 재계산 |
| **mock 형태 변경으로 기존 테스트 깨짐** | CI red | §6.1 주의대로 `makeQb` 확장 + 단일 메서드 테스트를 배치 쿼리 형태로 갱신(동작 아닌 형태 변경 명시) |
| **`IN (:...memberIds)` 대량 파라미터** | 길드당 활성 미션 수만큼(보통 수십) — Postgres 한도(수만) 대비 안전 | 현실 규모에서 무위험. 극단 대비 필요 시 청크 분할(이번 범위 밖) |
| **min/maxEnd 범위 과대**로 인한 스캔 증가 | 미션 기간이 제각각이면 범위가 넓어짐 | `voice_daily` 는 `(guildId,userId,date)` 인덱스 보유 → userId IN + date 범위 효율적. `voice_history` 는 `(guildMemberId, joinedAt DESC)` 인덱스 보유. 순 N+1 제거 이득이 범위 확대 비용을 크게 상회 |
| **빈 allChannelIds 로 `IN ()`** | SQL 오류 | distinct 결과가 전부 빈 채널이면 sessions 쿼리 스킵(가드) → 모든 미션 0 |

---

## 8. 작업 순서 (구현자용)

1. `MissionRange` interface + `countSessions` 헬퍼 추출(기존 ③ 로직 복붙, 동작 무변경) → 단일 `getPlayCount` 가 `countSessions` 쓰도록 1차 리팩터 + 테스트 그린 확인.
2. `batchGetPlaytimeSec` 신설 → `getPlaytimeSec` 를 위임으로 변경 → `makeQb` 확장 + 단일 테스트 갱신 → 그린.
3. `batchGetPlayCount` 신설 → `getPlayCount` 를 위임으로 변경 → 그린.
4. 호출처 5곳 순차 치환(4.1→4.5) → 각 단계 관련 테스트 그린.
5. §6.2·6.4 다중 미션/채널 확장 신규 테스트 추가.
6. `lint` + 전체 `mission.service` test 그린.

> **코드 표면적 준수**: 모든 변경은 `apps/api/src/newbie/application/mission/mission.service.ts` 1파일 + 같은 디렉토리 spec 1파일. `code.api`(newbie) 범위 내. **다른 도메인 영향 없음**. DB 파괴적 변경 없음 → HITL 🔴 마커 불필요. 신규 경로 없음.

---

## § manifest 갱신 필요 — 없음

- **변경 종류**: (d) 변경 없음.
- 본 작업은 `newbie` 도메인(status: `implemented`)의 기존 `code.api` 파일 1개 내부 리팩터다. status 변경 없음(이미 implemented), `code.*` 경로 신설 없음, 신규 도메인 없음.
- DB 스키마/마이그레이션 변경 없음 → `code.migrations` 영향 없음.
- 테스트는 기존 `apps/api/src/newbie/**/*.spec.ts` 경로 내(`mission.service.spec.ts`) 확장 → `code.tests` 경로 신설 불필요.
