import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// pnpm 스토어의 실제 경로 (심볼릭 링크 우회)
const PNPM_STORE = path.resolve(__dirname, '../../node_modules/.pnpm');

const REACT_DIR = path.join(PNPM_STORE, 'react@19.2.3/node_modules/react');
const REACT_DOM_DIR = path.join(PNPM_STORE, 'react-dom@19.2.3_react@19.2.3/node_modules/react-dom');
const LUCIDE_DIR = path.join(PNPM_STORE, 'lucide-react@0.562.0_react@19.2.3/node_modules/lucide-react');
// user-event의 피어 디펜던시 경로 (@testing-library/dom subpath exports resolve 실패 우회)
const TESTING_LIBRARY_DOM_DIR = path.join(
  PNPM_STORE,
  '@testing-library+user-event_1ca100c7362ccf0b1358603d616c282d/node_modules/@testing-library/dom',
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@onyu/shared': path.resolve(__dirname, '../../libs/shared/src'),
      '@': path.resolve(__dirname),
      // vite 7 + pnpm 심볼릭 링크 환경에서 react subpath exports 해석 실패를 우회한다
      'react/jsx-dev-runtime': path.join(REACT_DIR, 'jsx-dev-runtime.js'),
      'react/jsx-runtime': path.join(REACT_DIR, 'jsx-runtime.js'),
      'react': path.join(REACT_DIR, 'index.js'),
      'react-dom/client': path.join(REACT_DOM_DIR, 'client.js'),
      'react-dom': path.join(REACT_DOM_DIR, 'index.js'),
      'lucide-react': path.join(LUCIDE_DIR, 'dist/cjs/lucide-react.js'),
      // pnpm 격리 환경에서 @testing-library/dom subpath exports 해석 실패를 우회한다
      '@testing-library/dom': path.join(TESTING_LIBRARY_DOM_DIR, 'dist/index.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['app/**/*.test.tsx', 'app/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['app/**/*.{ts,tsx}'],
    },
  },
});
