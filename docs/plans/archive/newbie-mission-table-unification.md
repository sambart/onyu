# 신입 미션 관리 UI 통합 계획 (탭 제거 → 단일 테이블 + 상태 필터)

> PRD: [newbie.md](../specs/prd/newbie.md) F-NEWBIE-005
> 기존 계획: [newbie-dashboard.md](./newbie-dashboard.md)

## 목표

`MissionManageTab.tsx`의 "진행 중" / "전체 이력" 서브탭 구조를 제거하고, **상태 필터 칩 + 단일 테이블 + 공통 페이지네이션** 구조로 통합한다.

## 변경 범위 요약

| 계층 | 파일 | 변경 내용 |
|------|------|-----------|
| Backend | `newbie.controller.ts` | `GET /missions` 엔드포인트에 `status`, `page`, `pageSize` 쿼리 파라미터 추가. 기존 `GET /missions/history` 엔드포인트는 하위호환을 위해 유지하되 deprecated 처리 |
| Backend | `newbie-mission.repository.ts` (또는 해당 레포) | 통합 조회 메서드 추가 (`findByGuild`): status 필터 + 페이지네이션 |
| Frontend API | `newbie-api.ts` | `fetchMissions()` 통합 함수 추가, 기존 `fetchActiveMissions()` + `fetchMissionHistory()` deprecated |
| Frontend UI | `MissionManageTab.tsx` | 탭 구조 제거, 상태 필터 칩 + 단일 테이블 + 공통 페이지네이션 적용 |
| Shared Types | 변경 없음 | `MissionStatusType`은 기존 정의 재사용 |

---

## 선행 조건

- 백엔드 `GET /missions` 엔드포인트 변경이 먼저 배포되어야 프론트엔드가 동작한다.
- 또는 프론트엔드에서 기존 두 API를 조합하는 임시 어댑터를 사용할 수 있다 (아래 Step 1 참조).

---

## 구현 단계

### Step 1: 백엔드 — `GET /missions` 엔드포인트 통합

**파일**: `apps/api/src/newbie/presentation/newbie.controller.ts`

**현재 동작**:
- `GET /missions` → `findActiveByGuild(guildId)` → IN_PROGRESS 미션만 반환 (배열)
- `GET /missions/history` → `findHistoryByGuild(guildId, status, page, pageSize)` → IN_PROGRESS 제외, 페이지네이션 응답

**변경 후 동작**:
- `GET /missions?status=&page=&pageSize=` → 모든 상태 통합 조회
  - `status` 없으면 전체 조회, `status=IN_PROGRESS`이면 진행 중만
  - 응답 형식: `{ items: MissionItem[], total: number, page: number, pageSize: number }`
  - `page` 기본값 1, `pageSize` 기본값 10
- `GET /missions/history` → 기존대로 유지 (하위호환), 내부적으로 통합 메서드 호출

**레포지토리 변경** (`newbie-mission.repository.ts` 또는 해당 파일):

```typescript
/**
 * 길드의 미션을 상태 필터 + 페이지네이션으로 조회한다.
 * status가 undefined이면 전체 조회.
 */
async findByGuild(
  guildId: string,
  status?: MissionStatus,
  page = 1,
  pageSize = 10,
): Promise<{ items: NewbieMissionEntity[]; total: number }>
```

**validStatuses 변경**: 기존 history에서는 `[COMPLETED, FAILED, LEFT]`만 허용했지만, 통합 엔드포인트에서는 `IN_PROGRESS`도 포함한다.

**enrichment 로직**:
- IN_PROGRESS 미션: 기존 `enrichMissions()` 로직 적용 (currentPlaytimeSec 계산, 최신 닉네임 조회)
- 그 외 상태: 기존 `enrichHistoryMissions()` 로직 적용 (memberName null인 경우만 보충)
- 통합 enrichment 메서드를 만들거나, 상태별 분기 처리

**Redis 캐시 전략**:
- 기존 `getMissionActive()` 캐시는 status=IN_PROGRESS 요청에만 사용
- 전체/기타 상태 필터 요청은 DB 직접 조회 (history와 동일)

---

### Step 2: 프론트엔드 API — `fetchMissions()` 통합 함수

**파일**: `apps/web/app/lib/newbie-api.ts`

**추가**:

```typescript
/**
 * 미션 통합 조회 (상태 필터 + 페이지네이션).
 * 기존 fetchActiveMissions + fetchMissionHistory를 대체한다.
 */
export async function fetchMissions(
  guildId: string,
  status?: MissionStatusType,
  page = 1,
  pageSize = 10,
): Promise<MissionHistoryResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  return apiClient<MissionHistoryResponse>(
    `/api/guilds/${guildId}/newbie/missions?${params}`,
  );
}
```

**기존 함수 처리**:
- `fetchActiveMissions()` — deprecated 주석 추가, 내부에서 `fetchMissions(guildId, 'IN_PROGRESS', 1, 100)` 호출로 변경 (하위호환)
- `fetchMissionHistory()` — deprecated 주석 추가, 기존 코드 유지

---

### Step 3: 프론트엔드 UI — `MissionManageTab.tsx` 개편

**파일**: `apps/web/app/dashboard/guild/[guildId]/newbie/components/MissionManageTab.tsx`

#### 3-1. 상태 관리 변경

**제거**:
- `tab` state (`'active' | 'history'`)
- `activeMissions` state
- `activeLoading` state
- `loadActive()` 콜백
- 탭 헤더 UI 전체

**변경**:
- `statusFilter` 타입: `MissionStatusType | ''` → `MissionStatusType | 'ALL'`
- `statusFilter` 기본값: `''` → `'IN_PROGRESS'` (요구사항: 기본 선택 "진행중")
- `history` state → `missions` state (네이밍 변경)
- `historyLoading` → `isLoading`
- `loadHistory()` → `loadMissions()` — `fetchMissions()` 호출

**추가**:
- `statusFilter` 변경 시 `setPage(1)` 호출 (기존에도 있음, 유지)

#### 3-2. 필터 UI — 상태 칩 버튼

기존 `<select>` 드롭다운을 **칩 버튼 그룹**으로 교체한다. 테이블 상단에 배치.

```
[전체] [진행중(active)] [완료] [실패] [퇴장]
```

**구현**:

```tsx
type FilterOption = 'ALL' | MissionStatusType;

const FILTER_OPTIONS: FilterOption[] = ['ALL', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'LEFT'];

// 칩 렌더링
{FILTER_OPTIONS.map((option) => (
  <button
    key={option}
    type="button"
    onClick={() => { setStatusFilter(option); setPage(1); }}
    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
      statusFilter === option
        ? 'bg-indigo-600 text-white border-indigo-600'
        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
    }`}
  >
    {t(`newbie.missionManage.filter.${option.toLowerCase()}`)}
  </button>
))}
```

**i18n 키 추가 필요**:
- `newbie.missionManage.filter.all` → "전체"
- `newbie.missionManage.filter.in_progress` → "진행중"
- `newbie.missionManage.filter.completed` → "완료"
- `newbie.missionManage.filter.failed` → "실패"
- `newbie.missionManage.filter.left` → "퇴장"

#### 3-3. 테이블 구조 (단일)

컬럼은 기존과 동일:
| 이름 | 시작일 | 마감일 | 플레이타임 | 상태 | Embed |

**상태 컬럼 동작**:
- `IN_PROGRESS`: 기존과 동일하게 클릭 시 드롭다운(성공/실패) 표시 (기존 `MissionRow` 로직 그대로)
- 그 외: `StatusBadge` 읽기 전용 표시 (기존 `MissionRow` 로직 그대로)

→ **`MissionRow` 컴포넌트는 수정 불필요**. 기존 `canChangeStatus` 로직이 이미 `mission.status === 'IN_PROGRESS'`를 검사한다.

#### 3-4. 페이지네이션

기존 history 탭에만 있던 페이지네이션을 모든 필터에 공통 적용한다. UI는 기존 `이전/다음` 버튼 패턴을 그대로 사용.

#### 3-5. 빈 상태 메시지

- 필터에 따라 다른 메시지 표시:
  - `IN_PROGRESS` 필터 + 결과 없음: 기존 `noActive` 메시지 사용
  - 그 외 필터 + 결과 없음: 기존 `noHistory` 메시지 사용 (또는 통합 메시지)

#### 3-6. 갱신 버튼

기존대로 유지. 위치는 필터 칩 행의 우측에 배치.

---

### Step 4: `page.tsx` 수정

**파일**: `apps/web/app/dashboard/guild/[guildId]/newbie/page.tsx`

**변경**:
- `loadMissionDataCheck()` 함수: 기존 `fetchActiveMissions()` + `fetchMissionHistory()` 호출을 `fetchMissions(guildId, undefined, 1, 1)` 단일 호출로 변경
- import 정리: `fetchActiveMissions`, `fetchMissionHistory` 제거, `fetchMissions` 추가

---

### Step 5: i18n 메시지 추가

**파일**: `apps/web/messages/ko.json` (및 기타 언어 파일)

```json
{
  "newbie": {
    "missionManage": {
      "filter": {
        "all": "전체",
        "in_progress": "진행중",
        "completed": "완료",
        "failed": "실패",
        "left": "퇴장"
      }
    }
  }
}
```

기존 키 중 불필요해지는 항목:
- `newbie.missionManage.inProgress` (서브탭 라벨) — 제거 가능하나, 다른 곳에서 사용하지 않는지 확인 후 제거
- `newbie.missionManage.history` (서브탭 라벨) — 동일

---

## 재활용 컴포넌트

| 컴포넌트 | 변경 여부 | 비고 |
|-----------|-----------|------|
| `MissionRow` | **변경 없음** | `canChangeStatus` 로직이 이미 status 기반으로 동작 |
| `StatusBadge` | **변경 없음** | 모든 상태 대응 완료 |
| `CompleteModal` | **변경 없음** | 유지 |
| `FailModal` | **변경 없음** | 유지 |
| `formatDate` | **변경 없음** | 유지 |
| `formatPlaytimeMin` | **변경 없음** | 유지 |

---

## 데이터 흐름 (변경 후)

```
사용자가 필터 칩 클릭 (예: "진행중")
  │
  ├── setStatusFilter('IN_PROGRESS')
  ├── setPage(1)
  │
  └── useEffect 트리거 → loadMissions()
        │
        └── fetchMissions(guildId, 'IN_PROGRESS', 1, 10)
              │
              └── GET /api/guilds/{guildId}/newbie/missions?status=IN_PROGRESS&page=1&pageSize=10
                    │
                    └── 백엔드: findByGuild(guildId, 'IN_PROGRESS', 1, 10)
                          │
                          └── { items: [...], total: 5, page: 1, pageSize: 10 }
```

---

## 구현 순서 (권장)

1. **Step 1**: 백엔드 `GET /missions` 엔드포인트 통합 + 레포지토리 메서드
2. **Step 2**: 프론트엔드 API 클라이언트 `fetchMissions()` 추가
3. **Step 3**: `MissionManageTab.tsx` UI 개편 (핵심 변경)
4. **Step 4**: `page.tsx` import 정리
5. **Step 5**: i18n 메시지 추가

Step 1과 Step 2는 병렬 작업 가능 (인터페이스 합의 후).

---

## 충돌 분석

| 항목 | 충돌 여부 | 설명 |
|------|-----------|------|
| `GET /missions` 엔드포인트 | **주의** | 기존에 배열을 반환하던 것이 `{ items, total, page, pageSize }` 객체로 변경됨. 봇 내부에서 이 엔드포인트를 사용하는 곳이 있는지 확인 필요 |
| `GET /missions/history` | **없음** | 기존대로 유지 (deprecated만 표시) |
| `MissionRow` 컴포넌트 | **없음** | props 변경 없음 |
| `CompleteModal` / `FailModal` | **없음** | 변경 없음 |
| `page.tsx` | **최소** | import 변경만 수행 |
| 기존 `fetchActiveMissions` 사용처 | **확인 필요** | `page.tsx`의 `loadMissionDataCheck()`에서 사용 중 → Step 4에서 변경 |

### 백엔드 하위호환 전략

`GET /missions` 엔드포인트의 응답 형식이 변경되므로, 봇 내부에서 이 API를 직접 호출하는 코드가 있는지 확인해야 한다. 만약 있다면:
- **방법 A**: 쿼리 파라미터가 없을 때 기존 배열 형식 반환 (하위호환) → 복잡도 증가
- **방법 B (권장)**: 봇 내부 코드도 함께 변경 → 단순

---

## 테스트 체크리스트

- [ ] 기본 로딩 시 "진행중" 필터가 선택되어 있고, IN_PROGRESS 미션만 표시
- [ ] "전체" 필터 클릭 시 모든 상태의 미션 표시
- [ ] 각 필터 클릭 시 페이지가 1로 초기화
- [ ] IN_PROGRESS 미션의 상태 뱃지 클릭 시 성공/실패 드롭다운 표시
- [ ] COMPLETED/FAILED/LEFT 미션의 상태 뱃지는 읽기 전용
- [ ] 페이지네이션이 모든 필터에서 정상 동작
- [ ] 갱신 버튼 클릭 시 현재 필터 유지하면서 데이터 갱신
- [ ] Embed 토글이 정상 동작
- [ ] readonly 모드에서 상태 변경/Embed 토글 비활성화
- [ ] 빈 상태 메시지 표시
- [ ] CompleteModal, FailModal 정상 동작 후 목록 갱신
