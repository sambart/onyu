# 자동방 그룹핑 단위 변경 (Config -> Button) - 프론트엔드 구현 계획

> PRD 참조: F-VOICE-037, F-VOICE-038
> 선행 계획: [voice-auto-channel-grouping-frontend.md](./voice-auto-channel-grouping-frontend.md)
> 작성일: 2026-04-04

---

## 배경

기존 구현은 자동방 그룹핑을 `autoChannelConfigId` 단위로 수행한다. 하나의 Config에 여러 버튼이 존재할 수 있으므로, 버튼 단위로 세분화된 통계를 제공하기 위해 그룹핑 키를 `buttonId ?? configId`로 변경한다. 즉시 모드(auto_instant)는 button이 없으므로 기존처럼 configId로 폴백한다.

---

## 구현 단계

### 단계 1: 타입 확장

**파일**: `apps/web/app/lib/voice-dashboard-api.ts`

#### 1-1. VoiceDailyRecord 인터페이스 (라인 4-20)

기존 필드 뒤에 2개 필드를 추가한다.

```diff
 export interface VoiceDailyRecord {
   // ... 기존 필드
   autoChannelConfigId?: number | null;
   autoChannelConfigName?: string | null;
+  autoChannelButtonId?: number | null;
+  autoChannelButtonLabel?: string | null;
 }
```

**변경 위치**: 라인 19 (`autoChannelConfigName`) 뒤에 삽입
**주의**: optional(`?`)과 `| null` 모두 유지하여 백엔드 미배포 시 하위 호환 보장

#### 1-2. VoiceAutoChannelGroupStat 인터페이스 (라인 62-68)

button 관련 필드 2개를 추가한다.

```diff
 export interface VoiceAutoChannelGroupStat {
   autoChannelConfigId: number;
   autoChannelConfigName: string;
+  autoChannelButtonId: number | null;
+  autoChannelButtonLabel: string | null;
   channelType: 'auto_select' | 'auto_instant';
   totalDurationSec: number;
   instanceCount: number;
 }
```

**변경 위치**: 라인 64 (`autoChannelConfigName`) 뒤에 삽입

---

### 단계 2: 집계 함수 변경

**파일**: `apps/web/app/lib/voice-dashboard-api.ts`

#### 2-1. computeAutoChannelGroupStats() (라인 277-313)

그룹 키를 `configId` -> `buttonId ?? configId`로 변경하고, 표시명도 `buttonLabel ?? configName`으로 변경한다.

**변경 전** (라인 284):
```typescript
const byConfig = new Map<number, { stat: VoiceAutoChannelGroupStat; channelIds: Set<string> }>();
```

**변경 후**:
```typescript
const byGroup = new Map<string, { stat: VoiceAutoChannelGroupStat; channelIds: Set<string> }>();
```

**변경 전** (라인 288-289):
```typescript
    const configId = r.autoChannelConfigId as number;
    const existing = byConfig.get(configId);
```

**변경 후**:
```typescript
    const configId = r.autoChannelConfigId as number;
    const buttonId = r.autoChannelButtonId ?? null;
    const groupKey = buttonId != null ? `btn:${buttonId}` : `cfg:${configId}`;
    const existing = byGroup.get(groupKey);
```

**변경 전** (라인 290-306):
```typescript
    if (existing) {
      existing.stat.totalDurationSec += r.channelDurationSec;
      existing.channelIds.add(r.channelId);
    } else {
      const channelType: 'auto_select' | 'auto_instant' =
        r.channelType === 'auto_instant' ? 'auto_instant' : 'auto_select';
      byConfig.set(configId, {
        stat: {
          autoChannelConfigId: configId,
          autoChannelConfigName: r.autoChannelConfigName ?? `Config-${configId}`,
          channelType,
          totalDurationSec: r.channelDurationSec,
          instanceCount: 0,
        },
        channelIds: new Set([r.channelId]),
      });
    }
```

**변경 후**:
```typescript
    if (existing) {
      existing.stat.totalDurationSec += r.channelDurationSec;
      existing.channelIds.add(r.channelId);
    } else {
      const channelType: 'auto_select' | 'auto_instant' =
        r.channelType === 'auto_instant' ? 'auto_instant' : 'auto_select';
      byGroup.set(groupKey, {
        stat: {
          autoChannelConfigId: configId,
          autoChannelConfigName: r.autoChannelConfigName ?? `Config-${configId}`,
          autoChannelButtonId: buttonId,
          autoChannelButtonLabel: r.autoChannelButtonLabel ?? null,
          channelType,
          totalDurationSec: r.channelDurationSec,
          instanceCount: 0,
        },
        channelIds: new Set([r.channelId]),
      });
    }
```

**변경 전** (라인 310-312):
```typescript
  return Array.from(byConfig.values())
    .map(({ stat, channelIds }) => ({ ...stat, instanceCount: channelIds.size }))
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec);
```

**변경 후**:
```typescript
  return Array.from(byGroup.values())
    .map(({ stat, channelIds }) => ({ ...stat, instanceCount: channelIds.size }))
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec);
```

#### 2-2. computeChannelStats() — auto_grouped 모드 (라인 218-246)

그룹 키와 표시명을 button 우선으로 변경한다.

**변경 전** (라인 222-225):
```typescript
    const configId = r.autoChannelConfigId;
    const key = configId != null ? `auto:${configId}` : r.channelId;
    const name =
      configId != null ? (r.autoChannelConfigName ?? `Config-${configId}`) : r.channelName;
```

**변경 후**:
```typescript
    const configId = r.autoChannelConfigId;
    const buttonId = r.autoChannelButtonId ?? null;
    const key = configId != null
      ? (buttonId != null ? `auto:btn:${buttonId}` : `auto:cfg:${configId}`)
      : r.channelId;
    const name = configId != null
      ? (r.autoChannelButtonLabel ?? r.autoChannelConfigName ?? `Config-${configId}`)
      : r.channelName;
```

**주의**: `auto:` 접두사는 유지한다. `UserChannelPieChart`에서 `ch.channelId.startsWith('auto:')` 필터를 사용하고 있으므로, 접두사 규칙을 깨면 안 된다 (라인 135 참조).

---

### 단계 3: SummaryCards uniqueChannels 계산 변경

**파일**: `apps/web/app/lib/voice-dashboard-api.ts`

#### 3-1. computeSummary() (라인 118-141)

**변경 전** (라인 129-131):
```typescript
  const autoConfigIds = new Set(
    channelRecords.filter((r) => r.autoChannelConfigId != null).map((r) => r.autoChannelConfigId),
  );
```

**변경 후**:
```typescript
  // 자동방: buttonId ?? configId 단위 카운트 (button 단위 그룹핑)
  const autoGroupKeys = new Set(
    channelRecords
      .filter((r) => r.autoChannelConfigId != null)
      .map((r) => {
        const buttonId = r.autoChannelButtonId ?? null;
        return buttonId != null ? `btn:${buttonId}` : `cfg:${r.autoChannelConfigId}`;
      }),
  );
```

**변경 전** (라인 139):
```typescript
    uniqueChannels: permanentChannelIds.size + autoConfigIds.size,
```

**변경 후**:
```typescript
    uniqueChannels: permanentChannelIds.size + autoGroupKeys.size,
```

---

### 단계 4: ChannelBarChart 차트 데이터 표시명 변경

**파일**: `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx`

#### 4-1. autoGroupChartData name 변경 (라인 89-94)

**변경 전** (라인 89-94):
```typescript
  const autoGroupChartData = autoGroupStats.slice(0, 10).map((d) => ({
    name: d.autoChannelConfigName,
    durationMin: Math.round(d.totalDurationSec / 60),
    micOnMin: 0,
    micOffMin: 0,
  }));
```

**변경 후**:
```typescript
  const autoGroupChartData = autoGroupStats.slice(0, 10).map((d) => ({
    name: d.autoChannelButtonLabel ?? d.autoChannelConfigName,
    durationMin: Math.round(d.totalDurationSec / 60),
    micOnMin: 0,
    micOffMin: 0,
  }));
```

---

### 단계 5: i18n 변경

#### 5-1. 한국어 (libs/i18n/locales/ko/web/dashboard.json)

**변경 위치**: 라인 71 `voice.summary.autoChannelGroups`

```diff
-      "autoChannelGroups": "자동방 설정"
+      "autoChannelGroups": "자동방 버튼"
```

#### 5-2. 영어 (libs/i18n/locales/en/web/dashboard.json)

**변경 위치**: 라인 72 `voice.summary.autoChannelGroups`

```diff
-      "autoChannelGroups": "Auto Configs"
+      "autoChannelGroups": "Auto Channel Buttons"
```

---

### 단계 6: UserChannelPieChart (자동 반영 확인)

**파일**: `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx`

이 컴포넌트는 `autoGroupedChannelStats` prop을 받아 사용하며 (라인 133-142), 이 데이터는 부모 컴포넌트에서 `computeChannelStats(records, 'auto_grouped')` 호출 결과이다. 단계 2-2에서 이 함수의 그룹핑 키와 표시명을 이미 변경했으므로, 이 컴포넌트는 **별도 수정 불필요**하다.

다만 `ch.channelId.startsWith('auto:')` 필터 (라인 135)가 정상 동작하는지 확인 필요:
- 변경 후 키 형식: `auto:btn:{buttonId}` 또는 `auto:cfg:{configId}` -> `auto:` 접두사 유지되므로 정상 동작

---

## 변경 파일 요약

| 파일 | 단계 | 변경 요약 |
|------|------|----------|
| `apps/web/app/lib/voice-dashboard-api.ts` | 1, 2, 3 | VoiceDailyRecord에 button 필드 2개 추가, VoiceAutoChannelGroupStat에 button 필드 2개 추가, computeAutoChannelGroupStats() 그룹 키 변경, computeChannelStats() auto_grouped 모드 키 변경, computeSummary() uniqueChannels 키 변경 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/ChannelBarChart.tsx` | 4 | autoGroupChartData의 name을 buttonLabel 우선 폴백으로 변경 |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/SummaryCards.tsx` | - | 변경 없음 (computeSummary 내부 변경으로 자동 반영) |
| `apps/web/app/dashboard/guild/[guildId]/voice/components/UserChannelPieChart.tsx` | 6 | 변경 없음 (computeChannelStats 변경으로 자동 반영, auto: 접두사 호환 확인) |
| `libs/i18n/locales/ko/web/dashboard.json` | 5 | voice.summary.autoChannelGroups: "자동방 설정" -> "자동방 버튼" |
| `libs/i18n/locales/en/web/dashboard.json` | 5 | voice.summary.autoChannelGroups: "Auto Configs" -> "Auto Channel Buttons" |

---

## 구현 순서

```
1. 타입 확장 (VoiceDailyRecord, VoiceAutoChannelGroupStat)
   ↓
2. 집계 함수 변경 (computeAutoChannelGroupStats, computeChannelStats)
   ↓
3. computeSummary uniqueChannels 변경
   ↓
4. ChannelBarChart 표시명 변경
   ↓ (병렬 가능)
5. i18n 변경 (ko, en)
6. UserChannelPieChart 자동 반영 확인
```

---

## 주의사항

1. **auto: 접두사 호환**: `computeChannelStats()` auto_grouped 모드에서 키를 `auto:btn:{id}` / `auto:cfg:{id}` 형식으로 생성한다. `UserChannelPieChart`에서 `startsWith('auto:')` 필터를 사용하므로, 이 접두사 규칙을 반드시 유지해야 한다.

2. **하위 호환**: 백엔드가 아직 `autoChannelButtonId` / `autoChannelButtonLabel`을 반환하지 않는 경우, 값이 `undefined`이므로 `?? null` 폴백으로 기존 configId 기반 그룹핑과 동일한 결과를 반환한다.

3. **즉시 모드(auto_instant) 처리**: 즉시 모드는 button 없이 config 직접 생성이므로 `autoChannelButtonId`가 항상 `null`이다. 그룹 키가 `cfg:{configId}`로 폴백되어 기존 동작과 동일하다.

4. **그룹 키 중복 불가**: 같은 configId에 속하는 서로 다른 buttonId는 별도 그룹으로 분리된다. 이것이 이번 변경의 핵심 목적이다.
