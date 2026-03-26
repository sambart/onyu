import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotCoPresenceScheduler } from './bot-co-presence.scheduler';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [BotCoPresenceScheduler],
})
export class BotSchedulerModule {}
