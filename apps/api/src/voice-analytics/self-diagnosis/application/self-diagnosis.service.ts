import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { VoiceCoPresencePairDailyOrm } from '../../../channel/voice/co-presence/infrastructure/voice-co-presence-pair-daily.orm-entity';
import { VoiceDailyOrm } from '../../../channel/voice/infrastructure/voice-daily.orm-entity';
import type { LlmProvider } from '../../../common/llm/llm-provider.interface';
import {
  LLM_PROVIDER,
  LlmQuotaExhaustedException,
} from '../../../common/llm/llm-provider.interface';
import { MocoHuntingDailyOrmEntity as MocoHuntingDaily } from '../../../newbie/infrastructure/moco-hunting-daily.orm-entity';
import { RedisService } from '../../../redis/redis.service';
import { VoiceHealthKeys } from '../infrastructure/voice-health-cache.keys';
import { VoiceHealthConfigOrmEntity as VoiceHealthConfig } from '../infrastructure/voice-health-config.orm-entity';
import { VoiceHealthConfigRepository } from '../infrastructure/voice-health-config.repository';
import { BADGE_CODE, BADGE_DISPLAY, type BadgeCode } from './badge.constants';
import { BadgeQueryService } from './badge-query.service';
import { calculateHhi, getTopPeers, hhiToDiversityScore } from './hhi-calculator';
import type { BadgeGuide, PeerInfo, SelfDiagnosisResult, Verdict } from './self-diagnosis.types';

const SECONDS_PER_MINUTE = 60;
const TOP_PEER_COUNT = 3;
const TOP_PERCENT_DIVISOR = 100;
const GLOBAL_CHANNEL_ID = 'GLOBAL';

interface RawActivity {
  userId: string;
  totalSec: string;
  activeDays: string;
}

interface RawPeer {
  peerId: string;
  totalMinutes: string;
}

interface RawMoco {
  hunterId: string;
  totalScore: string;
  totalNewbies: string;
}

interface QueryRange {
  guildId: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export class DiagnosisDisabledException extends Error {
  constructor() {
    super('자가진단 기능이 활성화되지 않았습니다.');
  }
}

export class DiagnosisCooldownException extends Error {
  constructor(public readonly remainingSeconds: number) {
    super('쿨다운 중입니다.');
  }
}

@Injectable()
export class SelfDiagnosisService {
  private readonly logger = new Logger(SelfDiagnosisService.name);

  // eslint-disable-next-line max-params
  constructor(
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    @InjectRepository(VoiceCoPresencePairDailyOrm)
    private readonly pairDailyRepo: Repository<VoiceCoPresencePairDailyOrm>,
    @InjectRepository(MocoHuntingDaily)
    private readonly mocoRepo: Repository<MocoHuntingDaily>,
    private readonly configRepo: VoiceHealthConfigRepository,
    private readonly redis: RedisService,
    private readonly badgeQueryService: BadgeQueryService,
    @Inject(LLM_PROVIDER)
    @Optional()
    private readonly llmProvider?: LlmProvider,
  ) {}

  /**
   * 사용자의 음성 활동을 진단하고 결과를 반환한다.
   * @throws DiagnosisDisabledException 기능 비활성화 또는 설정 없음
   * @throws DiagnosisCooldownException 쿨다운 중
   */
  // eslint-disable-next-line max-lines-per-function
  async diagnose(guildId: string, userId: string): Promise<SelfDiagnosisResult> {
    // 1. 설정 조회
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.isEnabled) {
      throw new DiagnosisDisabledException();
    }

    // 2. 쿨다운 체크
    const cooldownKey = VoiceHealthKeys.cooldown(guildId, userId);
    if (config.isCooldownEnabled) {
      const isOnCooldown = await this.redis.exists(cooldownKey);
      if (isOnCooldown) {
        const remaining = await this.redis.ttl(cooldownKey);
        throw new DiagnosisCooldownException(remaining);
      }
    }

    // 3. 날짜 범위 계산
    const { startDate, endDate, startDateDash, endDateDash } = this.buildDateRange(
      config.analysisDays,
    );

    const range: QueryRange = { guildId, userId, startDate, endDate };
    const rangeWithDash: QueryRange = {
      guildId,
      userId,
      startDate: startDateDash,
      endDate: endDateDash,
    };

    // 4. 활동량 수집
    const activityData = await this.collectActivity(range);

    // 5. 관계 다양성 수집
    const relationshipData = await this.collectRelationship(rangeWithDash);

    // 6. 모코코 기여 수집
    const mocoData = await this.collectMoco(range);

    // 7. 참여 패턴 수집
    const patternData = await this.collectPattern(range);

    // 8. 정책 판정
    const activeDaysRatio = activityData.activeDays / config.analysisDays;
    const verdicts = this.buildVerdicts(config, {
      totalMinutes: activityData.totalMinutes,
      activeDaysRatio,
      hhiScore: relationshipData.hhiScore,
      peerCount: relationshipData.peerCount,
    });

    // 9. 뱃지 조회 + 달성 가이드
    const badgeCodes = await this.badgeQueryService.findBadgeCodes(guildId, userId);
    const badgeGuides = this.buildBadgeGuides({
      config,
      earnedBadges: badgeCodes as BadgeCode[],
      activityTopPercent: activityData.topPercent,
      hhiScore: relationshipData.hhiScore,
      peerCount: relationshipData.peerCount,
      hasMocoActivity: mocoData.hasMocoActivity,
      mocoTopPercent: mocoData.topPercent,
      activeDaysRatio,
      micUsageRate: patternData.micUsageRate,
    });

    // 10. 쿨다운 설정
    if (config.isCooldownEnabled) {
      const cooldownTtl = config.cooldownHours * SECONDS_PER_MINUTE * SECONDS_PER_MINUTE;
      await this.redis.set(cooldownKey, true, cooldownTtl);
    }

    const result: SelfDiagnosisResult = {
      totalMinutes: activityData.totalMinutes,
      activeDays: activityData.activeDays,
      totalDays: config.analysisDays,
      activeDaysRatio,
      avgDailyMinutes:
        activityData.activeDays > 0 ? activityData.totalMinutes / activityData.activeDays : 0,
      activityRank: activityData.rank,
      activityTotalUsers: activityData.totalUsers,
      activityTopPercent: activityData.topPercent,
      peerCount: relationshipData.peerCount,
      hhiScore: relationshipData.hhiScore,
      topPeers: relationshipData.topPeers,
      hasMocoActivity: mocoData.hasMocoActivity,
      mocoScore: mocoData.score,
      mocoRank: mocoData.rank,
      mocoTotalUsers: mocoData.totalUsers,
      mocoTopPercent: mocoData.topPercent,
      mocoHelpedNewbies: mocoData.helpedNewbies,
      micUsageRate: patternData.micUsageRate,
      aloneRatio: patternData.aloneRatio,
      verdicts,
      badges: badgeCodes as BadgeCode[],
      badgeGuides,
    };

    // 11. 결과 캐싱 (LLM 요약 생성용, 최소 5분)
    if (config.isLlmSummaryEnabled) {
      const resultCacheKey = VoiceHealthKeys.result(guildId, userId);
      const minTtl = 5 * SECONDS_PER_MINUTE;
      const cooldownTtl = config.cooldownHours * SECONDS_PER_MINUTE * SECONDS_PER_MINUTE;
      await this.redis.set(resultCacheKey, result, Math.max(cooldownTtl, minTtl));
    }

    return result;
  }

  /**
   * 캐싱된 진단 결과를 기반으로 LLM 요약을 생성한다.
   * diagnose() 호출 후 별도 요청으로 사용한다.
   */
  async generateLlmSummaryFromCache(guildId: string, userId: string): Promise<string | undefined> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config?.isEnabled || !config.isLlmSummaryEnabled || !this.llmProvider) {
      this.logger.warn(
        `generateLlmSummaryFromCache early return: enabled=${config?.isEnabled}, llmEnabled=${config?.isLlmSummaryEnabled}, hasProvider=${!!this.llmProvider}`,
      );
      return undefined;
    }

    const resultCacheKey = VoiceHealthKeys.result(guildId, userId);
    const cached = await this.redis.get<SelfDiagnosisResult>(resultCacheKey);
    if (!cached) {
      this.logger.warn(`generateLlmSummaryFromCache: no cached result for ${resultCacheKey}`);
      return undefined;
    }

    this.logger.log(`generateLlmSummaryFromCache: generating LLM summary for ${guildId}:${userId}`);
    return this.generateLlmSummary({
      activityData: {
        totalMinutes: cached.totalMinutes,
        activeDays: cached.activeDays,
        rank: cached.activityRank,
        totalUsers: cached.activityTotalUsers,
        topPercent: cached.activityTopPercent,
      },
      relationshipData: {
        peerCount: cached.peerCount,
        hhiScore: cached.hhiScore,
      },
      mocoData: {
        hasMocoActivity: cached.hasMocoActivity,
        score: cached.mocoScore,
        rank: cached.mocoRank,
        totalUsers: cached.mocoTotalUsers,
        topPercent: cached.mocoTopPercent,
        helpedNewbies: cached.mocoHelpedNewbies,
      },
      patternData: {
        micUsageRate: cached.micUsageRate,
        aloneRatio: cached.aloneRatio,
      },
      verdicts: cached.verdicts,
      topPeers: cached.topPeers,
      badgeGuides: cached.badgeGuides,
      config,
    });
  }

  private async collectActivity({ guildId, userId, startDate, endDate }: QueryRange): Promise<{
    totalMinutes: number;
    activeDays: number;
    rank: number;
    totalUsers: number;
    topPercent: number;
  }> {
    // 서버 전체 사용자별 활동 시간 순위 (개별 채널 합산 — GLOBAL에는 channelDurationSec이 0)
    const rankings = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.userId', 'userId')
      .addSelect('SUM(vd.channelDurationSec)', 'totalSec')
      .addSelect('COUNT(DISTINCT vd.date)', 'activeDays')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.channelId != :globalId', { globalId: GLOBAL_CHANNEL_ID })
      .andWhere('vd.date >= :startDate', { startDate })
      .andWhere('vd.date <= :endDate', { endDate })
      .groupBy('vd.userId')
      .orderBy('"totalSec"', 'DESC')
      .getRawMany<RawActivity>();

    const totalUsers = rankings.length;
    const userIndex = rankings.findIndex((r) => r.userId === userId);
    const rank = userIndex >= 0 ? userIndex + 1 : totalUsers + 1;
    const topPercent =
      totalUsers > 0 ? (rank / totalUsers) * TOP_PERCENT_DIVISOR : TOP_PERCENT_DIVISOR;

    const userRow = userIndex >= 0 ? rankings[userIndex] : null;
    const totalMinutes = userRow ? Number(userRow.totalSec) / SECONDS_PER_MINUTE : 0;
    const activeDays = userRow ? Number(userRow.activeDays) : 0;

    return { totalMinutes, activeDays, rank, totalUsers, topPercent };
  }

  private async collectRelationship({ guildId, userId, startDate, endDate }: QueryRange): Promise<{
    peerCount: number;
    hhiScore: number;
    topPeers: PeerInfo[];
  }> {
    // 단방향 저장(userId < peerId)이므로 양쪽 방향 모두 조회하여 합산
    const [asUserRows, asPeerRows] = await Promise.all([
      this.pairDailyRepo
        .createQueryBuilder('pd')
        .select('pd.peerId', 'peerId')
        .addSelect('SUM(pd.minutes)', 'totalMinutes')
        .where('pd.guildId = :guildId', { guildId })
        .andWhere('pd.userId = :userId', { userId })
        .andWhere('pd.date >= :startDate', { startDate })
        .andWhere('pd.date <= :endDate', { endDate })
        .groupBy('pd.peerId')
        .getRawMany<RawPeer>(),
      this.pairDailyRepo
        .createQueryBuilder('pd')
        .select('pd.userId', 'peerId')
        .addSelect('SUM(pd.minutes)', 'totalMinutes')
        .where('pd.guildId = :guildId', { guildId })
        .andWhere('pd.peerId = :userId', { userId })
        .andWhere('pd.date >= :startDate', { startDate })
        .andWhere('pd.date <= :endDate', { endDate })
        .groupBy('pd.userId')
        .getRawMany<RawPeer>(),
    ]);

    // 양쪽 결과를 peerId 기준으로 합산
    const peerMinutesMap = new Map<string, number>();
    for (const row of [...asUserRows, ...asPeerRows]) {
      const existing = peerMinutesMap.get(row.peerId) ?? 0;
      peerMinutesMap.set(row.peerId, existing + Number(row.totalMinutes));
    }

    const peerTimes = [...peerMinutesMap.entries()].map(([peerId, minutes]) => ({
      peerId,
      minutes,
    }));

    const hhiScore = calculateHhi(peerTimes);
    const peerCount = peerTimes.length;
    const topRaw = getTopPeers(peerTimes, TOP_PEER_COUNT);

    // peer 이름은 VoiceDaily userName으로 해결 (없으면 userId 그대로)
    const peerIds = topRaw.map((p) => p.peerId);
    const nameMap = await this.resolvePeerNames(guildId, peerIds);

    const topPeers: PeerInfo[] = topRaw.map((p) => ({
      userId: p.peerId,
      userName: nameMap.get(p.peerId) ?? p.peerId,
      minutes: p.minutes,
      ratio: p.ratio,
    }));

    return { peerCount, hhiScore, topPeers };
  }

  private async resolvePeerNames(guildId: string, userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.voiceDailyRepo
      .createQueryBuilder('vd')
      .select('vd.userId', 'userId')
      .addSelect('MAX(vd.userName)', 'userName')
      .where('vd.guildId = :guildId', { guildId })
      .andWhere('vd.userId IN (:...userIds)', { userIds })
      .andWhere('vd.channelId = :channelId', { channelId: GLOBAL_CHANNEL_ID })
      .groupBy('vd.userId')
      .getRawMany<{ userId: string; userName: string }>();

    return new Map(rows.map((r) => [r.userId, r.userName]));
  }

  private async collectMoco({ guildId, userId, startDate, endDate }: QueryRange): Promise<{
    hasMocoActivity: boolean;
    score: number;
    rank: number;
    totalUsers: number;
    topPercent: number;
    helpedNewbies: number;
  }> {
    const mocoRankings = await this.mocoRepo
      .createQueryBuilder('mh')
      .select('mh.hunterId', 'hunterId')
      .addSelect('SUM(mh.score)', 'totalScore')
      .addSelect('SUM(mh.uniqueNewbieCount)', 'totalNewbies')
      .where('mh.guildId = :guildId', { guildId })
      .andWhere('mh.date >= :startDate', { startDate })
      .andWhere('mh.date <= :endDate', { endDate })
      .groupBy('mh.hunterId')
      .orderBy('"totalScore"', 'DESC')
      .getRawMany<RawMoco>();

    const totalUsers = mocoRankings.length;
    const userIndex = mocoRankings.findIndex((r) => r.hunterId === userId);
    const hasMocoActivity = userIndex >= 0;
    const rank = hasMocoActivity ? userIndex + 1 : totalUsers + 1;
    const topPercent =
      totalUsers > 0
        ? Math.min((rank / totalUsers) * TOP_PERCENT_DIVISOR, TOP_PERCENT_DIVISOR)
        : TOP_PERCENT_DIVISOR;

    const userRow = hasMocoActivity ? mocoRankings[userIndex] : null;
    const score = userRow ? Number(userRow.totalScore) : 0;
    // uniqueNewbieCount는 일별 값이므로 SUM은 연인원 기준 (날짜별 중복 가능)
    const helpedNewbies = userRow ? Number(userRow.totalNewbies) : 0;

    return { hasMocoActivity, score, rank, totalUsers, topPercent, helpedNewbies };
  }

  private async collectPattern({
    guildId,
    userId,
    startDate,
    endDate,
  }: QueryRange): Promise<{ micUsageRate: number; aloneRatio: number }> {
    // channelDurationSec은 개별 채널에, micOnSec/aloneSec은 GLOBAL에 저장되므로 각각 조회
    const [durationRow, globalRow] = await Promise.all([
      this.voiceDailyRepo
        .createQueryBuilder('vd')
        .select('SUM(vd.channelDurationSec)', 'totalDurationSec')
        .where('vd.guildId = :guildId', { guildId })
        .andWhere('vd.userId = :userId', { userId })
        .andWhere('vd.channelId != :globalId', { globalId: GLOBAL_CHANNEL_ID })
        .andWhere('vd.date >= :startDate', { startDate })
        .andWhere('vd.date <= :endDate', { endDate })
        .getRawOne<{ totalDurationSec: string }>(),
      this.voiceDailyRepo
        .createQueryBuilder('vd')
        .select('SUM(vd.micOnSec)', 'totalMicOnSec')
        .addSelect('SUM(vd.aloneSec)', 'totalAloneSec')
        .where('vd.guildId = :guildId', { guildId })
        .andWhere('vd.userId = :userId', { userId })
        .andWhere('vd.channelId = :globalId', { globalId: GLOBAL_CHANNEL_ID })
        .andWhere('vd.date >= :startDate', { startDate })
        .andWhere('vd.date <= :endDate', { endDate })
        .getRawOne<{ totalMicOnSec: string; totalAloneSec: string }>(),
    ]);

    const duration = durationRow ? Number(durationRow.totalDurationSec) : 0;
    const micUsageRate = duration > 0 ? Number(globalRow?.totalMicOnSec ?? 0) / duration : 0;
    const aloneRatio = duration > 0 ? Number(globalRow?.totalAloneSec ?? 0) / duration : 0;

    return { micUsageRate, aloneRatio };
  }

  private buildVerdicts(
    config: {
      minActivityMinutes: number;
      minActiveDaysRatio: number;
      hhiThreshold: number;
      minPeerCount: number;
    },
    stats: { totalMinutes: number; activeDaysRatio: number; hhiScore: number; peerCount: number },
  ): Verdict[] {
    const { totalMinutes, activeDaysRatio, hhiScore, peerCount } = stats;
    return [
      {
        category: '활동량',
        isPassed: totalMinutes >= config.minActivityMinutes,
        criterion: `${config.minActivityMinutes}분 이상`,
        actual: `${Math.floor(totalMinutes)}분`,
      },
      {
        category: '활동 일수',
        isPassed: activeDaysRatio >= Number(config.minActiveDaysRatio),
        criterion: `활동일 비율 ${Math.round(Number(config.minActiveDaysRatio) * TOP_PERCENT_DIVISOR)}% 이상`,
        actual: `${Math.round(activeDaysRatio * TOP_PERCENT_DIVISOR)}%`,
      },
      {
        category: '관계 다양성',
        isPassed: hhiScore <= Number(config.hhiThreshold),
        criterion: `${hhiToDiversityScore(Number(config.hhiThreshold))}점 이상`,
        actual: `${hhiToDiversityScore(hhiScore)}점`,
      },
      {
        category: '교류 인원',
        isPassed: peerCount >= config.minPeerCount,
        criterion: `${config.minPeerCount}명 이상`,
        actual: `${peerCount}명`,
      },
    ];
  }

  private buildBadgeGuides(params: {
    config: VoiceHealthConfig;
    earnedBadges: BadgeCode[];
    activityTopPercent: number;
    hhiScore: number;
    peerCount: number;
    hasMocoActivity: boolean;
    mocoTopPercent: number;
    activeDaysRatio: number;
    micUsageRate: number;
  }): BadgeGuide[] {
    const {
      config,
      earnedBadges,
      activityTopPercent,
      hhiScore,
      peerCount,
      hasMocoActivity,
      mocoTopPercent,
      activeDaysRatio,
      micUsageRate,
    } = params;
    const isEarned = (code: BadgeCode) => earnedBadges.includes(code);

    return [
      {
        code: BADGE_CODE.ACTIVITY,
        ...BADGE_DISPLAY.ACTIVITY,
        isEarned: isEarned(BADGE_CODE.ACTIVITY),
        criterion: `활동 상위 ${config.badgeActivityTopPercent}% 이내`,
        current: `현재 상위 ${activityTopPercent.toFixed(1)}%`,
      },
      {
        code: BADGE_CODE.SOCIAL,
        ...BADGE_DISPLAY.SOCIAL,
        isEarned: isEarned(BADGE_CODE.SOCIAL),
        criterion: `다양성 ${hhiToDiversityScore(Number(config.badgeSocialHhiMax))}점 이상 & 교류 ${config.badgeSocialMinPeers}명 이상`,
        current: `현재 ${hhiToDiversityScore(hhiScore)}점, ${peerCount}명`,
      },
      {
        code: BADGE_CODE.HUNTER,
        ...BADGE_DISPLAY.HUNTER,
        isEarned: isEarned(BADGE_CODE.HUNTER),
        criterion: `모코코 기여 상위 ${config.badgeHunterTopPercent}% 이내`,
        current: hasMocoActivity ? `현재 상위 ${mocoTopPercent.toFixed(1)}%` : '기록 없음',
      },
      {
        code: BADGE_CODE.CONSISTENT,
        ...BADGE_DISPLAY.CONSISTENT,
        isEarned: isEarned(BADGE_CODE.CONSISTENT),
        criterion: `활동일 비율 ${Math.round(Number(config.badgeConsistentMinRatio) * TOP_PERCENT_DIVISOR)}% 이상`,
        current: `현재 ${Math.round(activeDaysRatio * TOP_PERCENT_DIVISOR)}%`,
      },
      {
        code: BADGE_CODE.MIC,
        ...BADGE_DISPLAY.MIC,
        isEarned: isEarned(BADGE_CODE.MIC),
        criterion: `마이크 사용률 ${Math.round(Number(config.badgeMicMinRate) * TOP_PERCENT_DIVISOR)}% 이상`,
        current: `현재 ${Math.round(micUsageRate * TOP_PERCENT_DIVISOR)}%`,
      },
    ];
  }

  // eslint-disable-next-line max-lines-per-function
  private async generateLlmSummary(params: {
    activityData: {
      totalMinutes: number;
      activeDays: number;
      rank: number;
      totalUsers: number;
      topPercent: number;
    };
    relationshipData: { peerCount: number; hhiScore: number };
    mocoData: {
      hasMocoActivity: boolean;
      score: number;
      rank: number;
      totalUsers: number;
      topPercent: number;
      helpedNewbies: number;
    };
    patternData: { micUsageRate: number; aloneRatio: number };
    verdicts: Verdict[];
    topPeers: PeerInfo[];
    badgeGuides: BadgeGuide[];
    config: VoiceHealthConfig;
  }): Promise<string | undefined> {
    const {
      activityData,
      relationshipData,
      mocoData,
      patternData,
      verdicts,
      topPeers,
      badgeGuides,
      config,
    } = params;
    if (!this.llmProvider) return undefined;

    const passedCount = verdicts.filter((v) => v.isPassed).length;
    const activeDaysRatio =
      activityData.activeDays > 0
        ? Math.round((activityData.activeDays / config.analysisDays) * TOP_PERCENT_DIVISOR)
        : 0;

    const verdictLines = verdicts
      .map(
        (v) =>
          `  - ${v.category}: ${v.actual} (기준: ${v.criterion}) → ${v.isPassed ? '충족' : '미달'}`,
      )
      .join('\n');

    const peerLines =
      topPeers.length > 0
        ? topPeers
            .map(
              (p) =>
                `  - ${p.userName}: ${Math.floor(p.minutes)}분 (${(p.ratio * TOP_PERCENT_DIVISOR).toFixed(1)}%)`,
            )
            .join('\n')
        : '  - 교류 기록 없음';

    const prompt = [
      '당신은 Discord 서버 커뮤니티 매니저 AI입니다.',
      '아래 데이터를 바탕으로 이 멤버의 음성 활동 상태를 진단해주세요.',
      '',
      `## 분석 기간: 최근 ${config.analysisDays}일`,
      '',
      '## 활동량',
      `- 총 활동: ${Math.floor(activityData.totalMinutes)}분 / 활동일: ${activityData.activeDays}일 (분석기간 대비 ${activeDaysRatio}%)`,
      `- 서버 내 순위: ${activityData.rank}위 / ${activityData.totalUsers}명 (상위 ${activityData.topPercent.toFixed(1)}%)`,
      `- 정책 기준: ${config.minActivityMinutes}분 이상 → ${activityData.totalMinutes >= config.minActivityMinutes ? '충족' : '미달'}`,
      '',
      '## 관계 다양성',
      `- 교류 인원: ${relationshipData.peerCount}명 (정책 기준: ${config.minPeerCount}명 이상 → ${relationshipData.peerCount >= config.minPeerCount ? '충족' : '미달'})`,
      `- 관계 다양성 점수: ${hhiToDiversityScore(relationshipData.hhiScore)}점 / 100 (정책 기준: ${hhiToDiversityScore(Number(config.hhiThreshold))}점 이상 → ${relationshipData.hhiScore <= Number(config.hhiThreshold) ? '충족' : '미달'})`,
      '  - 0점(한 명에 집중) ~ 100점(완전 분산). 높을수록 다양',
      '- 주요 교류 상대:',
      peerLines,
      '',
      '## 모코코(신규 멤버 케어) 기여',
      ...(mocoData.hasMocoActivity
        ? [
            `- 기여 점수: ${mocoData.score}점, 도운 신규 멤버: ${mocoData.helpedNewbies}명`,
            `- 서버 내 순위: ${mocoData.rank}위 / ${mocoData.totalUsers}명 (상위 ${mocoData.topPercent.toFixed(1)}%)`,
          ]
        : [`- 모코코 사냥 활동 기록 없음 (현재 ${mocoData.totalUsers}명 참여 중)`]),
      '',
      '## 참여 패턴',
      `- 마이크 사용률: ${Math.round(patternData.micUsageRate * TOP_PERCENT_DIVISOR)}%`,
      `- 혼자 보낸 시간 비율: ${Math.round(patternData.aloneRatio * TOP_PERCENT_DIVISOR)}%`,
      '',
      `## 정책 준수 현황: ${passedCount}/${verdicts.length} 충족`,
      verdictLines,
      '',
      '## 뱃지 달성 현황',
      ...badgeGuides.map(
        (b) =>
          `  - ${b.icon} ${b.name}: ${b.isEarned ? '달성' : '미달성'} (조건: ${b.criterion} / ${b.current})`,
      ),
      '',
      '## 작성 지침',
      '- [필수] 전체 분량은 4~5문장 내외로 간결하게 작성하세요.',
      "- [진단] '정책 준수 현황'을 바탕으로 미달 항목이 있다면 비난이 아닌 '격려와 구체적 방법'을 제시하세요.",
      '- [관계/패턴] 관계 다양성 점수가 낮거나 혼자 보낸 시간 비율이 높으면 "새로운 채널 참여"나 "모코코(신규 멤버) 돕기"를 구체적으로 권유하세요.',
      '- [뱃지] \'미달성\' 뱃지 중 수치상 가장 달성에 근접한 1~2개를 선정해 "OO분만 더 채우면 OO 뱃지를 얻을 수 있어요!" 식의 구체적 팁을 포함하세요.',
      '- [톤앤매너] 전문 커뮤니티 매니저답게 따뜻하고 에너지가 느껴지는 말투를 사용하고, 적절한 이모지를 1~2개 섞어주세요.',
    ].join('\n');

    try {
      const result = await this.llmProvider.generateText(prompt);
      this.logger.log(`LLM summary generated successfully (${result.length} chars)`);
      return result;
    } catch (error) {
      if (error instanceof LlmQuotaExhaustedException) {
        throw error;
      }
      this.logger.error('LLM summary generation failed', error);
      return undefined;
    }
  }

  /** KST 기준 날짜 범위를 계산한다. */
  private buildDateRange(analysisDays: number): {
    startDate: string;
    endDate: string;
    startDateDash: string;
    endDateDash: string;
  } {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);

    const start = new Date(kstNow);
    start.setUTCDate(start.getUTCDate() - analysisDays);

    const toYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const toDash = (d: Date) => d.toISOString().slice(0, 10);

    return {
      startDate: toYYYYMMDD(start),
      endDate: toYYYYMMDD(kstNow),
      startDateDash: toDash(start),
      endDateDash: toDash(kstNow),
    };
  }
}
