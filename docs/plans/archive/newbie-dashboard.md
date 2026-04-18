# 신입 관리 대시보드 프론트엔드 구현 계획

> PRD: [web.md](../specs/prd/web.md) F-WEB-009, [newbie.md](../specs/prd/newbie.md) F-NEWBIE-005, F-NEWBIE-003
> 참조 패턴: `apps/web/app/dashboard/guild/[guildId]/inactive-member/page.tsx`, `apps/web/app/lib/newbie-api.ts`

## 목표

신입 관리 전용 대시보드 페이지(`/dashboard/guild/{guildId}/newbie`)를 구현한다. **미션 관리** 탭과 **모코코 순위** 탭 2개로 구성하며, 기능 활성 상태(`missionEnabled`, `mocoEnabled`)에 따라 탭별 비활성 처리를 수행한다.

## 선행 조건

- **백엔드 API 구현 완료**: 아래 엔드포인트가 동작해야 한다.
  - `GET /api/guilds/{guildId}/newbie/config` (missionEnabled, mocoEnabled 포함)
  - `GET /api/guilds/{guildId}/newbie/missions` (진행 중 미션)
  - `GET /api/guilds/{guildId}/newbie/missions/history` (이력)
  - `POST /api/guilds/{guildId}/newbie/missions/complete|fail|hide|unhide`
  - `GET /api/guilds/{guildId}/newbie/moco` (순위)
- **사냥꾼 상세 API 신규 필요**: 아래 백엔드 엔드포인트가 필요하다 (현재 미구현).
  - `GET /api/guilds/{guildId}/newbie/moco/{hunterId}` — 사냥꾼의 도움받은 모코코 상세 목록 반환
  - 응답: `{ newbies: Array<{ newbieId, newbieName, minutes, sessions }> }`
  - 기존 Redis 레포지토리의 `getMocoHunterDetail()` + `getMocoNewbieSessions()` + `members/profiles` 조합으로 구현 가능

## 의존성 추가

추가 패키지 없음. 기존 Tailwind CSS + Lucide React 아이콘으로 구현한다.

## 변경 파일 목록

### 신규 생성

| 파일 | 역할 |
|------|------|
| `apps/web/app/lib/newbie-dashboard-api.ts` | 모코코 순위 API 클라이언트 + 타입 정의 |
| `apps/web/app/dashboard/guild/[guildId]/newbie/page.tsx` | 메인 페이지 (탭 전환 + Disable 로직) |
| `.../newbie/components/MissionManageTab.tsx` | 미션 관리 탭 (기존 컴포넌트 래핑) |
| `.../newbie/components/MocoRankingTab.tsx` | 모코코 순위 탭 (신규) |
| `.../newbie/components/MocoRankingTable.tsx` | 순위 테이블 + 행 펼침 (신규) |
| `.../newbie/components/MocoHunterDetail.tsx` | 사냥꾼 상세 펼침 행 (신규) |
| `.../newbie/components/MocoTopCards.tsx` | 상위 3명 하이라이트 + 참여자 수 카드 (신규) |
| `.../newbie/components/DisabledBanner.tsx` | 기능 비활성 경고 배너 (공용) |

### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/web/app/components/DashboardSidebar.tsx` | `menuItems` 배열에 "신입 관리" 항목 추가 (Users 아이콘) |

### 기존 컴포넌트 재사용 전략

기존 설정 페이지의 `MissionManageTab`(`apps/web/app/settings/guild/[guildId]/newbie/components/MissionManageTab.tsx`)은 **그대로 유지**하고, 대시보드 페이지에서 직접 import하여 사용한다. 대시보드 전용 래퍼 컴포넌트에서 Disable 처리(읽기 전용 모드) 로직만 추가한다.

> 설정 페이지에 미션 관리 탭이 있지만 PRD에 따르면 대시보드로 이동하는 것이 올바르다. 그러나 설정 페이지의 기존 코드를 깨뜨리지 않기 위해 당분간 양쪽에서 동일 컴포넌트를 사용한다. 추후 설정 페이지에서 미션 관리 탭을 제거하고 대시보드 링크로 교체하는 것은 별도 작업으로 진행한다.

## 구현 단계

### Step 1: API 클라이언트 (`newbie-dashboard-api.ts`)

기존 `newbie-api.ts`의 미션 관련 함수는 그대로 활용하고, 모코코 순위 전용 API 함수와 타입을 별도 파일에 정의한다.

**타입 정의:**

```typescript
/** 모코코 순위 아이템 */
export interface MocoRankItem {
  hunterId: string;
  totalMinutes: number;
  score: number;
  sessionCount: number;
  uniqueNewbieCount: number;
  channelMinutes: number;
}

/** 모코코 순위 응답 */
export interface MocoRankResponse {
  items: MocoRankItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 사냥꾼 상세 — 도움받은 모코코 */
export interface MocoNewbieDetail {
  newbieId: string;
  newbieName: string;
  minutes: number;
  sessions: number;
}
```

**함수:**

| 함수 | 엔드포인트 | 설명 |
|------|-----------|------|
| `fetchMocoRanking(guildId, page?, pageSize?)` | `GET /api/guilds/{guildId}/newbie/moco` | 순위 페이지 조회 |
| `fetchMocoHunterDetail(guildId, hunterId)` | `GET /api/guilds/{guildId}/newbie/moco/{hunterId}` | 사냥꾼 상세 (백엔드 신규 필요) |

기능 상태 조회(`fetchNewbieConfig`)와 미션 관련 함수들은 기존 `newbie-api.ts`에서 import한다.

---

### Step 2: 메인 페이지 (`page.tsx`)

**역할:** 탭 전환, 기능 상태 기반 Disable 처리, config 로딩

**로직:**

1. 마운트 시 `fetchNewbieConfig(guildId)` 호출하여 `missionEnabled`, `mocoEnabled` 확인
2. **양쪽 모두 비활성** → 전체 비활성 안내 화면 + 설정 페이지 이동 링크
3. **하나만 비활성** → 비활성 탭은 disabled 처리, 활성 탭을 기본 선택
4. **양쪽 활성** → "미션 관리" 탭 기본 선택
5. 미션 관리 탭에는 Discord 역할 목록이 필요하므로, `fetchGuildRoles(guildId)` 호출 (기존 discord-api.ts)

**탭 UI:** 기존 대시보드 페이지들과 동일하게 `border-b-2` 스타일 탭 버튼 사용

---

### Step 3: 미션 관리 탭 래퍼 (`components/MissionManageTab.tsx`)

기존 설정 페이지의 `MissionManageTab` 컴포넌트를 import하되, Disable 상태일 때의 처리를 래퍼에서 담당한다.

**Disable 처리 (`missionEnabled = false`):**

| 조건 | 동작 |
|------|------|
| 데이터 있음 (activeMissions.length > 0 또는 history.total > 0) | `DisabledBanner` 표시 + 기존 컴포넌트를 읽기 전용으로 렌더링 |
| 데이터 없음 | 빈 상태 안내 + 설정 이동 링크 |

**읽기 전용 구현 방식:**

기존 `MissionManageTab`에 `readonly?: boolean` prop을 추가한다. `readonly=true`일 때:
- 상태 뱃지 드롭다운 클릭 비활성화 (canChangeStatus = false)
- Embed 토글 버튼 disabled
- 이 변경은 기존 설정 페이지에서는 `readonly`를 넘기지 않으므로 영향 없음

---

### Step 4: 모코코 순위 탭 (`components/MocoRankingTab.tsx`)

**역할:** 기간 표시 + MocoTopCards + MocoRankingTable 조합

**데이터 로딩:**
1. `fetchMocoRanking(guildId, page, pageSize)` 호출
2. 받은 `hunterId` 목록으로 `fetchMemberProfiles(guildId, hunterIds)` 호출하여 닉네임/아바타 조회
3. config에서 `mocoResetPeriod`, `mocoCurrentPeriodStart` 정보로 기간 표시 문자열 생성

**기간 표시 로직:**
- `NONE` → "전체 기간 (누적)"
- `MONTHLY` → "YYYY년 M월 1일 ~ YYYY년 M월 말일"
- `CUSTOM` → "YYYY-MM-DD ~ YYYY-MM-DD" (mocoCurrentPeriodStart 기준 + mocoResetIntervalDays)

**Disable 처리 (`mocoEnabled = false`):**

| 조건 | 동작 |
|------|------|
| 데이터 있음 (total > 0) | `DisabledBanner` 표시 + 읽기 전용 조회 |
| 데이터 없음 | 빈 상태 안내 + 설정 이동 링크 |

---

### Step 5: 상위 3명 카드 (`components/MocoTopCards.tsx`)

상위 3명 사냥꾼을 하이라이트하는 카드 UI + 전체 참여자 수 표시.

**구성:**
- 3개의 카드: 1위/2위/3위 각각 닉네임, 아바타, 총 점수 표시
- 1위 카드는 강조 스타일 (golden border / larger)
- 참여자 수: "총 N명 참여" 텍스트
- 데이터가 3명 미만이면 존재하는 만큼만 표시

---

### Step 6: 순위 테이블 (`components/MocoRankingTable.tsx`)

| 열 | 내용 |
|----|------|
| 순위 | 페이지 기반 순번 (1, 2, 3...) |
| 사냥꾼 | 아바타 + 닉네임 |
| 총 점수 | score |
| 사냥 시간(분) | channelMinutes |
| 세션 횟수 | sessionCount |
| 도움준 모코코 수 | uniqueNewbieCount |

**행 클릭 → 펼침:** 클릭 시 해당 행 아래에 `MocoHunterDetail` 컴포넌트를 삽입한다. 토글 방식 (다시 클릭하면 닫힘). 한 번에 하나만 펼침.

**페이지네이션:** 기존 미션 이력 테이블과 동일한 이전/다음 버튼 패턴.

---

### Step 7: 사냥꾼 상세 펼침 (`components/MocoHunterDetail.tsx`)

행 아래에 인라인으로 확장되는 상세 패널.

**표시 정보:**
- 도움받은 모코코 목록 테이블: 닉네임, 동시접속 시간(분), 세션 횟수

**데이터 소스:**
- `fetchMocoHunterDetail(guildId, hunterId)` 호출
- 로딩 중 스피너 표시

---

### Step 8: 비활성 배너 (`components/DisabledBanner.tsx`)

**공용 컴포넌트.** 기능이 비활성인데 기존 데이터가 있을 때 테이블 상단에 표시.

```
[경고 아이콘] {featureName} 기능이 비활성화 상태입니다. 데이터는 읽기 전용으로 조회할 수 있습니다.
```

Props: `featureName: string`, `settingsUrl: string`

---

### Step 9: DashboardSidebar 수정

`menuItems` 배열에 "신입 관리" 항목 추가.

```typescript
{
  href: `/dashboard/guild/${selectedGuildId}/newbie`,
  label: "신입 관리",
  icon: UserPlus,  // lucide-react의 UserPlus 아이콘
},
```

위치: "유저 검색" 항목 다음, "비활동 회원" 항목 이전.

---

## 백엔드 신규 엔드포인트 (구현 필요)

대시보드의 "사냥꾼 상세 펼침" 기능을 위해 아래 엔드포인트를 백엔드에 추가해야 한다.

### `GET /api/guilds/:guildId/newbie/moco/:hunterId`

**역할:** 특정 사냥꾼이 도움한 모코코 상세 목록 반환

**구현 방법:**
1. `redisRepo.getMocoHunterDetail(guildId, hunterId)` → `{ newbieId: minutes }` 맵
2. `redisRepo.getMocoNewbieSessions(guildId, hunterId)` → `{ newbieId: sessions }` 맵
3. newbieId 목록으로 `members/profiles` 호출하여 닉네임 조회
4. 세 데이터를 결합하여 응답

**응답:**
```json
{
  "newbies": [
    { "newbieId": "123", "newbieName": "모코코1", "minutes": 45, "sessions": 3 },
    { "newbieId": "456", "newbieName": "모코코2", "minutes": 30, "sessions": 2 }
  ]
}
```

**컨트롤러 위치:** `apps/api/src/newbie/newbie.controller.ts`에 추가

---

## 기존 컴포넌트 수정사항

### `MissionManageTab` (기존 설정 페이지)

`readonly` prop 추가:

```typescript
interface MissionManageTabProps {
  guildId: string;
  roles: DiscordRole[];
  readonly?: boolean;  // 신규 추가
}
```

`readonly=true`일 때:
- `MissionRow`의 `canChangeStatus`를 항상 `false`로 처리
- `handleToggleEmbed`에서 disabled 상태 유지
- 새로고침 버튼은 유지 (읽기 작업이므로)

---

## 코드 구조 요약

```
apps/web/app/
├── lib/
│   ├── newbie-api.ts                  ← 기존 (미션 API, config API)
│   └── newbie-dashboard-api.ts        ← 신규 (모코코 순위 API)
├── components/
│   └── DashboardSidebar.tsx           ← 수정 (메뉴 추가)
├── settings/guild/[guildId]/newbie/
│   └── components/
│       └── MissionManageTab.tsx       ← 수정 (readonly prop 추가)
└── dashboard/guild/[guildId]/newbie/
    ├── page.tsx                       ← 신규 (메인 페이지)
    └── components/
        ├── MissionManageTab.tsx        ← 신규 (래퍼: disable 로직)
        ├── MocoRankingTab.tsx          ← 신규
        ├── MocoRankingTable.tsx        ← 신규
        ├── MocoHunterDetail.tsx        ← 신규
        ├── MocoTopCards.tsx            ← 신규
        └── DisabledBanner.tsx          ← 신규
```

## 구현 순서 (권장)

1. **백엔드**: `GET /api/guilds/:guildId/newbie/moco/:hunterId` 엔드포인트 추가
2. **API 클라이언트**: `newbie-dashboard-api.ts` 생성
3. **기존 컴포넌트 수정**: `MissionManageTab`에 `readonly` prop 추가
4. **DashboardSidebar**: "신입 관리" 메뉴 항목 추가
5. **DisabledBanner**: 공용 배너 컴포넌트 생성
6. **MocoTopCards**: 상위 3명 카드 구현
7. **MocoHunterDetail**: 사냥꾼 상세 펼침 구현
8. **MocoRankingTable**: 순위 테이블 + 펼침 통합
9. **MocoRankingTab**: 모코코 순위 탭 조합
10. **대시보드 MissionManageTab 래퍼**: disable 로직 포함
11. **page.tsx**: 메인 페이지 탭 전환 + 전체 disable 로직

## 충돌 분석

| 항목 | 충돌 여부 | 설명 |
|------|-----------|------|
| 기존 설정 페이지 MissionManageTab | **없음** | `readonly` prop은 optional이며 기본값 false. 설정 페이지에서는 기존과 동일하게 동작 |
| DashboardSidebar menuItems | **없음** | 배열에 항목 추가만 수행. 기존 항목 순서 변경 없음 |
| newbie-api.ts | **없음** | 기존 파일 수정 없음. 모코코 API는 별도 파일로 분리 |
| 대시보드 layout.tsx | **없음** | 기존 레이아웃 그대로 사용. 신규 라우트만 추가 |
