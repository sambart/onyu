# 회원 본인 음성 마이페이지 (`/my/voice`) 구현 계획

> 작성일: 2026-06-19
> 도메인: voice (status=implemented)
> 상위 문서:
> - PRD: `docs/specs/prd/voice.md` — "회원 본인 음성 마이페이지" 섹션 (F-VOICE-050 / F-VOICE-051 / F-VOICE-052)
> - Userflow: `docs/specs/userflow/voice.md` (UF-VOICE-MY-001 ~ UF-VOICE-MY-008)
> - DB 설계: `docs/specs/database/_index.md` (voice_daily — 변경 없음)
> - 선행 패턴 참조: `docs/plans/web-privacy-settings.md`, `docs/plans/user-privacy-module.md`

본 plan은 BE(api) + FE(web) + 웹 프록시 + 엣지케이스 + cross-app 통합 시나리오를 포함하는 **단일 응집 기능 종합 계획**이다.

---

## 1. 작업 목적

운영 권한이 없는 일반 길드 멤버가 로그인 후 `/my/voice` 에서 **본인의 음성 활동 통계만** 조회하는 신규 웹 마이페이지를 추가한다. 데이터 엔진은 기존 `MeProfileService.getProfile()`(봇 `/me` 커맨드용)을 그대로 재사용하며, 신규 웹 전용 진입점(컨트롤러 + 프록시 + 페이지)만 만든다.

**범위 확정 (변경 금지)**:
- 데이터: 본인 음성 통계만 (`MeProfileData`). 타인 데이터 / 집계 리더보드 / co-presence / 비활동 분류 / 입퇴장 이력 일절 제외.
- 본인 길드 내 rank(단일 숫자) 노출 OK — 리더보드 화면은 렌더하지 않음.
- opt-out(통계 추적 거부) 이번 범위 제외.
- DB 마이그레이션 없음 (조회 전용, `voice_daily` `(guildId,userId,date)` 인덱스 기존 존재).

---

## 2. ⚠️ 엔드포인트 prefix 결정 — PRD/userflow 와의 차이 (구현자 필독)

| 출처 | 길드목록 | 프로필 |
|---|---|---|
| **PRD F-VOICE-050/051 + userflow** | `GET /api/me/voice/guilds` | `GET /api/me/voice/profile` |
| **본 plan 채택 (확정 설계)** | `GET /api/users/me/voice/guilds` | `GET /api/users/me/voice/profile` |

**채택 이유**: 기존 `UserPrivacyController`(`api/users/me/privacy`) · `DataDeletionController`(`api/users/me/data`) 가 이미 `api/users/me/*` 컨벤션을 쓴다. 동일 컨벤션을 따르면 단일 웹 프록시 `apps/web/app/api/users/[...path]/route.ts` 하나로 마이페이지 + 기존 privacy 양쪽을 커버한다(§6 참고). PRD 의 `/api/me/*` 는 신규 프록시 디렉토리를 또 만들어야 하므로 비효율.

→ 구현자는 **`/api/users/me/voice/*` 로 못박아 구현**한다. PRD/userflow 의 `/api/me/voice/*` 표기는 본 plan 과 불일치하므로, Phase 7 에서 PRD F-VOICE-050/051/052 + userflow 의 경로를 `/api/users/me/voice/*` 로 정정한다(§11 doc 갱신).

> PRD 가 별도 `me-voice.service.ts` 신설을 제안하나, 본 plan 은 기존 `MeProfileService` 에 `getMyGuilds()` 를 추가하는 방식을 채택(데이터 엔진 응집 유지, DiscordRest 이미 주입됨). 신규 서비스 파일은 만들지 않는다.

---

## 3. 엔드포인트 계약 표

신규 컨트롤러 `MeVoiceController` (`apps/api/src/channel/voice/presentation/me-voice.controller.ts`).
**`@Controller('api/users/me/voice')` + `@UseGuards(JwtAuthGuard)` 만.** 경로에 `:guildId` 파라미터를 **절대 두지 않는다**(guildId 는 query 전용) → `GuildMembershipGuard`(전역 등록 시) 가 `request.params['guildId']` 부재로 자연 통과.

| # | Method | Path | Auth | Query | 성공 응답 | 상태코드 |
|---|--------|------|------|-------|-----------|----------|
| E1 | GET | `/api/users/me/voice/guilds` | JwtAuthGuard | — | `MeVoiceGuild[]` (없으면 `[]`) | 200 |
| E2 | GET | `/api/users/me/voice/profile` | JwtAuthGuard | `guildId`(필수), `days`(7\|15\|30, 기본 15) | `MeProfileData` | 200 / 204(활동없음) / 400(검증실패) |

공통: 미인증 시 401(JwtAuthGuard). 모든 응답 본인 데이터 한정.

**E1 응답 (`MeVoiceGuild`)** — 필드명은 PRD 와 일치:
```json
[{ "guildId": "123...", "guildName": "Onyu 서버", "guildIcon": "https://cdn.discordapp.com/icons/123.../abc.png" }]
```
- `guildName` / `guildIcon`: Discord REST 보강 실패 시 `null` 허용 (non-blocking).

**E2 응답 (`MeProfileData`)**: `MeProfileService.getProfile()` 반환 객체를 그대로 직렬화 (rank/totalUsers/totalSec/activeDays/avgDailySec/micOnSec/micOffSec/micUsageRate/aloneSec/dailyChart/peakDayOfWeek/weeklyAvgSec/badges/excludedChannels).

### 🔒 보안 핵심 (단일 지점)
- **getProfile / 길드목록 쿼리의 `userId` 인자에는 항상 `req.user.discordId`(JWT sub) 만 주입.** 클라이언트 입력 절대 금지.
- `req.user` 추출은 기존 패턴 복제: `const user = (req as unknown as { user: JwtUser }).user;` → `user.discordId`.
- `days` 화이트리스트 검증: `[7, 15, 30]` 외 값은 `BadRequestException`(400). `days` 미제공 시 15.
- `guildId` 미제공 시 `BadRequestException`(400).
- **본인데이터 보장**: `MeProfileService.getProfile()`/`getMyGuilds()` 의 모든 쿼리가 `userId` 조건을 포함하므로, 타인 guildId 를 위조 전달해도 본인 데이터만 반환 → 타인 노출 0 (엣지 ④).

---

## 4. 백엔드 (apps/api) 작업

### 4.1. `MeProfileService.getMyGuilds(discordId)` 추가 — 수정
파일: `apps/api/src/channel/voice/application/me-profile.service.ts`

- 신규 public 메서드 `async getMyGuilds(userId: string): Promise<MeVoiceGuild[]>`.
- 동작:
  1. `voice_daily` 에서 `userId = :userId` 조건으로 `DISTINCT guildId` 조회 (QueryBuilder `.select('DISTINCT vd."guildId"', 'guildId')`). `(guildId, userId, date)` 인덱스 활용 — userId 단독 조건이지만 인덱스 leading 컬럼이 guildId 라 풀스캔 가능성 있음. 데이터량 작아 허용(주: 향후 `(userId)` 인덱스 검토 항목으로 §11 에 메모, 이번엔 변경 없음).
  2. 각 guildId 에 대해 기존 주입된 `this.discordRest.fetchGuild(guildId)` 로 name/icon 보강.
     - `fetchGuild` 는 실패 시 null 반환(이미 safe). null 이면 `guildName=null, guildIcon=null`.
     - `guildIcon` URL 조립: `APIGuild.icon` 해시 → `https://cdn.discordapp.com/icons/{guildId}/{icon}.png` (해시 null 이면 guildIcon=null).
  3. Discord REST 호출은 길드 수만큼 병렬(`Promise.all`)이되, 실패는 개별 폴백(`safe` 래퍼 패턴, 기존 `safeGetExcludedChannels` 참고).
- 신규 인터페이스 `MeVoiceGuild { guildId: string; guildName: string | null; guildIcon: string | null }` 를 동 파일에 export (혹은 컨트롤러에서 import).

### 4.2. `MeVoiceController` 신규 — 신규 파일
파일: `apps/api/src/channel/voice/presentation/me-voice.controller.ts` (템플릿: `user-privacy.controller.ts` + `data-deletion.controller.ts`)

```
@Controller('api/users/me/voice')
@UseGuards(JwtAuthGuard)
export class MeVoiceController {
  constructor(private readonly meProfileService: MeProfileService) {}

  @Get('guilds')
  async getMyGuilds(@Req() req): Promise<MeVoiceGuild[]> {
    const user = (req as unknown as { user: JwtUser }).user;
    return this.meProfileService.getMyGuilds(user.discordId);
  }

  @Get('profile')
  async getMyProfile(@Query('guildId') guildId, @Query('days') days, @Req() req, @Res passthrough): Promise<...> {
    // guildId 누락 → BadRequestException
    // days 파싱 + 화이트리스트(7/15/30, 기본 15) → 위반 시 BadRequestException
    const user = (req as unknown as { user: JwtUser }).user;
    const profile = await this.meProfileService.getProfile(guildId, user.discordId, parsedDays);
    if (!profile) { res.status(204); return; }  // 또는 @HttpCode + null 처리
    return profile;
  }
}
```
- **204 처리**: getProfile 가 null 일 때 204 No Content. NestJS 에서 `@Res({ passthrough: true }) res: Response` 로 `res.status(204)` 후 `undefined` 반환, 또는 별도 패턴. (구현자: 기존 코드베이스에 204 반환 패턴 있으면 그걸 따른다.)
- import: `JwtAuthGuard`(`../../../auth/infrastructure/jwt-auth.guard`), `JwtUser`(`../../../common/types/jwt-user.types`), `MeProfileService`(`../application/me-profile.service`).

### 4.3. 모듈 등록 — 수정
파일: `apps/api/src/channel/voice/voice-channel.module.ts`
- `controllers` 배열에 `MeVoiceController` 추가. (`MeProfileService` 는 이미 provider/exports 에 존재 — 변경 불필요. `DiscordRestService` 도 `MeProfileService` 가 이미 의존 주입 중.)

---

## 5. 공유 타입

`MeProfileData` 는 `MeProfileService` 가 export 중. 웹은 별도 의존 없이 클라이언트에서 동일 형태 인터페이스를 `me-voice-api.ts` 에 재선언한다(기존 `user-privacy-api.ts` 가 응답 타입을 자체 선언하는 패턴과 동일 — `libs/shared` 강제 아님). `MeVoiceGuild` 도 동일.

---

## 6. ⭐ 웹 프록시 (중요 — 기존 버그 동시 수정)

**현황**: `apps/web/app/api/` 에 `guilds/`, `admin/`, `health/` 프록시만 존재하고 **`users/` 프록시가 없다.** 기존 privacy 페이지가 `/api/users/me/privacy` 를 호출하므로, 프록시 부재 시 배포 환경에서 해당 호출이 Next 라우트에 매칭되지 않아 **404/실패 가능성**이 있다.

### 6.1. `apps/web/app/api/users/[...path]/route.ts` — 신규 파일
- 템플릿: `apps/web/app/api/guilds/[...path]/route.ts` 를 **그대로 복제**, `apiPath` 만 `/api/users/${path.join('/')}` 로 변경.
- `buildForwardHeaders`(Authorization 토큰 + IP 포워딩), 502 폴백, `GET/POST/PUT/PATCH/DELETE` export 동일.
- **이 프록시가 빠지면 마이페이지(`/api/users/me/voice/*`) 와 기존 privacy(`/api/users/me/privacy`) 가 모두 동작 불가** — 본 plan 의 필수 항목이며 누락 금지.

> 비고: 마이페이지는 GET 만 사용하지만, privacy 가 PUT 을 쓰므로 전 메서드 export 유지(복제본 그대로).

---

## 7. 웹 라우트 / 페이지 (apps/web)

### 7.1. 라우트 확정값
- **`/my/voice`** (PRD F-VOICE-052 확정). 스코핑 초안의 `/dashboard/me` 는 폐기.
- 인증: 기존 `apps/web/middleware.ts` 토큰 체크로 충분(`/my/*` 는 PUBLIC_PATHS 아님 → 미로그인 시 `/auth/discord?returnTo=` 리다이렉트 자동 적용). **`/my` 를 PUBLIC_PATHS 에 추가하지 않는다.**
- 레이아웃: 운영자 `dashboard/guild/[guildId]/layout.tsx`(GuildMembershipGuard 역할의 클라이언트 멤버십 체크 + DashboardSidebar)와 **완전 분리된 독립 레이아웃**. 멤버십 가드 미적용.

### 7.2. 신규 파일 구조
```
apps/web/app/my/
├── layout.tsx                        ← 독립 레이아웃(공통 Header 는 root layout 이 이미 렌더 → 최소 wrapper. 사이드바 없음)
└── voice/
    ├── page.tsx                      ← 'use client' 메인 페이지 (상태 머신)
    └── components/
        ├── GuildSelector.tsx         ← 활동 길드 드롭다운 (1개면 고정 라벨)
        ├── PeriodSelector.tsx        ← 7d/15d/30d 버튼
        ├── MeSummaryCards.tsx        ← rank/totalUsers/totalSec/activeDays/avgDailySec
        ├── MeMicStatsCard.tsx        ← micOnSec/micOffSec/micUsageRate/aloneSec
        ├── MeDailyChart.tsx          ← dailyChart 바 차트
        ├── MePeakDayCard.tsx         ← peakDayOfWeek/weeklyAvgSec
        ├── MeBadgeSection.tsx        ← badges (빈 배열이면 숨김)
        └── MeExcludedChannelBanner.tsx ← excludedChannels (빈 배열이면 미렌더)
apps/web/app/lib/me-voice-api.ts      ← fetchMeGuilds(), fetchMeProfile(guildId, days)
```
> `my/layout.tsx` 가 사실상 비어도 무방하면 생략 가능(구현자 판단). 단 운영자 사이드바 레이아웃을 상속하지 않음을 보장.

### 7.3. `me-voice-api.ts` — 신규
- `fetchMeGuilds(): Promise<MeVoiceGuild[]>` → `apiClient('/api/users/me/voice/guilds')`.
- `fetchMeProfile(guildId, days): Promise<MeProfileData | null>` → `apiClient('/api/users/me/voice/profile?guildId=&days=')`. 204 는 `apiClient` 가 `undefined` 반환(`api-client.ts` 65줄) → 호출부에서 "활동 없음"으로 매핑.
- 패턴: `apps/web/app/lib/user-privacy-api.ts` 복제 + `apiClient`(`./api-client`) 사용.

### 7.4. `page.tsx` 상태 머신 ('use client')
초기 상태: `loading-guilds` → `fetchMeGuilds()`:
- `[]` → `empty-no-guilds`(UF-VOICE-MY-002): "아직 음성 활동 기록이 없습니다." 안내, 드롭다운/통계 미렌더.
- `length >= 1` → 첫 길드 선택 + `days=15` 로 `fetchMeProfile` → `loading-profile`:
  - 200 + data → `ready`(전체 컴포넌트 렌더, UF-VOICE-MY-003/007).
  - 204(`undefined`) → `empty-no-activity`(UF-VOICE-MY-006): 드롭다운/기간 버튼 유지, 통계 영역에 "해당 기간 음성 활동이 없습니다."
- 길드 변경(UF-VOICE-MY-004) / 기간 변경(UF-VOICE-MY-005): `fetchMeProfile` 재호출. **경쟁 상태 방지** — 최신 요청만 반영(요청 시퀀스 토큰 또는 AbortController; `dashboard/guild/[guildId]/layout.tsx` 의 `cancelled` 플래그 패턴 참고).
- 에러: 길드 목록 실패 → 재시도 가능 오류 상태. 프로필 실패 → 오류 안내, 길드 목록/이전 통계 유지.

### 7.5. 차트 컴포넌트 재사용 검토
- 기존 `dashboard/guild/[guildId]/voice/components/` 의 `DailyTrendChart` / `UserDailyBarChart` / `MicDistributionChart` / `UserMicPieChart` 는 `VoiceDailyRecord[]` 입력 기준 → `MeProfileData.dailyChart`(`{date,durationSec}[]`) 와 형태가 다르다.
- 방침: **데이터 변환 어댑터로 재사용 가능하면 재사용, 결합도 높으면 경량 신규 컴포넌트**. 구현자가 컴포넌트 시그니처 확인 후 결정. recharts 등 차트 라이브러리는 기존 것과 동일하게 사용.

### 7.6. Header 내비 + 로그인 후 라우팅 — 수정
- `apps/web/app/components/Header.tsx`: 데스크톱 + 모바일 메뉴에 "마이페이지"(`/my/voice`) `Link` 추가. (Home/Dashboard/Settings 패턴 복제, 적절한 lucide 아이콘 — 예: `User`.) 로그인 여부 무관 노출 OK(미로그인 클릭 시 middleware 가 로그인 유도).
- `apps/web/app/select-guild/page.tsx`: `user.guilds.length === 0` 빈 분기(59~73줄)에 "운영 권한은 없지만 음성 통계는 볼 수 있습니다" 맥락 + `/my/voice` 이동 버튼/링크 추가 (UF-VOICE-MY-008).
- `auth/callback/route.ts`: 변경 불필요(목적지 쿠키 `returnTo` 가 `/my/voice` 였으면 그대로 전이됨, `isSafeReturnPath` 통과 확인만 — `/my/voice` 는 내부 경로라 통과).

### 7.7. i18n — 수정
파일: `libs/i18n/locales/ko/web/dashboard.json`, `libs/i18n/locales/en/web/dashboard.json`
- PRD F-VOICE-052 의 `me.*` 키 세트 추가 (me.title / me.noGuilds / me.noActivity / me.guildSelector.label / me.period.{7d,15d,30d} / me.summary.* / me.mic.* / me.peak.* / me.badges.title / me.excluded.title). 표 값은 PRD 표 그대로.
- `libs/i18n/locales/{ko,en}/web/common.json`: Header 내비 라벨 `nav.myPage`(한: 마이페이지 / 영: My Page) 추가.

---

## 8. 엣지케이스 enumeration

| # | 케이스 | 처리 | 레이어 |
|---|--------|------|--------|
| ① | 활동 기록 없는 멤버 (길드 0개) | E1 `[]` → FE `empty-no-guilds` 안내 화면 | BE+FE |
| ② | 선택 길드에 해당 기간 데이터 없음 | E2 getProfile null → 204 → FE `empty-no-activity` 안내(드롭다운/기간 유지) | BE+FE |
| ③ | 미인증 | JwtAuthGuard 401. FE: middleware 가 진입 전 리다이렉트, 토큰 만료 중 401 시 로그인 재유도 | BE+FE |
| ④ | guildId 위조 시도(타인 길드 ID 주입) | getProfile 쿼리에 본인 userId 강제 → 데이터 없으면 null → 204. **타인 데이터 노출 0** (보안 의도된 동작) | BE |
| ⑤ | days 비정상값(0/100/문자열 등) | 화이트리스트(7/15/30) 위반 → 400 BadRequest. FE: 정상 UI 에선 미발생, 직접 호출 방어 | BE |
| ⑥ | Discord REST 길드명/아이콘 보강 실패 | `fetchGuild` null → guildName/guildIcon null. FE: guildId 대체 표시(UF-VOICE-MY-003 엣지) | BE+FE |
| ⑦ | getProfile 의존 서비스 실패(badge / excludedChannel / flush) | 기존 `safeFindBadgeCodes` / `safeGetExcludedChannels` / `safeFlush` 래퍼가 빈 배열·skip 폴백 — 프로필 응답 자체는 정상 | BE(기존) |
| ⑧ | 길드 1개뿐 | 드롭다운 대신 고정 라벨/비활성 표시(구현 결정) | FE |
| ⑨ | 길드/기간 연속 변경(경쟁 상태) | 최신 요청만 반영(AbortController/시퀀스 토큰) | FE |
| ⑩ | rank null / peakDayOfWeek null | 해당 표시 생략 (UF-VOICE-MY-007 엣지) | FE |
| ⑪ | 웹 프록시 부재 | §6 신규 프록시로 해결. 누락 시 마이페이지+privacy 동시 불능 | FE(인프라) |

---

## 9. cross-app 통합 시나리오 (Phase 6.5 E2E 입력용)

**시나리오 A — 활동 있는 일반 멤버 정상 흐름**:
1. 미로그인 사용자가 Header "마이페이지" 클릭 → middleware 가 `/auth/discord?returnTo=/my/voice` 로 리다이렉트.
2. Discord OAuth 완료 → `auth/callback` 가 token 쿠키 설정 후 `returnTo=/my/voice` 로 전이.
3. `/my/voice` 마운트 → `GET /api/users/me/voice/guilds` (웹 프록시 → API, JWT Bearer) → 200 `[{guildId, guildName, guildIcon}]`.
4. 첫 길드 자동 선택 + `GET /api/users/me/voice/profile?guildId=&days=15` → 200 `MeProfileData` → 전체 컴포넌트 렌더.
5. 기간 30d 변경 → `?days=30` 재호출 → 갱신. 길드 변경 → `?guildId=&days=30` 재호출 → 갱신.

**시나리오 B — 활동 없는 멤버**: 3 단계에서 `[]` → 빈 상태 안내 (통계 호출 없음).

**시나리오 C — 보안(타인 길드 위조)**: 4 단계에서 본인이 활동한 적 없는 guildId 주입 → API 가 본인 userId 로 쿼리 → null → 204 → "활동 없음". 타인 데이터 비노출 검증.

**검증 전 구간**: web middleware → auth/callback → web proxy(`api/users/[...path]`) → API `MeVoiceController`(JwtAuthGuard) → `MeProfileService`.

---

## 10. 변경 파일 목록 표

| # | 파일 | 신규/수정 | 핵심 변경 | 규모 |
|---|------|-----------|-----------|------|
| 1 | `apps/api/src/channel/voice/application/me-profile.service.ts` | 수정 | `getMyGuilds(userId)` + `MeVoiceGuild` 추가 | M |
| 2 | `apps/api/src/channel/voice/presentation/me-voice.controller.ts` | 신규 | `GET guilds` / `GET profile` (JwtAuthGuard, userId=JWT.sub 강제, days 검증, 204) | M |
| 3 | `apps/api/src/channel/voice/voice-channel.module.ts` | 수정 | `controllers` 에 `MeVoiceController` 등록 | S |
| 4 | `apps/web/app/api/users/[...path]/route.ts` | 신규 | `/api/users/*` 프록시 (guilds proxy 복제) — privacy 버그 동시 수정 | S |
| 5 | `apps/web/app/lib/me-voice-api.ts` | 신규 | `fetchMeGuilds` / `fetchMeProfile` | S |
| 6 | `apps/web/app/my/layout.tsx` | 신규 | 독립 레이아웃(사이드바 없음, 멤버십 가드 미적용) | S |
| 7 | `apps/web/app/my/voice/page.tsx` | 신규 | 상태 머신 메인 페이지 | L |
| 8 | `apps/web/app/my/voice/components/*.tsx` (8종) | 신규 | GuildSelector/PeriodSelector/Me* 6종 | L |
| 9 | `apps/web/app/components/Header.tsx` | 수정 | "마이페이지" 내비(데스크톱+모바일) | S |
| 10 | `apps/web/app/select-guild/page.tsx` | 수정 | 빈 길드 분기에 `/my/voice` 안내(UF-VOICE-MY-008) | S |
| 11 | `libs/i18n/locales/{ko,en}/web/dashboard.json` | 수정 | `me.*` 키 세트 | S |
| 12 | `libs/i18n/locales/{ko,en}/web/common.json` | 수정 | `nav.myPage` | S |

테스트 파일(§ 12)은 별도.

---

## 11. 테스트 포인트

### BE (apps/api — tester)
- `MeVoiceController`:
  - JwtAuthGuard 적용(미인증 401).
  - `getProfile`/`getMyGuilds` 의 userId 인자가 **항상 `req.user.discordId`** 인지(클라이언트 입력 무시) — 본인필터 단언.
  - profile null → 204, 데이터 있음 → 200.
  - days: 미제공→15, 7/15/30 통과, 그 외(0/31/"abc")→400.
  - guildId 미제공 → 400.
  - 경로에 `:guildId` 파라미터 없음 → GuildMembershipGuard 통과(비멤버 길드 ID query 로 줘도 403 안 남, 단 데이터 없으면 204).
- `MeProfileService.getMyGuilds`:
  - DISTINCT guildId 정확성(중복 제거).
  - Discord REST 성공 시 name/icon 보강, 실패 시 null 폴백(⑥).
  - 활동 없는 userId → `[]`.

### FE (apps/web — fe-tester)
- `page.tsx` 상태 분기: guilds `[]`→빈상태 / 길드 선택 후 200→ready / 204→활동없음 / 에러→오류상태.
- GuildSelector: 다중 길드 드롭다운 동작, 1개 시 고정 라벨, 변경 시 재호출.
- PeriodSelector: 7/15/30 토글, 현재 선택 시각 표시, 변경 시 재호출.
- 경쟁 상태: 연속 변경 시 최신 응답만 반영.
- 조건부 렌더: badges 빈 배열→섹션 숨김, excludedChannels 빈 배열→배너 미렌더.

---

## 12. DB

**DB 변경 없음.** 조회 전용이며 `voice_daily` 의 `(guildId, userId, date)` 인덱스가 이미 존재. 마이그레이션 불필요.
> (참고/향후) `getMyGuilds` 의 userId 단독 DISTINCT 쿼리는 leading 컬럼이 guildId 인 기존 인덱스를 완전 활용하지 못한다. 현재 데이터량에서 허용하나, 성능 이슈 시 `(userId)` 보조 인덱스 검토 — **이번 범위 아님**.

---

## 13. 권한 경계 / 본인데이터 보장 지점 (요약)

- **단일 강제 지점**: `MeVoiceController` 의 두 핸들러에서 `userId = req.user.discordId` 만 서비스에 전달. 클라이언트는 userId 를 어떤 경로로도 주입 불가.
- 모든 `MeProfileService` 쿼리가 `userId` 조건 포함 → 타인 guildId 위조해도 본인 데이터만(없으면 204).
- rank 는 단일 숫자만 노출, 리더보드/타인 시계열/co-presence/비활동 분류 화면 일절 없음.
- 권한 개방(운영 권한 없는 멤버에게 본인 통계 개방)은 PRD 표 기준 **사용자 승인 완료** — 미결 마커 없음.

---

## 14. doc 갱신 필요 (Phase 7 — manifest 외)

- **PRD** `docs/specs/prd/voice.md` F-VOICE-050/051/052: 엔드포인트 경로 `/api/me/voice/*` → `/api/users/me/voice/*` 로 정정. 신규 `me-voice.service.ts` 대신 `MeProfileService.getMyGuilds` 채택 반영. 웹 프록시(`api/users/[...path]/route.ts`) 추가 언급.
- **userflow** `docs/specs/userflow/voice.md` UF-VOICE-MY-001~006: 동일 경로 정정(`/api/me/voice/*` → `/api/users/me/voice/*`).

---

## 15. manifest 갱신 필요

**변경 종류**: (a) status 변경만 — 해당 없음(voice 이미 implemented) / **(b) `code.*` 경로 신설 가능성 — 확인 필요** / (c) 신규 도메인 — 없음 / (d) 변경 없음 — 부분.

신규 코드가 모두 **기존 `voice` 도메인의 기존 `code.*` 경로 하위**에 추가되는지, manifest 의 `code.api` / `code.web` glob 이 신규 파일을 포함하는지 implementer 가 Phase 7 에서 확인한다:

- 신규 API 파일: `apps/api/src/channel/voice/presentation/me-voice.controller.ts` → `voice.code.api` 가 `apps/api/src/channel/voice/**` 형태면 자동 포함(신설 불필요). 단일 파일 나열식이면 **추가 등재 필요**.
- 신규 Web 파일: `apps/web/app/my/voice/**`, `apps/web/app/api/users/[...path]/route.ts`, `apps/web/app/lib/me-voice-api.ts` → `voice.code.web` 가 디렉토리 glob 이 아니라면 **추가 등재 필요** (특히 `apps/web/app/my/` 는 신규 디렉토리).
- voice 도메인 status: 이미 `implemented` 유지 — 변경 없음.

→ implementer 는 `docs/specs/feature-manifest.json` 의 `domains.voice.code.api` / `domains.voice.code.web` 실제 값(glob vs 파일나열)을 읽고:
  - glob 형태면 → **manifest 갱신 없음**.
  - 파일 나열 형태면 → 위 신규 경로들을 `code.api` / `code.web` 에 추가.
- 테스트 추가 시 `domains.voice.code.tests` 도 동일 기준으로 확인.
