import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InactiveMemberActionType } from '../domain/inactive-member.types';
import type { InactiveMemberConfigSaveDto } from '../dto/inactive-member-config-save.dto';
import { InactiveMemberActionLogOrm } from './inactive-member-action-log.orm-entity';
import { InactiveMemberConfigOrm } from './inactive-member-config.orm-entity';
import { InactiveMemberRecordOrm } from './inactive-member-record.orm-entity';
import { InactiveMemberTrendDailyOrm } from './inactive-member-trend-daily.orm-entity';

export interface UpsertRecordData {
  guildId: string;
  userId: string;
  nickName: string | null;
  grade: string | null;
  totalMinutes: number;
  prevTotalMinutes: number;
  lastVoiceDate: string | null;
  classifiedAt: Date;
}

export interface TrendSnapshotCounts {
  fullyInactiveCount: number;
  lowActiveCount: number;
  decliningCount: number;
  totalClassified: number;
}

export interface CreateActionLogData {
  guildId: string;
  actionType: InactiveMemberActionType;
  targetUserIds: string[];
  executorUserId: string | null;
  successCount: number;
  failCount: number;
  note?: string | null;
}

@Injectable()
export class InactiveMemberRepository {
  constructor(
    @InjectRepository(InactiveMemberConfigOrm)
    private readonly configRepo: Repository<InactiveMemberConfigOrm>,
    @InjectRepository(InactiveMemberRecordOrm)
    private readonly recordRepo: Repository<InactiveMemberRecordOrm>,
    @InjectRepository(InactiveMemberActionLogOrm)
    private readonly actionLogRepo: Repository<InactiveMemberActionLogOrm>,
    @InjectRepository(InactiveMemberTrendDailyOrm)
    private readonly trendDailyRepo: Repository<InactiveMemberTrendDailyOrm>,
  ) {}

  async findConfigByGuildId(guildId: string): Promise<InactiveMemberConfigOrm | null> {
    return this.configRepo.findOne({ where: { guildId } });
  }

  /** 설정이 존재하는 모든 길드 ID 목록 반환. */
  async findAllConfiguredGuildIds(): Promise<string[]> {
    const configs = await this.configRepo.find({ select: ['guildId'] });
    return configs.map((c) => c.guildId);
  }

  async createDefaultConfig(guildId: string): Promise<InactiveMemberConfigOrm> {
    const config = this.configRepo.create({ guildId });
    return this.configRepo.save(config);
  }

  async upsertConfig(
    guildId: string,
    dto: InactiveMemberConfigSaveDto,
  ): Promise<InactiveMemberConfigOrm> {
    let config = await this.findConfigByGuildId(guildId);

    if (!config) {
      config = this.configRepo.create({ guildId });
    }

    if (dto.periodDays !== undefined) config.periodDays = dto.periodDays;
    if (dto.lowActiveThresholdMin !== undefined)
      config.lowActiveThresholdMin = dto.lowActiveThresholdMin;
    if (dto.decliningPercent !== undefined) config.decliningPercent = dto.decliningPercent;
    if (dto.gracePeriodDays !== undefined) config.gracePeriodDays = dto.gracePeriodDays;
    if (dto.autoActionEnabled !== undefined) config.autoActionEnabled = dto.autoActionEnabled;
    if (dto.autoRoleAdd !== undefined) config.autoRoleAdd = dto.autoRoleAdd;
    if (dto.autoDm !== undefined) config.autoDm = dto.autoDm;
    if (dto.inactiveRoleId !== undefined) config.inactiveRoleId = dto.inactiveRoleId ?? null;
    if (dto.removeRoleId !== undefined) config.removeRoleId = dto.removeRoleId ?? null;
    if (dto.excludedRoleIds !== undefined) config.excludedRoleIds = dto.excludedRoleIds;
    if (dto.dmEmbedTitle !== undefined) config.dmEmbedTitle = dto.dmEmbedTitle ?? null;
    if (dto.dmEmbedBody !== undefined) config.dmEmbedBody = dto.dmEmbedBody ?? null;
    if (dto.dmEmbedColor !== undefined) config.dmEmbedColor = dto.dmEmbedColor ?? null;

    return this.configRepo.save(config);
  }

  async batchUpsertRecords(records: UpsertRecordData[]): Promise<void> {
    if (records.length === 0) return;

    const COLS = 8;
    const CHUNK_SIZE = Math.floor(65535 / COLS);

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const params: (string | number | null | Date)[] = [];
      const valueClauses: string[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const o = j * COLS;
        valueClauses.push(
          `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5}::int,$${o + 6}::int,$${o + 7},$${o + 8}::timestamp,NOW(),NOW())`,
        );
        params.push(
          chunk[j].guildId,
          chunk[j].userId,
          chunk[j].nickName,
          chunk[j].grade,
          chunk[j].totalMinutes,
          chunk[j].prevTotalMinutes,
          chunk[j].lastVoiceDate,
          chunk[j].classifiedAt,
        );
      }

      await this.recordRepo.query(
        `INSERT INTO inactive_member_record
          ("guildId","userId","nickName","grade","totalMinutes","prevTotalMinutes","lastVoiceDate","classifiedAt","createdAt","updatedAt")
        VALUES ${valueClauses.join(', ')}
        ON CONFLICT ("guildId","userId")
        DO UPDATE SET
          "nickName" = EXCLUDED."nickName",
          "grade" = EXCLUDED."grade",
          "totalMinutes" = EXCLUDED."totalMinutes",
          "prevTotalMinutes" = EXCLUDED."prevTotalMinutes",
          "lastVoiceDate" = EXCLUDED."lastVoiceDate",
          "gradeChangedAt" = CASE
            WHEN inactive_member_record."grade" IS DISTINCT FROM EXCLUDED."grade"
            THEN NOW()
            ELSE inactive_member_record."gradeChangedAt"
          END,
          "classifiedAt" = EXCLUDED."classifiedAt",
          "updatedAt" = NOW()`,
        params,
      );
    }
  }

  /** 유저 ID 목록에 대한 닉네임 맵을 반환한다. */
  async findNickNameMap(guildId: string, userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};

    const records = await this.recordRepo
      .createQueryBuilder('r')
      .select(['r.userId', 'r.nickName'])
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.userId IN (:...userIds)', { userIds })
      .getMany();

    const map: Record<string, string> = {};
    for (const r of records) {
      map[r.userId] = r.nickName ?? r.userId;
    }
    return map;
  }

  /** 현재 서버 멤버에 포함되지 않는 레코드를 삭제한다. */
  async deleteRecordsNotIn(guildId: string, currentUserIds: Set<string>): Promise<number> {
    if (currentUserIds.size === 0) return 0;

    const userIdArray = Array.from(currentUserIds);
    const result = await this.recordRepo
      .createQueryBuilder()
      .delete()
      .where('"guildId" = :guildId', { guildId })
      .andWhere('"userId" NOT IN (:...userIds)', { userIds: userIdArray })
      .execute();

    return result.affected ?? 0;
  }

  async findNewlyFullyInactive(
    guildId: string,
    classifiedAt: Date,
  ): Promise<InactiveMemberRecordOrm[]> {
    return this.recordRepo
      .createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.grade = :grade', { grade: 'FULLY_INACTIVE' })
      .andWhere('r.gradeChangedAt >= :classifiedAt', { classifiedAt })
      .getMany();
  }

  async saveTrendSnapshot(
    guildId: string,
    date: string,
    counts: TrendSnapshotCounts,
  ): Promise<void> {
    await this.trendDailyRepo.query(
      `INSERT INTO inactive_member_trend_daily
        ("guildId", "date", "fullyInactiveCount", "lowActiveCount", "decliningCount", "totalClassified", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT ("guildId", "date")
      DO UPDATE SET
        "fullyInactiveCount" = EXCLUDED."fullyInactiveCount",
        "lowActiveCount" = EXCLUDED."lowActiveCount",
        "decliningCount" = EXCLUDED."decliningCount",
        "totalClassified" = EXCLUDED."totalClassified"`,
      [
        guildId,
        date,
        counts.fullyInactiveCount,
        counts.lowActiveCount,
        counts.decliningCount,
        counts.totalClassified,
      ],
    );
  }

  /** retentionDays일 이전의 추이 스냅샷 레코드를 삭제하고 삭제된 건수를 반환한다. */
  async deleteTrendBefore(retentionDays: number): Promise<number> {
    const result = await this.trendDailyRepo
      .createQueryBuilder()
      .delete()
      .where(`"date" < NOW() - INTERVAL '${String(retentionDays)} days'`)
      .execute();

    return result.affected ?? 0;
  }

  async saveActionLog(data: CreateActionLogData): Promise<InactiveMemberActionLogOrm> {
    const log = this.actionLogRepo.create({
      guildId: data.guildId,
      actionType: data.actionType,
      targetUserIds: data.targetUserIds,
      executorUserId: data.executorUserId,
      successCount: data.successCount,
      failCount: data.failCount,
      note: data.note ?? null,
    });
    return this.actionLogRepo.save(log);
  }
}
