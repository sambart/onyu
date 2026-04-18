# 모코코 순위 Canvas 렌더링 — 프론트엔드 설정 UI 구현 계획

> PRD: [newbie.md](../specs/prd/newbie.md) F-WEB-NEWBIE-001 탭 3 (모코코 사냥 설정)

## 목표

모코코 사냥 순위의 표시 방식(`EMBED` / `CANVAS`)을 길드 설정 페이지에서 선택할 수 있도록 웹 UI를 수정한다. 기존 Embed 관련 설정 UI는 삭제하지 않고 모드에 따라 조건부 렌더링한다.

## 변경 범위 요약

| 계층 | 파일 | 변경 내용 |
|------|------|-----------|
| Frontend API | `apps/web/app/lib/newbie-api.ts` | `NewbieConfig` 인터페이스에 `mocoDisplayMode` 필드 추가 |
| Frontend UI | `apps/web/app/settings/guild/[guildId]/newbie/components/MocoTab.tsx` | 표시 방식 드롭다운 추가, 모드별 조건부 렌더링 |
| Frontend UI | `apps/web/app/settings/guild/[guildId]/newbie/page.tsx` | `DEFAULT_CONFIG`에 `mocoDisplayMode` 기본값 추가 |
| i18n (ko) | `libs/i18n/locales/ko/web/settings.json` | 표시 방식 관련 키 추가 |
| i18n (en) | `libs/i18n/locales/en/web/settings.json` | 표시 방식 관련 키 추가 |

---

## 선행 조건

- 백엔드 `NewbieConfig` ORM 엔티티에 `mocoDisplayMode` 컬럼이 이미 추가되어 있음 (`newbie-config.orm-entity.ts` 확인 완료)
- DB 마이그레이션 `1775229756004-AddMocoDisplayMode`이 이미 존재함
- 백엔드 API에서 config 조회/저장 시 `mocoDisplayMode` 필드가 포함되어야 함 (별도 백엔드 작업 필요 시 확인)

---

## 구현 단계

### Step 1: API 클라이언트 타입 수정

**파일**: `apps/web/app/lib/newbie-api.ts`

**변경 내용**:
- `NewbieConfig` 인터페이스의 모코코 사냥 섹션에 `mocoDisplayMode` 필드 추가

```typescript
// 모코코 사냥 섹션 (기존 필드 뒤에 추가)
mocoDisplayMode: 'EMBED' | 'CANVAS';
```

추가 위치: `mocoEmbedColor` 필드 아래, 플레이횟수 카운팅 섹션 위

---

### Step 2: 기본 설정값 갱신

**파일**: `apps/web/app/settings/guild/[guildId]/newbie/page.tsx`

**변경 내용**:
- `DEFAULT_CONFIG` 객체에 `mocoDisplayMode: 'EMBED'` 추가

```typescript
mocoDisplayMode: 'EMBED' as const,
```

추가 위치: `mocoEmbedColor: '#5865F2'` 아래

---

### Step 3: i18n 키 추가

**파일**: `libs/i18n/locales/ko/web/settings.json` — `newbie.moco` 객체 내

```json
"displayMode": "표시 방식",
"displayModeDesc": "모코코 사냥 순위를 표시하는 방식을 선택합니다.",
"displayModeEmbed": "Embed (기존 방식)",
"displayModeCanvas": "Canvas (이미지 테이블)",
"canvasInfo": "Canvas 모드에서는 순위를 이미지 테이블로 표시합니다. 한 페이지에 10명이 표시되며, 사용자는 '내 순위' 버튼으로 개인 상세를 확인할 수 있습니다."
```

**파일**: `libs/i18n/locales/en/web/settings.json` — `newbie.moco` 객체 내

```json
"displayMode": "Display Mode",
"displayModeDesc": "Choose how Moco Hunt rankings are displayed.",
"displayModeEmbed": "Embed (classic)",
"displayModeCanvas": "Canvas (image table)",
"canvasInfo": "In Canvas mode, rankings are displayed as an image table. 10 hunters are shown per page, and users can view their personal details via the 'My Rank' button."
```

추가 위치: 기존 `moco` 객체 내 `embedSection` 키 앞 (`autoRefreshSummary` 뒤)

---

### Step 4: MocoTab.tsx 수정

**파일**: `apps/web/app/settings/guild/[guildId]/newbie/components/MocoTab.tsx`

#### 4-1. 표시 방식 드롭다운 추가

기능 활성화 토글과 기본 설정 `CollapsibleSection` 사이에 표시 방식 선택 드롭다운을 삽입한다.

```tsx
{/* 표시 방식 선택 */}
<div>
  <label
    htmlFor="moco-display-mode"
    className="block text-sm font-medium text-gray-700 mb-1"
  >
    {t('newbie.moco.displayMode')}
  </label>
  <select
    id="moco-display-mode"
    value={config.mocoDisplayMode ?? 'EMBED'}
    onChange={(e) =>
      onChange({ mocoDisplayMode: e.target.value as 'EMBED' | 'CANVAS' })
    }
    disabled={!isEnabled}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
  >
    <option value="EMBED">{t('newbie.moco.displayModeEmbed')}</option>
    <option value="CANVAS">{t('newbie.moco.displayModeCanvas')}</option>
  </select>
  <p className="text-xs text-gray-400 mt-1">
    {t('newbie.moco.displayModeDesc')}
  </p>
</div>
```

삽입 위치: 기능 활성화 토글(`<div className="flex items-center justify-between">`) 바로 아래, `CollapsibleSection` (기본 설정) 위

#### 4-2. Embed 외관 & 템플릿 섹션 조건부 렌더링

기존 그룹 4 "Embed 외관 & 템플릿" `CollapsibleSection`을 `config.mocoDisplayMode !== 'CANVAS'` 조건으로 감싼다.

```tsx
{/* ── 그룹 4: Embed 외관 & 템플릿 (Embed 모드 전용) ── */}
{config.mocoDisplayMode !== 'CANVAS' && (
  <CollapsibleSection title={t('newbie.moco.embedSection')} summary={embedSummary}>
    {/* ... 기존 내용 그대로 유지 ... */}
  </CollapsibleSection>
)}
```

조건 설명: `mocoDisplayMode`가 `null`/`undefined`/`'EMBED'`일 때 모두 표시되도록 `!== 'CANVAS'`로 검사한다. 이렇게 하면 기존 데이터에 `mocoDisplayMode`가 없는 길드도 Embed 섹션이 정상 표시된다.

#### 4-3. Canvas 안내 섹션 추가

Embed 섹션과 동일 위치에 Canvas 모드일 때 안내 텍스트를 표시한다.

```tsx
{/* ── Canvas 모드 안내 ── */}
{config.mocoDisplayMode === 'CANVAS' && (
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
    <p className="text-sm text-blue-800">
      {t('newbie.moco.canvasInfo')}
    </p>
  </div>
)}
```

삽입 위치: 그룹 4 (Embed 외관 & 템플릿) 조건부 블록 바로 아래

#### 4-4. 요약 텍스트 수정 (선택 사항)

`embedSummary` 변수는 Embed 모드에서만 사용되므로 변경 불필요. Canvas 모드에서는 해당 섹션 자체가 렌더링되지 않는다.

---

## 충돌 여부 확인

| 대상 | 충돌 여부 | 비고 |
|------|----------|------|
| `NewbieConfig` 인터페이스 | 없음 | 필드 추가만 수행. 기존 필드 변경 없음 |
| `DEFAULT_CONFIG` | 없음 | 키 하나 추가 |
| `MocoTab.tsx` | 없음 | 기존 JSX 구조를 감싸는 조건만 추가. 삭제 없음 |
| `MocoTemplateSection.tsx` | 없음 | 변경 없음 (부모에서 조건부 렌더링) |
| `newbie-api.ts` 함수 | 없음 | `saveNewbieConfig`는 `config` 객체를 그대로 전송하므로 필드 추가 시 자동 포함 |
| i18n JSON | 없음 | 기존 키 변경 없이 새 키만 추가 |

## 테스트 체크리스트

- [ ] 모코코 사냥 설정 탭에서 표시 방식 드롭다운이 `Embed` / `Canvas` 옵션을 표시하는지 확인
- [ ] `Embed` 선택 시 "Embed 외관 & 템플릿" 섹션이 표시되는지 확인
- [ ] `Canvas` 선택 시 "Embed 외관 & 템플릿" 섹션이 숨겨지고 Canvas 안내 텍스트가 표시되는지 확인
- [ ] 기능 비활성화(`mocoEnabled = false`) 상태에서 표시 방식 드롭다운이 disabled 되는지 확인
- [ ] 설정 저장 후 새로고침 시 선택한 표시 방식이 유지되는지 확인
- [ ] `mocoDisplayMode` 필드가 없는 기존 길드 데이터에서 기본값 `EMBED`로 동작하는지 확인
- [ ] 한국어/영어 전환 시 새로 추가된 i18n 키가 정상 표시되는지 확인
