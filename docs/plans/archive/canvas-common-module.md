# Canvas 공통 모듈 추출 — 구현 계획

> 작성일: 2026-05-04
> 입력 문서: `docs/specs/common-modules.md` Part D-1, `docs/specs/prd/voice-co-presence.md` (F-COPRESENCE-014/015), `docs/plans/best-friend-discord-feature.md` §2A
> 선행 PR(단독): `refactor: profile-card-renderer 헬퍼를 common/canvas로 추출`

---

## 1. 작업 목적

`apps/api/src/channel/voice/application/profile-card-renderer.ts`의 `private` 헬퍼·모듈 스코프 함수·색상 팔레트·폰트 등록 로직을 `apps/api/src/common/canvas/` 공통 모듈로 추출하여, Phase 5에서 신설될 `BestFriendCardRenderer`(F-COPRESENCE-014)·`AffinityCardRenderer`(F-COPRESENCE-015)가 동일 시각 톤(BLURPLE 팔레트, 800px 폭, 통계 카드, 막대 차트 등)을 즉시 재사용할 수 있도록 한다.

핵심 효과:

- 헬퍼·색상 단일 진실 공급원(SSoT) 확보 → UI 변경 시 1곳만 수정
- 폰트 등록을 모듈 단위 1회(`onModuleInit`)로 일원화 → 다중 렌더러 등록 시 로그 중복·등록 중복 제거
- voice-co-presence Phase 5의 신규 렌더러 작업이 `ProfileCardRenderer`를 건드리지 않고도 진행 가능 (도메인 충돌 회피)

---

## 2. 작업 범위 및 파일 목록

### 2.1. 신규 생성

| 파일 | 역할 |
|------|------|
| `apps/api/src/common/canvas/canvas-fonts.ts` | `CanvasFontsService` — `NotoSansCJK`, `NotoColorEmoji` 다중 경로 등록 (현재 `ProfileCardRenderer.registerFonts()` 추출) |
| `apps/api/src/common/canvas/canvas-helpers.ts` | `roundRect`, `truncateName`, `drawStatCardWithSub`, `drawBarChart` (순수 함수 export) |
| `apps/api/src/common/canvas/canvas-format.ts` | `formatTime(sec)`, `normalizeDisplayName(name)` |
| `apps/api/src/common/canvas/canvas-palette.ts` | 색상·레이아웃 상수 (`BG`, `CARD_BG`, `ACCENT`, `BLURPLE`, `BLURPLE_DIM`, `TEXT_PRIMARY`, `TEXT_SECONDARY`, `TEXT_MUTED`, `BAR_EMPTY`, `DIVIDER`, `BORDER`, `RANK_BG`, `RANK_BORDER`, `MIC_ON_COLOR`, `MIC_OFF_COLOR`) |
| `apps/api/src/common/canvas/canvas.module.ts` | `CanvasModule` (`onModuleInit`에서 `CanvasFontsService.register()` 1회 호출) |
| `apps/api/src/common/canvas/index.ts` | barrel export (외부 노출 인터페이스) |

### 2.2. 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/channel/voice/application/profile-card-renderer.ts` | 1) 자체 `registerFonts()` private 메서드 제거, 생성자 빈 처리(또는 단순 logger 주입) 2) `roundRect`, `truncateName`, `drawStatCardWithSub`, `drawBarChart` private 메서드 제거 → 공통 헬퍼 import로 대체 3) 모듈 스코프 `formatTime`, `normalizeDisplayName` 제거 → 공통 import 4) 색상·레이아웃 상수 제거 → 공통 import (단, `MIC_ON_COLOR` / `MIC_OFF_COLOR`는 공통에 포함하되 `/me` 전용 사용은 그대로 유지). public method 시그니처(`render(profile, displayName, avatarUrl)`)는 변경 없음 |
| `apps/api/src/channel/voice/voice-channel.module.ts` | `imports`에 `CanvasModule` 추가 — `ProfileCardRenderer` provider가 등록된 모듈에서 폰트 등록 보장 |
| `apps/api/src/app.module.ts` | (선택) `CanvasModule`을 `@Global()`로 선언하지 않을 경우, 이 단계에서는 추가하지 않음. 본 계획은 **`CanvasModule`을 `VoiceChannelModule`에서만 import**하고 신규 도메인은 자체적으로 import하는 일반 모듈 패턴을 채택한다. |

### 2.3. 삭제 (수정 파일 내 코드 블록 제거)

| 위치 | 제거 대상 |
|------|-----------|
| `profile-card-renderer.ts` L17~34 | 색상 팔레트 모듈 스코프 상수 (`BG`, `CARD_BG`, ..., `MIC_OFF_COLOR`) |
| `profile-card-renderer.ts` L54~83 | `registerFonts()` private 메서드 |
| `profile-card-renderer.ts` L176~184 | `truncateName()` private 메서드 |
| `profile-card-renderer.ts` L396~430 | `drawStatCardWithSub()` private 메서드 |
| `profile-card-renderer.ts` L432~488 | `drawBarChart()` private 메서드 (단, `dailyChart` 고정 시그니처는 공통 헬퍼에서 일반화) |
| `profile-card-renderer.ts` L521~541 | `roundRect()` private 메서드 |
| `profile-card-renderer.ts` L548~558 | 모듈 스코프 `normalizeDisplayName()`, `formatTime()` |
| `profile-card-renderer.ts` 생성자 L50~52 | `this.registerFonts()` 호출 |

### 2.4. 잔류 (도메인 자산이므로 추출하지 않음)

| 위치 | 사유 |
|------|------|
| `drawHeader`, `drawRankCard`, `drawMicCard`, `drawBadgePills`, `buildFooterText` | `/me` 전용 레이아웃. 공통 헬퍼만 호출하는 구조로 변경 |
| `BADGE_DISPLAY`, `BADGE_PRIORITY`, `MAX_BADGE_DISPLAY` (`badge.constants.ts`) | self-diagnosis 도메인 자산 |
| `W=800`, `H=650`, `PADDING=32`, `CARD_RADIUS=16`, 뱃지 pill 상수, `MAX_EXCLUDED_DISPLAY` | `/me` 전용 레이아웃 상수. 공통화 시 신규 카드 폭/높이 변경에 영향이 커서 분리 보류. (**주의**: common-modules.md L59는 `LAYOUT.WIDTH` 네임스페이스 추출을 권고하나, 본 단독 PR에서는 회귀 표면을 줄이기 위해 `/me` 전용으로 잔류시키고, 신규 렌더러 작업 시 필요한 상수만 점진 추출) |

---

## 3. 디렉터리 구조

```
apps/api/src/common/canvas/
  canvas-fonts.ts        # CanvasFontsService (Injectable)
  canvas-helpers.ts      # roundRect, truncateName, drawStatCardWithSub, drawBarChart
  canvas-format.ts       # formatTime, normalizeDisplayName
  canvas-palette.ts      # BG, CARD_BG, ACCENT, BLURPLE, ... 색상 상수
  canvas.module.ts       # CanvasModule (onModuleInit 폰트 등록)
  index.ts               # barrel export
```

`index.ts` 노출 항목:

```ts
export * from './canvas-fonts';
export * from './canvas-format';
export * from './canvas-helpers';
export * from './canvas-palette';
export * from './canvas.module';
```

---

## 4. 단계별 구현 순서

### Step 1: 공통 모듈 신규 파일 생성

1. `canvas-palette.ts` — 색상 상수 14종 `export const` 추출. `as const` 미사용(매직 넘버 ESLint 회피용 단순 명명). 주석에 사용처 한 줄.
2. `canvas-format.ts` — `formatTime(sec: number): string`, `normalizeDisplayName(name: string): string` 그대로 추출. JSDoc 보존.
3. `canvas-helpers.ts` — 4개 함수 추출:
   - `roundRect(ctx, x, y, w, h, r)` — 파라미터 6개이지만 Canvas API 표준 시그니처라 객체화 시 가독성 저하. 기존과 동일하게 유지하되 `// eslint-disable-next-line max-params` 주석 그대로 이전.
   - `truncateName(ctx, name, maxWidth)` — 그대로.
   - `drawStatCardWithSub(ctx, params)` — params 객체 시그니처 유지. 색상 의존을 인자로 받지 않고 `canvas-palette` 직접 import (라이브러리가 아닌 도메인 일관 카드이므로 의존 주입 불필요).
   - `drawBarChart(ctx, params)` — 기존은 `dailyChart: DailyChartEntry[]`와 `badgeOffset` 두 인자였으나, 공통 추출 시 `DailyChartEntry`가 `me-profile.service.ts`의 도메인 타입이므로 **공통에서는 일반화된 인터페이스로 변경**:
     ```ts
     interface BarChartEntry { date: string; value: number; }
     interface DrawBarChartParams {
       x: number; y: number; w: number; h: number;
       entries: BarChartEntry[];
       title?: string; // 헤더 텍스트
     }
     ```
     `ProfileCardRenderer`에서는 호출부에서 `dailyChart.map(d => ({ date: d.date, value: d.durationSec }))`로 어댑팅. 기존 `badgeOffset` 위치 계산은 호출부에서 `y: 398 + badgeOffset` 형태로 전달.
4. `canvas-fonts.ts` — `CanvasFontsService` 클래스:
   - `@Injectable()`
   - `private readonly logger = new Logger(CanvasFontsService.name)`
   - `private isRegistered = false` 플래그로 멱등성 보장
   - `register(): void` — 기존 `registerFonts()` 본문 그대로 옮김. CJK·이모지 폰트 다중 경로 시도.
5. `canvas.module.ts`:
   ```ts
   @Module({
     providers: [CanvasFontsService],
     exports: [CanvasFontsService],
   })
   export class CanvasModule implements OnModuleInit {
     constructor(private readonly fonts: CanvasFontsService) {}
     onModuleInit(): void { this.fonts.register(); }
   }
   ```
   `@Global()` 선언하지 않음 — 사용 도메인에서 명시적 import (의존성 명확성 우선).
6. `index.ts` — barrel export.

### Step 2: ProfileCardRenderer 리팩토링

1. 색상 팔레트·`registerFonts`·헬퍼 메서드·모듈 스코프 함수 일괄 삭제 (위 §2.3 목록).
2. import 추가:
   ```ts
   import {
     BG, CARD_BG, ACCENT, BLURPLE, BLURPLE_DIM,
     TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
     BAR_EMPTY, DIVIDER, BORDER, RANK_BG, RANK_BORDER,
     MIC_ON_COLOR, MIC_OFF_COLOR,
     drawStatCardWithSub, drawBarChart, roundRect, truncateName,
     formatTime, normalizeDisplayName,
   } from '../../../common/canvas';
   ```
3. 생성자에서 `this.registerFonts()` 제거. 폰트 등록은 `CanvasModule`이 담당.
4. `private` 헬퍼 호출부를 공통 함수 호출로 변경:
   - `this.roundRect(...)` → `roundRect(...)`
   - `this.truncateName(...)` → `truncateName(...)`
   - `this.drawStatCardWithSub(...)` → `drawStatCardWithSub(...)`
   - `this.drawBarChart(dailyChart, badgeOffset)` → `drawBarChart(ctx, { x: PADDING + 16, y: 398 + badgeOffset, w: W - PADDING * 2 - 32, h: 170, entries: dailyChart.map(d => ({ date: d.date, value: d.durationSec })), title: '📅 최근 15일 활동' })`
5. `formatTime`, `normalizeDisplayName` 호출부는 그대로 (모듈 스코프에서 import된 함수 호출로 자동 전환).
6. `BADGE_*`, `PILL_*`, `MAX_EXCLUDED_DISPLAY`, `W`, `H`, `PADDING`, `CARD_RADIUS`는 파일 내 상수로 잔류.

### Step 3: VoiceChannelModule import 추가

```ts
// voice-channel.module.ts
import { CanvasModule } from '../../common/canvas';

@Module({
  imports: [
    TypeOrmModule.forFeature([...]),
    ChannelModule,
    forwardRef(() => VoiceAnalyticsModule),
    CanvasModule, // ← 추가
  ],
  ...
})
```

`AppModule`은 변경하지 않는다 — `CanvasModule`은 사용 도메인에서 명시적으로 import하는 패턴.

### Step 4: 컴파일·테스트·실기 검증

1. `pnpm --filter @nexus/api build` → 타입 에러 0건 확인.
2. `pnpm --filter @nexus/api lint` → ESLint 신규 위반 0건 확인.
3. `pnpm --filter @nexus/api test` → 기존 테스트 회귀 없음 확인 (`profile-card-renderer.spec.ts`가 있다면 보존, 없다면 신규 작성 보류).
4. 도커 dev 환경 빌드 + 실행 후 디스코드에서 `/me` 명령어 실행 → §6 회귀 체크리스트로 검증.

---

## 5. 회귀 테스트 체크리스트 (`/me` 동작 보존)

도커 dev 컨테이너에서 다음을 수동 확인한다.

- [ ] `/me` 명령어가 PNG 이미지를 정상 첨부 응답한다 (이미지 파일 다운로드 가능)
- [ ] 카드 헤더의 본인 아바타 원형 마스킹 + BLURPLE 외곽선이 동일하게 렌더된다
- [ ] 닉네임이 한글·이모지 포함 케이스에서 깨지지 않는다 (`normalizeDisplayName` 동작 확인)
- [ ] 닉네임이 카드 폭을 초과할 때 `...` truncate가 동작한다 (`truncateName`)
- [ ] 뱃지 pill이 1~5개 표시되며 각 색상이 기존과 동일하다
- [ ] 뱃지 유무에 따른 `badgeOffset = 18 | 0` 분기 정상 (전체 캔버스 높이 차이 확인)
- [ ] 순위 카드의 `RANK_BG`/`RANK_BORDER` 색상, 진행 바, 상위 % 텍스트 정상
- [ ] Row 1 통계 카드 3개(총 음성 시간, 활동일 수, 일평균) 색상·서식 동일
- [ ] 마이크 카드의 ON/OFF 비율 바 색상(`MIC_ON_COLOR` 초록, `MIC_OFF_COLOR` 빨강) 동일
- [ ] 혼자 비율·주평균/피크요일 카드(`drawStatCardWithSub`) 정상 — 공통 헬퍼 사용 확인
- [ ] 일별 막대 차트(`drawBarChart`) — 15개 막대, 짝수 인덱스에 `dd` 라벨, 0초인 날 짧은 흐린 바 표시 정상
- [ ] Footer "통계 제외 채널: ..." 텍스트가 5개까지 표시 + `... 외 N개` 동일
- [ ] `formatTime(0)` → `'0분'`, `formatTime(3600)` → `'1시간 0분'`, `formatTime(60)` → `'1분'` 출력 동일
- [ ] API 컨테이너 로그에서 `CJK font registered` / `Emoji font registered` 메시지가 **단 1회씩만** 출력된다 (중복 등록 없음)
- [ ] API 부팅 후 `ProfileCardRenderer` 인스턴스 생성 시 폰트 등록 로그가 추가로 출력되지 않는다 (생성자에서 `registerFonts` 제거 확인)

---

## 6. 의존성 영향 분석

`ProfileCardRenderer`의 사용처는 다음 2곳이며, 외부 인터페이스(`render(profile, displayName, avatarUrl): Promise<Buffer>`)를 변경하지 않으므로 호출 측 코드 수정은 불필요하다.

| 사용처 | 영향 |
|--------|------|
| `apps/api/src/channel/voice/voice-channel.module.ts` | provider/exports 등록 그대로. `CanvasModule` import만 추가 |
| `apps/api/src/bot-api/me/bot-me.controller.ts` | `profileCardRenderer.render(...)` 호출. 시그니처 동일하므로 변경 없음 |

향후 흡수 예정(이 PR 범위 외):

| 향후 사용처 | 의존 |
|-------------|------|
| `apps/api/src/channel/voice/co-presence/application/best-friend-card-renderer.ts` (신규) | `CanvasModule` import + 헬퍼 사용 |
| `apps/api/src/channel/voice/co-presence/application/affinity-card-renderer.ts` (신규) | 동일 |

---

## 7. 코드 스타일 준수 사항 (CLAUDE.md / docs/guides/code-style-guide.md)

- **import 순서**: ESLint 자동 정렬에 맡김 (`import-order`).
- **type import 분리**: 헬퍼 시그니처에 사용되는 `SKRSContext2D` 등은 `import type { ... }` 형식 유지.
- **함수명**: 동사 시작 — `formatTime`, `normalizeDisplayName`, `truncateName`, `drawStatCardWithSub`, `drawBarChart`, `roundRect` 모두 동사형 OK.
- **boolean**: `CanvasFontsService.isRegistered` — `is` 접두사 준수.
- **함수 50줄 초과 금지**: `drawBarChart`는 약 50줄 이내. `drawStatCardWithSub`는 단일 카드 그리기 한 가지 일.
- **파라미터 3개 초과**: `roundRect(ctx, x, y, w, h, r)`는 6개이나 Canvas API 표준 시그니처라 `// eslint-disable-next-line max-params` 주석으로 정당화 (기존 코드 유지).
- **매직 넘버**: 색상 팔레트는 `canvas-palette.ts`의 명명 상수로 추출 완료. 레이아웃 매직 넘버(`32`, `16`, `8` 등)는 호출부에서 의미 단위로 사용되므로 유지하되, 신규 헬퍼 작성 시 `padding`, `radius` 등 파라미터로 받아 의미를 부여.
- **JSDoc**: 공용 함수(`formatTime`, `normalizeDisplayName`, `drawStatCardWithSub`, `drawBarChart`, `truncateName`, `roundRect`)에 1줄 설명 + 파라미터 의미 작성.
- **주석**: why만 — `CanvasFontsService.isRegistered` 멱등성 의도, `truncateName`의 ellipsis 추가 사유, `roundRect`의 `max-params` disable 사유 등.
- **신규 ESLint 위반 0건**: 추출 후 lint 실행으로 검증.

---

## 8. 충돌·리스크 관리

| 리스크 | 완화 |
|--------|------|
| 공통 모듈 추출 PR과 신규 렌더러 작성 PR을 동시 진행 시 import 경로 충돌 | 본 PR은 **단독 머지** 후 voice-co-presence Phase 5 분기 (common-modules.md L84~87 명문화) |
| `drawBarChart` 시그니처 변경(`DailyChartEntry` → `BarChartEntry`)으로 인한 `/me` 호출부 회귀 | 호출부 어댑터(`map(d => ({ date, value: durationSec }))`)로 흡수. 회귀 체크리스트 §5에서 시각 검증 |
| 폰트 등록이 `onModuleInit` 시점으로 이동되어 `ProfileCardRenderer` 단독 단위 테스트(생성자만 호출)에서 폰트 미등록으로 실패 가능 | 단위 테스트가 폰트 의존이라면 `Test.createTestingModule({ imports: [CanvasModule], ... })` 형태로 변경. 현재 spec 파일이 없으므로 위험 낮음 |
| `CanvasModule`이 `@Global()`이 아니므로, 향후 신규 도메인이 import 누락 시 폰트 미등록 발생 | `CanvasFontsService.register()` 메서드를 멱등(`isRegistered` 플래그)으로 만들고, 누락 시 글자 깨짐을 즉시 인지할 수 있도록 fallback CJK font 사용 시점에 logger.warn 보강 (선택) |
| `@Global()` 미사용 결정 — common-modules.md는 명시 안 함 | 본 계획은 명시적 의존성 우선으로 `@Global()` 미사용. 만약 추후 import 누락 사례가 잦으면 `@Global()` 전환 검토 |

---

## 9. 단독 PR 산출물

- 커밋 메시지 (한국어, Conventional Commit 한 줄):
  ```
  refactor: profile-card-renderer 헬퍼를 common/canvas로 추출
  ```
- 변경 파일 수: 신규 6개 + 수정 2개 = 8개
- LOC 변화: 신규 약 +250 / 삭제(기존 파일 내) 약 -200 / 순증 약 +50

---

## 10. 미해결 / 후속 과제

- 레이아웃 상수 네임스페이스(`LAYOUT.WIDTH` 등) 공통 추출 — 본 PR 범위 외. 신규 렌더러 작성 시 필요한 상수만 추가 추출.
- `profile-card-renderer.spec.ts` 신규 작성 — 본 PR에서는 수동 회귀 테스트로 갈음. 향후 시각 회귀 자동화는 별도 후속.
- `BestFriendCardRenderer` / `AffinityCardRenderer` 작업은 본 PR 머지 후 voice-co-presence Phase 5-1/5-2 계획에서 분기.
