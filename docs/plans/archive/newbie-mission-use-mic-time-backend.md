# 신입 미션 — `missionUseMicTime` 백엔드 구현 계획

> 대상: `apps/api` (NestJS 백엔드)
> 관련 PRD: F-NEWBIE-002 (미션 생성 및 추적)
> DB 변경: `newbie_config.missionUseMicTime boolean NOT NULL DEFAULT false` — 마이그레이션·엔티티 컬럼 추가는 이미 완료된 상태이므로 본 계획에서 다루지 않는다.
> 관련 마이그레이션: `apps/api/src/migrations/1777000000000-AddMissionUseMicTime.ts`
> 관련 엔티티: `apps/api/src/newbie/infrastructure/newbie-config.orm-entity.ts` (52번째 라인에 컬럼 추가됨)

---

## 1. 목표

신입 미션의 플레이타임 측정 시 길드 설정 `NewbieConfig.missionUseMicTime`에 따라 `VoiceDailyOrm`의 합산 컬럼을 다음과 같이 분기한다.

| `missionUseMicTime` | 합산 컬럼 | 의미 |
|---|---|---|
| `false` (기본) | `channelDurationSec` | 채널 접속 시간 (기존 동작) |
| `true` | `micOnSec` | 마이크 ON 시간만 누적 |

스냅샷 컬럼 없이 매 조회마다 현재 config를 참조하므로, 옵션 변경 즉시 진행 중인 모든 미션의 누적 시간이 새 기준으로 재계산된다.

### 영향 범위 — 변경 OFF 명시 (안전망)

- `NewbieMission` 엔티티/테이블: **변경 없음** — 스냅샷 컬럼 추가하지 않음
- `VoiceDailyOrm` 엔티티: **변경 없음**
- `VoiceChannelHistory` 세션 카운트(=플레이횟수) 로직: **변경 없음** — `missionUseMicTime`에 영향받지 않음 (PRD F-NEWBIE-002 명시)
- 모코코 사냥(F-NEWBIE-003) / 신입역할(F-NEWBIE-004): **변경 없음**

---

## 2. 변경 대상 파일 (코드베이스 탐색 결과)

| # | 파일 | 변경 종류 |
|---|---|---|
| 2-1 | `apps/api/src/newbie/presentation/dto/newbie-config-save.dto.ts` | 필드 추가 |
| 2-2 | `apps/api/src/newbie/infrastructure/newbie-config.repository.ts` | upsert 매핑 추가 |
| 2-3 | `apps/api/src/newbie/presentation/newbie.controller.ts` | 캐시 무효화 분기 추가 |
| 2-4 | `apps/api/src/newbie/application/mission/mission.service.ts` | 핵심 — `getPlaytimeSec` 분기 |
| 2-5 | `apps/api/src/newbie/application/mission/mission.service.spec.ts` | makeConfig 보강 + 분기 테스트 추가 |
| 2-6 | `apps/api/src/newbie/infrastructure/newbie-config.repository.integration-spec.ts` | upsert 보존 검증 추가 (선택) |
| 2-7 | `apps/api/src/newbie/presentation/newbie.controller.spec.ts` | 캐시 무효화 호출 검증 추가 |

> `mission.scheduler.ts`, `mission-discord.presenter.ts`, `mission-rank.renderer.ts`, `mission-discord-action.service.ts`는 모두 `MissionService.getPlaytimeSec()` 결과를 그대로 사용하거나 `playtimeSec` 숫자를 받아 표시만 하므로 **수정 불필요**. 분기는 단일 지점(`getPlaytimeSec`)에서만 수행한다.

---

## 3. 단계별 변경 상세

### 3-1. DTO 필드 추가

**파일**: `apps/api/src/newbie/presentation/dto/newbie-config-save.dto.ts`

`missionDisplayMode`/`missionTargetPlayCount`와 같은 미션 관련 필드 그룹 인근에 다음을 추가한다.

```ts
@IsOptional()
@IsBoolean()
missionUseMicTime?: boolean;
```

- `@IsOptional()`로 선언 — 기존 PRD 호환성 유지 (체크박스 OFF 시 클라이언트에서 false 명시 송신해도 무방하지만 미전송도 허용).
- 기본값은 repository upsert 시점에서 `false`로 처리 (3-2 참조).
- 위치는 `missionTargetPlaytimeHours` 바로 아래 — PRD에서 "목표 플레이타임 입력" 바로 아래 배치한다고 명시했으므로 DTO 순서도 동일하게 둔다.

### 3-2. Repository upsert 매핑

**파일**: `apps/api/src/newbie/infrastructure/newbie-config.repository.ts`

#### applyDtoToEntity (기존 엔티티 갱신)

```ts
config.missionTargetPlaytimeHours = dto.missionTargetPlaytimeHours ?? null;
config.missionUseMicTime = dto.missionUseMicTime ?? false;   // ← 추가
config.missionTargetPlayCount = dto.missionTargetPlayCount ?? null;
```

#### createEntityFromDto (신규 생성)

`missionTargetPlaytimeHours: dto.missionTargetPlaytimeHours ?? null` 바로 다음 라인에 동일한 매핑 추가.

```ts
missionTargetPlaytimeHours: dto.missionTargetPlaytimeHours ?? null,
missionUseMicTime: dto.missionUseMicTime ?? false,            // ← 추가
missionTargetPlayCount: dto.missionTargetPlayCount ?? null,
```

> DB 컬럼 default가 `false`라 `repo.create({...})` 호출 시 생략해도 DB는 false를 채우지만, TypeORM 엔티티 인스턴스의 즉시 보기 일관성과 캐시(직렬화)를 위해 명시적으로 채워준다. 다른 boolean 필드(`mocoAllowNewbieHunter` 등)와 동일한 패턴.

### 3-3. 컨트롤러 — config 변경 시 캐시 무효화

**파일**: `apps/api/src/newbie/presentation/newbie.controller.ts` — `POST /api/guilds/:guildId/newbie/config` 핸들러 (현재 `saveConfig`)

PRD: "`missionUseMicTime` 변경 시 `newbie:config:{guildId}`, `newbie:mission:active:{guildId}`, 미션 Canvas 캐시를 즉시 삭제"

기존 `saveConfig`는 `redisRepo.setConfig()`로 config 캐시는 항상 갱신하지만, 미션 active 캐시·Canvas 캐시는 명시적으로 삭제하지 않는다. 이를 다음 조건에서 추가로 삭제한다:

```ts
const prevUseMicTime = prevConfig?.missionUseMicTime ?? false;
const newUseMicTime = savedConfig.missionUseMicTime;

if (prevUseMicTime !== newUseMicTime) {
  // 진행 중 미션 누적 시간 재계산 강제 + Canvas 캐시 삭제
  await this.redisRepo.deleteMissionActive(guildId);
  await this.missionService.invalidateMissionCanvasCachePublic(guildId);
}
```

**구현 노트**:

- `MissionService`의 `invalidateMissionCanvasCache`는 현재 `private`다. 컨트롤러에서 호출 가능하도록 다음 중 하나를 선택:
  - **(권장)** `MissionService`에 `public async invalidateMissionCanvasCache(guildId: string): Promise<void>` 메서드를 그대로 노출하도록 접근 제한자만 `private` → `public`으로 변경 (또는 별도 명시적 wrapper 메서드 추가). 함수명은 변경 없음 — 호출부에서 의미가 동일하기 때문.
  - 또는 `RedisService.deleteByPattern(NewbieKeys.missionCanvasPattern(guildId))`를 컨트롤러에서 직접 호출하는 방식. 현재 컨트롤러에는 RedisService가 주입돼 있지 않으므로 첫 번째 방식이 깔끔하다.
- `NewbieRedisRepository`에 `deleteMissionActive(guildId)`는 이미 존재한다 (`mission.service.ts`에서 사용 중).
- 기존 미션 Embed 갱신 로직(`refreshMissionEmbed`)은 캐시 무효화 후 자연스럽게 새 값을 반영하므로 별도 추가 호출 불필요. 단, `missionEnabled = true` && `missionNotifyChannelId` 인 경우는 이미 기존 코드에서 `refreshMissionEmbed`를 호출한다.

### 3-4. 핵심 — `getPlaytimeSec` 분기

**파일**: `apps/api/src/newbie/application/mission/mission.service.ts`

#### 변경 전 (현재 코드 233~249라인)

```ts
async getPlaytimeSec(
  guildId: string,
  memberId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const result = await this.voiceDailyRepo
    .createQueryBuilder('vd')
    .select('COALESCE(SUM(vd.channelDurationSec), 0)', 'total')
    .where('vd.guildId = :guildId', { guildId })
    .andWhere('vd.userId = :memberId', { memberId })
    .andWhere('vd.date BETWEEN :startDate AND :endDate', { startDate, endDate })
    .andWhere("vd.channelId != 'GLOBAL'")
    .getRawOne<{ total: string }>();

  return parseInt(result?.total ?? '0', 10);
}
```

#### 변경 후

길드별 config를 매 호출마다 조회하면 N+1 문제가 발생한다 (한 길드에서 미션 30개 enrich 시 30번 조회). 따라서 다음 두 가지 변경을 동시에 수행한다.

1. **`getPlaytimeSec`에 `useMicTime` 옵션 파라미터 추가** — 호출자가 이미 가진 config로부터 값을 전달.
2. **호출자 측에서 config를 1회만 조회하여 모든 미션에 재사용**.

```ts
/**
 * 기간 내 플레이타임 합산 (초 단위).
 * @param useMicTime true면 micOnSec, false면 channelDurationSec를 합산한다.
 */
async getPlaytimeSec(
  guildId: string,
  memberId: string,
  startDate: string,
  endDate: string,
  useMicTime = false,
): Promise<number> {
  const column = useMicTime ? 'micOnSec' : 'channelDurationSec';

  const result = await this.voiceDailyRepo
    .createQueryBuilder('vd')
    .select(`COALESCE(SUM(vd.${column}), 0)`, 'total')
    .where('vd.guildId = :guildId', { guildId })
    .andWhere('vd.userId = :memberId', { memberId })
    .andWhere('vd.date BETWEEN :startDate AND :endDate', { startDate, endDate })
    .andWhere("vd.channelId != 'GLOBAL'")
    .getRawOne<{ total: string }>();

  return parseInt(result?.total ?? '0', 10);
}
```

> **SQL injection 안전성**: `column`은 내부 분기로만 산출되는 화이트리스트(`'micOnSec' | 'channelDurationSec'`)이므로 템플릿 리터럴 내 사용 가능. 외부 입력을 받지 않는다는 점을 코드 주석으로 명시하지 않아도 가독성 측면에서 충분하지만, 보수적으로 `useMicTime ? 'micOnSec' : 'channelDurationSec'`만 분기되도록 ESLint disable 주석 없이 작성한다.

#### `getPlaytimeSec` 호출부 일괄 갱신

다음 5개 호출부를 수정한다 (mission.service.ts·mission.scheduler.ts).

| 위치 | 호출 컨텍스트 | 변경 내용 |
|---|---|---|
| `mission.service.ts:172` `enrichMissions` | config 미보유 | config 1회 조회 후 `useMicTime` 전달 (3-4-A) |
| `mission.service.ts:204` `enrichHistoryMissions` | config 미보유 | 동일 (3-4-A) |
| `mission.service.ts:223` `enrichMissionItems` | config 미보유 | 동일 (3-4-A) |
| `mission.service.ts:372` `invalidateAndRefresh` | config 이미 조회됨 | `config?.missionUseMicTime ?? false` 전달 |
| `mission.service.ts:638` `buildMissionEmbedItems` | 시그니처에서 config 받음 | `config.missionUseMicTime` 전달 |
| `mission.scheduler.ts:64` `processExpiredMissions` | config 캐시 사용 중 | `configCache`에서 길드별 config 조회 후 전달. 현재는 `mission.targetPlayCount !== null`일 때만 config를 가져오므로, **항상 config를 가져오도록 변경** (3-4-B) |

##### 3-4-A. enrich* 메서드들 — config 1회 조회

세 메서드 모두 `Promise.all` 내부에서 `getPlaytimeSec`을 호출한다. 메서드 시작 부분에서 config를 1회 조회하여 클로저에 캡처한다.

```ts
async enrichMissions(
  guildId: string,
  missions: NewbieMission[],
): Promise<(NewbieMission & { memberName: string; currentPlaytimeSec: number })[]> {
  const config = await this.configRepo.findByGuildId(guildId);
  const useMicTime = config?.missionUseMicTime ?? false;

  return Promise.all(
    missions.map(async (mission) => {
      const [memberName, currentPlaytimeSec] = await Promise.all([
        this.presenter.fetchMemberDisplayName(guildId, mission.memberId),
        this.getPlaytimeSec(
          guildId, mission.memberId, mission.startDate, mission.endDate, useMicTime,
        ),
      ]);
      // ...기존 로직 유지
    }),
  );
}
```

`enrichHistoryMissions`, `enrichMissionItems`도 동일 패턴 적용. 함수 50줄 한도(ESLint warn) 준수 — 현재 각 메서드는 20줄 내외이므로 안전.

##### 3-4-B. Scheduler — config 항상 조회

`mission.scheduler.ts:60~77`의 루프에서 현재 코드:

```ts
const playtimeSec = await this.missionService.getPlaytimeSec(
  mission.guildId, mission.memberId, mission.startDate, mission.endDate,
);

let playCount = 0;
if (mission.targetPlayCount !== null) {
  playCount = await this.resolvePlayCount(mission.guildId, mission, configCache);
}
```

→ config 캐시를 먼저 조회하도록 재배치 (만료 미션은 어차피 모든 길드에서 길드별로 클러스터링됨):

```ts
// config 우선 캐시 조회 — useMicTime 분기에 필요
if (!configCache.has(mission.guildId)) {
  configCache.set(mission.guildId, await this.configRepo.findByGuildId(mission.guildId));
}
const config = configCache.get(mission.guildId);
const useMicTime = config?.missionUseMicTime ?? false;

const playtimeSec = await this.missionService.getPlaytimeSec(
  mission.guildId, mission.memberId, mission.startDate, mission.endDate, useMicTime,
);

let playCount = 0;
if (mission.targetPlayCount !== null && config) {
  playCount = await this.missionService.getPlayCount(
    mission.guildId, mission.memberId, mission.startDate, mission.endDate, config,
  );
}
```

기존의 `resolvePlayCount` 헬퍼는 동일한 configCache를 사용하도록 만들어져 있으므로 위 인라인화에 맞춰 메서드 본문을 정리(혹은 `resolvePlayCount`만 유지하고 그 위에서 별도로 config를 조회)한다. 헬퍼를 보존할 경우 시그니처를 그대로 두고 호출 전에 config를 미리 조회만 하면 충분하므로 **헬퍼 시그니처 변경 없이** 구현 가능.

##### 3-4-C. 영향 받지 않는 위치

- `getPlayCount`: PRD가 "플레이횟수는 영향받지 않음"이라고 명시했으므로 **수정하지 않는다**.
- `mission-discord.presenter.ts`의 `playtimeHour`/`playtimeMin`/`playtimeSec` 변환 (215~218라인): 입력으로 받는 `item.playtimeSec`이 이미 분기 결과이므로 자동 반영. 코드 변경 불필요.
- `mission-rank.renderer.ts`의 progress bar 계산 (404라인): `entry.playtimeSec / entry.targetPlaytimeSec`이 그대로 분기 결과를 사용. PRD에서 라벨/툴팁에 "마이크 ON 시간" 표기 요건은 **렌더러가 표시하는 텍스트가 단순 `12h30m/20h` 형식**이므로, 별도 라벨 분기는 본 백엔드 작업의 스코프 외 (필요 시 후속 작업으로 분리). 본 계획은 **수치 분기까지만** 다룬다.

---

## 4. 캐시 무효화 정책 정리

| 상황 | 무효화 대상 | 호출 지점 |
|---|---|---|
| `missionUseMicTime` 값 변경됨 | `newbie:config:{guildId}` (자동 — `setConfig`로 갱신), `newbie:mission:active:{guildId}`, `newbie:mission:canvas:{guildId}:*` | `NewbieController.saveConfig` (3-3) |
| `missionUseMicTime` 값 동일 (다른 필드만 변경) | 기존 동작 유지 (config 캐시만 갱신) | 변경 없음 |

> `newbie:config` 캐시는 `redisRepo.setConfig(guildId, savedConfig)`에서 항상 새 값으로 덮어쓰므로 명시 삭제 불필요.

---

## 5. 테스트 변경

### 5-1. `mission.service.spec.ts`

- `makeConfig` 헬퍼에 누락된 `missionUseMicTime: false` 키를 추가한다 (현재 `makeConfig`는 `NewbieConfig` 타입 전체 객체를 반환하므로 컴파일 에러 방지).
- `describe('getPlaytimeSec')`에 분기 테스트 추가:
  - `missionUseMicTime = false` (또는 미전달) → SELECT가 `channelDurationSec`을 합산하는지 (QueryBuilder.select 호출 인자 검증)
  - `missionUseMicTime = true` → SELECT가 `micOnSec`을 합산하는지
- `describe('invalidateAndRefresh')` / `describe('processExpiredMissions')` 영역의 기존 테스트가 `getPlaytimeSec`을 호출하는지 확인하고, 새 시그니처(`useMicTime` 인자) 호출 검증 추가.

### 5-2. `newbie-config.repository.integration-spec.ts`

(선택) `missionUseMicTime` 필드가 upsert 시 `false`로 저장되고, `true`로 갱신되는지 검증하는 테스트 케이스 1건 추가.

### 5-3. `newbie.controller.spec.ts`

- `saveConfig` 핸들러 테스트에 `prevConfig.missionUseMicTime !== dto.missionUseMicTime` 시 `redisRepo.deleteMissionActive`와 `missionService.invalidateMissionCanvasCache`(또는 동일 효과 호출)가 호출되는지 검증.
- 값이 동일할 때(`prevConfig.missionUseMicTime === dto.missionUseMicTime`)는 호출되지 않음을 확인하는 case도 추가.

---

## 6. 코딩 컨벤션 체크리스트

- [x] NestJS DI 패턴 준수 — 새로 주입할 의존성 없음
- [x] TypeORM Repository 패턴 준수 — 컬럼명 화이트리스트 분기, raw SQL 미사용
- [x] 함수 50줄 이하 (ESLint warn) — `getPlaytimeSec` 변경 후 약 20줄
- [x] 파라미터 3개 초과 (ESLint warn) — `getPlaytimeSec`은 이미 4개였고 5번째(`useMicTime`) 추가는 기본값을 제공하므로 호출자 부담은 동일. 필요 시 옵션 객체로 리팩터링 가능하나, 본 계획에서는 **5번째 위치 인자 + 기본값 false** 방식으로 유지 (기존 인자 순서·호출부 영향 최소화). `// eslint-disable-next-line max-params` 가 필요하면 함수 위에 부착.
- [x] 미션 분기 로직을 `getPlaytimeSec` 단일 지점에 캡슐화 — 중복 없음
- [x] PRD 변경 없음: 모코코·신입역할·플레이횟수
- [x] 주석은 why 중심 — 분기의 의미(채널 접속 vs 마이크 ON)를 메서드 JSDoc에 명시

---

## 7. 작업 순서 (체크리스트)

1. [ ] `NewbieConfigSaveDto`에 `missionUseMicTime?: boolean` 추가
2. [ ] `NewbieConfigRepository.applyDtoToEntity`/`createEntityFromDto`에 매핑 추가
3. [ ] `MissionService.getPlaytimeSec` 시그니처에 `useMicTime` 인자 추가 + SELECT 분기
4. [ ] `MissionService` 내 호출부 4곳(enrichMissions, enrichHistoryMissions, enrichMissionItems, invalidateAndRefresh, buildMissionEmbedItems) 수정 — config 1회 조회 후 전달
5. [ ] `MissionService.invalidateMissionCanvasCache`를 `private` → `public` (또는 별도 wrapper 메서드 추가)
6. [ ] `MissionScheduler.processExpiredMissions`에서 config를 항상 먼저 조회 후 useMicTime 전달
7. [ ] `NewbieController.saveConfig`에 `missionUseMicTime` 변경 감지 + 캐시 삭제 분기 추가
8. [ ] `mission.service.spec.ts`의 `makeConfig`에 `missionUseMicTime: false` 추가 + 분기 테스트 신규 케이스 작성
9. [ ] `newbie-config.repository.integration-spec.ts`에 (선택) 저장/갱신 검증 케이스 추가
10. [ ] `newbie.controller.spec.ts`에 캐시 무효화 검증 케이스 추가
11. [ ] `pnpm --filter @nexus/api lint && pnpm --filter @nexus/api test` 실행 및 그린 확인

---

## 8. 후속 작업 (본 계획 제외 — 별도 PR 권장)

- **렌더러 라벨**: PRD에서 Canvas 모드 플레이타임 컬럼 라벨을 "마이크 ON 시간"으로 표기하는 요건이 있다. 본 계획은 수치 분기까지만 처리하며, 라벨 변경은 `mission-rank.renderer.ts`의 `drawTableHeader` / `drawPlaytimeColumn`에 `useMicTime` 플래그를 전달하는 별도 작업으로 분리.
- **Embed 템플릿**: `{playtime}` 변수 의미가 분기에 따라 달라지므로, 길드 운영자에게 보이는 도움말(템플릿 변수 설명)에 "현재 길드의 `missionUseMicTime` 설정에 따라 의미가 달라짐" 안내 문구를 추가하는 것은 문서 작업으로 분리.
- **웹 대시보드**: `apps/web` 내 `missionUseMicTime` 체크박스 UI 추가는 별도 프론트엔드 PR.
