import { type GuildMember } from 'discord.js';
import { type Mocked, vi } from 'vitest';

import { type NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { type NewbiePeriodRepository } from '../../infrastructure/newbie-period.repository';
import { type NewbieRedisRepository } from '../../infrastructure/newbie-redis.repository';
import { NewbieRoleService } from './newbie-role.service';

vi.mock('@onyu/shared', () => ({
  getKSTDateString: vi.fn(() => '20260318'),
}));

function makeGuildMember(overrides: { guildId?: string; memberId?: string } = {}): GuildMember {
  const guildId = overrides.guildId ?? 'guild-1';
  const memberId = overrides.memberId ?? 'user-1';
  return {
    id: memberId,
    guild: { id: guildId },
    roles: { add: vi.fn().mockResolvedValue(undefined) },
  } as unknown as GuildMember;
}

function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    roleEnabled: true,
    newbieRoleId: 'role-newbie',
    roleDurationDays: 30,
    ...overrides,
  } as NewbieConfig;
}

describe('NewbieRoleService', () => {
  let service: NewbieRoleService;
  let periodRepo: Mocked<NewbiePeriodRepository>;
  let redisRepo: Mocked<NewbieRedisRepository>;

  beforeEach(() => {
    periodRepo = {
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<NewbiePeriodRepository>;

    redisRepo = {
      addPeriodActiveMember: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<NewbieRedisRepository>;

    service = new NewbieRoleService(periodRepo, redisRepo);
  });

  describe('assignRole', () => {
    it('Discord 역할을 부여하고 NewbiePeriod를 생성한다', async () => {
      const member = makeGuildMember();
      const config = makeConfig();

      await service.assignRole(member, config);

      expect(member.roles.add).toHaveBeenCalledWith('role-newbie');
      expect(periodRepo.create).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        '20260318',
        expect.any(String),
      );
      expect(redisRepo.addPeriodActiveMember).toHaveBeenCalledWith('guild-1', 'user-1');
    });

    it('newbieRoleId가 설정되지 않으면 아무것도 하지 않는다', async () => {
      const member = makeGuildMember();
      const config = makeConfig({ newbieRoleId: null });

      await service.assignRole(member, config);

      expect(member.roles.add).not.toHaveBeenCalled();
      expect(periodRepo.create).not.toHaveBeenCalled();
      expect(redisRepo.addPeriodActiveMember).not.toHaveBeenCalled();
    });

    it('만료일을 roleDurationDays 기준으로 계산한다 (30일)', async () => {
      const member = makeGuildMember();
      const config = makeConfig({ roleDurationDays: 30 });

      await service.assignRole(member, config);

      // 20260318 + 30일 = 20260417
      expect(periodRepo.create).toHaveBeenCalledWith('guild-1', 'user-1', '20260318', '20260417');
    });

    it('만료일을 roleDurationDays 기준으로 계산한다 (7일)', async () => {
      const member = makeGuildMember();
      const config = makeConfig({ roleDurationDays: 7 });

      await service.assignRole(member, config);

      // 20260318 + 7일 = 20260325
      expect(periodRepo.create).toHaveBeenCalledWith('guild-1', 'user-1', '20260318', '20260325');
    });

    it('월 경계를 넘는 만료일을 올바르게 계산한다', async () => {
      const member = makeGuildMember();
      const config = makeConfig({ roleDurationDays: 90 });

      await service.assignRole(member, config);

      // 20260318 + 90일 = 20260616
      expect(periodRepo.create).toHaveBeenCalledWith('guild-1', 'user-1', '20260318', '20260616');
    });
  });
});
