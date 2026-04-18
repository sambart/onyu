# 신입 미션 목표 플레이횟수(targetPlayCount) 구현 계획

## 개요

신입 미션 달성 조건에 플레이타임(기존) 외 **목표 플레이횟수**를 AND 조건으로 추가한다. `missionTargetPlayCount`가 NULL이면 기존 동작(플레이타임만)을 유지하므로 하위 호환성이 보장된다.

## PRD 참조

- `docs/specs/prd/newbie.md` -- F-NEWBIE-002 달성 판정 로직, F-NEWBIE-005 API 응답
- `docs/archive/prd-changelog.md` -- v5.4

## 선행 완료 항목 (구현 제외)

- Entity: `NewbieConfigOrmEntity.missionTargetPlayCount`, `NewbieMissionOrmEntity.targetPlayCount` 컬럼 추가 완료
- 마이그레이션: `1775237569293-AddMissionTargetPlayCount.ts` 적용 완료
- DB 스키마 문서 갱신 완료

---

## 변경 대상 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `apps/api/src/newbie/presentation/dto/newbie-config-save.dto.ts` | 수정 | `missionTargetPlayCount` 필드 추가 |
| `apps/api/src/newbie/infrastructure/newbie-mission.repository.ts` | 수정 | `create()` 메서드에 `targetPlayCount` 파라미터 추가 |
| `apps/api/src/newbie/application/mission/mission.service.ts` | 수정 | 미션 생성 시 config 값 전달, 달성 판정 로직 변경, Embed 데이터에 targetPlayCount 포함 |
| `apps/api/src/newbie/application/mission/mission.scheduler.ts` | 수정 | 만료 처리 시 달성 판정 로직에 playCount 조건 추가 |
| `apps/api/src/newbie/application/mission/mission-discord.presenter.ts` | 수정 | `MissionEmbedItem`에 `targetPlayCount` 필드 추가, 템플릿 변수 렌더링 |
| `apps/api/src/newbie/infrastructure/newbie-template.constants.ts` | 수정 | `MISSION_ITEM_ALLOWED_VARS`에 `{targetPlayCount}` 추가 |
| `apps/web/app/lib/newbie-api.ts` | 수정 | `NewbieConfig` 타입에 `missionTargetPlayCount`, `NewbieMission` 타입에 `targetPlayCount` 추가 |
| `apps/web/app/settings/guild/[guildId]/newbie/components/MissionTab.tsx` | 수정 | 목표 플레이횟수 입력 UI 추가 |
| `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` | 수정 | 초기값에 `missionTargetPlayCount` 추가 |

### 테스트 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `apps/api/src/newbie/application/mission/mission.service.spec.ts` | 수정 | targetPlayCount 관련 테스트 추가 |
| `apps/api/src/newbie/infrastructure/newbie-mission.repository.spec.ts` | 수정 | create() 파라미터 변경 반영 |
| `apps/api/src/newbie/presentation/newbie.controller.spec.ts` | 수정 | makeMission에 targetPlayCount 추가 |
| `apps/web/app/lib/__tests__/newbie-api.test.ts` | 수정 | 타입 변경 반영 |
| `apps/web/app/dashboard/guild/[guildId]/newbie/__tests__/MissionManageTab.test.tsx` | 수정 | mock 데이터에 targetPlayCount 추가 |
| `apps/web/app/settings/guild/[guildId]/newbie/__tests__/MocoTab.test.tsx` | 수정 | mock config에 missionTargetPlayCount 추가 |

---

## 단계별 구현

### 1단계: DTO 및 Repository 수정

#### 1-1. `newbie-config-save.dto.ts` 수정

`missionTargetPlaytimeHours` 바로 아래에 추가:

```typescript
@IsOptional()
@IsInt()
@Min(1)
missionTargetPlayCount?: number | null;
```

#### 1-2. `newbie-mission.repository.ts` -- `create()` 메서드 시그니처 변경

```typescript
async create(
  guildId: string,
  memberId: string,
  startDate: string,
  endDate: string,
  targetPlaytimeSec: number,
  memberName?: string | null,
  targetPlayCount?: number | null,   // 추가
): Promise<NewbieMission> {
  const mission = this.repo.create({
    guildId,
    memberId,
    memberName: memberName ?? null,
    startDate,
    endDate,
    targetPlaytimeSec,
    targetPlayCount: targetPlayCount ?? null,   // 추가
    status: MissionStatus.IN_PROGRESS,
  });
  return this.repo.save(mission);
}
```

---

### 2단계: 미션 생성 로직 수정 (`mission.service.ts`)

config의 `missionTargetPlayCount`를 미션 레코드에 전달한다. 3개 메서드를 수정한다.

#### 2-1. `createMission()`

```typescript
// 기존
await this.missionRepo.create(guildId, memberId, today, endDate, targetPlaytimeSec, displayName);
// 변경
await this.missionRepo.create(guildId, memberId, today, endDate, targetPlaytimeSec, displayName, config.missionTargetPlayCount);
```

#### 2-2. `createMissionFromBot()`

동일한 패턴으로 마지막 인자에 `config.missionTargetPlayCount` 전달.

#### 2-3. `registerMissingMembers()`

`memberName` 파라미터 없이 호출하는 곳이므로:

```typescript
// 기존
await this.missionRepo.create(guildId, memberId, joinDate, endDate, targetPlaytimeSec);
// 변경
await this.missionRepo.create(guildId, memberId, joinDate, endDate, targetPlaytimeSec, null, config.missionTargetPlayCount);
```

---

### 3단계: 달성 판정 로직 변경

달성 판정을 공통 private 메서드로 추출하여 중복을 제거한다.

#### 3-1. `mission.service.ts` -- 공통 판정 메서드 추가

```typescript
/**
 * 미션 달성 여부를 판정한다.
 * targetPlayCount가 null이면 플레이타임만으로 판정(기존 동작).
 * 값이 있으면 플레이타임 AND 플레이횟수 모두 충족해야 달성.
 */
private isMissionCompleted(
  playtimeSec: number,
  targetPlaytimeSec: number,
  playCount: number,
  targetPlayCount: number | null,
): boolean {
  if (playtimeSec < targetPlaytimeSec) return false;
  if (targetPlayCount !== null && playCount < targetPlayCount) return false;
  return true;
}
```

#### 3-2. `mission.service.ts` -- `invalidateAndRefresh()` 수정

현재 플레이타임만 비교하는 로직을 변경한다. `targetPlayCount`가 null이 아닌 미션은 playCount도 계산해야 하므로 config 조회가 필요하다.

```typescript
async invalidateAndRefresh(guildId: string): Promise<void> {
  await this.voiceDailyFlushService.safeFlushAll();

  const config = await this.configRepo.findByGuildId(guildId);
  const activeMissions = await this.missionRepo.findActiveByGuild(guildId);

  for (const mission of activeMissions) {
    const playtimeSec = await this.getPlaytimeSec(
      guildId, mission.memberId, mission.startDate, mission.endDate,
    );

    let playCount = 0;
    if (mission.targetPlayCount !== null && config) {
      playCount = await this.getPlayCount(
        guildId, mission.memberId, mission.startDate, mission.endDate, config,
      );
    }

    if (this.isMissionCompleted(playtimeSec, mission.targetPlaytimeSec, playCount, mission.targetPlayCount)) {
      await this.missionRepo.updateStatus(mission.id, MissionStatus.COMPLETED);
      this.logger.log(
        `[MISSION] Completed on refresh: id=${mission.id} member=${mission.memberId} ` +
          `playtime=${playtimeSec}s target=${mission.targetPlaytimeSec}s ` +
          `playCount=${playCount} targetPlayCount=${mission.targetPlayCount}`,
      );
    }
  }

  await this.newbieRedis.deleteMissionActive(guildId);
  await this.refreshMissionEmbed(guildId);
}
```

#### 3-3. `mission.scheduler.ts` -- `processExpiredMissions()` 수정

스케줄러에서도 동일한 판정 로직을 적용한다. config 조회를 길드별로 캐싱하여 중복 조회를 방지한다.

```typescript
private async processExpiredMissions(): Promise<void> {
  const today = this.toDateString(new Date());
  const expiredMissions = await this.missionRepo.findExpired(today);
  if (expiredMissions.length === 0) { /* ... */ return; }

  const affectedGuildIds = new Set<string>();
  // 길드별 config 캐시 (같은 길드 미션이 여러 건일 수 있으므로)
  const configCache = new Map<string, NewbieConfig | null>();

  for (const mission of expiredMissions) {
    try {
      const playtimeSec = await this.missionService.getPlaytimeSec(
        mission.guildId, mission.memberId, mission.startDate, mission.endDate,
      );

      let playCount = 0;
      if (mission.targetPlayCount !== null) {
        if (!configCache.has(mission.guildId)) {
          configCache.set(mission.guildId, await this.configRepo.findByGuildId(mission.guildId));
        }
        const config = configCache.get(mission.guildId);
        if (config) {
          playCount = await this.missionService.getPlayCount(
            mission.guildId, mission.memberId, mission.startDate, mission.endDate, config,
          );
        }
      }

      const isCompleted = this.isCompleted(playtimeSec, mission.targetPlaytimeSec, playCount, mission.targetPlayCount);
      const newStatus = isCompleted ? MissionStatus.COMPLETED : MissionStatus.FAILED;

      await this.missionRepo.updateStatus(mission.id, newStatus);
      affectedGuildIds.add(mission.guildId);
    } catch (err) { /* 기존 에러 처리 유지 */ }
  }
  // ... 이하 기존 로직 동일
}

/** 달성 판정 (MissionService.isMissionCompleted와 동일 로직) */
private isCompleted(
  playtimeSec: number,
  targetPlaytimeSec: number,
  playCount: number,
  targetPlayCount: number | null,
): boolean {
  if (playtimeSec < targetPlaytimeSec) return false;
  if (targetPlayCount !== null && playCount < targetPlayCount) return false;
  return true;
}
```

> **참고**: MissionService의 `isMissionCompleted`를 public으로 두고 스케줄러에서 호출하는 방법도 가능하나, 스케줄러 내 의존성을 최소화하기 위해 동일한 간단한 로직을 private으로 복제한다. 로직이 복잡해지면 추후 공통 유틸로 추출한다.

---

### 4단계: Embed 템플릿 변수 추가

#### 4-1. `newbie-template.constants.ts` -- `MISSION_ITEM_ALLOWED_VARS`에 추가

```typescript
export const MISSION_ITEM_ALLOWED_VARS = [
  '{username}',
  '{mention}',
  '{startDate}',
  '{endDate}',
  '{statusEmoji}',
  '{statusText}',
  '{playtimeHour}',
  '{playtimeMin}',
  '{playtimeSec}',
  '{playtime}',
  '{playCount}',
  '{targetPlaytime}',
  '{targetPlayCount}',   // 추가
  '{daysLeft}',
] as const;
```

#### 4-2. `mission-discord.presenter.ts` -- `MissionEmbedItem` 인터페이스 확장

```typescript
export interface MissionEmbedItem {
  username: string;
  mention: string;
  status: string;
  startDate: string;
  endDate: string;
  playtimeSec: number;
  playCount: number;
  targetPlaytime: string;
  targetPlayCount: number | null;   // 추가
  daysLeft: number;
}
```

#### 4-3. `mission-discord.presenter.ts` -- `buildMissionEmbed()` 내 템플릿 렌더링

`applyTemplate` 호출부에 `targetPlayCount` 변수 추가:

```typescript
const renderedItem = applyTemplate(itemTemplate, {
  // ... 기존 변수들 ...
  targetPlaytime: item.targetPlaytime,
  targetPlayCount: item.targetPlayCount !== null ? String(item.targetPlayCount) : '',  // 추가
  daysLeft: String(item.daysLeft),
});
```

#### 4-4. `mission.service.ts` -- `buildMissionEmbedItems()` 수정

`items.push()` 호출 시 `targetPlayCount` 값을 포함:

```typescript
items.push({
  // ... 기존 필드들 ...
  targetPlaytime: this.formatTargetPlaytime(mission.targetPlaytimeSec),
  targetPlayCount: mission.targetPlayCount,   // 추가
  daysLeft: this.calcDaysLeft(mission.endDate),
});
```

---

### 5단계: API 응답 확인

`GET /api/guilds/:guildId/newbie/missions` 응답은 `enrichMissionItems()`가 `NewbieMission` 엔티티를 spread하여 반환하므로, 엔티티에 `targetPlayCount` 컬럼이 이미 추가되어 있어 **자동으로 응답에 포함된다**. 추가 코드 변경 없음.

---

### 6단계: 프론트엔드 수정

#### 6-1. `apps/web/app/lib/newbie-api.ts` -- 타입 확장

```typescript
// NewbieConfig 인터페이스의 missionTargetPlaytimeHours 아래에 추가
missionTargetPlayCount: number | null;

// NewbieMission 타입 (Mission 인터페이스)의 targetPlaytimeSec 아래에 추가
targetPlayCount: number | null;
```

#### 6-2. `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` -- 초기값

`DEFAULT_CONFIG` 객체에 추가:

```typescript
missionTargetPlayCount: null,
```

#### 6-3. `apps/web/app/settings/guild/[guildId]/newbie/components/MissionTab.tsx` -- UI

목표 플레이타임 입력 필드 아래에 목표 플레이횟수 입력 필드를 추가한다. 기존 `missionTargetPlaytimeHours` 입력 UI와 동일한 패턴을 따른다:

```tsx
{/* 목표 플레이횟수 (회) */}
<div>
  <label
    htmlFor="mission-target-play-count"
    className="block text-sm font-medium text-gray-700 mb-1"
  >
    {t('newbie.mission.targetPlayCount')}
  </label>
  <input
    id="mission-target-play-count"
    type="number"
    min={1}
    max={9999}
    value={config.missionTargetPlayCount ?? ''}
    onChange={(e) => {
      const val = parseInt(e.target.value, 10);
      onChange({ missionTargetPlayCount: isNaN(val) ? null : val });
    }}
    disabled={!isEnabled}
    placeholder="미설정 시 비활성"
    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
  />
  <p className="text-xs text-gray-400 mt-1">
    {t('newbie.mission.targetPlayCountDesc')}
  </p>
</div>
```

#### 6-4. i18n 키 추가 (해당 파일 존재 시)

- `newbie.mission.targetPlayCount`: "목표 플레이횟수 (회)"
- `newbie.mission.targetPlayCountDesc`: "비워두면 플레이횟수 조건 없이 플레이타임만으로 달성 판정합니다."

---

### 7단계: 테스트 수정

#### 7-1. `newbie.controller.spec.ts`

`makeMission()` 헬퍼에 `targetPlayCount: null` 기본값 추가.

#### 7-2. `newbie-mission.repository.spec.ts`

`create()` 호출부에 `targetPlayCount` 인자 추가.

#### 7-3. `mission.service.spec.ts`

- `createMission`, `createMissionFromBot`, `registerMissingMembers` 테스트에서 `missionRepo.create` mock 검증에 `targetPlayCount` 인자 확인 추가
- `invalidateAndRefresh` 테스트: targetPlayCount가 있는 미션에 대해 playCount 미달 시 완료되지 않는 케이스 추가
- `isMissionCompleted` (혹은 달성 판정 로직) 단위 테스트 추가

#### 7-4. 프론트엔드 테스트

- `newbie-api.test.ts`: mock 데이터에 `targetPlayCount` 추가
- `MissionManageTab.test.tsx`: mock mission에 `targetPlayCount` 추가
- `MocoTab.test.tsx`: mock config에 `missionTargetPlayCount` 추가

---

## 구현 순서 요약

| 순서 | 작업 | 파일 수 |
|------|------|---------|
| 1 | DTO + Repository | 2 |
| 2 | 미션 생성 로직 (service 3개 메서드) | 1 |
| 3 | 달성 판정 로직 (service + scheduler) | 2 |
| 4 | Embed 템플릿 변수 (constants + presenter + service) | 3 |
| 5 | API 응답 확인 (변경 불필요) | 0 |
| 6 | 프론트엔드 (타입 + UI + 초기값) | 3~4 |
| 7 | 테스트 수정 | 5~6 |

## 확인 사항

- `libs/bot-api-client/src/types.ts`: 현재 미션 관련 타입이 정의되어 있지 않으므로 변경 불필요. bot-api-client는 미션 생성/갱신 요청만 수행하며, 미션 엔티티를 직접 참조하지 않는다.
- `apps/web/app/dashboard/` 경로의 MissionManageTab은 `apps/web/app/settings/` 경로와 동일한 컴포넌트 구조이므로, 두 곳 모두 테스트 mock 데이터를 갱신해야 한다.
