import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GuildMemberService } from '../../../guild-member/application/guild-member.service';
import { VoiceCoPresenceDailyOrm } from './infrastructure/voice-co-presence-daily.orm-entity';
import { VoiceCoPresencePairDailyOrm } from './infrastructure/voice-co-presence-pair-daily.orm-entity';

// ────────────────────────────────────────────────────────────────────────────
// Response 타입 정의
// ────────────────────────────────────────────────────────────────────────────

export interface SummaryResponse {
  activeMemberCount: number;
  totalPairCount: number;
  totalCoPresenceMinutes: number;
  avgPairsPerMember: number;
}

export interface GraphResponse {
  nodes: { userId: string; userName: string; totalMinutes: number }[];
  edges: { userA: string; userB: string; totalMinutes: number; sessionCount: number }[];
}

export interface TopPairItem {
  userA: { userId: string; userName: string; avatarUrl: string | null };
  userB: { userId: string; userName: string; avatarUrl: string | null };
  totalMinutes: number;
  sessionCount: number;
}

export interface IsolatedMember {
  userId: string;
  userName: string;
  totalVoiceMinutes: number;
  lastVoiceDate: string;
}

export interface PairsResponse {
  total: number;
  page: number;
  limit: number;
  items: {
    userA: { userId: string; userName: string };
    userB: { userId: string; userName: string };
    totalMinutes: number;
    sessionCount: number;
    lastDate: string;
  }[];
}

export interface DailyTrendItem {
  date: string;
  totalMinutes: number;
}

export interface PairDetailResponse {
  userA: { userId: string; userName: string };
  userB: { userId: string; userName: string };
  totalMinutes: number;
  dailyData: { date: string; minutes: number }[];
}

// ────────────────────────────────────────────────────────────────────────────
// 내부 쿼리 옵션 타입
// ────────────────────────────────────────────────────────────────────────────

interface PairsQueryOptions {
  guildId: string;
  days: number;
  search?: string;
  page: number;
  limit: number;
}

interface PairDetailQueryOptions {
  guildId: string;
  userA: string;
  userB: string;
  days: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 내부 Raw 타입
// ────────────────────────────────────────────────────────────────────────────

interface RawPairRow {
  userAId: string;
  userBId: string;
  totalMinutes: string;
  sessionCount: string;
  lastDate: string;
}

interface RawTopUserRow {
  userId: string;
  totalMinutes: string;
}

interface RawEdgeRow {
  userA: string;
  userB: string;
  totalMinutes: string;
  sessionCount: string;
}

interface RawDailyRow {
  date: string;
  totalMinutes: string;
}

interface RawIsolatedRow {
  userId: string;
  totalVoiceMinutes: string;
  lastVoiceDate: string;
}

interface RawPairDetailRow {
  date: string;
  minutes: string;
}

interface RawCountRow {
  cnt: string;
}

interface RawSumRow {
  total: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────────────────────

const MAX_GRAPH_NODES = 50;
const MAX_SEARCH_FETCH = 1000;
const BOTH_DIRECTIONS_DIVISOR = 2;

@Injectable()
export class CoPresenceAnalyticsService {
  constructor(
    @InjectRepository(VoiceCoPresencePairDailyOrm)
    private readonly pairDailyRepo: Repository<VoiceCoPresencePairDailyOrm>,
    @InjectRepository(VoiceCoPresenceDailyOrm)
    private readonly dailyRepo: Repository<VoiceCoPresenceDailyOrm>,
    private readonly guildMemberService: GuildMemberService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // 공통 유틸
  // ──────────────────────────────────────────────────────────────────────────

  /** Date 객체를 KST(UTC+9) 기준 'YYYY-MM-DD' 문자열로 변환한다 */
  private toKstDateString(d: Date): string {
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  /** days 파라미터로부터 조회 시작일(YYYY-MM-DD)을 계산한다 */
  private getStartDate(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return this.toKstDateString(d);
  }

  /** userId 배열 → { userId: { userName, avatarUrl } } 매핑을 반환한다 */
  private async getUserMap(
    guildId: string,
    userIds: string[],
  ): Promise<Map<string, { userName: string; avatarUrl: string | null }>> {
    if (userIds.length === 0) return new Map();
    const memberMap = await this.guildMemberService.findByUserIds(guildId, userIds);
    const map = new Map<string, { userName: string; avatarUrl: string | null }>();
    for (const [userId, m] of memberMap) {
      map.set(userId, { userName: m.displayName, avatarUrl: m.avatarUrl ?? null });
    }
    return map;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-007: getSummary
  // ──────────────────────────────────────────────────────────────────────────

  async getSummary(guildId: string, days: number): Promise<SummaryResponse> {
    const startDate = this.getStartDate(days);

    // 활성 멤버 수: PairDaily에서 기간 내 DISTINCT userId
    const activeMemberRaw = await this.pairDailyRepo
      .createQueryBuilder('p')
      .select('COUNT(DISTINCT p.userId)', 'cnt')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.date >= :startDate', { startDate })
      .getRawOne<RawCountRow>();
    const activeMemberCount = Number(activeMemberRaw?.cnt ?? 0);

    // 총 관계 수: userId < peerId로 중복 제거한 쌍 수
    const totalPairRaw = await this.pairDailyRepo
      .createQueryBuilder('p')
      .select("COUNT(DISTINCT (p.userId || ':' || p.peerId))", 'cnt')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.date >= :startDate', { startDate })
      .andWhere('p.userId < p.peerId')
      .getRawOne<RawCountRow>();
    const totalPairCount = Number(totalPairRaw?.cnt ?? 0);

    // 총 동시접속 시간: Daily에서 SUM / 2 (양방향 보정)
    const totalMinutesRaw = await this.dailyRepo
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.channelMinutes), 0)', 'total')
      .where('d.guildId = :guildId', { guildId })
      .andWhere('d.date >= :startDate', { startDate })
      .getRawOne<RawSumRow>();
    const totalCoPresenceMinutes = Math.floor(
      Number(totalMinutesRaw?.total ?? 0) / BOTH_DIRECTIONS_DIVISOR,
    );

    // 평균 관계 수/인: 총 관계 수 × 2 / 활성 멤버 수
    const avgPairsPerMember =
      activeMemberCount > 0
        ? Math.round(((totalPairCount * 2) / activeMemberCount) * 100) / 100
        : 0;

    return { activeMemberCount, totalPairCount, totalCoPresenceMinutes, avgPairsPerMember };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-008: getGraph
  // ──────────────────────────────────────────────────────────────────────────

  async getGraph(guildId: string, days: number, minMinutes: number): Promise<GraphResponse> {
    const startDate = this.getStartDate(days);

    // 동시접속 시간 기준 상위 50명 userId 조회 (Daily 기준)
    const topUsers = await this.dailyRepo
      .createQueryBuilder('d')
      .select('d.userId', 'userId')
      .addSelect('SUM(d.channelMinutes)', 'totalMinutes')
      .where('d.guildId = :guildId', { guildId })
      .andWhere('d.date >= :startDate', { startDate })
      .groupBy('d.userId')
      .orderBy('"totalMinutes"', 'DESC')
      .limit(MAX_GRAPH_NODES)
      .getRawMany<RawTopUserRow>();

    const topUserIds = topUsers.map((u) => u.userId);
    if (topUserIds.length === 0) return { nodes: [], edges: [] };

    // 상위 50명 간 엣지 조회 (userId < peerId로 중복 제거, minMinutes 필터)
    const edges = await this.pairDailyRepo
      .createQueryBuilder('p')
      .select('p.userId', 'userA')
      .addSelect('p.peerId', 'userB')
      .addSelect('SUM(p.minutes)', 'totalMinutes')
      .addSelect('SUM(p.sessionCount)', 'sessionCount')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.date >= :startDate', { startDate })
      .andWhere('p.userId < p.peerId')
      .andWhere('p.userId IN (:...ids)', { ids: topUserIds })
      .andWhere('p.peerId IN (:...ids)', { ids: topUserIds })
      .groupBy('p.userId')
      .addGroupBy('p.peerId')
      .having('SUM(p.minutes) >= :minMinutes', { minMinutes })
      .getRawMany<RawEdgeRow>();

    const userMap = await this.getUserMap(guildId, topUserIds);

    const nodes = topUsers.map((u) => ({
      userId: u.userId,
      userName: userMap.get(u.userId)?.userName ?? u.userId,
      totalMinutes: Number(u.totalMinutes),
    }));

    return {
      nodes,
      edges: edges.map((e) => ({
        userA: e.userA,
        userB: e.userB,
        totalMinutes: Number(e.totalMinutes),
        sessionCount: Number(e.sessionCount),
      })),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-009: getTopPairs
  // ──────────────────────────────────────────────────────────────────────────

  async getTopPairs(guildId: string, days: number, limit: number): Promise<TopPairItem[]> {
    const startDate = this.getStartDate(days);

    const pairs = await this.pairDailyRepo
      .createQueryBuilder('p')
      .select('p.userId', 'userAId')
      .addSelect('p.peerId', 'userBId')
      .addSelect('SUM(p.minutes)', 'totalMinutes')
      .addSelect('SUM(p.sessionCount)', 'sessionCount')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.date >= :startDate', { startDate })
      .andWhere('p.userId < p.peerId')
      .groupBy('p.userId')
      .addGroupBy('p.peerId')
      .orderBy('"totalMinutes"', 'DESC')
      .limit(limit)
      .getRawMany<RawPairRow>();

    const allUserIds = [...new Set<string>(pairs.flatMap((p) => [p.userAId, p.userBId]))];
    const userMap = await this.getUserMap(guildId, allUserIds);

    return pairs.map((p) => ({
      userA: {
        userId: p.userAId,
        userName: userMap.get(p.userAId)?.userName ?? p.userAId,
        avatarUrl: userMap.get(p.userAId)?.avatarUrl ?? null,
      },
      userB: {
        userId: p.userBId,
        userName: userMap.get(p.userBId)?.userName ?? p.userBId,
        avatarUrl: userMap.get(p.userBId)?.avatarUrl ?? null,
      },
      totalMinutes: Number(p.totalMinutes),
      sessionCount: Number(p.sessionCount),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-010: getIsolated
  // ──────────────────────────────────────────────────────────────────────────

  async getIsolated(guildId: string, days: number): Promise<IsolatedMember[]> {
    const startDate = this.getStartDate(days);

    // Daily에는 있지만 PairDaily에는 없는 사용자
    const result = await this.dailyRepo
      .createQueryBuilder('d')
      .select('d.userId', 'userId')
      .addSelect('SUM(d.channelMinutes)', 'totalVoiceMinutes')
      .addSelect('MAX(d.date)', 'lastVoiceDate')
      .where('d.guildId = :guildId', { guildId })
      .andWhere('d.date >= :startDate', { startDate })
      .andWhere('d.channelMinutes > 0')
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('1')
          .from(VoiceCoPresencePairDailyOrm, 'p')
          .where('p.guildId = d.guildId')
          .andWhere('p.userId = d.userId')
          .andWhere('p.date >= :startDate')
          .getQuery();
        return `NOT EXISTS (${subQuery})`;
      })
      .groupBy('d.userId')
      .getRawMany<RawIsolatedRow>();

    const userIds = result.map((r) => r.userId);
    const userMap = await this.getUserMap(guildId, userIds);

    return result.map((r) => ({
      userId: r.userId,
      userName: userMap.get(r.userId)?.userName ?? r.userId,
      totalVoiceMinutes: Number(r.totalVoiceMinutes),
      lastVoiceDate: r.lastVoiceDate,
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-011: getPairs
  // ──────────────────────────────────────────────────────────────────────────

  async getPairs(opts: PairsQueryOptions): Promise<PairsResponse> {
    if (opts.search) {
      return this.getPairsWithSearch(opts as Required<PairsQueryOptions>);
    }
    return this.getPairsWithPagination(opts);
  }

  private async getPairsWithSearch(opts: Required<PairsQueryOptions>): Promise<PairsResponse> {
    const { guildId, days, search, page, limit } = opts;
    const startDate = this.getStartDate(days);
    const offset = (page - 1) * limit;

    const rawPairs = await this.pairDailyRepo
      .createQueryBuilder('p')
      .select('p.userId', 'userAId')
      .addSelect('p.peerId', 'userBId')
      .addSelect('SUM(p.minutes)', 'totalMinutes')
      .addSelect('SUM(p.sessionCount)', 'sessionCount')
      .addSelect('MAX(p.date)', 'lastDate')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.date >= :startDate', { startDate })
      .andWhere('p.userId < p.peerId')
      .groupBy('p.userId')
      .addGroupBy('p.peerId')
      .orderBy('"totalMinutes"', 'DESC')
      .limit(MAX_SEARCH_FETCH)
      .getRawMany<RawPairRow>();

    const allUserIds = [...new Set<string>(rawPairs.flatMap((p) => [p.userAId, p.userBId]))];
    const userMap = await this.getUserMap(guildId, allUserIds);

    const keyword = search.toLowerCase();
    const filtered = rawPairs
      .map((p) => ({
        userA: { userId: p.userAId, userName: userMap.get(p.userAId)?.userName ?? p.userAId },
        userB: { userId: p.userBId, userName: userMap.get(p.userBId)?.userName ?? p.userBId },
        totalMinutes: Number(p.totalMinutes),
        sessionCount: Number(p.sessionCount),
        lastDate: p.lastDate,
      }))
      .filter(
        (item) =>
          item.userA.userName.toLowerCase().includes(keyword) ||
          item.userB.userName.toLowerCase().includes(keyword),
      );

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);
    return { total, page, limit, items };
  }

  private async getPairsWithPagination(opts: PairsQueryOptions): Promise<PairsResponse> {
    const { guildId, days, page, limit } = opts;
    const startDate = this.getStartDate(days);
    const offset = (page - 1) * limit;

    const [totalRaw, pagedRaw] = await Promise.all([
      this.pairDailyRepo
        .createQueryBuilder('p')
        .select("COUNT(DISTINCT (p.userId || ':' || p.peerId))", 'cnt')
        .where('p.guildId = :guildId', { guildId })
        .andWhere('p.date >= :startDate', { startDate })
        .andWhere('p.userId < p.peerId')
        .getRawOne<RawCountRow>(),
      this.pairDailyRepo
        .createQueryBuilder('p')
        .select('p.userId', 'userAId')
        .addSelect('p.peerId', 'userBId')
        .addSelect('SUM(p.minutes)', 'totalMinutes')
        .addSelect('SUM(p.sessionCount)', 'sessionCount')
        .addSelect('MAX(p.date)', 'lastDate')
        .where('p.guildId = :guildId', { guildId })
        .andWhere('p.date >= :startDate', { startDate })
        .andWhere('p.userId < p.peerId')
        .groupBy('p.userId')
        .addGroupBy('p.peerId')
        .orderBy('"totalMinutes"', 'DESC')
        .offset(offset)
        .limit(limit)
        .getRawMany<RawPairRow>(),
    ]);

    const total = Number(totalRaw?.cnt ?? 0);
    const pagedUserIds = [...new Set<string>(pagedRaw.flatMap((p) => [p.userAId, p.userBId]))];
    const userMap = await this.getUserMap(guildId, pagedUserIds);

    const items = pagedRaw.map((p) => ({
      userA: { userId: p.userAId, userName: userMap.get(p.userAId)?.userName ?? p.userAId },
      userB: { userId: p.userBId, userName: userMap.get(p.userBId)?.userName ?? p.userBId },
      totalMinutes: Number(p.totalMinutes),
      sessionCount: Number(p.sessionCount),
      lastDate: p.lastDate,
    }));

    return { total, page, limit, items };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-012: getDailyTrend
  // ──────────────────────────────────────────────────────────────────────────

  async getDailyTrend(guildId: string, days: number): Promise<DailyTrendItem[]> {
    const startDate = this.getStartDate(days);

    const raw = await this.dailyRepo
      .createQueryBuilder('d')
      .select("TO_CHAR(d.date, 'YYYY-MM-DD')", 'date')
      .addSelect(
        `ROUND(SUM(d.channelMinutes)::numeric / ${BOTH_DIRECTIONS_DIVISOR})`,
        'totalMinutes',
      )
      .where('d.guildId = :guildId', { guildId })
      .andWhere('d.date >= :startDate', { startDate })
      .groupBy('d.date')
      .orderBy('d.date', 'ASC')
      .getRawMany<RawDailyRow>();

    // 빈 날짜를 0으로 채운다
    const dataMap = new Map<string, number>(raw.map((r) => [r.date, Number(r.totalMinutes)]));
    const result: DailyTrendItem[] = [];
    const todayStr = this.toKstDateString(new Date());
    const cursor = new Date(`${startDate}T00:00:00`);

    let dateStr = this.toKstDateString(cursor);
    while (dateStr <= todayStr) {
      result.push({ date: dateStr, totalMinutes: dataMap.get(dateStr) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
      dateStr = this.toKstDateString(cursor);
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // F-COPRESENCE-013: getPairDetail
  // ──────────────────────────────────────────────────────────────────────────

  async getPairDetail(opts: PairDetailQueryOptions): Promise<PairDetailResponse> {
    const { guildId, userA, userB, days } = opts;
    const startDate = this.getStartDate(days);

    // userId 정렬: userId < peerId 방향의 단방향 레코드만 조회
    const [sortedA, sortedB] = userA < userB ? [userA, userB] : [userB, userA];

    const dailyData = await this.pairDailyRepo
      .createQueryBuilder('p')
      .select('p.date', 'date')
      .addSelect('SUM(p.minutes)', 'minutes')
      .where('p.guildId = :guildId', { guildId })
      .andWhere('p.userId = :sortedA', { sortedA })
      .andWhere('p.peerId = :sortedB', { sortedB })
      .andWhere('p.date >= :startDate', { startDate })
      .groupBy('p.date')
      .orderBy('p.date', 'ASC')
      .getRawMany<RawPairDetailRow>();

    const totalMinutes = dailyData.reduce((sum, d) => sum + Number(d.minutes), 0);
    const userMap = await this.getUserMap(guildId, [userA, userB]);

    return {
      userA: { userId: userA, userName: userMap.get(userA)?.userName ?? userA },
      userB: { userId: userB, userName: userMap.get(userB)?.userName ?? userB },
      totalMinutes,
      dailyData: dailyData.map((d) => ({ date: d.date, minutes: Number(d.minutes) })),
    };
  }
}
