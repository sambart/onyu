import { Controller, Get, Header } from '@nestjs/common';

import { BotPrometheusService } from './bot-prometheus.service';

@Controller('metrics')
export class BotMetricsController {
  constructor(private readonly prometheus: BotPrometheusService) {}

  /** GET /metrics — Prometheus scrape 엔드포인트 */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.prometheus.getMetrics();
  }
}
