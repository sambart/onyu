/**
 * RolePanelBotService 단위 테스트
 *
 * 커버 케이스:
 * - getConfigForBot: DB 직접 조회 → BotRolePanelConfigDto 매핑
 * - buttons가 없는 경우 빈 배열 반환
 * - mode 타입 리터럴 유니온('GRANT'|'TOGGLE') 변환
 */

import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { type Mock } from 'vitest';

import type { RolePanelButtonOrm } from '../infrastructure/role-panel-button.orm-entity';
import type { RolePanelConfigOrm } from '../infrastructure/role-panel-config.orm-entity';
import { RolePanelBotService } from './role-panel-bot.service';

function makeButton(overrides: Partial<RolePanelButtonOrm> = {}): RolePanelButtonOrm {
  return {
    id: 1,
    panelId: 1,
    panel: {} as RolePanelConfigOrm,
    label: '정회원',
    emoji: null,
    roleId: 'role-grant-1',
    mode: RolePanelButtonMode.GRANT,
    style: RolePanelButtonStyle.PRIMARY,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    published: true,
    buttons: [makeButton()],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RolePanelBotService', () => {
  let service: RolePanelBotService;
  let configRepo: { findByGuildId: Mock };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
    };

    service = new RolePanelBotService(configRepo as never);

    vi.clearAllMocks();
  });

  describe('getConfigForBot', () => {
    it('길드 패널 목록을 BotRolePanelConfigDto[]로 변환', async () => {
      const configs = [makeConfig()];
      configRepo.findByGuildId.mockResolvedValue(configs);

      const result = await service.getConfigForBot('guild-1');

      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(result).toHaveLength(1);
      expect(result[0].panelId).toBe(1);
      expect(result[0].buttons).toHaveLength(1);
      expect(result[0].buttons[0].buttonId).toBe(1);
      expect(result[0].buttons[0].roleId).toBe('role-grant-1');
    });

    it('GRANT 모드 버튼 → mode 값이 문자열 "GRANT"', async () => {
      const config = makeConfig({
        buttons: [makeButton({ mode: RolePanelButtonMode.GRANT })],
      });
      configRepo.findByGuildId.mockResolvedValue([config]);

      const result = await service.getConfigForBot('guild-1');

      expect(result[0].buttons[0].mode).toBe('GRANT');
    });

    it('TOGGLE 모드 버튼 → mode 값이 문자열 "TOGGLE"', async () => {
      const config = makeConfig({
        buttons: [makeButton({ id: 2, mode: RolePanelButtonMode.TOGGLE, roleId: 'role-toggle' })],
      });
      configRepo.findByGuildId.mockResolvedValue([config]);

      const result = await service.getConfigForBot('guild-1');

      expect(result[0].buttons[0].mode).toBe('TOGGLE');
    });

    it('패널이 없는 길드는 빈 배열 반환', async () => {
      configRepo.findByGuildId.mockResolvedValue([]);

      const result = await service.getConfigForBot('guild-empty');

      expect(result).toEqual([]);
    });

    it('buttons가 빈 배열인 패널 → buttons: [] 반환', async () => {
      const config = makeConfig({ buttons: [] });
      configRepo.findByGuildId.mockResolvedValue([config]);

      const result = await service.getConfigForBot('guild-1');

      expect(result[0].buttons).toEqual([]);
    });

    it('버튼 undefined인 패널 → buttons: [] 반환 (nullish 방어)', async () => {
      const config = makeConfig({ buttons: undefined as never });
      configRepo.findByGuildId.mockResolvedValue([config]);

      const result = await service.getConfigForBot('guild-1');

      expect(result[0].buttons).toEqual([]);
    });

    it('여러 패널 → panelId 각각 매핑됨', async () => {
      const configs = [
        makeConfig({ id: 1, buttons: [makeButton({ id: 10, roleId: 'role-a' })] }),
        makeConfig({ id: 2, buttons: [makeButton({ id: 20, roleId: 'role-b' })] }),
      ];
      configRepo.findByGuildId.mockResolvedValue(configs);

      const result = await service.getConfigForBot('guild-1');

      expect(result).toHaveLength(2);
      expect(result[0].panelId).toBe(1);
      expect(result[1].panelId).toBe(2);
      expect(result[0].buttons[0].buttonId).toBe(10);
      expect(result[1].buttons[0].buttonId).toBe(20);
    });
  });
});
