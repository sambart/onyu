# 웹 UX 일관성 인프라 (공용 토스트 / 기간선택 / 스켈레톤 / 포맷 통일) 구현 계획

> 작성일: 2026-07-02
> 대상 앱: `apps/web` (Next.js 16 App Router + React 19 + Tailwind 3, base-ui + cva 디자인 토큰)
> 상위 배경: 사용자 관점 UX 검토에서 확정된 4건의 일관성 개선안
> 병렬 계획(경계 주의): `docs/plans/web-ux-save-consistency.md` — **저장 UX 로직(반영 배지 확산 / 미저장 경고 / newbie 저장 통합)은 그쪽 소유**. 본 계획은 토스트/기간선택/스켈레톤/포맷 등 **인프라 제공자** 역할만 한다.

---

## 1. 배경 / 목표

현재 `apps/web` 은 사용자 피드백·기간선택·로딩·날짜숫자 포맷이 페이지마다 제각각 구현돼 있어 UX 일관성과 유지보수성이 떨어진다. 코드 조사로 확인된 현황:

| 영역 | 현황 (혼재) |
|------|-------------|
| **피드백** | 인라인 초록 텍스트(`settings/me/privacy/page.tsx:231` savedToast) / `alert()`(auto-channel `page.tsx:194,198`, role-panel `page.tsx:166`) / 무피드백(admin/admins 뮤테이션 — 성공 시 토스트 없음, `AdminsPage` 주석엔 "토스트를 봤음" 전제만 있고 실제 없음) / 3초 후 사라지는 인라인 텍스트(inactive-member `classifyResult`·`actionResult`, `RESULT_CLEAR_DELAY_MS=3000`) |
| **기간선택** | 5개 site, 3가지 UI 형태 (§3.2) |
| **로딩** | `loading.tsx` 전 앱 0개. `{t('common.loading')}` 텍스트 / `"..."`(co-presence dynamic import) / 부분 스켈레톤(diagnosis `HealthScoreGauge` `animate-pulse`) 혼재 |
| **날짜/숫자** | `app/lib/format-utils.ts`·`relative-time.ts` 존재하나, 일부 컴포넌트가 `toLocaleDateString()`/`toLocaleString()` 직접 호출 (§5 전수) |

### 목표

1. **공용 토스트 시스템** — Provider(root layout) + `toast.success/error` API + `aria-live` 접근성. 1차 적용 지점(§2.4)에 연결.
2. **공용 `PeriodSelector`** — UI 형태 1개 표준화 + 페이지별 선택지 집합을 prop 으로. 5개 site 통합.
3. **공용 `Skeleton`** — `components/ui/skeleton.tsx` 추가 + 주요 라우트 로딩 표준화.
4. **날짜/숫자 포맷 통일** — `format-utils.ts` 에 로케일 인지 함수 추가 + 직접 호출부 치환.

### 비목표(요약 — 상세 §9)

- API/DB 변경 없음. 설정 페이지 **저장 핸들러 로직** 변경 없음(save-consistency 소유). 다크모드 토큰 신설 없음.

---

## 2. 컴포넌트 설계 — 공용 토스트

### 2.1. 구현 방식 권고 — **자체 구현 (권장)**

| 후보 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **자체 구현** (Context + Portal + `aria-live`) | 새 의존성 0, 번들 증가 없음, base-ui+cva 토큰과 스타일 완전 일치, i18n(next-intl) 통합 용이, 프로젝트 "새 의존성 최소화" 원칙 부합 | 애니메이션/스택/스와이프 제스처를 직접 구현 (단, 1차 요구는 단순 stack + 자동 dismiss 로 충분) | **채택** |
| 외부(`sonner`) | 검증된 UX·접근성 기본 제공, 코드량 최소 | 새 의존성 추가, `next-themes` 연동 관례(미사용 스택), 스타일을 프로젝트 토큰에 맞추려면 어차피 override 필요 | 미채택 |

> **권고 근거**: 1차 요구 범위(성공/실패 2종 + 자동 dismiss + aria-live)는 자체 구현으로 100~150줄 내 충분. 프로젝트 `components/ui/*` 는 이미 base-ui+cva 자체 컴포넌트 체계이며 새 런타임 의존성 도입 원칙에 어긋난다. sonner 도입 시에도 토큰 매칭 override 가 필요해 순이득이 작다.

### 2.2. 파일 구성 (신규)

```
apps/web/components/ui/
├── toast.tsx            # ToastProvider + useToast() + Toast/ToastViewport (cva variants: success | error | info)
apps/web/app/lib/
└── (toast는 ui 레이어에 위치 — 기존 select.tsx/badge.tsx 와 동일한 components/ui 컨벤션 준수)
```

### 2.3. API 시그니처 (수준)

```typescript
// components/ui/toast.tsx
type ToastVariant = 'success' | 'error' | 'info';
interface ToastOptions { durationMs?: number; }       // 기본 4000ms, error 는 6000ms
interface ToastApi {
  success(message: string, opts?: ToastOptions): void;
  error(message: string, opts?: ToastOptions): void;
  info(message: string, opts?: ToastOptions): void;
}
function useToast(): ToastApi;                          // Provider 하위 client 컴포넌트에서 호출
function ToastProvider(props: { children: React.ReactNode }): JSX.Element;
```

- **상태 관리**: Provider 내부 `useState<ToastItem[]>` + `useCallback` push/remove. id 는 `crypto.randomUUID()`.
- **자동 dismiss**: 각 토스트 mount 시 `setTimeout(remove, durationMs)` (컴포넌트 언마운트 시 clear).
- **렌더**: `createPortal` 로 `document.body` 에 `ToastViewport`(고정 우하단 `fixed bottom-4 right-4 z-[100] flex flex-col gap-2`).
- **접근성**: viewport `role="region" aria-live="polite"`, error variant 는 `aria-live="assertive"`. 각 토스트에 닫기 버튼(`aria-label`).
- **스타일(cva)**: badge/button 과 동일 토큰. success=`bg-green-50 text-green-800 border-green-200`, error=`bg-red-50 text-red-700 border-red-200`, info=`bg-indigo-50 text-indigo-700 border-indigo-200`(페이지 indigo 계열 조화). lucide 아이콘(CheckCircle/AlertCircle/Info) 선두.

### 2.4. Provider 위치

`apps/web/app/layout.tsx` — `NextIntlClientProvider` **하위**, `SidebarProvider` 를 감싸도록 배치(토스트 메시지에 i18n 필요, 전 페이지 접근 필요).

```
<NextIntlClientProvider>
  <ToastProvider>            {/* 신규 */}
    <SidebarProvider> … </SidebarProvider>
  </ToastProvider>
</NextIntlClientProvider>
```

> `ToastProvider` 는 client 컴포넌트(`'use client'`)여야 하므로 별도 파일에서 import (layout 은 server 컴포넌트 유지).

### 2.5. 1차 적용 지점 (본 계획 소유 범위)

| # | 위치 | 현재 | 변경 | 소유 |
|---|------|------|------|------|
| T-1 | `app/admin/admins/page.tsx` `handleAddAdmin`/`handleChangeRole`/`handleDeactivate` | 성공 피드백 **전무**, 실패만 `actionError` 인라인 | 성공 시 `toast.success`(추가/역할변경/비활성화 각각), 실패 시 `toast.error(resolveApiError())` (인라인 `actionError` 는 유지 or 토스트로 대체 — 1차는 토스트 추가) | **본 계획** |
| T-2 | `app/dashboard/guild/[guildId]/inactive-member/page.tsx` `handleClassify`/`handleAction` | `classifyResult`/`actionResult` 인라인 텍스트 + `setTimeout 3s` | 토스트로 대체. `RESULT_CLEAR_DELAY_MS`/관련 state 제거 가능 | **본 계획** |
| T-3 | `app/settings/guild/[guildId]/auto-channel/page.tsx:194,198` | `alert(t('common.deleteError'))` / `alert(t('common.deleteNetworkError'))` | `toast.error(...)` 로 대체 | **본 계획** (삭제 에러 — 저장 로직 아님) |
| T-4 | `app/settings/guild/[guildId]/role-panel/page.tsx:166` | `alert(t('common.deleteNetworkError'))` | `toast.error(...)` 로 대체 | **본 계획** (삭제 에러) |
| T-5 | **설정 저장 성공/실패 전체** (privacy `savedToast` 등) | 인라인 | 토스트 연결 — 단 **wiring 은 save-consistency 계획 소유**. 본 계획은 `useToast` 인프라만 제공하고, `page.tsx` 저장 핸들러는 **수정하지 않는다** | save-consistency |

> **경계 명시**: T-5 는 인프라만 제공. 본 계획의 "수정 파일 목록"(§7)에 설정 페이지 **저장 로직 변경**을 포함하지 않는다. T-3/T-4 는 **삭제 에러 alert 대체**로 저장 로직과 무관하므로 본 계획 소유.

---

## 3. 컴포넌트 설계 — 공용 PeriodSelector

### 3.1. 현황 (조사 결과 — 5개 site)

| # | 위치 | UI 형태 | 선택지 | 값 타입 | i18n 키 |
|---|------|---------|--------|---------|---------|
| P-1 | `dashboard/.../voice/page.tsx:172` | `Select` 드롭다운 | 7/14/30/60/90 | `'7d'|'14d'|'30d'|'60d'|'90d'` | `voice.period.Xd` |
| P-2 | `dashboard/.../voice/components/UserDetailView.tsx:210` | `Button` outline/default | 7/14/30/60/90 | 동일 `'7d'..'90d'` | `voice.period.Xd` |
| P-3 | `dashboard/.../diagnosis/page.tsx:170` | `Select` 드롭다운 | 7/14/30/90 | `7|14|30|90` (숫자) | `diagnosis.period.Xd` |
| P-4 | `dashboard/.../co-presence/page.tsx:136` | 알약 버튼(`bg-muted`) | 7/30/90 | `7|30|90` (숫자) | `coPresence.dayUnit` |
| P-5 | `my/voice/components/PeriodSelector.tsx` | 알약 버튼(`bg-gray-100`) | 7/15/30 | `MeVoicePeriod` | `me.period.Xd` |

> **선택지 집합은 유지**: 각 페이지 선택지(7/14/30/60/90 등)는 대응 API 가 이미 지원하는 범위(voice 는 `from~to` 임의 범위, diagnosis/co-presence/me 는 days 파라미터)라 **API 지원 범위 내에서 그대로 유지**한다. 통합은 **UI 형태만 표준화**하고 선택지는 prop 으로 주입한다.

### 3.2. 표준 UI 형태 결정 — **알약 버튼(segmented)**

- 알약 버튼(P-4/P-5 형태)을 표준으로 채택. 이유: 옵션 수(3~5개)가 적고 즉시 전환이 잦은 대시보드 UX 에 드롭다운보다 적합, 이미 2곳이 이 형태.
- 색: 선택 시 `bg-white text-indigo-600 shadow-sm`(라이트 컨테이너 `bg-gray-100`) — P-5 스타일을 기준으로 통일(페이지 indigo 계열 조화). co-presence 의 `bg-muted/bg-background` 토큰 버전도 허용하되 1차는 gray/indigo 로 통일.

### 3.3. API 시그니처

```typescript
// components/ui/period-selector.tsx  (제네릭)
interface PeriodOption<T> { value: T; label: string; }   // label 은 호출부에서 i18n 처리해 주입
interface PeriodSelectorProps<T extends string | number> {
  options: PeriodOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';                                     // 기본 'sm'
  ariaLabel?: string;                                     // 접근성: 그룹 레이블
}
function PeriodSelector<T extends string | number>(props: PeriodSelectorProps<T>): JSX.Element;
```

- `role="group"` + 각 버튼 `aria-pressed`.
- 값 타입 제네릭 — voice(문자열 `'7d'`), diagnosis/co-presence/me(숫자) 모두 수용.
- **label 은 호출부가 `useTranslations` 로 생성해 `options` 에 주입** (컴포넌트는 i18n 비의존 — 재사용성↑).

### 3.4. 적용 대상 (4곳 + 기존 1곳 정리)

- **필수 치환 4곳**: P-1(voice Select→PeriodSelector), P-2(voice UserDetailView), P-3(diagnosis Select→PeriodSelector), P-4(co-presence 인라인 알약→컴포넌트).
- **P-5(my/voice)**: 이미 전용 `PeriodSelector.tsx` 존재. 공용 컴포넌트로 **대체 후 기존 파일 제거**(중복 제거). 단 my/voice 는 save-consistency 와 무관하므로 본 계획 소유 OK.

> P-1/P-3 은 드롭다운(`Select`)에서 알약으로 UI 가 바뀐다. 시각 변화가 있으므로 §8 스냅샷/기존 테스트 확인 필요(voice/diagnosis 페이지 테스트가 period 옵션 텍스트를 assert 하는지 점검).

---

## 4. 컴포넌트 설계 — 공용 Skeleton

### 4.1. 파일 (신규)

```
apps/web/components/ui/skeleton.tsx
```

기존 `HealthScoreGauge`(diagnosis)의 `animate-pulse bg-gray-100 rounded` 패턴을 표준화. **기존 부분 스켈레톤은 이 컴포넌트로 점진 치환 가능**하나 1차 범위는 주요 라우트 loading 표준화에 집중.

### 4.2. API 시그니처

```typescript
// components/ui/skeleton.tsx
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;    // 크기/형태는 className 으로 (Tailwind)
}
function Skeleton({ className, ...props }: SkeletonProps): JSX.Element;
// 렌더: <div className={cn('animate-pulse rounded-md bg-gray-100', className)} aria-hidden {...props} />
```

- 접근성: `aria-hidden`(순수 시각적 placeholder). 컨테이너에 `role="status" aria-label` 은 loading.tsx 쪽에서 부여.
- 조합용 프리셋(선택): `SkeletonCard`, `SkeletonTable` 을 같은 파일 내 export (카드/테이블 반복 형태 재사용).

### 4.3. 도입 대상 라우트 (loading.tsx)

Next App Router `loading.tsx` 는 세그먼트 전환/RSC suspense 시 표시된다. 대상 페이지는 `'use client'` + useEffect fetch 라 초기 로딩은 페이지 내부 state 가 담당하지만, **라우트 진입/재검증 시 loading.tsx 가 스켈레톤을 보여줘** 첫 페인트 UX 를 개선한다. 병행하여 페이지 내 `{t('common.loading')}` 블록도 Skeleton 으로 치환.

| # | loading.tsx 경로 (신규) | 스켈레톤 형태 |
|---|--------------------------|---------------|
| S-1 | `dashboard/guild/[guildId]/overview/loading.tsx` | 카드 그리드 |
| S-2 | `dashboard/guild/[guildId]/voice/loading.tsx` | 헤더+요약카드+차트+테이블 |
| S-3 | `dashboard/guild/[guildId]/diagnosis/loading.tsx` | 게이지+차트+테이블 |
| S-4 | `dashboard/guild/[guildId]/inactive-member/loading.tsx` | 통계카드+차트+테이블 |
| S-5 | `dashboard/guild/[guildId]/co-presence/loading.tsx` | 요약카드+그래프 |
| S-6 | `dashboard/guild/[guildId]/newbie/loading.tsx` | 카드+테이블 |
| S-7 | `settings/guild/[guildId]/loading.tsx` (설정 공용) | 폼 스켈레톤 (설정 하위 라우트 공용) |
| S-8 | `admin/loading.tsx` + `admin/admins/loading.tsx` | 테이블 스켈레톤 |

> **설정 페이지 주의**: loading.tsx 는 라우트 로딩 UI 일 뿐 저장 로직과 무관 → save-consistency 와 충돌 없음. 단 설정 하위는 라우트가 많으므로 1차는 `settings/guild/[guildId]/loading.tsx` 1개(공용) + `admin` 만 도입하고, 개별 설정 페이지 세분화는 후속.

### 4.4. 기존 스켈레톤 재활용

- diagnosis `HealthScoreGauge`(`animate-pulse bg-gray-100`), `LeaderboardTable`(isLoading), `AiInsightPanel` 은 이미 자체 스켈레톤 보유 → **강제 치환하지 않음**(리스크 대비 이득 작음). 신규 `Skeleton` 은 새 loading.tsx 와 `{t('common.loading')}` 텍스트 블록 치환에 우선 사용. 기존 인라인 `animate-pulse` 의 `Skeleton` 치환은 선택적(동일 클래스라 무해).

---

## 5. 날짜/숫자 포맷 통일

### 5.1. 현황 조사 (grep 전수 — `toLocaleDateString`/`toLocaleString`/`toLocaleTimeString`/`Intl`)

전수 grep 결과 **13회 / 9파일**. 이 중 테스트(3파일) + 의도적 로케일 함수(1) 제외 시 **치환 대상 소스 6개 site**.

> 참고: 요구서의 "14파일 41회" 는 초기 추정이며, 현재 코드 기준 실측은 아래 표가 정확하다(수기 date 조립 `formatYmd` 등은 API 파라미터용이라 표시 포맷 아님 → 제외).

| # | 파일:라인 | 현재 코드 | 치환 | 판정 |
|---|-----------|-----------|------|------|
| F-1 | `app/admin/admins/components/AdminTable.tsx:14` | `new Date(createdAt).toLocaleDateString()` | `formatDate(createdAt, locale)` | 치환 |
| F-2 | `app/admin/components/GuildTable.tsx:18` | `new Date(joinedAt).toLocaleDateString()` | `formatDate(joinedAt, locale)` | 치환 |
| F-3 | `app/admin/components/GuildTable.tsx:60` | `guild.memberCount.toLocaleString()` | `formatNumber(memberCount, locale)` | 치환 |
| F-4 | `app/dashboard/guild/[guildId]/voice/components/UserHistoryTable.tsx:64` | `new Date(item.joinAt).toLocaleString("ko-KR")` | `formatDateTime(item.joinAt, locale)` | 치환 (하드코딩 `"ko-KR"` 제거 — en 로케일 대응) |
| F-5 | `app/dashboard/guild/[guildId]/voice/components/UserHistoryTable.tsx:70` | `new Date(item.leftAt).toLocaleString("ko-KR")` | `formatDateTime(item.leftAt, locale)` | 치환 |
| F-6 | `app/dashboard/guild/[guildId]/newbie/components/MocoTopCards.tsx:82` | `item.score.toLocaleString()` | `formatNumber(item.score, locale)` | 치환 |
| F-7 | `app/dashboard/guild/[guildId]/newbie/components/MocoRankingTable.tsx:115` | `item.score.toLocaleString()` (t 파라미터 내부) | `formatNumber(item.score, locale)` | 치환 |
| — | `app/lib/relative-time.ts:45` | `date.toLocaleDateString(locale, {...})` | — | **유지** (이미 로케일 인지, 의도적) |
| — | `components/ui/chart.tsx:230` | `item.value.toLocaleString()` | — | **유지** (vendored ui 차트 내부 tooltip — 로케일 영향 미미, 변경 리스크) |
| — | `app/admin/__tests__/GuildTable.test.tsx`, `lib/__tests__/relative-time.test.ts` | 테스트 assert | — | 테스트 (§8 에서 치환 후 갱신) |

> 추가 확인: `CoPresenceSummaryCards.tsx:38` 의 `toFixed(1)` 은 소수 1자리 고정 표시(로케일 무관 도메인 값)라 **치환 대상 아님**.

### 5.2. `format-utils.ts` 추가 함수 (신규 export)

```typescript
// app/lib/format-utils.ts 에 추가 — next-intl useLocale() 로 얻은 locale 을 인자로 받음
/** 날짜 → 로케일 인지 짧은 날짜 (ko: 2026. 7. 2. / en: Jul 2, 2026) */
export function formatDate(input: string | Date, locale: string): string;
/** 날짜+시각 → 로케일 인지 (ko: 2026. 7. 2. 오후 3:04 / en: Jul 2, 2026, 3:04 PM) */
export function formatDateTime(input: string | Date, locale: string): string;
/** 숫자 → 로케일 천단위 구분 (ko/en 공통 1,234) */
export function formatNumber(value: number, locale: string): string;
```

- 내부는 `Intl.DateTimeFormat(locale, {...})` / `Intl.NumberFormat(locale)`. 잘못된 날짜 방어(`Number.isNaN(date.getTime())` → `'—'`), 기존 `formatJoinedAt`/`formatCreatedAt` 의 try/catch fallback 로직을 함수 내부로 흡수.
- **로케일 획득**: 호출부(client 컴포넌트)에서 `useLocale()`(next-intl) → 인자 전달. 기존 `relative-time.ts` 와 동일 패턴(로케일 파라미터).
- 기존 `formatShortDate`(MM/DD, 로케일 독립)는 차트 축 등 다른 용도라 **유지**.

---

## 6. i18n 키 목록 (ko/en 동시 갱신 — `libs/i18n/locales/{ko,en}/web/common.json`)

토스트 문구는 대부분 **기존 키 재사용**(admin 뮤테이션은 `admin.json`, 삭제 에러는 `common.deleteError` 등). 신규 키는 최소화.

### 6.1. `common.json` 신규 키 (toast 공통 라벨)

| 키 | ko | en |
|----|----|----|
| `toast.dismiss` | 닫기 | Dismiss |
| `toast.success` | 완료되었습니다 | Done |
| `toast.error` | 오류가 발생했습니다 | Something went wrong |

### 6.2. `admin.json` 신규 키 (admin 뮤테이션 성공 토스트 — T-1)

| 키 | ko | en |
|----|----|----|
| `admins.toast.added` | 관리자가 추가되었습니다 | Admin added |
| `admins.toast.roleChanged` | 역할이 변경되었습니다 | Role updated |
| `admins.toast.deactivated` | 관리자가 비활성화되었습니다 | Admin deactivated |

### 6.3. `dashboard.json` — inactive-member 토스트 (T-2)

기존 `inactive.classifyDone`(분류 완료) 재사용. 조치 결과는 기존 `actionResult` 문구 구조를 토스트 메시지로 이관(성공/실패 카운트) — 필요 시 `inactive.actionDone` 신규:

| 키 | ko | en |
|----|----|----|
| `inactive.actionDone` | 조치 완료 (성공 {success}건, 실패 {fail}건) | Done ({success} succeeded, {fail} failed) |

### 6.4. 기간선택 — 신규 키 불요

P-1~P-5 모두 **기존 키 재사용**(`voice.period.Xd`, `diagnosis.period.Xd`, `coPresence.dayUnit`, `me.period.Xd`). PeriodSelector 는 label 을 호출부에서 주입하므로 컴포넌트 자체 신규 키 없음.

### 6.5. 스켈레톤 — 신규 키 (선택)

loading.tsx 컨테이너 `aria-label` 용:

| 키 | ko | en |
|----|----|----|
| `common.loadingAria` | 콘텐츠를 불러오는 중입니다 | Loading content |

> **원칙**: 모든 신규 키는 ko/en **동시** 추가. `common.json`/`admin.json`/`dashboard.json` 세 파일 × 2 로케일.

---

## 7. 변경 파일 목록

### 7.1. 신규 파일

| # | 경로 | 역할 |
|---|------|------|
| N-1 | `apps/web/components/ui/toast.tsx` | ToastProvider + useToast + Toast(cva) |
| N-2 | `apps/web/components/ui/period-selector.tsx` | 제네릭 PeriodSelector |
| N-3 | `apps/web/components/ui/skeleton.tsx` | Skeleton + 프리셋 |
| N-4~N-11 | §4.3 표의 `loading.tsx` 8종 (overview/voice/diagnosis/inactive-member/co-presence/newbie/settings공용/admin×2) | 라우트 스켈레톤 |
| N-12 | `apps/web/components/ui/__tests__/toast.test.tsx` | 토스트 테스트 |
| N-13 | `apps/web/components/ui/__tests__/period-selector.test.tsx` | 기간선택 테스트 |
| N-14 | `apps/web/app/lib/__tests__/format-utils.test.ts` (기존 없으면 신규) | 포맷 함수 테스트 |

### 7.2. 수정 파일

| # | 경로 | 변경 내용 | 소유 주의 |
|---|------|-----------|-----------|
| M-1 | `apps/web/app/layout.tsx` | ToastProvider 삽입 (§2.4) | — |
| M-2 | `apps/web/app/admin/admins/page.tsx` | 뮤테이션 3종 성공/실패 토스트 연결 (T-1) | — |
| M-3 | `apps/web/app/dashboard/guild/[guildId]/inactive-member/page.tsx` | classify/action 결과 토스트화, 관련 인라인 state/`setTimeout` 정리 (T-2) | — |
| M-4 | `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx` | `alert()` 2곳 → `toast.error` (T-3, **삭제 에러만** — 저장 로직 무변경) | 저장 로직 건드리지 않음 |
| M-5 | `apps/web/app/settings/guild/[guildId]/role-panel/page.tsx` | `alert()` 1곳 → `toast.error` (T-4, 삭제 에러) | 저장 로직 건드리지 않음 |
| M-6 | `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` | Select period → PeriodSelector (P-1) | — |
| M-7 | `apps/web/app/dashboard/guild/[guildId]/voice/components/UserDetailView.tsx` | Button period → PeriodSelector (P-2) | — |
| M-8 | `apps/web/app/dashboard/guild/[guildId]/diagnosis/page.tsx` | Select period → PeriodSelector (P-3) | — |
| M-9 | `apps/web/app/dashboard/guild/[guildId]/co-presence/page.tsx` | 인라인 알약 → PeriodSelector (P-4) | — |
| M-10 | `apps/web/app/my/voice/page.tsx` | 전용 PeriodSelector import → 공용 PeriodSelector (P-5) | — |
| M-11 | `apps/web/app/my/voice/components/PeriodSelector.tsx` | **삭제** (공용으로 대체) | — |
| M-12 | `apps/web/app/lib/format-utils.ts` | `formatDate`/`formatDateTime`/`formatNumber` 추가 (§5.2) | — |
| M-13 | `apps/web/app/admin/admins/components/AdminTable.tsx` | F-1 치환 (useLocale) | — |
| M-14 | `apps/web/app/admin/components/GuildTable.tsx` | F-2, F-3 치환 | — |
| M-15 | `apps/web/app/dashboard/guild/[guildId]/voice/components/UserHistoryTable.tsx` | F-4, F-5 치환 (`"ko-KR"` 하드코딩 제거) | — |
| M-16 | `apps/web/app/dashboard/guild/[guildId]/newbie/components/MocoTopCards.tsx` | F-6 치환 | — |
| M-17 | `apps/web/app/dashboard/guild/[guildId]/newbie/components/MocoRankingTable.tsx` | F-7 치환 | — |
| M-18 | `libs/i18n/locales/ko/web/{common,admin,dashboard}.json` | §6 신규 키 (ko) | — |
| M-19 | `libs/i18n/locales/en/web/{common,admin,dashboard}.json` | §6 신규 키 (en) | — |
| M-20 | 기존 테스트 (`GuildTable.test.tsx`, `relative-time.test.ts`, voice/diagnosis 페이지 테스트) | 포맷 치환/UI 변경 반영 갱신 | §8 |

> **저장 UX 무침범 확인**: 설정 페이지 `page.tsx` 중 **저장 핸들러** 를 수정하는 항목 없음. M-4/M-5 는 **삭제** 에러 alert 대체만. privacy 저장 토스트(T-5)는 인프라(useToast)만 제공, wiring 은 save-consistency.

---

## 8. 구현 단계 (Phase)

| Phase | 내용 | 산출물 |
|-------|------|--------|
| **P1. 인프라 3종 신규** | toast.tsx / period-selector.tsx / skeleton.tsx + format-utils 함수 추가 + i18n 키. layout ToastProvider 삽입 | N-1~N-3, M-1, M-12, M-18~19 + 단위 테스트 N-12~14 |
| **P2. 토스트 적용** | admin 뮤테이션(T-1) → inactive-member(T-2) → alert 대체(T-3/T-4) | M-2~M-5 |
| **P3. 기간선택 통합** | voice/diagnosis/co-presence/UserDetailView 치환 + my/voice 공용화·기존 컴포넌트 삭제 | M-6~M-11 |
| **P4. 포맷 치환** | F-1~F-7 치환 + 로케일 주입 | M-13~M-17 |
| **P5. 스켈레톤 라우트** | loading.tsx 8종 + 페이지 내 `common.loading` 블록 일부 치환 | N-4~N-11 |
| **P6. 테스트 갱신 + 검증** | 기존 테스트 반영 + typecheck/lint/build | M-20, §10 |

권장 순서: P1 선행 필수(나머지가 P1 산출물 의존). P2~P5 는 상호 독립이라 병렬 가능하나, 동일 파일 충돌 회피 위해 파일 단위로 분리.

> **save-consistency 계획과의 파일 충돌 회피**: 설정 페이지 `page.tsx`(privacy/newbie 등 저장 로직)는 본 계획이 **수정하지 않음**. 겹치는 파일은 auto-channel/role-panel `page.tsx`(본 계획은 삭제 에러 alert 만) — save-consistency 가 같은 파일의 저장 로직을 만지면 머지 시 라인 분리되므로 충돌 최소. 착수 전 두 계획의 파일 목록 대조 권장.

---

## 9. 명시적 비대상 (Out-of-Scope)

| 항목 | 사유 |
|------|------|
| 설정 페이지 **저장 핸들러 로직** 변경 (반영 배지/미저장 경고/newbie 저장 통합) | `web-ux-save-consistency.md` 소유 |
| 설정 **저장 성공/실패 토스트 wiring** | 인프라(useToast)만 제공, 연결은 save-consistency |
| API/DB/봇 변경 | 대상 `apps/web` 한정 |
| 다크모드 토큰 신설 / 디자인 토큰 파괴적 변경 | 기존 토큰 활용만 |
| 토스트 스와이프 제스처/스택 애니메이션 고도화 | 1차는 자동 dismiss + 단순 stack |
| `components/ui/chart.tsx`·`relative-time.ts` 의 로케일 포맷 | 의도적/vendored — 유지 |
| diagnosis 기존 부분 스켈레톤 강제 치환 | 동일 패턴이라 이득 작음, 선택적 |
| 개별 설정 하위 라우트 loading.tsx 세분화 | 1차는 공용 1개 + admin. 후속 |

---

## 10. 검증 (onyu 함정 반영)

- **typecheck (별도 실행 필수)**: `npx tsc --noEmit -p apps/web/tsconfig.json` — `pnpm --filter @onyu/web build` 와 별개로 실행.
- `pnpm --filter @onyu/web lint` (eslint — 함수 50줄/파라미터 3개/no-magic-numbers/boolean 접두사 등 §Code Style).
- `pnpm --filter @onyu/web test` (Jest + Testing Library).
- **i18n 동시성 확인**: ko/en 키 개수·구조 일치(누락 시 런타임 fallback). 세 파일(common/admin/dashboard) × 2 로케일.
- 수동: 각 토스트 트리거(admin 추가/역할변경/비활성, inactive 조치, auto-channel/role-panel 삭제 에러) 시각 확인 / 기간선택 4곳 전환 / 로딩 진입 스켈레톤.

### 테스트 계획 (기존 `__tests__` 패턴 참조)

기존 패턴: 컴포넌트 옆 `__tests__/*.test.tsx`, `useTranslations` 는 키 문자열 그대로 반환하는 방식(`PrivacyPage.test.tsx` 가 `'privacy.savedToast'` 텍스트 assert). next-intl mock 관례 답습.

| 대상 | 테스트 |
|------|--------|
| `toast.tsx` | `useToast().success/error` 호출 시 메시지 렌더 + `role/aria-live` 존재 + durationMs 후 제거(fake timers) + 닫기 버튼 |
| `period-selector.tsx` | options 렌더 + 선택 클릭 시 onChange(value) + `aria-pressed` 반영 + 제네릭 숫자/문자 값 |
| `format-utils.ts` | `formatDate`/`formatDateTime`/`formatNumber` ko/en 출력 + 잘못된 입력 `'—'` fallback (환경 무관 검증 — 기존 `relative-time.test.ts` 의 "숫자 포함" 방식 참조) |
| 갱신 | `GuildTable.test.tsx`(formatDate 반영), voice/diagnosis 페이지 테스트(period UI 변경), inactive/admin 페이지(토스트 렌더) |

> **주의**: F-3~F-7 치환으로 `toLocaleString()` 하드 assert 하던 테스트가 있으면 갱신. `GuildTable.test.tsx:93,99` 는 "환경 무관 포함 여부" 방식이라 formatNumber/formatDate 로 바뀌어도 대체로 통과하나 재확인.

---

## 11. manifest 갱신 필요

**변경 종류**: (d) 변경 없음.

**manifest 갱신 필요 — 없음.**

근거:
- 신규 도메인 없음. 본 작업은 `web` 도메인(및 여러 대시보드 도메인)에 걸친 **cross-cutting UI 인프라**로, 모두 `status: implemented` 인 기존 도메인 내 수정·추가다.
- 신규 파일(`components/ui/toast.tsx`·`period-selector.tsx`·`skeleton.tsx`, 각 `loading.tsx`)은 **기존 `apps/web` 트리 하위**에 위치하며 새 `code.*` 키를 요구하지 않는다. `web` 도메인 `code.web` 은 `apps/web/app/` 로 매핑돼 있고, `components/ui/` 는 도메인 비종속 공유 디자인시스템(매니페스트에 별도 등재된 적 없는 기존 관행) — 본 계획이 이 관행을 바꾸지 않는다.
- status 변경 없음(전 도메인 이미 `implemented`).

> 참고: 여러 도메인(voice/diagnosis/co-presence/inactive-member/admin/newbie/web)의 web 코드를 수정하지만, 각 도메인 `code.web` 경로는 이미 실재·정확하므로 갱신 대상이 아니다.
