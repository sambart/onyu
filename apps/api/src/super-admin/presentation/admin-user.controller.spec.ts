import type { Request } from 'express';
import type { Mocked } from 'vitest';

import type { AdminUserService } from '../application/admin-user.service';
import { AdminUserResponseDto } from '../dto/admin-user.dto';
import type { AdminUserOrmEntity } from '../infrastructure/admin-user.orm-entity';
import { AdminUserController } from './admin-user.controller';

function makeEntity(overrides: Partial<AdminUserOrmEntity> = {}): AdminUserOrmEntity {
  return {
    id: 'uuid-1',
    discordUserId: '123456789012345678',
    role: 'super_admin',
    permissions: null,
    grantedBy: 'granter-id',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  } as AdminUserOrmEntity;
}

function makeService(): Mocked<AdminUserService> {
  return {
    listAdmins: vi.fn(),
    addAdmin: vi.fn(),
    updateAdminRole: vi.fn(),
    deactivateAdmin: vi.fn(),
  } as unknown as Mocked<AdminUserService>;
}

describe('AdminUserController', () => {
  let controller: AdminUserController;
  let service: Mocked<AdminUserService>;

  beforeEach(() => {
    service = makeService();
    controller = new AdminUserController(service);
  });

  describe('listAdmins', () => {
    it('activeOnly=undefined → listAdmins(false) 호출 후 admins 배열 반환', async () => {
      const entity = makeEntity();
      service.listAdmins.mockResolvedValue([entity]);

      const result = await controller.listAdmins(undefined);

      expect(service.listAdmins).toHaveBeenCalledWith(false);
      expect(result.admins).toHaveLength(1);
      expect(result.admins[0]).toBeInstanceOf(AdminUserResponseDto);
    });

    it('activeOnly="true" → listAdmins(true) 호출', async () => {
      service.listAdmins.mockResolvedValue([]);

      await controller.listAdmins('true');

      expect(service.listAdmins).toHaveBeenCalledWith(true);
    });

    it('activeOnly="false" → listAdmins(false) 호출', async () => {
      service.listAdmins.mockResolvedValue([]);

      await controller.listAdmins('false');

      expect(service.listAdmins).toHaveBeenCalledWith(false);
    });

    it('반환된 admins는 AdminUserResponseDto 인스턴스 배열이다', async () => {
      service.listAdmins.mockResolvedValue([
        makeEntity(),
        makeEntity({ discordUserId: '987654321098765432' }),
      ]);

      const result = await controller.listAdmins(undefined);

      expect(result.admins).toHaveLength(2);
      for (const admin of result.admins) {
        expect(admin).toBeInstanceOf(AdminUserResponseDto);
      }
    });
  });

  describe('addAdmin', () => {
    it('정상 추가: addAdmin 호출 후 AdminUserResponseDto 반환', async () => {
      const entity = makeEntity({ discordUserId: '123456789012345678', role: 'bot_operator' });
      service.addAdmin.mockResolvedValue(entity);
      const req = { user: { discordId: 'granter-id' } } as unknown as Request;

      const result = await controller.addAdmin(
        { discordUserId: '123456789012345678', role: 'bot_operator' },
        req,
      );

      expect(service.addAdmin).toHaveBeenCalledWith(
        { discordUserId: '123456789012345678', role: 'bot_operator' },
        'granter-id',
      );
      expect(result).toBeInstanceOf(AdminUserResponseDto);
      expect(result.discordUserId).toBe('123456789012345678');
    });

    it('req.user.discordId가 없으면 grantedBy="unknown"으로 호출한다', async () => {
      const entity = makeEntity();
      service.addAdmin.mockResolvedValue(entity);
      const req = {} as Request;

      await controller.addAdmin({ discordUserId: '123456789012345678', role: 'super_admin' }, req);

      expect(service.addAdmin).toHaveBeenCalledWith(expect.anything(), 'unknown');
    });
  });

  describe('updateAdminRole', () => {
    it('정상 업데이트: updateAdminRole 호출 후 AdminUserResponseDto 반환', async () => {
      const entity = makeEntity({ role: 'bot_operator' });
      service.updateAdminRole.mockResolvedValue(entity);

      const result = await controller.updateAdminRole('discord-123', { role: 'bot_operator' });

      expect(service.updateAdminRole).toHaveBeenCalledWith('discord-123', 'bot_operator');
      expect(result).toBeInstanceOf(AdminUserResponseDto);
    });
  });

  describe('deactivateAdmin', () => {
    it('정상 비활성화: deactivateAdmin 호출 후 { success: true } 반환', async () => {
      service.deactivateAdmin.mockResolvedValue(undefined);
      const req = { user: { discordId: 'requester-id' } } as unknown as Request;

      const result = await controller.deactivateAdmin('discord-123', req);

      expect(service.deactivateAdmin).toHaveBeenCalledWith('discord-123', 'requester-id');
      expect(result).toEqual({ success: true });
    });

    it('req.user.discordId가 없으면 requestingDiscordId=""로 호출한다', async () => {
      service.deactivateAdmin.mockResolvedValue(undefined);
      const req = {} as Request;

      await controller.deactivateAdmin('discord-123', req);

      expect(service.deactivateAdmin).toHaveBeenCalledWith('discord-123', '');
    });
  });

  describe('toResponse (AdminUserResponseDto 변환)', () => {
    it('createdAt이 ISO8601 문자열로 변환된다', async () => {
      const date = new Date('2024-06-19T12:00:00.000Z');
      service.listAdmins.mockResolvedValue([makeEntity({ createdAt: date })]);

      const result = await controller.listAdmins(undefined);

      expect(result.admins[0]?.createdAt).toBe('2024-06-19T12:00:00.000Z');
    });
  });
});
