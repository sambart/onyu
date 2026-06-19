import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AuditLogOrmEntity } from './audit-log.orm-entity';

export interface AuditLogInput {
  adminDiscordUserId: string;
  guildId: string | null;
  httpMethod: string;
  requestPath: string;
}

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repo: Repository<AuditLogOrmEntity>,
  ) {}

  async insert(input: AuditLogInput): Promise<void> {
    await this.repo.insert(input);
  }
}
