import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { NewbieKeys } from './newbie-cache.keys';
import { NewbieConfigOrmEntity as NewbieConfig } from './newbie-config.orm-entity';
import { NewbieMissionOrmEntity as NewbieMission } from './newbie-mission.orm-entity';

/** Redis TTL 상수 (초 단위) */
const TTL = {
  CONFIG: 60 * 60, // 1시간
  MISSION_ACTIVE: 60 * 30, // 30분
  PERIOD_ACTIVE: 60 * 60, // 1시간
} as const;

@Injectable()
export class NewbieRedisRepository {
  constructor(
    private readonly redis: RedisService,
    @Inject(REDIS_CLIENT) private readonly client: Redis,
  ) {}

  // --- 설정 캐시 ---

  /** NewbieConfig 캐시 조회 */
  async getConfig(guildId: string): Promise<NewbieConfig | null> {
    return this.redis.get<NewbieConfig>(NewbieKeys.config(guildId));
  }

  /** NewbieConfig 캐시 저장 (TTL 1시간) */
  async setConfig(guildId: string, config: NewbieConfig): Promise<void> {
    await this.redis.set(NewbieKeys.config(guildId), config, TTL.CONFIG);
  }

  /** NewbieConfig 캐시 삭제 */
  async deleteConfig(guildId: string): Promise<void> {
    await this.redis.del(NewbieKeys.config(guildId));
  }

  // --- 미션 목록 캐시 ---

  /** 진행중 미션 목록 캐시 조회 */
  async getMissionActive(guildId: string): Promise<NewbieMission[] | null> {
    return this.redis.get<NewbieMission[]>(NewbieKeys.missionActive(guildId));
  }

  /** 진행중 미션 목록 캐시 저장 (TTL 30분) */
  async setMissionActive(guildId: string, missions: NewbieMission[]): Promise<void> {
    await this.redis.set(NewbieKeys.missionActive(guildId), missions, TTL.MISSION_ACTIVE);
  }

  /** 진행중 미션 목록 캐시 삭제 */
  async deleteMissionActive(guildId: string): Promise<void> {
    await this.redis.del(NewbieKeys.missionActive(guildId));
  }

  // --- 신입기간 활성 멤버 집합 ---

  /**
   * 신입기간 활성 멤버 Set 전체 조회 (SMEMBERS).
   * 캐시 미스(키 없음)이면 null 반환, 빈 Set(센티널만 존재)이면 빈 배열 반환.
   */
  async getPeriodActiveMembers(guildId: string): Promise<string[] | null> {
    const key = NewbieKeys.periodActive(guildId);
    const exists = await this.client.exists(key);
    if (exists === 0) return null;
    const members = await this.client.smembers(key);
    return members.filter((m) => m !== '__CHECKED__');
  }

  /** 신입기간 활성 멤버 추가 (SADD) */
  async addPeriodActiveMember(guildId: string, memberId: string): Promise<void> {
    await this.redis.sadd(NewbieKeys.periodActive(guildId), memberId);
  }

  /** 신입기간 활성 멤버 여부 확인 (SISMEMBER) */
  async isPeriodActiveMember(guildId: string, memberId: string): Promise<boolean> {
    return this.redis.sismember(NewbieKeys.periodActive(guildId), memberId);
  }

  /**
   * 활성 멤버 집합 초기화 (DEL + SADD, TTL 1시간)
   * 봇 기동 초기화 또는 스케줄러 실행 후 캐시 재구성 시 사용.
   * memberIds가 비어있으면 센티널 값으로 "조회 완료, 결과 없음"을 표시한다.
   */
  async initPeriodActiveMembers(guildId: string, memberIds: string[]): Promise<void> {
    const key = NewbieKeys.periodActive(guildId);
    await this.redis.del(key);
    if (memberIds.length > 0) {
      await this.redis.sadd(key, memberIds);
    } else {
      await this.client.sadd(key, '__CHECKED__');
    }
    await this.client.expire(key, TTL.PERIOD_ACTIVE);
  }

  /** 신입기간 활성 멤버 캐시 삭제 */
  async deletePeriodActive(guildId: string): Promise<void> {
    await this.redis.del(NewbieKeys.periodActive(guildId));
  }

  // --- 모코코 사냥 ---

  /**
   * 사냥꾼의 신규사용자별 사냥 시간 누적 (HINCRBY)
   * Hash 키: newbie:moco:total:{guildId}:{hunterId}
   * Hash 필드: newbieMemberId, 값: minutes
   */
  async incrMocoMinutes(
    guildId: string,
    hunterId: string,
    newbieMemberId: string,
    minutes: number,
  ): Promise<void> {
    await this.client.hincrby(NewbieKeys.mocoTotal(guildId, hunterId), newbieMemberId, minutes);
  }

  /**
   * 사냥꾼 총 사냥 시간 Sorted Set 갱신 (ZINCRBY)
   * Sorted Set 키: newbie:moco:rank:{guildId}
   * member: hunterId, score += minutes
   */
  async incrMocoRank(guildId: string, hunterId: string, minutes: number): Promise<void> {
    await this.client.zincrby(NewbieKeys.mocoRank(guildId), minutes, hunterId);
  }

  /**
   * 사냥꾼 순위 페이지 조회 (ZREVRANGE WITH SCORES)
   * page는 1-based
   */
  async getMocoRankPage(
    guildId: string,
    page: number,
    pageSize: number,
  ): Promise<Array<{ hunterId: string; totalMinutes: number }>> {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const raw = await this.client.zrevrange(NewbieKeys.mocoRank(guildId), start, end, 'WITHSCORES');

    const result: Array<{ hunterId: string; totalMinutes: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({
        hunterId: raw[i],
        totalMinutes: parseFloat(raw[i + 1]),
      });
    }
    return result;
  }

  /**
   * 사냥꾼의 신규사용자별 상세 시간 조회 (HGETALL)
   * 반환값: { newbieMemberId: minutes }
   */
  async getMocoHunterDetail(guildId: string, hunterId: string): Promise<Record<string, number>> {
    const raw = await this.client.hgetall(NewbieKeys.mocoTotal(guildId, hunterId));
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      result[key] = parseFloat(value);
    }
    return result;
  }

  /** 전체 사냥꾼 수 조회 (ZCARD) */
  async getMocoRankCount(guildId: string): Promise<number> {
    return this.client.zcard(NewbieKeys.mocoRank(guildId));
  }

  /**
   * 특정 사냥꾼의 순위 조회 (ZREVRANK, 0-indexed → 1-indexed 변환)
   * 사냥꾼이 없으면 null 반환
   */
  async getMocoHunterRank(guildId: string, hunterId: string): Promise<number | null> {
    const rank = await this.client.zrevrank(NewbieKeys.mocoRank(guildId), hunterId);
    return rank !== null ? rank + 1 : null;
  }

  /**
   * 특정 사냥꾼의 총 사냥 시간(분) 조회 (ZSCORE)
   * 사냥꾼이 없으면 null 반환
   */
  async getMocoHunterScore(guildId: string, hunterId: string): Promise<number | null> {
    const score = await this.client.zscore(NewbieKeys.mocoRank(guildId), hunterId);
    return score !== null ? parseFloat(score) : null;
  }

  // --- 모코코 사냥 (점수 기반 신규) ---

  /** 채널 기반 시간 누적/차감 (INCRBY). 음수 delta로 롤백 가능. */
  async incrMocoChannelMinutes(guildId: string, hunterId: string, delta: number): Promise<number> {
    return this.client.incrby(NewbieKeys.mocoChannelMin(guildId, hunterId), delta);
  }

  /** 채널 기반 누적 시간 절대값 설정 (SET) — 부트스트랩 복원용 */
  async setMocoChannelMinutes(guildId: string, hunterId: string, minutes: number): Promise<void> {
    await this.client.set(NewbieKeys.mocoChannelMin(guildId, hunterId), String(minutes));
  }

  /** 채널 기반 누적 시간 조회 (GET) */
  async getMocoChannelMinutes(guildId: string, hunterId: string): Promise<number> {
    const val = await this.client.get(NewbieKeys.mocoChannelMin(guildId, hunterId));
    return val ? parseInt(val, 10) : 0;
  }

  /** 유효 세션 횟수 증가 (INCRBY) */
  async incrMocoSessionCount(guildId: string, hunterId: string, delta: number): Promise<number> {
    return this.client.incrby(NewbieKeys.mocoSessionCount(guildId, hunterId), delta);
  }

  /** 유효 세션 횟수 절대값 설정 (SET) — 부트스트랩 복원용 */
  async setMocoSessionCount(guildId: string, hunterId: string, count: number): Promise<void> {
    await this.client.set(NewbieKeys.mocoSessionCount(guildId, hunterId), String(count));
  }

  /** 유효 세션 횟수 조회 (GET) */
  async getMocoSessionCount(guildId: string, hunterId: string): Promise<number> {
    const val = await this.client.get(NewbieKeys.mocoSessionCount(guildId, hunterId));
    return val ? parseInt(val, 10) : 0;
  }

  /** 사냥꾼 순위 점수 설정 (ZADD — 절대값 설정, ZINCRBY가 아님) */
  async setMocoRankScore(guildId: string, hunterId: string, score: number): Promise<void> {
    await this.client.zadd(NewbieKeys.mocoRank(guildId), score, hunterId);
  }

  /** 고유 모코코 수 조회 (HLEN on mocoTotal hash) */
  async getMocoUniqueNewbieCount(guildId: string, hunterId: string): Promise<number> {
    return this.client.hlen(NewbieKeys.mocoTotal(guildId, hunterId));
  }

  /** 사냥꾼 메타 정보 저장 (HMSET) */
  async setMocoHunterMeta(
    guildId: string,
    hunterId: string,
    meta: { score: number; sessionCount: number; uniqueNewbieCount: number; totalMinutes: number },
  ): Promise<void> {
    const key = NewbieKeys.mocoMeta(guildId, hunterId);
    await this.client.hmset(key, {
      score: String(meta.score),
      sessionCount: String(meta.sessionCount),
      uniqueNewbieCount: String(meta.uniqueNewbieCount),
      totalMinutes: String(meta.totalMinutes),
    });
  }

  /** 사냥꾼 메타 정보 조회 (HGETALL) */
  async getMocoHunterMeta(
    guildId: string,
    hunterId: string,
  ): Promise<{
    score: number;
    sessionCount: number;
    uniqueNewbieCount: number;
    totalMinutes: number;
  } | null> {
    const raw = await this.client.hgetall(NewbieKeys.mocoMeta(guildId, hunterId));
    if (!raw || Object.keys(raw).length === 0) return null;
    return {
      score: parseInt(raw.score ?? '0', 10),
      sessionCount: parseInt(raw.sessionCount ?? '0', 10),
      uniqueNewbieCount: parseInt(raw.uniqueNewbieCount ?? '0', 10),
      totalMinutes: parseInt(raw.totalMinutes ?? '0', 10),
    };
  }

  /** 모코코별 세션 횟수 증가 (HINCRBY) */
  async incrMocoNewbieSession(
    guildId: string,
    hunterId: string,
    newbieId: string,
    count: number,
  ): Promise<void> {
    await this.client.hincrby(NewbieKeys.mocoNewbieSessions(guildId, hunterId), newbieId, count);
  }

  /** 모코코별 세션 횟수 전체 조회 (HGETALL) */
  async getMocoNewbieSessions(guildId: string, hunterId: string): Promise<Record<string, number>> {
    const raw = await this.client.hgetall(NewbieKeys.mocoNewbieSessions(guildId, hunterId));
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      result[key] = parseInt(value, 10);
    }
    return result;
  }
}
