import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotMetricsController } from './bot-metrics.controller';
import { BotPrometheusService } from './bot-prometheus.service';

@Module({
  imports: [DiscordModule.forFeature()],
  controllers: [BotMetricsController],
  providers: [BotPrometheusService],
})
export class BotMetricsModule {}
