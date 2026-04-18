# 구현 계획: 사이드바 메뉴 추가 + 설정 탭 제거

## 개요

대시보드 사이드바에 "서버 개요", "신입 관리" 메뉴를 추가하고, 설정 페이지(`/settings/guild/{guildId}/newbie`)에서 "미션 관리" 탭을 제거하여 대시보드로 이관 준비를 완료한다.

## 변경 범위

### 변경 대상 파일 (3개)

| 파일 | 변경 유형 |
|------|-----------|
| `apps/web/app/components/DashboardSidebar.tsx` | 수정 - 메뉴 항목 2개 추가 |
| `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` | 수정 - 미션 관리 탭 제거 및 탭 재조정 |
| `apps/web/app/settings/guild/[guildId]/newbie/components/MissionManageTab.tsx` | 이동 대상 (이번 작업에서는 설정 페이지에서의 참조만 제거) |

### 이동 대상 파일 (1개)

| 원본 경로 | 이동 경로 |
|-----------|-----------|
| `apps/web/app/settings/guild/[guildId]/newbie/components/MissionManageTab.tsx` | `apps/web/app/dashboard/guild/[guildId]/newbie/components/MissionManageTab.tsx` |

> 신입 관리 대시보드 페이지(`/dashboard/guild/{guildId}/newbie`)는 아직 미구현 상태이므로, MissionManageTab.tsx를 대시보드 경로로 이동만 하고 대시보드 페이지 자체 구현은 별도 작업으로 진행한다.

---

## 단계별 구현

### Step 1: DashboardSidebar.tsx - 메뉴 항목 추가

**파일**: `apps/web/app/components/DashboardSidebar.tsx`

#### 1-1. import 추가

현재 import:
```ts
import { Activity, ArrowLeftRight, GitFork, Mic, Search, Settings, UserX } from "lucide-react";
```

변경 후:
```ts
import { Activity, ArrowLeftRight, GitFork, LayoutDashboard, Mic, Search, Settings, Sprout, UserX } from "lucide-react";
```

- `LayoutDashboard`: 서버 개요 아이콘
- `Sprout`: 신입 관리 아이콘

#### 1-2. menuItems 배열 수정

현재 순서: 음성 활동, 유저 검색, 비활동 회원, 관계 분석, 모니터링

변경 후 순서:
```ts
const menuItems = [
  {
    href: `/dashboard/guild/${selectedGuildId}/overview`,
    label: "서버 개요",
    icon: LayoutDashboard,
  },
  {
    href: `/dashboard/guild/${selectedGuildId}/voice`,
    label: "음성 활동",
    icon: Mic,
  },
  {
    href: `/dashboard/guild/${selectedGuildId}/user`,
    label: "유저 검색",
    icon: Search,
  },
  {
    href: `/dashboard/guild/${selectedGuildId}/newbie`,
    label: "신입 관리",
    icon: Sprout,
  },
  {
    href: `/dashboard/guild/${selectedGuildId}/inactive-member`,
    label: "비활동 회원",
    icon: UserX,
  },
  {
    href: `/dashboard/guild/${selectedGuildId}/co-presence`,
    label: "관계 분석",
    icon: GitFork,
  },
  {
    href: `/dashboard/guild/${selectedGuildId}/monitoring`,
    label: "모니터링",
    icon: Activity,
  },
];
```

PRD(web.md) F-WEB-009의 사이드바 메뉴 구성과 일치한다.

#### 충돌 여부

- 기존 메뉴 항목은 그대로 유지하고 앞/중간에 삽입하는 형태이므로 충돌 없음
- `/dashboard/guild/{guildId}/overview` 및 `/dashboard/guild/{guildId}/newbie` 페이지는 아직 미구현이지만, 사이드바 메뉴 자체는 선행 추가 가능 (링크 동작은 하나 404 표시)

---

### Step 2: 설정 페이지 미션 관리 탭 제거

**파일**: `apps/web/app/settings/guild/[guildId]/newbie/page.tsx`

#### 2-1. import 제거

```ts
// 제거
import MissionManageTab from './components/MissionManageTab';
```

#### 2-2. TabId 타입 수정

현재:
```ts
type TabId = 'welcome' | 'mission' | 'mission-manage' | 'moco' | 'role';
```

변경 후:
```ts
type TabId = 'welcome' | 'mission' | 'moco' | 'role';
```

#### 2-3. TABS 배열 수정

현재 (5개):
```ts
const TABS: { id: TabId; label: string }[] = [
  { id: 'welcome', label: '환영인사 설정' },    // 탭 1
  { id: 'mission', label: '미션 설정' },         // 탭 2
  { id: 'mission-manage', label: '미션 관리' },  // 탭 3 (제거)
  { id: 'moco', label: '모코코 사냥 설정' },      // 탭 4 -> 탭 3
  { id: 'role', label: '신입기간 설정' },          // 탭 5 -> 탭 4
];
```

변경 후 (4개):
```ts
const TABS: { id: TabId; label: string }[] = [
  { id: 'welcome', label: '환영인사 설정' },    // 탭 1
  { id: 'mission', label: '미션 설정' },         // 탭 2
  { id: 'moco', label: '모코코 사냥 설정' },      // 탭 3
  { id: 'role', label: '신입기간 설정' },          // 탭 4
];
```

PRD(newbie.md) F-WEB-NEWBIE-001 탭 구성과 일치한다.

#### 2-4. renderTabContent switch 문 수정

`case 'mission-manage'` 분기 제거:
```ts
// 제거할 코드
case 'mission-manage':
  return (
    <MissionManageTab
      guildId={selectedGuildId}
      roles={roles}
    />
  );
```

#### 2-5. 저장 버튼 조건부 렌더링 수정

현재:
```tsx
{activeTab !== 'mission-manage' && (
```

미션 관리 탭이 없어지므로 이 조건을 제거하고 항상 렌더링:
```tsx
{/* 저장 버튼은 항상 표시 (모든 탭이 설정 탭) */}
<div className="flex items-center justify-between gap-4">
```

#### 2-6. 불필요해지는 상태/로직 검토

- `roles` 상태: MissionManageTab에서만 사용되는지 확인 필요 -> RoleTab에서도 사용하므로 유지
- `fetchGuildRoles` 호출: RoleTab에서도 필요하므로 유지

#### 충돌 여부

- TABS 배열과 TabId 타입만 수정하므로 다른 컴포넌트에 영향 없음
- MissionManageTab 컴포넌트 자체는 이동 대상이므로 설정 페이지에서의 참조만 제거

---

### Step 3: MissionManageTab.tsx 이동

#### 3-1. 디렉토리 생성

```
apps/web/app/dashboard/guild/[guildId]/newbie/components/
```

#### 3-2. 파일 이동

```
FROM: apps/web/app/settings/guild/[guildId]/newbie/components/MissionManageTab.tsx
TO:   apps/web/app/dashboard/guild/[guildId]/newbie/components/MissionManageTab.tsx
```

#### 3-3. import 경로 수정

MissionManageTab.tsx 내부의 상대 경로 import를 이동 후 경로에 맞게 수정한다.

현재:
```ts
import type { DiscordRole } from '../../../../../lib/discord-api';
import type { ... } from '../../../../../lib/newbie-api';
import { ... } from '../../../../../lib/newbie-api';
```

이동 후 (dashboard 경로 기준):
```ts
import type { DiscordRole } from '../../../../../lib/discord-api';
import type { ... } from '../../../../../lib/newbie-api';
import { ... } from '../../../../../lib/newbie-api';
```

> 두 경로의 depth가 동일하므로 (`settings/guild/[guildId]/newbie/components` vs `dashboard/guild/[guildId]/newbie/components`) 상대 경로가 동일하게 유지된다. import 수정 불필요.

#### 충돌 여부

- 설정 페이지(Step 2)에서 import를 이미 제거했으므로 참조 충돌 없음
- 대시보드 newbie 페이지는 아직 미구현이므로, 이동한 컴포넌트는 당장 사용되지 않음

---

## 검증 항목

| 항목 | 확인 방법 |
|------|-----------|
| 사이드바에 7개 메뉴가 올바른 순서로 표시되는지 | 브라우저에서 대시보드 접속 후 사이드바 확인 |
| 서버 개요 링크 URL이 `/dashboard/guild/{guildId}/overview`인지 | 링크 클릭 또는 DOM 확인 |
| 신입 관리 링크 URL이 `/dashboard/guild/{guildId}/newbie`인지 | 링크 클릭 또는 DOM 확인 |
| 설정 페이지 신입 관리에서 탭이 4개(환영인사/미션/모코코/신입기간)인지 | 설정 페이지 접속 후 탭 바 확인 |
| 설정 페이지에서 미션 관리 탭이 사라졌는지 | 탭 바에 "미션 관리" 없음 확인 |
| 저장 버튼이 모든 탭에서 정상 표시되는지 | 각 탭 전환 후 저장 버튼 확인 |
| MissionManageTab.tsx가 대시보드 경로에 존재하는지 | 파일 시스템 확인 |
| ESLint / TypeScript 빌드 오류 없는지 | `pnpm --filter @nexus/web lint` 실행 |

## 선행/후행 작업

| 구분 | 작업 | 상태 |
|------|------|------|
| 후행 | 서버 개요 페이지 구현 (`/dashboard/guild/{guildId}/overview/page.tsx`) | F-WEB-008, 미구현 |
| 후행 | 신입 관리 대시보드 페이지 구현 (`/dashboard/guild/{guildId}/newbie/page.tsx`) | F-WEB-009, 미구현 |
| 후행 | 신입 관리 대시보드 백엔드 API 구현 | 미구현 |
