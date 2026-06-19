/**
 * inactive-member E2E 테스트
 *
 * 검증 대상: GET|PUT|POST /api/guilds/:guildId/inactive-members/*
 *
 * 시나리오:
 * 1. 인증 없이 접근 → 401 (전 엔드포인트)
 * 2. 유효 JWT + 빈 길드 → 200 + 빈/기본값 응답
 *    - GET /         → { total:0, items:[] }
 *    - GET /stats    → 집계 0 응답
 *    - GET /action-logs → { total:0, items:[] }
 *    - GET /config   → getOrCreateConfig 기본 config 반환
 *    - PUT /config   → upsert 후 저장값 반영, GET /config 재조회 일관성 확인
 *    - POST /classify → { classifiedCount:0 } (fetchGuildMembers mock → [])
 * 3. POST /actions DTO 검증 → 400
 *    - actionType 누락 / 잘못된 값
 *    - targetUserIds 누락 / 빈 배열
 * 4. POST /actions 성공 경로 (Discord mock)
 *    - ACTION_KICK 유효 body → actionLog 저장, successCount/failCount 반환
 *
 * 의존성 mock 전략:
 * - InactiveMemberDiscordAdapter 통째로 provider override
 *   (DiscordRestService 를 내부 주입받으므로 어댑터 수준에서 차단)
 * - VoiceDailyFlushService 를 provider override (safeFlushAll 차단)
 */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/auth/application/auth.service';
import { AuthGuildRepository } from '../src/auth/infrastructure/auth-guild.repository';
import { AdminUserRepository } from '../src/super-admin/infrastructure/admin-user.repository';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { VoiceDailyFlushService } from '../src/channel/voice/application/voice-daily-flush-service';
import { VoiceDailyOrm } from '../src/channel/voice/infrastructure/voice-daily.orm-entity';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { InactiveMemberActionService } from '../src/inactive-member/application/inactive-member-action.service';
import { InactiveMemberService } from '../src/inactive-member/application/inactive-member.service';
import { InactiveMemberActionLogOrm } from '../src/inactive-member/infrastructure/inactive-member-action-log.orm-entity';
import { InactiveMemberConfigOrm } from '../src/inactive-member/infrastructure/inactive-member-config.orm-entity';
import { InactiveMemberDiscordAdapter } from '../src/inactive-member/infrastructure/inactive-member-discord.adapter';
import { InactiveMemberQueryRepository } from '../src/inactive-member/infrastructure/inactive-member-query.repository';
import { InactiveMemberRecordOrm } from '../src/inactive-member/infrastructure/inactive-member-record.orm-entity';
import { InactiveMemberRepository } from '../src/inactive-member/infrastructure/inactive-member.repository';
import { InactiveMemberTrendDailyOrm } from '../src/inactive-member/infrastructure/inactive-member-trend-daily.orm-entity';
import { InactiveMemberController } from '../src/inactive-member/presentation/inactive-member.controller';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { cleanDatabase } from '../src/test-utils/db-cleaner';
import { cleanRedis } from '../src/test-utils/redis-cleaner';
import type Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Mock 객체 정의
// ---------------------------------------------------------------------------

/**
 * InactiveMemberDiscordAdapter mock:
 * - fetchGuildMembers → [] (빈 목록) — classifyGuild 에서 멤버 없는 경로를 시뮬
 * - fetchGuild        → null (기본) 또는 테스트별 반환값
 * - kickMember / sendDm / modifyRole → 테스트별 설정
 */
const mockDiscordAdapter = {
  fetchGuild: vi.fn().mockResolvedValue(null),
  fetchGuildMembers: vi.fn().mockResolvedValue([]),
  kickMember: vi.fn().mockResolvedValue(true),
  sendDm: vi.fn().mockResolvedValue(true),
  modifyRole: vi.fn().mockResolvedValue(true),
};

/**
 * VoiceDailyFlushService mock:
 * safeFlushAll 이 Redis/DB 를 건드리지 않도록 차단
 */
const mockVoiceDailyFlushService = {
  safeFlushAll: vi.fn().mockResolvedValue({ flushed: 0, skipped: 0 }),
  flushDate: vi.fn().mockResolvedValue(undefined),
  flushTodayAll: vi.fn().mockResolvedValue(undefined),
};

/**
 * AuthGuildRepository mock:
 * AuthService.createToken 내부에서 봇 참여 길드 조회 시 빈 셋 반환
 */
const mockAuthGuildRepository = {
  findBotGuildIds: vi.fn().mockResolvedValue(new Set<string>()),
};

/**
 * AdminUserRepository mock:
 * AuthService 가 role/scope 판정 시 admin 조회 — 비관리자(null) 반환
 */
const mockAdminUserRepository = {
  findByDiscordId: vi.fn().mockResolvedValue(null),
};

// ---------------------------------------------------------------------------
// JWT 발급 헬퍼
// ---------------------------------------------------------------------------
function makeJwt(jwtService: JwtService): string {
  return jwtService.sign({
    sub: 'user-e2e-001',
    username: 'tester',
    avatar: null,
    guilds: [],
  });
}

// ---------------------------------------------------------------------------
// 테스트 스위트
// ---------------------------------------------------------------------------
describe('InactiveMemberController (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let redisClient: Redis;

  const GUILD_ID = 'guild-inactive-e2e-001';

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
          InactiveMemberConfigOrm,
          InactiveMemberRecordOrm,
          InactiveMemberActionLogOrm,
          InactiveMemberTrendDailyOrm,
          VoiceDailyOrm,
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
      controllers: [InactiveMemberController],
      providers: [
        // Auth
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: AuthGuildRepository, useValue: mockAuthGuildRepository },
        { provide: AdminUserRepository, useValue: mockAdminUserRepository },
        // Inactive member repositories
        InactiveMemberRepository,
        InactiveMemberQueryRepository,
        // Inactive member services
        InactiveMemberService,
        InactiveMemberActionService,
        // Discord adapter mock — 실제 Discord REST 호출 차단
        { provide: InactiveMemberDiscordAdapter, useValue: mockDiscordAdapter },
        // VoiceDailyFlushService mock — Redis/DB flush 차단
        { provide: VoiceDailyFlushService, useValue: mockVoiceDailyFlushService },
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
    vi.clearAllMocks();
    // 기본 mock 복원
    mockDiscordAdapter.fetchGuild.mockResolvedValue(null);
    mockDiscordAdapter.fetchGuildMembers.mockResolvedValue([]);
    mockDiscordAdapter.kickMember.mockResolvedValue(true);
    mockDiscordAdapter.sendDm.mockResolvedValue(true);
    mockDiscordAdapter.modifyRole.mockResolvedValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // 1. 인증 없이 접근 → 401
  // =========================================================================
  describe('인증 없이 접근', () => {
    it('GET /api/guilds/:guildId/inactive-members — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members`)
        .expect(401);
    });

    it('GET /api/guilds/:guildId/inactive-members/stats — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/stats`)
        .expect(401);
    });

    it('GET /api/guilds/:guildId/inactive-members/action-logs — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/action-logs`)
        .expect(401);
    });

    it('GET /api/guilds/:guildId/inactive-members/config — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .expect(401);
    });

    it('PUT /api/guilds/:guildId/inactive-members/config — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .send({ periodDays: 7 })
        .expect(401);
    });

    it('POST /api/guilds/:guildId/inactive-members/classify — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/classify`)
        .expect(401);
    });

    it('POST /api/guilds/:guildId/inactive-members/actions — 토큰 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .send({ actionType: 'ACTION_KICK', targetUserIds: ['user-001'] })
        .expect(401);
    });
  });

  // =========================================================================
  // 2. 유효 JWT + 빈 길드
  // =========================================================================
  describe('유효 JWT + 빈 길드 조회', () => {
    it('GET /inactive-members — 레코드 없으면 { total:0, page:1, limit:20, items:[] }를 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        total: 0,
        page: 1,
        limit: 20,
        items: [],
      });
    });

    it('GET /inactive-members/stats — 레코드 없으면 집계 모두 0을 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/stats`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        totalMembers: 0,
        activeCount: 0,
        fullyInactiveCount: 0,
        lowActiveCount: 0,
        decliningCount: 0,
        returnedCount: 0,
        trend: [],
      });
    });

    it('GET /inactive-members/action-logs — 로그 없으면 { total:0, page:1, limit:20, items:[] }를 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/action-logs`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        total: 0,
        page: 1,
        limit: 20,
        items: [],
      });
    });

    it('GET /inactive-members/config — 설정 없으면 getOrCreateConfig 가 기본 config 를 생성·반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // 기본값 확인 (InactiveMemberConfigOrm 컬럼 기본값과 일치)
      expect(res.body).toMatchObject({
        guildId: GUILD_ID,
        periodDays: 30,
        lowActiveThresholdMin: 30,
        decliningPercent: 50,
        gracePeriodDays: 7,
        autoActionEnabled: false,
        autoRoleAdd: false,
        autoDm: false,
        excludedRoleIds: [],
      });
      expect(res.body.id).toBeTypeOf('number');
    });

    it('POST /inactive-members/classify — Discord mock 이 빈 멤버 반환하면 { classifiedCount:0 }을 반환한다', async () => {
      // fetchGuildMembers 는 beforeEach 후 기본값 [] 으로 설정돼 있음
      // 단, classifyGuild 내부에서 fetchGuildMembers null 반환 시 [] 반환하고
      // [] 반환 시 members.filter(...) 는 동작한다 — 멤버 0명이므로 0개 분류
      mockDiscordAdapter.fetchGuildMembers.mockResolvedValue([]);

      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/classify`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ classifiedCount: 0 });
    });
  });

  // =========================================================================
  // 3. PUT /config — upsert 저장 일관성 (cross-check)
  // =========================================================================
  describe('PUT /inactive-members/config — upsert 저장 일관성', () => {
    it('PUT config 후 GET config 에서 저장값이 반영된다', async () => {
      const token = makeJwt(jwtService);

      const putRes = await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          periodDays: 7,
          lowActiveThresholdMin: 60,
          decliningPercent: 30,
          autoActionEnabled: true,
          autoDm: true,
          inactiveRoleId: 'role-inactive-001',
        })
        .expect(200);

      expect(putRes.body).toMatchObject({
        guildId: GUILD_ID,
        periodDays: 7,
        lowActiveThresholdMin: 60,
        decliningPercent: 30,
        autoActionEnabled: true,
        autoDm: true,
        inactiveRoleId: 'role-inactive-001',
      });

      // cross-check: GET 로 재조회하여 DB 영속 확인
      const getRes = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body).toMatchObject({
        guildId: GUILD_ID,
        periodDays: 7,
        lowActiveThresholdMin: 60,
        decliningPercent: 30,
        autoActionEnabled: true,
        autoDm: true,
        inactiveRoleId: 'role-inactive-001',
      });
    });

    it('PUT config DTO 에서 일부 필드만 전송해도 나머지는 기존값 유지된다', async () => {
      const token = makeJwt(jwtService);

      // 1차: 전체 설정
      await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ periodDays: 15, decliningPercent: 40 })
        .expect(200);

      // 2차: periodDays 만 변경
      const res = await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/inactive-members/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({ periodDays: 30 })
        .expect(200);

      // decliningPercent 는 2차 PUT 에서 전송하지 않았으므로 40 유지
      expect(res.body).toMatchObject({
        periodDays: 30,
        decliningPercent: 40,
      });
    });
  });

  // =========================================================================
  // 4. POST /actions — DTO 검증 (ValidationPipe)
  // =========================================================================
  describe('POST /inactive-members/actions — DTO 검증', () => {
    it('actionType 누락 시 400을 반환한다', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetUserIds: ['user-001'] })
        .expect(400);
    });

    it('actionType 이 허용값이 아니면 400을 반환한다', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'INVALID_ACTION', targetUserIds: ['user-001'] })
        .expect(400);
    });

    it('targetUserIds 누락 시 400을 반환한다', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_KICK' })
        .expect(400);
    });

    it('targetUserIds 가 빈 배열이면 400을 반환한다 (@ArrayMinSize(1))', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_KICK', targetUserIds: [] })
        .expect(400);
    });

    it('targetUserIds 가 문자열 배열이 아니면 400을 반환한다 (@IsString each)', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_KICK', targetUserIds: [123, 456] })
        .expect(400);
    });
  });

  // =========================================================================
  // 5. POST /actions — 성공 경로 (Discord adapter mock 활용)
  // =========================================================================
  describe('POST /inactive-members/actions — 성공 경로', () => {
    it('ACTION_KICK — mock 어댑터가 true 반환하면 successCount:1, failCount:0 을 반환하고 action log 를 DB 에 저장한다', async () => {
      const token = makeJwt(jwtService);

      // fetchGuild mock: executeAction 에서 guildName 이 필요
      mockDiscordAdapter.fetchGuild.mockResolvedValue({ id: GUILD_ID, name: 'E2E Test Guild' });
      // kickMember mock: 성공
      mockDiscordAdapter.kickMember.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_KICK', targetUserIds: ['target-user-001'] })
        .expect(200);

      expect(res.body).toMatchObject({
        actionType: 'ACTION_KICK',
        successCount: 1,
        failCount: 0,
      });
      expect(res.body.logId).toBeTypeOf('number');

      // DB 에 action log 가 저장됐는지 action-logs 엔드포인트로 확인
      const logsRes = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/inactive-members/action-logs`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(logsRes.body.total).toBe(1);
      expect(logsRes.body.items[0]).toMatchObject({
        guildId: GUILD_ID,
        actionType: 'ACTION_KICK',
        successCount: 1,
        failCount: 0,
      });
    });

    it('ACTION_KICK — mock 어댑터가 false 반환하면 failCount:1, successCount:0 을 반환한다', async () => {
      const token = makeJwt(jwtService);

      mockDiscordAdapter.fetchGuild.mockResolvedValue({ id: GUILD_ID, name: 'E2E Test Guild' });
      mockDiscordAdapter.kickMember.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_KICK', targetUserIds: ['target-user-001'] })
        .expect(200);

      expect(res.body).toMatchObject({
        actionType: 'ACTION_KICK',
        successCount: 0,
        failCount: 1,
      });
    });

    it('ACTION_KICK — 여러 대상 중 일부 실패 시 부분 성공 집계를 반환한다', async () => {
      const token = makeJwt(jwtService);

      mockDiscordAdapter.fetchGuild.mockResolvedValue({ id: GUILD_ID, name: 'E2E Test Guild' });
      // 첫 번째 true, 두 번째 false
      mockDiscordAdapter.kickMember
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          actionType: 'ACTION_KICK',
          targetUserIds: ['user-a', 'user-b', 'user-c'],
        })
        .expect(200);

      expect(res.body).toMatchObject({
        actionType: 'ACTION_KICK',
        successCount: 2,
        failCount: 1,
      });
    });

    it('ACTION_ROLE_ADD — inactiveRoleId 미설정 시 도메인 예외를 반환한다 (4xx)', async () => {
      const token = makeJwt(jwtService);

      mockDiscordAdapter.fetchGuild.mockResolvedValue({ id: GUILD_ID, name: 'E2E Test Guild' });

      // config 에 inactiveRoleId 미설정 상태(기본 null)에서 ROLE_ADD 시도
      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_ROLE_ADD', targetUserIds: ['user-001'] });

      // DomainException → AllExceptionsFilter 가 4xx 처리
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('fetchGuild 가 null 을 반환하면 4xx 에러를 반환한다 (GUILD_NOT_FOUND)', async () => {
      const token = makeJwt(jwtService);

      // 기본 mock 이 null 반환 — 명시적 설정
      mockDiscordAdapter.fetchGuild.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/inactive-members/actions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ actionType: 'ACTION_KICK', targetUserIds: ['user-001'] });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
