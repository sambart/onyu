# HHI 임계값 UX 개선 — "관계 다양성 점수" 변환

## 배경

HHI(Herfindahl-Hirschman Index)는 0~1 범위의 집중도 지표로, **낮을수록 좋다**. 이 역방향 스케일은 관리자와 사용자 모두에게 직관적이지 않다. "관계 다양성 점수"(0~100, **높을수록 좋음**)로 표시 레이어를 변환하여 UX를 개선한다.

## 변환 공식

```
diversityScore = Math.round((1 - hhi) * 100)

역변환 (UI -> DB):
hhiValue = (100 - diversityScore) / 100
```

## 프리셋 정의

| 프리셋 | 다양성 점수 | HHI 환산값 | 최소 교류 인원 | 설명 |
|--------|-----------|-----------|--------------|------|
| 느슨   | 50점      | 0.50      | 2명          | 소규모 서버, 편중 허용 |
| 보통   | 70점      | 0.30      | 3명          | 일반적인 기준 (기본값) |
| 엄격   | 80점      | 0.20      | 5명          | 다양한 교류를 강하게 권장 |

## 핵심 원칙

- **DB 스키마 변경 없음**: `hhiThreshold`, `badgeSocialHhiMax` 컬럼은 HHI 원본값(0~1)을 그대로 저장한다.
- **변환은 표시 레이어에서만**: Discord Embed, 웹 대시보드, LLM 프롬프트에서만 다양성 점수로 변환 표시한다.
- **서비스/뱃지 판정 로직은 불변**: `SelfDiagnosisService.buildVerdicts()`, `BadgeService.judgeAll()`의 HHI 비교 로직은 변경하지 않는다.

---

## 변경 대상 파일 및 수정 사항

### 1. `apps/api/src/voice-analytics/self-diagnosis/hhi-calculator.ts`

**작업**: `hhiToDiversityScore()` 유틸 함수 추가

```typescript
/**
 * HHI 값(0~1)을 관계 다양성 점수(0~100)로 변환한다.
 * 높을수록 다양한 관계를 의미한다.
 */
export function hhiToDiversityScore(hhi: number): number {
  return Math.round((1 - hhi) * 100);
}
```

- 기존 `calculateHhi()`, `getTopPeers()` 함수는 변경하지 않는다.
- 새 함수만 export에 추가한다.

---

### 2. `apps/api/src/voice-analytics/self-diagnosis/self-diagnosis.service.ts`

**작업 A**: `buildVerdicts()` 메서드 — 관계 다양성 verdict 텍스트 변환

현재 (L377-381):
```typescript
{
  category: '관계 다양성',
  isPassed: hhiScore <= config.hhiThreshold,
  criterion: `HHI ${config.hhiThreshold} 이하`,
  actual: `HHI ${hhiScore.toFixed(3)}`,
}
```

변경 후:
```typescript
{
  category: '관계 다양성',
  isPassed: hhiScore <= config.hhiThreshold,
  criterion: `${hhiToDiversityScore(config.hhiThreshold)}점 이상`,
  actual: `${hhiToDiversityScore(hhiScore)}점`,
}
```

- `isPassed` 판정 로직(HHI 원본 비교)은 변경하지 않는다.
- `criterion`과 `actual` 텍스트만 다양성 점수로 변환한다.
- `hhiToDiversityScore`를 `hhi-calculator.ts`에서 import 추가한다.

**작업 B**: `buildBadgeGuides()` 메서드 — 사교왕 뱃지 가이드 텍스트 변환

현재 (L425-428):
```typescript
{
  code: BADGE_CODE.SOCIAL,
  ...BADGE_DISPLAY.SOCIAL,
  isEarned: isEarned(BADGE_CODE.SOCIAL),
  criterion: `HHI ${Number(config.badgeSocialHhiMax).toFixed(2)} 이하 & 교류 ${config.badgeSocialMinPeers}명 이상`,
  current: `HHI ${hhiScore.toFixed(3)}, ${peerCount}명`,
}
```

변경 후:
```typescript
{
  code: BADGE_CODE.SOCIAL,
  ...BADGE_DISPLAY.SOCIAL,
  isEarned: isEarned(BADGE_CODE.SOCIAL),
  criterion: `다양성 ${hhiToDiversityScore(Number(config.badgeSocialHhiMax))}점 이상 & 교류 ${config.badgeSocialMinPeers}명 이상`,
  current: `현재 ${hhiToDiversityScore(hhiScore)}점, ${peerCount}명`,
}
```

**작업 C**: `generateLlmSummary()` 메서드 — LLM 프롬프트 내 HHI 표현 변환

현재 (L523-525):
```typescript
`- HHI 집중도: ${relationshipData.hhiScore.toFixed(3)} (정책 기준: ${Number(config.hhiThreshold).toFixed(2)} 이하 → ...)`,
'  - HHI가 1에 가까울수록 소수에게 편중, 0에 가까울수록 다양',
```

변경 후:
```typescript
`- 관계 다양성 점수: ${hhiToDiversityScore(relationshipData.hhiScore)}점 / 100 (정책 기준: ${hhiToDiversityScore(Number(config.hhiThreshold))}점 이상 → ...)`,
'  - 0점(한 명에 집중) ~ 100점(완전 분산). 높을수록 다양',
```

LLM 프롬프트의 뱃지 달성 현황 라인은 `badgeGuides` 데이터를 그대로 출력하므로, 작업 B에서 변경된 텍스트가 자동 반영된다.

---

### 3. `apps/api/src/voice-analytics/self-diagnosis/self-diagnosis.command.ts`

**작업**: `buildRelationshipSection()` 메서드 — Discord Embed 관계 다양성 섹션 표시 변환

현재 (L160-161):
```typescript
`교류 인원: ${result.peerCount}명 | HHI: ${result.hhiScore.toFixed(3)} (낮을수록 다양)`,
```

변경 후:
```typescript
`교류 인원: ${result.peerCount}명 | 관계 다양성: ${hhiToDiversityScore(result.hhiScore)}점 / 100`,
```

- `hhiToDiversityScore`를 `hhi-calculator.ts`에서 import 추가한다.
- verdict 라인(`hhiVerdict`, `peerVerdict`)은 `SelfDiagnosisResult.verdicts`의 텍스트를 그대로 출력하므로, `self-diagnosis.service.ts`의 작업 A에서 이미 변환된 텍스트가 반영된다. 추가 변경 불필요.

---

### 4. `apps/api/src/voice-analytics/self-diagnosis/badge.service.ts`

**작업**: 변경 없음

`BadgeService.judgeAll()`은 HHI 원본값으로 뱃지 자격을 판정하고 DB에 저장하는 백엔드 로직이다. 표시 레이어가 아니므로 변경하지 않는다. `hhiScore <= config.badgeSocialHhiMax` 비교(L184)는 그대로 유지한다.

---

### 5. `apps/web/app/settings/guild/[guildId]/voice-health/page.tsx`

**작업 A**: HHI 임계값 슬라이더를 "관계 다양성 점수" 슬라이더로 변환

현재 섹션 2의 HHI 임계값 슬라이더 (L279-300):
- 라벨: "HHI 임계값: 0.30"
- 설명: "허핀달-허쉬만 지수(채널 집중도) 임계값입니다. (0.00~1.00)"
- 슬라이더 값: `Math.round(form.hhiThreshold * 100)` (0~100), onChange에서 `/100`으로 역변환

변경 후:
- 라벨: "관계 다양성 점수: 70점"
- 설명: "관계가 다양할수록 높은 점수입니다. 이 점수 이상이면 기준을 충족합니다. (0~100점)"
- 슬라이더 값: `Math.round((1 - form.hhiThreshold) * 100)` (0~100)
- onChange: `updateForm('hhiThreshold', (100 - Number(e.target.value)) / 100)` (역변환하여 HHI 원본 저장)
- 프리셋 버튼 3개 추가: 느슨(50점), 보통(70점), 엄격(80점)
  - 클릭 시 `hhiThreshold`와 `minPeerCount`를 동시에 설정

프리셋 버튼 UI 구조:
```tsx
<div className="flex gap-2 mt-2">
  <button onClick={() => { updateForm('hhiThreshold', 0.50); updateForm('minPeerCount', 2); }}>
    느슨 (50점)
  </button>
  <button onClick={() => { updateForm('hhiThreshold', 0.30); updateForm('minPeerCount', 3); }}>
    보통 (70점)
  </button>
  <button onClick={() => { updateForm('hhiThreshold', 0.20); updateForm('minPeerCount', 5); }}>
    엄격 (80점)
  </button>
</div>
```

프리셋 버튼 스타일: `border border-gray-300 rounded-lg px-3 py-1 text-xs`, 현재 선택된 프리셋은 `bg-indigo-50 border-indigo-300 text-indigo-700`로 하이라이트. 정확히 프리셋 값과 일치할 때만 하이라이트 표시.

**작업 B**: 사교왕 HHI 상한 슬라이더를 "사교왕 다양성 점수" 슬라이더로 변환

현재 섹션 3의 사교왕 HHI 상한 슬라이더 (L352-373):
- 라벨: "사교왕 HHI 상한: 0.25"
- 설명: "HHI가 이 값 이하일 때 사교왕 뱃지 조건을 충족합니다. (0.00~1.00)"

변경 후:
- 라벨: "사교왕 다양성 점수: 75점"
- 설명: "관계 다양성 점수가 이 값 이상일 때 사교왕 뱃지를 부여합니다. (0~100점)"
- 슬라이더 값: `Math.round((1 - form.badgeSocialHhiMax) * 100)` (0~100)
- onChange: `updateForm('badgeSocialHhiMax', (100 - Number(e.target.value)) / 100)` (역변환)

---

### 6. `apps/web/app/lib/voice-health-api.ts`

**작업**: 변경 없음

`VoiceHealthConfig` 타입의 `hhiThreshold`, `badgeSocialHhiMax` 필드는 HHI 원본값(0~1)을 그대로 주고받는다. API 레이어에서 변환하지 않으며, UI 컴포넌트에서만 표시 변환한다.

---

## 구현 순서

| 단계 | 파일 | 작업 | 비고 |
|------|------|------|------|
| 1 | `hhi-calculator.ts` | `hhiToDiversityScore()` 함수 추가 | 순수 함수, 의존성 없음 |
| 2 | `self-diagnosis.service.ts` | verdict + badge guide + LLM 프롬프트 텍스트 변환 | 작업 A, B, C |
| 3 | `self-diagnosis.command.ts` | Discord Embed 관계 다양성 라인 변환 | import 추가 |
| 4 | `voice-health/page.tsx` | 슬라이더 2개 변환 + 프리셋 버튼 추가 | 작업 A, B |

## 영향도 분석

| 구성 요소 | 영향 | 이유 |
|-----------|------|------|
| DB 스키마 | 없음 | HHI 원본값 저장 유지 |
| REST API | 없음 | 요청/응답 타입 변경 없음 |
| `BadgeService.judgeAll()` | 없음 | HHI 원본값으로 판정, 표시 레이어 아님 |
| `BadgeScheduler` | 없음 | `BadgeService` 호출만 함 |
| `/me` 프로필 카드 | 없음 | 뱃지 코드 배열만 사용, HHI 값 미표시 |
| `VoiceHealthConfigRepository` | 없음 | HHI 원본값으로 캐시 |
| `SelfDiagnosisResult` 타입 | 없음 | `hhiScore` 필드는 원본값 유지, 표시 변환은 Embed/가이드 텍스트에서 수행 |

## 테스트 체크리스트

- [ ] `hhiToDiversityScore(0)` = 100, `hhiToDiversityScore(1)` = 0, `hhiToDiversityScore(0.38)` = 62
- [ ] `/자가진단` Embed에서 "관계 다양성: 82점 / 100" 형태로 표시 확인
- [ ] verdict 라인에서 "관계 다양성: 82점 (기준: 70점 이상)" 형태 확인
- [ ] 사교왕 뱃지 가이드에서 "다양성 75점 이상 & 교류 5명 이상" 형태 확인
- [ ] 웹 대시보드 슬라이더에서 다양성 점수 0~100 범위로 표시 확인
- [ ] 웹 대시보드 프리셋 버튼(느슨/보통/엄격) 클릭 시 값 반영 확인
- [ ] 웹 대시보드 저장 후 DB에 HHI 원본값으로 저장되는지 확인
- [ ] AI 요약 모드에서 LLM 프롬프트에 다양성 점수 형태로 전달되는지 확인
- [ ] 뱃지 스케줄러가 HHI 원본값으로 정상 판정하는지 확인 (기존 동작 불변)
