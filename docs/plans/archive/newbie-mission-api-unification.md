# 신입 미션 API 통합 구현 계획

> PRD: [newbie.md](../specs/prd/newbie.md) F-NEWBIE-005
> 날짜: 2026-04-03

## 목표

기존 두 개로 분리된 미션 조회 엔드포인트를 하나로 통합한다.

- **기존**: `GET /missions` (IN_PROGRESS만, Redis 캐시) + `GET /missions/history` (COMPLETED/FAILED/LEFT, 페이지네이션)
- **변경**: `GET /missions?status=&page=&pageSize=` (모든 상태 통합, 페이지네이션)

## 변경 범위 요약

| 계층 | 파일 | 변경 유형 |
|------|------|-----------|
| Presentation | `newbie.controller.ts` | 수정 |
| Application | `mission.service.ts` | 수정 |
| Infrastructure | `newbie-mission.repository.ts` | 수정 |
| Infrastructure | `newbie-redis.repository.ts` | 유지 (캐시 제거 후 정리) |
| Frontend | `newbie-api.ts` | 수정 (FE 별도 작업, 참고용) |
| Test | `mission.service.spec.ts` | 수정 |

## 단계별 구현

### 1단계: Repository 통합 메서드 추가

**파일**: `apps/api/src/newbie/infrastructure/newbie-mission.repository.ts`

- **신규 메서드** `findByGuild(guildId, status?, page, pageSize)` 추가:
  - `status` 파라미터가 있으면 해당 상태만 필터, 없으면 전체 상태 조회
  - `findAndCount`로 페이지네이션 + total 반환
  - 정렬: `createdAt DESC`
  - 반환 타입: `{ items: NewbieMission[]; total: number }`
- 기존 `findActiveByGuild`, `findHistoryByGuild`는 내부(Embed, 스케줄러 등)에서 여전히 사용하므로 **유지**

```typescript
async findByGuild(
  guildId: string,
  status: MissionStatus | undefined,
  page: number,
  pageSize: number,
): Promise<{ items: NewbieMission[]; total: number }> {
  const where: Record<string, unknown> = { guildId };
  if (status) {
    where.status = status;
  }

  const [items, total] = await this.repo.findAndCount({
    where,
    order: { createdAt: 'DESC' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total };
}
```

### 2단계: Service에 통합 enrichment 메서드 추가

**파일**: `apps/api/src/newbie/application/mission/mission.service.ts`

- **신규 메서드** `enrichMissionItems(guildId, missions)` 추가:
  - IN_PROGRESS 미션: `enrichMissions` 로직 적용 (Discord 닉네임 조회, 변경 시 DB 갱신)
  - 비활성 미션(COMPLETED/FAILED/LEFT): `enrichHistoryMissions` 로직 적용 (DB memberName 우선, null이면 Discord 조회)
  - 양쪽 모두 `currentPlaytimeSec` 보충
- 기존 `enrichMissions`, `enrichHistoryMissions`는 내부(Embed 등)에서 사용하므로 **유지**

```typescript
async enrichMissionItems(
  guildId: string,
  missions: NewbieMission[],
): Promise<(NewbieMission & { memberName: string | null; currentPlaytimeSec: number })[]> {
  const active = missions.filter((m) => m.status === MissionStatus.IN_PROGRESS);
  const history = missions.filter((m) => m.status !== MissionStatus.IN_PROGRESS);

  const [enrichedActive, enrichedHistory] = await Promise.all([
    this.enrichMissions(guildId, active),
    this.enrichHistoryMissions(guildId, history),
  ]);

  // 원래 배열 순서(createdAt DESC) 유지를 위해 id 기준 맵핑 후 재조립
  const enrichedMap = new Map<number, NewbieMission & { memberName: string | null; currentPlaytimeSec: number }>();
  for (const item of [...enrichedActive, ...enrichedHistory]) {
    enrichedMap.set(item.id, item);
  }

  return missions.map((m) => enrichedMap.get(m.id)!);
}
```

### 3단계: Controller 엔드포인트 통합

**파일**: `apps/api/src/newbie/presentation/newbie.controller.ts`

- **`getMissions` 메서드 수정**: Query 파라미터 `status`, `page`, `pageSize` 추가
  - `status` 유효값: `IN_PROGRESS`, `COMPLETED`, `FAILED`, `LEFT` 또는 생략(전체)
  - `page` 기본값 1, `pageSize` 기본값 10
  - Redis 캐시 로직 제거 (통합 API는 DB 직접 조회)
  - 응답 형식: `{ items, total, page, pageSize }`
- **`getMissionHistory` 메서드 삭제**: `/missions/history` 엔드포인트 제거

수정 후 `getMissions`:

```typescript
@Get('missions')
async getMissions(
  @Param('guildId') guildId: string,
  @Query('status') status?: string,
  @Query('page') page?: string,
  @Query('pageSize') pageSize?: string,
) {
  const parsedPage = parseInt(page ?? '', 10);
  const parsedPageSize = parseInt(pageSize ?? '', 10);
  const resolvedPage = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const resolvedPageSize = isNaN(parsedPageSize) || parsedPageSize < 1 ? 10 : parsedPageSize;

  const validStatuses = Object.values(MissionStatus);
  const resolvedStatus =
    status && validStatuses.includes(status as MissionStatus)
      ? (status as MissionStatus)
      : undefined;

  const { items, total } = await this.missionRepo.findByGuild(
    guildId,
    resolvedStatus,
    resolvedPage,
    resolvedPageSize,
  );

  const enriched = await this.missionService.enrichMissionItems(guildId, items);

  return { items: enriched, total, page: resolvedPage, pageSize: resolvedPageSize };
}
```

### 4단계: Redis 캐시 정리

**파일**: `apps/api/src/newbie/infrastructure/newbie-redis.repository.ts`

- `getMissionActive`, `setMissionActive` 메서드는 **유지**한다.
  - 이유: 컨트롤러에서는 더 이상 사용하지 않지만, `refreshMissionEmbed` 등 내부 로직에서 `deleteMissionActive`를 호출하여 캐시를 무효화하는 패턴이 여전히 존재한다. Embed 갱신 시에는 `findActiveByGuild`를 사용하므로, 관련 캐시 로직은 Embed 전용으로 남긴다.
- 컨트롤러의 `getMissions`에서 `this.redisRepo` 참조가 제거되므로, 컨트롤러 constructor에서 `NewbieRedisRepository` 의존성이 여전히 다른 곳에서 쓰이는지 확인 후 불필요하면 제거한다.
  - 확인 결과: 컨트롤러에서 `this.redisRepo`는 `getConfig`에서도 사용하므로 **의존성 유지**.

### 5단계: 테스트 수정

**파일**: `apps/api/src/newbie/application/mission/mission.service.spec.ts`

- `enrichMissionItems` 메서드에 대한 단위 테스트 추가:
  - IN_PROGRESS + COMPLETED 미션이 섞인 배열을 입력하여 올바른 enrichment가 적용되는지 검증
  - 원래 배열 순서가 유지되는지 검증

### 6단계: Frontend API 클라이언트 수정 (참고 -- FE 별도 작업)

**파일**: `apps/web/app/lib/newbie-api.ts`

- `fetchActiveMissions` 삭제
- `fetchMissionHistory` 삭제
- 통합 함수 `fetchMissions(guildId, status?, page?, pageSize?)` 신규 추가:
  - 엔드포인트: `GET /api/guilds/{guildId}/newbie/missions?status=&page=&pageSize=`
  - 반환 타입: `MissionHistoryResponse` (이미 정의됨, 재사용)
- 프론트엔드 컴포넌트에서 호출부 일괄 변경

## 닉네임 수정 관련 (이미 적용 완료)

아래 항목은 이미 코드에 반영되어 있으므로 별도 변경 없이 유지한다:

| 메서드 | 현재 동작 | 비고 |
|--------|-----------|------|
| `enrichMissions()` | Discord 닉네임이 DB와 다르면 `updateMemberName` 호출 | L152-155 |
| `enrichHistoryMissions()` | DB memberName 우선, null이면 Discord 조회. 서버 내 멤버만 DB 저장 | L166-186 |
| `fetchMemberNickname()` | 서버에 없으면 null 반환 | `mission-discord.presenter.ts` |

## 기존 코드와의 충돌 여부

- **Embed 갱신 로직**: `refreshMissionEmbed`는 `findVisibleByGuild`/`findActiveByGuild`를 사용하므로 영향 없음
- **스케줄러**: `invalidateAndRefresh`는 `findActiveByGuild`를 사용하므로 영향 없음
- **미션 생성/완료/실패**: `deleteMissionActive` 캐시 무효화는 Embed 갱신 흐름에서만 의미가 있으므로 유지
- **프론트엔드**: API 경로 변경이므로 FE 배포와 동시에 진행해야 함. 하위호환이 필요하면 `/missions/history`를 일정 기간 유지 가능하나, 같은 모노레포에서 동시 배포하므로 불필요

## 작업 순서 정리

1. Repository에 `findByGuild` 추가
2. Service에 `enrichMissionItems` 추가
3. Controller의 `getMissions` 수정 + `getMissionHistory` 삭제
4. 테스트 업데이트
5. (별도) FE API 클라이언트 및 컴포넌트 수정
