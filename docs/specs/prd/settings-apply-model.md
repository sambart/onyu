# 설정 저장/반영 모델 통일 PRD (1차: 아티팩트 도메인 + 마지막 반영 시각 배지 + 다시 반영)

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

---

## 1. 문제 정의

### 1-1. 현재 상황 (As-Is)

onyu 웹 대시보드의 "디스코드에 메시지를 게시하는" 설정 도메인 4개가 저장/게시 UX가 제각각이다.

| 도메인 | 저장 버튼 | 게시 버튼 | 저장 시 디스코드 반영 여부 |
|--------|----------|----------|--------------------------|
| status-prefix | "저장" | 없음 | 저장 즉시 자동 반영 |
| sticky-message | "저장" | 없음 | 저장 즉시 자동 반영 |
| role-panel | "저장" | "게시" (별도) | 저장만으로는 미반영, 게시 버튼 별도 필요 |
| auto-channel | "저장" | 없음 | 저장 즉시 자동 반영 |

### 1-2. 문제점

1. **모델 불일치**: role-panel만 "저장→게시" 2단계 흐름이고, 나머지 3개는 "저장=즉시 반영" 1단계 흐름이다. 같은 대시보드 안에서 UX가 달라 혼동이 생긴다.
2. **반영 상태 불투명**: 어떤 도메인도 "현재 디스코드에 반영된 시점"을 영구 표시하지 않는다. 설정 저장 직후 일시 토스트가 뜨지만, 페이지를 새로 고침하면 "지금 살아있는지" 알 방법이 없다.
3. **사용자 수동 복구 불가**: 유저가 디스코드에서 봇 메시지를 실수로 지워도 재게시 방법이 없다. 다음 설정 변경 저장 시 edit 실패→신규 전송 폴백으로 자동복구되긴 하지만, 그 전까지 디스코드 채널에서 메시지가 사라진 상태임을 대시보드에서 확인할 수 없다.

---

## 2. 목표 및 비목표

### 2-1. 목표

1. **저장 모델 통일**: 4개 도메인 전부 "저장 = 즉시 디스코드 반영" 단일 액션으로 통일한다. role-panel의 별도 "게시" 버튼을 폐지하고 저장 액션에 통합한다.
2. **마지막 반영 시각 배지**: 각 설정 페이지에 "마지막 반영: {시각}" 배지를 영구 표시하여 사용자가 언제 디스코드에 반영됐는지 항상 알 수 있게 한다.
3. **다시 반영 버튼**: 설정 변경 없이 디스코드에 재게시(force re-apply)할 수 있는 보조 버튼을 추가한다.

### 2-2. 비목표 (1차 제외 — 후속 PR)

- 11개 전체 설정 페이지의 저장 UX 표준화(공통 `SettingsSaveBar` / `useSettingsForm`, dirty 상태 추적, Newbie 이원화 통합, 라벨 통일)는 이번 1차 범위 밖이다.

---

## 3. 관련 모듈

| 도메인 | API | Bot | Web |
|--------|-----|-----|-----|
| status-prefix | `apps/api/src/status-prefix/` | `apps/bot/src/event/status-prefix/` | `apps/web/app/settings/guild/[guildId]/status-prefix/` |
| sticky-message | `apps/api/src/sticky-message/` | `apps/bot/src/command/sticky-message/` | `apps/web/app/settings/guild/[guildId]/sticky-message/` |
| role-panel | `apps/api/src/role-panel/`, `apps/api/src/bot-api/role-panel/` | `apps/bot/src/event/role-panel/` | `apps/web/app/settings/guild/[guildId]/role-panel/` |
| auto-channel | `apps/api/src/channel/auto/`, `apps/api/src/bot-api/auto-channel/` | `apps/bot/src/event/auto-channel/` | `apps/web/app/settings/guild/[guildId]/auto-channel/` |

---

## 4. 도메인별 As-Is → To-Be

### 4-1. status-prefix

**As-Is**:
- 웹에서 설정 저장 → DB persist + 디스코드 채널에 Embed+버튼 메시지 전송/갱신.
- "마지막 반영 시각"을 표시하는 UI 없음. 토스트만 있음.
- 수동 재게시 방법 없음.

**To-Be**:
- 저장 동작은 동일(저장 = 즉시 반영). 변경 없음.
- 저장 성공 시, 봇이 실제로 메시지를 post/edit한 시각을 DB에 기록한다.
- 설정 페이지 상단에 "마지막 반영: {시각}" 배지를 표시한다. 반영 이력이 없으면 "미반영" 표기.
- "다시 반영" 버튼 추가. 클릭 시 현재 저장된 설정으로 디스코드에 즉시 재게시 + 반영 시각 갱신.

---

### 4-2. sticky-message

**As-Is**:
- 웹에서 저장 → DB persist + 디스코드 채널에 Embed 메시지 전송/갱신.
- "마지막 반영 시각" 표시 없음.
- 수동 재게시 방법 없음. (슬래시 커맨드 `/고정메세지삭제` 후 재등록은 가능하지만 번거로움)

**To-Be**:
- 저장 동작 동일.
- 저장 성공 시 봇이 실제로 메시지를 post/edit한 시각을 DB에 기록한다.
- 설정 목록 내 각 항목(채널별 카드)에 "마지막 반영: {시각}" 배지를 표시한다.
- 채널별 카드에 "다시 반영" 버튼 추가. 클릭 시 해당 채널의 고정메세지를 즉시 재게시 + 반영 시각 갱신.

---

### 4-3. role-panel (핵심 변경)

**As-Is**:
- 웹에서 "저장" → DB persist만. 디스코드 미반영 (`published = false`).
- 웹에서 별도 "게시" 버튼 클릭 → DB persist + 디스코드 게시 (`POST .../publish`).
- 처음 저장 후 "게시" 버튼을 누르지 않으면 디스코드에 아무것도 올라가지 않음.
- `published` 플래그로 "한 번이라도 게시됐는가"를 추적하지만, 마지막 시각은 없음.

**To-Be**:
- "게시" 버튼 폐지. "저장" 버튼 단일 액션으로 collapse.
- 웹에서 "저장" → DB persist + 즉시 디스코드 게시/갱신 (기존 `publish` 로직을 저장 흐름에 통합).
- `messageId`가 있으면 기존 메시지 edit, 없으면 신규 전송 (기존 publish 폴백 동일).
- 저장 성공 시 봇이 실제로 메시지를 post/edit한 시각을 DB에 기록한다.
- 패널 탭 또는 목록에 "마지막 반영: {시각}" 배지를 표시한다.
- 패널별 "다시 반영" 버튼 추가. 클릭 시 해당 패널을 즉시 재게시 + 반영 시각 갱신.

> 참고: 기존 `publish` API 엔드포인트(`POST .../publish`)는 내부적으로 "다시 반영" 버튼이 재활용할 수 있다. 별도 신규 엔드포인트 설계는 구현 단계에서 결정한다.

---

### 4-4. auto-channel

**As-Is**:
- 웹에서 저장 → DB persist. (auto-channel은 채널 생성 이벤트가 디스코드 Gateway 이벤트 기반이라 "저장 시 즉시 디스코드 메시지 전송"은 없음)
- 단, 저장 시 봇에 설정 변경 알림을 보내 캐시를 갱신하는 구조.

**To-Be**:
- 저장 모델은 기존과 동일(별도 디스코드 메시지 게시 없음).
- 저장 성공 시각을 DB에 기록한다.
- 설정 페이지에 "마지막 저장: {시각}" 배지를 표시한다. (auto-channel은 디스코드 메시지 게시 대상이 아니므로 "마지막 반영" 대신 "마지막 저장"으로 표기)
- "다시 반영" 버튼: auto-channel은 게시 대상이 없으므로 이번 1차에서 제외한다.

> 참고: auto-channel의 "반영"은 "다음 트리거 채널 입장 시 변경된 설정이 적용된다"는 의미이므로, 강제 재게시 개념이 없다. 배지는 "설정이 언제 저장됐는가"를 알려주는 용도로 제한한다.

---

## 5. 기능 상세

### F-APPLY-001: 저장 시 반영 시각 기록 (공통)

- **대상 도메인**: status-prefix, sticky-message, role-panel (auto-channel은 마지막 저장 시각으로 대체)
- **트리거**: 설정 저장 API 호출이 성공하고 봇이 실제로 디스코드 메시지를 post/edit 완료했을 때
- **동작**:
  1. 봇이 Discord API를 통해 메시지 post 또는 edit에 성공한 시점을 기록한다.
  2. 해당 시각을 설정 레코드의 `lastAppliedAt` 컬럼(또는 도메인에 적합한 컬럼명)에 저장한다.
  3. API 응답에 `lastAppliedAt` 필드를 포함하여 웹에 반환한다.
- **실패 시**: Discord API 호출이 실패하면 `lastAppliedAt`을 갱신하지 않는다. API 오류를 클라이언트에 전달하고 웹에서 에러 토스트를 표시한다.
- **데이터 요구사항**: 각 도메인 설정 테이블에 `lastAppliedAt timestamp NULL` 컬럼 추가 필요. 초기값은 NULL(미반영 상태). 상세 DB 설계는 후속 `database-architect` 단계에서 확정한다.

---

### F-APPLY-002: 마지막 반영 시각 배지 (웹)

- **대상 도메인**: status-prefix, sticky-message, role-panel, auto-channel
- **표시 위치**:
  - status-prefix: 설정 페이지 상단 저장 버튼 인근
  - sticky-message: 채널별 고정메세지 카드 내부
  - role-panel: 패널 탭 또는 패널 편집 영역 상단
  - auto-channel: 설정 페이지 상단 저장 버튼 인근
- **표시 규칙**:
  - `lastAppliedAt`이 있으면: "마지막 반영: {상대적 시각}" (예: "마지막 반영: 3분 전", "마지막 반영: 2026-06-20 14:30")
  - `lastAppliedAt`이 NULL이면: "미반영" 또는 "아직 디스코드에 반영되지 않았습니다."
  - auto-channel은 "마지막 저장: {시각}" 문구 사용
- **i18n**: 배지 문구는 `libs/i18n/locales/{ko,en}/web` 하위 키로 관리한다. 키명은 구현 단계에서 확정한다.
- **갱신 시점**: 저장 또는 다시 반영 성공 후 UI 즉시 갱신 (페이지 재로드 불필요).

---

### F-APPLY-003: 다시 반영 버튼 (웹)

- **대상 도메인**: status-prefix, sticky-message, role-panel
- **표시 위치**: 마지막 반영 시각 배지 인근 (저장 버튼 보조 영역)
- **동작**:
  1. 사용자가 "다시 반영" 버튼 클릭
  2. 현재 DB에 저장된 설정을 읽어 디스코드에 즉시 재게시 (force re-apply)
  3. 봇이 `messageId`가 있으면 기존 메시지 edit, 없으면 신규 전송
  4. 성공 시 `lastAppliedAt` 갱신 + 배지 즉시 업데이트 + 성공 토스트
  5. 실패 시 에러 토스트 (채널 없음, 봇 권한 부족 등 구체적 사유 포함)
- **버튼 상태**:
  - 요청 중: 로딩 스피너 (중복 클릭 방지)
  - `lastAppliedAt`이 NULL(미반영)일 때도 버튼 활성 (저장된 설정이 있으면 반영 가능)
  - 설정이 아직 저장된 적 없는 신규 상태에서는 비활성
- **API**: 기존 `publish` 엔드포인트 재활용 또는 `re-apply` 전용 엔드포인트 신설. 구현 단계에서 확정한다.

---

### F-APPLY-004: role-panel 저장-게시 통합

- **변경 내용**: 기존 `PUT /api/guilds/{guildId}/role-panel/{panelId}` (저장만) 와 `POST .../publish` (게시) 를 통합한다.
- **통합 후 동작**: `PUT /api/guilds/{guildId}/role-panel/{panelId}` 단일 호출이 DB persist + 디스코드 게시/갱신을 모두 수행한다.
- **기존 `/publish` 엔드포인트**: "다시 반영" 버튼 용도로 유지하거나, `PUT` 통합 후 deprecated 처리한다. 구현 단계에서 결정한다.
- **`published` 플래그**: `lastAppliedAt IS NOT NULL`으로 대체 가능 여부를 구현 단계에서 검토한다. 기존 `published` 컬럼은 하위 호환을 위해 유지하되 `lastAppliedAt`이 NULL이 아닐 때 true로 관리하는 방식을 권장한다.
- **웹 UI 변경**: "게시" 버튼을 제거하고 "저장" 버튼만 남긴다. 버튼 라벨이나 역할 설명 문구는 i18n 키 수정으로 처리한다.

---

## 6. 데이터 요구사항

### 6-1. 공통 요구사항

4개 도메인 설정 테이블에 "마지막으로 디스코드에 메시지를 실제 post/edit한 시각"을 저장하는 컬럼이 필요하다. 이 컬럼은:
- **타입**: `timestamp` (또는 `timestamptz`)
- **NULL 허용**: 초기값 및 설정만 저장하고 반영하지 않은 상태 = NULL
- **갱신 조건**: 봇이 Discord API 메시지 전송/수정 성공 응답을 받은 시점
- **비파괴 변경**: 기존 컬럼을 삭제하거나 타입을 변경하지 않는다. nullable 컬럼 추가만 포함.

### 6-2. 도메인별 대상 테이블

| 도메인 | 대상 테이블 | 추가 컬럼(예시명) | 비고 |
|--------|-----------|-----------------|------|
| status-prefix | `status_prefix_config` | `lastAppliedAt` | 길드당 1행 |
| sticky-message | `sticky_message_config` | `lastAppliedAt` | 채널당 N행 — 행별 개별 추적 |
| role-panel | `role_panel_config` | `lastAppliedAt` | 패널당 1행 |
| auto-channel | `auto_channel_config` | `lastSavedAt` | 메시지 게시 없음 — 저장 시각으로 대체 |

> 컬럼명 및 DB 스키마 세부사항은 `database-architect` 단계에서 확정한다. 위 컬럼명은 요구사항 예시다.

---

## 7. 엣지 케이스

### 7-1. 메시지 삭제 감지 없음

현재 4개 도메인 모두 Discord `messageDelete` 이벤트 핸들러가 없다. 즉, 유저가 디스코드에서 봇 메시지를 직접 지워도 봇이 감지하지 못한다.

- **처리 방식**: "다시 반영" 버튼으로 수동 복구.
- **배지 동작**: 디스코드에서 메시지가 지워져도 `lastAppliedAt`은 "마지막으로 성공했던 시각"을 유지한다. 배지는 "현재 살아있음"을 보장하지 않고 "이 시각에 반영에 성공했다"는 사실만 표시한다. 이는 의도된 설계다.
- **자동복구**: 다음 저장 또는 다시 반영 시 edit 실패→신규 전송 폴백이 트리거되어 자연히 복구된다.

### 7-2. 미반영 상태에서 배지 표기

- `lastAppliedAt`이 NULL인 경우 배지는 "미반영"으로 표시한다.
- role-panel의 경우 기존에는 `published = false`로 표현되던 상태다. To-Be에서는 저장 즉시 반영 시도를 하므로, 저장 성공 시 NULL이 남지 않는다. 단, 봇이 오프라인이거나 채널 권한 문제로 반영에 실패하면 NULL(또는 이전 성공 시각)이 유지된다.

### 7-3. 비활성(enabled = false) 상태일 때 배지

- sticky-message의 `enabled = false` 케이스: 저장 시 디스코드 메시지 전송/삭제를 건너뛴다. `lastAppliedAt`은 갱신하지 않는다.
- 배지 표시 규칙: enabled = false일 때는 `lastAppliedAt` 값과 무관하게 배지를 "비활성" 상태로 표기하거나 숨긴다. 구체적 표기 방식은 구현 단계에서 결정한다.

### 7-4. 채널 삭제 또는 봇 권한 부족 시 "다시 반영" 실패

- 봇이 대상 채널에 **Send Messages** 권한이 없거나 채널이 삭제된 경우, 다시 반영 요청이 실패한다.
- 실패 시 `lastAppliedAt`을 갱신하지 않는다.
- 웹에 구체적 에러 메시지를 토스트로 표시한다 (예: "봇이 해당 채널에 메시지를 보낼 권한이 없습니다.").

### 7-5. role-panel 신규 패널 (아직 `messageId` 없음) 상태에서 저장

- 처음 저장(신규 패널): DB persist → 즉시 디스코드 신규 전송 → `messageId` 저장 → `lastAppliedAt` 기록.
- 기존 "저장(미게시)→게시" 2단계 흐름이 없어지므로, 신규 패널 저장 시 반드시 채널 선택이 완료돼 있어야 반영이 가능하다. 채널이 선택되지 않은 경우 저장 시 유효성 검증 오류를 반환한다.

---

## 8. 수용 기준 (Acceptance Criteria)

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| AC-01 | role-panel 패널 저장 | 저장 버튼 클릭 한 번으로 DB 저장 + 디스코드 메시지 게시/갱신 완료. "게시" 버튼 없음. |
| AC-02 | 저장 성공 후 배지 | 설정 페이지에 "마지막 반영: {방금 전}" 배지가 표시된다. |
| AC-03 | 페이지 재진입 후 배지 | 설정 페이지를 닫고 다시 열어도 "마지막 반영: {이전 시각}" 배지가 유지된다. |
| AC-04 | 미반영 상태 배지 | `lastAppliedAt`이 없는 상태에서 배지가 "미반영"으로 표시된다. |
| AC-05 | 다시 반영 버튼 클릭 | 설정 변경 없이 버튼 클릭 시 디스코드 메시지가 재게시되고 배지가 최신 시각으로 갱신된다. |
| AC-06 | 다시 반영 실패 | 채널 삭제 또는 권한 부족 시 에러 토스트가 표시되고 배지는 이전 성공 시각 유지. |
| AC-07 | status-prefix 저장 | 기존과 동일하게 저장 = 즉시 반영. 반영 시각이 DB에 기록되고 배지에 표시됨. |
| AC-08 | sticky-message 채널별 배지 | 채널별 고정메세지 카드에 각각의 마지막 반영 시각이 표시된다. |
| AC-09 | auto-channel 배지 | "마지막 저장: {시각}" 배지 표시. 다시 반영 버튼 없음. |
| AC-10 | enabled=false 상태 | sticky-message의 비활성 항목에서 다시 반영을 호출해도 디스코드 메시지 전송이 없고 배지 갱신 없음. |

---

## 9. 사용자 여정

### 타겟 유저 세그먼트 1 — 길드 관리자 (설정 변경 및 반영 주체)

**시나리오**: 관리자가 role-panel 설정을 수정하고 디스코드에 반영한다.

| 단계 | 페이지 | 행동 |
|------|--------|------|
| 1 | 웹 랜딩 / 로그인 | Discord OAuth 로그인 |
| 2 | `/settings/guild/{guildId}/role-panel` | 역할 패널 설정 페이지 접근. 배지에 "마지막 반영: 어제 오후 3:00" 표시 확인 |
| 3 | `/settings/guild/{guildId}/role-panel` | 버튼 라벨 수정 |
| 4 | `/settings/guild/{guildId}/role-panel` | "저장" 버튼 클릭 (게시 버튼 없음) |
| 5 | `/settings/guild/{guildId}/role-panel` | 성공 토스트 + 배지 "마지막 반영: 방금 전" 갱신 확인 |
| 6 | Discord 채널 | 수정된 버튼이 포함된 패널 메시지 확인 |

---

**시나리오**: 관리자가 디스코드에서 실수로 고정메세지를 삭제했음을 발견하고 복구한다.

| 단계 | 페이지 | 행동 |
|------|--------|------|
| 1 | Discord 채널 | 고정메세지가 사라진 것을 확인 |
| 2 | `/settings/guild/{guildId}/sticky-message` | 고정메세지 설정 페이지 접근. 카드의 배지 확인 ("마지막 반영: 3일 전") |
| 3 | `/settings/guild/{guildId}/sticky-message` | 해당 채널 카드의 "다시 반영" 버튼 클릭 |
| 4 | `/settings/guild/{guildId}/sticky-message` | 성공 토스트 + 배지 "마지막 반영: 방금 전" 갱신 확인 |
| 5 | Discord 채널 | 고정메세지 복구 확인 |

---

### 타겟 유저 세그먼트 2 — 신규 관리자 (처음 설정하는 주체)

**시나리오**: 신규 관리자가 role-panel을 처음 만들고 디스코드에 게시한다.

| 단계 | 페이지 | 행동 |
|------|--------|------|
| 1 | `/settings/guild/{guildId}/role-panel` | "새 패널" 클릭, 채널·Embed·버튼 설정 완료 |
| 2 | `/settings/guild/{guildId}/role-panel` | "저장" 버튼 클릭 (1번의 클릭으로 완료) |
| 3 | `/settings/guild/{guildId}/role-panel` | 성공 토스트 + 배지 "마지막 반영: 방금 전" 확인 |
| 4 | Discord 채널 | 게시된 패널 메시지와 버튼 확인 |

*기존 flow(저장→게시 2단계)에서 저장(1단계)으로 단순화됨.*

---

## 10. IA (정보구조)

```
설정 저장/반영 모델 통일 — 영향 범위
│
├── 웹 설정 표면 (apps/web)
│   │
│   ├── /settings/guild/[guildId]/status-prefix/
│   │   ├── 저장 버튼 (기존 동일)
│   │   ├── [배지] 마지막 반영: {시각} / 미반영
│   │   └── [다시 반영] 버튼
│   │
│   ├── /settings/guild/[guildId]/sticky-message/
│   │   └── 채널별 카드
│   │       ├── 기존 설정 필드
│   │       ├── [배지] 마지막 반영: {시각} / 미반영
│   │       └── [다시 반영] 버튼
│   │
│   ├── /settings/guild/[guildId]/role-panel/
│   │   ├── 패널 탭 바
│   │   └── 패널 편집 영역
│   │       ├── 기존 설정 필드
│   │       ├── [배지] 마지막 반영: {시각} / 미반영
│   │       ├── [저장] 버튼 (게시 통합 — "게시" 버튼 삭제)
│   │       └── [다시 반영] 버튼
│   │
│   └── /settings/guild/[guildId]/auto-channel/
│       ├── 저장 버튼 (기존 동일)
│       └── [배지] 마지막 저장: {시각}
│
├── API 표면 (apps/api)
│   │
│   ├── status-prefix
│   │   └── POST /api/guilds/{guildId}/status-prefix/config
│   │       └── 응답에 lastAppliedAt 포함 (신규)
│   │
│   ├── sticky-message
│   │   ├── POST /api/guilds/{guildId}/sticky-message
│   │   │   └── 응답에 lastAppliedAt 포함 (신규)
│   │   └── POST /api/guilds/{guildId}/sticky-message/{id}/re-apply (신규 또는 기존 재활용)
│   │
│   ├── role-panel
│   │   ├── PUT /api/guilds/{guildId}/role-panel/{panelId}
│   │   │   └── 저장 + 즉시 게시 통합 (기존: 저장만)
│   │   └── POST /api/guilds/{guildId}/role-panel/{panelId}/publish
│   │       └── "다시 반영" 용도로 유지 또는 deprecated
│   │
│   └── auto-channel
│       └── PUT /api/guilds/{guildId}/auto-channel/{configId}
│           └── 응답에 lastSavedAt 포함 (신규)
│
└── DB 표면 (apps/api/src/migrations/)
    ├── status_prefix_config: lastAppliedAt 컬럼 추가
    ├── sticky_message_config: lastAppliedAt 컬럼 추가
    ├── role_panel_config: lastAppliedAt 컬럼 추가
    └── auto_channel_config: lastSavedAt 컬럼 추가
```

---

## 11. 비기능 요구사항

- **비파괴 마이그레이션**: 모든 컬럼 추가는 `nullable` 방식. 기존 데이터 손실 없음.
- **멱등성**: "다시 반영" 버튼의 반복 클릭은 항상 같은 동작(최신 설정으로 재게시)을 수행한다.
- **응답시간**: "다시 반영" 버튼 클릭 후 Discord API 응답까지 로딩 상태를 유지한다. 통상 3초 이내 완료를 목표로 한다.
- **i18n**: 배지 문구, 버튼 라벨, 에러 메시지는 모두 `libs/i18n/locales/{ko,en}/web` 하위 i18n 키로 관리한다.

---

## 사용자 확인 필요 항목

이번 1차 변경은 다음 4분야 기준으로 검토했다.

| 분야 | 판정 | 근거 |
|------|------|------|
| **법무** | 해당 없음 | 마지막 반영 시각은 설정 조작 시각 메타데이터로, Discord 사용자 PII 아님. 신규 개인정보 수집 없음. |
| **결제** | 해당 없음 | 결제 기능 변경 없음. |
| **권한** | 해당 없음 | 신규 Discord OAuth2 스코프 또는 봇 권한(permissions) 추가 없음. 기존 저장 API와 동일한 가드(`JwtAuthGuard` + `GuildMembershipGuard`) 상속. "다시 반영" 버튼 API도 동일 가드 적용. |
| **DB 파괴적 변경** | 해당 없음 | 기존 컬럼 삭제·타입 변경 없음. nullable 컬럼 추가만 포함. `published` 컬럼(role-panel)은 유지. |

현재 기준 미결 결정 없음. 구현 단계에서 아래 사항을 확정해야 한다 (PRD 게이트 아님):
- `published` 컬럼 deprecated 여부 및 시점
- role-panel `PUT` 통합 vs `/publish` 엔드포인트 분리 유지 여부
- sticky-message `enabled = false` 상태에서 배지 숨김 vs "비활성" 표기 방식
- auto-channel "다시 반영" 버튼의 의미 정의 여부 (후속 PR 논의)
