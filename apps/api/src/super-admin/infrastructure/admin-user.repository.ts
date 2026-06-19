import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { AdminUserOrmEntity } from './admin-user.orm-entity';

@Injectable()
export class AdminUserRepository {
  constructor(
    @InjectRepository(AdminUserOrmEntity)
    private readonly repo: Repository<AdminUserOrmEntity>,
  ) {}

  async findByDiscordId(discordUserId: string): Promise<AdminUserOrmEntity | null> {
    return this.repo.findOne({ where: { discordUserId } });
  }

  async findAll(activeOnly?: boolean): Promise<AdminUserOrmEntity[]> {
    if (activeOnly) {
      return this.repo.find({ where: { isActive: true } });
    }
    return this.repo.find();
  }

  async insert(input: {
    discordUserId: string;
    role: string;
    grantedBy: string | null;
    permissions?: string[] | null;
  }): Promise<AdminUserOrmEntity> {
    const entity = this.repo.create({
      discordUserId: input.discordUserId,
      role: input.role,
      grantedBy: input.grantedBy,
      permissions: input.permissions ?? null,
      isActive: true,
    });
    return this.repo.save(entity);
  }

  async updateRole(discordUserId: string, role: string): Promise<AdminUserOrmEntity | null> {
    await this.repo.update({ discordUserId }, { role });
    return this.findByDiscordId(discordUserId);
  }

  async setActive(discordUserId: string, isActive: boolean): Promise<AdminUserOrmEntity | null> {
    await this.repo.update({ discordUserId }, { isActive });
    return this.findByDiscordId(discordUserId);
  }

  async countActiveSuperAdmins(): Promise<number> {
    return this.repo.count({ where: { role: 'super_admin', isActive: true } });
  }

  /**
   * super_admin 최소 1명 보장이 필요한 쓰기 작업(비활성화/다운그레이드)을 트랜잭션으로 원자 실행한다.
   * count→write 사이 레이스 컨디션(동시 요청으로 0명 가능) 방어.
   */
  async withTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.repo.manager.transaction(work);
  }

  async countActiveSuperAdminsInTx(manager: EntityManager): Promise<number> {
    return manager.count(AdminUserOrmEntity, { where: { role: 'super_admin', isActive: true } });
  }

  async setActiveInTx(
    manager: EntityManager,
    discordUserId: string,
    isActive: boolean,
  ): Promise<AdminUserOrmEntity | null> {
    await manager.update(AdminUserOrmEntity, { discordUserId }, { isActive });
    return manager.findOne(AdminUserOrmEntity, { where: { discordUserId } });
  }

  async updateRoleInTx(
    manager: EntityManager,
    discordUserId: string,
    role: string,
  ): Promise<AdminUserOrmEntity | null> {
    await manager.update(AdminUserOrmEntity, { discordUserId }, { role });
    return manager.findOne(AdminUserOrmEntity, { where: { discordUserId } });
  }
}
