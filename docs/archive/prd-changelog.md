# PRD 변경이력

모든 PRD 변경이력은 이 파일에 기록한다.
PRD 본문(`/docs/specs/prd/*.md`)에는 변경이력을 직접 작성하지 않는다.

## 문서 이력 테이블

| 버전 | 날짜 | 변경 요약 | 작성자 |
|------|------|-----------|--------|
| v5.9 | 2026-04-05 | inactive-member: 비활동 회원 추이 일별 스냅샷 테이블 추가 — InactiveMemberTrendDaily 신규, findTrend() 데이터 소스 변경, F-INACTIVE-004 추이 차트 소스 갱신, 제약사항 갱신, _index.md 엔티티 테이블 추가 | — |
| v5.8 | 2026-04-04 | music: YouTube → Spotify 검색 + Deezer 스트리밍 전환 반영 — 개요·아키텍처·F-MUSIC-001·Now Playing Embed·인프라·환경변수·의존성 수정 | — |
| v5.7 | 2026-04-04 | voice: 서버 진단 API 명세 신규 추가(F-VOICE-040~042) — 건강도 점수 공식 로그 커브 다차원 가중합산 개선, AI 진단 maxOutputTokens 1024 상향, 리더보드 avatarUrl GuildMemberService 조회 반영 | — |
| v5.6 | 2026-04-04 | voice: 자동방 통계 그룹핑 단위 Config → Button 변경 — F-VOICE-032~038 수정, AutoChannelInfo에 buttonId/buttonLabel 추가, voice_daily 컬럼 2개 추가(autoChannelButtonId/autoChannelButtonLabel), 그룹핑 키를 buttonId ?? configId로 변경 | — |
| v5.5 | 2026-04-04 | newbie: F-NEWBIE-002-CANVAS 신입 미션 Canvas 표시 모드 추가 — missionDisplayMode 설정, 여러 장 전송 방식, 테이블 레이아웃·프로그레스 바·D-day 색상, Redis 캐싱(TTL 30초) 명세 | — |
| v5.4 | 2026-04-04 | newbie: missionTargetPlayCount(목표 플레이횟수) 설정 추가 — NewbieConfig·NewbieMission 데이터 모델 확장, 달성 판정 로직 변경(AND 조건), 항목 템플릿 변수 {targetPlayCount} 추가, 탭 2 UI 항목 추가, API 응답 필드 추가 | — |
| v5.3 | 2026-04-04 | guild-member: 길드 멤버 중앙 관리 도메인 PRD 신규 추가 (F-GUILD-MEMBER-001~009), _index.md 도메인 목록·엔티티 테이블 갱신 | — |
| v5.2 | 2026-04-03 | newbie: F-NEWBIE-003 모코코 순위 Canvas 렌더링 모드 추가 — mocoDisplayMode 설정, Canvas 랭킹 보드/개인 상세 명세, Redis 캐싱(TTL 30초), F-WEB-NEWBIE-001 탭 3 표시 방식 선택 UI 추가 | — |
| v5.1 | 2026-04-03 | newbie: F-NEWBIE-005 미션 관리 UI를 단일 테이블 + 상태 필터 방식으로 개편, GET /missions API 통합, enrichMissions() 닉네임 DB 저장 및 이력 조회 Discord API 제거 | — |
| v5.0 | 2026-04-03 | web: F-WEB-016 health-score API에서 LLM 분리(health-diagnosis 엔드포인트 신규), AI 인사이트 자동 조회 제거 — 초기 로드 동작, 섹션 1 AI 진단 텍스트 비동기 처리, 섹션 5 AiInsightPanel 동작 변경, 호출 API 테이블 갱신 | — |
| v4.9 | 2026-04-03 | inactive-member: gracePeriodDays 신입 유예 기간 추가 — F-INACTIVE-001 분류 로직, F-INACTIVE-005 설정 UI, InactiveMemberConfig 데이터 모델, PUT API 유효성 검증, 제약사항 갱신 | — |
| v4.8 | 2026-03-27 | monitoring: Loki + Promtail 로그 수집 인프라 및 nestjs-pino 구조화 로깅 도입 — F-MONITORING-020~023 신규 추가 | — |
| v4.7 | 2026-03-27 | voice: 자동방 채널 통계 그룹핑 기능 추가 — F-VOICE-032~039 신규, voice_daily 컬럼 3개 추가(channelType/autoChannelConfigId/autoChannelConfigName), Redis 분리 저장, Flush 확장, API/DTO 확장, 대시보드 UI 필터·그룹 탭, 소급 태깅 스크립트 | — |
| v4.6 | 2026-03-26 | monitoring: Prometheus + Grafana 기반 인프라 모니터링으로 전환, bot_metric 기반 기능(F-MONITORING-001~004, F-WEB-MONITORING-001) Deprecated 처리, F-MONITORING-010~012 신규 추가 | — |
| v4.5 | 2026-03-21 | web: 서버 진단 대시보드(F-WEB-016) 및 주간 리포트 설정 페이지(F-WEB-017) 추가, 사이드바 "분석" 그룹 신설, voice-analytics 신규 API 5종 명세 | — |
| v4.4 | 2026-03-21 | gemini: F-GEMINI-001~004 슬래시 커맨드 삭제(사용률 저조, 웹 대시보드 이관), F-GEMINI-005 `/서버진단` 단일 커맨드 신규, F-GEMINI-006 주간 자동 리포트 신규, WeeklyReportConfig 데이터 모델 추가, 관련 모듈 갱신 | — |
| v4.3 | 2026-03-21 | web: 사이드바 메뉴 그룹 재구성 — 대시보드(3그룹)/설정(3그룹), "일반 설정" → "커맨드 관리" 라벨 변경, 크로스링크 UX, i18n 키 정의 (F-WEB-015, DashboardSidebar, SettingsSidebar 갱신) | — |
| v4.2 | 2026-03-21 | music: 음악 전용 채널 임베드 시스템 추가 (F-MUSIC-010~017, MusicChannelConfig 데이터 모델, 웹 설정 REST API, 아키텍처 다이어그램 확장, 관련 모듈 추가) | — |
| v4.1 | 2026-03-21 | web: F-WEB-014 음악 설정 페이지 추가 — 음악 전용 채널 지정, 임베드 커스터마이징(실시간 미리보기), 버튼 구성(7종, 행 배치, 라벨/이모지), 기본설정 리셋 | — |
| v4.0 | 2026-03-20 | voice: 자동방 즉시 생성 모드(`instant`) 추가, 확정방 내 사용자의 버튼 클릭으로 새 채널 생성 가능 (F-VOICE-007 분기, F-VOICE-010/011 조건 확장, F-VOICE-020 신규, AutoChannelConfig 컬럼 추가) | — |
| v3.9 | 2026-03-20 | web: F-WEB-004 자동방 설정 페이지 — 모드 선택(즉시 생성/선택 생성), 스텝 기반 섹션 분할, 버튼 카드 그리드 + 모달 편집, 통합 미리보기 강화 | — |
| v3.8 | 2026-03-20 | music: Lavalink v4 + Kazagumo v3 아키텍처 전환, /pause·/resume 신규 추가, Now Playing Embed 명세, 모듈 경로 수정 (F-MUSIC-001~005) | — |
| v3.7 | 2026-03-16 | voice: 음성 채널 추가 데이터 수집 — Phase 1(화면 공유·카메라·스피커 음소거) F-VOICE-025~027, Phase 2(게임 활동) F-VOICE-028~031 추가 | — |
| v3.6 | 2026-03-14 | web: 대시보드 사이드바에 서버 개요(F-WEB-008)·신입 관리(F-WEB-009) 추가, F-WEB-003-B 진입점 갱신 | — |
| v3.5 | 2026-03-14 | newbie: F-WEB-NEWBIE-001 설정 페이지 탭 구성 변경 — 탭 3(미션 관리) 제거 및 탭 번호 재조정, F-NEWBIE-005 웹 UI 위치를 대시보드로 명시 | — |
| v3.4 | 2026-03-14 | self-diagnosis: HHI 표시 레이어를 "관계 다양성 점수"(0~100점)로 변환 (F-SD-003, F-SD-004, F-SD-005, F-SD-008) | — |
| v3.3 | 2026-03-14 | voice-co-presence: 관계 분석 대시보드 기능 추가 (F-COPRESENCE-007 ~ F-COPRESENCE-013) | — |
| v3.2 | 2026-03-14 | inactive-member: 비활동 회원 관리 도메인 PRD 신규 추가 (F-INACTIVE-001 ~ F-INACTIVE-005) | — |
| v3.1 | 2026-03-10 | monitoring: 봇 모니터링 도메인 PRD 신규 추가 (F-MONITORING-001 ~ F-MONITORING-004, F-WEB-MONITORING-001) | — |
| v3.0 | 2026-03-10 | newbie: F-NEWBIE-005 미션 수동 관리 (성공/실패 처리, Embed 숨김) 추가, Embed 전체 상태 표시로 변경 | — |
| v2.9 | 2026-03-10 | voice: F-VOICE-022 `/me` 커맨드 (개인 음성 프로필 카드) 추가, `/voice-time`·`/voice-rank` 대체 삭제 명세 | — |
| v2.8 | 2026-03-09 | web: F-WEB-003-B 채널별 바차트에 카테고리별 탭 추가, F-WEB-007 채널별 도넛차트에 카테고리별 탭 추가 및 입퇴장 이력 테이블에 카테고리 컬럼 추가 | — |
| v2.7 | 2026-03-09 | voice: 채널 카테고리(parentId) 정보 추가 — Channel/VoiceDailyEntity 데이터 모델 확장, F-VOICE-017/018/020 응답 스키마 갱신, F-VOICE-021 신규 추가 | — |
| v2.6 | 2026-03-09 | web: 유저 상세 페이지(F-WEB-007) 추가 / voice: 유저별 음성 일별 통계 API(F-VOICE-018), 멤버 검색 API(F-VOICE-019), 유저 입퇴장 이력 API(F-VOICE-020) 추가 | — |
| v2.5 | 2026-03-09 | voice: 음성 일별 통계 조회 API(F-VOICE-017) 추가 / web: F-WEB-003-B 대시보드 상태 업데이트 | — |
| v2.4 | 2026-03-08 | web: 음성 설정 페이지(F-WEB-006) 추가 | — |
| v2.3 | 2026-03-08 | voice: 음성 시간 제외 채널(VoiceExcludedChannel) 기능 추가 | — |
| v2.2 | 2026-03-08 | newbie: 플레이횟수 카운팅 옵션(최소 참여시간/시간 간격) 추가 | — |
| v2.1 | 2026-03-08 | sticky-message: 고정메세지 도메인 PRD 신규 추가 | — |
| v2.0 | 2026-03-08 | web/voice: 자동방 설정 다중 탭 UI 및 AutoChannelConfig name 컬럼 추가 | — |
| v1.9 | 2026-03-08 | voice: Auto Channel 데이터 모델 및 Redis 키 구조 코드베이스 기준 동기화 | — |
| v1.8 | 2026-03-08 | web: 라우트 경로 코드베이스 기준 수정 및 F-WEB-003/004 UI 명세 갱신 | — |
| v1.7 | 2026-03-08 | newbie: Embed 커스터마이징 필드 추가 및 웹 경로 수정 | — |
| v1.6 | 2026-03-08 | general: 커맨드 목록 API를 글로벌 커맨드 조회로 수정 | — |
| v1.5 | 2026-03-08 | 일반설정(general) 도메인 PRD 신규 추가 | — |
| v1.4 | 2026-03-08 | newbie: 미션/모코코 Embed 템플릿 커스터마이징 시스템 추가 | — |
| v1.3 | 2026-03-08 | 게임방 상태 접두사(status-prefix) 도메인 PRD 신규 추가 | — |
| v1.2 | 2026-03-08 | 신규사용자 관리(newbie) 도메인 PRD 신규 추가 | — |
| v1.1 | 2026-03-08 | 자동방 생성(Auto Channel) 기능 추가 | — |

---

## [수정 46] inactive-member: 비활동 회원 추이 일별 스냅샷 테이블 추가 (INACTIVE-TREND-DAILY-SNAPSHOT)

**변경일**: 2026-04-05
**티켓**: INACTIVE-TREND-DAILY-SNAPSHOT

**변경 파일**:
- `docs/specs/prd/inactive-member.md` — InactiveMemberTrendDaily 테이블 추가, F-INACTIVE-004 추이 차트 데이터 소스 변경, 제약사항 갱신
- `docs/specs/prd/_index.md` — 엔티티 테이블에 InactiveMemberTrendDaily 추가, 핵심 기능 요약 문구 갱신

**변경 내용**:
1. **아키텍처 다이어그램**: `InactiveMemberService` 흐름에 `InactiveMemberTrendDaily UPSERT` 단계 추가.
2. **F-INACTIVE-001 동작 절차**: 8번 단계 신규 추가 — 분류 완료 후 당일 날짜의 등급별 인원수를 `InactiveMemberTrendDaily`에 UPSERT.
3. **F-INACTIVE-004 추이 라인 차트**: 데이터 소스를 `InactiveMemberRecord` 스냅샷 / `InactiveMemberHistory` 표현에서 `InactiveMemberTrendDaily` 테이블로 명확히 변경. "주/월별" 표현을 "최근 30일"로 수정.
4. **데이터 모델**: `InactiveMemberTrendDaily` (`inactive_member_trend_daily`) 테이블 명세 신규 추가 — 컬럼 정의(id, guildId, date, fullyInactiveCount, lowActiveCount, decliningCount, totalClassified, createdAt), UNIQUE 제약(guildId, date), 인덱스, 90일 보존 정책, 설계 근거 기술.
5. **제약사항**: 기존 "classifiedAt + grade 기반 집계" 문구를 제거하고 `InactiveMemberTrendDaily` 기반 조회로 교체. 스케줄러 미실행 날짜 처리 및 90일 보존 정책 제약 추가.
6. **_index.md 엔티티 테이블**: `InactiveMemberTrendDaily` 행 추가.
7. **_index.md 핵심 기능 요약**: "주/월별 비활동 추이 라인 차트" → "최근 30일 비활동 추이 라인 차트 (InactiveMemberTrendDaily 스냅샷 기반)"으로 수정.

**변경 사유**: `findTrend()`가 `inactive_member_record.classifiedAt` 컬럼을 `GROUP BY DATE(classifiedAt)`로 집계하는 구조에서, 스케줄러 실행 시 모든 레코드의 `classifiedAt`이 오늘 날짜로 갱신되기 때문에 추이가 항상 하루치만 반환되는 문제가 있다. 별도 일별 스냅샷 테이블 `InactiveMemberTrendDaily`를 도입하여 날짜별 인원수를 누적 저장하고 추이 조회의 정확성을 확보한다.

---

## [수정 45] music: YouTube → Spotify 검색 + Deezer 스트리밍 전환 반영 (MUSIC-YOUTUBE-TO-DEEZER)

**변경일**: 2026-04-04
**티켓**: MUSIC-YOUTUBE-TO-DEEZER

**변경 파일**:
- `docs/specs/prd/music.md` — YouTube 의존성 제거, Spotify 검색 + Deezer 스트리밍 전환 명세 반영

**변경 내용**:
1. **개요 섹션**: "YouTube · Spotify · SoundCloud URL 및 검색어 입력 지원" 문구를 "Spotify 메타데이터 검색 + Deezer 스트리밍(128kbps MP3), YouTube 의존성 완전 제거"로 수정. LavaSrc 플러그인(`lavasrc-plugin:4.3.0`) 명시.
2. **아키텍처 다이어그램**: `[YouTube / Spotify / SoundCloud]` → `[Spotify (검색/메타데이터) → Deezer (스트리밍)]` 로 변경. 검색 해석 흐름(검색어 → spsearch → Spotify API → ISRC → dzisrc/dzsearch → Deezer 128kbps MP3) 4단계 설명 추가.
3. **F-MUSIC-001 (음악 재생)**: 지원 입력을 "텍스트 검색어, Spotify URL, Deezer URL"로 변경. YouTube URL 미지원 명시. 텍스트 검색어의 내부 처리 흐름(`spsearch:` prefix) 추가.
4. **Now Playing Embed 명세**: "YouTube/소스 링크" → "Spotify 소스 링크"로 변경.
5. **인프라 섹션**: Lavalink 플러그인 표 신규 추가 — `lavasrc-plugin:4.3.0` 추가, YouTube 플러그인 제거 명시. LavaSrc providers 순서(`dzisrc:%ISRC%` → `dzsearch:%QUERY%`) 기재.
6. **환경변수**: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` 항목 추가 (Spotify Developer Dashboard 발급).
7. **의존성 섹션**: Lavalink 플러그인 변경 내역 추가 — youtube-plugin 제거, lavasrc-plugin 추가.

**변경 사유**: YouTube가 인증 없는 재생을 차단하여 모든 Lavalink 클라이언트에서 "This video requires login" 오류 발생. OAuth 우회는 주기적 만료·계정 차단 위험이 있어 YouTube 의존성을 완전 제거하고 Spotify 검색 + Deezer 스트리밍 조합으로 전환한 내용을 PRD에 반영한다.

---

## [수정 44] voice: 서버 진단 API 명세 신규 추가 — 건강도 점수 공식 개선, AI 진단 토큰 상향, 리더보드 아바타 조회 수정 (VOICE-ANALYTICS-DIAGNOSIS-FIXES)

**변경일**: 2026-04-04
**티켓**: VOICE-ANALYTICS-DIAGNOSIS-FIXES

**변경 파일**:
- `docs/specs/prd/voice.md` — 서버 진단 API 섹션(F-VOICE-040~042) 신규 추가

**변경 내용**:
1. **F-VOICE-040 신규 추가**: `GET /voice-analytics/health-score` 백엔드 명세. 로그 커브 기반 다차원 가중합산 공식 — `normalize(value, midpoint) = 100 × value / (value + midpoint)` — 지표 4종(일평균 활성 유저 40% midpoint=10, 일평균 총 음성시간 30% midpoint=5h, 마이크 사용률 20% midpoint=30%, 활동일 비율 10% midpoint=50%). `calculateHealthScore()` 시그니처에 `dailyTrends` 파라미터 추가. 기존 선형 공식(`avgDailyUsers × 10 + dailyAvgHours × 5`) 폐기 이유 명시.
2. **F-VOICE-041 신규 추가**: `GET /voice-analytics/health-diagnosis` 백엔드 명세. `generateHealthDiagnosis()`의 `maxOutputTokens: 1024` (기존 512에서 상향). 한국어 토큰 소모 특성으로 512 토큰에서 2~3문장 완성 전 잘림 문제 발생하여 상향.
3. **F-VOICE-042 신규 추가**: `GET /voice-analytics/leaderboard` 백엔드 명세. `getLeaderboard()`가 페이징된 유저 ID에 대해 `GuildMemberService.findByUserIds()`를 호출하여 실제 아바타 URL을 응답에 포함. 기존 `avatarUrl: null` 하드코딩 문제 및 수정 사유 명시.

**변경 사유**: 코드에 적용된 3가지 버그 수정 및 개선사항(리더보드 아바타 미노출 수정, AI 진단 텍스트 잘림 수정, 건강도 점수 항상 100점 문제 해결)이 PRD에 반영되어 있지 않아 명세를 추가하고 관련 백엔드 API 섹션을 신규 작성한다.

---

## [수정 43] voice: 자동방 통계 그룹핑 단위 Config → Button 변경 (VOICE-AUTO-BUTTON-GROUPING)

**변경일**: 2026-04-04
**티켓**: VOICE-AUTO-BUTTON-GROUPING

**변경 파일**:
- `docs/specs/prd/voice.md` — F-VOICE-032~038 수정 (자동방 그룹핑 단위를 AutoChannelConfig에서 AutoChannelButton으로 변경)

**변경 내용**:
1. F-VOICE-032: `AutoChannelInfo` 인터페이스에 `buttonId` (integer, nullable), `buttonLabel` (string, nullable) 필드 추가. Redis 저장 값 및 필드 테이블 갱신. 선택 모드 2지점에 `button.id`/`button.label` 전달, 즉시 모드 1지점에 null 전달 명세 추가
2. F-VOICE-033: `voice_daily` 테이블에 `autoChannelButtonId` (integer, nullable), `autoChannelButtonLabel` (varchar(255), nullable) 컬럼 2개 추가. 마이그레이션 SQL 및 새 인덱스 `IDX_voice_daily_auto_button` 추가
3. F-VOICE-034: Flush 로직에서 `buttonId`, `buttonLabel`을 추가 추출하여 `accumulateChannelDuration()`에 전달, UPSERT SQL에 버튼 컬럼 2개 포함 명세 추가
4. F-VOICE-035: `VoiceDailyRecordDto` 및 `ChannelStatItem`에 `autoChannelButtonId`, `autoChannelButtonLabel` 필드 추가. API 응답 예시에 버튼 필드 포함
5. F-VOICE-036: `groupAutoChannels=true` 시 그룹핑 키를 `autoChannelButtonId` 우선 → `autoChannelConfigId` 폴백으로 변경. 치환 채널명을 `buttonLabel` 우선 → `configName` 폴백으로 변경
6. F-VOICE-037: `VoiceDailyRecord` 타입에 버튼 필드 2개 추가. `VoiceAutoChannelGroupStat`에 `autoChannelButtonId`, `autoChannelButtonLabel` 필드 추가. `computeAutoChannelGroupStats()` 및 `computeChannelStats('auto_grouped')`의 그룹 키를 `buttonId ?? configId`로 변경
7. F-VOICE-038: "자동방 그룹" 탭 표시명을 `autoChannelButtonLabel` 우선 → `autoChannelConfigName` 폴백으로 변경. `SummaryCards`의 uniqueChannels 계산 기준을 button 단위로 변경. `UserChannelPieChart` 파이 슬라이스 기준 동일하게 변경. i18n 키 `voice.summary.autoChannelGroups`의 한국어 값을 "자동방 설정" → "자동방 버튼"으로 수정

**변경 사유**: 같은 AutoChannelConfig에 속한 버튼(일반방, 게임방, 경쟁방 등)이 Config 이름으로 합산되는 문제를 해결하기 위해 그룹핑 단위를 Button 레벨로 세분화

---

## [수정 42] newbie: F-NEWBIE-002-CANVAS 신입 미션 Canvas 표시 모드 추가 (NEWBIE-MISSION-CANVAS)

**변경일**: 2026-04-04
**티켓**: NEWBIE-MISSION-CANVAS

**변경 파일**:
- `docs/specs/prd/newbie.md` — F-NEWBIE-002에 missionDisplayMode 설정 및 Canvas 모드 명세 추가

**변경 내용**:
1. `NewbieConfig`에 `missionDisplayMode: 'EMBED' | 'CANVAS'` 설정 추가 (기본값 `EMBED`)
2. F-NEWBIE-002 섹션에 `표시 방식 선택 (missionDisplayMode)` 비교 표 추가
3. 기존 알림 메시지 단락을 `알림 메시지 — Embed 모드` 서브섹션으로 명시 분리
4. `알림 메시지 — Canvas 모드 (F-NEWBIE-002-CANVAS)` 서브섹션 신규 추가:
   - 여러 장 전송 방식 (10명/이미지, 한 메시지에 다중 첨부)
   - 갱신 버튼(🔄) 동작 및 `missionNotifyMessageId` 재활용 명세
   - Canvas 레이아웃 (800px 너비, 6개 컬럼: 닉네임·기간·상태·플레이타임·횟수·D-day)
   - 프로그레스 바 상세 (180px×14px, pill, 진행률+상태별 색상)
   - D-day 색상 규칙 (7일 이상/3~6일/1~2일/D-DAY/만료/완료)
   - 횟수 컬럼 표기 규칙 (targetPlayCount null 여부에 따른 분기)
   - 여러 장 구성 (1장: 헤더+테이블헤더+데이터+푸터, 2장 이후: 헤더 생략)
   - Canvas 렌더링 사양 (@napi-rs/canvas, NotoSansCJK, moco-rank.renderer.ts 패턴 재활용)
   - Redis 캐싱 명세 (키: `newbie:mission:canvas:{guildId}:page:{page}`, TTL: 30초)
5. `Embed 템플릿 시스템 (F-NEWBIE-002-TMPL)` 섹션에 Canvas 모드 무시 callout 추가
6. 기존 Embed 템플릿 시스템 불릿 목록 들여쓰기를 `####` 헤더 수준에 맞게 재정렬

**변경 사유**: 미션 현황을 Canvas 이미지 기반으로 더 직관적으로 표시하는 요구사항 반영. 모코코 F-NEWBIE-003-CANVAS와 동일한 패턴을 미션에도 적용.

---

## [수정 41] newbie: missionTargetPlayCount(목표 플레이횟수) 설정 추가 (NEWBIE-MISSION-PLAY-COUNT)

**변경일**: 2026-04-04
**티켓**: NEWBIE-MISSION-PLAY-COUNT

**변경 파일**:
- `docs/specs/prd/newbie.md` — 목표 플레이횟수 기능 명세 추가

**변경 내용**:
1. F-NEWBIE-002 달성 판정 로직 변경: `missionTargetPlayCount`가 NULL이면 기존과 동일(플레이타임만), 값이 있으면 `playtimeSec >= targetPlaytimeSec AND playCount >= targetPlayCount` (AND 조건)
2. F-NEWBIE-002 미션 상태 테이블 COMPLETED 설명 갱신 (달성 기준은 달성 판정 로직 참조)
3. F-NEWBIE-002 항목 템플릿 변수 테이블에 `{targetPlayCount}` 추가 (NULL이면 빈 문자열)
4. F-NEWBIE-002 기본값 블록 아래에 `{targetPlayCount}` NULL 처리 설명 추가
5. NewbieConfig 데이터 모델에 `missionTargetPlayCount` 컬럼 추가 (int, NULLABLE, `playCountMinDurationMin` 앞에 삽입)
6. NewbieMission 데이터 모델에 `targetPlayCount` 컬럼 추가 (int, NULLABLE, `targetPlaytimeSec` 다음에 삽입)
7. NewbieMissionTemplate 데이터 모델의 `itemTemplate` 허용 변수 목록에 `{targetPlayCount}` 추가
8. F-WEB-NEWBIE-001 탭 2 UI 테이블에 "목표 플레이횟수 입력 (숫자 + 활성화 체크박스)" 항목 추가
9. F-NEWBIE-005 GET /missions 응답 형식에 `targetPlayCount` 필드 추가

**변경 사유**: 플레이타임 단독 달성 기준만으로는 짧은 세션을 반복하는 패턴(AFK 등)을 거르지 못한다. 목표 플레이횟수를 AND 조건으로 추가하여 실제 참여 횟수까지 검증할 수 있도록 한다. NULL 기본값으로 기존 동작과 하위 호환성을 유지한다.

---

## [수정 40] guild-member: 길드 멤버 중앙 관리 도메인 PRD 신규 추가 (GUILD-MEMBER-INIT)

**변경일**: 2026-04-04
**티켓**: GUILD-MEMBER-INIT

**변경 파일**:
- `docs/specs/prd/guild-member.md` — 신규 도메인 PRD 작성
- `docs/specs/prd/_index.md` — 도메인 목록에 guild-member 추가, member 레거시 표기, 엔티티 테이블에 GuildMember 추가

**변경 내용**:
1. `guild_member` 테이블 데이터 모델 명세 (컬럼 11종, 인덱스 3종)
2. F-GUILD-MEMBER-001: clientReady 초기 bulk upsert 동기화
3. F-GUILD-MEMBER-002: guildCreate 신규 길드 동기화
4. F-GUILD-MEMBER-003: guildMemberAdd 멤버 입장 upsert
5. F-GUILD-MEMBER-004: guildMemberUpdate 닉네임 조건부 UPDATE
6. F-GUILD-MEMBER-005: userUpdate 전역 프로필 변경 반영 (nick=null 행 한정)
7. F-GUILD-MEMBER-006: guildMemberRemove isActive=false 마킹
8. F-GUILD-MEMBER-007: 소비자 도메인용 조회 메서드 명세 (5종)
9. F-GUILD-MEMBER-008: 기존 member 테이블 폐기 및 마이그레이션 절차
10. F-GUILD-MEMBER-009: Discord REST API 호출 → DB 조회 전환 대상 명세 (inactive-member, newbie, status-prefix, voice), 유지 대상 명세 (역할 필터링, 닉네임 변경 액션, DM, 역할 부여/제거)
11. Redis 이름 캐시 제거 방침 명시 (member:name:{guildId}:{userId} TTL 7일 → guild_member DB 조회로 대체)
12. 오류 처리 테이블, 비기능 요구사항(벌크 성능, 멱등성, 마이그레이션 무중단) 명세

**변경 사유**: Discord REST `fetchGuildMember()` 빈번 호출로 발생하는 Rate Limit 부하를 해소하고, 길드별 멤버 메타데이터(닉네임, 가입일, 봇 여부, 활성 여부)를 DB에서 단일 조회 가능하도록 중앙화한다. 기존 `member` 테이블은 guildId 없는 전역 레코드 구조여서 다중 서버 환경에서 닉네임 충돌이 발생하며, `guild_member`로 완전 대체한다.

---

## [수정 39] newbie: 모코코 순위 Canvas 렌더링 모드 추가 (NEWBIE-MOCO-CANVAS)

**변경일**: 2026-04-03
**티켓**: NEWBIE-MOCO-CANVAS

**변경 파일**:
- `docs/specs/prd/newbie.md` — F-NEWBIE-003 표시 방식 선택, Canvas 모드 명세, Redis 캐시 키 추가, NewbieConfig mocoDisplayMode 컬럼 추가, F-WEB-NEWBIE-001 탭 3 UI 추가

**변경 내용**:
1. **표시 방식 선택 명세 추가**: `mocoDisplayMode` 설정 도입 (`EMBED` | `CANVAS`, 기본값 `EMBED`). 두 모드가 완전히 독립 동작하며 Canvas 전환 시 기존 Embed 데이터 보존 명시.
2. **알림 메시지 섹션 분리**: 기존 단일 "알림 메시지" 섹션을 "Embed 모드"와 "Canvas 모드(F-NEWBIE-003-CANVAS)"로 명확히 분리. Embed 모드 내용은 그대로 유지.
3. **Canvas 랭킹 보드 명세 추가**: 10명/페이지 테이블, 800px 너비, 가변 높이(최소 400px, 최대 1200px), 테이블 컬럼 6종(순위/사냥꾼/점수/시간/세션/모코코), 집계 기간 및 점수 산정 규칙 표시.
4. **Canvas 개인 상세 명세 추가**: "내 순위" 버튼 클릭 시 Ephemeral 메시지로 600px 너비 PNG 반환. 사냥꾼 상세 정보 및 모코코 목록 포함.
5. **Canvas 렌더링 상세 표 추가**: 라이브러리(`@napi-rs/canvas`), 폰트(NotoSansCJK/NotoColorEmoji), 패턴(`profile-card-renderer.ts` 재활용), 출력 포맷(PNG) 명세.
6. **Canvas 렌더링 캐싱 명세 추가**: Redis 캐시 키 패턴 2종, TTL 30초, MocoScheduler 틱 완료 시 guildId 전체 캐시 삭제 정책.
7. **Embed 템플릿 시스템 섹션에 모드 조건 주석 추가**: Canvas 모드에서는 무시됨을 명시.
8. **NewbieConfig 데이터 모델 갱신**: `mocoEmbedThumbnailUrl` 다음에 `mocoDisplayMode` 컬럼 추가 — `enum('EMBED','CANVAS')`, NOT NULL, DEFAULT `'EMBED'`.
9. **Redis 키 구조 테이블 갱신**: Canvas 캐시 키 2종 추가 (`canvas:rank:{page}`, `canvas:detail:{hunterId}`), TTL 30초.
10. **TTL 정책 테이블 갱신**: "Canvas 렌더링 캐시" 항목 추가 — TTL 30초, MocoScheduler 틱 완료 시 guildId 전체 삭제.
11. **F-WEB-NEWBIE-001 탭 3 갱신**: "표시 방식 선택 드롭다운" UI 요소 추가. 기존 템플릿 설정 섹션을 "Embed 모드 전용" 조건부 렌더링으로 명시. Canvas 모드 전용 안내 섹션 추가.

**변경 사유**: 기존 Embed 방식은 1명/페이지 구조로 여러 사냥꾼을 한눈에 비교하기 어렵다. Canvas 이미지 기반 랭킹 테이블을 도입하여 10명을 한 화면에 표시하고, 개인 상세 정보는 Ephemeral 메시지로 제공함으로써 정보 밀도와 사용성을 개선한다. 기존 Embed 방식은 완전히 유지하여 이미 Embed를 사용 중인 길드에 영향을 주지 않는다.

---

## [수정 38] newbie: 미션 관리 UI 단일 테이블 + 상태 필터 개편 (NEWBIE-MISSION-UI-REFACTOR)

**변경일**: 2026-04-03
**티켓**: NEWBIE-MISSION-UI-REFACTOR

**변경 파일**:
- `docs/specs/prd/newbie.md` — 아키텍처 다이어그램 API 목록, F-NEWBIE-002 닉네임 저장 동작, F-NEWBIE-005 웹 UI 구조·API·응답 형식 전면 수정

**변경 내용**:
1. **아키텍처 다이어그램 갱신**: `GET /missions` 엔드포인트 설명을 "미션 통합 조회 (status·page·pageSize 파라미터)"로 수정. `GET /missions/history` 라인 제거.
2. **F-NEWBIE-002 닉네임 저장 동작 확장**: `enrichMissions()` 실행 시 Discord에서 조회한 최신 서버 닉네임을 DB `memberName`에 저장하는 동작 명시. 이력 조회 시 Discord API 호출 제거(DB `memberName` 직접 사용). `memberName`이 null인 경우에만 Discord 조회하되 탈퇴 멤버에게는 fallback 저장 안 함 명시.
3. **F-NEWBIE-005 웹 UI 구조 변경**: "진행 중" / "전체 이력" 두 탭을 폐지하고 단일 테이블 + 상태 필터(`전체` | `진행중` | `완료` | `실패` | `퇴장`) 방식으로 교체. 기본 선택 `진행중`. 페이지네이션을 모든 필터 상태에 공통 적용.
4. **F-NEWBIE-005 API 통합**: `GET /missions/history` 엔드포인트를 `GET /missions?status=&page=&pageSize=`로 통합. `status` 파라미터 생략 시 전체 상태 조회. 쿼리 파라미터 테이블 신규 추가.
5. **F-NEWBIE-005 응답 형식 갱신**: 기존 `GET /missions/history` 응답 스키마를 `GET /missions` 응답 스키마로 명칭 변경.

**변경 사유**: 관리자가 미션을 성공/실패 처리한 후 결과를 확인하려면 탭을 전환해야 하는 UX 불편이 있었다. 두 탭의 테이블 구조가 동일하고 "전체 이력"이라면서 진행 중 상태가 빠진 용어 혼란도 있었다. 단일 테이블 + 상태 필터 구조로 전환하여 처리 후 결과 즉시 확인이 가능하도록 하고, API도 하나로 통합하여 프론트엔드와 백엔드 모두 단순화한다.

---

## [수정 37] web: health-score API LLM 분리 및 AI 인사이트 자동 조회 제거 (WEB-DIAGNOSIS-PERF)

**변경일**: 2026-04-03
**티켓**: WEB-DIAGNOSIS-PERF

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-016 섹션 1 AI 진단 텍스트 설명, 섹션 5 AiInsightPanel 동작, 초기 로드 동작, 호출 API 테이블 수정

**변경 내용**:
1. **호출 API 테이블 갱신**: `GET /health-score` 설명을 "DB 쿼리만 수행(LLM 호출 없음), 응답 `{ score, prevScore, delta, diagnosis: "" }`, ~500ms 이내 반환"으로 수정. `GET /health-diagnosis?days=N` 엔드포인트 신규 추가 — LLM 호출 포함, 캐시 TTL 30분, 응답 `HealthDiagnosisResponse { diagnosis: string }`.
2. **섹션 1 AI 진단 텍스트 설명 수정**: 메인 데이터 로드 후 `GET /health-diagnosis`를 비동기로 별도 호출하여 스켈레톤 → 텍스트로 전환하는 방식으로 변경.
3. **초기 로드 동작 재작성**: `summary`, `health-score`, `leaderboard`, `channel-stats` 4개를 `Promise.all`로 병렬 조회 후 UI 렌더 → `health-diagnosis` 비동기 별도 호출로 AI 진단 텍스트 스켈레톤 → 텍스트 전환. AI 인사이트(섹션 5)는 페이지 진입 시 자동 조회하지 않으며, 기간 변경 시에도 자동 재조회하지 않음.
4. **섹션 5 AiInsightPanel "분석 새로고침" 버튼 설명 수정**: "페이지 진입 시 자동 조회 없음 — 사용자가 직접 버튼을 클릭할 때만 LLM 호출" 명시 추가.

**변경 사유**: `/dashboard/guild/{guildId}/diagnosis` 초기 진입 시 `GET /health-score`가 LLM 호출을 포함하여 3~8초 지연을 유발했다. LLM 호출을 별도 엔드포인트(`/health-diagnosis`)로 분리하고 프론트엔드에서 비동기 후속 로드 패턴을 적용하여 초기 UI 렌더링 블로킹을 제거한다. AI 인사이트의 자동 조회도 제거하여 불필요한 초기 네트워크 요청을 줄인다.

---

## [수정 36] inactive-member: gracePeriodDays 신입 유예 기간 추가 (INACTIVE-GRACE-PERIOD)

**변경일**: 2026-04-03
**티켓**: INACTIVE-GRACE-PERIOD

**변경 파일**:
- `docs/specs/prd/inactive-member.md` — F-INACTIVE-001 분류 로직, F-INACTIVE-005 설정 UI, InactiveMemberConfig 데이터 모델, PUT API 유효성 검증, 제약사항 갱신

**변경 내용**:
1. **F-INACTIVE-001 분류 기준 갱신**: `gracePeriodDays` 설정값 항목 추가 — 서버 가입 후 N일 미만인 멤버는 분류 대상에서 자동 제외. 기본값 7일, 허용 범위 0~30일.
2. **F-INACTIVE-001 동작 절차 갱신**: 5번 단계로 유예 필터링 로직 추가 — `gracePeriodDays > 0`인 경우 `APIGuildMember.joined_at`이 `(오늘 - gracePeriodDays)` 이후인 멤버를 `targetMembers`에서 제외. 기존 6~6번 단계는 6~7번으로 번호 조정.
3. **F-INACTIVE-001 제약 갱신**: `VoiceDailyEntity` 기록 없는 신규 가입자 관련 안내 문구에 `gracePeriodDays` 설정 권고 추가. `joined_at` 누락 시 처리 방침(분류 대상 포함) 명시.
4. **F-INACTIVE-005 비활동 판정 기준 섹션 갱신**: "신입 유예 기간 입력" UI 요소 추가 — 숫자 입력(일), 기본값 7, 범위 0~30, 0 입력 시 유예 없음 안내 문구 표시.
5. **InactiveMemberConfig 데이터 모델 갱신**: `gracePeriodDays` 컬럼 추가 — `int`, NOT NULL, DEFAULT `7`, 허용 범위 0~30.
6. **PUT API 유효성 검증 추가**: `gracePeriodDays` 필드에 대한 유효성 검증 규칙(정수, 0 이상 30 이하) 명세 추가.
7. **제약사항 섹션 갱신**: `gracePeriodDays` 관련 제약 3개 항목 추가.

**변경 사유**: 서버에 최근 가입한 신입 멤버가 음성 활동 이력이 없어 `FULLY_INACTIVE`로 잘못 분류되는 문제를 해결하기 위해 가입일 기반 유예 기간 기능을 도입한다.

---

## [수정 35] monitoring: Loki + Promtail 로그 수집 인프라 및 nestjs-pino 도입 (MONITORING-LOKI-LOGGING)

**변경일**: 2026-03-27
**티켓**: MONITORING-LOKI-LOGGING

**변경 파일**:
- `docs/specs/prd/monitoring.md` — F-MONITORING-020~023 신규 추가, 아키텍처 다이어그램 확장, 관련 모듈·외부 의존성·Docker Compose 서비스 구성 갱신

**변경 내용**:
1. **F-MONITORING-020 신규**: Loki + Promtail 로그 수집 인프라. Promtail이 Docker 소켓 마운트 방식으로 api/bot/web/lavalink 컨테이너 로그를 수집. 라벨링(`job`, `container_name`, `compose_service`). Loki 보존 기간 30일, 포트 3100 내부 전용. 설정 파일(`infra/loki/loki-config.yaml`, `infra/promtail/promtail-config.yaml`) 명세 포함.
2. **F-MONITORING-021 신규**: Bot 서버 구조화 로깅 — `nestjs-pino` + `pino-http` + `pino-pretty` 도입. `main.ts`에 `app.useLogger(app.get(Logger))`, `app.module.ts`에 `LoggerModule.forRootAsync()` 등록. 개발: pino-pretty 컬러 텍스트 + debug 레벨, 프로덕션: JSON 포맷 + info 레벨. 기존 `new Logger(ClassName.name)` 패턴 변경 불필요.
3. **F-MONITORING-022 신규**: Grafana Loki datasource 프로비저닝(`infra/grafana/provisioning/datasources/loki.yaml`). 봇 상태 대시보드에 Error Logs 패널 추가(LogQL: `{compose_service=~"api|bot"} |= "ERROR"`). 인프라 대시보드에 Slow Requests, 5xx Errors 패널 추가.
4. **F-MONITORING-023 신규**: 로그 기반 Grafana 알림 규칙 2종. `HighErrorLogRate`(에러 로그 분당 0.1건 초과, 5분 지속, warning), `DiscordRateLimited`(rate limit 로그 감지 즉시, 1분, warning). 기존 Alertmanager Discord Webhook 채널 공유.
5. **아키텍처 다이어그램 갱신**: Loki/Promtail 흐름 추가, Bot 서버 JSON 로그 표기.
6. **관련 모듈 갱신**: Bot 서버 `main.ts`, `app.module.ts` 추가. 인프라 Loki/Promtail 설정 파일, Grafana Loki datasource 파일 추가. `docker-compose.yml` Loki/Promtail 서비스 반영.
7. **외부 의존성 테이블 갱신**: Loki, Promtail 항목 추가.
8. **Docker Compose 서비스 구성 테이블 갱신**: `loki`, `promtail` 행 추가.

**변경 사유**: Prometheus 메트릭 모니터링만으로는 에러 원인 파악이 어려워 로그 중앙화가 필요하다. Bot 서버가 텍스트 로그를 출력하여 Loki에서 JSON 파싱 불가 문제를 nestjs-pino 도입으로 해결한다. 로그와 메트릭을 Grafana 단일 UI에서 통합 조회하고, 로그 기반 알림을 추가하여 이상 징후 감지 커버리지를 높인다.

---

## [수정 34] voice: 자동방 채널 통계 그룹핑 기능 추가 (VOICE-AUTO-CHANNEL-GROUPING)

**변경일**: 2026-03-27
**티켓**: VOICE-AUTO-CHANNEL-GROUPING

**변경 파일**:
- `docs/specs/prd/voice.md` — 자동방 채널 통계 그룹핑 섹션 신규 추가 (F-VOICE-032~039)

**변경 내용**:
1. **F-VOICE-032 신규**: 자동방 확정 시점에 `voice:channel:auto:{guildId}:{channelId}` 키를 7일 TTL로 저장. 값: `{ configId, configName, channelType }`. 채널 삭제 후에도 flush 시점까지 auto-channel 정보를 유지하여 타이밍 문제 해결.
2. **F-VOICE-033 신규**: `voice_daily` 테이블에 `channelType` (varchar, 기본값 `'permanent'`), `autoChannelConfigId` (int, nullable), `autoChannelConfigName` (varchar, nullable) 컬럼 추가. 마이그레이션 SQL 및 인덱스 2개 명세 포함.
3. **F-VOICE-034 신규**: `VoiceDailyFlushService.flushDate()` 내부에서 auto-channel 메타데이터를 Redis에서 조회하여 `accumulateChannelDuration()` 에 주입. UPSERT SQL에 세 컬럼 포함.
4. **F-VOICE-035 신규**: `VoiceDailyRecordDto`에 세 필드 추가. `ChannelStatItem`(libs/shared) 확장. `VoiceAnalyticsService.getChannelStats()`에서 새 필드 매핑. 하위 호환 유지.
5. **F-VOICE-036 신규**: `VoiceAnalyticsService.getChannelStats()`에 `groupAutoChannels` 옵션 추가. `true`이면 서버사이드에서 `autoChannelConfigId` 기준 레코드 합산. `diagnosis.controller.ts` 및 `diagnosis-query.dto.ts` 확장.
6. **F-VOICE-037 신규**: 프론트엔드 `VoiceDailyRecord` 타입 확장. `VoiceAutoChannelGroupStat` 인터페이스 신규. `computeAutoChannelGroupStats()` 함수 추가. `computeChannelStats()`에 `groupMode` 옵션(`'individual'` | `'auto_grouped'`) 추가.
7. **F-VOICE-038 신규**: `ChannelBarChart`에 "자동방 그룹" 탭 및 채널 유형 필터 드롭다운 추가. `SummaryCards`의 `uniqueChannels` 계산 방식 개선 (자동방은 config 단위 카운트). `UserChannelPieChart` 그룹핑 모드 적용. i18n 키 6개 추가.
8. **F-VOICE-039 신규**: 기존 데이터 소급 태깅 전략 명세. categoryId 기반 추론 로직, 오탐 주의사항, 일회성 스크립트 실행 방침.

**변경 사유**: 자동방으로 생성된 임시 채널들이 각각 별개의 channelId를 가지므로 대시보드 음성 채널 통계가 파편화되는 문제를 해결한다. channelType 및 autoChannelConfigId를 voice_daily에 영구 저장하여 config 단위 그룹핑과 채널 유형 필터링을 지원한다.

---

## [수정 33] monitoring: Prometheus + Grafana 인프라 모니터링 전환 (MONITORING-PROMETHEUS-MIGRATION)

**변경일**: 2026-03-26
**티켓**: MONITORING-PROMETHEUS-MIGRATION

**변경 파일**:
- `docs/specs/prd/monitoring.md` — 전체 재작성. bot_metric 기반 기능 Deprecated 처리, Prometheus + Grafana 기반 신규 기능 명세 추가

**변경 내용**:
1. **기존 기능 Deprecated 처리**: F-MONITORING-001(실시간 봇 상태 조회 API), F-MONITORING-002(1분 메트릭 수집 스케줄러), F-MONITORING-003(시계열 메트릭 조회 API), F-MONITORING-004(30일 보존 정책 크론), F-WEB-MONITORING-001(모니터링 대시보드 페이지 — recharts 차트 4종·StatusCards), `bot_metric` 테이블, Redis `monitoring:status` 키, `BotMonitoringScheduler`·`pushBotMetrics()`·`pushBotStatus()` 제거 예정 명시.
2. **F-MONITORING-010 신규 추가**: API 서버·Bot 서버 각각에 `GET /metrics` 엔드포인트 명세. `prom-client` `collectDefaultMetrics()` + 커스텀 메트릭 정의 (`discord_gateway_ping_ms`, `discord_guild_count`, `discord_voice_users_total`, `bot_uptime_seconds`, `http_request_duration_seconds`, `http_requests_total`). Bot 서버 15초 간격 Gauge 갱신 스케줄러 명세.
3. **F-MONITORING-011 신규 추가**: Docker Compose 인프라 서비스 구성 (Prometheus, Grafana, Alertmanager, Node Exporter, postgres-exporter, redis-exporter). Prometheus 스크레이프 설정 YAML, Alertmanager 알림 규칙 5종 (BotDown, ApiDown, HighMemoryUsage, HighGatewayPing, HighErrorRate), Discord Webhook 연동, Grafana 프로비저닝 방식 명세.
4. **F-MONITORING-012 신규 추가**: Grafana 대시보드 프로비저닝 2종 (봇 상태 대시보드 6개 패널, 인프라 대시보드 9개 패널) 명세. 패널별 메트릭·시각화 타입·설명 정의.
5. **아키텍처 다이어그램 재작성**: Prometheus scrape 기반 흐름으로 교체.
6. **데이터 모델 섹션 갱신**: `bot_metric` 테이블 제거 명시, 신규 테이블 없음 명시.
7. **Redis 키 구조 섹션 갱신**: 모니터링 관련 키 전부 제거 명시.
8. **외부 의존성 섹션 갱신**: Prometheus, Grafana, Alertmanager, Node Exporter, postgres-exporter, redis-exporter 추가.
9. **Web 도메인 연계 섹션 갱신**: 모니터링 대시보드 페이지 및 API 프록시 제거 예정 명시.
10. **Health Check 섹션 유지**: 기존 `GET /health`, `GET /health/liveness` 변경 없이 유지.

**변경 사유**: 서버 이전 및 프리미엄 서비스 도입을 앞두고, 애플리케이션 레벨 시계열 저장 방식(`bot_metric` 테이블 + 1분 크론)을 제거하고 Prometheus + Grafana 표준 인프라 모니터링으로 전환한다. 이를 통해 봇·API 외 호스트/DB/Redis 전체 인프라를 단일 모니터링 체계로 통합하고, 웹 대시보드의 모니터링 페이지 유지 비용을 제거한다.

---

## [수정 32] gemini: 슬래시 커맨드 4종 삭제 및 신규 기능 2종 추가 (GEMINI-VOICE-ANALYTICS-REVAMP)

**변경일**: 2026-03-21
**티켓**: GEMINI-VOICE-ANALYTICS-REVAMP

**변경 파일**:
- `docs/specs/prd/gemini.md` — F-GEMINI-001~004 삭제 처리, F-GEMINI-005 신규, F-GEMINI-006 신규, WeeklyReportConfig 데이터 모델 추가, 관련 모듈 섹션 갱신

**변경 내용**:
1. **F-GEMINI-001~004 삭제 처리**: `/voice-stats`, `/my-voice-stats`, `/community-health`, `/voice-leaderboard` 4개 슬래시 커맨드를 "삭제된 기능" 섹션으로 이동. 삭제 사유(사용률 저조, 웹 대시보드 이관) 명시.
2. **F-GEMINI-005 신규 추가**: `/서버진단` 단일 요약 커맨드 명세 작성. 입력(guildId 자동, days 기본 7), 처리(통계 집계 + LLM 2~3문장 요약 + TOP 3 리더보드), 출력(공개 Embed + 대시보드 링크 버튼).
3. **F-GEMINI-006 신규 추가**: 주간 자동 리포트 명세 작성. 매시간 Cron 스케줄러, dayOfWeek/hour/timezone 기반 발송, 이번 주 vs 지난 주 비교, TOP 5 유저, TOP 3 채널, LLM AI 종합 분석, 장애 대응(LLM 실패 시 통계만 전송).
4. **WeeklyReportConfig 데이터 모델 추가**: 엔티티 정의(guildId, isEnabled, channelId, dayOfWeek, hour, timezone, updatedAt) 명세.
5. **관련 모듈 섹션 갱신**: 삭제된 커맨드 파일 제거, 신규 모듈 파일 경로(server-diagnosis.command.ts, weekly-report.service.ts, weekly-report.scheduler.ts, weekly-report-config.entity.ts) 추가.
6. **개요 섹션 갱신**: 삭제 배경 및 대체 전략 요약 문단 추가.

**변경 사유**: F-GEMINI-001~004 슬래시 커맨드의 실사용률이 저조하여 유지 비용 대비 효용이 낮다. 상세 분석 기능은 웹 대시보드로 이관하고, 디스코드에는 핵심 요약(`/서버진단`)과 자동화된 주간 리포트만 유지하여 채널 노출 빈도를 높이고 유저 인지도를 개선한다.

---

## [수정 32] web: 서버 진단 대시보드 및 주간 리포트 설정 페이지 추가 (WEB-DIAGNOSIS)

**변경일**: 2026-03-21
**티켓**: WEB-DIAGNOSIS

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-016 서버 진단 대시보드, F-WEB-017 주간 리포트 설정 페이지 신규 추가, 관련 모듈·사이드바·미구현 목록 갱신

**변경 내용**:
1. **F-WEB-016 신규 추가**: `/dashboard/guild/{guildId}/diagnosis` 경로의 서버 진단 대시보드 요구사항 작성. 기존 디스코드 슬래시 커맨드 4종(`/voice-stats`, `/my-voice-stats`, `/community-health`, `/voice-leaderboard`)을 웹으로 이관하여 시각화.
2. **섹션 1 — 서버 건강도 스코어**: 0~100 원형(도넛) 게이지, 이전 기간 대비 변화량(↑↓), LLM 생성 AI 진단 텍스트 명세. `/community-health` 대체.
3. **섹션 2 — 활동 트렌드 차트**: 기간 선택(7/14/30/90일 프리셋), 일별 총 음성시간 라인 차트 + 일별 활성유저 수 바 차트 오버레이 명세. `/voice-stats` 대체.
4. **섹션 3 — 유저 리더보드**: 음성시간 기준 상위 유저 테이블(순위·아바타·닉네임·총 음성시간·마이크 ON 시간·활동일수), 10명 단위 페이지네이션, 행 클릭 시 음성활동 대시보드 유저 상세 뷰 이동 명세. `/voice-leaderboard` 대체.
5. **섹션 4 — 채널 분석**: 채널별 총 음성시간 가로 바 차트, 고유 사용자 수 표시, 카테고리별 탭 전환 명세.
6. **섹션 5 — AI 인사이트**: LLM 기반 주간 특이사항 분석 + 개선 제안, "분석 새로고침" 버튼(10분 쿨다운 Redis 기반), 마지막 분석 시각 표시 명세.
7. **호출 API 5종**: `health-score`, `summary`, `leaderboard`, `channel-stats`, `ai-insight` 신규 엔드포인트 명세 추가.
8. **관련 FE 파일**: 진단 대시보드 페이지, API 클라이언트, 컴포넌트 5종(HealthScoreGauge, ActivityTrendChart, LeaderboardTable, ChannelAnalysisChart, AiInsightPanel) 명세 추가.
9. **F-WEB-017 신규 추가**: `/settings/guild/{guildId}/diagnosis` 경로의 주간 리포트 설정 페이지 요구사항 작성. 활성화 토글, 대상 채널 선택, 발송 요일(0~6), 발송 시각(0~23, KST) 설정 명세.
10. **호출 API 2종**: `GET/POST /weekly-report/config` 엔드포인트 명세 추가.
11. **사이드바 "분석" 그룹 신설**: 대시보드 사이드바에 [분석] 그룹 추가 및 "서버 진단" 메뉴 항목 추가. F-WEB-009 DashboardSidebar 메뉴 구성 트리 갱신.
12. **설정 사이드바 "분석" 그룹 신설**: 설정 사이드바에 [분석] 그룹 추가 및 "서버 진단" 메뉴 항목 추가. F-WEB-015 설정 사이드바 표 갱신.
13. **크로스링크 매핑 갱신**: "서버 진단" 대시보드 ↔ 설정 연결 항목 추가.
14. **i18n 키 추가**: `sidebar.dashboard.group.analysis`, `sidebar.dashboard.item.diagnosis`, `sidebar.settings.group.analysis`, `sidebar.settings.item.diagnosis` 추가.
15. **관련 모듈 섹션 갱신**: 진단 대시보드 페이지, 주간 리포트 설정 페이지, API 클라이언트 2종 경로 추가.
16. **미구현 목록 갱신**: 서버 진단 대시보드, 주간 리포트 설정을 프로토타입/미구현 항목에 추가.

**변경 사유**: 기존 디스코드 슬래시 커맨드(`/voice-stats`, `/community-health`, `/voice-leaderboard`)는 텍스트 기반의 정보 제공에 한계가 있으며, 차트 시각화와 LLM 인사이트를 풍부하게 제공하기 위해 웹 대시보드로 이관한다. 주간 자동 리포트 설정을 웹에서 관리할 수 있도록 설정 페이지를 추가한다.

---

## [수정 31] web: 사이드바 메뉴 그룹 재구성 (WEB-SIDEBAR-REORG)

**변경일**: 2026-03-21
**티켓**: WEB-SIDEBAR-REORG

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-015 신규 추가, F-WEB-009의 DashboardSidebar 메뉴 구성 섹션 갱신

**변경 내용**:
1. **F-WEB-015 신규 추가**: 사이드바 메뉴 그룹 재구성 기능 명세 작성.
2. **대시보드 사이드바 재구성**: 기존 6개 플랫 메뉴를 3개 그룹(개요 / 회원 활동 / 시스템)으로 재편성. 그룹별 메뉴 항목 및 라우트 매핑 표 추가.
3. **설정 사이드바 재구성**: 기존 9개 플랫 메뉴를 3개 그룹(서버 설정 / 음성 채널 / 회원 관리)으로 재편성. 그룹별 메뉴 항목 및 라우트 매핑 표 추가.
4. **"일반 설정" → "커맨드 관리" 라벨 변경**: 실제 기능(슬래시 커맨드 목록 조회)에 맞게 설정 사이드바 첫 번째 메뉴 라벨 변경 명세 추가.
5. **크로스링크 UX 추가**: 대시보드 각 메뉴 항목 우측 설정 바로가기 아이콘, 설정 각 페이지 상단 대시보드 바로가기 버튼 명세 추가. 연결 매핑 표 포함.
6. **i18n 키 추가 대상 정의**: 그룹 헤더 라벨 및 변경된 메뉴 라벨 9종의 i18n 키 및 기본값 표 추가.
7. **F-WEB-009 DashboardSidebar 메뉴 구성 섹션 갱신**: 기존 플랫 구조 트리를 그룹 기반 트리 구조로 교체, F-WEB-015 참조 명시.
8. **관련 FE 파일 명세**: `DashboardSidebar.tsx`, `SettingsSidebar.tsx` 변경 대상 명시.

**변경 사유**: 기능이 늘어나면서 대시보드/설정 사이드바의 메뉴 항목이 많아져 탐색성이 저하되었으므로, 그룹 기반 구조로 재편성하여 UX를 개선한다. 크로스링크를 통해 대시보드와 설정 간 이동 마찰을 줄인다.

---

## [수정 30] web: 음악 설정 페이지 추가 (WEB-MUSIC-CONFIG)

**변경일**: 2026-03-21
**티켓**: WEB-MUSIC-CONFIG

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-014 음악 설정 페이지 신규 추가, 관련 모듈 섹션 갱신, 미구현 목록 갱신

**변경 내용**:
1. **F-WEB-014 신규 추가**: `/settings/guild/{guildId}/music` 경로의 음악 설정 페이지 요구사항 작성.
2. **섹션 1 — 음악 전용 채널 지정**: 텍스트 채널 선택 드롭다운, 채널 새로고침 버튼, 저장 시 고정 임베드 자동 전송 안내 명세.
3. **섹션 2 — 임베드 커스터마이징**: 제목, 설명, 색상 피커(#HEX), 썸네일 URL 입력, Discord 다크모드 스타일 실시간 미리보기 명세.
4. **섹션 3 — 버튼 구성**: 7종 버튼(음악 검색, 일시정지/재개, 스킵, 정지, 재생목록, 멜론차트, 빌보드) 활성화 토글, 행(row) 배치 셀렉트, 라벨/이모지 커스텀, 버튼 미리보기 명세.
5. **섹션 4 — 기본설정 리셋**: 확인 다이얼로그 포함, 임베드 설정 + 버튼 구성 전체 초기화(채널 지정 제외) 명세.
6. **저장 동작**: PUT 저장 시 DB upsert → 채널에 임베드 전송/수정 → messageId 업데이트 순서 명세.
7. **API 목록**: GET/PUT /music/config, POST /music/config/reset, GET /channels?type=text 4개 엔드포인트 명세.
8. **관련 모듈**: `apps/web/app/settings/guild/[guildId]/music/page.tsx`, `apps/web/app/lib/music-config-api.ts` 추가.
9. **SettingsSidebar**: Music 아이콘 + "음악 설정" 메뉴 항목 추가 명세.
10. **미구현 목록**: 음악 설정 페이지를 프로토타입/미구현 항목에 추가.

**변경 사유**: 음악 봇의 플레이어 임베드 채널 및 UI를 관리자가 웹에서 직접 커스터마이징할 수 있도록 음악 설정 페이지 요구사항을 PRD에 반영한다.

---

## [수정 30] music: 음악 전용 채널 임베드 시스템 추가 (MUSIC-CHANNEL-EMBED)

**변경일**: 2026-03-21
**티켓**: MUSIC-CHANNEL-EMBED

**변경 파일**:
- `docs/specs/prd/music.md` — 음악 전용 채널 임베드 시스템 전체 섹션 신규 추가 (F-MUSIC-010~017, MusicChannelConfig 데이터 모델, 웹 설정 REST API, 아키텍처 다이어그램 확장, 관련 모듈 경로 추가)

**변경 내용**:
1. **관련 모듈 추가**: `MusicChannelService`, `ChartCrawlerService`, `MusicChannelConfig` ORM 엔티티/레포지토리, 버튼/모달/메시지 인터랙션 핸들러, `music-channel-embed.builder`, API 컨트롤러/DTO 경로 추가.
2. **아키텍처 섹션 확장**: 기존 슬래시 커맨드 흐름을 "슬래시 커맨드 흐름"으로 명명하고, 음악 전용 채널 임베드 흐름(웹 설정 저장 → 임베드 전송, 버튼 클릭 분기, 텍스트 메시지 입력, Kazagumo 이벤트 → 임베드 갱신)을 별도 다이어그램으로 추가.
3. **F-MUSIC-010**: 음악 채널 고정 임베드 — 대기/재생 중 임베드 전환, 커스텀 제목/설명/색상/썸네일, messageId 관리 명세 추가.
4. **F-MUSIC-011**: 음악 검색 버튼 — Discord Modal 팝업 → Kazagumo 검색 → 재생 흐름 명세 추가.
5. **F-MUSIC-012**: 재생 컨트롤 버튼 3종 (`pause_resume`, `skip`, `stop`) — 기존 MusicService 로직 재사용 명세 추가.
6. **F-MUSIC-013**: 큐/재생목록 보기 버튼 — ephemeral 큐 목록 응답 명세 추가.
7. **F-MUSIC-014**: 멜론 인기차트 버튼 — TOP 20 크롤링, Redis 캐싱(1h TTL), Kazagumo 일괄 추가 명세 추가.
8. **F-MUSIC-015**: 빌보드 차트 버튼 — HOT 100 TOP 20 크롤링, Redis 캐싱(1h TTL), Kazagumo 일괄 추가 명세 추가.
9. **F-MUSIC-016**: 텍스트 입력 자동 검색 — `messageCreate` 이벤트 기반 자동 검색+재생+메시지 삭제 명세 추가.
10. **F-MUSIC-017**: 임베드 실시간 갱신 — `playerStart`/`playerEmpty`/`playerPause`/`playerResume` 이벤트별 임베드 갱신 동작 표 추가.
11. **데이터 모델 추가**: `MusicChannelConfig` (`music_channel_config`) 테이블 컬럼 정의 및 `buttonConfig` JSONB 구조 명세 추가.
12. **웹 설정 명세 추가**: 음악 채널 설정 섹션 UI 요소, 버튼 구성 섹션 UI 요소, REST API 4종 (GET/POST/PATCH/DELETE) 명세 추가.

**변경 사유**: 슬래시 커맨드 없이 지정된 텍스트 채널에서 버튼 클릭 및 텍스트 입력만으로 음악을 제어할 수 있는 고정 임베드 UI를 제공하고, 멜론/빌보드 차트 연동으로 탐색 없이 인기 곡을 바로 재생하는 경험을 지원한다.

---

## [수정 29] voice: 자동방 즉시 생성 모드 추가 및 확정방 내 채널 전환 기능 추가 (VOICE-AUTO-CHANNEL-INSTANT)

**변경일**: 2026-03-20
**티켓**: VOICE-AUTO-CHANNEL-INSTANT

**변경 파일**:
- `docs/specs/prd/voice.md` — 즉시 생성 모드(`instant`) 추가, F-VOICE-007 분기, F-VOICE-010/011 조건 확장, F-VOICE-012 적용 범위 명시, F-VOICE-020 신규, AutoChannelConfig 컬럼 추가, AutoChannelState Redis 키 구조 갱신

**변경 내용**:
1. **개요 갱신**: 선택 생성 모드(`select`)와 즉시 생성 모드(`instant`) 두 가지 모드 설명으로 재작성.
2. **전체 흐름 분리**: `select` 모드 흐름(기존)과 `instant` 모드 흐름을 별도 다이어그램으로 분리 추가. `select` 흐름에 "트리거 채널 또는 기존 확정방에 있는 사용자" 조건 명시.
3. **F-VOICE-007 수정**: 트리거 채널 입장 후 `mode` 컬럼 값에 따라 `select`(기존 대기 처리)와 `instant`(F-VOICE-020 위임)로 분기하는 로직 추가.
4. **F-VOICE-010 수정**: 버튼 클릭 유효성 조건을 "트리거 채널에 있어야 함"에서 "트리거 채널이거나 해당 설정의 확정방(`configId` 일치)에 있으면 허용"으로 확장.
5. **F-VOICE-011 수정**: 전제 조건 및 동작 1번을 트리거 채널/확정방 분기로 재작성. 확정방에서 클릭 시 새 확정방 생성 후 이동(기존 방 유지) 명세 추가. 버튼 클릭 주체 제한 없음 명시.
6. **F-VOICE-012 수정**: 적용 대상에 "선택 생성/즉시 생성 모드 모두 동일 적용" 명시.
7. **F-VOICE-020 신규**: 즉시 생성 모드 채널 생성 기능 요구사항 추가. 채널명 결정(`instantNameTemplate`, `{username}`, `{n}` 변수), 카테고리 지정(`instantCategoryId`), Redis 확정방 키 저장, 세션 추적, 미사용 설정 명세 포함.
8. **AutoChannelConfig 컬럼 추가**: `mode` enum 컬럼(기본값 `'select'`), `instantCategoryId` string nullable, `instantNameTemplate` string nullable 추가. 모드별 사용 컬럼 정리표 추가. 기존 컬럼은 변경 없음.
9. **AutoChannelState Redis 갱신**: `auto_channel:confirmed:{channelId}` 값 스키마에 `configId` 필드 추가. 즉시 생성 채널도 동일 키 구조 사용 명시. `configId`를 통한 소속 설정 판별 로직 설명 추가.

**변경 사유**: 안내 메시지 없이 트리거 채널 입장 즉시 채널을 생성하는 즉시 생성 모드(`instant`)를 추가하여 간소화된 자동방 생성 경험을 제공한다. 또한 이미 확정방에 있는 사용자도 임베드 버튼을 통해 다른 방으로 채널 전환이 가능하도록 버튼 클릭 조건을 확장한다.

---

## [수정 28] web: F-WEB-004 자동방 설정 페이지 UI 개선 — 모드 선택, 스텝 분할, 버튼 카드 그리드 (WEB-AUTO-CHANNEL-UI)

**변경일**: 2026-03-20
**티켓**: WEB-AUTO-CHANNEL-UI

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-004 섹션 전체 재작성

**변경 내용**:
1. **모드 라디오 버튼 추가**: STEP 1 트리거 설정에 `즉시 생성` / `선택 생성` 모드 선택 UI 추가. 모드에 따라 이후 스텝 표시 여부 제어.
2. **스텝 기반 섹션 분할**: 기존 단순 나열 구조를 실제 Discord 동작 순서대로 스텝 번호와 함께 재구성.
   - 즉시 생성 모드: STEP 1(트리거 설정) → STEP 2(채널 생성 설정 — 템플릿, 카테고리)
   - 선택 생성 모드: STEP 1(트리거 설정) → STEP 2(안내 메시지 설정 — 채널, Embed) → STEP 3(게임 선택 버튼 설정)
3. **버튼 목록을 카드 그리드 + 모달 편집 구조로 변경**: 기존 세로 나열 폼에서 라벨·이모지·카테고리명·하위 선택지 개수를 요약한 카드 그리드로 전환. `[수정]` 클릭 시 모달 다이얼로그에서 상세 편집. `[삭제]`, `[+ 추가]` 카드 포함.
4. **통합 미리보기 강화**: 기존 Embed 미리보기만 존재하던 구조에서 모드별 채널 구조 시각화 포함. 즉시 생성은 채널 구조 트리, 선택 생성은 Embed 미리보기 + 채널 구조 시각화 병행.
5. **저장 동작 검증 필드 모드별 분기**: 즉시 생성은 생성 카테고리 필수, 선택 생성은 안내 채널·Embed 설명·버튼 라벨·대상 카테고리 필수로 분리. AutoChannelConfig 저장 시 `mode` 필드 포함 명세 추가.

**변경 사유**: 즉시 생성 모드 지원을 위해 UI를 재구성하고, 버튼 설정의 화면 길이 문제를 카드 그리드 + 모달 패턴으로 해소한다.

---

## [수정 27] music: Lavalink v4 + Kazagumo v3 아키텍처 전환 및 기능 확장 (MUSIC-LAVALINK-MIGRATION)

**변경일**: 2026-03-20
**티켓**: MUSIC-LAVALINK-MIGRATION

**변경 파일**:
- `docs/specs/prd/music.md` — 아키텍처 전환, 모듈 경로 수정, F-MUSIC-001~005 기능 명세 갱신, Now Playing Embed 명세 추가, 인프라·의존성 섹션 신규 작성
- `docs/specs/prd/_index.md` — 핵심 기능 요약 3번(음악 재생) 갱신

**변경 내용**:
1. **아키텍처 전환**: `discord-player` 기반에서 `Lavalink v4(Docker) + Kazagumo v3(Shoukaku v4 래퍼)` 구조로 전환. 아키텍처 다이어그램 신규 추가.
2. **모듈 경로 수정**: `apps/api/src/music/` → `apps/bot/src/music/` 하위 계층 구조(application/presentation/dto) 반영.
3. **F-MUSIC-001 개선**: YouTube 검색어·URL 외에 플레이리스트 URL 일괄 큐 추가, Spotify URL, SoundCloud URL 지원 명세 추가. Now Playing Embed 출력 명세 추가.
4. **F-MUSIC-002 개선**: `/skip` 응답에 다음 트랙 Now Playing Embed 포함 명세 추가.
5. **F-MUSIC-004 신규**: `/pause` — 일시정지 커맨드 추가. 재생 중인 트랙 없을 시 에러 응답 예외 명세 포함.
6. **F-MUSIC-005 신규**: `/resume` — 재개 커맨드 추가. 일시정지 상태 아닐 시 에러 응답 예외 명세 포함.
7. **Now Playing Embed 명세 추가**: 제목·아티스트·진행바·시간·상태 필드 구조 표 형태로 문서화.
8. **인프라 섹션 신규**: Lavalink Docker 서비스 설정(`docker-compose.yml`, `lavalink/application.yml`), 환경변수(`LAVALINK_URL`, `LAVALINK_PASSWORD`) 명세 추가.
9. **의존성 갱신**: `kazagumo ^3.4.3`, `shoukaku ^4.1.0`, `@discordjs/voice` 추가. `discord-player`, `@discord-player/extractor`, `yt-search`, `ytdl-core`, `ffmpeg-static` 제거 명세.
10. **변경이력 참조 링크 추가**: `music.md` 상단에 `prd-changelog.md` 참조 링크 추가.

**변경 사유**: discord-player의 YouTube 추출 불안정 문제를 해소하고 Java 기반 Lavaplayer의 안정적인 오디오 처리 환경으로 전환한다. 플레이리스트·Spotify·SoundCloud 지원 및 /pause·/resume 커맨드 추가로 음악 재생 기능을 확장한다.

---

## [수정 26] voice: 음성 채널 추가 데이터 수집 — Phase 1·2 신규 추가 (VOICE-EXTENDED-DATA)

**변경일**: 2026-03-16
**티켓**: VOICE-EXTENDED-DATA

**변경 파일**:
- `docs/specs/prd/voice.md` — Phase 1(F-VOICE-025~027) 및 Phase 2(F-VOICE-028~031) 기능 명세 추가, Phase 1 데이터 모델 변경, Phase 2 신규 테이블 정의
- `docs/specs/prd/_index.md` — 핵심 기능 요약(1번) 갱신, 데이터베이스 엔티티 테이블에 VoiceGameActivity·VoiceGameDaily 추가, 데이터 보존 정책에 VoiceGameActivity 삭제 대상 추가

**변경 내용**:
1. **F-VOICE-025 (화면 공유 시간 추적)**: `VoiceState.streaming` 토글 감지 → Redis 세션에 ON/OFF 시각 누적 → `voice_daily.streamingSec` flush. `StreamingToggleHandler` 신설. 기존 MicToggleHandler 패턴 동일 적용.
2. **F-VOICE-026 (카메라 ON/OFF 시간 추적)**: `VoiceState.selfVideo` 토글 감지 → Redis 세션에 ON/OFF 시각 누적 → `voice_daily.videoOnSec` flush. `VideoToggleHandler` 신설.
3. **F-VOICE-027 (스피커 음소거 시간 추적)**: `VoiceState.selfDeaf` 토글 감지 → Redis 세션에 ON/OFF 시각 누적 → `voice_daily.deafSec` flush. `DeafToggleHandler` 신설.
4. **voice_daily 컬럼 추가**: `streamingSec int DEFAULT 0`, `videoOnSec int DEFAULT 0`, `deafSec int DEFAULT 0`. 기존 데이터는 0으로 유지. 마이그레이션 SQL 명세 포함.
5. **F-VOICE-028 (음성 입장 시 게임 상태 수집)**: `VoiceJoinHandler`에서 `member.presence.activities` 조회 → `ActivityType.Playing` 필터 → Redis 게임 세션 시작. null-safe 처리 명시.
6. **F-VOICE-029 (CoPresenceScheduler 틱에서 게임 상태 갱신)**: 60초 틱마다 각 멤버의 presence 조회 → 새 게임 시작/전환/종료 감지 → 세션 상태 갱신. 최대 60초 지연 발생 가능 명시.
7. **F-VOICE-030 (음성 퇴장 시 게임 세션 종료)**: `VoiceLeaveHandler`에서 Redis 게임 세션 조회 → 진행 중 세션 있으면 F-VOICE-031 수행 → Redis 키 삭제.
8. **F-VOICE-031 (게임 세션 종료 처리 및 저장)**: 플레이 시간 계산 → 1분 이상인 경우만 `voice_game_activity` INSERT + `voice_game_daily` UPSERT → Redis 키 삭제.
9. **신규 테이블 정의**: `voice_game_activity`(세션 단위, 90일 보존) 및 `voice_game_daily`(일별 집계, 영구 보존) 컬럼·인덱스·보존 정책 명세.
10. **Phase 2 인프라 요구사항 명세**: Discord Developer Portal PRESENCE INTENT 토글 ON, `discord.config.ts` `GatewayIntentBits.GuildPresences` 추가.
11. **VoiceGameService 아키텍처 다이어그램**: `onUserJoined()`, `onTick()`, `onUserLeft()`, `endSession()` 메서드 구조 문서화.

**변경 사유**: 현재 수집 중인 마이크 ON/OFF 외에 화면 공유·카메라·스피커 음소거 상태를 추가 수집하여 잠수 탐지 및 콘텐츠 기여자 식별 지표를 확보하고, 음성 채널 참여 중 게임 활동 데이터를 수집하여 멤버 활동 분석의 깊이를 높인다.

---

## [수정 25] web: 대시보드 재구성 — 서버 개요 및 신입 관리 대시보드 추가 (WEB-DASHBOARD-REORG)

**변경일**: 2026-03-14
**티켓**: WEB-DASHBOARD-REORG

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-008(서버 개요 페이지), F-WEB-009(신입 관리 대시보드) 신규 추가, F-WEB-003-B 진입점 갱신, DashboardSidebar 메뉴 구성 명세 추가, 관련 모듈 목록 갱신

**변경 내용**:
1. **관련 모듈 목록 갱신**: `overview/page.tsx`, `newbie/page.tsx`, `overview-api.ts`, `newbie-dashboard-api.ts` 파일 항목 추가
2. **현재 구현 상태 갱신**: "대시보드 페이지 미구현" 항목을 서버 개요(`/overview`)·신입 관리 대시보드(`/newbie`) 명세 완료·미구현 상태로 분리
3. **F-WEB-003-B 진입점 갱신**: 대시보드 첫 화면이 `/voice`에서 `/overview`(F-WEB-008)로 변경됨을 반영
4. **F-WEB-008 (서버 개요 페이지) 신규 추가**: 경로 `/dashboard/guild/{guildId}/overview`. 섹션 4종(요약 카드, 신입 미션 현황 카드, 최근 7일 음성 활동 미니 차트, 비활동 회원 요약), `missionEnabled = false` 시 미션 카드 비표시 Disable 처리, `GET /api/guilds/{guildId}/overview` API 명세
5. **F-WEB-009 (신입 관리 대시보드) 신규 추가**: 경로 `/dashboard/guild/{guildId}/newbie`. 탭 2개 구성(미션 관리/모코코 순위). 전체 Disable 처리(두 기능 모두 비활성 시 안내 화면, 하나만 비활성 시 해당 탭 비활성). 탭 1(미션 관리): 진행 중·이력 서브탭, 상태 변경 모달, Embed 토글, `missionEnabled = false` 시 읽기 전용/빈 상태 Disable 처리. 탭 2(모코코 순위): 기간 표시, 점수 분포 카드, 순위 테이블, 사냥꾼 상세 펼침, `mocoEnabled = false` 시 Disable 처리. 호출 API 8종 명세
6. **DashboardSidebar 메뉴 구성 명세 추가**: F-WEB-009 하위에 사이드바 7개 메뉴 항목(서버 개요·음성 활동·유저 검색·신입 관리·비활동 회원·관계 분석·모니터링) 경로 포함 tree 형태로 문서화

**변경 사유**: 대시보드 진입 시 서버 상태를 한눈에 파악할 수 있는 서버 개요 페이지를 첫 화면으로 추가하고, 설정 페이지에서 이동된 미션 수동 관리 기능과 모코코 순위를 단일 신입 관리 대시보드 페이지로 통합하여 관리 효율성을 높인다.

---

## [수정 24] newbie: F-WEB-NEWBIE-001 설정 페이지 탭 구성 변경 (NEWBIE-TAB-REORG)

**변경일**: 2026-03-14
**티켓**: NEWBIE-TAB-REORG

**변경 파일**:
- `docs/specs/prd/newbie.md` — F-WEB-NEWBIE-001 탭 구성 테이블 수정, 탭 3(미션 관리) 섹션 삭제, 탭 번호 재조정, F-NEWBIE-005 웹 UI 위치 명시

**변경 내용**:
1. **탭 구성 테이블** 수정: 탭 3(미션 관리, F-NEWBIE-005) 행 제거. 기존 탭 4(모코코 사냥 설정)를 탭 3으로, 기존 탭 5(신입기간 설정)를 탭 4로 번호 조정. 최종 탭 구성: 탭1=환영인사 설정, 탭2=미션 설정, 탭3=모코코 사냥 설정, 탭4=신입기간 설정
2. **탭 구성 테이블 하단** 에 F-NEWBIE-005 웹 UI 제공 위치 안내 주석 추가 (`/dashboard/guild/{guildId}/newbie`)
3. **탭 3(미션 관리) 섹션 전체 삭제**: 진행 중/이력 뷰 테이블 및 관련 UI 요소 명세 삭제
4. **탭 4 → 탭 3 번호 조정**: 헤더(`#### 탭 4: 모코코 사냥 설정` → `#### 탭 3: 모코코 사냥 설정`) 및 내부 소제목(`##### 템플릿 설정 섹션 (탭 4)` → `##### 템플릿 설정 섹션 (탭 3)`) 변경
5. **탭 5 → 탭 4 번호 조정**: 헤더(`#### 탭 5: 신입기간 설정` → `#### 탭 4: 신입기간 설정`) 변경
6. **저장 동작(템플릿) 섹션** 의 탭 번호 참조에 탭 이름 추가 (탭 2 → "탭 2(미션 설정)", 탭 3 → "탭 3(모코코 사냥 설정)")
7. **F-NEWBIE-005 기능 상세 섹션** 에 웹 UI 위치 안내 추가: "웹 UI 위치: 대시보드(`/dashboard/guild/{guildId}/newbie`). 설정 페이지에는 포함하지 않는다."

**변경 사유**: 미션 수동 관리(F-NEWBIE-005) UI가 설정 페이지(`/settings/guild/{guildId}/newbie`)에서 대시보드(`/dashboard/guild/{guildId}/newbie`)로 이동됨에 따라, 설정 페이지의 탭 구성에서 "미션 관리" 탭을 제거하고 나머지 탭 번호를 재조정한다. 백엔드 API 명세(F-NEWBIE-005)는 위치 이동 없이 유지한다.

---

## [수정 23] self-diagnosis: HHI 표시 레이어를 "관계 다양성 점수"로 변환 (SD-HHI-UX)

**변경일**: 2026-03-14
**티켓**: SD-HHI-UX

**변경 파일**:
- `docs/specs/prd/self-diagnosis.md` — F-SD-003, F-SD-004, F-SD-005, F-SD-008 내 HHI 관련 표시 방식 변경

**변경 내용**:
1. **F-SD-003 (VoiceHealthConfig)**: `hhiThreshold` 컬럼 설명에 "DB 저장값은 HHI 원본(0~1), UI에서는 `관계 다양성 점수 = (1 - HHI) × 100`으로 변환 표시" 추가. `badgeSocialHhiMax` 컬럼도 동일 내용 추가
2. **F-SD-004 (진단 로직)**: HHI 계산 섹션 다음에 "관계 다양성 점수 변환" 서브 섹션 신규 추가 — 변환 공식(`diversityScore = Math.round((1 - hhi) * 100)`), 변환 예시 3종, 구현 위치(`hhi-calculator.ts`의 `hhiToDiversityScore()` 유틸 함수), 프리셋 정의 테이블(느슨 50점/보통 70점/엄격 80점) 명세
3. **F-SD-005 (Embed 렌더링)**: 모드 A/B 예시 내 HHI 수치 표기를 다양성 점수 기반으로 변경
   - "HHI: 0.180 (낮을수록 다양)" → "관계 다양성: 82점 / 100"
   - "✅ 관계 다양성: HHI 0.180 (기준: HHI 0.3 이하)" → "✅ 관계 다양성: 82점 (기준: 70점 이상)"
   - "🌐 사교왕 — HHI 0.25 이하 & 교류 5명 이상 (HHI 0.180, 12명)" → "🌐 사교왕 — 다양성 75점 이상 & 교류 5명 이상 (현재 82점, 12명)" (모드 A, B 동일 적용)
4. **F-SD-008 (웹 대시보드)**: 섹션 2(정책 기준)의 "HHI 임계값 슬라이더"를 "관계 다양성 점수 슬라이더"로 변경 — 0~100점 범위, 기본 70점, 역변환 공식(`hhiThreshold = (100 - score) / 100`) 및 프리셋 버튼 3개(느슨/보통/엄격) UI 명세 추가. 섹션 3(뱃지 기준)의 "사교왕 HHI 상한 슬라이더"를 "사교왕 다양성 점수 슬라이더"로 변경 — 0~100점 범위, 기본 75점, 역변환 공식(`badgeSocialHhiMax = (100 - score) / 100`) 명세 추가

**변경 사유**: HHI 원본값(0.00~1.00, 낮을수록 좋음)은 일반 사용자와 관리자가 직관적으로 이해하기 어렵다. "관계 다양성 점수"(0~100점, 높을수록 좋음)로 표시 레이어에서만 변환하여 UX를 개선한다. DB 저장값과 내부 로직은 HHI 원본값을 유지하므로 데이터 무결성에 영향 없음.

---

## [수정 22] voice-co-presence: 관계 분석 대시보드 기능 추가 (COPRESENCE-ANALYTICS)

**변경일**: 2026-03-14
**티켓**: COPRESENCE-ANALYTICS

**변경 파일**:
- `docs/specs/prd/voice-co-presence.md` — 관계 분석 대시보드 섹션 추가 (F-COPRESENCE-007 ~ F-COPRESENCE-013), 마이그레이션 전략 Phase 4 구체화

**변경 내용**:
1. **마이그레이션 전략 Phase 4** 항목을 "(향후) 사용자 관계 분석 기능 구현"에서 구체적인 기능 ID 참조(F-COPRESENCE-007 ~ F-COPRESENCE-013)로 갱신
2. **"관계 분석 대시보드 (Phase 4)" 섹션** 신규 추가 — 관련 모듈, 기능 상세 7종, 백엔드 API 요약, 프론트엔드 파일 구조, 의존성, 기존 기능과의 관계 포함
3. **F-COPRESENCE-007 (관계 분석 요약 카드)**: 라우트 `/dashboard/guild/[guildId]/co-presence`. 기간 선택(7/30/90일). 활성 멤버 수, 총 관계 수, 총 동시접속 시간, 평균 관계 수/인 카드 4종. `GET /summary?days=30` API 명세
4. **F-COPRESENCE-008 (네트워크 그래프 시각화)**: `@react-sigma/core` + `graphology` 사용. 노드(크기=접속시간, 색상=Louvain 클러스터), 엣지(두께=동시접속시간). 줌/패닝/클릭 하이라이트/최소 임계값 슬라이더. 노드 상한 50명. `GET /graph?days=30&minMinutes=10` API 명세
5. **F-COPRESENCE-009 (친밀도 TOP N 패널)**: `PairDaily` 기준 `SUM(minutes)` 상위 10쌍. 유저 아바타 ↔ 구분, 총 시간, 세션 수. `GET /top-pairs?days=30&limit=10` API 명세. 아바타 Discord CDN 출처 명세
6. **F-COPRESENCE-010 (고립 멤버 감지)**: `VoiceCoPresenceDaily` 존재 && `VoiceCoPresencePairDaily` 없음 조건. 유저명, 총 음성 접속 시간, 마지막 음성 접속일 표시. `GET /isolated?days=30` API 명세
7. **F-COPRESENCE-011 (관계 상세 테이블)**: 전체 쌍 목록 5컬럼(유저A/B, 총 시간, 세션 수, 마지막 날짜). 유저명 검색 필터, 20건/페이지 페이지네이션, 컬럼 정렬. `GET /pairs?days=30&search=&page=1&limit=20` API 명세. `userId < peerId` 중복 제거 조건 명시
8. **F-COPRESENCE-012 (일별 동시접속 추이 차트)**: Recharts `AreaChart`. X축=날짜, Y축=서버 전체 총 동시접속 분. 양방향 보정(/2). `GET /daily-trend?days=30` API 명세
9. **F-COPRESENCE-013 (특정 쌍 일별 상세 모달)**: F-COPRESENCE-011 행 클릭 시 모달. Recharts `BarChart` (날짜별 쌍 동시접속 분). `GET /pair-detail?userA=&userB=&days=30` API 명세
10. **백엔드 API 요약 테이블**: `CoPresenceAnalyticsController` 컨트롤러 명세. 엔드포인트 7종, JwtAuthGuard 적용
11. **프론트엔드 파일 구조**: `apps/web/app/dashboard/guild/[guildId]/co-presence/` 경로 아래 7개 컴포넌트 파일 및 `co-presence-api.ts` API 클라이언트 명세
12. **의존성 추가**: `@react-sigma/core`, `graphology`, `graphology-communities-louvain` 3개 패키지 명세
13. **기존 기능과의 관계**: 관계 분석 대시보드의 읽기 전용 특성, 비활동 회원 도메인과의 독립성, `DashboardSidebar` 메뉴 연동 필요 사항 명세

**변경 사유**: 마이그레이션 전략 Phase 4에 기술된 "사용자 관계 분석 기능" 계획을 구체화. Co-Presence 도메인이 축적한 `VoiceCoPresencePairDaily` / `VoiceCoPresenceDaily` 데이터를 활용하여 네트워크 그래프, 친밀도 순위, 고립 멤버 감지 등 관계 분석 기능을 웹 대시보드에 제공하기 위한 요구사항 명세.

---

## [수정 21] inactive-member: 비활동 회원 관리 도메인 PRD 신규 추가 (INACTIVE-MEMBER)

**변경일**: 2026-03-14
**티켓**: INACTIVE-MEMBER

**변경 파일**:
- `docs/specs/prd/inactive-member.md` — inactive-member 도메인 PRD 신규 작성 (F-INACTIVE-001 ~ F-INACTIVE-005)
- `docs/specs/prd/_index.md` — 도메인 목록, 핵심 기능 요약, 데이터베이스 엔티티 테이블에 inactive-member 항목 추가

**변경 내용**:
1. `docs/specs/prd/inactive-member.md` 신규 생성: 개요, 관련 모듈, 아키텍처, 기능 상세, 데이터 모델, API 엔드포인트, 기존 기능과의 관계, 제약사항 포함
2. F-INACTIVE-001 (비활동 회원 자동 분류): 매일 00:00 KST 스케줄러 실행. `VoiceDailyEntity.channelDurationSec` 집계로 판단 기간 내 총 음성 접속 시간 계산. FULLY_INACTIVE(0분) / LOW_ACTIVE(임계값 미만) / DECLINING(이전 기간 대비 N% 감소) 3등급 분류. 제외 역할(`excludedRoleIds`) 설정 지원
3. F-INACTIVE-002 (웹 대시보드 비활동 회원 목록): `/dashboard/guild/{guildId}/inactive-member` 경로. 닉네임·분류 등급·마지막 음성 접속일·총 접속 시간·등급 변경일 컬럼 표시. 등급/기간/정렬 필터, 닉네임 검색, 일괄 선택 체크박스, 오프셋 기반 페이지네이션(20명/페이지)
4. F-INACTIVE-003 (비활동 회원 조치 액션): ACTION_DM(독려 DM 일괄 전송, Embed 템플릿 변수 지원) / ACTION_ROLE_ADD(비활동 역할 부여) / ACTION_ROLE_REMOVE(특정 역할 제거) 3종. 모든 조치는 `InactiveMemberActionLog`에 기록. 자동 조치 규칙(FULLY_INACTIVE 판정 시 자동 역할 부여/DM 발송) ON/OFF 설정 지원
5. F-INACTIVE-004 (비활동 통계 대시보드): 활동/비활동 비율 파이 차트, 주/월별 비활동 추이 라인 차트(등급별 3개 라인), 활동 복귀 회원 하이라이트
6. F-INACTIVE-005 (길드별 설정): `/settings/guild/{guildId}/inactive-member` 경로. 판단 기간(7/14/30일), 저활동 임계값(분), 활동 감소 비율(%) 설정. 자동 조치 ON/OFF, 역할 설정, 제외 역할 멀티 셀렉트, DM Embed 템플릿 커스텀(제목/본문/색상/실시간 미리보기)
7. 데이터 모델 3개 신규 추가: `InactiveMemberConfig`(길드별 설정), `InactiveMemberRecord`(분류 스냅샷, 복합 유니크 guildId+userId), `InactiveMemberActionLog`(조치 이력)
8. REST API 6종 명세: 목록 조회(쿼리 파라미터 7종), 통계 조회, 조치 실행, 설정 조회/저장, 이력 조회
9. `_index.md` 도메인 목록에 inactive-member 행 추가
10. `_index.md` 핵심 기능 요약 12번 항목(비활동 회원 관리) 추가
11. `_index.md` 데이터베이스 엔티티 테이블에 InactiveMemberConfig / InactiveMemberRecord / InactiveMemberActionLog 행 추가

**변경 사유**: 디스코드 서버 음성 채널 비활동 회원을 자동 식별하고 관리자가 웹 대시보드에서 조치할 수 있는 기능 요구사항 반영. 기존 `VoiceDailyEntity` 데이터를 재활용하여 별도 음성 이벤트 리스너 없이 구현 가능한 구조로 설계.

---

## [수정 20] monitoring: 봇 모니터링 도메인 PRD 신규 추가 (BOT-MONITORING)

**변경일**: 2026-03-10
**티켓**: BOT-MONITORING

**변경 파일**:
- `docs/specs/prd/monitoring.md` — monitoring 도메인 PRD 신규 작성 (F-MONITORING-001 ~ F-MONITORING-004, F-WEB-MONITORING-001)
- `docs/specs/prd/_index.md` — 도메인 목록, 핵심 기능 요약, 데이터베이스 엔티티 테이블에 monitoring 항목 추가

**변경 내용**:
1. `docs/specs/prd/monitoring.md` 신규 생성: 개요, 관련 모듈, 아키텍처, 기능 상세, 데이터 모델, Redis 키 구조, 외부 의존성, web 도메인 연계 명세 포함
2. F-MONITORING-001 (실시간 봇 상태 조회): `GET /api/guilds/{guildId}/bot/status` 엔드포인트 명세. Discord Client에서 online/uptime/ping/guildCount/memory/voiceUserCount 수집, Redis 10초 캐시
3. F-MONITORING-002 (메트릭 수집 스케줄러): 1분 간격 Cron으로 길드별 BotMetric 레코드 INSERT. status/pingMs/heapUsedMb/heapTotalMb/voiceUserCount/guildCount 수집
4. F-MONITORING-003 (시계열 메트릭 조회 API): `GET /api/guilds/{guildId}/bot/metrics` 엔드포인트 명세. from/to/interval 파라미터, date_trunc 기반 집계(1m/5m/1h/1d), availabilityPercent 계산
5. F-MONITORING-004 (메트릭 보존 정책): 매일 03:00 Cron으로 30일 초과 레코드 일괄 삭제
6. F-WEB-MONITORING-001 (모니터링 대시보드 페이지): `/dashboard/guild/{guildId}/monitoring` 경로, 상태 요약 카드 6개(봇 상태/업타임/핑/서버 수/메모리/음성 접속자), 차트 4개(업타임 히스토리 AreaChart, 핑 추이 LineChart, 메모리 추이 AreaChart, 시간대별 음성 접속자 BarChart), 기간 프리셋(24시간/7일/30일)
7. BotMetric 데이터 모델: `bot_metric` PostgreSQL 엔티티 명세 (guildId, status enum, pingMs, heapUsedMb, heapTotalMb, voiceUserCount, guildCount, recordedAt) 및 인덱스 2개
8. Redis 키 구조: `monitoring:status` (10초 TTL, 실시간 상태 캐시)
9. `_index.md` 도메인 목록에 monitoring 행 추가
10. `_index.md` 핵심 기능 요약 11번 항목(봇 모니터링) 추가
11. `_index.md` 데이터베이스 엔티티 테이블에 BotMetric 행 추가

**변경 사유**: 봇 상태(온라인/오프라인, 업타임, 핑, 메모리)와 서버 음성 접속자 추이를 웹 대시보드에서 시계열 차트로 모니터링하는 기능 요구사항 반영.

---

## [수정 19] newbie: 미션 수동 관리 기능 추가 (NEWBIE-MISSION-MANAGE)

**변경일**: 2026-03-10
**티켓**: NEWBIE-MISSION-MANAGE

**변경 파일**:
- `docs/specs/prd/newbie.md` — F-NEWBIE-005 신규 추가, F-NEWBIE-002 Embed 표시 범위 변경, NewbieMission 데이터 모델 확장, F-WEB-NEWBIE-001 탭 구성 변경, 아키텍처 API 목록 갱신

**변경 내용**:
1. **F-NEWBIE-005 (미션 수동 관리)** 신규 추가:
   - 관리자가 웹 대시보드에서 `IN_PROGRESS` 미션을 수동으로 성공/실패 처리
   - 성공 처리 시 옵션: Discord 역할 부여 (서버 역할 드롭다운 선택)
   - 실패 처리 시 옵션: 멤버 강퇴 (kick), 강퇴 전 DM 사유 메시지 전송
   - Embed 숨김: 특정 미션을 Discord Embed에서 제거 (`hiddenFromEmbed` 플래그)
   - 모든 옵션은 선택 사항 (역할 부여, 강퇴, DM 모두 옵션)
   - F-NEWBIE-004(신입기간 역할 자동관리)와 독립 동작
   - API 엔드포인트 4개: `GET missions/history`, `POST missions/complete`, `POST missions/fail`, `POST missions/hide`
   - 요청/응답 본문 스키마 정의, 에러 처리 및 warning 응답 규칙 명세
2. **F-NEWBIE-002 Embed 표시 범위 변경**:
   - 기존: `IN_PROGRESS` 상태 미션만 Embed에 표시
   - 변경: 모든 상태(IN_PROGRESS, COMPLETED, FAILED)의 미션을 Embed에 표시. `hiddenFromEmbed = true`인 미션은 제외
3. **NewbieMission 데이터 모델** 컬럼 1개 추가:
   - `hiddenFromEmbed` | `boolean` | NOT NULL, DEFAULT `false` | Embed 표시 제외 여부
   - 인덱스 추가: `IDX_newbie_mission_guild_visible` — `(guildId, hiddenFromEmbed)` — Embed 표시 대상 미션 조회
4. **F-WEB-NEWBIE-001 탭 구성 변경**:
   - 기존 4개 탭 → 5개 탭으로 확장
   - 탭 3 "미션 관리" 신규 추가 (F-NEWBIE-005 대응)
   - 탭 3 UI: 진행 중 미션 섹션(액션 버튼 포함) + 전체 이력 섹션(상태 필터, 페이지네이션)
   - 기존 모코코 사냥 설정 → 탭 4, 신입기간 설정 → 탭 5로 이동
5. **아키텍처 다이어그램** Web Dashboard API 섹션에 신규 엔드포인트 4개 추가

**변경 사유**: 관리자가 웹 대시보드에서 신입미션을 수동으로 관리(성공/실패 처리, 역할 부여, 강퇴, Embed 숨김)할 수 있는 기능 요구사항 반영. 미션 Embed가 완료/실패 멤버도 표시하도록 변경하고, 관리자가 특정 멤버를 Embed에서 수동 제거할 수 있도록 함.

---

## [수정 18] web: 카테고리별 탭 및 입퇴장 이력 카테고리 컬럼 추가 (WEB-CATEGORY-TAB)

**변경일**: 2026-03-09
**티켓**: WEB-CATEGORY-TAB

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-003-B 채널별 바차트에 카테고리별 탭 추가, F-WEB-007 채널별 도넛차트에 카테고리별 탭 추가 및 입퇴장 이력 테이블 5열 구조로 변경

**변경 내용**:
1. **F-WEB-003-B (음성 대시보드) — ChannelBarChart 카테고리별 탭 추가**:
   - 채널별 바차트(ChannelBarChart) 위에 [채널별 | 카테고리별] 탭 UI 추가
   - "채널별" 탭: 기존과 동일 (채널별 channelDurationSec 바차트)
   - "카테고리별" 탭: VoiceDailyRecord의 categoryId/categoryName으로 프론트엔드에서 집계하여 카테고리 단위 바차트 표시. categoryName이 null인 레코드는 "미분류" 등 별도 항목으로 묶어 표시
   - API 변경 없음 (기존 응답의 categoryId, categoryName 필드 활용)
2. **F-WEB-007 (유저 상세 페이지) — UserChannelPieChart 카테고리별 탭 추가**:
   - 채널별 활동 비율 도넛차트(UserChannelPieChart) 위에 [채널별 | 카테고리별] 탭 UI 추가
   - "채널별" 탭: 기존과 동일 (채널별 channelDurationSec 합계 비율 도넛 차트)
   - "카테고리별" 탭: categoryId/categoryName으로 프론트엔드에서 집계하여 카테고리 단위 도넛 차트 표시. categoryName이 null인 레코드는 "미분류" 등 별도 항목으로 묶어 표시
   - API 변경 없음
3. **F-WEB-007 (유저 상세 페이지) — 입퇴장 이력 테이블 카테고리 컬럼 추가**:
   - 기존 4열(채널명 | 입장 | 퇴장 | 시간) → 5열(카테고리 | 채널명 | 입장 | 퇴장 | 시간)로 변경
   - categoryName을 첫 번째 컬럼으로 추가. null인 경우 "—" 또는 빈 값 표시
   - API 변경 없음 (F-VOICE-020 응답에 이미 categoryId, categoryName 포함)

**변경 사유**: F-VOICE-021에서 VoiceDailyRecord 및 VoiceChannelHistory 응답에 categoryId/categoryName이 추가됨에 따라, 웹 대시보드와 유저 상세 페이지에서 해당 정보를 카테고리 단위 집계 및 컬럼 표시로 활용하는 UI 요구사항 반영.

---

## [수정 17] voice: 채널 카테고리(parentId) 정보 추가 (VOICE-CATEGORY)

**변경일**: 2026-03-09
**티켓**: VOICE-CATEGORY

**변경 파일**:
- `docs/specs/prd/voice.md` — Channel 데이터 모델 확장, VoiceDailyEntity 데이터 모델 확장, F-VOICE-001/002 동작 갱신, F-VOICE-017/018/020 응답 스키마 갱신, F-VOICE-021 신규 추가

**변경 내용**:
1. **Channel 데이터 모델** 컬럼 2개 추가:
   - `categoryId` (string, nullable) — 디스코드 카테고리 채널 ID (parentId). 카테고리 없는 채널은 null
   - `categoryName` (string, nullable) — 카테고리명 캐시. 카테고리 없는 채널은 null
2. **VoiceDailyEntity 데이터 모델** 컬럼 2개 추가:
   - `categoryId` (string, nullable) — 카테고리 채널 ID 캐시 (비정규화). GLOBAL 레코드는 null
   - `categoryName` (string, nullable) — 카테고리명 캐시 (비정규화). GLOBAL 레코드 또는 카테고리 없는 채널은 null
   - 비정규화 정책 명세 추가 (기존 channelName/userName 패턴과 동일)
3. **F-VOICE-001** 동작 2항 갱신: Channel 생성/갱신 시 F-VOICE-021에 따라 Discord API에서 parentId와 카테고리명을 조회하여 저장
4. **F-VOICE-002** 동작 3항 갱신: VoiceDailyEntity 개별 채널 레코드 upsert 시 `categoryId`, `categoryName` 함께 저장
5. **F-VOICE-017** 응답 스키마 갱신: `categoryId`, `categoryName` 필드 추가 (null 케이스 명세 포함)
6. **F-VOICE-018** 응답 스키마 갱신: `categoryId`, `categoryName` 필드 추가 (GLOBAL 레코드는 null)
7. **F-VOICE-020** 응답 스키마 갱신: 히스토리 항목에 `categoryId`, `categoryName` 필드 추가 (Channel 엔티티 값 반환, null 케이스 명세 포함)
8. **F-VOICE-021** (채널 카테고리 정보 수집 및 저장) 신규 추가:
   - Discord API(`guild.channels.fetch`)로 채널의 `parentId` 조회
   - `parentId` 유무에 따라 Channel 엔티티의 `categoryId`, `categoryName` 저장/갱신
   - VoiceDailyEntity 개별 채널 레코드 upsert 시 Channel에서 읽은 카테고리 정보 함께 저장
   - GLOBAL 레코드에는 카테고리 필드 null 설정
   - 기존 데이터 처리 정책: 이전 레코드는 null 유지, 재입장 시점부터 갱신
   - Discord API 실패 시 null 저장 후 입장 처리 계속 (non-blocking)

**변경 사유**: 디스코드 카테고리(parentId) 정보를 음성기록 시스템에 추가하여, 채널별 음성 통계 조회 시 카테고리 단위 분류 및 필터링을 가능하게 함. 커스텀 태그가 아닌 디스코드 네이티브 카테고리를 활용하며, 기존 channelName/userName 비정규화 패턴을 일관되게 유지함.

---

## [수정 16] web: 유저 상세 페이지(F-WEB-007) 추가 / voice: 유저 데이터 조회 API 3종 추가 (USER-DETAIL-PAGE)

**변경일**: 2026-03-09
**티켓**: USER-DETAIL-PAGE

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-007 (유저 상세 페이지) 추가
- `docs/specs/prd/voice.md` — F-VOICE-018 (유저별 음성 일별 통계 조회 API), F-VOICE-019 (멤버 검색 API), F-VOICE-020 (유저 입퇴장 이력 조회 API) 추가

**변경 내용**:
1. **F-WEB-007 (유저 상세 페이지)** 신규 추가:
   - 경로: `/dashboard/guild/{guildId}/user/{userId}`
   - 접근 방식 2가지: UserRankingTable 유저 행 클릭 / 검색창 직접 입력
   - 기간 선택 프리셋 버튼 (7일/14일/30일)
   - 유저 기본 정보 섹션: 아바타, 닉네임, 디스코드 ID
   - 음성 통계 요약 섹션: 총 음성시간, 마이크 ON/OFF 시간, 혼자 있던 시간
   - 일별 음성 트렌드 바 차트 (날짜별 channelDurationSec)
   - 채널별 사용 비율 파이/도넛 차트
   - 마이크 ON/OFF 분포 파이/도넛 차트
   - VoiceChannelHistory 기반 최근 입퇴장 이력 테이블 (채널명, 입장시각, 퇴장시각, 체류시간, 페이지네이션)
   - 유저 검색창 (debounce 300ms, 검색 결과 드롭다운)
   - 호출 API 테이블 3종 및 관련 FE 파일 목록 명시
2. **F-VOICE-018 (유저별 음성 일별 통계 조회 API)** 신규 추가:
   - 엔드포인트: `GET /api/guilds/:guildId/voice/daily` (기존 F-VOICE-017 확장)
   - 선택 파라미터 `userId` 추가: 제공 시 해당 유저 필터, 미제공 시 전체 유저 조회 (기존 동작 유지)
   - 인증: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
   - 응답: `VoiceDailyRecord[]` (F-VOICE-017과 동일 스키마)
3. **F-VOICE-019 (멤버 검색 API)** 신규 추가:
   - 엔드포인트: `GET /api/guilds/:guildId/members/search?q={query}`
   - `voice_daily` 테이블의 `userName` 컬럼 LIKE 매칭, guildId 필터
   - 중복 userId 제거, userName 오름차순, 최대 20개 반환
   - 응답: `MemberSearchResult[]` (`userId`, `userName`)
   - `q` 누락 시 400 응답
4. **F-VOICE-020 (유저 입퇴장 이력 조회 API)** 신규 추가:
   - 엔드포인트: `GET /api/guilds/:guildId/voice/history/:userId`
   - `VoiceChannelHistory` 기반 페이지네이션 조회
   - 쿼리 파라미터: `from`, `to` (선택), `page` (기본 1), `limit` (기본 20, 최대 100)
   - `joinAt` 내림차순 정렬
   - 응답: `VoiceHistoryPage` (`total`, `page`, `limit`, `items[]`)
   - `leftAt` null이면 접속 중 상태, `durationSec`도 null 반환

**변경 사유**: 유저별 음성 활동 상세 조회 기능 신규 요구사항 반영. 기존 서버 전체 통계 대시보드에서 특정 유저의 상세 음성 데이터를 조회·시각화하는 페이지와 이를 지원하는 백엔드 API 3종을 추가.

---

## [수정 15] voice: 음성 일별 통계 조회 API 추가 / web: 대시보드 상태 업데이트 (VOICE-DAILY-API)

**변경일**: 2026-03-09
**티켓**: VOICE-DAILY-API

**변경 파일**:
- `docs/specs/prd/voice.md` — F-VOICE-017 (음성 일별 통계 조회 API) 추가
- `docs/specs/prd/web.md` — F-WEB-003-B 현재 상태 및 호출 API 업데이트

**변경 내용**:
1. **F-VOICE-017 (음성 일별 통계 조회 API)** 신규 추가:
   - 엔드포인트: `GET /api/guilds/:guildId/voice/daily?from=YYYYMMDD&to=YYYYMMDD`
   - 인증: JWT Bearer 토큰 필수 (JwtAuthGuard 적용)
   - 쿼리 파라미터: `from`, `to` (YYYYMMDD 형식, 필수)
   - 동작: `guildId` + `date BETWEEN from AND to` 조건으로 `VoiceDailyEntity` 조회 후 `VoiceDailyRecord[]` 반환
   - 응답 스키마: `guildId`, `userId`, `userName`, `date`, `channelId`, `channelName`, `channelDurationSec`, `micOnSec`, `micOffSec`, `aloneSec`
   - FE 호출 경로: `apps/web/app/dashboard/guild/[guildId]/voice/page.tsx` → Next.js 프록시 → `http://api:3000/api/guilds/{guildId}/voice/daily`
   - 관련 FE 파일 목록 명시 (대시보드 페이지, API 클라이언트, 차트 컴포넌트 5종)
2. **F-WEB-003-B** 업데이트:
   - 현재 상태를 "미구현. 플레이스홀더 없음."에서 "음성 통계 대시보드 페이지 및 차트 컴포넌트 5종, API 클라이언트 구현 완료. 백엔드 API 구현 진행 중."으로 변경
   - 경로를 `/dashboard`에서 `/dashboard/guild/{guildId}/voice`로 구체화
   - 관련 FE 파일 목록 및 호출 API 테이블 추가

**변경 사유**: FE 대시보드(`/dashboard/guild/{guildId}/voice`)가 호출하는 백엔드 음성 일별 통계 조회 API 구현 요구사항 반영. FE는 이미 완전히 구현되어 있으며 백엔드 API가 필요한 상태.

---

## [수정 14] voice: 음성 시간 제외 채널 기능 추가 (VOICE-EXCLUDED-CHANNELS)

**변경일**: 2026-03-08
**티켓**: VOICE-EXCLUDED-CHANNELS

**변경 파일**:
- `docs/specs/prd/voice.md` — F-VOICE-013 ~ F-VOICE-016, VoiceExcludedChannel 데이터 모델, Redis 키 구조 추가
- `docs/specs/prd/_index.md` — 데이터베이스 엔티티 테이블에 VoiceExcludedChannel 행 추가

**변경 내용**:
1. **F-VOICE-013 (제외 채널 설정 조회)**: `GET /api/guilds/{guildId}/voice/excluded-channels` 엔드포인트 명세. guildId 기준 전체 조회 및 응답 형식 정의
2. **F-VOICE-014 (제외 채널 등록)**: `POST /api/guilds/{guildId}/voice/excluded-channels` 엔드포인트 명세. `type` 필드(`CHANNEL`/`CATEGORY`) 정의, 중복 시 409 응답, 카테고리 등록 시 하위 채널 전체 제외 동작 명세, Redis 캐시 무효화 명세
3. **F-VOICE-015 (제외 채널 삭제)**: `DELETE /api/guilds/{guildId}/voice/excluded-channels/{id}` 엔드포인트 명세. id+guildId 일치 검증, Redis 캐시 무효화, 404 예외 처리 명세
4. **F-VOICE-016 (음성 이벤트 처리 시 제외 채널 필터링)**: `voiceStateUpdate` 이벤트 수신 직후 제외 채널 판별 로직 명세
   - Redis 캐시 조회 (미스 시 DB 조회 후 1시간 TTL 캐싱)
   - `CHANNEL` 타입: channelId 직접 비교
   - `CATEGORY` 타입: Discord API로 parentId 조회 후 비교
   - 이동(move) 이벤트 세부 처리 규칙 (A-제외/B-일반, A-일반/B-제외, 둘 다 제외, 둘 다 일반 케이스)
   - 자동방 트리거 채널과의 관계 명세 (별도 처리 불필요)
5. **VoiceExcludedChannel 데이터 모델** (`voice_excluded_channel`) 신규 추가: id, guildId, channelId, type(enum CHANNEL/CATEGORY), createdAt, updatedAt 컬럼 및 인덱스 2개 정의
6. **Redis 키 구조 추가**: `voice:excluded:{guildId}` (1시간 TTL, String/JSON) — 제외 채널 목록 캐시, 등록/삭제 시 명시적 무효화 규칙 명세
7. `_index.md` 데이터베이스 엔티티 테이블에 VoiceExcludedChannel 행 추가

**변경 사유**: 특정 음성 채널(AFK 채널, 관전 채널, 대기 채널 등)을 음성 시간 추적에서 제외하는 요구사항 반영. 카테고리 단위 일괄 제외를 지원하여 설정 편의성을 높임.

---

## [수정 13] web: 음성 설정 페이지(F-WEB-006) 추가 (VOICE-SETTINGS-PAGE)

**변경일**: 2026-03-08
**티켓**: VOICE-SETTINGS-PAGE

**변경 파일**:
- `docs/specs/prd/web.md` — 관련 모듈, 구현 상태, F-WEB-006 음성 설정 페이지 추가

**변경 내용**:
1. 관련 모듈 목록에 `apps/web/app/settings/guild/[guildId]/voice/page.tsx` 경로 추가
2. 구현 상태 "완료" 항목에 음성 설정 페이지(`/settings/guild/{guildId}/voice`) 추가
3. F-WEB-006 (음성 설정 페이지) 신규 추가:
   - 경로: `/settings/guild/{guildId}/voice`, 사이드바 > 음성 설정 (Mic 또는 Volume2 아이콘)
   - 사이드바 메뉴 항목 명세
   - 음성 시간 제외 채널 섹션: 멀티 셀렉트 드롭다운 (음성 채널 + 카테고리), 📁/🔊 아이콘 구분, 태그(칩) 형태 선택 항목 표시, 카테고리 선택 시 인라인 안내 문구, 채널 새로고침 버튼 명세
   - 저장 동작: 필수 항목 없음(0개 선택도 허용), `POST /api/guilds/{guildId}/voice/excluded-channels` 전체 교체 방식, 성공/실패 인라인 메시지(3초 소멸) 명세
   - 초기 로드: `GET /api/guilds/{guildId}/voice/excluded-channels` 조회 후 드롭다운 선택 상태 반영 명세
   - API 테이블: GET/POST 엔드포인트 및 요청/응답 형식 명세

**변경 사유**: 음성 시간 집계 시 특정 채널 또는 카테고리를 제외하는 기능을 웹 대시보드에서 설정할 수 있도록 음성 설정 전용 페이지를 신규 추가.

---

## [수정 12] newbie: 플레이횟수 카운팅 옵션 추가 (NEWBIE-PLAYCOUNT-OPTION)

**변경일**: 2026-03-08
**티켓**: NEWBIE-PLAYCOUNT-OPTION

**변경 파일**:
- `docs/specs/prd/newbie.md` — F-NEWBIE-002, NewbieConfig 데이터 모델, F-WEB-NEWBIE-001 탭 2, Voice 도메인 연계 섹션 수정

**변경 내용**:
1. **F-NEWBIE-002 동작 (플레이타임 측정)**: "플레이횟수" 정의에 카운팅 옵션 적용 후 집계임을 명시. 플레이횟수 카운팅 옵션 서브 항목 신규 추가
   - 최소 참여시간 기준(`playCountMinDurationMin`): 세션 참여시간이 N분 이상인 경우만 유효 1회로 인정. NULL이면 비활성화. 예시 포함
   - 시간 간격 기준(`playCountIntervalMin`): 이전 유효 세션 시작 후 N분 이내 재입장은 동일 1회로 병합. NULL이면 비활성화. 예시 포함
   - 두 옵션 동시 적용 가능(AND 조건) 규칙, 기본값 30분, 최솟값 1분 명세
2. **데이터 모델 NewbieConfig**: `missionNotifyChannelId` 컬럼 앞에 두 컬럼 추가
   - `playCountMinDurationMin` | `int` | NULLABLE | 플레이횟수 카운팅 최소 참여시간 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1
   - `playCountIntervalMin` | `int` | NULLABLE | 플레이횟수 카운팅 시간 간격 기준 (분). NULL이면 비활성화. 기본값 30, 최솟값 1
3. **F-WEB-NEWBIE-001 탭 2 (미션 설정)**: UI 요소 테이블에 두 항목 추가
   - 플레이횟수 최소 참여시간 입력 (숫자 + 활성화 체크박스): 분 단위, 체크박스 OFF 시 NULL 저장, 기본값 30
   - 플레이횟수 시간 간격 입력 (숫자 + 활성화 체크박스): 분 단위, 체크박스 OFF 시 NULL 저장, 기본값 30
4. **Voice 도메인 연계 > 플레이횟수 조회 쿼리 조건**: 단순 `COUNT(*)` 쿼리 대신 기본 후보 세션 조회 쿼리 + 애플리케이션 레이어 2단계 필터링 로직으로 교체
   - 1단계: 최소 참여시간 필터 (`playCountMinDurationMin` NOT NULL 시)
   - 2단계: 시간 간격 병합 (`playCountIntervalMin` NOT NULL 시)
   - 두 옵션 모두 NULL이면 전체 세션 수 그대로 사용

**변경 사유**: 플레이횟수 1회의 기준을 설정할 수 있는 두 가지 옵션(최소 참여시간, 시간 간격 병합)을 추가하여 단순 세션 카운트의 한계를 보완. 짧은 참여나 연속 재입장을 의미 있는 단위로 집계할 수 있도록 확장.

---

## [수정 11] sticky-message: 고정메세지 도메인 PRD 신규 추가 (STICKY-MESSAGE)

**변경일**: 2026-03-08
**티켓**: STICKY-MESSAGE

**변경 파일**:
- `docs/specs/prd/sticky-message.md` — sticky-message 도메인 PRD 신규 작성 (F-STICKY-001 ~ F-STICKY-007, F-WEB-005)
- `docs/specs/prd/_index.md` — 도메인 목록, 핵심 기능 요약, 데이터베이스 엔티티 테이블에 sticky-message 항목 추가
- `docs/specs/prd/web.md` — 관련 모듈, 구현 상태, F-WEB-005 고정메세지 설정 페이지 추가

**변경 내용**:
1. `docs/specs/prd/sticky-message.md` 신규 생성: 개요, 관련 모듈, 아키텍처, 기능 상세, 데이터 모델, Redis 키 구조, 슬래시 커맨드 목록, 외부 의존성, web 도메인 연계 명세 포함
2. F-STICKY-001 (설정 목록 조회): `GET /api/guilds/{guildId}/sticky-message` 엔드포인트 응답 형식 명세
3. F-STICKY-002 (고정메세지 등록/수정): 웹 설정 저장 시 DB upsert + Redis 캐시 갱신 + Discord 채널에 Embed 즉시 전송 명세
4. F-STICKY-003 (고정메세지 삭제): Discord 채널 메시지 삭제 + DB 삭제 + Redis 캐시 무효화 명세
5. F-STICKY-004 (messageCreate 감지 및 디바운스 재전송): 봇 메시지 무시, Redis 설정 캐시 조회, 3초 디바운스 타이머, 기존 메시지 삭제 후 재전송 플로우 명세
6. F-STICKY-005~007 (슬래시 커맨드 3종): `/고정메세지등록` (웹 안내 Ephemeral), `/고정메세지목록` (Embed 목록 Ephemeral), `/고정메세지삭제` (채널 파라미터 선택, 전체 삭제) 명세
7. 데이터 모델: `StickyMessageConfig` (`sticky_message_config`) PostgreSQL 엔티티 명세 (guildId, channelId, embedTitle, embedDescription, embedColor, messageId, enabled, sortOrder) 및 인덱스 3개 정의
8. Redis 키 구조: `sticky_message:config:{guildId}` (설정 캐시 TTL 1h), `sticky_message:debounce:{channelId}` (디바운스 타이머 TTL 3s) 명세
9. `_index.md` 도메인 목록에 sticky-message 행 추가
10. `_index.md` 핵심 기능 요약 10번 항목(고정메세지) 추가
11. `_index.md` 데이터베이스 엔티티 테이블에 StickyMessageConfig 행 추가
12. `web.md` 관련 모듈, 구현 상태에 sticky-message 페이지 경로 추가
13. `web.md` F-WEB-005 (고정메세지 설정 페이지) 신규 추가: 카드 목록 UI, 채널 선택, Embed 설정(제목/설명/색상/이모지 피커/실시간 미리보기), 카드별 개별 저장·삭제 동작, 초기 로드 명세

**변경 사유**: 텍스트 채널 고정메세지(Sticky Message) 도메인 신규 요구사항 반영 (티켓 STICKY-MESSAGE)

---

## [수정 10] web/voice: 자동방 설정 다중 탭 UI 및 AutoChannelConfig name 컬럼 추가 (AUTO-CHANNEL-MULTI-TAB)

**변경일**: 2026-03-08
**티켓**: AUTO-CHANNEL-MULTI-TAB

**변경 파일**:
- `docs/specs/prd/web.md` — F-WEB-004 자동방 설정 페이지를 단일 폼에서 다중 탭 UI로 변경
- `docs/specs/prd/voice.md` — AutoChannelConfig 데이터 모델에 `name` 컬럼 추가

**변경 내용**:
1. **web.md F-WEB-004** 구성 섹션 전면 재작성:
   - 탭 바(Tab Bar) 섹션 신규 추가: 탭 목록, `+` 탭 추가 버튼, 탭 삭제 버튼(확인 모달 + `DELETE /api/guilds/{guildId}/auto-channel/{configId}` 호출), 탭 전환 동작 명세
   - 설정 이름 섹션 신규 추가: 탭 라벨로 표시될 사용자 지정 `name` 입력 필드(필수)
   - 저장 동작을 "탭별 개별 저장"으로 변경: 현재 탭 설정만 전송, 각 탭에 독립적인 저장 버튼 및 피드백 메시지
   - 탭 삭제 동작 섹션 신규 추가: 확인 모달 표시 → DELETE API 호출 → 안내 메시지 즉시 삭제 → 탭 제거 플로우 명세
   - 초기 로드 섹션 신규 추가: 기존 설정 전체를 탭으로 로드, 설정 없을 때 빈 탭 1개 기본 표시, 개수 제한 없음 명세
   - 기존 "(수정)" 표기 규칙 제거 (탭 구조로 대체됨)
2. **voice.md AutoChannelConfig** 데이터 모델 테이블에 `name` 컬럼 추가:
   - `name` | string | 설정 이름 (웹 탭 라벨용, 예: "게임방", "스터디방")

**변경 사유**: 하나의 서버에서 트리거 채널(대기방)을 여러 개 운용하는 요구사항을 지원하기 위해, 단일 폼 구조를 다중 탭 구조로 변경. 각 탭이 독립된 AutoChannelConfig를 나타내며, 사용자 지정 이름으로 탭을 식별할 수 있도록 `name` 필드를 추가함.

---

## [수정 9] voice: Auto Channel 데이터 모델 및 Redis 키 구조 코드베이스 기준 동기화 (VOICE-SYNC-001)

**변경일**: 2026-03-08
**티켓**: VOICE-SYNC-001

**변경 파일**:
- `docs/specs/prd/voice.md` — AutoChannelConfig/Button/SubOption 데이터 모델 및 AutoChannelState Redis 키 구조 수정, F-VOICE-007~011 기능 명세 갱신, 전체 흐름 다이어그램 수정

**변경 내용**:
1. **AutoChannelState (Redis)** 섹션 전면 재작성
   - `auto_channel:waiting:{channelId}` 키 제거 — 코드에 미구현, 대기방은 `RedisTempChannelStore`가 관리
   - `auto_channel:trigger:{guildId}` 키 제거 — 코드에 미구현, 트리거 채널은 DB 직접 조회
   - 확정방 키(`auto_channel:confirmed:{channelId}`) TTL 12시간 명시
   - `voice:temp:channels:{guildId}` (Set), `voice:temp:channel:{channelId}:members` (Set) 키 추가 (RedisTempChannelStore 관리)
   - 트리거 채널 조회 방식(`findByTriggerChannel` DB 조회) 명시
2. **AutoChannelSubOption** 데이터 모델: `channelSuffix` → `channelNameTemplate`으로 필드명 변경, `{name}` 템플릿 변수 동작 명세 추가
3. **AutoChannelButton** 데이터 모델: `channelNameTemplate` (nullable) 필드 추가 — 확정방 채널명 템플릿
4. **AutoChannelConfig** 데이터 모델: `guideChannelId` (nullable), `embedTitle` (nullable), `embedColor` (nullable) 필드 추가. `waitingRoomTemplate`을 nullable로 수정
5. **F-VOICE-007** (트리거 채널 입장 감지): DB 조회 방식(`findByTriggerChannel`) 명시, Redis 캐싱 없음 명시
6. **F-VOICE-008** (대기방 관련): "대기방 생성 및 사용자 이동"에서 "대기방 상태 관리"로 변경. 별도 채널 생성 없음을 명시하고 `RedisTempChannelStore` 키 패턴 기술
7. **F-VOICE-009** (안내 메시지): 전송 대상을 `guideChannelId`(텍스트 채널)로 수정, Embed 형식(`embedTitle`/`embedColor`) 명세 추가, customId 형식(`auto_btn:{buttonId}`) 명시
8. **F-VOICE-010** (하위 선택지): `channelSuffix` → `channelNameTemplate`으로 변경, `{name}` 변수 동작 설명 추가, customId 형식(`auto_sub:{subOptionId}`) 명시, 대기방 검증 방식 구체화
9. **F-VOICE-011** (확정방 전환): 대기방 검증 방식 구체화, 채널명 결정 로직에 버튼/하위선택지 `channelNameTemplate` 적용 규칙 및 `{n}` 순번 변수 명세 추가, 확정방을 신규 생성(삭제+재생성 아님) 방식으로 수정
10. **전체 흐름 다이어그램**: 실제 구현 흐름에 맞게 재작성

**변경 사유**: v1.1에서 작성된 Auto Channel 명세가 실제 코드 구현과 불일치하여 코드베이스(`auto-channel-config.entity.ts`, `auto-channel-button.entity.ts`, `auto-channel-sub-option.entity.ts`, `auto-channel.keys.ts`, `auto-channel-redis.repository.ts`, `redis-temp-channel-store.ts`, `auto-channel.service.ts`) 기준으로 동기화

---

## [수정 8] web: 라우트 경로 코드베이스 기준 수정 및 F-WEB-003/004 UI 명세 갱신 (WEB-FIX-001)

**변경일**: 2026-03-08
**티켓**: WEB-FIX-001

**변경 파일**:
- `docs/specs/prd/web.md` — 라우트 경로 전면 수정, 관련 모듈 목록 갱신, 구현 상태 갱신, F-WEB-003 분리 및 F-WEB-004 UI 명세 코드 기준 재작성

**변경 내용**:
1. 관련 모듈 목록에 실제 구현된 파일 경로 7개 추가 (SettingsSidebar, select-guild, settings/guild/[guildId] 하위 4개 페이지)
2. 구현 상태 "완료" 항목에 실제 구현된 6개 페이지 추가 (서버 선택, 설정 레이아웃, 일반설정, 자동방, 신입관리, 게임방상태)
3. 구현 상태 "프로토타입/미구현"에서 "서버 설정 관리" 항목 제거, 대시보드를 "미구현/플레이스홀더 상태"로 명확히 기재
4. F-WEB-003을 서버 선택 페이지(`/select-guild`) 명세로 변경: 접근 조건, 동작(단일 길드 자동 리다이렉트, 빈 길드 안내) 명세
5. F-WEB-003-B를 대시보드(미구현) 항목으로 신규 추가, 향후 계획 기능 유지
6. F-WEB-004 경로를 `/dashboard/servers/{guildId}/settings/auto-channel`에서 `/settings/guild/{guildId}/auto-channel`로 수정
7. F-WEB-004 위치 표기를 "대시보드 > 서버 설정 > 자동방 설정"에서 "설정 사이드바 > 자동방 설정"으로 수정
8. F-WEB-004 구성 섹션 전면 재작성 (코드 기준):
   - "트리거 채널 설정(다중)"을 "대기 채널 설정(단일 음성 채널 선택)"으로 변경
   - "대기방 설정" 섹션 제거, "안내 메시지 채널 설정" 섹션 신규 추가
   - "안내 메시지 설정"을 "안내 메시지 (Embed) 설정"으로 변경하고 Embed 제목/색상 필드 및 실시간 미리보기 항목 추가
   - 버튼 목록에 채널명 템플릿 필드(`{username}`, `{n}` 변수), 최대 25개 제한 명세 추가
   - 하위 선택지에 `{name}` 변수 설명 추가
   - 채널 새로고침 섹션 신규 추가
   - 저장 동작에 클라이언트 유효성 검사 규칙, 저장 성공 피드백 방식, "(수정)" 표기 규칙 추가

**변경 사유**: 실제 구현된 코드베이스의 라우트 구조(`/settings/guild/{guildId}/...`)와 PRD에 기재된 경로(`/dashboard/servers/{guildId}/settings/...`)가 불일치하여 코드 기준으로 정정. F-WEB-004 UI 명세도 실제 컴포넌트(`auto-channel/page.tsx`) 기준으로 재작성.

---

## [수정 7] newbie: Embed 커스터마이징 필드 추가 및 웹 경로 수정 (NEWBIE-FIX-001)

**변경일**: 2026-03-08
**티켓**: NEWBIE-FIX-001

**변경 파일**:
- `docs/specs/prd/newbie.md` — NewbieConfig 데이터 모델 필드 추가, F-WEB-NEWBIE-001 경로 및 UI 요소 수정

**변경 내용**:
1. `NewbieConfig` 데이터 모델 테이블에 미션 Embed 커스터마이징 필드 4개 추가
   - `missionEmbedTitle` (varchar, NULLABLE) — 미션 현황 Embed 제목
   - `missionEmbedDescription` (text, NULLABLE) — 미션 현황 Embed 설명
   - `missionEmbedColor` (varchar, NULLABLE) — 미션 현황 Embed 색상
   - `missionEmbedThumbnailUrl` (varchar, NULLABLE) — 미션 현황 Embed 썸네일 이미지 URL
2. `NewbieConfig` 데이터 모델 테이블에 모코코 Embed 커스터마이징 필드 4개 추가
   - `mocoEmbedTitle` (varchar, NULLABLE) — 모코코 순위 Embed 제목
   - `mocoEmbedDescription` (text, NULLABLE) — 모코코 순위 Embed 설명
   - `mocoEmbedColor` (varchar, NULLABLE) — 모코코 순위 Embed 색상
   - `mocoEmbedThumbnailUrl` (varchar, NULLABLE) — 모코코 순위 Embed 썸네일 이미지 URL
3. F-WEB-NEWBIE-001 경로 수정: `/dashboard/servers/{guildId}/settings/newbie` → `/settings/guild/{guildId}/newbie`
4. F-WEB-NEWBIE-001 탭 2(미션 설정) UI 요소에 Embed 커스터마이징 입력 필드 4개 추가 (Embed 제목/설명/색상/썸네일)
5. F-WEB-NEWBIE-001 탭 3(모코코 사냥 설정) UI 요소에 Embed 커스터마이징 입력 필드 4개 추가 (Embed 제목/설명/색상/썸네일)

**변경 사유**: 코드베이스(`newbie-config.entity.ts`)에 실제 구현된 `missionEmbed*`, `mocoEmbed*` 필드가 PRD에 누락되어 있었고, 웹 앱의 실제 라우팅 경로(`/settings/guild/{guildId}/newbie`)와 PRD 기재 경로가 불일치하여 수정

---

## [수정 6] general: 커맨드 목록 API를 글로벌 커맨드 조회로 수정 (GENERAL-FIX-001)

**변경일**: 2026-03-08
**티켓**: GENERAL-FIX-001

**변경 파일**:
- `docs/specs/prd/general.md` — F-GENERAL-002 동작·오류처리·외부 의존성, 아키텍처 다이어그램 수정

**변경 내용**:
1. 아키텍처 다이어그램의 Discord REST API 호출 경로를 `GET /applications/{appId}/guilds/{guildId}/commands`에서 `GET /applications/{appId}/commands (글로벌 커맨드)`로 수정
2. F-GENERAL-002 동작 2항을 길드 한정 커맨드 조회에서 글로벌 커맨드 조회(`GET /applications/{applicationId}/commands`)로 수정
3. F-GENERAL-002 동작에 `application`이 null일 때 빈 배열 반환하는 3항 추가
4. F-GENERAL-002 오류 처리에서 "봇이 해당 길드에 없는 경우" 항목을 삭제하고, `client.application` null 케이스로 교체. 로그 없이 빈 배열만 반환하는 실제 catch 블록 동작 반영
5. 외부 의존성 테이블의 엔드포인트를 `GET /applications/{appId}/commands`로 수정, 용도를 "길드별"에서 "글로벌"로 수정
6. 외부 의존성 설명의 `Client.application.commands.fetch({ guildId })`를 `Client.application.commands.fetch()`로 수정하고, 글로벌 커맨드 조회임을 명시

**변경 사유**: 커밋 `b867572`에서 `GuildInfoController.getCommands()`가 `Client.application.commands.fetch({ guildId })`에서 `Client.application.commands.fetch()`로 변경되어 글로벌 커맨드를 조회하도록 의도적으로 수정됨. PRD를 실제 코드와 일치시키기 위해 업데이트.

---

## [수정 5] 일반설정(general) 도메인 PRD 신규 추가 (GENERAL)

**변경일**: 2026-03-08
**티켓**: GENERAL

**변경 파일**:
- `docs/specs/prd/general.md` — general 도메인 PRD 신규 작성 (F-GENERAL-001 ~ F-GENERAL-003)
- `docs/specs/prd/_index.md` — 도메인 목록 및 핵심 기능 요약에 general 항목 추가

**변경 내용**:
1. `docs/specs/prd/general.md` 신규 생성: 개요, 관련 모듈, 아키텍처, 기능 상세, 외부 의존성, web 도메인 연계 명세 포함
2. F-GENERAL-001 (슬래시 커맨드 자동 등록): `discord.config.ts`의 수동 `commands` 배열 제거 명세, discord-nestjs `ExplorerService`의 `@Command` 자동 탐색 방식 명시. 현재 등록 대상 커맨드 7개 목록(play/skip/stop/voice-stats/my-voice-stats/community-health/voice-leaderboard) 및 소속 모듈 명시
3. F-GENERAL-002 (커맨드 목록 API): `GET /api/guilds/:guildId/commands` 엔드포인트 명세. Discord REST API 호출, 응답 형식(`id`, `name`, `description`) 정의, JwtAuthGuard 적용, 오류 시 빈 배열 반환 명세
4. F-GENERAL-003 (프론트엔드 동적 커맨드 목록): 일반설정 페이지의 하드코딩 배열 제거, API 기반 동적 로딩, 커맨드 이름 기반 아이콘 매핑 규칙(Music/Mic/Bot/Hash), `fetchGuildCommands()` API 클라이언트 함수 시그니처 명세
5. `_index.md` 도메인 목록에 general 행 추가
6. `_index.md` 핵심 기능 요약 9번 항목(일반설정) 추가

**변경 사유**: 슬래시 커맨드 자동 등록 방식 명확화 및 웹 대시보드 일반설정 페이지 동적 커맨드 렌더링 요구사항 반영 (티켓 GENERAL)

---

## [수정 4] newbie: 미션/모코코 Embed 템플릿 커스터마이징 시스템 추가 (NEWBIE-TMPL)

**변경일**: 2026-03-08
**티켓**: NEWBIE-TMPL

**변경 파일**:
- `docs/specs/prd/newbie.md` — F-NEWBIE-002, F-NEWBIE-003, F-WEB-NEWBIE-001 갱신 및 데이터 모델 2개 추가
- `docs/specs/prd/_index.md` — 데이터베이스 엔티티 테이블에 NewbieMissionTemplate, NewbieMocoTemplate 행 추가

**변경 내용**:
1. F-NEWBIE-002에 Embed 템플릿 시스템(F-NEWBIE-002-TMPL) 서브 섹션 추가
   - 제목 템플릿(`titleTemplate`): 허용 변수 `{totalCount}`, 기본값 명세
   - 헤더 템플릿(`headerTemplate`): 허용 변수 `{totalCount}`, `{inProgressCount}`, `{completedCount}`, `{failedCount}`
   - 항목 템플릿(`itemTemplate`): 허용 변수 13개 전체 목록 및 기본값 3줄 포맷 명세
   - 푸터 템플릿(`footerTemplate`): 허용 변수 `{updatedAt}`, 기본값 명세
   - 상태 이모지/텍스트 매핑(`statusMapping`): JSON 컬럼 구조 및 기본값 명세
   - 날짜 포맷 고정(`YYYY-MM-DD`) 및 유효성 검사 규칙 명세
2. F-NEWBIE-003에 Embed 템플릿 시스템(F-NEWBIE-003-TMPL) 서브 섹션 추가
   - 제목 템플릿(`titleTemplate`): 허용 변수 `{rank}`, `{hunterName}`, 기본값 명세
   - 본문 템플릿(`bodyTemplate`): `{mocoList}` 블록 변수로 항목 반복 삽입, 기본값 명세
   - 항목 템플릿(`itemTemplate`): 허용 변수 `{newbieName}`, `{minutes}`, 기본값 명세
   - 푸터 템플릿(`footerTemplate`): 허용 변수 `{currentPage}`, `{totalPages}`, `{interval}`, 기본값 명세
3. F-WEB-NEWBIE-001 탭 2 미션 설정에 템플릿 설정 섹션 UI 명세 추가
   - 제목/헤더/항목/푸터 템플릿 입력 필드, 상태 매핑 3행 테이블, 기본값 복원 버튼
   - 실시간 미리보기 패널 (debounce 300ms, 프론트 고정 더미 데이터)
   - 사용 가능 변수 인라인 안내
4. F-WEB-NEWBIE-001 탭 3 모코코 사냥 설정에 템플릿 설정 섹션 UI 명세 추가
   - 제목/본문/항목/푸터 템플릿 입력 필드, 기본값 복원 버튼
   - 실시간 미리보기 패널 (debounce 300ms, 프론트 고정 더미 데이터)
5. F-WEB-NEWBIE-001 저장 동작에 템플릿 전용 저장 API 엔드포인트 명세 추가
   - `POST /api/guilds/{guildId}/newbie/mission-template`
   - `POST /api/guilds/{guildId}/newbie/moco-template`
   - 백엔드 유효성 검사 실패 시 400 응답 및 오류 필드 반환 규칙
6. 데이터 모델에 `NewbieMissionTemplate` (`newbie_mission_template`) 테이블 추가
   - 컬럼: `id`, `guildId`(UNIQUE), `titleTemplate`, `headerTemplate`, `itemTemplate`, `footerTemplate`, `statusMapping`(JSON), `createdAt`, `updatedAt`
7. 데이터 모델에 `NewbieMocoTemplate` (`newbie_moco_template`) 테이블 추가
   - 컬럼: `id`, `guildId`(UNIQUE), `titleTemplate`, `bodyTemplate`, `itemTemplate`, `footerTemplate`, `createdAt`, `updatedAt`
8. `_index.md` 데이터베이스 엔티티 테이블에 NewbieMissionTemplate, NewbieMocoTemplate 행 추가

**변경 사유**: 미션 Embed(F-NEWBIE-002) 및 모코코 사냥 Embed(F-NEWBIE-003)의 표시 형식을 길드별로 커스터마이징할 수 있도록 템플릿 시스템을 신규 도입. 기존 NewbieConfig 테이블의 과부하를 방지하기 위해 별도 테이블로 분리.

---

## [수정 3] 게임방 상태 접두사(status-prefix) 도메인 PRD 신규 추가 (STATUS-PREFIX)

**변경일**: 2026-03-08
**티켓**: STATUS-PREFIX

**변경 파일**:
- `docs/specs/prd/status-prefix.md` — status-prefix 도메인 PRD 신규 작성 (F-STATUS-PREFIX-001 ~ F-STATUS-PREFIX-005, F-WEB-STATUS-PREFIX-001)
- `docs/specs/prd/_index.md` — 도메인 목록, 핵심 기능 요약, 데이터베이스 엔티티 테이블에 status-prefix 항목 추가

**변경 내용**:
1. `docs/specs/prd/status-prefix.md` 신규 생성: 개요, 관련 모듈, 아키텍처, 기능 상세, 데이터 모델, Redis 키 구조, voice 도메인 연계 명세 포함
2. F-STATUS-PREFIX-001 (설정 조회): `GET /api/guilds/{guildId}/status-prefix/config` 응답 형식 명세
3. F-STATUS-PREFIX-002 (안내 메시지 전송/갱신): 설정 저장 시 Discord 텍스트 채널에 Embed + ActionRow 버튼 메시지 전송 또는 수정, messageId DB 저장
4. F-STATUS-PREFIX-003 (접두사 적용): `status_prefix:{buttonId}` 버튼 클릭 시 원래 닉네임 Redis 저장 후 템플릿 기반 닉네임 변경, Ephemeral 응답
5. F-STATUS-PREFIX-004 (접두사 제거): `status_reset:{buttonId}` 버튼 클릭 시 Redis에서 원래 닉네임 조회 후 복원, Redis 키 삭제
6. F-STATUS-PREFIX-005 (퇴장 시 자동 복원): voiceStateUpdate 퇴장 이벤트 감지 시 닉네임 자동 복원, voice 도메인 VoiceLeaveHandler 연계 명세
7. F-WEB-STATUS-PREFIX-001 (설정 페이지): `/dashboard/servers/{guildId}/settings/status-prefix` 경로, 기능 활성화 토글/채널 선택/Embed 설정/템플릿/버튼 목록 관리 UI 명세
8. 데이터 모델: StatusPrefixConfig, StatusPrefixButton PostgreSQL 엔티티 명세 (버튼 타입 enum: PREFIX/RESET, customId 형식 정의)
9. Redis 키 구조: `status_prefix:original:{guildId}:{memberId}` (원래 닉네임), `status_prefix:config:{guildId}` (설정 캐시) 및 TTL 정책 명세
10. `_index.md` 도메인 목록에 status-prefix 행 추가
11. `_index.md` 핵심 기능 요약 8번 항목(게임방 상태 접두사) 추가
12. `_index.md` 데이터베이스 엔티티 테이블에 StatusPrefixConfig, StatusPrefixButton 행 추가

**변경 사유**: 게임방 상태 접두사(status-prefix) 도메인 신규 요구사항 반영 (티켓 STATUS-PREFIX)

---

## [수정 2] 신규사용자 관리(newbie) 도메인 PRD 신규 추가 (NEWBIE)

**변경일**: 2026-03-08
**티켓**: NEWBIE

**변경 파일**:
- `docs/specs/prd/newbie.md` — newbie 도메인 PRD 신규 작성 (F-NEWBIE-001 ~ F-NEWBIE-004, F-WEB-NEWBIE-001)
- `docs/specs/prd/_index.md` — 도메인 목록, 핵심 기능 요약, 데이터베이스 엔티티 테이블에 newbie 항목 추가

**변경 내용**:
1. `docs/specs/prd/newbie.md` 신규 생성: 개요, 관련 모듈, 아키텍처, 기능 상세, 데이터 모델, Redis 키 구조, voice 도메인 연계 명세 포함
2. F-NEWBIE-001 (환영인사): guildMemberAdd 트리거, Discord Embed 메시지 전송, 템플릿 변수(`{username}`, `{memberCount}`, `{serverName}`) 치환 명세
3. F-NEWBIE-002 (미션 생성 및 추적): 음성 채널 플레이타임 기반 미션, IN_PROGRESS/COMPLETED/FAILED 상태, 스케줄러 기반 만료 처리, VoiceDailyEntity 연계 쿼리 조건
4. F-NEWBIE-003 (모코코 사냥): 신규사용자와 기존 멤버의 동시 음성 채널 접속 시간 누적, TOP N 순위 Embed 채널 표시, 페이지네이션 및 자동 갱신
5. F-NEWBIE-004 (신입기간 역할 자동관리): guildMemberAdd 시 역할 부여, 스케줄러 기반 만료 후 역할 제거, 미션과 독립 동작
6. F-WEB-NEWBIE-001 (신입 관리 설정 페이지): `/dashboard/servers/{guildId}/settings/newbie` 경로, 4개 탭(환영인사/미션/모코코 사냥/신입기간) UI 명세
7. 데이터 모델: NewbieConfig, NewbieMission, NewbiePeriod PostgreSQL 엔티티 및 MocoHunting Redis 구조 명세
8. `_index.md` 도메인 목록에 newbie 행 추가
9. `_index.md` 핵심 기능 요약 7번 항목(신규사용자 관리) 추가
10. `_index.md` 데이터베이스 엔티티 테이블에 NewbieConfig, NewbieMission, NewbiePeriod 행 추가

**변경 사유**: 신규사용자 관리(newbie) 도메인 신규 요구사항 반영 (티켓 NEWBIE)

---

## [수정 1] 자동방 생성(Auto Channel) 기능 명세 추가 (AUTO-CHANNEL)

**변경일**: 2026-03-08
**티켓**: AUTO-CHANNEL

**변경 파일**:
- `docs/specs/prd/voice.md` — F-VOICE-007 ~ F-VOICE-012 추가 (자동방 생성 흐름, 데이터 모델)
- `docs/specs/prd/web.md` — F-WEB-004 추가 (자동방 웹 설정 UI)
- `docs/specs/prd/_index.md` — 도메인 목록 및 핵심 기능 요약에 자동방 항목 추가

**변경 내용**:
1. voice 도메인에 트리거 채널 입장 감지(F-VOICE-007), 대기방 생성 및 이동(F-VOICE-008), 안내 메시지 & 버튼 처리(F-VOICE-009), 하위 선택지 Ephemeral 처리(F-VOICE-010), 확정방 전환(F-VOICE-011), 자동방 채널 삭제(F-VOICE-012) 추가
2. voice 도메인에 AutoChannelConfig, AutoChannelButton, AutoChannelSubOption, AutoChannelState 데이터 모델 추가
3. web 도메인에 자동방 설정 페이지(F-WEB-004) 추가
4. _index.md 도메인 목록에 auto-channel 도메인 행 추가
5. _index.md 핵심 기능 요약에 6번 자동방 생성 항목 추가

**변경 사유**: 자동방 생성 기능 신규 요구사항 반영 (티켓 AUTO-CHANNEL)
