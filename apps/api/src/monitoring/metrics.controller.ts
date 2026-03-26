import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { PrometheusService } from './prometheus.service';

// GuildMembershipGuard는 :guildId 파라미터가 없는 경로를 자동으로 통과시킨다.
// JwtAuthGuard는 APP_GUARD로 등록되어 있지 않으므로 별도 제외 불필요.
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly prometheus: PrometheusService) {}

  /** GET /metrics — Prometheus scrape 엔드포인트 */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.prometheus.getMetrics();
  }
}
