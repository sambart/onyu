/**
 * me-voice E2E 테스트
 *
 * 검증 대상:
 *   GET /api/users/me/voice/guilds  (JwtAuthGuard)
 *   GET /api/users/me/voice/profile?guildId=&days=  (JwtAuthGuard)
 *
 * 핵심 시나리오:
 *   1. 미인증 → 401 (두 엔드포인트)
 *   2. 인증된 일반 멤버(guilds=[], isSuperAdmin=false) → 200/204
 *      (글로벌 GuildMembershipGuard 가 :guildId 경로파라미터 없는 경로를 통과시키므로)
 *   3. 본인 데이터 격리 (보안 핵심):
 *      userA 의 voice_daily 데이터를 userB 토큰으로 조회해도 userA 데이터 노출 없음
 *   4. days 파라미터 검증: 비허용값 → 400, 미지정 → 기본 15 동작
 *   5. 활동 없는 멤버: /guilds → 빈 배열, /profile → 204
 *
 * 인프라:
 *   - testcontainers(PG15 + Redis7) — e2e-setup.ts 에서 기동
 *   - GuildMembershipGuard 를 APP_GUARD 로 전역 등록 (AppModule 패턴 동일 재현)
 *   - DiscordRestService: onModuleInit Discord API 호출 차단 + fetchGuild mock
 *   - VoiceDailyFlushService: safeFlushAll 을 no-op mock (Redis 세션 없음)
 *   - BadgeQueryService: 실제 DB 연동 (voice_health_badge 테이블 사용)
 *   - VoiceExcludedChannelService: 실제 DB + Redis 사용
 */

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import request from 'supertest';
import type { DataSource, Repository } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/auth/application/auth.service';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
import { MeVoiceController } from '../src/channel/voice/presentation/me-voice.controller';
import { MeProfileService } from '../src/channel/voice/application/me-profile.service';
import { VoiceDailyFlushService } from '../src/channel/voice/application/voice-daily-flush-service';
import { VoiceExcludedChannelService } from '../src/channel/voice/application/voice-excluded-channel.service';
import { VoiceDailyOrm } from '../src/channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceDailyRepository } from '../src/channel/voice/infrastructure/voice-daily.repository';
import { VoiceExcludedChannelOrm } from '../src/channel/voice/infrastructure/voice-excluded-channel.orm-entity';
import { VoiceExcludedChannelRepository } from '../src/channel/voice/infrastructure/voice-excluded-channel.repository';
import { VoiceRedisRepository } from '../src/channel/voice/infrastructure/voice-redis.repository';
import { BadgeQueryService } from '../src/voice-analytics/self-diagnosis/application/badge-query.service';
import { VoiceHealthBadgeOrmEntity } from '../src/voice-analytics/self-diagnosis/infrastructure/voice-health-badge.orm-entity';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { GuildMembershipGuard } from '../src/common/guards/guild-membership.guard';
import { DiscordRestService } from '../src/discord-rest/discord-rest.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';
import { cleanDatabase } from '../src/test-utils/db-cleaner';
import { cleanRedis } from '../src/test-utils/redis-cleaner';

// ────────────────────────────────────────────────────────────────────────────────
// Mock: DiscordRestService — onModuleInit Discord API 호출 차단 + fetchGuild mock
// ────────────────────────────────────────────────────────────────────────────────
const mockDiscordRestService = {
  onModuleInit: vi.fn().mockResolvedValue(undefined),
  fetchGuild: vi.fn().mockResolvedValue(null),
  fetchGuildChannels: vi.fn().mockResolvedValue([]),
  fetchChannel: vi.fn().mockResolvedValue(null),
  sendMessage: vi.fn().mockResolvedValue({ id: 'mock-msg-id' }),
  editMessage: vi.fn().mockResolvedValue(null),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
  fetchMember: vi.fn().mockResolvedValue(null),
};

// ────────────────────────────────────────────────────────────────────────────────
// Mock: VoiceDailyFlushService — safeFlushAll no-op (Redis 세션 없음)
// ────────────────────────────────────────────────────────────────────────────────
const mockFlushService = {
  safeFlushAll: vi.fn().mockResolvedValue({ flushed: 0, skipped: 0 }),
  flushTodayAll: vi.fn().mockResolvedValue(undefined),
  flushDate: vi.fn().mockResolvedValue(undefined),
};

// ────────────────────────────────────────────────────────────────────────────────
// JWT 발급 헬퍼
// ────────────────────────────────────────────────────────────────────────────────

/** 일반 멤버 JWT (isSuperAdmin=false, guilds=[]) */
function makeUserJwt(jwtService: JwtService, userId: string): string {
  return jwtService.sign({
    sub: userId,
    username: `user-${userId}`,
    avatar: null,
    guilds: [],
    isSuperAdmin: false,
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// 시드 헬퍼 — voice_daily 행 직접 INSERT
// ────────────────────────────────────────────────────────────────────────────────

interface SeedVoiceDailyParams {
  dataSource: DataSource;
  guildId: string;
  userId: string;
  date: string; // YYYYMMDD
  channelId: string;
  channelDurationSec: number;
  micOnSec?: number;
  micOffSec?: number;
  aloneSec?: number;
}

async function seedVoiceDaily(params: SeedVoiceDailyParams): Promise<void> {
  const {
    dataSource,
    guildId,
    userId,
    date,
    channelId,
    channelDurationSec,
    micOnSec = 0,
    micOffSec = 0,
    aloneSec = 0,
  } = params;

  // 채널별 duration 행 (channelId != 'GLOBAL')
  await dataSource.query(
    `
    INSERT INTO voice_daily
      ("guildId","userId","userName","date","channelId","channelName","channelDurationSec","micOnSec","micOffSec","aloneSec","recordedAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    ON CONFLICT ("guildId","userId","date","channelId")
    DO UPDATE SET "channelDurationSec" = EXCLUDED."channelDurationSec"
    `,
    [
      guildId,
      userId,
      `user-${userId}`,
      date,
      channelId,
      `channel-${channelId}`,
      channelDurationSec,
      micOnSec,
      micOffSec,
      aloneSec,
    ],
  );

  // GLOBAL 행 (micOnSec/micOffSec/aloneSec 집계용)
  if (micOnSec > 0 || micOffSec > 0 || aloneSec > 0) {
    await dataSource.query(
      `
      INSERT INTO voice_daily
        ("guildId","userId","userName","date","channelId","channelName","channelDurationSec","micOnSec","micOffSec","aloneSec","recordedAt")
      VALUES ($1,$2,$3,$4,'GLOBAL','GLOBAL',0,$5,$6,$7,NOW())
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
        "micOnSec"  = EXCLUDED."micOnSec",
        "micOffSec" = EXCLUDED."micOffSec",
        "aloneSec"  = EXCLUDED."aloneSec"
      `,
      [guildId, userId, `user-${userId}`, date, micOnSec, micOffSec, aloneSec],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// 오늘 날짜 YYYYMMDD 포맷
// ────────────────────────────────────────────────────────────────────────────────
function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ────────────────────────────────────────────────────────────────────────────────
// E2E 앱 셋업
// ────────────────────────────────────────────────────────────────────────────────

describe('MeVoice E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let redisClient: Redis;

  const GUILD_G = 'guild-me-voice-e2e-001';
  const USER_A = 'user-a-me-voice-e2e';
  const USER_B = 'user-b-me-voice-e2e';

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
          VoiceDailyOrm,
          VoiceExcludedChannelOrm,
          VoiceHealthBadgeOrmEntity,
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
      controllers: [MeVoiceController],
      providers: [
        // Auth
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        // Voice me-profile 서비스
        MeProfileService,
        {
          provide: VoiceDailyFlushService,
          useValue: mockFlushService,
        },
        BadgeQueryService,
        VoiceExcludedChannelService,
        VoiceExcludedChannelRepository,
        VoiceDailyRepository,
        VoiceRedisRepository,
        RedisService,
        // DiscordRestService mock (fetchGuild 차단)
        {
          provide: DiscordRestService,
          useValue: mockDiscordRestService,
        },
        // APP_GUARD: GuildMembershipGuard 전역 적용 (AppModule 패턴 동일 재현)
        { provide: APP_GUARD, useClass: GuildMembershipGuard },
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
  });

  afterAll(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 1: 미인증 → 401
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 1 — 미인증 → 401', () => {
    it('[P0] GET /api/users/me/voice/guilds — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me/voice/guilds')
        .expect(401);
    });

    it('[P0] GET /api/users/me/voice/profile — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G })
        .expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 2: 인증된 일반 멤버(guilds=[], isSuperAdmin=false) 접근 가능
  // GuildMembershipGuard 는 :guildId 경로파라미터 없는 경로를 통과시킨다
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 2 — 일반 멤버(운영 권한 없음) 접근 가능', () => {
    it('[P0] GET /api/users/me/voice/guilds — guilds=[], isSuperAdmin=false 인 일반 멤버 → 200 + 배열 응답', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/guilds')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('[P0] GET /api/users/me/voice/profile?guildId=G — 활동 없는 일반 멤버 → 204', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G })
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 3: 본인 데이터만 (보안 핵심)
  // userA 데이터 시드 → userA 토큰으로 조회 → 포함
  // userB 토큰으로 동일 guildId 조회 → userA 데이터 노출 없음
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 3 — 본인 데이터 격리 (보안 핵심)', () => {
    const TODAY = todayYYYYMMDD();
    const CHANNEL_X = 'channel-voice-x';

    beforeAll(async () => {
      // userA 의 voice_daily 시드 (GUILD_G + CHANNEL_X, 오늘)
      // setupFiles 로 e2e-setup.ts 가 먼저 beforeAll 에서 컨테이너+마이그레이션을 실행하고,
      // describe 레벨 beforeAll 은 가장 외부 afterEach 이전에 실행되므로
      // 첫 번째 it 실행 전까지 시드가 살아 있음을 보장한다.
      // (afterEach 는 각 it 후에 실행되므로 beforeAll 시드는 최초 it 이전에만 유효)
      // 따라서 시드는 각 it 내부에서 삽입하거나, 아니면 beforeEach 에서 삽입해야 한다.
      // 여기서는 it 수준에서 시드 삽입하는 방식을 택함.
      void TODAY; // suppress unused warning
      void CHANNEL_X;
    });

    it('[P0] userA 토큰 → /guilds 에 GUILD_G 포함', async () => {
      // userA 시드 삽입
      await seedVoiceDaily({
        dataSource,
        guildId: GUILD_G,
        userId: USER_A,
        date: TODAY,
        channelId: CHANNEL_X,
        channelDurationSec: 3600,
        micOnSec: 1800,
        micOffSec: 1800,
      });

      // fetchGuild mock 이 null 반환 → guildName=null, guildIcon=null 으로 응답
      const tokenA = makeUserJwt(jwtService, USER_A);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/guilds')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const guildIds = (res.body as Array<{ guildId: string }>).map((g) => g.guildId);
      expect(guildIds).toContain(GUILD_G);
    });

    it('[P0] userB 토큰 → /guilds 에 GUILD_G 미포함 (userA 데이터 노출 없음)', async () => {
      // userA 시드 삽입 (userB 는 데이터 없음)
      await seedVoiceDaily({
        dataSource,
        guildId: GUILD_G,
        userId: USER_A,
        date: TODAY,
        channelId: CHANNEL_X,
        channelDurationSec: 3600,
      });

      const tokenB = makeUserJwt(jwtService, USER_B);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/guilds')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // userB 는 voice_daily 에 데이터 없으므로 빈 배열
      expect(res.body).toHaveLength(0);
    });

    it('[P0] userA 데이터 있는 guildId 를 userB 토큰으로 /profile 조회 → 204 (userA 데이터 노출 없음)', async () => {
      // userA 시드 삽입
      await seedVoiceDaily({
        dataSource,
        guildId: GUILD_G,
        userId: USER_A,
        date: TODAY,
        channelId: CHANNEL_X,
        channelDurationSec: 3600,
        micOnSec: 1800,
        micOffSec: 1800,
      });

      const tokenB = makeUserJwt(jwtService, USER_B);

      // userB 는 GUILD_G 에 데이터 없음 → 204
      await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G, days: '15' })
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(204);
    });

    it('[P0] userA 토큰으로 /profile 조회 → 200 + userA 본인 통계만 포함', async () => {
      // userA 시드 삽입
      await seedVoiceDaily({
        dataSource,
        guildId: GUILD_G,
        userId: USER_A,
        date: TODAY,
        channelId: CHANNEL_X,
        channelDurationSec: 3600,
        micOnSec: 1800,
        micOffSec: 1800,
      });

      const tokenA = makeUserJwt(jwtService, USER_A);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G, days: '15' })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // 응답 구조 검증 (MeProfileData)
      expect(typeof res.body.totalSec).toBe('number');
      expect(res.body.totalSec).toBeGreaterThan(0);
      expect(typeof res.body.rank).toBe('number');
      expect(typeof res.body.totalUsers).toBe('number');
      expect(typeof res.body.activeDays).toBe('number');
      expect(Array.isArray(res.body.dailyChart)).toBe(true);
      expect(Array.isArray(res.body.badges)).toBe(true);
      expect(Array.isArray(res.body.excludedChannels)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 4: days 파라미터 검증
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 4 — days 파라미터 검증', () => {
    it('[P0] days=10 (비허용값) → 400', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G, days: '10' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(res.body.message).toMatch(/days/);
    });

    it('[P1] days 미지정 → 기본 15 동작 (204 또는 200)', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      // 데이터 없으므로 204 반환 — 기본 days=15 파라미터로 처리됨 (400 아님)
      await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G })
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('[P1] days=7 → 400 아님 (허용값)', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      // 데이터 없으므로 204, 400이 아닌 점이 핵심
      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G, days: '7' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).not.toBe(400);
    });

    it('[P1] days=30 → 400 아님 (허용값)', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G, days: '30' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).not.toBe(400);
    });

    it('[P1] guildId 미지정 → 400', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 5: 활동 없는 멤버
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 5 — 활동 없는 멤버', () => {
    it('[P0] GET /api/users/me/voice/guilds — voice_daily 데이터 없음 → 빈 배열', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      const res = await request(app.getHttpServer())
        .get('/api/users/me/voice/guilds')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('[P0] GET /api/users/me/voice/profile — 활동 없음 → 204', async () => {
      const token = makeUserJwt(jwtService, USER_A);

      await request(app.getHttpServer())
        .get('/api/users/me/voice/profile')
        .query({ guildId: GUILD_G, days: '15' })
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });
});
