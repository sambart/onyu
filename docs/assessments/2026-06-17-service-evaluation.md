# Onyu 서비스 전반 평가 리포트

> 작성일: 2026-06-17 · 방식: read-only 평가 5종 병렬 (코드품질·아키텍처 / 보안·인증 / 성능·안정성 / 제품·완성도) → 메인 세션 종합
> 범위: `apps/api` · `apps/bot` · `apps/web` · `libs/*` · 인프라 설정

---

## 종합 평가: **7.0 / 10**

| 영역 | 점수 | 한 줄 요약 |
|---|---|---|
| API 코드품질·아키텍처 | 7.5 | DDD 레이어링·타입안전성 견고, 트랜잭션 경계·persistence 일관성이 부채 |
| Bot 코드품질 | 7.5 | 데코레이터 일관성·리소스 관리 양호, SDK 재시도 부재 |
| Web 코드품질 | 6.5 | 타입·API 표준화 우수, **서버 상태관리(TanStack Query) 부재**가 구조적 약점 |
| 보안·인증 | 6.5 | 인증 골격·IDOR 방어 양호, **OAuth 콜백 JWT를 URL로 전달**(High) |
| 성능·안정성 | 6.5 | 인덱스·Gemini resilience 우수, **Redis 장애 무방비·인메모리 상태·크론 동시폭주** |
| 제품·기능 완성도 | 8.5 | 14개 도메인 전부 end-to-end 구현, 출시 차단급 갭 없음 |

**총평**: 기능 완성도가 매우 높고(8.5) 타입 안전성·아키텍처 기본기가 탄탄한 성숙한 서비스다. 소규모~중규모 길드 운영에는 충분히 견고하다. 다만 **운영 보안 마감**(URL 토큰 노출)과 **장애 복원력**(Redis 단일 장애점, 인메모리 단일프로세스 상태)에서 출시 전 보강이 필요한 항목이 명확하다. 대규모/다중 인스턴스 스케일아웃을 가정하면 상태 관리 재설계가 선행돼야 한다.

---

## 🔴 즉시 조치 권장 (출시 전 / High)

1. **OAuth 콜백 JWT의 URL 쿼리 전달 제거** — `apps/api/src/auth/presentation/auth.controller.ts:26` 가 `?token=` 으로 JWT 전달 → nginx access_log·브라우저 히스토리·Referer 에 평문 세션 토큰 노출. API가 직접 httpOnly 쿠키 set 또는 code-exchange 방식으로 전환. (세션 하이재킹 → 길드 설정 변경·멤버 추방까지 가능)
2. **Redis graceful wrapper** — `apps/api/src/redis/redis.service.ts` try/catch 부재 → Redis 다운 시 **음성 추적(핵심 기능) 전면 throw**. 안전 기본값+로깅으로 단일 장애점 제거. (단일 파일, 최고 ROI)
3. **웹 프록시 본문 평문 로깅 제거** — `apps/web/app/api/guilds/[...path]/route.ts:53,60` 가 모든 프록시 호출의 요청/응답 본문(디스코드 userId·닉네임 등 PII)을 `console.warn` 무조건 출력. 디버그 가드 또는 제거.

---

## 영역별 상세

### 1. API 코드품질·아키텍처 — 7.5/10

**강점**
- 타입 안전성 거의 모범: 서비스 50파일 중 `as` 단언 0건, 비-spec `any` 1건(napi-rs, 사유 주석)
- 중앙집중 예외 처리: `AllExceptionsFilter` + `DomainExceptionFilter` 2개 전역 필터, HTTP-무관 순수 `DomainException`
- `error.util.ts` 의 `getErrorMessage`/`getErrorStack` 으로 catch 가드 구조적 강제, 빈 catch 0건
- DTO + class-validator 일관 적용

**약점·리스크**
| 심각도 | 항목 | 근거 |
|---|---|---|
| High | 트랜잭션 경계 부재 | `dataSource.transaction` 앱 서비스 전체 **단 1곳**(`voice-channel-history.service.ts:32`). 다중 write 서비스(mission 등) 부분 실패 시 정합성 손상 |
| Med | 모듈 순환 의존 | Voice↔VoiceAnalytics↔CoPresence 3각 순환을 `forwardRef` 봉합 |
| Med | Persistence 추상화 불일치 | repository 클래스 vs raw `@InjectRepository`(16서비스/28건) 혼용. `mission.service.ts:50-53` 타 도메인 엔티티 직접 주입 |
| Med | Controller→Repository 직접 호출 | 8컨트롤러/32건 레이어 누수 |
| Med | god service | `mission.service.ts` 889줄(의존성 11개), `auto-channel.service.ts` 836줄 |

**Top 액션**: ① 다중 write에 트랜잭션 도입 ② persistence 단일 패턴 표준화 ③ controller→repo 직접 호출 제거 ④ 순환 의존 이벤트 기반 단방향화 ⑤ god service 분해

### 2. Bot 코드품질 — 7.5/10

**강점**: 데코레이터 100% 일관(`@Command`/`@Handler`/`@On`), SDK 단일 진입점(`bot-api-client`, 10초 타임아웃+Bearer), `clearInterval`/`onApplicationShutdown` 리소스 관리, interaction defer 14/14 준수

**약점**
- [High] API 클라이언트 재시도 부재(`bot-api-client.service.ts:267-295`) → 호출자가 수동 재시도 구현
- [High] `as GuildMember` 단언 + null 미확인(`me.command.ts:27-28` 등) → NPE 위험
- [Med] `response.components as any` eslint-disable 우회, 스케줄러 `Promise.all`(→`allSettled` 권장)

**Top 액션**: SDK 공통 재시도(backoff) · `getGuildMember` null-safe 헬퍼 · ActionRow 타입 정의 · 스케줄러 allSettled

### 3. Web 코드품질 — 6.5/10

**강점**: `ApiError`+`apiClient` 표준화(11도메인), 프로덕션 `any` 0, strict 모드, middleware 인증/로케일 분리, Vitest ~29파일, aria/role ~106개

**약점**
- [High] **TanStack Query/SWR 부재(확인됨)** — 전 페이지 `useState+useEffect+fetch`, 캐싱·중복제거·취소 부재 (가장 심각한 단일 이슈)
- [High] 프록시 본문 전수 로깅(위 즉시조치 #3)
- [Med] 대시보드 layout `'use client'` 강제 + 인증 중복, prop drilling(테이블 6 props)

> 정정: 선행 평가의 `as` 141개·X-Real-IP 검증부재는 검증 결과 과장/오탐(실측 ~57개 대부분 양성; X-Real-IP는 nginx 덮어쓰기 전제로 의도된 설계).

**Top 액션**: TanStack Query 점진 도입 · 프록시 로깅 제거 · layout 서버 컴포넌트화 · prop drilling→Context · error.tsx i18n

### 4. 보안·인증 — 6.5/10

**강점**: IDOR 방어 우수(userId를 JWT에서 도출), SQL injection 안전(파라미터 바인딩), 쿠키 httpOnly/secure/sameSite, 시크릿 하드코딩 없음·미커밋, 전역 ValidationPipe+helmet+CORS, throttle X-Real-IP 보정 타당

**취약점**
| 심각도 | 항목 | 위치 |
|---|---|---|
| **High** | OAuth 콜백 JWT를 URL 쿼리로 전달 | `auth.controller.ts:26` (위 즉시조치 #1) |
| Med | 봇→API 키 비교 non-timing-safe | `bot-api-auth.guard.ts:30` (`!==`) → `crypto.timingSafeEqual` |
| Med | throttle 봇 제외 후 bot-api 방어가 단일 정적 키 의존 | IP allowlist 권장 |
| Med | 세션 무효화·리프레시 토큰 부재 | 탈취 토큰 1h 유효, 권한 회수 미반영 |
| Med | Open Redirect — `returnTo` 미검증 | `auth/discord/route.ts`, `auth/callback/route.ts` |
| Low | 프록시 PII 로깅 / GuildMembershipGuard fail-open / JwtAuthGuard 수동적용(18개) | — |

**미점검(한계)**: apps/bot 시크릿 취급, JWT_SECRET 엔트로피, OAuth state(CSRF), Gemini 프롬프트 인젝션, raw SQL 전수(표본만)

### 5. 성능·안정성 — 6.5/10

**강점**: 인덱스 53개/30엔티티 partial+복합 설계 우수(커버리지 ~95%), Gemini resilience 모범(timeout+retry+circuit breaker+fallback), co-presence 배치 집계 N+1 회피, Discord REST timeout/retry

**병목·리스크**
| 심각도 | 항목 | 위치 |
|---|---|---|
| High | mission N+1 (미션당 2~3쿼리) | `mission.service.ts:172,206,241,406,674` |
| High | Redis 장애=음성추적 전면중단+데이터손실 | `redis.service.ts` (위 즉시조치 #2) |
| High | co-presence 인메모리 단일프로세스 상태 | `co-presence.service.ts:34` — 재시작/스케일아웃 시 유실 |
| High | voice 세션 read-modify-write 비원자성 | 동일 유저 연속 이벤트 인터리브 시 duration 손실 |
| High | 자정 KST 크론 4종 동시폭주, overlap guard 전무 | inactive/mission/moco/newbie |
| Med | 주간리포트·inactive 전 레코드 메모리 적재, Redis 키 TTL 미설정 3계열 | — |

**Top 액션**: ① Redis graceful wrapper ② mission N+1 IN절 배치화 ③ 크론 분산락+시간분산 ④ voice 세션 원자성(Lua/큐) ⑤ 누적 Redis 키 TTL safety-net

### 6. 제품·기능 완성도 — 8.5/10

**출시 차단급 갭 없음.** 14개 도메인 전부 `code.*` 실재 + `implemented` status 일치, entrypoint→service→persistence→UI end-to-end 연결.

**완성도 높은 도메인**: voice/auto-channel, voice-co-presence(`/best-friend` Canvas+sigma.js 대시보드), status-prefix, sticky-message, monitoring(Prometheus/Grafana/Loki), guild-member, user-privacy

**약한 영역**
1. API rate limit per-route 정책 미적용 추정 (PRD: auth 20/분·analytics 10/분, 현재 전역 60/분만)
2. 슬래시 커맨드 자동등록(ExplorerService) 방식 미검증 → 신규 커맨드 누락 리스크
3. 웹 빈 상태(empty state) UX 페이지별 불일치 → 신규 서버 첫인상
4. gemini 주간리포트 비교·LLM 타임아웃 fallback 통합 검증 필요

---

## 권장 로드맵

**Sprint 1 (출시 전, 보안·안정성)**: OAuth URL 토큰 제거 · Redis graceful wrapper · 프록시 PII 로깅 제거 · rate limit per-route 적용 · `returnTo` open-redirect 검증

**Sprint 2 (복원력)**: 크론 분산락+시간분산 · voice 세션 원자성 · co-presence 상태 영속화 검토 · 다중 write 트랜잭션 경계 · mission N+1 배치화

**Sprint 3 (품질·확장성)**: web TanStack Query 도입 · persistence 패턴 표준화 · god service 분해 · 순환 의존 해소 · bot SDK 재시도 · 빈 상태 UX 표준화

---

> 본 리포트는 read-only 정적 분석 기반이다. nginx 런타임 설정·운영 `.env`·실제 부하 프로파일은 미접근이라 일부 항목(X-Real-IP 강제·JWT 키 강도·실측 쿼리 수)은 추정을 포함한다. 코드 인용 file:line 은 평가 시점(2026-06-17, develop 브랜치) 기준.
