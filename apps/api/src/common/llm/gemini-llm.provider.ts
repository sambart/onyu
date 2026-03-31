import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createResiliencePolicy, type ResiliencePolicy } from '../resilience/resilience.policy';
import type { LlmOptions, LlmProvider } from './llm-provider.interface';
import { LlmQuotaExhaustedException } from './llm-provider.interface';

const QUOTA_ERROR_PATTERN = /429|quota|rate.?limit/i;

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
  private readonly policy: ResiliencePolicy;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY not found in environment variables');
      throw new Error('GEMINI_API_KEY is required');
    }

    const modelName = this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: DEFAULT_GENERATION_CONFIG,
    });

    this.policy = createResiliencePolicy({
      timeoutMs: 30000,
      maxRetries: 2,
      retryBaseDelayMs: 1000,
      consecutiveFailures: 5,
      halfOpenAfterMs: 60000,
    });

    this.policy.circuitBreaker.onStateChange((state) => {
      this.logger.warn(`Gemini circuit breaker state: ${state}`);
    });

    this.logger.log(`Gemini model initialized: ${modelName}`);
  }

  /** LlmProvider 구현: circuit breaker + retry + timeout 포함 Gemini API 호출 */
  async generateText(prompt: string, options?: LlmOptions): Promise<string> {
    const model = options ? this.createModelWithOptions(options) : this.model;

    try {
      return await this.policy.execute(async () => {
        const result = await model.generateContent(prompt);
        return result.response.text();
      });
    } catch (error) {
      if (error instanceof Error && QUOTA_ERROR_PATTERN.test(error.message)) {
        throw new LlmQuotaExhaustedException();
      }
      throw error;
    }
  }

  /**
   * LlmOptions가 지정된 경우 기본 설정을 오버라이드한 모델 인스턴스를 생성한다.
   */
  private createModelWithOptions(options: LlmOptions): GenerativeModel {
    // constructor에서 apiKey 존재를 이미 검증했으므로 안전한 단언
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') as string;
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';

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
        // Gemini 2.5 thinking 모델의 thinking 예산 제한
        ...(options.thinkingBudget !== undefined && {
          thinkingConfig: { thinkingBudget: options.thinkingBudget },
        }),
      } as Record<string, unknown>,
    });
  }
}
