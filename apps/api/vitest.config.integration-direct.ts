/**
 * testcontainers 없이 기존 DB에 직접 연결하는 통합 테스트용 vitest config.
 * Docker 소켓 없이 컨테이너 내부에서 실행할 때 사용한다.
 *
 * 실행:
 *   DATABASE_HOST=db DATABASE_PORT=5432 ... pnpm exec vitest run --config vitest.config.integration-direct.ts
 */
import path from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@onyu/shared': path.resolve(__dirname, '../../libs/shared/src'),
      'src/': path.resolve(__dirname, 'src') + '/',
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.integration-spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
    setupFiles: ['./src/test-utils/integration-setup-direct.ts'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
