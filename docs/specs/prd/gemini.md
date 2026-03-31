# Gemini 도메인 PRD

> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

## 개요

VoiceDailyEntity 데이터를 집계하여 Google Gemini API로 AI 분석 리포트를 생성하고, Discord 슬래시 커맨드 및 주간 자동 리포트로 제공하는 도메인이다.

기존 4개 슬래시 커맨드(`/voice-stats`, `/my-voice-stats`, `/community-health`, `/voice-leaderboard`)는 사용률 저조를 이유로 삭제되었으며, 해당 기능은 웹 대시보드 서버 진단 페이지(`/dashboard/guild/{guildId}/diagnosis`)로 이관되었다. 디스코드 인터페이스에는 단일 요약 커맨드(`/서버진단`)와 주간 자동 리포트(F-GEMINI-006)로 대체한다.

## 관련 모듈

- `apps/api/src/voice-analytics/application/voice-analytics.service.ts` — 데이터 집계 엔진
- `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts` — LLM 기반 AI 분석 (프롬프트 빌딩 + LlmProvider 위임)
- `apps/api/src/common/llm/` — LLM 추상화 레이어 (LlmProvider 인터페이스 + GeminiLlmProvider)
- `apps/api/src/voice-analytics/presentation/voice-analytics.controller.ts` — REST API 엔드포인트
- `apps/api/src/voice-analytics/commands/server-diagnosis.command.ts` — `/서버진단` 슬래시 커맨드
- `apps/api/src/voice-analytics/weekly-report/weekly-report.service.ts` — 주간 자동 리포트 서비스
- `apps/api/src/voice-analytics/weekly-report/weekly-report.scheduler.ts` — 주간 리포트 스케줄러 (매시간 Cron)
- `apps/api/src/voice-analytics/weekly-report/weekly-report-config.entity.ts` — WeeklyReportConfig 엔티티

## 삭제된 기능

다음 4개 슬래시 커맨드는 **사용률 저조**로 삭제되었다. 해당 기능의 상세 분석은 웹 대시보드 `/dashboard/guild/{guildId}/diagnosis` 페이지에서 제공한다.

| 기능 ID | 커맨드 | 삭제 사유 |
|---------|--------|-----------|
| F-GEMINI-001 | `/voice-stats` | 사용률 저조 — 웹 대시보드로 이관 |
| F-GEMINI-002 | `/my-voice-stats` | 사용률 저조 — 웹 대시보드로 이관 |
| F-GEMINI-003 | `/community-health` | 사용률 저조 — 웹 대시보드로 이관 |
| F-GEMINI-004 | `/voice-leaderboard` | 사용률 저조 — 웹 대시보드로 이관 |

## 기능 상세

### F-GEMINI-005: 서버 진단 단일 요약 커맨드 (`/서버진단`)

기존 4개 슬래시 커맨드를 대체하는 단일 요약 커맨드다. 핵심 지표만 Discord Embed로 요약하고, 상세 분석은 웹 대시보드로 유도한다.

#### 입력

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| guildId | string | 자동 (커맨드 실행 길드) | 대상 길드 ID |
| days | integer | 7 | 집계 기간 (일) |

#### 처리

1. VoiceDailyEntity에서 `days` 기간의 서버 요약 통계 집계
   - 총 활성 유저 수 (고유 userId 기준)
   - 총 음성시간 (초 단위 → 시간:분 포맷 변환)
   - 일평균 활성 유저
2. LlmProvider에 간략 요약 요청 (2~3문장 수준, 짧게)
3. 유저별 음성시간 기준 TOP 3 리더보드 집계

#### 출력

Discord Embed (공개 메시지, ephemeral 아님):

| 섹션 | 내용 |
|------|------|
| 기본 통계 요약 | 활성 유저 수, 총 음성시간, 일평균 활성 유저 |
| AI 한줄 요약 | LLM이 생성한 2~3문장 서버 요약 |
| TOP 3 리더보드 | 음성시간 기준 상위 3명 (순위, 닉네임, 시간) |
| 대시보드 링크 버튼 | "자세한 내용은 웹 대시보드에서 확인하세요" + URL 버튼 (Discord Button Component, style: Link) |

#### 장애 대응

- LLM 호출 실패 시 AI 한줄 요약 섹션을 제외하고 통계 + 리더보드만 Embed 전송
- LLM 타임아웃(30초) 초과 시 동일하게 AI 섹션 생략

---

### F-GEMINI-006: 주간 자동 리포트

관리자가 웹 대시보드에서 설정한 텍스트 채널에 매주 자동으로 서버 건강도 요약 Embed를 전송한다.

#### 설정 (웹 대시보드)

관리자가 웹 대시보드(`/settings/guild/{guildId}/weekly-report` 또는 관련 설정 페이지)에서 아래 항목을 설정한다.

| 항목 | 설명 |
|------|------|
| 활성화 여부 | 주간 리포트 발송 ON/OFF |
| 대상 채널 | 리포트를 전송할 텍스트 채널 ID |
| 발송 요일 | 0(일) ~ 6(토) |
| 발송 시간 | 0 ~ 23 (시 단위) |
| 타임존 | IANA 타임존 문자열 (예: `Asia/Seoul`) |

#### 데이터 모델: WeeklyReportConfig

```typescript
@Entity('weekly_report_config')
class WeeklyReportConfig {
  @PrimaryColumn() guildId: string;
  @Column({ default: false }) isEnabled: boolean;
  @Column({ nullable: true }) channelId: string;         // 발송 대상 텍스트 채널 ID
  @Column({ default: 1 }) dayOfWeek: number;             // 0(일) ~ 6(토)
  @Column({ default: 9 }) hour: number;                  // 0 ~ 23
  @Column({ default: 'Asia/Seoul' }) timezone: string;   // IANA 타임존
  @UpdateDateColumn() updatedAt: Date;
}
```

#### 스케줄러

- 실행 주기: **매시간 정각** (`0 * * * *` Cron)
- 실행 로직:
  1. `isEnabled = true`인 모든 길드의 `WeeklyReportConfig` 조회
  2. 각 길드의 `dayOfWeek` / `hour` / `timezone`을 현재 시각과 대조
  3. 매칭되는 길드에 리포트 생성 후 지정 채널 전송
- 병렬 실행: 길드별 독립 Promise, 한 길드 실패가 다른 길드 발송에 영향 없음

#### 리포트 내용

| 섹션 | 내용 |
|------|------|
| 이번 주 vs 지난 주 비교 | 총 음성시간, 활성 유저 수, 일평균 활성 유저 (증감 표시) |
| TOP 5 유저 리더보드 | 음성시간 기준 상위 5명 |
| TOP 3 채널 | 음성시간 기준 상위 3개 채널 |
| AI 종합 분석 | 주간 트렌드, 특이사항, 개선 제안 (LLM 생성) |
| 대시보드 링크 버튼 | 웹 대시보드 URL 버튼 (Discord Button Component, style: Link) |

#### 출력

- Discord Embed (공개 메시지, 설정된 채널에 전송)
- ephemeral 아님

#### 장애 대응

- LLM 호출 실패 시 AI 종합 분석 섹션만 제외하고 나머지 통계(비교, 리더보드, 채널) 정상 전송
- 채널 전송 실패(채널 삭제 등) 시 에러 로깅 후 해당 길드 건너뜀

---

## 데이터 집계 구조 (VoiceActivityData)

```typescript
{
  guildId, guildName,
  timeRange: { start, end },
  totalStats: {
    totalUsers,          // 고유 유저 수
    totalVoiceTime,      // 전체 음성 시간 (초)
    totalMicOnTime,      // 전체 마이크 ON 시간 (초)
    avgDailyActiveUsers  // 일평균 활성 유저
  },
  userActivities: [{
    userId, username,
    totalVoiceTime, totalMicOnTime, totalMicOffTime, aloneTime,
    activeChannels: [{ channelId, channelName, duration }],
    activeDays, avgDailyVoiceTime, micUsageRate
  }],
  channelStats: [{
    channelId, channelName,
    totalVoiceTime, uniqueUsers, avgSessionDuration
  }],
  dailyTrends: [{
    date, totalVoiceTime, activeUsers, avgMicUsage
  }]
}
```

## 이름 보강 전략

1. VoiceDailyEntity의 userName/channelName 확인
2. 비어있으면 Redis 캐시 조회 (7일 TTL)
3. Redis에도 없으면 Discord API 배치 조회 → Redis 저장

## 장애 대응 (Resilience)

### Circuit Breaker + Retry + Timeout

- **라이브러리**: `cockatiel` (공통 `ResiliencePolicy` 사용)
- **개방 조건**: 5회 연속 실패 시 회로 개방
- **반개방**: 60초 후 반개방 상태로 전환
- **Timeout**: 호출당 30초
- **Retry**: 최대 2회, 지수 백오프 (초기 1초)

### 기본 모델

- `gemini-2.5-flash` (환경변수 `GEMINI_MODEL`로 변경 가능)

### 할당량 초과 처리

- Gemini API 429 응답 시 `LlmQuotaExhaustedException` throw
