import { type Mock } from 'vitest';

import { DomainException } from '../../common/domain-exception';
import { StatusPrefixButtonType } from '../domain/status-prefix.types';
import { type StatusPrefixButtonOrm } from '../infrastructure/status-prefix-button.orm-entity';
import { type StatusPrefixConfigOrm } from '../infrastructure/status-prefix-config.orm-entity';
import { StatusPrefixConfigService } from './status-prefix-config.service';

function makeButton(overrides: Partial<StatusPrefixButtonOrm> = {}): StatusPrefixButtonOrm {
  return {
    id: 1,
    configId: 1,
    config: {} as StatusPrefixConfigOrm,
    type: StatusPrefixButtonType.PREFIX,
    prefix: '관전',
    label: '관전',
    emoji: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<StatusPrefixConfigOrm> = {}): StatusPrefixConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    enabled: true,
    channelId: 'ch-1',
    messageId: null,
    embedTitle: '접두사 설정',
    embedDescription: null,
    embedColor: null,
    prefixTemplate: '[{prefix}] {nickname}',
    buttons: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAppliedAt: null,
    ...overrides,
  };
}

describe('StatusPrefixConfigService', () => {
  let service: StatusPrefixConfigService;
  let configRepo: {
    findByGuildId: Mock;
    upsert: Mock;
    updateMessageId: Mock;
  };
  let redisRepo: {
    getConfig: Mock;
    setConfig: Mock;
  };
  let discordAdapter: {
    fetchChannel: Mock;
    sendMessage: Mock;
    editMessage: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
      upsert: vi.fn(),
      updateMessageId: vi.fn(),
    };
    redisRepo = {
      getConfig: vi.fn(),
      setConfig: vi.fn(),
    };
    discordAdapter = {
      fetchChannel: vi.fn(),
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
    };

    service = new StatusPrefixConfigService(
      configRepo as never,
      redisRepo as never,
      discordAdapter as never,
    );
  });

  // ──────────────────────────────────────────────────────
  // stripPrefixFromNickname
  // ──────────────────────────────────────────────────────
  describe('stripPrefixFromNickname', () => {
    it('단순 접두사를 닉네임에서 제거한다', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [makeButton({ prefix: '관전' })],
      });
      const result = service.stripPrefixFromNickname('[관전] 동현', config);
      expect(result).toBe('동현');
    });

    it('중첩된 접두사를 반복 제거한다', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [makeButton({ prefix: '관전' })],
      });
      const result = service.stripPrefixFromNickname('[관전] [관전] 동현', config);
      expect(result).toBe('동현');
    });

    it('접두사가 없는 닉네임은 원본 반환', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [makeButton({ prefix: '관전' })],
      });
      const result = service.stripPrefixFromNickname('동현', config);
      expect(result).toBe('동현');
    });

    it('buttons가 빈 배열이면 원본 반환', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [],
      });
      const result = service.stripPrefixFromNickname('[관전] 동현', config);
      expect(result).toBe('[관전] 동현');
    });

    it('PREFIX 타입이 아닌 버튼(RESET)은 접두사로 사용하지 않는다', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [makeButton({ type: StatusPrefixButtonType.RESET, prefix: '관전' })],
      });
      const result = service.stripPrefixFromNickname('[관전] 동현', config);
      expect(result).toBe('[관전] 동현');
    });

    it('특수문자가 포함된 접두사도 올바르게 제거한다', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [makeButton({ prefix: '관전+대기' })],
      });
      const result = service.stripPrefixFromNickname('[관전+대기] 동현', config);
      expect(result).toBe('동현');
    });

    it('닉네임 자체가 접두사 패턴이면 원본 유지', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [makeButton({ prefix: '관전' })],
      });
      // '[관전] ' 뒤 닉네임이 없는 극단 케이스 — 빈 문자열 → 원본 반환
      const result = service.stripPrefixFromNickname('[관전] ', config);
      // 구현: strip 결과가 빈 문자열이면 원본 유지
      expect(result.length).toBeGreaterThan(0);
    });

    it('여러 접두사 중 일치하는 것만 제거한다', () => {
      const config = makeConfig({
        prefixTemplate: '[{prefix}] {nickname}',
        buttons: [
          makeButton({ id: 1, prefix: '관전' }),
          makeButton({ id: 2, prefix: '대기', label: '대기' }),
        ],
      });
      const result = service.stripPrefixFromNickname('[대기] 철수', config);
      expect(result).toBe('철수');
    });
  });

  // ──────────────────────────────────────────────────────
  // getConfig
  // ──────────────────────────────────────────────────────
  describe('getConfig', () => {
    it('Redis 캐시 히트 시 DB 조회 없이 캐시 값 반환', async () => {
      const cached = makeConfig();
      redisRepo.getConfig.mockResolvedValue(cached);

      const result = await service.getConfig('guild-1');

      expect(result).toBe(cached);
      expect(configRepo.findByGuildId).not.toHaveBeenCalled();
    });

    it('Redis 캐시 미스 시 DB 조회 후 캐시 저장', async () => {
      const dbConfig = makeConfig();
      redisRepo.getConfig.mockResolvedValue(null);
      configRepo.findByGuildId.mockResolvedValue(dbConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);

      const result = await service.getConfig('guild-1');

      expect(result).toBe(dbConfig);
      expect(configRepo.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(redisRepo.setConfig).toHaveBeenCalledWith('guild-1', dbConfig);
    });

    it('Redis 미스 + DB 미스 시 null 반환', async () => {
      redisRepo.getConfig.mockResolvedValue(null);
      configRepo.findByGuildId.mockResolvedValue(null);

      const result = await service.getConfig('guild-1');

      expect(result).toBeNull();
      expect(redisRepo.setConfig).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // saveConfig
  // ──────────────────────────────────────────────────────
  describe('saveConfig', () => {
    const dto = {
      enabled: true,
      channelId: 'ch-1',
      embedTitle: '테스트',
      embedDescription: null,
      embedColor: null,
      prefixTemplate: '[{prefix}] {nickname}',
      buttons: [
        {
          label: '관전',
          prefix: '관전',
          type: StatusPrefixButtonType.PREFIX,
          sortOrder: 0,
          emoji: null,
        },
      ],
    };

    it('DB 저장 → 캐시 갱신 → Discord 메시지 전송 → messageId + lastAppliedAt DB 저장', async () => {
      const savedConfig = makeConfig({
        channelId: 'ch-1',
        messageId: null,
        buttons: [makeButton({ prefix: '관전' })],
      });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);
      discordAdapter.fetchChannel.mockResolvedValue({ id: 'ch-1' });
      discordAdapter.editMessage.mockResolvedValue(null); // 기존 메시지 없음
      discordAdapter.sendMessage.mockResolvedValue({ id: 'msg-new' });
      configRepo.updateMessageId.mockResolvedValue(undefined);

      const result = await service.saveConfig('guild-1', dto);

      expect(configRepo.upsert).toHaveBeenCalledWith('guild-1', dto);
      expect(redisRepo.setConfig).toHaveBeenCalled();
      expect(discordAdapter.fetchChannel).toHaveBeenCalledWith('ch-1');
      expect(discordAdapter.sendMessage).toHaveBeenCalled();
      // 옵션 B: messageId + lastAppliedAt 을 단일 UPDATE 로 전달
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(
        'guild-1',
        'msg-new',
        expect.any(Date),
      );
      expect(result.messageId).toBe('msg-new');
      // stamp: Discord 전송 성공 시 lastAppliedAt 이 non-null
      expect(result.lastAppliedAt).not.toBeNull();
    });

    it('Discord 전송 성공 시 반환 config 의 lastAppliedAt 이 갱신된다', async () => {
      const savedConfig = makeConfig({
        channelId: 'ch-1',
        messageId: null,
        buttons: [makeButton({ prefix: '관전' })],
      });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);
      discordAdapter.fetchChannel.mockResolvedValue({ id: 'ch-1' });
      discordAdapter.editMessage.mockResolvedValue(null);
      discordAdapter.sendMessage.mockResolvedValue({ id: 'msg-stamp' });
      configRepo.updateMessageId.mockResolvedValue(undefined);

      const before = new Date();
      const result = await service.saveConfig('guild-1', dto);
      const after = new Date();

      expect(result.lastAppliedAt).toBeInstanceOf(Date);
      expect((result.lastAppliedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect((result.lastAppliedAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('접두사 중복 시 DomainException(PREFIX_DUPLICATE) throw', async () => {
      const dtoWithDuplicate = {
        ...dto,
        buttons: [
          {
            label: '관전',
            prefix: '관전',
            type: StatusPrefixButtonType.PREFIX,
            sortOrder: 0,
            emoji: null,
          },
          {
            label: '관전2',
            prefix: '관전',
            type: StatusPrefixButtonType.PREFIX,
            sortOrder: 1,
            emoji: null,
          },
        ],
      };

      await expect(service.saveConfig('guild-1', dtoWithDuplicate)).rejects.toMatchObject({
        code: 'PREFIX_DUPLICATE',
      });
      await expect(service.saveConfig('guild-1', dtoWithDuplicate)).rejects.toBeInstanceOf(
        DomainException,
      );
    });

    it('enabled=false이면 Discord 메시지 전송하지 않고 stamp 도 미발생한다', async () => {
      const savedConfig = makeConfig({
        enabled: false,
        channelId: 'ch-1',
        buttons: [],
        lastAppliedAt: null,
      });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);

      const result = await service.saveConfig('guild-1', { ...dto, enabled: false });

      expect(discordAdapter.fetchChannel).not.toHaveBeenCalled();
      expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
      expect(result.lastAppliedAt).toBeNull();
    });

    it('enabled=true이지만 channelId가 없으면 Discord 메시지 전송하지 않는다', async () => {
      const savedConfig = makeConfig({ enabled: true, channelId: null, buttons: [] });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);

      await service.saveConfig('guild-1', { ...dto, channelId: null as never });

      expect(discordAdapter.fetchChannel).not.toHaveBeenCalled();
    });

    it('메시지 편집 성공 시 기존 messageId 반환 + stamp 발생', async () => {
      const savedConfig = makeConfig({
        channelId: 'ch-1',
        messageId: 'existing-msg',
        buttons: [makeButton({ prefix: '관전' })],
      });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);
      discordAdapter.fetchChannel.mockResolvedValue({ id: 'ch-1' });
      discordAdapter.editMessage.mockResolvedValue({ id: 'existing-msg' }); // 편집 성공
      configRepo.updateMessageId.mockResolvedValue(undefined);

      const result = await service.saveConfig('guild-1', dto);

      expect(discordAdapter.editMessage).toHaveBeenCalledWith(
        'ch-1',
        'existing-msg',
        expect.anything(),
      );
      expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
      expect(result.messageId).toBe('existing-msg');
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(
        'guild-1',
        'existing-msg',
        expect.any(Date),
      );
      expect(result.lastAppliedAt).not.toBeNull();
    });

    it('메시지 편집 실패(null 반환) 시 신규 전송으로 폴백', async () => {
      const savedConfig = makeConfig({
        channelId: 'ch-1',
        messageId: 'old-msg',
        buttons: [makeButton({ prefix: '관전' })],
      });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);
      discordAdapter.fetchChannel.mockResolvedValue({ id: 'ch-1' });
      discordAdapter.editMessage.mockResolvedValue(null); // 편집 실패
      discordAdapter.sendMessage.mockResolvedValue({ id: 'new-msg' });
      configRepo.updateMessageId.mockResolvedValue(undefined);

      const result = await service.saveConfig('guild-1', dto);

      expect(discordAdapter.sendMessage).toHaveBeenCalled();
      expect(result.messageId).toBe('new-msg');
    });

    it('채널 찾기 실패 시 에러 전파 + stamp 미발생', async () => {
      const savedConfig = makeConfig({
        channelId: 'ch-bad',
        messageId: null,
        buttons: [],
      });
      configRepo.upsert.mockResolvedValue(savedConfig);
      redisRepo.setConfig.mockResolvedValue(undefined);
      discordAdapter.fetchChannel.mockResolvedValue(null); // 채널 없음

      await expect(service.saveConfig('guild-1', dto)).rejects.toThrow(
        'Channel ch-bad is not found',
      );
      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // reApply
  // ──────────────────────────────────────────────────────
  describe('reApply', () => {
    it('config가 없으면 CONFIG_NOT_FOUND DomainException을 throw한다', async () => {
      configRepo.findByGuildId.mockResolvedValue(null);

      await expect(service.reApply('guild-1')).rejects.toMatchObject({
        code: 'CONFIG_NOT_FOUND',
      });
      expect(discordAdapter.fetchChannel).not.toHaveBeenCalled();
    });

    it('enabled=false이면 NOT_APPLICABLE DomainException을 throw한다', async () => {
      const config = makeConfig({ enabled: false, channelId: 'ch-1' });
      configRepo.findByGuildId.mockResolvedValue(config);

      await expect(service.reApply('guild-1')).rejects.toMatchObject({
        code: 'NOT_APPLICABLE',
      });
      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
    });

    it('channelId가 없으면 NOT_APPLICABLE DomainException을 throw한다', async () => {
      const config = makeConfig({ enabled: true, channelId: null });
      configRepo.findByGuildId.mockResolvedValue(config);

      await expect(service.reApply('guild-1')).rejects.toMatchObject({
        code: 'NOT_APPLICABLE',
      });
      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
    });

    it('정상 재게시: buildAndSendMessage 재활용 + stamp + 반환 config의 lastAppliedAt non-null', async () => {
      const config = makeConfig({
        enabled: true,
        channelId: 'ch-1',
        messageId: null,
        buttons: [makeButton({ prefix: '관전' })],
      });
      configRepo.findByGuildId.mockResolvedValue(config);
      discordAdapter.fetchChannel.mockResolvedValue({ id: 'ch-1' });
      discordAdapter.editMessage.mockResolvedValue(null);
      discordAdapter.sendMessage.mockResolvedValue({ id: 're-apply-msg' });
      configRepo.updateMessageId.mockResolvedValue(undefined);
      redisRepo.setConfig.mockResolvedValue(undefined);

      const result = await service.reApply('guild-1');

      expect(discordAdapter.sendMessage).toHaveBeenCalled();
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(
        'guild-1',
        're-apply-msg',
        expect.any(Date),
      );
      expect(result.messageId).toBe('re-apply-msg');
      expect(result.lastAppliedAt).toBeInstanceOf(Date);
    });

    it('buildAndSendMessage 실패 시 stamp 미갱신 + 에러 전파', async () => {
      const config = makeConfig({
        enabled: true,
        channelId: 'ch-fail',
        messageId: null,
        buttons: [],
      });
      configRepo.findByGuildId.mockResolvedValue(config);
      discordAdapter.fetchChannel.mockResolvedValue(null); // 채널 없음 → throw

      await expect(service.reApply('guild-1')).rejects.toThrow('Channel ch-fail is not found');
      expect(configRepo.updateMessageId).not.toHaveBeenCalled();
    });
  });
});
