/**
 * newbie E2E 테스트
 *
 * 검증 대상: GET /api/guilds/:guildId/newbie/* (read-only 엔드포인트)
 *
 * - 인증 없이 접근 → 401
 * - 유효 JWT 첨부 후 빈 길드 조회 → 200 + 빈/null/기본값 응답
 *
 * MissionService 가 VoiceDailyFlushService, VoiceRedisRepository 등 Voice 도메인 의존성을
 * 가지므로 이 의존성들을 mock 으로 대체한다.
 * Discord 의존성(DiscordRestService, GuildMemberService)도 mock 으로 차단한다.
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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/auth/application/auth.service';
import { AuthGuildRepository } from '../src/auth/infrastructure/auth-guild.repository';
import { JwtStrategy } from '../src/auth/infrastructure/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/infrastructure/jwt-auth.guard';
import { ChannelOrm } from '../src/channel/infrastructure/channel.orm-entity';
import { VoiceDailyFlushService } from '../src/channel/voice/application/voice-daily-flush-service';
import { VoiceChannelHistoryOrm } from '../src/channel/voice/infrastructure/voice-channel-history.orm-entity';
import { VoiceDailyOrm } from '../src/channel/voice/infrastructure/voice-daily.orm-entity';
import { VoiceRedisRepository } from '../src/channel/voice/infrastructure/voice-redis.repository';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { DiscordRestService } from '../src/discord-rest/discord-rest.service';
import { GuildMemberService } from '../src/guild-member/application/guild-member.service';
import { GuildMemberOrmEntity } from '../src/guild-member/infrastructure/guild-member.orm-entity';
import { MissionService } from '../src/newbie/application/mission/mission.service';
import { MissionDiscordPresenter } from '../src/newbie/application/mission/mission-discord.presenter';
import { MissionDiscordActionService } from '../src/newbie/application/mission/mission-discord-action.service';
import { MissionRankRenderer } from '../src/newbie/application/mission/mission-rank.renderer';
import { MocoService } from '../src/newbie/application/moco/moco.service';
import { MocoDiscordPresenter } from '../src/newbie/application/moco/moco-discord.presenter';
import { MocoRankRenderer } from '../src/newbie/application/moco/moco-rank.renderer';
import { MocoDbRepository } from '../src/newbie/infrastructure/moco-db.repository';
import { MocoHuntingDailyOrmEntity } from '../src/newbie/infrastructure/moco-hunting-daily.orm-entity';
import { MocoHuntingSessionOrmEntity } from '../src/newbie/infrastructure/moco-hunting-session.orm-entity';
import { NewbieConfigOrmEntity } from '../src/newbie/infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../src/newbie/infrastructure/newbie-config.repository';
import { NewbieMissionOrmEntity } from '../src/newbie/infrastructure/newbie-mission.orm-entity';
import { NewbieMissionRepository } from '../src/newbie/infrastructure/newbie-mission.repository';
import { NewbieMissionTemplateOrmEntity } from '../src/newbie/infrastructure/newbie-mission-template.orm-entity';
import { NewbieMissionTemplateRepository } from '../src/newbie/infrastructure/newbie-mission-template.repository';
import { NewbieMocoTemplateOrmEntity } from '../src/newbie/infrastructure/newbie-moco-template.orm-entity';
import { NewbieMocoTemplateRepository } from '../src/newbie/infrastructure/newbie-moco-template.repository';
import { NewbiePeriodOrmEntity } from '../src/newbie/infrastructure/newbie-period.orm-entity';
import { NewbiePeriodRepository } from '../src/newbie/infrastructure/newbie-period.repository';
import { NewbieRedisRepository } from '../src/newbie/infrastructure/newbie-redis.repository';
import {
  DEFAULT_MOCO_BODY_TEMPLATE,
  DEFAULT_MOCO_FOOTER_TEMPLATE,
  DEFAULT_MOCO_ITEM_TEMPLATE,
  DEFAULT_MOCO_SCORING_TEMPLATE,
  DEFAULT_MOCO_TITLE_TEMPLATE,
} from '../src/newbie/infrastructure/newbie-template.constants';
import { NewbieController } from '../src/newbie/presentation/newbie.controller';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { RedisModule } from '../src/redis/redis.module';
import { AdminUserRepository } from '../src/super-admin/infrastructure/admin-user.repository';
import { cleanDatabase } from '../src/test-utils/db-cleaner';
import { cleanRedis } from '../src/test-utils/redis-cleaner';

/** 테스트용 JWT 발급 헬퍼 */
function makeJwt(jwtService: JwtService): string {
  return jwtService.sign({
    sub: 'user-001',
    username: 'tester',
    avatar: null,
    guilds: [{ id: 'guild-e2e-001', name: 'E2E', icon: null }],
  });
}

/** DiscordRestService mock: onModuleInit 이 Discord API 를 호출하지 않도록 차단 */
const mockDiscordRestService = {
  onModuleInit: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue({ id: 'mock-msg-id' }),
  editMessage: vi.fn().mockResolvedValue(undefined),
  deleteMessage: vi.fn().mockResolvedValue(undefined),
  sendFiles: vi.fn().mockResolvedValue({ id: 'mock-msg-id' }),
};

/** GuildMemberService mock: Discord 호출 차단 */
const mockGuildMemberService = {
  getOrCreateMember: vi.fn().mockResolvedValue(null),
  findByUserId: vi.fn().mockResolvedValue(null),
};

/** VoiceDailyFlushService mock: 음성 flush 차단 */
const mockVoiceDailyFlushService = {
  flush: vi.fn().mockResolvedValue(undefined),
  flushAll: vi.fn().mockResolvedValue(undefined),
};

describe('NewbieController (E2E)', () => {
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
          NewbieConfigOrmEntity,
          NewbieMissionOrmEntity,
          NewbieMissionTemplateOrmEntity,
          NewbieMocoTemplateOrmEntity,
          NewbiePeriodOrmEntity,
          MocoHuntingSessionOrmEntity,
          MocoHuntingDailyOrmEntity,
          // MissionService 가 @InjectRepository 로 직접 참조
          VoiceDailyOrm,
          VoiceChannelHistoryOrm,
          // VoiceChannelHistoryOrm 의 관계 엔티티
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
      controllers: [NewbieController],
      providers: [
        // Auth
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: AuthGuildRepository, useValue: { findBotGuildIds: () => Promise.resolve(new Set<string>()) } },
        { provide: AdminUserRepository, useValue: { findByDiscordId: () => Promise.resolve(null) } },
        // Repositories
        NewbieConfigRepository,
        NewbieMissionRepository,
        NewbieMissionTemplateRepository,
        NewbieMocoTemplateRepository,
        NewbieRedisRepository,
        NewbiePeriodRepository,
        MocoDbRepository,
        // Voice repositories (MissionService 의존성)
        VoiceRedisRepository,
        // Services
        MissionRankRenderer,
        MissionService,
        MocoRankRenderer,
        MocoService,
        // Discord 의존성 mock (Discord API 호출 차단)
        {
          provide: DiscordRestService,
          useValue: mockDiscordRestService,
        },
        {
          provide: GuildMemberService,
          useValue: mockGuildMemberService,
        },
        {
          provide: VoiceDailyFlushService,
          useValue: mockVoiceDailyFlushService,
        },
        MissionDiscordPresenter,
        MissionDiscordActionService,
        MocoDiscordPresenter,
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

  const GUILD_ID = 'guild-e2e-001';

  describe('인증 없이 접근', () => {
    it('GET /api/guilds/:guildId/newbie/config — 인증 없이 401을 반환한다', async () => {
      await request(app.getHttpServer()).get(`/api/guilds/${GUILD_ID}/newbie/config`).expect(401);
    });

    it('GET /api/guilds/:guildId/newbie/missions — 인증 없이 401을 반환한다', async () => {
      await request(app.getHttpServer()).get(`/api/guilds/${GUILD_ID}/newbie/missions`).expect(401);
    });

    it('GET /api/guilds/:guildId/newbie/moco — 인증 없이 401을 반환한다', async () => {
      await request(app.getHttpServer()).get(`/api/guilds/${GUILD_ID}/newbie/moco`).expect(401);
    });

    it('GET /api/guilds/:guildId/newbie/mission-template — 인증 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/mission-template`)
        .expect(401);
    });

    it('GET /api/guilds/:guildId/newbie/moco-template — 인증 없이 401을 반환한다', async () => {
      await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/moco-template`)
        .expect(401);
    });
  });

  describe('유효 JWT 로 빈 길드 조회', () => {
    it('GET /newbie/config — 설정 없으면 null을 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/config`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // NestJS 컨트롤러가 null 을 반환할 때 HTTP body 는 빈 문자열('')이 된다.
      // supertest 는 빈 body 를 {} 로 파싱하므로 res.text 로 실제 body 를 검증한다.
      expect(res.text).toBe('');
    });

    it('GET /newbie/missions — 미션 없으면 items:[], total:0, page:1, pageSize:10을 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/missions`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });
    });

    it('GET /newbie/moco — 랭크 없으면 items:[], total:0, page:1, pageSize:10을 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/moco`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });
    });

    it('GET /newbie/mission-template — 템플릿 없으면 null을 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/mission-template`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // NestJS 컨트롤러가 null 을 반환할 때 HTTP body 는 빈 문자열('')이 된다.
      expect(res.text).toBe('');
    });

    it('GET /newbie/moco-template — 템플릿 없으면 기본 템플릿 5개 필드를 반환한다', async () => {
      const token = makeJwt(jwtService);
      const res = await request(app.getHttpServer())
        .get(`/api/guilds/${GUILD_ID}/newbie/moco-template`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        titleTemplate: DEFAULT_MOCO_TITLE_TEMPLATE,
        bodyTemplate: DEFAULT_MOCO_BODY_TEMPLATE,
        itemTemplate: DEFAULT_MOCO_ITEM_TEMPLATE,
        footerTemplate: DEFAULT_MOCO_FOOTER_TEMPLATE,
        scoringTemplate: DEFAULT_MOCO_SCORING_TEMPLATE,
      });
    });
  });
});
