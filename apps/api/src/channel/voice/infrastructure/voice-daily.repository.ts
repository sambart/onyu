import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VoiceDailyOrm } from './voice-daily.orm-entity';

type ChannelType = 'permanent' | 'auto_select' | 'auto_instant';

interface AccumulateChannelDurationParams {
  guildId: string;
  userId: string;
  userName: string;
  date: string;
  channelId: string;
  channelName: string;
  durationSec: number;
  categoryId: string | null;
  categoryName: string | null;
  channelType?: ChannelType;
  autoChannelConfigId?: number | null;
  autoChannelConfigName?: string | null;
}

@Injectable()
export class VoiceDailyRepository {
  constructor(
    @InjectRepository(VoiceDailyOrm)
    private readonly repo: Repository<VoiceDailyOrm>,
  ) {}

  private dateToRecordedAt(date: string): Date {
    const year = parseInt(date.slice(0, 4), 10);
    const month = parseInt(date.slice(4, 6), 10) - 1;
    const day = parseInt(date.slice(6, 8), 10);
    return new Date(Date.UTC(year, month, day));
  }

  async accumulateChannelDuration(params: AccumulateChannelDurationParams): Promise<void> {
    const {
      guildId,
      userId,
      userName,
      date,
      channelId,
      channelName,
      durationSec,
      categoryId,
      categoryName,
      channelType = 'permanent',
      autoChannelConfigId = null,
      autoChannelConfigName = null,
    } = params;
    const recordedAt = this.dateToRecordedAt(date);
    await this.repo.query(
      `
      INSERT INTO voice_daily AS vd
          ("guildId","userId","userName","date","channelId","channelName","channelDurationSec","categoryId","categoryName","recordedAt",
           "channelType","autoChannelConfigId","autoChannelConfigName")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
        "channelDurationSec" =
        vd."channelDurationSec" + EXCLUDED."channelDurationSec",
        "channelName" = EXCLUDED."channelName",
        "userName"    = EXCLUDED."userName",
        "categoryId"   = COALESCE(EXCLUDED."categoryId", vd."categoryId"),
        "categoryName" = COALESCE(EXCLUDED."categoryName", vd."categoryName"),
        "recordedAt"   = COALESCE(EXCLUDED."recordedAt", vd."recordedAt"),
        "channelType"  = CASE
          WHEN vd."channelType" != 'permanent' THEN vd."channelType"
          ELSE EXCLUDED."channelType"
        END,
        "autoChannelConfigId"   = COALESCE(vd."autoChannelConfigId",   EXCLUDED."autoChannelConfigId"),
        "autoChannelConfigName" = COALESCE(vd."autoChannelConfigName", EXCLUDED."autoChannelConfigName")
      `,
      [
        guildId,
        userId,
        userName,
        date,
        channelId,
        channelName,
        durationSec,
        categoryId,
        categoryName,
        recordedAt,
        channelType,
        autoChannelConfigId,
        autoChannelConfigName,
      ],
    );
  }

  async accumulateMicDuration(
    guildId: string,
    userId: string,
    date: string,
    micOnSec: number,
    micOffSec: number,
  ): Promise<void> {
    const recordedAt = this.dateToRecordedAt(date);
    await this.repo.query(
      `
      INSERT INTO voice_daily AS vd
          ("guildId","userId","date","channelId","micOnSec","micOffSec","recordedAt")
      VALUES ($1,$2,$3,'GLOBAL',$4,$5,$6)
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
          "micOnSec"   = vd."micOnSec"  + EXCLUDED."micOnSec",
          "micOffSec"  = vd."micOffSec" + EXCLUDED."micOffSec",
          "recordedAt" = COALESCE(EXCLUDED."recordedAt", vd."recordedAt")
      `,
      [guildId, userId, date, micOnSec, micOffSec, recordedAt],
    );
  }

  async accumulateAloneDuration(
    guildId: string,
    userId: string,
    date: string,
    aloneSec: number,
  ): Promise<void> {
    const recordedAt = this.dateToRecordedAt(date);
    await this.repo.query(
      `
      INSERT INTO voice_daily AS vd
          ("guildId","userId","date","channelId","aloneSec","recordedAt")
      VALUES ($1,$2,$3,'GLOBAL',$4,$5)
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
          "aloneSec"   = vd."aloneSec" + EXCLUDED."aloneSec",
          "recordedAt" = COALESCE(EXCLUDED."recordedAt", vd."recordedAt")
      `,
      [guildId, userId, date, aloneSec, recordedAt],
    );
  }

  async accumulateStreamingDuration(
    guildId: string,
    userId: string,
    date: string,
    streamingSec: number,
  ): Promise<void> {
    const recordedAt = this.dateToRecordedAt(date);
    await this.repo.query(
      `
      INSERT INTO voice_daily AS vd
          ("guildId","userId","date","channelId","streamingSec","recordedAt")
      VALUES ($1,$2,$3,'GLOBAL',$4,$5)
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
          "streamingSec" = vd."streamingSec" + EXCLUDED."streamingSec",
          "recordedAt"   = COALESCE(EXCLUDED."recordedAt", vd."recordedAt")
      `,
      [guildId, userId, date, streamingSec, recordedAt],
    );
  }

  async accumulateVideoDuration(
    guildId: string,
    userId: string,
    date: string,
    videoOnSec: number,
  ): Promise<void> {
    const recordedAt = this.dateToRecordedAt(date);
    await this.repo.query(
      `
      INSERT INTO voice_daily AS vd
          ("guildId","userId","date","channelId","videoOnSec","recordedAt")
      VALUES ($1,$2,$3,'GLOBAL',$4,$5)
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
          "videoOnSec" = vd."videoOnSec" + EXCLUDED."videoOnSec",
          "recordedAt" = COALESCE(EXCLUDED."recordedAt", vd."recordedAt")
      `,
      [guildId, userId, date, videoOnSec, recordedAt],
    );
  }

  async accumulateDeafDuration(
    guildId: string,
    userId: string,
    date: string,
    deafSec: number,
  ): Promise<void> {
    const recordedAt = this.dateToRecordedAt(date);
    await this.repo.query(
      `
      INSERT INTO voice_daily AS vd
          ("guildId","userId","date","channelId","deafSec","recordedAt")
      VALUES ($1,$2,$3,'GLOBAL',$4,$5)
      ON CONFLICT ("guildId","userId","date","channelId")
      DO UPDATE SET
          "deafSec"    = vd."deafSec" + EXCLUDED."deafSec",
          "recordedAt" = COALESCE(EXCLUDED."recordedAt", vd."recordedAt")
      `,
      [guildId, userId, date, deafSec, recordedAt],
    );
  }

  async findByGuildIdAndDateRange(
    guildId: string,
    from: string,
    to: string,
    userId?: string,
    timezone?: string,
  ): Promise<VoiceDailyOrm[]> {
    // timezone이 제공되고 KST가 아닌 경우, recordedAt 기반 타임존 쿼리 시도
    if (timezone && timezone !== 'Asia/Seoul') {
      return this.findByGuildIdAndDateRangeWithTimezone(guildId, from, to, timezone, userId);
    }

    const qb = this.repo
      .createQueryBuilder('vd')
      .where('vd."guildId" = :guildId', { guildId })
      .andWhere('vd.date BETWEEN :from AND :to', { from, to });

    if (userId) {
      qb.andWhere('vd."userId" = :userId', { userId });
    }

    return qb.getMany();
  }

  /**
   * recordedAt 컬럼의 AT TIME ZONE 변환을 활용해 타임존 기준으로 날짜 범위를 조회한다.
   * recordedAt이 null인 레거시 레코드는 date 컬럼 기준으로 폴백한다.
   */
  async findByGuildIdAndDateRangeWithTimezone(
    guildId: string,
    from: string,
    to: string,
    timezone: string,
    userId?: string,
  ): Promise<VoiceDailyOrm[]> {
    // recordedAt이 없는 레거시 데이터는 기존 date 컬럼으로 필터링하고,
    // recordedAt이 있는 데이터는 해당 타임존 기준 날짜로 필터링한다
    const qb = this.repo
      .createQueryBuilder('vd')
      .where('vd."guildId" = :guildId', { guildId })
      .andWhere(
        `(
          (vd."recordedAt" IS NULL AND vd.date BETWEEN :from AND :to)
          OR
          (vd."recordedAt" IS NOT NULL AND to_char(vd."recordedAt" AT TIME ZONE :timezone, 'YYYYMMDD') BETWEEN :from AND :to)
        )`,
        { from, to, timezone },
      );

    if (userId) {
      qb.andWhere('vd."userId" = :userId', { userId });
    }

    return qb.getMany();
  }
}
