import { type Mock } from 'vitest';

import { type StatusPrefixConfigOrm } from '../infrastructure/status-prefix-config.orm-entity';
import { StatusPrefixResetService } from './status-prefix-reset.service';

function makeConfig(overrides: Partial<StatusPrefixConfigOrm> = {}): StatusPrefixConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    enabled: true,
    channelId: 'ch-1',
    messageId: null,
    embedTitle: null,
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

describe('StatusPrefixResetService', () => {
  let service: StatusPrefixResetService;
  let configRepo: { findByGuildId: Mock };
  let redis: {
    getOriginalNickname: Mock;
    deleteOriginalNickname: Mock;
    getConfig: Mock;
  };
  let configService: { getConfig: Mock; stripPrefixFromNickname: Mock };
  let discordAdapter: { fetchMember: Mock; setNickname: Mock };

  beforeEach(() => {
    configRepo = {
      findByGuildId: vi.fn(),
    };

    redis = {
      getOriginalNickname: vi.fn(),
      deleteOriginalNickname: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn(),
    };

    configService = {
      getConfig: vi.fn(),
      stripPrefixFromNickname: vi.fn(),
    };

    discordAdapter = {
      fetchMember: vi.fn(),
      setNickname: vi.fn(),
    };

    service = new StatusPrefixResetService(
      configRepo as never,
      redis as never,
      configService as never,
      discordAdapter as never,
    );

    vi.clearAllMocks();
  });

  describe('resetFromBot', () => {
    it('원래 닉네임이 있으면 복원 후 Redis 키 삭제, success: true', async () => {
      redis.getOriginalNickname.mockResolvedValue('동현');
      configService.getConfig.mockResolvedValue(null);

      const result = await service.resetFromBot('guild-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.originalNickname).toBe('동현');
      expect(redis.deleteOriginalNickname).toHaveBeenCalledWith('guild-1', 'user-1');
    });

    it('원래 닉네임이 없으면 success: false', async () => {
      redis.getOriginalNickname.mockResolvedValue(null);

      const result = await service.resetFromBot('guild-1', 'user-1');

      expect(result.success).toBe(false);
      expect(redis.deleteOriginalNickname).not.toHaveBeenCalled();
    });

    it('config 있으면 stripPrefixFromNickname 적용하여 반환', async () => {
      redis.getOriginalNickname.mockResolvedValue('[관전] 동현');
      const config = makeConfig();
      configService.getConfig.mockResolvedValue(config);
      // 스트립 결과: 접두사 제거된 순수 닉네임
      configService.stripPrefixFromNickname.mockReturnValue('동현');

      const result = await service.resetFromBot('guild-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.originalNickname).toBe('동현');
      expect(configService.stripPrefixFromNickname).toHaveBeenCalledWith('[관전] 동현', config);
    });
  });

  describe('restoreOnLeave', () => {
    it('Redis 캐시 enabled=false면 아무것도 하지 않음', async () => {
      redis.getConfig.mockResolvedValue({ enabled: false });

      await service.restoreOnLeave('guild-1', 'user-1');

      expect(redis.getOriginalNickname).not.toHaveBeenCalled();
      expect(discordAdapter.fetchMember).not.toHaveBeenCalled();
    });

    it('캐시 미스 시 DB 조회 — DB enabled=false면 아무것도 하지 않음', async () => {
      redis.getConfig.mockResolvedValue(null);
      configRepo.findByGuildId.mockResolvedValue(makeConfig({ enabled: false }));

      await service.restoreOnLeave('guild-1', 'user-1');

      expect(redis.getOriginalNickname).not.toHaveBeenCalled();
      expect(discordAdapter.fetchMember).not.toHaveBeenCalled();
    });

    it('원래 닉네임이 Redis에 없으면 아무것도 하지 않음', async () => {
      redis.getConfig.mockResolvedValue({ enabled: true });
      redis.getOriginalNickname.mockResolvedValue(null);

      await service.restoreOnLeave('guild-1', 'user-1');

      expect(discordAdapter.fetchMember).not.toHaveBeenCalled();
      expect(redis.deleteOriginalNickname).not.toHaveBeenCalled();
    });

    it('정상 복원: fetchMember → setNickname → deleteOriginalNickname', async () => {
      redis.getConfig.mockResolvedValue({ enabled: true });
      redis.getOriginalNickname.mockResolvedValue('동현');
      configService.getConfig.mockResolvedValue(null);
      discordAdapter.fetchMember.mockResolvedValue({ id: 'user-1' });
      discordAdapter.setNickname.mockResolvedValue(true);

      await service.restoreOnLeave('guild-1', 'user-1');

      expect(discordAdapter.fetchMember).toHaveBeenCalledWith('guild-1', 'user-1');
      expect(discordAdapter.setNickname).toHaveBeenCalledWith('guild-1', 'user-1', '동현');
      expect(redis.deleteOriginalNickname).toHaveBeenCalledWith('guild-1', 'user-1');
    });

    it('fetchMember 실패 시 Redis 키 유지 (deleteOriginalNickname 호출 안 함)', async () => {
      redis.getConfig.mockResolvedValue({ enabled: true });
      redis.getOriginalNickname.mockResolvedValue('동현');
      configService.getConfig.mockResolvedValue(null);
      discordAdapter.fetchMember.mockResolvedValue(null);

      await service.restoreOnLeave('guild-1', 'user-1');

      expect(discordAdapter.setNickname).not.toHaveBeenCalled();
      expect(redis.deleteOriginalNickname).not.toHaveBeenCalled();
    });

    it('setNickname 실패해도 Redis 키 삭제 (무한 재시도 방지)', async () => {
      redis.getConfig.mockResolvedValue({ enabled: true });
      redis.getOriginalNickname.mockResolvedValue('동현');
      configService.getConfig.mockResolvedValue(null);
      discordAdapter.fetchMember.mockResolvedValue({ id: 'user-1' });
      discordAdapter.setNickname.mockResolvedValue(false);

      await service.restoreOnLeave('guild-1', 'user-1');

      // setNickname 실패해도 deleteOriginalNickname 호출됨
      expect(redis.deleteOriginalNickname).toHaveBeenCalledWith('guild-1', 'user-1');
    });
  });
});
