import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import type { WeeklyReportConfigSaveDto } from '../presentation/dto/weekly-report-config.dto';
import { WeeklyReportConfigOrmEntity } from './weekly-report-config.orm-entity';

@Injectable()
export class WeeklyReportConfigRepository {
  constructor(
    @InjectRepository(WeeklyReportConfigOrmEntity)
    private readonly repo: Repository<WeeklyReportConfigOrmEntity>,
  ) {}

  /** guildId로 설정 단건 조회. */
  async findByGuildId(guildId: string): Promise<WeeklyReportConfigOrmEntity | null> {
    return this.repo.findOne({ where: { guildId } });
  }

  /** isEnabled=true인 모든 길드 조회. 스케줄러 전용이므로 캐시 미사용. */
  async findAllEnabled(): Promise<WeeklyReportConfigOrmEntity[]> {
    return this.repo.find({ where: { isEnabled: true } });
  }

  /** 설정 생성 또는 갱신 (guildId PK 기준). */
  async upsert(
    guildId: string,
    dto: WeeklyReportConfigSaveDto,
  ): Promise<WeeklyReportConfigOrmEntity> {
    let config = await this.repo.findOne({ where: { guildId } });

    if (config) {
      config.isEnabled = dto.isEnabled;
      config.channelId = dto.channelId;
      config.dayOfWeek = dto.dayOfWeek;
      config.hour = dto.hour;
      config.timezone = dto.timezone;
    } else {
      config = this.repo.create({ guildId, ...dto });
    }

    return this.repo.save(config);
  }
}
