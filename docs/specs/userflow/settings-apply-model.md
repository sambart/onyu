# 설정 저장/반영 모델 — 유저플로우

> 설정 저장 시 즉시 디스코드 반영 + 마지막 반영 시각 배지 + 다시 반영 흐름을 다룬다.
> 대상 도메인: status-prefix / sticky-message / role-panel / auto-channel.
> 웹 표면 기준: 각 도메인의 `/settings/guild/[guildId]/{domain}/` 페이지.
> 🔒 마커: Discord 봇 권한(Send Messages / Manage Messages), DB 저장 시각 기록 관련 줄.
>
> 모든 플로우는 `_index.md`의 "공통 전제 (웹 대시보드 진입)" 흐름을 전제한다.

---

## UF-SETTINGS-APPLY-001: 설정 페이지 진입 — 마지막 반영 시각 배지 표시 (공통 4개 도메인)

**적용 경로**:
- `/settings/guild/[guildId]/status-prefix/`
- `/settings/guild/[guildId]/sticky-message/`
- `/settings/guild/[guildId]/role-panel/`
- `/settings/guild/[guildId]/auto-channel/`

### 입력

관리자가 위 4개 도메인 중 하나의 설정 페이지에 접근

### 처리

1. (공통 전제: 웹 대시보드 진입 + 서버 관리 권한 검증 통과)
2. 해당 도메인 설정 조회 API 호출 — 응답에 `lastAppliedAt`(또는 `lastSavedAt`) 포함
3. `lastAppliedAt`이 존재하면 배지를 "마지막 반영: {상대적 시각}" 형태로 렌더
4. `lastAppliedAt`이 NULL이면 배지를 "미반영"으로 렌더
5. auto-channel의 경우 `lastSavedAt` 필드를 사용하며 배지 문구는 "마지막 저장: {시각}"으로 표기
6. sticky-message의 경우 배지는 페이지 공통 영역이 아닌 채널별 카드 단위로 각각 렌더
7. role-panel의 경우 배지는 패널 편집 영역 상단에 렌더 (탭 전환 시 해당 패널의 값으로 갱신)

### 출력

- 설정 페이지가 렌더되며 배지가 함께 표시됨
- `lastAppliedAt` NULL: 배지 "미반영" 표시
- `lastAppliedAt` 존재: 배지 "마지막 반영: {시각}" 표시

### 엣지케이스

- 설정 자체가 아직 한 번도 저장되지 않은 신규 상태(설정 레코드 없음) → 배지 미표시 또는 "미반영" 표시, 저장 버튼은 활성
- API 응답 실패 → 배지 영역 오류 표시 또는 비표시, 나머지 설정 UI는 정상 렌더 시도
- role-panel 탭이 여러 개일 때 탭 전환 → 각 패널의 `lastAppliedAt` 값으로 배지 독립 표시

---

## UF-SETTINGS-APPLY-002: 저장 → 즉시 디스코드 반영 → 배지 갱신 (status-prefix / sticky-message / role-panel 공통)

**입력**: 관리자가 설정 변경 후 저장 버튼 클릭
- status-prefix: `/settings/guild/[guildId]/status-prefix/`
- sticky-message: `/settings/guild/[guildId]/sticky-message/` 채널 카드의 저장
- role-panel: `/settings/guild/[guildId]/role-panel/` 패널 편집 영역의 저장

### 입력

관리자가 설정 변경 후 저장 버튼 클릭

### 처리

1. 저장 버튼 클릭 시 즉시 로딩 상태 진입 (중복 클릭 방지)
2. 클라이언트 유효성 검사 (도메인별 필수 필드: 채널 선택, 설정 값 등)
3. 유효성 통과 시 저장 API 호출
4. API: 설정 DB persist (upsert)
5. 🔒 API가 Bot-API-Client 경유 봇에 디스코드 반영 요청 전달
6. 봇: `messageId`가 있으면 기존 디스코드 메시지 edit, 없으면 신규 전송
7. 봇이 디스코드 메시지 post/edit 성공 응답 수신 시 해당 시각을 `lastAppliedAt`으로 🔒 DB에 기록
8. API 응답에 갱신된 `lastAppliedAt` 포함하여 반환
9. 웹 클라이언트가 배지를 새 `lastAppliedAt` 값으로 즉시 갱신 (페이지 재로드 없음)
10. 성공 토스트 표시

### 출력

- 저장 성공: 성공 토스트, 배지 "마지막 반영: 방금 전" 갱신
- 저장 성공 + 디스코드 반영 실패: 오류 토스트, `lastAppliedAt` 미갱신 (이전 값 또는 NULL 유지)
- 저장 자체 실패: 오류 토스트, 설정 변경 미반영

### 엣지케이스

- 채널이 삭제되어 봇이 메시지 전송 불가 → 저장은 성공하나 반영 실패 → 오류 토스트, `lastAppliedAt` 미갱신
- 🔒 봇에 대상 채널 Send Messages 권한 없음 → 반영 실패 → 오류 토스트, 권한 부족 안내 포함
- 봇 자체 오프라인 또는 Bot-API-Client 통신 실패 → 저장은 성공하나 반영 실패, 오류 토스트
- 기존 디스코드 메시지가 수동 삭제된 상태 → edit 시도 실패 → 신규 전송으로 자동 폴백, `lastAppliedAt` 갱신

---

## UF-SETTINGS-APPLY-003: 저장 → 마지막 저장 시각 배지 갱신 (auto-channel 전용)

auto-channel은 디스코드에 직접 메시지를 게시하지 않으므로 반영 개념이 다름.

### 입력

관리자가 auto-channel 설정 변경 후 저장 버튼 클릭 (`/settings/guild/[guildId]/auto-channel/`)

### 처리

1. 저장 버튼 클릭 시 로딩 상태 진입
2. 클라이언트 유효성 검사
3. 저장 API 호출
4. API: 설정 DB persist, 저장 완료 시각을 `lastSavedAt`으로 🔒 DB에 기록
5. 봇 캐시 갱신 알림 (기존 캐시 갱신 구조 동일)
6. API 응답에 `lastSavedAt` 포함
7. 웹 클라이언트가 배지를 새 `lastSavedAt` 값으로 즉시 갱신

### 출력

- 저장 성공: 성공 토스트, 배지 "마지막 저장: 방금 전" 갱신
- 저장 실패: 오류 토스트

### 엣지케이스

- 봇 캐시 갱신 알림 실패 → 저장은 성공, 캐시는 다음 트리거 시 자연 갱신 — 배지는 정상 갱신
- 설정 미변경 상태로 저장 → 동일하게 `lastSavedAt` 갱신

---

## UF-SETTINGS-APPLY-004: 다시 반영 버튼 — 성공 (status-prefix / sticky-message / role-panel)

**입력**: 관리자가 각 도메인 설정 페이지에서 "다시 반영" 버튼 클릭
- status-prefix: 페이지 상단 저장 버튼 인근
- sticky-message: 채널별 카드 내 "다시 반영" 버튼
- role-panel: 패널 편집 영역 상단의 "다시 반영" 버튼

### 입력

관리자가 각 도메인 설정 페이지에서 "다시 반영" 버튼 클릭

### 처리

1. "다시 반영" 버튼 클릭 시 로딩 상태 진입 (중복 클릭 방지)
2. 재반영 API 호출 (설정 변경 없이 현재 DB 저장 설정으로 반영 요청)
3. API: DB에서 현재 설정 조회
4. 🔒 API가 Bot-API-Client 경유 봇에 재반영 요청 전달
5. 봇: `messageId`가 있으면 기존 메시지 edit, 없으면 신규 전송
6. 성공 시 `lastAppliedAt` 갱신 + API 응답에 포함
7. 웹 클라이언트가 배지를 새 `lastAppliedAt` 값으로 즉시 갱신
8. 성공 토스트 표시

### 출력

- 성공 토스트, 배지 "마지막 반영: 방금 전" 갱신

### 엣지케이스

- 기존 디스코드 메시지가 수동 삭제된 상태 → edit 실패 → 신규 전송 폴백 → `lastAppliedAt` 갱신 (정상 복구)
- `lastAppliedAt`이 NULL(미반영)이어도 저장된 설정이 있으면 반영 가능 → 버튼 활성, 실행 정상
- 설정이 아직 저장된 적 없는 신규 상태 → 버튼 비활성, 클릭 불가

---

## UF-SETTINGS-APPLY-005: 다시 반영 버튼 — 실패 (채널 삭제 또는 봇 권한 부족)

### 입력

관리자가 "다시 반영" 버튼 클릭 (UF-SETTINGS-APPLY-004와 동일한 진입점)

### 처리

1~4. (UF-SETTINGS-APPLY-004와 동일)
5. 봇이 대상 채널에 메시지 전송 시도
6. 채널이 삭제됐거나 봇 권한이 부족하여 전송 실패
7. API에 실패 응답 전달
8. `lastAppliedAt` 미갱신 (이전 값 또는 NULL 유지)
9. 웹 클라이언트에 에러 응답
10. 에러 토스트 표시

### 출력

- 에러 토스트 (사유 포함: 채널 없음, 권한 부족 등)
- 배지는 이전 값 그대로 유지 (미갱신)

### 엣지케이스

- 🔒 봇 Send Messages 권한 부족 → 실패, 권한 부족 사유가 포함된 에러 토스트
- 채널이 삭제됨 → 실패, 채널을 찾을 수 없다는 에러 토스트
- 봇 자체 오프라인 → 실패, 일반 서버 오류 에러 토스트
- 연속 클릭 → 첫 번째 요청 처리 중 버튼 비활성화로 중복 요청 차단

---

## UF-SETTINGS-APPLY-006: role-panel 신규 패널 최초 저장 — 게시 통합 (To-Be)

role-panel의 핵심 변경: 기존 "저장→게시" 2단계 → "저장" 단일 액션으로 통합.

### 입력

관리자가 새 패널 생성 후 채널·Embed·버튼 설정을 완료하고 저장 버튼 클릭 (`/settings/guild/[guildId]/role-panel/`)

### 처리

1. (공통 전제 통과)
2. 클라이언트 유효성 검사: 채널 선택 여부(미선택 시 저장 전 차단), 버튼 개수(0개 차단, 25개 초과 차단)
3. 역할 선택 유효성: 🔒 부여 불가 역할(봇 역할 위계 초과·managed·ADMINISTRATOR) 비활성 처리
4. 저장 API 호출 (`PUT /api/guilds/{guildId}/role-panel/{panelId}`)
5. API: 패널·버튼 목록 DB persist
6. 🔒 API가 봇에 즉시 디스코드 신규 메시지 전송 요청 (기존 messageId 없으므로 신규 전송)
7. 봇이 대상 채널에 Embed + 버튼 메시지 신규 전송
8. 봇이 반환받은 `messageId`를 🔒 DB에 저장
9. 전송 완료 시각을 `lastAppliedAt`으로 🔒 DB에 기록
10. API 응답에 `messageId` + `lastAppliedAt` 포함
11. 웹 클라이언트 배지 "마지막 반영: 방금 전" 갱신, 성공 토스트

### 출력

- 저장 성공 + 디스코드 게시 성공: 성공 토스트, 배지 갱신, 패널에 messageId 기록됨
- 저장 성공 + 디스코드 게시 실패: 오류 토스트, `lastAppliedAt` NULL 유지

### 엣지케이스

- 채널 미선택 상태로 저장 시도 → 클라이언트에서 유효성 오류, 저장 요청 차단
- 저장 직후 채널이 삭제됨(극히 드문 레이스) → 봇 전송 실패, 오류 토스트, messageId 미기록
- 🔒 봇 Send Messages 권한 없음 → 봇 전송 실패, 오류 토스트, 권한 부족 안내
- 버튼 목록에 🔒 부여 불가 역할 포함 → API 서버 측 재검증 실패, 저장 차단

---

## UF-SETTINGS-APPLY-007: role-panel 기존 패널 수정 저장 — 즉시 재동기화 (To-Be)

### 입력

관리자가 기존 패널(messageId 있음) 설정 변경 후 저장 버튼 클릭

### 처리

1. (공통 전제 통과)
2. 클라이언트 유효성 검사
3. 저장 API 호출
4. API: 패널·버튼 목록 DB update
5. `messageId`가 있으면 봇에 기존 메시지 edit 요청 → 봇이 edit 성공 시 `lastAppliedAt` 갱신
6. 채널이 변경된 경우: 기존 채널 메시지 삭제 시도 → 새 채널에 신규 전송 → `messageId` 갱신
7. 배지 즉시 갱신, 성공 토스트

### 출력

- 저장·재동기화 성공: 성공 토스트, 배지 갱신, Discord 채널 메시지가 변경 내용으로 갱신됨

### 엣지케이스

- 기존 Discord 메시지가 수동 삭제됨 → edit 실패 → 해당 채널에 신규 전송으로 폴백, `messageId` 갱신, `lastAppliedAt` 갱신 (정상 복구)
- 채널 변경 시 기존 채널 메시지 삭제 실패(이미 삭제됨) → 내부 로그 기록 후 새 채널 전송 계속 진행
- 🔒 새 채널에 봇 권한 부족 → 전송 실패, 오류 토스트

---

## UF-SETTINGS-APPLY-008: 비활성(enabled=false) 상태에서 저장 (sticky-message 전용)

### 입력

관리자가 sticky-message 채널 카드를 비활성 상태(`enabled = false`)로 설정한 후 저장

### 처리

1. (공통 전제 통과)
2. 저장 API 호출
3. API: `enabled = false` 상태로 DB persist
4. 비활성 상태이므로 봇에 디스코드 메시지 전송/갱신 요청을 생략
5. `lastAppliedAt` 갱신하지 않음
6. API 응답에 `enabled = false`, `lastAppliedAt` 이전 값(변경 없음) 포함

### 출력

- 저장 성공: 성공 토스트, `lastAppliedAt` 미갱신, 배지는 이전 값 유지

### 엣지케이스

- `enabled = false` 상태에서 "다시 반영" 클릭 → 비활성 상태에서는 반영 대상이 없으므로 디스코드 메시지 전송 없음, `lastAppliedAt` 미갱신
- `enabled = false`에서 `enabled = true`로 변경 후 저장 → 즉시 디스코드 반영 시도 (UF-SETTINGS-APPLY-002 흐름으로 전환)

---

## UF-SETTINGS-APPLY-009: 배지 표기 — 디스코드에서 메시지가 삭제된 경우 (정보성 흐름)

이 흐름은 사용자가 명시적으로 취하는 액션이 없는 상태(배지가 "현재 상태"를 보장하지 않음을 인지하는 맥락)를 설명한다.

### 입력

관리자가 디스코드 채널에서 봇 메시지를 직접 삭제했으나 대시보드에서는 이를 감지하지 못한 상태

### 처리

1. 봇이 `messageDelete` 이벤트를 구독하지 않으므로 메시지 삭제를 실시간으로 감지하지 않음
2. 배지의 `lastAppliedAt`은 "마지막으로 반영에 성공한 시각"이며 "현재 디스코드에 메시지가 살아있음"을 보장하지 않음
3. 배지는 갱신되지 않고 마지막 성공 시각을 유지함 — 의도된 설계

### 출력

- 배지에 마지막 성공 반영 시각이 표시된 채 유지 (현재 디스코드 실제 상태와 다를 수 있음)

### 엣지케이스

- 관리자가 디스코드에서 직접 메시지 삭제를 인지한 경우 → "다시 반영" 버튼 클릭으로 복구 (UF-SETTINGS-APPLY-004 흐름)
- 다음 설정 저장 시 edit 실패 → 신규 전송 폴백으로 자동 복구, `lastAppliedAt` 갱신

---

## UF-SETTINGS-APPLY-010: sticky-message 채널별 카드 단위 다시 반영

sticky-message는 여러 채널에 독립적으로 고정메세지를 운영하므로 카드 단위로 "다시 반영"을 수행한다.

### 입력

관리자가 특정 채널 카드의 "다시 반영" 버튼 클릭 (`/settings/guild/[guildId]/sticky-message/`)

### 처리

1. 해당 채널의 고정메세지 설정 ID를 파라미터로 재반영 API 호출
2. API: 해당 채널 설정 조회 → `enabled = false` 확인 → 비활성이면 실행 거부
3. `enabled = true` 확인 → 🔒 봇에 해당 채널 재반영 요청
4. 봇: `messageId`가 있으면 edit, 없으면 신규 전송
5. 성공 시 해당 카드의 `lastAppliedAt` 갱신
6. 해당 카드의 배지만 즉시 갱신 (다른 채널 카드에 영향 없음)

### 출력

- 성공 토스트, 해당 채널 카드 배지만 "마지막 반영: 방금 전" 갱신

### 엣지케이스

- `enabled = false` 상태의 카드에서 다시 반영 → API가 실행 거부, 에러 응답 또는 별도 안내
- 채널 삭제 / 봇 권한 부족 → UF-SETTINGS-APPLY-005 실패 흐름 동일

---

## UF-SETTINGS-APPLY-011: role-panel "다시 반영" — 패널 단위 재게시

### 입력

관리자가 특정 패널 편집 영역의 "다시 반영" 버튼 클릭 (`/settings/guild/[guildId]/role-panel/`)

### 처리

1. 해당 패널 ID를 파라미터로 재반영 API 호출
2. API: 패널 설정 + 버튼 목록 조회
3. 🔒 Bot-API-Client 경유 봇에 재반영 요청 (기존 publish 엔드포인트 재활용 또는 re-apply 전용 엔드포인트)
4. 봇: `messageId`가 있으면 Discord 메시지 edit, 없으면 신규 전송
5. 성공 시 `lastAppliedAt` 갱신
6. 해당 패널 탭의 배지 갱신, 성공 토스트

### 출력

- 성공 토스트, 해당 패널 배지 갱신

### 엣지케이스

- 🔒 봇 권한 부족(Send Messages 없음) → 재게시 실패, 에러 토스트
- 채널 삭제 → 재게시 실패, 에러 토스트 (채널 재선택 유도 안내)
- `messageId` 없음(신규 패널 미반영 상태) → 신규 전송 경로로 처리

---

## 도메인별 핵심 차이 요약

| 도메인 | 저장 시 디스코드 반영 | 배지 위치 | 배지 문구 | 다시 반영 | 단위 |
|--------|---------------------|----------|-----------|----------|------|
| status-prefix | 즉시 반영 (기존과 동일) | 페이지 상단 저장 버튼 인근 | 마지막 반영: {시각} | 있음 | 길드당 1개 |
| sticky-message | 즉시 반영 (기존과 동일), enabled=false면 생략 | 채널별 카드 내부 | 마지막 반영: {시각} | 있음 (카드 단위) | 채널당 독립 |
| role-panel | 즉시 반영 (저장+게시 통합 — 기존 게시 버튼 폐지) | 패널 편집 영역 상단 | 마지막 반영: {시각} | 있음 (패널 단위) | 패널당 독립 |
| auto-channel | 반영 없음 (캐시 갱신만) | 페이지 상단 저장 버튼 인근 | 마지막 저장: {시각} | 없음 (1차 제외) | 길드당 1개 |
