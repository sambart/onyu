# 신입 미션 — `missionUseMicTime` 옵션 프론트엔드 구현 계획

## 개요

| 항목 | 내용 |
|------|------|
| 관련 PRD | `docs/specs/prd/newbie.md` — "탭 2: 미션 설정" (`missionUseMicTime` 행) |
| 관련 기능 | 미션 플레이타임 합산 시 채널 접속 시간(`channelDurationSec`) 대신 마이크 ON 시간(`micOnSec`)을 사용할지 토글 |
| 대상 서비스 | `apps/web/` (Next.js 프론트엔드) |
| 영향 범위 | 신입 설정 페이지 미션 탭 1곳 + 신입 대시보드 미션 현황 라벨 (옵션) |

### PRD 핵심 사양 (탭 2 신규 행)

- 라벨: `목표 시간 측정 시 마이크 사용 시간만 반영`
- 도움말: `체크하면 채널 접속 시간이 아닌 마이크 ON 시간만 누적됩니다`
- 배치: "목표 플레이타임 입력" **바로 아래**
- 옵션 변경 시 경고: `이 옵션을 변경하면 진행 중인 모든 미션의 누적 시간이 새 기준으로 즉시 재계산됩니다.`
- 데이터 모델: `NewbieConfig.missionUseMicTime: boolean`, NOT NULL, DEFAULT `false`

### 작업 범위 외 (영향 없음)

- 모코코 사냥 페이지(MocoTab/MocoRankingTab/MocoTemplateSection): `missionUseMicTime`은 미션 한정 옵션이므로 영향 없음.
- 신입역할 자동관리 페이지(RoleTab): 영향 없음.
- 환영 메시지(WelcomeTab): 영향 없음.

---

## 현재 구현 상태 분석

### 타입 정의

`apps/web/app/lib/newbie-api.ts` `NewbieConfig` 인터페이스에는 `missionUseMicTime` 필드가 **존재하지 않는다**.
- 미션 영역 필드 순서: `missionEnabled` → `missionDurationDays` → `missionTargetPlaytimeHours` → `missionTargetPlayCount` → `playCountMinDurationMin` → `playCountIntervalMin` → `missionNotifyChannelId` → `missionEmbedColor` → `missionDisplayMode`.

### 기본값

`apps/web/app/settings/guild/[guildId]/newbie/page.tsx`의 `DEFAULT_CONFIG` 객체는 위 순서를 따라 초기값을 정의하며, `missionUseMicTime` 키가 없다.

### 입력 UI

`apps/web/app/settings/guild/[guildId]/newbie/components/MissionTab.tsx`는 `CollapsibleSection` 단위로 그룹화되어 있으며, "기본 설정" 그룹(`basicSettings`) 안에 다음 순서로 필드를 렌더링한다.

1. 미션 기간 (일수)
2. 목표 플레이타임 (시간) — `mission-target-playtime` 입력
3. 목표 플레이횟수 (회)
4. 알림 채널 선택

저장은 부모 `page.tsx`의 `handleSave` → `saveNewbieConfig`가 `NewbieConfig` 전체를 `POST /api/guilds/{guildId}/newbie/config`로 전송. 타입에 필드 추가 시 자동 포함된다.

### 미션 현황 (대시보드)

`apps/web/app/dashboard/guild/[guildId]/newbie/components/MissionManageTab.tsx`는 미션 목록 테이블의 "플레이타임" 컬럼 헤더(`newbie.missionManage.table.playtime`)를 표시한다. 현재 `MissionManageTab`은 `config`를 props로 받지 않고 자체적으로 `fetchMissions`만 호출하므로, 옵션 활성 시 라벨에 "마이크 ON 시간" 명시를 위해서는 props 확장이 필요하다.

### 다국어(i18n)

미션 관련 키는 `libs/i18n/locales/{ko,en}/web/settings.json`의 `newbie.mission.*` 네임스페이스에 정의되어 있다. 신규 라벨/도움말/경고 문구를 ko/en 양쪽에 추가해야 한다. 테이블 헤더 보강이 필요하면 `libs/i18n/locales/{ko,en}/web/dashboard.json`의 `newbie.missionManage.table.*`도 추가한다.

### 기존 테스트 픽스처

`apps/web/app/settings/guild/[guildId]/newbie/__tests__/MocoTab.test.tsx`의 `BASE_CONFIG`에 `NewbieConfig` 전체 필드가 명시되어 있다. 인터페이스에 신규 필드가 추가되면 픽스처에도 추가하지 않으면 컴파일 에러가 난다.

### Orphan 파일 주의

`apps/web/app/settings/guild/[guildId]/newbie/components/MissionManageTab.tsx`(settings 하위)는 grep 결과 import 사용처가 없다(대시보드 쪽 동일 이름 파일이 실제 사용처). 본 작업에서는 건드리지 않는다.

---

## 수정 파일 목록

```
apps/web/app/lib/newbie-api.ts
  → NewbieConfig 인터페이스에 missionUseMicTime 추가

apps/web/app/settings/guild/[guildId]/newbie/page.tsx
  → DEFAULT_CONFIG에 missionUseMicTime: false 초기값 추가

apps/web/app/settings/guild/[guildId]/newbie/components/MissionTab.tsx
  → "목표 플레이타임" 입력 바로 아래에 체크박스 + 도움말 + 경고 문구 UI 추가
  → 변경 감지를 위해 초기 로드값을 ref로 추적, 토글 시 경고 문구 노출

apps/web/app/settings/guild/[guildId]/newbie/__tests__/MocoTab.test.tsx
  → BASE_CONFIG 픽스처에 missionUseMicTime: false 추가 (타입 컴파일)

libs/i18n/locales/ko/web/settings.json
libs/i18n/locales/en/web/settings.json
  → newbie.mission.useMicTime / useMicTimeDesc / useMicTimeWarning 키 추가

# (선택 — 미션 현황 라벨 보강 시)
apps/web/app/dashboard/guild/[guildId]/newbie/page.tsx
  → MissionManageTab에 missionUseMicTime prop 전달

apps/web/app/dashboard/guild/[guildId]/newbie/components/MissionManageTab.tsx
  → missionUseMicTime prop 추가, true일 때 "플레이타임" 컬럼 헤더 아래에
    "마이크 ON 시간" small text 표시

apps/web/app/dashboard/guild/[guildId]/newbie/__tests__/MissionManageTab.test.tsx
  → 새 prop 시그니처 호환을 위한 default prop 보강

libs/i18n/locales/{ko,en}/web/dashboard.json
  → newbie.missionManage.table.playtimeMicHint 키 추가
```

신규 생성 파일 없음.

---

## 1. `apps/web/app/lib/newbie-api.ts` 수정

### 1-1. `NewbieConfig` 인터페이스에 필드 추가

`missionTargetPlaytimeHours`와 `missionTargetPlayCount` 사이가 PRD에서 명시한 UI 배치 순서와 일치한다. 타입 필드 순서도 동일하게 맞춘다.

```ts
// 미션
missionEnabled: boolean;
missionDurationDays: number | null;
missionTargetPlaytimeHours: number | null;
missionUseMicTime: boolean;            // 신규 — 기본 false (channelDurationSec 사용)
missionTargetPlayCount: number | null;
playCountMinDurationMin: number | null;
playCountIntervalMin: number | null;
missionNotifyChannelId: string | null;
missionEmbedColor: string | null;
missionDisplayMode: 'EMBED' | 'CANVAS';
```

- 백엔드 DTO와의 1:1 매핑 (`docs/specs/prd/newbie.md` `NewbieConfig.missionUseMicTime`)
- `boolean` 강제 (nullable 아님). 백엔드가 NOT NULL DEFAULT false이므로 nullable 처리하지 않는다.
- JSDoc 1줄: `/** true이면 미션 플레이타임을 micOnSec 기준으로 합산. 기본 false (channelDurationSec). */`

### 1-2. API 호출부 변경 없음

`saveNewbieConfig`는 `body: config`로 객체 전체를 그대로 전송하므로 타입 추가만으로 자동 포함된다.

---

## 2. `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` 수정

### 2-1. `DEFAULT_CONFIG`에 초기값 추가

`missionTargetPlaytimeHours: null,` 다음 줄에 삽입.

```ts
missionTargetPlaytimeHours: null,
missionUseMicTime: false,             // 신규 — PRD DEFAULT false
missionTargetPlayCount: null,
```

- PRD/DB 기본값과 동일하게 `false`. 토글 OFF가 기존 동작(채널 접속 시간 기준).
- 서버에서 받은 `cfg`가 이 필드를 누락하더라도(레거시 환경 등) `setConfig(cfg)` 호출 시 `cfg`에 키가 없으면 `undefined`가 되어 boolean 강제와 어긋날 수 있다 → 보강이 필요하면 `setConfig({ ...DEFAULT_CONFIG, ...cfg })` 패턴으로 변경. 단 백엔드가 항상 boolean을 반환한다면 현재 코드 유지.

### 2-2. 저장 흐름 변경 없음

`handleSave`가 객체 전체를 전송하므로 별도 변경 불필요. 유효성 검사도 boolean 필드는 type system이 보장하므로 추가 검증 불요.

---

## 3. `MissionTab.tsx` 수정 (핵심)

### 3-1. UI 삽입 위치

기본 설정 `CollapsibleSection`(`basicSettings`) 내부, 기존 "목표 플레이타임" 입력 `<div>` (현재 144~167줄, `mission-target-playtime` ID) **직후, "목표 플레이횟수" 입력 직전**에 신규 블록 삽입.

```
미션 기간 (일수)
목표 플레이타임 (시간)
─────────── [신규] ───────────
[ ] 목표 시간 측정 시 마이크 사용 시간만 반영
    체크하면 채널 접속 시간이 아닌 마이크 ON 시간만 누적됩니다
    (변경된 경우) ⚠ 이 옵션을 변경하면 진행 중인 모든 미션의 누적 시간이...
─────────── [기존] ───────────
목표 플레이횟수 (회)
알림 채널 선택
```

### 3-2. 컴포넌트 분리 (작은 헬퍼 함수형 컴포넌트)

이 옵션은 `useEffect`로 변경 감지가 필요하므로 `MissionTab` 본문에 인라인 작성하기보다, 같은 파일 내부 함수형 컴포넌트(`MissionUseMicTimeField`)로 추출하면 의존 상태가 격리되어 가독성이 좋다.

> 단, 별도 파일 분리는 과한 추상화이므로 `MissionTab.tsx` 파일 내부 함수형 컴포넌트로만 둔다. 외부에서 재사용하지 않는다.

```tsx
interface MissionUseMicTimeFieldProps {
  value: boolean;
  initialValue: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

function MissionUseMicTimeField({
  value,
  initialValue,
  disabled,
  onChange,
}: MissionUseMicTimeFieldProps) {
  const t = useTranslations('settings');
  const isChanged = value !== initialValue;

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <input
          id="mission-use-mic-time"
          type="checkbox"
          checked={value}
          onChange={handleToggle}
          disabled={disabled}
          className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 disabled:cursor-not-allowed"
        />
        <label
          htmlFor="mission-use-mic-time"
          className="text-sm font-medium text-gray-700"
        >
          {t('newbie.mission.useMicTime')}
        </label>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {t('newbie.mission.useMicTimeDesc')}
      </p>
      {isChanged && (
        <p
          role="alert"
          className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
        >
          {t('newbie.mission.useMicTimeWarning')}
        </p>
      )}
    </div>
  );
}
```

- 이벤트 핸들러명: `handleToggle` — 프로젝트 컨벤션(`handle` + 대상) 준수.
- Boolean 변수: `isChanged` — `is` 접두사 컨벤션 준수.
- 함수 길이: 약 35줄 — `max-lines-per-function` 50줄 룰 통과.
- 파라미터 수: 4개 → 3개 초과 (warn). 객체 props 패턴이라 1개로 카운트되어 문제 없음.
- 경고 문구는 항상 영구 노출이 아니라 **현재 값 ≠ 초기 로드값**일 때만 노출(PRD: "옵션 변경 시 경고 문구 표시")한다. `role="alert"`로 스크린리더 안내.

### 3-3. `MissionTab`에 `initialValue` 전달

`MissionTab`은 부모 `page.tsx`로부터 `config`만 받고 초기 로드 값은 알지 못한다. 가장 단순한 처리는 **`MissionTab` 마운트 시점의 `config.missionUseMicTime`을 `useRef`로 캡처**하여 첫 진입 시 값(=DB 값)을 기억하는 것.

```tsx
export default function MissionTab({ config, ... }: MissionTabProps) {
  const initialUseMicTimeRef = useRef<boolean>(config.missionUseMicTime);
  // ...
}
```

- `config` prop은 `setConfig`로 통째로 교체되며 컴포넌트는 재마운트되지 않는다(서버 변경 시에도 마찬가지). 따라서 `useRef` 초기값이 곧 "이번 세션의 기준"이 된다.
- 저장 후에도 동일 값이 유지되어 더 이상 경고가 표시되지 않게 하려면, 부모의 `saveSuccess` 시점에 ref를 갱신해야 한다. 그러나 `MissionTab`은 저장 성공 콜백을 받지 않는다. 단순화를 위해 **첫 마운트 시 캡처** 방식만 채택하고, 저장 후 사용자가 페이지를 떠났다 다시 진입하면 새 기준으로 캡처되도록 한다. PRD 문구도 "변경하면" 시점 안내이므로 한 세션 내내 노출되어도 사용자 경험상 충분하다.

> 만약 저장 직후 경고가 사라지길 원한다면 후속 PR에서 `MissionTab` props에 `onConfigSaved` 콜백을 추가하고 ref를 `current = config.missionUseMicTime`로 갱신하는 방식으로 확장 가능하다. 본 PR 범위 외.

### 3-4. UI 블록 삽입 (JSX)

기존 `MissionTab.tsx` 144~167줄 (`mission-target-playtime` div) 직후에 다음을 삽입.

```tsx
<MissionUseMicTimeField
  value={config.missionUseMicTime}
  initialValue={initialUseMicTimeRef.current}
  disabled={!isEnabled}
  onChange={(next) => onChange({ missionUseMicTime: next })}
/>
```

- `disabled`는 미션 기능 자체가 OFF인 경우만. 다른 입력과 동일.
- 별도 의존성 없이 단일 toggle만 `onChange`로 부모 `updateConfig`에 위임.

### 3-5. 요약 텍스트(`basicSummary`) 보강 (선택)

`MissionTab` 38~47줄 `basicSummary`는 접힌 상태 미리보기 라벨이다. 옵션이 켜졌을 때 `"마이크 ON 시간"` 배지를 1개 노출하면 사용성이 좋다.

```ts
const basicSummary = [
  config.missionDurationDays != null && `${config.missionDurationDays}일`,
  config.missionTargetPlaytimeHours != null && `목표 ${config.missionTargetPlaytimeHours}시간`,
  config.missionUseMicTime && t('newbie.mission.useMicTimeBadge'), // 신규
  config.missionTargetPlayCount != null && `목표 ${config.missionTargetPlayCount}회`,
  config.missionNotifyChannelId
    ? `# ${channels.find((c) => c.id === config.missionNotifyChannelId)?.name ?? '...'}`
    : null,
]
  .filter(Boolean)
  .join(' · ');
```

- i18n 키 추가: `newbie.mission.useMicTimeBadge` ko=`마이크 ON 시간`, en=`Mic-on time`. 본 항목은 작업 범위 OK일 때 포함, 아니면 생략 가능 — PRD에 명시된 사항은 아니지만 사용자에게 도움이 된다.

### 3-6. import 갱신

```tsx
import { useRef } from 'react';
```

기존 `MissionTab.tsx`는 `useTranslations`만 import하고 React hook 없음. `useRef` 추가.

---

## 4. i18n 메시지 추가

### 4-1. `libs/i18n/locales/ko/web/settings.json`

`newbie.mission` 객체에 키 추가. 기존 `targetPlaytimeDesc` 다음, `targetPlayCount` 앞에 삽입.

```json
"targetPlaytime": "목표 플레이타임 (시간)",
"targetPlaytimeDesc": "미션 완료 기준 음성 채널 최소 플레이타임(시간)",
"useMicTime": "목표 시간 측정 시 마이크 사용 시간만 반영",
"useMicTimeDesc": "체크하면 채널 접속 시간이 아닌 마이크 ON 시간만 누적됩니다",
"useMicTimeWarning": "이 옵션을 변경하면 진행 중인 모든 미션의 누적 시간이 새 기준으로 즉시 재계산됩니다.",
"useMicTimeBadge": "마이크 ON 시간",
"targetPlayCount": "목표 플레이횟수 (회)",
```

### 4-2. `libs/i18n/locales/en/web/settings.json`

대응되는 동일 위치.

```json
"targetPlaytime": "Target Playtime (hours)",
"targetPlaytimeDesc": "Minimum voice channel playtime (hours) required to complete the mission",
"useMicTime": "Count only mic-on time toward target",
"useMicTimeDesc": "When enabled, only mic-on time is accumulated instead of channel-presence time.",
"useMicTimeWarning": "Changing this option immediately recalculates the accumulated playtime of all in-progress missions on the new basis.",
"useMicTimeBadge": "Mic-on time",
"targetPlayCount": "Target Play Count",
```

---

## 5. 테스트 픽스처 보강

### 5-1. `apps/web/app/settings/guild/[guildId]/newbie/__tests__/MocoTab.test.tsx`

`BASE_CONFIG: NewbieConfig`에 `missionTargetPlaytimeHours: null,` 다음 줄에 추가:

```ts
missionUseMicTime: false,
```

- 미션 픽스처 변경 없이 타입만 만족시키면 됨. 기존 MocoTab 테스트 케이스는 이 필드를 참조하지 않는다.

### 5-2. (선택) `apps/web/app/dashboard/guild/[guildId]/newbie/__tests__/MissionManageTab.test.tsx`

`MissionManageTab`에 props가 추가되는 경우(아래 섹션 6에서 진행 시) 새 prop의 디폴트값을 테스트에서 명시. props가 옵셔널이고 기본 false라면 테스트 변경 없음.

### 5-3. (선택) 신규 테스트 추가 — 본 PR 범위 외 권장

`MissionTab` 단위 테스트를 신규로 추가하려면 다음 케이스를 다룰 수 있다.

- 체크박스 ON/OFF 시 `onChange` 콜백이 `{ missionUseMicTime: true|false }`를 호출하는지
- 초기값과 다른 값으로 전환했을 때 경고(`role="alert"`)가 노출되고, 다시 원래 값으로 되돌리면 사라지는지
- `missionEnabled = false`일 때 체크박스 `disabled` 처리

위 테스트는 별도 PR에서 다뤄도 무방. 본 작업에서는 컴파일 에러가 나지 않도록 픽스처만 손본다.

---

## 6. (선택) 대시보드 미션 현황 라벨 보강

PRD `[탭 1: 미션 현황]` 표 섹션에 "`missionUseMicTime = true`이면 마이크 ON 시간 기준으로 산출하며 라벨을 '마이크 ON 시간'으로 표시"라고 명시되어 있다. 이는 봇 Embed/Canvas 측 표기에 대한 명세이지만, 대시보드 웹 UI에도 동일 의도를 반영하는 편이 일관적이다.

### 6-1. `MissionManageTab` props 확장

```ts
interface MissionManageTabProps {
  guildId: string;
  roles: DiscordRole[];
  readonly?: boolean;
  missionUseMicTime?: boolean;  // 신규 — 기본 false
}
```

- 옵셔널 + 기본 false로 두어 기존 호출처에 영향 최소화.

### 6-2. 테이블 헤더 보강 (`MissionManageTab.tsx` 517~519줄)

```tsx
<th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
  <div>{t('newbie.missionManage.table.playtime')}</div>
  {missionUseMicTime && (
    <div className="text-[10px] text-gray-400 font-normal">
      {t('newbie.missionManage.table.playtimeMicHint')}
    </div>
  )}
</th>
```

- `text-[10px]` Tailwind arbitrary value 사용 — 기존 코드 컨벤션과 동일(예: `text-[10px]` 사용 사례 있음).
- 헤더 행 내부 2줄 구성. 셀 자체에는 영향 없음.

### 6-3. 호출부 수정 (`apps/web/app/dashboard/guild/[guildId]/newbie/page.tsx` 169줄)

```tsx
<MissionManageTab
  guildId={guildId}
  roles={roles}
  readonly={!isMissionEnabled}
  missionUseMicTime={config?.missionUseMicTime ?? false}
/>
```

- `config`는 이미 `loadConfig`에서 fetch된 상태. nullish는 false로 폴백.

### 6-4. i18n (`libs/i18n/locales/{ko,en}/web/dashboard.json`)

`newbie.missionManage.table` 객체에 다음 키 추가:

- ko: `"playtimeMicHint": "마이크 ON 시간"`
- en: `"playtimeMicHint": "Mic-on time"`

### 6-5. 영향 평가

- 기존 테이블 셀(`MissionRow`)의 `mission.currentPlaytimeSec / mission.targetPlaytimeSec` 표시는 백엔드가 이미 옵션을 반영해 반환하는 값이므로 셀 로직 변경 불요. PRD §"플레이타임 조회 쿼리 조건"에 의해 응답값 자체가 분기됨.
- `__tests__/MissionManageTab.test.tsx`의 `renderTab` 헬퍼는 `Partial<React.ComponentProps<typeof MissionManageTab>>`를 받으므로 옵셔널 prop 추가는 자동 호환. 테스트 변경 불필요.

> **결정 가이드**: 본 단계는 PRD에 강하게 명시된 항목은 아니다(PRD가 봇 Embed 라벨 변경에 초점). 본 작업 PR에 묶을지 별도 PR로 분리할지는 코드 리뷰 부담을 보고 판단. 권장: 동일 PR에 포함하여 일관된 라벨 표시.

---

## 작업 순서 (권장)

1. **타입 추가** (`newbie-api.ts`) — 다른 파일 컴파일 에러를 먼저 드러내기 위해 가장 먼저 수정.
2. **DEFAULT_CONFIG 보강** (`page.tsx`).
3. **테스트 픽스처 픽스** (`MocoTab.test.tsx`) — 컴파일 통과시키기.
4. **i18n 키 추가** (ko/en settings.json) — UI 작업 직전에 키 확보.
5. **MissionTab.tsx UI 추가** (체크박스 + 경고 + 요약 배지).
6. **(선택) 대시보드 라벨 보강** — `MissionManageTab` props + 호출부 + dashboard.json.
7. `pnpm --filter @nexus/web typecheck`, `pnpm --filter @nexus/web test` 통과 확인.

---

## 영향 영역 요약

| 영역 | 변경 |
|------|------|
| `apps/web/app/lib/newbie-api.ts` | `NewbieConfig`에 `missionUseMicTime: boolean` 1줄 추가 |
| `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` | `DEFAULT_CONFIG`에 `missionUseMicTime: false` 1줄 추가 |
| `apps/web/app/settings/guild/[guildId]/newbie/components/MissionTab.tsx` | 체크박스 + 경고 + 요약 배지 (약 50줄) 추가, `useRef` import |
| `apps/web/app/settings/guild/[guildId]/newbie/__tests__/MocoTab.test.tsx` | 픽스처에 1줄 추가 |
| `libs/i18n/locales/ko/web/settings.json` | 4개 키 추가(`useMicTime`, `useMicTimeDesc`, `useMicTimeWarning`, `useMicTimeBadge`) |
| `libs/i18n/locales/en/web/settings.json` | 동일 4개 키 추가 |
| `apps/web/app/dashboard/guild/[guildId]/newbie/page.tsx` (선택) | `MissionManageTab` 호출에 prop 1개 전달 |
| `apps/web/app/dashboard/guild/[guildId]/newbie/components/MissionManageTab.tsx` (선택) | props 확장 + 헤더 small text 분기 |
| `libs/i18n/locales/{ko,en}/web/dashboard.json` (선택) | `playtimeMicHint` 1개 키 추가 |

| 영역 | 영향 없음 |
|------|----------|
| MocoTab / MocoRankingTab / MocoTemplateSection / MocoRankingTable / MocoTopCards / MocoHunterDetail | — |
| RoleTab / WelcomeTab / 신입역할 자동관리 | — |
| `MissionEmbedPreview` / `MissionTemplateSection` (템플릿은 기존 변수만 사용) | — |
| Bot 측 코드(apps/api) | 별도 백엔드 PR 범위 |

---

## 코드 컨벤션 점검

- **Boolean 변수명**: `isEnabled`, `isChanged`, `missionUseMicTime` — `is` 접두사 또는 의미 명확한 도메인 용어. ✅
- **이벤트 핸들러명**: `handleToggle` — `handle` + 대상. ✅
- **함수 길이**: `MissionUseMicTimeField` 약 35줄, `MissionTab` 본체 변경 후에도 50줄 미만 유지(이미 `CollapsibleSection`으로 그룹 분리됨). ✅
- **파라미터 수**: 객체 props 패턴이므로 모두 1개. ✅
- **`as` 단언**: 사용하지 않음. ✅
- **JSDoc**: 공용 hook/유틸 추가 없음(파일 내 함수형 컴포넌트만). 필요 시 `NewbieConfig.missionUseMicTime`에 1줄 JSDoc.
- **Tailwind 클래스**: 기존 페이지 패턴(`text-xs text-gray-400`, `bg-amber-50 border border-amber-200`)과 일치.
- **`type import` 분리**: ESLint가 자동 강제. `import type { ... }` 형태로 선언.

---

## PRD 매핑 체크리스트

- [x] "목표 플레이타임 입력" 바로 아래 배치 — §3-1
- [x] 라벨 `목표 시간 측정 시 마이크 사용 시간만 반영` — §4 i18n `useMicTime`
- [x] 도움말 `체크하면 채널 접속 시간이 아닌 마이크 ON 시간만 누적됩니다` — §4 i18n `useMicTimeDesc`
- [x] 옵션 변경 시 경고 문구 — §3-2 `isChanged` 분기 + i18n `useMicTimeWarning`
- [x] 체크 ON → `missionUseMicTime = true`, OFF → `false` — §3-2 `handleToggle`
- [x] 저장 시 페이로드 포함 — §1-2 (자동)
- [x] 모코코/신입역할 페이지 영향 없음 — 작업 범위 외 명시
- [x] 미션 현황 라벨에 "마이크 ON 시간" 표시(옵션 활성 시) — §6 (선택)
