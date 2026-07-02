# 주간 자동 리포트 친밀도 섹션 통합 — 구현 계획 (F-COPRESENCE-016)

> 도메인: `voice-co-presence` × `gemini`(weekly-report)
> 참조 PRD:
> - `/docs/specs/prd/voice-co-presence.md` §F-COPRESENCE-016, §F-COPRESENCE-017
> - `/docs/specs/prd/gemini.md` §F-GEMINI-006
> 상위 검토안: `/docs/plans/best-friend-discord-feature.md` §F-FRIEND-003

---

## 1. 작업 목적

기존 `WeeklyReportService`가 매시간 정각(Cron `0 * * * *`)에 발송하는 주간 음성 리포트 Embed에 **"이번 주 베스트 페어 TOP 5"** 친밀도 섹션을 추가한다.

- 데이터 소스: `VoiceCoPresencePairDailyOrm` (서버 단방향 페어 7일 합산)
- 활용 메서드: 이미 구현된 `CoPresenceAnalyticsService.getTopPairs(guildId, days, limit)`
- 사생활 정책 적용: `UserPrivacyConfigService.filterPeers()`로 opt-out 사용자 익명화/제외
- 출력 형식: **Embed 유지** (PRD F-COPRESENCE-016 명시 — 페어 5쌍 텍스트로 충분, 캔버스 미적용)

기존 4개 섹션(이번 주 vs 지난 주 / TOP 5 유저 / TOP 3 채널 / AI 종합 분석)은 그대로 유지하며, **TOP 3 채널과 AI 종합 분석 사이**에 신규 섹션을 삽입한다.

---

## 2. 선행 조건 (전제)

본 계획은 다음 컴포넌트가 **이미 존재함**을 전제한다. 부재 시 별도 선행 작업으로 분리해야 한다.

| 컴포넌트 | 현재 상태 | 비고 |
|----------|-----------|------|
| `CoPresenceAnalyticsService.getTopPairs()` | 존재 (`apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts:288`) | `TopPairItem[]` 반환, 단방향 정렬 적용 |
| `UserPrivacyConfigOrm` 엔티티 | 존재 (`apps/api/src/user-privacy/infrastructure/user-privacy-config.orm-entity.ts`) | PK `(guildId, userId)`, `disableRelationshipShare boolean` |
| `UserPrivacyConfigService` | **미구현** | Phase 5-1에서 신규. 본 계획 진행 전 선행 또는 본 계획에 포함 |
| `UserPrivacyConfigService.filterPeers()` | **미구현** | 본 계획에서는 "이미 존재함"으로 가정하고 계약(시그니처)만 명시 |

> **결정 필요 (사용자 확인)**: `UserPrivacyConfigService` 자체가 미구현 상태이다. 본 계획은 다음 두 가지 접근을 가능하게 작성한다.
> - **A안 (권장)**: 본 계획은 F-COPRESENCE-017 Phase 5-1이 선행 완료된 후 진행. `UserPrivacyConfigService` 사용 측면만 다룬다.
> - **B안**: 본 계획에서 최소 형태(`disableRelationshipShare` 조회 + `filterPeers`)만 동봉 신규 작성하여 자급자족.
>
> 진행 시 위 결정에 따라 §3.1 의존성 처리 방식이 갈린다. 이하 설계는 A안을 가정한다.

---

## 3. 변경 대상 파일 목록 (수정만)

### 3.1 직접 수정 대상

| # | 절대 경로 | 변경 요약 |
|---|----------|-----------|
| 1 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\voice-analytics\weekly-report\application\weekly-report.service.ts` | `collectReportData()`에 `topPairs` 수집 + opt-out 필터, `buildPayload()`에 친밀도 섹션 헬퍼 호출 |
| 2 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\voice-analytics\voice-analytics.module.ts` | `CoPresenceModule` import + `UserPrivacyModule`(또는 동등 provider) import |
| 3 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\channel\voice\co-presence\co-presence.module.ts` | `CoPresenceAnalyticsService`를 `exports`에 추가 (`WeeklyReportModule`에서 주입 가능하도록) |

### 3.2 (선택) AI 프롬프트 보강 대상

| # | 절대 경로 | 변경 요약 |
|---|----------|-----------|
| 4 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\voice-analytics\application\voice-ai-analysis.service.ts` | `generateWeeklyReport(currentData, prevData, channelStats, topPairs?)` 시그니처 확장 — 페어 컨텍스트를 프롬프트에 추가. 미전달 시 기존 동작 유지 |

### 3.3 테스트 추가/수정 대상

| # | 절대 경로 | 변경 요약 |
|---|----------|-----------|
| 5 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\voice-analytics\weekly-report\application\weekly-report.service.spec.ts` (신규) | 친밀도 섹션 포함/생략, opt-out 익명화, 부분 비공개, 양측 비공개 제외, `getTopPairs()` 실패 시 정상 발송, 0건 섹션 미출력 회귀 케이스 |
| 6 | `e:\Workspace\discord\nest-dhyunbot\apps\api\src\voice-analytics\weekly-report\application\weekly-report.scheduler.spec.ts` | 신규 의존성 주입 mock 보강 (필요 시) |

### 3.4 검토만 필요 (수정 없음)

| 파일 | 비고 |
|------|------|
| `apps/api/src/voice-analytics/weekly-report/application/weekly-report.scheduler.ts` | 스케줄링 트리거 변경 없음 |
| `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` | `getTopPairs()` 시그니처/동작 변경 없음 (재사용만) |

---

## 4. 변경 위치별 핵심 코드 시그니처/구조

### 4.1 `WeeklyReportService` 시그니처 변경

```ts
// 기존 ReportData 타입 확장
interface ReportData {
  currentStats: { totalUsers: number; totalVoiceTime: number; avgDailyActiveUsers: number };
  prevStats: { totalUsers: number; totalVoiceTime: number; avgDailyActiveUsers: number };
  topUsers: Array<{ rank: number; nickName: string; totalSec: number; micOnSec: number; activeDays: number }>;
  topChannels: Array<{ channelName: string; totalSec: number; uniqueUsers: number }>;
  // 신규
  topPairs: ReportTopPair[];
  aiAnalysis: string | null;
}

// 신규 도메인 DTO (서비스 내부 정의 또는 별도 파일)
interface ReportTopPair {
  userAName: string;        // 익명일 경우 '???'
  userBName: string;        // 익명일 경우 '???'
  totalMinutes: number;
  sessionCount: number;
  hiddenSideCount: 0 | 1 | 2; // 0: 양측 공개, 1: 한쪽 비공개, 2: 양측 비공개(이미 필터됨)
}
```

### 4.2 생성자 의존성 주입

```ts
constructor(
  private readonly analyticsService: VoiceAnalyticsService,
  private readonly aiAnalysisService: VoiceAiAnalysisService,
  private readonly discordRestService: DiscordRestService,
  private readonly coPresenceAnalyticsService: CoPresenceAnalyticsService, // 신규
  private readonly userPrivacyConfigService: UserPrivacyConfigService,     // 신규
) {}
```

### 4.3 `collectReportData()` 변경

```ts
private async collectReportData(guildId: string): Promise<ReportData> {
  const currentRange = VoiceAnalyticsService.getDateRange(REPORT_PERIOD_DAYS);
  const prevRange = VoiceAnalyticsService.getPrevDateRange(REPORT_PERIOD_DAYS);

  const [currentData, prevData, leaderboard, channelStats, rawTopPairs] = await Promise.all([
    this.analyticsService.collectVoiceActivityData(guildId, currentRange.start, currentRange.end),
    this.analyticsService.collectVoiceActivityData(guildId, prevRange.start, prevRange.end),
    this.analyticsService.getLeaderboard(guildId, { days: REPORT_PERIOD_DAYS, page: LEADERBOARD_PAGE, limit: LEADERBOARD_LIMIT }),
    this.analyticsService.getChannelStats(guildId, REPORT_PERIOD_DAYS),
    this.fetchTopPairsSafely(guildId), // 신규 — 실패 시 [] 반환
  ]);

  const topPairs = await this.applyPrivacyFilterSafely(guildId, rawTopPairs);

  let aiAnalysis: string | null = null;
  try {
    aiAnalysis = await this.aiAnalysisService.generateWeeklyReport(
      currentData,
      prevData,
      currentData.channelStats,
      topPairs, // 선택 인자(§3.2) — 미적용 시 인자 생략
    );
  } catch (err) {
    this.logger.warn(`[WEEKLY] AI analysis failed for guild=${guildId}`, getErrorStack(err));
  }

  return {
    currentStats: currentData.totalStats,
    prevStats: prevData.totalStats,
    topUsers: leaderboard.users,
    topChannels: channelStats.slice(0, TOP_CHANNELS_LIMIT),
    topPairs,
    aiAnalysis,
  };
}
```

### 4.4 신규 헬퍼 — 장애 격리

```ts
// 친밀도 조회 실패는 리포트 전체를 막지 않는다
private async fetchTopPairsSafely(guildId: string): Promise<TopPairItem[]> {
  try {
    return await this.coPresenceAnalyticsService.getTopPairs(guildId, REPORT_PERIOD_DAYS, TOP_PAIRS_LIMIT);
  } catch (err) {
    this.logger.warn(`[WEEKLY] getTopPairs failed for guild=${guildId} — section omitted`, getErrorStack(err));
    return [];
  }
}

// opt-out 조회 실패 시 사생활 우선: 모든 페어를 안전하게 제거한다
private async applyPrivacyFilterSafely(
  guildId: string,
  pairs: TopPairItem[],
): Promise<ReportTopPair[]> {
  if (pairs.length === 0) return [];
  try {
    return await this.applyPrivacyFilter(guildId, pairs);
  } catch (err) {
    this.logger.warn(`[WEEKLY] privacy filter failed for guild=${guildId} — pairs section dropped`, getErrorStack(err));
    return [];
  }
}
```

### 4.5 `applyPrivacyFilter()` 본체

```ts
private async applyPrivacyFilter(
  guildId: string,
  pairs: TopPairItem[],
): Promise<ReportTopPair[]> {
  const userIds = [...new Set(pairs.flatMap((p) => [p.userA.userId, p.userB.userId]))];
  // 입력: { guildId, userIds }, 출력: Set<string> of disabled userIds
  const disabled = await this.userPrivacyConfigService.getDisabledUserIds(guildId, userIds);

  return pairs
    .map<ReportTopPair | null>((p) => {
      const aHidden = disabled.has(p.userA.userId);
      const bHidden = disabled.has(p.userB.userId);
      if (aHidden && bHidden) return null; // 양측 비공개 → 결과 제거
      return {
        userAName: aHidden ? ANONYMOUS_LABEL : p.userA.userName,
        userBName: bHidden ? ANONYMOUS_LABEL : p.userB.userName,
        totalMinutes: p.totalMinutes,
        sessionCount: p.sessionCount,
        hiddenSideCount: (aHidden ? 1 : 0) + (bHidden ? 1 : 0) as 0 | 1,
      };
    })
    .filter((p): p is ReportTopPair => p !== null);
}
```

> **참고**: 위 코드는 `UserPrivacyConfigService.getDisabledUserIds(guildId, userIds): Promise<Set<string>>` 시그니처를 가정한다. 실제 인터페이스가 `filterPeers()` 형태로 결정될 경우 호출 지점만 어댑팅한다.

### 4.6 `buildPayload()` — 50줄 룰 준수

기존 `buildPayload()`는 이미 70여 줄로 `eslint-disable max-lines-per-function`이 붙어 있다. 친밀도 섹션 로직은 **별도 헬퍼 메서드**로 분리한다.

```ts
private buildPayload(guildId: string, reportData: ReportData): RESTPostAPIChannelMessageJSONBody {
  // ... 기존 sections 빌드 ...

  // TOP 3 채널 직후 삽입
  this.appendCoPresenceSection(sections, reportData.topPairs);

  // AI 종합 분석은 그 뒤 그대로
  if (aiAnalysis) sections.push(`**🤖 AI 종합 분석**\n${aiAnalysis}`);
  // ...
}

// 신규 헬퍼 (파일 내 private 메서드, 50줄 미만)
private appendCoPresenceSection(sections: string[], topPairs: ReportTopPair[]): void {
  if (topPairs.length === 0) return; // 0건 → 섹션 자체 생략

  const pairLines = topPairs.map((p, i) => {
    const time = this.formatPairTime(p.totalMinutes);
    const suffix =
      p.hiddenSideCount === 1
        ? `(${p.sessionCount}세션, 1명 비공개)`
        : `(${p.sessionCount}세션)`;
    return `${i + 1}. ${p.userAName} ↔ ${p.userBName} — ${time} ${suffix}`;
  }).join('\n');

  sections.push(`**💞 이번 주 베스트 페어 TOP 5**\n${pairLines}`);
}

private formatPairTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;
}
```

### 4.7 신규 상수

```ts
const TOP_PAIRS_LIMIT = 5;
const ANONYMOUS_LABEL = '???';
```

---

## 5. 데이터 수집 흐름도

```
WeeklyReportScheduler (Cron 0 * * * *)
  └─ WeeklyReportService.generateAndSendReport(config)
        │
        ├─ collectReportData(guildId)
        │     └─ Promise.all([
        │          collectVoiceActivityData(current),         // 기존
        │          collectVoiceActivityData(prev),            // 기존
        │          getLeaderboard(7d, page1, limit5),         // 기존
        │          getChannelStats(7d),                       // 기존
        │          fetchTopPairsSafely(guildId),              // 신규: getTopPairs(7d, 5)
        │        ])
        │     │
        │     ├─ applyPrivacyFilterSafely(guildId, pairs)
        │     │     └─ UserPrivacyConfigService.getDisabledUserIds(guildId, userIds)
        │     │           → Set<string> of opt-out userIds
        │     │     └─ pairs.map → {익명화 또는 제거} → ReportTopPair[]
        │     │
        │     └─ generateWeeklyReport(currentData, prevData, channelStats, topPairs?)
        │           (선택) topPairs 컨텍스트 포함하여 프롬프트 보강
        │
        ├─ buildPayload(guildId, reportData)
        │     ├─ sections: 이번 주 vs 지난 주
        │     ├─ sections: TOP 5 유저
        │     ├─ sections: TOP 3 채널
        │     ├─ appendCoPresenceSection(sections, topPairs)   ← 신규
        │     ├─ sections: AI 종합 분석
        │     └─ Embed { title, description: sections.join("\n\n"), color, components }
        │
        └─ DiscordRestService.sendMessage(channelId, payload)
```

---

## 6. opt-out 필터링 정책 명세

| 페어 상태 | 처리 결과 | 출력 예시 |
|-----------|-----------|----------|
| 양측 공개 | 정상 표시 | `1. 동현 ↔ 민수 — 12시간 30분 (24세션)` |
| 한쪽만 비공개 | 비공개 측 익명화 + 비고 표시 | `2. 지수 ↔ ??? — 8시간 12분 (15세션, 1명 비공개)` |
| 양측 모두 비공개 | 결과에서 제거 (다음 페어로 자동 슬라이드 X — 5건 미만 출력) | (출력 없음) |
| `getTopPairs()` 실패 | 친밀도 섹션만 생략, 다른 섹션 정상 발송 | (섹션 자체 미출력) |
| `getDisabledUserIds()` 실패 | 사생활 우선 — 모든 페어 제거 → 섹션 미출력 | (섹션 자체 미출력) |
| `topPairs.length === 0` | 섹션 자체 생략 | (섹션 자체 미출력) |

**결정 사항**:
- 양측 비공개 제거 시 **5건이 4건으로 줄어든 채로 출력**한다 (강제 5건 보충 X). `getTopPairs(7, 5)`가 단방향 TOP 5 페어만 반환하므로, "5등 전체 보장"보다 "정확성 우선" 정책을 따른다. PRD 명시 없는 부분은 PRD 기준일 정확성을 따른다.
- 익명화 표시는 `???` (PRD F-COPRESENCE-016 §opt-out 처리 표 명시).

---

## 7. AI 프롬프트 컨텍스트 보강 (선택)

`VoiceAiAnalysisService.generateWeeklyReport()`에 4번째 인자로 `topPairs?: ReportTopPair[]` 추가.

```ts
async generateWeeklyReport(
  currentData: VoiceActivityData,
  prevData: VoiceActivityData,
  channelStats: VoiceActivityData['channelStats'],
  topPairs: ReportTopPair[] = [], // 신규(선택). 기본값 [] — 기존 호출자 영향 없음
): Promise<string>
```

프롬프트 템플릿 추가 블록:

```
이번 주 활발한 베스트 페어 TOP 3:
1. 동현 ↔ 민수 — 12시간 (24세션)
2. 지수 ↔ ??? — 8시간 (1명 비공개)
3. 영희 ↔ 철수 — 6시간 (10세션)

위 페어 정보를 참고하여 서버 분위기를 1~2문장으로 자연스럽게 묘사하세요. (인용/추측 금지)
```

장애 대응:
- LLM 호출 실패 시 기존 `buildWeeklyReportFallback()` 그대로 사용 — 페어 정보 미반영해도 무방.
- `topPairs` 빈 배열 → 프롬프트에 페어 블록 자체를 추가하지 않음 (조건부 분기).

---

## 8. 의존 모듈 추가 사항

### 8.1 `VoiceAnalyticsModule` 변경

```ts
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([...]),
    GatewayModule,
    AuthModule,
    LlmModule,
    CoPresenceModule,        // 신규
    UserPrivacyModule,       // 신규 — A안 채택 시 (없을 경우 동등 provider import)
  ],
  // ... 기존 providers/exports 동일
})
export class VoiceAnalyticsModule {}
```

### 8.2 `CoPresenceModule` 변경

```ts
@Module({
  // ... imports/controllers/providers 동일
  exports: [
    CoPresenceScheduler,
    CoPresenceService,
    CoPresenceAnalyticsService, // 신규 — WeeklyReportService에서 주입 가능하도록
  ],
})
export class CoPresenceModule {}
```

### 8.3 `UserPrivacyModule` (전제: 별도 선행 작업으로 생성됨)

본 계획은 `UserPrivacyConfigService`를 단일 클래스로 export하는 모듈을 가정한다. 미존재 시 본 계획 진행 전 다음을 수행:

1. `apps/api/src/user-privacy/application/user-privacy-config.service.ts` 신규
2. `apps/api/src/user-privacy/infrastructure/user-privacy-config.repository.ts` 신규
3. `apps/api/src/user-privacy/user-privacy.module.ts` 신규 — `UserPrivacyConfigService` 단일 export

본 선행 작업 자체는 F-COPRESENCE-017의 일부이며, 본 계획 범위 외에서 별도 plan으로 다룬다. 이 plan에서는 **계약 의존만** 명시한다.

---

## 9. 테스트 케이스

### 9.1 단위 테스트 (`weekly-report.service.spec.ts`)

| # | 케이스 | 검증 내용 |
|---|--------|----------|
| 1 | 기존 회귀 — 친밀도 섹션 미적용 시 4섹션 그대로 | `topPairs=[]`일 때 Embed description에 `💞 이번 주 베스트 페어 TOP 5` 미포함, 기존 4섹션은 모두 포함 |
| 2 | 친밀도 섹션 정상 출력 | 페어 5쌍 + 양측 공개 → "1. A ↔ B — Hh Mm (Ns세션)" 5줄 포함 |
| 3 | 한쪽 비공개 익명화 | userA가 disabled → "1. ??? ↔ B — Hh Mm (Ns세션, 1명 비공개)" |
| 4 | 양측 비공개 제거 | 페어 5쌍 중 1쌍 양측 disabled → 섹션에 4줄만 포함 |
| 5 | 5쌍 전부 양측 비공개 → 섹션 미출력 | description에 `💞` 헤더 미포함 |
| 6 | `getTopPairs()` 실패 → 다른 섹션 정상 | mock이 throw해도 sendMessage 호출됨, description에 친밀도 섹션 없음 |
| 7 | `getDisabledUserIds()` 실패 → 사생활 우선 섹션 제거 | privacy mock throw → 섹션 미출력, 다른 섹션 정상 |
| 8 | `topPairs.length === 0` (실데이터 0건) → 섹션 미출력 | `getTopPairs` 정상이지만 빈 배열 |
| 9 | 섹션 위치 검증 | description 내 인덱스 순서: 이번 주 vs 지난 주 < TOP 5 유저 < TOP 3 채널 < 💞 베스트 페어 < AI 종합 분석 |
| 10 | 시간 포맷 검증 | `totalMinutes=750` → "12시간 30분", `totalMinutes=45` → "45분" |

### 9.2 통합 테스트 (선택)

- `WeeklyReportScheduler` 트리거 → 실제 DB로부터 페어 집계 → privacy 적용 → DM 페이로드 검증.
- 기존 `weekly-report.scheduler.spec.ts`에 케이스 추가하지 않고 단위 테스트로 갈음 가능.

---

## 10. 코드 스타일 / ESLint

### 10.1 50줄 룰 준수

기존 `buildPayload()`는 이미 `// eslint-disable-next-line max-lines-per-function`이 적용되어 있다. 본 변경에서는:

- **신규 라인을 `buildPayload()`에 직접 추가하지 않는다** — 한 줄(`appendCoPresenceSection()` 호출)만 추가하고 본체는 별도 헬퍼로 분리.
- `appendCoPresenceSection()`, `applyPrivacyFilter()`, `fetchTopPairsSafely()`, `applyPrivacyFilterSafely()`는 각각 **20줄 이하**로 작성한다.
- `collectReportData()`도 50줄 근처가 되므로, 50줄 초과 시 `eslint-disable` 없이 추가 헬퍼(`runAiAnalysisSafely()` 등)로 분리.

### 10.2 ESLint 자동 강제 규칙 준수

- `type` import 분리: `import type { TopPairItem } from '...'`
- `any` 금지: `Set<string>` 등 명시 타입 사용
- floating promise 금지: 모든 비동기 호출에 `await` 또는 `void`
- `no-magic-numbers`: `5`(TOP 한도), `7`(REPORT_PERIOD_DAYS — 기존 상수 재사용) 모두 const로 추출
- 함수 50줄 초과 (warn): 위 §10.1 분리로 회피
- catch 블록: `getErrorStack(err)` 헬퍼 사용 (기존 패턴 유지)

### 10.3 수동 확인 사항

- Boolean 변수명: `aHidden`, `bHidden` → 형식 미준수. `isAHidden`, `isBHidden`으로 작성.
- 함수명: `appendCoPresenceSection`, `applyPrivacyFilter`, `fetchTopPairsSafely`, `formatPairTime` 모두 동사 시작.
- 주석: "왜" 중심 — opt-out 익명화 정책의 사생활 우선 원칙은 한 줄로 주석 명시.

---

## 11. 마이그레이션 / 배포

- **DB 마이그레이션 불필요**: 기존 엔티티 그대로 사용.
- **환경 변수 변경 없음**: 기존 `WEB_URL`만 사용.
- **기능 플래그 불필요**: `topPairs` 빈 배열일 때 자동 미출력되므로, 적재량 부족한 길드에서도 자연 비활성.
- **롤백 전략**: PR revert만으로 즉시 롤백 가능. DB 변경 없음.

---

## 12. 회귀 검증 체크리스트

- [ ] 기존 4섹션 (이번 주 vs 지난 주 / TOP 5 유저 / TOP 3 채널 / AI 종합 분석) 출력 동일
- [ ] 친밀도 섹션이 TOP 3 채널과 AI 종합 분석 사이에 위치
- [ ] 양측 비공개 페어가 결과에 노출되지 않음
- [ ] 한쪽 비공개 페어가 `???`로 익명화되고 `1명 비공개` 비고 표시
- [ ] `topPairs` 0건일 때 섹션 헤더(`💞 이번 주 베스트 페어 TOP 5`) 미출력
- [ ] `getTopPairs()` 실패 시 다른 섹션 정상 발송 (스케줄러 throw 없음)
- [ ] `getDisabledUserIds()` 실패 시 사생활 우선으로 섹션 제거 + 다른 섹션 정상
- [ ] AI 프롬프트 보강 시(§3.2 적용 시) `topPairs` 미전달이어도 기존 동작 동일
- [ ] Embed 색상/타이틀/타임스탬프/링크 버튼 변경 없음
- [ ] 단위 테스트 10건 모두 통과
- [ ] `pnpm --filter @onyu/api lint` 0 warnings

---

## 13. 위험 및 트레이드오프

| 항목 | 영향 | 완화 |
|------|------|------|
| `UserPrivacyConfigService` 미구현 상태 | 본 계획 단독 진행 시 컴파일 실패 | §2 결정 사항에 따라 선행/동봉 분기 |
| Embed description 길이 한도 (4096자) | 페어 5쌍 + 닉네임 길이에 따라 길어질 수 있음 | 닉네임 30자 trim 또는 description 길이 검사 — 현재 PRD에 트리밍 명시 없으므로 후속 과제 |
| 양측 비공개 페어 제거로 5건 미만 출력 | 사용자가 "왜 4쌍만 보이지?" 의문 | "1명 비공개" 표기로 부분 노출 시 시그널 제공. 양측 비공개는 표기 자체가 사생활 침해이므로 제거 정책 유지 |
| `getTopPairs()` 쿼리 비용 | `PairDaily`에서 GROUP BY + ORDER BY 합산. 현재 인덱스(`IDX_copresence_pair_guild_date`)로 충분 | 별도 인덱스 추가 불필요 |
| AI 프롬프트 토큰 증가 | 페어 5쌍 추가 시 약 200~300 토큰 증가 | `maxOutputTokens: 512` 그대로 유지, 입력 토큰 예산 충분 |

---

## 14. 작업 순서 (PR 분할 권장)

1. **PR 1**: `CoPresenceModule.exports`에 `CoPresenceAnalyticsService` 추가 (단순 노출 변경, 영향 0)
2. **PR 2**: `WeeklyReportService` 본문 변경 + 단위 테스트 추가 (메인 PR)
3. **PR 3 (선택)**: `VoiceAiAnalysisService.generateWeeklyReport()` 시그니처 확장 + 프롬프트 보강

PR 1은 다른 PR과 무관하므로 단독 머지 가능. PR 2가 본 계획의 핵심.
