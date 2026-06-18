/**
 * voice E2E 테스트
 *
 * 검증 대상:
 * - GET /api/guilds/:guildId/voice/excluded-channels (VoiceExcludedChannelController)
 * - GET /api/guilds/:guildId/voice/daily (VoiceDailyController)
 * - GET /api/guilds/:guildId/voice/history/:userId (VoiceHistoryController)
 *
 * 시나리오:
 * - 인증 없이 접근 → 401
 * - 유효 JWT, 빈 DB → 200 + 빈 결과
 *
 * VoiceChannelHistoryOrm 이 ChannelOrm, GuildMemberOrmEntity 와 ManyToOne 관계를 가지므로
 * 이 엔티티들도 TypeORM.forFeature 에 등록해야 한다.
 *
 * VoiceChannelModule 의 전체 모듈 트리(Discord 봇 Gateway, CoPresence 스케줄러 등)를 피하기 위해
 * 필요한 컨트롤러와 서비스/리포지토리만 직접 등록한다.
 */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../src/auth/application/auth.service';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
// VoiceChannelHistoryOrm 의 관계 엔티티 (TypeORM 관계 resolve 용)
import { ChannelOrm } from '../src/channel/infrastructure/channel.orm-entity';
import { VoiceDailyService } from '../src/channel/voice/application/voice-daily.service';
import { VoiceExcludedChannelService } from '../src/channel/voice/application/voice-excluded-channel.service';
import { VoiceHistoryService } from '../src/channel/voice/application/voice-history.service';
import { VoiceChannelHistoryOrm } from '../src/channel/voice/infrastructure/voice-channel-history.orm-entity';
import { VoiceDailyOrm } from '../src/channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceDailyRepository } from '../src/channel/voice/infrastructure/voice-daily.repository';
import { VoiceExcludedChannelOrm } from '../src/channel/voice/infrastructure/voice-excluded-channel.orm-entity';
import { VoiceExcludedChannelRepository } from '../src/channel/voice/infrastructure/voice-excluded-channel.repository';
import { VoiceDailyController } from '../src/channel/voice/presentation/voice-daily.controller';
import { VoiceExcludedChannelController } from '../src/channel/voice/presentation/voice-excluded-channel.controller';
import { VoiceHistoryController } from '../src/channel/voice/presentation/voice-history.controller';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { GuildMemberOrmEntity } from '../src/guild-member/infrastructure/guild-member.orm-entity';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { cleanDatabase } from '../src/test-utils/db-cleaner';
import { cleanRedis } from '../src/test-utils/redis-cleaner';

/** 테스트용 JWT 발급 헬퍼 */
function makeJwt(jwtService: JwtService): string {
  return jwtService.sign({
    sub: 'user-001',
    username: 'tester',
    avatar: null,
    guilds: [],
  });
}

describe('VoiceControllers (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let redisClient: Redis;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT),
          username: process.env.DATABASE_USER,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME,
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          VoiceExcludedChannelOrm,
          VoiceDailyOrm,
          VoiceChannelHistoryOrm,
          // 관계 엔티티 — TypeORM 메타데이터 resolve 에 필요
          ChannelOrm,
          GuildMemberOrmEntity,
        ]),
        PassportModule,
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>('JWT_SECRET'),
            signOptions: { expiresIn: '1h' },
          }),
          inject: [ConfigService],
        }),
        RedisModule,
      ],
      controllers: [VoiceExcludedChannelController, VoiceDailyController, VoiceHistoryController],
      providers: [
        // Auth
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        // Voice excluded channels
        VoiceExcludedChannelRepository,
        VoiceExcludedChannelService,
        // Voice daily
        VoiceDailyRepository,
        VoiceDailyService,
        // Voice history
        VoiceHistoryService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter(), new DomainExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = moduleRef.get(JwtService);
    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    redisClient = moduleRef.get<Redis>(REDIS_CLIENT);
  }, 120_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
    await cleanRedis(redisClient);
  });

  afterAll(async () => {
    await app.close();
  });

  const GUILD_ID = 'guild-voice-e2e-001';
  const USER_ID = 'user-001';

  describe('VoiceExcludedChannelController', () => {
    describe('인증 없이 접근', () => {
      it('GET /api/guilds/:guildId/voice/excluded-channels — 인증 없이 401을 반환한다', async () => {
        await request(app.getHttpServer())
          .get(`/api/guilds/${GUILD_ID}/voice/excluded-channels`)
          .expect(401);
      });
    });

    describe('유효 JWT로 빈 길드 조회', () => {
      it('GET /api/guilds/:guildId/voice/excluded-channels — 제외 채널 없으면 빈 배열을 반환한다', async () => {
        const token = makeJwt(jwtService);
        const res = await request(app.getHttpServer())
          .get(`/api/guilds/${GUILD_ID}/voice/excluded-channels`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(res.body).toEqual([]);
      });
    });
  });

  describe('VoiceDailyController', () => {
    describe('인증 없이 접근', () => {
      it('GET /api/guilds/:guildId/voice/daily — 인증 없이 401을 반환한다', async () => {
        await request(app.getHttpServer()).get(`/api/guilds/${GUILD_ID}/voice/daily`).expect(401);
      });
    });

    describe('유효 JWT로 빈 길드 조회', () => {
      it('GET /api/guilds/:guildId/voice/daily — 데이터 없으면 빈 배열을 반환한다', async () => {
        const token = makeJwt(jwtService);
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const res = await request(app.getHttpServer())
          .get(`/api/guilds/${GUILD_ID}/voice/daily`)
          .query({ from: today, to: today })
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(res.body).toEqual([]);
      });
    });
  });

  describe('VoiceHistoryController', () => {
    describe('인증 없이 접근', () => {
      it('GET /api/guilds/:guildId/voice/history/:userId — 인증 없이 401을 반환한다', async () => {
        await request(app.getHttpServer())
          .get(`/api/guilds/${GUILD_ID}/voice/history/${USER_ID}`)
          .expect(401);
      });
    });

    describe('유효 JWT로 빈 길드 조회', () => {
      it('GET /api/guilds/:guildId/voice/history/:userId — 이력 없으면 페이지네이션 빈 결과를 반환한다', async () => {
        const token = makeJwt(jwtService);
        const res = await request(app.getHttpServer())
          .get(`/api/guilds/${GUILD_ID}/voice/history/${USER_ID}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(res.body).toMatchObject({
          items: [],
          total: 0,
        });
      });
    });
  });
});
