# 친밀도/베프 단순화 — Bot 커맨드 + bot-api-client 구현 계획

> 대상 도메인: `voice-co-presence` (Phase 5)
> 작업 범위: **`apps/bot` 슬래시 커맨드** + **`libs/bot-api-client`** 만. API/Web/마이그레이션은 별도 컨텍스트.
> 근거 PRD: `docs/specs/prd/voice-co-presence.md` (F-COPRESENCE-014 파라미터 제거, F-015 affinity 삭제, F-017 privacy 웹 전용)
> 브랜치: `develop` 유지 (전환/생성 금지)

## 1. 작업 개요

| 작업 | 내용 |
|------|------|
| `/affinity` 커맨드 삭제 | command + dto 파일 삭제, 모듈 등록 해제 |
| `/privacy` 커맨드 삭제 | command + dto 파일 삭제, `privacy/` 디렉터리 제거, 모듈 등록 해제 |
| `/best-friend` 파라미터 제거 | dto 삭제, 커맨드를 30일/TOP5/공개 고정으로 단순화 |
| `bot-api-client` 정리 | affinity/privacy 전용 메서드·타입 제거, best-friend/me 관련은 유지 |

## 2. 삭제 파일 목록 (5개)

| 파일 | 사유 |
|------|------|
| `apps/bot/src/command/friend/affinity.command.ts` | `/affinity` 커맨드 삭제 |
| `apps/bot/src/command/friend/affinity.dto.ts` | `/affinity` DTO 삭제 |
| `apps/bot/src/command/privacy/privacy.command.ts` | `/privacy` 커맨드 삭제 (웹 전용 전환) |
| `apps/bot/src/command/privacy/privacy.dto.ts` | `/privacy` DTO 삭제 |
| `apps/bot/src/command/friend/best-friend.dto.ts` | `/best-friend` 파라미터(period/limit/private) 전부 제거 |

> `privacy/` 디렉터리는 위 2개 파일 삭제 후 빈 디렉터리가 되므로 디렉터리 자체를 제거한다.
> `friend/` 디렉터리는 `best-friend.command.ts`가 남으므로 유지한다.
> Bot/libs 측 `.spec.ts` 는 존재하지 않음 (Glob 확인 완료) — 삭제/수정할 테스트 없음.

## 3. 수정 파일 목록

### 3-1. `apps/bot/src/command/bot-command.module.ts`

제거 대상:
- `import { AffinityCommand } from './friend/affinity.command';` (line 4)
- `import { PrivacyCommand } from './privacy/privacy.command';` (line 7)
- `providers` 배열의 `AffinityCommand`, `PrivacyCommand` 항목 (line 35, 37)
- Phase 5 주석 정리 (`// Phase 5: 친밀도/베프` → `// Phase 5: 베프`, `// Phase 5: 사생활` 주석 삭제)

수정 후 `providers` 배열 (friend/me 영역):
```ts
    // Me
    MeCommand,
    // Phase 5: 베스트 프렌드
    BestFriendCommand,
```
`BestFriendCommand` import (line 5) 는 **유지**.

### 3-2. `apps/bot/src/command/friend/best-friend.command.ts`

변경 위치별 정리:

| 위치 | 변경 |
|------|------|
| import (line 15) | `import { BestFriendDto } from './best-friend.dto';` 제거 |
| import (line 1) | `SlashCommandPipe` 미사용으로 제거 (`@discord-nestjs/common` import 라인 삭제) |
| import (line 2) | `InteractionEvent`는 유지 (interaction 파라미터에 계속 사용) |
| 상수 (line 17~33) | `DEFAULT_PERIOD`/`DEFAULT_LIMIT`/`MIN_LIMIT`/`MAX_LIMIT`/`VALID_PERIODS`/`isValidPeriod` 제거. 고정 상수 `PERIOD = 30`, `LIMIT = 5` 2개만 신설. `WEB_URL` 유지 |
| 핸들러 시그니처 (line 48~51) | `@InteractionEvent(SlashCommandPipe) dto: BestFriendDto` 파라미터 제거. `@InteractionEvent() interaction` 단일 파라미터로 |
| ephemeral 로직 (line 57~58) | `dto.private` 분기 제거. `await interaction.deferReply();` (ephemeral 옵션 없이 — 공개 고정) |
| period/limit 계산 (line 60~64) | 전부 제거 |
| API 호출 (line 72~79) | `this.apiClient.getMyBestFriends(guildId, userId, displayName, avatarUrl, PERIOD, LIMIT)` — period=30, limit=5 고정 전달 |
| errorCode 분기 (line 84~88) | 유지 |
| `resolveErrorMessage` (line 108~118) | 유지 |
| `buildLinkButtonRow` (line 120~127) | 유지 |
| `renderCard` (line 129~144) | 유지 |
| try/catch 에러 처리 | 유지 |

`GuildMember` import (discord.js) 및 `displayName`/`avatarUrl` 추출 로직은 그대로 유지.

#### best-friend.command.ts 수정 후 핵심 구조 스케치

```ts
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { BestFriendCardResponse } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
} from 'discord.js';

// 집계 기간 (일) — 고정
const PERIOD = 30;
// TOP N — 고정
const LIMIT = 5;
// 대시보드 URL
const WEB_URL = process.env['WEB_URL'] ?? 'https://onyu.app';

@Command({
  name: 'best-friend',
  nameLocalizations: { ko: '친한친구' },
  description: 'Show my best friend TOP card',
  descriptionLocalizations: { ko: '내 베스트 프렌드 TOP을 카드로 보여줍니다' },
})
@Injectable()
export class BestFriendCommand {
  private readonly logger = new Logger(BestFriendCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onBestFriend(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '서버에서만 사용 가능한 명령어입니다.', ephemeral: true });
      return;
    }

    // 공개 응답 고정 (ephemeral 아님)
    await interaction.deferReply();

    try {
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const result = await this.apiClient.getMyBestFriends(
        interaction.guildId,
        interaction.user.id,
        displayName,
        avatarUrl,
        PERIOD, // 30 고정
        LIMIT,  // 5 고정
      );

      const linkButtonRow = this.buildLinkButtonRow(interaction.guildId);

      if (result.errorCode) {
        const message = this.resolveErrorMessage(result.errorCode, result.days);
        await interaction.editReply({ content: message, components: [linkButtonRow] });
        return;
      }
      if (!result.data) {
        await interaction.editReply({
          content: `최근 ${result.days}일간 함께한 친구 기록이 없어요. 음성방에 들어가 친구를 만들어보세요!`,
          components: [linkButtonRow],
        });
        return;
      }
      await this.renderCard(interaction, result, linkButtonRow);
    } catch (error) {
      this.logger.error(
        'BestFriend command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({ content: '베스트 프렌드 조회 중 오류가 발생했습니다.' });
    }
  }

  // resolveErrorMessage / buildLinkButtonRow / renderCard — 기존 그대로 유지
}
```

> 주의: `getMyBestFriends`의 `period` 파라미터 타입은 `7 | 30 | 90` 리터럴 유니온이다. 상수 `PERIOD = 30`을 `const PERIOD = 30 as const;` 가 아닌 단순 `const PERIOD = 30;` 로 선언하면 타입이 `number`로 넓혀져 컴파일 에러가 난다. 따라서 **`const PERIOD = 30 as const;`** 로 선언하거나 호출부에 리터럴 `30`을 직접 전달한다 (`as` 단언 시 주석으로 사유 명시 — ESLint 규칙). 가장 단순한 방식은 호출부에 리터럴 `30`을 직접 넘기고 상수 없이 두는 것이나, 가독성을 위해 `const PERIOD = 30 as const;`(// getMyBestFriends period 유니온 타입 충족) 권장.

### 3-3. `libs/bot-api-client/src/bot-api-client.service.ts`

| 위치 | 변경 |
|------|------|
| import (line 8 `AffinityCardResponse`) | 제거 |
| import (line 39 `UpsertUserPrivacyDto`) | 제거 |
| import (line 40 `UserPrivacyResponse`) | 제거 |
| `getAffinity()` (line 204~219) | 메서드 전체 제거 |
| `upsertUserPrivacy()` (line 223~230) + `// ── User Privacy ──` 주석 (line 221) | 메서드 전체 + 섹션 주석 제거 |
| `getMyBestFriends()` (line 185~202) | **유지** (단, `period` 파라미터 시그니처는 `7 | 30 | 90` 그대로 유지 — Bot에서 30 고정 전달) |
| `BestFriendCardResponse` import (line 5) | 유지 |
| `MeProfileResponse` import (line 23) | 유지 (`getMeProfile` 사용) |

> `// ── Co-Presence (Phase 5: 베스트 프렌드 / 친밀도) ──` 주석은 `// ── Co-Presence (Phase 5: 베스트 프렌드) ──` 로 정리.

### 3-4. `libs/bot-api-client/src/types.ts`

| 위치 | 변경 |
|------|------|
| `CanvasCardResponse.errorCode` (line 264) | `'PRIVATE' | 'NOT_PERMITTED' | 'NO_DATA'` 중 `NOT_PERMITTED`는 affinity 권한 전용이었으나, **타입 단순화는 보류** (best-friend의 PRIVATE/NO_DATA만 사용하지만 유니온 축소는 선택사항 — 안전하게 유지) |
| `AffinityCardResponse` (line 271) | 제거 |
| `UpsertUserPrivacyDto` (line 275~278) | 제거 |
| `UserPrivacyResponse` (line 280~287) | 제거 |
| `// ── User Privacy ──` 섹션 주석 (line 273) | 제거 |
| `CanvasCardResponse` (line 259~265) | 유지 |
| `MeProfileResponse` alias (line 268) | 유지 |
| `BestFriendCardResponse` alias (line 270) | 유지 |
| 주석 (line 257 `/me, /best-friend, /affinity 모두...`) | `/me, /best-friend 모두...` 로 정리 |

## 4. 제거 안전성 확인 결과

### 4-1. libs 타입이 web에서 안 쓰이는지
- **확인 완료**: `apps/web` 전체에서 `@onyu/bot-api-client` 를 import하는 파일 **0개** (Grep 확인).
- 웹 사생활 페이지는 `apps/web/app/lib/user-privacy-api.ts` 에서 자체 타입(`UserPrivacyConfig`, `UserPrivacySaveDto`)을 정의/사용. libs의 `UpsertUserPrivacyDto`/`UserPrivacyResponse` 와 무관.
- → **`UpsertUserPrivacyDto` / `UserPrivacyResponse` / `AffinityCardResponse` 제거 안전**.

### 4-2. API에서 libs 타입을 쓰는지
- API의 `UpsertUserPrivacyDto`/`UserPrivacyResponse` 매칭은 `apps/api/src/user-privacy/dto/user-privacy.dto.ts` 등 **API 자체 정의**이며 `@onyu/bot-api-client` 를 import하지 않음 (Grep: API 내 libs 타입명 매치 0).
- → API 영향 없음.

### 4-3. me.command.ts 영향
- `me.command.ts` 는 `getMeProfile()`(→ `MeProfileResponse`)만 사용. `MeProfileResponse`·`CanvasCardResponse` alias 유지하므로 **무영향**.

### 4-4. best-friend.command.ts 의존
- `getMyBestFriends()` / `BestFriendCardResponse` 유지하므로 정상 동작.

## 5. 테스트 영향

- **삭제될 spec**: 없음 (Bot/libs 측 `*.spec.ts` 미존재).
- **수정될 spec**: 없음.
- API 측 spec(`co-presence-analytics-new-methods.spec.ts`, `bot-co-presence-new-handlers.spec.ts`)은 본 작업 범위 밖(별도 컨텍스트). 본 작업으로 인한 직접 수정 불필요.

## 6. 검증 체크리스트

```powershell
pnpm --filter @onyu/bot-api-client lint
pnpm --filter @onyu/bot-api-client build
pnpm --filter @onyu/bot lint
pnpm --filter @onyu/bot build
```

확인 포인트:
- `me.command.ts` 컴파일 정상 (`MeProfileResponse` 미삭제)
- `best-friend.command.ts` 의 `getMyBestFriends` 호출 시 period 리터럴 타입(`7|30|90`) 충족
- 미사용 import(`SlashCommandPipe`) 제거로 ESLint `no-unused-vars` 통과
- `privacy/` 디렉터리 잔존 여부 확인 (빈 디렉터리 제거)

## 7. ESLint 준수 사항

- 미사용 import 전부 삭제 (`SlashCommandPipe`, `BestFriendDto`, `AffinityCardResponse`, `UpsertUserPrivacyDto`, `UserPrivacyResponse`)
- `as const` 또는 리터럴 사용 시 `no-magic-numbers` 경고 고려 — 고정값 30/5는 named 상수(`PERIOD`/`LIMIT`)로 추출하여 매직넘버 회피
- `as` 단언(`PERIOD = 30 as const`) 사용 시 사유 주석 필수

## 8. 동작 명세 (최종)

- `/best-friend` (`/친한친구`): 파라미터 없음. 최근 **30일** · TOP **5** · **공개**(비-ephemeral) 카드로만 응답.
- `/affinity`, `/privacy`: 제거 — Discord에서 더 이상 노출되지 않음 (사생활 설정은 웹 `/settings/me/privacy`로 일원화).
