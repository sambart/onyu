# 음악 설정 페이지 (F-WEB-014) 구현 계획

> PRD: [web.md](../specs/prd/web.md) F-WEB-014, [music.md](../specs/prd/music.md) 웹 설정 섹션
> 날짜: 2026-03-21

## 목표

음악 전용 채널의 임베드 커스터마이징, 버튼 구성, 기본설정 초기화 기능을 웹 대시보드에서 관리할 수 있는 설정 페이지를 구현한다.

## 선행 조건

- **DB 엔티티 완료**: `MusicChannelConfigOrm` (`music_channel_config` 테이블)이 이미 존재한다. `guildId`, `channelId`, `messageId`, `embedTitle`, `embedDescription`, `embedColor`, `embedThumbnailUrl`, `buttonConfig`(JSONB), `enabled` 컬럼 모두 정의됨.
- **Backend REST API 미구현**: `apps/api/src/music/` 하위에 ORM 엔티티만 존재하고, Controller/DTO/Repository가 아직 없다. Step 0에서 백엔드를 먼저 구현해야 한다.
- **Bot 측 MusicChannelService 존재**: Bot 앱에 임베드 전송/갱신 로직이 이미 구현되어 있다. API 서버에서 Bot API를 호출하여 임베드 갱신을 트리거해야 한다.

## API 경로 정리

PRD web.md(F-WEB-014)와 music.md 간 API 경로가 다르다. F-WEB-014 명세를 최종 기준으로 채택한다.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/guilds/:guildId/music/config` | 음악 채널 설정 조회 |
| `PUT` | `/api/guilds/:guildId/music/config` | 음악 채널 설정 저장 (upsert) |
| `POST` | `/api/guilds/:guildId/music/config/reset` | 기본설정 초기화 (임베드+버튼만, 채널 유지) |

## 변경 파일 목록

### Step 0: 백엔드 API 구현

| 파일 | 변경 |
|------|------|
| `apps/api/src/music/dto/music-channel-config.dto.ts` | **신규**. 요청/응답 DTO 정의 |
| `apps/api/src/music/infrastructure/music-channel-config.repository.ts` | **신규**. TypeORM Repository (findByGuildId, upsert, resetToDefaults) |
| `apps/api/src/music/music-channel-config.controller.ts` | **신규**. REST Controller (GET, PUT, POST reset) |
| `apps/api/src/music/music.module.ts` | **신규**. NestJS 모듈 선언 (Controller, Repository, TypeORM import) |
| `apps/api/src/app.module.ts` | **수정**. MusicModule import 추가 |

### Step 1: 프론트엔드 API 클라이언트

| 파일 | 변경 |
|------|------|
| `apps/web/app/lib/music-config-api.ts` | **신규**. 타입 + API 함수 |

### Step 2: 음악 설정 페이지

| 파일 | 변경 |
|------|------|
| `apps/web/app/settings/guild/[guildId]/music/page.tsx` | **신규**. 설정 페이지 컴포넌트 |

### Step 3: 사이드바 메뉴 추가

| 파일 | 변경 |
|------|------|
| `apps/web/app/components/SettingsSidebar.tsx` | **수정**. menuItems에 음악 설정 항목 추가 |

### Step 4: i18n 키 추가

| 파일 | 변경 |
|------|------|
| `libs/i18n/locales/ko/web/settings.json` | **수정**. `music` 섹션 키 추가 |
| `libs/i18n/locales/en/web/settings.json` | **수정**. `music` 섹션 키 추가 |
| `libs/i18n/locales/ko/web/common.json` | **수정**. `settings.music` 사이드바 라벨 추가 |
| `libs/i18n/locales/en/web/common.json` | **수정**. `settings.music` 사이드바 라벨 추가 |

---

## 구현 단계

### Step 0: 백엔드 API 구현

#### 0-1. DTO (`music-channel-config.dto.ts`)

```typescript
// ─── 버튼 타입 ───────────────────────────────────────────────────────────

export type MusicButtonType =
  | 'search'
  | 'pause_resume'
  | 'skip'
  | 'stop'
  | 'queue'
  | 'melon_chart'
  | 'billboard_chart';

export class MusicButtonConfigDto {
  @IsString()
  @IsIn(['search', 'pause_resume', 'skip', 'stop', 'queue', 'melon_chart', 'billboard_chart'])
  type: MusicButtonType;

  @IsString()
  label: string;

  @IsString()
  emoji: string;

  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(0)
  @Max(4)
  row: number;
}

// ─── 저장 요청 DTO ──────────────────────────────────────────────────────

export class MusicChannelConfigSaveDto {
  @IsString()
  channelId: string;

  @IsOptional()
  @IsString()
  embedTitle: string | null;

  @IsOptional()
  @IsString()
  embedDescription: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  embedColor: string | null;

  @IsOptional()
  @IsString()
  @IsUrl()
  embedThumbnailUrl: string | null;

  @ValidateNested({ each: true })
  @Type(() => MusicButtonConfigDto)
  buttons: MusicButtonConfigDto[];

  @IsBoolean()
  enabled: boolean;
}

// ─── 응답 DTO ───────────────────────────────────────────────────────────

export interface MusicChannelConfigResponse {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttons: MusicButtonConfigDto[];
  enabled: boolean;
}
```

#### 0-2. Repository (`music-channel-config.repository.ts`)

기존 `status-prefix` 등의 Repository 패턴을 따른다.

- `findByGuildId(guildId)`: 설정 조회. 없으면 `null` 반환.
- `upsert(guildId, dto)`: guildId로 조회 후 있으면 업데이트, 없으면 삽입. `buttonConfig`는 `{ buttons: dto.buttons }` JSONB로 저장.
- `resetToDefaults(guildId)`: 임베드 필드(embedTitle, embedDescription, embedColor, embedThumbnailUrl) + buttonConfig를 기본값으로 초기화. channelId/enabled/messageId는 유지.

기본값 상수 정의:

```typescript
const DEFAULT_BUTTONS: MusicButtonConfig[] = [
  { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
  { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
  { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
  { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
  { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
  { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
  { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
];
```

#### 0-3. Controller (`music-channel-config.controller.ts`)

```typescript
@Controller('guilds/:guildId/music/config')
@UseGuards(JwtAuthGuard)
export class MusicChannelConfigController {
  @Get()
  async getConfig(@Param('guildId') guildId: string): Promise<MusicChannelConfigResponse | null> {}

  @Put()
  async saveConfig(
    @Param('guildId') guildId: string,
    @Body() dto: MusicChannelConfigSaveDto,
  ): Promise<MusicChannelConfigResponse> {}

  @Post('reset')
  async resetConfig(@Param('guildId') guildId: string): Promise<MusicChannelConfigResponse> {}
}
```

- `PUT`: DB upsert 후, Bot API를 호출하여 Discord 채널에 임베드 전송/갱신 트리거. Bot API 호출 패턴은 기존 코드베이스의 Bot-API 연동 방식을 따른다.
- `POST reset`: `resetToDefaults()` 호출 후 임베드 갱신 트리거.
- `GET`: `null` 반환 시 프론트엔드에서 기본값으로 폼 초기화.

#### 0-4. Module 등록

`MusicModule`을 `AppModule`의 imports에 추가한다. TypeORM `forFeature([MusicChannelConfigOrm])` 포함.

---

### Step 1: API 클라이언트 (`music-config-api.ts`)

`sticky-message-api.ts` 패턴을 따른다.

```typescript
// ─── 타입 정의 ──────────────────────────────────────────────────────────

export type MusicButtonType =
  | 'search'
  | 'pause_resume'
  | 'skip'
  | 'stop'
  | 'queue'
  | 'melon_chart'
  | 'billboard_chart';

export interface MusicButtonConfig {
  type: MusicButtonType;
  label: string;
  emoji: string;
  enabled: boolean;
  row: number;  // 0~4
}

export interface MusicChannelConfig {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttons: MusicButtonConfig[];
  enabled: boolean;
}

export interface MusicChannelConfigSaveDto {
  channelId: string;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttons: MusicButtonConfig[];
  enabled: boolean;
}

// ─── API 함수 ───────────────────────────────────────────────────────────

import { apiClient } from './api-client';

/** 음악 채널 설정을 조회한다. 설정이 없으면 null. */
export async function fetchMusicConfig(
  guildId: string,
): Promise<MusicChannelConfig | null> {
  return apiClient<MusicChannelConfig | null>(
    `/api/guilds/${guildId}/music/config`,
  );
}

/** 음악 채널 설정을 저장한다 (upsert). */
export async function saveMusicConfig(
  guildId: string,
  data: MusicChannelConfigSaveDto,
): Promise<MusicChannelConfig> {
  return apiClient<MusicChannelConfig>(
    `/api/guilds/${guildId}/music/config`,
    { method: 'PUT', body: data },
  );
}

/** 음악 채널 설정을 기본값으로 초기화한다 (채널 지정은 유지). */
export async function resetMusicConfig(
  guildId: string,
): Promise<MusicChannelConfig> {
  return apiClient<MusicChannelConfig>(
    `/api/guilds/${guildId}/music/config/reset`,
    { method: 'POST' },
  );
}
```

---

### Step 2: 음악 설정 페이지 (`music/page.tsx`)

`status-prefix/page.tsx` 패턴을 기반으로 단일 폼 구조로 구현한다. 탭 시스템은 불필요 (길드당 1개 설정).

#### 컴포넌트 구조

```
page.tsx (MusicSettingsPage)
  ├─ 페이지 헤더 (아이콘 + 제목 + 채널 새로고침 버튼)
  ├─ 섹션 1: 기본 설정 (채널 선택 + 활성화 토글)
  ├─ 섹션 2: 임베드 커스터마이징 (제목, 설명, 색상, 썸네일 URL, 실시간 미리보기)
  ├─ 섹션 3: 버튼 구성 (7종 고정 버튼 카드 목록)
  ├─ 섹션 4: 기본설정 초기화 버튼
  └─ 저장 버튼 + 피드백 메시지
```

#### 상태 관리

```typescript
// 폼 상태
const [config, setConfig] = useState<FormState>(DEFAULT_FORM);
const [channels, setChannels] = useState<DiscordChannel[]>([]);
const [emojis, setEmojis] = useState<DiscordEmoji[]>([]);

// UI 상태
const [isLoading, setIsLoading] = useState(false);
const [isRefreshing, setIsRefreshing] = useState(false);
const [isSaving, setIsSaving] = useState(false);
const [isResetting, setIsResetting] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);
const [saveSuccess, setSaveSuccess] = useState(false);
```

`FormState` 인터페이스:

```typescript
interface FormState {
  channelId: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  embedThumbnailUrl: string;
  buttons: MusicButtonConfig[];
  enabled: boolean;
}
```

기본값 상수 (`DEFAULT_FORM`):

```typescript
const DEFAULT_EMBED_COLOR = '#5865F2';

const DEFAULT_BUTTONS: MusicButtonConfig[] = [
  { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
  { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
  { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
  { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
  { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
  { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
  { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
];

const DEFAULT_FORM: FormState = {
  channelId: '',
  embedTitle: '',
  embedDescription: '',
  embedColor: DEFAULT_EMBED_COLOR,
  embedThumbnailUrl: '',
  buttons: DEFAULT_BUTTONS,
  enabled: true,
};
```

#### 섹션 1: 기본 설정

`status-prefix/page.tsx`의 기본 설정 섹션과 동일한 패턴.

- 활성화 토글: `config.enabled` 제어
- 텍스트 채널 선택 드롭다운: `fetchGuildTextChannels()` 재사용
- 안내 문구: "채널 선택 후 저장 시 해당 채널에 고정 임베드 메시지가 자동 전송/갱신됩니다."

#### 섹션 2: 임베드 커스터마이징

`sticky-message/page.tsx`와 `status-prefix/page.tsx`의 Embed 설정 섹션 패턴 재사용.

- 제목 입력 (`input type="text"`)
- 설명 텍스트에리어 (`textarea`) + 길드 이모지 피커 (`GuildEmojiPicker` 재사용)
- 색상 피커 (`input type="color"` + HEX 텍스트 입력) -- 기존 패턴 그대로
- **썸네일 URL 입력** (`input type="text"`) -- 기존 페이지에 없는 신규 필드
  - placeholder: `https://example.com/image.png`
  - 클라이언트 유효성 검사: 빈 문자열이거나 `https?://` 패턴 매칭
  - 유효하지 않은 URL 시 인라인 오류 텍스트

실시간 미리보기 패널 (기존 Embed 미리보기 패턴 확장):

```tsx
<div className="bg-[#2B2D31] rounded-lg p-4">
  <div className="bg-[#313338] rounded-md overflow-hidden"
       style={{ borderLeft: `4px solid ${config.embedColor || DEFAULT_EMBED_COLOR}` }}>
    <div className="p-4 flex gap-4">
      {/* 좌측: 텍스트 영역 */}
      <div className="flex-1">
        <p className="text-white font-semibold text-sm mb-1 break-words">
          {config.embedTitle || t('common.noTitle')}
        </p>
        <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">
          {config.embedDescription || t('common.noDescription')}
        </p>
        {/* 버튼 미리보기: 행 단위 그룹핑 */}
        {renderButtonPreview()}
      </div>
      {/* 우측: 썸네일 */}
      {config.embedThumbnailUrl && isValidUrl(config.embedThumbnailUrl) && (
        <img src={config.embedThumbnailUrl} alt="thumbnail"
             className="w-16 h-16 rounded object-cover flex-shrink-0" />
      )}
    </div>
  </div>
</div>
```

버튼 미리보기 렌더링 (`renderButtonPreview`):
- 활성화된 버튼만 필터링
- `row` 번호로 그룹핑 (0~4)
- 각 행을 `flex flex-wrap gap-1 mt-2`로 렌더링
- 버튼: `px-2 py-1 bg-[#4F545C] text-white text-xs rounded font-medium`

#### 섹션 3: 버튼 구성

7종 고정 버튼을 카드 목록으로 표시한다. `status-prefix/page.tsx`의 버튼 카드와 유사하되, 추가/삭제/순서이동은 불필요 (고정 7종).

각 버튼 카드:

```
┌──────────────────────────────────────────────────────┐
│ [토글] search  음악 검색하기                           │
│                                                      │
│ 라벨: [__________]  이모지: [____] [이모지피커]        │
│ Row:  [셀렉트 0~4]                                   │
└──────────────────────────────────────────────────────┘
```

구현 상세:
- 각 카드 상단: 활성화 토글 스위치 + 버튼 타입 배지 + 기본 라벨 텍스트
- 비활성화 시 라벨/이모지/Row 필드를 `disabled` 처리
- 라벨 입력: `input type="text"`, placeholder로 기본값 표시
- 이모지 입력: `input type="text"` + `GuildEmojiPicker` (기존 `status-prefix` 패턴 재사용)
- Row 선택: `select` (options: 1행~5행, 값: 0~4)

버튼 업데이트 헬퍼:

```typescript
const updateButton = (type: MusicButtonType, patch: Partial<MusicButtonConfig>) => {
  setConfig(prev => ({
    ...prev,
    buttons: prev.buttons.map(btn =>
      btn.type === type ? { ...btn, ...patch } : btn,
    ),
  }));
};
```

#### 섹션 4: 기본설정 초기화

```tsx
<section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
  <h2>기본설정 초기화</h2>
  <p>임베드 설정과 버튼 구성을 기본값으로 되돌립니다. 채널 지정은 유지됩니다.</p>
  <button onClick={handleReset}>기본설정으로 초기화</button>
</section>
```

- 클릭 시 `window.confirm()` 확인 다이얼로그 표시
- 확인 시 `resetMusicConfig(guildId)` 호출
- 응답으로 받은 값을 폼 상태에 반영

#### 저장 핸들러

```typescript
const handleSave = async () => {
  // 1. 유효성 검사
  if (config.enabled && !config.channelId) {
    setSaveError(t('music.validationChannel'));
    return;
  }
  if (config.embedThumbnailUrl && !isValidUrl(config.embedThumbnailUrl)) {
    setSaveError(t('music.validationThumbnailUrl'));
    return;
  }

  // 2. API 호출
  const payload: MusicChannelConfigSaveDto = {
    channelId: config.channelId,
    embedTitle: config.embedTitle || null,
    embedDescription: config.embedDescription || null,
    embedColor: config.embedColor,
    embedThumbnailUrl: config.embedThumbnailUrl || null,
    buttons: config.buttons,
    enabled: config.enabled,
  };

  const saved = await saveMusicConfig(selectedGuildId, payload);

  // 3. 성공 피드백
  setSaveSuccess(true);
  setTimeout(() => setSaveSuccess(false), 3000);
};
```

#### 초기 로드

```typescript
useEffect(() => {
  if (!selectedGuildId) return;
  setIsLoading(true);

  Promise.all([
    fetchMusicConfig(selectedGuildId).catch(() => null),
    fetchGuildTextChannels(selectedGuildId).catch(() => []),
    fetchGuildEmojis(selectedGuildId).catch(() => []),
  ]).then(([cfg, chs, ems]) => {
    if (cfg) {
      setConfig({
        channelId: cfg.channelId,
        embedTitle: cfg.embedTitle ?? '',
        embedDescription: cfg.embedDescription ?? '',
        embedColor: cfg.embedColor ?? DEFAULT_EMBED_COLOR,
        embedThumbnailUrl: cfg.embedThumbnailUrl ?? '',
        buttons: cfg.buttons,
        enabled: cfg.enabled,
      });
    }
    setChannels(chs);
    setEmojis(ems);
  }).finally(() => setIsLoading(false));
}, [selectedGuildId]);
```

---

### Step 3: 사이드바 메뉴 추가

`apps/web/app/components/SettingsSidebar.tsx`의 `menuItems` 배열에 추가:

```typescript
// lucide-react에서 Music 아이콘 import 추가
import { ..., Music } from 'lucide-react';

// menuItems 배열 내 적절한 위치 (sticky-message 다음)에 삽입
{ href: `/settings/guild/${selectedGuildId}/music`, label: t("settings.music"), icon: Music },
```

---

### Step 4: i18n 키 추가

#### `libs/i18n/locales/ko/web/common.json`

`settings` 객체에 추가:

```json
"music": "음악 설정"
```

#### `libs/i18n/locales/en/web/common.json`

```json
"music": "Music Settings"
```

#### `libs/i18n/locales/ko/web/settings.json`

`music` 섹션 추가:

```json
"music": {
  "title": "음악 설정",
  "description": "음악 전용 채널의 임베드와 버튼을 설정합니다.",
  "basicSettings": "기본 설정",
  "enableFeature": "음악 채널 기능 활성화",
  "enableFeatureDesc": "활성화하면 지정된 채널에 음악 플레이어 임베드가 표시됩니다.",
  "channelLabel": "음악 전용 채널",
  "channelDesc": "채널 선택 후 저장 시 해당 채널에 고정 임베드 메시지가 자동 전송/갱신됩니다.",
  "validationChannel": "음악 전용 채널을 선택해주세요.",
  "embedSettings": "임베드 설정",
  "thumbnailUrl": "썸네일 이미지 URL",
  "thumbnailUrlPlaceholder": "https://example.com/image.png",
  "thumbnailUrlDesc": "대기 상태 임베드에 표시될 썸네일 이미지 URL을 입력하세요.",
  "validationThumbnailUrl": "올바른 URL 형식을 입력해주세요.",
  "buttonSettings": "버튼 구성",
  "buttonSettingsDesc": "음악 플레이어에 표시될 버튼을 설정합니다. 같은 행에 최대 5개까지 배치할 수 있습니다.",
  "buttonLabel": "라벨",
  "buttonEmoji": "이모지",
  "buttonRow": "행",
  "buttonRowOption": "{row}행",
  "buttonType_search": "음악 검색",
  "buttonType_pause_resume": "일시정지/재개",
  "buttonType_skip": "스킵",
  "buttonType_stop": "정지",
  "buttonType_queue": "재생목록",
  "buttonType_melon_chart": "멜론차트",
  "buttonType_billboard_chart": "빌보드",
  "resetSettings": "기본설정 초기화",
  "resetSettingsDesc": "임베드 설정(제목, 설명, 색상, 썸네일)과 버튼 구성을 기본값으로 되돌립니다. 채널 지정은 유지됩니다.",
  "resetButton": "기본설정으로 초기화",
  "resetConfirm": "임베드 설정과 버튼 구성이 기본값으로 초기화됩니다. 계속하시겠습니까?",
  "resetSuccess": "기본설정으로 초기화되었습니다.",
  "saveSuccess": "저장되었습니다."
}
```

#### `libs/i18n/locales/en/web/settings.json`

동일 구조의 영문 번역 추가.

---

## 재사용 컴포넌트 정리

| 컴포넌트/유틸 | 출처 | 용도 |
|---------------|------|------|
| `GuildEmojiPicker` | `apps/web/app/components/GuildEmojiPicker.tsx` | 임베드 설명 이모지 삽입 + 버튼별 이모지 선택 |
| `fetchGuildTextChannels` | `apps/web/app/lib/discord-api.ts` | 채널 목록 조회 |
| `fetchGuildEmojis` | `apps/web/app/lib/discord-api.ts` | 길드 커스텀 이모지 조회 |
| `apiClient` | `apps/web/app/lib/api-client.ts` | API 호출 래퍼 |
| `useSettings` (SettingsContext) | `apps/web/app/settings/SettingsContext.tsx` | selectedGuildId 접근 |
| 색상 피커 패턴 | `status-prefix/page.tsx` | `input[type=color]` + HEX 텍스트 입력 |
| Embed 미리보기 패턴 | `sticky-message/page.tsx` | Discord 다크모드 스타일 미리보기 |
| 활성화 토글 패턴 | `status-prefix/page.tsx` | `role="switch"` 버튼 토글 |

## 기존 코드와의 충돌 여부

- **충돌 없음**: 음악 설정 관련 프론트엔드/백엔드 코드가 아직 존재하지 않으므로 모두 신규 파일 생성이다.
- `SettingsSidebar.tsx`만 기존 파일 수정이 필요하며, `menuItems` 배열에 1개 항목 추가로 충돌 가능성이 극히 낮다.
- i18n JSON 파일도 기존 키와 겹치지 않는 `music` 네임스페이스를 사용한다.
- `AppModule`에 `MusicModule` import 추가 시 다른 모듈과 충돌 없음.

## 작업 순서 요약

1. **Step 0**: 백엔드 DTO/Repository/Controller/Module 구현 (프론트엔드 선행 조건)
2. **Step 4**: i18n 키 추가 (프론트엔드 작업 전 준비)
3. **Step 1**: 프론트엔드 API 클라이언트
4. **Step 2**: 음악 설정 페이지 컴포넌트
5. **Step 3**: 사이드바 메뉴 항목 추가
