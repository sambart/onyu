import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GuildMemberOrmEntity } from '../guild-member/infrastructure/guild-member.orm-entity';
import { AdminUserOrmEntity } from '../super-admin/infrastructure/admin-user.orm-entity';
import { AdminUserRepository } from '../super-admin/infrastructure/admin-user.repository';
import { AuthService } from './application/auth.service';
import { AuthGuildRepository } from './infrastructure/auth-guild.repository';
import { DiscordStrategy } from './infrastructure/discord.strategy';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { JwtAuthGuard } from './infrastructure/jwt-auth.guard';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    // guild_member 테이블 읽기 전용 — GuildMemberModule 미수정, auth 모듈에서 재등록
    // AdminUserOrmEntity: createToken 에서 DB 조회를 위해 재등록 (순환 참조 회피 — SuperAdminModule import 없음)
    TypeOrmModule.forFeature([GuildMemberOrmEntity, AdminUserOrmEntity]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuildRepository,
    AdminUserRepository,
    DiscordStrategy,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
