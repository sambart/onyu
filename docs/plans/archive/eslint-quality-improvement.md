# ESLint 강화 및 코드베이스 품질 개선 계획

> 작성일: 2026-03-08
> 상태: 계획 수립 완료 (미적용)

## 현재 상태 감사 (Audit)

### 설정 구조

```
eslint.config.base.mjs          ← 전체 공유 base config
├── apps/api/eslint.config.mjs   ← Node + Jest globals, parserOptions.project
├── apps/web/eslint.config.mjs   ← Next.js core web vitals
└── libs/shared/eslint.config.mjs ← no-explicit-any: error (유일하게 엄격)
```

- **ESLint**: v9.39.0 (Flat Config)
- **typescript-eslint**: v8.50.0 — `tseslint.configs.recommended` 사용 중
- **Prettier**: singleQuote, trailingComma: all, printWidth: 100
- **플러그인**: simple-import-sort, unused-imports, eslint-config-prettier

### 현재 규칙 수준

| 규칙 | 현재 수준 | 비고 |
|------|-----------|------|
| `@typescript-eslint/no-explicit-any` | `warn` | shared만 `error` |
| `@typescript-eslint/no-non-null-assertion` | `off` | 3건 존재 |
| `@typescript-eslint/explicit-function-return-type` | `off` | |
| `@typescript-eslint/explicit-module-boundary-types` | `off` | |
| `@typescript-eslint/ban-ts-comment` | 미설정 | |
| `no-console` | `warn` | API는 allow: ['warn'] |
| `prefer-const` | `error` | |
| `no-var` | `error` | |

### TypeScript strict 설정

| 워크스페이스 | strict | strictNullChecks | noImplicitAny | 기타 |
|-------------|--------|-----------------|---------------|------|
| Root | `true` | (상속) | (상속) | |
| **apps/api** | `true` | **`false`** | **`false`** | strictBindCallApply, forceConsistentCasing, noFallthrough 모두 `false` |
| apps/web | `true` | (상속) | (상속) | 완전한 strict |
| libs/shared | `true` | (상속) | (상속) | 완전한 strict |

### 현재 위반 현황 (2026-03-08 기준)

| 카테고리 | 건수 | 위치 |
|----------|------|------|
| `no-explicit-any` (warn) | 8건 | API app 전역 |
| import 정렬 (error, autofix) | 2건 | voice-channel.service.ts, voice-channel.module.ts |
| non-null assertion (`!`) | 3건 | voice-analytics.service.ts (2), voice-daily-flush-service.ts (1) |
| `as any` 캐스팅 | 1건 | all-exceptions.filter.ts |
| `@ts-ignore` / `@ts-nocheck` | 0건 | |
| **Web app** | 0건 | |
| **Shared lib** | 0건 | |

---

## Phase 1: ESLint 규칙 강화 (즉시 적용 가능)

### 1-1. `eslint.config.base.mjs` 규칙 변경

| 규칙 | 현재 | 변경 | 근거 |
|------|------|------|------|
| `@typescript-eslint/no-explicit-any` | `warn` | `error` | shared는 이미 error. 전체 통일 |
| `@typescript-eslint/no-non-null-assertion` | `off` | `warn` | 3건 존재. Phase 2에서 error로 승격 |
| `no-console` | `warn` | `error` | NestJS Logger 사용을 강제 |
| `@typescript-eslint/ban-ts-comment` | 미설정 | `error` | `@ts-ignore` 방지, `@ts-expect-error`는 설명 포함 시 허용 |
| `@typescript-eslint/consistent-type-assertions` | 미설정 | `error` | `as` 구문 통일, `as any` 차단 |
| `eqeqeq` | 미설정 | `error` (null 제외) | `==` 대신 `===` 강제 |

### 1-2. `libs/shared/eslint.config.mjs`

- `@typescript-eslint/no-explicit-any: error` 제거 (base에서 이미 error이므로 중복)

### 1-3. 기존 위반 수정 (규칙 적용 전 선행 수정)

| 파일 | 위반 | 수정 방법 |
|------|------|-----------|
| `voice-gemini.service.ts:10` | `model: any` | `GenerativeModel` 타입 import |
| `voice-gemini.service.ts:116` | `obj: any` type guard | `obj: unknown`으로 변경 |
| `discord.strategy.ts:17` | `profile: any` | `DiscordProfile` 인터페이스 정의 |
| `all-exceptions.filter.ts:35` | `(message as any).message` | 타입 가드로 narrowing |
| `discord.gateway.ts:24` | `Map<string, any>` | 제네릭 `<T>` 또는 구체 타입 |
| `voice-analytics.service.ts:190,223` | `Map<string, any>` ×2 | 집계 데이터 인터페이스 정의 |
| `voice-name-enricher.service.ts:99` | `Map<string, any>` | 위 인터페이스 재사용 |
| `voice-channel.service.ts:1` | import 정렬 | `eslint --fix` autofix |
| `voice-channel.module.ts:1` | import 정렬 | `eslint --fix` autofix |

### 수정 대상 파일

- `eslint.config.base.mjs`
- `libs/shared/eslint.config.mjs`
- `apps/api/src/gemini/voice-gemini.service.ts`
- `apps/api/src/auth/discord.strategy.ts`
- `apps/api/src/common/filters/all-exceptions.filter.ts`
- `apps/api/src/gateway/discord.gateway.ts`
- `apps/api/src/gemini/voice-analytics.service.ts`
- `apps/api/src/gemini/voice-name-enricher.service.ts`
- `apps/api/src/channel/voice/application/voice-channel.service.ts`
- `apps/api/src/channel/voice/voice-channel.module.ts`

---

## Phase 2: ESLint 프리셋 업그레이드 + 타입 체크 규칙

### 2-1. `tseslint.configs.recommended` → `tseslint.configs.strict`

`strict`가 `recommended` 위에 추가하는 주요 규칙:
- `no-dynamic-delete` — 동적 delete 연산 금지
- `no-invalid-void-type` — void 타입 오남용 방지
- `prefer-literal-enum-member` — enum 멤버에 계산식 금지
- `unified-signatures` — 오버로드 시그니처 통합 권장
- `no-useless-constructor` — 빈 생성자 금지

NestJS 호환을 위해 데코레이터가 있는 클래스는 허용:
```js
'@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }]
```

### 2-2. API/Shared에 type-checked 규칙 추가

`parserOptions.project`가 이미 설정되어 있으므로 즉시 활성화 가능:

```js
'@typescript-eslint/no-floating-promises': 'error'        // 미처리 Promise 감지
'@typescript-eslint/no-misused-promises': 'error'          // Promise 조건문 오용 방지
'@typescript-eslint/await-thenable': 'error'               // 불필요한 await 감지
'@typescript-eslint/no-unnecessary-type-assertion': 'error' // 불필요한 타입 단언 제거
'@typescript-eslint/restrict-template-expressions': ['error', {
  allowNumber: true,
  allowBoolean: true,
}]
```

### 2-3. Phase 1 warn 규칙 승격

- `@typescript-eslint/no-non-null-assertion`: `warn` → `error` (3건 수정 후)

### 2-4. `eslint-plugin-promise` 추가

```bash
npm install -D eslint-plugin-promise
```

| 규칙 | 수준 | 설명 |
|------|------|------|
| `promise/catch-or-return` | error | catch 없는 Promise 방지 |
| `promise/no-return-wrap` | error | 불필요한 Promise.resolve/reject 래핑 방지 |
| `promise/param-names` | error | resolve/reject 파라미터 이름 통일 |

### non-null assertion 수정

| 파일 | 위반 | 수정 방법 |
|------|------|-----------|
| `voice-analytics.service.ts:119,140` | `userMap.get()!` | null 체크 guard 추가 |
| `voice-daily-flush-service.ts:39` | `key.split(':').at(-1)!` | guard + early continue |

---

## Phase 3: API TypeScript strict 모드 복원

`apps/api/tsconfig.json`에서 비활성화된 5개 strict 옵션을 단계적으로 제거한다.

**원칙:** 각 단계마다 `npm run api:build`로 컴파일 확인 후 다음 단계 진행

| 순서 | 옵션 | 위험도 | 예상 작업량 |
|------|------|--------|------------|
| 1 | `forceConsistentCasingInFileNames` | 거의 없음 | false 삭제만 |
| 2 | `noFallthroughCasesInSwitch` | 매우 낮음 | switch문 스캔 |
| 3 | `strictBindCallApply` | 낮음 | bind/call/apply 사용처 확인 |
| 4 | `noImplicitAny` | 중간 | 미타입 파라미터, 콜백 수정 |
| 5 | `strictNullChecks` | **높음** | Map.get(), ConfigService.get(), findOne() 등 null 처리 |

### `strictNullChecks` 주요 영향 패턴

- `Map.get()` → `T | undefined` — null 체크 또는 has() 선행 필요
- `ConfigService.get<string>('KEY')` → `string | undefined` — `getOrThrow()` 사용 권장
- TypeORM `findOne()` → `T | null` — null 체크 필수
- Discord.js 널러블 리턴 — optional chaining 적용

**예상 수정 범위:** 15~30개 소스 파일

---

## Phase 4: 컨벤션 강화 규칙 (선택적)

### 4-1. 네이밍 컨벤션

```js
'@typescript-eslint/naming-convention': [
  'error',
  // boolean 변수: is/has/should/can/will/did 접두사
  { selector: 'variable', types: ['boolean'], format: ['camelCase'],
    prefix: ['is', 'has', 'should', 'can', 'will', 'did'] },
  // 인터페이스: PascalCase, I접두사 금지
  { selector: 'interface', format: ['PascalCase'],
    custom: { regex: '^I[A-Z]', match: false } },
  // 타입 별칭: PascalCase
  { selector: 'typeAlias', format: ['PascalCase'] },
  // Enum 멤버: PascalCase 또는 UPPER_CASE
  { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
]
```

### 4-2. 추가 유용 규칙

| 규칙 | 수준 | 설명 |
|------|------|------|
| `@typescript-eslint/switch-exhaustiveness-check` | error | union 타입 switch 완전성 보장 |
| `@typescript-eslint/prefer-nullish-coalescing` | warn | `\|\|` 대신 `??` 권장 |
| `@typescript-eslint/prefer-optional-chain` | error | 옵셔널 체이닝 강제 |
| `@typescript-eslint/explicit-module-boundary-types` | error | exported 함수 반환 타입 명시 |

---

## Phase 의존성

```
Phase 1 (규칙 강화 + any 제거)
  │
  ▼
Phase 2 (strict 프리셋 + type-checked)
  │
  ▼
Phase 3 (tsconfig strict 복원)
  │
  ▼
Phase 4 (컨벤션 강화)
```

Phase 1~2는 lint 수준 변경이므로 비교적 안전. Phase 3은 컴파일 레벨 변경이므로 가장 주의가 필요하다.

---

## 검증 방법

각 Phase 완료 후:

1. `npm run lint` — 전체 워크스페이스 0 errors 확인
2. `npm run api:build` — TypeScript 컴파일 성공 확인
3. `npm run api:test` — 기존 테스트 통과 확인
4. `npm run web:build` — Next.js 빌드 성공 확인
