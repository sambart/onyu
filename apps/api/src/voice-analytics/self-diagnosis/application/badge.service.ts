import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { VoiceCoPresencePairDailyOrm } from '../../../channel/voice/co-presence/infrastructure/voice-co-presence-pair-daily.orm-entity';
import { VoiceDailyOrm } from '../../../channel/voice/infrastructure/voice-daily.orm-entity';
import { MocoHuntingDailyOrmEntity as MocoHuntingDaily } from '../../../newbie/infrastructure/moco-hunting-daily.orm-entity';
import { VoiceHealthBadgeOrmEntity as VoiceHealthBadge } from '../infrastructure/voice-health-badge.orm-entity';
import { VoiceHealthConfigOrmEntity as VoiceHealthConfig } from '../infrastructure/voice-health-config.orm-entity';
import { BADGE_CODE, type BadgeCode } from './badge.constants';
import { calculateHhi } from './hhi-calculator';

const BATCH_SIZE = 100;
const SECONDS_PER_MINUTE = 60;
const TOP_PERCENT_DIVISOR = 100;

interface ActivityStats {
  userId: string;
  totalSec: string;
  activeDays: string;
}

interface PeerStats {
  userId: string;
  peerId: string;
  totalMinutes: string;
}

interface MocoStats {
  hunterId: string;
  totalScore: string;
}

interface UserBadgeData {
  guildId: string;
  userId: string;
  badges: string[];
  activityRank: number | null;
  activityTopPercent: number | null;
  hhiScore: number | null;
  mocoRank: number | null;
  mocoTopPercent: number | null;
  micUsageRate: number | null;
  activeDaysRatio: number | null;
  calculatedAt: Date;
}

@Injectable()
export class BadgeService {
  constructor(
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    @InjectRepository(VoiceCoPresencePairDailyOrm)
    private readonly pairDailyRepo: Repository<VoiceCoPresencePairDailyOrm>,
    @InjectRepository(MocoHuntingDaily)
    private readonly mocoRepo: Repository<MocoHuntingDaily>,
    @InjectRepository(VoiceHealthBadge)
    private readonly badgeRepo: Repository<VoiceHealthBadge>,
  ) {}

  /**
   * 길드 내 전체 멤버의 뱃지 자격을 판정하고 일괄 upsert한다.
   * BadgeScheduler에서 호출된다.
   *
   * @returns 처리된 사용자 수
   */
  // eslint-disable-next-line max-lines-per-function
  async judgeAll(config: VoiceHealthConfig): Promise<number> {
    const { guildId, analysisDays } = config;
    const { startDate, endDate, startDateDash, endDateDash } = this.buildDateRange(analysisDays);

    // 1. 활동량 순위 산출 (개별 채널 합산 — GLOBAL에는 channelDurationSec이 0)
    const activityRows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.userId', 'userId')
      .addSelect('SUM(vd.channelDurationSec)', 'totalSec')
      .addSelect('COUNT(DISTINCT vd.date)', 'activeDays')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.channelId != :globalId', { globalId: 'GLOBAL' })
      .andWhere('vd.date >= :startDate', { startDate })
      .andWhere('vd.date <= :endDate', { endDate })
      .groupBy('vd.userId')
      .orderBy('"totalSec"', 'DESC')
      .getRawMany<ActivityStats>();

    // 2. HHI 산출: 사용자별 peer 시간 일괄 조회 (단방향 저장: userId < peerId)
    const pairRows = await this.pairDailyRepo
      .createQueryBuilder('pd')
      .select('pd.userId', 'userId')
      .addSelect('pd.peerId', 'peerId')
      .addSelect('SUM(pd.minutes)', 'totalMinutes')
      .where('pd.guildId = :guildId', { guildId })
      .andWhere('pd.date >= :startDate', { startDate: startDateDash })
      .andWhere('pd.date <= :endDate', { endDate: endDateDash })
      .groupBy('pd.userId')
      .addGroupBy('pd.peerId')
      .getRawMany<PeerStats>();

    // 단방향 레코드를 양방향 peer 맵으로 전개
    const peerMap = new Map<string, Array<{ peerId: string; minutes: number }>>();
    for (const row of pairRows) {
      const minutes = Number(row.totalMinutes);

      // userId → peerId 방향
      const listA = peerMap.get(row.userId) ?? [];
      listA.push({ peerId: row.peerId, minutes });
      peerMap.set(row.userId, listA);

      // peerId → userId 방향 (역방향 복원)
      const listB = peerMap.get(row.peerId) ?? [];
      listB.push({ peerId: row.userId, minutes });
      peerMap.set(row.peerId, listB);
    }

    // 3. 모코코 순위 산출
    const mocoRows = await this.mocoRepo
      .createQueryBuilder('mh')
      .select('mh.hunterId', 'hunterId')
      .addSelect('SUM(mh.score)', 'totalScore')
      .where('mh.guildId = :guildId', { guildId })
      .andWhere('mh.date >= :startDate', { startDate })
      .andWhere('mh.date <= :endDate', { endDate })
      .groupBy('mh.hunterId')
      .orderBy('"totalScore"', 'DESC')
      .getRawMany<MocoStats>();

    const mocoRankMap = new Map<string, { rank: number; topPercent: number }>();
    const mocoTotal = mocoRows.length;
    mocoRows.forEach((row, idx) => {
      const rank = idx + 1;
      const topPercent =
        mocoTotal > 0 ? (rank / mocoTotal) * TOP_PERCENT_DIVISOR : TOP_PERCENT_DIVISOR;
      mocoRankMap.set(row.hunterId, { rank, topPercent });
    });

    // 4. 참여 패턴 산출 (micOnSec/aloneSec은 GLOBAL, channelDurationSec은 개별 채널)
    // activityRows에서 이미 개별 채널 duration 합산이 있으므로 재사용
    const durationMap = new Map<string, number>();
    for (const row of activityRows) {
      durationMap.set(row.userId, Number(row.totalSec));
    }

    const globalRows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.userId', 'userId')
      .addSelect('SUM(vd.micOnSec)', 'totalMicOnSec')
      .addSelect('SUM(vd.aloneSec)', 'totalAloneSec')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.channelId = :globalId', { globalId: 'GLOBAL' })
      .andWhere('vd.date >= :startDate', { startDate })
      .andWhere('vd.date <= :endDate', { endDate })
      .groupBy('vd.userId')
      .getRawMany<{ userId: string; totalMicOnSec: string; totalAloneSec: string }>();

    const patternMap = new Map<string, { micRate: number; aloneRatio: number }>();
    for (const row of globalRows) {
      const duration = durationMap.get(row.userId) ?? 0;
      const micRate = duration > 0 ? Number(row.totalMicOnSec) / duration : 0;
      const aloneRatio = duration > 0 ? Number(row.totalAloneSec) / duration : 0;
      patternMap.set(row.userId, { micRate, aloneRatio });
    }

    // 5. 뱃지 판정 (사용자별)
    const activityTotal = activityRows.length;
    const badges: UserBadgeData[] = activityRows.map((row, idx) => {
      const rank = idx + 1;
      const topPercent =
        activityTotal > 0 ? (rank / activityTotal) * TOP_PERCENT_DIVISOR : TOP_PERCENT_DIVISOR;
      const activeDays = Number(row.activeDays);
      const activeDaysRatio = activeDays / analysisDays;
      const totalMinutes = Number(row.totalSec) / SECONDS_PER_MINUTE;

      const peers = peerMap.get(row.userId) ?? [];
      const hhiScore = calculateHhi(peers.map((p) => ({ peerId: p.peerId, minutes: p.minutes })));
      const peerCount = peers.length;

      const mocoData = mocoRankMap.get(row.userId);
      const mocoRank = mocoData?.rank ?? null;
      const mocoTopPercent = mocoData?.topPercent ?? null;

      const pattern = patternMap.get(row.userId);
      const micUsageRate = pattern?.micRate ?? 0;

      const earnedBadges: BadgeCode[] = [];

      // ACTIVITY: 활동 상위 N% 이내
      if (topPercent <= config.badgeActivityTopPercent) {
        earnedBadges.push(BADGE_CODE.ACTIVITY);
      }
      // SOCIAL: HHI 낮음(다양) + peer 수 충분
      if (hhiScore <= config.badgeSocialHhiMax && peerCount >= config.badgeSocialMinPeers) {
        earnedBadges.push(BADGE_CODE.SOCIAL);
      }
      // HUNTER: 모코코 기여 상위 N% 이내
      if (mocoTopPercent !== null && mocoTopPercent <= config.badgeHunterTopPercent) {
        earnedBadges.push(BADGE_CODE.HUNTER);
      }
      // CONSISTENT: 활동일 비율 충족
      if (activeDaysRatio >= config.badgeConsistentMinRatio) {
        earnedBadges.push(BADGE_CODE.CONSISTENT);
      }
      // MIC: 마이크 사용 비율 충족
      if (micUsageRate >= config.badgeMicMinRate) {
        earnedBadges.push(BADGE_CODE.MIC);
      }

      // no-magic-numbers: totalMinutes는 활동량 기준 0 체크용 (활동 없는 사용자 제외 로직은 activityRows에서 이미 필터됨)
      void totalMinutes;

      return {
        guildId,
        userId: row.userId,
        badges: earnedBadges,
        activityRank: rank,
        activityTopPercent: topPercent,
        hhiScore,
        mocoRank,
        mocoTopPercent,
        micUsageRate,
        activeDaysRatio,
        calculatedAt: new Date(),
      };
    });

    // 6. 배치 upsert (100건씩)
    for (let i = 0; i < badges.length; i += BATCH_SIZE) {
      const batch = badges.slice(i, i + BATCH_SIZE);
      await this.badgeRepo.upsert(batch, ['guildId', 'userId']);
    }

    return badges.length;
  }

  /** KST 기준 날짜 범위를 계산한다. YYYYMMDD 및 YYYY-MM-DD 형식 모두 반환. */
  private buildDateRange(analysisDays: number): {
    startDate: string;
    endDate: string;
    startDateDash: string;
    endDateDash: string;
  } {
    const now = new Date();
    // KST = UTC+9
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);

    // 어제 (endDate)
    const yesterday = new Date(kstNow);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    // analysisDays 전 (startDate)
    const start = new Date(kstNow);
    start.setUTCDate(start.getUTCDate() - analysisDays);

    const toYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const toDash = (d: Date) => d.toISOString().slice(0, 10);

    return {
      startDate: toYYYYMMDD(start),
      endDate: toYYYYMMDD(yesterday),
      startDateDash: toDash(start),
      endDateDash: toDash(yesterday),
    };
  }
}
