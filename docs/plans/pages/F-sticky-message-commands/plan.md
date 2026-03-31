# Unit F (Commands): sticky-message 슬래시 커맨드 구현 계획

> 작성일: 2026-03-08
> 범위: `/고정메세지등록`, `/고정메세지목록`, `/고정메세지삭제` 슬래시 커맨드 3개 + 모듈 구성

---

## 1. 개요

관리자 전용 슬래시 커맨드 3개를 구현한다. 해당 커맨드들은 `apps/api/src/sticky-message/command/` 경로에 위치하며, 새로 생성할 `StickyMessageModule`에 등록된다.

### 현재 코드베이스 상태

현재 `apps/api/src/sticky-message/` 디렉토리에는 `domain/sticky-message-config.entity.ts` 하나만 존재한다. 이 구현 단위에서 아래 파일들을 모두 신규 생성한다.

### 파일 목록

| 구분 | 파일 경로 | 작업 |
|------|-----------|------|
| 신규 | `apps/api/src/sticky-message/command/sticky-message-delete.dto.ts` | `/고정메세지삭제` 채널 파라미터 DTO |
| 신규 | `apps/api/src/sticky-message/config/sticky-message-config.repository.ts` | TypeORM 리포지토리 래퍼 |
| 신규 | `apps/api/src/sticky-message/config/sticky-message-config.service.ts` | 삭제 비즈니스 로직 서비스 |
| 신규 | `apps/api/src/sticky-message/command/sticky-message-register.command.ts` | `/고정메세지등록` 커맨드 |
| 신규 | `apps/api/src/sticky-message/command/sticky-message-list.command.ts` | `/고정메세지목록` 커맨드 |
| 신규 | `apps/api/src/sticky-message/command/sticky-message-delete.command.ts` | `/고정메세지삭제` 커맨드 |
| 신규 | `apps/api/src/sticky-message/sticky-message.module.ts` | NestJS 모듈 |

---

## 2. 핵심 기술 결정

### 채널 파라미터 처리 방식

`@discord-nestjs/core`의 `ParamType` 열거형에는 CHANNEL 타입이 없다. 대신 `@Channel([ChannelType])` 데코레이터를 `@Param`과 함께 DTO 프로퍼티에 적용하면, `OptionExplorer`가 `ApplicationCommandOptionType.Channel`로 Discord에 등록한다.

단, `SlashCommandPipe`는 `interaction.options.get(name)?.value`를 사용하여 DTO를 채우므로, 채널 옵션에서 `value`는 채널 ID 문자열이 된다. 따라서 DTO 프로퍼티 타입은 `string`으로 선언하고, 핸들러에서 `interaction.options.getChannel('채널')`을 직접 호출하여 채널 객체를 얻는다.

요약:
- DTO: Discord에 채널 파라미터를 등록하기 위한 `@Param + @Channel` 조합 사용
- 핸들러: 실제 채널 객체는 `interaction.options.getChannel('채널')`로 직접 취득

### 권한 검사

- `@Command` 데코레이터에 `defaultMemberPermissions: PermissionFlagsBits.ManageGuild` 설정 → Discord UI에서 관리자만 커맨드가 보임
- 핸들러 내부에서 `interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)` 이중 검증

PRD 기준 권한: `MANAGE_GUILD` (서버 관리). `ADMINISTRATOR`보다 넓은 실제 서버 관리자 권한으로 적용한다.

### 응답 방식

모든 커맨드 응답은 `ephemeral: true`. `/고정메세지삭제`는 처리 시간이 있을 수 있으므로 `deferReply({ ephemeral: true })` → `editReply` 패턴을 사용한다. `/고정메세지등록`과 `/고정메세지목록`은 단순 응답이므로 `reply({ ephemeral: true })` 직접 사용.

---

## 3. 파일별 상세 구현 계획

### 파일 1: `sticky-message-delete.dto.ts`

**경로**: `apps/api/src/sticky-message/command/sticky-message-delete.dto.ts`

채널 선택 파라미터를 Discord에 등록하기 위한 DTO. 실제 값은 핸들러에서 `interaction.options.getChannel()`로 취득하므로 DTO의 프로퍼티 값은 사용하지 않는다.

```typescript
import { Channel, Param, ParamType } from '@discord-nestjs/core';
import { ChannelType } from 'discord.js';

export class StickyMessageDeleteDto {
  @Channel([ChannelType.GuildText])
  @Param({
    name: '채널',
    description: '고정메세지를 삭제할 채널',
    required: true,
    type: ParamType.STRING, // @Channel 데코레이터가 ApplicationCommandOptionType.Channel로 오버라이드함
  })
  channel: string;
}
```

**주의**: `@Channel` 데코레이터가 `type` 필드를 `ApplicationCommandOptionType.Channel`로 오버라이드하므로 `ParamType.STRING`으로 선언해도 Discord에는 Channel 타입으로 등록된다. (`option.explorer.js` 참고: `channelTypes`가 있으면 `ApplicationCommandOptionType.Channel`로 설정)

---

### 파일 2: `sticky-message-config.repository.ts`

**경로**: `apps/api/src/sticky-message/config/sticky-message-config.repository.ts`

TypeORM Repository를 래핑하는 커스텀 리포지토리. 커맨드 핸들러에서 필요한 DB 조회 메서드만 구현한다.

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StickyMessageConfig } from '../domain/sticky-message-config.entity';

@Injectable()
export class StickyMessageConfigRepository {
  constructor(
    @InjectRepository(StickyMessageConfig)
    private readonly repo: Repository<StickyMessageConfig>,
  ) {}

  async findByGuildId(guildId: string): Promise<StickyMessageConfig[]> {
    return this.repo.find({
      where: { guildId },
      order: { sortOrder: 'ASC' },
    });
  }

  async findByChannelId(
    guildId: string,
    channelId: string,
  ): Promise<StickyMessageConfig[]> {
    return this.repo.find({
      where: { guildId, channelId },
      order: { sortOrder: 'ASC' },
    });
  }

  async deleteByChannelId(guildId: string, channelId: string): Promise<void> {
    await this.repo.delete({ guildId, channelId });
  }
}
```

---

### 파일 3: `sticky-message-config.service.ts`

**경로**: `apps/api/src/sticky-message/config/sticky-message-config.service.ts`

`/고정메세지삭제` 커맨드의 비즈니스 로직을 담당한다. Discord API 메시지 삭제 + DB 삭제 + Redis 캐시 무효화를 수행한다.

이 구현 단위에서는 Discord Client 접근을 위해 `@InjectDiscordClient()`를 사용한다. Redis는 이 커맨드 단위에서 캐시 무효화만 필요하므로 `ioredis` 클라이언트를 직접 주입받는다.

```typescript
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Client, TextChannel } from 'discord.js';

import { StickyMessageConfig } from '../domain/sticky-message-config.entity';
import { StickyMessageConfigRepository } from './sticky-message-config.repository';

@Injectable()
export class StickyMessageConfigService {
  private readonly logger = new Logger(StickyMessageConfigService.name);

  constructor(
    private readonly repository: StickyMessageConfigRepository,
    @InjectDiscordClient() private readonly client: Client,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async deleteByChannel(
    guildId: string,
    channelId: string,
  ): Promise<{ deletedCount: number }> {
    const configs = await this.repository.findByChannelId(guildId, channelId);

    if (configs.length === 0) {
      return { deletedCount: 0 };
    }

    // Discord 메시지 삭제 시도 (실패해도 DB 삭제는 계속)
    await this.deleteDiscordMessages(configs);

    // DB 삭제
    await this.repository.deleteByChannelId(guildId, channelId);

    // Redis 캐시 무효화
    await this.invalidateCache(guildId);

    return { deletedCount: configs.length };
  }

  private async deleteDiscordMessages(
    configs: StickyMessageConfig[],
  ): Promise<void> {
    for (const config of configs) {
      if (!config.messageId) continue;
      try {
        const channel = await this.client.channels.fetch(config.channelId);
        if (channel instanceof TextChannel) {
          await channel.messages.delete(config.messageId);
        }
      } catch (err) {
        this.logger.warn(
          `고정메세지 삭제 실패 (channelId=${config.channelId}, messageId=${config.messageId}): ${err}`,
        );
      }
    }
  }

  private async invalidateCache(guildId: string): Promise<void> {
    const key = `sticky_message:config:${guildId}`;
    await this.redis.del(key);
  }
}
```

**Redis 주입 방식**: 기존 코드베이스에서 Redis 주입 토큰을 확인해야 한다. 아래에서 별도로 기술한다.

---

### 파일 4: `sticky-message-register.command.ts`

**경로**: `apps/api/src/sticky-message/command/sticky-message-register.command.ts`

파라미터 없음. Ephemeral 메시지로 웹 설정 페이지 URL을 안내한다.

```typescript
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { CommandInteraction, PermissionFlagsBits } from 'discord.js';

@Command({
  name: '고정메세지등록',
  description: '고정메세지를 웹 대시보드에서 등록합니다',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageRegisterCommand {
  private readonly logger = new Logger(StickyMessageRegisterCommand.name);

  @Handler()
  async onRegister(
    @InteractionEvent() interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: '이 명령어는 서버 관리자만 사용할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '서버에서만 사용 가능한 명령어입니다.',
        ephemeral: true,
      });
      return;
    }

    const webBaseUrl = process.env.WEB_URL ?? 'https://onyu.com';
    const settingsUrl = `${webBaseUrl}/settings/guild/${guildId}/sticky-message`;

    await interaction.reply({
      content: `고정메세지는 웹 대시보드에서 설정할 수 있습니다.\n${settingsUrl}`,
      ephemeral: true,
    });
  }
}
```

**`WEB_URL` 환경변수**: 기존 코드베이스에서 사용하는 환경변수명을 확인하여 일치시킨다. 아래에서 기술.

---

### 파일 5: `sticky-message-list.command.ts`

**경로**: `apps/api/src/sticky-message/command/sticky-message-list.command.ts`

파라미터 없음. guildId로 고정메세지 목록을 조회하여 Ephemeral Embed로 표시한다.

```typescript
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  Colors,
  CommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { StickyMessageConfigRepository } from '../config/sticky-message-config.repository';

@Command({
  name: '고정메세지목록',
  description: '이 서버의 고정메세지 목록을 확인합니다',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageListCommand {
  private readonly logger = new Logger(StickyMessageListCommand.name);

  constructor(
    private readonly repository: StickyMessageConfigRepository,
  ) {}

  @Handler()
  async onList(
    @InteractionEvent() interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: '이 명령어는 서버 관리자만 사용할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '서버에서만 사용 가능한 명령어입니다.',
        ephemeral: true,
      });
      return;
    }

    const configs = await this.repository.findByGuildId(guildId);

    if (configs.length === 0) {
      await interaction.reply({
        content: '등록된 고정메세지가 없습니다.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('고정메세지 목록')
      .setColor(Colors.Blue)
      .setFooter({ text: `총 ${configs.length}개` })
      .setTimestamp();

    configs.forEach((config, index) => {
      embed.addFields({
        name: `#${index + 1} <#${config.channelId}>`,
        value: [
          `제목: ${config.embedTitle ?? '(제목 없음)'}`,
          `활성화: ${config.enabled ? '켜짐' : '꺼짐'}`,
        ].join('\n'),
        inline: false,
      });
    });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }
}
```

**Embed 채널 표시**: `<#channelId>` 멘션 형식으로 표시하면 Discord가 자동으로 채널명을 렌더링한다. PRD의 "채널명" 표시 요건을 별도 API 호출 없이 충족한다.

**Embed 필드 제한**: Discord Embed는 최대 25개 필드를 가질 수 있다. 고정메세지가 25개를 초과하는 경우는 현실적으로 드물지만, 안전을 위해 필드는 25개로 슬라이스한다 (`.slice(0, 25)`). 해당 처리는 필드 추가 전에 적용한다.

---

### 파일 6: `sticky-message-delete.command.ts`

**경로**: `apps/api/src/sticky-message/command/sticky-message-delete.command.ts`

채널 파라미터 필수. `deferReply({ ephemeral: true })` → `editReply` 패턴.

```typescript
import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';

import { StickyMessageConfigService } from '../config/sticky-message-config.service';
import { StickyMessageDeleteDto } from './sticky-message-delete.dto';

@Command({
  name: '고정메세지삭제',
  description: '선택한 채널의 고정메세지를 모두 삭제합니다',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageDeleteCommand {
  private readonly logger = new Logger(StickyMessageDeleteCommand.name);

  constructor(
    private readonly configService: StickyMessageConfigService,
  ) {}

  @Handler()
  async onDelete(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe) _dto: StickyMessageDeleteDto,
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: '이 명령어는 서버 관리자만 사용할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '서버에서만 사용 가능한 명령어입니다.',
        ephemeral: true,
      });
      return;
    }

    // 채널 파라미터는 interaction에서 직접 취득 (SlashCommandPipe는 value 필드를 매핑하므로 채널 객체 미제공)
    const channel = interaction.options.getChannel('채널', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const { deletedCount } = await this.configService.deleteByChannel(
        guildId,
        channel.id,
      );

      if (deletedCount === 0) {
        await interaction.editReply(
          `<#${channel.id}> 채널에 등록된 고정메세지가 없습니다.`,
        );
        return;
      }

      await interaction.editReply(
        `<#${channel.id}> 채널의 고정메세지 ${deletedCount}개가 삭제되었습니다.`,
      );
    } catch (error) {
      this.logger.error('고정메세지 삭제 중 오류:', error);
      await interaction.editReply(
        '삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }
}
```

**`_dto` 파라미터**: `StickyMessageDeleteDto`는 `@Handler` 메서드에 `@InteractionEvent(SlashCommandPipe)` 인자로 전달되어야 Discord에 채널 파라미터가 등록된다. 실제 값은 사용하지 않으므로 `_dto`로 명명한다.

**`interaction.options.getChannel('채널', true)`**: 두 번째 인자 `true`는 required 옵션으로 타입을 `APIInteractionDataResolvedChannel | GuildBasedChannel`로 좁혀준다. 파라미터명 `'채널'`은 DTO에서 `@Param({ name: '채널' })`로 지정한 이름과 일치해야 한다.

---

### 파일 7: `sticky-message.module.ts`

**경로**: `apps/api/src/sticky-message/sticky-message.module.ts`

```typescript
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StickyMessageConfig } from './domain/sticky-message-config.entity';
import { StickyMessageConfigRepository } from './config/sticky-message-config.repository';
import { StickyMessageConfigService } from './config/sticky-message-config.service';
import { StickyMessageRegisterCommand } from './command/sticky-message-register.command';
import { StickyMessageListCommand } from './command/sticky-message-list.command';
import { StickyMessageDeleteCommand } from './command/sticky-message-delete.command';

@Module({
  imports: [
    DiscordModule.forFeature(),
    TypeOrmModule.forFeature([StickyMessageConfig]),
  ],
  providers: [
    StickyMessageConfigRepository,
    StickyMessageConfigService,
    StickyMessageRegisterCommand,
    StickyMessageListCommand,
    StickyMessageDeleteCommand,
  ],
})
export class StickyMessageModule {}
```

---

## 4. 사전 확인이 필요한 사항

구현 전에 기존 코드베이스에서 다음 두 가지를 확인한다.

### 4-1. Redis 주입 토큰

`StickyMessageConfigService`는 Redis 캐시 무효화를 위해 Redis 클라이언트가 필요하다. 기존 코드베이스에서 사용하는 Redis 주입 토큰을 확인한다.

확인 방법:
```bash
grep -r "REDIS_CLIENT\|@Inject.*redis\|@InjectRedis\|ioredis" apps/api/src --include="*.ts" | head -10
```

예상 패턴:
- `@Inject('REDIS_CLIENT')` — 커스텀 토큰
- `@InjectRedis()` — `@liaoliaots/nestjs-redis` 사용 시
- 별도 Redis 서비스 래퍼 사용 시

확인 결과에 따라 `StickyMessageModule`의 imports에 Redis 모듈 또는 provider를 추가한다.

### 4-2. WEB_URL 환경변수명

`/고정메세지등록` 커맨드에서 웹 대시보드 URL을 조합할 때 `process.env.WEB_URL`을 사용한다. 기존 코드베이스에서 사용하는 환경변수명을 확인한다.

확인 방법:
```bash
grep -r "WEB_URL\|NEXT_PUBLIC_URL\|FRONTEND_URL\|process.env" apps/api/src --include="*.ts" | grep -i "url" | head -10
```

---

## 5. 충돌 및 호환성 검토

| 항목 | 판단 |
|---|---|
| `StickyMessageConfig` 엔터티가 `domain/`에만 존재 | `TypeOrmModule.forFeature([StickyMessageConfig])`로 모듈에 등록. 충돌 없음 |
| 한글 커맨드명 (`고정메세지등록` 등) | Discord는 한글 슬래시 커맨드명을 지원함. 기존 코드베이스에 한글 커맨드 선례가 없으나 discord.js에서 유효 |
| `@Channel` + `@Param` 조합 | `option.explorer.js`에서 `channelTypes`가 있으면 `ApplicationCommandOptionType.Channel`로 등록됨을 확인. `type: ParamType.STRING` 선언은 오버라이드되므로 충돌 없음 |
| `SlashCommandPipe`로 채널 값 취득 불가 | `interactionOption?.value`는 채널 ID 문자열이 아닌 `undefined`이므로, `interaction.options.getChannel()`을 핸들러에서 직접 사용. `_dto` 파라미터는 커맨드 등록 트리거용으로만 사용 |
| `DiscordModule.forFeature()` 중복 등록 | NestJS DI 시스템에서 각 Feature 모듈별 독립 등록이 정상. 기존 `MusicModule`, `VoiceAnalyticsModule` 동일 패턴 |
| `StickyMessageModule`의 AppModule 등록 | 이 계획 범위 밖. AppModule imports에 `StickyMessageModule` 추가는 구현 시 확인 |
| Embed 25개 필드 제한 | `findByGuildId` 결과를 `.slice(0, 25)`로 처리. 실용적으로 25개 고정메세지 초과는 드묾 |
| 관리자 권한 이중 검증 | `defaultMemberPermissions`(Discord 레벨) + `memberPermissions?.has()`(핸들러 레벨) 조합. 기존 `VoiceStatsCommand` 패턴과 동일 |

---

## 6. 구현 순서

파일 간 의존 관계:

```
StickyMessageConfig (entity, 기존)
  ↓
StickyMessageConfigRepository (파일 2)
  ↓
StickyMessageConfigService (파일 3) — Redis 주입 방식 먼저 확인 필요
  ↓
StickyMessageDeleteDto (파일 1)    ← 독립
StickyMessageRegisterCommand (파일 4) ← Repository 미사용, 독립
StickyMessageListCommand (파일 5)  ← Repository 의존
StickyMessageDeleteCommand (파일 6) ← Service 의존, Dto 의존
  ↓
StickyMessageModule (파일 7)
```

**구체적 순서**:
1. Redis 주입 토큰 및 WEB_URL 환경변수 확인 (사전 조사)
2. `sticky-message-config.repository.ts` 생성
3. `sticky-message-config.service.ts` 생성 (Redis 토큰 반영)
4. `sticky-message-delete.dto.ts` 생성
5. `sticky-message-register.command.ts` 생성 (WEB_URL 환경변수명 반영)
6. `sticky-message-list.command.ts` 생성
7. `sticky-message-delete.command.ts` 생성
8. `sticky-message.module.ts` 생성 (Redis 모듈 import 포함)
9. `AppModule`에 `StickyMessageModule` 추가 확인
