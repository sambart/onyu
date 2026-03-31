import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';

import { ALL_MIGRATIONS } from './all-migrations';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:15')
    .withDatabase('onyu_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  redisContainer = await new RedisContainer('redis:7').start();

  // TypeORM & Redis 연결에 필요한 환경변수 주입
  process.env.DATABASE_HOST = pgContainer.getHost();
  process.env.DATABASE_PORT = String(pgContainer.getMappedPort(5432));
  process.env.DATABASE_USER = 'test';
  process.env.DATABASE_PASSWORD = 'test';
  process.env.DATABASE_NAME = 'onyu_test';
  process.env.REDIS_HOST = redisContainer.getHost();
  process.env.REDIS_PORT = String(redisContainer.getMappedPort(6379));
  process.env.REDIS_PASSWORD = '';
  process.env.NODE_ENV = 'test';

  // 외부 서비스 더미값 (Joi 검증 통과용)
  process.env.DISCORD_API_TOKEN = 'test-token';
  process.env.DISCORD_CLIENT_ID = 'test-client-id';
  process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
  process.env.DISCORD_CALLBACK_URL = 'http://localhost:3000/auth/discord/callback';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.WEB_URL = 'http://localhost:4000';

  // 마이그레이션을 전역에서 1회만 실행 (각 테스트 파일이 중복 실행하지 않도록)
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    migrations: ALL_MIGRATIONS,
    migrationsRun: true,
    logging: false,
  });
  await ds.initialize();
  await ds.destroy();
}, 120_000);

afterAll(async () => {
  await pgContainer?.stop();
  await redisContainer?.stop();
});
