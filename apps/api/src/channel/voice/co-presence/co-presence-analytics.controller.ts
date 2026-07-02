import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../../common/guards/guild-membership.guard';
import { CoPresenceAnalyticsService } from './co-presence-analytics.service';

const DEFAULT_DAYS = 30;
const DEFAULT_MIN_MINUTES = 10;
const DEFAULT_TOP_PAIRS_LIMIT = 10;
const DEFAULT_PAGE = 1;
const DEFAULT_PAIRS_LIMIT = 20;
const MAX_DAYS = 365;
const MAX_TOP_PAIRS_LIMIT = 50;
const MAX_PAIRS_LIMIT = 100;

@Controller('api/guilds/:guildId/co-presence')
@UseGuards(JwtAuthGuard, GuildMembershipGuard)
export class CoPresenceAnalyticsController {
  constructor(private readonly analyticsService: CoPresenceAnalyticsService) {}

  /** days 파라미터를 파싱한다. 유효하지 않으면 defaultValue, 상한 365일 */
  private parseDays(raw: string | undefined, defaultValue: number): number {
    if (!raw) return defaultValue;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < 1) return defaultValue;
    return Math.min(parsed, MAX_DAYS);
  }

  /** 정수 파라미터를 파싱한다. 유효하지 않으면 defaultValue, min/max 경계 적용 */
  private parseIntParam(
    raw: string | undefined,
    opts: { defaultValue: number; min: number; max: number },
  ): number {
    if (!raw) return opts.defaultValue;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return opts.defaultValue;
    return Math.min(opts.max, Math.max(opts.min, parsed));
  }

  // F-COPRESENCE-007
  @Get('summary')
  async getSummary(@Param('guildId') guildId: string, @Query('days') daysRaw?: string) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    return this.analyticsService.getSummary(guildId, days);
  }

  // F-COPRESENCE-008
  @Get('graph')
  async getGraph(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
    @Query('minMinutes') minMinutesRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    const minMinutes = this.parseIntParam(minMinutesRaw, {
      defaultValue: DEFAULT_MIN_MINUTES,
      min: 0,
      max: MAX_DAYS,
    });
    return this.analyticsService.getGraph(guildId, days, minMinutes);
  }

  // F-COPRESENCE-009
  @Get('top-pairs')
  async getTopPairs(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    const limit = this.parseIntParam(limitRaw, {
      defaultValue: DEFAULT_TOP_PAIRS_LIMIT,
      min: 1,
      max: MAX_TOP_PAIRS_LIMIT,
    });
    return this.analyticsService.getTopPairs(guildId, days, limit);
  }

  // F-COPRESENCE-010
  @Get('isolated')
  async getIsolated(@Param('guildId') guildId: string, @Query('days') daysRaw?: string) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    return this.analyticsService.getIsolated(guildId, days);
  }

  // F-COPRESENCE-011
  @Get('pairs')
  async getPairs(
    @Param('guildId') guildId: string,
    @Query('days') daysRaw?: string,
    @Query('search') search?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    const page = this.parseIntParam(pageRaw, { defaultValue: DEFAULT_PAGE, min: 1, max: Infinity });
    const limit = this.parseIntParam(limitRaw, {
      defaultValue: DEFAULT_PAIRS_LIMIT,
      min: 1,
      max: MAX_PAIRS_LIMIT,
    });
    return this.analyticsService.getPairs({ guildId, days, search, page, limit });
  }

  // F-COPRESENCE-012
  @Get('daily-trend')
  async getDailyTrend(@Param('guildId') guildId: string, @Query('days') daysRaw?: string) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    return this.analyticsService.getDailyTrend(guildId, days);
  }

  // F-COPRESENCE-013
  @Get('pair-detail')
  async getPairDetail(
    @Param('guildId') guildId: string,
    @Query('userA') userA: string,
    @Query('userB') userB: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = this.parseDays(daysRaw, DEFAULT_DAYS);
    return this.analyticsService.getPairDetail({ guildId, userA, userB, days });
  }
}
