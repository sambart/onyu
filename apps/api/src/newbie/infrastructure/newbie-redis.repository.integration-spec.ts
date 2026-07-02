import type { TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanRedis } from '../../test-utils/redis-cleaner';
import { NewbieKeys } from './newbie-cache.keys';
import { NewbieRedisRepository } from './newbie-redis.repository';

const MOCO_SCORE_2ND = 80; // 2위 사냥꾼 점수
const MOCO_SCORE_4TH = 70; // 4위 사냥꾼 점수

describe('NewbieRedisRepository (Integration)', () => {
  let module: TestingModule;
  let repository: NewbieRedisRepository;
  let redisClient: Redis;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      providers: [RedisService, NewbieRedisRepository],
    }).compile();

    repository = module.get(NewbieRedisRepository);
    redisClient = module.get(REDIS_CLIENT);
  }, 60_000);

  afterEach(async () => {
    await cleanRedis(redisClient);
  });

  describe('initPeriodActiveMembers', () => {
    it('멤버가 있으면 Set에 멤버 ID들을 저장하고 TTL을 설정한다', async () => {
      await repository.initPeriodActiveMembers('guild-1', ['member-1', 'member-2']);

      const key = NewbieKeys.periodActive('guild-1');
      const members = await redisClient.smembers(key);
      const ttl = await redisClient.ttl(key);

      expect(members).toHaveLength(2);
      expect(members).toContain('member-1');
      expect(members).toContain('member-2');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60);
    });

    it('멤버가 없으면 __CHECKED__ 센티널을 저장한다', async () => {
      await repository.initPeriodActiveMembers('guild-1', []);

      const key = NewbieKeys.periodActive('guild-1');
      const members = await redisClient.smembers(key);
      const ttl = await redisClient.ttl(key);

      expect(members).toContain('__CHECKED__');
      expect(ttl).toBeGreaterThan(0);
    });

    it('기존 Set을 DEL하고 새로 초기화한다', async () => {
      await repository.initPeriodActiveMembers('guild-1', ['old-member']);
      await repository.initPeriodActiveMembers('guild-1', ['new-member-1', 'new-member-2']);

      const members = await redisClient.smembers(NewbieKeys.periodActive('guild-1'));

      expect(members).not.toContain('old-member');
      expect(members).toContain('new-member-1');
      expect(members).toContain('new-member-2');
    });
  });

  describe('getPeriodActiveMembers', () => {
    it('키가 없으면 null을 반환한다 (캐시 미스)', async () => {
      const result = await repository.getPeriodActiveMembers('guild-no-key');
      expect(result).toBeNull();
    });

    it('__CHECKED__ 센티널만 있으면 빈 배열을 반환한다', async () => {
      await repository.initPeriodActiveMembers('guild-1', []);

      const result = await repository.getPeriodActiveMembers('guild-1');

      expect(result).toEqual([]);
    });

    it('실제 멤버가 있으면 센티널을 제외한 멤버 목록을 반환한다', async () => {
      await repository.initPeriodActiveMembers('guild-1', ['member-1', 'member-2']);

      const result = await repository.getPeriodActiveMembers('guild-1');

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result).toContain('member-1');
      expect(result).toContain('member-2');
      expect(result).not.toContain('__CHECKED__');
    });

    it('addPeriodActiveMember로 추가한 멤버도 조회된다', async () => {
      await repository.initPeriodActiveMembers('guild-1', ['member-1']);
      await repository.addPeriodActiveMember('guild-1', 'member-2');

      const result = await repository.getPeriodActiveMembers('guild-1');

      expect(result).toContain('member-1');
      expect(result).toContain('member-2');
    });
  });

  describe('incrMocoMinutes', () => {
    it('HINCRBY로 신규사용자별 사냥 시간을 누적한다', async () => {
      await repository.incrMocoMinutes('guild-1', 'hunter-1', 'newbie-1', 30);

      const key = NewbieKeys.mocoTotal('guild-1', 'hunter-1');
      const value = await redisClient.hget(key, 'newbie-1');

      expect(Number(value)).toBe(30);
    });

    it('같은 newbieMemberId에 누적 호출하면 합산된다', async () => {
      await repository.incrMocoMinutes('guild-1', 'hunter-1', 'newbie-1', 30);
      await repository.incrMocoMinutes('guild-1', 'hunter-1', 'newbie-1', 20);

      const key = NewbieKeys.mocoTotal('guild-1', 'hunter-1');
      const value = await redisClient.hget(key, 'newbie-1');

      expect(Number(value)).toBe(50);
    });

    it('다른 newbieMemberId는 별도 필드로 저장된다', async () => {
      await repository.incrMocoMinutes('guild-1', 'hunter-1', 'newbie-1', 10);
      await repository.incrMocoMinutes('guild-1', 'hunter-1', 'newbie-2', 20);

      const key = NewbieKeys.mocoTotal('guild-1', 'hunter-1');
      const v1 = await redisClient.hget(key, 'newbie-1');
      const v2 = await redisClient.hget(key, 'newbie-2');

      expect(Number(v1)).toBe(10);
      expect(Number(v2)).toBe(20);
    });

    it('다른 hunterId는 별도 Hash 키에 저장된다', async () => {
      await repository.incrMocoMinutes('guild-1', 'hunter-1', 'newbie-1', 15);
      await repository.incrMocoMinutes('guild-1', 'hunter-2', 'newbie-1', 25);

      const v1 = await redisClient.hget(NewbieKeys.mocoTotal('guild-1', 'hunter-1'), 'newbie-1');
      const v2 = await redisClient.hget(NewbieKeys.mocoTotal('guild-1', 'hunter-2'), 'newbie-1');

      expect(Number(v1)).toBe(15);
      expect(Number(v2)).toBe(25);
    });
  });

  describe('incrMocoRank / getMocoRankPage', () => {
    it('ZINCRBY로 사냥꾼 점수를 누적한다', async () => {
      await repository.incrMocoRank('guild-1', 'hunter-1', 60);

      const score = await redisClient.zscore(NewbieKeys.mocoRank('guild-1'), 'hunter-1');
      expect(Number(score)).toBe(60);
    });

    it('같은 사냥꾼에 누적 호출하면 점수가 합산된다', async () => {
      await repository.incrMocoRank('guild-1', 'hunter-1', 60);
      await repository.incrMocoRank('guild-1', 'hunter-1', 40);

      const score = await redisClient.zscore(NewbieKeys.mocoRank('guild-1'), 'hunter-1');
      expect(Number(score)).toBe(100);
    });

    it('getMocoRankPage — 1페이지 조회 시 점수 내림차순으로 반환된다', async () => {
      await repository.incrMocoRank('guild-1', 'hunter-1', 50);
      await repository.incrMocoRank('guild-1', 'hunter-2', MOCO_SCORE_2ND);
      await repository.incrMocoRank('guild-1', 'hunter-3', 30);

      const page = await repository.getMocoRankPage('guild-1', 1, 10);

      expect(page).toHaveLength(3);
      expect(page[0].hunterId).toBe('hunter-2');
      expect(page[0].totalMinutes).toBe(MOCO_SCORE_2ND);
      expect(page[1].hunterId).toBe('hunter-1');
      expect(page[2].hunterId).toBe('hunter-3');
    });

    it('getMocoRankPage — 페이지네이션이 동작한다', async () => {
      await repository.incrMocoRank('guild-1', 'hunter-1', 100);
      await repository.incrMocoRank('guild-1', 'hunter-2', 90);
      await repository.incrMocoRank('guild-1', 'hunter-3', MOCO_SCORE_2ND);
      await repository.incrMocoRank('guild-1', 'hunter-4', MOCO_SCORE_4TH);

      const page1 = await repository.getMocoRankPage('guild-1', 1, 2);
      const page2 = await repository.getMocoRankPage('guild-1', 2, 2);

      expect(page1).toHaveLength(2);
      expect(page1[0].hunterId).toBe('hunter-1');
      expect(page1[1].hunterId).toBe('hunter-2');

      expect(page2).toHaveLength(2);
      expect(page2[0].hunterId).toBe('hunter-3');
      expect(page2[1].hunterId).toBe('hunter-4');
    });

    it('getMocoRankPage — 데이터가 없으면 빈 배열을 반환한다', async () => {
      const page = await repository.getMocoRankPage('guild-empty', 1, 10);
      expect(page).toEqual([]);
    });

    it('getMocoRankPage — 범위를 초과하는 페이지는 빈 배열을 반환한다', async () => {
      await repository.incrMocoRank('guild-1', 'hunter-1', 50);

      const page = await repository.getMocoRankPage('guild-1', 2, 10);
      expect(page).toEqual([]);
    });
  });
});
