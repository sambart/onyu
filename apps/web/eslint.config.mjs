import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

import { baseConfig } from '../../eslint.config.base.mjs';

const eslintConfig = defineConfig([
  ...baseConfig,

  ...nextVitals,
  ...nextTs,

  {
    rules: {
      'react/function-component-definition': [
        'error',
        { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
      ],
    },
  },

  {
    files: ['components/ui/**/*.tsx'],
    rules: {
      'react/function-component-definition': 'off',
    },
  },

  {
    // React 컴포넌트는 JSX 반환으로 길이가 자연스럽게 늘어남 — 페이지/컴포넌트 한해 완화
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },

  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**']),
]);

export default eslintConfig;
