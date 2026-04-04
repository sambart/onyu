import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  CO_PRESENCE_SESSION_ENDED,
  CO_PRESENCE_TICK,
  CoPresenceSessionEndedEvent,
  CoPresenceTickEvent,
} from '../../../channel/voice/co-presence/co-presence.events';
import { getErrorStack } from '../../../common/util/error.util';
import { MocoDbRepository } from '../../infrastructure/moco-db.repository';
import { NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { NewbieConfigRepository } from '../../infrastructure/newbie-config.repository';
import { NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import type { MocoMemberResolver } from './moco-member-resolver.port';
import { MOCO_MEMBER_RESOLVER } from './moco-member-resolver.port';

/**
 * 플레이횟수 카운팅 누적 상태.
 * co-presence flush(15분)로 분할된 세션을 누적하여 최소 참여시간 도달 시 1회로 카운트한다.
 * key: `${guildId}:${hunterId}`
 */
interface PlayCountAccumulator {
  accumulatedMin: number;
  lastCountedAt: number;
}
const playCountAccumulators = new Map<string, PlayCountAccumulator>();

@Injectable()
export class MocoEventHandler {
  private readonly logger = new Logger(MocoEventHandler.name);

  constructor(
    private readonly configRepo: NewbieConfigRepository,
    private readonly mocoDbRepo: MocoDbRepository,
    private readonly newbieRedis: NewbieRedisRepository,
    @Inject(MOCO_MEMBER_RESOLVER)
    private readonly memberResolver: MocoMemberResolver,
  ) {}

  // ── tick 이벤트: 실시간 Redis 누적 ──

  @OnEvent(CO_PRESENCE_TICK)
  async handleTick(event: CoPresenceTickEvent): Promise<void> {
    for (const snapshot of event.snapshots) {
      try {
        await this.processTickSnapshot(snapshot.guildId, snapshot.channelId, snapshot.userIds);
      } catch (err) {
        this.logger.error(`[MOCO EVENT] tick failed guild=${snapshot.guildId}`, getErrorStack(err));
      }
    }
  }

  private async processTickSnapshot(
    guildId: string,
    channelId: string,
    userIds: string[],
  ): Promise<void> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.mocoEnabled) return;

    const newbieDays = config.mocoNewbieDays ?? 30;
    const cutoff = Date.now() - newbieDays * 86_400_000;

    const confirmedNewbies = await this.memberResolver.getNewbieIds(
      guildId,
      channelId,
      userIds,
      cutoff,
    );
    if (confirmedNewbies.length === 0) return;

    const newbieSet = new Set(confirmedNewbies);

    const hunters = config.mocoAllowNewbieHunter
      ? userIds
      : userIds.filter((id) => !newbieSet.has(id));

    for (const hunterId of hunters) {
      const relevantNewbies = confirmedNewbies.filter((id) => id !== hunterId);
      if (relevantNewbies.length === 0) continue;

      for (const newbieId of relevantNewbies) {
        await this.newbieRedis.incrMocoMinutes(guildId, hunterId, newbieId, 1);
      }
      await this.newbieRedis.incrMocoChannelMinutes(guildId, hunterId, 1);
    }
  }

  // ── 세션 종료 이벤트: 유효성 판정 + DB 저장 + 랭크 갱신 ──

  @OnEvent(CO_PRESENCE_SESSION_ENDED)
  async handleSessionEnded(event: CoPresenceSessionEndedEvent): Promise<void> {
    try {
      await this.processSessionEnded(event);
    } catch (err) {
      this.logger.error(
        `[MOCO EVENT] session ended failed guild=${event.guildId} user=${event.userId}`,
        getErrorStack(err),
      );
    }
  }

  private async processSessionEnded(event: CoPresenceSessionEndedEvent): Promise<void> {
    const config = await this.configRepo.findByGuildId(event.guildId);
    if (!config?.mocoEnabled) return;

    const {
      guildId,
      userId: hunterId,
      channelId,
      startedAt,
      endedAt,
      durationMin,
      peerIds,
    } = event;
    const newbieDays = config.mocoNewbieDays ?? 30;
    const cutoff = Date.now() - newbieDays * 86_400_000;

    // 사냥꾼 자격 확인
    const isValidHunter = await this.memberResolver.isValidHunter(
      guildId,
      hunterId,
      cutoff,
      config.mocoAllowNewbieHunter ?? false,
    );
    if (!isValidHunter) return;

    // peerIds 중 모코코(신입) 필터링
    const peersExcludingHunter = peerIds.filter((id) => id !== hunterId);
    const confirmedNewbies = await this.memberResolver.getNewbiePeerIds(
      guildId,
      peersExcludingHunter,
      cutoff,
    );
    if (confirmedNewbies.length === 0) return;

    const minMinutes = config.mocoMinCoPresenceMin ?? 10;

    if (durationMin >= minMinutes) {
      // ── 유효 세션 ──
      await this.mocoDbRepo.saveSession({
        guildId,
        hunterId,
        channelId,
        startedAt,
        endedAt,
        durationMin,
        newbieMemberIds: confirmedNewbies,
        isValid: true,
      });

      const countsAsPlay = this.shouldCountAsPlay(
        guildId,
        hunterId,
        startedAt,
        durationMin,
        config,
      );

      if (countsAsPlay) {
        await this.newbieRedis.incrMocoSessionCount(guildId, hunterId, 1);
        for (const newbieId of confirmedNewbies) {
          await this.newbieRedis.incrMocoNewbieSession(guildId, hunterId, newbieId, 1);
        }
      }

      const scoreWeights = {
        perSession: config.mocoScorePerSession ?? 10,
        perMinute: config.mocoScorePerMinute ?? 1,
        perUnique: config.mocoScorePerUnique ?? 5,
      };

      await this.mocoDbRepo.upsertDaily(
        guildId,
        hunterId,
        this.toDateString(),
        {
          channelMinutes: durationMin,
          sessionCount: countsAsPlay ? 1 : 0,
          uniqueNewbieCount: confirmedNewbies.length,
        },
        scoreWeights,
      );

      await this.recalculateScore(guildId, hunterId, config);
    } else {
      // ── 무효 세션 — Redis 롤백 ──
      await this.newbieRedis.incrMocoChannelMinutes(guildId, hunterId, -durationMin);

      for (const newbieId of confirmedNewbies) {
        const peerMin = event.peerMinutes[newbieId] ?? 0;
        if (peerMin > 0) {
          await this.newbieRedis.incrMocoMinutes(guildId, hunterId, newbieId, -peerMin);
        }
      }

      await this.mocoDbRepo.saveSession({
        guildId,
        hunterId,
        channelId,
        startedAt,
        endedAt,
        durationMin,
        newbieMemberIds: confirmedNewbies,
        isValid: false,
      });
    }
  }

  private shouldCountAsPlay(
    guildId: string,
    hunterId: string,
    startedAt: Date,
    durationMin: number,
    config: NewbieConfig,
  ): boolean {
    const key = `${guildId}:${hunterId}`;
    const acc = playCountAccumulators.get(key);

    // 시간 간격 병합: 이전 카운트 이후 intervalMin 이내면 동일 1회 — 누적하지 않음
    const intervalMin = config.mocoPlayCountIntervalMin;
    if (intervalMin !== null && intervalMin !== undefined && acc?.lastCountedAt) {
      if (startedAt.getTime() - acc.lastCountedAt < intervalMin * 60_000) {
        return false;
      }
    }

    // 최소 참여시간: flush 분할 세션을 누적하여 minDuration 도달 시 카운트
    const newAccumulated = (acc?.accumulatedMin ?? 0) + durationMin;
    const minDuration = config.mocoPlayCountMinDurationMin;

    if (minDuration !== null && minDuration !== undefined && newAccumulated < minDuration) {
      playCountAccumulators.set(key, {
        accumulatedMin: newAccumulated,
        lastCountedAt: acc?.lastCountedAt ?? 0,
      });
      return false;
    }

    // 조건 충족 → 카운트하고 누적 리셋
    playCountAccumulators.set(key, {
      accumulatedMin: 0,
      lastCountedAt: startedAt.getTime(),
    });
    return true;
  }

  private async recalculateScore(
    guildId: string,
    hunterId: string,
    config: NewbieConfig,
  ): Promise<void> {
    const [channelMinutes, sessionCount, uniqueNewbieCount] = await Promise.all([
      this.newbieRedis.getMocoChannelMinutes(guildId, hunterId),
      this.newbieRedis.getMocoSessionCount(guildId, hunterId),
      this.newbieRedis.getMocoUniqueNewbieCount(guildId, hunterId),
    ]);

    const score =
      sessionCount * (config.mocoScorePerSession ?? 10) +
      channelMinutes * (config.mocoScorePerMinute ?? 1) +
      uniqueNewbieCount * (config.mocoScorePerUnique ?? 5);

    await this.newbieRedis.setMocoRankScore(guildId, hunterId, score);
    await this.newbieRedis.setMocoHunterMeta(guildId, hunterId, {
      score,
      sessionCount,
      uniqueNewbieCount,
      totalMinutes: channelMinutes,
    });
  }

  private toDateString(date: Date = new Date()): string {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10).replace(/-/g, '');
  }
}
