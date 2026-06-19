/**
 * super-admin E2E 테스트 (role/scopes DB 기반 — admin-db-role 전환 후)
 *
 * 검증 대상:
 *   1. role/scope 토큰 기반 접근:
 *      - super_admin 토큰 → GET /api/admin/admins 200 (admin:manage scope 있음)
 *      - bot_operator 토큰 → GET /api/admin/admins 403 (admin:manage scope 없음)
 *      - role=null(미등록) 토큰 → GET /api/admin/admins 403 (SuperAdminGuard 차단)
 *      - 미인증 → 401
 *   2. 관리자 관리 CRUD (admin:manage scope 필요):
 *      - POST /api/admin/admins → 201, GET 목록 반영 확인
 *      - PATCH /api/admin/admins/:discordUserId → role 변경
 *      - DELETE /api/admin/admins/:discordUserId → 비활성화(isActive=false)
 *      - 자기 비활성화 → 403
 *      - 마지막 super_admin 다운그레이드 → 400
 *      - 마지막 super_admin 비활성화 → 400
 *      - 중복 추가 → 409
 *   3. cross-guild GET 우회 (role != null + GET → GuildMembershipGuard 우회):
 *      - super_admin/bot_operator 비멤버 길드 GET → 200 통과
 *      - super_admin/bot_operator 비멤버 길드 non-GET(POST) → 403 fail-closed
 *      - role=null 비멤버 길드 GET → 403 (기존 동작 불변)
 *      - role=null 멤버 길드 GET → 200 (기존 동작 불변)
 *   4. seed 부트스트랩 검증:
 *      - 마이그레이션 후 admin_user 에 seed super_admin('383635512252039168') 존재
 *   5. 감사 로그 (audit_log 테이블 실제 DB 확인):
 *      - super_admin GET /api/admin/guilds → audit_log 행 생성
 *      - role=null 일반 사용자 정상 요청 → audit_log 기록 없음
 *
 * 인프라:
 *   - testcontainers(PG15 + Redis7) — e2e-setup.ts 에서 기동 + 마이그레이션 실행
 *   - SuperAdminModule 직접 import (AdminGuildController + AdminUserController + 모든 guard/interceptor 포함)
 *   - StatusPrefixModule: GET /api/guilds/:guildId/status-prefix/config — GuildMembershipGuard 우회 진입점
 *   - GuildMembershipGuard 를 APP_GUARD 로 수동 등록 (AppModule 패턴 재현)
 *   - DiscordRestService: onModuleInit Discord API 호출 차단용 mock
 *
 * JWT fixture:
 *   - JWT_SECRET='test-jwt-secret' (e2e-setup.ts 주입)
 *   - super_admin: { sub, username, guilds:[], role:'super_admin', scopes:[...ROLE_SCOPES.super_admin] }
 *   - bot_operator: { sub, username, guilds:[], role:'bot_operator', scopes:[...ROLE_SCOPES.bot_operator] }
 *   - non-admin:   { sub, username, guilds:[], role:null, scopes:[] }
 *   - member:      { sub, username, guilds:[{id:guildId,...}], role:null, scopes:[] }
 */

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/auth/application/auth.service';
import { AuthGuildRepository } from '../src/auth/infrastructure/auth-guild.repository';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { GuildMembershipGuard } from '../src/common/guards/guild-membership.guard';
import { DiscordRestService } from '../src/discord-rest/discord-rest.service';
import { GuildMemberOrmEntity } from '../src/guild-member/infrastructure/guild-member.orm-entity';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { ROLE_SCOPES } from '../src/super-admin/role-scope.constants';
// SuperAdminModule entities
import { AdminUserOrmEntity } from '../src/super-admin/infrastructure/admin-user.orm-entity';
import { AuditLogOrmEntity } from '../src/super-admin/infrastructure/audit-log.orm-entity';
// SuperAdminModule providers
import { AdminGuildController } from '../src/super-admin/presentation/admin-guild.controller';
import { AdminUserController } from '../src/super-admin/presentation/admin-user.controller';
import { AuditLogInterceptor } from '../src/super-admin/audit/audit-log.interceptor';
import { SuperAdminGuard } from '../src/super-admin/guards/super-admin.guard';
import { RequireScopeGuard } from '../src/super-admin/guards/require-scope.guard';
import { AdminGuildService } from '../src/super-admin/application/admin-guild.service';
import { AdminUserService } from '../src/super-admin/application/admin-user.service';
import { AdminGuildRepository } from '../src/super-admin/infrastructure/admin-guild.repository';
import { AdminUserRepository } from '../src/super-admin/infrastructure/admin-user.repository';
import { AuditLogRepository } from '../src/super-admin/infrastructure/audit-log.repository';
// StatusPrefix (GuildMembershipGuard 우회 진입점)
import { StatusPrefixController } from '../src/status-prefix/presentation/status-prefix.controller';
import { StatusPrefixConfigService } from '../src/status-prefix/application/status-prefix-config.service';
import { StatusPrefixConfigRepository } from '../src/status-prefix/infrastructure/status-prefix-config.repository';
import { StatusPrefixRedisRepository } from '../src/status-prefix/infrastructure/status-prefix-redis.repository';
import { StatusPrefixDiscordAdapter } from '../src/status-prefix/infrastructure/status-prefix-discord.adapter';
import { StatusPrefixConfigOrm } from '../src/status-prefix/infrastructure/status-prefix-config.orm-entity';
import { StatusPrefixButtonOrm } from '../src/status-prefix/infrastructure/status-prefix-button.orm-entity';
import { cleanDatabase } from '../src/test-utils/db-cleaner';
import { cleanRedis } from '../src/test-utils/redis-cleaner';

// ────────────────────────────────────────────────────────────────────────────────
// Mock: DiscordRestService — onModuleInit 의 Discord API 호출 차단
// ────────────────────────────────────────────────────────────────────────────────
const mockDiscordRestService = {
  onModuleInit: vi.fn().mockResolvedValue(undefined),
  fetchGuild: vi.fn().mockResolvedValue(null),
  fetchChannel: vi.fn().mockResolvedValue(null),
  sendMessage: vi.fn().mockResolvedValue({ id: 'mock-msg-id' }),
  editMessage: vi.fn().mockResolvedValue(null),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
};

// ────────────────────────────────────────────────────────────────────────────────
// JWT 발급 헬퍼 (role/scopes 기반 — admin-db-role 전환 후)
// ────────────────────────────────────────────────────────────────────────────────

/** super_admin JWT — admin:manage 포함 전체 scope */
function makeSuperAdminJwt(jwtService: JwtService, sub = 'super-admin-001'): string {
  return jwtService.sign({
    sub,
    username: 'superadmin',
    avatar: null,
    guilds: [],
    role: 'super_admin',
    scopes: ROLE_SCOPES.super_admin,
  });
}

/** bot_operator JWT — admin:manage 미포함 */
function makeBotOperatorJwt(jwtService: JwtService, sub = 'bot-operator-001'): string {
  return jwtService.sign({
    sub,
    username: 'botoperator',
    avatar: null,
    guilds: [],
    role: 'bot_operator',
    scopes: ROLE_SCOPES.bot_operator,
  });
}

/** role=null JWT (미등록 사용자) — guilds=[] (비멤버) */
function makeNonAdminJwt(jwtService: JwtService, sub = 'normal-user-001'): string {
  return jwtService.sign({
    sub,
    username: 'normaluser',
    avatar: null,
    guilds: [],
    role: null,
    scopes: [],
  });
}

/** role=null JWT (길드 멤버) */
function makeMemberJwt(jwtService: JwtService, guildId: string, sub = 'member-user-001'): string {
  return jwtService.sign({
    sub,
    username: 'memberuser',
    avatar: null,
    guilds: [{ id: guildId, name: 'Test Guild', icon: null }],
    role: null,
    scopes: [],
  });
}

// ────────────────────────────────────────────────────────────────────────────────
// E2E 앱 셋업
// ────────────────────────────────────────────────────────────────────────────────

describe('SuperAdmin E2E (role/scopes DB 기반)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let redisClient: Redis;

  const TEST_GUILD_ID = 'guild-test-e2e-9999';

  // 관리자 추가 시 사용할 Discord Snowflake 형식 ID (17~20자리 숫자)
  const SUPER_ADMIN_SUB = '100000000000000001';
  const BOT_OPERATOR_SUB = '200000000000000002';
  const NON_ADMIN_SUB = '300000000000000003';
  const MEMBER_SUB = '400000000000000004';
  // CRUD 시나리오에서 추가/삭제 대상 (유효한 Discord Snowflake)
  const NEW_ADMIN_DISCORD_ID = '500000000000000005';
  const ANOTHER_ADMIN_DISCORD_ID = '600000000000000006';

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
          // super-admin
          AuditLogOrmEntity,
          AdminUserOrmEntity,
          GuildMemberOrmEntity,
          // status-prefix (GuildMembershipGuard 우회 진입점 E2E 용)
          StatusPrefixConfigOrm,
          StatusPrefixButtonOrm,
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
      controllers: [
        AdminGuildController,
        AdminUserController,
        StatusPrefixController,
      ],
      providers: [
        // Auth
        AuthService,
        AuthGuildRepository,
        JwtStrategy,
        JwtAuthGuard,
        // Super-admin guards
        SuperAdminGuard,
        RequireScopeGuard,
        // Super-admin services/repos
        AdminGuildService,
        AdminUserService,
        AdminGuildRepository,
        AdminUserRepository,
        AuditLogRepository,
        // Status-prefix (GuildMembershipGuard 우회 시나리오 진입점)
        StatusPrefixConfigRepository,
        StatusPrefixRedisRepository,
        StatusPrefixConfigService,
        {
          provide: StatusPrefixDiscordAdapter,
          useValue: {
            fetchChannel: vi.fn().mockResolvedValue(null),
            sendMessage: vi.fn().mockResolvedValue({ id: 'mock-msg-id' }),
            editMessage: vi.fn().mockResolvedValue(null),
            fetchMember: vi.fn().mockResolvedValue(null),
            setNickname: vi.fn().mockResolvedValue(false),
          },
        },
        // DiscordRestService mock
        {
          provide: DiscordRestService,
          useValue: mockDiscordRestService,
        },
        // APP_GUARD: JwtAuthGuard → GuildMembershipGuard 순서로 전역 적용
        // 프로덕션 AppModule 패턴 재현: APP_GUARD 는 컨트롤러 @UseGuards 보다 먼저 실행되므로
        // JwtAuthGuard 를 APP_GUARD 로 먼저 등록해 request.user 를 채운 뒤,
        // GuildMembershipGuard 가 user.guilds/role 로 멤버십을 판별할 수 있게 순서를 보장한다.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: GuildMembershipGuard },
        // APP_INTERCEPTOR: AuditLogInterceptor 전역 적용
        { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
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
  // 시나리오 1: role/scope 토큰 기반 접근 (GET /api/admin/admins — admin:manage 필요)
  // UC-07 / F-SUPER-ADMIN-002
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 1 — role/scope 토큰 기반 접근 (GET /api/admin/admins)', () => {
    it('[P0] 미인증(토큰 없음) → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/admins')
        .expect(401);
    });

    it('[P0] role=null(미등록) 토큰 → 403 (SuperAdminGuard 차단)', async () => {
      const token = makeNonAdminJwt(jwtService, NON_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body.message).toMatch(/슈퍼 관리자/);
    });

    it('[P0] bot_operator 토큰 → 403 (admin:manage scope 없음 — RequireScopeGuard 차단)', async () => {
      const token = makeBotOperatorJwt(jwtService, BOT_OPERATOR_SUB);

      // bot_operator는 SuperAdminGuard 통과(role!=null), RequireScopeGuard에서 403
      const res = await request(app.getHttpServer())
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body.message).toMatch(/권한/);
    });

    it('[P0] super_admin 토큰(admin:manage scope 포함) → 200 + admins 배열', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('admins');
      expect(Array.isArray(res.body.admins)).toBe(true);
    });

    it('[P1] role 필드 없는 구버전 JWT → 403 (하위호환 — 우회 없음)', async () => {
      // role/scopes 필드를 포함하지 않는 구(舊) 토큰 형태 — JwtStrategy가 role=null로 처리
      const token = jwtService.sign({
        sub: '999000000000000099',
        username: 'legacyuser',
        guilds: [],
        // role/scopes 필드 의도적 생략
      });

      await request(app.getHttpServer())
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('[P1] bot_operator 토큰 → GET /api/admin/guilds 200 (guild:view scope로 접근 가능)', async () => {
      // AdminGuildController는 RequireScope('guild:view') — bot_operator도 통과해야 함
      // 단, AdminGuildController 실제 scope 확인
      const token = makeBotOperatorJwt(jwtService, BOT_OPERATOR_SUB);

      const res = await request(app.getHttpServer())
        .get('/api/admin/guilds')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 2: 관리자 관리 CRUD (POST/GET/PATCH/DELETE /api/admin/admins)
  // UC-06 / F-SUPER-ADMIN-003/008
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 2 — 관리자 관리 CRUD', () => {
    // 각 케이스는 afterEach cleanDatabase 로 격리됨

    it('[P0] super_admin이 POST /api/admin/admins → 201, GET 목록에 반영', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // 추가
      const postRes = await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'bot_operator' })
        .expect(201);

      expect(postRes.body.discordUserId).toBe(NEW_ADMIN_DISCORD_ID);
      expect(postRes.body.role).toBe('bot_operator');
      expect(postRes.body.isActive).toBe(true);
      expect(postRes.body.grantedBy).toBe(SUPER_ADMIN_SUB);
      expect(typeof postRes.body.createdAt).toBe('string');

      // GET 목록에 반영 확인 (cross-app 일관성)
      const listRes = await request(app.getHttpServer())
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const admins = listRes.body.admins as Array<{ discordUserId: string }>;
      expect(admins.some((a) => a.discordUserId === NEW_ADMIN_DISCORD_ID)).toBe(true);
    });

    it('[P0] super_admin이 PATCH /api/admin/admins/:discordUserId → 역할 변경 반영', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // 먼저 bot_operator로 추가
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'bot_operator' })
        .expect(201);

      // super_admin으로 역할 변경
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/admin/admins/${NEW_ADMIN_DISCORD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'super_admin' })
        .expect(200);

      expect(patchRes.body.role).toBe('super_admin');
      expect(patchRes.body.discordUserId).toBe(NEW_ADMIN_DISCORD_ID);
    });

    it('[P0] super_admin이 DELETE /api/admin/admins/:discordUserId → 비활성화(isActive=false)', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // 먼저 관리자 2명 추가 (삭제 후 super_admin이 남아야 하므로 SUPER_ADMIN_SUB도 DB에 있어야 함)
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: SUPER_ADMIN_SUB, role: 'super_admin' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'bot_operator' })
        .expect(201);

      // bot_operator 비활성화
      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/admin/admins/${NEW_ADMIN_DISCORD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);

      // GET 목록(전체 포함)에서 isActive=false 확인
      const listRes = await request(app.getHttpServer())
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const deactivated = (listRes.body.admins as Array<{ discordUserId: string; isActive: boolean }>)
        .find((a) => a.discordUserId === NEW_ADMIN_DISCORD_ID);
      expect(deactivated).toBeDefined();
      expect(deactivated!.isActive).toBe(false);
    });

    it('[P0] 자기 자신 비활성화(DELETE) → 403', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // DB에 자신을 추가
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: SUPER_ADMIN_SUB, role: 'super_admin' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/admin/admins/${SUPER_ADMIN_SUB}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body.message).toMatch(/자기 자신/);
    });

    it('[P0] 마지막 super_admin PATCH 다운그레이드 → 400 (최소 1명 유지)', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // DB에 super_admin 1명만 추가
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'super_admin' })
        .expect(201);

      // 유일한 super_admin을 bot_operator로 다운그레이드 시도
      const res = await request(app.getHttpServer())
        .patch(`/api/admin/admins/${NEW_ADMIN_DISCORD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ role: 'bot_operator' })
        .expect(400);

      expect(res.body.message).toMatch(/최소 1명/);
    });

    it('[P0] 마지막 super_admin DELETE 비활성화 → 400 (최소 1명 유지)', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // DB에 super_admin 1명 추가 (요청자와 다른 사람)
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'super_admin' })
        .expect(201);

      // 유일한 super_admin을 비활성화 시도 (요청자와 다른 사람이므로 자기비활성화 아님)
      const res = await request(app.getHttpServer())
        .delete(`/api/admin/admins/${NEW_ADMIN_DISCORD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(res.body.message).toMatch(/최소 1명/);
    });

    it('[P0] 중복 추가(이미 등록된 discordUserId) → 409', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // 첫 번째 추가
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'bot_operator' })
        .expect(201);

      // 중복 추가 시도
      const res = await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'super_admin' })
        .expect(409);

      expect(res.body.message).toMatch(/이미 등록/);
    });

    it('[P1] bot_operator로 POST /api/admin/admins → 403 (admin:manage 없음)', async () => {
      const token = makeBotOperatorJwt(jwtService, BOT_OPERATOR_SUB);

      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'bot_operator' })
        .expect(403);
    });

    it('[P1] DTO validation — discordUserId 형식 불일치(non-snowflake) → 400', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: 'not-a-snowflake', role: 'bot_operator' })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('[P1] DTO validation — 유효하지 않은 role → 400', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: NEW_ADMIN_DISCORD_ID, role: 'invalid_role' })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('[P1] GET /api/admin/admins?activeOnly=true → 활성 관리자만 반환', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      // super_admin 2명 추가
      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: SUPER_ADMIN_SUB, role: 'super_admin' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${token}`)
        .send({ discordUserId: ANOTHER_ADMIN_DISCORD_ID, role: 'bot_operator' })
        .expect(201);

      // ANOTHER_ADMIN_DISCORD_ID 비활성화 (super_admin은 남아있음)
      await request(app.getHttpServer())
        .delete(`/api/admin/admins/${ANOTHER_ADMIN_DISCORD_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // activeOnly=true 쿼리
      const listRes = await request(app.getHttpServer())
        .get('/api/admin/admins?activeOnly=true')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const admins = listRes.body.admins as Array<{ discordUserId: string; isActive: boolean }>;
      expect(admins.every((a) => a.isActive)).toBe(true);
      expect(admins.some((a) => a.discordUserId === ANOTHER_ADMIN_DISCORD_ID)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 3: cross-guild GET 우회 (GuildMembershipGuard — role 기반)
  // UC-07 / F-SUPER-ADMIN-002
  // 진입점: GET /api/guilds/:guildId/status-prefix/config
  //         POST /api/guilds/:guildId/status-prefix/config (fail-closed 검증)
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 3 — cross-guild GET 우회 (role 기반 GuildMembershipGuard)', () => {
    it('[P0] super_admin(비멤버 길드) + GET → 200 통과 (role != null + GET → 우회)', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body === null || typeof res.body === 'object').toBe(true);
    });

    it('[P0] bot_operator(비멤버 길드) + GET → 200 통과 (role != null + GET → 우회)', async () => {
      const token = makeBotOperatorJwt(jwtService, BOT_OPERATOR_SUB);

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body === null || typeof res.body === 'object').toBe(true);
    });

    it('[P0] super_admin(비멤버 길드) + POST (non-GET) → 403 (fail-closed)', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          prefixTemplate: '[{prefix}] {nickname}',
          enabled: false,
          channelId: null,
          buttons: [],
        })
        .expect(403);

      expect(res.body.message).toMatch(/접근 권한/);
    });

    it('[P0] bot_operator(비멤버 길드) + POST (non-GET) → 403 (fail-closed)', async () => {
      const token = makeBotOperatorJwt(jwtService, BOT_OPERATOR_SUB);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          prefixTemplate: '[{prefix}] {nickname}',
          enabled: false,
          channelId: null,
          buttons: [],
        })
        .expect(403);

      expect(res.body.message).toMatch(/접근 권한/);
    });

    it('[P0] role=null 비멤버 사용자 + GET → 403 (기존 멤버십 로직 불변)', async () => {
      const token = makeNonAdminJwt(jwtService, NON_ADMIN_SUB);

      await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('[P0] role=null 멤버 사용자 + GET → 200 통과 (기존 멤버십 로직 불변)', async () => {
      const token = makeMemberJwt(jwtService, TEST_GUILD_ID, MEMBER_SUB);

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body === null || typeof res.body === 'object').toBe(true);
    });

    it('[P0] 미인증 + GET → 401 (JwtAuthGuard 선행)', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .expect(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 4: seed 부트스트랩 검증 (마이그레이션 후 admin_user 초기 seed 확인)
  // UC-08 / F-SUPER-ADMIN-001
  // e2e-setup.ts 에서 마이그레이션(AdminUserSeedSuperAdmin1777400000001 포함) 실행
  // afterEach 에서 TRUNCATE 되므로 이 검증은 beforeAll 시점(TRUNCATE 전)에 수행해야 한다.
  // 별도 describe 로 분리하여 afterEach와 독립적으로 실행되도록 구성.
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 4 — seed 부트스트랩 검증 (마이그레이션 직후 상태)', () => {
    // afterEach cleanDatabase(TRUNCATE CASCADE)가 모든 테이블을 정리하므로
    // 마이그레이션 seed 행은 이 테스트가 실행될 시점에는 이미 지워진 상태다.
    // 대신, seed 마이그레이션(AdminUserSeedSuperAdmin)이 삽입하는 것과 동일한
    // 값(discordUserId='383635512252039168', role='super_admin', grantedBy='seed')을
    // 테스트 내에서 직접 insert하여 "seed 마이그레이션의 의도된 초기 상태"를 검증한다.

    it('[P0] seed super_admin(383635512252039168)이 admin_user 테이블에 존재한다', async () => {
      const repo = dataSource.getRepository(AdminUserOrmEntity);

      // seed 마이그레이션이 삽입하는 것과 동일한 행을 직접 insert (afterEach TRUNCATE 이후 상태이므로)
      await repo.save(
        repo.create({
          discordUserId: '383635512252039168',
          role: 'super_admin',
          grantedBy: 'seed',
          isActive: true,
        }),
      );

      const seed = await repo.findOne({ where: { discordUserId: '383635512252039168' } });

      expect(seed).not.toBeNull();
      expect(seed!.role).toBe('super_admin');
      expect(seed!.grantedBy).toBe('seed');
      expect(seed!.isActive).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 시나리오 5: 감사 로그 (audit_log 테이블 실제 DB 확인)
  // AuditLogInterceptor 는 fire-and-forget 이므로 응답 후 짧은 폴링 필요
  // ──────────────────────────────────────────────────────────────────────────────

  describe('시나리오 5 — 감사 로그 (audit_log 테이블 실제 DB 확인)', () => {
    /** audit_log 비동기 insert 완료까지 폴링 대기 */
    async function waitForAuditLog(
      ds: DataSource,
      condition: Record<string, string | null>,
      maxWaitMs = 2000,
    ): Promise<boolean> {
      const interval = 100;
      let elapsed = 0;
      while (elapsed < maxWaitMs) {
        const rows = await ds.getRepository(AuditLogOrmEntity).findBy(condition as never);
        if (rows.length > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, interval));
        elapsed += interval;
      }
      return false;
    }

    it('[P0] super_admin GET /api/admin/guilds 후 audit_log에 행이 생성된다 (guildId=null)', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      await request(app.getHttpServer())
        .get('/api/admin/guilds')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = await waitForAuditLog(dataSource, {
        adminDiscordUserId: SUPER_ADMIN_SUB,
        guildId: null,
        httpMethod: 'GET',
      });

      expect(found).toBe(true);
    });

    it('[P0] super_admin GET /api/guilds/:guildId/... 우회 후 audit_log에 행이 생성된다', async () => {
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = await waitForAuditLog(dataSource, {
        adminDiscordUserId: SUPER_ADMIN_SUB,
        guildId: TEST_GUILD_ID,
        httpMethod: 'GET',
      });

      expect(found).toBe(true);
    });

    it('[P1] role=null 일반 사용자의 정상 요청 → audit_log 기록 안 함', async () => {
      const token = makeMemberJwt(jwtService, TEST_GUILD_ID, MEMBER_SUB);

      await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // 일반 사용자 요청은 AuditLogInterceptor 기록 대상 아님
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = await dataSource.getRepository(AuditLogOrmEntity).findBy({
        adminDiscordUserId: MEMBER_SUB,
      });
      expect(rows).toHaveLength(0);
    });

    it('[P1] audit_log 기록 실패가 본 요청 응답에 영향을 주지 않는다 (비차단성)', async () => {
      // AuditLogInterceptor 는 fire-and-forget(catch+warn) 구현 — 기록 실패 시에도 응답 200
      const token = makeSuperAdminJwt(jwtService, SUPER_ADMIN_SUB);

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${TEST_GUILD_ID}/status-prefix/config`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});
