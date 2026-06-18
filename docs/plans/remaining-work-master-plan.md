# 남은 작업 종합 계획 (Master Plan)

> 작성일: 2026-03-17
> 최종 갱신: 2026-06-19
> 기준: develop 브랜치 최신 커밋 (코드 대조 완료)

---

## 변경 요약 (Changelog)

**2026-06-19 P0 #3 완료** — **웹 프록시 PII 평문 로깅 제거**. `apps/web/app/api/guilds/[...path]/route.ts` 가 모든 프록시 요청/응답 본문(디스코드 userId·닉네임 등 PII)을 `console.warn` 으로 무조건 출력하던 2줄을 제거했다. 조건부 dev-가드 대신 완전 제거(NODE_ENV 오설정 시 재유출 차단). 연결 실패 `console.error`(본문 미포함)는 유지. 회귀 가드 테스트 30건(전 메서드 `console.warn` 미호출 검증). 남은 P0: rate-limit per-route, returnTo 검증, 봇키 timing-safe.

**2026-06-19 P0 #2 완료** — **OAuth 콜백 JWT URL 토큰 제거**를 일회용 code 교환 방식으로 구현했다(권한 HITL 승인 후 진행). API callback이 JWT 대신 일회용 코드(Redis TTL 60초, 1회 소비)를 `?code=`로 전달하고, 웹 callback이 서버사이드로 `POST /auth/discord/exchange` 하여 JWT를 수령·httpOnly 쿠키로 set한다. JWT가 URL/access_log/Referer/히스토리에 노출되지 않는다. 테스트 45건(BE 22 + Web 23, "token이 redirect URL에 미노출" 보안 회귀 케이스 포함). 남은 P0: 프록시 PII 로깅, rate-limit per-route, returnTo 검증, 봇키 timing-safe.

**2026-06-19 P0 #1 완료** — P0 보안·안정성 트랙의 **Redis graceful wrapper** 를 구현·머지했다 ([PR #75](https://github.com/sambart/onyu/pull/75), 커밋 `753a2ef`). `RedisService` 22개 메서드를 공통 `safe()` 헬퍼로 try/catch 래핑하여 Redis 단일 장애점을 제거(장애 시 안전 기본값 반환 + 로깅, 시그니처 불변). 단위 테스트 52건 추가. 남은 P0 항목: OAuth URL 토큰 제거, 프록시 PII 로깅, rate-limit per-route, returnTo 검증, 봇키 timing-safe.

**2026-06-19 보안·안정성 트랙 편입** — `docs/assessments/2026-06-17-service-evaluation.md` (서비스 전반 평가, 종합 7.0/10)의 Sprint 1/2 로드맵을 본 master-plan 추적 체계에 편입했다. 평가 작성 후 코드 대조 결과 평가가 지적한 **High 항목 전부가 미반영(still-open)** 상태였고(throttle 봇제외·X-Real-IP 보정만 적용 완료), 이 항목들은 **출시 전 보안·안정성 작업으로 기존 plan 추적 밖**에 있었다. 따라서 신규 **P0(보안·안정성) 트랙**을 신설하여 평가 Sprint 1(보안 마감)을 P0, Sprint 2(복원력)를 P1 상단에 배치했다. 이 트랙은 별도 plan 문서 없이 본 문서에서 직접 추적한다(근거 file:line 은 평가 리포트 참조). 기존 plan 기반 잔여작업(eslint 등)은 상대적으로 후순위로 밀린다.

**2026-06-18 현행화** — 직전 갱신(2026-03-20)으로부터 약 3개월 경과하여 다수 항목이 완료되었기에 코드 대조 후 전면 재작성했다. 이번 사이클에 완료되어 `docs/plans/archive/` 로 이동된 plan: 친밀도/베스트프렌드 단순화 4종(`co-presence-best-friend-backend`, `simplify-friend-commands-{api,bot,web}`, `weekly-report-co-presence` — affinity·길드토글 제거 후 `/best-friend` + 주간리포트 친밀도 섹션만 구현), canvas 공통모듈 추출(`canvas-common-module`), 테스트 커버리지 개선(`test-coverage-improvement` — 단위 28파일/통합 24파일, 0% 도메인 11→2), 비활동 회원 등급탭 BE/FE(`inactive-member-grade-tab-{backend,frontend}` — decreaseRate 정렬 포함), 신입 미션 마이크시간 집계 BE/FE(`newbie-mission-use-mic-time-{backend,frontend}`), 베스트프렌드 원설계 검토안 2종(`best-friend-discord-feature`, `bot-friend-commands` — simplify 정책으로 대체). 아키텍처 분리(섹션 A)는 완료 상태를 유지한다. 잔여작업은 9건이며 우선순위를 **P1 / P2 / P3 / 유지보류**로 재배치했다. 이전 버전의 "B. 페이지 플랜"·"C. 아키텍처 리팩토링" 표는 해당 plan 들이 전부 archive 로 이동 완료되어 본 문서에서 제거하고, 미완료 잔여 plan 만 추적한다.

---

## 1. 현재 상태 요약

### 1-1. Bot/API 분리 진행 현황 — ✅ 완료 (2026-03-20 확인, 유지)

| 항목 | 수량 | 상태 |
|------|------|------|
| 슬래시 커맨드 (`@Command`) | API 0개 | ✅ Bot 이동 완료, API 원본 전부 삭제됨 |
| `@On` 이벤트 핸들러 | API 0개 | ✅ API에서 모두 제거, Bot으로 이동 완료 |
| `@InjectDiscordClient` adapter | API 0개 | ✅ DiscordRestService (REST API 기반)로 전환 완료 |
| `DiscordModule.forRootAsync()` | API 0개 | ✅ API app.module.ts에서 제거 완료 (Bot에만 유지) |
| bot-api 엔드포인트 | ~20개 | voice, newbie, sticky-message, voice-analytics, me, auto-channel, status-prefix, co-presence, monitoring |
| bot-api-client SDK | 구현됨 | ✅ 봇→API HTTP 클라이언트 (`@onyu/bot-api-client`) |

채택된 전략: **Discord REST API 직접 호출 (전략 2)**. `premium-service-architecture` Phase 1~3에 해당하는 아키텍처 분리는 모두 완료됐다.

### 1-2. 잔여작업 한눈에 보기

> **P0(보안·안정성)** 은 plan 문서가 아니라 `docs/assessments/2026-06-17-service-evaluation.md` 기반 추적 항목이다. 출시 전 보강 대상으로 기존 plan 보다 우선한다.

| 우선순위 | 항목 | 출처 | 진척 | 비고 |
|---|---|---|---|---|
| ~~**P0**~~ | ~~OAuth 콜백 JWT URL 토큰 제거~~ | 평가 Sprint1 | ✅ 완료 | 일회용 code 교환 방식 — `?token=` 제거, Redis 1회용 코드 + `/auth/discord/exchange` |
| ~~**P0**~~ | ~~Redis graceful wrapper~~ | 평가 Sprint1 | ✅ 완료 | PR #75 (`753a2ef`) — safe() 래핑, 테스트 52건. 단일장애점 제거 |
| ~~**P0**~~ | ~~웹 프록시 PII 평문 로깅 제거~~ | 평가 Sprint1 | ✅ 완료 | `route.ts` 요청/응답 본문 `console.warn` 2줄 제거 (연결에러 로그 유지) |
| **P0** | rate limit per-route 적용 | 평가 Sprint1 | ⚠️ 부분 | 전역 60/분만 — auth 20·analytics 10 미적용 |
| **P0** | `returnTo` open-redirect 검증 | 평가 Sprint1 | ⚠️ 부분 | 쿠키저장 ✓, 읽을때 상대경로/origin 검증 ✗ |
| **P0** | 봇 API 키 timing-safe 비교 | 평가 | ❌ open | `bot-api-auth.guard.ts:30` `!==` → `timingSafeEqual` |
| **P1** | 크론 분산락+시간분산 | 평가 Sprint2 | ❌ open | 자정 KST 크론 4종 동시폭주, overlap guard 전무 |
| **P1** | voice 세션 원자성 | 평가 Sprint2 | ❌ open | read-modify-write 비원자 → duration 손실 (Lua/큐) |
| **P1** | co-presence 상태 영속화 | 평가 Sprint2 | ❌ open | `co-presence.service.ts:34` 인메모리 Map → Redis |
| **P1** | mission N+1 배치화 | 평가 Sprint2 | ❌ open | `mission.service.ts:171,205,240,674` IN절 배치 |
| **P1** | 다중 write 트랜잭션 경계 | 평가 Sprint2 | ❌ open | `dataSource.transaction` 앱서비스 1곳뿐 — `ddd-entity-separation` 과 병행 |
| **P1** | `lightsail-account-migration.md` | plan | 0% | 신규 AWS 계정 마이그레이션 (ops) |
| **P2** | `eslint-warning-elimination.md` | plan | ~25% | Phase 2~6 코드수정 잔여 (병행 가능) |
| **P2** | `codebase-commonization.md` | plan | ~50% | newbie 레거시 폴더 정리 + JwtUser 타입 미완 |
| **P2** | `ddd-entity-separation.md` | plan | ~60% | Phase 2~5 잔여 — 평가 Sprint3(persistence 표준화) 와 겹침 |
| **P3** | `premium-service-architecture.md` (Phase 4~5) | plan | 미착수 | repo-separation 과 동일 사안 — 전략 결정 필요 |
| **P3** | `repo-separation.md` | plan | ~40% | mirror 자동화·.yml + Public 레포 미생성 — premium Phase4 와 통합 권장 |
| **P3** | `trend-driven-feature-roadmap.md` | plan | 결정 대기 | 로드맵 — 채택 결정 필요 (구현 아님) |
| **P3** | web TanStack Query 도입 | 평가 Sprint3 | ❌ open | 전 페이지 useState+useEffect+fetch — 서버상태관리 부재 |
| **유지보류** | `user-privacy-module.md` | plan | 코어 완료 | bot-api privacy/길드 co-presence 설정은 simplify 결정으로 의도적 폐기 → 실질 완료, 안전상 보류 |
| **유지보류** | `web-privacy-settings.md` | plan | 코어 완료 | 동상 (실질 완료, 안전상 보류) |

---

## 2. 잔여작업 상세 (우선순위순)

### P0 — 보안·안정성 (출시 전 보강, 평가 리포트 기반)

> 출처: `docs/assessments/2026-06-17-service-evaluation.md`. 2026-06-19 코드 대조 시 전부 미반영 확인. 별도 plan 문서 없이 본 절에서 추적하며, 착수 시 해당 file:line 을 평가 리포트에서 확인한다.

**Sprint 1 — 보안 마감 (5건):**
1. ✅ **OAuth 콜백 JWT URL 토큰 제거** (완료) — `?token=` 평문 전달을 **일회용 code 교환**으로 대체. API가 일회용 코드(Redis TTL 60s, 1회 소비)를 `?code=`로 전달 → 웹이 서버사이드로 `POST /auth/discord/exchange` 하여 JWT 수령·httpOnly 쿠키 set. JWT가 URL/로그/Referer에 노출되지 않음. 테스트 45건(BE 22+Web 23, 보안 회귀 케이스 포함).
2. ✅ **Redis graceful wrapper** (완료 — PR #75, `753a2ef`) — `redis.service.ts` 22개 메서드 `safe()` try/catch 래핑. Redis 다운 시 throw 대신 안전 기본값+로깅. 테스트 52건.
3. ✅ **웹 프록시 PII 평문 로깅 제거** (완료) — `api/guilds/[...path]/route.ts` 의 요청/응답 본문(userId·닉네임) `console.warn` 2줄을 제거(조건부 가드 대신 완전 제거 — NODE_ENV 오설정 재유출 차단). 연결 실패 `console.error`(본문 미포함)는 유지. 회귀 가드 테스트 30건.
4. **rate limit per-route** — 현재 전역 60/분만(throttle 봇제외·X-Real-IP 는 적용 완료). auth 20/분·analytics 10/분 per-route 정책 적용.
5. **`returnTo` open-redirect 검증** — `auth/callback` 에서 쿠키 `returnTo` 무검증 redirect. 상대경로(`/`)만 허용 + `//` 차단.

**추가 보안(Med):** 봇 API 키 `bot-api-auth.guard.ts:30` `!==` → `crypto.timingSafeEqual`.

**Sprint 2 — 복원력 (5건):**
1. **크론 분산락+시간분산** — 자정 KST 크론 4종(inactive/mission/moco/newbie) 동시폭주, overlap guard 전무.
2. **voice 세션 원자성** — read-modify-write 비원자 → 연속 이벤트 인터리브 시 duration 손실. Lua/큐로 원자화.
3. **co-presence 상태 영속화** — `co-presence.service.ts:34` 인메모리 Map → 재시작/스케일아웃 시 유실. Redis 해시/Sorted Set.
4. **mission N+1 배치화** — `mission.service.ts:171,205,240,674` 미션당 개별쿼리 → memberId 수집 후 IN절 일괄조회.
5. **다중 write 트랜잭션 경계** — `dataSource.transaction` 앱서비스 단 1곳. 다중 write 서비스(mission 등)에 도입 — `ddd-entity-separation` Phase 2~5 와 병행.

### P1 — 즉시 착수 권장 (복원력 + ops)

> 평가 Sprint 2(복원력 5건)가 P1 상단이다 — 위 §P0 Sprint 2 참조. 아래는 plan 기반 P1.

#### P1-1. `lightsail-account-migration.md` (0%, ops)

- 신규 AWS 계정으로의 Lightsail 마이그레이션 계획. 방금 작성된 신규 ops 계획이며 **실행 0%**.
- ops 트랙 — 배포/인프라 변경 포함. destructive 단계(계정 전환·DNS·데이터 이전)는 HITL 확인 필수.

### P2 — 후속 정리

#### P2-1. `eslint-warning-elimination.md` (~25%)

- ESLint 경고 제거. Phase 1(설정/측정)은 진행됐고, **Phase 2~6 코드수정이 잔여**.
- 병행 가능 — 도메인 기능 작업과 충돌 적음. 파일군 단위로 분할하여 순차 처리 권장. (보안·안정성 P0/P1 보다 후순위)

#### P2-2. `codebase-commonization.md` (~50%)

- 코드 통합/공통화. canvas 공통모듈은 이번 사이클에 `canvas-common-module` 로 분리 완료됐다.
- **잔여: newbie 레거시 폴더 정리 + `JwtUser` 타입 통합.**

#### P2-3. `ddd-entity-separation.md` (~60%)

- DDD 스타일 엔티티 분리 (도메인 엔티티 ↔ ORM 엔티티 분리). Phase 1은 완료, **Phase 2~5 잔여**.
- Schema 영역 변경 — 마이그레이션 동반 가능성. DB 파괴적 변경 시 HITL.
- **평가 Sprint 2의 다중 write 트랜잭션 경계 + Sprint 3 persistence 표준화와 겹침** — 병행 추진.

### P3 — 전략 결정 선행

#### P3-1. `premium-service-architecture.md` Phase 4~5 (미착수)

- Phase 1~3(Bot/API 분리)은 완료. **Phase 4(레포 분리) + Phase 5(구독=유료화) 미착수.**
- **`repo-separation.md` 와 동일 사안** — 통합 추진 권장. 착수 전 사업 전략 결정 필요.

#### P3-2. `repo-separation.md` (~40%)

- Public/Private 레포 분리. **mirror 자동화 스크립트/.yml + Public 레포 생성 미완.**
- **premium Phase 4 와 통합**하여 단일 트랙으로 추진 권장.

#### P3-3. `trend-driven-feature-roadmap.md` (결정 대기)

- 트렌드 기반 기능 로드맵. **구현 plan 이 아니라 채택 여부 결정이 필요한 로드맵 문서.**
- 의사결정 후 개별 기능 plan 으로 분할.

### 유지보류 — 실질 완료, 안전상 아카이브 보류

#### `user-privacy-module.md` / `web-privacy-settings.md`

- 프라이버시 모듈 코어는 완료됐다. 미완으로 보였던 **bot-api privacy / 길드 co-presence 설정은 친밀도 단순화(simplify) 결정으로 의도적 폐기**됐다.
- 따라서 실질적으로 완료 상태지만, 폐기 범위 재확인 전까지 **안전상 아카이브 이동을 보류**한다. 별도 확인 후 archive 이동 판단.

---

## 3. 권장 실행 순서

```
[P0] 출시 전 보안 마감 (평가 Sprint 1)
  0a. ✅ Redis graceful wrapper         — 완료 (PR #75)
  0b. ✅ OAuth 콜백 JWT URL 토큰 제거    — 완료 (일회용 code 교환)
  0c. ✅ 웹 프록시 PII 로깅 제거          — 완료
  0d. rate limit per-route + returnTo 검증 + 봇키 timing-safe (다음)
[P1] 복원력 (평가 Sprint 2) + ops
  1a. 크론 분산락 / voice 세션 원자성 / co-presence 영속화 / mission N+1 / 트랜잭션 경계
  1b. lightsail-account-migration       — ops 트랙, destructive 단계 HITL
[P2] 품질·구조
  2a. eslint-warning-elimination Phase 2~6
  2b. codebase-commonization (newbie 레거시·JwtUser)
  2c. ddd-entity-separation Phase 2~5   — 트랜잭션 경계·persistence 표준화 병행, 마이그레이션 시 HITL
[P3] 전략·확장성
  3a. premium Phase4 + repo-separation 전략 결정 → 통합 추진
  3b. web TanStack Query 도입 (평가 Sprint 3)
  3c. trend-driven-feature-roadmap 채택 결정
[보류] user-privacy-module / web-privacy-settings 폐기범위 확인 후 archive 판단
```

---

## 4. 이번 사이클 완료 항목 (archive 이동 완료)

> `docs/plans/archive/` 로 이동 완료 = 완료 처리. 추적 종료.

| plan | 완료 내용 | 완료(추정) |
|---|---|---|
| `co-presence-best-friend-backend` | 친밀도 백엔드 (단순화 정책 적용) | 2026-05~06 |
| `simplify-friend-commands-api` | 친밀도 API 단순화 (affinity·길드토글 제거) | 2026-05~06 |
| `simplify-friend-commands-bot` | `/best-friend` 봇 커맨드 단순화 | 2026-05~06 |
| `simplify-friend-commands-web` | 웹 친밀도 단순화 | 2026-05~06 |
| `weekly-report-co-presence` | 주간리포트 친밀도 섹션 | 2026-05~06 |
| `canvas-common-module` | canvas 공통모듈 추출 | 2026-04~05 |
| `test-coverage-improvement` | 단위 28파일/통합 24파일, 0% 도메인 11→2 | 2026-04~05 |
| `inactive-member-grade-tab-backend` | 비활동 회원 등급탭 BE + decreaseRate 정렬 | 2026-04~05 |
| `inactive-member-grade-tab-frontend` | 비활동 회원 등급탭 FE | 2026-04~05 |
| `newbie-mission-use-mic-time-backend` | 신입 미션 마이크시간 집계 옵션 BE | 2026-04~05 |
| `newbie-mission-use-mic-time-frontend` | 신입 미션 마이크시간 집계 옵션 FE | 2026-04~05 |
| `best-friend-discord-feature` | 베스트프렌드 원설계 (simplify 로 대체) | 2026-05 (대체) |
| `bot-friend-commands` | 봇 친구 커맨드 원설계 (simplify 로 대체) | 2026-05 (대체) |

> 직전(2026-03-20) 갱신에서 이미 완료 확인된 항목(아키텍처 분리 A-1~A-6, 페이지 플랜 B-1~B-10, LLM 추상화, bot-api-gap-fix 등)은 본 문서에서 추적 종료했다. 상세 이력은 git history 및 `docs/plans/archive/` 참조.

---

## manifest 갱신 필요 — 없음

본 작업은 `docs/plans/remaining-work-master-plan.md` 단일 문서의 현행화이며, 코드 표면적·도메인 status·`code.*` 경로 변경이 없다. `docs/specs/feature-manifest.json` 갱신 불필요.
