/**
 * auth E2E 테스트
 *
 * POST /auth/discord/exchange 전 구간 검증:
 * - issueAuthCode → exchange 성공 경로
 * - 1회용 보장
 * - 위조/미존재 code → 401
 * - 만료(TTL 만료 시뮬레이션) → 401
 * - DTO 검증(code 누락/빈 문자열) → 400
 *
 * AppModule 은 Discord 봇·스케줄러 등 외부 의존성이 많아 전체 부팅이 불안정.
 * → AuthModule 만 조합한 경량 앱을 사용하며, DiscordStrategy 는 ConfigService 만 필요하므로
 *   더미 env 로 충분히 초기화된다.
 */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../src/auth/application/auth.service';
import { DiscordStrategy } from '../src/auth/infrastructure/discord.strategy';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
import { AuthController } from '../src/auth/presentation/auth.controller';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { cleanRedis } from '../src/test-utils/redis-cleaner';

describe('AuthController (E2E)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let jwtService: JwtService;
  let redisService: RedisService;
  let redisClient: Redis;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
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
      controllers: [AuthController],
      providers: [AuthService, DiscordStrategy, JwtStrategy, JwtAuthGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter(), new DomainExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    authService = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
    redisService = moduleRef.get(RedisService);
    redisClient = moduleRef.get<Redis>(REDIS_CLIENT);
  }, 120_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/discord/exchange', () => {
    it('유효한 코드로 exchange 시 200과 원본 JWT를 반환한다', async () => {
      // Arrange: JWT 생성 후 Redis에 1회용 코드 등록
      const jwt = jwtService.sign({
        sub: 'user-123',
        username: 'testuser',
        avatar: 'abc',
        guilds: [],
      });
      const code = await authService.issueAuthCode(jwt);

      // Act
      const res = await request(app.getHttpServer())
        .post('/auth/discord/exchange')
        .send({ code })
        .expect(200);

      // Assert
      expect(res.body).toEqual({ token: jwt });
    });

    it('같은 code 로 두 번 exchange 시 두 번째는 401을 반환한다 (1회용 보장)', async () => {
      const jwt = jwtService.sign({ sub: 'user-123', username: 'testuser' });
      const code = await authService.issueAuthCode(jwt);

      await request(app.getHttpServer()).post('/auth/discord/exchange').send({ code }).expect(200);

      // 두 번째 시도
      const res = await request(app.getHttpServer())
        .post('/auth/discord/exchange')
        .send({ code })
        .expect(401);

      expect(res.body.message).toBe('Invalid or expired authorization code');
    });

    it('위조/미존재 code 로 exchange 시 401을 반환한다', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/discord/exchange')
        .send({ code: 'totally-fake-code-that-does-not-exist' })
        .expect(401);

      expect(res.body.message).toBe('Invalid or expired authorization code');
    });

    it('Redis 에서 키를 직접 삭제(TTL 만료 시뮬레이션)한 후 exchange 시 401을 반환한다', async () => {
      const jwt = jwtService.sign({ sub: 'user-456', username: 'expireduser' });
      const code = await authService.issueAuthCode(jwt);

      // TTL 만료 시뮬레이션: Redis 키 직접 삭제
      await redisClient.del(`auth:code:${code}`);

      const res = await request(app.getHttpServer())
        .post('/auth/discord/exchange')
        .send({ code })
        .expect(401);

      expect(res.body.message).toBe('Invalid or expired authorization code');
    });

    it('code 필드 누락 시 400을 반환한다 (ValidationPipe)', async () => {
      await request(app.getHttpServer()).post('/auth/discord/exchange').send({}).expect(400);
    });

    it('code 가 빈 문자열이면 400을 반환한다 (ValidationPipe @IsNotEmpty)', async () => {
      await request(app.getHttpServer())
        .post('/auth/discord/exchange')
        .send({ code: '' })
        .expect(400);
    });

    it('code 가 문자열이 아니면 400을 반환한다 (ValidationPipe @IsString)', async () => {
      await request(app.getHttpServer())
        .post('/auth/discord/exchange')
        .send({ code: 12345 })
        .expect(400);
    });
  });
});
