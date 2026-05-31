import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // nginx 1단 리버스 프록시 신뢰 → req.ip 가 X-Forwarded-For 의 실제 클라이언트 IP 로 해석됨
  // (미설정 시 throttler 가 프록시 IP 하나로 집계해 전 사용자가 같은 rate-limit 버킷을 공유)
  app.set('trust proxy', 1);

  const configService = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('WEB_URL', 'http://localhost:4000'),
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter(), new DomainExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = configService.get<number>('PORT', 3000);

  await app.listen(port, () => {
    Logger.log(`Server listening on port ${port}`);
  });
}

bootstrap().catch((err) => {
  Logger.error('Failed to start application', err);
  process.exit(1);
});
