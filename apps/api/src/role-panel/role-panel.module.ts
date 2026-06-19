import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { BotRolePanelController } from '../bot-api/role-panel/bot-role-panel.controller';
import { RolePanelBotService } from './application/role-panel-bot.service';
import { RolePanelConfigService } from './application/role-panel-config.service';
import { RolePanelPublishService } from './application/role-panel-publish.service';
import { RolePanelRoleValidator } from './application/role-panel-role-validator';
import { RolePanelButtonOrm } from './infrastructure/role-panel-button.orm-entity';
import { RolePanelConfigOrm } from './infrastructure/role-panel-config.orm-entity';
import { RolePanelConfigRepository } from './infrastructure/role-panel-config.repository';
import { RolePanelDiscordAdapter } from './infrastructure/role-panel-discord.adapter';
import { RolePanelRedisRepository } from './infrastructure/role-panel-redis.repository';
import { RolePanelController } from './presentation/role-panel.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RolePanelConfigOrm, RolePanelButtonOrm]), AuthModule],
  controllers: [RolePanelController, BotRolePanelController],
  providers: [
    RolePanelConfigRepository,
    RolePanelRedisRepository,
    RolePanelDiscordAdapter,
    RolePanelRoleValidator,
    RolePanelConfigService,
    RolePanelPublishService,
    RolePanelBotService,
  ],
  exports: [RolePanelConfigService, RolePanelBotService],
})
export class RolePanelModule {}
