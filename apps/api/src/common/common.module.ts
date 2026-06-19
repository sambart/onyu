import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { BotI18nService } from './application/bot-i18n.service';
import { LocaleResolverService } from './application/locale-resolver.service';
import { GuildSettingOrmEntity } from './infrastructure/guild-setting.orm-entity';
import { UserSettingOrmEntity } from './infrastructure/user-setting.orm-entity';
import { LocaleController } from './presentation/locale.controller';
import { SchedulerLockService } from './scheduler/scheduler-lock.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserSettingOrmEntity, GuildSettingOrmEntity]),
    RedisModule,
    AuthModule,
  ],
  controllers: [LocaleController],
  providers: [LocaleResolverService, BotI18nService, SchedulerLockService],
  exports: [LocaleResolverService, BotI18nService, SchedulerLockService],
})
export class CommonModule {}
