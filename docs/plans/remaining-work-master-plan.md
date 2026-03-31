# 남은 작업 종합 계획 (Master Plan)

> 작성일: 2026-03-17
> 최종 갱신: 2026-03-20
> 기준: develop 브랜치 최신 커밋

---

## 현재 상태 요약

### Bot/API 분리 진행 현황 — ✅ 완료 (2026-03-20 확인)

| 항목 | 수량 | 상태 |
|------|------|------|
| 슬래시 커맨드 (`@Command`) | 14개 | ✅ Bot 이동 완료, API 원본 전부 삭제됨 |
| `@On` 이벤트 핸들러 | 0개 | ✅ API에서 모두 제거, Bot으로 이동 완료 |
| `@InjectDiscordClient` adapter | 0개 | ✅ DiscordRestService (REST API 기반)로 전환 완료 |
| `DiscordModule.forRootAsync()` | 0개 | ✅ API app.module.ts에서 제거 완료 (Bot에만 유지) |
| Bot 이벤트 핸들러 | 7개 | voice, newbie(2), sticky-message, channel, status-prefix, auto-channel |
| Bot 슬래시 커맨드 | 16개 | version, voice-flush, music(5), sticky(3), voice-analytics(5), me |
| Bot 스케줄러 | 2개 | co-presence, monitoring (Bot으로 이동 완료) |
| bot-api 엔드포인트 | ~20개 | voice, newbie, sticky-message, voice-analytics, me, auto-channel, status-prefix, co-presence, monitoring |

---

## 작업 카테고리별 분류

### A. Bot/API 분리 완성 (아키텍처) — ✅ 전체 완료 (2026-03-20 확인)

모든 단계가 완료되었다. 채택된 전략: **Discord REST API 직접 호출 (전략 2)**.

#### A-1. API 슬래시 커맨드 파일 삭제 — ✅ 완료

API에서 모든 슬래시 커맨드 파일 삭제됨. 모듈에서 provider 등록 해제됨.

#### A-2. AutoChannel/StatusPrefix 인터랙션 Bot 이동 — ✅ 완료

- **AutoChannel**: Bot에서 인터랙션 수신 → API `POST /bot-api/auto-channel/button-click`, `sub-option`으로 위임
- **StatusPrefix**: Bot에서 인터랙션 수신 → API `POST /bot-api/status-prefix/apply`, `reset`으로 위임 + Bot에서 `member.setNickname()` 직접 호출
- API의 `@On('interactionCreate')` 핸들러 모두 제거됨

#### A-3. Discord Adapter → REST API 전환 — ✅ 완료

`DiscordRestService`로 전환 완료. API의 모든 Discord 작업이 REST API 기반으로 동작.
- `@InjectDiscordClient` 사용 0개 (API)
- `DiscordRestModule` 도입으로 Gateway 의존성 완전 제거

#### A-4. CoPresence/Monitoring 스케줄러 Bot 이동 — ✅ 완료

- `BotCoPresenceScheduler`: Bot에서 60초 폴링 → API에 스냅샷 전달
- `BotMonitoringScheduler`: Bot에서 60초 폴링 → API에 메트릭 전달
- API의 CoPresenceScheduler는 세션 정리만 담당 (tick 로직은 Bot으로 이관됨)

#### A-5. GuildInfoController Discord 의존 제거 — ✅ 완료

`DiscordRestService` 주입으로 전환. `@InjectDiscordClient` 제거됨.

#### A-6. DiscordModule.forRootAsync() 최종 제거 — ✅ 완료

API `app.module.ts`에서 `DiscordModule` 완전 제거됨. Bot에서만 유지.

---

### B. 기능 구현 — 페이지 플랜 (미구현)

#### B-1. 프론트엔드 UI 개선 (독립)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 1 | `1-channel-bar-chart-category-tab` | ChannelBarChart 카테고리별 탭 | 없음 |
| 2 | `2-user-channel-pie-chart-category-tab` | UserChannelPieChart 카테고리별 탭 | 없음 |
| 3 | `3-user-history-table-category-column` | UserHistoryTable 카테고리 컬럼 | K-voice-category 완료 필요 |

#### B-2. 일반 설정 (독립)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 4 | `1-general-backend` | 슬래시 커맨드 자동 등록 | 없음 |
| 5 | `2-general-frontend` | 일반설정 페이지 동적 렌더링 | 4 |

#### B-3. 비활동 회원 (프론트엔드만)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 6 | `2-inactive-member-frontend` | 비활동 회원 웹 UI | 백엔드 완료됨 |

#### B-4. 신입 시스템 (대규모 — 6 유닛)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 7 | `2-newbie-welcome` | 환영인사 기능 (Unit B) | 1-newbie-core ✅ |
| 8 | `4-newbie-moco` | 모코코 사냥 (Unit D) | 3-newbie-mission ✅ |
| 9 | `5-newbie-role` | 신입기간 역할 관리 (Unit E) | 4-newbie-moco |
| 10 | `6-newbie-web` | 신입 웹 대시보드 (Unit F) | 5-newbie-role |
| 11 | `13-newbie-play-count-backend` | 플레이횟수 카운팅 (BE) | 3-newbie-mission ✅ |
| 12 | `14-newbie-play-count-frontend` | 플레이횟수 카운팅 (FE) | 11 |

#### B-5. 상태 접두사 (프론트엔드만)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 13 | `8-status-prefix-interaction` | 인터랙션 (Unit B) | 7-core ✅ |
| 14 | `9-status-prefix-web` | 웹 설정 (Unit C) | 13 |

#### B-6. 자동방 (4 유닛)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 15 | `A-trigger-waiting` | 트리거 + 대기방 (Unit A) | 없음 |
| 16 | `B-button-interaction` | 버튼 인터랙션 (Unit B) | 15 |
| 17 | `C-channel-delete` | 채널 삭제 (Unit C) | 16 |
| 18 | `D-web-api-bootstrap` | 웹 설정 API (Unit D) | 17 |

#### B-7. 고정메세지 (프론트엔드만)

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 19 | `F-sticky-message-web` | 고정메세지 웹 설정 | 백엔드/커맨드 ✅ |

#### B-8. 음성 관련

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 20 | `E-voice-commands` | Voice 커맨드 확장 | 없음 |
| 21 | `G-voice-excluded-channel-backend` | 제외 채널 (BE) | 없음 |
| 22 | `H-voice-settings-web` | 음성 설정 (FE) | 21 |
| 23 | `K-voice-category` | 카테고리 정보 추가 | 없음 (일부 완료) |
| 24 | `L-voice-analytics-improvement` | AI 분석 모듈 개선 | 없음 |

#### B-9. 유저 상세

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 25 | `J-user-detail-backend` | 유저 상세 API | I-voice-daily ✅ |
| 26 | `J-user-detail-frontend` | 유저 상세 UI | 25 |

#### B-10. 기타

| # | 플랜 | 설명 | 의존성 |
|---|------|------|--------|
| 27 | `I-auto-versioning` | 자동 시맨틱 버저닝 | 없음 |

---

### C. 아키텍처 리팩토링 (top-level 플랜)

| # | 플랜 | 상태 | 비고 |
|---|------|------|------|
| 1 | `premium-service-architecture.md` | Phase 1~3 완료, Bot/API 분리 완료 | Phase 4(레포 분리), 5(프리미엄) 남음 |
| 2 | `bot-api-responsibility-split.md` | 참조 문서 | 삭제 대상 아님 |
| 3 | `bot-api-gap-fix.md` | 완료 | voice/auto-channel/status-prefix/newbie 복구 |
| 4 | `codebase-commonization.md` | 미착수 | 코드 통합 |
| 5 | `eslint-quality-improvement.md` | 미착수 | ESLint 규칙 강화 |
| 6 | `eslint-warning-elimination.md` | 미착수 | 경고 제거 |
| 7 | `llm-abstraction-and-directory-move.md` | ✅ 완료 | LLM 추상화 (LlmProvider 인터페이스 + GeminiLlmProvider 분리, gemini/ → voice-analytics/ 이동) |
| 8 | `co-presence-analytics-backend.md` | 미착수 | 동시접속 분석 |
| 9 | `co-presence-dashboard-frontend.md` | 미착수 | 동시접속 대시보드 |
| 10 | `hhi-diversity-score-ux.md` | 미착수 | HHI 다양성 점수 UX |
| 11 | `self-diagnosis-badge-and-settings.md` | 미착수 | 자가진단 뱃지/설정 |
| 12 | `self-diagnosis-core.md` | 미착수 | 자가진단 코어 |
| 13 | `sidebar-settings-adjustment.md` | 미착수 | 사이드바 설정 |
| 14 | `overview-page.md` | 미착수 | 개요 페이지 |
| 15 | `voice-co-presence-refactoring.md` | 미착수 | CoPresence 리팩토링 |

---

## 권장 실행 순서

### Phase 즉시 (Bot/API 정리) — ✅ 전체 완료 (2026-03-20 확인)

```
1. API 슬래시 커맨드 14개 파일 삭제 + 모듈 정리          [A-1] ✅ 완료
2. StatusPrefix @On 핸들러 API에서 제거                  [A-2] ✅ 완료
3. discord.config.ts commands 배열 정리                  [B-2.4] ✅ 완료 (commands 배열 없음 — 자동 등록 구조)
```

### Phase 단기 (독립 기능) — 전체 완료 (2026-03-17 확인)

```
4. 프론트엔드 UI 3종 (차트 탭, 테이블 카테고리)            [B-1] ✅ 이미 구현됨
5. 비활동 회원 프론트엔드                                 [B-3] ✅ 이미 구현됨
6. 고정메세지 웹 설정                                     [B-7] ✅ 이미 구현됨
7. K-voice-category 완성                                 [B-8.23] ✅ 이미 구현됨
8. 유저 상세 페이지 (BE + FE)                             [B-9] ✅ 이미 구현됨
```

### Phase 중기 (도메인 기능) — 전체 완료 (2026-03-17 확인)

```
9.  환영인사 (Unit B)                                    [B-4.7]  ✅ 이미 구현됨
10. 모코코 사냥 (Unit D)                                 [B-4.8]  ✅ 이미 구현됨
11. 신입기간 역할 (Unit E)                               [B-4.9]  ✅ 이미 구현됨
12. 신입 웹 대시보드 (Unit F)                             [B-4.10] ✅ 이미 구현됨
13. 상태 접두사 인터랙션 + 웹                             [B-5]    ✅ 이미 구현됨
14. 자동방 4유닛 (A→D)                                   [B-6]    ✅ 이미 구현됨
15. 음성 설정 (제외채널 BE + 설정 FE)                     [B-8.21-22] ✅ 이미 구현됨
```

### Phase 장기 (아키텍처) — A-2~A-6 완료, Phase 4~5 미착수

```
16. AutoChannel 인터랙션 Bot 이동                        [A-2] ✅ 완료
17. Discord Adapter → REST API 전환                      [A-3] ✅ 완료 (DiscordRestService 도입)
18. CoPresence/Monitoring 스케줄러 Bot 이동              [A-4] ✅ 완료
19. GuildInfoController Discord 제거                      [A-5] ✅ 완료
20. DiscordModule.forRootAsync() 최종 제거                [A-6] ✅ 완료
21. Public/Private 레포 분리                              [Phase 4]
22. 프리미엄 기능 인프라                                   [Phase 5]
```

### Phase 품질 (병행 가능)

```
23. ESLint 경고 제거                                      [C.6]
24. LLM 추상화                                           [C.7] ✅ 완료
25. 코드 통합                                             [C.4]
26. AI 분석 개선                                          [B-8.24]
27. 자동 버저닝                                           [B-10.27]
```
