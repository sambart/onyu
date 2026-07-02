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
    include: ['test/**/*.e2e-spec.ts'],
    // 기존 app.e2e-spec.ts 는 AppModule 전체(Joi env 검증 포함)를 부팅하며
    // testcontainers 미연동 상태로 작성되어 있다. 해당 파일은 전체 AppModule 부팅 환경이
    // 별도로 준비될 때 실행해야 하므로 이 설정에서 제외한다.
    exclude: ['test/app.e2e-spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // 각 테스트 파일마다 e2e-setup(컨테이너 기동 + 마이그레이션)을 실행한다.
    // globalSetup 은 env 를 worker 프로세스에 전파하지 못하므로 setupFiles 방식을 채택한다.
    setupFiles: ['src/test-utils/e2e-setup.ts'],
    // 파일 간 컨테이너 충돌을 막기 위해 순차 실행
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
