import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { GuildMemberOrmEntity } from '../guild-member/infrastructure/guild-member.orm-entity';
import { AdminGuildService } from './application/admin-guild.service';
import { AdminUserService } from './application/admin-user.service';
import { AuditLogInterceptor } from './audit/audit-log.interceptor';
import { RequireScopeGuard } from './guards/require-scope.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { AdminGuildRepository } from './infrastructure/admin-guild.repository';
import { AdminUserOrmEntity } from './infrastructure/admin-user.orm-entity';
import { AdminUserRepository } from './infrastructure/admin-user.repository';
import { AuditLogOrmEntity } from './infrastructure/audit-log.orm-entity';
import { AuditLogRepository } from './infrastructure/audit-log.repository';
import { AdminGuildController } from './presentation/admin-guild.controller';
import { AdminUserController } from './presentation/admin-user.controller';

@Module({
  imports: [
    // AuditLogOrmEntity + GuildMemberOrmEntity(read-only, super-admin 내부 재등록)
    // AdminUserOrmEntity: 관리자 관리 API 용 재등록
    TypeOrmModule.forFeature([AuditLogOrmEntity, GuildMemberOrmEntity, AdminUserOrmEntity]),
    AuthModule,
    // DiscordRestModule 은 @Global() 이므로 별도 import 불필요
  ],
  controllers: [AdminGuildController, AdminUserController],
  providers: [
    SuperAdminGuard,
    RequireScopeGuard,
    AdminGuildService,
    AdminUserService,
    AdminGuildRepository,
    AdminUserRepository,
    AuditLogRepository,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class SuperAdminModule {}
