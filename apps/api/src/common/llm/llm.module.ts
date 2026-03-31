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
