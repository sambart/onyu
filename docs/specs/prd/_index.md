# Onyu PRD (Product Requirements Document)

## 프로젝트 개요

Onyu은 디스코드 서버의 음성 채널 활동을 실시간 추적하고, AI 기반 분석 리포트를 제공하는 다목적 디스코드 봇이다.

### 기술 스택
| 계층 | 기술 |
|------|------|
| Backend | NestJS 10 + TypeORM 0.3 + PostgreSQL 15 + Redis 7 |
| Frontend | Next.js 16 + React 19 + Tailwind CSS 3 |
| Discord | Discord.js 14 + discord-nestjs 5 |
| AI | Google Gemini (@google/generative-ai) |
| 인프라 | Docker Compose, pnpm workspaces 모노레포 |

### 모노레포 구조
```
apps/api/     → NestJS 백엔드 API (포트 3000)
apps/web/     → Next.js 웹 대시보드 (포트 4000)
libs/shared/  → 공유 타입 및 상수
```

## 도메인 목록

| 도메인 | 설명 | PRD 문서 |
|--------|------|----------|
| voice | 음성 채널 접속 추적, 세션 관리, 일별 통계 집계, 자동방 생성, 회원 마이페이지 | [voice.md](voice.md) |
| gemini | AI 기반 음성 활동 분석 및 리포트 생성 | [gemini.md](gemini.md) |
| auth | Discord OAuth2 인증, JWT 세션 관리 | [auth.md](auth.md) |
| web | 웹 대시보드 UI (음성 통계, 서버 관리, 자동방 설정) | [web.md](web.md) |
| newbie | 신규사용자 관리 (환영인사, 미션 추적, 모코코 사냥, 신입기간 역할) | [newbie.md](newbie.md) |
| status-prefix | 게임방 상태 접두사 설정 (버튼 클릭으로 닉네임 접두사 변경 및 자동 복원) | [status-prefix.md](status-prefix.md) |
| general | 슬래시 커맨드 자동 등록, 커맨드 목록 API, 일반설정 페이지 동적 커맨드 렌더링 | [general.md](general.md) |
| sticky-message | 텍스트 채널 고정메세지 (항상 최하단 유지, 디바운스 재전송, 웹/슬래시커맨드 관리) | [sticky-message.md](sticky-message.md) |
| member | 디스코드 멤버 정보 관리 (레거시, guild-member로 대체 예정) | (voice.md에 포함) |
| channel | 디스코드 채널 정보 관리 | (voice.md에 포함) |
| auto-channel | 트리거 채널 입장 기반 자동 음성 채널 생성 및 관리 | (voice.md에 포함) |
| monitoring | 봇 상태 모니터링 (업타임, 핑, 메모리, 음성 접속자 시계열 차트) | [monitoring.md](monitoring.md) |
| voice-co-presence | 음성 채널 동시접속 범용 추적 + 베스트 프렌드 TOP 리포트 (F-COPRESENCE-001~018, `/affinity` 삭제) | [voice-co-presence.md](voice-co-presence.md) |
| inactive-member | 음성 채널 활동 기반 비활동 회원 자동 분류, 대시보드 관리, 자동 조치 | [inactive-member.md](inactive-member.md) |
| guild-member | 길드 범위 멤버 정보 중앙 관리 (DB 동기화, Discord API 호출 대체) | [guild-member.md](guild-member.md) |
| super-admin | 플랫폼 운영자 슈퍼 관리자 콘솔 — allowlist 기반 임의 길드 read-only 열람 + 감사 로그 | [super-admin.md](super-admin.md) |
| role-panel | 역할 패널 — 관리자가 텍스트 채널에 버튼 패널을 게시하고 클릭으로 역할 부여/회수 (grant/toggle 모드, 인증 게이트 포함) | [role-panel.md](role-panel.md) |

## 핵심 기능 요약

### 1. 음성 채널 활동 추적 (voice)
- 실시간 음성 이벤트 감지 (입장/퇴장/이동/마이크 토글/화면 공유/카메라/스피커 음소거)
- Redis 기반 세션 시간 누적 (TTL 관리)
- PostgreSQL 일별 통계 flush (GLOBAL + 개별 채널)
- 서버 크래시 복구를 위한 세션 flush 전략
- 음성 참여 중 유저의 게임 활동 수집 (GuildPresences 인텐트 기반, CoPresenceScheduler 60초 틱 활용)

### 2. AI 음성 분석 (gemini)
- `/서버진단` — 서버 음성 활동 핵심 지표 요약 + AI 한줄 분석 (상세는 웹 대시보드로 유도)
- 주간 자동 리포트 — 관리자가 설정한 채널에 매주 서버 건강도 요약 Embed 자동 전송
- ~~`/voice-stats`, `/my-voice-stats`, `/community-health`, `/voice-leaderboard`~~ — 사용률 저조로 삭제, 웹 대시보드로 이관

### 3. 인증 (auth)
- Discord OAuth2 로그인
- JWT 토큰 발급 (1시간 만료)

### 4. 웹 대시보드 (web)
- 랜딩 페이지 (기능 소개)
- Discord OAuth 로그인 흐름
- 대시보드 (프로토타입 단계)
- 자동방 설정 UI (서버별 트리거 채널, 버튼 구성, 네이밍 규칙 설정)
- 시작 가이드 (Getting Started 위자드)
- 도움말 페이지 (FAQ)
- 개인정보처리방침/이용약관
- 에러 바운더리
- 회원 마이페이지 (`/my/voice`) — 일반 멤버 본인 음성 통계 조회 (F-VOICE-052)

### 5. 자동방 생성 (auto-channel)
- 트리거 채널 입장 시 대기방 자동 생성 및 사용자 이동
- 안내 메시지 + Discord Button Component로 확정방 선택
- 하위 선택지 Ephemeral 버튼으로 세부 유형 선택
- 확정방 전환 시 voice 세션 추적 통합
- 모든 사용자 퇴장 시 채널 즉시 삭제

### 6. 신규사용자 관리 (newbie)
- `guildMemberAdd` 이벤트 기반 환영 Embed 메시지 자동 전송 (템플릿 변수 지원)
- 신규 가입 시 음성 채널 플레이타임(채널 접속 시간 또는 마이크 ON 시간 선택 가능) 기반 미션 자동 생성 및 완료/실패 상태 추적
- 기존 멤버가 신규사용자와 동시 음성 채널 접속한 시간·횟수·다양성을 점수 기반으로 집계 (모코코 사냥) 및 TOP N 순위 채널 Embed 표시
- 신입기간 만료 시 Discord 역할 자동 제거 (미션 완료 여부와 독립)

### 7. 게임방 상태 접두사 (status-prefix)
- 관리자가 웹에서 접두사 버튼 목록, Embed 안내 메시지, 표시 채널, 접두사 형식 템플릿 설정
- 설정 저장 시 지정 텍스트 채널에 Embed + 버튼 메시지 전송/갱신
- 사용자가 버튼 클릭 시 닉네임이 템플릿 형식으로 변경 (예: `[관전] 동현`)
- 다른 접두사 버튼 클릭 시 기존 접두사가 새 접두사로 교체
- 음성 채널 퇴장 시 원래 닉네임으로 자동 복원 (voice 도메인 연계)

### 8. 일반설정 (general)
- discord-nestjs `ExplorerService` 기반 슬래시 커맨드 자동 탐색 및 등록 (`discord.config.ts` 수동 배열 제거)
- `GET /api/guilds/:guildId/commands` — Discord API에서 실제 등록된 슬래시 커맨드 목록 조회
- 일반설정 페이지에서 하드코딩 커맨드 목록을 제거하고 API 기반 동적 렌더링으로 전환

### 9. 고정메세지 (sticky-message)
- 등록된 텍스트 채널에 새 메시지가 올라오면 기존 고정메세지를 삭제하고 재전송하여 항상 채널 최하단 유지
- 디바운스(3초) 적용으로 연속 메시지 시 불필요한 재전송 방지
- `/고정메세지등록`, `/고정메세지목록`, `/고정메세지삭제` 슬래시 커맨드 (관리자 전용)
- 웹 대시보드에서 채널·Embed 설정(제목, 설명, 색상, 이모지 피커) 및 실시간 미리보기 제공
- 채널당 여러 개 고정메세지 등록 가능, Redis 캐시 기반 고속 처리

### 10. 봇 모니터링 (monitoring)
- 실시간 봇 상태 조회 (온라인/오프라인, 업타임, 핑, 메모리, 음성 접속자)
- 1분 간격 메트릭 수집 및 PostgreSQL 시계열 저장
- 웹 대시보드에서 업타임 히스토리, 핑 추이, 메모리 추이, 시간대별 접속자 차트 제공
- 30일 보존 정책 자동 삭제

### 11. 비활동 회원 관리 (inactive-member)
- `VoiceDailyEntity` 기반 매일 자정 비활동 분류 스케줄러 (FULLY_INACTIVE / LOW_ACTIVE / DECLINING)
- 웹 대시보드에서 비활동 회원 목록 조회, 등급/기간/닉네임 필터 및 검색
- DM 알림 전송, 역할 부여/제거 일괄 조치 및 자동 조치 규칙 설정
- 활동률 파이 차트 및 최근 30일 비활동 추이 라인 차트 (`InactiveMemberTrendDaily` 스냅샷 기반)

### 12. 베스트 프렌드 (voice-co-presence Phase 5)

- `/best-friend` (`친한친구`) — 본인 베스트 프렌드 TOP 5 Canvas PNG 카드. 파라미터 없음·최근 30일·공개 응답 고정. 아바타·친밀도 바·AI 한 줄 코멘트 포함 (F-COPRESENCE-014)
- 주간 자동 리포트에 "💞 이번 주 베스트 페어 TOP 5" 섹션 추가 — 기존 Embed 형식 유지 (F-COPRESENCE-016)
- opt-out 사생활 설정 (웹 `/settings/me/privacy` 페이지만 — `/privacy` 커맨드 삭제됨) — 기본 공개, 비공개 전환 시 타인 조회에서 익명화(`???`) (F-COPRESENCE-017)
- Gemini `LlmProvider` 활용 AI 한 줄 코멘트 — 길드 일일 한도 + 인메모리 LRU 5분 캐시 (F-COPRESENCE-018)

### 13. 데이터 보존 및 삭제
- 90일 자동 삭제 스케줄러 (매일 04:00 KST, `DATA_RETENTION_DAYS` 환경변수)
- 삭제 대상: `VoiceDailyEntity`, `VoiceChannelHistory`, `VoiceCoPresencePairDaily`, `VoiceGameActivity`
- 사용자 데이터 삭제 API (`DELETE /api/users/me/data`) — 본인 음성 활동 데이터 전 길드 삭제

### 14. API 보안
- Rate Limiting: 전역 60 req/min, auth 20 req/min, voice-analytics 10 req/min, bot-api(봇→API 내부 호출) 제외 (`@nestjs/throttler`)
- 보안 헤더: `helmet` 미들웨어 (CSP, X-Frame-Options, HSTS 등)
- Guild 접근 제어: `GuildMembershipGuard` — JWT guilds 목록과 요청 guildId 대조, `/api/guilds/:guildId/*` 전역 적용
- Health Check: `GET /health` (PostgreSQL + Redis + Discord Gateway), `GET /health/liveness` (`@nestjs/terminus`)

## 데이터베이스 엔티티

| 엔티티 | 테이블 | 역할 |
|--------|--------|------|
| Member | public.member | 디스코드 유저 정보 (discordMemberId, nickName) — guild-member로 대체 예정 |
| GuildMember | public.guild_member | 길드 범위 멤버 정보 (guildId, userId, displayName, isBot, joinedAt, isActive) |
| Channel | public.channel | 디스코드 채널 정보 (discordChannelId, channelName, status) |
| VoiceChannelHistory | public.voice_channel_history | 음성 입/퇴장 이력 (joinAt, leftAt, duration) |
| VoiceDailyEntity | voice_daily | 일별 집계 통계 (channelDurationSec, micOnSec, micOffSec, aloneSec, streamingSec, videoOnSec, deafSec) |
| VoiceGameActivity | voice_game_activity | 음성 채널 내 게임 세션 단위 이력 (guildId, userId, channelId, gameName, applicationId, startedAt, endedAt, durationMin). 90일 보존 |
| VoiceGameDaily | voice_game_daily | 게임 일별 집계 (guildId, userId, gameName, date, totalMinutes, sessionCount). 영구 보존 |
| VoiceExcludedChannel | voice_excluded_channel | 음성 시간 제외 채널 설정 (guildId, channelId, type: CHANNEL/CATEGORY) |
| AutoChannelConfig | auto_channel_config | 자동방 설정 (guildId, triggerChannelId, 대기방 템플릿, 안내 메시지) |
| AutoChannelButton | auto_channel_button | 자동방 버튼 목록 (label, emoji, targetCategoryId) |
| AutoChannelSubOption | auto_channel_sub_option | 버튼 하위 선택지 (label, emoji, channelSuffix) |
| NewbieConfig | newbie_config | 신규사용자 관리 길드별 설정 (환영인사, 미션, 모코코, 역할 설정 통합) |
| NewbieMissionTemplate | newbie_mission_template | 미션 Embed 커스텀 템플릿 (제목/헤더/항목/푸터/상태 매핑, 길드별 1행) |
| NewbieMocoTemplate | newbie_moco_template | 모코코 사냥 Embed 커스텀 템플릿 (제목/본문/항목/푸터/점수산정안내, 길드별 1행) |
| NewbieMission | newbie_mission | 신규사용자 미션 진행 상태 (startDate, endDate, targetPlaytimeSec, status) |
| NewbiePeriod | newbie_period | 신입기간 역할 관리 이력 (startDate, expiresDate, isExpired) |
| MocoHuntingSession | moco_hunting_session | 모코코 사냥 세션 이력 (hunterId, channelId, startedAt, endedAt, durationMin, isValid) |
| MocoHuntingDaily | moco_hunting_daily | 모코코 사냥 일별 집계 (hunterId, date, channelMinutes, sessionCount, score) |
| StatusPrefixConfig | status_prefix_config | 게임방 상태 접두사 길드별 설정 (channelId, messageId, embedTitle, prefixTemplate) |
| StatusPrefixButton | status_prefix_button | 접두사 버튼 목록 (label, emoji, prefix, type, sortOrder) |
| StickyMessageConfig | sticky_message_config | 고정메세지 설정 (guildId, channelId, embedTitle, embedDescription, embedColor, messageId, enabled, sortOrder) |
| BotMetric | bot_metric | 봇 상태 메트릭 시계열 (guildId, status, pingMs, heapUsedMb, voiceUserCount, recordedAt) |
| VoiceCoPresenceSession | voice_co_presence_session | 음성 채널 동시접속 세션 이력 (userId, channelId, startedAt, endedAt, durationMin, peerIds, peerMinutes). 90일 보존 |
| VoiceCoPresenceDaily | voice_co_presence_daily | 음성 동시접속 일별 집계 (userId, date, channelMinutes, sessionCount). 영구 보존 |
| VoiceCoPresencePairDaily | voice_co_presence_pair_daily | 사용자 쌍 단위 일별 동시접속 집계 (userId, peerId, date, minutes, sessionCount). 관계 분석용. 영구 보존 |
| InactiveMemberConfig | inactive_member_config | 비활동 판정 길드별 설정 (periodDays, lowActiveThresholdMin, decliningPercent, 자동 조치, DM 템플릿) |
| InactiveMemberRecord | inactive_member_record | 비활동 분류 최신 스냅샷 (userId, grade, totalMinutes, lastVoiceDate, gradeChangedAt) |
| InactiveMemberActionLog | inactive_member_action_log | 비활동 회원 조치 이력 (actionType, targetUserIds, successCount, failCount, executedAt) |
| InactiveMemberTrendDaily | inactive_member_trend_daily | 비활동 회원 일별 등급별 인원수 스냅샷 (fullyInactiveCount, lowActiveCount, decliningCount, totalClassified). 90일 보존 |
| UserPrivacyConfig | user_privacy_config | 사용자별 길드 단위 사생활 설정 (PK: guildId+userId, disableRelationshipShare boolean default false, updatedAt). opt-out 시 베프 데이터 익명화 |

## 외부 의존성

| 서비스 | 용도 |
|--------|------|
| Discord API | 봇 이벤트 수신, 슬래시 커맨드, 유저/채널 정보 조회 |
| Google Gemini API | 음성 활동 데이터 AI 분석 |
| PostgreSQL | 영구 데이터 저장 |
| Redis | 실시간 세션 캐싱, 이름 캐싱 (7일 TTL) |
