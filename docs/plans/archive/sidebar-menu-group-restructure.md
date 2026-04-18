# 구현 계획: 사이드바 메뉴 그룹 재구성 (F-WEB-015)

## 개요

대시보드 사이드바와 설정 사이드바의 플랫 메뉴 구조를 그룹 기반으로 재편성한다. 대시보드 메뉴 항목에 설정 바로가기 아이콘을 추가하고, 설정 페이지에 대시보드 바로가기 버튼을 추가하여 양방향 크로스링크를 구현한다.

- PRD 근거: `docs/specs/prd/web.md` F-WEB-015
- 변경 범위: 순수 프론트엔드 UI 변경 (DB/API 변경 없음)

## 변경 대상 파일

| # | 파일 | 변경 유형 |
|---|------|-----------|
| 1 | `libs/i18n/locales/ko/web/common.json` | 수정 - i18n 키 9종 추가 |
| 2 | `libs/i18n/locales/en/web/common.json` | 수정 - i18n 키 9종 추가 |
| 3 | `apps/web/app/components/DashboardSidebar.tsx` | 수정 - 그룹 기반 렌더링 + 설정 바로가기 아이콘 |
| 4 | `apps/web/app/components/SettingsSidebar.tsx` | 수정 - 그룹 기반 렌더링 + 라벨 변경 |
| 5 | `apps/web/app/settings/guild/[guildId]/voice/page.tsx` | 수정 - 대시보드 바로가기 버튼 추가 |
| 6 | `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` | 수정 - 대시보드 바로가기 버튼 추가 |
| 7 | `apps/web/app/settings/guild/[guildId]/inactive-member/page.tsx` | 수정 - 대시보드 바로가기 버튼 추가 |

---

## 단계별 구현

### Step 1: i18n 키 추가

**파일**: `libs/i18n/locales/ko/web/common.json`, `libs/i18n/locales/en/web/common.json`

PRD에 정의된 9개 i18n 키를 추가한다. 기존 `sidebar` / `settings` 네임스페이스 내에 중첩 객체로 추가한다.

#### ko/web/common.json 변경

`sidebar` 객체에 다음 키 추가:

```json
"sidebar": {
  // ... 기존 키 유지 ...
  "dashboardGroup": {
    "overview": "개요",
    "memberActivity": "회원 활동",
    "system": "시스템"
  },
  "settingsGroup": {
    "serverSettings": "서버 설정",
    "voiceChannel": "음성 채널",
    "memberManagement": "회원 관리"
  },
  "crosslink": {
    "settings": "설정 바로가기",
    "dashboard": "대시보드에서 보기"
  }
}
```

`settings` 객체의 `general` 값 변경:

```json
"settings": {
  "general": "커맨드 관리",
  // ... 나머지 유지 ...
}
```

#### en/web/common.json 변경

`sidebar` 객체에 다음 키 추가:

```json
"sidebar": {
  // ... 기존 키 유지 ...
  "dashboardGroup": {
    "overview": "Overview",
    "memberActivity": "Member Activity",
    "system": "System"
  },
  "settingsGroup": {
    "serverSettings": "Server Settings",
    "voiceChannel": "Voice Channel",
    "memberManagement": "Member Management"
  },
  "crosslink": {
    "settings": "Go to Settings",
    "dashboard": "View in Dashboard"
  }
}
```

`settings` 객체의 `general` 값 변경:

```json
"settings": {
  "general": "Command Management",
  // ... 나머지 유지 ...
}
```

#### i18n 키 매핑 (PRD 대조)

| PRD 정의 키 | 실제 적용 키 | 비고 |
|-------------|-------------|------|
| `sidebar.dashboard.group.overview` | `sidebar.dashboardGroup.overview` | JSON 중첩 구조로 변환 |
| `sidebar.dashboard.group.memberActivity` | `sidebar.dashboardGroup.memberActivity` | |
| `sidebar.dashboard.group.system` | `sidebar.dashboardGroup.system` | |
| `sidebar.settings.group.serverSettings` | `sidebar.settingsGroup.serverSettings` | |
| `sidebar.settings.group.voiceChannel` | `sidebar.settingsGroup.voiceChannel` | |
| `sidebar.settings.group.memberManagement` | `sidebar.settingsGroup.memberManagement` | |
| `sidebar.settings.item.commandManagement` | `settings.general` (값 변경) | 기존 키 재활용, 값만 변경 |
| `sidebar.dashboard.crosslink.settings` | `sidebar.crosslink.settings` | |
| `sidebar.settings.crosslink.dashboard` | `sidebar.crosslink.dashboard` | |

> PRD의 dot-notation 키는 논리적 식별자이며, 실제 JSON 구조는 next-intl의 중첩 객체 패턴을 따른다. `settings.general` 키는 기존 키를 재활용하여 값만 "일반 설정" -> "커맨드 관리"로 변경한다. SettingsSidebar.tsx에서 이미 `t("settings.general")`로 참조 중이므로 코드 변경 없이 라벨이 갱신된다.

#### 충돌 여부

- 기존 키에 대한 삭제/이름변경 없음 (추가만 발생)
- `settings.general` 값 변경은 SettingsSidebar에서 이미 참조 중이므로 UI 반영이 자동으로 이루어짐

---

### Step 2: DashboardSidebar.tsx 그룹 기반 재구성

**파일**: `apps/web/app/components/DashboardSidebar.tsx`

#### 2-1. 데이터 구조 변경

플랫 `menuItems` 배열을 그룹 기반 구조로 변경한다.

```ts
interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  settingsHref?: string; // 설정 바로가기 링크 (없으면 아이콘 미표시)
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}
```

```ts
const menuGroups: MenuGroup[] = [
  {
    label: t("sidebar.dashboardGroup.overview"),
    items: [
      {
        href: `/dashboard/guild/${selectedGuildId}/overview`,
        label: t("sidebar.overview"),
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: t("sidebar.dashboardGroup.memberActivity"),
    items: [
      {
        href: `/dashboard/guild/${selectedGuildId}/voice`,
        label: t("sidebar.voice"),
        icon: Mic,
        settingsHref: `/settings/guild/${selectedGuildId}/voice`,
      },
      {
        href: `/dashboard/guild/${selectedGuildId}/co-presence`,
        label: t("sidebar.coPresence"),
        icon: GitFork,
        // settingsHref 없음 - 해당 설정 페이지 없음
      },
      {
        href: `/dashboard/guild/${selectedGuildId}/newbie`,
        label: t("sidebar.newbie"),
        icon: Sprout,
        settingsHref: `/settings/guild/${selectedGuildId}/newbie`,
      },
      {
        href: `/dashboard/guild/${selectedGuildId}/inactive-member`,
        label: t("sidebar.inactiveMember"),
        icon: UserX,
        settingsHref: `/settings/guild/${selectedGuildId}/inactive-member`,
      },
    ],
  },
  {
    label: t("sidebar.dashboardGroup.system"),
    items: [
      {
        href: `/dashboard/guild/${selectedGuildId}/monitoring`,
        label: t("sidebar.monitoring"),
        icon: Activity,
      },
    ],
  },
];
```

#### 2-2. import 추가

기존 import에 `Settings` 아이콘 추가 (설정 바로가기 아이콘으로 사용). 현재 import 목록에 이미 `Settings`가 포함되어 있으므로 추가 import 불필요.

#### 2-3. 렌더링 변경

기존 단일 `<nav>` 블록을 그룹별 반복으로 변경한다.

```tsx
{/* 대시보드 메뉴 */}
{menuGroups.map((group, groupIndex) => (
  <div key={group.label} className={groupIndex > 0 ? "mt-4" : ""}>
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-3">
      {group.label}
    </h2>
    <nav className="space-y-1">
      {group.items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <div key={item.href} className="flex items-center">
            <Link
              href={item.href}
              onClick={close}
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors flex-1 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
            {item.settingsHref && (
              <Link
                href={item.settingsHref}
                onClick={close}
                title={t("sidebar.crosslink.settings")}
                className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <Settings className="w-4 h-4" />
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  </div>
))}
```

기존 코드에서 제거할 부분:
- 기존 `const menuItems = [...]` 배열 전체
- 기존 `<h2>` 대시보드 헤더 (그룹 헤더로 대체)
- 기존 단일 `<nav>` 반복 블록

#### 2-4. 그룹 헤더 스타일

PRD 지침: "비클릭 레이블로 시각적 구분, 상단 여백 + 소문자 회색 텍스트, 메뉴 항목은 들여쓰기 없이 나열"

- 첫 번째 그룹: 여백 없음
- 두 번째 그룹 이후: `mt-4`로 상단 여백
- 헤더 텍스트: `text-xs font-semibold text-gray-400 uppercase tracking-wider`
- 기존 사이드바의 "서버"/"대시보드" 헤더와 동일한 스타일 패턴 사용 (`text-gray-500` -> `text-gray-400`으로 미세 조정하여 메뉴 항목과 시각적 구분)

#### 충돌 여부

- 기존 menuItems 배열을 menuGroups로 대체하므로 구조적 충돌 없음
- 하단 "설정으로 이동" 링크 및 "도움말" 링크는 그대로 유지

---

### Step 3: SettingsSidebar.tsx 그룹 기반 재구성

**파일**: `apps/web/app/components/SettingsSidebar.tsx`

#### 3-1. 데이터 구조 변경

DashboardSidebar와 동일한 `MenuGroup` 패턴을 적용한다. 단, 설정 사이드바에는 크로스링크 아이콘이 불필요하므로 `settingsHref` 필드는 사용하지 않는다.

```ts
interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}
```

```ts
const menuGroups: MenuGroup[] = [
  {
    label: t("sidebar.settingsGroup.serverSettings"),
    items: [
      { href: `/settings/guild/${selectedGuildId}`, label: t("settings.general"), icon: Settings },
      { href: `/settings/guild/${selectedGuildId}/music`, label: t("settings.music"), icon: Music },
    ],
  },
  {
    label: t("sidebar.settingsGroup.voiceChannel"),
    items: [
      { href: `/settings/guild/${selectedGuildId}/voice`, label: t("settings.voice"), icon: Mic },
      { href: `/settings/guild/${selectedGuildId}/voice-health`, label: t("settings.voiceHealth"), icon: HeartPulse },
      { href: `/settings/guild/${selectedGuildId}/auto-channel`, label: t("settings.autoChannel"), icon: Radio },
    ],
  },
  {
    label: t("sidebar.settingsGroup.memberManagement"),
    items: [
      { href: `/settings/guild/${selectedGuildId}/newbie`, label: t("settings.newbie"), icon: Users },
      { href: `/settings/guild/${selectedGuildId}/inactive-member`, label: t("settings.inactiveMember"), icon: UserX },
      { href: `/settings/guild/${selectedGuildId}/status-prefix`, label: t("settings.statusPrefix"), icon: Tag },
      { href: `/settings/guild/${selectedGuildId}/sticky-message`, label: t("settings.stickyMessage"), icon: Pin },
    ],
  },
];
```

#### 3-2. 라벨 변경

`settings.general`의 i18n 값을 Step 1에서 "커맨드 관리"로 변경했으므로, 코드에서는 `t("settings.general")` 참조를 그대로 유지한다. 코드 변경 불필요.

#### 3-3. 렌더링 변경

DashboardSidebar와 동일한 그룹별 반복 패턴을 적용한다. 단, 크로스링크 아이콘이 없으므로 단순 구조.

```tsx
{menuGroups.map((group, groupIndex) => (
  <div key={group.label} className={groupIndex > 0 ? "mt-4" : ""}>
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-3">
      {group.label}
    </h2>
    <nav className="space-y-1">
      {group.items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={close}
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-indigo-50 text-indigo-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  </div>
))}
```

기존 코드에서 제거할 부분:
- 기존 `const menuItems = [...]` 배열 전체
- 기존 단일 `<h2>` 설정 헤더
- 기존 단일 `<nav>` 반복 블록

#### 3-4. 메뉴 항목 순서 변경 요약

| 기존 순서 | 변경 후 그룹 + 순서 |
|-----------|-------------------|
| 일반 설정 | 서버 설정 > 커맨드 관리 |
| 자동방 설정 | 음성 채널 > 자동방 생성 |
| 신입 관리 | 회원 관리 > 신입 관리 |
| 게임방 상태 설정 | 회원 관리 > 게임방 상태 접두사 |
| 고정메세지 | 회원 관리 > 고정메세지 |
| 음악 설정 | 서버 설정 > 음악 재생 |
| 음성 설정 | 음성 채널 > 음성 추적 |
| 비활동 회원 설정 | 회원 관리 > 비활동 회원 |
| 자가진단 설정 | 음성 채널 > 음성 건강 |

#### 충돌 여부

- 기존 menuItems를 menuGroups로 대체하므로 구조적 충돌 없음
- 하단 "대시보드로 이동" 링크는 그대로 유지

---

### Step 4: 설정 페이지 대시보드 바로가기 버튼 추가

PRD 지침: 설정 각 페이지 상단에 "대시보드에서 보기" 텍스트 + BarChart 아이콘 버튼을 추가하여 해당 도메인의 대시보드 페이지로 이동한다.

대상 페이지 3개에 동일한 패턴의 바로가기 버튼을 추가한다.

#### 4-1. 크로스링크 매핑

| 설정 페이지 | 대시보드 목적지 |
|------------|---------------|
| `/settings/.../voice` | `/dashboard/guild/{guildId}/voice` |
| `/settings/.../newbie` | `/dashboard/guild/{guildId}/newbie` |
| `/settings/.../inactive-member` | `/dashboard/guild/{guildId}/inactive-member` |

#### 4-2. 공통 UI 패턴

각 페이지의 기존 상단 헤더 영역 (`<h1>` 또는 타이틀 영역) 우측 또는 직하에 바로가기 버튼을 삽입한다.

```tsx
import { BarChart3 } from 'lucide-react';
import Link from 'next/link';

// 페이지 상단 헤더 영역에 추가
<Link
  href={`/dashboard/guild/${selectedGuildId}/voice`}  // 각 페이지에 맞게 변경
  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
>
  <BarChart3 className="w-4 h-4" />
  <span>{t("sidebar.crosslink.dashboard")}</span>
</Link>
```

> `useTranslations("common")` 네임스페이스를 사용한다. 각 설정 페이지에서 현재 `useTranslations('settings')` 를 사용 중이므로, `common` 네임스페이스의 번역을 추가로 가져오거나, `crosslink.dashboard` 키를 `settings` 네임스페이스에도 추가하는 방안을 검토한다.

#### 4-3. 네임스페이스 선택

설정 페이지들은 `useTranslations('settings')`를 사용 중이다. 크로스링크 키는 `common.sidebar.crosslink.dashboard`에 정의된다. 두 가지 방안:

- **방안 A**: 설정 페이지에 `useTranslations("common")` 호출을 추가로 선언 (예: `const tc = useTranslations("common")`)
- **방안 B**: 크로스링크 키를 `settings` 네임스페이스에도 중복 추가

**방안 A 채택**: next-intl은 동일 컴포넌트에서 여러 네임스페이스 호출을 지원하며, 키 중복을 방지할 수 있다.

```tsx
const t = useTranslations('settings');
const tc = useTranslations('common');

// 사용: tc("sidebar.crosslink.dashboard")
```

#### 4-4. 각 페이지별 변경

**voice/page.tsx**:
- import 추가: `BarChart3` (lucide-react), `Link` (next/link)
- `useTranslations('common')` 추가
- 페이지 상단 헤더 영역에 바로가기 버튼 삽입
- 링크 대상: `/dashboard/guild/${selectedGuildId}/voice`

**newbie/page.tsx**:
- import 추가: `BarChart3` (lucide-react), `Link` (next/link) -- Link는 이미 있을 수 있으므로 확인 후 추가
- `useTranslations('common')` 추가
- 페이지 상단 헤더 영역에 바로가기 버튼 삽입
- 링크 대상: `/dashboard/guild/${selectedGuildId}/newbie`

**inactive-member/page.tsx**:
- import 추가: `BarChart3` (lucide-react), `Link` (next/link)
- `useTranslations('common')` 추가
- 페이지 상단 헤더 영역에 바로가기 버튼 삽입
- 링크 대상: `/dashboard/guild/${selectedGuildId}/inactive-member`

#### 충돌 여부

- 기존 페이지 로직에 영향 없음 (UI 추가만 발생)
- import 알파벳순 정렬 규칙 준수 필요

---

## 구현 순서

| 순서 | Step | 이유 |
|------|------|------|
| 1 | Step 1: i18n 키 추가 | 후속 컴포넌트들이 참조하는 키가 먼저 존재해야 함 |
| 2 | Step 2: DashboardSidebar 재구성 | 독립 작업, Step 1 완료 후 진행 |
| 3 | Step 3: SettingsSidebar 재구성 | 독립 작업, Step 1 완료 후 진행 (Step 2와 병렬 가능) |
| 4 | Step 4: 설정 페이지 크로스링크 | Step 1 완료 후 진행 (Step 2/3과 병렬 가능) |

## 검증 항목

| 항목 | 확인 방법 |
|------|-----------|
| 대시보드 사이드바에 3개 그룹 헤더(개요/회원 활동/시스템)가 표시되는지 | 브라우저에서 대시보드 접속 후 확인 |
| 각 그룹 하위에 올바른 메뉴 항목이 나열되는지 | 메뉴 항목 수 및 순서 확인 |
| 음성 활동/신입 관리/비활동 회원 메뉴 우측에 설정 아이콘(16px)이 표시되는지 | 시각적 확인 |
| 동시접속 분석/봇 모니터링/서버 개요 메뉴에는 설정 아이콘이 없는지 | 시각적 확인 |
| 설정 아이콘 클릭 시 해당 설정 페이지로 이동하는지 | 클릭 테스트 |
| 설정 사이드바에 3개 그룹 헤더(서버 설정/음성 채널/회원 관리)가 표시되는지 | 설정 페이지 접속 후 확인 |
| 설정 사이드바 "일반 설정"이 "커맨드 관리"로 변경되었는지 | 라벨 텍스트 확인 |
| 설정 사이드바 메뉴 순서가 PRD와 일치하는지 | 순서 대조 |
| 음성/신입/비활동 설정 페이지 상단에 "대시보드에서 보기" 버튼이 있는지 | 각 페이지 접속 후 확인 |
| 바로가기 버튼 클릭 시 대시보드 해당 페이지로 이동하는지 | 클릭 테스트 |
| 모바일 드로어에서도 그룹 구조가 정상 표시되는지 | 반응형 테스트 (모바일 뷰포트) |
| ko/en 언어 전환 시 그룹 헤더 및 크로스링크 라벨이 정상 표시되는지 | 언어 전환 테스트 |
| ESLint / TypeScript 빌드 오류 없는지 | `pnpm --filter @nexus/web lint` 실행 |

## 선행/후행 작업

| 구분 | 작업 | 상태 |
|------|------|------|
| 선행 | 없음 | - |
| 후행 | 없음 (순수 UI 재구성) | - |
