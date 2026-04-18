# 신입 미션 Canvas 표시 모드 백엔드 구현 계획

## 개요

신입 미션 현황을 기존 Discord Embed 외에 Canvas(PNG 이미지) 방식으로 표시할 수 있도록 한다. 길드 설정 `missionDisplayMode`(`EMBED` | `CANVAS`)에 따라 표시 방식을 분기한다. Canvas 모드에서는 10명/이미지씩 나눠 한 메시지에 여러 PNG를 동시에 첨부한다(최대 10장 = 100명). 모코코 사냥의 Canvas 구현 패턴(`moco-rank.renderer.ts`, `moco.service.ts`, `moco-discord.presenter.ts`)을 그대로 따른다.

## PRD 참조

- `docs/specs/prd/newbie.md` -- F-NEWBIE-002-CANVAS

## 이미 완료된 작업

1. DB: `newbie_config.missionDisplayMode` 컬럼 추가 완료 (ENUM: EMBED/CANVAS, 기본 EMBED)
2. Entity: `NewbieConfigOrmEntity.missionDisplayMode` 필드 추가 완료
3. Migration: 실행 완료

## 변경 대상 파일

| 파일 | 변경 유형 |
|------|-----------|
| **신규** `apps/api/src/newbie/application/mission/mission-rank.renderer.ts` | Canvas 렌더러 전담 서비스 |
| `apps/api/src/newbie/application/mission/mission.service.ts` | displayMode 분기, Canvas 데이터 빌드, 캐시 관리 |
| `apps/api/src/newbie/application/mission/mission-discord.presenter.ts` | Canvas 전송 메서드 추가 |
| `apps/api/src/newbie/infrastructure/newbie-cache.keys.ts` | 미션 Canvas 캐시 키 추가 |
| `apps/api/src/newbie/infrastructure/newbie-config.repository.ts` | upsert에 `missionDisplayMode` 반영 |
| `apps/api/src/newbie/presentation/dto/newbie-config-save.dto.ts` | `missionDisplayMode` DTO 필드 추가 |
| `apps/api/src/newbie/newbie.module.ts` | `MissionRankRenderer` provider 등록 |

---

## 단계별 구현

### 1단계: 인프라 레이어 (DTO, Repository, 캐시 키)

#### 1-1. `newbie-config-save.dto.ts` -- `missionDisplayMode` 필드 추가

모코코 사냥 쪽의 `mocoDisplayMode` 패턴과 동일하게 추가한다.

```typescript
// 미션 — 표시 방식 (기존 미션 필드들 아래에 추가)
@IsOptional()
@IsString()
missionDisplayMode?: 'EMBED' | 'CANVAS' | null;
```

#### 1-2. `newbie-config.repository.ts` -- `upsert()` 반영

`upsert()` 메서드의 기존 레코드 업데이트 블록과 신규 생성 블록 모두에 추가:

```typescript
// 업데이트 블록 (config.missionEmbedThumbnailUrl 할당 뒤)
config.missionDisplayMode = dto.missionDisplayMode ?? 'EMBED';

// 생성 블록 (missionEmbedThumbnailUrl 뒤)
missionDisplayMode: dto.missionDisplayMode ?? 'EMBED',
```

#### 1-3. `newbie-cache.keys.ts` -- 미션 Canvas 캐시 키 추가

```typescript
/** 미션 Canvas 캐시: newbie:mission:canvas:{guildId}:page:{page} -- TTL 30초 */
missionCanvasPage: (guildId: string, page: number) =>
  `newbie:mission:canvas:${guildId}:page:${page}`,

/** 미션 Canvas 캐시 무효화용 패턴: newbie:mission:canvas:{guildId}:* */
missionCanvasPattern: (guildId: string) =>
  `newbie:mission:canvas:${guildId}:*`,
```

---

### 2단계: Canvas 렌더러 신규 생성

#### 2-1. `mission-rank.renderer.ts` 신규 파일

`moco-rank.renderer.ts`의 구조를 재활용하되, 미션 도메인에 맞는 테이블 컬럼과 프로그레스 바를 렌더링한다.

##### 레이아웃 상수

```typescript
const CANVAS_W = 800;
const ROW_HEIGHT = 48; // 프로그레스 바 포함하므로 44 -> 48
const HEADER_H = 100;  // 제목 + 요약 + 목표
const TABLE_HEADER_H = 36;
const FOOTER_H = 36;
const PADDING_V = 20;
const PADDING = 28;
const INNER_MARGIN = 8;
const CARD_RADIUS = 12;
const MAX_ENTRIES_PER_PAGE = 10;

// 프로그레스 바
const PROGRESS_BAR_W = 180;
const PROGRESS_BAR_H = 14;
const PROGRESS_BAR_RADIUS = 7; // pill 형태
const PROGRESS_BAR_BG = '#E5E7EB';

// 테이블 컬럼 너비 (합: 800 - 패딩 = 약 730px)
const COL_NAME_W = 140;
const COL_PERIOD_W = 130;
const COL_STATUS_W = 70;
const COL_PLAYTIME_W = 300; // 프로그레스바(180) + 텍스트
const COL_COUNT_W = 70;
const COL_DDAY_W = 60;

const CANVAS_CACHE_TTL_SEC = 30;
```

##### 입력 인터페이스

```typescript
export interface MissionCanvasPageData {
  /** 현재 이미지 번호 (1-based) */
  pageNumber: number;
  /** 총 이미지 수 */
  totalPages: number;
  /** 1장(첫 페이지)인지 여부 -- 헤더 표시 판단용 */
  isFirstPage: boolean;
  entries: MissionCanvasEntry[];
}

export interface MissionCanvasEntry {
  nickname: string;
  /** MM-DD~MM-DD 형식 */
  period: string;
  status: MissionStatus;
  statusEmoji: string;
  statusText: string;
  /** 누적 플레이타임 (초) */
  playtimeSec: number;
  /** 목표 플레이타임 (초) */
  targetPlaytimeSec: number;
  /** 현재 플레이횟수 */
  playCount: number;
  /** 목표 플레이횟수 (null이면 횟수 목표 없음) */
  targetPlayCount: number | null;
  /** D-day 남은 일수 (0=당일, 음수=만료) */
  daysLeft: number;
}

export interface MissionCanvasConfig {
  /** 헤더에 표시할 총 인원수 */
  totalCount: number;
  /** 상태별 인원수 */
  statusCounts: Record<string, number>;
  /** 목표 플레이타임 텍스트 (예: "20시간") */
  targetPlaytimeText: string;
  /** 목표 플레이횟수 텍스트 (예: "10회", null이면 표시 안 함) */
  targetPlayCountText: string | null;
  /** 갱신 시각 문자열 */
  updatedAt: string;
}
```

##### 렌더링 클래스 구조

```typescript
@Injectable()
export class MissionRankRenderer {
  private readonly logger = new Logger(MissionRankRenderer.name);

  constructor() {
    this.registerFonts(); // moco-rank.renderer.ts와 동일한 폰트 등록 로직
  }

  /**
   * 한 페이지(최대 10명)의 미션 현황 이미지를 렌더링한다.
   * @returns PNG Buffer
   */
  async renderPage(data: MissionCanvasPageData, config: MissionCanvasConfig): Promise<Buffer>;
}
```

##### 주요 private 메서드

| 메서드 | 역할 |
|--------|------|
| `registerFonts()` | NotoSansCJK, NotoColorEmoji 폰트 등록 (moco-rank.renderer.ts에서 복제) |
| `drawBackground(ctx, w, h)` | 배경 + 카드 그리기 (moco-rank.renderer.ts 재활용) |
| `drawHeader(ctx, config)` | 1장 전용: 제목(`신입 미션 현황`), 요약(총 N명, 상태별), 목표 |
| `drawTableHeader(ctx, startY)` | 테이블 컬럼 헤더 (닉네임, 기간, 상태, 플레이타임, 횟수, D-day) |
| `drawDataRow(ctx, entry, rowY, rowIndex)` | 한 행 렌더링 (짝수행 배경, 각 컬럼 텍스트) |
| `drawProgressBar(ctx, x, y, ratio, status)` | 인라인 프로그레스 바 (pill, 진행률별 색상) |
| `drawPlaytimeText(ctx, x, y, entry)` | 프로그레스 바 오른쪽 텍스트 (`12h30m/20h`) |
| `drawCountText(ctx, x, y, entry)` | 횟수 텍스트 (`7/10` 또는 `7`) |
| `drawDday(ctx, x, y, entry)` | D-day 텍스트 + 조건부 색상 |
| `drawFooter(ctx, config, canvasH, data)` | 갱신 시각 + 장 번호 |
| `getProgressColor(status, ratio)` | 상태+진행률별 색상 반환 |
| `getDdayColor(daysLeft, status)` | D-day 색상 반환 |
| `roundRect(ctx, x, y, w, h, r)` | 둥근 사각형 (moco-rank.renderer.ts에서 복제) |
| `truncateName(ctx, name, maxWidth)` | 이름 말줄임 (moco-rank.renderer.ts에서 복제) |

##### 프로그레스 바 색상 로직

```typescript
private getProgressColor(status: MissionStatus, ratio: number): string {
  if (status === MissionStatus.COMPLETED) return '#22C55E'; // green
  if (status === MissionStatus.FAILED) return '#EF4444';    // red
  if (status === MissionStatus.LEFT) return '#9CA3AF';      // gray
  // IN_PROGRESS
  if (ratio < 0.5) return '#F59E0B';  // amber
  if (ratio < 0.8) return '#3B82F6';  // blue
  return '#10B981';                    // emerald
}
```

##### D-day 색상 로직

```typescript
private getDdayColor(daysLeft: number, status: MissionStatus): { color: string; isBold: boolean } {
  if (status === MissionStatus.COMPLETED) return { color: TEXT_MUTED, isBold: false };
  if (status === MissionStatus.LEFT) return { color: TEXT_MUTED, isBold: false };
  if (daysLeft <= 0) return { color: '#EF4444', isBold: true };  // D-DAY / 만료
  if (daysLeft <= 2) return { color: '#EF4444', isBold: false };
  if (daysLeft <= 6) return { color: '#F59E0B', isBold: false };
  return { color: TEXT_PRIMARY, isBold: false };
}
```

##### D-day 텍스트 로직

```typescript
private formatDday(daysLeft: number, status: MissionStatus): string {
  if (status === MissionStatus.COMPLETED) return '-';
  if (status === MissionStatus.LEFT) return '-';
  if (daysLeft < 0) return '만료';
  if (daysLeft === 0) return 'D-DAY';
  return `D-${daysLeft}`;
}
```

##### 플레이타임 텍스트 포맷

```typescript
private formatPlaytime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}
```

##### 캔버스 높이 계산

```typescript
private calcCanvasHeight(data: MissionCanvasPageData): number {
  const headerH = data.isFirstPage ? HEADER_H : 0;
  const tableH = TABLE_HEADER_H + data.entries.length * ROW_HEIGHT;
  return PADDING_V + headerH + tableH + FOOTER_H + PADDING_V;
}
```

---

### 3단계: MissionDiscordPresenter -- Canvas 전송 메서드 추가

`moco-discord.presenter.ts`의 `sendOrUpdateCanvasRank()` 패턴을 따른다.

#### 3-1. 추가할 메서드

```typescript
/**
 * Canvas 모드: 여러 PNG 이미지 첨부 메시지를 전송(최초) 또는 수정(이후)한다.
 * @param imageBuffers 페이지별 PNG 버퍼 배열 (최대 10장)
 */
async sendOrUpdateCanvasMission(
  config: NewbieConfig,
  guildId: string,
  imageBuffers: Buffer[],
): Promise<void>;
```

##### 구현 상세

- `RawFile[]`을 구성: `imageBuffers.map((buf, i) => ({ name: `mission-${i + 1}.png`, data: buf }))`
- `attachments`도 동일하게 인덱스 매핑: `imageBuffers.map((_, i) => ({ id: i, filename: `mission-${i + 1}.png` }))`
- 갱신 버튼(기존 `buildRefreshButton`)은 그대로 사용
- `config.missionNotifyMessageId`가 있으면 `editMessageWithFiles`로 수정, 없으면 `sendMessageWithFiles`로 신규 전송
- 전송 후 `configRepo.updateMissionNotifyMessageId()`로 messageId 저장

#### 3-2. 기존 `refreshMissionEmbed()` 수정 불필요

`refreshMissionEmbed()`는 Embed 모드 전용이므로 그대로 유지한다. Canvas 모드 호출은 `MissionService`에서 분기하여 직접 Presenter의 `sendOrUpdateCanvasMission()`을 호출한다.

---

### 4단계: MissionService -- displayMode 분기 및 Canvas 데이터 빌드

`moco.service.ts`의 `sendOrUpdateRankEmbed()` 분기 패턴을 따른다.

#### 4-1. 추가할 의존성

```typescript
constructor(
  // ... 기존 의존성
  private readonly renderer: MissionRankRenderer,  // 신규
  private readonly redis: RedisService,            // 신규
) {}
```

#### 4-2. `refreshMissionEmbed()` 수정 -- displayMode 분기

기존 `refreshMissionEmbed()`에 Canvas 분기를 추가한다.

```typescript
async refreshMissionEmbed(guildId: string, config?: NewbieConfig): Promise<void> {
  const resolvedConfig = config ?? (await this.configRepo.findByGuildId(guildId));
  if (!resolvedConfig?.missionEnabled || !resolvedConfig.missionNotifyChannelId) {
    return;
  }

  // Canvas 모드 분기
  if (resolvedConfig.missionDisplayMode === 'CANVAS') {
    await this.refreshMissionCanvas(guildId, resolvedConfig);
    return;
  }

  // 기존 Embed 로직 (변경 없음)
  let missions = await this.missionRepo.findVisibleByGuild(guildId);
  missions = await this.removeInvalidMissions(guildId, missions);
  // ... (이하 동일)
}
```

#### 4-3. 추가할 private 메서드 -- Canvas 모드 전용

##### `refreshMissionCanvas()`

```typescript
/**
 * Canvas 모드: 미션 현황을 PNG 이미지로 렌더링하여 전송/수정한다.
 */
private async refreshMissionCanvas(guildId: string, config: NewbieConfig): Promise<void> {
  let missions = await this.missionRepo.findVisibleByGuild(guildId);
  missions = await this.removeInvalidMissions(guildId, missions);

  const statusCounts = await this.missionRepo.countByStatusForGuild(guildId);
  const missionItems = await this.buildMissionEmbedItems(guildId, missions, config);

  const totalPages = Math.max(1, Math.ceil(missionItems.length / CANVAS_PAGE_SIZE));
  const imageBuffers: Buffer[] = [];

  const canvasConfig = this.buildMissionCanvasConfig(config, missions.length, statusCounts);

  for (let page = 1; page <= totalPages; page++) {
    // 캐시 확인
    const cacheKey = NewbieKeys.missionCanvasPage(guildId, page);
    const cached = await this.redis.getBuffer(cacheKey);
    if (cached) {
      imageBuffers.push(cached);
      continue;
    }

    // 페이지별 데이터 슬라이스
    const start = (page - 1) * CANVAS_PAGE_SIZE;
    const pageItems = missionItems.slice(start, start + CANVAS_PAGE_SIZE);

    const pageData = this.toMissionCanvasPageData(pageItems, page, totalPages);
    const buffer = await this.renderer.renderPage(pageData, canvasConfig);

    await this.redis.setBuffer(cacheKey, buffer, CANVAS_CACHE_TTL_SEC);
    imageBuffers.push(buffer);
  }

  await this.presenter.sendOrUpdateCanvasMission(config, guildId, imageBuffers);
}
```

##### `buildMissionCanvasConfig()`

```typescript
private buildMissionCanvasConfig(
  config: NewbieConfig,
  totalCount: number,
  statusCounts: Record<string, number>,
): MissionCanvasConfig {
  const targetHours = config.missionTargetPlaytimeHours ?? 0;
  const targetMinutes = (config.missionTargetPlaytimeHours ?? 0) * 60 % 60;
  // targetPlaytimeText는 "20시간" 또는 "20시간 30분" 형태
  const targetPlaytimeText = targetMinutes === 0
    ? `${targetHours}시간`
    : `${targetHours}시간 ${targetMinutes}분`;

  return {
    totalCount,
    statusCounts,
    targetPlaytimeText,
    targetPlayCountText: config.missionTargetPlayCount !== null
      ? `${config.missionTargetPlayCount}회`
      : null,
    updatedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
  };
}
```

##### `toMissionCanvasPageData()`

`MissionEmbedItem[]`을 `MissionCanvasPageData`로 변환한다.

```typescript
private toMissionCanvasPageData(
  items: MissionEmbedItem[],
  page: number,
  totalPages: number,
): MissionCanvasPageData {
  return {
    pageNumber: page,
    totalPages,
    isFirstPage: page === 1,
    entries: items.map((item) => ({
      nickname: item.username,
      period: `${this.formatMMDD(item.startDate)}~${this.formatMMDD(item.endDate)}`,
      status: item.status as MissionStatus,
      statusEmoji: this.getStatusEmoji(item.status),
      statusText: this.getStatusText(item.status),
      playtimeSec: item.playtimeSec,
      targetPlaytimeSec: this.parseTargetPlaytimeSec(item.targetPlaytime),
      playCount: item.playCount,
      targetPlayCount: item.targetPlayCount,
      daysLeft: item.daysLeft,
    })),
  };
}
```

##### 유틸 메서드 추가

```typescript
/** YYYY-MM-DD -> MM-DD */
private formatMMDD(dateStr: string): string {
  return dateStr.slice(5); // "2024-03-15" -> "03-15"
}

private getStatusEmoji(status: string): string {
  const map: Record<string, string> = {
    IN_PROGRESS: '🟡', COMPLETED: '✅', FAILED: '❌', LEFT: '🚪',
  };
  return map[status] ?? '❓';
}

private getStatusText(status: string): string {
  const map: Record<string, string> = {
    IN_PROGRESS: '진행', COMPLETED: '완료', FAILED: '실패', LEFT: '퇴장',
  };
  return map[status] ?? '?';
}

/** "20시간" 또는 "20시간 30분" -> 초 단위 변환 */
private parseTargetPlaytimeSec(targetPlaytime: string): number {
  const hourMatch = targetPlaytime.match(/(\d+)시간/);
  const minMatch = targetPlaytime.match(/(\d+)분/);
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 3600 + minutes * 60;
}
```

#### 4-4. Canvas 캐시 무효화 메서드 추가

```typescript
/**
 * 해당 길드의 미션 Canvas 캐시를 전체 삭제한다.
 * 미션 상태 변경, config 저장 시 호출한다.
 */
async invalidateMissionCanvasCache(guildId: string): Promise<void> {
  const pattern = NewbieKeys.missionCanvasPattern(guildId);
  await this.redis.deleteByPattern(pattern);
}
```

#### 4-5. 캐시 무효화 호출 위치

기존에 `this.newbieRedis.deleteMissionActive(guildId)` 를 호출하는 모든 곳 뒤에 `this.invalidateMissionCanvasCache(guildId)`를 추가한다. 해당 위치:

- `createMission()` (미션 생성 후)
- `createMissionFromBot()` (봇 API 미션 생성 후)
- `invalidateAndRefresh()` (갱신 버튼 클릭 시)
- `completeMission()` (수동 성공 처리 후)
- `failMission()` (수동 실패 처리 후)
- `hideMission()` (Embed 숨김 처리 후)
- `unhideMission()` (Embed 숨김 해제 후)
- `registerMissingMembers()` (자동 등록 후)
- `removeInvalidMissions()` (봇/탈퇴 멤버 정리 후)

#### 4-6. 상수 추가

```typescript
/** Canvas 모드 페이지당 미션 수 */
const CANVAS_PAGE_SIZE = 10;

/** Canvas 캐시 TTL (초) */
const CANVAS_CACHE_TTL_SEC = 30;
```

---

### 5단계: NewbieModule 등록

#### 5-1. `newbie.module.ts` 수정

```typescript
import { MissionRankRenderer } from './application/mission/mission-rank.renderer';

// providers 배열 Unit C 섹션에 추가
MissionRankRenderer,
```

---

## 통합 포인트

### 기존 코드와의 관계

| 기존 코드 | 통합 방식 |
|-----------|-----------|
| `MissionService.refreshMissionEmbed()` | 메서드 앞부분에 `missionDisplayMode === 'CANVAS'` 분기를 추가하여 Canvas 렌더링 경로로 빠짐 |
| `MissionDiscordPresenter.refreshMissionEmbed()` | Embed 전용으로 유지. Canvas 전송은 새로운 `sendOrUpdateCanvasMission()` 사용 |
| `MissionDiscordPresenter.buildRefreshButton()` | Canvas 모드에서도 동일한 갱신 버튼 사용 (customId: `newbie_mission:refresh:{guildId}`) |
| `config.missionNotifyMessageId` | EMBED/CANVAS 모드 공유. 모드 전환 시 기존 메시지 수정 실패하면 신규 전송 |
| `RedisService.getBuffer/setBuffer/deleteByPattern` | 모코코 Canvas와 동일한 Redis 캐시 인프라 재활용 |
| `DiscordRestService.sendMessageWithFiles/editMessageWithFiles` | 모코코 Canvas 구현 시 이미 추가된 메서드 재활용 |
| `NewbieKeys` | 미션용 Canvas 캐시 키를 기존 패턴에 맞춰 추가 |
| `MissionEmbedItem` 인터페이스 | Canvas 데이터 빌드 시에도 재활용 (기존 `buildMissionEmbedItems()` 출력을 Canvas 입력으로 변환) |
| `MissionService.invalidateAndRefresh()` | 갱신 버튼 클릭 시 `refreshMissionEmbed()` 호출 -- 이 안에서 displayMode 분기가 자동 적용됨 |

### 모코코 Canvas와의 차이점

| 항목 | 모코코 Canvas | 미션 Canvas |
|------|--------------|-------------|
| 페이지네이션 | 이전/다음 버튼 (1장씩 표시) | 없음 (여러 장 동시 첨부) |
| 첨부 파일 수 | 1장 | 최대 10장 |
| 테이블 컬럼 | 순위, 사냥꾼, 점수, 시간, 세션, 모코코 | 닉네임, 기간, 상태, 플레이타임+프로그레스바, 횟수, D-day |
| 프로그레스 바 | 없음 | 있음 (인라인, pill, 진행률별 색상) |
| 1장 헤더 | 제목 + 기간 | 제목 + 요약(상태별 인원수) + 목표 |
| 캐시 키 | `newbie:moco:canvas:{guildId}:rank:{page}` | `newbie:mission:canvas:{guildId}:page:{page}` |

---

## 구현 순서 요약

1. **1단계**: DTO + Repository + 캐시 키 (인프라)
2. **2단계**: `MissionRankRenderer` 신규 생성 (Canvas 렌더러)
3. **3단계**: `MissionDiscordPresenter` Canvas 전송 메서드 추가
4. **4단계**: `MissionService` displayMode 분기 + Canvas 데이터 빌드 + 캐시 관리
5. **5단계**: `NewbieModule` provider 등록

각 단계는 순차적으로 진행하며, 2단계(렌더러)가 가장 코드량이 많다. 3~4단계는 모코코 Canvas 구현 패턴을 거의 그대로 따르므로 빠르게 구현 가능하다.
