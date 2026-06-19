# 예외 케이스 — Role Panel (역할 패널)

> 작성일: 2026-06-19
> 선행 문서: [PRD](../prd/role-panel.md), [Endpoint Spec](../endpoint-spec/role-panel.md), [Usecase UC-01~05](../../usecases/role-panel/)
> DB: [database/_index.md](../database/_index.md) §31 `role_panel_config` / §32 `role_panel_button`
> Phase 6 `tester`(api/bot) · `fe-tester`(web) 의 실패·경계 케이스 테스트 기준.

---

## 1. 개요

본 문서는 role-panel 도메인의 정상 흐름(happy path) 외 **예외 케이스(edge cases)** 를 5개 분류(입력검증 / 권한 / 동시성 / 외부의존 실패 / 데이터부재)로 정리한다. exclusive(택1) 모드는 MVP 제외이므로 본 문서 범위 밖이다.

용어 / 마커:
- **EC ID**: `EC-RP-{번호}` — qa-checklist / 테스트 케이스에서 cite
- **영향 레이어**: web(apps/web) / api(apps/api) / bot(apps/bot) — 각 케이스가 어느 앱에서 처리되는지 표기
- **우선순위**: P0(데이터 손실·보안·권한 누출 영향, 출시 전 필수) / P1(UX 영향, 처리 권장) / P2(드문 경우)
- 🟨 가정 (구현 시 확정 가능, 합리적 default) / 🔴 결정대기 — **본 문서 🔴 없음** (권한 정책 2026-06-19 사용자 확정)

> 🔒 **권한 정책 확정(2026-06-19)**: 부여불가 역할(봇보다 높은 위계 / @everyone / managed) 매핑 → API 400 차단, ADMINISTRATOR 역할 매핑 → API 403 차단. 모두 저장 시점(POST 1.3 / PUT 1.4) 서버측 재검증이 fail-closed 최종 방어선. 본 문서의 권한 케이스는 이 확정 정책을 전제로 한다(미결 정책 아님).

---

## 2. 분류별 점검 결과

| 분류 | 케이스 수 | P0 수 | 비고 |
|---|---|---|---|
| 입력검증 | 8 | 3 | EC-RP-01 ~ EC-RP-08 |
| 권한 | 7 | 7 | EC-RP-09 ~ EC-RP-15 |
| 동시성 | 4 | 2 | EC-RP-16 ~ EC-RP-19 |
| 외부의존 실패 | 7 | 3 | EC-RP-20 ~ EC-RP-26 |
| 데이터부재 | 5 | 2 | EC-RP-27 ~ EC-RP-31 |
| **합계** | **31** | **17** | — |

> 시간/시간대, 환경/디바이스 분류는 본 도메인에서 **해당 없음**(역할 패널은 시간 의존·만료 로직 없음, 웹 UI 는 기존 settings 레이아웃 반응형 상속으로 도메인 고유 환경 케이스 없음). 본 brief 의 5개 분류로 한정한다.

---

## 3. 케이스 요약 표

| ID | 분류 | 한 줄 요약 | 우선순위 | 레이어 | 관련 |
|---|---|---|---|---|---|
| EC-RP-01 | 입력검증 | 빈 라벨 / 80자 초과 라벨 | P1 | web+api | DTO `label` `@MaxLength(80)`, DB `varchar(80)` |
| EC-RP-02 | 입력검증 | 잘못된 색상 hex (형식 불일치) | P1 | web+api | DTO `embedColor` `@Matches(/^#[0-9A-Fa-f]{6}$/)` |
| EC-RP-03 | 입력검증 | 버튼 0개 패널 저장 | P0 | web+api | EX-03 / UC-01 F-01 (400) |
| EC-RP-04 | 입력검증 | 버튼 25개 초과 저장 | P0 | web+api | EX-04 / UC-01 F-02 (400) |
| EC-RP-05 | 입력검증 | 미게시(channelId NULL) 패널 게시 시도 | P0 | web+api | UC-01 EX-05 (400) |
| EC-RP-06 | 입력검증 | 동일 패널 내 중복 역할 매핑 | P1 | web+api | 🟨 정책 |
| EC-RP-07 | 입력검증 | 존재하지 않는 채널 ID / 역할 ID 로 저장 | P1 | api | 🟨 검증 시점 |
| EC-RP-08 | 입력검증 | 잘못된 mode/style enum, sortOrder 음수 | P1 | web+api | `@IsEnum` / `@Min(0)` |
| EC-RP-09 | 권한 | 봇보다 높은 위계 역할 매핑 시도 | P0 | api | UC-01 EX-01 (400) |
| EC-RP-10 | 권한 | @everyone / managed 역할 매핑 시도 | P0 | api | UC-01 EX-01 (400) |
| EC-RP-11 | 권한 | ADMINISTRATOR 역할 매핑 시도 | P0 | api | UC-01 EX-02 (403) |
| EC-RP-12 | 권한 | 비운영 길드 슈퍼관리자 mutation | P0 | api | UC-01 EX-08 (403) |
| EC-RP-13 | 권한 | 미인증 / 비멤버 일반 사용자 요청 | P0 | api | 401 / 403 |
| EC-RP-14 | 권한 | 봇 Manage Roles 권한 없음 (클릭 시) | P0 | bot | UC-04/05 EX-03 |
| EC-RP-15 | 권한 | 봇 역할이 운영 중 대상 역할 아래로 강등 (클릭 시) | P0 | bot | UC-04 EX-03 / UC-05 EX-04 |
| EC-RP-16 | 동시성 | TOGGLE 빠른 연속 클릭 (분산 락) | P0 | bot | UC-05 EX-01 |
| EC-RP-17 | 동시성 | 동일 패널 동시 편집 (last-write-wins) | P1 | api | 🟨 |
| EC-RP-18 | 동시성 | 게시 버튼 중복 클릭 | P1 | web+api | 🟨 |
| EC-RP-19 | 동시성 | GRANT 빠른 연속 클릭 (멱등) | P0 | bot | UC-04 AF-01 |
| EC-RP-20 | 외부의존 | Discord REST 5xx / rate limit (게시·역할변경) | P0 | api+bot | UC-01 EX-06 |
| EC-RP-21 | 외부의존 | 봇 Send Messages 권한 없음 (게시) | P0 | api+bot | UC-01 EX-06 (503) |
| EC-RP-22 | 외부의존 | 대상 채널 삭제됨 (Unknown Channel, 게시) | P1 | api+bot | UC-01 EX-07 |
| EC-RP-23 | 외부의존 | 게시 메시지 수동 삭제됨 (Unknown Message, 동기화) | P1 | api+bot | UC-02 EX-02 (투명 폴백) |
| EC-RP-24 | 외부의존 | Discord 3초 ack 초과 (버튼 클릭) | P0 | bot | UC-04 EX-05 / UC-05 EX-06 |
| EC-RP-25 | 외부의존 | 삭제(DELETE) 시 Unknown Message/Channel | P2 | api+bot | UC-03 EX-01/EX-02 (무시) |
| EC-RP-26 | 외부의존 | Redis 장애 (캐시 조회·락 실패) | P1 | api+bot | UC-04 EX-07 |
| EC-RP-27 | 데이터부재 | 패널/버튼 삭제 후 잔존 메시지 버튼 클릭 | P1 | bot | UC-04 EX-02 / UC-05 EX-03 |
| EC-RP-28 | 데이터부재 | 대상 역할 삭제됨 (Unknown Role, 클릭) | P1 | bot | UC-04 EX-04 / UC-05 EX-05 |
| EC-RP-29 | 데이터부재 | Redis 캐시 미스 → DB 폴백 | P1 | bot | UC-04 AF-02 / UC-05 AF-02 |
| EC-RP-30 | 데이터부재 | messageId NULL(미게시) 패널 클릭 불가 / 빈 목록 | P2 | bot+web | — |
| EC-RP-31 | 데이터부재 | 존재하지 않는 / 타 길드 panelId 접근 | P0 | api | EP 1.2 (404) |

---

## 4. 케이스 상세

### 4.1 입력검증

#### EC-RP-01: 빈 라벨 / 80자 초과 라벨 (입력검증)
- **조건 (Given)**: 버튼 `label` 이 빈 문자열/공백이거나 80자를 초과하는 상태로 POST/PUT 저장 시도.
- **예상 결과 (Then)**: API 400 (`@IsNotEmpty()` / `@MaxLength(80)` 위반). DB `varchar(80)` 이중 방어선. 웹은 입력 길이 카운터 + 저장 버튼 비활성/인라인 에러.
- **처리**: web(클라 검증 + 길이 표시) / api(DTO 검증) / DB(varchar(80))
- **우선순위**: P1
- **레이어**: web+api
- **관련**: `RolePanelButtonInputDto.label`, DB §32 `label varchar(80)`

#### EC-RP-02: 잘못된 색상 hex (입력검증)
- **조건**: `embedColor` 가 `#RRGGBB` 형식이 아님 (예: `red`, `#FFF`, `5865F2`, `#GGGGGG`).
- **예상 결과**: API 400 (`@Matches(/^#[0-9A-Fa-f]{6}$/)`). null/미입력은 허용(`@IsOptional`). 웹 컬러 피커는 항상 유효 hex 생성 → 직접 텍스트 입력 우회만 차단 대상.
- **처리**: web(컬러 피커 + hex 패턴 검증) / api(`@Matches`)
- **우선순위**: P1
- **레이어**: web+api
- **관련**: `CreateRolePanelDto.embedColor`, DB §31 `embedColor varchar(7)`

#### EC-RP-03: 버튼 0개 패널 저장 (입력검증)
- **조건**: `buttons` 배열이 비어 있는 상태로 POST/PUT 저장.
- **예상 결과**: API 400 (`@ArrayMinSize(1)`). 웹은 버튼 0개 시 저장 버튼 비활성(클라 차단). FE 우회 요청 도달 시 API 가 fail-closed.
- **처리**: web(저장 버튼 비활성) / api(`@ArrayMinSize(1)`)
- **우선순위**: P0 (게시 시 빈 ActionRow 로 Discord 전송 불가 → 데이터 정합)
- **레이어**: web+api
- **관련**: UC-01 EX-03 / UC-01 §10 F-01, EP 3 DTO

#### EC-RP-04: 버튼 25개 초과 저장 (입력검증)
- **조건**: `buttons` 26개 이상 (Discord ActionRow 5×5 = 25 상한 초과)으로 저장.
- **예상 결과**: API 400 (`@ArrayMaxSize(25)`). 웹은 25개 도달 시 "버튼 추가" 비활성. DB 는 상한 비강제(앱 레이어 책임).
- **처리**: web(추가 버튼 비활성) / api(`@ArrayMaxSize(25)`)
- **우선순위**: P0 (Discord 게시 자체가 거부됨 → 게시 흐름 파탄)
- **레이어**: web+api
- **관련**: UC-01 EX-04 / F-02, UC-02 EX-05 / F-02, PRD F-ROLE-PANEL-005 제약, DB §32 노트

#### EC-RP-05: 미게시(channelId NULL) 패널 게시 시도 (입력검증)
- **조건**: `channelId = NULL` (초안 저장된 패널)에 대해 publish(1.6) 호출.
- **예상 결과**: API 400 (channelId 필수 검증). 웹은 "채널을 먼저 선택하세요" 유도 토스트. 저장(POST/PUT)에서는 channelId NULL 허용(초안 — UC-01 AF-02), **게시 시점만** 필수.
- **처리**: web(게시 전 채널 미선택 시 게시 버튼 비활성 또는 유도) / api(publish 시 channelId NOT NULL 검증)
- **우선순위**: P0 (게시 흐름 차단점)
- **레이어**: web+api
- **관련**: UC-01 AF-02 / EX-05 / F-04, EP 1.6 동작(2)

#### EC-RP-06: 동일 패널 내 중복 역할 매핑 (입력검증) 🟨
- **조건**: 한 패널의 여러 버튼이 같은 `roleId` 를 매핑 (예: 버튼A=정회원 GRANT, 버튼B=정회원 TOGGLE).
- **예상 결과**: 🟨 **가정 — 기능상 허용하되 웹에서 경고 표시**. 같은 역할을 GRANT/TOGGLE 다른 모드로 매핑 시 사용자가 혼란할 수 있으나 차단 사유는 없음(상호 배타 모드 EXCLUSIVE 는 MVP 제외). DTO/DB 에 unique 제약 없음. 구현 시 API 차단 여부 확정 — 1차는 허용 + 웹 경고 권장.
- **처리**: web(중복 감지 경고 인라인 메시지) / api(차단 안 함 — 🟨)
- **우선순위**: P1
- **레이어**: web(+api 선택)
- **관련**: 🟨 PRD 미명시 — 구현 결정. EXCLUSIVE 모드(MVP 제외)와 구분

#### EC-RP-07: 존재하지 않는 채널 ID / 역할 ID 로 저장 (입력검증) 🟨
- **조건**: 클라이언트가 길드에 없는 `channelId` 또는 `roleId`(삭제됨/위조) 로 저장 요청.
- **예상 결과**:
  - `roleId`: POST/PUT 의 역할 재검증(4.1, `fetchGuildRoles`)에서 역할 목록에 없으면 매핑 불가로 400 처리(부여불가 역할과 동일 경로). 🟨 "역할 목록에 미존재" 명시 사유 표기 권장.
  - `channelId`: 🟨 저장 시점에는 채널 실재 검증을 강제하지 않음(초안 허용 — UC-01 AF-02). 게시 시점에 봇이 Unknown Channel 로 검출(EC-RP-22). 저장 시 채널 드롭다운은 `fetchGuildChannels` 결과만 노출하므로 정상 경로에서는 발생 불가, 위조 요청만 대상.
- **처리**: api(roleId — 역할 재검증 400 / channelId — 게시 시점 검출로 위임 🟨)
- **우선순위**: P1
- **레이어**: api
- **관련**: EP 4.1, UC-01 EX-07(채널), 🟨 채널 저장시점 검증 미명시

#### EC-RP-08: 잘못된 enum / 음수 sortOrder (입력검증)
- **조건**: `mode`/`style` 이 허용 enum 밖 값, `sortOrder` 가 음수 또는 정수 아님.
- **예상 결과**: API 400 (`@IsEnum(RolePanelButtonMode)`, `@IsEnum(RolePanelButtonStyle)`, `@IsInt()` `@Min(0)`). 웹은 드롭다운/순서 컨트롤로 유효값만 생성 → 위조 요청만 대상.
- **처리**: web(드롭다운 제한) / api(class-validator)
- **우선순위**: P1
- **레이어**: web+api
- **관련**: EP 3 `RolePanelButtonInputDto`, DB enum 타입

---

### 4.2 권한 (🔒 정책 확정 2026-06-19)

#### EC-RP-09: 봇보다 높은 위계 역할 매핑 시도 (권한)
- **조건**: 버튼 `roleId` 가 봇 최상위 역할 `position` 보다 높은 역할.
- **예상 결과**: API **400** (저장 시점 4.1 검증: 봇 멤버 roles max position < 대상 role position). 웹 역할 선택기는 `assignable-roles`(1.7) 메타로 `HIGHER_THAN_BOT` 비활성 + 사유 툴팁. 게시 후 클릭 에러 사전 차단.
- **처리**: web(역할 선택기 비활성 + 사유) / api(저장 시점 재검증 — fail-closed)
- **우선순위**: P0 (권한·게시 후 클릭 실패 방지)
- **레이어**: api (web 사전 차단 보조)
- **관련**: PRD 권한정책1, UC-01 EX-01, EP 4.1 #1, `AssignableRoleDto.disabledReason=HIGHER_THAN_BOT`

#### EC-RP-10: @everyone / managed·integration 역할 매핑 시도 (권한)
- **조건**: `roleId === guildId`(@everyone) 또는 `role.managed === true` / `role.tags` 보유(봇·부스트·integration 역할).
- **예상 결과**: API **400** (4.1 검증 #2·#3). 웹은 `MANAGED` / `EVERYONE` 사유로 비활성.
- **처리**: web(비활성 + 사유) / api(재검증)
- **우선순위**: P0
- **레이어**: api (web 보조)
- **관련**: PRD 권한정책1, EP 4.1 #2·#3, `disabledReason=MANAGED|EVERYONE`

#### EC-RP-11: ADMINISTRATOR 권한 역할 매핑 시도 (권한)
- **조건**: 대상 역할 permissions 비트마스크에 `ADMINISTRATOR(1<<3)` 포함.
- **예상 결과**: API **403** (4.1 검증 #4 — 부여불가 400 과 구분된 권한 정책 차단). 웹은 `ADMINISTRATOR` 사유 비활성 + "관리자 권한 역할은 매핑할 수 없습니다" 표기. 버튼 클릭으로 관리자 권한 누출 원천 봉쇄.
- **처리**: web(비활성 + 사유 표기) / api(403 fail-closed)
- **우선순위**: P0 (권한 상승·보안)
- **레이어**: api (web 보조)
- **관련**: PRD 권한정책2, UC-01 EX-02 / F-03, UC-02 EX-01 / F-01, EP 4.1 #4
- **🟨 다중 위반 우선순위**: 위계 높음(400) + ADMINISTRATOR(403) 동시 시 — 구현상 **403 우선** 권장(EP 4.1 노트).

#### EC-RP-12: 비운영 길드 슈퍼관리자 mutation (권한)
- **조건**: 운영진이 아닌 슈퍼관리자가 비운영 길드에 대해 non-GET(POST/PUT/DELETE/publish) 호출.
- **예상 결과**: 전역 `GuildMembershipGuard` 가 **403** (fail-closed — GET 만 우회 read-only 허용, non-GET 은 멤버십 체크 낙하). 웹은 비운영 길드에서 read-only UI(저장/게시/삭제 버튼 숨김 또는 비활성).
- **처리**: api(전역 가드 403) / web(read-only UI)
- **우선순위**: P0
- **레이어**: api (web read-only 보조)
- **관련**: UC-01 EX-08 / F-07, UC-02 EX-06 / F-04, UC-03 EX-03 / F-01, EP 4.2

#### EC-RP-13: 미인증 / 비멤버 일반 사용자 요청 (권한)
- **조건**: 토큰 없음/만료(미인증) 또는 인증됐으나 해당 길드 비멤버 일반 사용자.
- **예상 결과**: 미인증 → `JwtAuthGuard` **401**. 비멤버 일반 사용자(any method) → `GuildMembershipGuard` **403**.
- **처리**: api(JwtAuthGuard 401 / GuildMembershipGuard 403) / web(미인증 시 로그인 리디렉션)
- **우선순위**: P0
- **레이어**: api
- **관련**: EP 1 공통 응답, EP 4.2

#### EC-RP-14: 봇 Manage Roles 권한 없음 (클릭 시) (권한)
- **조건**: 저장 시점에는 검증 통과했으나, 운영 중 봇의 Manage Roles 권한이 회수된 상태에서 사용자가 버튼 클릭.
- **예상 결과**: Discord `roles.add/remove` 호출 실패 → 봇이 내부 로그 + Ephemeral "역할을 부여/변경할 권한이 없습니다. 서버 관리자에게 문의하세요." TOGGLE 은 try-finally 로 Redis 락 해제.
- **처리**: bot(예외 캐치 → Ephemeral 오류 + 로그)
- **우선순위**: P0 (사용자 영향, 클릭 시 발생)
- **레이어**: bot
- **관련**: UC-04 EX-03 / F-02, UC-05 EX-04 / F-03

#### EC-RP-15: 봇 역할이 운영 중 대상 역할 아래로 강등 (클릭 시) (권한)
- **조건**: 매핑 당시엔 봇 역할이 대상 역할보다 위였으나, 이후 관리자가 봇 역할을 강등하거나 대상 역할을 승격 → 봇 position < 대상 role position 상태에서 클릭.
- **예상 결과**: Discord REST 가 위계 위반으로 역할 변경 거부 → EC-RP-14 와 동일 처리(Ephemeral 오류 + 로그, TOGGLE 락 해제). 저장 시점 검증은 시점 스냅샷이므로 사후 강등은 클릭 시점에만 검출됨.
- **처리**: bot(REST 실패 캐치 → Ephemeral 오류)
- **우선순위**: P0
- **레이어**: bot
- **관련**: UC-04 EX-03, UC-05 EX-04, UC-04 선행조건4 / UC-05 선행조건4 (저장시점 검증 스냅샷)

---

### 4.3 동시성

#### EC-RP-16: TOGGLE 빠른 연속 클릭 — 분산 락 (동시성)
- **조건**: 동일 사용자가 동일 TOGGLE 버튼을 짧은 간격(예 50ms)으로 2회 클릭 → 두 요청이 동시에 역할 보유 상태를 읽어 상태 불일치(부여→부여 또는 회수→회수) 위험.
- **예상 결과**: 봇이 `SET NX role_panel:lock:{guildId}:{userId}:{buttonId}` (TTL 3s) 원자적 락. 첫 요청만 락 획득 → 처리. 두 번째는 락 실패 → Ephemeral "처리 중입니다. 잠시 후 다시 시도해 주세요." (재시도 없이 종료). 락 해제: 명시적 DEL 또는 TTL 3초 만료(데드락 방지).
- **처리**: bot(Redis SET NX 분산 락 + try-finally 해제)
- **우선순위**: P0 (역할 상태 정합)
- **레이어**: bot
- **관련**: UC-05 EX-01 / S-03 / F-01, PRD 동시성, DB §Redis `role_panel:lock`

#### EC-RP-17: 동일 패널 동시 편집 — last-write-wins (동시성) 🟨
- **조건**: 두 관리자가 같은 패널을 동시에 열어 각자 수정 후 순차 PUT 저장.
- **예상 결과**: 🟨 **가정 — last-write-wins**. PUT 은 버튼 전체 replace(DELETE→INSERT) 트랜잭션이므로 나중 저장이 먼저 저장을 덮어씀. 낙관적 락(version 컬럼) MVP 미도입. 데이터 손상은 없으나 먼저 저장한 변경이 유실될 수 있음 → 구현 시 `updatedAt` 기반 충돌 감지 추가 여부 결정.
- **처리**: api(트랜잭션으로 정합성은 보장, 충돌 감지 미도입 🟨) / web(저장 후 최신 상태 리로드 권장)
- **우선순위**: P1 (드문 운영 시나리오, 데이터 손상 아님)
- **레이어**: api
- **관련**: 🟨 PRD/EP 미명시, EP 1.4 동작(버튼 전체 교체), DB §31 `updatedAt`

#### EC-RP-18: 게시 버튼 중복 클릭 (동시성) 🟨
- **조건**: 관리자가 "게시"(publish 1.6) 를 빠르게 2회 클릭 → 동시 게시 요청.
- **예상 결과**: 🟨 첫 요청이 messageId 없으면 신규 전송, 동시 두 요청이 모두 신규 전송 시 **중복 메시지 게시** 위험. 1차 방어 web(게시 중 버튼 disable + 로딩 인디케이터 — UC-01 §9.2). 🟨 서버측 멱등 보강(panelId 단위 짧은 락 또는 messageId 존재 재확인) 구현 시 검토 권장. messageId 가 이미 있으면 edit 이므로 멱등.
- **처리**: web(버튼 disable — 1차) / api(🟨 멱등 보강 검토)
- **우선순위**: P1
- **레이어**: web+api
- **관련**: UC-01 §9.2(로딩 인디케이터), EP 1.6, 🟨 멱등 보강 미명시

#### EC-RP-19: GRANT 빠른 연속 클릭 — 멱등 (동시성)
- **조건**: 동일 사용자가 GRANT 버튼을 연속 클릭.
- **예상 결과**: GRANT 는 멱등 — 첫 클릭으로 역할 보유 후, 이후 클릭은 `roles.cache.has(roleId)=true` 로 Discord API 호출 없이 Ephemeral "이미 해당 역할을 보유하고 있습니다." Discord 가 인터랙션별 고유 ID 발급 → 동일 인터랙션 재처리는 Discord 측 방지. GRANT 는 분산 락 불필요(상태 단방향).
- **처리**: bot(보유 여부 확인 후 분기 — 멱등)
- **우선순위**: P0 (멱등성 — 인증 게이트 정확성)
- **레이어**: bot
- **관련**: UC-04 AF-01 / S-02, PRD 멱등성

---

### 4.4 외부의존 실패

#### EC-RP-20: Discord REST 5xx / rate limit (외부의존)
- **조건**: 게시(메시지 전송/편집) 또는 버튼 클릭(역할 부여/회수) 시 Discord REST 가 5xx 또는 429(rate limit) 반환.
- **예상 결과**:
  - 게시(api→bot): 봇이 오류를 API 로 전달 → API 5xx 매핑, `published=false` 보존(레코드 유지), 웹 에러 토스트 + 재게시 가능(UC-01 §8.3). 429 는 discord.js 가 자동 백오프/재시도하나 한도 초과 시 실패 전파.
  - 클릭(bot): 역할 변경 실패 → Ephemeral 오류 응답, TOGGLE 락 해제. 내부 로그.
- **처리**: api+bot(오류 전파 + 상태 보존, 재시도 가능) / web(에러 토스트)
- **우선순위**: P0 (게시 흐름·사용자 영향)
- **레이어**: api+bot
- **관련**: UC-01 §7.2 / §8.3, UC-05 EX-08, PRD 외부의존성

#### EC-RP-21: 봇 Send Messages 권한 없음 (게시) (외부의존)
- **조건**: 게시 시 봇이 대상 채널에 Send Messages 권한 미보유.
- **예상 결과**: 봇이 권한 부족 오류를 API 로 전달 → API **503**. `published=false` 보존. 웹 권한 부족 토스트("봇 채널 권한 확인"). 봇 권한 부여 후 재게시 가능.
- **처리**: api(503) / bot(권한 오류 검출·전달) / web(토스트)
- **우선순위**: P0 (게시 차단)
- **레이어**: api+bot (web 토스트)
- **관련**: UC-01 EX-06 / F-05, UC-02 EX-04 / F-03(채널 변경 신규 전송), EP 1.4·1.6 503

#### EC-RP-22: 대상 채널 삭제됨 — Unknown Channel (게시) (외부의존)
- **조건**: 패널 `channelId` 의 채널이 Discord 에서 삭제된 상태로 게시 시도.
- **예상 결과**: 봇이 Unknown Channel 오류 전달 → API 4xx/5xx 매핑(🟨 코드 구현 확정), `published=false` 보존. 웹 "채널 재선택 유도" 토스트. 관리자가 채널 재선택 후 재게시.
- **처리**: api(오류 매핑 🟨) / bot(Unknown Channel 검출) / web(재선택 유도)
- **우선순위**: P1
- **레이어**: api+bot
- **관련**: UC-01 EX-07 / F-06, EP 1.6 비고(4xx/5xx 매핑 🟨)

#### EC-RP-23: 게시 메시지 수동 삭제됨 — Unknown Message (동기화) (외부의존)
- **조건**: `published=true` + messageId 있으나 해당 Discord 메시지가 수동 삭제된 상태에서 PUT 수정 동기화(message.edit) 시도.
- **예상 결과**: edit 이 Unknown Message → 봇이 **동일 채널 신규 전송으로 폴백**, 새 messageId 를 API 가 DB 갱신. 사용자에게 별도 오류 미노출(투명 폴백).
- **처리**: bot(Unknown Message 캐치 → 신규 전송 폴백) / api(messageId 갱신)
- **우선순위**: P1 (투명 복구, 데이터 정합)
- **레이어**: api+bot
- **관련**: UC-02 EX-02, EP 1.4 비고

#### EC-RP-24: Discord 3초 ack 초과 (버튼 클릭) (외부의존)
- **조건**: 캐시 미스 + DB 조회 + Discord REST 역할 변경 복합으로 인터랙션 응답이 3초에 근접/초과 위험.
- **예상 결과**: 봇이 인터랙션 수신 직후 `deferReply({ ephemeral: true })` 로 응답 시간 연장 → 처리 완료 후 `followUp` 으로 최종 결과 전달. 3초 미처리 시 Discord 가 "인터랙션 실패" 표시되는 것을 방지.
- **처리**: bot(deferReply + followUp 패턴)
- **우선순위**: P0 (사용자 인터랙션 실패 방지)
- **레이어**: bot
- **관련**: UC-04 EX-05 / S-04, UC-05 EX-06, PRD 성능

#### EC-RP-25: 삭제(DELETE) 시 Unknown Message / Unknown Channel (외부의존)
- **조건**: 패널 삭제 시 messageId 메시지가 이미 삭제됐거나 채널 자체가 삭제됨.
- **예상 결과**: 봇 삭제 요청이 Unknown Message/Channel → API 가 내부 로그만 기록하고 **오류 무시**, DB 삭제(CASCADE) 계속 진행 → 200 성공. 사용자에게 오류 미노출.
- **처리**: api+bot(오류 무시, DB 삭제 지속)
- **우선순위**: P2 (영향 적음 — 정리 작업)
- **레이어**: api+bot
- **관련**: UC-03 EX-01 / EX-02 / S-03, EP 1.5 동작(2) 실패 무시

#### EC-RP-26: Redis 장애 — 캐시 조회·락 실패 (외부의존)
- **조건**: 버튼 클릭 또는 목록 조회 시 Redis 가 응답 없음/장애.
- **예상 결과**:
  - 캐시 조회 실패 → DB 직접 조회 폴백(서비스 연속). 목록 API 도 DB 조회로 정상 동작(캐시는 가속용).
  - TOGGLE 락 획득 실패(Redis 장애) → 🟨 구현 결정: 락 미적용으로 처리 진행(가용성 우선) 또는 보수적 차단. UC-05 §8.3 은 폴백 연속성 우선 → **DB 폴백 + 처리 진행** 권장(드문 동시 클릭 race 는 감수).
- **처리**: api+bot(Redis 실패 시 DB 폴백)
- **우선순위**: P1
- **레이어**: api+bot
- **관련**: UC-04 EX-07, UC-05 §8.3, PRD 가용성

---

### 4.5 데이터부재

#### EC-RP-27: 패널/버튼 삭제 후 잔존 메시지 버튼 클릭 (데이터부재)
- **조건**: 패널 삭제됐으나 Discord 메시지 삭제가 실패했거나 사용자가 캐시된 화면에서 잔존 버튼 클릭. customId 의 panelId/buttonId 가 DB 에 더 이상 없음.
- **예상 결과**: 캐시 미스 → DB 조회 결과 없음 → 봇이 내부 로그 + Ephemeral "역할 버튼 설정을 찾을 수 없습니다." (락 미획득 상태이므로 해제 불필요). 플로우 종료.
- **처리**: bot(DB 조회 부재 → Ephemeral 안내)
- **우선순위**: P1
- **레이어**: bot
- **관련**: UC-04 EX-02 / F-01, UC-05 EX-03 / F-02, UC-03 §7.1 부작용

#### EC-RP-28: 대상 역할 삭제됨 — Unknown Role (클릭) (데이터부재)
- **조건**: 버튼 매핑 `roleId` 의 역할이 Discord 에서 삭제된 상태로 클릭.
- **예상 결과**: `roles.add/remove` 가 Unknown Role 오류 → 봇 내부 로그 + Ephemeral "해당 역할을 찾을 수 없습니다." TOGGLE 은 락 해제.
- **처리**: bot(Unknown Role 캐치 → Ephemeral 안내 + 로그)
- **우선순위**: P1
- **레이어**: bot
- **관련**: UC-04 EX-04 / F-03, UC-05 EX-05 / F-04

#### EC-RP-29: Redis 캐시 미스 → DB 폴백 (데이터부재)
- **조건**: 봇 재시작 직후 또는 TTL 만료로 `role_panel:config:{guildId}` 캐시 부재 상태에서 버튼 클릭.
- **예상 결과**: DB `role_panel_config` JOIN `role_panel_button` 조회 → Redis 캐시 저장(TTL 1h) → 정상 처리 진행. 캐시 미스는 오류가 아닌 정상 폴백 경로.
- **처리**: bot(캐시 미스 시 DB 조회 + 캐시 빌드)
- **우선순위**: P1 (정상 폴백 — 동작 검증 필요)
- **레이어**: bot
- **관련**: UC-04 AF-02 / S-04, UC-05 AF-02 / S-04, DB §32 캐시 빌드 쿼리

#### EC-RP-30: messageId NULL(미게시) 패널 클릭 불가 / 빈 목록 (데이터부재)
- **조건**: (a) 패널이 저장만 되고 미게시(messageId NULL) → Discord 에 버튼이 존재하지 않으므로 클릭 자체 불가. (b) 길드에 패널이 0개인 상태로 목록 조회.
- **예상 결과**: (a) 미게시 패널은 Discord 버튼이 없어 인터랙션 발생 불가 — 데이터 정합상 클릭 경로 없음(설계상 안전). (b) 목록 조회는 빈 배열 `[]` 반환, 웹은 빈 상태 화면("패널이 없습니다" + "새 패널" CTA).
- **처리**: web(빈 상태 UI) / api(빈 배열) / bot(미게시 = 인터랙션 부재)
- **우선순위**: P2
- **레이어**: web+api (+bot 설계상 안전)
- **관련**: UC-01 Phase1 단계2(빈 상태), DB §31 `messageId NULLABLE`

#### EC-RP-31: 존재하지 않는 / 타 길드 panelId 접근 (데이터부재)
- **조건**: 미존재 panelId 또는 다른 길드 소유 panelId 로 GET 상세/PUT/DELETE/publish 호출.
- **예상 결과**: API **404** (panelId 조회 시 `guildId` 소유 검증 — 타 길드 패널 ID 접근 차단). 웹 "패널을 찾을 수 없습니다." 안내. IDOR(타 길드 자원 접근) 방지.
- **처리**: api(panelId + guildId 소유 검증 → 404)
- **우선순위**: P0 (IDOR 보안)
- **레이어**: api
- **관련**: EP 1.2 / 1.4 / 1.5, UC-03 EX-05 / F-02

---

## 5. 우선순위 분포

| 우선순위 | 케이스 수 | 처리 시점 |
|---|---|---|
| P0 | 17 | 즉시 (출시 전 필수) |
| P1 | 12 | 처리 권장 |
| P2 | 2 | 차후 가능 |

**P0 17건** (출시 전 필수): EC-RP-03, 04, 05(입력·게시 차단점) / EC-RP-09 ~ 15(권한 전체) / EC-RP-16, 19(동시성 — 락·멱등) / EC-RP-20, 21, 24(외부 — 게시·역할변경·ack) / EC-RP-31(IDOR).

---

## 6. 처리 레이어 분포

| 레이어 | 케이스 수 | 주요 케이스 |
|---|---|---|
| web+api | 8 | 입력검증 대부분, 게시 중복 |
| api 단독 | 5 | 권한 재검증, IDOR, 동시 편집 |
| bot 단독 | 9 | 버튼 클릭 전 영역(권한·동시성·데이터부재) |
| api+bot | 7 | 게시·동기화·삭제 Discord 연동 |
| web 보조 | (중복) | 권한 사전 비활성 표기(EC-RP-09~12) |

---

## 7. 마커 집계

- 🔴 **결정대기: 0개** (권한 정책 2026-06-19 사용자 확정).
- 🟨 **가정 (구현 시 확정)**: EC-RP-06(중복 역할 허용 정책), EC-RP-07(채널 저장시점 검증 위임), EC-RP-11(다중 위반 403 우선), EC-RP-17(last-write-wins 충돌 감지 미도입), EC-RP-18(게시 멱등 보강), EC-RP-22(Unknown Channel 응답 코드 매핑), EC-RP-26(Redis 락 장애 시 진행 정책).

---

## 8. 다음 단계

- [ ] Phase 6 `tester`(api/bot) — EC-RP-03~05, 09~15, 16/19, 20/21/24, 25, 27~31 테스트 케이스화
- [ ] Phase 6 `fe-tester`(web) — EC-RP-01, 02, 06, 08(입력검증 UI), 09~12(역할 선택기 비활성), 18, 30(빈 상태)
- [ ] (필요 시) qa-checklist 작성 시 본 EC-RP ID cite

## 9. 변경 이력

| 날짜 | 변경 | 변경자 |
|---|---|---|
| 2026-06-19 | 초안 작성 (5분류 31케이스) | planner-edge-cases |
