# Inactive Member 등급 탭 — Backend 구현 계획

> 티켓: INACTIVE-GRADE-TAB ([수정 49])
> 도메인: `inactive-member`
> 참조 PRD: `/docs/specs/prd/inactive-member.md` (F-INACTIVE-002)
> 참조 변경이력: `/docs/archive/prd-changelog.md` ([수정 49])

---

## 1. 작업 배경

PRD [수정 49] 갱신으로 인한 backend 응답·쿼리 인터페이스 변경에 대응한다.

- **응답 필드 추가**: `GET /api/guilds/:guildId/inactive-members` 응답의 `items[]`에 `prevTotalMinutes` 노출
- **정렬 키 추가**: `sortBy` 파라미터에 `decreaseRate` 추가. `grade=DECLINING` 외 조합에서는 무시되고 `lastVoiceDate ASC`로 fallback

DB 컬럼 `inactive_member_record.prev_total_minutes`(camelCase: `prevTotalMinutes`)는 이미 ORM 엔티티(`InactiveMemberRecordOrm`)·도메인 엔티티(`InactiveMemberRecord`)에 존재한다. 따라서 마이그레이션 없이 DTO/쿼리 레이어만 수정하면 된다.

---

## 2. 변경 영향 파일 (절대 경로)

### 2.1 직접 수정 대상

| # | 파일 경로 | 변경 요약 |
|---|----------|----------|
| 1 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\inactive-member\dto\inactive-member-query.dto.ts` | `sortBy` 화이트리스트에 `decreaseRate` 추가 |
| 2 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\inactive-member\presentation\inactive-member.controller.ts` | `VALID_SORT_BY` 상수 확장, `EnrichedMember` 응답 타입에 `prevTotalMinutes` 노출 (이미 매핑되어 있어 타입만 보강) |
| 3 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\inactive-member\infrastructure\inactive-member-query.repository.ts` | `findRecordList()`에서 `sortBy=decreaseRate` 처리 분기 (계산식 정렬, fallback 포함) |

### 2.2 테스트 추가/수정 대상

| # | 파일 경로 | 변경 요약 |
|---|----------|----------|
| 4 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\inactive-member\infrastructure\inactive-member-query.repository.integration-spec.ts` | `findRecordList` describe에 `decreaseRate` 정렬 케이스 3종 추가 |

### 2.3 검토만 필요 (수정 없음)

| 파일 | 비고 |
|------|------|
| `apps/api/src/inactive-member/infrastructure/inactive-member-record.orm-entity.ts` | `prevTotalMinutes` 컬럼 이미 존재 — 변경 불필요 |
| `apps/api/src/inactive-member/domain/inactive-member-record.entity.ts` | `prevTotalMinutes` 도메인 필드 이미 존재 — 변경 불필요 |
| `apps/api/src/inactive-member/application/inactive-member.service.ts` | classify·stats 로직 변경 없음 |
| `apps/api/src/inactive-member/application/inactive-member-action.service.ts` | 액션 로직 변경 없음 |

DB 마이그레이션 **불필요**.

---

## 3. 파일별 구체적 변경 내용

### 3.1 `inactive-member-query.dto.ts`

`sortBy` 화이트리스트에 `decreaseRate` 추가.

**변경 전**:
```ts
@IsOptional()
@IsIn(['lastVoiceDate', 'totalMinutes'])
sortBy?: string;
```

**변경 후**:
```ts
@IsOptional()
@IsIn(['lastVoiceDate', 'totalMinutes', 'decreaseRate'])
sortBy?: string;
```

> 비고: 현재 controller는 이 DTO 클래스를 `@Body`/`@Query` 바인딩에 사용하지 않고 query string을 개별 `@Query()` 데코레이터로 받고 있다. DTO 변경은 일관성 유지 목적이며, 실효 검증은 controller의 `VALID_SORT_BY`에서 수행된다.

---

### 3.2 `inactive-member.controller.ts`

`VALID_SORT_BY` 상수에 `decreaseRate` 추가. `EnrichedMember` 인터페이스는 이미 `prevTotalMinutes: number` 필드를 가지고 있고 mapper도 이를 매핑하므로 별도 수정 없이 그대로 응답된다 (확인만 필요).

**변경 전 (line 31)**:
```ts
const VALID_SORT_BY = ['lastVoiceDate', 'totalMinutes'] as const;
```

**변경 후**:
```ts
const VALID_SORT_BY = ['lastVoiceDate', 'totalMinutes', 'decreaseRate'] as const;
```

> 추가 변경 없음. `EnrichedMember.prevTotalMinutes`와 mapper(`record.prevTotalMinutes`)는 이미 PRD 응답 스키마와 일치한다. PRD 갱신 이전부터 응답에 포함되어 왔으나 명시적으로 PRD에 노출 명세가 추가된 것뿐이다.

---

### 3.3 `inactive-member-query.repository.ts`

`findRecordList()` 메서드 내 정렬 처리에 `decreaseRate` 분기 추가.

**변경 전 (line 68~85)**:
```ts
const page = filter.page ?? DEFAULT_PAGE;
const limit = filter.limit ?? DEFAULT_LIMIT;
const sortBy = filter.sortBy ?? DEFAULT_SORT_BY;
const sortOrder = (filter.sortOrder ?? DEFAULT_SORT_ORDER) as 'ASC' | 'DESC';
const skip = (page - 1) * limit;

const qb = this.recordRepo.createQueryBuilder('r').where('r.guildId = :guildId', { guildId });

if (filter.grade) {
  qb.andWhere('r.grade = :grade', { grade: filter.grade });
} else {
  qb.andWhere('r.grade IS NOT NULL');
}

if (filter.search) {
  qb.andWhere('r.nickName ILIKE :search', { search: `%${filter.search}%` });
}

qb.orderBy(`r.${sortBy}`, sortOrder).skip(skip).take(limit);
```

**변경 후 (의도)**:
```ts
const page = filter.page ?? DEFAULT_PAGE;
const limit = filter.limit ?? DEFAULT_LIMIT;
const requestedSortBy = filter.sortBy ?? DEFAULT_SORT_BY;
const sortOrder = (filter.sortOrder ?? DEFAULT_SORT_ORDER) as 'ASC' | 'DESC';
const skip = (page - 1) * limit;

const qb = this.recordRepo.createQueryBuilder('r').where('r.guildId = :guildId', { guildId });

if (filter.grade) {
  qb.andWhere('r.grade = :grade', { grade: filter.grade });
} else {
  qb.andWhere('r.grade IS NOT NULL');
}

if (filter.search) {
  qb.andWhere('r.nickName ILIKE :search', { search: `%${filter.search}%` });
}

// PRD: decreaseRate 정렬은 grade=DECLINING 조합에서만 유효.
// 그 외 조합에서는 lastVoiceDate ASC로 fallback.
if (requestedSortBy === 'decreaseRate') {
  if (filter.grade === GRADE_DECLINING) {
    // 감소율 = (prevTotalMinutes - totalMinutes) / prevTotalMinutes
    // prevTotalMinutes = 0 인 경우 0으로 처리하여 정렬 끝으로 밀어냄.
    qb.addSelect(
      `CASE WHEN r."prevTotalMinutes" > 0
            THEN (r."prevTotalMinutes" - r."totalMinutes")::float / r."prevTotalMinutes"
            ELSE 0 END`,
      'decrease_rate',
    ).orderBy('decrease_rate', sortOrder);
  } else {
    qb.orderBy('r.lastVoiceDate', 'ASC');
  }
} else {
  qb.orderBy(`r.${requestedSortBy}`, sortOrder);
}

qb.skip(skip).take(limit);
```

**구현 노트**:
- TypeORM `QueryBuilder`에서 `addSelect()` 별칭은 `getRawMany()`에서만 직접 노출되지만, `orderBy(별칭, 방향)`에는 사용 가능 (PostgreSQL `ORDER BY <alias>` 문법).
- `getManyAndCount()` 사용 시 `addSelect`된 표현식은 entity 매핑에 포함되지 않으므로 부작용 없음.
- 실제로 `getManyAndCount()`가 별칭 인식에 문제를 보이면, fallback으로 `orderBy()`에 표현식 자체를 그대로 넣는다:
  ```ts
  qb.orderBy(
    `(CASE WHEN r."prevTotalMinutes" > 0
           THEN (r."prevTotalMinutes" - r."totalMinutes")::float / r."prevTotalMinutes"
           ELSE 0 END)`,
    sortOrder,
  );
  ```
- 컬럼명은 PostgreSQL 식별자 quoting을 따라 `"prevTotalMinutes"`, `"totalMinutes"`로 큰따옴표 처리 (TypeORM 기본 naming strategy 기준).
- `RecordListFilter` 인터페이스의 `sortBy?: string` 시그니처는 변경 없이 그대로 사용 (controller에서 화이트리스트 검증 후 전달).

---

### 3.4 통합 테스트 추가 — `inactive-member-query.repository.integration-spec.ts`

기존 `describe('findRecordList', ...)` 블록 하단에 케이스 3종을 추가한다.

**추가할 케이스**:

```ts
it('grade=DECLINING + sortBy=decreaseRate + DESC 시 감소율 큰 순으로 정렬한다', async () => {
  const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
  const classifiedAt = new Date('2026-03-18T00:00:00Z');

  await recordRepo.save([
    // user-A: 100 → 60 (40% 감소)
    {
      guildId: 'guild-1',
      userId: 'user-A',
      grade: InactiveMemberGrade.DECLINING,
      totalMinutes: 60,
      prevTotalMinutes: 100,
      lastVoiceDate: '2026-03-15',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
    // user-B: 100 → 20 (80% 감소)
    {
      guildId: 'guild-1',
      userId: 'user-B',
      grade: InactiveMemberGrade.DECLINING,
      totalMinutes: 20,
      prevTotalMinutes: 100,
      lastVoiceDate: '2026-03-10',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
    // user-C: 100 → 50 (50% 감소)
    {
      guildId: 'guild-1',
      userId: 'user-C',
      grade: InactiveMemberGrade.DECLINING,
      totalMinutes: 50,
      prevTotalMinutes: 100,
      lastVoiceDate: '2026-03-12',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
  ]);

  const result = await repository.findRecordList('guild-1', {
    grade: InactiveMemberGrade.DECLINING,
    sortBy: 'decreaseRate',
    sortOrder: 'DESC',
  });

  expect(result.items.map((r) => r.userId)).toEqual(['user-B', 'user-C', 'user-A']);
});

it('grade=DECLINING + sortBy=decreaseRate에서 prevTotalMinutes=0이면 감소율 0으로 처리되어 마지막에 위치한다', async () => {
  const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
  const classifiedAt = new Date('2026-03-18T00:00:00Z');

  await recordRepo.save([
    {
      guildId: 'guild-1',
      userId: 'user-zero-prev',
      grade: InactiveMemberGrade.DECLINING,
      totalMinutes: 0,
      prevTotalMinutes: 0,
      lastVoiceDate: '2026-03-10',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
    {
      guildId: 'guild-1',
      userId: 'user-large-decline',
      grade: InactiveMemberGrade.DECLINING,
      totalMinutes: 10,
      prevTotalMinutes: 100,
      lastVoiceDate: '2026-03-12',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
  ]);

  const result = await repository.findRecordList('guild-1', {
    grade: InactiveMemberGrade.DECLINING,
    sortBy: 'decreaseRate',
    sortOrder: 'DESC',
  });

  expect(result.items.map((r) => r.userId)).toEqual(['user-large-decline', 'user-zero-prev']);
});

it('sortBy=decreaseRate이지만 grade가 DECLINING이 아닌 경우 lastVoiceDate ASC로 fallback한다', async () => {
  const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
  const classifiedAt = new Date('2026-03-18T00:00:00Z');

  await recordRepo.save([
    {
      guildId: 'guild-1',
      userId: 'user-recent',
      grade: InactiveMemberGrade.LOW_ACTIVE,
      totalMinutes: 20,
      prevTotalMinutes: 50,
      lastVoiceDate: '2026-03-15',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
    {
      guildId: 'guild-1',
      userId: 'user-old',
      grade: InactiveMemberGrade.LOW_ACTIVE,
      totalMinutes: 10,
      prevTotalMinutes: 100,
      lastVoiceDate: '2026-03-05',
      gradeChangedAt: classifiedAt,
      classifiedAt,
    },
  ]);

  const result = await repository.findRecordList('guild-1', {
    grade: InactiveMemberGrade.LOW_ACTIVE,
    sortBy: 'decreaseRate',
    sortOrder: 'DESC', // 무시되고 lastVoiceDate ASC로 대체되어야 함
  });

  expect(result.items.map((r) => r.userId)).toEqual(['user-old', 'user-recent']);
});
```

추가로 기존 `findRecordList` 케이스에서 응답 항목의 `prevTotalMinutes` 매핑이 보존되는지 1줄 assert를 추가한다 (controller 매핑 회귀 방지):

```ts
// 기존 'guildId에 해당하는 레코드를 페이징하여 반환한다' 케이스 하단에 추가
expect(result.items[0].prevTotalMinutes).toBeDefined();
```

---

## 4. 호환성 영향

| 항목 | 영향 | 설명 |
|------|------|------|
| 응답 필드 | **추가만** | `items[].prevTotalMinutes`는 이미 controller mapper가 포함하고 있던 필드. 기존 소비자(웹 대시보드)는 무시할 뿐 깨지지 않는다. PRD 명세에 명시되어 응답 계약으로 승격된 것일 뿐이다. |
| `sortBy` 파라미터 | **enum 확장** | `decreaseRate` 신규 허용 값. 기존 값(`lastVoiceDate`, `totalMinutes`)은 그대로 동작. |
| Fallback 동작 | **신규** | `sortBy=decreaseRate` + `grade !== DECLINING` 조합에서 `lastVoiceDate ASC`로 강제. 기존에는 `decreaseRate`가 화이트리스트에 없어 controller가 `lastVoiceDate`로 강제 변환했으므로, 사용자 관점에서는 동작 차이 없음. |
| DB 스키마 | **변경 없음** | 마이그레이션 없음. `prevTotalMinutes` 컬럼은 [수정 21] 시점부터 존재. |
| 인덱스 | **검토 필요 없음** | `decreaseRate` 정렬은 계산식이며 이미 `IDX_inactive_member_record_guild_grade`로 grade=DECLINING 필터링이 인덱스 컷이 들어간 후 정렬되므로 메모리 정렬 비용은 등급별 인원수에 비례. 현실적 규모에서 추가 인덱스 불필요. |

---

## 5. 작업 순서

1. `inactive-member-query.dto.ts` — `IsIn` 화이트리스트 갱신
2. `inactive-member.controller.ts` — `VALID_SORT_BY` 상수에 `decreaseRate` 추가
3. `inactive-member-query.repository.ts` — `findRecordList()` 정렬 분기 구현
4. 통합 테스트 케이스 3종 추가
5. `pnpm --filter @nexus/api test inactive-member-query.repository` 로컬 실행
6. 전체 lint 통과 확인 (`pnpm --filter @nexus/api lint`)
7. PR 생성 (제목: `feat: 비활동 회원 목록 sortBy=decreaseRate 정렬 추가`)

---

## 6. 테스트 가이드

### 단위/통합 테스트 추가 위치

- **통합**: `apps/api/src/inactive-member/infrastructure/inactive-member-query.repository.integration-spec.ts` (위 3.4 참고)
- **단위**: 별도 추가 불필요. controller의 `VALID_SORT_BY` 화이트리스트는 통합 테스트에서 간접 검증된다.

### 검증 케이스 체크리스트

- [ ] `grade=DECLINING` + `sortBy=decreaseRate` + `DESC` → 감소율 내림차순으로 정렬되는가
- [ ] `prevTotalMinutes=0`인 레코드는 감소율 0으로 처리되어 DESC 정렬 시 끝으로 밀려나는가
- [ ] `grade=LOW_ACTIVE` + `sortBy=decreaseRate` → `lastVoiceDate ASC`로 fallback되는가
- [ ] `grade` 미지정 + `sortBy=decreaseRate` → `lastVoiceDate ASC`로 fallback되는가
- [ ] 응답 `items[].prevTotalMinutes`가 number 타입으로 노출되는가
- [ ] 기존 `lastVoiceDate`, `totalMinutes` 정렬이 깨지지 않는가 (회귀 방지)
- [ ] `sortBy` 파라미터에 알 수 없는 값이 들어왔을 때 controller가 `lastVoiceDate`로 안전하게 fallback하는가 (기존 동작 유지)

### 수동 검증 (선택)

```bash
# DECLINING 등급 + decreaseRate DESC
curl 'http://localhost:3000/api/guilds/{guildId}/inactive-members?grade=DECLINING&sortBy=decreaseRate&sortOrder=DESC' \
  -H "Authorization: Bearer {token}"

# 응답 items[*].prevTotalMinutes 필드 존재 확인
# items[0]의 (prev - total)/prev 값이 items[1]보다 크거나 같은지 확인
```

---

## 7. 위험 요소 및 대응

| 위험 | 가능성 | 대응 |
|------|--------|------|
| TypeORM `addSelect` 별칭이 `getManyAndCount()`에서 인식 안 됨 | 중 | 3.3에 명시한 fallback (orderBy에 표현식 직접 삽입)으로 우회. 통합 테스트에서 즉시 발견됨. |
| `prevTotalMinutes` 컬럼 quoting 누락으로 PostgreSQL이 lowercase로 해석 | 중 | 큰따옴표로 명시적 quoting (`r."prevTotalMinutes"`). 통합 테스트로 검증. |
| `(::float)` 캐스팅이 다른 DB(예: SQLite 테스트 환경)에서 미동작 | 낮음 | 통합 테스트가 PostgreSQL을 사용 (`createIntegrationModuleBuilder` 기본 설정 확인됨)이므로 영향 없음. |
| 신규 정렬 키 추가로 인한 프런트 캐시/타입 불일치 | 낮음 | 백엔드 변경만이므로 프런트는 별도 PR에서 처리. 본 계획 범위 외. |

---

## 8. 미해결 질문

없음. PRD F-INACTIVE-002 [수정 49]에 fallback 동작까지 명세되어 있어 추가 결정 사항 없음.
