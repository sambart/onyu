/**
 * testcontainers를 사용하지 않고 직접 환경변수에서 DB/Redis 연결 정보를 읽는 통합 테스트 setup.
 * Docker 소켓 없이 실행 시(컨테이너 내부) 사용한다.
 *
 * 필수 환경변수:
 *   DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME
 *   REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
 */
import { DataSource } from 'typeorm';
import { afterAll, beforeAll } from 'vitest';

import { ALL_MIGRATIONS } from './all-migrations';

beforeAll(async () => {
  // 테스트 실행에 필요한 외부 서비스 더미값 (Joi 검증 통과용)
  process.env.DISCORD_API_TOKEN ??= 'test-token';
  process.env.DISCORD_CLIENT_ID ??= 'test-client-id';
  process.env.DISCORD_CLIENT_SECRET ??= 'test-client-secret';
  process.env.DISCORD_CALLBACK_URL ??= 'http://localhost:3000/auth/discord/callback';
  process.env.GEMINI_API_KEY ??= 'test-gemini-key';
  process.env.JWT_SECRET ??= 'test-jwt-secret';
  process.env.WEB_URL ??= 'http://localhost:4000';
  process.env.NODE_ENV = 'test';

  // 마이그레이션을 전역에서 1회만 실행
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
  // testcontainers 없으므로 정리 불필요
});
