import { Controller, Get, Logger, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AiInsightResponse,
  ChannelStatsResponse,
  DiagnosisSummaryResponse,
  HealthScoreResponse,
  LeaderboardResponse,
} from '@onyu/shared';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { RedisService } from '../../redis/redis.service';
import { VoiceAiAnalysisService } from '../application/voice-ai-analysis.service';
import { VoiceAnalyticsService } from '../application/voice-analytics.service';
import {
  ChannelStatsQueryDto,
  DiagnosisQueryDto,
  LeaderboardQueryDto,
} from './dto/diagnosis-query.dto';

const CACHE_TTL_TEN_MIN = 60 * 10;
const CACHE_TTL_THIRTY_MIN = 60 * 30;
const DEFAULT_DAYS = 7;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Throttle({ default: { ttl: 60000, limit: 10 } })
@Controller('api/guilds/:guildId/voice-analytics')
@UseGuards(JwtAuthGuard)
export class DiagnosisController {
  private readonly logger = new Logger(DiagnosisController.name);

  constructor(
    private readonly analyticsService: VoiceAnalyticsService,
    private readonly aiAnalysisService: VoiceAiAnalysisService,
    private readonly redis: RedisService,
  ) {}

  @Get('summary')
  async getSummary(
    @Param('guildId') guildId: string,
    @Query() query: DiagnosisQueryDto,
  ): Promise<DiagnosisSummaryResponse> {
    const days = query.days ?? DEFAULT_DAYS;
    const cacheKey = `voice:diag:summary:${guildId}:${days}`;
    const cached = await this.redis.get<DiagnosisSummaryResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return cached;
    }

    const daily = await this.analyticsService.getDailySummary(guildId, days);
    const result: DiagnosisSummaryResponse = { daily };
    await this.redis.set(cacheKey, result, CACHE_TTL_TEN_MIN);
    return result;
  }

  @Get('health-score')
  async getHealthScore(
    @Param('guildId') guildId: string,
    @Query() query: DiagnosisQueryDto,
  ): Promise<HealthScoreResponse> {
    const days = query.days ?? DEFAULT_DAYS;
    const cacheKey = `voice:diag:health-score:${guildId}:${days}`;
    const cached = await this.redis.get<HealthScoreResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return cached;
    }

    const { score, prevScore, delta, totalStats, dailyTrends } =
      await this.analyticsService.getHealthScore(guildId, days);

    const diagnosis = await this.aiAnalysisService.generateHealthDiagnosis(
      score,
      totalStats,
      dailyTrends,
    );

    const result: HealthScoreResponse = { score, prevScore, delta, diagnosis };
    await this.redis.set(cacheKey, result, CACHE_TTL_THIRTY_MIN);
    return result;
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Param('guildId') guildId: string,
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardResponse> {
    const days = query.days ?? DEFAULT_DAYS;
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cacheKey = `voice:diag:leaderboard:${guildId}:${days}:${page}:${limit}`;
    const cached = await this.redis.get<LeaderboardResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return cached;
    }

    const result = await this.analyticsService.getLeaderboard(guildId, { days, page, limit });
    await this.redis.set(cacheKey, result, CACHE_TTL_TEN_MIN);
    return result;
  }

  @Get('channel-stats')
  async getChannelStats(
    @Param('guildId') guildId: string,
    @Query() query: ChannelStatsQueryDto,
  ): Promise<ChannelStatsResponse> {
    const days = query.days ?? DEFAULT_DAYS;
    const groupAutoChannels = query.groupAutoChannels ?? false;
    const cacheKey = `voice:diag:channel-stats:${guildId}:${days}:${groupAutoChannels}`;
    const cached = await this.redis.get<ChannelStatsResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return cached;
    }

    const channels = await this.analyticsService.getChannelStats(guildId, days, {
      groupAutoChannels,
    });
    const result: ChannelStatsResponse = { channels };
    await this.redis.set(cacheKey, result, CACHE_TTL_TEN_MIN);
    return result;
  }

  @Get('ai-insight')
  async getAiInsight(
    @Param('guildId') guildId: string,
    @Query() query: DiagnosisQueryDto,
  ): Promise<AiInsightResponse | null> {
    const days = query.days ?? DEFAULT_DAYS;
    const cacheKey = `voice:diag:ai-insight:${guildId}:${days}`;
    const cached = await this.redis.get<AiInsightResponse>(cacheKey);
    return cached ?? null;
  }

  @Post('ai-insight')
  async generateAiInsight(
    @Param('guildId') guildId: string,
    @Query() query: DiagnosisQueryDto,
  ): Promise<AiInsightResponse> {
    const days = query.days ?? DEFAULT_DAYS;

    // POST는 항상 LLM을 재호출한다 (사용자가 "분석 새로고침"을 클릭한 경우)
    const { start, end } = VoiceAnalyticsService.getDateRange(days);
    const activityData = await this.analyticsService.collectVoiceActivityData(guildId, start, end);
    const result = await this.aiAnalysisService.generateAiInsight(activityData);

    // LLM 성공 시에만 캐시 (fallback 텍스트는 캐시하지 않는다)
    const isFallback = result.insights?.includes('일시적으로 사용할 수 없어');
    if (!isFallback) {
      const cacheKey = `voice:diag:ai-insight:${guildId}:${days}`;
      await this.redis.set(cacheKey, result, CACHE_TTL_THIRTY_MIN);
    }

    return result;
  }
}
