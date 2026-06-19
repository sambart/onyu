import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminRole } from '@onyu/shared';

import type { AdminUserOrmEntity } from '../infrastructure/admin-user.orm-entity';
import { AdminUserRepository } from '../infrastructure/admin-user.repository';

const MIN_SUPER_ADMIN_COUNT = 1;
const SUPER_ADMIN_ROLE = 'super_admin';

@Injectable()
export class AdminUserService {
  constructor(private readonly adminUserRepository: AdminUserRepository) {}

  async listAdmins(activeOnly?: boolean): Promise<AdminUserOrmEntity[]> {
    return this.adminUserRepository.findAll(activeOnly);
  }

  async addAdmin(
    input: { discordUserId: string; role: AdminRole },
    grantedBy: string,
  ): Promise<AdminUserOrmEntity> {
    const existing = await this.adminUserRepository.findByDiscordId(input.discordUserId);
    if (existing) {
      throw new ConflictException(
        '이미 등록된 관리자입니다. 비활성 계정을 재활성화하려면 PATCH를 사용하세요.',
      );
    }

    return this.adminUserRepository.insert({
      discordUserId: input.discordUserId,
      role: input.role,
      grantedBy,
      permissions: null,
    });
  }

  async updateAdminRole(discordUserId: string, newRole: AdminRole): Promise<AdminUserOrmEntity> {
    const target = await this.adminUserRepository.findByDiscordId(discordUserId);
    if (!target) {
      throw new NotFoundException('관리자를 찾을 수 없습니다.');
    }

    // super_admin → bot_operator 다운그레이드 시 최소 1명 유지 검사.
    // count→update 사이 레이스를 방어하기 위해 트랜잭션으로 원자 실행한다 (계획 §10 동시성).
    if (target.role === SUPER_ADMIN_ROLE && newRole !== SUPER_ADMIN_ROLE) {
      const updated = await this.adminUserRepository.withTransaction(async (manager) => {
        const count = await this.adminUserRepository.countActiveSuperAdminsInTx(manager);
        if (count <= MIN_SUPER_ADMIN_COUNT) {
          throw new BadRequestException('최소 1명의 슈퍼관리자가 필요합니다.');
        }
        return this.adminUserRepository.updateRoleInTx(manager, discordUserId, newRole);
      });
      if (!updated) {
        throw new NotFoundException('관리자를 찾을 수 없습니다.');
      }
      return updated;
    }

    const updated = await this.adminUserRepository.updateRole(discordUserId, newRole);
    if (!updated) {
      throw new NotFoundException('관리자를 찾을 수 없습니다.');
    }
    return updated;
  }

  async deactivateAdmin(discordUserId: string, requestingDiscordId: string): Promise<void> {
    // 자기 자신 비활성화 불가
    if (requestingDiscordId === discordUserId) {
      throw new ForbiddenException('자기 자신은 비활성화할 수 없습니다.');
    }

    const target = await this.adminUserRepository.findByDiscordId(discordUserId);
    if (!target) {
      throw new NotFoundException('관리자를 찾을 수 없습니다.');
    }

    // super_admin 비활성화 시 최소 1명 유지 검사.
    // count→update 사이 레이스를 방어하기 위해 트랜잭션으로 원자 실행한다 (계획 §10 동시성).
    if (target.role === SUPER_ADMIN_ROLE && target.isActive) {
      await this.adminUserRepository.withTransaction(async (manager) => {
        const count = await this.adminUserRepository.countActiveSuperAdminsInTx(manager);
        if (count <= MIN_SUPER_ADMIN_COUNT) {
          throw new BadRequestException('최소 1명의 슈퍼관리자가 필요합니다.');
        }
        await this.adminUserRepository.setActiveInTx(manager, discordUserId, false);
      });
      return;
    }

    await this.adminUserRepository.setActive(discordUserId, false);
  }
}
