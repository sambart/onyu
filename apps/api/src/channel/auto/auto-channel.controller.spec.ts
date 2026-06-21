/**
 * AutoChannelController 단위 테스트
 *
 * 검증 범위:
 * - save(): DB upsert 직후(모드 분기 전) stampLastSavedAt 호출 (select / instant 양쪽)
 * - save(): POST 응답에 lastSavedAt ISO 문자열 포함
 * - save(): select 모드 — 안내 메시지 전송/갱신
 * - save(): instant 모드 — 기존 안내 메시지 삭제
 */

import { type Mock } from 'vitest';

import { AutoChannelController } from './auto-channel.controller';
import type { AutoChannelSaveDto } from './dto/auto-channel-save.dto';
import type { AutoChannelConfigOrm } from './infrastructure/auto-channel-config.orm-entity';
import type { AutoChannelConfigRepository } from './infrastructure/auto-channel-config.repository';
import type { AutoChannelDiscordGateway } from './infrastructure/auto-channel-discord.gateway';

// ──────────────────────────────────────────────────────────────
// 헬퍼 팩토리
// ──────────────────────────────────────────────────────────────

function makeOrmConfig(overrides: Partial<AutoChannelConfigOrm> = {}): AutoChannelConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    name: '게임방',
    triggerChannelId: 'trigger-ch-1',
    guideChannelId: null,
    waitingRoomTemplate: null,
    guideMessage: null,
    embedTitle: null,
    embedColor: null,
    guideMessageId: null,
    mode: 'instant',
    instantCategoryId: 'cat-1',
    instantNameTemplate: '{username}의 방',
    buttons: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    lastSavedAt: null,
    ...overrides,
  } as AutoChannelConfigOrm;
}

function makeSelectSaveDto(overrides: Partial<AutoChannelSaveDto> = {}): AutoChannelSaveDto {
  return {
    name: '게임방',
    triggerChannelId: 'trigger-ch-1',
    mode: 'select',
    guideChannelId: 'guide-ch-1',
    guideMessage: '안내 메시지',
    buttons: [],
    ...overrides,
  } as AutoChannelSaveDto;
}

function makeInstantSaveDto(overrides: Partial<AutoChannelSaveDto> = {}): AutoChannelSaveDto {
  return {
    name: '즉시방',
    triggerChannelId: 'trigger-ch-2',
    mode: 'instant',
    instantCategoryId: 'cat-instant',
    buttons: [],
    ...overrides,
  } as AutoChannelSaveDto;
}

// ──────────────────────────────────────────────────────────────
// 테스트 셋업
// ──────────────────────────────────────────────────────────────

describe('AutoChannelController', () => {
  let controller: AutoChannelController;
  let configRepo: {
    upsert: Mock;
    stampLastSavedAt: Mock;
    updateGuideMessageId: Mock;
    findAllByGuildId: Mock;
    findById: Mock;
    deleteByIdAndGuildId: Mock;
  };
  let discordGateway: {
    sendGuideMessage: Mock;
    editGuideMessage: Mock;
    deleteGuideMessage: Mock;
  };

  beforeEach(() => {
    configRepo = {
      upsert: vi.fn(),
      stampLastSavedAt: vi.fn().mockResolvedValue(undefined),
      updateGuideMessageId: vi.fn().mockResolvedValue(undefined),
      findAllByGuildId: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      deleteByIdAndGuildId: vi.fn().mockResolvedValue(true),
    };
    discordGateway = {
      sendGuideMessage: vi.fn().mockResolvedValue('guide-msg-id'),
      editGuideMessage: vi.fn().mockResolvedValue(null),
      deleteGuideMessage: vi.fn().mockResolvedValue(undefined),
    };

    controller = new AutoChannelController(
      configRepo as unknown as AutoChannelConfigRepository,
      discordGateway as unknown as AutoChannelDiscordGateway,
    );

    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────
  // save() — stamp 핵심 검증
  // ──────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('select 모드: upsert 직후 stampLastSavedAt 호출 (모드 분기 전)', async () => {
      const config = makeOrmConfig({ id: 1, mode: 'select', guideChannelId: 'guide-ch-1' });
      configRepo.upsert.mockResolvedValue(config);
      discordGateway.sendGuideMessage.mockResolvedValue('guide-msg-new');

      const upsertOrder: string[] = [];
      configRepo.upsert.mockImplementation(async () => {
        upsertOrder.push('upsert');
        return config;
      });
      configRepo.stampLastSavedAt.mockImplementation(async () => {
        upsertOrder.push('stamp');
      });
      discordGateway.sendGuideMessage.mockImplementation(async () => {
        upsertOrder.push('discord');
        return 'guide-msg-new';
      });

      await controller.save('guild-1', makeSelectSaveDto());

      expect(configRepo.stampLastSavedAt).toHaveBeenCalledWith(1, expect.any(Date));
      // stamp 는 Discord 전송(모드 분기) 전에 호출돼야 한다
      const stampIdx = upsertOrder.indexOf('stamp');
      const discordIdx = upsertOrder.indexOf('discord');
      expect(stampIdx).toBeGreaterThan(-1);
      expect(stampIdx).toBeLessThan(discordIdx);
    });

    it('instant 모드: upsert 직후 stampLastSavedAt 호출 (select 와 동일 시점)', async () => {
      const config = makeOrmConfig({ id: 2, mode: 'instant', guideMessageId: null });
      configRepo.upsert.mockResolvedValue(config);

      await controller.save('guild-1', makeInstantSaveDto());

      expect(configRepo.stampLastSavedAt).toHaveBeenCalledWith(2, expect.any(Date));
    });

    it('POST 응답에 lastSavedAt ISO 문자열 포함', async () => {
      const config = makeOrmConfig({ id: 1, mode: 'instant', guideMessageId: null });
      configRepo.upsert.mockResolvedValue(config);

      const result = await controller.save('guild-1', makeInstantSaveDto());

      expect(result.lastSavedAt).toBeDefined();
      // ISO 8601 형식인지 검증
      expect(() => new Date(result.lastSavedAt)).not.toThrow();
      expect(new Date(result.lastSavedAt).toISOString()).toBe(result.lastSavedAt);
    });

    it('POST 응답에 ok, configId, guideMessageId 포함', async () => {
      const config = makeOrmConfig({ id: 5, mode: 'instant', guideMessageId: null });
      configRepo.upsert.mockResolvedValue(config);

      const result = await controller.save('guild-1', makeInstantSaveDto());

      expect(result.ok).toBe(true);
      expect(result.configId).toBe(5);
      expect(result.guideMessageId).toBeNull();
    });

    it('select 모드 — 안내 메시지 신규 전송 후 guideMessageId 를 DB 에 저장', async () => {
      const config = makeOrmConfig({
        id: 3,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessageId: null,
        buttons: [],
      });
      configRepo.upsert.mockResolvedValue(config);
      discordGateway.sendGuideMessage.mockResolvedValue('new-guide-msg');

      const result = await controller.save('guild-1', makeSelectSaveDto());

      expect(discordGateway.sendGuideMessage).toHaveBeenCalledOnce();
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(3, 'new-guide-msg');
      expect(result.guideMessageId).toBe('new-guide-msg');
    });

    it('select 모드 — 기존 guideMessageId 있으면 editGuideMessage 먼저 시도', async () => {
      const config = makeOrmConfig({
        id: 4,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessageId: 'existing-guide-msg',
        buttons: [],
      });
      configRepo.upsert.mockResolvedValue(config);
      discordGateway.editGuideMessage.mockResolvedValue('existing-guide-msg'); // 편집 성공

      const result = await controller.save(
        'guild-1',
        makeSelectSaveDto({ guideChannelId: 'guide-ch-1' }),
      );

      expect(discordGateway.editGuideMessage).toHaveBeenCalledOnce();
      expect(discordGateway.sendGuideMessage).not.toHaveBeenCalled();
      expect(result.guideMessageId).toBe('existing-guide-msg');
    });

    it('instant 모드 — 기존 guideMessage 있으면 Discord 메시지 삭제', async () => {
      const config = makeOrmConfig({
        id: 6,
        mode: 'instant',
        guideChannelId: 'guide-ch-1',
        guideMessageId: 'old-guide-msg',
      });
      configRepo.upsert.mockResolvedValue(config);

      await controller.save('guild-1', makeInstantSaveDto());

      expect(discordGateway.deleteGuideMessage).toHaveBeenCalledWith('guide-ch-1', 'old-guide-msg');
      // DB 에서 guideMessageId null 처리
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(6, null);
    });

    it('instant 모드 — guideMessageId 없으면 삭제 시도 안 함', async () => {
      const config = makeOrmConfig({
        id: 7,
        mode: 'instant',
        guideMessageId: null,
      });
      configRepo.upsert.mockResolvedValue(config);

      await controller.save('guild-1', makeInstantSaveDto());

      expect(discordGateway.deleteGuideMessage).not.toHaveBeenCalled();
    });

    it('select 모드 Discord 전송 실패해도 DB 저장은 성공 (무시 후 ok 반환)', async () => {
      const config = makeOrmConfig({
        id: 8,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessageId: null,
        buttons: [],
      });
      configRepo.upsert.mockResolvedValue(config);
      discordGateway.sendGuideMessage.mockRejectedValue(new Error('Discord 오류'));

      const result = await controller.save('guild-1', makeSelectSaveDto());

      expect(result.ok).toBe(true);
      expect(result.configId).toBe(8);
      // Discord 실패 시 guideMessageId 는 null
      expect(result.guideMessageId).toBeNull();
      // stamp 는 호출돼야 함 (저장 성공)
      expect(configRepo.stampLastSavedAt).toHaveBeenCalledWith(8, expect.any(Date));
    });

    it('stamp 시각이 upsert 이후의 Date 인스턴스이다', async () => {
      const config = makeOrmConfig({ id: 9, mode: 'instant', guideMessageId: null });
      configRepo.upsert.mockResolvedValue(config);

      const before = new Date();
      await controller.save('guild-1', makeInstantSaveDto());
      const after = new Date();

      const stampCall = configRepo.stampLastSavedAt.mock.calls[0];
      const stampDate = stampCall[1] as Date;
      expect(stampDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stampDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
