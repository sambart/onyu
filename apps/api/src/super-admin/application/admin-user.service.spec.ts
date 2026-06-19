import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Mocked } from 'vitest';

import type { AdminUserOrmEntity } from '../infrastructure/admin-user.orm-entity';
import type { AdminUserRepository } from '../infrastructure/admin-user.repository';
import { AdminUserService } from './admin-user.service';

function makeEntity(overrides: Partial<AdminUserOrmEntity> = {}): AdminUserOrmEntity {
  return {
    id: 'uuid-1',
    discordUserId: 'discord-123',
    role: 'super_admin',
    permissions: null,
    grantedBy: null,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as AdminUserOrmEntity;
}

function makeRepo(): Mocked<AdminUserRepository> {
  return {
    findByDiscordId: vi.fn(),
    findAll: vi.fn(),
    insert: vi.fn(),
    updateRole: vi.fn(),
    setActive: vi.fn(),
    countActiveSuperAdmins: vi.fn(),
    withTransaction: vi.fn(),
    countActiveSuperAdminsInTx: vi.fn(),
    setActiveInTx: vi.fn(),
    updateRoleInTx: vi.fn(),
  } as unknown as Mocked<AdminUserRepository>;
}

describe('AdminUserService', () => {
  let service: AdminUserService;
  let repo: Mocked<AdminUserRepository>;

  beforeEach(() => {
    repo = makeRepo();
    service = new AdminUserService(repo);
  });

  describe('listAdmins', () => {
    it('activeOnly 없이 호출하면 findAll(undefined)로 위임한다', async () => {
      repo.findAll.mockResolvedValue([]);
      const result = await service.listAdmins();
      expect(repo.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([]);
    });

    it('activeOnly=true로 호출하면 findAll(true)로 위임한다', async () => {
      const entities = [makeEntity()];
      repo.findAll.mockResolvedValue(entities);
      const result = await service.listAdmins(true);
      expect(repo.findAll).toHaveBeenCalledWith(true);
      expect(result).toEqual(entities);
    });
  });

  describe('addAdmin', () => {
    it('신규 관리자를 정상 추가한다 (permissions: null로 삽입)', async () => {
      repo.findByDiscordId.mockResolvedValue(null);
      const entity = makeEntity({ discordUserId: 'new-user', role: 'bot_operator' });
      repo.insert.mockResolvedValue(entity);

      const result = await service.addAdmin(
        { discordUserId: 'new-user', role: 'bot_operator' },
        'granter-id',
      );

      expect(repo.findByDiscordId).toHaveBeenCalledWith('new-user');
      expect(repo.insert).toHaveBeenCalledWith({
        discordUserId: 'new-user',
        role: 'bot_operator',
        grantedBy: 'granter-id',
        permissions: null,
      });
      expect(result).toBe(entity);
    });

    it('이미 등록된 discordUserId → ConflictException throw', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity());

      await expect(
        service.addAdmin({ discordUserId: 'discord-123', role: 'super_admin' }, 'granter-id'),
      ).rejects.toThrow(ConflictException);
    });

    it('ConflictException 시 insert가 호출되지 않는다', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity());

      await expect(
        service.addAdmin({ discordUserId: 'discord-123', role: 'super_admin' }, 'granter-id'),
      ).rejects.toThrow();

      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('updateAdminRole', () => {
    it('존재하지 않는 discordUserId → NotFoundException throw', async () => {
      repo.findByDiscordId.mockResolvedValue(null);

      await expect(service.updateAdminRole('unknown', 'bot_operator')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('bot_operator → super_admin 업그레이드: 트랜잭션 없이 updateRole 직접 호출', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'bot_operator' }));
      const updated = makeEntity({ role: 'super_admin' });
      repo.updateRole.mockResolvedValue(updated);

      const result = await service.updateAdminRole('discord-123', 'super_admin');

      expect(repo.withTransaction).not.toHaveBeenCalled();
      expect(repo.updateRole).toHaveBeenCalledWith('discord-123', 'super_admin');
      expect(result).toBe(updated);
    });

    it('super_admin → bot_operator 다운그레이드: 트랜잭션으로 count 체크 후 업데이트', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin' }));
      const updated = makeEntity({ role: 'bot_operator' });

      // withTransaction이 콜백을 실행하도록 mock
      repo.withTransaction.mockImplementation(async (work) => {
        const fakeManager = {} as EntityManager;
        return work(fakeManager);
      });
      repo.countActiveSuperAdminsInTx.mockResolvedValue(2); // 여유 있음
      repo.updateRoleInTx.mockResolvedValue(updated);

      const result = await service.updateAdminRole('discord-123', 'bot_operator');

      expect(repo.withTransaction).toHaveBeenCalled();
      expect(repo.countActiveSuperAdminsInTx).toHaveBeenCalled();
      expect(repo.updateRoleInTx).toHaveBeenCalled();
      expect(result).toBe(updated);
    });

    it('마지막 super_admin 다운그레이드 시도 → BadRequestException throw', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin' }));

      repo.withTransaction.mockImplementation(async (work) => {
        const fakeManager = {} as EntityManager;
        return work(fakeManager);
      });
      repo.countActiveSuperAdminsInTx.mockResolvedValue(1); // 마지막 1명

      await expect(service.updateAdminRole('discord-123', 'bot_operator')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('BadRequestException 시 updateRoleInTx가 호출되지 않는다', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin' }));

      repo.withTransaction.mockImplementation(async (work) => {
        const fakeManager = {} as EntityManager;
        return work(fakeManager);
      });
      repo.countActiveSuperAdminsInTx.mockResolvedValue(1);

      await expect(service.updateAdminRole('discord-123', 'bot_operator')).rejects.toThrow();

      expect(repo.updateRoleInTx).not.toHaveBeenCalled();
    });
  });

  describe('deactivateAdmin', () => {
    it('자기 자신을 비활성화하려 하면 ForbiddenException throw', async () => {
      await expect(service.deactivateAdmin('same-id', 'same-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('자기 자신 비활성화 시 findByDiscordId가 호출되지 않는다', async () => {
      await expect(service.deactivateAdmin('same-id', 'same-id')).rejects.toThrow();
      expect(repo.findByDiscordId).not.toHaveBeenCalled();
    });

    it('존재하지 않는 discordUserId → NotFoundException throw', async () => {
      repo.findByDiscordId.mockResolvedValue(null);

      await expect(service.deactivateAdmin('unknown', 'requester')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('bot_operator 비활성화: 트랜잭션 없이 setActive 직접 호출', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'bot_operator', isActive: true }));
      repo.setActive.mockResolvedValue(makeEntity({ isActive: false }));

      await service.deactivateAdmin('discord-123', 'other-requester');

      expect(repo.withTransaction).not.toHaveBeenCalled();
      expect(repo.setActive).toHaveBeenCalledWith('discord-123', false);
    });

    it('super_admin 비활성화: 트랜잭션으로 count 체크 후 비활성화', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin', isActive: true }));

      repo.withTransaction.mockImplementation(async (work) => {
        const fakeManager = {} as EntityManager;
        return work(fakeManager);
      });
      repo.countActiveSuperAdminsInTx.mockResolvedValue(2);
      repo.setActiveInTx.mockResolvedValue(makeEntity({ isActive: false }));

      await service.deactivateAdmin('discord-123', 'other-requester');

      expect(repo.withTransaction).toHaveBeenCalled();
      expect(repo.countActiveSuperAdminsInTx).toHaveBeenCalled();
      expect(repo.setActiveInTx).toHaveBeenCalledWith(expect.anything(), 'discord-123', false);
    });

    it('마지막 super_admin 비활성화 시도 → BadRequestException throw', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin', isActive: true }));

      repo.withTransaction.mockImplementation(async (work) => {
        const fakeManager = {} as EntityManager;
        return work(fakeManager);
      });
      repo.countActiveSuperAdminsInTx.mockResolvedValue(1);

      await expect(service.deactivateAdmin('discord-123', 'other-requester')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('BadRequestException 시 setActiveInTx가 호출되지 않는다', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin', isActive: true }));

      repo.withTransaction.mockImplementation(async (work) => {
        const fakeManager = {} as EntityManager;
        return work(fakeManager);
      });
      repo.countActiveSuperAdminsInTx.mockResolvedValue(1);

      await expect(service.deactivateAdmin('discord-123', 'other-requester')).rejects.toThrow();

      expect(repo.setActiveInTx).not.toHaveBeenCalled();
    });

    it('이미 비활성인 super_admin: 트랜잭션 없이 setActive 직접 호출', async () => {
      repo.findByDiscordId.mockResolvedValue(makeEntity({ role: 'super_admin', isActive: false }));
      repo.setActive.mockResolvedValue(makeEntity({ isActive: false }));

      await service.deactivateAdmin('discord-123', 'other-requester');

      expect(repo.withTransaction).not.toHaveBeenCalled();
      expect(repo.setActive).toHaveBeenCalledWith('discord-123', false);
    });
  });
});
