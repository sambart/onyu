# 모코코 순위 Canvas 렌더링 백엔드 구현 계획

## 개요

모코코 사냥 순위를 기존 Discord Embed 외에 Canvas(PNG 이미지) 방식으로도 표시할 수 있도록 한다. 길드 설정 `mocoDisplayMode`(`EMBED` | `CANVAS`)에 따라 표시 방식을 분기한다. Canvas 모드에서는 한 페이지에 10명의 사냥꾼 순위를 테이블 형태로 렌더링하고, "내 순위" 버튼은 개인 상세 이미지를 Ephemeral로 반환한다.

## PRD 참조

- `docs/specs/prd/newbie.md` -- F-NEWBIE-003-CANVAS

## 변경 대상 파일

| 파일 | 변경 유형 |
|------|-----------|
| `apps/api/src/newbie/application/moco/moco-rank.renderer.ts` | **신규** -- Canvas 렌더링 전담 서비스 |
| `apps/api/src/newbie/application/moco/moco-discord.presenter.ts` | 수정 -- displayMode 분기, Canvas payload 생성 |
| `apps/api/src/newbie/application/moco/moco.service.ts` | 수정 -- Canvas 모드용 데이터 조회, 캐시 연동, 10명/페이지 |
| `apps/api/src/discord-rest/discord-rest.service.ts` | 수정 -- 파일 첨부 메시지 전송/수정 메서드 추가 |
| `apps/api/src/newbie/infrastructure/newbie-cache.keys.ts` | 수정 -- Canvas 캐시 키 추가 |
| `apps/api/src/newbie/infrastructure/newbie-config.repository.ts` | 수정 -- upsert에 `mocoDisplayMode` 필드 반영 |
| `apps/api/src/newbie/presentation/dto/newbie-config-save.dto.ts` | 수정 -- `mocoDisplayMode` 필드 추가 |
| `apps/api/src/newbie/newbie.module.ts` | 수정 -- `MocoRankRenderer` provider 등록 |
| `apps/api/src/bot-api/newbie/bot-newbie.controller.ts` | 수정 -- Canvas 모드 대응 (파일 바이너리 응답) |
| `libs/bot-api-client/src/bot-api-client.service.ts` | 수정 -- Canvas 모드 응답 타입 처리 |
| `apps/bot/src/event/newbie/bot-newbie-interaction.handler.ts` | 수정 -- Canvas 모드 분기 (파일 첨부 메시지 edit) |

---

## 단계별 구현

### 1단계: DTO, Repository, 캐시 키 업데이트

기존 인프라 레이어에 `mocoDisplayMode` 필드를 추가하고, Canvas 캐시 키를 정의한다.

#### 1-1. `newbie-config-save.dto.ts` 수정

```typescript
// 모코코 사냥 — 기존 필드들 아래에 추가
@IsOptional()
@IsString()
mocoDisplayMode?: 'EMBED' | 'CANVAS' | null;
```

#### 1-2. `newbie-config.repository.ts` 수정

`upsert()` 메서드의 기존 레코드 업데이트 블록과 신규 생성 블록 모두에 추가:

```typescript
config.mocoDisplayMode = dto.mocoDisplayMode ?? 'EMBED';
```

#### 1-3. `newbie-cache.keys.ts` 수정

```typescript
/** Canvas 랭킹 보드 캐시: newbie:moco:canvas:{guildId}:rank:{page} — TTL 30초 */
mocoCanvasRank: (guildId: string, page: number) =>
  `newbie:moco:canvas:${guildId}:rank:${page}`,

/** Canvas 개인 상세 캐시: newbie:moco:canvas:{guildId}:detail:{hunterId} — TTL 30초 */
mocoCanvasDetail: (guildId: string, hunterId: string) =>
  `newbie:moco:canvas:${guildId}:detail:${hunterId}`,

/** Canvas 캐시 무효화용 패턴: newbie:moco:canvas:{guildId}:* */
mocoCanvasPattern: (guildId: string) =>
  `newbie:moco:canvas:${guildId}:*`,
```

---

### 2단계: DiscordRestService 파일 첨부 메서드 추가

현재 `sendMessage()`와 `editMessage()`는 JSON body만 전송한다. Canvas 모드에서는 PNG 이미지를 Discord 파일 첨부로 전송해야 하므로, `@discordjs/rest`의 `RawFile` 인터페이스를 활용하는 메서드를 추가한다.

#### 2-1. `discord-rest.service.ts`에 추가할 메서드

```typescript
import type { RawFile } from 'discord.js';

/**
 * 파일 첨부와 함께 메시지를 전송한다.
 * Canvas 이미지 등 바이너리 데이터를 Discord 채널에 전송할 때 사용한다.
 */
async sendMessageWithFiles(
  channelId: string,
  payload: RESTPostAPIChannelMessageJSONBody,
  files: RawFile[],
): Promise<APIMessage> {
  return (await this.rest.post(Routes.channelMessages(channelId), {
    body: payload,
    files,
  })) as APIMessage;
}

/**
 * 파일 첨부와 함께 기존 메시지를 수정한다.
 * Canvas 이미지 갱신 시 사용한다.
 */
async editMessageWithFiles(
  channelId: string,
  messageId: string,
  payload: RESTPatchAPIChannelMessageJSONBody,
  files: RawFile[],
): Promise<APIMessage> {
  return (await this.rest.patch(Routes.channelMessage(channelId, messageId), {
    body: payload,
    files,
  })) as APIMessage;
}
```

**참고**: `discord.js`의 `REST.post()`/`REST.patch()`는 `files` 옵션을 지원하며, 자동으로 `multipart/form-data`로 변환한다.

---

### 3단계: MocoRankRenderer 신규 생성

`apps/api/src/newbie/application/moco/moco-rank.renderer.ts`

`profile-card-renderer.ts`의 아키텍처를 재활용하여 Canvas 렌더링 전담 서비스를 만든다.

#### 3-1. 클래스 구조

```typescript
import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { Injectable, Logger } from '@nestjs/common';

// ── 랭킹 보드 레이아웃 상수 ──
const RANK_W = 800;
const RANK_MIN_H = 400;
const RANK_MAX_H = 1200;

// ── 개인 상세 레이아웃 상수 ──
const DETAIL_W = 600;

// ── 색상 팔레트 (profile-card-renderer.ts 참조) ──
const BG = '#f0f0f0';
const CARD_BG = '#ffffff';
const ACCENT = '#f5f5f5';
const BLURPLE = '#5B8DEF';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const BORDER = '#e0e0e0';
const DIVIDER = '#e5e5e5';

// ── 테이블 레이아웃 ──
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 56;
const PADDING = 32;

@Injectable()
export class MocoRankRenderer {
  private readonly logger = new Logger(MocoRankRenderer.name);

  constructor() {
    this.registerFonts();
  }

  private registerFonts(): void { /* profile-card-renderer.ts와 동일 */ }
}
```

#### 3-2. `renderRankBoard()` 메서드

```typescript
/**
 * 랭킹 테이블 이미지를 렌더링한다.
 * @param data 페이지 내 사냥꾼 목록 (최대 10명)
 * @param config 길드 설정 (점수 규칙, 기간 정보)
 * @returns PNG Buffer
 */
async renderRankBoard(data: MocoCanvasRankData, config: CanvasRankConfig): Promise<Buffer> {
  // 1. 캔버스 높이 계산: 헤더 + 테이블헤더 + (행 수 * ROW_HEIGHT) + 점수규칙 + 패딩
  // 2. 배경/카드 그리기
  // 3. 타이틀 영역: "모코코 사냥 순위" + 기간 표시
  // 4. 테이블 헤더: 순위 | 사냥꾼 | 점수 | 시간(분) | 세션(횟수) | 모코코(명)
  // 5. 테이블 행: data.entries를 순회하며 각 사냥꾼 행 그리기
  //    - 1~3위: 금/은/동 강조
  // 6. 하단: 점수 산정 규칙 표시
  // 7. 페이지 정보: "N / M 페이지"
  // 8. canvas.toBuffer('image/png') 반환
}
```

**입력 타입 정의**:

```typescript
/** 랭킹 보드 Canvas 렌더링 입력 데이터 */
export interface MocoCanvasRankData {
  currentPage: number;
  totalPages: number;
  entries: Array<{
    rank: number;
    hunterId: string;
    hunterName: string;
    score: number;
    channelMinutes: number;
    sessionCount: number;
    uniqueNewbieCount: number;
  }>;
}

/** 랭킹 보드 Canvas 설정 */
export interface CanvasRankConfig {
  scorePerSession: number;
  scorePerMinute: number;
  scorePerUnique: number;
  minCoPresenceMin: number;
  periodStart: string | null;
  periodEnd: string | null;
  embedColor: string | null;
}
```

#### 3-3. `renderHunterDetail()` 메서드

```typescript
/**
 * 개인 상세 이미지를 렌더링한다.
 * @param data 사냥꾼 개인 데이터
 * @returns PNG Buffer
 */
async renderHunterDetail(data: MocoCanvasDetailData): Promise<Buffer> {
  // 1. 캔버스 높이 계산: 헤더 + 요약통계 + 모코코 목록 + 점수규칙 + 패딩
  // 2. 배경/카드 그리기
  // 3. 사냥꾼 닉네임 + 순위 표시
  // 4. 요약 카드: 총 점수, 사냥 시간, 세션 횟수, 고유 모코코 수
  // 5. 도움준 모코코 목록 (이름, 시간, 횟수) 테이블
  // 6. 하단: 점수 산정 규칙
  // 7. canvas.toBuffer('image/png') 반환
}
```

**입력 타입 정의**:

```typescript
/** 개인 상세 Canvas 렌더링 입력 데이터 */
export interface MocoCanvasDetailData {
  hunterId: string;
  hunterName: string;
  rank: number;
  totalCount: number;
  score: number;
  channelMinutes: number;
  sessionCount: number;
  uniqueNewbieCount: number;
  newbieEntries: Array<{
    newbieName: string;
    minutes: number;
    sessions: number;
  }>;
  config: CanvasRankConfig;
}
```

#### 3-4. 공통 유틸 메서드 (private)

`profile-card-renderer.ts`에서 재활용:
- `roundRect()` -- 둥근 모서리 사각형
- `truncateName()` -- 이름 말줄임
- `registerFonts()` -- NotoSansCJK, NotoColorEmoji 폰트 등록

---

### 4단계: MocoService 수정

#### 4-1. Canvas 모드용 페이지 크기 상수 추가

```typescript
/** Embed 모드 페이지당 사냥꾼 수 */
const EMBED_PAGE_SIZE = 1;

/** Canvas 모드 페이지당 사냥꾼 수 */
const CANVAS_PAGE_SIZE = 10;
```

기존 `PAGE_SIZE` 상수를 `EMBED_PAGE_SIZE`로 이름을 변경하고, Canvas용 상수를 추가한다.

#### 4-2. `buildRankPayload()` 메서드 수정

displayMode에 따라 분기한다. 반환 타입을 유니온으로 확장한다.

```typescript
/** Embed 모드 반환 타입 */
interface EmbedRankPayload {
  mode: 'EMBED';
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

/** Canvas 모드 반환 타입 */
interface CanvasRankPayload {
  mode: 'CANVAS';
  imageBuffer: Buffer;
  components: ActionRowBuilder<ButtonBuilder>[];
}

type RankPayload = EmbedRankPayload | CanvasRankPayload;
```

```typescript
async buildRankPayload(guildId: string, page: number): Promise<RankPayload> {
  const config = await this.configRepo.findByGuildId(guildId);

  if (config?.mocoDisplayMode === 'CANVAS') {
    return this.buildCanvasRankPayload(guildId, page, config);
  }

  // 기존 Embed 로직 그대로
  const data = await this.buildRankData(guildId, page, EMBED_PAGE_SIZE);
  const payload = await this.presenter.buildRankPayload(guildId, data, config);
  return { mode: 'EMBED', ...payload };
}
```

#### 4-3. `buildCanvasRankPayload()` 신규 private 메서드

```typescript
private async buildCanvasRankPayload(
  guildId: string,
  page: number,
  config: NewbieConfig,
): Promise<CanvasRankPayload> {
  // 1. Redis 캐시 조회
  const cacheKey = NewbieKeys.mocoCanvasRank(guildId, page);
  const cached = await this.redis.getBuffer(cacheKey);
  if (cached) {
    const totalCount = await this.newbieRedis.getMocoRankCount(guildId);
    const totalPages = Math.max(1, Math.ceil(totalCount / CANVAS_PAGE_SIZE));
    const components = this.presenter.buildCanvasButtons(guildId, page, totalPages);
    return { mode: 'CANVAS', imageBuffer: cached, components: [components] };
  }

  // 2. 데이터 조회 (10명/페이지)
  const data = await this.buildCanvasRankData(guildId, page);

  // 3. Canvas 렌더링
  const canvasConfig = this.toCanvasRankConfig(config);
  const imageBuffer = await this.renderer.renderRankBoard(data, canvasConfig);

  // 4. Redis 캐싱 (TTL 30초)
  await this.redis.setBuffer(cacheKey, imageBuffer, 30);

  // 5. 버튼 구성 + 반환
  const components = this.presenter.buildCanvasButtons(guildId, data.currentPage, data.totalPages);
  return { mode: 'CANVAS', imageBuffer, components: [components] };
}
```

#### 4-4. `buildCanvasRankData()` 신규 private 메서드

10명분의 데이터를 한 번에 조회한다. 기존 `buildRankData()`를 일반화하여 `pageSize` 파라미터를 받도록 리팩터링하거나, Canvas 전용 메서드를 별도로 만든다.

```typescript
private async buildCanvasRankData(guildId: string, page: number): Promise<MocoCanvasRankData> {
  const totalCount = await this.newbieRedis.getMocoRankCount(guildId);
  const totalPages = Math.max(1, Math.ceil(totalCount / CANVAS_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Redis에서 해당 페이지의 10명 조회
  const rankEntries = await this.newbieRedis.getMocoRankPage(guildId, safePage, CANVAS_PAGE_SIZE);

  // 각 사냥꾼의 메타 정보 조회 + displayName 일괄 조회
  const hunterIds = rankEntries.map((e) => e.hunterId);
  const nameMap = await this.presenter.fetchDisplayNames(guildId, hunterIds);

  const entries = await Promise.all(
    rankEntries.map(async (entry, idx) => {
      const meta = await this.newbieRedis.getMocoHunterMeta(guildId, entry.hunterId);
      const rank = (safePage - 1) * CANVAS_PAGE_SIZE + idx + 1;
      return {
        rank,
        hunterId: entry.hunterId,
        hunterName: nameMap[entry.hunterId] ?? entry.hunterId,
        score: meta?.score ?? Math.round(entry.totalMinutes),
        channelMinutes: meta?.totalMinutes ?? Math.round(entry.totalMinutes),
        sessionCount: meta?.sessionCount ?? 0,
        uniqueNewbieCount: meta?.uniqueNewbieCount ?? 0,
      };
    }),
  );

  return { currentPage: safePage, totalPages, entries };
}
```

#### 4-5. `buildMyHuntingMessage()` Canvas 모드 대응

```typescript
/**
 * Canvas 모드: 개인 상세 이미지 Buffer를 반환한다.
 * Embed 모드: 기존 텍스트 메시지를 반환한다.
 */
async buildMyHunting(
  guildId: string,
  userId: string,
): Promise<{ mode: 'EMBED'; content: string } | { mode: 'CANVAS'; imageBuffer: Buffer }> {
  const config = await this.configRepo.findByGuildId(guildId);

  if (config?.mocoDisplayMode === 'CANVAS') {
    return this.buildCanvasHunterDetail(guildId, userId, config);
  }

  const content = await this.buildMyHuntingMessage(guildId, userId);
  return { mode: 'EMBED', content };
}
```

`buildCanvasHunterDetail()` -- Redis 캐시 확인 후 `renderer.renderHunterDetail()` 호출.

#### 4-6. Canvas 캐시 무효화

기존 MocoBootstrapService 또는 MocoEventHandler에서 데이터 변경 시 호출할 캐시 무효화 메서드를 MocoService에 추가한다.

```typescript
/** 해당 길드의 Canvas 캐시를 전체 삭제한다. */
async invalidateCanvasCache(guildId: string): Promise<void> {
  const pattern = NewbieKeys.mocoCanvasPattern(guildId);
  await this.redis.deleteByPattern(pattern);
}
```

**호출 지점**:
- `MocoEventHandler.handleCoPresenceEnd()` -- 세션 종료 집계 완료 후
- `MocoResetScheduler.handleCron()` -- 기간 리셋 후
- `MocoBootstrapService.onApplicationBootstrap()` -- 부팅 시

---

### 5단계: MocoDiscordPresenter 수정

#### 5-1. Canvas 모드용 버튼 빌더

```typescript
/**
 * Canvas 모드용 버튼을 구성한다.
 * Embed 모드와 동일한 버튼 구성이나, "내 순위" 버튼 포함.
 */
buildCanvasButtons(
  guildId: string,
  currentPage: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  // 기존 buildButtons()와 동일한 로직 (이전/다음/갱신/내 사냥 시간)
  return this.buildButtons(guildId, currentPage, totalPages);
}
```

기존 `buildButtons()`에 이미 "내 사냥 시간" 버튼이 포함되어 있으므로 그대로 재활용한다.

#### 5-2. `sendOrUpdateRankEmbed()` Canvas 분기

Canvas 모드일 때 파일 첨부 방식으로 전환한다.

```typescript
/**
 * Canvas 모드: 이미지 파일 첨부 메시지 전송/수정
 */
async sendOrUpdateCanvasRank(
  config: NewbieConfig,
  guildId: string,
  payload: CanvasRankPayload,
): Promise<void> {
  if (!config.mocoRankChannelId) return;

  const channelId = config.mocoRankChannelId;
  const files: RawFile[] = [{
    name: 'moco-rank.png',
    data: payload.imageBuffer,
  }];

  const restPayload = {
    content: '',
    embeds: [],
    components: payload.components.map((c) => c.toJSON()),
    attachments: [{ id: 0, filename: 'moco-rank.png' }],
  };

  if (config.mocoRankMessageId) {
    try {
      await this.discordRest.editMessageWithFiles(
        channelId, config.mocoRankMessageId, restPayload, files,
      );
      return;
    } catch {
      this.logger.warn(`[MOCO] Failed to edit canvas message, sending new`);
      await this.configRepo.updateMocoRankMessageId(guildId, null);
    }
  }

  try {
    const sent = await this.discordRest.sendMessageWithFiles(channelId, restPayload, files);
    await this.configRepo.updateMocoRankMessageId(guildId, sent.id);
  } catch (err) {
    this.logger.error(`[MOCO] Failed to send canvas rank`, getErrorStack(err));
  }
}
```

---

### 6단계: MocoService `sendOrUpdateRankEmbed()` Canvas 분기

```typescript
async sendOrUpdateRankEmbed(guildId: string, page: number): Promise<void> {
  const config = await this.configRepo.findByGuildId(guildId);
  if (!config?.mocoRankChannelId) return;

  if (config.mocoDisplayMode === 'CANVAS') {
    const payload = await this.buildCanvasRankPayload(guildId, page, config);
    await this.presenter.sendOrUpdateCanvasRank(config, guildId, payload);
    return;
  }

  // 기존 Embed 로직
  const data = await this.buildRankData(guildId, page, EMBED_PAGE_SIZE);
  const payload = await this.presenter.buildRankPayload(guildId, data, config);
  await this.presenter.sendOrUpdateRankEmbed(config, guildId, payload);
}
```

---

### 7단계: Bot-API 엔드포인트 수정

#### 7-1. `bot-newbie.controller.ts` -- `getMocoRank()` 수정

Canvas 모드일 때 이미지 바이너리를 응답해야 한다. 두 가지 접근 중 하나를 선택한다.

**방안 A (선택): JSON 응답 내 base64 인코딩**

기존 HTTP 클라이언트 구조를 유지하면서 이미지 데이터를 base64로 전달한다.

```typescript
@Get('moco-rank')
async getMocoRank(
  @Query('guildId') guildId: string,
  @Query('page') page: string,
): Promise<unknown> {
  const payload = await this.mocoService.buildRankPayload(guildId, parseInt(page, 10) || 1);

  if (payload.mode === 'CANVAS') {
    return {
      mode: 'CANVAS',
      imageBase64: payload.imageBuffer.toString('base64'),
      components: payload.components.map((c) => c.toJSON()),
    };
  }

  // Embed 모드: 기존 그대로
  return {
    mode: 'EMBED',
    embeds: payload.embeds.map((e) => e.toJSON()),
    components: payload.components.map((c) => c.toJSON()),
  };
}
```

#### 7-2. `getMocoMy()` 수정

```typescript
@Get('moco-my')
async getMyHunting(
  @Query('guildId') guildId: string,
  @Query('userId') userId: string,
): Promise<unknown> {
  const result = await this.mocoService.buildMyHunting(guildId, userId);

  if (result.mode === 'CANVAS') {
    return {
      ok: true,
      mode: 'CANVAS',
      imageBase64: result.imageBuffer.toString('base64'),
    };
  }

  return { ok: true, mode: 'EMBED', data: result.content };
}
```

---

### 8단계: Bot 인터랙션 핸들러 수정

#### 8-1. `bot-newbie-interaction.handler.ts` Canvas 분기

`handleMocoButton()` 내 각 분기에서 API 응답의 `mode` 필드를 확인하고, Canvas 모드일 때 파일 첨부 방식으로 메시지를 수정한다.

```typescript
private async handleMocoButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // ── 갱신 버튼 ──
  if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_REFRESH)) {
    const guildId = customId.slice(NEWBIE_CUSTOM_ID.MOCO_REFRESH.length);
    await interaction.deferUpdate();
    const response = await this.apiClient.getMocoRankData(guildId, 1);
    await this.applyMocoResponse(interaction, response);
    return;
  }

  // ── 이전/다음 버튼 ── (유사 패턴)
  // ...parseGuildId, page 후 동일하게 applyMocoResponse() 호출

  // ── 내 순위 버튼 ──
  if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_MY)) {
    const guildId = customId.slice(NEWBIE_CUSTOM_ID.MOCO_MY.length);
    const userId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });
    const response = await this.apiClient.getMyHuntingData(guildId, userId);

    if (response.mode === 'CANVAS' && response.imageBase64) {
      const buffer = Buffer.from(response.imageBase64, 'base64');
      await interaction.editReply({
        files: [{ attachment: buffer, name: 'moco-detail.png' }],
      });
    } else {
      await interaction.editReply({ content: response.data ?? '데이터를 불러올 수 없습니다.' });
    }
    return;
  }
}

/**
 * API 응답 mode에 따라 Embed 또는 Canvas 이미지로 메시지를 수정한다.
 */
private async applyMocoResponse(
  interaction: ButtonInteraction,
  response: MocoRankResponse,
): Promise<void> {
  if (response.mode === 'CANVAS' && response.imageBase64) {
    const buffer = Buffer.from(response.imageBase64, 'base64');
    await interaction.message.edit({
      content: '',
      embeds: [],
      files: [{ attachment: buffer, name: 'moco-rank.png' }],
      components: response.components,
    });
  } else {
    await interaction.message.edit(response as never);
  }
}
```

---

### 9단계: NewbieModule 등록

`apps/api/src/newbie/newbie.module.ts`에 `MocoRankRenderer`를 provider로 추가한다.

```typescript
import { MocoRankRenderer } from './application/moco/moco-rank.renderer';

// providers 배열 내 Unit D 섹션에 추가:
MocoRankRenderer,
```

---

### 10단계: RedisService Buffer 지원 확인

`MocoService.buildCanvasRankPayload()`에서 PNG Buffer를 Redis에 저장/조회한다. 기존 `RedisService`에 `setBuffer()`/`getBuffer()` 메서드가 없다면 추가한다.

```typescript
/** Buffer 데이터를 Redis에 저장한다 (base64 인코딩). */
async setBuffer(key: string, buffer: Buffer, ttlSec: number): Promise<void> {
  await this.client.set(key, buffer.toString('base64'), 'EX', ttlSec);
}

/** Redis에서 Buffer 데이터를 조회한다 (base64 디코딩). */
async getBuffer(key: string): Promise<Buffer | null> {
  const data = await this.client.get(key);
  if (!data) return null;
  return Buffer.from(data, 'base64');
}

/** 패턴에 매칭되는 키를 전부 삭제한다. */
async deleteByPattern(pattern: string): Promise<void> {
  const keys = await this.client.keys(pattern);
  if (keys.length > 0) {
    await this.client.del(...keys);
  }
}
```

---

## 기존 코드 영향 분석

| 항목 | 영향 |
|------|------|
| Embed 모드 (`mocoDisplayMode = 'EMBED'`) | 변경 없음. 모든 기존 코드 경로 유지 |
| `MocoRankData` 인터페이스 | 변경 없음. Canvas 모드는 별도 인터페이스(`MocoCanvasRankData`) 사용 |
| `buildRankPayload()` 반환 타입 | 유니온 타입으로 확장 (호출자 분기 필요) |
| Bot-API 응답 형식 | `mode` 필드 추가로 하위 호환 유지 (기존 Embed 응답에 `mode: 'EMBED'` 추가) |
| `NEWBIE_CUSTOM_ID` | 변경 없음. 기존 버튼 customId 그대로 사용 |
| `NewbieMocoTemplate` | Canvas 모드에서 무시됨 (Embed 전용) |

## 테스트 항목

1. **MocoRankRenderer 단위 테스트**: 빈 데이터, 1명, 10명, 이름 말줄임 등
2. **MocoService Canvas 모드 통합 테스트**: 캐시 히트/미스, 페이지네이션, displayMode 분기
3. **DiscordRestService 파일 첨부 테스트**: `sendMessageWithFiles()`, `editMessageWithFiles()` mock 검증
4. **Bot 인터랙션 E2E**: Canvas 응답 시 파일 첨부 메시지 수정 확인
5. **Embed 모드 회귀 테스트**: `mocoDisplayMode = 'EMBED'`일 때 기존 동작 완전 동일 확인
