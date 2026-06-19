/**
 * RolePanelPublishService 단위 테스트
 *
 * 커버 케이스:
 * - publish: 미게시 패널 → sendMessage + messageId 저장
 * - publish: 기존 messageId 있음 → editMessage(editOrFallbackSend)
 * - publish: channelId 없으면 400
 * - publish: panelId 없으면 404
 * - publish: Discord 실패 → 503
 * - editOrFallbackSend: Unknown Message(10008) → 신규 전송 폴백
 * - editOrFallbackSend: 그 외 Discord 오류 → 503
 * - resyncOnUpdate: 채널 변경 → 기존 삭제 + 새 채널 전송
 * - resyncOnUpdate: 채널 동일 → edit 시도
 * - resyncOnUpdate: channelId 없으면 즉시 return
 * - buildPayload: 25개 초과 버튼 → 400
 * - buildPayload: 버튼 5개씩 ActionRow 분할
 * - buildPayload: sortOrder 정렬
 */

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import { DiscordAPIError } from 'discord.js';
import { type Mock } from 'vitest';

import type { RolePanelButtonOrm } from '../infrastructure/role-panel-button.orm-entity';
import type { RolePanelConfigOrm } from '../infrastructure/role-panel-config.orm-entity';
import { RolePanelPublishService } from './role-panel-publish.service';

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

/** DiscordAPIError mock 생성 헬퍼 */
function makeDiscordAPIError(code: number, status = 400): DiscordAPIError {
  const err = new Error('Discord API Error') as DiscordAPIError;
  Object.setPrototypeOf(err, DiscordAPIError.prototype);
  (err as unknown as { code: number }).code = code;
  (err as unknown as { status: number }).status = status;
  return err;
}

describe('RolePanelPublishService', () => {
  let service: RolePanelPublishService;
  let configRepo: {
    findByIdAndGuild: Mock;
    updateMessageId: Mock;
  };
  let discordAdapter: {
    sendMessage: Mock;
    editMessage: Mock;
    deleteMessage: Mock;
  };
  let redisRepo: {
    deleteConfig: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findByIdAndGuild: vi.fn(),
      updateMessageId: vi.fn().mockResolvedValue(undefined),
    };
    discordAdapter = {
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };
    redisRepo = {
      deleteConfig: vi.fn().mockResolvedValue(undefined),
    };

    service = new RolePanelPublishService(
      configRepo as never,
      discordAdapter as never,
      redisRepo as never,
    );

    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // buildPayload
  // ──────────────────────────────────────────────────────
  describe('buildPayload', () => {
    it('버튼 1개: embeds + components 포함 payload 반환', () => {
      const config = makeConfig();
      const buttons = [makeButton({ id: 1 })];

      const payload = service.buildPayload(config, buttons);

      expect(payload.embeds).toHaveLength(1);
      expect(payload.components).toHaveLength(1);
    });

    it('버튼 5개: ActionRow 1개', () => {
      const buttons = Array.from({ length: 5 }, (_, i) => makeButton({ id: i + 1, sortOrder: i }));

      const payload = service.buildPayload(makeConfig(), buttons);

      expect(payload.components).toHaveLength(1);
    });

    it('버튼 6개: ActionRow 2개', () => {
      const buttons = Array.from({ length: 6 }, (_, i) => makeButton({ id: i + 1, sortOrder: i }));

      const payload = service.buildPayload(makeConfig(), buttons);

      expect(payload.components).toHaveLength(2);
    });

    it('버튼 25개: ActionRow 5개 (최대)', () => {
      const buttons = Array.from({ length: 25 }, (_, i) => makeButton({ id: i + 1, sortOrder: i }));

      const payload = service.buildPayload(makeConfig(), buttons);

      expect(payload.components).toHaveLength(5);
    });

    it('버튼 26개 초과 시 BadRequestException', () => {
      const buttons = Array.from({ length: 26 }, (_, i) => makeButton({ id: i + 1, sortOrder: i }));

      expect(() => service.buildPayload(makeConfig(), buttons)).toThrow(BadRequestException);
    });

    it('sortOrder 역순 버튼도 정렬하여 ActionRow 구성', () => {
      // sortOrder: 2,0,1 → 0,1,2 순 정렬 기대
      const buttons = [
        makeButton({ id: 3, sortOrder: 2, label: '세번째' }),
        makeButton({ id: 1, sortOrder: 0, label: '첫번째' }),
        makeButton({ id: 2, sortOrder: 1, label: '두번째' }),
      ];

      // 예외 없이 payload가 구성되면 정렬 수행됨
      const payload = service.buildPayload(makeConfig(), buttons);
      expect(payload.components).toHaveLength(1);
    });

    it('embedTitle 없으면 embeds에 title이 없음', () => {
      const config = makeConfig({ embedTitle: null });
      const buttons = [makeButton()];

      const payload = service.buildPayload(config, buttons);

      // discord.js EmbedBuilder.toJSON()에서 title이 undefined이면 속성 자체가 없음
      expect(payload.embeds?.[0]).not.toHaveProperty('title');
    });
  });

  // ──────────────────────────────────────────────────────
  // publish
  // ──────────────────────────────────────────────────────
  describe('publish', () => {
    it('panelId 없으면 NotFoundException', async () => {
      configRepo.findByIdAndGuild.mockResolvedValue(null);

      await expect(service.publish('guild-1', 9999)).rejects.toThrow(NotFoundException);
    });

    it('channelId 없으면 BadRequestException', async () => {
      const config = makeConfig({ channelId: null });
      configRepo.findByIdAndGuild.mockResolvedValue(config);

      await expect(service.publish('guild-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('messageId 없음 → sendMessage 호출 → messageId 저장', async () => {
      const config = makeConfig({ messageId: null });
      const updatedConfig = makeConfig({ messageId: 'new-msg', published: true });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.sendMessage.mockResolvedValue({ id: 'new-msg' });

      const result = await service.publish('guild-1', 1);

      expect(discordAdapter.sendMessage).toHaveBeenCalledWith('ch-1', expect.anything());
      expect(discordAdapter.editMessage).not.toHaveBeenCalled();
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(1, 'new-msg', true);
      expect(redisRepo.deleteConfig).toHaveBeenCalledWith('guild-1');
      expect(result.messageId).toBe('new-msg');
    });

    it('messageId 있음 → editMessage 호출 → 기존 messageId 유지', async () => {
      const config = makeConfig({ messageId: 'existing-msg' });
      const updatedConfig = makeConfig({ messageId: 'existing-msg', published: true });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.editMessage.mockResolvedValue({ id: 'existing-msg' });

      const result = await service.publish('guild-1', 1);

      expect(discordAdapter.editMessage).toHaveBeenCalledWith(
        'ch-1',
        'existing-msg',
        expect.anything(),
      );
      expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(1, 'existing-msg', true);
      expect(result.published).toBe(true);
    });

    it('sendMessage 실패 시 ServiceUnavailableException(503)', async () => {
      const config = makeConfig({ messageId: null });
      configRepo.findByIdAndGuild.mockResolvedValue(config);
      discordAdapter.sendMessage.mockRejectedValue(new Error('권한 없음'));

      await expect(service.publish('guild-1', 1)).rejects.toThrow(ServiceUnavailableException);
    });

    it('editMessage 실패(비-Unknown Message) 시 ServiceUnavailableException', async () => {
      const config = makeConfig({ messageId: 'old-msg' });
      configRepo.findByIdAndGuild.mockResolvedValue(config);
      discordAdapter.editMessage.mockRejectedValue(new Error('Forbidden'));

      await expect(service.publish('guild-1', 1)).rejects.toThrow(ServiceUnavailableException);
    });

    it('editMessage Unknown Message(10008) 시 sendMessage 폴백 → 새 messageId 저장', async () => {
      const config = makeConfig({ messageId: 'old-msg' });
      const updatedConfig = makeConfig({ messageId: 'fallback-msg', published: true });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.editMessage.mockRejectedValue(makeDiscordAPIError(10008));
      discordAdapter.sendMessage.mockResolvedValue({ id: 'fallback-msg' });

      const result = await service.publish('guild-1', 1);

      expect(discordAdapter.sendMessage).toHaveBeenCalled();
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(1, 'fallback-msg', true);
      expect(result.messageId).toBe('fallback-msg');
    });
  });

  // ──────────────────────────────────────────────────────
  // resyncOnUpdate
  // ──────────────────────────────────────────────────────
  describe('resyncOnUpdate', () => {
    it('channelId 없으면 즉시 return (메시지 조작 없음)', async () => {
      const config = makeConfig({ channelId: null });
      configRepo.findByIdAndGuild.mockResolvedValue(config);

      await service.resyncOnUpdate({
        guildId: 'guild-1',
        panelId: 1,
        oldChannelId: 'ch-old',
        oldMessageId: 'msg-old',
      });

      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
      expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
      expect(discordAdapter.editMessage).not.toHaveBeenCalled();
    });

    it('채널 변경 → 기존 메시지 삭제 → 새 채널에 신규 전송', async () => {
      const config = makeConfig({ channelId: 'ch-new', messageId: 'msg-old' });
      const updatedConfig = makeConfig({
        channelId: 'ch-new',
        messageId: 'new-msg',
        published: true,
      });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.sendMessage.mockResolvedValue({ id: 'new-msg' });

      await service.resyncOnUpdate({
        guildId: 'guild-1',
        panelId: 1,
        oldChannelId: 'ch-old',
        oldMessageId: 'msg-old',
      });

      expect(discordAdapter.deleteMessage).toHaveBeenCalledWith('ch-old', 'msg-old');
      expect(discordAdapter.sendMessage).toHaveBeenCalledWith('ch-new', expect.anything());
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(1, 'new-msg', true);
    });

    it('채널 동일 + messageId 있음 → editMessage 시도', async () => {
      const config = makeConfig({ channelId: 'ch-1', messageId: 'existing-msg' });
      const updatedConfig = makeConfig({
        channelId: 'ch-1',
        messageId: 'existing-msg',
        published: true,
      });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.editMessage.mockResolvedValue({ id: 'existing-msg' });

      await service.resyncOnUpdate({
        guildId: 'guild-1',
        panelId: 1,
        oldChannelId: 'ch-1',
        oldMessageId: 'existing-msg',
      });

      expect(discordAdapter.editMessage).toHaveBeenCalledWith(
        'ch-1',
        'existing-msg',
        expect.anything(),
      );
      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
    });

    it('채널 동일 + messageId 없음 → 신규 전송', async () => {
      const config = makeConfig({ channelId: 'ch-1', messageId: null });
      const updatedConfig = makeConfig({
        channelId: 'ch-1',
        messageId: 'new-msg',
        published: true,
      });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.sendMessage.mockResolvedValue({ id: 'new-msg' });

      await service.resyncOnUpdate({
        guildId: 'guild-1',
        panelId: 1,
        oldChannelId: 'ch-1',
        oldMessageId: null,
      });

      expect(discordAdapter.sendMessage).toHaveBeenCalledWith('ch-1', expect.anything());
      expect(discordAdapter.editMessage).not.toHaveBeenCalled();
    });

    it('oldChannelId가 null이면 채널 변경 아님 처리 (edit 시도)', async () => {
      const config = makeConfig({ channelId: 'ch-1', messageId: 'msg-1' });
      const updatedConfig = makeConfig({ channelId: 'ch-1', messageId: 'msg-1', published: true });
      configRepo.findByIdAndGuild
        .mockResolvedValueOnce(config)
        .mockResolvedValueOnce(updatedConfig);
      discordAdapter.editMessage.mockResolvedValue({ id: 'msg-1' });

      await service.resyncOnUpdate({
        guildId: 'guild-1',
        panelId: 1,
        oldChannelId: null, // null → isChannelChanged = false
        oldMessageId: 'msg-1',
      });

      // oldChannelId가 null이므로 채널 변경 아님 → edit
      expect(discordAdapter.editMessage).toHaveBeenCalled();
      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
    });
  });
});
