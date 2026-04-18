# Self-Diagnosis 뱃지 표시 + 웹 설정 페이지 구현 계획

> PRD: [self-diagnosis.md](../specs/prd/self-diagnosis.md) (F-SD-007, F-SD-008)
> 공통 모듈: [common-modules.md](../specs/common-modules.md)
> 선행: T-SD-001~002 (LLM 추상화 + 디렉토리 이동), T-SD-003 (VoiceHealthConfig), T-SD-006 (뱃지 시스템) 완료 전제

## 목표

1. **T-SD-007**: `/me` 프로필 카드 헤더에 보유 뱃지를 pill 형태로 렌더링
2. **T-SD-008**: 웹 대시보드에 자가진단 정책 설정 페이지 신설

두 티켓은 서로 다른 도메인(voice, web)에서 작업하므로 병렬 진행 가능하다.

---

## T-SD-007: /me 프로필 카드 뱃지 표시

### 설계 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| 뱃지 데이터 접근 | `BadgeQueryService`를 VoiceAnalyticsModule에서 export, VoiceChannelModule에서 import | common-modules.md 2-4절 결정 사항. 엔티티 소유 모듈의 서비스를 통해 조회하는 NestJS 권장 패턴 |
| 순환 참조 대응 | `forwardRef(() => VoiceAnalyticsModule)` 사용 | VoiceAnalyticsModule이 VoiceRedisRepository를 직접 등록하고 있어 양방향 의존 발생 가능 |
| 뱃지 상수 참조 | `badge.constants.ts`에서 직접 import (파일 참조) | 모듈 의존이 아닌 상수 파일 참조이므로 DI 불필요 |
| 이름 truncate 기준 | 뱃지 포함 전체 너비가 캔버스 우측 여백을 초과할 때 말줄임 | 캔버스 800px, 좌측 여백 128px(아바타+간격), 우측 여백 48px |

### 변경 파일 목록

#### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/channel/voice/voice-channel.module.ts` | `VoiceAnalyticsModule` import 추가 (forwardRef) |
| `apps/api/src/channel/voice/application/me-profile.service.ts` | `BadgeQueryService` 주입, `MeProfileData`에 `badges` 필드 추가, `getProfile()`에서 뱃지 조회 |
| `apps/api/src/channel/voice/application/profile-card-renderer.ts` | `drawHeader()`에 뱃지 pill 렌더링 로직 추가, 이름 truncate 로직 추가 |
| `apps/api/src/channel/voice/application/me.command.ts` | 변경 없음 (MeProfileData 인터페이스 변경은 하위 호환) |

### 구현 단계

#### Step 1: VoiceChannelModule에 VoiceAnalyticsModule import 추가

```typescript
// voice-channel.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { VoiceAnalyticsModule } from '../../voice-analytics/voice-analytics.module';

@Module({
  imports: [
    // ... 기존 imports
    forwardRef(() => VoiceAnalyticsModule),
  ],
  // ...
})
```

> T-SD-001~002에서 gemini -> voice-analytics 디렉토리 이동이 선행되어야 한다. 이동 전이라면 경로를 `../../gemini/voice-analytics.module`로 사용.

#### Step 2: MeProfileData 인터페이스에 badges 필드 추가

```typescript
// me-profile.service.ts
export interface MeProfileData {
  // ... 기존 필드
  badges: string[]; // 추가: 뱃지 코드 배열 (예: ["ACTIVITY","CONSISTENT"])
}
```

#### Step 3: MeProfileService에 BadgeQueryService 주입 및 뱃지 조회

```typescript
// me-profile.service.ts
import { BadgeQueryService } from '../../../voice-analytics/self-diagnosis/badge-query.service';

@Injectable()
export class MeProfileService {
  constructor(
    @InjectRepository(VoiceDailyEntity)
    private readonly voiceDailyRepo: Repository<VoiceDailyEntity>,
    private readonly flushService: VoiceDailyFlushService,
    private readonly badgeQueryService: BadgeQueryService, // 추가
  ) {}

  async getProfile(guildId: string, userId: string, days: number): Promise<MeProfileData | null> {
    // ... 기존 로직

    // 뱃지 조회 (Promise.all에 추가)
    const [globalStats, channelRecords, rankInfo, dailyChart, badgeCodes] = await Promise.all([
      this.getGlobalStats(guildId, userId, start, end),
      this.getChannelRecords(guildId, userId, start, end),
      this.getRankInfo(guildId, userId, start, end),
      this.getDailyChart(guildId, userId),
      this.badgeQueryService.findBadgeCodes(guildId, userId), // 추가
    ]);

    // ... 기존 로직

    return {
      // ... 기존 필드
      badges: badgeCodes, // 추가
    };
  }
}
```

- `badgeQueryService.findBadgeCodes()`는 뱃지가 없으면 빈 배열을 반환하므로 null 체크 불필요
- 뱃지 조회 실패 시에도 프로필 카드가 정상 렌더링되어야 하므로, catch로 빈 배열 fallback 처리

#### Step 4: ProfileCardRenderer에 뱃지 pill 렌더링 추가

`drawHeader()` 메서드를 수정한다. 핵심 변경:

1. `render()` 메서드에 `profile.badges` 전달 (MeProfileData에 포함)
2. `drawHeader()`에 뱃지 렌더링 로직 추가
3. 이름이 길 경우 말줄임 처리

```typescript
// profile-card-renderer.ts 상단에 import 추가
import {
  BADGE_DISPLAY,
  BADGE_PRIORITY,
  MAX_BADGE_DISPLAY,
  type BadgeCode,
} from '../../../voice-analytics/self-diagnosis/badge.constants';
```

##### drawHeader() 수정 상세

```
레이아웃 계산:
  nameX = PADDING + 96 (기존, 아바타 오른쪽)
  nameY = headerY + 30 (기존)
  maxRight = W - PADDING - 16 (캔버스 우측 여백)

뱃지 pill 크기:
  pillH = 22           (pill 높이)
  pillPaddingX = 8     (pill 좌우 패딩)
  pillGap = 6          (pill 간 간격)
  pillRadius = 11      (pill 둥근 모서리, 높이의 절반)
  pillFont = 'bold 11px "NotoSansCJK", "NotoColorEmoji", sans-serif'

렌더링 순서:
  1. badges를 BADGE_PRIORITY 순으로 정렬, MAX_BADGE_DISPLAY(4)개로 자르기
  2. 각 pill의 너비 계산: measureText(icon + name) + paddingX * 2
  3. 전체 뱃지 너비 합산: sum(pillWidths) + (count - 1) * pillGap
  4. 사용 가능한 이름 영역: maxRight - 전체 뱃지 너비 - pillGap - nameX
  5. 이름이 사용 가능한 영역보다 넓으면 truncate (말줄임 '...')
  6. 이름 렌더링
  7. 뱃지 pill 렌더링 (이름 오른쪽부터)

각 pill 렌더링:
  - roundRect로 배경 (bgColor)
  - 텍스트: "{icon}{name}" (textColor)
  - 수직 정렬: nameY 기준 중앙
```

##### truncateName 헬퍼 추가

```typescript
private truncateName(
  ctx: SKRSContext2D,
  name: string,
  maxWidth: number,
): string {
  if (ctx.measureText(name).width <= maxWidth) return name;

  let truncated = name;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}
```

##### drawBadgePills 메서드 신설

```typescript
private drawBadgePills(
  ctx: SKRSContext2D,
  badges: string[],
  startX: number,
  centerY: number,
): void {
  const sorted = BADGE_PRIORITY
    .filter((code) => badges.includes(code))
    .slice(0, MAX_BADGE_DISPLAY);

  if (sorted.length === 0) return;

  const PILL_H = 22;
  const PILL_PX = 8;
  const PILL_GAP = 6;
  const PILL_R = 11;

  ctx.font = 'bold 11px "NotoSansCJK", "NotoColorEmoji", sans-serif';

  let x = startX;
  for (const code of sorted) {
    const display = BADGE_DISPLAY[code as BadgeCode];
    const text = `${display.icon}${display.name}`;
    const textWidth = ctx.measureText(text).width;
    const pillW = textWidth + PILL_PX * 2;

    // pill 배경
    this.roundRect(ctx, x, centerY - PILL_H / 2, pillW, PILL_H, PILL_R);
    ctx.fillStyle = display.bgColor;
    ctx.fill();

    // pill 텍스트
    ctx.fillStyle = display.textColor;
    ctx.fillText(text, x + PILL_PX, centerY + 4);

    x += pillW + PILL_GAP;
  }
}
```

##### drawHeader() 호출 흐름 변경

기존 `drawHeader(ctx, displayName, avatarUrl)` 시그니처를 `drawHeader(ctx, displayName, avatarUrl, badges)` 로 변경한다.

```typescript
async render(profile: MeProfileData, displayName: string, avatarUrl: string): Promise<Buffer> {
  // ...
  await this.drawHeader(ctx, displayName, avatarUrl, profile.badges);
  // ...
}

private async drawHeader(
  ctx: SKRSContext2D,
  displayName: string,
  avatarUrl: string,
  badges: string[], // 추가
): Promise<void> {
  // ... 아바타 렌더링 (기존과 동일)

  // 이름 + 뱃지 렌더링 (변경)
  const nameX = PADDING + 96;
  const nameY = headerY + 30;
  const maxRight = W - PADDING - 16;

  ctx.font = 'bold 28px "NotoSansCJK", "NotoColorEmoji", sans-serif';

  // 뱃지 전체 너비 계산
  const pillFont = 'bold 11px "NotoSansCJK", "NotoColorEmoji", sans-serif';
  const sortedBadges = BADGE_PRIORITY
    .filter((code) => badges.includes(code))
    .slice(0, MAX_BADGE_DISPLAY);

  let totalBadgeWidth = 0;
  if (sortedBadges.length > 0) {
    ctx.save();
    ctx.font = pillFont;
    for (const code of sortedBadges) {
      const display = BADGE_DISPLAY[code as BadgeCode];
      totalBadgeWidth += ctx.measureText(`${display.icon}${display.name}`).width + 16; // + paddingX*2
    }
    totalBadgeWidth += (sortedBadges.length - 1) * 6; // gaps
    ctx.restore();
    ctx.font = 'bold 28px "NotoSansCJK", "NotoColorEmoji", sans-serif';
  }

  const badgeGap = sortedBadges.length > 0 ? 12 : 0;
  const maxNameWidth = maxRight - nameX - totalBadgeWidth - badgeGap;
  const truncatedName = this.truncateName(ctx, displayName, maxNameWidth);

  // 이름 렌더링
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.fillText(truncatedName, nameX, nameY);

  // 뱃지 렌더링
  if (sortedBadges.length > 0) {
    const nameWidth = ctx.measureText(truncatedName).width;
    const badgeStartX = nameX + nameWidth + badgeGap;
    this.drawBadgePills(ctx, badges, badgeStartX, nameY - 8); // centerY 보정
  }

  // 나머지 (부제, 구분선) 기존과 동일
}
```

### 엣지 케이스 처리

| 상황 | 처리 |
|------|------|
| 뱃지 없음 (`badges = []`) | 기존과 동일하게 이름만 렌더링. `drawBadgePills` 호출 안 함 |
| 뱃지 5개 (전부 보유) | `MAX_BADGE_DISPLAY=4`로 잘라내기. ACTIVITY > SOCIAL > HUNTER > CONSISTENT 순 표시, MIC 생략 |
| 이름 30자 이상 + 뱃지 4개 | 이름 truncate ('닉네임이아주길어서...' + 뱃지 pills) |
| BadgeQueryService 조회 실패 | `findBadgeCodes()` 호출을 try-catch로 감싸서 빈 배열 fallback |
| voice_health_badge 레코드 미존재 | `BadgeQueryService.findBadgeCodes()`가 `[]` 반환 (이미 구현됨) |

---

## T-SD-008: 웹 대시보드 자가진단 정책 설정 페이지

### 설계 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| API 경로 | `GET/POST /api/guilds/:guildId/voice-health/config` | PRD F-SD-003 정의 |
| API 위치 | `voice-analytics/self-diagnosis/self-diagnosis.controller.ts` | VoiceAnalyticsModule 내부, 기존 controller 추가 |
| 인증 | `JwtAuthGuard` 컨트롤러 레벨 | 기존 패턴 동일 (MonitoringController, InactiveMemberController) |
| 폼 상태 관리 | React useState + 단일 form 객체 | 기존 inactive-member 설정 페이지 패턴 동일 |
| 슬라이더 UI | range input + 현재값 표시 | 비율/임계값 설정에 적합 |
| API 클라이언트 | `apps/web/app/lib/voice-health-api.ts` 신규 | 기존 패턴 (inactive-member-api.ts 등) 동일 |

### 변경 파일 목록

#### 신규 생성

| 파일 | 역할 |
|------|------|
| `apps/web/app/settings/guild/[guildId]/voice-health/page.tsx` | 자가진단 설정 페이지 컴포넌트 |
| `apps/web/app/lib/voice-health-api.ts` | API 클라이언트 (fetch/save config) |

#### 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/web/app/components/SettingsSidebar.tsx` | menuItems에 "자가진단 설정" 항목 추가, `HeartPulse` 아이콘 import |

> API 엔드포인트(`self-diagnosis.controller.ts`)와 `VoiceHealthConfigRepository`는 T-SD-003에서 이미 구현되어 있는 것을 전제한다. 미구현 시 이 계획에서 함께 구현한다.

### 구현 단계

#### Step 1: API 클라이언트 생성

```typescript
// apps/web/app/lib/voice-health-api.ts

export interface VoiceHealthConfig {
  isEnabled: boolean;
  analysisDays: number;
  cooldownHours: number;
  isLlmSummaryEnabled: boolean;
  minActivityMinutes: number;
  minActiveDaysRatio: number;
  hhiThreshold: number;
  minPeerCount: number;
  badgeActivityTopPercent: number;
  badgeSocialHhiMax: number;
  badgeSocialMinPeers: number;
  badgeHunterTopPercent: number;
  badgeConsistentMinRatio: number;
  badgeMicMinRate: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function fetchVoiceHealthConfig(
  guildId: string,
): Promise<VoiceHealthConfig> {
  const res = await fetch(
    `${API_BASE}/api/guilds/${guildId}/voice-health/config`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error('설정 조회에 실패했습니다.');
  return res.json();
}

export async function saveVoiceHealthConfig(
  guildId: string,
  config: VoiceHealthConfig,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/guilds/${guildId}/voice-health/config`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    },
  );
  if (!res.ok) throw new Error('설정 저장에 실패했습니다.');
}
```

#### Step 2: SettingsSidebar 메뉴 항목 추가

```diff
// apps/web/app/components/SettingsSidebar.tsx

-import { ArrowLeftRight, BarChart3, Mic, Pin, Radio, Settings, Tag, Users, UserX } from "lucide-react";
+import { ArrowLeftRight, BarChart3, HeartPulse, Mic, Pin, Radio, Settings, Tag, Users, UserX } from "lucide-react";

 const menuItems = [
   // ... 기존 항목
   { href: `/settings/guild/${selectedGuildId}/inactive-member`, label: "비활동 회원 설정", icon: UserX },
+  { href: `/settings/guild/${selectedGuildId}/voice-health`, label: "자가진단 설정", icon: HeartPulse },
 ];
```

#### Step 3: 설정 페이지 컴포넌트 구현

파일: `apps/web/app/settings/guild/[guildId]/voice-health/page.tsx`

페이지 구조:

```
VoiceHealthSettingsPage
  ├── 페이지 헤더 (HeartPulse 아이콘 + "자가진단 설정" 제목)
  ├── 섹션 1: 기본 설정
  │   ├── 기능 활성화 토글 (isEnabled)
  │   ├── 분석 기간 입력 (analysisDays, 7~90)
  │   ├── 쿨다운 시간 입력 (cooldownHours, 1~168)
  │   └── AI 요약 활성화 토글 (isLlmSummaryEnabled)
  ├── 섹션 2: 정책 기준
  │   ├── 최소 활동 시간 입력 (minActivityMinutes, 분)
  │   ├── 최소 활동일 비율 슬라이더 (minActiveDaysRatio, 0~100%)
  │   ├── HHI 임계값 슬라이더 (hhiThreshold, 0~1.00)
  │   └── 최소 교류 인원 입력 (minPeerCount)
  ├── 섹션 3: 뱃지 기준
  │   ├── 활동왕 기준 입력 (badgeActivityTopPercent, 1~100%)
  │   ├── 사교왕 HHI 상한 슬라이더 (badgeSocialHhiMax, 0~1.00)
  │   ├── 사교왕 최소 인원 입력 (badgeSocialMinPeers)
  │   ├── 헌터 기준 입력 (badgeHunterTopPercent, 1~100%)
  │   ├── 꾸준러 비율 슬라이더 (badgeConsistentMinRatio, 0~100%)
  │   └── 소통러 비율 슬라이더 (badgeMicMinRate, 0~100%)
  └── 저장 버튼 + 성공/실패 토스트
```

##### 폼 기본값

```typescript
const DEFAULT_CONFIG: VoiceHealthConfig = {
  isEnabled: false,
  analysisDays: 30,
  cooldownHours: 24,
  isLlmSummaryEnabled: false,
  minActivityMinutes: 600,
  minActiveDaysRatio: 0.50,
  hhiThreshold: 0.30,
  minPeerCount: 3,
  badgeActivityTopPercent: 10,
  badgeSocialHhiMax: 0.25,
  badgeSocialMinPeers: 5,
  badgeHunterTopPercent: 10,
  badgeConsistentMinRatio: 0.80,
  badgeMicMinRate: 0.70,
};
```

##### 초기 데이터 로드

- `useEffect`에서 `fetchVoiceHealthConfig(selectedGuildId)` 호출
- 404 응답(설정 미존재)이면 `DEFAULT_CONFIG` 사용
- 로딩 중 `Loader2` 스피너 표시

##### UI 컴포넌트 패턴

토글:
```tsx
<label className="flex items-center justify-between">
  <span>기능 활성화</span>
  <input
    type="checkbox"
    checked={form.isEnabled}
    onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
    className="..."
  />
</label>
```

숫자 입력:
```tsx
<label>
  <span>분석 기간 (일)</span>
  <input
    type="number"
    min={7} max={90}
    value={form.analysisDays}
    onChange={(e) => setForm({ ...form, analysisDays: Number(e.target.value) })}
    className="..."
  />
</label>
```

슬라이더 (비율):
```tsx
<label>
  <span>최소 활동일 비율: {Math.round(form.minActiveDaysRatio * 100)}%</span>
  <input
    type="range"
    min={0} max={100} step={1}
    value={Math.round(form.minActiveDaysRatio * 100)}
    onChange={(e) => setForm({ ...form, minActiveDaysRatio: Number(e.target.value) / 100 })}
    className="..."
  />
</label>
```

##### 저장 핸들러

```typescript
const handleSave = async () => {
  setIsSaving(true);
  setSaveError(null);
  try {
    await saveVoiceHealthConfig(selectedGuildId, form);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  } catch (err) {
    setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
  } finally {
    setIsSaving(false);
  }
};
```

##### 입력 유효성 검증

프론트엔드에서 기본 range 제한 (min/max 속성)으로 처리하고, 서버 측 DTO 검증은 T-SD-003의 `class-validator` 데코레이터에서 수행한다.

| 필드 | 타입 | 범위 |
|------|------|------|
| analysisDays | number | 7~90 |
| cooldownHours | number | 1~168 |
| minActivityMinutes | number | 1~ |
| minActiveDaysRatio | decimal | 0.00~1.00 |
| hhiThreshold | decimal | 0.00~1.00 |
| minPeerCount | number | 1~ |
| badgeActivityTopPercent | number | 1~100 |
| badgeSocialHhiMax | decimal | 0.00~1.00 |
| badgeSocialMinPeers | number | 1~ |
| badgeHunterTopPercent | number | 1~100 |
| badgeConsistentMinRatio | decimal | 0.00~1.00 |
| badgeMicMinRate | decimal | 0.00~1.00 |

---

## API 엔드포인트 확인 (T-SD-003 선행)

T-SD-008의 프론트엔드가 호출하는 API 엔드포인트가 T-SD-003에서 구현되어야 한다. 미구현 시 아래 내용을 함께 구현한다.

### GET /api/guilds/:guildId/voice-health/config

- 인증: `@UseGuards(JwtAuthGuard)`
- 응답: `VoiceHealthConfig` 엔티티 (없으면 기본값 반환)
- 컨트롤러: `SelfDiagnosisController` (또는 별도 `VoiceHealthConfigController`)

### POST /api/guilds/:guildId/voice-health/config

- 인증: `@UseGuards(JwtAuthGuard)`
- Body: `VoiceHealthConfigDto` (class-validator로 검증)
- 동작: upsert (guildId 기준)
- 응답: 저장된 config 반환

---

## 통합 테스트 시나리오

### T-SD-007 검증

1. **뱃지 있는 사용자**: voice_health_badge에 `["ACTIVITY","CONSISTENT","MIC"]` 레코드 존재 -> `/me` 실행 -> 프로필 카드에 3개 pill 표시
2. **뱃지 없는 사용자**: voice_health_badge에 레코드 없음 -> `/me` 실행 -> 기존과 동일하게 이름만 표시
3. **뱃지 5개 보유**: 전부 보유 -> 우선순위 상위 4개만 표시 (MIC 생략)
4. **긴 이름 + 뱃지**: 20자 이상 닉네임 + 뱃지 3개 -> 이름이 말줄임 처리됨
5. **VoiceAnalyticsModule 미활성**: BadgeQueryService 주입 실패 시 빈 배열 fallback

### T-SD-008 검증

1. **초기 접근**: voice-health 페이지 진입 -> 기본값으로 폼 표시
2. **설정 저장**: 값 변경 후 저장 -> 성공 토스트 -> 새로고침 시 저장된 값 유지
3. **범위 초과 입력**: analysisDays에 200 입력 -> min/max로 제한됨 (서버 측 검증)
4. **사이드바 네비게이션**: SettingsSidebar에 "자가진단 설정" 메뉴 표시, 클릭 시 페이지 이동
5. **미인증 접근**: JWT 없이 API 호출 -> 401 반환

---

## 작업 순서 (권장)

```
[선행: T-SD-001~003 + T-SD-006 완료]
    │
    ├── T-SD-007 (API 측)
    │   ├── Step 1: VoiceChannelModule에 import 추가
    │   ├── Step 2: MeProfileData 인터페이스 수정
    │   ├── Step 3: MeProfileService 뱃지 조회 추가
    │   └── Step 4: ProfileCardRenderer 뱃지 pill 렌더링
    │
    └── T-SD-008 (Web 측) -- 병렬 가능
        ├── Step 1: voice-health-api.ts 생성
        ├── Step 2: SettingsSidebar 메뉴 추가
        └── Step 3: voice-health/page.tsx 구현
```

## 파일 영향도 요약

| 패키지 | 신규 | 수정 |
|--------|------|------|
| `apps/api` | 0 | 3 (`voice-channel.module.ts`, `me-profile.service.ts`, `profile-card-renderer.ts`) |
| `apps/web` | 2 (`voice-health-api.ts`, `voice-health/page.tsx`) | 1 (`SettingsSidebar.tsx`) |
| 합계 | 2 | 4 |
