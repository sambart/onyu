# 기능 수정/추가 작업 프롬프트

## 작업 대상
- 기능명: {{FEATURE_NAME}}
- 요구사항: {{REQUIREMENT_SUMMARY}}

## 실행 모드: 자율 연속 실행

> **이 프롬프트는 참조 문서가 아닌 실행 명령이다.**
> Phase 0부터 Phase 7까지 사용자 개입 없이 자율적으로 끝까지 실행한다.

### 자율 실행 규칙
1. **중단 금지**: 에이전트 호출 결과를 받은 즉시 다음 단계를 호출한다. 사용자에게 "결과를 보고하고 대기"하지 않는다.
2. **Phase 자동 전환**: 현재 Phase의 모든 단계가 완료되면, 사용자 확인 없이 다음 Phase로 진행한다.
3. **중간 보고 생략**: Phase 간 전환 시 사용자에게 "다음 단계로 진행할까요?"라고 묻지 않는다. TodoWrite로 진행 상황을 업데이트하는 것으로 충분하다.
4. **멈춰야 하는 경우**: (1) 3회 연속 실패 시, (2) Phase 3.5(계획 확인) 단계에서 사용자 승인 대기 시.
5. **진행 추적**: 파이프라인 시작 시 TodoWrite로 전체 Phase를 등록하고, 각 단계 완료마다 상태를 갱신한다.

### 에이전트 호출 패턴
```
# 잘못된 패턴 (❌): 호출 후 보고하고 멈춤
에이전트 A 호출 → 결과 수신 → "A가 완료되었습니다. 다음으로 진행할까요?" → [사용자 대기]

# 올바른 패턴 (✅): 호출 후 즉시 다음 단계 진행
에이전트 A 호출 → 결과 수신 → TodoWrite 갱신 → 에이전트 B 즉시 호출 → ...
```

### 병렬 실행 최적화
- 독립적인 에이전트(예: plan-writer × N)는 반드시 동시에 호출한다.
- 순차 의존이 있는 에이전트(예: prd-writer → database-architect)는 앞선 결과를 받은 후 호출한다.

## 공통 규칙
- 각 단계는 이전 단계의 산출물을 명시적으로 참조한다.
- 문서 수정 시 기존 포맷과 컨벤션을 유지한다.
- 단계 실패 시 에러를 보고하고 해당 단계를 재시도한다. (최대 3회)
- 3회 재시도 후에도 실패하면 사용자에게 보고하고 대기한다.

## 도메인 결정 (Phase 0)
파이프라인 시작 전, 작업 대상 기능이 속하는 **도메인**을 결정한다.
- 도메인 목록: `voice`, `music`, `member`, `channel`, `auth`, `gemini`, `web`, `newbie`, `status-prefix`, `general`, `sticky-message`, `monitoring`, `voice-co-presence`, `inactive-member`
- 결정된 도메인에 해당하는 문서만 각 에이전트에 전달하여 컨텍스트를 최소화한다.

### 프로젝트 구조
```
onyu/
├── apps/
│   ├── api/          # NestJS Backend (TypeORM + PostgreSQL + Redis + Discord.js)
│   └── web/          # Next.js Frontend Dashboard (React 19 + Tailwind CSS)
├── libs/
│   └── shared/       # 공유 타입 및 상수
├── docs/
│   └── specs/        # 기능 명세 문서
│       ├── prd/      # PRD 문서
│       └── database/ # DB 스키마 문서
└── prompt/           # AI 워크플로우 프롬프트
```

### 문서 참조 규칙
| 문서 유형 | 전역 (항상 읽음) | 기능별 (도메인에 따라 선택) |
|-----------|-----------------|---------------------------|
| PRD | `/docs/specs/prd/_index.md` | `/docs/specs/prd/{domain}.md` |
| DB 스키마 | `/docs/specs/database/_index.md` | — |

## 실행 파이프라인

### Phase 1: 문서 작성
1. [prd-writer] → 입력: 요구사항 / 출력: `/docs/specs/prd/{domain}.md` 갱신

### Phase 2: 설계
2. [database-architect] → 입력: PRD diff / 출력: `/docs/specs/database/_index.md` (변경 시)
3. [database-critic] → 입력: database/_index.md diff / 출력: 리뷰 반영된 database/_index.md
4. **[Migration 생성]** → 조건: database/_index.md 변경 시 또는 신규 Entity 추가 시
    - **Entity 파일이 이미 존재하는 경우**: Entity 파일 수정
    - **Entity 파일이 없는 경우**: PRD/DB 스키마 문서를 기반으로 Entity 파일 신규 작성 후 모듈에 등록
    - 자동 생성 시도: 컨테이너 내에서 `docker exec -w //workspace/apps/api nest-api sh -c "TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{\"experimentalDecorators\":true,\"emitDecoratorMetadata\":true,\"strict\":false,\"useDefineForClassFields\":false}' ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:generate src/migrations/{timestamp}-{Name} -d src/data-source.ts"` 실행
    - **자동 생성 결과 검토**: TypeORM `migration:generate`는 현재 Entity와 DB 스키마의 **전체 diff**를 출력하므로, 불필요한 변경(기존 인덱스/FK 재생성, 컬럼 타입 재정의 등)이 포함될 수 있다. 이 경우 **해당 기능에 필요한 변경만 포함하도록 마이그레이션 파일을 수동으로 정리**한다.
    - **수동 작성이 필요한 경우**: 자동 생성 실패 또는 결과가 지나치게 복잡할 때, PRD의 데이터 모델 정의를 기반으로 `CREATE TABLE`, `CREATE INDEX` SQL을 직접 작성한다.
    - 마이그레이션 실행: `docker exec -w //workspace/apps/api nest-api sh -c "TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{\"experimentalDecorators\":true,\"emitDecoratorMetadata\":true,\"strict\":false,\"useDefineForClassFields\":false}' ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/data-source.ts"` 로 실행하여 테이블 생성 확인
    - 출력: `/apps/api/src/migrations/*.ts`

### Phase 3: 계획
5. [common-task-planner] → 조건: **다중 도메인 변경 시에만** 실행 / 입력: PRD (도메인별) / 출력: 공통 모듈 판단 결과
6. [plan-writer] × N (병렬, 모듈 단위) → 출력: 각 모듈별 구현 계획

### Phase 3.5: 계획 확인 (사용자 승인)
> **이 단계에서만 사용자 개입이 발생한다.**

- Phase 1~3의 산출물(PRD, DB 스키마, 마이그레이션, 구현 계획)을 요약하여 사용자에게 제시한다.
- 요약 항목:
  - 변경/추가된 PRD 내용
  - DB 스키마 변경 사항 (있는 경우)
  - 생성된 마이그레이션 (있는 경우)
  - 모듈별 구현 계획 목록
- 사용자가 **승인**하면 Phase 4로 진행한다.
- 사용자가 **수정 요청**하면 해당 Phase로 돌아가 반영 후 다시 Phase 3.5로 복귀한다.

### Phase 4: 구현
7. [implementer] × N (병렬, 계획 단위) → 출력: 변경된 코드

### Phase 5: 검증
8. [quality-enforcer] × N (병렬, 구현 단위) → 입력: 변경된 코드 / 출력: 코드 품질 검수 결과 및 수정

### Phase 6: 테스트

#### Phase 6 실행 규칙

1. **합류 후 판단 (Barrier)**: tester와 fe-tester를 **병렬로 호출**하되, **둘 다 완료된 후** 결과를 합산하여 판단한다. 한쪽이 먼저 실패했다고 즉시 회귀하지 않는다.
2. **테스트 에이전트는 구현 코드를 수정하지 않는다**: tester와 fe-tester는 테스트 코드 작성과 실행만 담당한다. 구현 버그를 발견하면 **실패 보고서만 출력**하고, 실제 수정은 Phase 4 회귀 시 implementer가 수행한다.
3. **회귀 시 합산 호출**: 하나 이상 실패한 경우 implementer를 **1회만 호출**하되, 양쪽 실패 정보를 모두 전달한다.
4. **회귀 후 전체 재실행**: Phase 4 회귀로 구현이 수정되면, Phase 6를 **전체 재실행**한다 (통과했던 쪽도 포함). 구현 변경이 기존 통과 테스트를 깨뜨릴 수 있기 때문이다.
5. **실패 카운트**: 3회 제한은 **Phase 6 사이클 기준**이다. Phase 6 실행 1회 = 1사이클. 3사이클 실패 시 사용자에게 보고하고 대기한다.

#### Phase 6 판정 흐름

```
[tester] ──┐
           ├── 둘 다 완료 대기 (Barrier)
[fe-tester]┘
           │
           ├── 둘 다 성공 → Phase 7(완료)로 진행
           ├── 하나 이상 실패 → 실패 정보 합산 → Phase 4 회귀 (implementer 1회 호출)
           └── 회귀 후 → Phase 5(검증) + Phase 6(테스트) 전체 재실행
```

#### Phase 6 상세

9. [tester] → BE 테스트 작성 및 실행 (병렬)
   - 입력: 변경된 코드 + PRD + 구현 계획
   - 작업:
     1. 기존 테스트 실행 → 기존 동작 보존 확인
     2. 신규 기능에 대한 테스트 코드 작성 (Unit / Integration)
        - 정상 케이스, 실패 케이스, 경계값, 예외 상황 포함
        - 외부 의존성은 mock 처리
        - 테스트 이름은 요구사항을 그대로 반영
     3. 작성한 테스트 실행
   - 출력: 테스트 코드 + 실행 결과 (실패 시 실패 보고서)
   - 성공 조건: 기존 + 신규 테스트 전체 통과
10. [fe-tester] → FE 테스트 작성 및 실행 (병렬, 조건: `apps/web` 변경 시에만)
    - 입력: 변경된 프론트엔드 코드
    - 작업: Testing Trophy 전략 기반 테스트 작성 및 실행
    - 출력: 테스트 코드 + 실행 결과 (실패 시 실패 보고서)

### Phase 7: 완료
11. 변경 요약 출력
    - 수정된 파일 목록
    - 주요 변경 사항 요약
    - 테스트 커버리지 요약 (추가된 테스트 수, 통과 현황)

---

## 파이프라인 시각화

```
[도메인 결정] ──AUTO──► [문서] ──AUTO──► [설계] ──AUTO──► [계획] ──STOP──► [계획 확인] ──AUTO──► [구현] ──AUTO──► [검증] ──AUTO──► [테스트] ──AUTO──► [완료]
     │                   │                │                │                │                  │                │                │                │
     │                   │                │                │                │                  │                │                │                │
  0. 도메인 결정      1. prd-writer    2. db-architect  5. common-task   3.5 사용자 승인    7. implementer   8. quality-      9. tester  ──┐  11. 변경 요약
                                        3. db-critic        planner?        (요약 제시 →       × N (병렬)      enforcer                 ├ Barrier  + 테스트
                                        4. migration?    6. plan-writer     승인/수정)                         × N (병렬)  10. fe-tester?┘    커버리지
                                                            × N (병렬)
                                                                                                                             │
                                                                                                                   실패 시 Phase 4 회귀
                                                                                                                   (implementer 1회 호출)
                                                                                                                   → Phase 5+6 전체 재실행

  ※ AUTO = 사용자 확인 없이 자동 전환
  ※ STOP = 사용자 승인 후 진행 (Phase 3.5)
  ※ 실패 시: 각 단계 최대 3회 재시도, 초과 시 사용자 보고
  ※ common-task-planner는 다중 도메인 변경 시에만 실행
  ※ 테스트(Phase 6): tester + fe-tester 병렬 실행 → Barrier → 합산 판정
  ※ 테스트 실패 시: 실패 보고서 합산 → Phase 4 회귀 → Phase 5+6 전체 재실행 (최대 3사이클)
```
