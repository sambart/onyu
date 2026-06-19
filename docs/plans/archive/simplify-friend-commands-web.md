# 친밀도/베프 단순화 — apps/web 영역 구현 계획

> 도메인: voice-co-presence (Phase 5 단순화)
> 작업 영역: `apps/web` (프론트엔드) + `libs/i18n`
> 브랜치: `develop`에서 진행 (브랜치 전환·생성 금지)

## 배경

`/affinity` 슬래시 커맨드가 삭제되면서(F-COPRESENCE PRD `P-2`, `P-6`), 그 권한 토글을
담당하던 `GuildCoPresenceConfig`(`guild_co_presence_config` 테이블)의 유일한 용도가 사라졌다.
따라서 웹 대시보드의 **길드 Co-Presence 토글 설정 페이지**(`/settings/guild/[guildId]/co-presence`)와
이를 호출하던 API 클라이언트, 사이드바 메뉴, i18n 키를 제거한다.

opt-out(사생활) 설정 경로는 `/affinity`가 아니라 `/best-friend`·주간 리포트에 적용되며,
여전히 `/settings/me/privacy` 페이지로 변경 가능하므로 **그대로 유지**한다.

## 중요 — dashboard vs settings co-presence 구분

경로가 유사하여 혼동하기 쉬우므로 명확히 구분한다.

| 구분 | 경로 | 처리 | 근거 |
|------|------|------|------|
| **관계 분석 대시보드** | `apps/web/app/dashboard/guild/[guildId]/co-presence/` | **보존 (절대 삭제 금지)** | F-COPRESENCE-007~013. 그래프/TOP페어 시각화. `/best-friend` Link 버튼 타겟 |
| **길드 Co-Presence 토글 설정** | `apps/web/app/settings/guild/[guildId]/co-presence/` | **삭제** | `/affinity` 권한 토글 전용. 커맨드 삭제로 용도 소멸 |

또한 i18n 키도 두 갈래로 나뉘므로 주의:

- `common.json > sidebar.coPresence` ("관계 분석" / "Relationship Analysis") → **DashboardSidebar의 관계 분석 메뉴 라벨. 유지**
- `common.json > settings.coPresence` ("Co-Presence 설정" / "Co-Presence Settings") → **SettingsSidebar 토글 메뉴 라벨. 삭제**
- `dashboard.json`의 `coPresence.*`, `help.sections.coPresence.*` → 관계 분석 대시보드/도움말. **유지**
- `settings.json > coPresence` (토글 페이지 전용 키 묶음) → **삭제**

## 작업 항목

### 1. 길드 Co-Presence 토글 설정 페이지 삭제

| 파일 | 처리 |
|------|------|
| `apps/web/app/settings/guild/[guildId]/co-presence/page.tsx` | 삭제 |
| `apps/web/app/settings/guild/[guildId]/co-presence/__tests__/CoPresenceConfigPage.test.tsx` | 삭제 |
| `apps/web/app/settings/guild/[guildId]/co-presence/` 디렉터리 | 위 2개 삭제 후 빈 디렉터리 제거 |

> `dashboard/guild/[guildId]/co-presence/`는 **건드리지 않음**.

### 2. API 클라이언트 삭제

| 파일 | 처리 |
|------|------|
| `apps/web/app/lib/guild-co-presence-config-api.ts` | 삭제 |
| `apps/web/app/lib/__tests__/guild-co-presence-config-api.test.ts` | 삭제 |

`fetchGuildCoPresenceConfig` / `saveGuildCoPresenceConfig` / `GuildCoPresenceConfig` /
`GuildCoPresenceConfigSaveDto` 의 유일한 소비자는 삭제 대상 `page.tsx`뿐이므로 안전하게 제거.

### 3. 사이드바 메뉴 제거

**파일**: `apps/web/app/components/SettingsSidebar.tsx`

`memberManagement` 그룹에서 Co-Presence 메뉴 항목(현재 line 111~115)을 제거:

```tsx
{
  href: `/settings/guild/${selectedGuildId}/co-presence`,
  label: t('settings.coPresence'),
  icon: Heart,
},
```

부수 정리:
- `lucide-react` import에서 `Heart` 아이콘이 이 파일 내 다른 곳에서 쓰이지 않으면 import 제거
  (작업 시 잔존 사용처 재확인 — 미사용 import는 ESLint error).
- **`personal` 그룹 + `사생활 설정`(`/settings/me/privacy`) 메뉴는 유지** (opt-out 경로).

#### 사이드바 수정 전후 메뉴 구조 (회원 관리 그룹)

| 수정 전 | 수정 후 |
|---------|---------|
| 신입 관리 (`/newbie`) | 신입 관리 (`/newbie`) |
| 비활동 회원 (`/inactive-member`) | 비활동 회원 (`/inactive-member`) |
| 게임방 상태 설정 (`/status-prefix`) | 게임방 상태 설정 (`/status-prefix`) |
| 고정메세지 (`/sticky-message`) | 고정메세지 (`/sticky-message`) |
| **Co-Presence 설정 (`/co-presence`)** ← 제거 | — |

> `personal` 그룹의 `사생활 설정`(`/settings/me/privacy`)은 변경 없음.

### 4. 사이드바 테스트 정리 (입력 문서 미명시 — 누락 보완)

**파일**: `apps/web/app/components/__tests__/SettingsSidebar.test.tsx`

`describe('신규 Co-Presence 메뉴', ...)` 블록(현재 line 311~346, 테스트 3개)을 통째로 제거.
메뉴 항목을 지우면 아래 단언이 실패하므로 함께 삭제해야 lint/test가 통과한다.

- `회원 관리 그룹에 Co-Presence 항목이 포함된다`
- `Co-Presence 링크가 /settings/guild/:id/co-presence 경로를 가진다`
- `현재 경로가 /settings/guild/:id/co-presence이면 ... 활성 클래스가 적용된다`

> `describe('신규 개인 설정 그룹 + 사생활 메뉴', ...)` 블록은 **유지**.

### 5. i18n 키 정리

#### 5-1. `settings.json` (ko/en) — `coPresence` 섹션 통째 제거

`libs/i18n/locales/ko/web/settings.json`, `libs/i18n/locales/en/web/settings.json`의
`coPresence` 객체(아래 키 묶음)를 제거. **`privacy` 섹션은 유지.**

| 제거 키 (ko) | 제거 키 (en) |
|---|---|
| `coPresence.title` "Co-Presence 설정" | `coPresence.title` "Co-Presence Settings" |
| `coPresence.policySection` "/affinity 권한 정책" | `coPresence.policySection` "/affinity Permission Policy" |
| `coPresence.allowPublicAffinityQuery` | `coPresence.allowPublicAffinityQuery` |
| `coPresence.allowPublicAffinityQueryDesc` | `coPresence.allowPublicAffinityQueryDesc` |
| `coPresence.saveButton` | `coPresence.saveButton` |
| `coPresence.savedToast` | `coPresence.savedToast` |

#### 5-2. `common.json` (ko/en) — `settings.coPresence` 라벨만 제거

`libs/i18n/locales/ko/web/common.json`, `libs/i18n/locales/en/web/common.json`:

| 제거 키 | ko | en |
|---|---|---|
| `settings.coPresence` | "Co-Presence 설정" | "Co-Presence Settings" |

> **유지**: `sidebar.coPresence`("관계 분석" / "Relationship Analysis") — DashboardSidebar 관계 분석 메뉴.
> **유지**: `settings.privacy`("사생활 설정" / "Privacy Settings"), `sidebar.settingsGroup.personal`("개인 설정" / "Personal").

## 죽은 링크 / 잔존 참조 확인 결과

전체 `apps/web` 대상 grep 수행 결과:

| 참조 위치 | 내용 | 처리 |
|---|---|---|
| `settings/guild/[guildId]/co-presence/page.tsx` | 페이지 본체 + API import | 삭제 (작업 1) |
| `settings/guild/[guildId]/co-presence/__tests__/CoPresenceConfigPage.test.tsx` | 페이지 테스트 | 삭제 (작업 1) |
| `lib/guild-co-presence-config-api.ts` | API 클라이언트 | 삭제 (작업 2) |
| `lib/__tests__/guild-co-presence-config-api.test.ts` | API 테스트 | 삭제 (작업 2) |
| `components/SettingsSidebar.tsx` | 메뉴 항목 + Heart 아이콘 | 수정 (작업 3) |
| `components/__tests__/SettingsSidebar.test.tsx` | Co-Presence 메뉴 테스트 블록 | 수정 (작업 4) |

### 삭제해도 영향 없는(보존) 참조 — 혼동 주의

| 참조 위치 | 내용 | 사유 |
|---|---|---|
| `components/DashboardSidebar.tsx` (line 73~76) | `/dashboard/guild/${id}/co-presence` + `t('sidebar.coPresence')` | **관계 분석 대시보드 메뉴**. 삭제 대상 아님 |
| `components/__tests__/DashboardSidebar.test.tsx` (line 185) | `expect(hrefs).not.toContain('/settings/guild/${id}/co-presence')` | settings 경로가 대시보드 사이드바에 **없음**을 단언. 메뉴 삭제 후에도 통과 → 수정 불필요 |
| `dashboard/guild/[guildId]/co-presence/**` (page + components 7종) | 관계 분석 시각화 | F-COPRESENCE-007~013. 보존 |
| `dashboard/guild/[guildId]/help/page.tsx` (`help.sections.coPresence`) | 관계 분석 도움말 섹션 | `dashboard.json` 키 사용. 보존 |
| `dashboard/guild/[guildId]/newbie/components/MocoHunterDetail.tsx` (`coPresenceTime`) | 모코코 동시접속 시간 라벨 | 무관. 보존 |

**결론**: 페이지/클라이언트/메뉴/테스트/i18n 키 6경로 + ko·en 짝만 제거하면
죽은 링크(404로 향하는 `<Link>`)는 남지 않는다. settings 토글 페이지로 향하는 유일한 진입점은
`SettingsSidebar.tsx`의 메뉴 항목뿐이었고, 이를 제거한다.

### 잔존 문구 메모 (이번 작업 범위 밖, 별도 도메인 처리)

- `settings.json > privacy.disableRelationshipShareDesc` (ko/en)에 `/affinity` 명령어 언급 잔존.
  `privacy` 섹션은 유지 대상이므로 본 계획에서 손대지 않음. `/affinity` 문구 갱신이 필요하면
  사생활 설정 페이지 담당 작업(별도 티켓)에서 처리.

## 삭제 / 수정 파일 요약

### 삭제 파일 (4)

1. `apps/web/app/settings/guild/[guildId]/co-presence/page.tsx`
2. `apps/web/app/settings/guild/[guildId]/co-presence/__tests__/CoPresenceConfigPage.test.tsx`
3. `apps/web/app/lib/guild-co-presence-config-api.ts`
4. `apps/web/app/lib/__tests__/guild-co-presence-config-api.test.ts`

(+ 빈 `settings/guild/[guildId]/co-presence/` 디렉터리 제거)

### 수정 파일 (6)

1. `apps/web/app/components/SettingsSidebar.tsx` — 메뉴 항목 + 미사용 `Heart` import 제거
2. `apps/web/app/components/__tests__/SettingsSidebar.test.tsx` — Co-Presence 메뉴 테스트 블록 제거
3. `libs/i18n/locales/ko/web/settings.json` — `coPresence` 섹션 제거
4. `libs/i18n/locales/en/web/settings.json` — `coPresence` 섹션 제거
5. `libs/i18n/locales/ko/web/common.json` — `settings.coPresence` 키 제거
6. `libs/i18n/locales/en/web/common.json` — `settings.coPresence` 키 제거

## 검증 체크리스트

1. `pnpm --filter @onyu/web lint` — 미사용 import(`Heart`) 잔존 시 error → 제거 확인
2. `pnpm --filter @onyu/web build` — 삭제된 모듈 import 잔존 시 빌드 실패 → 통과 확인
3. `pnpm --filter @onyu/web test` — SettingsSidebar/DashboardSidebar 테스트 통과
4. 사이드바에서 "Co-Presence 설정" 메뉴 사라지고 "사생활 설정"은 남음 (수동/테스트 확인)
5. 대시보드 관계 분석 페이지(`/dashboard/guild/[guildId]/co-presence`) 정상 유지
6. 삭제된 토글 페이지로 향하는 죽은 `<Link>` 없음 (grep 재확인)

## 제약 / 패턴

- React 컴포넌트는 function 선언식, ESLint 준수 (미사용 import 금지).
- dashboard 관계 분석 페이지 7종 컴포넌트, 사생활 설정 페이지 보존.
- DB DROP 마이그레이션(`guild_co_presence_config`)은 **본 web 계획 범위 밖**(API/migrations 영역, database-architect 처리).
