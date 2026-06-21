import { NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { type Mocked, vi } from 'vitest';

import { DomainException } from '../../../common/domain-exception';
import { type RedisService } from '../../../redis/redis.service';
import { VoiceExcludedChannelType } from '../domain/voice-excluded-channel.types';
import { VoiceKeys } from '../infrastructure/voice-cache.keys';
import { type VoiceExcludedChannelOrm } from '../infrastructure/voice-excluded-channel.orm-entity';
import { type VoiceExcludedChannelRepository } from '../infrastructure/voice-excluded-channel.repository';
import { VoiceExcludedChannelService } from './voice-excluded-channel.service';

const GUILD = 'guild-1';
const NONEXISTENT_CHANNEL_ID = 999; // 존재하지 않는 채널 ID

function makeExcludedChannel(
  overrides: Partial<VoiceExcludedChannelOrm> = {},
): VoiceExcludedChannelOrm {
  return {
    id: 1,
    guildId: GUILD,
    discordChannelId: 'ch-1',
    type: VoiceExcludedChannelType.CHANNEL,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as VoiceExcludedChannelOrm;
}

describe('VoiceExcludedChannelService', () => {
  let service: VoiceExcludedChannelService;
  let repository: Mocked<VoiceExcludedChannelRepository>;
  let redis: Mocked<RedisService>;

  beforeEach(() => {
    repository = {
      findByGuildId: vi.fn(),
      create: vi.fn(),
      findByIdAndGuildId: vi.fn(),
      delete: vi.fn(),
      sync: vi.fn(),
    } as unknown as Mocked<VoiceExcludedChannelRepository>;

    redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    } as unknown as Mocked<RedisService>;

    service = new VoiceExcludedChannelService(repository, redis);
  });

  describe('getExcludedChannels', () => {
    it('Redis 캐시가 있으면 캐시에서 반환한다', async () => {
      const cached = [makeExcludedChannel()];
      redis.get.mockResolvedValue(cached);

      const result = await service.getExcludedChannels(GUILD);

      expect(result).toBe(cached);
      expect(repository.findByGuildId).not.toHaveBeenCalled();
    });

    it('캐시 미스 시 DB에서 조회하고 캐시에 저장한다', async () => {
      const items = [makeExcludedChannel()];
      redis.get.mockResolvedValue(null);
      repository.findByGuildId.mockResolvedValue(items);

      const result = await service.getExcludedChannels(GUILD);

      expect(result).toBe(items);
      expect(redis.set).toHaveBeenCalledWith(VoiceKeys.excludedChannels(GUILD), items, 3600);
    });

    it('DB 조회 결과가 비어있으면 캐시에 저장하지 않는다', async () => {
      redis.get.mockResolvedValue(null);
      repository.findByGuildId.mockResolvedValue([]);

      const result = await service.getExcludedChannels(GUILD);

      expect(result).toEqual([]);
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('saveExcludedChannel', () => {
    it('제외 채널을 등록하고 캐시를 무효화한다', async () => {
      const created = makeExcludedChannel();
      repository.create.mockResolvedValue(created);

      const result = await service.saveExcludedChannel(GUILD, {
        channelId: 'ch-1',
        type: VoiceExcludedChannelType.CHANNEL,
      });

      expect(result).toBe(created);
      expect(redis.del).toHaveBeenCalledWith(VoiceKeys.excludedChannels(GUILD));
    });

    it('중복 등록 시 DomainException(EXCLUDED_CHANNEL_DUPLICATE)을 던진다', async () => {
      const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
      (error as QueryFailedError & { code: string }).code = '23505';
      repository.create.mockRejectedValue(error);

      await expect(
        service.saveExcludedChannel(GUILD, {
          channelId: 'ch-1',
          type: VoiceExcludedChannelType.CHANNEL,
        }),
      ).rejects.toThrow(DomainException);
    });

    it('QueryFailedError가 아닌 에러는 그대로 전파한다', async () => {
      repository.create.mockRejectedValue(new Error('unexpected'));

      await expect(
        service.saveExcludedChannel(GUILD, {
          channelId: 'ch-1',
          type: VoiceExcludedChannelType.CHANNEL,
        }),
      ).rejects.toThrow('unexpected');
    });
  });

  describe('deleteExcludedChannel', () => {
    it('존재하는 채널을 삭제하고 캐시를 무효화한다', async () => {
      repository.findByIdAndGuildId.mockResolvedValue(makeExcludedChannel());

      await service.deleteExcludedChannel(GUILD, 1);

      expect(repository.delete).toHaveBeenCalledWith(1);
      expect(redis.del).toHaveBeenCalledWith(VoiceKeys.excludedChannels(GUILD));
    });

    it('존재하지 않는 채널 삭제 시 NotFoundException을 던진다', async () => {
      repository.findByIdAndGuildId.mockResolvedValue(null);

      await expect(service.deleteExcludedChannel(GUILD, NONEXISTENT_CHANNEL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('syncExcludedChannels', () => {
    it('벌크 동기화 후 캐시를 갱신한다', async () => {
      const synced = [
        makeExcludedChannel(),
        makeExcludedChannel({ id: 2, discordChannelId: 'ch-2' }),
      ];
      repository.sync.mockResolvedValue(synced);

      const result = await service.syncExcludedChannels(GUILD, {
        channels: [
          { channelId: 'ch-1', type: VoiceExcludedChannelType.CHANNEL },
          { channelId: 'ch-2', type: VoiceExcludedChannelType.CATEGORY },
        ],
      });

      expect(result).toBe(synced);
      expect(repository.sync).toHaveBeenCalledWith(GUILD, [
        { discordChannelId: 'ch-1', type: VoiceExcludedChannelType.CHANNEL },
        { discordChannelId: 'ch-2', type: VoiceExcludedChannelType.CATEGORY },
      ]);
      expect(redis.del).toHaveBeenCalledWith(VoiceKeys.excludedChannels(GUILD));
      expect(redis.set).toHaveBeenCalledWith(VoiceKeys.excludedChannels(GUILD), synced, 3600);
    });

    it('동기화 결과가 비어있으면 캐시에 저장하지 않는다', async () => {
      repository.sync.mockResolvedValue([]);

      await service.syncExcludedChannels(GUILD, { channels: [] });

      expect(redis.del).toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('isExcludedChannel', () => {
    it('채널 ID가 제외 목록에 있으면 true를 반환한다', async () => {
      redis.get.mockResolvedValue([
        makeExcludedChannel({
          discordChannelId: 'ch-excluded',
          type: VoiceExcludedChannelType.CHANNEL,
        }),
      ]);

      const result = await service.isExcludedChannel(GUILD, 'ch-excluded', null);
      expect(result).toBe(true);
    });

    it('카테고리 ID가 제외 목록에 있으면 true를 반환한다', async () => {
      redis.get.mockResolvedValue([
        makeExcludedChannel({
          discordChannelId: 'cat-excluded',
          type: VoiceExcludedChannelType.CATEGORY,
        }),
      ]);

      const result = await service.isExcludedChannel(GUILD, 'ch-1', 'cat-excluded');
      expect(result).toBe(true);
    });

    it('카테고리 타입이지만 parentCategoryId가 null이면 매치하지 않는다', async () => {
      redis.get.mockResolvedValue([
        makeExcludedChannel({ discordChannelId: 'cat-1', type: VoiceExcludedChannelType.CATEGORY }),
      ]);

      const result = await service.isExcludedChannel(GUILD, 'ch-1', null);
      expect(result).toBe(false);
    });

    it('제외 목록에 없으면 false를 반환한다', async () => {
      redis.get.mockResolvedValue([
        makeExcludedChannel({
          discordChannelId: 'other-ch',
          type: VoiceExcludedChannelType.CHANNEL,
        }),
      ]);

      const result = await service.isExcludedChannel(GUILD, 'ch-1', null);
      expect(result).toBe(false);
    });

    it('캐시 미스 시 DB 조회 후 캐시에 저장한다', async () => {
      redis.get.mockResolvedValue(null);
      repository.findByGuildId.mockResolvedValue([]);

      await service.isExcludedChannel(GUILD, 'ch-1', null);

      expect(repository.findByGuildId).toHaveBeenCalledWith(GUILD);
      expect(redis.set).toHaveBeenCalled();
    });
  });
});
