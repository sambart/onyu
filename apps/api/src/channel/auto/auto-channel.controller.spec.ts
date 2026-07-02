/**
 * AutoChannelController 단위 테스트
 *
 * 검증 범위:
 * - save(): DB upsert 직후(모드 분기 전) stampLastSavedAt 호출 (select / instant 양쪽)
 * - save(): POST 응답에 lastSavedAt ISO 문자열 포함
 * - save(): select 모드 — 안내 메시지 전송/갱신
 * - save(): instant 모드 — 기존 안내 메시지 삭제
 */

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { type Mock } from 'vitest';

import { JwtAuthGuard } from '../../auth/infrastructure/jwt-auth.guard';
import { GuildMembershipGuard } from '../../common/guards/guild-membership.guard';
import { AutoChannelController } from './auto-channel.controller';
import type { AutoChannelSaveDto } from './dto/auto-channel-save.dto';
import type { AutoChannelButtonOrm } from './infrastructure/auto-channel-button.orm-entity';
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

function makeButton(overrides: Partial<AutoChannelButtonOrm> = {}): AutoChannelButtonOrm {
  return {
    id: 101,
    configId: 1,
    label: '개발방',
    emoji: '🎮',
    targetCategoryId: 'cat-target',
    channelNameTemplate: null,
    sortOrder: 0,
    subOptions: [],
    ...overrides,
  } as AutoChannelButtonOrm;
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

  // ──────────────────────────────────────────────────────────────
  // reApply() — "다시 반영" 핵심 검증 (settings-apply 2차 §4-A)
  // ──────────────────────────────────────────────────────────────

  describe('reApply()', () => {
    it('configId에 해당하는 설정이 없으면 404', async () => {
      configRepo.findById.mockResolvedValue(null);

      await expect(controller.reApply('guild-1', 999)).rejects.toThrow(
        'AutoChannelConfig not found: configId=999',
      );
    });

    it('configId는 존재하나 guildId가 불일치하면 404', async () => {
      const config = makeOrmConfig({ id: 1, guildId: 'other-guild', mode: 'select' });
      configRepo.findById.mockResolvedValue(config);

      await expect(controller.reApply('guild-1', 1)).rejects.toThrow(
        'AutoChannelConfig not found: configId=1',
      );
    });

    it('instant 모드는 게시할 안내 메시지가 없으므로 no-op(ok: false)을 반환한다', async () => {
      const config = makeOrmConfig({ id: 2, mode: 'instant' });
      configRepo.findById.mockResolvedValue(config);

      const result = await controller.reApply('guild-1', 2);

      expect(result).toEqual({ ok: false, guideMessageId: null });
      expect(discordGateway.sendGuideMessage).not.toHaveBeenCalled();
      expect(discordGateway.editGuideMessage).not.toHaveBeenCalled();
      expect(configRepo.updateGuideMessageId).not.toHaveBeenCalled();
    });

    it('select 모드 — 기존 안내 메시지가 없으면 신규 전송 후 guideMessageId를 DB에 저장한다', async () => {
      const config = makeOrmConfig({
        id: 3,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessage: '안내 메시지',
        guideMessageId: null,
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      discordGateway.sendGuideMessage.mockResolvedValue('re-applied-msg');

      const result = await controller.reApply('guild-1', 3);

      expect(discordGateway.sendGuideMessage).toHaveBeenCalledOnce();
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(3, 're-applied-msg');
      expect(result).toEqual({ ok: true, guideMessageId: 're-applied-msg' });
    });

    it('select 모드 — 기존 안내 메시지가 있으면 editGuideMessage로 재게시한다', async () => {
      const config = makeOrmConfig({
        id: 4,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessage: '안내 메시지',
        guideMessageId: 'existing-guide-msg',
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      discordGateway.editGuideMessage.mockResolvedValue('existing-guide-msg');

      const result = await controller.reApply('guild-1', 4);

      expect(discordGateway.editGuideMessage).toHaveBeenCalledOnce();
      expect(discordGateway.sendGuideMessage).not.toHaveBeenCalled();
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(4, 'existing-guide-msg');
      expect(result).toEqual({ ok: true, guideMessageId: 'existing-guide-msg' });
    });

    it('guideChannelId 또는 guideMessage가 없으면 no-op(ok: false)을 반환한다 (방어적 처리)', async () => {
      const config = makeOrmConfig({
        id: 5,
        mode: 'select',
        guideChannelId: null,
        guideMessage: null,
      });
      configRepo.findById.mockResolvedValue(config);

      const result = await controller.reApply('guild-1', 5);

      expect(result).toEqual({ ok: false, guideMessageId: null });
      expect(discordGateway.sendGuideMessage).not.toHaveBeenCalled();
    });

    it('재게시 후 stampLastSavedAt을 호출하지 않는다 (lastSavedAt 무갱신)', async () => {
      const config = makeOrmConfig({
        id: 6,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessage: '안내 메시지',
        guideMessageId: null,
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      discordGateway.sendGuideMessage.mockResolvedValue('re-applied-msg-2');

      await controller.reApply('guild-1', 6);

      expect(configRepo.stampLastSavedAt).not.toHaveBeenCalled();
    });

    it('guideChannelId만 없으면 no-op(ok: false)을 반환한다 (guideMessage는 존재)', async () => {
      const config = makeOrmConfig({
        id: 7,
        mode: 'select',
        guideChannelId: null,
        guideMessage: '안내 메시지',
      });
      configRepo.findById.mockResolvedValue(config);

      const result = await controller.reApply('guild-1', 7);

      expect(result).toEqual({ ok: false, guideMessageId: null });
      expect(discordGateway.sendGuideMessage).not.toHaveBeenCalled();
      expect(discordGateway.editGuideMessage).not.toHaveBeenCalled();
      expect(configRepo.updateGuideMessageId).not.toHaveBeenCalled();
    });

    it('guideMessage만 없으면 no-op(ok: false)을 반환한다 (guideChannelId는 존재)', async () => {
      const config = makeOrmConfig({
        id: 8,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessage: null,
      });
      configRepo.findById.mockResolvedValue(config);

      const result = await controller.reApply('guild-1', 8);

      expect(result).toEqual({ ok: false, guideMessageId: null });
      expect(discordGateway.sendGuideMessage).not.toHaveBeenCalled();
      expect(discordGateway.editGuideMessage).not.toHaveBeenCalled();
      expect(configRepo.updateGuideMessageId).not.toHaveBeenCalled();
    });

    it('select 모드 — 기존 안내 메시지 편집 실패(null 반환) 시 신규 전송으로 재시도한다', async () => {
      const config = makeOrmConfig({
        id: 9,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessage: '안내 메시지',
        guideMessageId: 'stale-guide-msg',
        buttons: [],
      });
      configRepo.findById.mockResolvedValue(config);
      discordGateway.editGuideMessage.mockResolvedValue(null); // 편집 실패 (메시지 삭제됨 등)
      discordGateway.sendGuideMessage.mockResolvedValue('fallback-msg');

      const result = await controller.reApply('guild-1', 9);

      expect(discordGateway.editGuideMessage).toHaveBeenCalledOnce();
      expect(discordGateway.sendGuideMessage).toHaveBeenCalledOnce();
      expect(configRepo.updateGuideMessageId).toHaveBeenCalledWith(9, 'fallback-msg');
      expect(result).toEqual({ ok: true, guideMessageId: 'fallback-msg' });
    });

    it('config.buttons를 id/label/emoji로 매핑하여 Discord 전송 페이로드를 구성한다', async () => {
      const buttons = [
        makeButton({ id: 201, label: '개발방', emoji: '🎮', configId: 10 }),
        makeButton({ id: 202, label: '휴게방', emoji: null, configId: 10 }),
      ];
      const config = makeOrmConfig({
        id: 10,
        mode: 'select',
        guideChannelId: 'guide-ch-1',
        guideMessage: '안내 메시지',
        guideMessageId: null,
        buttons,
      });
      configRepo.findById.mockResolvedValue(config);
      discordGateway.sendGuideMessage.mockResolvedValue('msg-with-buttons');

      await controller.reApply('guild-1', 10);

      expect(discordGateway.sendGuideMessage).toHaveBeenCalledWith(
        'guide-ch-1',
        '안내 메시지',
        null,
        null,
        [
          { id: 201, label: '개발방', emoji: '🎮' },
          { id: 202, label: '휴게방', emoji: null },
        ],
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 클래스 레벨 가드 — JwtAuthGuard + GuildMembershipGuard 상속 확인
  // ──────────────────────────────────────────────────────────────

  describe('가드', () => {
    it('컨트롤러 클래스에 JwtAuthGuard와 GuildMembershipGuard가 적용되어 있다', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AutoChannelController) as unknown[];

      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(GuildMembershipGuard);
    });
  });
});
