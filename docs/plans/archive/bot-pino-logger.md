# Bot 서버 구조화 로깅 전환 (nestjs-pino)

> PRD 참조: `docs/specs/prd/monitoring.md` — F-MONITORING-021

## 목적

Bot 서버의 NestJS 기본 Logger(텍스트 출력)를 `nestjs-pino`로 전환하여 JSON 구조화 로그를 출력한다. Promtail이 Docker 컨테이너 로그를 수집할 때 JSON 파싱이 가능해지며, Loki + Grafana에서 레벨별 필터링 및 구조화 쿼리가 가능해진다.

---

## 현황 분석

### 현재 Bot 로깅 구조

- `apps/bot/src/main.ts`: `new Logger('BotMain')`으로 직접 인스턴스 생성
- `NestFactory.create(AppModule)` — `bufferLogs`, `useLogger` 미적용
- Bot 전체 29개 파일에서 `new Logger(ClassName.name)` 패턴 사용 중

### API 서버 참조 (이미 적용 완료)

- `apps/api/src/app.module.ts`: `LoggerModule.forRootAsync()` 등록됨
- `apps/api/src/main.ts`: `bufferLogs: true` + `app.useLogger(app.get(PinoLogger))` 적용됨
- 환경변수 `NODE_ENV` 기반 dev/prod 분기 (dev: `pino-pretty`, prod: JSON)

---

## 구현 단계

### Step 1: 패키지 설치

```bash
pnpm --filter @onyu/bot add nestjs-pino pino-http pino-pretty
```

| 패키지 | 용도 |
|--------|------|
| `nestjs-pino` | NestJS Logger를 Pino로 위임하는 통합 모듈 |
| `pino-http` | HTTP 요청 자동 로깅 (nestjs-pino의 peer dependency) |
| `pino-pretty` | 개발 환경 컬러 텍스트 출력 |

### Step 2: `apps/bot/src/app.module.ts` 수정

`LoggerModule.forRootAsync()`를 imports에 추가한다. API 서버와 동일한 패턴을 사용한다.

```ts
// 추가 import
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            ...(isProduction
              ? {}
              : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
          },
        };
      },
    }),
    // ... 기존 모듈들
  ],
})
```

**변경 포인트:**
- `LoggerModule` import 추가 (2번째 import로 배치, ConfigModule 바로 다음)
- `ConfigService`를 inject하여 환경변수 기반 분기
- dev 환경: `pino-pretty`로 사람이 읽기 쉬운 컬러 출력
- prod 환경: JSON 포맷으로 stdout 출력 (Promtail이 자동 수집)

### Step 3: `apps/bot/src/main.ts` 수정

API 서버의 `main.ts` 패턴을 따라 `bufferLogs`와 `useLogger`를 적용한다.

**변경 전:**
```ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('BotMain');

  const port = process.env.BOT_PORT ?? 3001;
  await app.listen(port);

  logger.log(`Bot process started on port ${port}`);
}

void bootstrap();
```

**변경 후:**
```ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const port = process.env.BOT_PORT ?? 3001;
  await app.listen(port);

  Logger.log(`Bot process started on port ${port}`);
}

void bootstrap();
```

**변경 포인트:**
- `bufferLogs: true` — 앱 초기화 중 로그를 버퍼링하여 Pino가 준비된 후 한꺼번에 출력
- `app.useLogger(app.get(PinoLogger))` — NestJS 전역 Logger를 Pino로 교체
- 기존 `new Logger('BotMain')` 인스턴스를 제거하고 `Logger.log()` 정적 메서드 사용 (useLogger 이후이므로 Pino로 위임됨)

### Step 4: pino-http autoLogging 설정 검토

Bot 서버는 `/metrics` 엔드포인트를 노출하고 있으며 Prometheus가 15초 간격으로 스크레이프한다. pino-http의 기본 동작은 모든 HTTP 요청을 로깅하므로, `/metrics` 요청이 15초마다 로그에 남게 된다.

**판단:** `/metrics`는 내부 헬스체크 성격의 엔드포인트이므로 로그에서 제외하는 것이 적절하다.

`app.module.ts`의 LoggerModule 설정에 `autoLogging` 옵션을 추가한다:

```ts
LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const isProduction = config.get('NODE_ENV') === 'production';
    return {
      pinoHttp: {
        level: isProduction ? 'info' : 'debug',
        autoLogging: {
          ignore: (req) => req.url === '/metrics',
        },
        ...(isProduction
          ? {}
          : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
      },
    };
  },
})
```

---

## 기존 코드 영향 분석

### `new Logger(ClassName.name)` 사용 파일 (29개) — 변경 불필요

NestJS의 `@nestjs/common`의 `Logger` 클래스는 내부적으로 `LoggerService` 인터페이스를 통해 로그를 위임한다. `app.useLogger()`로 Pino를 설정하면 모든 `new Logger()` 인스턴스가 자동으로 Pino를 통해 출력된다.

해당 파일 목록:
- `scheduler/bot-co-presence.scheduler.ts`
- `monitoring/bot-prometheus.service.ts`
- `event/voice/bot-voice-state.dispatcher.ts`
- `event/channel/bot-channel-state.handler.ts`
- `event/sticky-message/bot-sticky-message.handler.ts`
- `event/status-prefix/bot-status-prefix-interaction.handler.ts`
- `event/newbie/bot-newbie-member-add.handler.ts`
- `event/newbie/bot-newbie-interaction.handler.ts`
- `event/auto-channel/bot-auto-channel-interaction.handler.ts`
- `common/application/bot-i18n.service.ts`
- `command/voice-flush.command.ts`
- `command/me.command.ts`
- `command/voice-analytics/server-diagnosis.command.ts`
- `command/voice-analytics/self-diagnosis.command.ts`
- `command/sticky-message/sticky-message-register.command.ts`
- `command/sticky-message/sticky-message-list.command.ts`
- `command/sticky-message/sticky-message-delete.command.ts`
- `music/infrastructure/kazagumo.provider.ts`
- `music/application/music-channel.service.ts`
- `music/application/chart-crawler.service.ts`
- `music/presentation/interactions/music-search-modal.handler.ts`
- `music/presentation/interactions/music-channel-button.handler.ts`
- `music/presentation/listeners/music-channel-message.listener.ts`
- `music/presentation/commands/music-play.command.ts`
- `music/presentation/commands/music-pause.command.ts`
- `music/presentation/commands/music-resume.command.ts`
- `music/presentation/commands/music-skip.command.ts`
- `music/presentation/commands/music-stop.command.ts`
- `main.ts` (이 파일만 Step 3에서 수정)

### /metrics 엔드포인트 로그 빈도

- Prometheus scrape 간격: 15초
- autoLogging ignore 설정으로 `/metrics` 경로를 제외하면 불필요한 로그 축적 방지
- `/health`, `/health/liveness` 같은 엔드포인트가 추후 추가될 경우에도 ignore 목록 확장 가능

---

## 수정 대상 파일 요약

| 파일 | 작업 내용 |
|------|-----------|
| `apps/bot/package.json` | `nestjs-pino`, `pino-http`, `pino-pretty` 의존성 추가 (pnpm install) |
| `apps/bot/src/app.module.ts` | `LoggerModule.forRootAsync()` import 등록 |
| `apps/bot/src/main.ts` | `bufferLogs: true` + `app.useLogger(app.get(PinoLogger))` 적용 |

**변경하지 않는 파일:** 기존 `new Logger()` 사용 파일 29개 (자동 위임)

---

## 검증 항목

- [ ] `pnpm --filter @onyu/bot build` 빌드 성공
- [ ] 로컬 dev 실행 시 pino-pretty 컬러 로그 출력 확인
- [ ] 기존 Logger 사용 코드(예: `BotVoiceStateDispatcher`)의 로그가 Pino를 통해 출력되는지 확인
- [ ] `NODE_ENV=production`에서 JSON 포맷 로그 출력 확인
- [ ] `/metrics` 엔드포인트 접근 시 HTTP 요청 로그가 출력되지 않는지 확인
- [ ] Prometheus scrape가 정상 동작하는지 확인 (로그 제외가 기능에 영향 없음)
