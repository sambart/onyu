# LLM 추상화 레이어 + 디렉토리 이동 구현 계획

> PRD: [self-diagnosis.md](../specs/prd/self-diagnosis.md) (F-SD-001, F-SD-002)
> 공통 모듈: [common-modules.md](../specs/common-modules.md)

## 목표

1. `VoiceGeminiService`에서 LLM SDK 호출/재시도 로직을 `GeminiLlmProvider`로 분리하고, `LlmProvider` 인터페이스를 통해 제공자 교체가 가능하도록 한다.
2. `gemini/` 디렉토리를 `voice-analytics/`로 이동하여 LLM 제공자에 종속되지 않는 이름으로 변경한다.
3. 기존 4개 슬래시 커맨드(`/voice-stats`, `/community-health`, `/my-voice-stats`, `/voice-leaderboard`)와 REST API가 정상 동작해야 한다.

## 설계 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| LLM 토큰 방식 | `LLM_PROVIDER` 문자열 토큰 + `useClass` | NestJS DI 표준 패턴. 향후 OpenAI 등 다른 제공자로 교체 시 `useClass`만 변경 |
| 인터페이스 위치 | `voice-analytics/llm/llm-provider.interface.ts` | 현재 LLM을 소비하는 곳이 voice-analytics 모듈뿐이므로 libs/shared가 아닌 모듈 내부에 배치 |
| 재시도 로직 위치 | `GeminiLlmProvider` 내부 | SDK 재시도는 제공자마다 다를 수 있으므로 인터페이스가 아닌 구현체에 포함 |
| 작업 순서 | T-SD-001(LLM 추상화) 후 T-SD-002(디렉토리 이동) | PRD 의존 관계 준수. 실제로는 같은 PR에서 처리 가능 |
| 서비스 리네이밍 | `VoiceGeminiService` -> `VoiceAiAnalysisService` | Gemini 종속 제거. 프롬프트 빌딩 책임만 유지 |

## 변경 파일 목록

### 신규 생성 (3개)

| 파일 | 역할 |
|------|------|
| `apps/api/src/voice-analytics/llm/llm-provider.interface.ts` | `LlmProvider` 인터페이스 + `LlmOptions` 타입 + `LLM_PROVIDER` 토큰 |
| `apps/api/src/voice-analytics/llm/gemini-llm.provider.ts` | `GeminiLlmProvider` 구현체 (Gemini SDK 초기화, 재시도, generateText) |
| `apps/api/src/voice-analytics/llm/llm.module.ts` | `LlmModule` (LLM_PROVIDER 토큰으로 GeminiLlmProvider 등록) |

### 이동 + 수정 (기존 gemini/ -> voice-analytics/)

| 기존 파일 | 이동 후 파일 | 변경 내용 |
|-----------|-------------|-----------|
| `gemini/voice-gemini.service.ts` | `voice-analytics/voice-ai-analysis.service.ts` | 클래스명 변경, SDK 호출/재시도 제거, LlmProvider 주입으로 교체 |
| `gemini/voice-analytics.module.ts` | `voice-analytics/voice-analytics.module.ts` | import 경로 변경, LlmModule import 추가, VoiceAiAnalysisService 등록 |
| `gemini/voice-analytics.service.ts` | `voice-analytics/voice-analytics.service.ts` | import 경로만 변경 (내부 로직 동일) |
| `gemini/voice-analytics.controller.ts` | `voice-analytics/voice-analytics.controller.ts` | VoiceGeminiService -> VoiceAiAnalysisService import 변경 |
| `gemini/voice-name-enricher.service.ts` | `voice-analytics/voice-name-enricher.service.ts` | import 경로만 변경 (내부 로직 동일) |
| `gemini/commands/voice-stats.command.ts` | `voice-analytics/commands/voice-stats.command.ts` | VoiceGeminiService -> VoiceAiAnalysisService import 변경 |
| `gemini/commands/community-health.command.ts` | `voice-analytics/commands/community-health.command.ts` | VoiceGeminiService -> VoiceAiAnalysisService import 변경 |
| `gemini/commands/my-voice-stats.command.ts` | `voice-analytics/commands/my-voice-stats.command.ts` | import 경로만 변경 (VoiceGeminiService 미사용) |
| `gemini/commands/voice-leaderboard.command.ts` | `voice-analytics/commands/voice-leaderboard.command.ts` | import 경로만 변경 (VoiceGeminiService 미사용) |
| `gemini/commands/analytics-days.dto.ts` | `voice-analytics/commands/analytics-days.dto.ts` | 변경 없음 (이동만) |
| `gemini/dto/voice-analytics-query.dto.ts` | `voice-analytics/dto/voice-analytics-query.dto.ts` | 변경 없음 (이동만) |
| `gemini/self-diagnosis/domain/voice-health-config.entity.ts` | `voice-analytics/self-diagnosis/domain/voice-health-config.entity.ts` | 변경 없음 (이동만) |
| `gemini/self-diagnosis/domain/voice-health-badge.entity.ts` | `voice-analytics/self-diagnosis/domain/voice-health-badge.entity.ts` | 변경 없음 (이동만) |

### 외부 파일 수정 (1개)

| 파일 | 변경 내용 |
|------|-----------|
| `apps/api/src/app.module.ts` | import 경로 `./gemini/voice-analytics.module` -> `./voice-analytics/voice-analytics.module` |

## 구현 단계

### Step 1: LlmProvider 인터페이스 정의

**파일**: `apps/api/src/voice-analytics/llm/llm-provider.interface.ts`

```typescript
export const LLM_PROVIDER = 'LLM_PROVIDER';

export interface LlmOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmProvider {
  /**
   * 프롬프트를 전달하여 LLM 텍스트 응답을 생성한다.
   * 구현체는 내부적으로 재시도 로직을 포함할 수 있다.
   */
  generateText(prompt: string, options?: LlmOptions): Promise<string>;
}
```

### Step 2: GeminiLlmProvider 구현체 작성

**파일**: `apps/api/src/voice-analytics/llm/gemini-llm.provider.ts`

기존 `VoiceGeminiService`에서 다음을 이동한다:
- `GoogleGenerativeAI` / `GenerativeModel` 인스턴스 초기화 (constructor)
- `RETRY_CONFIG` 상수
- `DEFAULT_GENERATION_CONFIG` 상수
- `generateWithRetry` 메서드 -> `generateText` 메서드로 변환

```typescript
import type { LlmOptions, LlmProvider } from './llm-provider.interface';

import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RETRY_CONFIG = {
  MAX_RETRIES: 2,
  BASE_DELAY_MS: 1000,
} as const;

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 8192,
} as const;

@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);
  private readonly model: GenerativeModel;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY not found in environment variables');
      throw new Error('GEMINI_API_KEY is required');
    }

    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: DEFAULT_GENERATION_CONFIG,
    });

    this.logger.log(`Gemini model initialized: ${modelName}`);
  }

  /** LlmProvider 구현: 재시도 로직 포함 Gemini API 호출 */
  async generateText(prompt: string, options?: LlmOptions): Promise<string> {
    const model = options
      ? this.createModelWithOptions(options)
      : this.model;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Gemini API retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} after ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error) {
        lastError = error as Error;
        this.logger.error(
          `Gemini API attempt ${attempt + 1} failed: ${lastError.message}`,
        );
      }
    }

    throw lastError;
  }

  /**
   * LlmOptions가 지정된 경우 기본 설정을 오버라이드한 모델 인스턴스를 생성한다.
   * options가 없으면 constructor에서 생성한 기본 모델을 사용하므로 이 메서드는 호출되지 않는다.
   */
  private createModelWithOptions(options: LlmOptions): GenerativeModel {
    const genAI = new GoogleGenerativeAI(
      this.configService.get<string>('GEMINI_API_KEY')!,
    );
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';

    return genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        ...DEFAULT_GENERATION_CONFIG,
        ...(options.temperature !== undefined && {
          temperature: options.temperature,
        }),
        ...(options.maxOutputTokens !== undefined && {
          maxOutputTokens: options.maxOutputTokens,
        }),
      },
    });
  }
}
```

### Step 3: LlmModule 생성

**파일**: `apps/api/src/voice-analytics/llm/llm.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GeminiLlmProvider } from './gemini-llm.provider';
import { LLM_PROVIDER } from './llm-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      useClass: GeminiLlmProvider,
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
```

### Step 4: VoiceGeminiService -> VoiceAiAnalysisService 리네이밍 및 리팩토링

**파일**: `apps/api/src/voice-analytics/voice-ai-analysis.service.ts`

주요 변경 사항:
1. 클래스명: `VoiceGeminiService` -> `VoiceAiAnalysisService`
2. `@google/generative-ai` import 제거
3. `genAI`, `model` 필드 제거
4. constructor: ConfigService 직접 사용 -> `@Inject(LLM_PROVIDER)` 주입
5. `generateWithRetry` 메서드 삭제 -> `this.llmProvider.generateText(prompt)` 호출
6. `RETRY_CONFIG`, `DEFAULT_GENERATION_CONFIG` 상수 삭제
7. 프롬프트 빌딩 메서드(`buildVoiceAnalysisPrompt`, `buildFallbackAnalysis`) 그대로 유지
8. 3개 public 메서드의 시그니처 유지 (내부 호출만 변경)

```typescript
import type { LlmProvider } from './llm/llm-provider.interface';

import { VoiceActivityData, VoiceAnalysisResult } from '@onyu/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { LLM_PROVIDER } from './llm/llm-provider.interface';

@Injectable()
export class VoiceAiAnalysisService {
  private readonly logger = new Logger(VoiceAiAnalysisService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
  ) {}

  /**
   * 음성 채널 활동 데이터를 분석하고 인사이트 제공
   */
  async analyzeVoiceActivity(
    activityData: VoiceActivityData,
  ): Promise<VoiceAnalysisResult> {
    try {
      const prompt = this.buildVoiceAnalysisPrompt(activityData);

      this.logger.log('Sending voice activity data to LLM...');
      const text = await this.llmProvider.generateText(prompt);

      this.logger.log('Successfully analyzed voice activity');
      return { text };
    } catch (error) {
      this.logger.error(
        'Failed to analyze voice activity after retries',
        (error as Error).stack,
      );
      return {
        text: this.buildFallbackAnalysis(activityData),
      };
    }
  }

  /**
   * 프롬프트 생성 (기존 로직 100% 유지)
   */
  private buildVoiceAnalysisPrompt(data: VoiceActivityData): string {
    // ... 기존 코드 그대로 유지
    const summarizedData = {
      guildName: data.guildName,
      timeRange: data.timeRange,
      totalStats: data.totalStats,
      topUsers: data.userActivities.slice(0, 10),
      topChannels: data.channelStats.slice(0, 5),
      recentTrends: data.dailyTrends.slice(-7),
    };

    const timeExplanation = `
      참고: 시간 단위는 초(seconds)입니다.
      - 3600초 = 1시간
      - 86400초 = 1일
      `;

    return `
      당신은 Discord 서버의 음성 채널 활동 분석 전문가입니다.
      다음 데이터를 바탕으로 한국어로 상세하고 유용한 분석 리포트를 작성해주세요.

      ${timeExplanation}

      **음성 채널 활동 데이터:**
      \`\`\`json
      ${JSON.stringify(summarizedData, null, 2)}
      \`\`\`

      **분석 내용에 포함할 것:**
      1. 전체 활동 요약 (2-3문장)
      2. 주요 인사이트 (3-5개, 구체적인 수치 포함)
      3. 활동적인 유저 분석 (TOP 3-5)
      4. 채널 사용 패턴
      5. 마이크 사용 패턴
      6. 트렌드 및 변화
      7. 개선 제안 (실행 가능한 것)
      8. 주의사항 (있다면)

      **작성 규칙:**
      - 모든 시간은 "시간", "분" 단위로 변환
      - 이모지를 적절히 사용하여 가독성 향상
      - 구체적인 숫자와 비율 포함
      - 친근하고 이해하기 쉬운 표현 사용
      - 마크다운 형식으로 작성 (##, ###, - 등 사용)
      - 긍정적인 면과 개선점을 균형있게 다루기
      - 3000자 이내로 요약하기
      - discord embed에 붙여야하니 규격을 신경쓰기

      지금 분석을 시작해주세요:`;
  }

  /**
   * AI 분석 실패 시 기본 통계 기반 폴백 응답 생성 (기존 로직 100% 유지)
   */
  private buildFallbackAnalysis(data: VoiceActivityData): string {
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    };

    const topUsers = data.userActivities
      .slice(0, 5)
      .map(
        (u, i) =>
          `${i + 1}. **${u.username}** — ${formatTime(u.totalVoiceTime)}`,
      )
      .join('\n');

    const topChannels = data.channelStats
      .slice(0, 3)
      .map(
        (c) =>
          `- **${c.channelName}** — ${formatTime(c.totalVoiceTime)} (${c.uniqueUsers}명)`,
      )
      .join('\n');

    return (
      '> AI 분석을 일시적으로 사용할 수 없어 기본 통계를 표시합니다.\n\n' +
      `**전체 통계**\n` +
      `- 총 활성 유저: ${data.totalStats.totalUsers}명\n` +
      `- 총 음성 시간: ${formatTime(data.totalStats.totalVoiceTime)}\n` +
      `- 총 마이크 사용: ${formatTime(data.totalStats.totalMicOnTime)}\n` +
      `- 일평균 활성 유저: ${data.totalStats.avgDailyActiveUsers}명\n\n` +
      `**TOP 5 유저**\n${topUsers || '- 데이터 없음'}\n\n` +
      `**인기 채널**\n${topChannels || '- 데이터 없음'}`
    );
  }

  /**
   * 특정 유저의 활동 심층 분석 (프롬프트 기존 로직 유지, LLM 호출만 위임)
   */
  async analyzeSpecificUser(
    activityData: VoiceActivityData,
    targetUserId: string,
  ): Promise<string> {
    const userActivity = activityData.userActivities.find(
      (u) => u.userId === targetUserId,
    );

    if (!userActivity) {
      throw new Error('User not found in activity data');
    }

    const prompt = `
유저의 음성 채널 활동 패턴을 분석해주세요:

\`\`\`json
${JSON.stringify(userActivity, null, 2)}
\`\`\`

다음 형식으로 분석 결과를 작성해주세요:

**활동 수준:** [높음/보통/낮음]

**활동 성향:**
[이 유저의 활동 패턴과 특징 설명]

**강점:**
- [강점 1]
- [강점 2]

**주의사항:**
- [있다면 작성]

**제안:**
- [제안 1]
- [제안 2]

간결하고 명확하게 작성해주세요.
`;

    try {
      return await this.llmProvider.generateText(prompt);
    } catch (error) {
      this.logger.error(
        'Failed to analyze user after retries',
        (error as Error).stack,
      );
      const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
      };

      return (
        '> AI 분석을 일시적으로 사용할 수 없어 기본 통계를 표시합니다.\n\n' +
        `- 총 음성 시간: ${formatTime(userActivity.totalVoiceTime)}\n` +
        `- 마이크 사용률: ${userActivity.micUsageRate}%\n` +
        `- 활동 일수: ${userActivity.activeDays}일\n` +
        `- 자주 사용 채널: ${userActivity.activeChannels.slice(0, 3).map((c) => c.channelName).join(', ') || '없음'}`
      );
    }
  }

  /**
   * 커뮤니티 건강도 점수 산출 (프롬프트 기존 로직 유지, LLM 호출만 위임)
   */
  async calculateCommunityHealth(
    activityData: VoiceActivityData,
  ): Promise<string> {
    const summarizedData = {
      guildId: activityData.guildId,
      timeRange: activityData.timeRange,
      totalStats: activityData.totalStats,
      topUsers: activityData.userActivities.slice(0, 5).map((u) => ({
        username: u.username,
        totalVoiceTime: u.totalVoiceTime,
        micUsageRate: u.micUsageRate,
        activeDays: u.activeDays,
      })),
      topChannels: activityData.channelStats.slice(0, 3).map((c) => ({
        channelName: c.channelName,
        totalVoiceTime: c.totalVoiceTime,
        uniqueUsers: c.uniqueUsers,
      })),
      recentTrends: activityData.dailyTrends.slice(-7),
    };

    const prompt = `
Discord 서버의 음성 채널 활동 데이터를 기반으로 커뮤니티 건강도를 분석해주세요.

데이터:
\`\`\`json
${JSON.stringify(summarizedData, null, 2)}
\`\`\`

다음 형식으로 분석 결과를 작성해주세요:

**건강도 점수: [0-100점]**

**세부 평가:**
- 참여도: [평가]
- 성장세: [평가]
- 상호작용: [평가]
- 유지율: [평가]

**종합 의견:**
[2-3문장으로 현재 상태 설명]

**운영자를 위한 조언:**
[실질적인 조언]

간결하고 명확하게 작성해주세요.
`;

    try {
      return await this.llmProvider.generateText(prompt);
    } catch (error) {
      this.logger.error(
        'Failed to calculate health score after retries:',
        (error as Error).message,
      );
      return (
        '> AI 분석을 일시적으로 사용할 수 없어 기본 통계를 표시합니다.\n\n' +
        `- 총 활성 유저: ${activityData.totalStats.totalUsers}명\n` +
        `- 일평균 활성 유저: ${activityData.totalStats.avgDailyActiveUsers}명\n` +
        `- 총 음성 시간: ${Math.floor(activityData.totalStats.totalVoiceTime / 3600)}시간`
      );
    }
  }
}
```

### Step 5: 디렉토리 이동 (T-SD-002)

Git 명령으로 `apps/api/src/gemini/` -> `apps/api/src/voice-analytics/`로 이동한다.

```bash
git mv apps/api/src/gemini apps/api/src/voice-analytics
```

이동 후 `voice-gemini.service.ts` 파일명도 변경한다:

```bash
git mv apps/api/src/voice-analytics/voice-gemini.service.ts \
       apps/api/src/voice-analytics/voice-ai-analysis.service.ts
```

### Step 6: 커맨드 파일 import 경로 변경

디렉토리 이동으로 인한 상대 경로는 변경되지 않는다 (같은 디렉토리 내 상대 참조). 변경이 필요한 것은 **서비스 클래스명**뿐이다.

#### 6-1. `voice-stats.command.ts`

```diff
-import { VoiceGeminiService } from '../voice-gemini.service';
+import { VoiceAiAnalysisService } from '../voice-ai-analysis.service';

 export class VoiceStatsCommand {
   constructor(
-    private readonly geminiService: VoiceGeminiService,
+    private readonly aiAnalysisService: VoiceAiAnalysisService,
     private readonly analyticsService: VoiceAnalyticsService,
   ) {}

   // Handler 내부:
-  const analysis = await this.geminiService.analyzeVoiceActivity(activityData);
+  const analysis = await this.aiAnalysisService.analyzeVoiceActivity(activityData);
```

#### 6-2. `community-health.command.ts`

```diff
-import { VoiceGeminiService } from '../voice-gemini.service';
+import { VoiceAiAnalysisService } from '../voice-ai-analysis.service';

 export class CommunityHealthCommand {
   constructor(
-    private readonly geminiService: VoiceGeminiService,
+    private readonly aiAnalysisService: VoiceAiAnalysisService,
     private readonly analyticsService: VoiceAnalyticsService,
   ) {}

   // Handler 내부:
-  const healthText = await this.geminiService.calculateCommunityHealth(activityData);
+  const healthText = await this.aiAnalysisService.calculateCommunityHealth(activityData);
```

#### 6-3. `my-voice-stats.command.ts`

변경 없음. `VoiceGeminiService`를 사용하지 않음.

#### 6-4. `voice-leaderboard.command.ts`

변경 없음. `VoiceGeminiService`를 사용하지 않음.

### Step 7: VoiceAnalyticsController 수정

**파일**: `apps/api/src/voice-analytics/voice-analytics.controller.ts`

```diff
-import { VoiceGeminiService } from './voice-gemini.service';
+import { VoiceAiAnalysisService } from './voice-ai-analysis.service';

 export class VoiceAnalyticsController {
   constructor(
-    private readonly geminiService: VoiceGeminiService,
+    private readonly aiAnalysisService: VoiceAiAnalysisService,
     private readonly analyticsService: VoiceAnalyticsService,
     private readonly redis: RedisService,
   ) {}

   // analyzeGuildVoiceActivity 내부:
-  const result = await this.geminiService.analyzeVoiceActivity(activityData);
+  const result = await this.aiAnalysisService.analyzeVoiceActivity(activityData);

   // analyzeUserVoiceActivity 내부:
-  const analysis = await this.geminiService.analyzeSpecificUser(activityData, userId);
+  const analysis = await this.aiAnalysisService.analyzeSpecificUser(activityData, userId);
```

### Step 8: VoiceAnalyticsModule 수정

**파일**: `apps/api/src/voice-analytics/voice-analytics.module.ts`

```typescript
import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { VoiceDailyEntity } from '../channel/voice/domain/voice-daily.entity';
import { VoiceRedisRepository } from '../channel/voice/infrastructure/voice-redis.repository';
import { GatewayModule } from '../gateway/gateway.module';
import { CommunityHealthCommand } from './commands/community-health.command';
import { MyVoiceStatsCommand } from './commands/my-voice-stats.command';
import { VoiceLeaderboardCommand } from './commands/voice-leaderboard.command';
import { VoiceStatsCommand } from './commands/voice-stats.command';
import { LlmModule } from './llm/llm.module';
import { VoiceAiAnalysisService } from './voice-ai-analysis.service';
import { VoiceAnalyticsController } from './voice-analytics.controller';
import { VoiceAnalyticsService } from './voice-analytics.service';
import { VoiceNameEnricherService } from './voice-name-enricher.service';

@Module({
  imports: [
    DiscordModule.forFeature(),
    ConfigModule,
    TypeOrmModule.forFeature([VoiceDailyEntity]),
    GatewayModule,
    AuthModule,
    LlmModule,
  ],
  controllers: [VoiceAnalyticsController],
  providers: [
    VoiceAiAnalysisService,
    VoiceAnalyticsService,
    VoiceNameEnricherService,
    VoiceRedisRepository,
    VoiceStatsCommand,
    MyVoiceStatsCommand,
    CommunityHealthCommand,
    VoiceLeaderboardCommand,
  ],
  exports: [VoiceAiAnalysisService, VoiceAnalyticsService, VoiceRedisRepository],
})
export class VoiceAnalyticsModule {}
```

주요 변경:
- `LlmModule` import 추가
- `VoiceGeminiService` -> `VoiceAiAnalysisService` (providers, exports 모두)

### Step 9: AppModule import 경로 변경

**파일**: `apps/api/src/app.module.ts`

```diff
-import { VoiceAnalyticsModule } from './gemini/voice-analytics.module';
+import { VoiceAnalyticsModule } from './voice-analytics/voice-analytics.module';
```

### Step 10: 기존 gemini/ 디렉토리 삭제 확인

`git mv`로 이동했으므로 별도 삭제 불필요. Git이 이동을 추적한다.

## 최종 디렉토리 구조 (T-SD-001 + T-SD-002 완료 후)

```
apps/api/src/voice-analytics/
├── llm/
│   ├── llm-provider.interface.ts      # [신규] LlmProvider 인터페이스 + LLM_PROVIDER 토큰
│   ├── gemini-llm.provider.ts         # [신규] Gemini SDK 구현체
│   └── llm.module.ts                  # [신규] LlmModule
├── commands/
│   ├── analytics-days.dto.ts          # [이동] 변경 없음
│   ├── voice-stats.command.ts         # [이동+수정] import 변경
│   ├── community-health.command.ts    # [이동+수정] import 변경
│   ├── my-voice-stats.command.ts      # [이동] import 경로 변경 없음
│   └── voice-leaderboard.command.ts   # [이동] import 경로 변경 없음
├── dto/
│   └── voice-analytics-query.dto.ts   # [이동] 변경 없음
├── self-diagnosis/
│   └── domain/
│       ├── voice-health-config.entity.ts  # [이동] 변경 없음
│       └── voice-health-badge.entity.ts   # [이동] 변경 없음
├── voice-ai-analysis.service.ts       # [이동+리네이밍+리팩토링] SDK 제거, LlmProvider 위임
├── voice-analytics.service.ts         # [이동] 변경 없음
├── voice-analytics.controller.ts      # [이동+수정] import 변경
├── voice-name-enricher.service.ts     # [이동] 변경 없음
└── voice-analytics.module.ts          # [이동+수정] LlmModule import, 서비스명 변경
```

## 검증 체크리스트

| 항목 | 검증 방법 |
|------|-----------|
| 빌드 성공 | `pnpm --filter @nexus/api build` |
| Lint 통과 | `pnpm --filter @nexus/api lint` |
| `@google/generative-ai` import가 `gemini-llm.provider.ts`에만 존재 | `grep -r "@google/generative-ai" apps/api/src/` |
| `gemini/` 디렉토리가 완전히 제거됨 | `ls apps/api/src/gemini/` 실패 확인 |
| `VoiceGeminiService` 참조가 코드베이스에 남아있지 않음 | `grep -r "VoiceGeminiService" apps/api/src/` |
| REST API `/voice-analytics/guild/:guildId` 정상 응답 | 수동 테스트 |
| `/voice-stats` 커맨드 정상 동작 | Discord에서 수동 테스트 |
| `/community-health` 커맨드 정상 동작 | Discord에서 수동 테스트 |
| `/my-voice-stats` 커맨드 정상 동작 | Discord에서 수동 테스트 |
| `/voice-leaderboard` 커맨드 정상 동작 | Discord에서 수동 테스트 |

## 주의사항

1. **`@google/generative-ai` 패키지는 제거하지 않는다.** `GeminiLlmProvider`가 여전히 사용한다. 단, import가 `gemini-llm.provider.ts` 한 곳에만 존재하는지 반드시 확인한다.

2. **VoiceAnalyticsService의 import 경로**: 디렉토리 이동 후 `voice-analytics.service.ts` 내부의 `../channel/voice/domain/voice-daily.entity` 등 상대 경로는 디렉토리 깊이가 동일하므로(`gemini/` -> `voice-analytics/`) 변경이 필요 없다.

3. **VoiceNameEnricherService의 import 경로**: 동일하게 상대 경로 깊이가 변하지 않으므로 수정 불필요.

4. **VoiceRedisRepository**: `voice-analytics.module.ts`에서 직접 providers로 등록하는 기존 패턴을 유지한다. VoiceChannelModule의 export가 아닌 직접 인스턴스화 방식이다. 이는 T-SD-002 범위에서 변경하지 않는다.

5. **docs 내 참조**: `docs/plans/pages/1-general-backend/plan.md`에 `gemini/` 경로 참조가 있으나, 문서 파일은 이 PR 범위에서 업데이트하지 않는다 (별도 chore 커밋).
