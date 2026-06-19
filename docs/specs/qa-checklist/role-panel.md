# QA Checklist — role-panel (역할 패널, L 규모)

> 입력 종합: PRD `role-panel.md` + usecase UC-01~05 + endpoint-spec(1.1~1.7, §4 권한) + edge-cases(EC-RP-01~31) + 3 plan(api/bot/web).
> Phase 6 `tester`(api/bot) · `fe-tester`(web) · (조건부) `e2e-checker` 입력. 우선순위 **P0(출시 전 필수) > P1 > P2**.
> 각 항목: `[ ] **P0** (담당) 내용` — 담당 레이어 ∈ **api / bot / web / e2e**. edge-cases 의 P0 17건은 모두 포함.
> 마커: 🔒 권한·정책 결정완료(2026-06-19 확정) / 🟨 가정(구현 시 확정). **🔴 결정대기 없음**(권한 정책 확정). exclusive(택1) 모드는 MVP 제외 → 본 체크리스트 범위 밖.

---

## A. 웹 관리자 — 패널 CRUD / 게시 (web)

### A-1. 패널 목록 / 탭 (UC-01 Phase 1, F-ROLE-PANEL-001)

- [ ] **P0** (web) 패널 0개 길드 진입 → 빈 상태(빈 탭 1개 `EMPTY_PANEL`) 렌더, "새 패널" CTA 노출 (EC-RP-30b)
- [ ] **P1** (web) 패널 N개 길드 → 탭 바에 패널별 탭 + [새 패널 +] 렌더, 탭 전환 시 해당 패널 폼 로드
- [ ] **P1** (web) `selectedGuildId` 없음 / 로딩 중 → placeholder / Loader2 처리 (auto-channel 컨벤션)
- [ ] **P2** (web) 패널 상세(1.2 GET) 단건 로드 — 편집 폼에 기존 값(name/channel/embed/buttons) 정확히 매핑

### A-2. 패널 생성 / 수정 / 삭제 (UC-01 Phase 2, UC-02, UC-03)

- [ ] **P0** (web) 신규 패널 저장(`tab.id===undefined`) → POST 1.3, 응답 `id` 탭 주입, saveSuccess 3초 표시
- [ ] **P0** (web) 기존 패널 저장(`tab.id` 존재) → PUT 1.4, 탭 갱신(messageId/published 반영), saveSuccess
- [ ] **P1** (web) 패널 이름 미입력 저장 → 클라이언트 차단 + `validationName` 인라인 에러 (API 도달 전)
- [ ] **P1** (web) 탭 X(삭제) → `window.confirm` → DELETE 1.5 → 탭 제거(auto-channel handleDeleteTab 패턴)
- [ ] **P1** (web) 삭제 API 실패 → alert/에러 표시, 탭 유지

### A-3. Embed 작성 (PRD F-WEB-001 Embed 설정)

- [ ] **P1** (web) Embed 제목/설명(멀티라인) 입력 → PreviewPanel 실시간 반영
- [ ] **P1** (web) 색상 컬러 피커 → 항상 유효 `#RRGGBB` 생성, HEX 텍스트 직접 입력 시 패턴 검증 (EC-RP-02)
- [ ] **P2** (web) 설명에 GuildEmojiPicker 삽입 → 미리보기/저장에 이모지 반영

### A-4. 버튼 추가 / 편집 / 정렬 (PRD 버튼 카드, UC-01 단계 6)

- [ ] **P0** (web) 버튼 0개 상태 저장 시도 → 클라이언트 차단(`buttons.length===0` → saveError), API 미도달 (EC-RP-03)
- [ ] **P0** (web) 버튼 25개 도달 → ButtonCardGrid [버튼 추가] 숨김 + 안내, 26번째 추가 불가 (EC-RP-04)
- [ ] **P1** (web) ButtonEditModal — 라벨/이모지/역할/모드/스타일 입력 → onSave draft 반영
- [ ] **P1** (web) 라벨 `maxLength={80}` — 80자 초과 입력 불가 (EC-RP-01)
- [ ] **P1** (web) 버튼 카드 위/아래 화살표 → sortOrder 재배치, 미리보기 순서 반영 🟨
- [ ] **P1** (web) 버튼 카드 렌더 — 역할명 + 모드 뱃지(GRANT/TOGGLE) + 스타일 색 점 표시
- [ ] **P2** (web) ModeSelector(GRANT/TOGGLE) · StyleSelector(4택) 선택 시 활성 스타일 토글 + onChange

### A-5. 채널 선택 / 미리보기 (PRD 기본정보 · 미리보기)

- [ ] **P1** (web) 대상 채널 드롭다운 — `fetchGuildChannels` textChannels 만 노출, 미선택 저장 허용(초안)
- [ ] **P1** (web) PreviewPanel — Embed(제목/설명/색) + 버튼 스타일 색(PRIMARY/SECONDARY/SUCCESS/DANGER) Discord 스타일 렌더
- [ ] **P2** (web) 행당 5버튼 미리보기 줄바꿈 — 표시 제약만, 저장 데이터 무영향 🟨

### A-6. 게시 / 재동기화 (UC-01 Phase 3, UC-02 AF-01, F-ROLE-PANEL-005)

- [ ] **P0** (web) 게시 버튼 → (미저장 시 선저장 후) publish 1.6 → published=true·messageId 반영, "게시되었습니다" 토스트
- [ ] **P0** (web) 게시 시 channelId 미선택 → 게시 버튼 비활성 또는 차단 + 유도 안내 (EC-RP-05, `validationChannelRequiredToPublish`)
- [ ] **P1** (web) published 패널 수정(PUT) → API 가 자동 재동기화(edit) 수행, 웹은 별도 publish 재호출 없이 PUT 응답으로 탭 갱신 (UC-02 AF-01)
- [ ] **P1** (web) 게시 중 버튼 disable + 로딩 인디케이터 — 중복 클릭 1차 방어 (EC-RP-18)
- [ ] **P1** (web) 게시 응답 shape(`RolePanelDto` vs `{ok,messageId}`) 양쪽 안전 파싱(messageId/published 추출) 🟨

---

## B. 웹 — 역할 선택 가드 (web, 🔒 권한 정책 §5 RolePicker)

> 2중 방어선: UI 비활성(UX) + API 재검증(fail-closed). 본 그룹은 UI 사전 비활성, 그룹 D 가 API 재검증.

- [ ] **P0** (web) `assignable=true` 역할 → RolePicker 정상 선택 가능
- [ ] **P0** (web) `disabledReason=HIGHER_THAN_BOT` → 비활성 + "봇 역할보다 높아 부여 불가" 사유 (EC-RP-09)
- [ ] **P0** (web) `disabledReason=MANAGED` → 비활성 + "연동 역할은 매핑 불가" 사유 (EC-RP-10)
- [ ] **P0** (web) `disabledReason=EVERYONE` → 비활성 + "@everyone은 매핑 불가" 사유(또는 목록 제외 🟨) (EC-RP-10)
- [ ] **P0** (web) `disabledReason=ADMINISTRATOR` → 🔒 비활성 + "관리자 권한 역할은 매핑할 수 없습니다" 사유 표기 (EC-RP-11)
- [ ] **P1** (web) 이미 매핑된 역할이 이후 부여불가(stale)로 바뀜 → 경고 표시 + 저장 시 API 차단 위임
- [ ] **P0** (web) 저장 시 API **400**(부여불가 역할/버튼 0/25/DTO) → `ApiError.message` 를 saveError 폼 에러로 표시 (EC-RP-03/04/09/10)
- [ ] **P0** (web) 저장 시 API **403**(ADMINISTRATOR / 비운영 슈퍼관리자 mutation) → 차단 사유 표시 + read-only 안내 (EC-RP-11/12)
- [ ] **P1** (web) 게시 시 API **503**(봇 채널 권한 부족) → publishError 토스트 "봇이 채널 전송 권한 없음" (EC-RP-21)
- [ ] **P1** (web) 비운영 길드 슈퍼관리자(read-only) → mutation 응답 403 폼 에러 표시, read-only 배너(🟨 권장) (EC-RP-12)

---

## C. 봇 — GRANT 클릭 (bot, UC-04, F-ROLE-PANEL-006)

- [ ] **P0** (bot) 역할 미보유 + GRANT 클릭 → `roles.add(roleId)` 호출 → ephemeral "역할이 부여되었습니다." (`GRANTED`)
- [ ] **P0** (bot) 역할 이미 보유 + GRANT 클릭 → `roles.cache.has`=true → **add 미호출**(멱등) → ephemeral "이미 해당 역할을 보유하고 있습니다." (`ALREADY_HAS`, EC-RP-19)
- [ ] **P0** (bot) GRANT 빠른 연속 클릭 → 멱등(첫 클릭 후 add 미호출), 락 불필요(상태 단방향) (EC-RP-19)
- [ ] **P0** (bot) GRANT 응답은 `deferReply({ ephemeral:true })` → `editReply` 경로(본인만 노출)
- [ ] **P0** (bot) 인증 게이트 시나리오 — `규칙-rules` GRANT 버튼 클릭 → `정회원` 부여, 이미 정회원이면 무시 (PRD IA §4, UC-04)

---

## D. 봇 — TOGGLE 클릭 (bot, UC-05, F-ROLE-PANEL-007)

- [ ] **P0** (bot) 역할 미보유 + TOGGLE → `roles.add` → ephemeral "역할이 부여되었습니다." (`GRANTED`)
- [ ] **P0** (bot) 역할 보유 + TOGGLE → `roles.remove` → ephemeral "역할이 제거되었습니다." (`REMOVED`)
- [ ] **P0** (bot) TOGGLE 빠른 연속 클릭(50ms) → 인메모리 락(`{guildId}:{userId}:{buttonId}`) 첫 요청만 획득, 두 번째 → `LOCKED` "처리 중입니다…" (add/remove 미호출) (EC-RP-16)
- [ ] **P0** (bot) 락 해제 보장 — 정상은 finally 즉시 해제, 예외 시에도 try-finally 해제, `setTimeout(3s)` 안전망(데드락 방지) (EC-RP-16)
- [ ] **P1** (bot) 락 해제 후 동일 버튼 재클릭 → 정상 토글 성공 (락 재획득)
- [ ] **P0** (bot) TOGGLE 응답은 `deferReply({ ephemeral:true })` → `editReply` 경로
- [ ] **P2** (bot) 🟨 봇 단일 프로세스 가정 — 샤딩/다중 인스턴스면 인메모리 락 무효 → a-3(API 위임 락) 폴백 필요 (운영 토폴로지 확인)

---

## E. 봇 — 예외 (bot)

- [ ] **P0** (bot) 봇 Manage Roles 권한 없음(클릭 시) → REST 실패 캐치 → ephemeral "역할을 부여할 권한이 없습니다. 서버 관리자에게 문의하세요." (`NO_PERMISSION`, EC-RP-14)
- [ ] **P0** (bot) 봇 역할이 대상 역할 아래로 강등(클릭 시) → REST 위계 위반 거부 → EC-RP-14 와 동일 처리(ephemeral 오류 + 로그, TOGGLE 락 해제) (EC-RP-15)
- [ ] **P1** (bot) 대상 역할 삭제됨(Unknown Role 10011) → ephemeral "해당 역할을 찾을 수 없습니다." (`UNKNOWN_ROLE`) + 로그 (EC-RP-28)
- [ ] **P1** (bot) 패널/버튼 삭제됨 — 잔존 메시지 버튼 클릭 → DB/config 조회 부재 → ephemeral "역할 버튼 설정을 찾을 수 없습니다." (`NOT_FOUND`) (EC-RP-27)
- [ ] **P1** (bot) DM 컨텍스트(`interaction.guildId` 없음) → 봇 무시(return) — ephemeral 안내 아님(기존 핸들러 컨벤션) (UC-04 EX-06)
- [ ] **P0** (bot) Discord 3초 ack 초과 위험 → 수신 직후 `deferReply({ ephemeral:true })` → 처리 후 `editReply`/`followUp`, "인터랙션 실패" 방지 (EC-RP-24)
- [ ] **P1** (bot) customId 파싱 — 정상 `role_panel:3:12`→`{3,12}` / prefix 불일치·토큰 수 오류·NaN·음수 → null → ephemeral "잘못된 요청입니다." (`INVALID`)
- [ ] **P2** (bot) 비-button 인터랙션 / 비 `role_panel:` customId → return(무시) — 타 도메인 핸들러 공존

---

## F. 통합 / 인증 게이트 (e2e, 조건부 — cross-app)

> auth/cross-app 변경 → e2e-checker 조건부 실행. web→api→Discord(봇)→클릭→역할부여 전 구간.

- [ ] **P0** (e2e) UC-01 전 구간: 웹 생성·게시 → API 저장(published=false→true) → 봇 Discord 메시지 전송 → messageId DB 영속 → Discord 채널에 Embed+버튼 게시 확인
- [ ] **P0** (e2e) 인증 게이트(IA §4): GRANT+정회원 패널 게시 → 사용자 버튼 클릭 → 봇 interactionCreate → 정회원 부여 → ephemeral 확인 → 정회원 채널 접근 (PRD IA §4)
- [ ] **P0** (e2e) UC-02 재동기화: published 패널 수정(채널 동일) → API resync → 봇 `message.edit()` → messageId 유지(사용자가 보던 메시지 불변)
- [ ] **P1** (e2e) UC-02 채널 변경: published 패널 채널 변경 → 기존 채널 메시지 삭제 + 새 채널 신규 전송 → 새 messageId 갱신 (UC-02 AF-01)
- [ ] **P1** (e2e) UC-03 삭제: 패널 삭제 → API DB CASCADE 삭제 + 봇 Discord 메시지 삭제 → 목록에서 제거
- [ ] **P0** (e2e) 권한 경계: 비운영 길드 슈퍼관리자 GET 우회 통과 / non-GET(POST/PUT/DELETE/publish) → 403 fail-closed (EC-RP-12)

---

## G. 통합/인증 게이트 — API 권한·게이트 (api)

> 그룹 B(web UI 사전 차단)의 fail-closed 최종 방어선. EC-RP P0 권한 7건 전체.

- [ ] **P0** (api) 봇보다 위계 높은 역할 매핑 → POST/PUT 저장 시점 4.1 재검증 → **400** (EC-RP-09)
- [ ] **P0** (api) @everyone(`roleId===guildId`) / managed·tags 역할 매핑 → **400** (EC-RP-10)
- [ ] **P0** (api) ADMINISTRATOR 권한 역할 매핑(`permissions & 1<<3`) → **403** (부여불가 400 과 구분) (EC-RP-11)
- [ ] **P1** (api) 다중 위반(위계 높음 400 + ADMINISTRATOR 403 동시) → 403 우선 응답 🟨 (EC-RP-11)
- [ ] **P0** (api) 비운영 길드 슈퍼관리자 non-GET → 전역 `GuildMembershipGuard` **403**, GET 은 우회 통과 (EC-RP-12)
- [ ] **P0** (api) 미인증(토큰 없음/만료) → `JwtAuthGuard` **401** / 비멤버 일반 사용자 any method → **403** (EC-RP-13)
- [ ] **P0** (api) 미존재 / 타 길드 panelId 로 GET 상세·PUT·DELETE·publish → **404**(panelId+guildId 소유 검증, IDOR 방지) (EC-RP-31)
- [ ] **P1** (api) DTO 검증 — 빈/80자 초과 라벨(400), 잘못된 색상 hex(400), 잘못된 mode/style enum·음수 sortOrder(400) (EC-RP-01/02/08)
- [ ] **P1** (api) 미게시(channelId NULL) 패널 publish 호출 → channelId 필수 검증 **400** (EC-RP-05)
- [ ] **P2** (api) assignable-roles(1.7) — `fetchGuildRoles` + 봇 최상위 position → 각 역할 `assignable`/`disabledReason` 메타 정확 부착
- [ ] **P2** (api) 라우트 순서 — `GET /assignable-roles` 가 `GET /:panelId`(ParseIntPipe) 앞 선언 → 400 미발생 확인

---

## H. 비기능 — 멱등 / 동시성 / 캐시 / 외부의존 / 마이그레이션

### H-1. 멱등성 / 동시성 (bot + api)

- [ ] **P0** (bot) GRANT 멱등 — 보유 시 Discord API 미호출, ephemeral 안내만 (EC-RP-19, PRD 멱등성)
- [ ] **P0** (bot) TOGGLE 인메모리 락 — SET-NX 시맨틱 첫 성공·재acquire 실패, release 후 재성공 (EC-RP-16)
- [ ] **P1** (api) 동일 패널 동시 편집 — last-write-wins, 버튼 replace 트랜잭션으로 정합성 보장(충돌 감지 미도입 🟨) (EC-RP-17)
- [ ] **P1** (web+api) 게시 버튼 중복 클릭 — web disable 1차 방어, messageId 존재 시 edit 멱등 (EC-RP-18)

### H-2. 캐시 무효화 / 폴백 (api + bot)

- [ ] **P0** (api) 생성/수정/삭제/게시 시 Redis `role_panel:config:{guildId}` 즉시 무효화(DEL) — 다음 조회 시 최신 반영
- [ ] **P1** (bot) 캐시 미스 → 봇이 `/bot-api/role-panel/config` 경유(봇 Redis 미접근) → API 가 Redis 우선·미스 시 DB 폴백 → 정상 처리 (EC-RP-29, UC-04 AF-02)
- [ ] **P1** (api+bot) Redis 장애 → DB 직접 조회 폴백(서비스 연속), 목록 API 도 정상 동작 (EC-RP-26)
- [ ] **P1** (bot) 🟨 Redis/락 장애 시 가용성 우선 — DB 폴백 + 처리 진행(드문 동시 클릭 race 감수) (EC-RP-26)

### H-3. 외부의존(Discord) 실패 (api + bot)

- [ ] **P0** (api+bot) Discord REST 5xx/429(게시·역할변경) → 게시: API 5xx 매핑·`published=false` 보존·재게시 가능 / 클릭: ephemeral 오류·TOGGLE 락 해제 (EC-RP-20)
- [ ] **P0** (api+bot) 봇 Send Messages 권한 없음(게시) → API **503**·`published=false` 보존·웹 토스트 (EC-RP-21)
- [ ] **P1** (api+bot) 대상 채널 삭제됨(Unknown Channel, 게시) → 4xx/5xx 매핑 🟨·`published=false` 보존·재선택 유도 (EC-RP-22)
- [ ] **P1** (api+bot) 게시 메시지 수동 삭제됨(Unknown Message, 동기화) → 동일 채널 신규 전송 폴백 → messageId 갱신(투명) (EC-RP-23)
- [ ] **P2** (api+bot) 삭제 시 Unknown Message/Channel → 오류 무시 + DB CASCADE 삭제 지속 → 200 (EC-RP-25)

### H-4. 마이그레이션 (api — Schema)

- [ ] **P0** (api) `1777400000000-AddRolePanel.ts` up — `role_panel_config` + `role_panel_button`(FK CASCADE) + enum(mode/style) + 인덱스(`IDX_role_panel_config_guild`, `IDX_role_panel_button_panel_sort`) 생성
- [ ] **P0** (api) migration down(revert) 1회 → 테이블/enum/인덱스 정상 제거 후 재적용 통과 (신규 CREATE 전용·파괴적 변경 없음)
- [ ] **P1** (api) 버튼 replace 트랜잭션 — PUT 수정 시 `role_panel_button` DELETE→INSERT 원자성(부분 실패 시 롤백)
- [ ] **P2** (api) `role_panel_config` 삭제 시 `role_panel_button` ON DELETE CASCADE 동작 확인

---

## I. 우선순위 / 담당 분포 + 마커

### 그룹별 항목 수

| 그룹 | 항목 수 | P0 | P1 | P2 |
|---|---|---|---|---|
| A. 웹 패널 CRUD/게시 | 24 | 6 | 14 | 4 |
| B. 웹 역할 선택 가드 | 11 | 6 | 5 | 0 |
| C. 봇 GRANT | 5 | 5 | 0 | 0 |
| D. 봇 TOGGLE | 7 | 4 | 1 | 2 |
| E. 봇 예외 | 8 | 2 | 4 | 2 |
| F. 통합/인증 게이트(e2e) | 6 | 4 | 2 | 0 |
| G. API 권한·게이트 | 11 | 6 | 3 | 2 |
| H. 비기능(멱등/동시성/캐시/외부/마이그레이션) | 17 | 6 | 9 | 2 |
| **합계** | **89** | **39** | **38** | **12** |

### 담당 레이어 분포

| 레이어 | 주요 그룹 |
|---|---|
| web | A 전체, B 전체 |
| bot | C, D, E, H-1·H-2 일부 |
| api | G 전체, H-2·H-3·H-4 |
| api+bot | H-3 외부의존 |
| e2e | F (cross-app, 조건부) |

### edge-cases P0 17건 매핑 (전건 포함 확인)

| EC-RP | 그룹·항목 |
|---|---|
| 03(버튼0) | A-4, B, G |
| 04(버튼25) | A-4, B, G |
| 05(채널필수) | A-6, G |
| 09(위계높음) | B, G |
| 10(@everyone/managed) | B, G |
| 11(ADMINISTRATOR) | B, G |
| 12(비운영 mutation) | B, F, G |
| 13(미인증/비멤버) | G |
| 14(Manage Roles 없음) | E |
| 15(위계 강등) | E |
| 16(TOGGLE 락) | D, H-1 |
| 19(GRANT 멱등) | C, H-1 |
| 20(Discord 5xx) | H-3 |
| 21(Send Messages 없음) | B, H-3 |
| 24(3초 ack) | C, D, E |
| 31(IDOR 404) | G |

### 마커 집계

- 🔴 **결정대기: 0건** (권한 정책 2026-06-19 사용자 확정).
- 🟨 **가정(구현 시 확정)**: EVERYONE 목록 제외 여부(B), 순서 화살표 UX(A-4), 게시 응답 shape(A-6), 다중 위반 403 우선(G), last-write-wins 충돌 감지 미도입(H-1), Unknown Channel 응답 코드 매핑(H-3), Redis 락 장애 시 진행 정책(H-2), 봇 단일 프로세스 가정·샤딩 시 락 폴백(D).

### 다음 단계

- [ ] Phase 6 `tester`(api) — 그룹 G 전체 + H-2·H-3·H-4 테스트 케이스화
- [ ] Phase 6 `tester`(bot) — 그룹 C·D·E + H-1·H-2(봇) 테스트 케이스화(jest, member.roles mock)
- [ ] Phase 6 `fe-tester`(web) — 그룹 A·B (RolePicker 비활성·403 처리 최우선, Vitest+Testing Library)
- [ ] (조건부) Phase 6.5 `e2e-checker` — 그룹 F (cross-app·인증 게이트 전 구간)

## 변경 이력

| 날짜 | 변경 | 변경자 |
|---|---|---|
| 2026-06-19 | 초안 작성 (9그룹 89항목, EC-RP P0 17건 전건 매핑) | planner-qa-checklist |
