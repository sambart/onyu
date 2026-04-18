# 자동방 웹 설정 페이지 UI 개선 프론트엔드 구현 계획

> PRD: [web.md](../specs/prd/web.md) F-WEB-004
> 현재 파일: `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx` (906줄, 단일 파일)

## 목표

현재 자동방 설정 페이지를 모드 선택(즉시 생성/선택 생성), 스텝 기반 섹션 분할, 버튼 카드 그리드+모달 편집 방식으로 개편하여 UX를 개선하고 페이지 길이를 대폭 축소한다.

## 선행 조건

- **Backend DTO/Repository 수정 필요**: `AutoChannelSaveDto`에 `mode`, `instantCategoryId`, `instantNameTemplate` 필드가 아직 없다. Repository `upsert()` 메서드도 해당 필드를 저장하지 않는다. 프론트엔드 작업 전 또는 병렬로 백엔드 수정이 필요하다 (Step 0 참조).
- **DB 엔티티는 완료**: `AutoChannelConfigOrm`에 `mode`, `instantCategoryId`, `instantNameTemplate` 컬럼이 이미 추가되어 있다.
- **GET API는 이미 호환**: `findAllByGuildId`가 ORM 엔티티 전체를 반환하므로, 새 필드는 GET 응답에 자동 포함된다.

## 변경 파일 목록

### 백엔드 수정 (Step 0)

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/channel/auto/dto/auto-channel-save.dto.ts` | `mode`, `instantCategoryId`, `instantNameTemplate` 필드 추가. `mode`에 따라 조건부 필수값 데코레이터 적용 |
| `apps/api/src/channel/auto/infrastructure/auto-channel-config.repository.ts` | `upsert()` 메서드에서 `mode`, `instantCategoryId`, `instantNameTemplate` 저장 로직 추가 |
| `apps/api/src/channel/auto/auto-channel.controller.ts` | `save()` 메서드에서 `mode === 'instant'`일 때 안내 메시지 전송 스킵 로직 추가 |

### 프론트엔드 수정

| 파일 | 변경 내용 |
|------|-----------|
| `apps/web/app/settings/guild/[guildId]/auto-channel/page.tsx` | 기존 단일 파일 -> 오케스트레이터로 축소. 컴포넌트 분리 |
| `apps/web/app/settings/guild/[guildId]/auto-channel/components/StepSection.tsx` | **신규**. 스텝 번호+제목+화살표 래퍼 컴포넌트 |
| `apps/web/app/settings/guild/[guildId]/auto-channel/components/ModeSelector.tsx` | **신규**. 모드 라디오 버튼 (`즉시 생성` / `선택 생성`) |
| `apps/web/app/settings/guild/[guildId]/auto-channel/components/InstantModeSettings.tsx` | **신규**. 즉시 생성 모드 STEP 2 (채널명 템플릿 + 생성 카테고리) |
| `apps/web/app/settings/guild/[guildId]/auto-channel/components/ButtonCardGrid.tsx` | **신규**. 버튼 카드 그리드 + `[+ 추가]` 카드 |
| `apps/web/app/settings/guild/[guildId]/auto-channel/components/ButtonEditModal.tsx` | **신규**. 버튼 상세 편집 모달 다이얼로그 |
| `apps/web/app/settings/guild/[guildId]/auto-channel/components/PreviewPanel.tsx` | **신규**. 모드별 통합 미리보기 |
| `apps/web/app/settings/guild/[guildId]/auto-channel/types.ts` | **신규**. `ConfigForm`, `ButtonForm`, `SubOptionForm`, 상수 분리 |

### i18n (있는 경우)

| 파일 | 변경 내용 |
|------|-----------|
| 해당 locale JSON 파일 | `autoChannel.modeSelect`, `autoChannel.modeInstant`, `autoChannel.instantCategory`, `autoChannel.instantNameTemplate`, `autoChannel.stepN` 등 키 추가 |

## 구현 단계

### Step 0: 백엔드 DTO/Repository 수정

현재 `AutoChannelSaveDto`는 `mode` 필드가 없어 프론트엔드에서 보내도 무시된다. 아래 작업이 프론트엔드보다 먼저 또는 동시에 완료되어야 한다.

#### 0-1. DTO 수정 (`auto-channel-save.dto.ts`)

```typescript
// 기존 필드 유지 + 아래 추가
@IsString()
@IsIn(['select', 'instant'])
mode: 'select' | 'instant';

@IsOptional()
@IsString()
instantCategoryId?: string;

@IsOptional()
@IsString()
instantNameTemplate?: string;

// guideChannelId, guideMessage, buttons는 mode === 'select'일 때만 필수
// -> ValidateIf 데코레이터 또는 커스텀 validator 적용
@ValidateIf((o) => o.mode === 'select')
@IsString()
@IsNotEmpty()
guideChannelId: string;

@ValidateIf((o) => o.mode === 'select')
@IsString()
@IsNotEmpty()
guideMessage: string;

@ValidateIf((o) => o.mode === 'select')
@IsArray()
@ArrayMaxSize(25)
@ValidateNested({ each: true })
@Type(() => AutoChannelButtonDto)
buttons: AutoChannelButtonDto[];
```

주의: 기존 `guideChannelId`, `guideMessage`, `buttons`가 `@IsNotEmpty()`로 항상 필수이므로, `mode === 'instant'`일 때는 `@ValidateIf` 조건을 걸어야 한다. 기존 API 호환성을 위해 `mode` 필드에 기본값 `'select'`를 설정할 수 있다.

#### 0-2. Repository `upsert()` 수정

```typescript
// 기존 업데이트 블록에 추가
config.mode = dto.mode;
config.instantCategoryId = dto.instantCategoryId ?? null;
config.instantNameTemplate = dto.instantNameTemplate ?? null;

// 신규 생성 블록에도 동일하게 추가
mode: dto.mode,
instantCategoryId: dto.instantCategoryId ?? null,
instantNameTemplate: dto.instantNameTemplate ?? null,
```

#### 0-3. Controller `save()` 수정

`mode === 'instant'`일 때는 안내 메시지 전송/갱신 로직을 스킵하고, 기존 guideMessageId가 있으면 삭제한다.

```typescript
if (dto.mode === 'select') {
  // 기존 안내 메시지 전송/갱신 로직 유지
} else {
  // instant 모드: 기존 안내 메시지가 있으면 삭제
  if (config.guideMessageId && config.guideChannelId) {
    await this.discordGateway.deleteGuideMessage(config.guideChannelId, config.guideMessageId);
    await this.configRepo.updateGuideMessageId(config.id, null);
  }
}
```

---

### Step 1: 타입 및 상수 분리 (`types.ts`)

현재 `page.tsx` 상단에 인라인으로 선언된 타입과 상수를 별도 파일로 추출한다.

```typescript
// types.ts

export type AutoChannelMode = 'select' | 'instant';

export interface SubOptionForm {
  label: string;
  emoji: string;
  channelNameTemplate: string;
}

export interface ButtonForm {
  label: string;
  emoji: string;
  targetCategoryId: string;
  channelNameTemplate: string;
  subOptions: SubOptionForm[];
}

export interface ConfigForm {
  id?: number;
  name: string;
  triggerChannelId: string;
  mode: AutoChannelMode;           // 신규
  instantCategoryId: string;       // 신규
  instantNameTemplate: string;     // 신규
  guideChannelId: string;
  guideMessage: string;
  embedTitle: string;
  embedColor: string;
  buttons: ButtonForm[];
}

// ... 기존 EMPTY_BUTTON, EMPTY_SUB, EMPTY_CONFIG(mode 기본값 'select' 추가), TabState 등
```

---

### Step 2: 스텝 섹션 래퍼 컴포넌트 (`StepSection.tsx`)

스텝 번호가 붙은 섹션 카드와 스텝 간 화살표(아래 방향)를 공통 컴포넌트로 추출한다.

```typescript
interface StepSectionProps {
  stepNumber: number;
  title: string;
  children: React.ReactNode;
}
```

- 스텝 번호는 원형 배지로 표시 (예: indigo 배경 흰 글씨)
- 섹션 카드 아래에 다음 스텝이 있으면 화살표(ChevronDown 아이콘) 표시
- 기존 `<section className="bg-white rounded-xl border...">` 패턴 재사용

---

### Step 3: 모드 선택기 컴포넌트 (`ModeSelector.tsx`)

STEP 1 섹션 내부에 배치. 트리거 채널 드롭다운 아래에 라디오 버튼 2개를 배치한다.

```typescript
interface ModeSelectorProps {
  value: AutoChannelMode;
  onChange: (mode: AutoChannelMode) => void;
}
```

- 라디오 버튼 스타일: 카드형 라디오 (선택 시 indigo 테두리+배경, 비선택 시 gray 테두리)
- 각 옵션에 아이콘과 짧은 설명 표시:
  - `즉시 생성`: "트리거 채널 입장 즉시 새 음성 채널 생성" + Zap 아이콘
  - `선택 생성`: "안내 메시지에서 게임 선택 후 채널 생성" + ListChecks 아이콘

---

### Step 4: 즉시 생성 모드 설정 컴포넌트 (`InstantModeSettings.tsx`)

`mode === 'instant'` 선택 시 STEP 2로 표시되는 폼 영역.

```typescript
interface InstantModeSettingsProps {
  instantCategoryId: string;
  instantNameTemplate: string;
  categories: DiscordChannel[];
  onChange: (partial: { instantCategoryId?: string; instantNameTemplate?: string }) => void;
}
```

- 채널명 템플릿 입력: `{username}`, `{n}` 변수 안내 텍스트 포함
- 생성 카테고리 드롭다운: 기존 categories 목록 재사용

---

### Step 5: 버튼 카드 그리드 (`ButtonCardGrid.tsx`)

현재 세로 나열 폼을 압축된 카드 그리드로 변환한다.

```typescript
interface ButtonCardGridProps {
  buttons: ButtonForm[];
  categories: DiscordChannel[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  isMaxReached: boolean;  // 25개 제한
}
```

- 그리드: `grid grid-cols-2 sm:grid-cols-3 gap-3`
- 각 카드에 표시할 정보:
  - 이모지 + 라벨 (상단)
  - 카테고리명 (categories에서 이름 조회)
  - 하위선택지 수 (예: "하위 3개")
- 카드 액션: `[수정]` 버튼 (-> 모달 open), `[삭제]` 버튼
- 마지막 위치에 `[+ 추가]` dashed-border 카드

---

### Step 6: 버튼 편집 모달 (`ButtonEditModal.tsx`)

카드 `[수정]` 또는 `[+ 추가]` 클릭 시 열리는 모달 다이얼로그.

```typescript
interface ButtonEditModalProps {
  isOpen: boolean;
  button: ButtonForm | null;       // null이면 신규 추가
  categories: DiscordChannel[];
  emojis: DiscordEmoji[];
  onSave: (button: ButtonForm) => void;
  onClose: () => void;
}
```

- 모달 구현: `<dialog>` 태그 또는 포탈 기반 오버레이 (기존 프로젝트의 모달 패턴 확인 필요)
- 모달 내부 필드:
  1. 버튼 라벨 (필수)
  2. 이모지 (선택, GuildEmojiPicker 포함)
  3. 대상 카테고리 드롭다운 (필수)
  4. 채널명 템플릿 (선택)
  5. 하위 선택지 인라인 목록 (기존 subOptions 편집 UI를 모달 내부로 이동)
- 모달 하단: `[취소]` / `[확인]` 버튼
- 모달 내부 상태로 편집 -> `[확인]` 시 부모에 콜백 전달

---

### Step 7: 통합 미리보기 패널 (`PreviewPanel.tsx`)

모드에 따라 다른 미리보기를 표시한다.

```typescript
interface PreviewPanelProps {
  mode: AutoChannelMode;
  config: ConfigForm;
  categories: DiscordChannel[];
  voiceChannels: DiscordChannel[];
}
```

- **즉시 생성 모드**:
  - 채널 구조 시각화: 카테고리 > 생성될 채널명(템플릿에 예시값 대입)
  - 트리거 채널명 표시
- **선택 생성 모드**:
  - 기존 Discord Embed 미리보기 (다크 배경 + 좌측 컬러 바) 유지
  - 버튼 미리보기 유지
  - 추가: 생성될 채널 구조 시각화

---

### Step 8: page.tsx 리팩토링

906줄의 단일 파일을 약 300줄 이내의 오케스트레이터로 축소한다.

#### 8-1. 상태 관리 유지

기존 탭 관리(tabs, activeTabIndex, tabStates), 채널/이모지 로드, 새로고침 로직은 `page.tsx`에 유지한다.

#### 8-2. 데이터 로드 수정

API GET 응답에서 `mode`, `instantCategoryId`, `instantNameTemplate`을 매핑한다.

```typescript
const loaded: ConfigForm[] = configs.map((cfg) => ({
  // ... 기존 필드
  mode: cfg.mode ?? 'select',
  instantCategoryId: cfg.instantCategoryId ?? '',
  instantNameTemplate: cfg.instantNameTemplate ?? '',
  // ...
}));
```

#### 8-3. 렌더 구조 변경

```
<StepSection stepNumber={1} title="트리거 설정">
  설정 이름 입력
  트리거 채널 선택
  <ModeSelector />
</StepSection>

{mode === 'instant' && (
  <StepSection stepNumber={2} title="채널 생성 설정">
    <InstantModeSettings />
  </StepSection>
)}

{mode === 'select' && (
  <>
    <StepSection stepNumber={2} title="안내 메시지 설정">
      안내 채널 선택
      Embed 설정 (제목, 설명, 색상, 이모지 피커)
    </StepSection>

    <StepSection stepNumber={3} title="게임 선택 버튼">
      <ButtonCardGrid />
    </StepSection>
  </>
)}

<PreviewPanel />

저장 버튼 영역
```

#### 8-4. 유효성 검사 분기

```typescript
const handleSave = async () => {
  // 공통 검증
  if (!currentTab.name.trim()) { ... }
  if (!currentTab.triggerChannelId) { ... }

  if (currentTab.mode === 'instant') {
    // 즉시 생성 모드 검증
    if (!currentTab.instantCategoryId) { ... }
  } else {
    // 선택 생성 모드 검증 (기존 로직 유지)
    if (!currentTab.guideChannelId) { ... }
    if (!currentTab.guideMessage.trim()) { ... }
    if (currentTab.buttons.length === 0) { ... }
    // 버튼별 검증 ...
  }
};
```

#### 8-5. 저장 body 구성

```typescript
const body = {
  name: currentTab.name,
  triggerChannelId: currentTab.triggerChannelId,
  mode: currentTab.mode,
  // 모드별 조건부 필드
  ...(currentTab.mode === 'instant'
    ? {
        instantCategoryId: currentTab.instantCategoryId,
        instantNameTemplate: currentTab.instantNameTemplate || undefined,
      }
    : {
        guideChannelId: currentTab.guideChannelId,
        guideMessage: currentTab.guideMessage,
        embedTitle: currentTab.embedTitle || null,
        embedColor: currentTab.embedColor || null,
        buttons: currentTab.buttons.map((b, i) => ({ ... })),
      }),
};
```

---

### Step 9: i18n 키 추가

locale JSON에 아래 키를 추가한다.

| 키 | 값 (ko) |
|----|---------|
| `autoChannel.modeLabel` | 모드 선택 |
| `autoChannel.modeSelect` | 선택 생성 |
| `autoChannel.modeInstant` | 즉시 생성 |
| `autoChannel.modeSelectDesc` | 안내 메시지에서 게임 선택 후 채널 생성 |
| `autoChannel.modeInstantDesc` | 트리거 채널 입장 즉시 새 음성 채널 생성 |
| `autoChannel.instantCategory` | 생성 카테고리 |
| `autoChannel.instantNameTemplate` | 채널명 템플릿 |
| `autoChannel.instantNameTemplateDesc` | 변수: {username}, {n} |
| `autoChannel.stepTrigger` | 트리거 설정 |
| `autoChannel.stepChannelCreate` | 채널 생성 설정 |
| `autoChannel.stepGuideMessage` | 안내 메시지 설정 |
| `autoChannel.stepButtonSetup` | 게임 선택 버튼 |
| `autoChannel.editButton` | 수정 |
| `autoChannel.subOptionCount` | 하위 {count}개 |
| `autoChannel.addButtonCard` | 버튼 추가 |

---

## 주의 사항

### 기존 코드 호환성

- `mode` 필드가 없는 기존 저장 데이터는 DB 컬럼 기본값 `'select'`로 로드되므로, 기존 설정은 자동으로 `선택 생성` 모드로 표시된다.
- 기존 API 클라이언트 코드(Bot API 등)에서 `mode` 없이 POST하는 경우를 위해, DTO에 `mode` 기본값을 `'select'`로 설정한다.

### 모달 구현 방식

프로젝트에 별도의 모달/다이얼로그 라이브러리가 없으므로, HTML `<dialog>` 엘리먼트를 사용하거나 Tailwind 기반 커스텀 오버레이로 구현한다. 기존 `window.confirm()` 패턴(탭 삭제)과의 일관성을 고려하되, 폼 편집에는 풀 모달이 적합하다.

### 컴포넌트 분리 범위

현재 906줄 단일 파일에서 약 5~6개 컴포넌트 파일로 분리한다. 상태 관리는 `page.tsx`에 집중시키고, 하위 컴포넌트는 props-driven으로 순수하게 유지한다. Context나 상태 관리 라이브러리 도입은 하지 않는다.

## 작업 순서 요약

| 순서 | 작업 | 예상 복잡도 |
|------|------|------------|
| 0 | Backend DTO/Repository/Controller 수정 | 중 |
| 1 | `types.ts` 타입/상수 추출 | 소 |
| 2 | `StepSection.tsx` 스텝 래퍼 | 소 |
| 3 | `ModeSelector.tsx` 모드 선택기 | 소 |
| 4 | `InstantModeSettings.tsx` 즉시 생성 폼 | 소 |
| 5 | `ButtonCardGrid.tsx` 카드 그리드 | 중 |
| 6 | `ButtonEditModal.tsx` 편집 모달 | 대 |
| 7 | `PreviewPanel.tsx` 통합 미리보기 | 중 |
| 8 | `page.tsx` 리팩토링 (조합 + 저장 로직) | 대 |
| 9 | i18n 키 추가 | 소 |
