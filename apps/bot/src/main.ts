import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

const DEFAULT_BOT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Bot은 HTTP 서버가 필요 없지만, health check 등을 위해 최소 포트 개방
  const port = process.env.BOT_PORT ?? DEFAULT_BOT_PORT;
  await app.listen(port);

  Logger.log(`Bot process started on port ${port}`);
}

void bootstrap();
