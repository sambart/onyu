# Gemini Voice Analytics 웹 이관 + 주간 리포트 구현 계획

> 작성일: 2026-03-21
> 대상 도메인: gemini (voice-analytics)
> 관련 PRD: `/docs/specs/prd/gemini.md`
> 공통 모듈 설계: `/docs/specs/common-modules.md`

---

## 1. 변경 범위 요약

| 구분 | 내용 |
|------|------|
| 삭제 | Bot 슬래시 커맨드 4종 + 공유 DTO 1개, Bot 모듈 등록 제거, bot-api-client 메서드 3종 정리 |
| 신규 (API) | REST 엔드포인트 5종 (웹 대시보드용) + 주간 리포트 설정 API 2종 |
| 신규 (API) | 주간 리포트 스케줄러 + 서비스 |
| 신규 (Bot) | `/서버진단` 슬래시 커맨드 |
| 신규 (Shared) | 공유 타입 2개 파일 + index re-export |
| 변경 (API) | VoiceAnalyticsService에 신규 메서드 4종 추가 |
| 변경 (API) | VoiceAiAnalysisService에 신규 프롬프트 메서드 2종 추가 |
| 변경 (API) | VoiceAnalyticsModule에 신규 provider/controller 등록 |
| 정리 대상 | bot-api BotVoiceAnalyticsController의 삭제된 커맨드용 엔드포인트 4종 제거 |

---

## 2. 구현 단계 (의존 관계 순)

### Phase 1: 공유 타입 생성

기존 코드에 영향 없이 독립 생성 가능하다. web 도메인과의 병렬 개발 시작점이 된다.

#### 1-1. `libs/shared/src/types/diagnosis.ts` (신규)

공통 모듈 설계서 1.1절 그대로 생성한다.

```
DiagnosisSummaryResponse { daily: DailyTrendItem[] }
DailyTrendItem { date, totalSec, activeUsers }
HealthScoreResponse { score, prevScore, delta, diagnosis }
LeaderboardResponse { users: LeaderboardUser[], total }
LeaderboardUser { rank, userId, nickName, avatarUrl, totalSec, micOnSec, activeDays }
ChannelStatsResponse { channels: ChannelStatItem[] }
ChannelStatItem { channelId, channelName, categoryId, categoryName, totalSec, uniqueUsers }
AiInsightResponse { insights, suggestions: string[], generatedAt }
```

#### 1-2. `libs/shared/src/types/weekly-report.ts` (신규)

```
WeeklyReportConfigDto { isEnabled, channelId, dayOfWeek, hour, timezone }
```

#### 1-3. `libs/shared/src/types/index.ts` (변경)

기존 export에 추가:

```typescript
export type { DiagnosisSummaryResponse, DailyTrendItem, HealthScoreResponse, LeaderboardResponse, LeaderboardUser, ChannelStatsResponse, ChannelStatItem, AiInsightResponse } from './diagnosis';
export type { WeeklyReportConfigDto } from './weekly-report';
```

---

### Phase 2: Bot 측 4종 커맨드 삭제

#### 2-1. 파일 삭제 (5개)

| 파일 | 비고 |
|------|------|
| `apps/bot/src/command/voice-analytics/voice-stats.command.ts` | 삭제 |
| `apps/bot/src/command/voice-analytics/my-voice-stats.command.ts` | 삭제 |
| `apps/bot/src/command/voice-analytics/community-health.command.ts` | 삭제 |
| `apps/bot/src/command/voice-analytics/voice-leaderboard.command.ts` | 삭제 |
| `apps/bot/src/command/voice-analytics/analytics-days.dto.ts` | 삭제 가능 확인 완료 -- `self-diagnosis.command.ts`는 이 DTO를 import하지 않음 |

#### 2-2. `apps/bot/src/command/bot-command.module.ts` (변경)

삭제 대상 4개 import 및 providers 배열에서 제거:
- `VoiceStatsCommand`
- `MyVoiceStatsCommand`
- `VoiceLeaderboardCommand`
- `CommunityHealthCommand`

유지 대상: `SelfDiagnosisCommand` (기존 `/자가진단` 커맨드)

#### 2-3. `apps/api/src/bot-api/voice-analytics/bot-voice-analytics.controller.ts` (변경)

삭제된 봇 커맨드가 호출하던 엔드포인트 4종 제거:
- `GET /bot-api/voice-analytics/my-stats` (L43-70)
- `GET /bot-api/voice-analytics/leaderboard` (L72-89)
- `POST /bot-api/voice-analytics/analyze` (L91-121)
- `POST /bot-api/voice-analytics/community-health` (L123-150)

유지 대상: `POST /bot-api/voice-analytics/self-diagnosis` (L152-198, `/자가진단` 커맨드용)

#### 2-4. `libs/bot-api-client/src/bot-api-client.service.ts` (변경)

삭제된 봇 커맨드가 호출하던 클라이언트 메서드 제거:
- `getMyVoiceStats()`
- `getVoiceLeaderboard()`
- `analyzeGuildVoiceActivity()` (또는 해당 analyze 메서드)
- `getCommunityHealth()`

유지 대상: `runSelfDiagnosis()` (self-diagnosis.command.ts가 사용)

---

### Phase 3: VoiceAnalyticsService 신규 집계 메서드 추가

기존 `collectVoiceActivityData()` 및 private 메서드는 변경하지 않는다.
`VoiceActivityData` 내부 데이터를 재가공하는 래퍼 메서드를 추가한다.

#### 대상 파일: `apps/api/src/voice-analytics/application/voice-analytics.service.ts`

| 메서드 | 시그니처 | 설명 |
|--------|----------|------|
| `getDailySummary` | `(guildId: string, days: number) => Promise<DailyTrendItem[]>` | `collectVoiceActivityData()` 호출 후 `dailyTrends`를 `DailyTrendItem[]`으로 매핑 |
| `getHealthScore` | `(guildId: string, days: number) => Promise<{ score: number; prevScore: number; delta: number }>` | 현재 기간(days)과 이전 기간(days*2 ~ days)의 totalStats를 비교하여 0~100 점수 산출. 점수 산정 로직: `min(100, (avgDailyActiveUsers * 10) + (totalVoiceTime/3600/days * 5))` 정도의 가중치 기반 공식 (세부 공식은 구현 시 조정) |
| `getLeaderboard` | `(guildId: string, days: number, page: number, limit: number) => Promise<{ users: LeaderboardUser[]; total: number }>` | `userActivities`를 totalVoiceTime 내림차순 정렬 후 페이지네이션 적용, `LeaderboardUser` 형태로 매핑 |
| `getChannelStats` | `(guildId: string, days: number) => Promise<ChannelStatItem[]>` | `channelStats`를 `ChannelStatItem[]`으로 매핑. categoryId/categoryName은 DiscordGateway를 통해 보강 |

구현 전략:
- `getDailySummary`, `getLeaderboard`, `getChannelStats`는 내부적으로 `collectVoiceActivityData()`를 호출하여 데이터를 가져온 뒤 변환한다.
- `getHealthScore`는 두 기간(현재 기간 + 이전 동일 기간)의 `collectVoiceActivityData()`를 각각 호출하여 비교한다.
- 캐싱은 컨트롤러 레벨에서 Redis로 처리하므로 서비스 메서드에서는 캐싱하지 않는다.

---

### Phase 4: VoiceAiAnalysisService 신규 프롬프트 메서드 추가

#### 대상 파일: `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts`

| 메서드 | 시그니처 | 설명 |
|--------|----------|------|
| `generateHealthDiagnosis` | `(score: number, totalStats, dailyTrends) => Promise<string>` | 건강도 점수 기반 AI 진단 텍스트 생성 (health-score API의 `diagnosis` 필드용) |
| `generateAiInsight` | `(activityData: VoiceActivityData) => Promise<AiInsightResponse>` | 전체 인사이트 + 제안 배열 생성 (ai-insight API 용) |
| `generateBriefSummary` | `(totalStats, topUsers: top3) => Promise<string>` | 2~3문장 짧은 요약 (`/서버진단` 커맨드용) |
| `generateWeeklyReport` | `(currentData, prevData, channelStats) => Promise<string>` | 주간 리포트 AI 종합 분석 텍스트 |

기존 메서드 유지:
- `analyzeVoiceActivity()` -- 기존 웹 대시보드 raw 분석에서 계속 사용 가능
- `analyzeSpecificUser()` -- 기존 유저 분석에서 계속 사용 가능
- `calculateCommunityHealth()` -- 삭제된 커맨드용이었으나, 참조하는 곳이 없어지면 이후 정리

---

### Phase 5: REST API 엔드포인트 5종 (웹 대시보드용)

기존 `VoiceAnalyticsController`는 경로 prefix가 `voice-analytics`(guild param이 path에 포함)이고, 신규 엔드포인트는 `api/guilds/:guildId/voice-analytics/...` 패턴이다. 기존 컨트롤러의 prefix와 호환되지 않으므로 **새 컨트롤러를 생성**한다.

#### 5-1. 신규 파일: `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts`

```
@Controller('api/guilds/:guildId/voice-analytics')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { ttl: 60000, limit: 10 } })
```

| 메서드 | 데코레이터 | 핸들러 | 설명 |
|--------|-----------|--------|------|
| `GET` | `@Get('summary')` | `getSummary(@Param('guildId'), @Query() { days })` | `analyticsService.getDailySummary()` 호출, Redis 캐시 (10분) |
| `GET` | `@Get('health-score')` | `getHealthScore(@Param('guildId'), @Query() { days })` | `analyticsService.getHealthScore()` + `aiAnalysisService.generateHealthDiagnosis()`, Redis 캐시 (30분) |
| `GET` | `@Get('leaderboard')` | `getLeaderboard(@Param('guildId'), @Query() { days, page, limit })` | `analyticsService.getLeaderboard()`, Redis 캐시 (10분) |
| `GET` | `@Get('channel-stats')` | `getChannelStats(@Param('guildId'), @Query() { days })` | `analyticsService.getChannelStats()`, Redis 캐시 (10분) |
| `POST` | `@Post('ai-insight')` | `generateAiInsight(@Param('guildId'), @Query() { days })` | `analyticsService.collectVoiceActivityData()` + `aiAnalysisService.generateAiInsight()`, Redis 캐시 (30분) |

#### 5-2. 신규 파일: `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts`

```typescript
export class DiagnosisQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90)
  days?: number = 7;
}

export class LeaderboardQueryDto extends DiagnosisQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;
}
```

---

### Phase 6: 주간 리포트 설정 API

#### 6-1. 신규 파일: `apps/api/src/voice-analytics/weekly-report/presentation/weekly-report.controller.ts`

```
@Controller('api/guilds/:guildId/weekly-report')
@UseGuards(JwtAuthGuard)
```

| 메서드 | 데코레이터 | 핸들러 | 설명 |
|--------|-----------|--------|------|
| `GET` | `@Get('config')` | `getConfig(@Param('guildId'))` | `WeeklyReportConfigOrmEntity` 조회, 없으면 기본값 반환 |
| `POST` | `@Post('config')` | `saveConfig(@Param('guildId'), @Body() dto)` | upsert (guildId PK 기준) |

#### 6-2. 신규 파일: `apps/api/src/voice-analytics/weekly-report/presentation/dto/weekly-report-config.dto.ts`

```typescript
export class WeeklyReportConfigSaveDto {
  @IsBoolean() isEnabled: boolean;
  @IsOptional() @IsString() channelId: string | null;
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @IsInt() @Min(0) @Max(23) hour: number;
  @IsString() timezone: string;
}
```

#### 6-3. 신규 파일: `apps/api/src/voice-analytics/weekly-report/infrastructure/weekly-report-config.repository.ts`

TypeORM Repository 래퍼:
- `findByGuildId(guildId: string): Promise<WeeklyReportConfigOrmEntity | null>`
- `findAllEnabled(): Promise<WeeklyReportConfigOrmEntity[]>`
- `upsert(guildId: string, dto: WeeklyReportConfigSaveDto): Promise<WeeklyReportConfigOrmEntity>`

---

### Phase 7: 주간 리포트 스케줄러 + 서비스

#### 7-1. 신규 파일: `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts`

책임:
- 주간 리포트 데이터 집계 (이번 주 7일 vs 지난 주 7일)
- Discord Embed 메시지 빌드 (discord.js `APIEmbed` 형태)
- 리포트 섹션: 이번 주 vs 지난 주 비교, TOP 5 유저, TOP 3 채널, AI 종합 분석, 대시보드 링크 버튼

의존성:
- `VoiceAnalyticsService` -- 데이터 집계
- `VoiceAiAnalysisService` -- AI 종합 분석
- `DiscordRestService` -- 채널 메시지 전송

주요 메서드:
- `generateAndSendReport(config: WeeklyReportConfigOrmEntity): Promise<void>`
  1. `VoiceAnalyticsService.getDateRange(7)` 로 이번 주 데이터 집계
  2. `VoiceAnalyticsService.getDateRange(14)` 에서 이전 7일 추출하여 비교
  3. `getLeaderboard(guildId, 7, 1, 5)` 로 TOP 5 유저
  4. `getChannelStats(guildId, 7)` 에서 상위 3개 채널
  5. `VoiceAiAnalysisService.generateWeeklyReport()` 로 AI 분석 (실패 시 해당 섹션 제외)
  6. Embed + Button Component 조립
  7. `DiscordRestService.sendMessage(config.channelId, payload)` 로 전송

#### 7-2. 신규 파일: `apps/api/src/voice-analytics/weekly-report/application/weekly-report.scheduler.ts`

```typescript
@Injectable()
export class WeeklyReportScheduler {
  @Cron('0 * * * *')  // 매시간 정각
  async handleCron(): Promise<void> {
    const configs = await this.configRepo.findAllEnabled();
    const now = new Date();

    const matchedConfigs = configs.filter(config => {
      // config.timezone 기준으로 현재 시각의 요일/시간 비교
      const localNow = toZonedTime(now, config.timezone);
      return localNow.getDay() === config.dayOfWeek
          && localNow.getHours() === config.hour;
    });

    // 병렬 실행, 한 길드 실패가 다른 길드에 영향 없음
    await Promise.allSettled(
      matchedConfigs.map(config => this.reportService.generateAndSendReport(config))
    );
  }
}
```

타임존 변환: `date-fns-tz`의 `toZonedTime` 사용 (기존 프로젝트 의존성 확인 필요, 없으면 추가).

---

### Phase 8: `/서버진단` 슬래시 커맨드

#### 8-1. 신규 파일 (Bot): `apps/bot/src/command/voice-analytics/server-diagnosis.command.ts`

```
@Command({
  name: 'server-diagnosis',
  nameLocalizations: { ko: '서버진단' },
  description: 'Server voice activity diagnosis',
  descriptionLocalizations: { ko: '서버 음성 활동을 진단합니다' },
})
```

- `days` 옵션: integer, 기본값 7, 최소 1 최대 90
- 처리: `BotApiClientService`를 통해 API 호출
- 응답: Discord Embed (공개)
  - 기본 통계 요약 (활성 유저 수, 총 음성시간, 일평균 활성 유저)
  - AI 한줄 요약 (실패 시 생략)
  - TOP 3 리더보드
  - 대시보드 링크 버튼 (ActionRowBuilder + ButtonBuilder, style: Link)

#### 8-2. `apps/bot/src/command/bot-command.module.ts` (변경)

`ServerDiagnosisCommand` import 추가 및 providers에 등록.

#### 8-3. 신규 엔드포인트 (API): `apps/api/src/bot-api/voice-analytics/bot-voice-analytics.controller.ts`에 추가

```
POST /bot-api/voice-analytics/server-diagnosis?guildId=xxx&days=7
```

- `VoiceAnalyticsService.getDailySummary()` 로 요약 통계
- `VoiceAnalyticsService.getLeaderboard(guildId, days, 1, 3)` 로 TOP 3
- `VoiceAiAnalysisService.generateBriefSummary()` 로 AI 요약 (실패 시 null)
- 응답: `{ ok: true, data: { totalStats, topUsers, aiSummary, days } }`

#### 8-4. `libs/bot-api-client/src/bot-api-client.service.ts` (변경)

신규 메서드 추가:
```typescript
async getServerDiagnosis(guildId: string, days: number): Promise<ServerDiagnosisResponse> {
  return this.post(`/bot-api/voice-analytics/server-diagnosis?guildId=${guildId}&days=${days}`, {});
}
```

---

### Phase 9: 모듈 등록 및 통합

#### 9-1. `apps/api/src/voice-analytics/voice-analytics.module.ts` (변경)

추가 등록:
- **controllers**: `DiagnosisController`, `WeeklyReportController`
- **providers**: `WeeklyReportService`, `WeeklyReportScheduler`, `WeeklyReportConfigRepository`
- **imports**: `ScheduleModule` (NestJS `@nestjs/schedule`, 이미 프로젝트에 존재하는지 확인)
- **exports**: `WeeklyReportConfigRepository` (bot-api에서 접근 필요 시)

#### 9-2. `apps/api/src/bot-api/bot-api.module.ts` (변경 확인)

기존에 `BotVoiceAnalyticsController`가 등록되어 있으므로, 추가 등록은 불필요하다. 다만 엔드포인트 변경이 반영되는지 확인한다.

---

## 3. 파일 변경 목록 (전체)

### 신규 생성 파일 (9개)

| # | 파일 경로 | 설명 |
|---|-----------|------|
| 1 | `libs/shared/src/types/diagnosis.ts` | 진단 API 공유 타입 |
| 2 | `libs/shared/src/types/weekly-report.ts` | 주간 리포트 공유 타입 |
| 3 | `apps/api/src/voice-analytics/presentation/diagnosis.controller.ts` | REST API 5종 컨트롤러 |
| 4 | `apps/api/src/voice-analytics/presentation/dto/diagnosis-query.dto.ts` | 쿼리 DTO |
| 5 | `apps/api/src/voice-analytics/weekly-report/presentation/weekly-report.controller.ts` | 주간 리포트 설정 API |
| 6 | `apps/api/src/voice-analytics/weekly-report/presentation/dto/weekly-report-config.dto.ts` | 설정 저장 DTO |
| 7 | `apps/api/src/voice-analytics/weekly-report/infrastructure/weekly-report-config.repository.ts` | 설정 Repository |
| 8 | `apps/api/src/voice-analytics/weekly-report/application/weekly-report.service.ts` | 리포트 생성 + 전송 |
| 9 | `apps/api/src/voice-analytics/weekly-report/application/weekly-report.scheduler.ts` | 매시간 Cron 스케줄러 |
| 10 | `apps/bot/src/command/voice-analytics/server-diagnosis.command.ts` | `/서버진단` 슬래시 커맨드 |

### 변경 파일 (8개)

| # | 파일 경로 | 변경 내용 |
|---|-----------|----------|
| 1 | `libs/shared/src/types/index.ts` | 신규 타입 re-export 추가 |
| 2 | `apps/api/src/voice-analytics/application/voice-analytics.service.ts` | 신규 메서드 4종 추가 (getDailySummary, getHealthScore, getLeaderboard, getChannelStats) |
| 3 | `apps/api/src/voice-analytics/application/voice-ai-analysis.service.ts` | 신규 프롬프트 메서드 4종 추가 (generateHealthDiagnosis, generateAiInsight, generateBriefSummary, generateWeeklyReport) |
| 4 | `apps/api/src/voice-analytics/voice-analytics.module.ts` | 신규 controller/provider 등록 |
| 5 | `apps/api/src/bot-api/voice-analytics/bot-voice-analytics.controller.ts` | 삭제 커맨드 엔드포인트 4종 제거 + server-diagnosis 엔드포인트 추가 |
| 6 | `apps/bot/src/command/bot-command.module.ts` | 4종 커맨드 제거 + ServerDiagnosisCommand 등록 |
| 7 | `libs/bot-api-client/src/bot-api-client.service.ts` | 삭제 커맨드 메서드 3종 제거 + getServerDiagnosis 추가 |
| 8 | `apps/api/src/voice-analytics/presentation/voice-analytics.controller.ts` | 변경 없음 (기존 엔드포인트 유지, 신규는 별도 컨트롤러) |

### 삭제 파일 (5개)

| # | 파일 경로 |
|---|-----------|
| 1 | `apps/bot/src/command/voice-analytics/voice-stats.command.ts` |
| 2 | `apps/bot/src/command/voice-analytics/my-voice-stats.command.ts` |
| 3 | `apps/bot/src/command/voice-analytics/community-health.command.ts` |
| 4 | `apps/bot/src/command/voice-analytics/voice-leaderboard.command.ts` |
| 5 | `apps/bot/src/command/voice-analytics/analytics-days.dto.ts` |

---

## 4. 기존 코드 충돌 분석

| 항목 | 충돌 여부 | 상세 |
|------|----------|------|
| `VoiceAnalyticsController` (기존) | 충돌 없음 | 기존 prefix `voice-analytics`와 신규 prefix `api/guilds/:guildId/voice-analytics`는 다른 경로이므로 공존 가능. 기존 엔드포인트(`guild/:guildId`, `guild/:guildId/raw`, `user/:userId`, `guild/:guildId/compare`, `guild/:guildId/summary`)는 그대로 유지 |
| `VoiceAnalyticsService` | 충돌 없음 | 기존 메서드 시그니처 변경 없이 신규 public 메서드만 추가 |
| `VoiceAiAnalysisService` | 충돌 없음 | 기존 메서드 유지, 신규 메서드만 추가 |
| `WeeklyReportConfigOrmEntity` | 충돌 없음 | 이미 생성 완료, 변경 불필요 |
| `VoiceAnalyticsModule` | 충돌 없음 | providers/controllers 배열에 추가만 수행 |
| `BotVoiceAnalyticsController` | 주의 필요 | 엔드포인트 4종 삭제 + 1종 추가. `self-diagnosis` 엔드포인트는 반드시 유지 |
| `bot-api-client` | 주의 필요 | 삭제 메서드가 다른 곳에서 참조되지 않는지 확인 필요 (봇 커맨드 파일 삭제와 동시에 진행하면 안전) |
| `DashboardSidebar.tsx` / `SettingsSidebar.tsx` | 충돌 방지 | 현재 `refactor/sidebar-menu-grouping` 브랜치에서 수정 중이므로 gemini 도메인에서는 수정하지 않음 (공통 모듈 설계서 규칙 준수) |

---

## 5. 확인 필요 사항

| # | 질문 | 영향 범위 |
|---|------|----------|
| 1 | `date-fns-tz` 패키지가 이미 설치되어 있는가? 없으면 `pnpm --filter @nexus/api add date-fns-tz` 필요 | Phase 7 스케줄러 |
| 2 | `@nestjs/schedule`이 이미 API app에 import되어 있는가? ScheduleModule.forRoot()가 AppModule에 등록되어 있는지 확인 | Phase 7 스케줄러 |
| 3 | 건강도 점수(0~100) 산정 공식의 세부 가중치를 어떻게 정할 것인가? (PRD에 구체 공식 없음) | Phase 3 getHealthScore |
| 4 | 기존 `VoiceAnalyticsController`의 엔드포인트들(voice-analytics/guild/:guildId 등)은 장기적으로 폐기할 것인가, 아니면 유지할 것인가? | Phase 5, 정리 작업 |

---

## 6. 구현 순서 요약 (커밋 단위 제안)

```
1. [shared]  libs/shared 공유 타입 생성 (diagnosis.ts, weekly-report.ts, index.ts)
2. [bot]     Bot 4종 커맨드 삭제 + bot-command.module.ts 정리
3. [api]     bot-api 컨트롤러 엔드포인트 4종 제거 + bot-api-client 메서드 정리
4. [api]     VoiceAnalyticsService 신규 메서드 4종 추가
5. [api]     VoiceAiAnalysisService 신규 프롬프트 메서드 추가
6. [api]     DiagnosisController (REST API 5종) + DTO 생성
7. [api]     주간 리포트 설정 API (controller + repository + DTO)
8. [api]     주간 리포트 스케줄러 + 서비스
9. [api]     VoiceAnalyticsModule 신규 등록 통합
10. [bot+api] /서버진단 커맨드 (bot command + bot-api endpoint + bot-api-client method)
```

단계 2-3은 동시 커밋 가능. 단계 4-5는 6-10의 선행 조건. 단계 6-8은 병렬 진행 가능.
