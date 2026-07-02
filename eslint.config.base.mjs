import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

/** Base ESLint flat config shared across all workspaces. */
export const baseConfig = [
  ...tseslint.configs.recommended,

  eslintConfigPrettier,

  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-throw-literal': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Constructor DI(NestJS) false positive 가독성 영향 작아 off — 일반 함수 과인자는 리뷰로 확인
      'no-negated-condition': 'off',
      'no-warning-comments': [
        'warn',
        { terms: ['todo', 'fixme', 'xxx'], location: 'start' },
      ],
      // NestJS Constructor DI 는 보통 4~5개 — false positive 완화 (5 초과는 책임 과다 신호로 유지)
      'max-params': ['warn', { max: 5 }],
      'max-lines-per-function': [
        'warn',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      'no-magic-numbers': [
        'warn',
        {
          ignore: [
            -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 30, 60, 100, 1000, 1024, 3600,
            // 일반 리터럴 (시간 단위/퍼센트 경계 등 빈출)
            9, 14, 15, 20, 25, 32, 40, 50, 90,
            // HTTP 상태코드 + 캘린더(일/년)
            200, 204, 300, 365, 404, 500,
            // 포트 번호
            3000, 5432, 6379,
            // 시간(초/밀리초)
            60_000, 86_400, 86_400_000,
          ],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          enforceConst: true,
        },
      ],
      'max-depth': ['error', { max: 3 }],
    },
  },
];

/** Type-checked rules — requires parserOptions.project in consuming config. */
export const typeCheckedRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'error',
};

/** Standard ignore patterns shared across workspaces. */
export const baseIgnores = ['dist/**', 'node_modules/**', 'coverage/**', '*.js', '*.d.ts'];
