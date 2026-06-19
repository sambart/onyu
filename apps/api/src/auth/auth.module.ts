import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GuildMemberOrmEntity } from '../guild-member/infrastructure/guild-member.orm-entity';
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
    TypeOrmModule.forFeature([GuildMemberOrmEntity]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuildRepository, DiscordStrategy, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
