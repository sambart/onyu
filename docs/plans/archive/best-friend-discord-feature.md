# 친밀도 그래프 + 베스트 프렌드 TOP 리포트 — 상세 검토안

> 작성일: 2026-05-04
> 상위 문서: [trend-driven-feature-roadmap.md](./trend-driven-feature-roadmap.md) Tier 1 후보 B
> 본 문서는 **검토용 상세 분석**이며, 채택 결정 후 PRD(`docs/specs/prd/relationship.md` 또는 `voice-co-presence.md` 확장)와 구현 Plan으로 분기한다.

---

## 1. 현 상태 재평가 — "이미 무엇이 있는가"

상위 로드맵에서는 본 후보를 "데이터는 적재 중인데 소비자 0개"로 평가했으나, 실제 코드베이스 점검 결과 **웹 대시보드 시각화는 거의 완성 상태**다. 따라서 신규 가치를 정확히 분리해서 평가해야 한다.

### 1.1. 이미 구현된 부분 (재사용 가능)

| 항목 | 파일/엔티티 | 상태 |
|------|-------------|------|
| 쌍 단위 일별 적재 | `VoiceCoPresencePairDailyOrm` | ✅ 양방향 저장 |
| 사용자 단위 일별 적재 | `VoiceCoPresenceDailyOrm` | ✅ |
| 90일 세션 보존 | `co-presence-cleanup.scheduler.ts` | ✅ |
| TOP N 페어 조회 API | `GET /api/guilds/:guildId/co-presence/top-pairs?days&limit` | ✅ `CoPresenceAnalyticsService.getTopPairs()` |
| 네트워크 그래프 시각화 | `CoPresenceGraph.tsx` (sigma.js + Louvain) | ✅ |
| 친밀도 TOP 패널 (웹) | `TopPairsPanel.tsx` | ✅ |
| 관계 상세 테이블/모달 | `PairsTable.tsx`, `PairDetailModal.tsx` | ✅ |
| 일별 추이 차트 | `DailyTrendChart.tsx` | ✅ |
| 고립 멤버 감지 | `IsolatedMemberList.tsx` | ✅ |
| 닉네임/아바타 매핑 | `GuildMemberService.findByUserIds()` | ✅ |

### 1.2. 미구현 공백 — 본 검토안의 진짜 범위

| 항목 | 상태 | 본 후보의 가치 |
|------|------|----------------|
| 디스코드 **슬래시 커맨드** 친밀도 조회 (`/친한친구`, `/친밀도` 등) | ❌ 없음 | **핵심 신규 가치**. `/me`(`apps/bot/src/command/me.command.ts`)는 본인 음성 활동만, 친구 정보 없음 |
| 주간 자동 리포트의 **친밀도 섹션** | ❌ 없음 | `WeeklyReportService.collectReportData()`는 currentStats/topUsers/topChannels/aiAnalysis만 수집. 친밀도 섹션 미포함 |
| **사용자 opt-out** 정책 (`PrivacyConfig`) | ❌ 없음 | 현재 누구나 타인 친밀도 조회 가능 → 사생활 이슈 미해결 |
| AI 한 줄 코멘트(베프 페어 자연어 묘사) | ❌ 없음 | Gemini 활용 신규 영역 |
| 본인 시각의 베프 TOP — `/친구 [user]` 류 | ❌ 없음 | 웹 `top-pairs`는 서버 전체 TOP. **개인 시점 TOP은 별도 쿼리/UI 필요** |

### 1.3. 재산정한 규모

상위 로드맵에서 "M(데이터·인프라 이미 존재)"로 평가했으나, 실제 공백은 **디스코드 UX + 사생활 정책 + 주간 리포트 통합**이며, 이는 **S~M(1~2주)** 수준으로 재산정된다.

---

## 2. 기능 정의

> **출력 형식 결정**: 모든 사용자 대면 슬래시 커맨드(F-FRIEND-001/002)는 **Embed가 아닌 Canvas 기반 PNG 이미지**로 응답한다.
> 근거: 기존 `/me` 커맨드가 동일 패턴(`@napi-rs/canvas` + bot-api base64 전달 + `AttachmentBuilder`)을 사용 중이며, 시각적 일관성·정보 밀도·외부 공유성에서 Embed 대비 우위.
> 자세한 구현 패턴은 §2A 참고.

### 2A. Canvas 출력 채택 근거 및 공통 패턴

#### 채택 근거
| 평가 축 | Embed | Canvas (PNG) |
|---|---|---|
| 시각적 일관성(/me와 통일) | ❌ 다름 | ✅ 동일 |
| 정보 밀도(아바타 + 친밀도 바 + 시간 라벨) | △ 글자/필드 한계 | ✅ 자유로운 레이아웃 |
| 외부 공유성(스크린샷·트위터/X) | △ Discord 의존 | ✅ 단독 이미지 |
| 토큰 비용/속도 | ✅ 가벼움 | △ 캔버스 렌더 ~50–150ms |
| 다국어 폰트(CJK + emoji) | ✅ Discord가 처리 | ⚠️ 폰트 등록 필요(이미 `ProfileCardRenderer`에서 해결) |
| 인터랙션 버튼(Link 버튼) | ✅ 자연 | ✅ `components`로 동시 첨부 가능 |

→ Onyu 정체성("음성 데이터의 시각화")과 직결되므로 **Canvas 채택**. Link 버튼은 `components` 배열로 첨부 이미지와 병행한다.

#### 공통 구현 패턴 (`/me` 그대로 답습)

```
[Bot]                                    [API]
/친한친구 슬래시 커맨드                    
  ├─ interaction.deferReply()           
  ├─ BotApiClient.getMyBestFriends()  ──► POST /bot-api/co-presence/best-friends
  │     (guildId, userId, displayName,        │
  │      avatarUrl, period, limit)            ├─ CoPresenceAnalyticsService.getMyTopPeers()
  │                                           ├─ UserPrivacyConfigService.filterPeers()
  │                                           ├─ (선택) VoiceAiAnalysisService.generateBestFriendComment()
  │                                           └─ BestFriendCardRenderer.render() → PNG Buffer
  │                                                                              → base64
  │ ◄─────────────────── { ok, data: { imageBase64 }, days } ────────────────────┘
  ├─ Buffer.from(base64, 'base64')
  ├─ new AttachmentBuilder(buf, { name: 'best-friends.png' })
  └─ interaction.editReply({ files: [attachment], components: [linkButtonRow] })
```

#### 신규 모듈
- **API**: `apps/api/src/channel/voice/co-presence/application/best-friend-card-renderer.ts`
  - `ProfileCardRenderer`와 동일한 폰트 등록 패턴(`NotoSansCJK`, `NotoColorEmoji`)
  - `render(data: BestFriendCardData, displayName: string, avatarUrl: string): Promise<Buffer>`
- **API**: `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts` 신규
  - `POST /bot-api/co-presence/best-friends` (F-FRIEND-001용)
  - `POST /bot-api/co-presence/affinity` (F-FRIEND-002용)
- **Bot**: `apps/bot/src/command/friend/best-friend.command.ts` (`/me` 패턴 그대로)
- **공통 라이브러리**: `BotApiClientService`에 `getMyBestFriends()`, `getAffinity()` 메서드 추가

---

### F-FRIEND-001: 본인 베스트 프렌드 조회 `/친한친구` (Canvas)

- **트리거**: 사용자가 디스코드에서 `/친한친구` 입력
- **입력**:
  | 파라미터 | 타입 | 기본값 | 설명 |
  |---|---|---|---|
  | `period` | choice(`7`, `30`, `90`) | 30 | 집계 기간(일) |
  | `limit` | integer(3~5) | 5 | TOP N (카드 디자인 안정성을 위해 5 고정 권장) |

- **처리**:
  1. `interaction.deferReply()` (이미지 생성 시간 확보)
  2. Bot이 `BotApiClient.getMyBestFriends()` 호출 — 본인 `displayName`/`avatarUrl`을 함께 전달
  3. API 측에서 다음 데이터 수집:
     - `CoPresenceAnalyticsService.getMyTopPeers(guildId, userId, period, limit)` — 신규 메서드
     - `UserPrivacyConfigService.filter()` — 비공개 사용자 익명화/제외
     - `GuildMemberService.findByUserIds()` — peer 닉네임/아바타 일괄 조회
     - (선택) `VoiceAiAnalysisService.generateBestFriendComment()` — AI 한 줄 코멘트
  4. `BestFriendCardRenderer.render()` → PNG Buffer → base64
  5. Bot이 `AttachmentBuilder`로 첨부 + Link 버튼 함께 전송

- **카드 레이아웃** (800 × 약 580 px, `/me` 디자인 톤 일치):
  ```
  ┌─────────────────────────────────────────────────────────┐
  │  [원형 본인 아바타]  동현                                │
  │                     🤝 베스트 프렌드 TOP 5 · 최근 30일    │
  │  ─────────────────────────────────────────────────────   │
  │  ① [원형 아바타] 민수      ████████████  12시간 30분 (24)│
  │  ② [원형 아바타] 지수      █████████     8시간 12분 (15) │
  │  ③ [원형 아바타] 영희      ██████        6시간 5분 (10)  │
  │  ④ [원형 아바타] 철수      ████          4시간 20분 (8)  │
  │  ⑤ [익명 회색 원]  ???     ███           3시간 50분 (비공개)│
  │  ─────────────────────────────────────────────────────   │
  │  💬 평일 저녁 민수님과 가장 자주 어울리고 계세요. (AI)    │
  │                                                          │
  │  통계 제외 채널: [채널] 공지   ... 외 2개                │
  └─────────────────────────────────────────────────────────┘
  ```
  - 친밀도 바: 1위 시간 = 100% 기준 상대 길이. `/me`의 마이크 ON/OFF 바와 동일 톤(`BLURPLE`).
  - 비공개 사용자: 회색 원 + `???`. 아바타·이름 노출 금지.
  - AI 코멘트: 1~2줄, 영역이 비면 카드 높이 자동 축소.
  - 본인 데이터 0건: 별도 "비활성" 카드 변형 — "최근 30일간 함께한 친구 기록이 없어요. 음성방에 들어가 친구를 만들어보세요!" 일러스트 +CTA.

- **응답 페이로드**:
  - `files`: `best-friends.png`
  - `components`: `[ActionRow [Link Button("대시보드에서 그래프 보기" → `/dashboard/guild/{guildId}/co-presence`)]]`
  - **ephemeral**: 기본 `false` (자랑 가능). `private:true` 옵션 파라미터로 ephemeral 토글.

- **장애 대응**:
  - LLM 실패: 코멘트 영역만 비우고 카드 정상 렌더 (높이 자동 축소)
  - 캔버스 렌더 실패: Embed 폴백 응답("이미지 생성 실패, 텍스트로 대체") + 텍스트 리스트
  - peer 닉네임 조회 실패: `Member-{userId.slice(0,6)}` 폴백

- **속도 목표**:
  - 캔버스 렌더 < 200ms (5명 카드, 아바타 5개 로딩 포함)
  - 전체 응답 < 1.5s (LLM 미사용 시 < 700ms, defer로 사용자 체감 우려 없음)

### F-FRIEND-002: 두 사람 사이 친밀도 조회 `/친밀도` (Canvas)

- **트리거**: `/친밀도 user:<멘션>` 또는 `/친밀도 user1:<멘션> user2:<멘션>`
- **입력**:
  | 파라미터 | 타입 | 필수 | 설명 |
  |---|---|---|---|
  | `user` | User | 필수 | 비교 대상 1 |
  | `user2` | User | 선택 | 비교 대상 2 (생략 시 명령 실행자) |
  | `period` | choice(`7`, `30`, `90`) | 선택 | 기본 30 |

- **처리**:
  1. `interaction.deferReply()`
  2. Bot이 `BotApiClient.getAffinity(guildId, userA, userB, period)` 호출
  3. API 측 처리:
     - 양측 opt-out 검증 — 한쪽이라도 비공개이고 명령 실행자가 본인이 아니면 ephemeral 텍스트 응답으로 분기 (캔버스 미생성)
     - `userId < peerId` 정렬로 단방향 키 생성 → `CoPresenceAnalyticsService.getPairDetail()` 재사용
     - 일별 데이터까지 함께 받아 카드의 미니 막대 차트로 사용
  4. `AffinityCardRenderer.render()` → PNG Buffer → base64
  5. Bot이 `AttachmentBuilder`로 첨부

- **카드 레이아웃** (800 × 약 360 px):
  ```
  ┌─────────────────────────────────────────────────────────┐
  │  [원형 A 아바타]  동현      ⇆      민수  [원형 B 아바타]  │
  │                                                          │
  │  💞 최근 30일 함께한 시간                                │
  │  ┌──────────────────┐  ┌──────────────┐  ┌────────────┐│
  │  │ 12시간 30분       │  │ 24 세션      │  │ 마지막     ││
  │  │ (총)              │  │              │  │ 05-02      ││
  │  └──────────────────┘  └──────────────┘  └────────────┘│
  │                                                          │
  │  📊 일별 추이 (최근 30일)                                │
  │   ▂▂▃▅▃▂▁▁▃▆█▅▃▂▁▂▃▅▆▄▃▂▁▁▂▃▄▅▆▇                     │
  └─────────────────────────────────────────────────────────┘
  ```
  - 좌측 A 아바타 / ⇆ 아이콘 / 우측 B 아바타 — `/me` 헤더의 아바타 패턴 재사용
  - 통계 카드 3개 — `/me`의 `drawStatCardWithSub()` 재사용
  - 일별 차트 — `/me`의 `drawBarChart()` 재사용

- **응답 페이로드**: `files: [affinity.png]` + Link 버튼(`PairDetailModal`로 이동)

- **권한**:
  - 자기 자신 포함 페어: 항상 허용
  - 본인 미포함 페어(타인↔타인): 길드 관리자(`Permissions.ManageGuild`)만 허용 또는 길드 설정에서 "공개" 토글 시 일반 사용자도 허용 (결정 항목 P-2 참고)
  - 비공개 사용자 포함 시 ephemeral 텍스트 응답 — **이 경우 캔버스 미렌더**

### F-FRIEND-003: 주간 자동 리포트에 친밀도 섹션 추가

- **트리거**: 기존 `WeeklyReportScheduler` (매시간 정각)
- **변경 위치**: `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts`
- **신규 동작**:
  1. `collectReportData()`에서 `CoPresenceAnalyticsService.getTopPairs(guildId, 7, 5)` 호출 추가
  2. `buildPayload()`에서 새 섹션 `"💞 이번 주 베스트 페어 TOP 5"` 삽입 (TOP 3 채널과 AI 분석 사이)
  3. AI 종합 분석 프롬프트에 페어 데이터 컨텍스트 추가(선택) — "이번 주 활발한 페어가 누구이고 서버 분위기는 어떤가"
- **opt-out 처리**: 양측 모두 비공개인 페어는 제외, 한쪽만 비공개면 익명화(`???`)
- **장애 대응**: 페어 조회 실패 시 해당 섹션만 생략, 나머지 리포트 정상 발송

### F-FRIEND-004: 사용자 사생활 설정 `PrivacyConfig`

- **신규 엔티티**: `user_privacy_config`
  | 컬럼 | 타입 | 설명 |
  |---|---|---|
  | `guildId` | varchar | PK |
  | `userId` | varchar | PK |
  | `disableRelationshipShare` | boolean (default false) | 친밀도/베프 노출 비공개 |
  | `updatedAt` | timestamp | |
- **인터페이스**:
  - 슬래시 커맨드 `/사생활 친밀도공개:<true|false>` (ephemeral)
  - 웹 대시보드 사용자 메뉴 > "사생활" 페이지 (개인 설정)
- **적용 범위**:
  - F-FRIEND-001/002: 비공개 사용자는 본인이 명령 실행자가 아닌 한 결과에서 제외
  - F-FRIEND-003: 위 처리
  - 기존 웹 `/dashboard/.../co-presence` (Phase 4 페이지)는 **관리자 전용 분석 도구**로 운영 → opt-out 적용 여부는 결정 필요(아래 §6 결정 항목 P-3)

### F-FRIEND-005: AI 자연어 코멘트 (선택)

- **사용처**: F-FRIEND-001 응답, F-FRIEND-003 주간 리포트 섹션
- **프롬프트 예시**:
  ```
  사용자 X의 최근 30일 베스트 프렌드 TOP 3는 다음과 같다:
  1. 동현 — 12시간 (24세션)
  2. 민수 — 8시간 (15세션)
  3. 지수 — 6시간 (10세션)
  이 데이터를 1~2문장의 친근한 한국어로 묘사하라. 인용/추측 금지.
  ```
- **컨텍스트 보강**: 평일/주말 비율, 시간대(저녁/심야) 패턴은 추후 확장
- **비용 통제**:
  - 길드별 일일 LLM 호출 한도 (`Redis INCR co-presence:llm:{guildId}:{date}`, EXPIRE 24h)
  - 결과 캐시 (사용자별 1시간) — 동일 사용자 반복 호출 시 캐시 응답
- **장애 대응**: `LlmProvider` 실패 → 코멘트 생략, 통계만 출력 (기존 weekly-report와 동일 패턴)

---

## 3. 데이터 활용 및 추가 엔티티

### 3.1. 활용 (신규 엔티티 0개)

기존 엔티티 그대로 사용:
- `VoiceCoPresencePairDaily` — F-FRIEND-001/002/003의 핵심 입력
- `VoiceCoPresenceDaily` — 본인 활동 0인 경우 분기 처리
- `GuildMember` — 닉네임/아바타 매핑 (`findByUserIds()` 사용 시 `displayName`, `avatarUrl` 일괄 조회)

### 3.2. 신규 엔티티 1개

- `UserPrivacyConfigOrm` (`user_privacy_config`) — F-FRIEND-004

### 3.3. 신규 인덱스

- `VoiceCoPresencePairDaily`에 `IDX_pair_guild_user_date`(이미 존재)로 F-FRIEND-001 쿼리 충분
- 단, **본인 시점 베프 조회**는 `userId = me AND date >= ?`로 조회되므로 기존 인덱스가 정확히 매칭됨. 추가 인덱스 불필요.

### 3.4. 캐시 전략

| 키 | TTL | 용도 |
|---|---|---|
| `friend:card:{guildId}:{userId}:{period}` | **5분** | F-FRIEND-001 **PNG base64 결과** 캐시 (LLM 코멘트 포함 동일 카드면 재렌더 방지) |
| `friend:llm:quota:{guildId}:{YYYYMMDD}` | 24시간 | 길드별 일일 LLM 호출 카운터 |
| `friend:privacy:{guildId}:{userId}` | 30분 | opt-out 빠른 확인 (DB 조회 절감) |

> **캐시 키 변경 사유**: 응답이 텍스트가 아니라 PNG라 base64 길이가 크다(약 30~80KB). Redis에 저장하지 말고 **인메모리 LRU(`lru-cache` 등)로 5분 보관** 권장. Redis는 작은 메타데이터(opt-out, 쿼터)만 저장.

### 3.5. 폰트·이미지 자산

- `/me`의 `ProfileCardRenderer`가 이미 등록한 `NotoSansCJK`, `NotoColorEmoji` 글로벌 폰트 그대로 재사용
- 아바타 이미지: Discord CDN(`https://cdn.discordapp.com/avatars/{userId}/{hash}.png`) — `loadImage()` 사용. 실패 시 회색 원 폴백
- 비공개 사용자 회색 원: 정적 SVG/PNG 불필요, `ctx.arc()` + `#cccccc` 채움

---

## 4. UX 시나리오

### 4.1. 신규 사용자 첫 사용

```
사용자: /친한친구
봇: ⚠️ 최근 30일간 다른 사람과 함께한 음성 기록이 없어요. 음성 채널에서 친구들과 대화해보세요!
   [대시보드 둘러보기] 버튼
```

### 4.2. 활성 사용자 일반 케이스

```
사용자: /친한친구 period:30 limit:5
봇: 🤝 동현님의 베스트 프렌드 TOP 5 — 최근 30일
   1. 민수    — 12시간 30분 (24세션)
   2. 지수    — 8시간 12분 (15세션)
   3. 영희    — 6시간 5분  (10세션)
   4. 철수    — 4시간 20분 (8세션)
   5. ???     — 3시간 50분 (비공개 설정)
   
   💬 평일 저녁 민수님과 가장 자주 어울리고 계세요.
   [대시보드에서 그래프 보기]
```

### 4.3. 비공개 설정한 본인이 타인 베프 조회

```
사용자(opt-out): /친한친구
봇: ✅ 본인 베프는 비공개 설정과 무관하게 조회 가능합니다. (본인은 항상 자신 데이터를 볼 수 있음)
    [결과 정상 출력]
```

### 4.4. 주간 리포트

기존 리포트에 다음 섹션 추가:
```
💞 이번 주 베스트 페어 TOP 5
1. 동현 ↔ 민수    — 12시간 (24세션)
2. 지수 ↔ 영희    — 8시간 (15세션)
3. 철수 ↔ ???     — 6시간 (1명 비공개)
...
```

---

## 5. 구현 전략

### Phase 1 — 사생활 정책 + 본인 베프 카드 (M, ~1.5주)

1. `UserPrivacyConfigOrm` 엔티티 + Repository + Service
2. `CoPresenceAnalyticsService.getMyTopPeers(guildId, userId, days, limit)` 신규 메서드
   - 기존 `getTopPairs()`는 서버 전체 TOP이라 재사용 불가, **본인 시점 쿼리는 신규**
   - `WHERE userId = :me`로 단방향만 조회 (양방향 저장이므로 단방향이면 충분)
3. opt-out 필터링: peer 중 `disableRelationshipShare = true`인 사용자 익명화
4. **`BestFriendCardRenderer` 신규** — `apps/api/src/channel/voice/co-presence/application/best-friend-card-renderer.ts`
   - `ProfileCardRenderer` 폰트 등록 패턴 그대로 답습
   - 아바타 5개 병렬 `loadImage()` (실패는 회색 원 폴백)
   - Stat 카드·바 차트 헬퍼는 `ProfileCardRenderer`와 디자인 톤 통일
5. **bot-api 엔드포인트 신규** — `apps/api/src/bot-api/co-presence/bot-co-presence.controller.ts`
   - `POST /bot-api/co-presence/best-friends` — `{ ok, data: { imageBase64 } | null, days }` 반환 (`/me` 응답 구조 동일)
6. **Bot 슬래시 커맨드 신규** — `apps/bot/src/command/friend/best-friend.command.ts`
   - `me.command.ts`와 거의 동일한 구조: `deferReply` → `apiClient.getMyBestFriends()` → `Buffer.from(base64, 'base64')` → `AttachmentBuilder` → `editReply({ files, components })`
7. **`BotApiClientService.getMyBestFriends()`** 추가 (`@onyu/bot-api-client`)
8. 슬래시 커맨드 `/사생활`(ephemeral, 텍스트 응답) — 캔버스 불필요, 단순 토글 결과

### Phase 2 — 친밀도 카드 + 주간 리포트 통합 (S, ~5일)

9. **`AffinityCardRenderer` 신규** — F-FRIEND-002용 (Phase 1에서 생성한 헬퍼/폰트 재사용)
10. `bot-api`에 `POST /bot-api/co-presence/affinity` 추가
11. Bot: `/친밀도` 슬래시 커맨드 신규 (`apps/bot/src/command/friend/affinity.command.ts`)
12. `WeeklyReportService.collectReportData()`에 `getTopPairs()` 호출 + opt-out 필터 추가
13. `WeeklyReportService.buildPayload()`에 친밀도 섹션 삽입 — **주간 리포트는 기존 Embed 유지**(이미지 첨부 필요성 낮고, 페어 5쌍 텍스트로 충분)

### Phase 3 — AI 코멘트 (S, ~2일)

14. `VoiceAiAnalysisService.generateBestFriendComment()` 추가 — 단일 사용자용
15. `VoiceAiAnalysisService.generateWeeklyReport()` 프롬프트에 페어 컨텍스트 추가
16. Redis 일일 한도 + 인메모리 LRU 카드 캐시(5분)
17. `BestFriendCardRenderer`에 코멘트 영역 렌더 통합

### Phase 4 — 웹 사생활 설정 페이지 (S, ~2일)

18. `apps/web/app/settings/me/privacy/page.tsx` — 친밀도 공개 토글
19. API: `GET/PUT /api/users/me/privacy` (JwtAuthGuard 적용)

### 총 예상 규모

- Phase 1+2: **약 2~2.5주** (Embed 안에서 1.5주에서 +0.5~1주 증가 — 캔버스 렌더러 2종 신규 작업이 추가 비용)
- Phase 3+4: **약 4일** (선택 확장)

---

## 6. 트레이드오프 / 미해결 이슈 / 결정 필요 사항

### 6.1. 사생활 — 가장 큰 이슈

| 결정 항목 | 옵션 | 비고 |
|---|---|---|
| **P-1**. opt-out 기본값 | (a) 기본 공개(opt-out 시 비공개) / (b) 기본 비공개(opt-in 시 공개) | (a)가 트렌드·UX 표준, (b)는 GDPR 친화. **(a) 권장 + 첫 가입자에게 알림** |
| **P-2**. 본인 미포함 페어 조회 (`/친밀도 A↔B`) | (a) 누구나 / (b) 관리자만 / (c) 길드 토글 | **(c) 권장** — 길드 성격에 맞춰 결정 |
| **P-3**. 기존 웹 분석 페이지(F-COPRESENCE-007~013)에 opt-out 적용 여부 | (a) 적용 / (b) 관리자 분석 도구로서 미적용 | **(b) 권장** — 관리자 전용 + 감사 로그. 이미 `JwtAuthGuard + GuildMembershipGuard` 통과 길드 멤버에게만 노출되므로 합리적 |
| **P-4**. 비공개 사용자 표시 방식 | (a) 결과에서 제거 / (b) 익명화(`???`) / (c) 합산만 표시 | **(b) 권장** — 존재는 보이되 식별 불가, "1명 비공개" 표기 병행 |

### 6.2. 비용 — LLM 호출 + 캔버스 렌더 부하

- F-FRIEND-001/005를 모든 호출에 LLM 적용하면 활성 길드 사용자 수만큼 호출 → 토큰 비용 폭증
- 캔버스 렌더는 CPU-bound. 동시 요청 다발 시 API 응답 지연 가능
- **완화책**:
  - **인메모리 LRU 캐시 5분** (동일 사용자/기간) — PNG 재생성 방지, 가장 효과적
  - LLM 결과만 별도 캐시 1시간 (코멘트가 같으면 카드 동일)
  - 길드별 일일 LLM 한도 (예: 50회/일) → 초과 시 코멘트 생략하고 카드만 렌더
  - "코멘트 포함" 옵션 파라미터 (사용자 선택) — 기본은 포함 (UX 우선) / 한도 초과 시 자동 제외
  - 캔버스 렌더는 `Promise.all`로 아바타 병렬 로딩, 5명 카드 기준 < 200ms 목표

### 6.3. 데이터 정확도 — 같은 채널 내 모든 페어 vs 의도적 친밀도

- 현재 `VoiceCoPresencePairDaily`는 같은 채널에 있던 **모든 페어**를 양방향 누적
- 대규모 음성방(공지 채널 등)에서 의도 없이 함께 있던 사람이 베프로 잡힐 수 있음
- **완화책 후보**:
  - VoiceExcludedChannel을 친밀도 집계에서도 제외 (이미 적재 단계에서 제외 중 — 확인 필요)
  - 채널 인원수 가중치(2명 채널 1.0, 10명 채널 0.5 등)
  - 최소 시간 임계(3분 미만 페어 제외)
- **결정 필요 P-5**: 위 완화책 적용 여부 — 적용 시 기존 데이터 재집계 필요

### 6.4. 명령어 네이밍 (한국어/영어 혼용)

기존 패턴: `/me`(영어 + nameLocalizations 한국어), `/server-diagnosis`(한글 별칭). 결정 필요:

| 결정 항목 | 옵션 |
|---|---|
| **P-6**. 커맨드 명 | (a) `/best-friend` + ko 별칭 / (b) `/친한친구` 단독 / (c) `/friend best`(서브커맨드) |

권장: `/me`와 일관성을 위해 **(a) 영어 + ko 별칭**.

### 6.6. 캔버스 채택의 추가 트레이드오프

| 항목 | 영향 | 완화 |
|---|---|---|
| 응답 페이로드 크기 | base64 PNG ~30~80KB → bot↔api 트래픽 증가 | 인메모리 LRU + Discord 직접 첨부(Discord 측 압축) |
| 컨테이너 폰트 의존 | `NotoSansCJK`/`NotoColorEmoji` 미설치 시 □□□ 깨짐 | 이미 `/me`에서 dockerfile 폰트 설치 검증됨 — 그대로 사용 |
| 카드 디자인 변경 비용 | UI 변경 시 코드 수정 + 시각 회귀 테스트 | `ProfileCardRenderer` 헬퍼(`drawStatCardWithSub`, `roundRect` 등)를 공통 유틸로 추출하여 재사용 |
| 접근성(스크린 리더) | 이미지라 텍스트 추출 불가 | 메시지 본문에 짧은 요약 텍스트 1줄 병기 (선택) |
| 모바일 가독성 | 800px 폭이 모바일 좁은 화면에서 축소 | 글자 크기·여백 충분히 확보 (`/me`에서 검증된 800×650 레이아웃 톤 답습) |

### 6.5. 기존 도메인과의 책임 경계

- 본 기능을 **신규 도메인 `relationship`**(별도 모듈)으로 분리할지, **`voice-co-presence` 도메인 확장**으로 흡수할지 결정 필요
- **권장**: `voice-co-presence` 확장 — 기존 `CoPresenceAnalyticsService`에 메서드 추가, 슬래시 커맨드만 Bot 측에 신규
- **이유**: 데이터 소스가 동일하고, 별도 모듈 분리 시 의존성 그래프 복잡도만 증가

---

## 7. 차별화·시장 가치

| 비교 봇 | 친밀도 기능 | 차별화 요소 |
|---|---|---|
| Arcane | 음성 시간 XP만, 페어 분석 없음 | Onyu은 페어 단위 |
| MEE6 | 메시지 위주 XP | 음성 + 페어 |
| VoiceVisor | 개인 음성 통계, 페어 없음 | 페어·관계 그래프 |
| VibeBot | 게임/모더레이션 | 친밀도 LLM 코멘트 |

**시장 가치**: 디스코드 봇 시장에서 **"친구 관계"를 드러내는 기능은 거의 없음**. 한국 친목 서버에서 매우 강한 어필 가능. 단, 사생활 이슈 통제 실패 시 역풍 가능 → opt-out 기본값과 길드 토글이 결정적.

**Canvas 채택의 시장 부가가치**:
- 이미지로 결과가 출력되므로 트위터/X·인스타·블로그 자연 공유 가능 → 자연 유입
- "디스코드 봇이 만들어준 내 친구 카드" 형태의 콘텐츠는 Tatsu 프로필 카드와 유사한 바이럴 잠재력
- `/me` 카드와 시각 톤이 통일되어 "Onyu 카드 시리즈"로 일관된 브랜딩 가능

---

## 8. 다음 단계

본 검토안이 승인되면 다음 결정 후 PRD/Plan 분기:

1. **사생활 결정** (P-1 ~ P-4) → 정책 명문화
2. **데이터 정확도 결정** (P-5) → 적용 시 마이그레이션 계획 추가
3. **네이밍 결정** (P-6)
4. **도메인 경계 결정** — `voice-co-presence` 확장 vs `relationship` 신설

위 결정 후:
- PRD 갱신: `docs/specs/prd/voice-co-presence.md`에 F-FRIEND-001~005 추가 (또는 신규 `relationship.md`)
- Plan 분기:
  - `docs/plans/best-friend-backend.md` (Phase 1+2)
  - `docs/plans/best-friend-llm-comment.md` (Phase 3)
  - `docs/plans/user-privacy-config.md` (Phase 4)

---

## 9. 참고 자산 위치 요약

| 자산 | 경로 |
|---|---|
| 페어 적재 엔티티 | `apps/api/src/channel/voice/co-presence/infrastructure/voice-co-presence-pair-daily.orm-entity.ts` |
| 분석 서비스 | `apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts` |
| 분석 컨트롤러 | `apps/api/src/channel/voice/co-presence/co-presence-analytics.controller.ts` |
| 주간 리포트 | `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts` |
| **Canvas 렌더러 참고 구현** | `apps/api/src/channel/voice/application/profile-card-renderer.ts` |
| **bot-api 캔버스 응답 패턴** | `apps/api/src/bot-api/me/bot-me.controller.ts` |
| **Bot 캔버스 첨부 패턴** | `apps/bot/src/command/me.command.ts` |
| LLM 추상화 | `apps/api/src/common/llm/` |
| 멤버 매핑 | `apps/api/src/guild-member/application/guild-member.service.ts` |
| Bot ↔ API 클라이언트 | `BotApiClientService` (`@onyu/bot-api-client`) |
