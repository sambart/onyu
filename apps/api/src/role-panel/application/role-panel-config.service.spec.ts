/**
 * RolePanelConfigService 단위 테스트
 *
 * 커버 케이스:
 * - getConfigs: Redis 캐시 히트/미스, 빈 배열 시 캐시 미저장
 * - getConfig: 정상 조회, 타 길드 panelId 접근 차단(EC-RP-31)
 * - createConfig: 역할 검증 → DB 저장 → Redis 무효화
 * - updateConfig: 소유 검증, 역할 재검증, published 시 resync 호출, resync 실패 시 에러 전파
 * - deleteConfig: messageId 있으면 Discord 삭제, DB 삭제, Redis 무효화
 * - publishConfig: PublishService 위임
 * - getAssignableRoles: 역할별 assignable/disabledReason 부착
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { type Mock } from 'vitest';

import type { RolePanelButtonOrm } from '../infrastructure/role-panel-button.orm-entity';
import type { RolePanelConfigOrm } from '../infrastructure/role-panel-config.orm-entity';
import { RolePanelConfigService } from './role-panel-config.service';

function makeButton(overrides: Partial<RolePanelButtonOrm> = {}): RolePanelButtonOrm {
  return {
    id: 1,
    panelId: 1,
    panel: {} as RolePanelConfigOrm,
    label: '정회원',
    emoji: null,
    roleId: 'role-1',
    mode: RolePanelButtonMode.GRANT,
    style: RolePanelButtonStyle.PRIMARY,
    sortOrder: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<RolePanelConfigOrm> = {}): RolePanelConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    name: '역할 패널',
    channelId: 'ch-1',
    messageId: null,
    embedTitle: '역할 선택',
    embedDescription: '버튼을 클릭하세요',
    embedColor: '#5865F2',
    published: false,
    buttons: [makeButton()],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('RolePanelConfigService', () => {
  let service: RolePanelConfigService;
  let configRepo: {
    findByGuildId: Mock;
    findByIdAndGuild: Mock;
    createWithButtons: Mock;
    updateWithButtons: Mock;
    updateMessageId: Mock;
    deleteById: Mock;
  };
  let redisRepo: {
    getConfig: Mock;
    setConfig: Mock;
    deleteConfig: Mock;
  };
  let discordAdapter: {
    getBotUserId: Mock;
    fetchGuildRoles: Mock;
    fetchGuildMember: Mock;
    sendMessage: Mock;
    editMessage: Mock;
    deleteMessage: Mock;
  };
  let roleValidator: { validate: Mock };
  let publishService: {
    publish: Mock;
    resyncOnUpdate: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      findByIdAndGuild: vi.fn(),
      createWithButtons: vi.fn(),
      updateWithButtons: vi.fn(),
      updateMessageId: vi.fn(),
      deleteById: vi.fn(),
    };
    redisRepo = {
      getConfig: vi.fn(),
      setConfig: vi.fn().mockResolvedValue(undefined),
      deleteConfig: vi.fn().mockResolvedValue(undefined),
    };
    discordAdapter = {
      getBotUserId: vi.fn().mockReturnValue('bot-user-id'),
      fetchGuildRoles: vi.fn(),
      fetchGuildMember: vi.fn(),
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
    roleValidator = { validate: vi.fn() };
    publishService = {
      publish: vi.fn(),
      resyncOnUpdate: vi.fn(),
    };

    service = new RolePanelConfigService(
      configRepo as never,
      redisRepo as never,
      discordAdapter as never,
      roleValidator as never,
      publishService as never,
    );

    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // getConfigs
  // ──────────────────────────────────────────────────────
  describe('getConfigs', () => {
    it('Redis 캐시 히트 시 DB 조회 없이 캐시 값 반환', async () => {
      const cached = [makeConfig()];
      redisRepo.getConfig.mockResolvedValue(cached);

      const result = await service.getConfigs('guild-1');

      expect(redisRepo.getConfig).toHaveBeenCalledWith('guild-1');
      expect(configRepo.findByGuildId).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('Redis 캐시 미스 → DB 조회 → 결과 있으면 캐시 저장', async () => {
      const dbConfigs = [makeConfig()];
      redisRepo.getConfig.mockResolvedValue(null);
      configRepo.findByGuildId.mockResolvedValue(dbConfigs);

      const result = await service.getConfigs('guild-1');

      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(redisRepo.setConfig).toHaveBeenCalledWith('guild-1', dbConfigs);
      expect(result).toHaveLength(1);
    });

    it('Redis 미스 + DB 결과 빈 배열 → 캐시 저장 안 함', async () => {
      redisRepo.getConfig.mockResolvedValue(null);
      configRepo.findByGuildId.mockResolvedValue([]);

      const result = await service.getConfigs('guild-1');

      expect(redisRepo.setConfig).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('DTO 변환: channelName과 roleName은 null', async () => {
      const dbConfigs = [makeConfig()];
      redisRepo.getConfig.mockResolvedValue(null);
      configRepo.findByGuildId.mockResolvedValue(dbConfigs);

      const result = await service.getConfigs('guild-1');

      expect(result[0].channelName).toBeNull();
      expect(result[0].buttons[0].roleName).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────
  // getConfig (EC-RP-31: 타 길드 panelId 접근 차단)
  // ──────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('정상: 소유한 panelId 조회 성공', async () => {
      const config = makeConfig();
      configRepo.findByIdAndGuild.mockResolvedValue(config);

      const result = await service.getConfig('guild-1', 1);

      expect(configRepo.findByIdAndGuild).toHaveBeenCalledWith(1, 'guild-1');
      expect(result.id).toBe(1);
    });

    it('EC-RP-31: 타 길드의 panelId 접근 시 NotFoundException', async () => {
      configRepo.findByIdAndGuild.mockResolvedValue(null);

      await expect(service.getConfig('guild-other', 1)).rejects.toThrow(NotFoundException);
    });

    it('존재하지 않는 panelId 조회 시 NotFoundException', async () => {
      configRepo.findByIdAndGuild.mockResolvedValue(null);

      await expect(service.getConfig('guild-1', 9999)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────
  // createConfig
  // ──────────────────────────────────────────────────────
  describe('createConfig', () => {
    const createDto = {
      name: '역할 패널',
      channelId: 'ch-1',
      embedTitle: '역할 선택',
      embedDescription: null,
      embedColor: '#5865F2',
      buttons: [
        {
          label: '정회원',
          emoji: null,
          roleId: 'role-1',
          mode: RolePanelButtonMode.GRANT,
          style: RolePanelButtonStyle.PRIMARY,
          sortOrder: 0,
        },
      ],
    };

    beforeEach(() => {
      // validateRoles 내부의 fetchGuildRoles + getBotTopPosition mock
      discordAdapter.fetchGuildRoles.mockResolvedValue([]);
      discordAdapter.fetchGuildMember.mockResolvedValue({ roles: [] });
      roleValidator.validate.mockReturnValue(undefined);
    });

    it('역할 검증 → DB 저장 → Redis 무효화 → DTO 반환', async () => {
      const created = makeConfig();
      configRepo.createWithButtons.mockResolvedValue(created);

      const result = await service.createConfig('guild-1', createDto as never);

      expect(roleValidator.validate).toHaveBeenCalled();
      expect(configRepo.createWithButtons).toHaveBeenCalledWith('guild-1', createDto);
      expect(redisRepo.deleteConfig).toHaveBeenCalledWith('guild-1');
      expect(result.id).toBe(1);
      expect(result.published).toBe(false);
    });

    it('역할 검증 실패 시 DB 저장 호출 안 함', async () => {
      roleValidator.validate.mockImplementation(() => {
        throw new ForbiddenException('ADMINISTRATOR 역할 차단');
      });

      await expect(service.createConfig('guild-1', createDto as never)).rejects.toThrow(
        ForbiddenException,
      );

      expect(configRepo.createWithButtons).not.toHaveBeenCalled();
      expect(redisRepo.deleteConfig).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // updateConfig
  // ──────────────────────────────────────────────────────
  describe('updateConfig', () => {
    const updateDto = {
      name: '수정된 패널',
      channelId: 'ch-2',
      embedTitle: '수정 타이틀',
      embedDescription: null,
      embedColor: null,
      buttons: [
        {
          label: '수정 버튼',
          emoji: null,
          roleId: 'role-2',
          mode: RolePanelButtonMode.TOGGLE,
          style: RolePanelButtonStyle.SECONDARY,
          sortOrder: 0,
        },
      ],
    };

    beforeEach(() => {
      discordAdapter.fetchGuildRoles.mockResolvedValue([]);
      discordAdapter.fetchGuildMember.mockResolvedValue({ roles: [] });
      roleValidator.validate.mockReturnValue(undefined);
    });

    it('소유 검증 실패(타 길드) 시 NotFoundException', async () => {
      configRepo.findByIdAndGuild.mockResolvedValue(null);

      await expect(service.updateConfig('guild-other', 1, updateDto as never)).rejects.toThrow(
        NotFoundException,
      );

      expect(configRepo.updateWithButtons).not.toHaveBeenCalled();
    });

    it('published=false 패널 수정 시 resyncOnUpdate 호출 안 함', async () => {
      const existing = makeConfig({ published: false });
      const updated = makeConfig({ name: '수정된 패널', channelId: 'ch-2' });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(existing) // 소유 검증
        .mockResolvedValueOnce(updated); // 최종 반환용
      configRepo.updateWithButtons.mockResolvedValue(undefined);

      await service.updateConfig('guild-1', 1, updateDto as never);

      expect(publishService.resyncOnUpdate).not.toHaveBeenCalled();
      expect(redisRepo.deleteConfig).toHaveBeenCalledWith('guild-1');
    });

    it('published=true 패널 수정 시 resyncOnUpdate 호출됨', async () => {
      const existing = makeConfig({ published: true, channelId: 'ch-1', messageId: 'msg-1' });
      const updated = makeConfig({ published: true, channelId: 'ch-2' });
      configRepo.findByIdAndGuild.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
      configRepo.updateWithButtons.mockResolvedValue(undefined);
      publishService.resyncOnUpdate.mockResolvedValue(undefined);

      await service.updateConfig('guild-1', 1, updateDto as never);

      expect(publishService.resyncOnUpdate).toHaveBeenCalledWith({
        guildId: 'guild-1',
        panelId: 1,
        oldChannelId: 'ch-1',
        oldMessageId: 'msg-1',
      });
    });

    it('resyncOnUpdate 실패 시 에러가 상위로 전파됨', async () => {
      const existing = makeConfig({ published: true, channelId: 'ch-1', messageId: 'msg-1' });
      configRepo.findByIdAndGuild.mockResolvedValueOnce(existing);
      configRepo.updateWithButtons.mockResolvedValue(undefined);
      publishService.resyncOnUpdate.mockRejectedValue(new Error('Discord 오류'));

      await expect(service.updateConfig('guild-1', 1, updateDto as never)).rejects.toThrow(
        'Discord 오류',
      );
    });

    it('역할 검증 실패 시 updateWithButtons 호출 안 함', async () => {
      const existing = makeConfig({ published: false });
      configRepo.findByIdAndGuild.mockResolvedValueOnce(existing);
      roleValidator.validate.mockImplementation(() => {
        throw new ForbiddenException('ADMINISTRATOR');
      });

      await expect(service.updateConfig('guild-1', 1, updateDto as never)).rejects.toThrow(
        ForbiddenException,
      );

      expect(configRepo.updateWithButtons).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // deleteConfig
  // ──────────────────────────────────────────────────────
  describe('deleteConfig', () => {
    it('존재하지 않는 panelId 삭제 시 NotFoundException', async () => {
      configRepo.findByIdAndGuild.mockResolvedValue(null);

      await expect(service.deleteConfig('guild-1', 9999)).rejects.toThrow(NotFoundException);

      expect(configRepo.deleteById).not.toHaveBeenCalled();
    });

    it('messageId+channelId 있으면 Discord 메시지 삭제 호출 후 DB 삭제', async () => {
      const config = makeConfig({ channelId: 'ch-1', messageId: 'msg-1' });
      configRepo.findByIdAndGuild.mockResolvedValue(config);
      configRepo.deleteById.mockResolvedValue(undefined);

      await service.deleteConfig('guild-1', 1);

      expect(discordAdapter.deleteMessage).toHaveBeenCalledWith('ch-1', 'msg-1');
      expect(configRepo.deleteById).toHaveBeenCalledWith(1);
      expect(redisRepo.deleteConfig).toHaveBeenCalledWith('guild-1');
    });

    it('messageId 없으면 Discord 삭제 미호출 → DB 삭제 → Redis 무효화', async () => {
      const config = makeConfig({ channelId: 'ch-1', messageId: null });
      configRepo.findByIdAndGuild.mockResolvedValue(config);
      configRepo.deleteById.mockResolvedValue(undefined);

      await service.deleteConfig('guild-1', 1);

      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
      expect(configRepo.deleteById).toHaveBeenCalledWith(1);
      expect(redisRepo.deleteConfig).toHaveBeenCalledWith('guild-1');
    });

    it('channelId 없으면 Discord 삭제 미호출', async () => {
      const config = makeConfig({ channelId: null, messageId: 'msg-orphan' });
      configRepo.findByIdAndGuild.mockResolvedValue(config);
      configRepo.deleteById.mockResolvedValue(undefined);

      await service.deleteConfig('guild-1', 1);

      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
      expect(configRepo.deleteById).toHaveBeenCalledWith(1);
    });
  });

  // ──────────────────────────────────────────────────────
  // publishConfig
  // ──────────────────────────────────────────────────────
  describe('publishConfig', () => {
    it('PublishService.publish에 위임하고 DTO 반환', async () => {
      const published = makeConfig({ messageId: 'new-msg', published: true });
      publishService.publish.mockResolvedValue(published);

      const result = await service.publishConfig('guild-1', 1);

      expect(publishService.publish).toHaveBeenCalledWith('guild-1', 1);
      expect(result.messageId).toBe('new-msg');
      expect(result.published).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────
  // getAssignableRoles
  // ──────────────────────────────────────────────────────
  describe('getAssignableRoles', () => {
    const botUserId = 'bot-user-id';

    beforeEach(() => {
      discordAdapter.getBotUserId.mockReturnValue(botUserId);
    });

    it('부여 가능 역할은 assignable=true, disabledReason=null', async () => {
      const normalRole = {
        id: 'role-ok',
        name: '정회원',
        permissions: '0',
        position: 5,
        color: 0x5865f2,
        hoist: false,
        managed: false,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      const botRole = {
        id: 'bot-role-10',
        name: '봇 역할',
        permissions: '0',
        position: 10,
        color: 0,
        hoist: false,
        managed: true,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      // fetchGuildRoles는 두 번 호출됨: getAssignableRoles 1회 + getBotTopPosition 내부 1회
      discordAdapter.fetchGuildRoles
        .mockResolvedValueOnce([normalRole, botRole])
        .mockResolvedValueOnce([normalRole, botRole]);
      discordAdapter.fetchGuildMember.mockResolvedValue({
        roles: ['bot-role-10'],
      });

      const result = await service.getAssignableRoles('guild-1');

      const okRole = result.find((r) => r.id === 'role-ok');
      expect(okRole?.assignable).toBe(true);
      expect(okRole?.disabledReason).toBeNull();
    });

    it('ADMINISTRATOR 비트 역할은 disabledReason=ADMINISTRATOR', async () => {
      const adminRole = {
        id: 'role-admin',
        name: '관리자',
        permissions: '8', // ADMINISTRATOR
        position: 5,
        color: 0,
        hoist: false,
        managed: false,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      discordAdapter.fetchGuildRoles.mockResolvedValue([adminRole]);
      discordAdapter.fetchGuildMember.mockResolvedValue({ roles: [] });

      const result = await service.getAssignableRoles('guild-1');

      const found = result.find((r) => r.id === 'role-admin');
      expect(found?.assignable).toBe(false);
      expect(found?.disabledReason).toBe('ADMINISTRATOR');
    });

    it('@everyone 역할은 disabledReason=EVERYONE', async () => {
      const guildId = 'guild-1';
      const everyoneRole = {
        id: guildId,
        name: '@everyone',
        permissions: '0',
        position: 0,
        color: 0,
        hoist: false,
        managed: false,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      discordAdapter.fetchGuildRoles.mockResolvedValue([everyoneRole]);
      discordAdapter.fetchGuildMember.mockResolvedValue({ roles: [] });

      const result = await service.getAssignableRoles(guildId);

      const found = result.find((r) => r.id === guildId);
      expect(found?.assignable).toBe(false);
      expect(found?.disabledReason).toBe('EVERYONE');
    });

    it('managed 역할은 disabledReason=MANAGED', async () => {
      const managedRole = {
        id: 'role-bot',
        name: '봇 역할',
        permissions: '0',
        position: 3,
        color: 0,
        hoist: false,
        managed: true,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      discordAdapter.fetchGuildRoles.mockResolvedValue([managedRole]);
      discordAdapter.fetchGuildMember.mockResolvedValue({ roles: [] });

      const result = await service.getAssignableRoles('guild-1');

      const found = result.find((r) => r.id === 'role-bot');
      expect(found?.assignable).toBe(false);
      expect(found?.disabledReason).toBe('MANAGED');
    });

    it('봇보다 높은 위계 역할은 disabledReason=HIGHER_THAN_BOT', async () => {
      const highRole = {
        id: 'role-high',
        name: '고위 역할',
        permissions: '0',
        position: 20,
        color: 0,
        hoist: false,
        managed: false,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      const botRole = {
        id: 'bot-role',
        name: '봇 역할',
        permissions: '0',
        position: 10,
        color: 0,
        hoist: false,
        managed: true,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      // fetchGuildRoles가 두 번 호출됨: getAssignableRoles + getBotTopPosition
      discordAdapter.fetchGuildRoles
        .mockResolvedValueOnce([highRole, botRole])
        .mockResolvedValueOnce([highRole, botRole]);
      discordAdapter.fetchGuildMember.mockResolvedValue({ roles: ['bot-role'] });

      const result = await service.getAssignableRoles('guild-1');

      const found = result.find((r) => r.id === 'role-high');
      expect(found?.assignable).toBe(false);
      expect(found?.disabledReason).toBe('HIGHER_THAN_BOT');
    });

    it('fetchGuildMember가 null이어도 봇 managed 역할(tags.bot_id) position으로 폴백해 하위 역할은 assignable', async () => {
      // 회귀: 봇 멤버 조회 실패 시 botTop=0으로 떨어져 봇보다 낮은 역할까지 전부
      // HIGHER_THAN_BOT으로 오판되던 버그. managed 역할 폴백으로 정상 산출되어야 한다.
      const normalRole = {
        id: 'role-member',
        name: '정회원',
        permissions: '0',
        position: 2,
        color: 0x3447003,
        hoist: false,
        managed: false,
        mentionable: false,
        tags: undefined,
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      const botManagedRole = {
        id: 'role-onyu',
        name: 'Onyu',
        permissions: '0',
        position: 7,
        color: 0,
        hoist: false,
        managed: true,
        mentionable: false,
        tags: { bot_id: botUserId },
        icon: null,
        unicode_emoji: null,
        flags: 0,
      };
      discordAdapter.fetchGuildRoles
        .mockResolvedValueOnce([normalRole, botManagedRole])
        .mockResolvedValueOnce([normalRole, botManagedRole]);
      // 봇 멤버 조회 실패 (이번 버그의 트리거)
      discordAdapter.fetchGuildMember.mockResolvedValue(null);

      const result = await service.getAssignableRoles('guild-1');

      const member = result.find((r) => r.id === 'role-member');
      expect(member?.assignable).toBe(true);
      expect(member?.disabledReason).toBeNull();
    });
  });
});
