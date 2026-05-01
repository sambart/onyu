import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { InactiveMemberActionLogOrm } from './inactive-member-action-log.orm-entity';
import { InactiveMemberRecordOrm } from './inactive-member-record.orm-entity';
import { InactiveMemberTrendDailyOrm } from './inactive-member-trend-daily.orm-entity';

const GRADE_FULLY_INACTIVE = 'FULLY_INACTIVE';
const GRADE_LOW_ACTIVE = 'LOW_ACTIVE';
const GRADE_DECLINING = 'DECLINING';
const VOICE_GLOBAL_CHANNEL_ID = 'GLOBAL'; // GLOBAL 레코드는 mic/alone만 집계, channelDurationSec는 0
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_SORT_BY = 'lastVoiceDate';
const DEFAULT_SORT_ORDER = 'ASC' as const;

export interface RecordListFilter {
  grade?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  limit?: number;
}

export interface RecordListResult {
  items: InactiveMemberRecordOrm[];
  total: number;
}

export interface ActionLogListResult {
  items: InactiveMemberActionLogOrm[];
  total: number;
}

export interface GradeStats {
  totalClassified: number;
  fullyInactiveCount: number;
  lowActiveCount: number;
  decliningCount: number;
}

export interface TrendEntry {
  date: string;
  fullyInactive: number;
  lowActive: number;
  declining: number;
}

@Injectable()
export class InactiveMemberQueryRepository {
  constructor(
    @InjectRepository(InactiveMemberRecordOrm)
    private readonly recordRepo: Repository<InactiveMemberRecordOrm>,
    @InjectRepository(InactiveMemberActionLogOrm)
    private readonly actionLogRepo: Repository<InactiveMemberActionLogOrm>,
    @InjectRepository(VoiceDailyOrm)
    private readonly voiceDailyRepo: Repository<VoiceDailyOrm>,
    @InjectRepository(InactiveMemberTrendDailyOrm)
    private readonly trendDailyRepo: Repository<InactiveMemberTrendDailyOrm>,
  ) {}

  async findRecordList(guildId: string, filter: RecordListFilter): Promise<RecordListResult> {
    const page = filter.page ?? DEFAULT_PAGE;
    const limit = filter.limit ?? DEFAULT_LIMIT;
    const requestedSortBy = filter.sortBy ?? DEFAULT_SORT_BY;
    // RecordListFilter.sortOrder는 string | undefined이므로 TypeORM orderBy() 시그니처를 만족하기 위해 단언
    const sortOrder = (filter.sortOrder ?? DEFAULT_SORT_ORDER) as 'ASC' | 'DESC';
    const skip = (page - 1) * limit;

    const qb = this.recordRepo.createQueryBuilder('r').where('r.guildId = :guildId', { guildId });

    if (filter.grade) {
      qb.andWhere('r.grade = :grade', { grade: filter.grade });
    } else {
      qb.andWhere('r.grade IS NOT NULL');
    }

    if (filter.search) {
      qb.andWhere('r.nickName ILIKE :search', { search: `%${filter.search}%` });
    }

    // PRD F-INACTIVE-002: decreaseRate 정렬은 grade=DECLINING 조합에서만 유효하다.
    // 그 외 조합에서는 lastVoiceDate ASC로 fallback한다.
    if (requestedSortBy === 'decreaseRate') {
      if (filter.grade === GRADE_DECLINING) {
        // 감소율 = (prevTotalMinutes - totalMinutes) / prevTotalMinutes
        // prevTotalMinutes = 0이면 0으로 처리하여 DESC 정렬 시 마지막으로 밀어낸다.
        // addSelect 별칭이 getManyAndCount()에서 인식되지 않을 수 있으므로 표현식을 orderBy에 직접 삽입한다.
        qb.orderBy(
          `(CASE WHEN r."prevTotalMinutes" > 0
                 THEN (r."prevTotalMinutes" - r."totalMinutes")::float / r."prevTotalMinutes"
                 ELSE 0 END)`,
          sortOrder,
        );
      } else {
        qb.orderBy('r.lastVoiceDate', 'ASC');
      }
    } else {
      qb.orderBy(`r.${requestedSortBy}`, sortOrder);
    }

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async countByGrade(guildId: string): Promise<GradeStats> {
    // grade가 NULL(활동 회원)인 레코드도 포함하여 전체 분류 대상 수를 계산
    const raw: Array<{ grade: string | null; count: string }> = await this.recordRepo
      .createQueryBuilder('r')
      .select('r.grade', 'grade')
      .addSelect('COUNT(*)', 'count')
      .where('r.guildId = :guildId', { guildId })
      .groupBy('r.grade')
      .getRawMany();

    const statsMap = new Map(raw.map((r) => [r.grade, parseInt(r.count, 10)]));
    const totalClassified = raw.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    return {
      totalClassified,
      fullyInactiveCount: statsMap.get(GRADE_FULLY_INACTIVE) ?? 0,
      lowActiveCount: statsMap.get(GRADE_LOW_ACTIVE) ?? 0,
      decliningCount: statsMap.get(GRADE_DECLINING) ?? 0,
    };
  }

  async findReturnedCount(guildId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.recordRepo
      .createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.grade IS NULL')
      .andWhere('r.gradeChangedAt >= :today', { today })
      .getCount();
  }

  async findTrend(guildId: string): Promise<TrendEntry[]> {
    // TypeORM은 date 컬럼을 JS Date 객체로 역직렬화하므로 TO_CHAR로 문자열 포맷을 강제한다
    const rows = await this.trendDailyRepo
      .createQueryBuilder('t')
      .select(`TO_CHAR(t.date, 'YYYY-MM-DD')`, 'date')
      .addSelect('t.fullyInactiveCount', 'fullyInactive')
      .addSelect('t.lowActiveCount', 'lowActive')
      .addSelect('t.decliningCount', 'declining')
      .where('t.guildId = :guildId', { guildId })
      .andWhere(`t.date >= NOW() - INTERVAL '30 days'`)
      .orderBy('t.date', 'ASC')
      .getRawMany<{ date: string; fullyInactive: string; lowActive: string; declining: string }>();

    return rows.map((r) => ({
      date: r.date,
      fullyInactive: parseInt(r.fullyInactive, 10),
      lowActive: parseInt(r.lowActive, 10),
      declining: parseInt(r.declining, 10),
    }));
  }

  async sumVoiceDurationByUser(
    guildId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, number>> {
    // GLOBAL 레코드에는 channelDurationSec가 집계되지 않으므로 개별 채널 레코드를 합산
    const raw: Array<{ userId: string; totalSec: string }> = await this.voiceDailyRepo
      .createQueryBuilder('v')
      .select('v.userId', 'userId')
      .addSelect(`SUM(v."channelDurationSec")`, 'totalSec')
      .where('v.guildId = :guildId', { guildId })
      .andWhere('v.channelId != :globalId', { globalId: VOICE_GLOBAL_CHANNEL_ID })
      .andWhere('v.date >= :fromDate', { fromDate })
      .andWhere('v.date <= :toDate', { toDate })
      .groupBy('v.userId')
      .getRawMany();

    return new Map(raw.map((r) => [r.userId, parseInt(r.totalSec, 10)]));
  }

  async findLastVoiceDateByUser(guildId: string, fromDate: string): Promise<Map<string, string>> {
    const raw: Array<{ userId: string; lastDate: string }> = await this.voiceDailyRepo
      .createQueryBuilder('v')
      .select('v.userId', 'userId')
      .addSelect(`MAX(v.date)`, 'lastDate')
      .where('v.guildId = :guildId', { guildId })
      .andWhere('v.channelId != :globalId', { globalId: VOICE_GLOBAL_CHANNEL_ID })
      .andWhere('v.date >= :fromDate', { fromDate })
      .groupBy('v.userId')
      .getRawMany();

    return new Map(raw.map((r) => [r.userId, r.lastDate]));
  }

  async findActionLogs(guildId: string, page: number, limit: number): Promise<ActionLogListResult> {
    const skip = (page - 1) * limit;

    const [items, total] = await this.actionLogRepo
      .createQueryBuilder('l')
      .where('l.guildId = :guildId', { guildId })
      .orderBy('l.executedAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }
}
