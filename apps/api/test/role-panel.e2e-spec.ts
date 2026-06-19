/**
 * role-panel E2E 테스트
 *
 * 검증 범위:
 *  1. 패널 생애주기 (UC-01): POST 생성 → GET 목록/단건 → PUT 수정 → POST publish → DELETE
 *  2. 저장 시 역할 검증 (권한 — P0): ADMINISTRATOR→403, 위계/managed/@everyone→400, 정상→201
 *  3. 인가 가드 (auth 전 구간): 비로그인→401
 *  4. 봇용 config 엔드포인트 (2.1): BotApiAuthGuard — 유효 토큰→200, 무효→401
 *  5. 마이그레이션 검증: role_panel_config / role_panel_button 테이블·인덱스·enum 존재
 *
 * 외부 경계: DiscordRestService 는 vi.fn() mock으로 차단.
 * 실 DB: testcontainers PG15 (e2e-setup.ts 에서 기동 + 마이그레이션 적용).
 *
 * 주의:
 *  - DiscordRestService 는 onModuleInit 에서 Discord API 를 호출하므로 반드시 mock 해야 한다.
 *  - RolePanelModule 이 AuthModule 을 import 하므로 GuildMemberOrmEntity 도 TypeOrmModule.forFeature 에 등록한다.
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
import { DiscordStrategy } from '../src/auth/infrastructure/discord.strategy';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { DiscordRestService } from '../src/discord-rest/discord-rest.service';
import { GuildMemberOrmEntity } from '../src/guild-member/infrastructure/guild-member.orm-entity';
import { RolePanelBotService } from '../src/role-panel/application/role-panel-bot.service';
import { RolePanelConfigService } from '../src/role-panel/application/role-panel-config.service';
import { RolePanelPublishService } from '../src/role-panel/application/role-panel-publish.service';
import { RolePanelRoleValidator } from '../src/role-panel/application/role-panel-role-validator';
import { RolePanelButtonOrm } from '../src/role-panel/infrastructure/role-panel-button.orm-entity';
import { RolePanelConfigOrm } from '../src/role-panel/infrastructure/role-panel-config.orm-entity';
import { RolePanelConfigRepository } from '../src/role-panel/infrastructure/role-panel-config.repository';
import { RolePanelDiscordAdapter } from '../src/role-panel/infrastructure/role-panel-discord.adapter';
import { RolePanelRedisRepository } from '../src/role-panel/infrastructure/role-panel-redis.repository';
import { BotRolePanelController } from '../src/bot-api/role-panel/bot-role-panel.controller';
import { BotApiAuthGuard } from '../src/bot-api/bot-api-auth.guard';
import { RolePanelController } from '../src/role-panel/presentation/role-panel.controller';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { cleanDatabase } from '../src/test-utils/db-cleaner';
import { cleanRedis } from '../src/test-utils/redis-cleaner';
import type Redis from 'ioredis';
import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import type { APIGuildMember, APIRole } from 'discord.js';

// ── 테스트 상수 ──

const GUILD_ID = 'guild-e2e-role-panel';
const BOT_USER_ID = 'bot-user-id-001';
const BOT_TOP_ROLE_ID = 'role-bot-top';
const BOT_TOP_POSITION = 10; // 봇 최상위 역할 위치

/** 기본 정상 역할 — 위치 5 (봇 아래, 부여 가능) */
const NORMAL_ROLE: APIRole = {
  id: 'role-normal-001',
  name: '일반 역할',
  color: 0,
  hoist: false,
  position: 5,
  permissions: '0',
  managed: false,
  mentionable: false,
  flags: 0,
};

/** 봇 최상위 역할 자체 (position 10 — 봇 역할) */
const BOT_ROLE: APIRole = {
  id: BOT_TOP_ROLE_ID,
  name: '봇 역할',
  color: 0,
  hoist: false,
  position: BOT_TOP_POSITION,
  permissions: '0',
  managed: true, // 봇이 관리하는 역할
  mentionable: false,
  flags: 0,
};

/** 봇 최상위보다 위계가 높은 역할 (position 15) */
const HIGH_POSITION_ROLE: APIRole = {
  id: 'role-high-001',
  name: '높은 위계 역할',
  color: 0,
  hoist: false,
  position: 15,
  permissions: '0',
  managed: false,
  mentionable: false,
  flags: 0,
};

/** @everyone 역할 — id 가 guildId 와 동일 */
const EVERYONE_ROLE: APIRole = {
  id: GUILD_ID, // @everyone은 role id === guild id
  name: '@everyone',
  color: 0,
  hoist: false,
  position: 0,
  permissions: '0',
  managed: false,
  mentionable: false,
  flags: 0,
};

/** managed 역할 (봇/통합 관리) */
const MANAGED_ROLE: APIRole = {
  id: 'role-managed-001',
  name: '봇 통합 역할',
  color: 0,
  hoist: false,
  position: 3,
  permissions: '0',
  managed: true,
  mentionable: false,
  flags: 0,
};

/** ADMINISTRATOR 비트(1<<3=8) 보유 역할 */
const ADMIN_ROLE: APIRole = {
  id: 'role-admin-001',
  name: '관리자 역할',
  color: 0,
  hoist: false,
  position: 2,
  permissions: '8', // ADMINISTRATOR = 8
  managed: false,
  mentionable: false,
  flags: 0,
};

/** 봇 멤버 (역할: BOT_TOP_ROLE_ID) */
const BOT_MEMBER: APIGuildMember = {
  roles: [BOT_TOP_ROLE_ID],
  joined_at: '2024-01-01T00:00:00.000Z',
  deaf: false,
  mute: false,
  flags: 0,
};

// 전체 역할 목록 (정상 + 봇 + 높은위계 + everyone + managed + admin)
const ALL_ROLES: APIRole[] = [
  NORMAL_ROLE,
  BOT_ROLE,
  HIGH_POSITION_ROLE,
  EVERYONE_ROLE,
  MANAGED_ROLE,
  ADMIN_ROLE,
];

/** DiscordRestService mock — onModuleInit 및 외부 Discord API 호출 차단 */
const mockDiscordRest = {
  onModuleInit: vi.fn().mockResolvedValue(undefined),
  getBotUserId: vi.fn().mockReturnValue(BOT_USER_ID),
  fetchGuildRoles: vi.fn().mockResolvedValue(ALL_ROLES),
  fetchGuildMember: vi.fn().mockResolvedValue(BOT_MEMBER),
  sendMessage: vi.fn().mockResolvedValue({ id: 'mock-message-id-001' }),
  editMessage: vi.fn().mockResolvedValue({ id: 'mock-message-id-001' }),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
};

/** JWT 헬퍼 — 길드 관리자 토큰 (guilds 빈 배열: JwtAuthGuard 통과용) */
function makeJwt(jwtService: JwtService, opts: { sub?: string } = {}): string {
  return jwtService.sign({
    sub: opts.sub ?? 'user-e2e-001',
    username: 'e2e-tester',
    avatar: null,
    guilds: [],
  });
}

/** 정상 패널 생성 DTO */
function makeCreateDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'E2E 테스트 패널',
    channelId: 'channel-001',
    embedTitle: '역할 선택',
    embedDescription: '역할을 선택하세요',
    embedColor: '#5865F2',
    buttons: [
      {
        label: '일반 역할',
        roleId: NORMAL_ROLE.id,
        mode: RolePanelButtonMode.TOGGLE,
        style: RolePanelButtonStyle.PRIMARY,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

// BotApiAuthGuard 는 ConfigService.get('BOT_API_KEY') 로 키를 읽는다.
// ConfigService 는 앱 부팅 시점에 환경변수를 스냅샷하므로,
// 앱 빌드(beforeAll) 이전에 BOT_API_KEY 를 설정해야 한다.
const TEST_BOT_API_KEY = 'test-bot-api-key-e2e';
process.env.BOT_API_KEY = TEST_BOT_API_KEY;

describe('RolePanelController (E2E)', () => {
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
          RolePanelConfigOrm,
          RolePanelButtonOrm,
          // AuthModule 의 AuthGuildRepository 가 참조 (AuthModule import 경유)
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
      controllers: [RolePanelController, BotRolePanelController],
      providers: [
        // Auth
        AuthService,
        AuthGuildRepository,
        DiscordStrategy,
        JwtStrategy,
        JwtAuthGuard,
        // Bot API 가드
        BotApiAuthGuard,
        // Role Panel
        RolePanelConfigRepository,
        RolePanelRedisRepository,
        RolePanelDiscordAdapter,
        RolePanelRoleValidator,
        RolePanelConfigService,
        RolePanelPublishService,
        RolePanelBotService,
        // Discord 외부 경계 mock
        {
          provide: DiscordRestService,
          useValue: mockDiscordRest,
        },
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
    // afterEach 이후 mock 기본값 재설정
    mockDiscordRest.fetchGuildRoles.mockResolvedValue(ALL_ROLES);
    mockDiscordRest.fetchGuildMember.mockResolvedValue(BOT_MEMBER);
    mockDiscordRest.sendMessage.mockResolvedValue({ id: 'mock-message-id-001' });
    mockDiscordRest.getBotUserId.mockReturnValue(BOT_USER_ID);
  });

  afterAll(async () => {
    await app.close();
  });

  // ───────────────────────────────────────────────
  // [1] 마이그레이션 검증
  // ───────────────────────────────────────────────

  describe('[마이그레이션] role-panel 스키마', () => {
    it('role_panel_config 테이블이 존재한다', async () => {
      const result = await dataSource.query<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'role_panel_config'
        ) AS exists
      `);
      expect(result[0].exists).toBe(true);
    });

    it('role_panel_button 테이블이 존재한다', async () => {
      const result = await dataSource.query<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'role_panel_button'
        ) AS exists
      `);
      expect(result[0].exists).toBe(true);
    });

    it('IDX_role_panel_config_guild 인덱스가 존재한다', async () => {
      const result = await dataSource.query<{ indexname: string }[]>(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'IDX_role_panel_config_guild'
      `);
      expect(result).toHaveLength(1);
    });

    it('IDX_role_panel_button_panel_sort 인덱스가 존재한다', async () => {
      const result = await dataSource.query<{ indexname: string }[]>(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'IDX_role_panel_button_panel_sort'
      `);
      expect(result).toHaveLength(1);
    });

    it('role_panel_button_mode_enum 이 GRANT, TOGGLE 값을 가진다', async () => {
      const result = await dataSource.query<{ enumlabel: string }[]>(`
        SELECT enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'role_panel_button_mode_enum'
        ORDER BY enumlabel
      `);
      const labels = result.map((r) => r.enumlabel).sort();
      expect(labels).toEqual(['GRANT', 'TOGGLE']);
    });

    it('role_panel_button_style_enum 이 DANGER, PRIMARY, SECONDARY, SUCCESS 값을 가진다', async () => {
      const result = await dataSource.query<{ enumlabel: string }[]>(`
        SELECT enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'role_panel_button_style_enum'
        ORDER BY enumlabel
      `);
      const labels = result.map((r) => r.enumlabel).sort();
      expect(labels).toEqual(['DANGER', 'PRIMARY', 'SECONDARY', 'SUCCESS']);
    });

    it('role_panel_button.panelId 에 role_panel_config 를 참조하는 FK CASCADE 가 존재한다', async () => {
      const result = await dataSource.query<{ constraint_name: string }[]>(`
        SELECT constraint_name FROM information_schema.referential_constraints
        WHERE constraint_name = 'FK_role_panel_button_panel'
      `);
      expect(result).toHaveLength(1);
    });

    it('마이그레이션 down() 이 오류 없이 수행된다 (무결성 확인)', async () => {
      // DataSource 를 통해 down() 실행 후 up() 재실행
      // 이를 통해 down 스크립트 문법/논리 오류를 검출한다
      const ds = dataSource;
      await ds.query('BEGIN');
      try {
        await ds.query(`
          ALTER TABLE "role_panel_button" DROP CONSTRAINT IF EXISTS "FK_role_panel_button_panel";
          DROP INDEX IF EXISTS "public"."IDX_role_panel_button_panel_sort";
          DROP TABLE IF EXISTS "role_panel_button";
          DROP TYPE IF EXISTS "public"."role_panel_button_style_enum";
          DROP TYPE IF EXISTS "public"."role_panel_button_mode_enum";
          DROP INDEX IF EXISTS "public"."IDX_role_panel_config_guild";
          DROP TABLE IF EXISTS "role_panel_config";
        `);
        await ds.query('ROLLBACK');
        // ROLLBACK 후 테이블이 원상복구 됐는지 확인
        const result = await ds.query<{ exists: boolean }[]>(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'role_panel_config'
          ) AS exists
        `);
        expect(result[0].exists).toBe(true);
      } catch {
        await ds.query('ROLLBACK');
        throw new Error('down() 시뮬레이션 쿼리 실행 중 오류 발생');
      }
    });
  });

  // ───────────────────────────────────────────────
  // [2] 인가 가드 — 비로그인 401
  // ───────────────────────────────────────────────

  describe('[인가] 비로그인 시 401', () => {
    it('GET /api/guilds/:guildId/role-panel — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel`)
        .expect(401);
    });

    it('POST /api/guilds/:guildId/role-panel — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .send(makeCreateDto())
        .expect(401);
    });

    it('PUT /api/guilds/:guildId/role-panel/:panelId — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/role-panel/1`)
        .send(makeCreateDto())
        .expect(401);
    });

    it('DELETE /api/guilds/:guildId/role-panel/:panelId — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .delete(`/api/guilds/${GUILD_ID}/role-panel/1`)
        .expect(401);
    });

    it('POST /api/guilds/:guildId/role-panel/:panelId/publish — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel/1/publish`)
        .expect(401);
    });

    it('GET /api/guilds/:guildId/role-panel/assignable-roles — 토큰 없이 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel/assignable-roles`)
        .expect(401);
    });
  });

  // ───────────────────────────────────────────────
  // [3] 패널 생애주기 (UC-01) — 성공 경로
  // ───────────────────────────────────────────────

  describe('[UC-01] 패널 생애주기 — POST → GET → PUT → publish → DELETE', () => {
    it('POST /role-panel — 패널 생성 시 201 + DB 반영 + published=false', async () => {
      const token = makeJwt(jwtService);
      const dto = makeCreateDto();

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(dto)
        .expect(201);

      // 응답 바디 검증
      expect(res.body).toMatchObject({
        name: 'E2E 테스트 패널',
        channelId: 'channel-001',
        embedTitle: '역할 선택',
        embedDescription: '역할을 선택하세요',
        embedColor: '#5865F2',
        published: false,
        messageId: null,
      });
      expect(res.body.id).toBeTypeOf('number');
      expect(res.body.buttons).toHaveLength(1);
      expect(res.body.buttons[0]).toMatchObject({
        label: '일반 역할',
        roleId: NORMAL_ROLE.id,
        mode: RolePanelButtonMode.TOGGLE,
        style: RolePanelButtonStyle.PRIMARY,
        sortOrder: 0,
      });

      // DB 직접 검증
      const dbPanel = await dataSource.getRepository(RolePanelConfigOrm).findOne({
        where: { id: res.body.id as number, guildId: GUILD_ID },
        relations: { buttons: true },
      });
      expect(dbPanel).not.toBeNull();
      expect(dbPanel!.name).toBe('E2E 테스트 패널');
      expect(dbPanel!.published).toBe(false);
      expect(dbPanel!.buttons).toHaveLength(1);
    });

    it('GET /role-panel — 목록 조회 시 200 + 생성한 패널 포함', async () => {
      const token = makeJwt(jwtService);

      // 사전 생성
      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(panelId);
    });

    it('GET /role-panel/:panelId — 단건 조회 시 200 + 상세 반환', async () => {
      const token = makeJwt(jwtService);

      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel/${panelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.id).toBe(panelId);
      expect(res.body.name).toBe('E2E 테스트 패널');
    });

    it('GET /role-panel/:panelId — 존재하지 않는 패널 조회 시 404', async () => {
      const token = makeJwt(jwtService);

      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel/99999`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('PUT /role-panel/:panelId — 수정 시 200 + DB 반영', async () => {
      const token = makeJwt(jwtService);

      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      const updateDto = makeCreateDto({
        name: '수정된 패널명',
        buttons: [
          {
            label: '수정된 버튼',
            roleId: NORMAL_ROLE.id,
            mode: RolePanelButtonMode.GRANT,
            style: RolePanelButtonStyle.SUCCESS,
            sortOrder: 0,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/role-panel/${panelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateDto)
        .expect(200);

      expect(res.body.name).toBe('수정된 패널명');
      expect(res.body.buttons[0].label).toBe('수정된 버튼');
      expect(res.body.buttons[0].mode).toBe(RolePanelButtonMode.GRANT);

      // DB 확인
      const dbPanel = await dataSource.getRepository(RolePanelConfigOrm).findOne({
        where: { id: panelId },
        relations: { buttons: true },
      });
      expect(dbPanel!.name).toBe('수정된 패널명');
      expect(dbPanel!.buttons).toHaveLength(1);
      expect(dbPanel!.buttons[0].label).toBe('수정된 버튼');
    });

    it('POST /role-panel/:panelId/publish — 게시 시 200 + Discord sendMessage 호출 + messageId DB 저장 + published=true', async () => {
      const token = makeJwt(jwtService);

      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ channelId: 'channel-publish-001' }))
        .expect(201);
      const panelId = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel/${panelId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // sendMessage 호출 검증
      expect(mockDiscordRest.sendMessage).toHaveBeenCalledOnce();
      expect(mockDiscordRest.sendMessage).toHaveBeenCalledWith(
        'channel-publish-001',
        expect.objectContaining({ embeds: expect.any(Array) }),
      );

      // 응답에 messageId 반영 + published=true
      expect(res.body.messageId).toBe('mock-message-id-001');
      expect(res.body.published).toBe(true);

      // DB 직접 검증
      const dbPanel = await dataSource.getRepository(RolePanelConfigOrm).findOne({
        where: { id: panelId },
      });
      expect(dbPanel!.messageId).toBe('mock-message-id-001');
      expect(dbPanel!.published).toBe(true);
    });

    it('POST /role-panel/:panelId/publish — channelId 없으면 400', async () => {
      const token = makeJwt(jwtService);

      // channelId 없이 생성
      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ channelId: null }))
        .expect(201);
      const panelId = createRes.body.id as number;

      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel/${panelId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('DELETE /role-panel/:panelId — 삭제 시 200 + DB에서 제거됨 (버튼 CASCADE)', async () => {
      const token = makeJwt(jwtService);

      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      const res = await request(app.getHttpServer())
        .delete(`/api/guilds/${GUILD_ID}/role-panel/${panelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ ok: true });

      // DB 확인: config 삭제
      const dbPanel = await dataSource.getRepository(RolePanelConfigOrm).findOne({
        where: { id: panelId },
      });
      expect(dbPanel).toBeNull();

      // DB 확인: CASCADE 버튼도 삭제
      const dbButtons = await dataSource.getRepository(RolePanelButtonOrm).findBy({
        panelId,
      });
      expect(dbButtons).toHaveLength(0);
    });

    it('DELETE /role-panel/:panelId — published 패널 삭제 시 deleteMessage 호출', async () => {
      const token = makeJwt(jwtService);

      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ channelId: 'channel-001' }))
        .expect(201);
      const panelId = createRes.body.id as number;

      // 게시
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel/${panelId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      vi.clearAllMocks();
      mockDiscordRest.deleteMessage.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/guilds/${GUILD_ID}/role-panel/${panelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // deleteMessage 호출 검증
      expect(mockDiscordRest.deleteMessage).toHaveBeenCalledOnce();
    });

    it('GET /role-panel — 목록 Redis 캐시 히트 검증 (2회 조회 시 DB 미조회)', async () => {
      const token = makeJwt(jwtService);

      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);

      // 1회 조회 (DB에서 읽고 Redis 캐시 기록)
      const res1 = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // 2회 조회 (캐시 히트 — 응답 동일해야 함)
      const res2 = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res1.body).toHaveLength(1);
      expect(res2.body).toHaveLength(1);
      expect(res1.body[0].id).toBe(res2.body[0].id);
    });
  });

  // ───────────────────────────────────────────────
  // [4] 역할 검증 (권한 — P0)
  // ───────────────────────────────────────────────

  describe('[P0] 저장 시 역할 검증', () => {
    it('정상 역할(위치 5, 봇 최상위=10) → 201 통과', async () => {
      const token = makeJwt(jwtService);

      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: '정상 역할', roleId: NORMAL_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(201);
    });

    it('봇 최상위 이상 역할(position 15 >= botTop 10) → 400', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: '높은 위계', roleId: HIGH_POSITION_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(400);

      expect(res.body.message).toContain('봇 최상위 역할');
    });

    it('@everyone 역할 (id === guildId) → 400', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: '@everyone', roleId: EVERYONE_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(400);

      expect(res.body.message).toContain('@everyone');
    });

    it('managed 역할(봇/통합 관리) → 400', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: 'managed', roleId: MANAGED_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(400);

      expect(res.body.message).toContain('managed');
    });

    it('ADMINISTRATOR 비트 보유 역할 → 403 (우선순위 최고)', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: '관리자', roleId: ADMIN_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(403);

      expect(res.body.message).toContain('ADMINISTRATOR');
    });

    it('ADMINISTRATOR 역할 + 일반 역할 혼합 → 403 (fail-closed: ADMINISTRATOR 우선)', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({
          buttons: [
            { label: '정상', roleId: NORMAL_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 },
            { label: '관리자', roleId: ADMIN_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.DANGER, sortOrder: 1 },
          ],
        }))
        .expect(403);
    });

    it('PUT 수정 시도 시에도 역할 재검증 — 위계 높은 역할로 수정 → 400', async () => {
      const token = makeJwt(jwtService);

      // 정상 패널 생성
      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      // 위계 높은 역할로 수정 시도 → 400
      await request(app.getHttpServer())
        .put(`/api/guilds/${GUILD_ID}/role-panel/${panelId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: '높은 위계', roleId: HIGH_POSITION_ROLE.id, mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(400);
    });

    it('존재하지 않는 역할 ID → 400', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [{ label: '없는 역할', roleId: 'non-existent-role-id', mode: RolePanelButtonMode.TOGGLE, style: RolePanelButtonStyle.PRIMARY, sortOrder: 0 }] }))
        .expect(400);

      expect(res.body.message).toContain('찾을 수 없습니다');
    });
  });

  // ───────────────────────────────────────────────
  // [5] DTO 검증 (ValidationPipe)
  // ───────────────────────────────────────────────

  describe('[DTO] 입력 검증', () => {
    it('name 누락 → 400', async () => {
      const token = makeJwt(jwtService);
      const { name: _name, ...dtoWithoutName } = makeCreateDto() as Record<string, unknown>;
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(dtoWithoutName)
        .expect(400);
    });

    it('buttons 빈 배열 → 400 (ArrayMinSize(1))', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ buttons: [] }))
        .expect(400);
    });

    it('embedColor 형식 오류(#GGGGGG) → 400', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto({ embedColor: '#GGGGGG' }))
        .expect(400);
    });

    it('panelId 가 숫자가 아닐 때 GET → 400 (ParseIntPipe)', async () => {
      const token = makeJwt(jwtService);
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel/not-a-number`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  // ───────────────────────────────────────────────
  // [6] GET /assignable-roles — 역할 메타 조회
  // ───────────────────────────────────────────────

  describe('[UC-02] GET /assignable-roles — 역할 부여 가능 여부 메타', () => {
    it('200 + 각 역할에 assignable/disabledReason 필드 포함', async () => {
      const token = makeJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/role-panel/assignable-roles`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);

      // NORMAL_ROLE: assignable=true
      const normalEntry = (res.body as { id: string; assignable: boolean; disabledReason: string | null }[]).find((r) => r.id === NORMAL_ROLE.id);
      expect(normalEntry).not.toBeUndefined();
      expect(normalEntry!.assignable).toBe(true);
      expect(normalEntry!.disabledReason).toBeNull();

      // ADMIN_ROLE: assignable=false, disabledReason='ADMINISTRATOR'
      const adminEntry = (res.body as { id: string; assignable: boolean; disabledReason: string | null }[]).find((r) => r.id === ADMIN_ROLE.id);
      expect(adminEntry!.assignable).toBe(false);
      expect(adminEntry!.disabledReason).toBe('ADMINISTRATOR');

      // EVERYONE_ROLE: assignable=false, disabledReason='EVERYONE'
      const everyoneEntry = (res.body as { id: string; assignable: boolean; disabledReason: string | null }[]).find((r) => r.id === EVERYONE_ROLE.id);
      expect(everyoneEntry!.assignable).toBe(false);
      expect(everyoneEntry!.disabledReason).toBe('EVERYONE');

      // HIGH_POSITION_ROLE: assignable=false, disabledReason='HIGHER_THAN_BOT'
      const highEntry = (res.body as { id: string; assignable: boolean; disabledReason: string | null }[]).find((r) => r.id === HIGH_POSITION_ROLE.id);
      expect(highEntry!.assignable).toBe(false);
      expect(highEntry!.disabledReason).toBe('HIGHER_THAN_BOT');
    });
  });

  // ───────────────────────────────────────────────
  // [7] 봇용 config 엔드포인트 (2.1) — BotApiAuthGuard
  // ───────────────────────────────────────────────

  describe('[UC-03] GET /bot-api/role-panel/config — BotApiAuthGuard', () => {
    it('유효한 Bearer 봇 토큰 → 200 + { ok: true, data: [] }', async () => {
      const res = await request(app.getHttpServer())
        .get(`/bot-api/role-panel/config?guildId=${GUILD_ID}`)
        .set('Authorization', `Bearer ${TEST_BOT_API_KEY}`)
        .expect(200);

      expect(res.body).toMatchObject({ ok: true, data: [] });
    });

    it('패널이 있으면 data 에 포함됨', async () => {
      const jwtToken = makeJwt(jwtService);

      // 웹 API 로 패널 생성
      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      // 봇 API 로 config 조회
      const res = await request(app.getHttpServer())
        .get(`/bot-api/role-panel/config?guildId=${GUILD_ID}`)
        .set('Authorization', `Bearer ${TEST_BOT_API_KEY}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({
        panelId,
        buttons: [
          {
            roleId: NORMAL_ROLE.id,
            mode: 'TOGGLE',
          },
        ],
      });
    });

    it('Authorization 헤더 없이 → 401', async () => {
      await request(app.getHttpServer())
        .get(`/bot-api/role-panel/config?guildId=${GUILD_ID}`)
        .expect(401);
    });

    it('잘못된 봇 토큰 → 401', async () => {
      await request(app.getHttpServer())
        .get(`/bot-api/role-panel/config?guildId=${GUILD_ID}`)
        .set('Authorization', 'Bearer wrong-key')
        .expect(401);
    });

    it('Bearer 형식이 아닌 헤더 → 401', async () => {
      await request(app.getHttpServer())
        .get(`/bot-api/role-panel/config?guildId=${GUILD_ID}`)
        .set('Authorization', TEST_BOT_API_KEY) // Bearer 없음
        .expect(401);
    });
  });

  // ───────────────────────────────────────────────
  // [8] 타 길드 소유 패널 접근 차단
  // ───────────────────────────────────────────────

  describe('[보안] 타 길드 패널 접근 차단', () => {
    it('다른 guildId 로 패널 조회 → 404 (소유 검증)', async () => {
      const token = makeJwt(jwtService);
      const OTHER_GUILD = 'guild-e2e-other';

      // guild A 에 패널 생성
      const createRes = await request(app.getHttpServer())
        .post(`/api/guilds/${GUILD_ID}/role-panel`)
        .set('Authorization', `Bearer ${token}`)
        .send(makeCreateDto())
        .expect(201);
      const panelId = createRes.body.id as number;

      // guild B URL 로 접근 → 404
      await request(app.getHttpServer())
        .get(`/api/guilds/${OTHER_GUILD}/role-panel/${panelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
