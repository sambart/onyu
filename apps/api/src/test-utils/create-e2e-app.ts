/**
 * E2E 테스트용 경량 NestJS 앱 빌더.
 *
 * 전체 AppModule 대신 테스트 대상 도메인 모듈만 조합하여 앱을 부팅한다.
 * main.ts 의 전역 설정(ValidationPipe, ExceptionFilter)을 동일하게 적용하여
 * HTTP 전 구간 검증 성격을 유지한다.
 */
import type { DynamicModule, Type } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../common/filters/domain-exception.filter';
import { createIntegrationModuleBuilder } from './create-integration-module';

interface E2EAppOptions {
  /** 테스트 대상 NestJS 모듈들 */
  modules?: Type[];
  /** 추가 DynamicModule (ThrottlerModule 등) */
  dynamicModules?: DynamicModule[];
}

/**
 * E2E 테스트용 NestJS 앱을 생성한다.
 * - DB(PostgreSQL) + Redis 연결 포함
 * - ValidationPipe(whitelist, transform) 전역 적용
 * - AllExceptionsFilter + DomainExceptionFilter 전역 적용
 */
export async function createE2EApp(options: E2EAppOptions = {}): Promise<INestApplication> {
  const { modules = [], dynamicModules = [] } = options;

  const builder = createIntegrationModuleBuilder({
    modules: [...modules, ...dynamicModules] as Type[],
    withRedis: true,
  });

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalFilters(new AllExceptionsFilter(), new DomainExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}
