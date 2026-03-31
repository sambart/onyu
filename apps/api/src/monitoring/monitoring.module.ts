import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsController } from './metrics.controller';
import { PrometheusService } from './prometheus.service';

@Module({
  controllers: [MetricsController],
  providers: [
    PrometheusService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [PrometheusService],
})
export class MonitoringModule {}
