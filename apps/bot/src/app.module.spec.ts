/**
 * AppModule — LoggerModule 설정 검증
 *
 * NestJS 부트스트랩 수준의 변경(LoggerModule 추가, main.ts PinoLogger 적용)은
 * E2E 테스트 없이는 완전한 통합 검증이 불가하다.
 * 여기서는 AppModule 메타데이터(imports 목록)와
 * LoggerModule.forRootAsync()가 반환하는 DynamicModule 내부 구조를 검증한다.
 *
 * LoggerModule.forRootAsync() 반환 구조:
 *   { module: LoggerModule, imports: [...], providers: [...], exports: [...] }
 *   useFactory / inject는 providers 배열 내
 *   provide === PARAMS_PROVIDER_TOKEN('pino-params') 항목에 저장된다.
 */

import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { LoggerModule, PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { AppModule } from './app.module';

interface DynamicModule {
  module: unknown;
  providers?: Array<{
    provide?: unknown;
    useFactory?: (...args: unknown[]) => unknown;
    inject?: unknown[];
  }>;
}

/** AppModule @Module imports 메타데이터에서 LoggerModule DynamicModule을 찾는다 */
function findLoggerDynamicModule(): DynamicModule | undefined {
  const imports = Reflect.getMetadata('imports', AppModule) as unknown[] | undefined;
  if (!imports) return undefined;

  return imports.find((entry): entry is DynamicModule => {
    if (entry === null || typeof entry !== 'object') return false;
    return (entry as DynamicModule).module === LoggerModule;
  });
}

/** LoggerModule DynamicModule providers에서 PARAMS_PROVIDER_TOKEN 항목을 추출한다 */
function findParamsProvider(dynamicModule: DynamicModule) {
  return dynamicModule.providers?.find((p) => p.provide === PARAMS_PROVIDER_TOKEN);
}

describe('AppModule', () => {
  describe('LoggerModule 등록', () => {
    it('LoggerModule이 imports에 등록되어 있다', () => {
      const loggerModule = findLoggerDynamicModule();

      expect(loggerModule).toBeDefined();
      expect(loggerModule?.module).toBe(LoggerModule);
    });

    it('LoggerModule이 ConfigService를 inject 목록에 포함한다', () => {
      const loggerModule = findLoggerDynamicModule();
      const paramsProvider = loggerModule ? findParamsProvider(loggerModule) : undefined;

      expect(paramsProvider).toBeDefined();
      expect(paramsProvider?.inject).toContain(ConfigService);
    });

    it('LoggerModule useFactory가 함수로 등록되어 있다', () => {
      const loggerModule = findLoggerDynamicModule();
      const paramsProvider = loggerModule ? findParamsProvider(loggerModule) : undefined;

      expect(typeof paramsProvider?.useFactory).toBe('function');
    });
  });

  describe('LoggerModule useFactory 동작', () => {
    /** useFactory를 AppModule 메타데이터에서 직접 추출한다 */
    function getUseFactory(): (config: ConfigService) => unknown {
      const loggerModule = findLoggerDynamicModule();
      const paramsProvider = loggerModule ? findParamsProvider(loggerModule) : undefined;

      if (!paramsProvider?.useFactory) {
        throw new Error('LoggerModule PARAMS_PROVIDER_TOKEN useFactory를 찾을 수 없다');
      }
      // as 단언: useFactory 파라미터 타입을 ConfigService로 좁히기 위해 필요하다
      return paramsProvider.useFactory as (config: ConfigService) => unknown;
    }

    it('production 환경에서 pinoHttp.level이 info다', () => {
      const useFactory = getUseFactory();
      const mockConfig = { get: vi.fn().mockReturnValue('production') } as unknown as ConfigService;

      const result = useFactory(mockConfig) as { pinoHttp: { level: string } };

      expect(result.pinoHttp.level).toBe('info');
    });

    it('development 환경에서 pinoHttp.level이 debug다', () => {
      const useFactory = getUseFactory();
      const mockConfig = {
        get: vi.fn().mockReturnValue('development'),
      } as unknown as ConfigService;

      const result = useFactory(mockConfig) as { pinoHttp: { level: string } };

      expect(result.pinoHttp.level).toBe('debug');
    });

    it('production 환경에서 pino-pretty transport가 없다', () => {
      const useFactory = getUseFactory();
      const mockConfig = { get: vi.fn().mockReturnValue('production') } as unknown as ConfigService;

      const result = useFactory(mockConfig) as {
        pinoHttp: { transport?: { target: string } };
      };

      expect(result.pinoHttp.transport).toBeUndefined();
    });

    it('development 환경에서 pino-pretty transport가 설정된다', () => {
      const useFactory = getUseFactory();
      const mockConfig = {
        get: vi.fn().mockReturnValue('development'),
      } as unknown as ConfigService;

      const result = useFactory(mockConfig) as {
        pinoHttp: { transport?: { target: string; options?: { colorize?: boolean } } };
      };

      expect(result.pinoHttp.transport?.target).toBe('pino-pretty');
      expect(result.pinoHttp.transport?.options?.colorize).toBe(true);
    });

    it('/metrics 경로 요청은 autoLogging에서 ignore된다', () => {
      const useFactory = getUseFactory();
      const mockConfig = {
        get: vi.fn().mockReturnValue('development'),
      } as unknown as ConfigService;

      const result = useFactory(mockConfig) as {
        pinoHttp: {
          autoLogging: { ignore: (req: { url?: string }) => boolean };
        };
      };

      const ignore = result.pinoHttp.autoLogging.ignore;
      expect(ignore({ url: '/metrics' })).toBe(true);
    });

    it('/metrics 이외의 경로는 autoLogging에서 ignore되지 않는다', () => {
      const useFactory = getUseFactory();
      const mockConfig = {
        get: vi.fn().mockReturnValue('development'),
      } as unknown as ConfigService;

      const result = useFactory(mockConfig) as {
        pinoHttp: {
          autoLogging: { ignore: (req: { url?: string }) => boolean };
        };
      };

      const ignore = result.pinoHttp.autoLogging.ignore;
      expect(ignore({ url: '/health' })).toBe(false);
      expect(ignore({ url: '/' })).toBe(false);
      expect(ignore({ url: undefined })).toBe(false);
    });
  });
});
